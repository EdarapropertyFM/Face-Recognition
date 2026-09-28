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

from api import snapshots
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
        self.last_report_at: float | None = None
        self.error: str | None = None
        self._last_frame = None
        self.snapshots_saved = 0
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

            # Keep the face behind the row: a sighting nobody can look at is
            # of little use to an operator. A failed snapshot is not allowed
            # to cost the detection.
            box = boxes.get(track_id)
            if box is not None and self._last_frame is not None:
                saved = snapshots.save(self.state.config.data_dir, self._last_frame,
                                       box, self.camera_id, track_id)
                if saved:
                    payload["snapshot"] = saved
                    self.snapshots_saved += 1
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

    def start(self, camera_id: str, source: str, zone: int = 0) -> dict:
        with self._lock:
            existing = self._monitors.get(camera_id)
            if existing and existing.alive:
                return existing.status()
            hub = self.state.hub_for(source)
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
