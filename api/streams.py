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

IDLE_STOP_S = 5.0            # release camera / stop worker this long after last consumer left
JPEG_QUALITY = 80


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
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, name=f"cam-{self.label}", daemon=True)
        self._thread.start()

    def _run(self) -> None:
        try:
            cap = open_source(self.source)
        except RuntimeError as e:
            self.error = str(e)
            with self._cond:
                self._cond.notify_all()
            return
        # A video FILE decodes as fast as the CPU allows; pace it to its own
        # FPS so recorded clips behave like a camera (for demos and tests).
        is_file = isinstance(self.source, str) and Path(self.source).is_file()
        frame_dt = (1.0 / cap.get(cv2.CAP_PROP_FPS)) if is_file and cap.get(cv2.CAP_PROP_FPS) > 0 else 0.0
        next_t = time.monotonic()
        try:
            while not self._stop.is_set():
                if self._consumers == 0 and time.monotonic() - self._last_consumer_t > IDLE_STOP_S:
                    break
                if frame_dt:
                    delay = next_t - time.monotonic()
                    if delay > 0:
                        time.sleep(delay)
                    next_t = max(next_t + frame_dt, time.monotonic())
                ok, frame_bgr = cap.read()                     # BGR straight from OpenCV
                if not ok:
                    self.error = "frame grab failed (stream ended or camera disconnected)"
                    break
                with self._cond:
                    self._frame, self._seq = frame_bgr, self._seq + 1
                    self._cond.notify_all()
        finally:
            cap.release()
            with self._cond:
                self._cond.notify_all()
            log.info("camera %s released", self.label)

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
                        and time.monotonic() - self.last_viewer_t > IDLE_STOP_S):
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
