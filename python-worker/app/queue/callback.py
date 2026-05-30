# app/queue/callback.py
import hashlib
import hmac
import json
import logging

import httpx

from app.queue.schemas import ProgressUpdate, TranscriptionResult

logger = logging.getLogger(__name__)

TIMEOUT = httpx.Timeout(10.0)


def _sign(body: str, secret: str) -> str:
    """Compute HMAC-SHA256 signature matching the Node API's verifyCallbackSignature."""
    return hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()


async def post_progress(
    base_url: str,
    secret: str,
    job_id: str,
    progress: int,
    message: str | None = None,
) -> None:
    update = ProgressUpdate(jobId=job_id, progress=progress, message=message)
    body = update.model_dump_json()
    url = f"{base_url.rstrip('/')}/api/v1/internal/jobs/{job_id}/progress"

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        try:
            resp = await client.post(
                url,
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "X-Callback-Signature": _sign(body, secret),
                },
            )
            resp.raise_for_status()
            logger.debug("Progress %d%% reported for job %s", progress, job_id)
        except Exception as exc:  # noqa: BLE001
            # Non-fatal — progress updates are best-effort
            logger.warning("Failed to post progress for job %s: %s", job_id, exc)


async def post_result(
    base_url: str,
    secret: str,
    result: TranscriptionResult,
) -> None:
    body = result.model_dump_json()
    url = f"{base_url.rstrip('/')}/api/v1/internal/jobs/{result.jobId}/callback"

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.post(
            url,
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Callback-Signature": _sign(body, secret),
            },
        )
        resp.raise_for_status()
        logger.info("Result posted for job %s (success=%s)", result.jobId, result.success)
