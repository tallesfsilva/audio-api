# app/queue/schemas.py
# Mirrors src/shared/types/queue.ts — keep in sync with the Node API.

from typing import Literal, Optional
from pydantic import BaseModel


ModelSize = Literal[
    "tiny", "base", "small", "medium", "large", "large-v2", "large-v3"
]

TranscriptionLanguage = Literal[
    "auto", "en", "es", "fr", "de", "it", "pt", "ru", "ja", "ko", "zh"
]

OutputFormat = Literal["json", "srt", "vtt", "txt", "tsv"]


class TranscriptionJobData(BaseModel):
    """Payload written by the Node API into BullMQ."""
    jobId: str
    userId: str
    fileKey: str                  # relative storage path or S3 key
    originalFileName: str
    fileSizeBytes: int

    language: TranscriptionLanguage = "auto"
    modelSize: ModelSize = "base"
    outputFormat: OutputFormat = "json"
    enableDiarization: bool = False
    enableTimestamps: bool = True

    callbackUrl: str              # POST result here when done
    callbackSecret: str           # HMAC secret for X-Callback-Signature


class ProgressUpdate(BaseModel):
    jobId: str
    progress: int                 # 0–100
    message: Optional[str] = None


class TranscriptionResult(BaseModel):
    jobId: str
    success: bool
    durationSeconds: Optional[float] = None
    wordCount: Optional[int] = None
    charCount: Optional[int] = None
    resultKey: Optional[str] = None
    resultText: Optional[str] = None   # first 500 chars preview
    errorMessage: Optional[str] = None
