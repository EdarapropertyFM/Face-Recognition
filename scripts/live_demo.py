"""Live recognition demo (spec §5.2). The primary deliverable.

    python -m scripts.live_demo                       # webcam from config.yaml
    python -m scripts.live_demo --source 1            # another webcam index
    python -m scripts.live_demo --source rtsp://...   # a real camera

Every `process_every_n_frames` frames: detect, embed, track, search the
gallery and decide per TRACK (best of the last N quality crops), not per
frame. Boxes are green CONFIRMED / amber TENTATIVE / red UNKNOWN and always
show the similarity, the runner-up gap and the track id, because a demo
that only says known/unknown cannot be tuned.

The same loop is served by the API at GET /live (browser MJPEG view).

Keys:  q / Esc = quit     s = save the current annotated frame to data/debug/
"""
from __future__ import annotations

import argparse
import logging
import sys
from datetime import datetime
from pathlib import Path

import cv2

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from facerec import FaceEngine, load_config  # noqa: E402
from facerec.gallery import Gallery  # noqa: E402
from facerec.live import LiveRecognizer, open_source  # noqa: E402

log = logging.getLogger("live_demo")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", default=None,
                    help="webcam index or RTSP URL (default: video.source from config)")
    ap.add_argument("--config", type=Path, default=None)
    args = ap.parse_args()
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")

    cfg = load_config(args.config) if args.config else load_config()
    engine = FaceEngine(cfg)
    gallery = Gallery(cfg, engine.model_version)
    if len(gallery) == 0:
        print("WARNING: gallery is empty; everyone will be UNKNOWN. "
              "Run scripts.enroll_webcam first.")

    source = args.source if args.source is not None else cfg.video.source
    try:
        cap = open_source(source)
    except RuntimeError as e:
        raise SystemExit(str(e))
    print(f"source={source!r}  gallery={gallery.person_count} person(s)  "
          f"model={engine.model_version}  press q to quit")

    live = LiveRecognizer(engine, gallery, cfg)
    live.on_gallery_reload = lambda: print(
        f"gallery reloaded: {gallery.person_count} person(s), {len(gallery)} vectors")
    debug_dir = cfg.data_dir / "debug"
    window = "Face Recognition - live demo"
    cv2.namedWindow(window, cv2.WINDOW_NORMAL)

    try:
        while True:
            ok, frame_bgr = cap.read()             # BGR from OpenCV; engine expects BGR
            if not ok:
                log.error("frame grab failed (stream ended or camera disconnected)")
                break
            display = live.process(frame_bgr)
            cv2.imshow(window, display)

            key = cv2.waitKey(1) & 0xFF
            if key in (ord("q"), 27):
                break
            if key == ord("s"):
                debug_dir.mkdir(parents=True, exist_ok=True)
                p = debug_dir / f"{datetime.now():%Y%m%d_%H%M%S}_f{live.frame_idx}.jpg"
                cv2.imwrite(str(p), display)
                print(f"saved {p}")
                for track, r in live.active_results():
                    print(f"  track #{track.track_id}: {r.decision.value} {r.reason}")
    finally:
        cap.release()
        cv2.destroyAllWindows()
        gallery.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
