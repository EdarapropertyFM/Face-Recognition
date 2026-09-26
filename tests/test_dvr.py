import pytest

from facerec.config import Config
from facerec.dvr import (
    URL_TEMPLATES, DVRConfig, clear_dvr, dvr_path, load_dvr, resolve_source, save_dvr,
)


def test_hikvision_urls():
    d = DVRConfig(host="10.0.0.5", username="admin", password="p@ss:word/1", brand="hikvision")
    assert d.rtsp_url(1) == "rtsp://admin:p%40ss%3Aword%2F1@10.0.0.5:554/Streaming/Channels/102"
    assert d.rtsp_url(3, "main") == "rtsp://admin:p%40ss%3Aword%2F1@10.0.0.5:554/Streaming/Channels/301"
    assert "p%40ss" not in d.masked_url(1) and "*****" in d.masked_url(1)
    assert d.label(3) == "dvr 10.0.0.5 ch3 sub"


def test_dahua_and_uniview_urls():
    d = DVRConfig(host="h", username="u", password="p", brand="dahua", stream="main")
    assert d.rtsp_url(2) == "rtsp://u:p@h:554/cam/realmonitor?channel=2&subtype=0"
    assert d.rtsp_url(2, "sub").endswith("subtype=1")
    d = DVRConfig(host="h", username="u", password="p", brand="uniview", port=8554)
    assert d.rtsp_url(4) == "rtsp://u:p@h:8554/unicast/c4/s1/live"


def test_custom_template_and_bad_brand():
    d = DVRConfig(host="h", username="u", password="p", brand="custom",
                  url_template="rtsp://{user}:{pass}@{host}:{port}/ch{ch}/{sub}")
    assert d.rtsp_url(7) == "rtsp://u:p@h:554/ch7/1"
    with pytest.raises(ValueError):
        DVRConfig(host="h", username="u", password="p", brand="nope").rtsp_url(1)
    with pytest.raises(ValueError):
        DVRConfig(host="h", username="u", password="p", brand="custom").rtsp_url(1)


def test_persist_round_trip(tmp_path):
    cfg = Config(data_dir=tmp_path)
    assert load_dvr(cfg) is None
    save_dvr(cfg, DVRConfig(host="h", username="u", password="p", channels=4, name="Lobby"))
    d = load_dvr(cfg)
    assert d.host == "h" and d.channels == 4 and d.name == "Lobby"
    clear_dvr(cfg)
    assert load_dvr(cfg) is None


def test_resolve_source(tmp_path):
    cfg = Config(data_dir=tmp_path)
    assert resolve_source("0", cfg) == (0, "webcam 0")
    assert resolve_source(1, cfg) == (1, "webcam 1")
    src, label = resolve_source("rtsp://u:secret@h/x", cfg)
    assert src == "rtsp://u:secret@h/x" and "secret" not in label
    with pytest.raises(ValueError, match="no DVR"):
        resolve_source("dvr:1", cfg)
    save_dvr(cfg, DVRConfig(host="h", username="u", password="p", brand="dahua"))
    src, label = resolve_source("dvr:3", cfg)
    assert src == "rtsp://u:p@h:554/cam/realmonitor?channel=3&subtype=1"
    assert label == "dvr h ch3 sub"
    src, _ = resolve_source("DVR:3:main", cfg)
    assert src.endswith("subtype=0")


def test_backend_templates_match_python():
    """The NestJS backend builds camera RTSP URLs from its own copy of these
    templates (backend/src/cameras/rtsp-url.ts). A drift between the two means
    the software writes a URL the AI could never have produced, and the only
    symptom is a camera that silently never connects."""
    import re
    from pathlib import Path

    ts = Path(__file__).resolve().parents[1] / "backend" / "src" / "cameras" / "rtsp-url.ts"
    if not ts.exists():
        pytest.skip("backend not present in this checkout")
    source = ts.read_text(encoding="utf-8")

    for brand, expected in URL_TEMPLATES.items():
        found = re.search(rf"^\s*{brand}: '([^']*)'", source, re.MULTILINE)
        assert found, f"brand {brand!r} is missing from rtsp-url.ts"
        # Python uses {sub1} via str.format; the TS copy spells it the same way.
        assert found.group(1) == expected, (
            f"template drift for {brand!r}:\n  python: {expected}\n  ts    : {found.group(1)}")


def test_tvt_urls():
    d = DVRConfig(host="h", username="u", password="p", brand="tvt")
    assert d.rtsp_url(2) == "rtsp://u:p@h:554/chID=2&streamType=sub"
    assert d.rtsp_url(2, "main").endswith("streamType=main")


def test_unreadable_dvr_file_does_not_break_startup(tmp_path):
    """A truncated or corrupt dvr.json must not abort the whole service.
    This actually happened: the file was left 0 bytes by a kill mid-write, and
    the AI refused to boot — no recognition, no enrolment, no cameras."""
    cfg = Config(data_dir=tmp_path)
    path = dvr_path(cfg)

    for broken in ["", "   ", "{not json", '"a string"', '{"host": "h"}']:
        path.write_text(broken, encoding="utf-8")
        assert load_dvr(cfg) is None, f"should ignore {broken!r}"

    # A good file still loads.
    save_dvr(cfg, DVRConfig(host="h", username="u", password="p"))
    assert load_dvr(cfg).host == "h"


def test_save_dvr_is_atomic(tmp_path):
    """Written via a temp file and renamed, so an interrupted save can never
    leave a half-written or empty dvr.json in place."""
    cfg = Config(data_dir=tmp_path)
    save_dvr(cfg, DVRConfig(host="first", username="u", password="p"))
    original = dvr_path(cfg).read_text(encoding="utf-8")

    save_dvr(cfg, DVRConfig(host="second", username="u", password="p"))
    assert load_dvr(cfg).host == "second"
    assert original != dvr_path(cfg).read_text(encoding="utf-8")
    # No temp file left behind.
    assert not list(tmp_path.glob("*.tmp"))


def test_open_source_uses_rtsp_timeouts(monkeypatch, tmp_path):
    """open_source built its own VideoCapture and so ignored open_rtsp's
    connect/read timeouts. FFmpeg then fell back to its 30 s default: an
    unreachable camera held a grabber thread for half a minute after the
    request had already returned 503, and the threads piled up per request."""
    from facerec import live

    called = {}

    class FakeCapture:
        def isOpened(self):
            return True

    def fake_open_rtsp(url):
        called["url"] = url
        return FakeCapture()

    import facerec.dvr as dvr_module
    monkeypatch.setattr(dvr_module, "open_rtsp", fake_open_rtsp)
    monkeypatch.setattr(live, "load_config", lambda: Config(data_dir=tmp_path), raising=False)

    cfg = Config(data_dir=tmp_path)
    assert isinstance(live.open_source("rtsp://u:p@h/x", cfg), FakeCapture)
    assert called["url"] == "rtsp://u:p@h/x"
