"""Typed settings loaded from config.yaml (spec §3).

Every tunable number lives in config.yaml. Nothing here should carry a
magic number that the engineer might want to change without editing code.
"""
from __future__ import annotations

from pathlib import Path

import yaml
from pydantic import BaseModel

# Repository root = two levels above src/facerec/
REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG_PATH = REPO_ROOT / "config.yaml"
DATA_DIR = REPO_ROOT / "data"


class ModelConfig(BaseModel):
    pack: str = "buffalo_l"
    det_size: tuple[int, int] = (640, 640)
    providers: list[str] = ["CPUExecutionProvider"]


class DetectionConfig(BaseModel):
    confidence_threshold: float = 0.5
    min_face_size_px: int = 80


class QualityConfig(BaseModel):
    blur_threshold: float = 60.0
    max_yaw_deg: float = 35.0
    max_pitch_deg: float = 35.0


class MatchingConfig(BaseModel):
    threshold_high: float = 0.40
    threshold_low: float = 0.30
    runner_up_margin: float = 0.05


class EnrollmentConfig(BaseModel):
    images_per_person: int = 5
    min_images: int = 3


class VideoConfig(BaseModel):
    source: int | str = 0
    process_every_n_frames: int = 3
    track_iou_threshold: float = 0.3
    track_max_age_frames: int = 15
    track_keep_best_n: int = 5


class Config(BaseModel):
    model: ModelConfig = ModelConfig()
    detection: DetectionConfig = DetectionConfig()
    quality: QualityConfig = QualityConfig()
    matching: MatchingConfig = MatchingConfig()
    enrollment: EnrollmentConfig = EnrollmentConfig()
    video: VideoConfig = VideoConfig()

    # Derived, not user-tunable; kept on the object for convenience.
    data_dir: Path = DATA_DIR

    @property
    def models_dir(self) -> Path:
        return self.data_dir / "models"


def load_config(path: str | Path = DEFAULT_CONFIG_PATH) -> Config:
    """Load and validate config.yaml. Raises if the file is missing or malformed."""
    path = Path(path)
    with path.open("r", encoding="utf-8") as fh:
        raw = yaml.safe_load(fh) or {}
    return Config.model_validate(raw)
