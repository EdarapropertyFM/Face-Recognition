"""When a continuously-watched face is worth reporting.

Recognition on a live camera produces a verdict several times a second for
every face in shot. Writing all of that down would be useless: one person
standing at a gate for a minute is one event to an operator, not six hundred
rows and six hundred alerts.

So a track is reported when something actually changes:

* the first time it is identified at all,
* when the verdict changes (a stranger turns out to be a resident, or the
  match moves to a different person),
* and then only as a periodic reminder while they remain in shot.

Kept separate from the camera plumbing because this is the part with rules
worth testing.
"""
from __future__ import annotations

from dataclasses import dataclass, field

# A face that stays in shot is re-reported this often, so a long loiter leaves
# a trail rather than a single row at the start.
REPEAT_AFTER_S = 60.0

# A track has to be seen this many times before a verdict is trusted. A face
# entering the frame is often misjudged on the first frame or two, and
# reporting that produces a stranger alert that corrects itself a moment later.
MIN_SIGHTINGS = 3


@dataclass
class TrackState:
    sightings: int = 0
    reported_person: str | None = None
    reported_decision: str | None = None
    last_reported_t: float = 0.0
    ever_reported: bool = False


@dataclass
class ReportPolicy:
    """Decides which track verdicts become detections. One per camera."""

    repeat_after_s: float = REPEAT_AFTER_S
    min_sightings: int = MIN_SIGHTINGS
    _tracks: dict[int, TrackState] = field(default_factory=dict)

    def should_report(
        self,
        track_id: int,
        decision: str,
        person_id: str | None,
        now: float,
    ) -> bool:
        """True when this verdict is worth writing down."""
        state = self._tracks.get(track_id)
        if state is None:
            state = self._tracks[track_id] = TrackState()
        state.sightings += 1

        # Too new to trust.
        if state.sightings < self.min_sightings:
            return False

        # A tentative match is neither a confident identification nor a clear
        # stranger; reporting it would fill the log with maybes.
        if decision == "tentative":
            return False

        changed = (person_id != state.reported_person
                   or decision != state.reported_decision)
        due = now - state.last_reported_t >= self.repeat_after_s

        if state.ever_reported and not changed and not due:
            return False

        state.reported_person = person_id
        state.reported_decision = decision
        state.last_reported_t = now
        state.ever_reported = True
        return True

    def forget(self, live_track_ids: set[int]) -> None:
        """Drop tracks that have left the frame, so ids can be reused."""
        for track_id in [t for t in self._tracks if t not in live_track_ids]:
            del self._tracks[track_id]

    @property
    def tracked(self) -> int:
        return len(self._tracks)


def detection_type(decision: str, watchlisted: bool = False) -> str:
    """The category the dashboard colours by."""
    if watchlisted:
        return "watch"
    return "known" if decision == "confirmed" else "unknown"
