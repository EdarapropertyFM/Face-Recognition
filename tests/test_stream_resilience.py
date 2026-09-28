"""The grabber must survive anything a camera does to it.

This service runs continuously. A feed is interrupted for ordinary reasons --
the DVR reboots after a firmware update, a switch drops a link, the recorder
closes an idle session -- and none of them should end a stream permanently.

Before this, one failed read ended the grabber thread for good: the camera
stayed dark until somebody restarted the service.
"""
import threading
import time

import numpy as np
import pytest

from api import streams


class FakeCapture:
    """A capture that fails on demand, so failure paths can be exercised."""

    def __init__(self, frames_before_failure=3, opened=True):
        self.frames_before_failure = frames_before_failure
        self._opened = opened
        self.released = False
        self.reads = 0

    def isOpened(self):
        return self._opened

    def read(self):
        self.reads += 1
        if self.reads > self.frames_before_failure:
            return False, None                       # the camera goes away
        return True, np.zeros((4, 4, 3), dtype=np.uint8)

    def get(self, _prop):
        return 0.0

    def release(self):
        self.released = True


@pytest.fixture(autouse=True)
def fast_reconnect(monkeypatch):
    """Keep the test quick without changing the behaviour being tested."""
    monkeypatch.setattr(streams, "RECONNECT_DELAY_S", 0.01)
    monkeypatch.setattr(streams, "RECONNECT_MAX_DELAY_S", 0.05)


def test_reconnects_after_the_camera_drops(monkeypatch):
    """A failed read reopens the capture instead of ending the thread."""
    opened = []

    def fake_open(_source):
        cap = FakeCapture(frames_before_failure=2)
        opened.append(cap)
        return cap

    monkeypatch.setattr(streams, "open_source", fake_open)
    hub = streams.CameraHub("rtsp://camera/1", "test-cam")
    hub.attach()                                     # a viewer keeps it wanted
    try:
        # Wait on the captures themselves: reconnects is incremented just
        # before the next open, so counting on it races the reopen.
        deadline = time.monotonic() + 5
        while len(opened) < 3 and time.monotonic() < deadline:
            time.sleep(0.02)
        assert len(opened) >= 3, "each reconnect opens a fresh capture"
        assert hub.reconnects >= 2, "should have reconnected repeatedly"
        assert hub.alive, "the grabber thread must stay alive across reconnects"
        assert all(cap.released for cap in opened[:-1]), "old captures are released"
    finally:
        hub.detach()
        hub.stop()


def test_keeps_retrying_while_the_camera_is_unreachable(monkeypatch):
    """A DVR that is down is retried, not written off."""
    attempts = []

    def fake_open(_source):
        attempts.append(time.monotonic())
        raise RuntimeError("cannot open video source")

    monkeypatch.setattr(streams, "open_source", fake_open)
    hub = streams.CameraHub("rtsp://camera/1", "down-cam")
    hub.attach()
    try:
        deadline = time.monotonic() + 5
        while len(attempts) < 3 and time.monotonic() < deadline:
            time.sleep(0.02)
        assert len(attempts) >= 3, "must keep retrying an unreachable camera"
        assert hub.alive
        assert not hub.connected
        assert hub.error                              # and say why
    finally:
        hub.detach()
        hub.stop()


def test_recovers_and_serves_frames_again(monkeypatch):
    """After a blip the hub produces frames again, with a new sequence."""
    state = {"fail_next": True}

    def fake_open(_source):
        if state["fail_next"]:
            state["fail_next"] = False
            raise RuntimeError("temporarily unreachable")
        return FakeCapture(frames_before_failure=10_000)

    monkeypatch.setattr(streams, "open_source", fake_open)
    hub = streams.CameraHub("rtsp://camera/1", "flaky-cam")
    hub.attach()
    try:
        frame, seq = hub.wait_frame(0, timeout=5.0)
        assert frame is not None, "should deliver frames once the camera returns"
        assert seq > 0
        assert hub.connected
    finally:
        hub.detach()
        hub.stop()


def test_a_finished_video_file_is_not_looped(monkeypatch, tmp_path):
    """Reopening a recording that ended would replay it forever."""
    path = tmp_path / "clip.mp4"
    path.write_bytes(b"not really a video")
    monkeypatch.setattr(streams, "open_source", lambda _s: FakeCapture(frames_before_failure=1))

    hub = streams.CameraHub(str(path), "file")
    hub.attach()
    try:
        deadline = time.monotonic() + 3
        while hub.alive and time.monotonic() < deadline:
            time.sleep(0.02)
        assert not hub.alive, "a finished file should stop, not restart"
        assert hub.reconnects == 0
    finally:
        hub.detach()
        hub.stop()


def test_stop_ends_the_thread_promptly(monkeypatch):
    """Shutdown must not wait out a reconnection backoff."""
    monkeypatch.setattr(streams, "open_source",
                        lambda _s: (_ for _ in ()).throw(RuntimeError("down")))
    hub = streams.CameraHub("rtsp://camera/1", "stopping")
    hub.attach()
    time.sleep(0.05)
    hub.detach()
    hub.stop()
    hub._thread.join(timeout=3)
    assert not hub._thread.is_alive(), "stop() must interrupt the retry wait"


def test_idle_camera_is_released(monkeypatch):
    """With nobody watching, the camera is handed back after the grace."""
    monkeypatch.setattr(streams, "open_source", lambda _s: FakeCapture(frames_before_failure=10_000))
    monkeypatch.setattr(streams, "idle_grace", lambda _s: 0.05)
    hub = streams.CameraHub("rtsp://camera/1", "idle-cam")
    try:
        deadline = time.monotonic() + 3
        while hub.alive and time.monotonic() < deadline:
            time.sleep(0.02)
        assert not hub.alive, "an unwatched camera should not be held open forever"
    finally:
        hub.stop()


def test_threads_do_not_accumulate(monkeypatch):
    """Reconnecting reuses one thread rather than spawning them."""
    monkeypatch.setattr(streams, "open_source", lambda _s: FakeCapture(frames_before_failure=1))
    before = threading.active_count()
    hub = streams.CameraHub("rtsp://camera/1", "counter")
    hub.attach()
    try:
        deadline = time.monotonic() + 3
        while hub.reconnects < 4 and time.monotonic() < deadline:
            time.sleep(0.02)
        assert hub.reconnects >= 4
        assert threading.active_count() <= before + 2, "one grabber thread, not one per retry"
    finally:
        hub.detach()
        hub.stop()
