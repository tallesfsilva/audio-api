// src/infrastructure/redis/client.ts
import IORedis from 'ioredis';
import { config } from '../../config';
import { logger } from '../../shared/utils/logger';

// Plain config object passed to BullMQ — it manages its own internal connections.
// BullMQ v5 does not accept a pre-built IORedis instance in QueueOptions/WorkerOptions;
// it expects a ConnectionOptions (host/port/...) plain object instead.
export const bullMQConnectionOptions = {
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  password: config.REDIS_PASSWORD || undefined,
  db: config.REDIS_DB,
  maxRetriesPerRequest: null as null, // required by BullMQ
  enableReadyCheck: false,            // required by BullMQ
};

// Separate IORedis instance for general app use (pub/sub, health checks, etc.)
export const redisClient = new IORedis({
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  password: config.REDIS_PASSWORD || undefined,
  db: config.REDIS_DB,
  lazyConnect: true,
});

export async function connectRedis(): Promise<void> {
  await redisClient.connect();
  logger.info('Redis connection established');
}

export async function disconnectRedis(): Promise<void> {
  await redisClient.quit();
  logger.info('Redis connection closed');
}
