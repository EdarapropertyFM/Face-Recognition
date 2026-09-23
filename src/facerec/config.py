"""Typed settings loaded from config.yaml (spec §3).

Every tunable number lives in config.yaml. Nothing here should carry a
magic number that the engineer might want to change without editing code.
"""
from __future__ import annotations

import os
from pathlib import Path

import yaml
from pydantic import BaseModel, ConfigDict, Field

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


class DatabaseConfig(BaseModel):
    """PostgreSQL connection for the gallery metadata.

    Environment variables win over config.yaml so the Python side can share
    backend/.env on a machine that runs both.
    """
    host: str = "localhost"
    port: int = 5432
    user: str = "postgres"
    password: str = "password"
    name: str = "stmc"
    schema_name: str = Field(default="facerec", alias="schema")

    model_config = ConfigDict(populate_by_name=True)

    def resolved(self) -> "DatabaseConfig":
        """A copy with DB_* environment overrides applied."""
        env = {
            "host": os.environ.get("DB_HOST"),
            "port": os.environ.get("DB_PORT"),
            "user": os.environ.get("DB_USER"),
            "password": os.environ.get("DB_PASSWORD"),
            "name": os.environ.get("DB_NAME"),
            "schema_name": os.environ.get("DB_SCHEMA"),
        }
        data = self.model_dump()
        data.update({k: v for k, v in env.items() if v})
        return DatabaseConfig(**data)

    def conninfo(self) -> str:
        r = self.resolved()
        return (f"host={r.host} port={r.port} user={r.user} "
                f"password={r.password} dbname={r.name}")


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
    database: DatabaseConfig = DatabaseConfig()
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
