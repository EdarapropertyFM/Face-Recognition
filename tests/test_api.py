"""End-to-end API test against the real model, using the photos in scripts/.

Skipped if the sample photos are absent. Uses a temporary gallery so data/
is never touched; the model itself loads from data/models as usual.
"""
import base64
import uuid
from pathlib import Path

import psycopg
import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
ME_1, ME_2, FRIEND = (ROOT / "scripts" / f"{i}.jpeg" for i in (1, 2, 3))

pytestmark = pytest.mark.skipif(
    not (ME_1.exists() and ME_2.exists() and FRIEND.exists()),
    reason="sample photos scripts/1.jpeg, 2.jpeg, 3.jpeg not present")


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    import api.main as m
    from facerec import load_config
    from facerec.gallery import Gallery

    tmp = tmp_path_factory.mktemp("gallery")
    cfg = load_config()                       # real data/models for the engine
    schema = "test_api_" + uuid.uuid4().hex[:12]

    # Build the real AppState, then swap its gallery for a throwaway one:
    # its own PostgreSQL schema plus its own embeddings file.
    state = m.AppState(cfg)
    state.gallery.close()
    state.gallery = Gallery(cfg, state.engine.model_version,
                            npy_path=tmp / "e.npy", schema=schema)
    cfg.data_dir = tmp / "data"               # after engine load: enrolment images land here
    state.dvr = None                          # ignore any real data/dvr.json on this machine
    m.AppState = lambda config: state
    with TestClient(m.app) as c:
        yield c
    with psycopg.connect(cfg.database.conninfo(), autocommit=True) as conn:
        conn.execute(f"DROP SCHEMA IF EXISTS {schema} CASCADE")


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["model_version"].startswith("buffalo_l/")
    assert body["gallery_size"] == 0
    assert set(body["thresholds"]) == {"high", "low", "runner_up_margin"}


def test_full_flow(client):
    # create
    r = client.post("/persons", json={"name": "Yousef", "role": "resident"})
    assert r.status_code == 201
    pid = r.json()["person_id"]
    assert r.json()["model_version"]

    # recognize before enrol -> UNKNOWN with numbers, not a boolean
    with ME_2.open("rb") as fh:
        r = client.post("/recognize", files={"file": ("2.jpeg", fh, "image/jpeg")})
    assert r.status_code == 200
    face = r.json()["faces"][0]
    assert face["decision"] == "unknown"
    assert "similarity" in face and "runner_up_gap" in face and "quality" in face
    assert "empty" in face["reason"]

    # enrol with one good image, one friend image (accepted: it's just a face),
    # and one garbage file (rejected)
    files = [
        ("files", ("1.jpeg", ME_1.read_bytes(), "image/jpeg")),
        ("files", ("junk.jpg", b"not an image", "image/jpeg")),
    ]
    r = client.post(f"/persons/{pid}/enroll", files=files)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["enrolled"] == 1
    assert body["rejected"][0]["filename"] == "junk.jpg"
    assert body["pairwise_similarity"] == {"min": None, "mean": None}
    assert body["template_count"] == 1

    # enrol a second image of the same person -> pairwise reported
    r = client.post(f"/persons/{pid}/enroll",
                    files=[("files", ("2.jpeg", ME_2.read_bytes(), "image/jpeg"))])
    assert r.json()["template_count"] == 2

    # list
    r = client.get("/persons")
    persons = r.json()["persons"]
    assert persons[0]["person_id"] == pid and persons[0]["template_count"] == 2

    # recognize: me -> confirmed, friend -> unknown; all with full detail
    r = client.post("/recognize/base64",
                    json={"image_b64": base64.b64encode(ME_2.read_bytes()).decode()})
    face = r.json()["faces"][0]
    assert face["decision"] == "confirmed" and face["name"] == "Yousef"
    assert face["similarity"] > 0.6
    assert face["quality"]["passed"] is True
    assert r.json()["model_version"]

    with FRIEND.open("rb") as fh:
        r = client.post("/recognize", files={"file": ("3.jpeg", fh, "image/jpeg")})
    face = r.json()["faces"][0]
    assert face["decision"] == "unknown"
    assert face["similarity"] < 0.3
    assert face["name"] is None

    # delete -> 204, then gone from list and from recognition immediately
    r = client.delete(f"/persons/{pid}")
    assert r.status_code == 204
    assert client.delete(f"/persons/{pid}").status_code == 404
    assert client.get("/persons").json()["persons"] == []
    assert client.get("/health").json()["gallery_size"] == 0
    with ME_2.open("rb") as fh:
        r = client.post("/recognize", files={"file": ("2.jpeg", fh, "image/jpeg")})
    assert r.json()["faces"][0]["decision"] == "unknown"


def test_bad_inputs(client):
    assert client.post("/persons", json={"name": ""}).status_code == 422
    assert client.post("/recognize/base64", json={"image_b64": "@@@"}).status_code == 400
    r = client.post("/recognize", files={"file": ("x.jpg", b"nope", "image/jpeg")})
    assert r.status_code == 400
    assert client.post("/persons/ghost/enroll",
                       files=[("files", ("1.jpeg", ME_1.read_bytes(), "image/jpeg"))]).status_code == 404


def test_dvr_config_endpoints(client):
    assert client.get("/dvr").json()["configured"] is False
    assert client.get("/dvr/channels").status_code == 404
    assert client.get("/live?source=dvr:1").status_code == 200          # page renders...
    assert client.get("/stream?source=dvr:1").status_code == 400        # ...but no DVR configured

    r = client.post("/dvr", json={"host": "192.0.2.10", "username": "admin",
                                  "password": "s3cret", "brand": "hikvision", "channels": 2})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["configured"] and d["host"] == "192.0.2.10"
    assert "s3cret" not in r.text                                       # password never echoed
    assert d["example_url"] == "rtsp://admin:*****@192.0.2.10:554/Streaming/Channels/102"
    assert "hikvision" in client.get("/dvr/brands").json()

    assert client.post("/dvr", json={"host": "h", "username": "u", "password": "p",
                                     "brand": "custom"}).status_code == 400   # no template

    # Probe an unreachable (TEST-NET) host: must fail cleanly, not hang or 500.
    r = client.get("/dvr/channels", params={"first": 1, "last": 1, "timeout": 2})
    assert r.status_code == 200
    ch = r.json()["channels"][0]
    assert ch["ok"] is False and ch["error"] and ch["source"] == "dvr:1"
    assert "s3cret" not in r.text
    assert client.get("/dvr/channels/1/snapshot.jpg").status_code == 503

    assert client.delete("/dvr").status_code == 204
    assert client.get("/dvr").json()["configured"] is False
