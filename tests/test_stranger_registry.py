"""One unrecognised person should be one stranger, not one per track.

The stranger id used to come from the tracker's track id, which ends every
time the face is lost for a moment. One person walking around produced
sixty-three separate "strangers" in a single session.
"""
import numpy as np
import pytest

from api.stranger_registry import StrangerRegistry


def face(seed: int, drift: float = 0.0) -> np.ndarray:
    """A deterministic unit vector, optionally nudged to imitate a new angle."""
    rng = np.random.default_rng(seed)
    vector = rng.normal(size=512).astype(np.float32)
    if drift:
        vector = vector + rng.normal(size=512).astype(np.float32) * drift
    return vector / np.linalg.norm(vector)


def test_the_same_face_keeps_one_id():
    registry = StrangerRegistry()
    me = face(1)
    first = registry.key_for(me)
    for _ in range(20):
        assert registry.key_for(me) == first
    assert registry.known_strangers == 1


def test_the_same_person_from_a_slightly_different_angle_is_still_them():
    """Losing the track and re-acquiring must not invent a new person."""
    registry = StrangerRegistry()
    first = registry.key_for(face(2))
    again = registry.key_for(face(2, drift=0.25))
    assert again == first
    assert registry.known_strangers == 1


def test_two_different_people_get_different_ids():
    registry = StrangerRegistry()
    a = registry.key_for(face(3))
    b = registry.key_for(face(999))
    assert a != b
    assert registry.known_strangers == 2


def test_one_person_many_visits_is_one_stranger_with_many_sightings():
    """The exact case that produced 63 rows for one visitor."""
    registry = StrangerRegistry()
    me, other = face(4), face(1234)
    keys = [registry.key_for(me) for _ in range(30)]
    keys.append(registry.key_for(other))
    assert len(set(keys)) == 2, "one visitor plus one other person"


def test_strangers_are_forgotten_after_the_window():
    registry = StrangerRegistry(forget_after_s=60)
    me = face(5)
    first = registry.key_for(me, now=1000.0)
    same = registry.key_for(me, now=1030.0)
    assert same == first
    later = registry.key_for(me, now=1000.0 + 5000)
    assert later != first, "a new day should start fresh"


def test_ids_are_dated_and_unique():
    registry = StrangerRegistry()
    a = registry.key_for(face(6), now=1790000000.0)
    b = registry.key_for(face(7777), now=1790000000.0)
    assert a.startswith("2026") and b.startswith("2026")
    assert a != b


def test_a_zero_vector_never_groups_with_anyone():
    """A failed embedding must not become a bucket everything falls into."""
    registry = StrangerRegistry()
    first = registry.key_for(np.zeros(512, dtype=np.float32))
    second = registry.key_for(np.zeros(512, dtype=np.float32))
    assert first != second
    assert registry.known_strangers == 0


def test_unnormalised_input_is_handled():
    registry = StrangerRegistry()
    me = face(8)
    assert registry.key_for(me * 7.5) == registry.key_for(me)


@pytest.mark.parametrize("threshold", [0.2, 0.32, 0.5])
def test_threshold_is_configurable(threshold):
    registry = StrangerRegistry(threshold=threshold)
    me = face(9)
    assert registry.key_for(me) == registry.key_for(me)
