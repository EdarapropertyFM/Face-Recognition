"""Only faces good enough to be worth recording become detections.

The engine attaches a quality report and leaves filtering to the caller. The
live view wants everything drawn; an unattended monitor does not. Without
this gate a patch of wall that scraped past the detector score was recorded
as a stranger, with a meaningless embedding (5-12% similarity), a saved
"face" photo of a door, and an alert behind it.
"""
from types import SimpleNamespace

from api.monitor import MonitorWorker


def track_with_sample(passed: bool, blur: float = 120.0):
    sample = SimpleNamespace(quality_key=(passed, blur))
    return SimpleNamespace(samples=[sample], last_face=None)


def track_with_only_last_face(passed: bool):
    quality = SimpleNamespace(passed=passed)
    return SimpleNamespace(samples=[], last_face=SimpleNamespace(quality=quality))


def test_a_good_face_is_accepted():
    assert MonitorWorker._quality_ok_strict(track_with_sample(True)) is True


def test_a_face_that_failed_the_gate_is_rejected():
    # Too small, too blurred, or turned too far away to identify.
    assert MonitorWorker._quality_ok_strict(track_with_sample(False)) is False


def test_falls_back_to_the_last_face_when_no_samples_kept():
    assert MonitorWorker._quality_ok_strict(track_with_only_last_face(True)) is True
    assert MonitorWorker._quality_ok_strict(track_with_only_last_face(False)) is False


def test_a_track_with_nothing_usable_is_rejected():
    """A missing track must not be treated as a good face."""
    assert MonitorWorker._quality_ok_strict(None) is False
    assert MonitorWorker._quality_ok_strict(SimpleNamespace(samples=[], last_face=None)) is False


def test_the_best_sample_decides():
    """Samples are sorted best-first, passing outranking failing."""
    good = SimpleNamespace(quality_key=(True, 200.0))
    bad = SimpleNamespace(quality_key=(False, 10.0))
    assert MonitorWorker._quality_ok_strict(SimpleNamespace(samples=[good, bad])) is True
    assert MonitorWorker._quality_ok_strict(SimpleNamespace(samples=[bad], last_face=None)) is False
