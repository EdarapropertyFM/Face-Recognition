"""Enrolment capture logic shared by scripts/enroll_webcam.py and the API.

Feed frames in; get an annotated preview back. Captures are taken only from
frames that pass the quality filter, either automatically after the pose is
held for a short dwell, or on request. The pairwise self-check at the end is
the early warning for broken alignment or poor capture.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field

import cv2
import numpy as np

from .config import Config
from .engine import DetectedFace, FaceEngine
from .live import put
from .quality import QualityReport

# Guidance shown per capture, cycled if images_per_person > len(GUIDANCE).
GUIDANCE = [
    "Look straight at the camera",
    "Turn your head slightly LEFT",
    "Turn your head slightly RIGHT",
    "Step back: a bit further from the camera",
    "Change the lighting if you can (face a window / lamp)",
]

# UI tunables that are not recognition parameters, so not in config.yaml.
DWELL_SECONDS = 0.8        # hold a passing pose this long to auto-capture
MIN_GAP_SECONDS = 1.5      # minimum time between two captures
DUPLICATE_SIM = 0.985      # skip a capture nearly identical to an existing one
SELF_CHECK_WARN = 0.5      # min pairwise similarity below this -> warning / refuse

GREEN, AMBER, RED, WHITE = (0, 200, 0), (0, 180, 255), (0, 0, 255), (255, 255, 255)


@dataclass
class Capture:
    frame_bgr: np.ndarray
    face: DetectedFace
    guidance: str


@dataclass
class SelfCheck:
    n: int
    min: float | None
    mean: float | None
    max: float | None
    matrix: list[list[float]] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return self.min is None or self.min >= SELF_CHECK_WARN


def short_reason(q: QualityReport) -> str:
    """Map QualityReport reasons to the on-screen hints from the spec."""
    hints = []
    for r in q.reasons:
        if r.startswith("too small"):
            hints.append("face too small: come closer")
        elif r.startswith("too blurry"):
            hints.append("too blurry: hold still")
        elif r.startswith("too turned") or r.startswith("too tilted"):
            hints.append("turn toward camera")
        else:
            hints.append(r)
    return " | ".join(hints)


def largest(faces: list[DetectedFace]) -> DetectedFace:
    return max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))


def pairwise_self_check(embs: np.ndarray) -> SelfCheck:
    n = int(embs.shape[0])
    if n < 2:
        return SelfCheck(n=n, min=None, mean=None, max=None)
    sims = embs @ embs.T
    off = sims[np.triu_indices(n, k=1)]
    return SelfCheck(n=n, min=float(off.min()), mean=float(off.mean()), max=float(off.max()),
                     matrix=[[round(float(v), 3) for v in row] for row in sims])


class EnrollCapture:
    """Stateful capture session for one person on one camera."""

    def __init__(self, engine: FaceEngine, cfg: Config, name: str, n_required: int | None = None,
                 auto_capture: bool = True, footer: str = "c: capture now   q: abort") -> None:
        self.engine, self.cfg, self.name = engine, cfg, name
        self.n_required = n_required or cfg.enrollment.images_per_person
        self.auto_capture = auto_capture
        self.footer = footer
        self.captures: list[Capture] = []
        self.status, self.colour = "starting", RED
        self.last_event: str | None = None            # e.g. "captured 2/5"
        self._good_since: float | None = None
        self._last_capture_t = 0.0
        self._flash_until = 0.0
        self._force = False

    # ------------------------------------------------------------ control

    def request_capture(self) -> None:
        """Capture on the next frame that passes quality (manual trigger)."""
        self._force = True

    @property
    def done(self) -> bool:
        return len(self.captures) >= self.n_required

    @property
    def guidance(self) -> str:
        return GUIDANCE[len(self.captures) % len(GUIDANCE)]

    def embeddings(self) -> np.ndarray:
        return np.stack([c.face.embedding for c in self.captures]).astype(np.float32)

    def self_check(self) -> SelfCheck:
        return pairwise_self_check(self.embeddings()) if self.captures else \
            SelfCheck(n=0, min=None, mean=None, max=None)

    def drop_last(self) -> None:
        if self.captures:
            self.captures.pop()

    # --------------------------------------------------------------- loop

    def feed(self, frame_bgr: np.ndarray) -> np.ndarray:
        """Process one BGR frame; returns the annotated preview."""
        now = time.monotonic()
        faces = self.engine.detect_and_embed(frame_bgr)      # expects BGR
        display = frame_bgr.copy()
        guidance = self.guidance
        force, self._force = self._force, False

        status, colour, face = "no face detected", RED, None
        if faces:
            face = largest(faces)
            q = face.quality
            x1, y1, x2, y2 = face.bbox
            if len(faces) > 1:
                status, colour = f"{len(faces)} faces: only one person in frame please", AMBER
                self._good_since = None
            elif not q.passed:
                status, colour = short_reason(q), AMBER
                self._good_since = None
            else:
                status, colour = "good: hold still", GREEN
                self._good_since = self._good_since or now
            cv2.rectangle(display, (x1, y1), (x2, y2), colour, 2)
            put(display, f"w={q.face_width_px}px blur={q.blur_score:.0f} "
                         f"yaw={q.yaw_deg:+.0f} pitch={q.pitch_deg:+.0f}", x1, y2 + 18, colour, 0.5)
        else:
            self._good_since = None

        dwelled = (self.auto_capture and self._good_since is not None
                   and now - self._good_since >= DWELL_SECONDS)
        can_capture = (face is not None and colour == GREEN and not self.done
                       and now - self._last_capture_t >= MIN_GAP_SECONDS
                       and (dwelled or force))
        if can_capture:
            emb = face.embedding
            dup = any(float(emb @ c.face.embedding) > DUPLICATE_SIM for c in self.captures)
            if dup and not force:
                status, colour = "too similar to a previous capture: move a little", AMBER
                self._good_since = None
            else:
                self.captures.append(Capture(frame_bgr.copy(), face, guidance))
                self._last_capture_t = now
                self._flash_until = now + 0.25
                self._good_since = None
                self.last_event = (f"captured {len(self.captures)}/{self.n_required}: {guidance} "
                                   f"(w={face.quality.face_width_px}px blur={face.quality.blur_score:.0f})")
        elif force and face is not None:
            status = f"cannot capture now: {status}"

        if self.done:
            status, colour = "all captures done: finish to save", GREEN
        self.status, self.colour = status, colour

        # HUD
        h, w = display.shape[:2]
        cv2.rectangle(display, (0, 0), (w, 95), (0, 0, 0), -1)
        put(display, f"Enrolling {self.name}   captured {len(self.captures)}/{self.n_required}",
            10, 25, WHITE, 0.7)
        put(display, f"Step {min(len(self.captures) + 1, self.n_required)}: {guidance}",
            10, 52, (255, 220, 120), 0.65)
        put(display, status, 10, 80, colour, 0.65)
        if self._good_since is not None and colour == GREEN and self.auto_capture:
            frac = min(1.0, (now - self._good_since) / DWELL_SECONDS)
            cv2.rectangle(display, (0, 92), (int(w * frac), 95), GREEN, -1)
        if self.footer:
            put(display, self.footer, 10, h - 12, (200, 200, 200), 0.5)
        if now < self._flash_until:
            cv2.rectangle(display, (0, 0), (w, h), WHITE, 12)
        return display
