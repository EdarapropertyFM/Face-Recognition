"""The gate used when watching a camera, as opposed to enrolling someone.

Applying the enrolment gate to monitoring threw away every real visitor:
654 faces in one session, all rejected, nothing in Alerts. CCTV faces are
small, side-on and motion-blurred by nature, while enrolment demands a
large, sharp, near-frontal face because a bad template defines someone's
identity permanently.
"""
from types import SimpleNamespace

from api.monitor import MonitorWorker
from facerec.config import MonitoringConfig


def worker(gate=None):
    """A bare MonitorWorker: only the gate and state are needed here."""
    instance = object.__new__(MonitorWorker)
    instance.state = SimpleNamespace(config=SimpleNamespace(monitoring=gate or MonitoringConfig()))
    return instance


def track(width=80, blur=42.0, yaw=70.0, pitch=-13.0, det=0.9):
    quality = SimpleNamespace(face_width_px=width, blur_score=blur,
                              yaw_deg=yaw, pitch_deg=pitch, passed=False, reasons=[])
    return SimpleNamespace(samples=[],
                           last_face=SimpleNamespace(quality=quality, det_score=det))


def test_a_real_cctv_face_is_now_recorded():
    """The exact face the old gate rejected: 80px, 70 deg yaw, blur 42."""
    assert worker()._quality_ok(track()) is True


def test_a_small_real_face_is_recorded():
    """Measured at the door: a genuine frontal face only 20px across.

    Size alone cannot reject junk here, because the wall false positive was
    LARGER (27px) than this real person.
    """
    assert worker()._quality_ok(track(width=20, yaw=5.1, blur=17145.0, det=0.88)) is True


def test_the_detector_false_positive_is_rejected_on_confidence():
    """A wall scrapes past the detector floor; a face scores far higher."""
    assert worker()._quality_ok(track(width=27, yaw=90.0, blur=1697.0, det=0.55)) is False


def test_each_limit_is_enforced():
    assert worker()._quality_ok(track(width=17)) is False       # under 18px
    assert worker()._quality_ok(track(det=0.59)) is False       # under 0.60
    assert worker()._quality_ok(track(blur=14.0)) is False      # under 15
    assert worker()._quality_ok(track(yaw=81.0)) is False       # over 80 deg
    assert worker()._quality_ok(track(pitch=-61.0)) is False    # over 60 deg


def test_limits_are_inclusive_at_the_boundary():
    assert worker()._quality_ok(track(width=18, blur=15.0, yaw=80.0, pitch=60.0, det=0.60)) is True


def test_a_turn_either_way_counts_the_same():
    assert worker()._quality_ok(track(yaw=-70.0)) is True
    assert worker()._quality_ok(track(yaw=-81.0)) is False


def test_a_track_with_no_face_is_rejected():
    assert worker()._quality_ok(SimpleNamespace(samples=[], last_face=None)) is False
    assert worker()._quality_ok(None) is False


def test_the_gate_is_configurable():
    strict = MonitoringConfig(min_face_size_px=100, blur_threshold=15.0,
                              max_yaw_deg=80.0, max_pitch_deg=60.0, min_det_score=0.6)
    assert worker(strict)._quality_ok(track(width=80)) is False
