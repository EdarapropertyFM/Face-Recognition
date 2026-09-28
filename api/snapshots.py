"""Save the face behind each detection, so a sighting can be looked at later.

A row saying "a stranger was seen on CH1 at 14:32" is close to useless on its
own: an operator has to be able to see who it was. Every reported detection
therefore keeps the frame it was recognised from, cropped around the face
with some margin so there is context rather than a disembodied head.

Files are written under data/detections/<date>/ and served back by the AI.
They are face images, so they are biometric data and live in the git-ignored
data directory with the rest of it.
"""
from __future__ import annotations

import logging
import time
from pathlib import Path

import cv2
import numpy as np

log = logging.getLogger("api.snapshots")

SNAPSHOT_DIR = "detections"
JPEG_QUALITY = 85
# Context around the face. A tight crop is hard to recognise as a person and
# throws away everything about where they were standing.
MARGIN = 0.6
MIN_CROP_PX = 64


def snapshot_root(data_dir: Path) -> Path:
    return Path(data_dir) / SNAPSHOT_DIR


def crop_with_margin(frame: np.ndarray, bbox, margin: float = MARGIN) -> np.ndarray | None:
    """Cut the face out of the frame with proportional padding."""
    if frame is None or frame.size == 0:
        return None
    height, width = frame.shape[:2]
    try:
        x1, y1, x2, y2 = (int(v) for v in bbox)
    except (TypeError, ValueError):
        return None
    if x2 <= x1 or y2 <= y1:
        return None

    pad_x = int((x2 - x1) * margin)
    pad_y = int((y2 - y1) * margin)
    x1 = max(0, x1 - pad_x)
    y1 = max(0, y1 - pad_y)
    x2 = min(width, x2 + pad_x)
    y2 = min(height, y2 + pad_y)
    if x2 - x1 < MIN_CROP_PX or y2 - y1 < MIN_CROP_PX:
        # Too small to be worth keeping, and upscaling would invent detail.
        return None
    return frame[y1:y2, x1:x2]


def relative_path(camera_id: str, track_id: int, when: float | None = None) -> str:
    """Stable, sortable, filesystem-safe location for one snapshot."""
    stamp = time.gmtime(when if when is not None else time.time())
    date = time.strftime("%Y-%m-%d", stamp)
    clock = time.strftime("%H%M%S", stamp)
    safe = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in camera_id)
    return f"{date}/{safe}_{clock}_{track_id}.jpg"


def save(data_dir: Path, frame: np.ndarray, bbox, camera_id: str,
         track_id: int, when: float | None = None) -> str | None:
    """Write the crop and return its path relative to the snapshot root.

    Returns None when there is nothing worth saving. Never raises: a failed
    snapshot must not cost the detection it belongs to.
    """
    crop = crop_with_margin(frame, bbox)
    if crop is None:
        return None
    rel = relative_path(camera_id, track_id, when)
    target = snapshot_root(data_dir) / rel
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        ok, buffer = cv2.imencode(".jpg", crop, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
        if not ok:
            return None
        # Written via a temp file and renamed, so a reader never sees a
        # half-written image.
        tmp = target.with_suffix(".jpg.tmp")
        tmp.write_bytes(buffer.tobytes())
        tmp.replace(target)
        return rel
    except OSError as error:
        log.warning("could not save snapshot %s (%s)", rel, error)
        return None


def resolve(data_dir: Path, rel: str) -> Path | None:
    """Map a stored path back to a file, refusing anything outside the root.

    The path arrives from a URL, so it is untrusted: without this check
    '../../.env' would be served happily.
    """
    root = snapshot_root(data_dir).resolve()
    try:
        candidate = (root / rel).resolve()
    except (OSError, ValueError):
        return None
    if not candidate.is_file():
        return None
    if root not in candidate.parents:
        return None
    return candidate
