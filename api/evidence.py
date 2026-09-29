"""Keeping something worth showing when a stranger walks in.

A tight crop around the face is the wrong evidence for these cameras. The
face is about twenty pixels across, so the crop is unreadable, and it throws
away everything that actually identifies a visit: what the person was
wearing, what they were carrying, which door they used, who was with them.

So three things are kept per sighting:

* the **full frame**, at full resolution, marked with the time and camera
* the **best moment** of the pass rather than the first, chosen by how large
  and sharp the face was
* a short **clip** spanning the seconds before and after, because a still
  cannot show whether somebody walked in, turned around, or held a door

The seconds *before* the detection are the valuable ones: a face is usually
only recognised once somebody is well inside, by which point the approach --
the useful part -- has already happened. That is why the camera keeps a
rolling buffer instead of starting to record when it notices something.
"""
from __future__ import annotations

import logging
import threading
import time
from collections import deque
from pathlib import Path

import cv2
import numpy as np

log = logging.getLogger("api.evidence")

EVIDENCE_DIR = "evidence"
STILL_QUALITY = 92          # this is the exhibit; do not skimp
BUFFER_QUALITY = 70         # the rolling buffer is working storage
BUFFER_SECONDS = 6.0        # how far back a clip can reach
BUFFER_FPS = 3.0            # frames kept per second of history
CLIP_AFTER_S = 5.0          # how long to keep recording once triggered
CLIP_FPS = 3.0


class FrameBuffer:
    """The last few seconds of a camera, ready to look back on.

    Frames are held JPEG-encoded rather than raw: a raw 704x576 frame is
    1.2 MB, so six seconds of them per camera would cost tens of megabytes
    for something usually thrown away. Encoded, the same history is about a
    megabyte.
    """

    def __init__(self, seconds: float = BUFFER_SECONDS, fps: float = BUFFER_FPS) -> None:
        self.seconds = seconds
        self.min_gap = 1.0 / max(fps, 0.1)
        self._frames: deque[tuple[float, bytes]] = deque()
        self._last_kept = 0.0
        self._lock = threading.Lock()

    def add(self, frame: np.ndarray, now: float | None = None) -> None:
        now = time.monotonic() if now is None else now
        if now - self._last_kept < self.min_gap:
            return                                  # keeping every frame is waste
        if frame is None or frame.size == 0:
            return
        try:
            ok, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, BUFFER_QUALITY])
        except cv2.error:
            return                                  # a bad frame must not stop the buffer
        if not ok:
            return
        self._last_kept = now
        with self._lock:
            self._frames.append((now, buffer.tobytes()))
            cutoff = now - self.seconds
            while self._frames and self._frames[0][0] < cutoff:
                self._frames.popleft()

    def since(self, start: float) -> list[bytes]:
        with self._lock:
            return [jpg for when, jpg in self._frames if when >= start]

    def __len__(self) -> int:
        with self._lock:
            return len(self._frames)


def evidence_root(data_dir: Path) -> Path:
    return Path(data_dir) / EVIDENCE_DIR


def relative_path(camera_id: str, track_id: int, suffix: str, when: float | None = None) -> str:
    stamp = time.gmtime(when if when is not None else time.time())
    date = time.strftime("%Y-%m-%d", stamp)
    clock = time.strftime("%H%M%S", stamp)
    safe = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in camera_id)
    return f"{date}/{safe}_{clock}_{track_id}{suffix}"


def stamp_frame(frame: np.ndarray, camera_id: str, bbox=None) -> np.ndarray:
    """A copy marked with camera, time, and where the person was.

    An exhibit has to say when and where it was taken, and the box is what
    connects the picture to the detection it belongs to.
    """
    marked = frame.copy()
    height, width = marked.shape[:2]
    if bbox is not None:
        try:
            x1, y1, x2, y2 = (int(v) for v in bbox)
            cv2.rectangle(marked, (x1, y1), (x2, y2), (0, 220, 255), 2)
        except (TypeError, ValueError):
            pass
    caption = f"{camera_id}   {time.strftime('%Y-%m-%d %H:%M:%S')}"
    cv2.rectangle(marked, (0, height - 26), (width, height), (0, 0, 0), -1)
    cv2.putText(marked, caption, (8, height - 8),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
    return marked


def save_still(data_dir: Path, frame: np.ndarray, camera_id: str, track_id: int,
               bbox=None, when: float | None = None) -> str | None:
    """Write the full frame. Never raises: evidence must not cost a detection."""
    if frame is None or frame.size == 0:
        return None
    rel = relative_path(camera_id, track_id, ".jpg", when)
    target = evidence_root(data_dir) / rel
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        ok, buffer = cv2.imencode(".jpg", stamp_frame(frame, camera_id, bbox),
                                  [cv2.IMWRITE_JPEG_QUALITY, STILL_QUALITY])
        if not ok:
            return None
        tmp = target.with_suffix(".jpg.tmp")
        tmp.write_bytes(buffer.tobytes())
        tmp.replace(target)
        return rel
    except OSError as error:
        log.warning("could not save evidence still %s (%s)", rel, error)
        return None


def write_clip(data_dir: Path, jpegs: list[bytes], camera_id: str, track_id: int,
               when: float | None = None, fps: float = CLIP_FPS) -> str | None:
    """Assemble buffered frames into one file a browser will actually play.

    Written as animated WebP rather than MP4. OpenCV on this machine can only
    encode MPEG-4 Part 2 (codec tag FMP4) -- H.264 needs an OpenH264 library
    that is not installed, and the WebM tags are unsupported. Chrome cannot
    decode FMP4, so the clips downloaded perfectly and played as a blank
    rectangle.

    Animated WebP sidesteps video codecs entirely: it is an image as far as
    the browser is concerned, renders in an <img>, and needs no plugin or
    extra dependency. The cost is that it loops instead of offering scrub
    controls, which is an acceptable trade for a ten-second clip.
    """
    if not jpegs:
        return None
    rel = relative_path(camera_id, track_id, ".webp", when)
    target = evidence_root(data_dir) / rel
    try:
        from PIL import Image

        images = []
        for jpg in jpegs:
            frame = cv2.imdecode(np.frombuffer(jpg, np.uint8), cv2.IMREAD_COLOR)
            if frame is None:
                continue
            images.append(Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)))
        if not images:
            return None

        target.parent.mkdir(parents=True, exist_ok=True)
        tmp = target.with_suffix(".webp.tmp")
        images[0].save(tmp, format="WEBP", save_all=True, append_images=images[1:],
                       duration=int(1000 / max(fps, 0.1)), loop=0, quality=80, method=4)
        tmp.replace(target)
        return rel
    except (OSError, ValueError, ImportError, cv2.error) as error:
        log.warning("could not write evidence clip %s (%s)", rel, error)
        return None


def resolve(data_dir: Path, rel: str) -> Path | None:
    """Map a stored path back to a file, refusing anything outside the root."""
    root = evidence_root(data_dir).resolve()
    try:
        candidate = (root / rel).resolve()
    except (OSError, ValueError):
        return None
    if not candidate.is_file() or root not in candidate.parents:
        return None
    return candidate


def frame_score(face_width_px: int, blur_score: float) -> float:
    """How good a moment this is to keep.

    Size dominates and sharpness only breaks ties. Adding a raw blur score
    to a scaled width does not achieve that: blur readings run into the tens
    of thousands on these cameras, so a sharp distant face would outrank a
    close one. Sharpness is therefore folded into a fraction that can never
    reach the next whole pixel of width.
    """
    width = max(0.0, float(face_width_px))
    sharpness = max(0.0, float(blur_score))
    return width + sharpness / (sharpness + 1.0)


def purge_older_than(data_dir: Path, days: int) -> int:
    """Delete saved sightings past their retention period.

    The privacy notice promises faces are removed after a set time, so
    something has to remove them; rows disappearing from a table while the
    images stay on disk would make that promise false.
    """
    if days <= 0:
        return 0
    cutoff = time.time() - days * 86400
    root = evidence_root(data_dir)
    removed = 0
    if not root.is_dir():
        return 0
    for path in list(root.rglob("*")):
        if not path.is_file():
            continue
        try:
            if path.stat().st_mtime < cutoff:
                path.unlink()
                removed += 1
        except OSError as error:
            log.warning("could not delete %s (%s)", path, error)
    # Tidy up the day folders left behind.
    for folder in sorted((p for p in root.iterdir() if p.is_dir()), reverse=True):
        try:
            next(folder.iterdir())
        except StopIteration:
            folder.rmdir()
        except OSError:
            pass
    return removed
