import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from facerec.config import Config  # noqa: E402


def unit(seed: int, dim: int = 512) -> np.ndarray:
    """Deterministic random unit vector. Two different seeds are ~orthogonal."""
    v = np.random.default_rng(seed).standard_normal(dim).astype(np.float32)
    return v / np.linalg.norm(v)


def near(base: np.ndarray, seed: int, noise: float = 0.3) -> np.ndarray:
    """A unit vector close to base (same person, different photo)."""
    v = base + noise * unit(seed)
    return (v / np.linalg.norm(v)).astype(np.float32)


@pytest.fixture
def config(tmp_path) -> Config:
    return Config(data_dir=tmp_path)
