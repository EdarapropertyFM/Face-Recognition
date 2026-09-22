import numpy as np
import pytest

from facerec.gallery import Gallery
from tests.conftest import near, unit

MV = "buffalo_l/w600k_r50"


def make_gallery(config) -> Gallery:
    return Gallery(config, model_version=MV)


def test_empty_gallery_search_returns_nothing(config):
    g = make_gallery(config)
    assert len(g) == 0
    assert g.search(unit(1)) == []


def test_add_and_search_round_trip(config):
    g = make_gallery(config)
    a = unit(1)
    pid = g.add_person("Alice")
    g.add_templates(pid, a[None, :], [100.0], ["a.jpg"])
    res = g.search(near(a, 99, noise=0.1))
    assert res[0].person_id == pid and res[0].name == "Alice"
    assert res[0].similarity > 0.95


def test_search_collapses_to_best_per_person(config):
    """Runner-up must be a different PERSON, not another photo of the best."""
    g = make_gallery(config)
    a, b = unit(1), unit(2)
    pa = g.add_person("Alice")
    pb = g.add_person("Bob")
    # Alice has 3 templates, all close to the query; Bob has 1 far away.
    g.add_templates(pa, np.stack([a, near(a, 10), near(a, 11)]),
                    [1.0, 1.0, 1.0], ["a1", "a2", "a3"])
    g.add_templates(pb, b[None, :], [1.0], ["b1"])

    q = near(a, 12, noise=0.05)
    res = g.search(q, top_k=5)
    assert [r.person_id for r in res] == [pa, pb]         # one entry per person
    assert len({r.person_id for r in res}) == len(res)
    # The per-person score is the MAX over templates, not an average.
    sims = g.embeddings[:3] @ q
    assert res[0].similarity == pytest.approx(float(sims.max()), abs=1e-6)


def test_top_k_applies_after_collapse(config):
    g = make_gallery(config)
    pids = []
    for i in range(4):
        pid = g.add_person(f"P{i}")
        g.add_templates(pid, np.stack([unit(i), near(unit(i), 50 + i)]),
                        [1.0, 1.0], ["x", "y"])
        pids.append(pid)
    res = g.search(unit(0), top_k=2)
    assert len(res) == 2
    assert res[0].person_id == pids[0]


def test_delete_person_removes_vectors_and_reindexes(config):
    """The critical Phase 3 test: after delete, the deleted person must not
    match, survivors must still match, and DB row_index must line up with
    embeddings.npy row for row."""
    g = make_gallery(config)
    a, b, c = unit(1), unit(2), unit(3)
    pa = g.add_person("Alice")
    pb = g.add_person("Bob")
    pc = g.add_person("Carol")
    g.add_templates(pa, np.stack([a, near(a, 10)]), [1.0, 1.0], ["a1", "a2"])
    g.add_templates(pb, np.stack([b, near(b, 20)]), [1.0, 1.0], ["b1", "b2"])
    g.add_templates(pc, np.stack([c, near(c, 30)]), [1.0, 1.0], ["c1", "c2"])
    assert len(g) == 6

    # Bob sits in the MIDDLE of the matrix (rows 2,3) so the reindex is exercised.
    g.delete_person(pb)

    assert len(g) == 4
    assert g.get_person(pb) is None
    assert g.person_count == 2

    # Bob's own embedding must no longer produce a Bob match, or any strong match.
    res = g.search(b)
    assert all(r.person_id != pb for r in res)
    assert res[0].similarity < 0.3

    # Survivors still match correctly, with the right identity.
    assert g.search(near(a, 11, noise=0.05))[0].person_id == pa
    assert g.search(near(c, 31, noise=0.05))[0].person_id == pc

    # row_index in the DB is contiguous 0..N-1 and each row points at the
    # right person's vector.
    rows = g.conn.execute(
        "SELECT row_index, person_id FROM template ORDER BY row_index").fetchall()
    assert [r["row_index"] for r in rows] == [0, 1, 2, 3]
    for r in rows:
        v = g.embeddings[r["row_index"]]
        expected = a if r["person_id"] == pa else c
        assert float(v @ expected) > 0.9

    # State on disk matches memory: a fresh Gallery reloads identically.
    g.close()
    g2 = Gallery(config, model_version=MV)
    assert len(g2) == 4
    assert np.array_equal(g2.embeddings, g.embeddings)
    assert all(r.person_id != pb for r in g2.search(b))


def test_delete_last_person_leaves_empty_gallery(config):
    g = make_gallery(config)
    pid = g.add_person("Only")
    g.add_templates(pid, unit(1)[None, :], [1.0], ["x"])
    g.delete_person(pid)
    assert len(g) == 0
    assert g.search(unit(1)) == []
    # Can add again afterwards; row_index restarts at 0.
    pid2 = g.add_person("Next")
    g.add_templates(pid2, unit(2)[None, :], [1.0], ["y"])
    assert g.conn.execute("SELECT row_index FROM template").fetchone()[0] == 0


def test_delete_unknown_person_raises(config):
    g = make_gallery(config)
    with pytest.raises(KeyError):
        g.delete_person("nope")


def test_add_templates_rejects_unnormalised(config):
    g = make_gallery(config)
    pid = g.add_person("X")
    with pytest.raises(ValueError, match="L2-normalised"):
        g.add_templates(pid, (unit(1) * 3.0)[None, :], [1.0], ["x"])


def test_add_templates_rejects_unknown_person(config):
    g = make_gallery(config)
    with pytest.raises(KeyError):
        g.add_templates("ghost", unit(1)[None, :], [1.0], ["x"])


def test_model_version_stamped_on_templates(config):
    g = make_gallery(config)
    pid = g.add_person("X")
    g.add_templates(pid, unit(1)[None, :], [1.0], ["x"])
    mv = g.conn.execute("SELECT model_version FROM template").fetchone()[0]
    assert mv == MV
