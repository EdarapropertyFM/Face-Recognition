"""Keep RTSP credentials out of the logs.

The live view, the enrolment preview and the DVR pages all take the camera as
a `?source=rtsp://user:pass@host/...` query parameter, and uvicorn writes the
full request line to its access log. That put the DVR password in clear text
in the log on every single frame request:

    GET /stream?source=rtsp%3A%2F%2Fadmin%3AWTR%2540Sodic195%40192.168...

Logs get copied into tickets, pasted into chats and shipped off the machine,
so the password leaked everywhere the log went. This filter rewrites the
credentials out of every log record before it is emitted, whether the URL is
written plainly or percent-encoded in a query string.

It is a backstop, not a licence: prefer not putting secrets in a URL at all.
"""
from __future__ import annotations

import logging
import re

MASK = "*****"

# rtsp://user:pass@host  ->  rtsp://user:*****@host
_PLAIN = re.compile(r"(?i)\b(rtsps?://)([^\s:/@]+):([^\s/@]+)@")

# The same URL after percent-encoding into a query string:
#   rtsp%3A%2F%2Fuser%3Apass%40host
# %3A is ':', %2F is '/', %40 is '@'. The password itself is double-encoded
# (an '@' inside it arrives as %2540), so anything that is not a separator is
# fair game up to the terminating %40.
_ENCODED = re.compile(
    r"(?i)(rtsps?%3A%2F%2F)([^\s:/@%]+(?:%25[0-9A-Fa-f]{2})*)%3A(.+?)%40"
)


def scrub(text: str) -> str:
    """Replace the password in any RTSP URL found in the text."""
    text = _PLAIN.sub(rf"\1\2:{MASK}@", text)
    return _ENCODED.sub(rf"\1\2%3A{MASK}%40", text)


class RedactCredentialsFilter(logging.Filter):
    """Scrubs the formatted message and every argument of a log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str) and ("rtsp" in record.msg.lower()):
            record.msg = scrub(record.msg)
        if record.args:
            if isinstance(record.args, dict):
                record.args = {
                    key: scrub(value) if isinstance(value, str) else value
                    for key, value in record.args.items()
                }
            elif isinstance(record.args, tuple):
                record.args = tuple(
                    scrub(value) if isinstance(value, str) else value
                    for value in record.args
                )
        return True


def install() -> None:
    """Attach the filter to uvicorn's loggers and the root logger.

    Applied to the handlers rather than only the loggers: a filter on a logger
    does not run for records that propagate up from its children, so uvicorn's
    access records would slip past.
    """
    log_filter = RedactCredentialsFilter()
    names = ("", "uvicorn", "uvicorn.access", "uvicorn.error", "api", "facerec")
    for name in names:
        logger = logging.getLogger(name)
        logger.addFilter(log_filter)
        for handler in logger.handlers:
            handler.addFilter(log_filter)
