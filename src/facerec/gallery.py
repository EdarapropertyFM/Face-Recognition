"""Gallery: SQLite metadata + one NumPy (N, 512) embedding matrix (spec §4.3).

Persistence is deliberately dumb: person/template rows in SQLite, and every
template's embedding as one row of data/embeddings.npy. `template.row_index`
is the join key between the two. Search is a single matrix-vector product;
no vector database at this scale.
"""
from __future__ import annotations

import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from .config import Config
from .engine import EMBEDDING_DIM

SCHEMA = """
CREATE TABLE IF NOT EXISTS person (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'resident',
  created_at   TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS template (
  id             TEXT PRIMARY KEY,
  person_id      TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  row_index      INTEGER NOT NULL,
  quality_score  REAL,
  image_path     TEXT,
  model_version  TEXT NOT NULL,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS template_person_idx ON template(person_id);
"""


@dataclass
class Match:
    person_id: str
    name: str
    similarity: float


@dataclass
class Person:
    id: str
    name: str
    role: str
    created_at: str
    status: str
    template_count: int


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Gallery:
    def __init__(self, config: Config, model_version: str,
                 db_path: Path | None = None, npy_path: Path | None = None) -> None:
        """model_version is stamped on every template; a gallery built with
        one model must never be searched with embeddings from another."""
        self.model_version = model_version
        self.db_path = db_path or (config.data_dir / "gallery.db")
        self.npy_path = npy_path or (config.data_dir / "embeddings.npy")
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

        # check_same_thread=False: FastAPI runs sync endpoints in a thread
        # pool. Callers still serialise access (the API holds a lock).
        self.conn = sqlite3.connect(str(self.db_path), check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys = ON")
        self.conn.executescript(SCHEMA)

        self.embeddings = self._load_embeddings()
        # row_index -> (person_id, name), rebuilt whenever templates change.
        self._row_owner: list[tuple[str, str]] = []
        self._rebuild_row_owner()
        self._stamp = self._disk_stamp()

    # ------------------------------------------------------------------ io

    def _disk_stamp(self) -> tuple[float, int]:
        """(mtime, size) of embeddings.npy; changes whenever another process
        (the API, a purge script) rewrites the gallery."""
        try:
            st = self.npy_path.stat()
            return (st.st_mtime, st.st_size)
        except FileNotFoundError:
            return (0.0, -1)

    def reload_if_changed(self) -> bool:
        """Re-read the gallery from disk if another process rewrote it, so a
        long-running consumer (live demo) reflects API deletes immediately.
        Returns True if a reload happened."""
        stamp = self._disk_stamp()
        if stamp == self._stamp:
            return False
        old_embeddings, old_owner = self.embeddings, self._row_owner
        try:
            self.embeddings = self._load_embeddings()
            self._rebuild_row_owner()
        except RuntimeError:
            # Caught the writer between its DB commit and its .npy replace;
            # keep the previous state and try again on the next call.
            self.embeddings, self._row_owner = old_embeddings, old_owner
            return False
        self._stamp = stamp
        return True

    def _load_embeddings(self) -> np.ndarray:
        if self.npy_path.exists():
            arr = np.load(self.npy_path).astype(np.float32, copy=False)
            if arr.ndim != 2 or arr.shape[1] != EMBEDDING_DIM:
                raise RuntimeError(f"{self.npy_path}: bad shape {arr.shape}")
            return arr
        return np.zeros((0, EMBEDDING_DIM), dtype=np.float32)

    def _save_embeddings(self) -> None:
        # Write to a temp file then replace, so a crash mid-write cannot
        # leave a truncated matrix behind a valid DB.
        # (np.save appends '.npy' to bare paths, so write via a file handle.)
        tmp = self.npy_path.with_suffix(".npy.tmp")
        with tmp.open("wb") as fh:
            np.save(fh, self.embeddings)
        tmp.replace(self.npy_path)
        self._stamp = self._disk_stamp()

    def _rebuild_row_owner(self) -> None:
        rows = self.conn.execute(
            "SELECT t.row_index, t.person_id, p.name FROM template t "
            "JOIN person p ON p.id = t.person_id ORDER BY t.row_index").fetchall()
        n = self.embeddings.shape[0]
        if len(rows) != n or any(r["row_index"] != i for i, r in enumerate(rows)):
            raise RuntimeError(
                f"gallery inconsistent: {len(rows)} template rows vs "
                f"{n} embedding rows, or row_index not contiguous. "
                "Restore from backup or rebuild the gallery.")
        self._row_owner = [(r["person_id"], r["name"]) for r in rows]

    def close(self) -> None:
        self.conn.close()

    # ------------------------------------------------------------- persons

    def add_person(self, name: str, role: str = "resident") -> str:
        person_id = str(uuid.uuid4())
        with self.conn:
            self.conn.execute(
                "INSERT INTO person (id, name, role, created_at, status) "
                "VALUES (?, ?, ?, ?, 'active')",
                (person_id, name, role, _now()))
        return person_id

    def get_person(self, person_id: str) -> Person | None:
        r = self.conn.execute(
            "SELECT p.*, (SELECT COUNT(*) FROM template t WHERE t.person_id = p.id) "
            "AS template_count FROM person p WHERE p.id = ?", (person_id,)).fetchone()
        return Person(**dict(r)) if r else None

    def list_persons(self) -> list[Person]:
        rows = self.conn.execute(
            "SELECT p.*, (SELECT COUNT(*) FROM template t WHERE t.person_id = p.id) "
            "AS template_count FROM person p ORDER BY p.created_at").fetchall()
        return [Person(**dict(r)) for r in rows]

    def add_templates(self, person_id: str, embeddings: np.ndarray,
                      quality: list[float], image_paths: list[str]) -> None:
        embeddings = np.asarray(embeddings, dtype=np.float32)
        if embeddings.ndim == 1:
            embeddings = embeddings[None, :]
        n = embeddings.shape[0]
        if embeddings.shape[1] != EMBEDDING_DIM:
            raise ValueError(f"embeddings must be (N, {EMBEDDING_DIM}), got {embeddings.shape}")
        if not (len(quality) == len(image_paths) == n):
            raise ValueError("embeddings, quality and image_paths must have equal length")
        if self.get_person(person_id) is None:
            raise KeyError(f"no such person: {person_id}")

        # Guard against the classic silent bug: an unnormalised vector in a
        # cosine gallery. normed_embedding is unit length; anything else is
        # a caller error.
        norms = np.linalg.norm(embeddings, axis=1)
        if not np.allclose(norms, 1.0, atol=1e-3):
            raise ValueError(f"embeddings must be L2-normalised; got norms {norms}")

        start = self.embeddings.shape[0]
        now = _now()
        rows = [
            (str(uuid.uuid4()), person_id, start + i, float(quality[i]),
             image_paths[i], self.model_version, now)
            for i in range(n)
        ]
        with self.conn:
            self.conn.executemany(
                "INSERT INTO template (id, person_id, row_index, quality_score, "
                "image_path, model_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                rows)
        self.embeddings = np.vstack([self.embeddings, embeddings])
        self._save_embeddings()
        self._rebuild_row_owner()

    def delete_person(self, person_id: str) -> None:
        """Remove the person, their templates, AND their rows from the
        embedding matrix, then reindex the survivors so row_index is
        contiguous again. Orphaned vectors would still match after a
        delete, which is a real bug, so this is done in one step."""
        if self.get_person(person_id) is None:
            raise KeyError(f"no such person: {person_id}")

        doomed = {r["row_index"] for r in self.conn.execute(
            "SELECT row_index FROM template WHERE person_id = ?", (person_id,))}
        keep = [i for i in range(self.embeddings.shape[0]) if i not in doomed]
        # old row_index -> new row_index for every surviving template
        remap = {old: new for new, old in enumerate(keep)}

        with self.conn:
            self.conn.execute("DELETE FROM template WHERE person_id = ?", (person_id,))
            self.conn.execute("DELETE FROM person WHERE id = ?", (person_id,))
            # Two-phase reindex avoids transient collisions: shift everything
            # out of range first, then assign final indices.
            self.conn.execute("UPDATE template SET row_index = row_index + 1000000000")
            self.conn.executemany(
                "UPDATE template SET row_index = ? WHERE row_index = ?",
                [(new, old + 1000000000) for old, new in remap.items()])

        self.embeddings = self.embeddings[keep] if keep else \
            np.zeros((0, EMBEDDING_DIM), dtype=np.float32)
        self._save_embeddings()
        self._rebuild_row_owner()

    # -------------------------------------------------------------- search

    def __len__(self) -> int:
        return self.embeddings.shape[0]

    @property
    def person_count(self) -> int:
        return self.conn.execute("SELECT COUNT(*) FROM person").fetchone()[0]

    def search(self, query: np.ndarray, top_k: int = 5) -> list[Match]:
        """Cosine similarity via embeddings @ query, collapsed to the best
        template per PERSON before ranking. Guarantees that matches[1] is a
        different person from matches[0], which is what makes the matcher's
        runner-up margin meaningful. Returns [] on an empty gallery."""
        if self.embeddings.shape[0] == 0:
            return []
        q = np.asarray(query, dtype=np.float32).ravel()
        if q.shape != (EMBEDDING_DIM,):
            raise ValueError(f"query must be ({EMBEDDING_DIM},), got {q.shape}")

        sims = self.embeddings @ q                      # (N,) cosine, unit vectors

        # Max over each person's templates (spec: max, not centroid).
        best: dict[str, tuple[str, float]] = {}
        for row, (pid, name) in enumerate(self._row_owner):
            s = float(sims[row])
            if pid not in best or s > best[pid][1]:
                best[pid] = (name, s)

        ranked = sorted(best.items(), key=lambda kv: kv[1][1], reverse=True)
        return [Match(person_id=pid, name=name, similarity=s)
                for pid, (name, s) in ranked[:top_k]]
