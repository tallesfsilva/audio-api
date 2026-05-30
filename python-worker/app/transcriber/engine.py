# app/transcriber/engine.py
import logging
import os
from dataclasses import dataclass
from typing import Any, AsyncIterator, Callable, Awaitable

from faster_whisper import WhisperModel

from app.config import settings
from app.transcriber.formatters import format_output

logger = logging.getLogger(__name__)

# Module-level model cache: model_size → WhisperModel instance
# Avoids reloading 1–3 GB weights on every job
_model_cache: dict[str, WhisperModel] = {}


def _load_model(model_size: str) -> WhisperModel:
    if model_size not in _model_cache:
        logger.info(
            "Loading Whisper model '%s' (device=%s compute_type=%s)",
            model_size,
            settings.whisper_device,
            settings.whisper_compute_type,
        )
        _model_cache[model_size] = WhisperModel(
            model_size,
            device=settings.whisper_device,
            compute_type=settings.whisper_compute_type,
            download_root=settings.whisper_model_cache,
        )
        logger.info("Model '%s' loaded and cached", model_size)
    return _model_cache[model_size]


@dataclass
class TranscriptionOutput:
    segments: list[dict[str, Any]]
    language: str
    duration_seconds: float
    word_count: int
    char_count: int
    formatted_text: str          # in the requested output format
    plain_text_preview: str      # first 500 chars for DB storage


async def transcribe(
    file_path: str,
    model_size: str,
    language: str,                # "auto" → None (auto-detect)
    output_format: str,
    enable_timestamps: bool,
    enable_diarization: bool,
    on_progress: Callable[[int, str], Awaitable[None]] | None = None,
) -> TranscriptionOutput:
    """
    Run faster-whisper transcription on `file_path`.

    Progress callbacks are fired at key milestones (25 / 50 / 75 / 99 %).
    Diarization is a stub — integrate pyannote.audio if needed.
    """
    if not os.path.isfile(file_path):
        raise FileNotFoundError(f"Audio file not found: {file_path}")

    model = _load_model(model_size)

    detect_lang = None if language == "auto" else language

    if on_progress:
        await on_progress(10, "Model loaded, starting transcription")

    # ── Run transcription ──────────────────────────────────────────────────────
    # faster-whisper is synchronous; run it as-is (worker uses asyncio but
    # transcription is the bottleneck — wrapping in executor adds complexity
    # without benefit since we limit concurrency via the semaphore).
    segments_iter, info = model.transcribe(
        file_path,
        language=detect_lang,
        word_timestamps=enable_timestamps,
        vad_filter=True,            # skip silent parts
        vad_parameters={"min_silence_duration_ms": 500},
        beam_size=5,
    )

    if on_progress:
        await on_progress(25, "Transcription in progress")

    # Materialise the lazy iterator and build segment dicts
    segments: list[dict[str, Any]] = []
    total_duration = info.duration or 1.0
    last_reported = 25

    for seg in segments_iter:
        entry: dict[str, Any] = {
            "id": seg.id,
            "start": round(seg.start, 3),
            "end": round(seg.end, 3),
            "text": seg.text,
        }
        if enable_timestamps and seg.words:
            entry["words"] = [
                {"word": w.word, "start": round(w.start, 3), "end": round(w.end, 3), "prob": round(w.probability, 3)}
                for w in seg.words
            ]
        segments.append(entry)

        # Fire incremental progress based on how far through the audio we are
        if on_progress:
            pct = min(90, int(25 + (seg.end / total_duration) * 65))
            if pct >= last_reported + 10:
                last_reported = pct
                await on_progress(pct, f"Transcribed {seg.end:.0f}s / {total_duration:.0f}s")

    if on_progress:
        await on_progress(92, "Formatting output")

    # ── Diarization stub ──────────────────────────────────────────────────────
    if enable_diarization:
        logger.warning(
            "Diarization requested but not yet implemented — skipping. "
            "Integrate pyannote.audio to enable speaker labels."
        )

    # ── Format output ─────────────────────────────────────────────────────────
    metadata = {
        "language": info.language,
        "language_probability": round(info.language_probability, 3),
        "duration": round(info.duration, 3),
        "model": model_size,
    }

    formatted = format_output(segments, metadata, output_format)
    plain_preview = " ".join(s["text"].strip() for s in segments)[:500]

    full_text = " ".join(s["text"].strip() for s in segments)
    word_count = len(full_text.split())
    char_count = len(full_text)

    if on_progress:
        await on_progress(99, "Finalising")

    return TranscriptionOutput(
        segments=segments,
        language=info.language,
        duration_seconds=round(info.duration, 3),
        word_count=word_count,
        char_count=char_count,
        formatted_text=formatted,
        plain_text_preview=plain_preview,
    )
