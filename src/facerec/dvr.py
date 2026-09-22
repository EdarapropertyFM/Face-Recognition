"""DVR / NVR connection via RTSP.

A DVR exposes each camera channel as an RTSP stream at a brand-specific URL,
authenticated with the DVR's own username/password. This module builds
those URLs, probes channels, and resolves the shorthand source "dvr:<ch>"
so credentials never appear on the command line, in pages, or in logs.

Settings persist to data/dvr.json (git-ignored). The password is stored in
plain text there: acceptable for a prototype on one laptop, not beyond.
"""
from __future__ import annotations

import json
import os
import re
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from urllib.parse import quote

import cv2

from .config import Config

# Ask FFmpeg to use RTSP over TCP. UDP (the default) drops packets on Wi-Fi
# and busy LANs, which shows up as grey smears and "frame grab failed".
# OpenCV only honours this variable if it is set before the process starts
# (or before cv2 loads), so it is also documented in the README.
os.environ.setdefault("OPENCV_FFMPEG_CAPTURE_OPTIONS", "rtsp_transport;tcp")

RTSP_OPEN_TIMEOUT_MS = 5000       # unreachable DVR fails in ~5 s instead of ~30 s
RTSP_READ_TIMEOUT_MS = 5000


def open_rtsp(url: str) -> cv2.VideoCapture:
    """VideoCapture for an RTSP URL with bounded connect/read timeouts."""
    return cv2.VideoCapture(url, cv2.CAP_FFMPEG, [
        cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, RTSP_OPEN_TIMEOUT_MS,
        cv2.CAP_PROP_READ_TIMEOUT_MSEC, RTSP_READ_TIMEOUT_MS,
    ])

# {user} {pass} {host} {port} {ch} {sub}   sub = 0 main stream, 1 sub stream
URL_TEMPLATES: dict[str, str] = {
    # Hikvision / HiLook / Ezviz / many rebrands. Channel 1 main = 101, sub = 102.
    "hikvision": "rtsp://{user}:{pass}@{host}:{port}/Streaming/Channels/{ch}0{sub1}",
    # Dahua / Imou / Amcrest / Lorex / many rebrands.
    "dahua": "rtsp://{user}:{pass}@{host}:{port}/cam/realmonitor?channel={ch}&subtype={sub}",
    # Uniview / UNV.
    "uniview": "rtsp://{user}:{pass}@{host}:{port}/unicast/c{ch}/s{sub}/live",
    # XMeye / generic Chinese DVRs (H.264 DVR boards).
    "xmeye": "rtsp://{user}:{pass}@{host}:{port}/user={user}&password={pass}&channel={ch}&stream={sub}.sdp?",
    # Anything else: supply url_template yourself.
    "custom": "",
}

DVR_SOURCE_RE = re.compile(r"^dvr:(\d+)(?::(main|sub))?$", re.IGNORECASE)


@dataclass
class DVRConfig:
    host: str
    username: str
    password: str
    port: int = 554
    brand: str = "hikvision"
    channels: int = 8
    stream: str = "sub"                # "sub" for detection (cheaper); "main" for full res
    url_template: str = ""             # only for brand == "custom"
    name: str = ""

    def template(self) -> str:
        t = self.url_template if self.brand == "custom" else URL_TEMPLATES.get(self.brand, "")
        if not t:
            raise ValueError(f"no URL template for brand {self.brand!r}; "
                             f"use one of {sorted(k for k in URL_TEMPLATES if k != 'custom')} "
                             f"or brand='custom' with url_template")
        return t

    def rtsp_url(self, channel: int, stream: str | None = None) -> str:
        stream = (stream or self.stream).lower()
        sub = 0 if stream == "main" else 1
        return self.template().format(
            user=quote(self.username, safe=""), **{"pass": quote(self.password, safe="")},
            host=self.host, port=self.port, ch=channel, sub=sub, sub1=sub + 1)

    def label(self, channel: int, stream: str | None = None) -> str:
        """Human-readable, credential-free description for HUDs and logs."""
        return f"dvr {self.name or self.host} ch{channel} {stream or self.stream}"

    def masked_url(self, channel: int, stream: str | None = None) -> str:
        return self.rtsp_url(channel, stream).replace(quote(self.password, safe=""), "*****")


@dataclass
class ChannelProbe:
    channel: int
    ok: bool
    width: int = 0
    height: int = 0
    fps: float = 0.0
    seconds: float = 0.0
    error: str | None = None
    faces: int | None = None           # filled by the API if asked to detect


def probe_channel(dvr: DVRConfig, channel: int, timeout_s: float = 6.0,
                  stream: str | None = None) -> tuple[ChannelProbe, "cv2.typing.MatLike | None"]:
    """Open the channel, grab one frame, report resolution. Returns the
    frame too (BGR) so callers can show a snapshot or run detection."""
    url = dvr.rtsp_url(channel, stream)
    t0 = time.monotonic()
    cap = open_rtsp(url)
    frame = None
    try:
        if not cap.isOpened():
            return ChannelProbe(channel, False, seconds=round(time.monotonic() - t0, 2),
                                error="cannot open stream (wrong URL/brand, credentials, "
                                      "channel not present, or RTSP disabled on the DVR)"), None
        while time.monotonic() - t0 < timeout_s:
            ok, frame = cap.read()
            if ok and frame is not None:
                break
        if frame is None:
            return ChannelProbe(channel, False, seconds=round(time.monotonic() - t0, 2),
                                error="stream opened but no frame arrived"), None
        h, w = frame.shape[:2]
        return ChannelProbe(channel, True, width=w, height=h,
                            fps=round(cap.get(cv2.CAP_PROP_FPS) or 0.0, 1),
                            seconds=round(time.monotonic() - t0, 2)), frame
    finally:
        cap.release()


# ------------------------------------------------------------ persistence

def dvr_path(cfg: Config) -> Path:
    return cfg.data_dir / "dvr.json"


def load_dvr(cfg: Config) -> DVRConfig | None:
    p = dvr_path(cfg)
    if not p.exists():
        return None
    return DVRConfig(**json.loads(p.read_text(encoding="utf-8")))


def save_dvr(cfg: Config, dvr: DVRConfig) -> None:
    p = dvr_path(cfg)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(asdict(dvr), indent=2), encoding="utf-8")


def clear_dvr(cfg: Config) -> None:
    p = dvr_path(cfg)
    if p.exists():
        p.unlink()


# --------------------------------------------------------- source shorthand

def resolve_source(source: str | int, cfg: Config,
                   dvr: DVRConfig | None = None) -> tuple[str | int, str]:
    """Turn a user-facing source into (what to open, credential-free label).

    "0" / 0            -> webcam index
    "dvr:3"            -> RTSP URL for DVR channel 3 (configured stream)
    "dvr:3:main"       -> same, forcing the main stream
    anything else      -> passed through (rtsp://..., file path)
    """
    s = str(source)
    m = DVR_SOURCE_RE.match(s)
    if m:
        dvr = dvr or load_dvr(cfg)
        if dvr is None:
            raise ValueError("source uses dvr:<channel> but no DVR is configured "
                             "(POST /dvr or scripts.dvr_setup)")
        ch, stream = int(m.group(1)), m.group(2)
        return dvr.rtsp_url(ch, stream), dvr.label(ch, stream)
    if s.isdigit():
        return int(s), f"webcam {s}"
    # Hide any inline rtsp password in the label.
    return source, re.sub(r"://([^:/@]+):[^@]+@", r"://\1:*****@", s)
