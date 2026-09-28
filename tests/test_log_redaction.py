"""The DVR password must never reach a log file."""
import logging

from api.log_redaction import RedactCredentialsFilter, scrub

PASSWORD = "WTR@Sodic195"


def test_scrubs_a_plain_rtsp_url():
    url = "rtsp://admin:WTR@Sodic195@192.168.253.64:554/Streaming/Channels/102"
    out = scrub(url)
    assert PASSWORD not in out
    assert out.startswith("rtsp://admin:*****@")


def test_scrubs_the_percent_encoded_query_string():
    """The real leak: uvicorn logs the request line, where the URL has been
    percent-encoded into a query parameter."""
    line = ('GET /stream?source=rtsp%3A%2F%2Fadmin%3AWTR%2540Sodic195'
            '%40192.168.253.64%3A554%2FStreaming%2FChannels%2F102 HTTP/1.1')
    out = scrub(line)
    assert "WTR%2540Sodic195" not in out
    assert "Sodic195" not in out
    assert "admin" in out            # the user is not a secret; the password is
    assert "192.168.253.64" in out   # still diagnosable


def test_leaves_ordinary_lines_alone():
    line = 'GET /persons HTTP/1.1" 200 OK'
    assert scrub(line) == line


def test_handles_rtsps_and_uppercase():
    assert "secret" not in scrub("RTSPS://user:secret@host/x")


def test_filter_scrubs_message_and_args():
    log_filter = RedactCredentialsFilter()
    record = logging.LogRecord(
        name="uvicorn.access", level=logging.INFO, pathname=__file__, lineno=1,
        msg='%s - "%s" %d', args=(
            "127.0.0.1:59180",
            f"GET /stream?source=rtsp://admin:{PASSWORD}@192.168.253.64:554/x HTTP/1.1",
            200,
        ), exc_info=None,
    )
    assert log_filter.filter(record) is True
    assert PASSWORD not in record.getMessage()
    assert "*****" in record.getMessage()


def test_filter_passes_non_string_args_through():
    log_filter = RedactCredentialsFilter()
    record = logging.LogRecord(
        name="uvicorn.access", level=logging.INFO, pathname=__file__, lineno=1,
        msg="%d frames", args=(42,), exc_info=None,
    )
    assert log_filter.filter(record) is True
    assert record.getMessage() == "42 frames"
