# app/queue/publisher.py
#
# Publishes job status events to Redis Pub/Sub.
# The Node API subscribes to these channels and forwards them to the
# correct Socket.IO room (keyed by userId).
#
# Channel convention (matches what the Node API subscribes to):
#   job_events:{userId}
#
# Message envelope (JSON):
# {
#   "event":    "job:processing" | "job:progress" | "job:completed" | "job:failed",
#   "jobId":    "<uuid>",
#   "userId":   "<uuid>",
#   "progress": 0-100,            # present on job:progress
#   "message":  "...",            # optional human-readable status
#   "payload":  { ... }           # event-specific extra data (completed/failed only)
# }

import json
import logging
from typing import Any

import redis.asyncio as aioredis

logger = logging.getLogger(__name__)


def _channel(user_id: str) -> str:
    """One channel per user so the Node API can route to the right Socket.IO room."""
    return f"job_events:{user_id}"


class JobEventPublisher:
    def __init__(self, redis: aioredis.Redis) -> None:
        self._redis = redis

    async def _publish(self, user_id: str, data: dict[str, Any]) -> None:
        try:
            await self._redis.publish(_channel(user_id), json.dumps(data))
            logger.debug(
                "Published event '%s' for job %s to channel %s",
                data.get("event"),
                data.get("jobId"),
                _channel(user_id),
            )
        except Exception as exc:  # noqa: BLE001
            # Publishing is best-effort — never crash the worker over it
            logger.warning(
                "Failed to publish event for job %s: %s", data.get("jobId"), exc
            )

    async def processing(self, job_id: str, user_id: str) -> None:
        """Worker picked up the job and started transcribing."""
        await self._publish(user_id, {
            "event": "job:processing",
            "jobId": job_id,
            "userId": user_id,
            "progress": 5,
            "message": "Transcription started",
        })

    async def progress(
        self,
        job_id: str,
        user_id: str,
        progress: int,
        message: str | None = None,
    ) -> None:
        """Incremental progress update during transcription."""
        await self._publish(user_id, {
            "event": "job:progress",
            "jobId": job_id,
            "userId": user_id,
            "progress": progress,
            "message": message or f"Processing… {progress}%",
        })

    async def completed(
        self,
        job_id: str,
        user_id: str,
        duration_seconds: float | None,
        word_count: int | None,
        result_text: str | None,
    ) -> None:
        """Job finished successfully."""
        await self._publish(user_id, {
            "event": "job:completed",
            "jobId": job_id,
            "userId": user_id,
            "progress": 100,
            "message": "Transcription complete",
            "payload": {
                "durationSeconds": duration_seconds,
                "wordCount": word_count,
                "resultPreview": result_text,
            },
        })

    async def failed(
        self,
        job_id: str,
        user_id: str,
        error_message: str,
    ) -> None:
        """Job failed."""
        await self._publish(user_id, {
            "event": "job:failed",
            "jobId": job_id,
            "userId": user_id,
            "progress": 0,
            "message": error_message,
        })
