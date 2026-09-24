"""Gallery: PostgreSQL metadata + one NumPy (N, 512) embedding matrix (spec §4.3).

Person and template rows live in PostgreSQL (its own `facerec` schema, so it
can share a database with the STMC backend); every template's embedding is one
row of data/embeddings.npy. `template.row_index` is the join key between the
two. Search is a single matrix-vector product: no vector database (spec §0.3).

The two stores are written in one step and validated against each other on
load, because a metadata row without its vector — or the reverse — silently
matches the wrong person.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import psycopg
from psycopg.rows import dict_row

from .config import Config
from .engine import EMBEDDING_DIM

# {schema} is filled in from config (database.schema, default "facerec").
SCHEMA = """
CREATE SCHEMA IF NOT EXISTS {schema};

CREATE TABLE IF NOT EXISTS {schema}.person (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'resident',
  created_at   TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS {schema}.template (
  id             TEXT PRIMARY KEY,
  person_id      TEXT NOT NULL REFERENCES {schema}.person(id) ON DELETE CASCADE,
  row_index      INTEGER NOT NULL,
  quality_score  REAL,
  image_path     TEXT,
  model_version  TEXT NOT NULL,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS template_person_idx ON {schema}.template(person_id);
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
                 npy_path: Path | None = None, schema: str | None = None) -> None:
        """model_version is stamped on every template; a gallery built with
        one model must never be searched with embeddings from another.

        npy_path and schema override the configured locations, which is how
        tests get an isolated gallery.
        """
        self.model_version = model_version
        self.config = config
        db = config.database.resolved()
        self.schema = schema or db.schema_name
        self.npy_path = npy_path or (config.data_dir / "embeddings.npy")
        self.npy_path.parent.mkdir(parents=True, exist_ok=True)

        # autocommit: each statement or explicit transaction() block commits on
        # its own, matching how the old sqlite connection behaved.
        self.conn = psycopg.connect(config.database.conninfo(), autocommit=True,
                                    row_factory=dict_row)
        self.conn.execute(SCHEMA.format(schema=self.schema))

        self.embeddings = self._load_embeddings()
        # row_index -> (person_id, name), rebuilt whenever templates change.
        self._row_owner: list[tuple[str, str]] = []
        self._rebuild_row_owner()
        self._stamp = self._disk_stamp()

    def _t(self, table: str) -> str:
        return f"{self.schema}.{table}"

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
        """Re-read the gallery if another process rewrote it, so a
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
            # Caught the writer between its commit and its .npy replace;
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
        # leave a truncated matrix behind valid metadata.
        # (np.save appends '.npy' to bare paths, so write via a file handle.)
        tmp = self.npy_path.with_suffix(".npy.tmp")
        with tmp.open("wb") as fh:
            np.save(fh, self.embeddings)
        tmp.replace(self.npy_path)
        self._stamp = self._disk_stamp()

    def _rebuild_row_owner(self) -> None:
        rows = self.conn.execute(
            f"SELECT t.row_index, t.person_id, p.name FROM {self._t('template')} t "
            f"JOIN {self._t('person')} p ON p.id = t.person_id "
            f"ORDER BY t.row_index").fetchall()
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
        self.conn.execute(
            f"INSERT INTO {self._t('person')} (id, name, role, created_at, status) "
            f"VALUES (%s, %s, %s, %s, 'active')",
            (person_id, name, role, _now()))
        return person_id

    def get_person(self, person_id: str) -> Person | None:
        r = self.conn.execute(
            f"SELECT p.*, (SELECT COUNT(*) FROM {self._t('template')} t "
            f"WHERE t.person_id = p.id) AS template_count "
            f"FROM {self._t('person')} p WHERE p.id = %s", (person_id,)).fetchone()
        return Person(**r) if r else None

    def list_persons(self) -> list[Person]:
        rows = self.conn.execute(
            f"SELECT p.*, (SELECT COUNT(*) FROM {self._t('template')} t "
            f"WHERE t.person_id = p.id) AS template_count "
            f"FROM {self._t('person')} p ORDER BY p.created_at").fetchall()
        return [Person(**r) for r in rows]

    def update_person(self, person_id: str, name: str | None = None,
                      role: str | None = None) -> Person:
        """Rename or re-role an existing person. Used when a provisional
        capture is approved and becomes a named resident; the templates and
        their row_index are untouched."""
        if self.get_person(person_id) is None:
            raise KeyError(f"no such person: {person_id}")
        sets, params = [], []
        if name is not None:
            sets.append("name = %s")
            params.append(name)
        if role is not None:
            sets.append("role = %s")
            params.append(role)
        if sets:
            params.append(person_id)
            self.conn.execute(
                f"UPDATE {self._t('person')} SET {', '.join(sets)} WHERE id = %s", params)
            self._rebuild_row_owner()          # _row_owner caches the name
        return self.get_person(person_id)

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
        with self.conn.transaction():
            self.conn.cursor().executemany(
                f"INSERT INTO {self._t('template')} (id, person_id, row_index, "
                f"quality_score, image_path, model_version, created_at) "
                f"VALUES (%s, %s, %s, %s, %s, %s, %s)", rows)
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
            f"SELECT row_index FROM {self._t('template')} WHERE person_id = %s",
            (person_id,)).fetchall()}
        keep = [i for i in range(self.embeddings.shape[0]) if i not in doomed]
        # old row_index -> new row_index for every surviving template
        remap = {old: new for new, old in enumerate(keep)}

        with self.conn.transaction():
            self.conn.execute(f"DELETE FROM {self._t('template')} WHERE person_id = %s",
                              (person_id,))
            self.conn.execute(f"DELETE FROM {self._t('person')} WHERE id = %s", (person_id,))
            # Two-phase reindex avoids transient collisions: shift everything
            # out of range first, then assign final indices.
            self.conn.execute(
                f"UPDATE {self._t('template')} SET row_index = row_index + 1000000000")
            self.conn.cursor().executemany(
                f"UPDATE {self._t('template')} SET row_index = %s WHERE row_index = %s",
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
        return self.conn.execute(f"SELECT COUNT(*) AS n FROM {self._t('person')}").fetchone()["n"]

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
