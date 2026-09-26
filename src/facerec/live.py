"""Shared live-recognition loop: detect -> track -> search -> decide -> draw.

Used by scripts/live_demo.py (OpenCV window) and api/main.py (MJPEG stream)
so both show exactly the same boxes, numbers and HUD.
"""
from __future__ import annotations

import time
from collections import deque

import cv2
import numpy as np

from .config import Config
from .engine import FaceEngine
from .gallery import Gallery
from .matcher import Decision, Result, decide
from .tracker import IoUTracker, Track

COLOURS = {
    Decision.CONFIRMED: (0, 200, 0),      # green
    Decision.TENTATIVE: (0, 180, 255),    # amber
    Decision.UNKNOWN: (0, 0, 255),        # red
}
WHITE, GREY = (255, 255, 255), (200, 200, 200)


def put(img, text, x, y, colour=WHITE, scale=0.55):
    """Text on a dark backing box. (Not a thick-outline pass: OpenCV 5's text
    renderer gives thick and thin strokes different advances, so the two
    passes drift apart and look doubled.)"""
    (w, h), base = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, scale, 1)
    cv2.rectangle(img, (x - 2, y - h - 3), (x + w + 2, y + base + 1), (0, 0, 0), -1)
    cv2.putText(img, text, (x, y), cv2.FONT_HERSHEY_SIMPLEX, scale, colour, 1, cv2.LINE_AA)


def draw_track(img, track: Track, result: Result | None) -> None:
    x1, y1, x2, y2 = track.bbox
    if result is None:
        colour, line1, line2 = GREY, f"#{track.track_id} pending", ""
    else:
        colour = COLOURS[result.decision]
        who = result.name if result.name else "unknown"
        gap = f"{result.runner_up_gap:+.2f}" if result.runner_up_gap is not None else "n/a"
        line1 = f"#{track.track_id} {who}  sim {result.similarity:.2f}"
        line2 = f"{result.decision.value}  gap {gap}  n={len(track.samples)}"
    cv2.rectangle(img, (x1, y1), (x2, y2), colour, 2)
    put(img, line1, x1, max(15, y1 - 24), colour)
    if line2:
        put(img, line2, x1, max(30, y1 - 6), colour, 0.5)
    if track.last_face is not None:
        q = track.last_face.quality
        put(img, f"w={q.face_width_px} blur={q.blur_score:.0f} "
                 f"yaw={q.yaw_deg:+.0f} pitch={q.pitch_deg:+.0f}"
                 + ("" if q.passed else "  [low quality]"),
            x1, y2 + 16, colour, 0.45)


def open_source(source: str | int, cfg: Config | None = None) -> cv2.VideoCapture:
    """Open a webcam index, file, rtsp:// URL, or the shorthand dvr:<ch>
    (resolved through data/dvr.json; see facerec.dvr)."""
    from .dvr import open_rtsp, resolve_source         # local import: avoids a cycle
    from .config import load_config
    src, label = resolve_source(source, cfg or load_config())
    # open_rtsp applies the bounded connect/read timeouts. Building the capture
    # here instead left FFmpeg on its 30 s default, so an unreachable camera
    # held a grabber thread for half a minute after the request had given up.
    cap = open_rtsp(src) if isinstance(src, str) and src.startswith("rtsp") \
        else cv2.VideoCapture(src)
    if not cap.isOpened():
        raise RuntimeError(f"cannot open video source {label}")
    if isinstance(src, int):
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    return cap


class LiveRecognizer:
    """Stateful per-stream processor. Feed it frames in order; get annotated
    frames back. Runs the full pipeline every `process_every_n_frames` and
    redraws the last known tracks in between."""

    def __init__(self, engine: FaceEngine, gallery: Gallery, cfg: Config,
                 footer: str = "q: quit   s: save frame") -> None:
        self.engine, self.gallery, self.cfg = engine, gallery, cfg
        self.tracker = IoUTracker(cfg)
        self.results: dict[int, Result] = {}          # track_id -> latest decision
        self.every_n = max(1, cfg.video.process_every_n_frames)
        self.frame_idx = 0
        self.footer = footer
        self._disp_times: deque[float] = deque(maxlen=30)
        self._proc_times: deque[float] = deque(maxlen=10)
        self.on_gallery_reload = None                  # optional callback

    def process(self, frame_bgr: np.ndarray) -> np.ndarray:
        """frame_bgr straight from OpenCV (BGR; the engine expects BGR)."""
        t0 = time.perf_counter()
        self.frame_idx += 1

        if self.frame_idx % self.every_n == 0:
            tp = time.perf_counter()
            if self.gallery.reload_if_changed():       # API enrol/delete elsewhere
                self.results.clear()
                for t in self.tracker.tracks:
                    t.samples.clear()                  # old samples hold stale matches
                if self.on_gallery_reload:
                    self.on_gallery_reload()
            faces = self.engine.detect_and_embed(frame_bgr)
            for track, face in self.tracker.update(faces):
                # One gallery search per detection; the track keeps the best N
                # by quality and decides on the highest similarity.
                matches = self.gallery.search(face.embedding)
                track.add_sample(face, matches, self.cfg.video.track_keep_best_n)
                self.results[track.track_id] = decide(track.best_matches(), self.cfg.matching)
            live_ids = {t.track_id for t in self.tracker.tracks}
            for tid in list(self.results):
                if tid not in live_ids:
                    del self.results[tid]
            self._proc_times.append(time.perf_counter() - tp)

        display = frame_bgr.copy()
        for track in self.tracker.tracks:
            if track.age <= self.every_n:              # still fresh enough to draw
                draw_track(display, track, self.results.get(track.track_id))
        self._disp_times.append(time.perf_counter() - t0)
        self._draw_hud(display)
        return display

    def active_results(self) -> list[tuple[Track, Result]]:
        return [(t, self.results[t.track_id]) for t in self.tracker.active()
                if t.track_id in self.results]

    def _draw_hud(self, img) -> None:
        fps_display = len(self._disp_times) / max(sum(self._disp_times), 1e-6)
        fps_proc = (1.0 / max(sum(self._proc_times) / len(self._proc_times), 1e-6)
                    if self._proc_times else 0.0)
        m, v = self.cfg.matching, self.cfg.video
        lines = [
            f"FPS display {fps_display:4.1f}   pipeline {fps_proc:4.1f}   "
            f"(every {v.process_every_n_frames} frames)   frame {self.frame_idx}",
            f"gallery: {self.gallery.person_count} person(s), {len(self.gallery)} templates   "
            f"model {self.engine.model_version}",
            f"thresholds: high {m.threshold_high:.2f}  low {m.threshold_low:.2f}  "
            f"margin {m.runner_up_margin:.2f}   track keep-best {v.track_keep_best_n}",
        ]
        cv2.rectangle(img, (0, 0), (img.shape[1], 14 + 20 * len(lines)), (0, 0, 0), -1)
        for i, t in enumerate(lines):
            put(img, t, 8, 20 + 20 * i, WHITE, 0.5)
        if self.footer:
            put(img, self.footer, 8, img.shape[0] - 10, GREY, 0.5)
