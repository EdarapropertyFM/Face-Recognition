# Python AI service: FastAPI + insightface (recognition, live view, DVR).
FROM python:3.11-slim

# OpenCV needs these shared libraries even in a headless container; ffmpeg
# provides the RTSP/H.264 decoding used for DVR channels.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 libglib2.0-0 libsm6 libxext6 libxrender1 ffmpeg curl \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/app/src \
    # RTSP over TCP: UDP drops packets and shows as grey smears. OpenCV reads
    # this only at process start, which is why it is set here and not in code.
    OPENCV_FFMPEG_CAPTURE_OPTIONS="rtsp_transport;tcp"

WORKDIR /app

# Dependencies first so code edits do not re-run the ~1 GB wheel install.
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY config.yaml ./
COPY src/ ./src/
COPY api/ ./api/
COPY scripts/ ./scripts/

# data/ holds the model pack (~600 MB), embeddings.npy and enrolment images.
# It is bind-mounted by docker-compose, never baked into the image: biometric
# data does not belong in a distributable layer, and the model would make the
# image enormous.
#
# Deliberately NOT a VOLUME: that would hand a container started without a
# mount its own empty anonymous volume, which silently re-downloads the model
# and writes the gallery somewhere nobody looks. Without it, a missing mount
# is obvious instead.
RUN mkdir -p /app/data

EXPOSE 8000
# start-period covers the FIRST run, which downloads the ~280 MB model pack
# before the service can answer anything. On a slow link that is well over
# 15 minutes, and a short grace period just makes a healthy container report
# itself unhealthy while it is working normally.
HEALTHCHECK --interval=30s --timeout=5s --start-period=1200s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/health || exit 1

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
