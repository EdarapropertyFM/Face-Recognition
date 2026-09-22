# Face Recognition Prototype

Laptop prototype: enrol a face from a webcam, then recognise it in a live feed.
Authoritative spec: [face-recognition-prototype-build-spec.md](face-recognition-prototype-build-spec.md).

**There is no model training in this project.** A frozen pretrained model
(insightface `buffalo_l`: SCRFD detector + `w600k_r50` ArcFace) turns each
aligned face into a 512-D unit vector; recognition is nearest-neighbour cosine
search with NumPy. Adding a person is a database insert.

## Status

- [x] Phase 1: scaffold, `config.yaml`, deps, model auto-download verified
- [x] Phase 2: `FaceEngine` (detect -> align -> embed) + `QualityReport`
- [x] Phase 3: gallery storage + cosine search + matcher
- [x] Phase 4: webcam enrolment with pairwise self-check
- [x] Phase 5: live demo with IoU tracking
- [x] Phase 6: FastAPI + Postman collection
- [ ] Phase 7: threshold calibration + evaluation report

## Setup (Windows, Python 3.11)

```powershell
py -3.11 -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
```

`buffalo_l` (~280 MB) downloads automatically to `data/models/` on first run.

## Phase 2 check

```powershell
.venv\Scripts\python -m scripts.check_image path\to\photo.jpg
```

Prints, per face: bbox, detection score, quality report with failure reasons,
first 8 embedding values, and the embedding's L2 norm (must be `1.000000`).

## Enrol and run the live demo

```powershell
.venv\Scripts\python -m scripts.enroll_webcam --name "Your Name" --role resident
.venv\Scripts\python -m scripts.enroll_webcam --list
.venv\Scripts\python -m scripts.live_demo                 # --source 1 or --source rtsp://...
```

## API

```powershell
.venv\Scripts\uvicorn api.main:app --host 127.0.0.1 --port 8000
```

Interactive docs at http://127.0.0.1:8000/docs. Import
`postman/face-rec.postman_collection.json` and set its `repo_dir` variable to
click through health -> create -> enroll -> recognize -> delete.

**Security: there is no authentication, no TLS and no rate limiting.** The
server must bind to `127.0.0.1` only and must never be exposed on a network
or put behind a port-forward. Anyone who can reach it can enrol, delete and
query biometric data.

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | model_version, gallery size, thresholds |
| GET | `/persons` | |
| POST | `/persons` | `{name, role}` -> `{person_id}` |
| DELETE | `/persons/{id}` | removes templates, vectors and enrolment images; a running live demo picks it up on its next pass |
| POST | `/persons/{id}/enroll` | multipart `files[]` (1..10); returns rejected files with reasons and pairwise similarity |
| POST | `/recognize` | multipart `file`; returns **all** faces with decision, similarity, runner-up gap, quality |
| POST | `/recognize/base64` | `{image_b64}`; same shape |
| GET | `/live` | browser page with the annotated live feed (`?source=` webcam index or RTSP URL) |
| GET | `/stream` | the MJPEG stream behind `/live`; same loop as `scripts/live_demo.py` |
| GET | `/enroll/{id}` | browser page: enrol this person from the camera (start / capture / undo / finish) |
| POST | `/persons/{id}/enroll/webcam/start` | open the camera for a capture session (`?source=`, `?auto_capture=`, `?images=`) |
| GET | `/persons/{id}/enroll/webcam/stream` | MJPEG preview with quality guidance |
| GET | `/persons/{id}/enroll/webcam/status` | captured count, current hint, running self-check |
| POST | `/persons/{id}/enroll/webcam/capture` | capture the next frame that passes quality |
| POST | `/persons/{id}/enroll/webcam/undo` | drop the last capture |
| POST | `/persons/{id}/enroll/webcam/finish` | self-check, then save to the gallery; 409 if min pairwise < 0.5 unless `?force=true` |
| DELETE | `/persons/{id}/enroll/webcam` | cancel without saving |

**Enrol someone from the browser:** `POST /persons` to get an id, then open
`http://127.0.0.1:8000/enroll/<person_id>` and click *Start camera*.

## Connecting a DVR / NVR

DVRs expose each camera channel as an RTSP stream, authenticated with the
DVR's username/password. Configure it once, then use `dvr:<channel>` as a
source anywhere (`/live?source=dvr:3`, `/enroll/<id>?source=dvr:3`,
`scripts.live_demo --source dvr:3`). Credentials stay in `data/dvr.json`
(git-ignored, plain text) and never appear in URLs, pages or logs.

Browser: open **http://127.0.0.1:8000/dvr/setup**, enter IP, user, password,
brand and channel count, click *Save & connect*; it tests every channel and
shows a snapshot with links to the live view.

Terminal:

```powershell
.venv\Scripts\python -m scripts.dvr_setup --host 192.168.1.108 --user admin --password "..." --brand hikvision --channels 8
.venv\Scripts\python -m scripts.dvr_setup --test
.venv\Scripts\python -m scripts.live_demo --source dvr:3
```

| Method | Path | Notes |
|---|---|---|
| GET / POST / DELETE | `/dvr` | show (password masked) / set / forget the DVR |
| GET | `/dvr/brands` | known RTSP URL patterns: hikvision, dahua, uniview, xmeye, or `custom` with your own template |
| GET | `/dvr/channels` | probe channels: resolution, fps, error per channel (`?detect=true` also counts faces) |
| GET | `/dvr/channels/{ch}/snapshot.jpg` | one frame (`?annotate=true` draws recognition results) |

Notes:
- Use the **sub** stream for recognition (default). It is usually 640-704 px
  wide, which is plenty for faces near the camera and 3-4x cheaper to
  decode than the main stream. Switch to `main` per source with `dvr:3:main`.
- Streams use RTSP over TCP with 5 s connect/read timeouts. An unreachable
  DVR fails fast with a reason instead of hanging.
- If nothing responds: ping the IP, confirm RTSP is enabled on the DVR
  (port 554), check the credentials are the DVR's RTSP/ONVIF user, and try
  another brand pattern. Some DVRs number channels from 0 or use
  `Streaming/Channels/1` without the `01/02` suffix: use `custom`.
- Ceiling-corner overview cameras give poor face geometry (spec §11). Test
  with `?annotate=true` snapshots before promising accuracy on a channel.

Every JSON response carries `model_version`. The live stream opens the
camera on the first viewer and releases it a few seconds after the last one
leaves, so it does not hold the webcam while nobody is watching.

## Tests

```powershell
.venv\Scripts\python -m pytest tests -q
```

`tests/test_api.py` exercises the real model against sample photos at
`scripts/1.jpeg`, `2.jpeg`, `3.jpeg` (two of one person, one of another).
Those are **not in the repo** — face images are never committed (§9) — so
those tests skip on a fresh clone. Drop in your own three photos to run them.

## Data handling

`data/` is git-ignored in full and must stay that way: it holds face images,
embeddings and the gallery DB. Embeddings are biometric data, not anonymous.
Record every enrolled person in `data/CONSENT.md`.

## Licensing

InsightFace model packs are for non-commercial research use. Fine for this
internal prototype; not fine to ship. See spec §1.1.
