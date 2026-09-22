import pytest

from facerec.config import MatchingConfig
from facerec.gallery import Match
from facerec.matcher import Decision, Result, decide

CFG = MatchingConfig(threshold_high=0.40, threshold_low=0.30, runner_up_margin=0.05)


def m(pid: str, sim: float) -> Match:
    return Match(person_id=pid, name=pid.upper(), similarity=sim)


def test_confirmed_clear_winner():
    r = decide([m("a", 0.72), m("b", 0.15)], CFG)
    assert r.decision is Decision.CONFIRMED
    assert r.person_id == "a" and r.name == "A"
    assert r.similarity == pytest.approx(0.72)
    assert r.runner_up_gap == pytest.approx(0.57)
    assert r.runner_up_name == "B"
    assert "0.720" in r.reason and "margin" in r.reason


def test_confirmed_single_person_in_gallery():
    r = decide([m("a", 0.55)], CFG)
    assert r.decision is Decision.CONFIRMED
    assert r.runner_up_gap is None
    assert "no other enrolled person" in r.reason


def test_tentative_between_thresholds():
    r = decide([m("a", 0.35), m("b", 0.10)], CFG)
    assert r.decision is Decision.TENTATIVE
    assert r.person_id == "a"
    assert r.similarity == pytest.approx(0.35)
    assert r.runner_up_gap == pytest.approx(0.25)
    assert "0.350" in r.reason


def test_unknown_below_low():
    r = decide([m("a", 0.21), m("b", 0.19)], CFG)
    assert r.decision is Decision.UNKNOWN
    assert r.person_id is None and r.name is None
    # Numbers are still reported: an 'unknown' must be debuggable.
    assert r.similarity == pytest.approx(0.21)
    assert r.runner_up_gap == pytest.approx(0.02)
    assert "0.210" in r.reason and "A" in r.reason


def test_empty_gallery():
    r = decide([], CFG)
    assert r.decision is Decision.UNKNOWN
    assert r.person_id is None
    assert r.similarity == 0.0
    assert r.runner_up_gap is None
    assert "empty" in r.reason


def test_two_people_above_high_within_margin_is_not_confirmed():
    # Both above threshold_high, but only 0.03 apart (< 0.05 margin).
    r = decide([m("a", 0.62), m("b", 0.59)], CFG)
    assert r.decision is not Decision.CONFIRMED
    assert r.decision is Decision.TENTATIVE
    assert r.person_id == "a"
    assert r.runner_up_gap == pytest.approx(0.03)
    assert r.runner_up_name == "B"
    assert "ambiguous" in r.reason


def test_gap_exactly_at_margin_is_confirmed():
    r = decide([m("a", 0.50), m("b", 0.45)], CFG)
    assert r.decision is Decision.CONFIRMED
    assert r.runner_up_gap == pytest.approx(0.05)


def test_similarity_exactly_at_high_is_confirmed():
    r = decide([m("a", 0.40)], CFG)
    assert r.decision is Decision.CONFIRMED


def test_similarity_exactly_at_low_is_tentative():
    r = decide([m("a", 0.30)], CFG)
    assert r.decision is Decision.TENTATIVE


def test_runner_up_skips_same_person_defensively():
    # Gallery.search collapses per person, but decide() must still be safe
    # if handed uncollapsed input: the runner-up is the first DIFFERENT person.
    r = decide([m("a", 0.70), m("a", 0.68), m("b", 0.20)], CFG)
    assert r.decision is Decision.CONFIRMED
    assert r.runner_up_name == "B"
    assert r.runner_up_gap == pytest.approx(0.50)


def test_result_is_never_a_bare_boolean():
    r = decide([m("a", 0.9)], CFG)
    assert isinstance(r, Result)
    assert isinstance(r.reason, str) and r.reason
