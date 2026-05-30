# app/main.py
import asyncio
import logging
import signal
import sys

from app.config import settings
from app.queue.consumer import BullMQConsumer
from app.queue.publisher import JobEventPublisher
from app.handler import handle_job

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)


async def main() -> None:
    logger.info("🐍  Whisper Worker starting (concurrency=%d)", settings.worker_concurrency)

    consumer = BullMQConsumer()
    await consumer.connect()

    # ── Graceful shutdown ──────────────────────────────────────────────────────
    loop = asyncio.get_running_loop()

    def _handle_signal(sig: signal.Signals) -> None:
        logger.info("%s received — stopping worker", sig.name)
        consumer.stop()

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, _handle_signal, sig)

    # ── Start consuming ────────────────────────────────────────────────────────
    # consumer passes its publisher instance into handle_job on every job
    try:
        await consumer.consume(handle_job)
    finally:
        await consumer.disconnect()
        logger.info("Worker shut down cleanly")


if __name__ == "__main__":
    asyncio.run(main())
