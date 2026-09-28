"""Give one unrecognised person one identity.

A stranger has no gallery entry, so something has to stand in for their name.
That used to be the tracker's track id -- but a track ends every time the
tracker loses the face for a moment: you turn your head, walk behind
something, leave and come back. One person walking around a lobby produced
sixty-three "different strangers", which makes Track & Trace useless for the
thing it exists to do.

A face is a much better key than a track. Unknown embeddings are kept for a
while and compared against each other, so the same person walking past three
times is one stranger with three sightings.

The gallery's own threshold is deliberately not reused. Deciding "this is
Ahmed" and deciding "this is the same unidentified person as a minute ago"
carry very different costs: the first can let someone into a building, the
second only groups rows together. Being a little more willing to group is
the right trade here, and the consequence of being wrong is two stranger
records that should have been one -- which is what we have today anyway.
"""
from __future__ import annotations

import threading
import time

import numpy as np

# Cosine similarity above which two unknown faces are treated as one person.
# Lower than the gallery's identification threshold, on purpose (see above).
SAME_STRANGER = 0.32

# Strangers are forgotten after this long without a sighting, so ids do not
# accumulate forever and a new day starts fresh.
FORGET_AFTER_S = 12 * 3600


class StrangerRegistry:
    """Stable ids for unidentified faces, grouped by how they look."""

    def __init__(self, threshold: float = SAME_STRANGER,
                 forget_after_s: float = FORGET_AFTER_S) -> None:
        self.threshold = threshold
        self.forget_after_s = forget_after_s
        self._vectors: list[np.ndarray] = []
        self._keys: list[str] = []
        self._seen: list[float] = []
        self._counter = 0
        self._lock = threading.Lock()

    def key_for(self, embedding, now: float | None = None) -> str:
        """The id for this face: an existing stranger, or a new one."""
        now = time.time() if now is None else now
        vector = np.asarray(embedding, dtype=np.float32).ravel()
        norm = float(np.linalg.norm(vector))
        if norm == 0:
            return self._new_key(None, now)
        vector = vector / norm                      # cosine needs unit length

        with self._lock:
            self._forget(now)
            if self._vectors:
                similarities = np.asarray(self._vectors) @ vector
                best = int(np.argmax(similarities))
                if float(similarities[best]) >= self.threshold:
                    self._seen[best] = now
                    # Move towards the new sighting so the reference tracks
                    # a person across lighting and angle rather than being
                    # stuck on whatever the first frame happened to look like.
                    blended = self._vectors[best] * 0.9 + vector * 0.1
                    self._vectors[best] = blended / float(np.linalg.norm(blended))
                    return self._keys[best]
            return self._new_key(vector, now, locked=True)

    def _new_key(self, vector, now: float, locked: bool = False) -> str:
        def create() -> str:
            self._counter += 1
            key = f"{time.strftime('%Y%m%d', time.gmtime(now))}-{self._counter:04d}"
            if vector is not None:
                self._vectors.append(vector)
                self._keys.append(key)
                self._seen.append(now)
            return key

        if locked:
            return create()
        with self._lock:
            return create()

    def _forget(self, now: float) -> None:
        keep = [i for i, seen in enumerate(self._seen) if now - seen <= self.forget_after_s]
        if len(keep) == len(self._seen):
            return
        self._vectors = [self._vectors[i] for i in keep]
        self._keys = [self._keys[i] for i in keep]
        self._seen = [self._seen[i] for i in keep]

    @property
    def known_strangers(self) -> int:
        with self._lock:
            return len(self._keys)
