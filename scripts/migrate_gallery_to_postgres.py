"""One-off: copy gallery metadata from the old SQLite data/gallery.db into PostgreSQL.

    python -m scripts.migrate_gallery_to_postgres            # dry run: report only
    python -m scripts.migrate_gallery_to_postgres --apply

Only the person/template rows move. data/embeddings.npy is the vector store
either way and is left untouched, so row_index keeps pointing at the same
vectors. The SQLite file is renamed to gallery.db.migrated on success rather
than deleted, so it stays available as a fallback.
"""
from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import psycopg  # noqa: E402
from psycopg.rows import dict_row  # noqa: E402

from facerec import load_config  # noqa: E402
from facerec.engine import EMBEDDING_DIM  # noqa: E402
from facerec.gallery import SCHEMA  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true", help="actually write to PostgreSQL")
    ap.add_argument("--sqlite", type=Path, default=None, help="default: data/gallery.db")
    args = ap.parse_args()

    cfg = load_config()
    db = cfg.database.resolved()
    sqlite_path = args.sqlite or (cfg.data_dir / "gallery.db")
    npy_path = cfg.data_dir / "embeddings.npy"

    if not sqlite_path.exists():
        print(f"no SQLite gallery at {sqlite_path}; nothing to migrate")
        return 0

    src = sqlite3.connect(f"file:{sqlite_path}?mode=ro", uri=True)
    src.row_factory = sqlite3.Row
    persons = [dict(r) for r in src.execute("SELECT * FROM person ORDER BY created_at")]
    templates = [dict(r) for r in src.execute("SELECT * FROM template ORDER BY row_index")]
    src.close()

    n_vectors = int(np.load(npy_path).shape[0]) if npy_path.exists() else 0
    print(f"source : {sqlite_path}")
    print(f"         {len(persons)} person(s), {len(templates)} template row(s)")
    print(f"vectors: {npy_path} -> {n_vectors} row(s)  (not modified)")
    print(f"target : postgres {db.user}@{db.host}:{db.port}/{db.name} schema {db.schema_name}")

    if len(templates) != n_vectors:
        print(f"\nREFUSING: {len(templates)} template rows but {n_vectors} vectors. "
              "The two stores disagree; fix that before migrating.")
        return 2
    row_indexes = sorted(t["row_index"] for t in templates)
    if row_indexes != list(range(len(templates))):
        print("\nREFUSING: row_index values are not contiguous 0..N-1.")
        return 2
    for p in persons:
        print(f"  - {p['name']:<20} ({p['id'][:8]}) "
              f"{sum(1 for t in templates if t['person_id'] == p['id'])} template(s)")

    with psycopg.connect(cfg.database.conninfo(), autocommit=True, row_factory=dict_row) as conn:
        conn.execute(SCHEMA.format(schema=db.schema_name))
        existing = conn.execute(
            f"SELECT COUNT(*) AS n FROM {db.schema_name}.person").fetchone()["n"]
        if existing:
            print(f"\nREFUSING: PostgreSQL already holds {existing} person(s). "
                  "Migrating would mix two galleries; clear it first if that is intended.")
            return 2

        if not args.apply:
            print("\ndry run. Re-run with --apply to write these rows.")
            return 0

        with conn.transaction():
            conn.cursor().executemany(
                f"INSERT INTO {db.schema_name}.person (id, name, role, created_at, status) "
                f"VALUES (%s, %s, %s, %s, %s)",
                [(p["id"], p["name"], p["role"], p["created_at"], p["status"]) for p in persons])
            conn.cursor().executemany(
                f"INSERT INTO {db.schema_name}.template (id, person_id, row_index, "
                f"quality_score, image_path, model_version, created_at) "
                f"VALUES (%s, %s, %s, %s, %s, %s, %s)",
                [(t["id"], t["person_id"], t["row_index"], t["quality_score"],
                  t["image_path"], t["model_version"], t["created_at"]) for t in templates])

        moved_p = conn.execute(f"SELECT COUNT(*) AS n FROM {db.schema_name}.person").fetchone()["n"]
        moved_t = conn.execute(f"SELECT COUNT(*) AS n FROM {db.schema_name}.template").fetchone()["n"]

    print(f"\nmigrated {moved_p} person(s) and {moved_t} template row(s)")
    print(f"embeddings.npy untouched ({n_vectors} vectors, {EMBEDDING_DIM}-d)")

    # Cosmetic last step: the rows are already safely in PostgreSQL, so a
    # failure here (Windows refuses to rename a file another process still
    # holds open) must not look like a failed migration.
    backup = sqlite_path.with_suffix(".db.migrated")
    try:
        sqlite_path.replace(backup)
        print(f"old SQLite file kept as {backup}")
    except OSError as e:
        print(f"\nNOTE: migration succeeded, but {sqlite_path} could not be renamed: {e}")
        print("      Something still has it open (a running API or demo). Stop it and")
        print(f"      rename the file yourself; nothing reads it any more.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
