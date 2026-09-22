"""Per-face quality filters: size, blur, and rough pose (spec §4.2).

Pose is estimated from the geometry of the 5 landmarks only. It is a cheap,
rough estimate, good enough to reject strongly turned faces. No separate
head-pose model is used, by design.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import cv2
import numpy as np

from .config import Config

# Landmark row order as produced by insightface (face.kps, shape (5, 2)).
LEFT_EYE, RIGHT_EYE, NOSE, LEFT_MOUTH, RIGHT_MOUTH = range(5)


@dataclass
class QualityReport:
    face_width_px: int
    blur_score: float        # variance of Laplacian on the crop
    yaw_deg: float
    pitch_deg: float
    passed: bool
    reasons: list[str] = field(default_factory=list)   # why it failed


def blur_score(crop_bgr: np.ndarray) -> float:
    """Variance of the Laplacian on a greyscale crop. Higher = sharper."""
    if crop_bgr.size == 0:
        return 0.0
    grey = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(grey, cv2.CV_64F).var())


def estimate_pose(landmarks: np.ndarray) -> tuple[float, float]:
    """Approximate (yaw_deg, pitch_deg) from 5 landmarks.

    Yaw: horizontal offset of the nose from the eye midpoint, relative to
    half the inter-ocular distance. Frontal -> nose centred -> 0.
    Pitch: vertical position of the nose within the eye-line to mouth-line
    span. Frontal -> nose roughly halfway -> 0. (In the canonical ArcFace
    112x112 alignment template the nose sits at 0.49 of that span and
    exactly on the eye midline, which is where the two neutral points
    below come from.)

    Both ratios are mapped to degrees with asin so that +/-1 saturates at
    +/-90. Sign convention: positive yaw = nose moved toward image right;
    positive pitch = nose moved toward the mouth (looking down). Rough by
    design.
    """
    lm = np.asarray(landmarks, dtype=np.float64)
    eye_mid = (lm[LEFT_EYE] + lm[RIGHT_EYE]) / 2.0
    mouth_mid = (lm[LEFT_MOUTH] + lm[RIGHT_MOUTH]) / 2.0
    nose = lm[NOSE]

    eye_dist = float(np.linalg.norm(lm[RIGHT_EYE] - lm[LEFT_EYE]))
    eye_mouth_dist = float(np.linalg.norm(mouth_mid - eye_mid))
    if eye_dist < 1e-6 or eye_mouth_dist < 1e-6:
        return 90.0, 90.0  # degenerate landmarks; treat as fully turned

    # Yaw: project nose offset onto the eye axis, normalise by half the
    # inter-ocular distance so +/-1 means "nose directly over an eye".
    eye_axis = (lm[RIGHT_EYE] - lm[LEFT_EYE]) / eye_dist
    yaw_ratio = float(np.dot(nose - eye_mid, eye_axis)) / (eye_dist / 2.0)

    # Pitch: project nose onto the eye-mid -> mouth-mid axis; 0.5 is neutral.
    face_axis = (mouth_mid - eye_mid) / eye_mouth_dist
    nose_t = float(np.dot(nose - eye_mid, face_axis)) / eye_mouth_dist
    pitch_ratio = (nose_t - 0.5) / 0.5

    yaw = math.degrees(math.asin(max(-1.0, min(1.0, yaw_ratio))))
    pitch = math.degrees(math.asin(max(-1.0, min(1.0, pitch_ratio))))
    return yaw, pitch


def assess(frame_bgr: np.ndarray, bbox: tuple[int, int, int, int],
           landmarks: np.ndarray, config: Config) -> QualityReport:
    """Build a QualityReport for one detected face. Does not raise."""
    x1, y1, x2, y2 = bbox
    h, w = frame_bgr.shape[:2]
    cx1, cy1 = max(0, x1), max(0, y1)
    cx2, cy2 = min(w, x2), min(h, y2)
    crop = frame_bgr[cy1:cy2, cx1:cx2]

    face_width = int(x2 - x1)
    blur = blur_score(crop)
    yaw, pitch = estimate_pose(landmarks)

    reasons: list[str] = []
    q = config.quality
    d = config.detection
    if face_width < d.min_face_size_px:
        reasons.append(f"too small: {face_width}px < {d.min_face_size_px}px")
    if blur < q.blur_threshold:
        reasons.append(f"too blurry: {blur:.1f} < {q.blur_threshold}")
    if abs(yaw) > q.max_yaw_deg:
        reasons.append(f"too turned (yaw): {yaw:.1f} deg > {q.max_yaw_deg} deg")
    if abs(pitch) > q.max_pitch_deg:
        reasons.append(f"too tilted (pitch): {pitch:.1f} deg > {q.max_pitch_deg} deg")

    return QualityReport(
        face_width_px=face_width,
        blur_score=blur,
        yaw_deg=yaw,
        pitch_deg=pitch,
        passed=not reasons,
        reasons=reasons,
    )
