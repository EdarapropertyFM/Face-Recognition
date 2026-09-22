import numpy as np

from facerec.config import Config
from facerec.engine import DetectedFace
from facerec.gallery import Match
from facerec.quality import QualityReport
from facerec.tracker import IoUTracker, iou
from tests.conftest import unit


def face(bbox, blur=100.0, passed=True, seed=0) -> DetectedFace:
    q = QualityReport(face_width_px=bbox[2] - bbox[0], blur_score=blur, yaw_deg=0.0,
                      pitch_deg=0.0, passed=passed, reasons=[] if passed else ["x"])
    return DetectedFace(bbox=bbox, det_score=0.9, landmarks=np.zeros((5, 2), np.float32),
                        embedding=unit(seed), quality=q)


def cfg(**video) -> Config:
    c = Config()
    for k, v in video.items():
        setattr(c.video, k, v)
    return c


def test_iou_basic():
    assert iou((0, 0, 10, 10), (0, 0, 10, 10)) == 1.0
    assert iou((0, 0, 10, 10), (20, 20, 30, 30)) == 0.0
    assert abs(iou((0, 0, 10, 10), (5, 0, 15, 10)) - 1 / 3) < 1e-9


def test_track_ids_are_stable_across_frames():
    t = IoUTracker(cfg())
    (tr1, _), = t.update([face((100, 100, 200, 200))])
    (tr2, _), = t.update([face((105, 102, 205, 203))])   # moved slightly
    assert tr1.track_id == tr2.track_id == 1
    assert tr2.hits == 2


def test_new_face_gets_new_id_and_two_faces_keep_separate_ids():
    t = IoUTracker(cfg())
    t.update([face((0, 0, 100, 100))])
    pairs = t.update([face((0, 0, 100, 100)), face((500, 500, 600, 600))])
    ids = sorted(tr.track_id for tr, _ in pairs)
    assert ids == [1, 2]
    # Swap order of detections: ids must follow the boxes, not the list order.
    pairs = t.update([face((500, 500, 600, 600)), face((0, 0, 100, 100))])
    by_box = {tr.bbox: tr.track_id for tr, _ in pairs}
    assert by_box[(0, 0, 100, 100)] == 1 and by_box[(500, 500, 600, 600)] == 2


def test_track_retires_after_max_age():
    t = IoUTracker(cfg(track_max_age_frames=2))
    t.update([face((0, 0, 100, 100))])
    t.update([]); t.update([])
    assert len(t.tracks) == 1            # age == 2, still kept
    t.update([])
    assert t.tracks == []                # age 3 > 2, retired
    (tr, _), = t.update([face((0, 0, 100, 100))])
    assert tr.track_id == 2              # a fresh id, not a resurrected one


def test_keep_best_n_prefers_passing_then_sharper():
    t = IoUTracker(cfg(track_keep_best_n=2))
    (tr, f), = t.update([face((0, 0, 100, 100))])
    tr.add_sample(face((0, 0, 100, 100), blur=50, passed=True), [], 2)
    tr.add_sample(face((0, 0, 100, 100), blur=500, passed=False), [], 2)
    tr.add_sample(face((0, 0, 100, 100), blur=90, passed=True), [], 2)
    keys = [s.quality_key for s in tr.samples]
    assert keys == [(True, 90), (True, 50)]      # failing crop dropped despite high blur


def test_best_matches_uses_highest_similarity_sample():
    t = IoUTracker(cfg(track_keep_best_n=3))
    (tr, _), = t.update([face((0, 0, 100, 100))])
    tr.add_sample(face((0, 0, 100, 100), blur=100), [Match("a", "A", 0.31)], 3)
    tr.add_sample(face((0, 0, 100, 100), blur=200), [Match("a", "A", 0.58)], 3)
    tr.add_sample(face((0, 0, 100, 100), blur=300), [Match("b", "B", 0.20)], 3)
    assert tr.best_matches()[0].similarity == 0.58
    assert tr.best_matches()[0].person_id == "a"


def test_best_matches_empty_when_gallery_empty():
    t = IoUTracker(cfg())
    (tr, _), = t.update([face((0, 0, 100, 100))])
    tr.add_sample(face((0, 0, 100, 100)), [], 5)
    assert tr.best_matches() == []
