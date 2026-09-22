# Face Recognition Prototype — Build Specification

**Audience:** Claude Code (implementing agent) + the engineer reviewing its work
**Goal:** A standalone, runnable prototype on a laptop. Enroll a face from a webcam, then open a live camera feed and have the system state, per detected face, whether that person is in the gallery.
**Out of scope for this phase:** RTSP/building cameras, edge deployment, guard alerting UI, multi-tenant backend, production security. Those are in the separate system design document.

---

## 0. Read This First (Instructions for the Implementing Agent)

### 0.1 There is no model training in this project

Do **not** write a training loop. Do **not** fine-tune anything. Do **not** create a classifier with one class per person. If you find yourself importing a training framework, stop — you have misread the task.

Face recognition here is **metric learning with a frozen pretrained model**:

1. A pretrained network converts any aligned face image into a 512-dimensional unit vector (an "embedding").
2. Two images of the same person produce vectors that are close together; different people produce vectors far apart. This property was trained into the model by its authors on millions of identities.
3. **Enrollment** = compute embeddings for a few photos of a person and store them in a database.
4. **Recognition** = compute the embedding of an incoming face, find the nearest stored vector by cosine similarity, and accept only if similarity exceeds a threshold.

Adding a person is a database INSERT. Nothing is retrained, ever.

### 0.2 Build order

Implement in this sequence. Each phase has acceptance criteria; do not start the next phase until the current one passes.

| Phase | Deliverable |
|---|---|
| 1 | Project scaffold, config, dependency install, model download verified |
| 2 | `FaceEngine` — detect, align, embed a still image |
| 3 | Gallery storage + cosine search |
| 4 | Enrollment from webcam (CLI script) |
| 5 | Live recognition demo (OpenCV window) |
| 6 | FastAPI wrapper + Postman collection |
| 7 | Threshold calibration + evaluation report |

### 0.3 Things that will waste days if you get them wrong

- **Alignment is mandatory.** The embedding model is trained on faces warped to a canonical 112×112 using 5 facial landmarks. Feeding it a raw crop produces garbage similarities that look plausible but are meaningless. The library below handles this — do not bypass it.
- **Normalize before comparing.** Use the L2-normalised embedding and cosine similarity (a dot product of unit vectors). Mixing normalised and unnormalised vectors silently breaks matching.
- **Do not invent a threshold.** Use the default in config, and treat Phase 7 as the step that makes it real.
- **Do not add a vector database.** At prototype scale a NumPy matrix multiply is exact and faster than FAISS/Qdrant/pgvector. Adding one is complexity with negative value here.
- **BGR vs RGB.** OpenCV reads BGR. InsightFace expects BGR for its `get()` call. Be deliberate and comment it, because this is the classic silent-wrongness bug in this stack.

---

## 1. Technology Choices

| Concern | Choice | Reason |
|---|---|---|
| Language | Python 3.11 | Ecosystem; 3.12+ occasionally lags onnxruntime wheels |
| Detection + alignment + embedding | `insightface` (`buffalo_l` model pack) | One dependency covering SCRFD detection, 5-point landmarks, alignment, and ArcFace embedding. Avoids three separate integrations |
| Inference runtime | `onnxruntime` (CPU) | No GPU needed for one webcam. Swap to `onnxruntime-gpu` later by changing providers only |
| Video I/O | `opencv-python` | Webcam now, RTSP later, same API |
| Storage | SQLite + NumPy `.npy` | Zero setup. Embeddings in a single matrix loaded to memory |
| API | FastAPI + uvicorn | Postman-testable, auto OpenAPI docs at `/docs` |
| Config | pydantic-settings + `config.yaml` | Thresholds must be editable without code changes |

**`buffalo_l` contains:** SCRFD-10GF detector and the `w600k_r50` ArcFace recognition model (512-D output). This is the right default. Do not substitute without a measured reason.

### 1.1 Licensing — flag for the engineer, not a blocker for the prototype

InsightFace's pretrained model packs are released **for non-commercial research use**. Building and demoing this prototype internally is fine. Shipping it as a SODIC/Edara product is not, without resolving the licence.

Options when you get to production: obtain a commercial licence from InsightFace, use a permissively licensed model, train your own on a commercially licensed dataset, or buy a commercial SDK. **Raise this with whoever owns the project budget before the prototype gets promoted to "it already works, just deploy it."** That promotion happens by default if nobody objects.

---

## 2. Repository Structure

```
face-rec-prototype/
├── README.md
├── requirements.txt
├── config.yaml
├── .gitignore                 # MUST ignore data/ — see §9
├── data/
│   ├── gallery.db             # SQLite: persons, templates metadata
│   ├── embeddings.npy         # (N, 512) float32 matrix
│   ├── enrollments/           # raw enrollment images, per person
│   └── models/                # auto-downloaded buffalo_l
├── src/facerec/
│   ├── __init__.py
│   ├── config.py              # load config.yaml, typed settings
│   ├── engine.py              # FaceEngine: detect → align → embed
│   ├── quality.py             # blur / pose / size filters
│   ├── gallery.py             # persistence + cosine search
│   ├── matcher.py             # decision logic (threshold + margin)
│   ├── tracker.py             # simple IoU tracker for video
│   └── schemas.py             # pydantic request/response models
├── api/
│   └── main.py                # FastAPI app
├── scripts/
│   ├── enroll_webcam.py       # capture N good frames, enroll
│   ├── live_demo.py           # live recognition window
│   ├── calibrate_threshold.py
│   └── eval_report.py
├── tests/
│   ├── test_engine.py
│   ├── test_gallery.py
│   └── test_matcher.py
└── postman/
    └── face-rec.postman_collection.json
```

---

## 3. Configuration (`config.yaml`)

Every tunable number lives here. No magic numbers in code.

```yaml
model:
  pack: "buffalo_l"
  det_size: [640, 640]
  providers: ["CPUExecutionProvider"]   # ["CUDAExecutionProvider"] later

detection:
  confidence_threshold: 0.5
  min_face_size_px: 80        # reject smaller — embeddings unreliable

quality:
  blur_threshold: 60.0        # variance of Laplacian; tune in Phase 7
  max_yaw_deg: 35.0
  max_pitch_deg: 35.0

matching:
  # STARTING POINTS ONLY. Phase 7 replaces these with measured values.
  # Cosine similarity on L2-normalised ArcFace embeddings.
  threshold_high: 0.40        # >= this AND margin passed -> CONFIRMED
  threshold_low: 0.30         # >= this -> TENTATIVE
  runner_up_margin: 0.05      # best must beat 2nd-best identity by this

enrollment:
  images_per_person: 5
  min_images: 3

video:
  source: 0                   # webcam index, or "rtsp://..." later
  process_every_n_frames: 3
  track_iou_threshold: 0.3
  track_max_age_frames: 15
```

**On `threshold_high: 0.40`** — this is a plausible starting value for `w600k_r50`, not a calibrated one. Published and community-reported thresholds for ArcFace variants range roughly 0.28–0.45 depending on the exact model and use case. Treat 0.40 as "good enough to see the demo work" and treat Phase 7 as the step that produces the number you would actually defend. Do not ship any number that came from a config file default or from an LLM.

---

## 4. Module Specifications

### 4.1 `engine.py` — FaceEngine

```python
class DetectedFace:
    bbox: tuple[int, int, int, int]      # x1, y1, x2, y2
    det_score: float
    landmarks: np.ndarray                 # (5, 2)
    embedding: np.ndarray                 # (512,) float32, L2-normalised
    quality: QualityReport

class FaceEngine:
    def __init__(self, config: Config) -> None:
        """Initialise insightface FaceAnalysis with the configured pack.
        Downloads models on first run to data/models/. Log the resolved
        model paths at startup so the engineer can confirm what loaded."""

    def detect_and_embed(self, frame_bgr: np.ndarray) -> list[DetectedFace]:
        """Full pipeline on one frame. Returns all faces passing the
        detection threshold, each with its quality report attached.
        Does NOT filter on quality — the caller decides."""
```

Notes for implementation:
- Use `insightface.app.FaceAnalysis(name=pack, root=..., providers=...)` then `prepare(ctx_id=0, det_size=...)`.
- Read `face.normed_embedding` — already L2-normalised. Do not re-normalise or use `face.embedding` by mistake.
- Input frame is **BGR** (OpenCV native). Do not convert.

### 4.2 `quality.py`

```python
class QualityReport:
    face_width_px: int
    blur_score: float        # variance of Laplacian on the crop
    yaw_deg: float
    pitch_deg: float
    passed: bool
    reasons: list[str]       # why it failed, for logging and UI
```

Pose estimation: derive approximate yaw/pitch from the geometry of the 5 landmarks (relative horizontal offset of nose between the eyes for yaw; vertical position of nose relative to the eye–mouth span for pitch). A rough estimate is fine and cheap; do not add a separate head-pose model.

The `reasons` list matters — when the demo says "no face found" you need to know whether it was too small, too blurry, or too turned.

### 4.3 `gallery.py`

SQLite schema:

```sql
CREATE TABLE person (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'resident',
  created_at   TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE template (
  id             TEXT PRIMARY KEY,
  person_id      TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  row_index      INTEGER NOT NULL,   -- row in embeddings.npy
  quality_score  REAL,
  image_path     TEXT,
  model_version  TEXT NOT NULL,      -- e.g. 'buffalo_l/w600k_r50'
  created_at     TEXT NOT NULL
);
```

```python
class Gallery:
    def add_person(self, name: str, role: str) -> str: ...
    def add_templates(self, person_id: str, embeddings: np.ndarray,
                      quality: list[float], image_paths: list[str]) -> None: ...
    def delete_person(self, person_id: str) -> None:
        """Must remove rows from embeddings.npy AND reindex remaining
        templates' row_index. A delete that leaves orphaned vectors is a
        real bug — someone deleted from the gallery can still match."""
    def search(self, query: np.ndarray, top_k: int = 5) -> list[Match]:
        """Cosine similarity via embeddings @ query. Return top-k with
        person_id, name, similarity. Collapse to best-per-person before
        returning, so runner-up is a different PERSON, not another photo
        of the same one."""
```

Store multiple embeddings per person and take the **max** similarity across them — better than averaging into a centroid.

That `search` collapse rule is important: the runner-up margin check in the matcher is meaningless if the runner-up is just another photo of the same person.

### 4.4 `matcher.py`

```python
class Decision(str, Enum):
    CONFIRMED = "confirmed"
    TENTATIVE = "tentative"
    UNKNOWN   = "unknown"

def decide(matches: list[Match], cfg) -> Result:
    """
    best = matches[0]
    runner_up = first match with a different person_id, else None

    if best.similarity >= threshold_high and
       (runner_up is None or best.similarity - runner_up.similarity >= margin):
        CONFIRMED
    elif best.similarity >= threshold_low:
        TENTATIVE
    else:
        UNKNOWN

    Always return the similarity, the runner-up gap, and the decision
    reason. The demo must be explainable — 'unknown' with no number is
    not debuggable.
    """
```

### 4.5 `tracker.py`

Minimal IoU tracker: assign a `track_id`, match detections across frames by bounding-box overlap, retire tracks after `track_max_age_frames` without a hit.

Why bother in a prototype: it lets you aggregate several frames per person instead of deciding on one. It is roughly 60 lines and is the single biggest accuracy gain in the live demo. Per-track, keep the best-quality N crops and decide on the highest similarity across them.

---

## 5. Scripts

### 5.1 `scripts/enroll_webcam.py`

```
python -m scripts.enroll_webcam --name "Your Name" --role resident
```

Behaviour:
1. Open webcam, show live preview with the detected face box.
2. On-screen guidance prompting the user through the required captures: frontal, slight left, slight right, one further from the camera, one under different lighting if possible.
3. Capture only frames passing the quality filter. Show why a frame was rejected ("too blurry", "turn to face camera").
4. Collect `images_per_person` good frames. Save images to `data/enrollments/<person_id>/`.
5. Compute embeddings, write to gallery.
6. **Print a self-check:** the pairwise cosine similarity between the captured embeddings. These are all the same person, so they should be high — roughly 0.6+. If they are near the match threshold, something is wrong with alignment or capture quality, and matching will not work. Fail loudly here rather than debugging it later in the live demo.

That self-check is the best early-warning signal in the whole build. Make it prominent.

### 5.2 `scripts/live_demo.py` — the primary deliverable

```
python -m scripts.live_demo                     # webcam
python -m scripts.live_demo --source rtsp://... # later, real camera
```

Opens a window. For each frame:
- Detect faces, track them.
- Every `process_every_n_frames`, embed and match.
- Draw a box per face, coloured by decision: green CONFIRMED, amber TENTATIVE, red UNKNOWN.
- Label with name, similarity score, and track id.
- Show a HUD: FPS, gallery size, current thresholds, model version.
- Keys: `q` quit, `s` save current frame for debugging.

Display the **similarity number** on screen at all times. A demo that only says "known/unknown" cannot be tuned; one that shows 0.62 vs 0.31 teaches you where the threshold belongs in about ten minutes of walking around.

### 5.3 `scripts/calibrate_threshold.py`

See Phase 7 below.

### 5.4 `scripts/eval_report.py`

Produces a small HTML or markdown report: ROC curve, TAR at several FAR points, the chosen threshold, and the resulting genuine/impostor score distributions as a histogram. The histogram is the most useful single artefact — if the two distributions overlap heavily, no threshold will save you and the problem is upstream (camera, lighting, alignment).

---

## 6. FastAPI Surface

```
GET    /health                 -> {status, model_version, gallery_size}
GET    /persons                -> list
POST   /persons                -> {name, role} -> {person_id}
DELETE /persons/{person_id}    -> 204

POST   /persons/{id}/enroll    multipart: files[] (1..10 images)
       -> {enrolled: n, rejected: [{filename, reasons}],
           pairwise_similarity: {min, mean}}

POST   /recognize              multipart: file (one image)
       -> {faces: [{bbox, decision, person_id, name,
                    similarity, runner_up_gap, quality}]}

POST   /recognize/base64       {image_b64}  -> same shape
```

Design notes:
- `/recognize` returns **all** faces, each with full scoring detail. Never return a bare boolean.
- Load the model once at app startup (FastAPI lifespan), not per request.
- Every response carries `model_version`. Embeddings from different model versions are not comparable, and a mismatched gallery is a confusing failure to debug without this field.
- No auth in the prototype. Bind to `127.0.0.1` only, and note in the README that this must not be exposed on a network.

Ship `postman/face-rec.postman_collection.json` with a request per endpoint and an example image attached, so the engineer can click through the whole flow.

---

## 7. Phase 7 — Threshold Calibration

This is where the prototype becomes something you can make claims about.

**The problem:** with one enrolled person you cannot calibrate anything. You need genuine pairs (same person, different images) and impostor pairs (different people). Impostor pairs are what set the threshold, and you need a lot of them.

**Pragmatic approach:**

1. **Genuine pairs:** capture 20–30 images of yourself across different sessions, lighting, days, with and without glasses. Pair them all. This gives a few hundred genuine pairs.
2. **Impostor pairs:** you need many identities. With consent, capture 10–15 colleagues at Edara (5 images each) — this also gives you a realistic demographic mix for the actual deployment. Supplement with a public evaluation set such as LFW for volume. **Check the licence of any public dataset before use** — several prohibit commercial use, and one prototype's convenience becomes a legal problem when the code is reused.
3. `calibrate_threshold.py` computes all pair similarities, sweeps the threshold, and reports TAR at FAR = 1e-2, 1e-3, 1e-4.
4. Pick `threshold_high` at the FAR you need; write the resulting FRR into the README so it is visible.

**Be honest in the report about the sample size.** A threshold derived from 15 people is a starting point for a pilot, not a production number. FAR = 1e-4 cannot be measured meaningfully with a few thousand impostor pairs — you need on the order of a million. Say so in the output rather than printing a confident number.

**Consent:** colleagues' faces are biometric data under Egypt's Law 151/2020. Get written consent stating the purpose (prototype evaluation), the retention period, and the right to withdraw. Delete on request. This is not optional even for an internal prototype, and doing it properly now gives you a template for the real deployment.

---

## 8. Acceptance Criteria

The prototype is done when all of these pass:

| # | Criterion |
|---|---|
| 1 | `pip install -r requirements.txt` then `python -m scripts.live_demo` works from a clean clone, with the model auto-downloading |
| 2 | Enrolling yourself takes under 60 seconds and reports pairwise similarity ≥ 0.6 |
| 3 | Live demo recognises you as CONFIRMED in ≥ 95% of frames where your face is ≥ 80px and frontal |
| 4 | Live demo labels an unenrolled person UNKNOWN in ≥ 95% of frames |
| 5 | A printed photo of yourself is recognised as CONFIRMED — **this is expected**, the prototype has no anti-spoofing. Verify and document it so nobody demos it as a security feature |
| 6 | Deleting a person via API removes them from live recognition immediately |
| 7 | All three endpoints work from the Postman collection |
| 8 | `eval_report.py` produces a score histogram and a threshold recommendation |
| 9 | Runs at ≥ 8 FPS on CPU at 720p with `process_every_n_frames: 3` |
| 10 | Unit tests cover matcher decision logic including the runner-up margin case |

Criterion 5 exists because someone will inevitably try the photo trick during a demo. Knowing the answer in advance, and being able to explain that anti-spoofing is a deliberate later decision tied to whether the system controls a door, is much better than being surprised in front of management.

---

## 9. Data Handling in the Prototype

Even at prototype scale, these are real obligations and cost nothing to do now:

- `.gitignore` must exclude `data/` entirely. **Never commit face images or embeddings to git.** Once pushed, a repo history containing biometric data is very hard to clean.
- Store enrollment images locally only. No cloud sync folder, no shared drive.
- Keep a `data/CONSENT.md` recording who consented, when, and for what.
- Add a `scripts/purge_person.py` that deletes a person's images, embeddings, and database rows in one command. Test it before you enroll anyone other than yourself.
- Embeddings are not anonymous. Research has shown approximate face images can be reconstructed from them. Treat `embeddings.npy` with the same care as the photos.

---

## 10. What This Prototype Deliberately Does Not Do

State these clearly in the README so expectations are set when you demo it:

- **No anti-spoofing.** A photo or a phone screen will pass. Deliberate: the production system is advisory (alerts a guard, opens no door), which makes this a low-value control. Revisit only if the scope changes to access control.
- **No RTSP hardening.** Real cameras drop connections constantly and need reconnect logic, hardware decode, and frame-drop handling. Add when you have camera access.
- **No calibrated accuracy claim** until Phase 7 runs on real data from the actual cameras.
- **No commercial licence** for the model weights (§1.1).
- **Single machine, no auth, no encryption at rest.** Not deployable.

---

## 11. What To Ask Edara's Facilities Team (in parallel)

The prototype does not need this, but the next phase does, and these take time to get answers to:

1. Camera make and model, and whether ONVIF/RTSP streams are accessible.
2. Resolution and frame rate available on the substream and main stream.
3. Mounting height and angle at each entrance — and whether it can be changed. Existing lobby cameras are usually ceiling-corner mounted for overview coverage, which is close to the worst geometry for face recognition. If they cannot be moved or supplemented, that constrains achievable accuracy more than any model choice will.
4. Lighting at the entrance, especially backlighting from glass doors.
5. Whether there is an NVR you can pull from, or whether you connect to cameras directly.
6. Expected footfall per entrance per hour — this determines the alert volume and therefore the accuracy target.
7. Network path from the cameras to wherever you intend to run inference.

Point 3 is the one that most often decides whether the project succeeds. Get a photo of each camera's actual view before promising anything.

---

## 12. Suggested Prompt for Claude Code

Do not paste this entire document as one prompt. Work phase by phase:

> Read `BUILD_SPEC.md` in this repo. Implement Phase 1 and Phase 2 only (project scaffold and `FaceEngine`). Follow the module specification in §4.1 exactly. Do not implement any training code. When done, show me the acceptance test for Phase 2 and stop.

Then review, then move to Phase 3. Agents drift on long specs; short scoped phases with a review gate between them produce much better results than one large request. After each phase, run the demo yourself before moving on.
