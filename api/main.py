"""FastAPI surface for the prototype (spec §6), plus browser live view and
browser webcam enrolment.

    uvicorn api.main:app --host 127.0.0.1 --port 8000

No auth. Bind to 127.0.0.1 only; never expose this on a network.
The model is loaded once in the lifespan handler, not per request.
"""
from __future__ import annotations

import asyncio
import base64
from concurrent.futures import ThreadPoolExecutor
import binascii
import logging
import os
import sys
import threading
import time
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Annotated

# Must precede 'import cv2': OpenCV reads this when its FFmpeg plugin loads,
# so setting it later (facerec.dvr also does) is too late and has no effect.
# Without it the H.265 sub-streams flood the log with 'PPS id out of range'
# and 'Could not find ref with POC', which is normal for joining a stream
# mid-GOP and drowns out everything worth reading.
os.environ.setdefault("OPENCV_FFMPEG_LOGLEVEL", "8")   # 8 = fatal only

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import HTMLResponse, Response, StreamingResponse

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from api.log_redaction import install as install_log_redaction  # noqa: E402
from api.pages import DVR_HTML, ENROLL_HTML, GALLERY_HTML, LIVE_HTML  # noqa: E402
from api.monitor import MonitorRegistry  # noqa: E402
from api.streams import CameraHub, JpegWorker, mjpeg_chunk  # noqa: E402
from facerec import DetectedFace, FaceEngine, load_config  # noqa: E402
from facerec.config import Config  # noqa: E402
from facerec.dvr import (  # noqa: E402
    URL_TEMPLATES, DVRConfig, clear_dvr, load_dvr, probe_channel, probe_rtsp, resolve_source, save_dvr,
)
from facerec.enroll import EnrollCapture, SelfCheck, pairwise_self_check  # noqa: E402
from facerec.gallery import Gallery  # noqa: E402
from facerec.live import LiveRecognizer  # noqa: E402
from facerec.matcher import decide  # noqa: E402
from facerec.schemas import (  # noqa: E402
    CameraProbeIn, CameraProbeOut, MonitorIn, ChannelOut, DVRChannelsOut, DVRIn, DVROut, EnrollResponse, FaceOut, HealthResponse,
    PairwiseSimilarity, PersonCreate, PersonCreateResponse, PersonListResponse, PersonOut, PersonUpdate,
    QualityOut, RecognizeBase64Request, RecognizeResponse, RejectedImage, WebcamEnrollStatus,
)

log = logging.getLogger("api")

MAX_ENROLL_FILES = 10
MAX_IMAGE_BYTES = 20 * 1024 * 1024
SESSION_TTL_S = 10 * 60          # abandoned browser enrolment sessions are dropped after this


# ------------------------------------------------------------------ workers

class LiveWorker(JpegWorker):
    """/stream: recognition overlay on a camera."""
    def __init__(self, state: "AppState", hub: CameraHub) -> None:
        self.state = state
        self.live = LiveRecognizer(state.engine, state.gallery, state.config,
                                   footer=f"source {hub.label}   GET /live")
        super().__init__(hub, name=f"live-{hub.label}")

    def step(self, frame_bgr: np.ndarray) -> np.ndarray:
        with self.state.lock:                          # engine + gallery shared with endpoints
            return self.live.process(frame_bgr)


class EnrollSession(JpegWorker):
    """Browser enrolment for one person: preview with quality guidance,
    captures held in memory until /finish writes them to the gallery."""
    def __init__(self, state: "AppState", hub: CameraHub, person_id: str, name: str,
                 n_required: int, auto_capture: bool) -> None:
        self.state, self.person_id = state, person_id
        self.capture = EnrollCapture(state.engine, state.config, name, n_required,
                                     auto_capture=auto_capture, footer="")
        self.created_t = time.monotonic()
        self.finished: EnrollResponse | None = None
        super().__init__(hub, name=f"enroll-{person_id[:8]}", idle_stop=False)

    def step(self, frame_bgr: np.ndarray) -> np.ndarray:
        with self.state.lock:
            return self.capture.feed(frame_bgr)

    def status_out(self) -> WebcamEnrollStatus:
        c = self.capture
        sc = c.self_check()
        return WebcamEnrollStatus(
            model_version=self.state.model_version, person_id=self.person_id,
            active=self.alive and self.finished is None,
            captured=len(c.captures), required=c.n_required, done=c.done,
            status=c.status, guidance=c.guidance, auto_capture=c.auto_capture,
            self_check=PairwiseSimilarity(min=_r(sc.min), mean=_r(sc.mean)),
            self_check_ok=sc.ok, error=self.error, finished=self.finished)


def _r(v: float | None) -> float | None:
    return None if v is None else round(v, 4)


class AppState:
    """Everything loaded once at startup and shared across requests."""
    def __init__(self, config: Config) -> None:
        self.config = config
        self.engine = FaceEngine(config)
        self.gallery = Gallery(config, self.engine.model_version)
        # Gallery (and, defensively, the engine) are not thread-safe and
        # FastAPI runs sync endpoints in a thread pool; serialise access.
        self.lock = threading.Lock()
        self.dvr: DVRConfig | None = load_dvr(config)
        self.hubs: dict[str, CameraHub] = {}
        self.live_workers: dict[str, LiveWorker] = {}
        self.enroll_sessions: dict[str, EnrollSession] = {}
        self.workers_lock = threading.Lock()
        self._monitors: MonitorRegistry | None = None

    @property
    def model_version(self) -> str:
        return self.engine.model_version

    def hub_for(self, source: str | int) -> CameraHub:
        key = str(source)
        h = self.hubs.get(key)
        if h is None or not h.alive:
            try:
                _, label = resolve_source(source, self.config, self.dvr)
            except ValueError as e:                    # dvr:<ch> with no DVR configured
                raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
            h = self.hubs[key] = CameraHub(source, label)
        return h

    @property
    def monitors(self) -> MonitorRegistry:
        # Created lazily so AppState stays cheap to build in tests.
        if self._monitors is None:
            self._monitors = MonitorRegistry(self)
        return self._monitors

    def new_recognizer(self, footer: str = "") -> LiveRecognizer:
        """A recognizer sharing the loaded model and gallery. Each caller
        gets its own tracker state, which is per-camera."""
        return LiveRecognizer(self.engine, self.gallery, self.config, footer=footer)

    def live_for(self, source: str | int) -> LiveWorker:
        with self.workers_lock:
            key = str(source)
            w = self.live_workers.get(key)
            if w is None or not w.alive:
                w = self.live_workers[key] = LiveWorker(self, self.hub_for(source))
            return w

    def enroll_session(self, person_id: str) -> EnrollSession | None:
        with self.workers_lock:
            s = self.enroll_sessions.get(person_id)
            if s and s.finished is None and time.monotonic() - s.created_t > SESSION_TTL_S:
                s.stop()
                del self.enroll_sessions[person_id]
                return None
            return s

    def start_enroll(self, person_id: str, name: str, source: str | int,
                     n_required: int, auto_capture: bool) -> EnrollSession:
        with self.workers_lock:
            old = self.enroll_sessions.pop(person_id, None)
            if old:
                old.stop()
            s = self.enroll_sessions[person_id] = EnrollSession(
                self, self.hub_for(source), person_id, name, n_required, auto_capture)
            return s

    def stop_all(self) -> None:
        with self.workers_lock:
            for w in list(self.live_workers.values()) + list(self.enroll_sessions.values()):
                w.stop()
            for h in self.hubs.values():
                h.stop()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    # Installed before anything is served: the live view takes the camera as a
    # ?source=rtsp://user:pass@host query parameter, so without this the DVR
    # password is written to the access log on every request.
    install_log_redaction()
    # Say out loud how the AI will reach the backend. A token mismatch used
    # to be invisible: recognition worked, detections were posted, and the
    # backend threw every one away with a 401 nobody saw.
    from api.backend_link import describe as _describe, resolve as _resolve
    log.info("%s", _describe(*_resolve()))
    state = AppState(load_config())
    app.state.fr = state
    log.info("ready: model=%s gallery=%d person(s) / %d vectors",
             state.model_version, state.gallery.person_count, len(state.gallery))
    yield
    state.stop_all()
    state.gallery.close()


app = FastAPI(
    title="Face Recognition Prototype",
    version="0.1",
    description="Prototype only: no auth, no anti-spoofing, bind to 127.0.0.1.",
    lifespan=lifespan,
)


def fr(request: Request) -> AppState:
    return request.app.state.fr


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    return Response(status_code=status.HTTP_204_NO_CONTENT)   # keep browser consoles quiet


# ----------------------------------------------------------------- helpers

def decode_image(data: bytes, what: str) -> np.ndarray:
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{what}: empty body")
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, f"{what}: image too large")
    # cv2.imdecode yields BGR, which is what FaceEngine expects. No conversion.
    frame_bgr = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if frame_bgr is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{what}: not a decodable image")
    return frame_bgr


def quality_out(f: DetectedFace) -> QualityOut:
    q = f.quality
    return QualityOut(face_width_px=q.face_width_px, blur_score=round(q.blur_score, 2),
                      yaw_deg=round(q.yaw_deg, 1), pitch_deg=round(q.pitch_deg, 1),
                      passed=q.passed, reasons=list(q.reasons))


def largest(faces: list[DetectedFace]) -> DetectedFace:
    return max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))


def recognize_frame(state: AppState, frame_bgr: np.ndarray) -> RecognizeResponse:
    out: list[FaceOut] = []
    with state.lock:
        faces = state.engine.detect_and_embed(frame_bgr)
        state.gallery.reload_if_changed()
        for f in faces:
            r = decide(state.gallery.search(f.embedding), state.config.matching)
            out.append(FaceOut(
                bbox=list(f.bbox), det_score=round(f.det_score, 4),
                decision=r.decision, person_id=r.person_id, name=r.name,
                similarity=round(r.similarity, 4),
                runner_up_gap=None if r.runner_up_gap is None else round(r.runner_up_gap, 4),
                runner_up_name=r.runner_up_name, reason=r.reason,
                quality=quality_out(f),
            ))
    h, w = frame_bgr.shape[:2]
    return RecognizeResponse(model_version=state.model_version, image_size=[w, h], faces=out)


def persist_templates(state: AppState, person_id: str, frames: list[np.ndarray],
                      faces: list[DetectedFace], names: list[str],
                      raw_bytes: list[bytes | None]) -> int:
    """Write images to data/enrollments/<person_id>/ then add templates.
    Returns the person's template count afterwards. Caller holds no lock."""
    out_dir = state.config.data_dir / "enrollments" / person_id
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    paths: list[str] = []
    for i, (frame, name, raw) in enumerate(zip(frames, names, raw_bytes)):
        ext = Path(name).suffix.lower() if raw is not None else ".jpg"
        p = out_dir / f"api_{stamp}_{i:02d}{ext or '.jpg'}"
        if raw is not None:
            p.write_bytes(raw)                          # keep the uploaded file byte-for-byte
        else:
            cv2.imwrite(str(p), frame, [cv2.IMWRITE_JPEG_QUALITY, 95])
        paths.append(str(p))
    embs = np.stack([f.embedding for f in faces]).astype(np.float32)
    with state.lock:
        state.gallery.add_templates(person_id, embs, [f.quality.blur_score for f in faces], paths)
        return _template_count(state, person_id)


def _template_count(s: AppState, person_id: str) -> int:
    p = s.gallery.get_person(person_id)
    return p.template_count if p else 0


def _pairwise(sc: SelfCheck) -> PairwiseSimilarity:
    return PairwiseSimilarity(min=_r(sc.min), mean=_r(sc.mean))


# --------------------------------------------------------------- endpoints

@app.get("/health", response_model=HealthResponse)
def health(request: Request):
    s = fr(request)
    m = s.config.matching
    with s.lock:
        s.gallery.reload_if_changed()
        return HealthResponse(
            status="ok", model_version=s.model_version,
            gallery_size=len(s.gallery), person_count=s.gallery.person_count,
            thresholds={"high": m.threshold_high, "low": m.threshold_low,
                        "runner_up_margin": m.runner_up_margin})


@app.get("/persons", response_model=PersonListResponse)
def list_persons(request: Request):
    s = fr(request)
    with s.lock:
        people = s.gallery.list_persons()
    return PersonListResponse(
        model_version=s.model_version,
        persons=[PersonOut(person_id=p.id, name=p.name, role=p.role, status=p.status,
                           created_at=p.created_at, template_count=p.template_count)
                 for p in people])


@app.post("/persons", response_model=PersonCreateResponse, status_code=status.HTTP_201_CREATED)
def create_person(body: PersonCreate, request: Request):
    s = fr(request)
    with s.lock:
        pid = s.gallery.add_person(body.name, body.role)
    log.info("created person %s (%s)", pid, body.name)
    return PersonCreateResponse(model_version=s.model_version, person_id=pid)


@app.patch("/persons/{person_id}", response_model=PersonOut,
           summary="Rename or re-role a person (templates untouched)")
def update_person(person_id: str, body: PersonUpdate, request: Request):
    s = fr(request)
    with s.lock:
        try:
            p = s.gallery.update_person(person_id, body.name, body.role)
        except KeyError:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "no such person")
    log.info("updated person %s -> name=%r role=%r", person_id, body.name, body.role)
    return PersonOut(person_id=p.id, name=p.name, role=p.role, status=p.status,
                     created_at=p.created_at, template_count=p.template_count)


@app.delete("/persons/{person_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_person(person_id: str, request: Request):
    s = fr(request)
    with s.workers_lock:                              # drop any open capture session too
        sess = s.enroll_sessions.pop(person_id, None)
    if sess:
        sess.stop()
    with s.lock:
        try:
            s.gallery.delete_person(person_id)
        except KeyError:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "no such person")
    # Enrolment images are biometric data too: remove them with the person.
    img_dir = s.config.data_dir / "enrollments" / person_id
    if img_dir.is_dir():
        for p in img_dir.iterdir():
            p.unlink()
        img_dir.rmdir()
    log.info("deleted person %s", person_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/persons/{person_id}/enroll", response_model=EnrollResponse)
async def enroll(person_id: str, request: Request,
                 files: Annotated[list[UploadFile], File(description="1..10 face images")]):
    s = fr(request)
    if not 1 <= len(files) <= MAX_ENROLL_FILES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"send between 1 and {MAX_ENROLL_FILES} files")
    with s.lock:
        if s.gallery.get_person(person_id) is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "no such person")

    accepted: list[tuple[str, bytes, np.ndarray, DetectedFace]] = []
    rejected: list[RejectedImage] = []
    for i, up in enumerate(files):
        name = up.filename or f"file{i}"
        data = await up.read()
        try:
            frame_bgr = decode_image(data, name)
        except HTTPException as e:
            rejected.append(RejectedImage(filename=name, reasons=[str(e.detail)]))
            continue
        with s.lock:
            faces = s.engine.detect_and_embed(frame_bgr)
        if not faces:
            rejected.append(RejectedImage(filename=name, reasons=["no face detected"]))
            continue
        face = largest(faces)
        reasons = list(face.quality.reasons)
        if len(faces) > 1:
            reasons.append(f"{len(faces)} faces in image; expected exactly one")
        if reasons:
            rejected.append(RejectedImage(filename=name, reasons=reasons))
            continue
        accepted.append((name, data, frame_bgr, face))

    if not accepted:
        with s.lock:
            total = _template_count(s, person_id)
        return EnrollResponse(model_version=s.model_version, person_id=person_id, enrolled=0,
                              rejected=rejected, pairwise_similarity=PairwiseSimilarity(min=None, mean=None),
                              template_count=total)

    faces = [f for _, _, _, f in accepted]
    total = persist_templates(s, person_id, [fr_ for _, _, fr_, _ in accepted], faces,
                              [n for n, _, _, _ in accepted], [d for _, d, _, _ in accepted])
    sc = pairwise_self_check(np.stack([f.embedding for f in faces]))
    if not sc.ok:
        log.warning("enrol %s: pairwise min %.3f < 0.5; captures may not be the same person "
                    "or quality is poor", person_id, sc.min)
    log.info("enrolled %d image(s) for %s (%d rejected)", len(accepted), person_id, len(rejected))
    return EnrollResponse(model_version=s.model_version, person_id=person_id,
                          enrolled=len(accepted), rejected=rejected,
                          pairwise_similarity=_pairwise(sc), template_count=total)


@app.post("/recognize", response_model=RecognizeResponse)
async def recognize(request: Request, file: Annotated[UploadFile, File(description="one image")]):
    s = fr(request)
    frame_bgr = decode_image(await file.read(), file.filename or "file")
    return recognize_frame(s, frame_bgr)


@app.post("/recognize/base64", response_model=RecognizeResponse)
def recognize_base64(body: RecognizeBase64Request, request: Request):
    s = fr(request)
    b64 = body.image_b64
    if "," in b64[:64] and b64.lstrip().startswith("data:"):
        b64 = b64.split(",", 1)[1]                    # tolerate data:image/jpeg;base64,...
    try:
        data = base64.b64decode(b64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "image_b64 is not valid base64")
    return recognize_frame(s, decode_image(data, "image_b64"))


# ------------------------------------------------------------------ gallery

def _person_dir(s: AppState, person_id: str) -> Path:
    return s.config.data_dir / "enrollments" / person_id


@app.get("/gallery", response_class=HTMLResponse,
         summary="Browser page: everyone in the gallery with their enrolment photos")
def gallery_page():
    return GALLERY_HTML


@app.get("/persons/{person_id}/images", summary="Filenames of this person's enrolment photos")
def person_images(person_id: str, request: Request):
    s = fr(request)
    with s.lock:
        if s.gallery.get_person(person_id) is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "no such person")
    folder = _person_dir(s, person_id)
    names = sorted(p.name for p in folder.iterdir()
                   if p.is_file() and p.suffix.lower() in {".jpg", ".jpeg", ".png"})         if folder.is_dir() else []
    return {"person_id": person_id, "images": names}


@app.get("/persons/{person_id}/images/{filename}", response_class=Response,
         responses={200: {"content": {"image/jpeg": {}}}},
         summary="One enrolment photo")
def person_image(person_id: str, filename: str, request: Request):
    s = fr(request)
    # Resolve and confine to the person's own folder: a filename must never be
    # able to walk out of it and serve an arbitrary file from the disk.
    folder = _person_dir(s, person_id).resolve()
    target = (folder / filename).resolve()
    if not str(target).startswith(str(folder) + os.sep) or not target.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no such image")
    media = "image/png" if target.suffix.lower() == ".png" else "image/jpeg"
    return Response(content=target.read_bytes(), media_type=media,
                    headers={"Cache-Control": "no-store"})


# ----------------------------------------------------------------- live view

# Long enough for an RTSP connect (RTSP_OPEN_TIMEOUT_MS) plus the first
# keyframe, short enough that a browser tile fails visibly instead of hanging.
FIRST_FRAME_TIMEOUT_S = 12.0
# A live stream that goes this long without a frame is finished, not slow.
STALLED_STREAM_TIMEOUT_S = 15.0
# ...unless the camera is being reconnected, which is an ordinary event on a
# system that runs continuously: a DVR reboot, a dropped link, a recorder
# closing an idle session. The grabber retries with a growing backoff, so the
# viewer is held through it and sees a pause instead of a broken tile. Only
# after this much unsuccessful reconnecting is the stream given up on.
RECONNECTING_GRACE_S = 120.0


async def mjpeg_response(request: Request, worker: JpegWorker) -> StreamingResponse:
    # Wait for the first frame, then answer honestly.
    #
    # This MUST 503 when no frame arrived, not just when the worker already
    # died. Returning 200 with a body that never produces anything leaves the
    # browser holding an <img> that fires neither load nor error; a handful of
    # dead tiles then exhaust the per-origin connection limit and every other
    # request on the page queues behind them.
    deadline = time.monotonic() + FIRST_FRAME_TIMEOUT_S
    while worker.latest is None and worker.alive and time.monotonic() < deadline:
        await asyncio.sleep(0.05)
    if worker.latest is None:
        worker.stop()
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,
                            worker.error or "camera produced no frames")

    async def gen():
        worker.viewers += 1
        worker.last_viewer_t = time.monotonic()
        last_frame_t = time.monotonic()
        try:
            while not await request.is_disconnected():
                frame = await asyncio.to_thread(worker.next_frame, 2.0)
                if frame is None:
                    # End a stalled stream rather than holding the connection
                    # open forever: the tile can then show an error and retry.
                    # A camera that is mid-reconnect gets much longer, because
                    # it is expected to come back.
                    hub = getattr(worker, "hub", None)
                    reconnecting = hub is not None and not hub.connected and hub.alive
                    limit = RECONNECTING_GRACE_S if reconnecting else STALLED_STREAM_TIMEOUT_S
                    if not worker.alive or time.monotonic() - last_frame_t > limit:
                        break
                    continue
                last_frame_t = time.monotonic()
                yield mjpeg_chunk(frame)
                if not worker.alive:
                    break
        finally:
            worker.viewers -= 1
            worker.last_viewer_t = time.monotonic()

    return StreamingResponse(gen(), media_type="multipart/x-mixed-replace; boundary=frame",
                             headers={"Cache-Control": "no-cache"})


@app.get("/live", response_class=HTMLResponse, summary="Browser page showing the annotated live feed")
def live_page(request: Request,
              source: str | None = Query(None, description="webcam index or RTSP URL")):
    src = source if source is not None else str(fr(request).config.video.source)
    return LIVE_HTML.replace("SOURCE", src)


@app.get("/stream", summary="MJPEG stream of the annotated live feed (same loop as scripts/live_demo.py)")
async def stream(request: Request,
                 source: str | None = Query(None, description="webcam index or RTSP URL")):
    s = fr(request)
    src: str | int = source if source is not None else s.config.video.source
    return await mjpeg_response(request, s.live_for(src))


# ---------------------------------------------------------- webcam enrolment

def _person_name_or_404(s: AppState, person_id: str) -> str:
    with s.lock:
        p = s.gallery.get_person(person_id)
    if p is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no such person")
    return p.name


def _session_or_404(s: AppState, person_id: str) -> EnrollSession:
    sess = s.enroll_session(person_id)
    if sess is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND,
                            "no enrolment session for this person; POST .../enroll/webcam/start first")
    return sess


@app.get("/enroll/{person_id}", response_class=HTMLResponse,
         summary="Browser page: enrol this person from the camera")
def enroll_page(person_id: str, request: Request,
                source: str | None = Query(None, description="webcam index or RTSP URL")):
    s = fr(request)
    name = _person_name_or_404(s, person_id)
    src = source if source is not None else str(s.config.video.source)
    return (ENROLL_HTML.replace("PERSON_ID", person_id).replace("PERSON_NAME", name)
            .replace("SOURCE", src).replace("N_REQUIRED", str(s.config.enrollment.images_per_person)))


@app.post("/persons/{person_id}/enroll/webcam/start", response_model=WebcamEnrollStatus,
          summary="Open the camera and start a capture session for this person")
def webcam_start(person_id: str, request: Request,
                 source: str | None = Query(None), auto_capture: bool = Query(True),
                 images: int | None = Query(None, ge=1, le=MAX_ENROLL_FILES,
                                            description="captures required (default from config)")):
    s = fr(request)
    name = _person_name_or_404(s, person_id)
    src: str | int = source if source is not None else s.config.video.source
    n = images or s.config.enrollment.images_per_person
    sess = s.start_enroll(person_id, name, src, n, auto_capture)
    log.info("webcam enrol started for %s (%s) on %r", person_id, name, src)
    return sess.status_out()


@app.get("/persons/{person_id}/enroll/webcam/stream", summary="MJPEG preview of the capture session")
async def webcam_stream(person_id: str, request: Request):
    s = fr(request)
    return await mjpeg_response(request, _session_or_404(s, person_id))


@app.get("/persons/{person_id}/enroll/webcam/status", response_model=WebcamEnrollStatus)
def webcam_status(person_id: str, request: Request):
    return _session_or_404(fr(request), person_id).status_out()


@app.post("/persons/{person_id}/enroll/webcam/capture", response_model=WebcamEnrollStatus,
          summary="Capture now (next frame that passes quality)")
def webcam_capture(person_id: str, request: Request):
    sess = _session_or_404(fr(request), person_id)
    sess.capture.request_capture()
    time.sleep(0.4)                                   # let the next frame be processed
    return sess.status_out()


@app.post("/persons/{person_id}/enroll/webcam/undo", response_model=WebcamEnrollStatus,
          summary="Drop the most recent capture")
def webcam_undo(person_id: str, request: Request):
    sess = _session_or_404(fr(request), person_id)
    with fr(request).lock:
        sess.capture.drop_last()
    return sess.status_out()


@app.post("/persons/{person_id}/enroll/webcam/finish", response_model=EnrollResponse,
          summary="Run the self-check and write the captures to the gallery")
def webcam_finish(person_id: str, request: Request,
                  force: bool = Query(False, description="enrol even if the self-check fails")):
    s = fr(request)
    sess = _session_or_404(s, person_id)
    with s.lock:
        captures = list(sess.capture.captures)
    n_min = s.config.enrollment.min_images
    if len(captures) < n_min:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"only {len(captures)} capture(s); need at least {n_min}")
    sc = pairwise_self_check(np.stack([c.face.embedding for c in captures]))
    if not sc.ok and not force:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"self-check failed: min pairwise similarity {sc.min:.3f} < 0.5. Same-person captures "
            f"should be ~0.6+; retake (undo / restart) or pass ?force=true to enrol anyway.")

    total = persist_templates(s, person_id, [c.frame_bgr for c in captures],
                              [c.face for c in captures], [f"cap{i}.jpg" for i in range(len(captures))],
                              [None] * len(captures))
    resp = EnrollResponse(model_version=s.model_version, person_id=person_id,
                          enrolled=len(captures), rejected=[], pairwise_similarity=_pairwise(sc),
                          template_count=total)
    sess.finished = resp
    sess.stop()
    with s.workers_lock:                              # a second /finish must not re-save
        if s.enroll_sessions.get(person_id) is sess:
            del s.enroll_sessions[person_id]
    log.info("webcam enrol finished for %s: %d templates (pairwise min %s)",
             person_id, len(captures), _r(sc.min))
    return resp


@app.delete("/persons/{person_id}/enroll/webcam", status_code=status.HTTP_204_NO_CONTENT,
            summary="Cancel the capture session without saving")
def webcam_cancel(person_id: str, request: Request):
    s = fr(request)
    with s.workers_lock:
        sess = s.enroll_sessions.pop(person_id, None)
    if sess:
        sess.stop()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/snapshots/{rel:path}", summary="The face image saved with a detection")
def snapshot_file(rel: str, request: Request):
    """Serve one saved sighting.

    `rel` arrives from a URL and is therefore untrusted; the resolver refuses
    anything that escapes the snapshot directory.
    """
    from api import snapshots as _snapshots
    path = _snapshots.resolve(fr(request).config.data_dir, rel)
    if path is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no such snapshot")
    return Response(path.read_bytes(), media_type="image/jpeg",
                    headers={"Cache-Control": "public, max-age=86400"})


# --------------------------------------------------------------- monitors

@app.post("/monitor", summary="Watch a camera continuously, with or without a viewer")
def monitor_start(body: MonitorIn, request: Request):
    """Start unattended recognition on a camera.

    The monitor shares the capture with anyone watching the same camera, so
    this costs no extra connection to the recorder and no second decode. It
    is idempotent: asking twice returns the monitor already running.
    """
    s = fr(request)
    s.monitors.prune()
    return s.monitors.start(body.camera_id, body.source, body.zone)


@app.get("/monitor", summary="What is being watched, and how it is doing")
def monitor_list(request: Request):
    s = fr(request)
    s.monitors.prune()
    return {"model_version": s.model_version, "monitors": s.monitors.status()}


@app.delete("/monitor/{camera_id}", summary="Stop watching a camera")
def monitor_stop(camera_id: str, request: Request):
    s = fr(request)
    if not s.monitors.stop(camera_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no monitor for that camera")
    return {"camera_id": camera_id, "stopped": True}


# ------------------------------------------------------------------- DVR

@app.post("/camera/probe", response_model=CameraProbeOut,
          summary="Test one RTSP source without persisting or returning its credentials")
def camera_probe(body: CameraProbeIn, request: Request):
    s = fr(request)
    probe, frame = probe_rtsp(body.source)
    if probe.ok and body.detect and frame is not None:
        with s.lock:
            probe.faces = len(s.engine.detect_and_embed(frame))
    return CameraProbeOut(model_version=s.model_version, ok=probe.ok, width=probe.width,
                          height=probe.height, fps=probe.fps, seconds=probe.seconds,
                          error=probe.error, faces=probe.faces)

def _dvr_out(s: AppState) -> DVROut:
    d = s.dvr
    if d is None:
        return DVROut(model_version=s.model_version, configured=False)
    return DVROut(model_version=s.model_version, configured=True, host=d.host, port=d.port,
                  username=d.username, brand=d.brand, channels=d.channels, stream=d.stream,
                  name=d.name, example_url=d.masked_url(1))


def _dvr_or_404(s: AppState) -> DVRConfig:
    if s.dvr is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no DVR configured; POST /dvr first")
    return s.dvr


@app.get("/dvr", response_model=DVROut, summary="Current DVR connection (password never returned)")
def dvr_get(request: Request):
    return _dvr_out(fr(request))


@app.post("/dvr", response_model=DVROut, summary="Set the DVR/NVR to connect to (IP, user, password, brand)")
def dvr_set(body: DVRIn, request: Request):
    s = fr(request)
    dvr = DVRConfig(**body.model_dump())
    try:
        dvr.rtsp_url(1)                                # validates brand / template
    except (ValueError, KeyError, IndexError) as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"bad brand/url_template: {e}")
    save_dvr(s.config, dvr)
    s.dvr = dvr
    # Any hubs opened with old credentials should be re-created.
    with s.workers_lock:
        for key in [k for k in s.hubs if k.lower().startswith("dvr:")]:
            s.hubs.pop(key).stop()
    log.info("DVR configured: %s@%s:%d brand=%s channels=%d stream=%s",
             dvr.username, dvr.host, dvr.port, dvr.brand, dvr.channels, dvr.stream)
    return _dvr_out(s)


@app.delete("/dvr", status_code=status.HTTP_204_NO_CONTENT, summary="Forget the DVR credentials")
def dvr_delete(request: Request):
    s = fr(request)
    clear_dvr(s.config)
    s.dvr = None
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/dvr/brands", summary="Known RTSP URL patterns")
def dvr_brands():
    return {k: v for k, v in URL_TEMPLATES.items() if v}


@app.get("/dvr/channels", response_model=DVRChannelsOut,
         summary="Probe every channel: opens each stream, grabs a frame, reports resolution")
def dvr_channels(request: Request,
                 detect: bool = Query(False, description="also run face detection on the frame"),
                 timeout: float = Query(6.0, ge=1, le=30),
                 first: int = Query(1, ge=1), last: int | None = Query(None, ge=1)):
    s = fr(request)
    dvr = _dvr_or_404(s)
    last = last or dvr.channels
    chans = list(range(first, last + 1))

    def one(ch: int) -> ChannelOut:
        probe, frame = probe_channel(dvr, ch, timeout)
        if probe.ok and detect and frame is not None:
            with s.lock:
                probe.faces = len(s.engine.detect_and_embed(frame))
        return ChannelOut(source=f"dvr:{ch}", url_masked=dvr.masked_url(ch), **probe.__dict__)

    with ThreadPoolExecutor(max_workers=min(8, len(chans))) as ex:
        out = list(ex.map(one, chans))
    log.info("DVR probe %s: %d/%d channels ok", dvr.host, sum(c.ok for c in out), len(out))
    return DVRChannelsOut(model_version=s.model_version, host=dvr.host, stream=dvr.stream, channels=out)


@app.get("/dvr/channels/{channel}/snapshot.jpg", summary="One JPEG frame from a channel",
         response_class=Response, responses={200: {"content": {"image/jpeg": {}}}})
def dvr_snapshot(channel: int, request: Request,
                 annotate: bool = Query(False, description="draw recognition results on the frame"),
                 stream: str | None = Query(None, pattern="^(main|sub)$")):
    s = fr(request)
    dvr = _dvr_or_404(s)
    probe, frame = probe_channel(dvr, channel, 6.0, stream)
    if not probe.ok or frame is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, f"channel {channel}: {probe.error}")
    if annotate:
        live = LiveRecognizer(s.engine, s.gallery, s.config, footer=dvr.label(channel, stream))
        live.every_n = 1
        with s.lock:
            frame = live.process(frame)
    ok, jpg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return Response(content=jpg.tobytes(), media_type="image/jpeg",
                    headers={"Cache-Control": "no-store"})


@app.get("/dvr/setup", response_class=HTMLResponse, summary="Browser page: connect a DVR and check its channels")
def dvr_page():
    return DVR_HTML
