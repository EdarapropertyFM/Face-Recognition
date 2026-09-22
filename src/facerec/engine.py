"""FaceEngine: detect -> align -> embed with a frozen pretrained model (spec §4.1).

There is no training anywhere in this project. insightface's buffalo_l pack
(SCRFD detector + w600k_r50 ArcFace) is downloaded once and used as-is.
Alignment to the canonical 112x112 template is done inside insightface;
we never feed it a raw crop.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from insightface.app import FaceAnalysis

from .config import Config
from .quality import QualityReport, assess

log = logging.getLogger(__name__)

EMBEDDING_DIM = 512


@dataclass
class DetectedFace:
    bbox: tuple[int, int, int, int]      # x1, y1, x2, y2
    det_score: float
    landmarks: np.ndarray                 # (5, 2)
    embedding: np.ndarray                 # (512,) float32, L2-normalised
    quality: QualityReport


class FaceEngine:
    def __init__(self, config: Config) -> None:
        """Initialise insightface FaceAnalysis with the configured pack.

        Downloads models on first run to data/models/. Logs the resolved
        model paths at startup so the engineer can confirm what loaded.
        """
        self.config = config
        self.models_dir: Path = config.models_dir
        self.models_dir.mkdir(parents=True, exist_ok=True)

        # insightface resolves models under <root>/models/<pack>/, so root
        # is data/, giving data/models/buffalo_l/. The pack also ships
        # gender/age and 68/106-point landmark models; we only need the
        # detector (which yields the 5 landmarks) and the recogniser, so
        # skip the rest to save CPU per frame.
        self.app = FaceAnalysis(
            name=config.model.pack,
            root=str(config.data_dir),
            providers=list(config.model.providers),
            allowed_modules=["detection", "recognition"],
        )
        self.app.prepare(
            ctx_id=0,
            det_size=tuple(config.model.det_size),
            det_thresh=config.detection.confidence_threshold,
        )

        self.model_version = self._resolve_model_version()
        for task, model in self.app.models.items():
            log.info("loaded %-12s %s", task, getattr(model, "model_file", "?"))
        log.info("model_version=%s providers=%s det_size=%s",
                 self.model_version, config.model.providers, config.model.det_size)

    def _resolve_model_version(self) -> str:
        """e.g. 'buffalo_l/w600k_r50'. Stored with every template (spec §4.3)."""
        rec = self.app.models.get("recognition")
        rec_name = Path(getattr(rec, "model_file", "unknown")).stem
        return f"{self.config.model.pack}/{rec_name}"

    def detect_and_embed(self, frame_bgr: np.ndarray) -> list[DetectedFace]:
        """Full pipeline on one frame. Returns all faces passing the
        detection threshold, each with its quality report attached.
        Does NOT filter on quality; the caller decides.
        """
        if frame_bgr is None or frame_bgr.ndim != 3 or frame_bgr.shape[2] != 3:
            raise ValueError("frame_bgr must be an HxWx3 array")

        # COLOUR ORDER: OpenCV decodes frames as BGR, and insightface's
        # FaceAnalysis.get() expects BGR (it converts internally for the
        # recognition model). Passing the frame through unchanged is
        # correct. Do NOT cv2.cvtColor(..., COLOR_BGR2RGB) here: it would
        # silently degrade embeddings without any error.
        faces = self.app.get(frame_bgr)

        results: list[DetectedFace] = []
        for face in faces:
            x1, y1, x2, y2 = (int(round(float(v))) for v in face.bbox)
            bbox = (x1, y1, x2, y2)
            landmarks = np.asarray(face.kps, dtype=np.float32)

            # Use normed_embedding (already L2-normalised), NOT face.embedding.
            # Cosine similarity downstream is a plain dot product of unit
            # vectors; mixing in an unnormalised vector breaks matching.
            embedding = np.asarray(face.normed_embedding, dtype=np.float32)
            if embedding.shape != (EMBEDDING_DIM,):
                raise RuntimeError(
                    f"unexpected embedding shape {embedding.shape}; "
                    f"expected ({EMBEDDING_DIM},)")

            results.append(DetectedFace(
                bbox=bbox,
                det_score=float(face.det_score),
                landmarks=landmarks,
                embedding=embedding,
                quality=assess(frame_bgr, bbox, landmarks, self.config),
            ))
        return results
