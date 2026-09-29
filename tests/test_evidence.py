"""Evidence kept when a stranger is seen.

A tight crop around a 20px face is unreadable and throws away everything
that identifies a visit. The full frame, the best moment of the pass, and a
clip spanning the seconds before and after are what an operator can act on.
"""
import time

import numpy as np
import pytest

from api import evidence


def frame(h=120, w=160, value=90):
    img = np.full((h, w, 3), value, dtype=np.uint8)
    img[5, 5] = (255, 255, 255)
    return img


# ---- the rolling buffer -------------------------------------------------

def test_buffer_keeps_recent_frames_and_drops_old_ones():
    buf = evidence.FrameBuffer(seconds=2.0, fps=10)
    for i in range(30):
        buf.add(frame(), now=i * 0.1)              # 3 seconds of history
    # Only the last 2 seconds survive.
    assert 0 < len(buf) <= 21


def test_buffer_thins_frames_to_its_target_rate():
    """Keeping every frame would cost far more memory than it is worth."""
    buf = evidence.FrameBuffer(seconds=10.0, fps=2)
    for i in range(100):
        buf.add(frame(), now=i * 0.01)             # 100 frames in 1 second
    assert len(buf) <= 3, "should thin to about 2 per second"


def test_buffer_returns_only_frames_after_a_moment():
    buf = evidence.FrameBuffer(seconds=10.0, fps=100)
    for i in range(10):
        buf.add(frame(), now=float(i))
    assert len(buf.since(5.0)) == 5


def test_buffer_survives_an_unencodable_frame():
    buf = evidence.FrameBuffer()
    buf.add(np.zeros((0, 0, 3), dtype=np.uint8))
    assert len(buf) == 0


# ---- stills -------------------------------------------------------------

def test_still_is_the_whole_frame_not_a_crop(tmp_path):
    """The point of the change: keep the scene, not a 20px face."""
    rel = evidence.save_still(tmp_path, frame(120, 160), "CH1", 7, bbox=(10, 10, 30, 30))
    assert rel is not None
    import cv2
    saved = cv2.imread(str(evidence.resolve(tmp_path, rel)))
    assert saved.shape[:2] == (120, 160)


def test_still_is_stamped_with_camera_and_time(tmp_path):
    """An exhibit has to say where and when it was taken."""
    plain = frame(120, 160, value=90)
    marked = evidence.stamp_frame(plain, "CH1", bbox=(10, 10, 30, 30))
    assert marked.shape == plain.shape
    assert not np.array_equal(marked, plain)       # caption and box drawn
    assert np.array_equal(plain, frame(120, 160, value=90)), "must not alter the original"


def test_still_leaves_no_temp_file(tmp_path):
    evidence.save_still(tmp_path, frame(), "CH1", 1)
    assert not list(evidence.evidence_root(tmp_path).rglob("*.tmp"))


def test_still_never_raises_on_a_bad_frame(tmp_path):
    assert evidence.save_still(tmp_path, None, "CH1", 1) is None
    assert evidence.save_still(tmp_path, np.zeros((0, 0, 3), dtype=np.uint8), "CH1", 1) is None


# ---- clips --------------------------------------------------------------

def test_clip_is_written_from_buffered_frames(tmp_path):
    import cv2
    jpegs = [cv2.imencode(".jpg", frame())[1].tobytes() for _ in range(9)]
    rel = evidence.write_clip(tmp_path, jpegs, "CH1", 7)
    # WebP, not MP4: OpenCV here can only encode MPEG-4 Part 2, which Chrome
    # refuses to decode, so the clips played as a blank rectangle.
    assert rel is not None and rel.endswith(".webp")
    path = evidence.resolve(tmp_path, rel)
    assert path is not None and path.stat().st_size > 0


def test_no_clip_from_nothing(tmp_path):
    assert evidence.write_clip(tmp_path, [], "CH1", 7) is None


def test_clip_is_animated_and_browser_readable(tmp_path):
    """Several frames, in a format an <img> can render."""
    import cv2
    from PIL import Image
    jpegs = [cv2.imencode(".jpg", frame(value=40 + i * 20))[1].tobytes() for i in range(5)]
    rel = evidence.write_clip(tmp_path, jpegs, "CH1", 9)
    with Image.open(evidence.resolve(tmp_path, rel)) as img:
        assert img.format == "WEBP"
        assert getattr(img, "n_frames", 1) == 5


def test_clip_leaves_no_temp_file(tmp_path):
    import cv2
    jpegs = [cv2.imencode(".jpg", frame())[1].tobytes() for _ in range(3)]
    evidence.write_clip(tmp_path, jpegs, "CH1", 11)
    assert not list(evidence.evidence_root(tmp_path).rglob("*.tmp"))


# ---- paths --------------------------------------------------------------

def test_paths_are_dated_and_safe():
    rel = evidence.relative_path("../../etc", 1, ".jpg", when=1790000000.0)
    assert ".." not in rel.split("/")[1]
    assert rel.endswith("_1.jpg")


def test_resolve_refuses_anything_outside_the_root(tmp_path):
    secret = tmp_path / "secret.txt"
    secret.write_text("x")
    evidence.evidence_root(tmp_path).mkdir(parents=True, exist_ok=True)
    assert evidence.resolve(tmp_path, "../secret.txt") is None
    assert evidence.resolve(tmp_path, "nope.jpg") is None


# ---- choosing the moment ------------------------------------------------

def test_a_bigger_face_always_beats_a_sharper_one():
    """Size carries more of what matters; sharpness only breaks ties."""
    assert evidence.frame_score(40, 10) > evidence.frame_score(39, 9999)


def test_sharpness_decides_between_equal_sizes():
    assert evidence.frame_score(40, 900) > evidence.frame_score(40, 100)
