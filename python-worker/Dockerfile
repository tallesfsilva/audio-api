# ─── CPU build (default) ───────────────────────────────────────────────────────
# For GPU support swap the base image:
#   FROM nvidia/cuda:12.3.2-cudnn9-runtime-ubuntu22.04
FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    WHISPER_MODEL_CACHE=/app/models

# System deps: ffmpeg is required by faster-whisper to decode audio
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Non-root user
RUN addgroup --system --gid 1001 pygroup \
 && adduser  --system --uid 1001 pyuser

# Install Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Model cache & storage dirs
RUN mkdir -p /app/models /app/storage/uploads /app/storage/results \
 && chown -R pyuser:pygroup /app

COPY --chown=pyuser:pygroup app ./app

USER pyuser

# Pre-download the default model at build time so first job doesn't wait
# Comment this out to keep the image smaller (model downloads on first use)
ARG PRELOAD_MODEL=base
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('${PRELOAD_MODEL}', device='cpu', compute_type='int8', download_root='/app/models')" \
    || echo "Model preload skipped (network unavailable at build time)"

CMD ["python", "-m", "app.main"]
