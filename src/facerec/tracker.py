"""Minimal IoU tracker for video (spec §4.5).

Assigns a stable track_id to each face across frames by greedy IoU
matching, retires tracks after `track_max_age_frames` without a hit, and
holds per-track recognition state: the best-quality N embeddings seen so
far and the decision derived from them. Aggregating over several frames
instead of deciding on one is the biggest accuracy win in the live demo.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .config import Config
from .engine import DetectedFace
from .gallery import Match

BBox = tuple[int, int, int, int]


def iou(a: BBox, b: BBox) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    iw = max(0, min(ax2, bx2) - max(ax1, bx1))
    ih = max(0, min(ay2, by2) - max(ay1, by1))
    inter = iw * ih
    if inter == 0:
        return 0.0
    union = (ax2 - ax1) * (ay2 - ay1) + (bx2 - bx1) * (by2 - by1) - inter
    return inter / union if union > 0 else 0.0


@dataclass
class Sample:
    """One embedding kept for a track, with what it scored against the gallery."""
    quality_key: tuple[bool, float]      # (quality.passed, blur_score): higher is better
    embedding: np.ndarray
    matches: list[Match]                 # gallery.search(embedding), best-per-person

    @property
    def top_similarity(self) -> float:
        return self.matches[0].similarity if self.matches else -1.0


@dataclass
class Track:
    track_id: int
    bbox: BBox
    hits: int = 1
    age: int = 0                          # frames since last matched detection
    last_face: DetectedFace | None = None
    samples: list[Sample] = field(default_factory=list)

    def add_sample(self, face: DetectedFace, matches: list[Match], keep_best_n: int) -> None:
        """Keep the best-quality N samples. Quality passing always outranks
        failing; among equals, sharper wins."""
        self.samples.append(Sample((face.quality.passed, face.quality.blur_score),
                                   face.embedding, matches))
        self.samples.sort(key=lambda s: s.quality_key, reverse=True)
        del self.samples[keep_best_n:]

    def best_matches(self) -> list[Match]:
        """Matches from the sample with the highest top similarity (spec:
        decide on the highest similarity across the kept crops)."""
        if not self.samples:
            return []
        return max(self.samples, key=lambda s: s.top_similarity).matches


class IoUTracker:
    def __init__(self, config: Config) -> None:
        self.iou_threshold = config.video.track_iou_threshold
        self.max_age = config.video.track_max_age_frames
        self.keep_best_n = config.video.track_keep_best_n
        self.tracks: list[Track] = []
        self._next_id = 1

    def update(self, faces: list[DetectedFace]) -> list[tuple[Track, DetectedFace]]:
        """Match this frame's detections to tracks. Returns (track, face) pairs
        for every detection (new tracks included). Unmatched tracks age and
        are dropped once past max_age."""
        pairs: list[tuple[Track, DetectedFace]] = []
        unmatched_tracks = set(range(len(self.tracks)))
        unmatched_faces = set(range(len(faces)))

        # Greedy: highest IoU pairs first.
        candidates = [
            (iou(t.bbox, f.bbox), ti, fi)
            for ti, t in enumerate(self.tracks)
            for fi, f in enumerate(faces)
        ]
        for score, ti, fi in sorted(candidates, reverse=True):
            if score < self.iou_threshold:
                break
            if ti in unmatched_tracks and fi in unmatched_faces:
                t, f = self.tracks[ti], faces[fi]
                t.bbox, t.age, t.hits, t.last_face = f.bbox, 0, t.hits + 1, f
                pairs.append((t, f))
                unmatched_tracks.discard(ti)
                unmatched_faces.discard(fi)

        for fi in sorted(unmatched_faces):
            f = faces[fi]
            t = Track(track_id=self._next_id, bbox=f.bbox, last_face=f)
            self._next_id += 1
            self.tracks.append(t)
            pairs.append((t, f))

        for ti in unmatched_tracks:
            self.tracks[ti].age += 1
        self.tracks = [t for t in self.tracks if t.age <= self.max_age]
        return pairs

    def active(self) -> list[Track]:
        """Tracks seen in the most recent update."""
        return [t for t in self.tracks if t.age == 0]
