"""Enrol a person from the webcam (spec §5.1).

    python -m scripts.enroll_webcam --name "Your Name" --role resident
    python -m scripts.enroll_webcam --list

Guides the user through N captures (frontal, left, right, further away,
different lighting), accepts only frames that pass the quality filter,
shows the rejection reason on screen, saves the images, writes the
embeddings to the gallery, and finally prints the pairwise-similarity
self-check. That self-check is the early warning for broken alignment or
poor capture: same-person embeddings should sit around 0.6+.

The same flow is available in the browser at GET /enroll/{person_id} on the API.

Keys:  c = capture now (if the current frame passes quality)
       q / Esc = abort without enrolling
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
from facerec.enroll import SELF_CHECK_WARN, EnrollCapture, SelfCheck  # noqa: E402
from facerec.gallery import Gallery  # noqa: E402
from facerec.live import open_source  # noqa: E402

log = logging.getLogger("enroll")


def list_people(gallery: Gallery) -> None:
    people = gallery.list_persons()
    if not people:
        print("gallery is empty")
        return
    print(f"{'person_id':<36}  {'name':<20} {'role':<10} {'templates':>9}  created_at")
    for p in people:
        print(f"{p.id:<36}  {p.name:<20} {p.role:<10} {p.template_count:>9}  {p.created_at}")
    print(f"\n{len(people)} person(s), {len(gallery)} template vector(s), "
          f"model_version={gallery.model_version}")


def print_self_check(sc: SelfCheck) -> None:
    bar = "=" * 66
    print(f"\n{bar}\n  SELF-CHECK: pairwise cosine similarity between the {sc.n} captures")
    print(f"  min = {sc.min:.3f}   mean = {sc.mean:.3f}   max = {sc.max:.3f}")
    print(bar)
    print("       " + "".join(f"{f'#{j + 1}':>8}" for j in range(sc.n)))
    for i, row in enumerate(sc.matrix):
        print(f"  #{i + 1:<3} " + "".join(f"{v:>8.3f}" for v in row))
    print(bar)
    if not sc.ok:
        print(f"  !! WARNING: min pairwise similarity {sc.min:.3f} < {SELF_CHECK_WARN}")
        print("  !! Same-person embeddings should be ~0.6+. Something is wrong with")
        print("  !! alignment or capture quality (blur, extreme pose, wrong person in")
        print("  !! one frame, or a BGR/RGB mix-up). Matching will NOT work reliably.")
        print("  !! Re-enrol before continuing.")
    else:
        print("  OK: captures are mutually consistent.")
    print(bar + "\n")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--name", help="person name to enrol")
    ap.add_argument("--role", default="resident")
    ap.add_argument("--list", action="store_true", help="list enrolled people and exit")
    ap.add_argument("--force", action="store_true",
                    help=f"enrol even if the self-check min similarity is below {SELF_CHECK_WARN}")
    ap.add_argument("--config", type=Path, default=None)
    args = ap.parse_args()

    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")
    cfg = load_config(args.config) if args.config else load_config()
    engine = FaceEngine(cfg)
    gallery = Gallery(cfg, engine.model_version)

    if args.list:
        list_people(gallery)
        return 0
    if not args.name:
        ap.error("--name is required (or use --list)")

    n_required, n_min = cfg.enrollment.images_per_person, cfg.enrollment.min_images
    print(f"Enrolling '{args.name}' ({args.role}); need {n_required} captures "
          f"(minimum {n_min}). Window will open now.")
    try:
        cap = open_source(cfg.video.source)
    except RuntimeError as e:
        raise SystemExit(str(e))

    session = EnrollCapture(engine, cfg, args.name, n_required)
    window = f"Enrol: {args.name}"
    cv2.namedWindow(window, cv2.WINDOW_NORMAL)
    try:
        while not session.done:
            ok, frame_bgr = cap.read()                 # BGR; engine expects BGR
            if not ok:
                log.error("frame grab failed")
                break
            cv2.imshow(window, session.feed(frame_bgr))
            if session.last_event:
                print(session.last_event)
                session.last_event = None
            key = cv2.waitKey(1) & 0xFF
            if key == ord("c"):
                session.request_capture()
            elif key in (ord("q"), 27):
                print("aborted by user")
                break
    finally:
        cap.release()
        cv2.destroyAllWindows()

    captures = session.captures
    if len(captures) < n_min:
        print(f"only {len(captures)} capture(s) < min_images {n_min}; nothing enrolled")
        return 1

    sc = session.self_check()
    print_self_check(sc)
    if not sc.ok and not args.force:
        print("NOT enrolled: self-check failed. Fix capture conditions and re-run, "
              "or pass --force to enrol anyway.")
        return 2

    # Persist: images first (so the DB never references a missing file), then templates.
    person_id = gallery.add_person(args.name, args.role)
    out_dir = cfg.data_dir / "enrollments" / person_id
    out_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for i, c in enumerate(captures):
        p = out_dir / f"{i:02d}.jpg"
        cv2.imwrite(str(p), c.frame_bgr, [cv2.IMWRITE_JPEG_QUALITY, 95])
        paths.append(str(p))
    gallery.add_templates(person_id, session.embeddings(),
                          [c.face.quality.blur_score for c in captures], paths)

    print(f"enrolled '{args.name}'  person_id={person_id}")
    print(f"  {len(captures)} templates -> {out_dir}")
    print(f"  gallery now: {gallery.person_count} person(s), {len(gallery)} vectors")
    print("  reminder: record this consent in data/CONSENT.md")
    if not sc.ok:
        print("\n  enrolled with --force despite the WARNING above; expect poor matching.")
    gallery.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
