"""Phase 2 acceptance check: run FaceEngine on one image and print everything.

    python -m scripts.check_image path/to/photo.jpg
"""
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from facerec import FaceEngine, load_config  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("image", type=Path)
    ap.add_argument("--config", type=Path, default=None)
    args = ap.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

    # cv2.imread returns BGR, exactly what FaceEngine expects. No conversion.
    frame_bgr = cv2.imread(str(args.image), cv2.IMREAD_COLOR)
    if frame_bgr is None:
        print(f"could not read image: {args.image}", file=sys.stderr)
        return 1

    config = load_config(args.config) if args.config else load_config()
    engine = FaceEngine(config)
    faces = engine.detect_and_embed(frame_bgr)

    print(f"\nimage: {args.image}  ({frame_bgr.shape[1]}x{frame_bgr.shape[0]})")
    print(f"model_version: {engine.model_version}")
    print(f"faces found: {len(faces)}")
    for i, f in enumerate(faces):
        q = f.quality
        print(f"\n--- face {i} ---")
        print(f"bbox (x1,y1,x2,y2): {f.bbox}   det_score: {f.det_score:.3f}")
        print(f"quality: passed={q.passed}  width={q.face_width_px}px  "
              f"blur={q.blur_score:.1f}  yaw={q.yaw_deg:.1f}  pitch={q.pitch_deg:.1f}")
        print(f"  reasons: {q.reasons if q.reasons else 'none'}")
        norm = float(np.linalg.norm(f.embedding))
        print(f"embedding[:8]: {np.array2string(f.embedding[:8], precision=4)}")
        print(f"embedding L2 norm: {norm:.6f}  (must be 1.0)  "
              f"dtype={f.embedding.dtype}  shape={f.embedding.shape}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
