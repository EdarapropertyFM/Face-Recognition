"""Pairwise cosine similarity between the largest face in each image.

    python -m scripts.compare_faces a.jpg b.jpg [c.jpg ...]

No gallery, no database: embeddings are L2-normalised already, so cosine
similarity is a plain dot product. Same person should land well above
matching.threshold_high; different people well below it.
"""
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from facerec import DetectedFace, FaceEngine, load_config  # noqa: E402


def largest_face(faces: list[DetectedFace]) -> DetectedFace:
    return max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("images", nargs="+", type=Path)
    ap.add_argument("--config", type=Path, default=None)
    args = ap.parse_args()
    if len(args.images) < 2:
        ap.error("need at least 2 images")

    logging.basicConfig(level=logging.WARNING)
    config = load_config(args.config) if args.config else load_config()
    engine = FaceEngine(config)

    labels: list[str] = []
    embeddings: list[np.ndarray] = []
    for path in args.images:
        # cv2.imread returns BGR, which is what FaceEngine expects. No conversion.
        frame_bgr = cv2.imread(str(path), cv2.IMREAD_COLOR)
        if frame_bgr is None:
            print(f"[skip] could not read: {path}", file=sys.stderr)
            continue
        faces = engine.detect_and_embed(frame_bgr)
        if not faces:
            print(f"[skip] no face found: {path}", file=sys.stderr)
            continue
        face = largest_face(faces)
        q = face.quality
        print(f"{path.name}: {len(faces)} face(s); using largest bbox={face.bbox} "
              f"det={face.det_score:.2f} quality={'ok' if q.passed else q.reasons}")
        labels.append(path.name)
        embeddings.append(face.embedding)

    if len(embeddings) < 2:
        print("fewer than 2 usable faces; nothing to compare", file=sys.stderr)
        return 1

    E = np.stack(embeddings)                 # (N, 512), rows are unit vectors
    sims = E @ E.T                           # cosine similarity matrix

    print(f"\nmodel_version: {engine.model_version}")
    print(f"thresholds: high={config.matching.threshold_high}  "
          f"low={config.matching.threshold_low}\n")

    w = max(len(l) for l in labels)
    print(" " * (w + 2) + "".join(f"{l[:9]:>10}" for l in labels))
    for i, row_label in enumerate(labels):
        row = "".join(f"{sims[i, j]:>10.3f}" for j in range(len(labels)))
        print(f"{row_label:<{w}}  {row}")

    # Off-diagonal summary: the numbers you actually care about.
    iu = np.triu_indices(len(labels), k=1)
    off = sims[iu]
    print(f"\noff-diagonal: min={off.min():.3f}  mean={off.mean():.3f}  max={off.max():.3f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
