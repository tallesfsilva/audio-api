// src/infrastructure/redis/client.ts
import IORedis, { RedisOptions } from 'ioredis';
import { config } from '../../config';
import { logger } from '../../shared/utils/logger';

const redisOptions: RedisOptions = {
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  password: config.REDIS_PASSWORD || undefined,
  db: config.REDIS_DB,
  maxRetriesPerRequest: null, // required by BullMQ
  enableReadyCheck: false,    // required by BullMQ
  lazyConnect: true,
};

// BullMQ requires its own dedicated connection (cannot share with general use)
export const bullMQConnection = new IORedis(redisOptions);
export const redisClient = new IORedis(redisOptions);

export async function connectRedis(): Promise<void> {
  await redisClient.connect();
  await bullMQConnection.connect();
  logger.info('Redis connections established');
}

export async function disconnectRedis(): Promise<void> {
  await redisClient.quit();
  await bullMQConnection.quit();
  logger.info('Redis connections closed');
}
