"""Camera sharing and background workers for the API's live views.

CameraHub: one grabber thread per video source; any number of consumers
(the /live stream, enrolment sessions) read the latest frame, so the
webcam is never opened twice. It releases the camera a few seconds after
the last consumer detaches.

JpegWorker: base class for a thread that pulls frames from a hub, runs
some processing, and publishes the latest annotated JPEG for MJPEG viewers.
"""
from __future__ import annotations

import logging
import threading
import time
from pathlib import Path

import cv2
import numpy as np

from facerec.live import open_source

log = logging.getLogger("api.streams")

# How long a camera is kept open after the last viewer leaves.
#
# A local webcam is released quickly, because holding it blocks every other
# application on the machine from using the device.
#
# A network camera is kept far longer. Reopening an RTSP stream costs several
# seconds of handshake plus a wait for the next keyframe, and on the wall a
# tile loses its viewer constantly: scrolling it off screen, switching pages,
# a slot rotating, a re-render. With a 5 second grace every one of those
# blips tore down the connection and paid the full reconnect, which is what
# made the wall look unstable. Nothing is being hogged by staying connected
# to a DVR, so the grace is generous.
IDLE_STOP_S = 5.0            # local device: release promptly
RTSP_IDLE_STOP_S = 90.0      # network camera: survive brief interruptions
JPEG_QUALITY = 80

# Reconnection. This service is meant to run continuously, and a camera feed
# is interrupted for ordinary reasons: the DVR reboots after a firmware
# update, a switch drops a link, the network blips, the recorder closes an
# idle session. None of those should end a stream permanently.
#
# The grabber therefore supervises its own capture: on any failure it closes
# it, waits, and reopens, backing off so a DVR that is genuinely down is not
# hammered, and resetting as soon as a frame arrives. It never gives up while
# somebody is watching.
RECONNECT_DELAY_S = 1.0          # first retry, almost immediate
RECONNECT_MAX_DELAY_S = 15.0     # ceiling for a DVR that stays down
STALE_FRAME_S = 10.0             # no frame for this long: treat as dead and reopen


def idle_grace(source: str | int) -> float:
    """Seconds to keep `source` open after its last viewer leaves."""
    return RTSP_IDLE_STOP_S if isinstance(source, str) and source.startswith("rtsp") else IDLE_STOP_S


class CameraHub:
    def __init__(self, source: str | int, label: str | None = None) -> None:
        self.source = source
        self.label = label or str(source)          # credential-free, for HUD/logs
        self.error: str | None = None
        self._frame: np.ndarray | None = None
        self._seq = 0
        self._cond = threading.Condition()
        self._consumers = 0
        self._last_consumer_t = time.monotonic()
        self._idle_grace = idle_grace(source)
        self._stop = threading.Event()
        # Observable by the HTTP layer so a viewer is not dropped during a
        # reconnection that is about to succeed.
        self.connected = False
        self.reconnects = 0
        self.last_frame_t = 0.0
        self._thread = threading.Thread(target=self._run, name=f"cam-{self.label}", daemon=True)
        self._thread.start()

    def _idle_expired(self) -> bool:
        """Nobody is watching and the grace period has run out."""
        return (self._consumers == 0
                and time.monotonic() - self._last_consumer_t > self._idle_grace)

    def _run(self) -> None:
        """Keep a frame flowing for as long as anybody wants one.

        Runs until told to stop or left idle; every failure in between is a
        reconnection, not an ending. A local file plays once and then stops,
        because reopening a finished recording would loop it forever.
        """
        delay = RECONNECT_DELAY_S
        try:
            while not self._stop.is_set() and not self._idle_expired():
                cap = None
                try:
                    cap = open_source(self.source)
                except RuntimeError as e:
                    self.error = str(e)
                except Exception as e:                      # driver-level failure
                    self.error = f"cannot open camera: {e}"

                if cap is None or not cap.isOpened():
                    if cap is not None:
                        cap.release()
                    self.connected = False
                    with self._cond:
                        self._cond.notify_all()             # wake waiters to re-check
                    log.warning("camera %s unreachable (%s); retrying in %.0fs",
                                self.label, self.error, delay)
                    if self._stop.wait(delay):
                        break
                    delay = min(delay * 2, RECONNECT_MAX_DELAY_S)
                    continue

                if self.reconnects:
                    log.info("camera %s reconnected (attempt %d)", self.label, self.reconnects)
                self.connected = True
                self.error = None
                delay = RECONNECT_DELAY_S                   # a good connection resets it
                try:
                    self._read_until_failure(cap)
                finally:
                    self.connected = False
                    cap.release()

                if self._stop.is_set() or self._idle_expired() or self._is_file():
                    break
                self.reconnects += 1
                log.warning("camera %s lost (%s); reconnecting in %.0fs",
                            self.label, self.error, delay)
                if self._stop.wait(delay):
                    break
                delay = min(delay * 2, RECONNECT_MAX_DELAY_S)
        finally:
            self.connected = False
            with self._cond:
                self._cond.notify_all()
            log.info("camera %s released", self.label)

    def _is_file(self) -> bool:
        return isinstance(self.source, str) and Path(self.source).is_file()

    def _read_until_failure(self, cap: cv2.VideoCapture) -> None:
        """Pump frames until the capture stops producing them."""
        # A video FILE decodes as fast as the CPU allows; pace it to its own
        # FPS so recorded clips behave like a camera (for demos and tests).
        is_file = self._is_file()
        frame_dt = (1.0 / cap.get(cv2.CAP_PROP_FPS)) if is_file and cap.get(cv2.CAP_PROP_FPS) > 0 else 0.0
        next_t = time.monotonic()
        self.last_frame_t = time.monotonic()

        while not self._stop.is_set() and not self._idle_expired():
            if frame_dt:
                wait = next_t - time.monotonic()
                if wait > 0:
                    time.sleep(wait)
                next_t = max(next_t + frame_dt, time.monotonic())

            ok, frame_bgr = cap.read()                      # BGR straight from OpenCV
            if not ok:
                self.error = "frame grab failed (stream ended or camera disconnected)"
                return
            # read() can also succeed while returning nothing useful, and some
            # recorders stall without ever failing outright. Treat a long
            # silence as a dead capture so it is reopened rather than waited on.
            if frame_bgr is None or frame_bgr.size == 0:
                if time.monotonic() - self.last_frame_t > STALE_FRAME_S:
                    self.error = "camera stopped sending frames"
                    return
                continue

            self.last_frame_t = time.monotonic()
            with self._cond:
                self._frame, self._seq = frame_bgr, self._seq + 1
                self._cond.notify_all()

    def attach(self) -> None:
        with self._cond:
            self._consumers += 1

    def detach(self) -> None:
        with self._cond:
            self._consumers -= 1
            self._last_consumer_t = time.monotonic()

    def wait_frame(self, after_seq: int, timeout: float = 2.0) -> tuple[np.ndarray | None, int]:
        """Block until a frame newer than after_seq exists (or timeout)."""
        with self._cond:
            if self._seq <= after_seq and self.alive:
                self._cond.wait(timeout)
            return self._frame, self._seq

    @property
    def alive(self) -> bool:
        return self._thread.is_alive()

    def stop(self) -> None:
        self._stop.set()


class JpegWorker:
    """Thread that reads a CameraHub, calls self.step(frame) -> annotated
    frame, and publishes it as JPEG. Subclasses implement step()."""

    def __init__(self, hub: CameraHub, name: str, idle_stop: bool = True) -> None:
        self.hub = hub
        self.latest: bytes | None = None
        self.error: str | None = None
        self.viewers = 0
        self.last_viewer_t = time.monotonic()
        self._idle_stop = idle_stop
        self._stop = threading.Event()
        self._cond = threading.Condition()
        self._thread = threading.Thread(target=self._run, name=name, daemon=True)
        self._thread.start()

    def step(self, frame_bgr: np.ndarray) -> np.ndarray:      # pragma: no cover
        raise NotImplementedError

    def _run(self) -> None:
        self.hub.attach()
        seq = 0
        try:
            while not self._stop.is_set():
                if (self._idle_stop and self.viewers == 0
                        and time.monotonic() - self.last_viewer_t > idle_grace(self.hub.source)):
                    break
                frame, seq_new = self.hub.wait_frame(seq, 2.0)
                if not self.hub.alive:
                    self.error = self.hub.error or "camera stopped"
                    break
                if frame is None or seq_new == seq:
                    continue
                seq = seq_new
                display = self.step(frame)
                ok, jpg = cv2.imencode(".jpg", display, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
                if ok:
                    with self._cond:
                        self.latest = jpg.tobytes()
                        self._cond.notify_all()
        finally:
            self.hub.detach()
            with self._cond:
                self._cond.notify_all()
            log.info("%s stopped", self._thread.name)

    def next_frame(self, timeout: float = 2.0) -> bytes | None:
        with self._cond:
            self._cond.wait(timeout)
            return self.latest

    @property
    def alive(self) -> bool:
        return self._thread.is_alive()

    def stop(self) -> None:
        self._stop.set()


def mjpeg_chunk(frame: bytes) -> bytes:
    return (b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: "
            + str(len(frame)).encode() + b"\r\n\r\n" + frame + b"\r\n")
