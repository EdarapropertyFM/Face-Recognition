"""How the AI service reaches the backend, and proves who it is.

The AI posts every detection to the backend, authenticated with a shared
token. Both halves live in `backend/.env`, but the AI is a separate Python
process that never reads that file: launched with a plain `uvicorn` command
it saw neither, fell back to the built-in development token, and every
detection it posted was rejected with 401.

Nothing looked broken from the outside. The cameras were connected, faces
were being recognised, and the only trace was a counter climbing in
`GET /monitor`. So the settings are read from `backend/.env` when they are
not already in the environment, and a rejected token says so plainly.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

log = logging.getLogger("api.backend_link")

DEFAULT_BACKEND_URL = "http://127.0.0.1:3000"
DEV_TOKEN = "stmc-ai-dev-token"


def parse_env_file(text: str) -> dict[str, str]:
    """Minimal .env reader: KEY=value, ignoring blanks and # comments."""
    values: dict[str, str] = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def find_backend_env(start: Path | None = None) -> Path | None:
    """Locate backend/.env by walking up from this file."""
    here = (start or Path(__file__).resolve()).parent
    for directory in [here, *here.parents][:6]:
        candidate = directory / "backend" / ".env"
        if candidate.is_file():
            return candidate
    return None


def resolve(env: dict[str, str] | None = None) -> tuple[str, str, str]:
    """Return (backend_url, token, where_it_came_from).

    The real environment always wins, so a container or a service definition
    can override the file without editing it.
    """
    env = os.environ if env is None else env
    url = env.get("STMC_BACKEND_URL", "")
    token = env.get("STMC_AI_EVENT_TOKEN", "")
    if url and token:
        return url, token, "environment"

    path = find_backend_env()
    from_file: dict[str, str] = {}
    if path:
        try:
            from_file = parse_env_file(path.read_text(encoding="utf-8"))
        except OSError as error:
            log.warning("could not read %s (%s)", path, error)

    url = url or from_file.get("STMC_BACKEND_URL") or DEFAULT_BACKEND_URL
    token = token or from_file.get("STMC_AI_EVENT_TOKEN") or DEV_TOKEN
    source = str(path) if path and from_file else "defaults"
    return url, token, source


def describe(url: str, token: str, source: str) -> str:
    """A startup line that makes a misconfiguration obvious."""
    if token == DEV_TOKEN:
        return (f"backend {url}: using the built-in development token "
                f"(source: {source}) - detections will be REJECTED if the "
                f"backend sets STMC_AI_EVENT_TOKEN")
    return f"backend {url}: token loaded from {source}"
