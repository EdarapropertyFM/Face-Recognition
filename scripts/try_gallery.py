"""Phase 3 manual check: enrol -> search -> decide -> delete -> search again.

    python -m scripts.try_gallery --enroll NAME img1.jpg [img2.jpg ...] --query q1.jpg [q2.jpg ...]

Uses a throwaway gallery in a temp directory; data/ is not touched.
"""
from __future__ import annotations

import argparse
import logging
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from facerec import FaceEngine, load_config  # noqa: E402
from facerec.gallery import Gallery  # noqa: E402
from facerec.matcher import decide  # noqa: E402


def embed_largest(engine: FaceEngine, path: Path):
    frame_bgr = cv2.imread(str(path), cv2.IMREAD_COLOR)  # BGR, no conversion
    if frame_bgr is None:
        raise SystemExit(f"cannot read {path}")
    faces = engine.detect_and_embed(frame_bgr)
    if not faces:
        raise SystemExit(f"no face in {path}")
    return max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--enroll", nargs="+", metavar=("NAME", "IMG"), required=True,
                    help="person name followed by one or more enrolment images")
    ap.add_argument("--query", nargs="+", type=Path, required=True)
    args = ap.parse_args()
    if len(args.enroll) < 2:
        ap.error("--enroll needs NAME and at least one image")
    name, enroll_imgs = args.enroll[0], [Path(p) for p in args.enroll[1:]]

    logging.basicConfig(level=logging.WARNING)
    cfg = load_config()
    engine = FaceEngine(cfg)

    tmp = Path(tempfile.mkdtemp(prefix="facerec_try_"))
    gallery = Gallery(cfg, engine.model_version,
                      db_path=tmp / "gallery.db", npy_path=tmp / "embeddings.npy")
    print(f"temp gallery: {tmp}\n")

    # --- enrol
    pid = gallery.add_person(name)
    faces = [embed_largest(engine, p) for p in enroll_imgs]
    embs = np.stack([f.embedding for f in faces])
    gallery.add_templates(pid, embs, [f.quality.blur_score for f in faces],
                          [str(p) for p in enroll_imgs])
    print(f"enrolled '{name}' ({pid[:8]}) with {len(faces)} template(s); "
          f"gallery size = {len(gallery)} vectors, {gallery.person_count} person(s)")
    if len(faces) > 1:
        sims = embs @ embs.T
        off = sims[np.triu_indices(len(faces), k=1)]
        print(f"self-check pairwise similarity: min={off.min():.3f} mean={off.mean():.3f}"
              f"  (should be ~0.6+)")

    # --- query
    def run_queries(label: str) -> None:
        print(f"\n== queries ({label}) ==")
        for q in args.query:
            f = embed_largest(engine, q)
            r = decide(gallery.search(f.embedding), cfg.matching)
            gap = f"{r.runner_up_gap:.3f}" if r.runner_up_gap is not None else "n/a"
            print(f"{q.name:<14} {r.decision.value.upper():<10} name={r.name!s:<10} "
                  f"sim={r.similarity:.3f} gap={gap}")
            print(f"{'':14} reason: {r.reason}")

    run_queries("after enrol")

    # --- delete and confirm nothing matches any more
    gallery.delete_person(pid)
    print(f"\ndeleted '{name}'; gallery size = {len(gallery)}")
    run_queries("after delete")
    gallery.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
