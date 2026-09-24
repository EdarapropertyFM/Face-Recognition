import sys
import uuid
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from facerec.config import Config, load_config  # noqa: E402


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
    """Temp data dir, but the REAL database settings from config.yaml, so the
    tests reach the same PostgreSQL the app uses (the port is not always the
    default). Gallery tests additionally get their own throwaway schema via
    the `gallery_schema` fixture, so they never touch real rows."""
    return Config(data_dir=tmp_path, database=load_config().database)


def postgres_available(config: Config) -> bool:
    try:
        import psycopg
        with psycopg.connect(config.database.conninfo(), connect_timeout=3):
            return True
    except Exception:
        return False


@pytest.fixture
def gallery_schema(config):
    """A throwaway PostgreSQL schema, dropped afterwards, so gallery tests
    never touch the real facerec schema on this machine."""
    import psycopg
    if not postgres_available(config):
        pytest.skip("PostgreSQL is not reachable (docker compose up -d db)")
    name = "test_" + uuid.uuid4().hex[:12]
    yield name
    with psycopg.connect(config.database.conninfo(), autocommit=True) as conn:
        conn.execute(f"DROP SCHEMA IF EXISTS {name} CASCADE")
