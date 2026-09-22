"""Decision logic on top of gallery search results (spec §4.4).

Pure function of (matches, thresholds). Every Result carries the numbers
that produced it so an 'unknown' on screen is always debuggable.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from .config import MatchingConfig
from .gallery import Match


# Tolerance for the >= comparisons so 0.50 - 0.45 (== 0.04999...) still
# counts as meeting a 0.05 margin. Purely a float artefact guard.
EPS = 1e-9


class Decision(str, Enum):
    CONFIRMED = "confirmed"
    TENTATIVE = "tentative"
    UNKNOWN = "unknown"


@dataclass
class Result:
    decision: Decision
    person_id: str | None
    name: str | None
    similarity: float            # best score; 0.0 when the gallery is empty
    runner_up_gap: float | None  # best - next different person; None if no runner-up
    runner_up_name: str | None
    reason: str                  # human-readable explanation of the decision


def decide(matches: list[Match], cfg: MatchingConfig) -> Result:
    """matches must already be collapsed to best-per-person (Gallery.search
    does this), so matches[1], if present, is a different person."""
    hi, lo, margin = cfg.threshold_high, cfg.threshold_low, cfg.runner_up_margin

    if not matches:
        return Result(Decision.UNKNOWN, None, None, 0.0, None, None,
                      "gallery is empty; nothing to match against")

    best = matches[0]
    runner_up = next((m for m in matches[1:] if m.person_id != best.person_id), None)
    gap = (best.similarity - runner_up.similarity) if runner_up else None
    ru_name = runner_up.name if runner_up else None

    if best.similarity >= hi:
        if runner_up is None:
            return Result(Decision.CONFIRMED, best.person_id, best.name,
                          best.similarity, None, None,
                          f"similarity {best.similarity:.3f} >= high {hi:.2f}; "
                          f"no other enrolled person to compare against")
        if gap + EPS >= margin:
            return Result(Decision.CONFIRMED, best.person_id, best.name,
                          best.similarity, gap, ru_name,
                          f"similarity {best.similarity:.3f} >= high {hi:.2f} and "
                          f"beats runner-up '{ru_name}' ({runner_up.similarity:.3f}) "
                          f"by {gap:.3f} >= margin {margin:.2f}")
        # Above high, but ambiguous between two people. Do NOT confirm.
        return Result(Decision.TENTATIVE, best.person_id, best.name,
                      best.similarity, gap, ru_name,
                      f"similarity {best.similarity:.3f} >= high {hi:.2f} but "
                      f"runner-up '{ru_name}' ({runner_up.similarity:.3f}) is only "
                      f"{gap:.3f} behind, < margin {margin:.2f}; ambiguous")

    if best.similarity >= lo:
        return Result(Decision.TENTATIVE, best.person_id, best.name,
                      best.similarity, gap, ru_name,
                      f"similarity {best.similarity:.3f} in [low {lo:.2f}, high {hi:.2f})")

    return Result(Decision.UNKNOWN, None, None, best.similarity, gap, ru_name,
                  f"best similarity {best.similarity:.3f} ('{best.name}') "
                  f"< low {lo:.2f}")
