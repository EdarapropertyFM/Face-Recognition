"""facerec: frozen-model face recognition prototype (no training)."""
from .config import Config, load_config
from .engine import DetectedFace, FaceEngine
from .quality import QualityReport

__all__ = ["Config", "load_config", "DetectedFace", "FaceEngine", "QualityReport"]
