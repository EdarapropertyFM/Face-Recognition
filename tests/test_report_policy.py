"""Reporting rules for continuous, unattended recognition.

Recognition runs several times a second. Without these rules, one person
standing at a gate for a minute becomes hundreds of detection rows and
hundreds of alerts, which is worse than useless to an operator.
"""
from api.report_policy import ReportPolicy, detection_type


def settle(policy: ReportPolicy, track: int, decision="confirmed", person="p1", now=0.0):
    """Get a track past the minimum-sightings guard."""
    for _ in range(policy.min_sightings - 1):
        policy.should_report(track, decision, person, now)


def test_ignores_the_first_frames_of_a_new_track():
    """A face entering the frame is often misjudged for a frame or two."""
    policy = ReportPolicy()
    assert policy.should_report(1, "unknown", None, 0.0) is False
    assert policy.should_report(1, "unknown", None, 0.1) is False
    assert policy.should_report(1, "unknown", None, 0.2) is True


def test_reports_once_then_stays_quiet():
    policy = ReportPolicy()
    settle(policy, 1)
    assert policy.should_report(1, "confirmed", "p1", 0.0) is True
    for tick in range(1, 30):
        assert policy.should_report(1, "confirmed", "p1", tick * 0.5) is False


def test_repeats_while_someone_stays_in_shot():
    """A long loiter should leave a trail, not one row at the start."""
    policy = ReportPolicy(repeat_after_s=60.0)
    settle(policy, 1)
    assert policy.should_report(1, "confirmed", "p1", 0.0) is True
    assert policy.should_report(1, "confirmed", "p1", 59.0) is False
    assert policy.should_report(1, "confirmed", "p1", 60.0) is True


def test_reports_immediately_when_the_verdict_changes():
    """A stranger turning out to be a resident is news, not a repeat."""
    policy = ReportPolicy()
    settle(policy, 1, decision="unknown", person=None)
    assert policy.should_report(1, "unknown", None, 0.0) is True
    assert policy.should_report(1, "confirmed", "p1", 1.0) is True


def test_reports_when_the_match_moves_to_another_person():
    policy = ReportPolicy()
    settle(policy, 1)
    assert policy.should_report(1, "confirmed", "p1", 0.0) is True
    assert policy.should_report(1, "confirmed", "p2", 1.0) is True


def test_never_reports_a_tentative_match():
    """Neither a confident identification nor a clear stranger."""
    policy = ReportPolicy()
    for tick in range(20):
        assert policy.should_report(1, "tentative", "p1", tick) is False


def test_tracks_are_independent():
    policy = ReportPolicy()
    settle(policy, 1)
    settle(policy, 2, person="p2")
    assert policy.should_report(1, "confirmed", "p1", 0.0) is True
    assert policy.should_report(2, "confirmed", "p2", 0.0) is True


def test_forgetting_a_track_lets_a_reused_id_start_clean():
    """Track ids are reused; a new person must not inherit the old state."""
    policy = ReportPolicy()
    settle(policy, 1)
    assert policy.should_report(1, "confirmed", "p1", 0.0) is True
    policy.forget(live_track_ids=set())
    assert policy.tracked == 0
    # The reused id goes through the settling period again.
    assert policy.should_report(1, "confirmed", "p1", 1.0) is False


def test_forget_keeps_tracks_still_in_frame():
    policy = ReportPolicy()
    settle(policy, 1)
    settle(policy, 2, person="p2")
    policy.forget(live_track_ids={1})
    assert policy.tracked == 1


def test_detection_type_mapping():
    assert detection_type("confirmed") == "known"
    assert detection_type("unknown") == "unknown"
    # A watchlisted person is a watch event whatever the match says.
    assert detection_type("confirmed", watchlisted=True) == "watch"
