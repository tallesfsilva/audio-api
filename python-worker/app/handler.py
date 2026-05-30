# app/handler.py
import logging

from app.queue.schemas import TranscriptionJobData, TranscriptionResult
from app.queue.callback import post_progress, post_result
from app.queue.publisher import JobEventPublisher
from app.storage.driver import (
    local_abs_path,
    local_result_key,
    write_result,
    file_exists,
)
from app.transcriber.engine import transcribe

logger = logging.getLogger(__name__)

# The Node API is always reachable at this address inside the Docker network
API_BASE_URL = "http://api:3000"


async def handle_job(job: TranscriptionJobData, publisher: JobEventPublisher) -> None:
    """
    Full lifecycle for one transcription job:
      1. Validate file exists in shared storage
      2. Transcribe with faster-whisper, streaming progress back
      3. Write result file to shared storage
      4. POST final result to Node API callback endpoint (persists to DB)
      5. Publish every status change to Redis Pub/Sub (Socket.IO picks this up)
    """
    logger.info(
        "Handling job %s | file=%s model=%s lang=%s fmt=%s",
        job.jobId,
        job.fileKey,
        job.modelSize,
        job.language,
        job.outputFormat,
    )

    async def report(pct: int, msg: str | None = None) -> None:
        """Fire both the HTTP callback (→ DB update) and the Redis pub event (→ Socket.IO)."""
        await post_progress(API_BASE_URL, job.callbackSecret, job.jobId, pct, msg)
        await publisher.progress(job.jobId, job.userId, pct, msg)

    # ── 1. Locate file ─────────────────────────────────────────────────────────
    if not file_exists(job.fileKey):
        error = f"File not found at storage path: {job.fileKey}"
        logger.error(error)
        await post_result(
            API_BASE_URL,
            job.callbackSecret,
            TranscriptionResult(jobId=job.jobId, success=False, errorMessage=error),
        )
        await publisher.failed(job.jobId, job.userId, error)
        return

    # Announce that processing has started
    await publisher.processing(job.jobId, job.userId)
    await report(5, "File located, starting transcription")

    # ── 2. Transcribe ──────────────────────────────────────────────────────────
    try:
        output = await transcribe(
            file_path=local_abs_path(job.fileKey),
            model_size=job.modelSize,
            language=job.language,
            output_format=job.outputFormat,
            enable_timestamps=job.enableTimestamps,
            enable_diarization=job.enableDiarization,
            on_progress=report,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Transcription failed for job %s: %s", job.jobId, exc)
        await post_result(
            API_BASE_URL,
            job.callbackSecret,
            TranscriptionResult(jobId=job.jobId, success=False, errorMessage=str(exc)),
        )
        await publisher.failed(job.jobId, job.userId, str(exc))
        return

    # ── 3. Write result to storage ─────────────────────────────────────────────
    result_key = local_result_key(job.userId, job.jobId, job.outputFormat)
    try:
        write_result(result_key, output.formatted_text)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed to write result for job %s: %s", job.jobId, exc)
        error = f"Storage write failed: {exc}"
        await post_result(
            API_BASE_URL,
            job.callbackSecret,
            TranscriptionResult(jobId=job.jobId, success=False, errorMessage=error),
        )
        await publisher.failed(job.jobId, job.userId, error)
        return

    # ── 4. HTTP callback → DB ──────────────────────────────────────────────────
    result = TranscriptionResult(
        jobId=job.jobId,
        success=True,
        durationSeconds=output.duration_seconds,
        wordCount=output.word_count,
        charCount=output.char_count,
        resultKey=result_key,
        resultText=output.plain_text_preview,
    )
    await post_result(API_BASE_URL, job.callbackSecret, result)

    # ── 5. Redis pub → Socket.IO ───────────────────────────────────────────────
    await publisher.completed(
        job.jobId,
        job.userId,
        output.duration_seconds,
        output.word_count,
        output.plain_text_preview,
    )

    logger.info(
        "Job %s completed | duration=%.1fs words=%d",
        job.jobId,
        output.duration_seconds,
        output.word_count,
    )
