# app/queue/consumer.py
# BullMQ stores jobs as Redis hashes under bull:{queue}:{id}.
# This consumer uses the BLMOVE pattern that BullMQ uses internally,
# polling the "wait" list and moving jobs to "active".

import asyncio
import json
import logging
from typing import Callable, Awaitable

import redis.asyncio as aioredis

from app.config import settings
from app.queue.schemas import TranscriptionJobData
from app.queue.publisher import JobEventPublisher

logger = logging.getLogger(__name__)


class BullMQConsumer:
    """
    Minimal async BullMQ-compatible consumer.

    BullMQ queues follow this Redis key layout:
      bull:{queue}:wait        — LIST of job IDs waiting to be picked up
      bull:{queue}:active      — LIST of job IDs currently being processed
      bull:{queue}:{id}        — HASH with job data (data, opts, name, …)
      bull:{queue}:failed      — ZSET of failed job IDs
      bull:{queue}:completed   — ZSET of completed job IDs
    """

    POLL_TIMEOUT = 5  # seconds to block on BLMOVE before retrying

    def __init__(self) -> None:
        self.redis: aioredis.Redis | None = None
        self.publisher: JobEventPublisher | None = None
        self._running = False
        self._semaphore: asyncio.Semaphore | None = None

    async def connect(self) -> None:
        self.redis = aioredis.Redis(
            host=settings.redis_host,
            port=settings.redis_port,
            password=settings.redis_password or None,
            db=settings.redis_db,
            decode_responses=True,
        )
        await self.redis.ping()
        # Publisher reuses the same connection
        self.publisher = JobEventPublisher(self.redis)
        logger.info(
            "Connected to Redis at %s:%d", settings.redis_host, settings.redis_port
        )

    async def disconnect(self) -> None:
        if self.redis:
            await self.redis.aclose()
            logger.info("Redis connection closed")

    # ── Key helpers ────────────────────────────────────────────────────────────

    def _key(self, suffix: str) -> str:
        return f"bull:{settings.queue_name}:{suffix}"

    async def _get_job_data(self, job_id: str) -> TranscriptionJobData | None:
        raw = await self.redis.hget(self._key(job_id), "data")  # type: ignore[union-attr]
        if not raw:
            logger.warning("No data found for job %s", job_id)
            return None
        payload = json.loads(raw)
        return TranscriptionJobData(**payload)

    async def _ack_completed(self, job_id: str) -> None:
        """Move job from active → completed list and set completion timestamp."""
        pipe = self.redis.pipeline()  # type: ignore[union-attr]
        pipe.lrem(self._key("active"), 1, job_id)
        pipe.zadd(self._key("completed"), {job_id: self._now_ms()})
        pipe.hset(self._key(job_id), "finishedOn", self._now_ms())
        await pipe.execute()

    async def _ack_failed(self, job_id: str, reason: str) -> None:
        """Move job from active → failed list."""
        pipe = self.redis.pipeline()  # type: ignore[union-attr]
        pipe.lrem(self._key("active"), 1, job_id)
        pipe.zadd(self._key("failed"), {job_id: self._now_ms()})
        pipe.hset(
            self._key(job_id),
            mapping={"failedReason": reason, "finishedOn": self._now_ms()},
        )
        await pipe.execute()

    @staticmethod
    def _now_ms() -> int:
        import time
        return int(time.time() * 1000)

    # ── Main loop ──────────────────────────────────────────────────────────────

    async def consume(
        self,
        handler: Callable[[TranscriptionJobData, JobEventPublisher], Awaitable[None]],
    ) -> None:
        """
        Continuously pull jobs from the wait list and dispatch them to `handler`.
        Passes the JobEventPublisher so the handler can push real-time events.
        Respects `worker_concurrency` via a semaphore.
        """
        self._running = True
        self._semaphore = asyncio.Semaphore(settings.worker_concurrency)

        logger.info(
            "Worker listening on queue '%s' (concurrency=%d)",
            settings.queue_name,
            settings.worker_concurrency,
        )

        while self._running:
            try:
                # BLMOVE wait → active (atomic pop + push, blocks up to POLL_TIMEOUT s)
                job_id = await self.redis.blmove(  # type: ignore[union-attr]
                    self._key("wait"),
                    self._key("active"),
                    self.POLL_TIMEOUT,
                    "LEFT",
                    "RIGHT",
                )

                if job_id is None:
                    continue  # timeout, loop again

                logger.info("Picked up job %s", job_id)
                asyncio.create_task(self._process(job_id, handler))

            except aioredis.ConnectionError as exc:
                logger.error("Redis connection error: %s — retrying in 5 s", exc)
                await asyncio.sleep(5)
            except asyncio.CancelledError:
                break
            except Exception as exc:  # noqa: BLE001
                logger.exception("Unexpected error in consumer loop: %s", exc)
                await asyncio.sleep(1)

    async def _process(
        self,
        job_id: str,
        handler: Callable[[TranscriptionJobData, JobEventPublisher], Awaitable[None]],
    ) -> None:
        async with self._semaphore:  # type: ignore[arg-type]
            job_data = await self._get_job_data(job_id)
            if job_data is None:
                await self._ack_failed(job_id, "Job data not found in Redis")
                return

            try:
                await self.redis.hset(self._key(job_id), "processedOn", self._now_ms())  # type: ignore[union-attr]
                await handler(job_data, self.publisher)  # type: ignore[arg-type]
                await self._ack_completed(job_id)
            except Exception as exc:  # noqa: BLE001
                logger.exception("Job %s failed: %s", job_id, exc)
                await self._ack_failed(job_id, str(exc))

    def stop(self) -> None:
        self._running = False
