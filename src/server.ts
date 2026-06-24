// src/server.ts
import { createApp } from './app';
import { config } from './config';
import { logger } from './shared/utils/logger';
import { connectDatabase, disconnectDatabase } from './infrastructure/database/client';
import { connectRedis, disconnectRedis } from './infrastructure/redis/client';
import { ensureStorageDir } from './infrastructure/storage/local.driver';
import { transcriptionQueue } from './queue/producers/transcription.producer';
import { startQueueEventListeners } from './queue/consumers/transcription.events';
import { initializeSocket } from './infrastructure/socket';
// src/config/index.ts
 
 
import 'dotenv/config';

 

async function bootstrap(): Promise<void> {
   
  logger.info(`Starting Whisper SaaS API [${config.NODE_ENV}]`);
 
  // 1. Infrastructure connections
  await connectDatabase();
  await connectRedis();

  // 2. Storage directories
  if (config.STORAGE_DRIVER === 'local') {
    await ensureStorageDir();
  }

  logger.info("Stripe Key", config.STRIPE_SECRET_KEY)

  // 3. BullMQ queue event listeners
  startQueueEventListeners();
  const PORT = config.PORT || 8080
  // 4. Start HTTP server
  const app = createApp();
  const server = app.listen(PORT, "0.0.0.0", () => {
    logger.info(`✅  API listening on http://localhost:${config.PORT}${config.API_PREFIX}`);
  });
  console.log("Stripe price", config.STRIPE_PRICE_PRO)
    // Socket.IO
  const io = initializeSocket(server);

  server.requestTimeout = 60 * 60 * 1000; // 1 hour
    // Example broadcast
  io.emit('server:started', {
    timestamp: new Date().toISOString(),
  });

  // ── Graceful shutdown ────────────────────────────────────────────────────
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received — shutting down gracefully`);

    server.close(async () => {
      try {
        await transcriptionQueue.close();
        await disconnectDatabase();
        await disconnectRedis();
        logger.info('Graceful shutdown complete');
        process.exit(0);
      } catch (err) {
        logger.error('Error during shutdown', { err });
        process.exit(1);
      }
    });

    // Force exit after 15 s if graceful shutdown hangs
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 15_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { err });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason });
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  logger.error('Bootstrap failed', { err });
  process.exit(1);
});
