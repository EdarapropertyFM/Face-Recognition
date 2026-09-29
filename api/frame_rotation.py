"""Turning a sideways camera the right way up, before anything looks at it.

Some cameras are mounted on their side. Rotating the picture in the browser
fixes how it looks and nothing else: the recognition pipeline still receives
a sideways frame, and a face detector is far weaker on faces lying on their
side than on upright ones. The overlay the AI draws gets rotated with the
picture too, so the readout ends up on its side.

Rotating here, as soon as the frame is grabbed, fixes all three at once:
detection sees upright faces, the overlay is drawn upright onto an already
upright frame, and the browser needs no transform at all.
"""
from __future__ import annotations

import cv2

VALID_ANGLES = (0, 90, 180, 270)

# Clockwise, matching how an operator describes it: "turn the picture right".
_CODES = {
    90: cv2.ROTATE_90_CLOCKWISE,
    180: cv2.ROTATE_180,
    270: cv2.ROTATE_90_COUNTERCLOCKWISE,
}


def normalise(angle) -> int:
    """Any input to one of 0/90/180/270. Nonsense becomes 0, never an error."""
    try:
        value = int(angle)
    except (TypeError, ValueError):
        return 0
    value %= 360
    return value if value in VALID_ANGLES else 0


def rotate(frame, angle: int):
    """Return the frame turned clockwise by `angle`.

    0 returns the original object rather than a copy: the overwhelmingly
    common case should cost nothing.
    """
    code = _CODES.get(normalise(angle))
    if code is None or frame is None:
        return frame
    return cv2.rotate(frame, code)


def swaps_axes(angle) -> bool:
    """Whether this rotation exchanges width and height."""
    return normalise(angle) in (90, 270)
