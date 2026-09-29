"""Unattended, continuous recognition.

Until now recognition only ran while somebody had a tile open: the camera was
confirmed alive around the clock, but a stranger walking past at 3am with no
dashboard open was seen by nobody and recorded nowhere.

A monitor is one thread per camera that keeps a stream open, runs the
recognition pipeline on it forever, and posts what it finds to the backend,
which turns it into detections and alerts exactly as a watched stream does.
It shares the CameraHub with any live viewers, so watching a camera costs no
extra connection to the recorder and no second decode.
"""
from __future__ import annotations

import logging
import os
import threading
import time
import urllib.error
import urllib.request
import json

from api import evidence, snapshots
from api.backend_link import describe, resolve
from api.report_policy import ReportPolicy, detection_type
from api.stranger_registry import StrangerRegistry
from api.streams import CameraHub

log = logging.getLogger("api.monitor")

# Shared by every camera on purpose: somebody who walks past the gate and
# then the lobby is one stranger, not one per camera.
STRANGERS = StrangerRegistry()

# Read once: the environment if it is set, otherwise backend/.env. Launching
# the AI with a bare `uvicorn` command used to mean neither was seen and every
# detection was rejected with 401.
BACKEND_URL, EVENT_TOKEN, TOKEN_SOURCE = resolve()
POST_TIMEOUT_S = 5.0

# The backend being briefly unreachable must not kill a monitor; it is logged
# once per run of failures rather than once per event.
MAX_CONSECUTIVE_POST_FAILURES = 20


def post_detection(payload: dict, url: str = "", token: str = "") -> tuple[bool, str]:
    """Send one detection to the backend.

    Returns (accepted, reason). The reason matters: a rejected token and an
    unreachable backend look identical from a boolean, and they need opposite
    fixes -- one is a configuration mistake, the other is a service being down.
    """
    endpoint = f"{(url or BACKEND_URL).rstrip('/')}/api/detections/ai-event"
    body = json.dumps(payload).encode()
    request = urllib.request.Request(endpoint, data=body, method="POST", headers={
        "Content-Type": "application/json",
        "x-stmc-ai-token": token or EVENT_TOKEN,
    })
    try:
        with urllib.request.urlopen(request, timeout=POST_TIMEOUT_S) as response:
            if 200 <= response.status < 300:
                return True, "ok"
            return False, f"http {response.status}"
    except urllib.error.HTTPError as error:
        if error.code == 401:
            return False, ("401 unauthorised - the AI token does not match the "
                           "backend's STMC_AI_EVENT_TOKEN")
        return False, f"http {error.code}"
    except (urllib.error.URLError, OSError, ValueError) as error:
        return False, f"unreachable ({type(error).__name__})"


class MonitorWorker:
    """Runs recognition on one camera for as long as it is enabled."""

    def __init__(self, state, hub: CameraHub, camera_id: str, zone: int = 0) -> None:
        self.state = state
        self.hub = hub
        self.camera_id = camera_id
        self.zone = zone
        self.policy = ReportPolicy()
        self.started_at = time.time()
        self.frames = 0
        self.reported = 0
        self.post_failures = 0
        self.post_error: str | None = None
        self.low_quality_skipped = 0
        self.low_quality_reasons: dict[str, int] = {}
        self.last_rejected: dict | None = None
        self.last_accepted: dict | None = None
        self.last_clip: str | None = None
        self.last_report_at: float | None = None
        self.error: str | None = None
        self._last_frame = None
        self.snapshots_saved = 0
        self.clips_saved = 0
        # The seconds BEFORE a detection are the valuable ones: a face is
        # usually only recognised once somebody is well inside, by which
        # point the approach has already happened.
        self.history = evidence.FrameBuffer()
        self._stop = threading.Event()
        self._thread = threading.Thread(
            target=self._run, name=f"monitor-{camera_id}", daemon=True)
        self._thread.start()

    @property
    def alive(self) -> bool:
        return self._thread.is_alive()

    def stop(self) -> None:
        self._stop.set()

    def status(self) -> dict:
        return {
            "camera_id": self.camera_id,
            "zone": self.zone,
            "running": self.alive,
            "connected": self.hub.connected,
            "frames": self.frames,
            "reported": self.reported,
            "tracked": self.policy.tracked,
            "reconnects": self.hub.reconnects,
            "uptime_s": round(time.time() - self.started_at, 1),
            "last_report_at": self.last_report_at,
            "post_failures": self.post_failures,
            "post_error": self.post_error,
            "snapshots": self.snapshots_saved,
            "clips": self.clips_saved,
            "last_clip": self.last_clip,
            "history_frames": len(self.history),
            "low_quality_skipped": self.low_quality_skipped,
            "low_quality_reasons": dict(self.low_quality_reasons),
            "last_rejected": self.last_rejected,
            "last_accepted": self.last_accepted,
            "error": self.error or self.hub.error,
        }

    def _run(self) -> None:
        # Holding a consumer slot is what stops the shared hub being released
        # as idle: to the camera layer, a monitor is a viewer that never
        # leaves, which is exactly the 24/7 behaviour wanted.
        self.hub.attach()
        recognizer = self.state.new_recognizer(footer=f"monitor {self.camera_id}")
        seq = 0
        try:
            while not self._stop.is_set():
                frame, seq_new = self.hub.wait_frame(seq, 2.0)
                if not self.hub.alive:
                    self.error = self.hub.error or "camera stopped"
                    break
                if frame is None or seq_new == seq:
                    continue
                seq = seq_new
                self.frames += 1
                self._last_frame = frame
                self.history.add(frame)
                try:
                    # The engine and gallery are shared with every endpoint
                    # and every other worker, and neither is thread-safe.
                    with self.state.lock:
                        recognizer.process(frame)
                except Exception as error:              # never let one frame end the watch
                    log.warning("monitor %s: frame failed (%s)", self.camera_id, error)
                    continue
                self._report(recognizer)
        finally:
            self.hub.detach()
            log.info("monitor %s stopped after %d frames, %d reported",
                     self.camera_id, self.frames, self.reported)

    def _start_clip(self, track_id: int, moment: float) -> None:
        """Save the seconds either side of this sighting, in the background.

        The tail has to be waited for, so this runs off the recognition
        thread: blocking there would stall the camera for the length of the
        clip and drop everything happening during it.
        """
        began = time.monotonic() - evidence.BUFFER_SECONDS
        data_dir = self.state.config.data_dir

        def assemble():
            time.sleep(evidence.CLIP_AFTER_S)
            frames = self.history.since(began)
            rel = evidence.write_clip(data_dir, frames, self.camera_id, track_id, moment)
            if rel:
                self.clips_saved += 1
                self.last_clip = rel

        threading.Thread(target=assemble, name=f"clip-{self.camera_id}-{track_id}",
                         daemon=True).start()

    @staticmethod
    def _quality_report(track):
        """The quality report behind the best sample, if there is one."""
        last = getattr(track, "last_face", None)
        return getattr(last, "quality", None)

    def _quality_ok(self, track) -> bool:
        """Whether this face is worth writing down.

        Judged against the MONITORING gate, not the enrolment one. Enrolment
        demands a large, sharp, near-frontal face because a bad template
        defines someone's identity permanently. A sighting is a weaker claim:
        "a person was here, and here is their photo" helps an operator even
        when the embedding is too poor to match, and a poor embedding simply
        fails to match rather than matching the wrong person.
        """
        report = self._quality_report(track)
        if report is None:
            return False
        gate = self.state.config.monitoring
        last = getattr(track, "last_face", None)
        det_score = float(getattr(last, "det_score", 0.0) or 0.0)
        return (det_score >= gate.min_det_score
                and report.face_width_px >= gate.min_face_size_px
                and report.blur_score >= gate.blur_threshold
                and abs(report.yaw_deg) <= gate.max_yaw_deg
                and abs(report.pitch_deg) <= gate.max_pitch_deg)

    @staticmethod
    def _quality_ok_strict(track) -> bool:
        """Whether this track ever produced a face worth trusting.

        The engine deliberately does not filter on quality -- it attaches a
        report and leaves the decision to the caller. The live view is the
        caller that wants everything, boxes and all. This one is not: an
        unattended monitor that records whatever the detector fires on turns
        a patch of wall into a "stranger" with a meaningless embedding and an
        alert behind it.

        Samples are sorted best-first with quality passing outranking
        failing, so the first one answers the question.
        """
        samples = getattr(track, "samples", None)
        if samples:
            return bool(samples[0].quality_key[0])
        last = getattr(track, "last_face", None)
        quality = getattr(last, "quality", None)
        return bool(getattr(quality, "passed", False))

    @staticmethod
    def _embedding_of(track):
        """The best embedding this track has, if any."""
        if track is None:
            return None
        if getattr(track, "samples", None):
            return track.samples[0].embedding
        last = getattr(track, "last_face", None)
        return getattr(last, "embedding", None)

    def _report(self, recognizer) -> None:
        now = time.monotonic()
        results = dict(recognizer.results)
        self.policy.forget(set(results))
        # Where each track currently is, so the reported face can be cut out
        # of the frame it was recognised in.
        tracks = {track.track_id: track for track in recognizer.tracker.tracks}
        boxes = {tid: track.bbox for tid, track in tracks.items()}
        for track_id, result in results.items():
            decision = getattr(result.decision, "value", str(result.decision))
            # A face too small, too blurred or too turned away to identify is
            # not evidence of anybody. Recording it produces false strangers.
            track = tracks.get(track_id)
            if not self._quality_ok(track):
                self.low_quality_skipped += 1
                # Record WHY, not just that it happened. "654 faces rejected"
                # says nothing actionable; "all of them under 80px" says the
                # camera is too far away and the gate is doing its job.
                report = self._quality_report(track)
                gate = self.state.config.monitoring
                failed = []
                last = getattr(track, "last_face", None)
                det_score = float(getattr(last, "det_score", 0.0) or 0.0)
                if report is None:
                    failed = ["no face"]
                else:
                    if det_score < gate.min_det_score:
                        failed.append(f"low confidence (<{gate.min_det_score})")
                    if report.face_width_px < gate.min_face_size_px:
                        failed.append(f"too small (<{gate.min_face_size_px}px)")
                    if report.blur_score < gate.blur_threshold:
                        failed.append(f"too blurry (<{gate.blur_threshold})")
                    if abs(report.yaw_deg) > gate.max_yaw_deg:
                        failed.append(f"too turned (>{gate.max_yaw_deg} deg)")
                    if abs(report.pitch_deg) > gate.max_pitch_deg:
                        failed.append(f"too tilted (>{gate.max_pitch_deg} deg)")
                for reason in failed or ["unknown"]:
                    self.low_quality_reasons[reason] = self.low_quality_reasons.get(reason, 0) + 1
                if report is not None:
                    self.last_rejected = {
                        "det_score": round(det_score, 3),
                        "face_width_px": getattr(report, "face_width_px", None),
                        "blur_score": round(getattr(report, "blur_score", 0.0), 1),
                        "yaw_deg": round(getattr(report, "yaw_deg", 0.0), 1),
                        "pitch_deg": round(getattr(report, "pitch_deg", 0.0), 1),
                        "reasons": list(getattr(report, "reasons", []) or []),
                    }
                continue
            if not self.policy.should_report(track_id, decision, result.person_id, now):
                continue
            payload = {
                "cam": self.camera_id,
                "zone": self.zone,
                # conf is an integer percentage column; a float is rejected
                # by Postgres outright.
                "conf": int(round(max(0.0, min(1.0, result.similarity)) * 100)),
                "type": detection_type(decision),
                "decision": decision,
                "similarity": round(result.similarity, 4),
                "when": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()) + "Z",
                "quality": {"trackId": track_id, "reason": result.reason},
            }
            if result.person_id:
                payload["aiPersonId"] = result.person_id
            else:
                # Not in the gallery. Identify them by their face rather than
                # by the track id, which changes every time the tracker loses
                # them for a moment.
                embedding = self._embedding_of(tracks.get(track_id))
                if embedding is not None:
                    payload["strangerKey"] = STRANGERS.key_for(embedding)

            # What gets kept as evidence.
            #
            # The face crop stays, because a list of sightings needs a
            # thumbnail. But on these cameras a face is about twenty pixels
            # across, so the crop alone proves nothing. The full frame is
            # what shows who came in, what they wore and which door they
            # used, and a short clip shows whether they entered or turned
            # around. Neither is allowed to cost the detection.
            box = boxes.get(track_id)
            frame = self._last_frame
            if box is not None and frame is not None:
                saved = snapshots.save(self.state.config.data_dir, frame,
                                       box, self.camera_id, track_id)
                if saved:
                    payload["snapshot"] = saved
                    self.snapshots_saved += 1

                # One timestamp for both, so the clip is findable from the
                # still: it is written seconds later, long after the
                # detection has been posted, so its path can never be part
                # of that message. Same name, different extension.
                moment = time.time()
                still = evidence.save_still(self.state.config.data_dir, frame,
                                            self.camera_id, track_id, box, moment)
                if still:
                    payload["evidenceStill"] = still

                self._start_clip(track_id, moment)
            accepted, reason = post_detection(payload)
            if accepted:
                self.reported += 1
                self.last_report_at = time.time()
                self.post_failures = 0
                self.post_error = None
            else:
                self.post_failures += 1
                self.post_error = reason
                if self.post_failures == 1 or self.post_failures % MAX_CONSECUTIVE_POST_FAILURES == 0:
                    log.warning("monitor %s: detection not recorded - %s (%d in a row)",
                                self.camera_id, reason, self.post_failures)


class MonitorRegistry:
    """The set of cameras being watched, keyed by camera id."""

    def __init__(self, state) -> None:
        self.state = state
        self._monitors: dict[str, MonitorWorker] = {}
        self._lock = threading.Lock()

    def start(self, camera_id: str, source: str, zone: int = 0, rotate: int = 0) -> dict:
        with self._lock:
            existing = self._monitors.get(camera_id)
            if existing and existing.alive:
                # Keep the angle current even when the monitor is already up.
                self.state.hub_for(source, rotate)
                return existing.status()
            hub = self.state.hub_for(source, rotate)
            worker = MonitorWorker(self.state, hub, camera_id, zone)
            self._monitors[camera_id] = worker
            log.info("monitor %s started on %s", camera_id, hub.label)
            return worker.status()

    def stop(self, camera_id: str) -> bool:
        with self._lock:
            worker = self._monitors.pop(camera_id, None)
        if not worker:
            return False
        worker.stop()
        return True

    def stop_all(self) -> None:
        with self._lock:
            workers = list(self._monitors.values())
            self._monitors.clear()
        for worker in workers:
            worker.stop()

    def status(self) -> list[dict]:
        with self._lock:
            return [worker.status() for worker in self._monitors.values()]

    def prune(self) -> None:
        """Drop monitors whose thread has ended so they can be restarted."""
        with self._lock:
            for camera_id in [c for c, w in self._monitors.items() if not w.alive]:
                del self._monitors[camera_id]
