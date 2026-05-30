# app/config.py
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Redis (must match Node API)
    redis_host: str = "redis"
    redis_port: int = 6379
    redis_password: str = "redis_secret"
    redis_db: int = 0

    # Queue (must match Node API QUEUE_NAME)
    queue_name: str = "transcription"

    # How many jobs this worker processes in parallel
    worker_concurrency: int = 2

    # Storage — local path or S3
    storage_driver: str = "local"          # local | s3
    storage_local_base_path: str = "/app/storage"

    # S3 (only when storage_driver=s3)
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_region: str = "us-east-1"
    aws_s3_bucket: str = ""

    # Whisper model cache directory
    whisper_model_cache: str = "/app/models"

    # Default model (overridden per-job by modelSize in the payload)
    whisper_default_model: str = "base"

    # Compute type: float16 (GPU), int8 (CPU quantized), float32 (CPU full)
    whisper_compute_type: str = "int8"

    # Device: cuda | cpu
    whisper_device: str = "cpu"


settings = Settings()
