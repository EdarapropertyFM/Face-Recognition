"""Saved sighting images.

A detection row on its own tells an operator that somebody was seen, not who.
Each reported detection keeps the face it was recognised from.
"""
import numpy as np
import pytest

from api import snapshots


@pytest.fixture
def frame():
    return np.full((480, 640, 3), 127, dtype=np.uint8)


def test_crop_includes_margin_around_the_face(frame):
    crop = snapshots.crop_with_margin(frame, (300, 200, 400, 300), margin=0.5)
    # 100px box + 50px padding each side.
    assert crop.shape[0] == 200 and crop.shape[1] == 200


def test_crop_is_clamped_to_the_frame(frame):
    """A face at the edge must not produce a negative or oversized slice."""
    crop = snapshots.crop_with_margin(frame, (0, 0, 100, 100), margin=1.0)
    assert crop.shape[0] > 0 and crop.shape[1] > 0
    assert crop.shape[0] <= 480 and crop.shape[1] <= 640


def test_tiny_faces_are_not_saved(frame):
    """Upscaling a 10px face would invent detail that is not there."""
    assert snapshots.crop_with_margin(frame, (10, 10, 20, 20)) is None


def test_rejects_a_nonsense_box(frame):
    assert snapshots.crop_with_margin(frame, (100, 100, 50, 50)) is None
    assert snapshots.crop_with_margin(frame, ("a", "b", "c", "d")) is None
    assert snapshots.crop_with_margin(np.zeros((0, 0, 3), dtype=np.uint8), (0, 0, 9, 9)) is None


def test_path_is_dated_sortable_and_safe():
    path = snapshots.relative_path("CH1-CH1", 7, when=1790000000.0)
    assert path.endswith("_7.jpg")
    assert path.count("/") == 1                     # <date>/<file>
    # A camera id is operator-supplied; it must not escape the directory.
    nasty = snapshots.relative_path("../../etc", 1, when=1790000000.0)
    assert ".." not in nasty.split("/")[1]


def test_save_then_resolve_round_trip(tmp_path, frame):
    rel = snapshots.save(tmp_path, frame, (300, 200, 400, 300), "CH1-CH1", 7)
    assert rel is not None
    found = snapshots.resolve(tmp_path, rel)
    assert found is not None and found.is_file()
    assert found.read_bytes()[:2] == b"\xff\xd8"    # a real JPEG


def test_save_leaves_no_temp_file_behind(tmp_path, frame):
    snapshots.save(tmp_path, frame, (300, 200, 400, 300), "CH1-CH1", 7)
    assert not list(snapshots.snapshot_root(tmp_path).rglob("*.tmp"))


def test_resolve_refuses_paths_outside_the_snapshot_root(tmp_path, frame):
    """The path comes from a URL, so it is untrusted input."""
    secret = tmp_path / "secret.txt"
    secret.write_text("password")
    snapshots.snapshot_root(tmp_path).mkdir(parents=True, exist_ok=True)
    assert snapshots.resolve(tmp_path, "../secret.txt") is None
    assert snapshots.resolve(tmp_path, "../../etc/passwd") is None
    assert snapshots.resolve(tmp_path, "nope/missing.jpg") is None


def test_save_never_raises_on_an_unwritable_location(frame, tmp_path):
    """A failed snapshot must not cost the detection it belongs to."""
    blocked = tmp_path / "file-not-a-dir"
    blocked.write_text("x")
    assert snapshots.save(blocked, frame, (300, 200, 400, 300), "CH1", 1) is None
