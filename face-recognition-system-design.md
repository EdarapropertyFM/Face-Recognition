# Face Recognition for Building Access Control — End-to-End Design Document

**Version:** 1.1 — revised for advisory (log-and-alert) operation
**Status:** Draft for review
**Scope:** Real-time recognition of people entering a building from CCTV streams, classifying each detected person as **Resident/Owner**, **Registered Visitor**, **Staff**, or **Unknown**.

**Operating mode: ADVISORY ONLY.** The system logs events and raises alerts to a human guard. It does **not** control any door, lock, turnstile, or barrier, and takes no automated action against any person. Every decision that affects someone is made by the guard. This constraint is load-bearing — it relaxes several requirements below and tightens others, and it must not be quietly changed later without re-reviewing Sections 1.3, 4.6, 10 and 11.

---

## 1. Objectives and Success Criteria

### 1.1 Functional objectives
1. Detect every face crossing a camera's field of view at the building entrance.
2. Match each face against an enrolled gallery of residents, staff, and pre-registered visitors.
3. Emit an event within ~1 second of the person appearing, with identity + confidence.
4. Log unknown faces for security review without permanently identifying them.
5. Support enrollment of a new person in under 60 seconds, with no model retraining.

### 1.2 Non-functional objectives
| Requirement | Target |
|---|---|
| End-to-end latency (person appears → alert on guard screen) | < 5 s p95 |
| Throughput per edge device | 4–8 camera streams @ 10 FPS |
| Availability | 99% (degrades to plain CCTV, which the guard already has) |
| Gallery size | 5,000 identities per building, scalable to 100k across tenants |
| Uptime without internet | Full local operation for 72h, sync when reconnected |

### 1.3 Accuracy targets (the numbers that actually matter)

Do **not** measure this with "accuracy". Use the biometric metrics — but note that **advisory mode inverts which error you fear most.**

In a door-unlocking system, a false accept lets a stranger in, so FAR is the critical metric and you drive it to 1e-5 or below. Here, nothing is unlocked. The failure modes are:

| Error | Consequence here | Severity |
|---|---|---|
| **False reject** — resident flagged Unknown | Guard gets a nuisance alert about someone who lives there | **Primary problem.** Drives alert fatigue, which silently disables the whole system |
| **False accept** — stranger matched to a resident | Alert is *suppressed*; guard isn't notified | Moderate. The person is still on camera and still walks past a human |
| Missed detection | No event at all | Moderate — same as above |

The dominant risk in an advisory system is not that it lets the wrong person in. It is that it cries wolf until guards stop reading the alerts. Optimise accordingly.

**Targets:**
- **TAR @ FAR = 1e-3**: **≥ 98%** on your own captured data, not on LFW. (Note the relaxed FAR relative to an access-control system — 1e-3 is appropriate when a false accept costs a missed notification, not an unauthorised entry.)
- **FRR per session** (all frames while a person crosses the frame): **≤ 1%**. This is the alert-fatigue number. Track it obsessively.
- **Unknown-alert precision**: of all alerts raised, **≥ 80%** should be genuinely non-enrolled people. Below ~50%, guards will start dismissing alerts reflexively and the system is worse than nothing.
- **Alerts per guard per hour**: **≤ 6** at steady state. This is a product requirement, not a model metric, and it is the one that determines whether the deployment survives.
- **Detection recall**: ≥ 99% of people who pass get at least one usable face crop.

Pick the threshold from your own validation data — never use a vendor's default.

---

## 2. Why This Is Not a Fine-Tuning Problem

The intuition from the OCR project ("take a pretrained model, fine-tune on our data") does not transfer cleanly. Here is why, and what to do instead.

**The naive approach** — train a classifier with one output class per resident — fails because:
- Every new resident requires retraining and redeploying the model.
- You need dozens of images per person to train a class.
- The model cannot say "I don't know this person," which is the single most important output in a security system.

**The correct approach — metric learning / open-set recognition:**

1. A pretrained face embedding model maps any face image to a fixed-length vector (typically 512-D).
2. The model is trained (by its authors, on millions of identities) so that two images of the same person land close together and different people land far apart.
3. "Recognition" = compute the embedding of the incoming face, find the nearest neighbour in your gallery of enrolled embeddings, and accept only if the similarity exceeds a threshold.
4. Enrollment = compute embeddings for 3–5 photos of the new person and insert them into the gallery. **No training involved.**

**Where fine-tuning *does* legitimately apply:** if your cameras produce a domain the base model handles poorly — heavy IR/night mode, extreme overhead angles, a demographic under-represented in the training set. Then you fine-tune the *embedding model* with an ArcFace loss on your own labelled identities to adapt the feature space. Treat this as a Phase 3 optimisation after you have measured that a gap exists. Do not start here.

---

## 3. System Architecture

### 3.1 High-level flow

```
IP Camera (RTSP)
      │
      ▼
┌─────────────────────────────────────────────┐
│ EDGE DEVICE (per building / per 2-4 cameras)│
│                                             │
│  1. Frame grabber (decode, drop to 10 FPS)  │
│  2. Face detector (SCRFD / YOLOv8-face)     │
│  3. Tracker (ByteTrack) → track_id          │
│  4. Quality filter (blur/pose/size)         │
│  5. Alignment (5-point similarity warp)     │
│  6. Liveness / anti-spoof                   │
│  7. Embedding model (ArcFace, 512-D)        │
│  8. Vector search vs. local gallery cache   │
│  9. Track-level vote & decision             │
│                                             │
└──────────────┬──────────────────────────────┘
               │  events + thumbnails (mTLS)
               ▼
┌─────────────────────────────────────────────┐
│ BACKEND (cloud or on-prem server)           │
│  - Identity & enrollment service            │
│  - Vector DB (master gallery)               │
│  - Event store + audit log                  │
│  - Alerting / access-control integration    │
│  - Admin web UI                             │
└─────────────────────────────────────────────┘
```

### 3.2 Why inference runs at the edge
- Bandwidth: streaming 4 camera feeds to the cloud 24/7 is expensive and fragile.
- Latency: the decision must happen before the person reaches the door.
- Privacy: raw video never leaves the building; only embeddings, events and small thumbnails do. This materially simplifies your legal position (Section 10).

### 3.3 Hardware recommendation

| Tier | Device | Streams | Notes |
|---|---|---|---|
| Entry | NVIDIA Jetson Orin Nano (8GB) | 2 @ 10 FPS | Good default for a single entrance |
| Standard | Jetson Orin NX (16GB) | 4–6 | Multi-entrance buildings |
| Server-side | Any x86 + RTX A2000/T4 | 10–16 | When the building already has a rack |

CPU-only is possible with OpenVINO on an Intel NUC for a single low-traffic door, but expect to drop to 5 FPS.

---

## 4. The Pipeline, Stage by Stage

### 4.1 Frame ingestion
- Pull RTSP via GStreamer with hardware decode (NVDEC). Avoid OpenCV's `VideoCapture` for production — it buffers badly and drifts.
- Downsample to 10 FPS. More frames do not improve accuracy; they just burn GPU.
- Handle reconnects with exponential backoff; cameras drop constantly.

### 4.2 Face detection
- **Model:** SCRFD-10GF or YOLOv8n-face. Both output bounding box + 5 facial landmarks (eyes, nose, mouth corners), which you need for alignment.
- **Input size:** 640×640. Set detection threshold ~0.5.
- **Minimum face size:** reject faces under **80×80 px**. Below that, embeddings are unreliable and you will generate false matches. This is a camera-placement constraint, covered in Section 5.

### 4.3 Tracking
- **ByteTrack** or a simple IoU tracker assigns a `track_id` to each person across frames.
- This is the highest-leverage, lowest-cost component in the system. It lets you aggregate many weak per-frame observations into one strong per-person decision, which typically cuts FRR by 3–5× versus deciding on a single frame.

### 4.4 Quality filtering
Before spending GPU on an embedding, discard bad crops:
- Blur: variance of Laplacian below threshold → drop.
- Pose: yaw/pitch beyond ±35° → drop (estimate from landmark geometry).
- Size: below the minimum above → drop.
- Brightness: clipped highlights/shadows → drop.

Target: keep the best 3–5 crops per track, not every frame.

### 4.5 Alignment
Warp the face to a canonical 112×112 using a similarity transform from the 5 detected landmarks to the ArcFace reference landmarks. **This step is not optional** — embedding models are trained on aligned crops and degrade badly without it. A large share of "our model doesn't work" bugs trace back to a broken alignment step.

### 4.6 Anti-spoofing (presentation attack detection) — *deprioritised in advisory mode*

**In an unlocking system this is mandatory.** In this system it is a low-value control, and specifying expensive hardware for it would be wasted money.

Consider the actual attack: someone holds a printed photo of a resident up to the camera. The result is that the system *doesn't raise an alert* about them. But they are still walking through a lobby, on camera, past a human guard, while holding a photograph of someone's face in front of their own. The guard notices. The attack defeats the software and fails in the physical world.

**Recommendation:**
- **Skip depth cameras and IR pairs entirely.** The hardware cost is not justified when nothing unlocks.
- **Optionally** add a passive RGB PAD model (Silent-Face / MiniFASNet) in a later phase. It's cheap — one small extra model — and its real value here is flagging *screens*: a phone or tablet held up to the camera is a signal worth logging. Treat it as an anomaly detector, not a gate.
- **Do not** implement active challenges (blink, turn head). There is no enrollment interaction to attach them to; people are just walking past.

**If the operating mode ever changes to unlocking a door, this section reverts to mandatory and needs a depth or IR camera.** Flag it in the change-control process.

### 4.7 Embedding
- **Model:** ArcFace with an IResNet-50 or IResNet-100 backbone (the InsightFace `buffalo_l` pack is a solid production default). Output: 512-D vector, L2-normalised.
- **Precision:** export to ONNX, then TensorRT FP16. Expect ~2–4 ms/face on Orin NX. INT8 is possible but requires calibration and costs ~1% TAR — measure before adopting.
- Freeze this model. Version it explicitly (Section 8.3).

### 4.8 Matching
- **Similarity:** cosine similarity on L2-normalised vectors (equivalent to Euclidean distance here).
- **Index:** for < 10k identities, brute-force matrix multiply on GPU is fastest and exact — do not add a vector database you don't need. Above ~50k, use HNSW (FAISS, Qdrant, or pgvector).
- **Per-identity storage:** store 3–5 embeddings per person (different lighting/angles) and match against all of them, taking the max. Better than averaging into a single centroid.

### 4.9 Track-level decision

Because nothing is gated on speed, you can wait for the **whole track to complete** (person enters and leaves the frame) before deciding. This is a real advantage of advisory mode: you get 10–30 observations instead of one, and it is the cheapest accuracy you will ever buy.

```
on track_end:
    collect top-K quality crops (K ≈ 5)
    embed each → similarity to gallery
    s = max over crops of (best gallery similarity)
    id = corresponding identity

    if s >= T_high  and  (s - s_runner_up) >= margin:
        → CONFIRMED  → log silently, no alert
    elif s >= T_low:
        → TENTATIVE  → log; alert only if unusual hour or repeated
    else:
        → UNKNOWN    → log + raise alert to guard
```

The **margin check** against the runner-up identity is important and frequently omitted: it catches the case where a face is vaguely similar to two enrolled people, which is exactly when errors happen.

Note the asymmetry: **CONFIRMED produces no alert.** The system is silent for the 95% of traffic that is residents, and speaks only about the remainder. A design where every recognition pings the guard is unusable within a week.

### 4.10 Guard alerting — the actual product

The model is infrastructure. The alert queue is what the customer experiences, and it is where advisory deployments usually fail. Budget real design effort here.

**Deduplication.** One person walking through the lobby must produce exactly one alert — not one per frame, not one per camera. Key alerts on `track_id`, and add a cross-camera suppression window (same embedding seen within N minutes → same alert thread, not a new alert).

**Alert content.** A guard glancing at a screen needs, in this order:
1. The face thumbnail, large.
2. Which camera and how long ago.
3. Status: **Unknown** / **Tentative match to <name>** / **Visitor pass expired**.
4. Two buttons: *Recognised — this is <search residents>* and *Dismiss*.

Both buttons feed labelled data straight back into the evaluation set (§9.3). This is how the system gets better without anyone running a training job.

**Alert tiering.** Not every unknown deserves equal attention:

| Tier | Trigger | Delivery |
|---|---|---|
| Silent log | Confirmed resident/staff | No notification |
| Low | Unknown during business hours at the main entrance | Appears in queue, no sound |
| Medium | Unknown at an unusual hour, or visitor with expired pass | Queue + sound |
| High | Unknown at a service/rear entrance, or repeat unknown across multiple days | Queue + sound + optional SMS to supervisor |

**Tailgating and groups.** People enter in clusters and faces occlude each other. Expect the system to miss members of a group. Do not design the guard UI around "everyone who entered is accounted for" — it will be wrong, and a guard who believes it is worse off than one who doesn't. Present it as "here are people we couldn't identify," never as "here is everyone who came in."

**Shift handover.** Alerts must persist across guard shift changes with clear ownership and an unresolved queue. Otherwise every handover drops whatever was pending.

**Measure the guards, not just the model.** Track median time-to-acknowledge and dismiss-without-viewing rate. A rising dismiss rate is the leading indicator that alert fatigue has set in and thresholds need retuning — usually well before anyone complains.

---

## 5. Camera Placement — The Highest-ROI Engineering

More recognition accuracy has been lost to bad camera mounting than to bad model selection. Specify this in the installation guide and enforce it during commissioning.

- **Height:** 1.8–2.2 m, i.e. roughly face height. Ceiling-corner cameras give a steep downward angle that destroys accuracy.
- **Angle:** within 15° of horizontal, aimed along the walking direction so people approach head-on.
- **Distance:** position so faces are ≥ 100 px wide in the frame at the decision point. For a 1080p camera with a 4mm lens, that's roughly 3–4 m.
- **Lighting:** avoid backlighting — never point a camera at a glass entrance with daylight behind visitors. Add a diffuse light source at the door if needed. WDR-capable cameras help.
- **Choke point:** a doorway or turnstile is ideal because it forces single-file, frontal passage.

---

## 6. Data

### 6.1 Enrollment data
- 3–5 images per person at enrollment: frontal, slight left, slight right, one under the actual door lighting.
- Best source is **captured by the system itself** at an enrollment kiosk, so enrollment and query images share a domain. Phone selfies work but are a mismatched domain and measurably worse.
- Reject at capture time on the same quality criteria as inference. A blurry enrollment photo poisons that identity permanently.

### 6.2 Evaluation data — build this before you build anything else
You cannot tune a threshold without it.

- **Collection:** with informed written consent, record 30–50 volunteers walking through the actual installed cameras, across morning/afternoon/night, with and without glasses/hats/masks. ~20 passes each.
- **Splits:** identities in the test set must **not** appear in the fine-tuning set if you later fine-tune. Split by identity, never by image.
- **Pairs:** generate all genuine pairs (same person) and a sampled set of impostor pairs (different people), ≥ 1M impostor pairs to measure FAR at 1e-4 meaningfully.
- **Demographic slices:** evaluate TAR/FAR separately by apparent age group, gender presentation, and skin tone. Published face models show measurable accuracy disparities across these groups; if your building's population is skewed relative to the model's training data, you will find out here rather than in production. If a slice underperforms, that is your trigger to fine-tune (Section 2).

### 6.3 Public datasets — use with care
LFW, CFP-FP, AgeDB, IJB-C are useful as sanity checks for model selection only. LFW in particular is saturated (>99.8% for everything modern) and tells you nothing about your deployment. **Check licensing before use**: MS-Celeb-1M was withdrawn, and several academic face datasets prohibit commercial use. Using a non-commercial dataset in a product is a real legal exposure.

---

## 7. Data Model

```sql
-- Identities
person (
  id              uuid pk,
  external_ref    text,          -- link to building management system
  role            enum('owner','tenant','staff','visitor'),
  unit_id         text null,
  status          enum('active','suspended','deleted'),
  consent_id      uuid fk,       -- see Section 10
  valid_from      timestamptz,
  valid_until     timestamptz null,  -- visitors expire automatically
  created_at      timestamptz
)

-- Biometric templates
face_template (
  id              uuid pk,
  person_id       uuid fk,
  embedding       vector(512),   -- pgvector, encrypted at rest
  model_version   text,          -- e.g. 'arcface-r100-v1'
  quality_score   float,
  source          enum('kiosk','upload','auto_enroll'),
  created_at      timestamptz
)

-- Recognition events
recognition_event (
  id              uuid pk,
  camera_id       uuid fk,
  track_id        text,
  person_id       uuid null,     -- null = unknown
  decision        enum('confirmed','tentative','unknown'),
  similarity      float,
  runner_up_gap   float,
  liveness_score  float,
  thumbnail_ref   text,          -- object storage key, TTL-enforced
  occurred_at     timestamptz,
  model_version   text
)

-- Immutable audit trail
audit_log (
  id, actor_id, action, subject_person_id, reason, occurred_at
)
```

Note: `face_template.embedding` is biometric data under most privacy regimes. Encrypt the column, restrict access, and log every read in `audit_log`.

---

## 8. Backend Services

### 8.1 API surface (internal)

```
POST /v1/persons                       create identity
POST /v1/persons/{id}/templates        enroll face (multipart images)
DELETE /v1/persons/{id}                soft-delete + purge templates
GET  /v1/persons/{id}/events           access history for that person

POST /v1/visitors/preregister          resident invites a visitor; returns expiry
GET  /v1/gallery/sync?since=...        edge devices pull gallery deltas
POST /v1/events                        edge devices push recognition events
GET  /v1/events?camera=&from=&to=      operator review UI
POST /v1/events/{id}/label             operator corrects a decision → eval data
```

### 8.2 Gallery sync
Edge devices hold a local copy of the gallery so they work offline. Sync is a signed, versioned delta pull every 60s. On revocation (resident moves out), push an immediate invalidation — a stale gallery granting access to a former tenant is the most likely real-world failure of this system.

### 8.3 Model versioning
Embeddings from different model versions are **not comparable**. Store `model_version` on every template and every event. Upgrading the embedding model requires re-embedding the entire gallery from stored enrollment *images* — which means you must retain enrollment images (or accept re-enrolling everyone). Decide this deliberately; it has privacy implications both ways.

---

## 9. Evaluation and Monitoring

### 9.1 Offline evaluation (pre-deploy gate)
- ROC curve, report TAR @ FAR ∈ {1e-3, 1e-4, 1e-5}.
- Per-slice breakdown (Section 6.2). Gate on worst-slice performance, not average.
- Threshold selection: pick T_high at the FAR your security posture requires, then report the resulting FRR to stakeholders so they accept the annoyance cost explicitly.

### 9.2 Online monitoring
| Metric | Watch for |
|---|---|
| Unknown rate per camera per day | Sudden rise = camera moved, lens dirty, lighting changed |
| Mean similarity of confirmed matches | Slow decline = drift, aging gallery |
| Tentative rate | Rising = threshold needs review |
| Liveness rejection rate | Spike = possible attack, or sunlight artefact |
| Operator correction rate | Ground-truth proxy for real accuracy |
| **Alerts per guard per hour** | Above ~6, fatigue sets in — retune thresholds |
| **Dismiss-without-viewing rate** | Rising = guards have stopped trusting the queue |
| **Median time-to-acknowledge** | Rising = queue is too noisy to keep up with |

### 9.3 Feedback loop
Every operator correction in the review UI becomes labelled evaluation data. Within 6 months you will have a far better test set than anything you could collect up front. Re-tune thresholds quarterly against it.

---

## 10. Privacy, Legal, and Governance

This is not a bolt-on section. Biometric identification is among the most heavily regulated categories of data processing, and getting it wrong can invalidate the whole deployment.

### 10.1 Legal landscape
- **EU (GDPR Art. 9):** face templates are special-category biometric data. Processing requires explicit consent or another Art. 9 exception; a DPIA is mandatory. The EU AI Act additionally restricts real-time remote biometric identification and imposes obligations on providers.
- **Egypt:** the Personal Data Protection Law (Law 151 of 2020) treats biometric data as sensitive, requiring explicit consent, a licence from the Data Protection Centre for processing sensitive data, and restrictions on cross-border transfer. Given your prior work on Egyptian national ID processing, this is likely your primary regime — get local counsel to confirm current licensing requirements before collecting a single face.
- **US:** state-level. Illinois BIPA requires written consent before collecting biometric identifiers and carries a private right of action with statutory damages — it has produced nine-figure settlements. Texas and Washington have analogues.

**Action:** confirm the governing jurisdiction(s) and obtain a legal review before the pilot. This is a gate, not a parallel track.

### 10.2 Design commitments that follow
1. **Consent is per-person and recorded.** No enrollment without a stored consent record with timestamp and scope. Residents must be able to decline and still access the building by conventional means (key, fob, intercom). A system that makes biometrics the *only* way in converts "consent" into coercion, which most regulators will not accept.
2. **Purpose limitation.** The system answers "is this person enrolled here." It must not be repurposed for attendance tracking, dwell-time analytics, emotion inference, or demographic profiling. Enforce in code and in contract.
3. **Unknown faces are not identified.** Log a thumbnail and an event; do not compute and retain a persistent template for non-enrolled people. No "auto-enroll strangers to track repeat visitors" without a separate legal basis.
4. **Retention.** Events: 30–90 days default. Thumbnails: 7–30 days. Templates: deleted within 7 days of the person leaving the building. Enforce with automated TTL jobs, and prove it with a scheduled deletion report.
5. **Deletion is real.** A delete request purges templates, thumbnails, and gallery entries across all edge devices, not just the master DB. Test this path.
6. **Notice.** Visible signage at every camera stating that facial recognition is in use, the controller's identity, and how to exercise data rights.
7. **Human in the loop — structurally guaranteed.** Advisory mode makes this inherent rather than a policy you have to enforce: the system's only output is information to a guard, and no automated adverse action is possible. This is a meaningfully stronger position than a door-control deployment, and it is worth stating explicitly in the DPIA and the privacy notice. Preserve it: any future proposal to wire the output into a lock, a barrier, or an automated police notification re-opens the entire legal analysis.

   The residual risk is **automation bias** — a guard who treats an "Unknown" flag as authoritative and confronts someone on that basis. Given measured demographic performance differences in face recognition, an over-trusted flag can reproduce exactly the harm that human review is supposed to prevent. Mitigate in the UI (show the system's uncertainty, never phrase an alert as an accusation) and in guard training (§12, Phase 6).
8. **Access control on the system itself.** Who can view a given resident's movement history? Default to nobody; require a logged, reason-coded request. The access log is itself sensitive.

### 10.3 Governance artefacts to produce
- Data Protection Impact Assessment (DPIA)
- Records of Processing Activities (RoPA)
- Consent form + privacy notice (in Arabic and English if deploying in Egypt)
- Retention & deletion policy
- Incident response plan for a template database breach (note: unlike a password, a face cannot be reset — treat this breach class as severe)
- Vendor/sub-processor list

---

## 11. Security

- **Templates at rest:** encrypted (AES-256), keys in an HSM or KMS. Embeddings are partially invertible — research has shown face images can be approximately reconstructed from embeddings — so treat them as equivalent to storing the photos.
- **Transport:** mTLS between edge and backend, with per-device certificates and rotation.
- **Edge device hardening:** secure boot, encrypted filesystem, no default SSH credentials, signed model artefacts. A stolen edge device must not yield the gallery.
- **Anti-spoofing** as in 4.6 — this is a security control, not a UX feature.
- **Rate limiting and anomaly detection** on enrollment: a compromised admin account silently enrolling an attacker is the cleanest attack on this system. Require two-person approval for enrollment, and alert on enrollments outside business hours.

---

## 12. Delivery Plan

| Phase | Duration | Output | Exit criteria |
|---|---|---|---|
| **0. Legal & discovery** | 2 wks | Jurisdiction confirmed, DPIA started, site survey, camera placement plan | Legal sign-off to collect data |
| **1. Baseline prototype** | 3 wks | Offline pipeline on recorded video: detect → align → embed → match | Runs end-to-end on 10 recorded passes |
| **2. Evaluation harness** | 2 wks | Consented eval set from real cameras; ROC, per-slice metrics, chosen thresholds | TAR ≥ 98% @ FAR 1e-3 on own data |
| **3. Edge deployment** | 3 wks | TensorRT-optimised runtime on Jetson, RTSP ingestion, tracking, offline gallery | 4+ streams @ 10 FPS, < 5 s p95 |
| **4. Backend & guard UI** | 4 wks | Enrollment, visitor pre-registration, **alert queue**, dedup, tiering, sync, audit log | Full enroll→recognise→alert→dismiss cycle |
| **5. Hardening** | 2 wks | mTLS, encryption at rest, secure boot, signed artefacts | Security review passed |
| **6. Silent pilot** | 4 wks | Runs live, alerts collected but **not shown to guards**; team reviews the queue daily | Alerts/hour ≤ 6 and unknown-precision ≥ 80% *before* any guard sees it |
| **7. Guard rollout** | 2 wks | Alerts go live to one entrance; guard training incl. automation-bias briefing | Dismiss-without-viewing rate stable |
| **8. Production** | — | Remaining entrances, monitoring dashboards | — |

Phase 6 is the one people skip and regret. In advisory mode it is cheap — there is no door to risk — and it is the only way to tune thresholds against real traffic before you spend your guards' patience. Ship alerts to humans only once the queue is already quiet.

Phase 5 no longer includes anti-spoofing hardware (§4.6), which removes roughly 2 weeks and the depth-camera line item from the original plan.

---

## 13. Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| Bad camera placement | System underperforms regardless of model quality | Commissioning checklist, reject installs that fail it (§5) |
| Threshold set on public benchmarks | FRR far worse than believed; alert flood on day one | Mandatory own-data evaluation (§6.2) |
| **Alert fatigue** | **Guards stop reading the queue; system is worse than nothing** | **Silent pilot gate, tiering, dedup, ongoing alerts/hour monitoring (§1.3, §4.10, §9.2)** |
| Automation bias | Guard treats "Unknown" as accusation; wrongful confrontation, likely skewed by demographic error gaps | UI phrasing, guard training, per-slice evaluation (§10.2) |
| Demographic accuracy disparity | Ethical harm + legal exposure | Per-slice gating, human-in-the-loop, fine-tune if gap found |
| Presentation attack (printed photo) | Alert suppressed — low impact, person still passes a human | Deprioritised; optional passive PAD as anomaly signal (§4.6) |
| **Scope change to door control** | **Invalidates §1.3 thresholds, §4.6 anti-spoof decision, §10 legal analysis** | **Change-control gate: any lock/barrier integration triggers full re-review** |
| Stale gallery on edge after revocation | Ex-tenant retains access | Immediate revocation push + TTL on cached gallery (§8.2) |
| Template DB breach | Irreversible biometric exposure | Encryption, HSM, minimal retention, incident plan (§11) |
| Scope creep into surveillance analytics | Regulatory violation, loss of resident trust | Purpose limitation enforced in contract and code (§10.2) |
| Model upgrade invalidates gallery | Mass re-enrollment | Version stamping + retained enrollment images, decided up front (§8.3) |

---

## 14. Technology Summary

| Component | Choice | Alternative |
|---|---|---|
| Detection | SCRFD-10GF | YOLOv8n-face, RetinaFace |
| Landmarks | From detector (5-pt) | 2D-106 for finer alignment |
| Tracking | ByteTrack | IoU tracker (simpler) |
| Anti-spoof | Silent-Face / MiniFASNet | Depth camera |
| Embedding | ArcFace IResNet-100 (InsightFace `buffalo_l`) | IResNet-50 for speed; AdaFace |
| Runtime | TensorRT FP16 | ONNX Runtime, OpenVINO (CPU) |
| Vector search | GPU brute force (<10k) | FAISS HNSW, Qdrant, pgvector |
| Edge OS | JetPack / Ubuntu + Docker | — |
| Backend | FastAPI + PostgreSQL (pgvector) | — |
| Queue | Redis Streams or NATS | Kafka at scale |
| Object storage | MinIO (on-prem) or S3 | — |
| Observability | Prometheus + Grafana, OpenTelemetry | — |

**Licensing note:** InsightFace's pretrained model packs are released for non-commercial research use. For a commercial product you need either a commercial licence, a permissively licensed model, or your own model trained on a commercially licensed dataset. Resolve this in Phase 0 — it is the single most common licensing trap in this domain.

---

## 15. Open Questions for You

~~2. Does recognition unlock a door, or only log and alert a guard?~~ **Answered: log and alert only.** Reflected throughout this version.

1. Which jurisdiction is the first deployment in? This drives §10 entirely and is still the Phase 0 gate.
2. **How many guards, on what screens, on what shifts?** This now determines the alert budget (§1.3) and the UI form factor — a dedicated monitor in a control room is a different product from a phone notification.
3. **What is the expected footfall per entrance per hour?** Combined with your FRR, this gives the alert volume directly. 500 people/hour at 1% FRR is 5 nuisance alerts/hour before a single genuine stranger appears — which may mean the alert budget forces a tighter FRR target than §1.3 assumes.
4. How are visitors pre-registered — resident invites via app, or concierge enrolls on arrival? Unregistered visitors are, by definition, the alert stream.
5. Do you own the cameras, or must you work with whatever is already installed? Determines how much of §5 you can control, and existing lobby cameras are usually mounted in the ceiling corner — the worst case for this application.
6. Is there an existing access-control system (fob/intercom)? Even without unlocking, correlating a fob swipe with a face event is a strong signal and cheap to add.
