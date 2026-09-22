"""Pydantic request/response models for the API (spec §6).

Every response carries model_version: embeddings from different models are
not comparable and a mismatched gallery is confusing to debug without it.
"""
from __future__ import annotations

from pydantic import BaseModel as _BaseModel, ConfigDict, Field

from .matcher import Decision


class BaseModel(_BaseModel):
    # Our responses carry a field literally named model_version; tell
    # pydantic not to treat the model_ prefix as reserved.
    model_config = ConfigDict(protected_namespaces=())


class HealthResponse(BaseModel):
    status: str
    model_version: str
    gallery_size: int                       # template vectors
    person_count: int
    thresholds: dict[str, float]


class PersonOut(BaseModel):
    person_id: str
    name: str
    role: str
    status: str
    created_at: str
    template_count: int


class PersonListResponse(BaseModel):
    model_version: str
    persons: list[PersonOut]


class PersonCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    role: str = Field(default="resident", min_length=1, max_length=50)


class PersonCreateResponse(BaseModel):
    model_version: str
    person_id: str


class QualityOut(BaseModel):
    face_width_px: int
    blur_score: float
    yaw_deg: float
    pitch_deg: float
    passed: bool
    reasons: list[str]


class RejectedImage(BaseModel):
    filename: str
    reasons: list[str]


class PairwiseSimilarity(BaseModel):
    min: float | None                       # None when fewer than 2 images enrolled
    mean: float | None


class EnrollResponse(BaseModel):
    model_version: str
    person_id: str
    enrolled: int
    rejected: list[RejectedImage]
    pairwise_similarity: PairwiseSimilarity
    template_count: int                     # total for this person after enrol


class WebcamEnrollStatus(BaseModel):
    model_version: str
    person_id: str
    active: bool                            # camera session running
    captured: int
    required: int
    done: bool                              # captured >= required
    status: str                             # live on-screen status / rejection hint
    guidance: str                           # current pose prompt
    auto_capture: bool
    self_check: PairwiseSimilarity          # over captures so far
    self_check_ok: bool
    error: str | None
    finished: EnrollResponse | None         # set after /finish


class DVRIn(BaseModel):
    host: str = Field(min_length=1, description="DVR/NVR IP or hostname")
    username: str = Field(min_length=1)
    password: str
    port: int = Field(default=554, ge=1, le=65535)
    brand: str = Field(default="hikvision", description="hikvision | dahua | uniview | xmeye | custom")
    channels: int = Field(default=8, ge=1, le=64)
    stream: str = Field(default="sub", pattern="^(main|sub)$",
                        description="sub = lower-res stream (recommended for detection)")
    url_template: str = Field(default="", description="custom brand only; {user} {pass} {host} {port} {ch} {sub}")
    name: str = ""


class DVROut(BaseModel):
    model_version: str
    configured: bool
    host: str | None = None
    port: int | None = None
    username: str | None = None
    brand: str | None = None
    channels: int | None = None
    stream: str | None = None
    name: str | None = None
    example_url: str | None = None          # channel 1, password masked
    source_syntax: str = "use dvr:<channel> or dvr:<channel>:main as a source anywhere"


class ChannelOut(BaseModel):
    channel: int
    source: str                             # e.g. "dvr:3"
    ok: bool
    width: int
    height: int
    fps: float
    seconds: float
    error: str | None
    faces: int | None
    url_masked: str


class DVRChannelsOut(BaseModel):
    model_version: str
    host: str
    stream: str
    channels: list[ChannelOut]


class FaceOut(BaseModel):
    bbox: list[int]                         # x1, y1, x2, y2
    det_score: float
    decision: Decision
    person_id: str | None
    name: str | None
    similarity: float
    runner_up_gap: float | None
    runner_up_name: str | None
    reason: str
    quality: QualityOut


class RecognizeResponse(BaseModel):
    model_version: str
    image_size: list[int]                   # width, height
    faces: list[FaceOut]


class RecognizeBase64Request(BaseModel):
    image_b64: str = Field(description="Base64-encoded JPEG/PNG; a data: URL prefix is tolerated")
