// src/infrastructure/redis/client.ts

import { config } from '../../config';
import { logger } from '../../shared/utils/logger';
import { createClient } from 'redis';



// Plain config object passed to BullMQ — it manages its own internal connections.
// BullMQ v5 does not accept a pre-built IORedis instance in QueueOptions/WorkerOptions;
// it expects a ConnectionOptions (host/port/...) plain object instead.
export const bullMQConnectionOptions = {

  // host: config.REDIS_HOST,
  // username: config.REDIS_USERNAME,
  // port: config.REDIS_PORT,
  // password: config.REDIS_PASSWORD || undefined,
  // db: config.REDIS_DB,
  url: "redis://default:uttTMOimlh8ezRgBuWDQ3FFo6VcXNUsx@redis-12516.crce196.sa-east-1-2.ec2.cloud.redislabs.com:12516",
  maxRetriesPerRequest: null as null, // required by BullMQ
  enableReadyCheck: false,            // required by BullMQ
};

// Separate IORedis instance for general app use (pub/sub, health checks, etc.)
const client = createClient({
    username: config.REDIS_USERNAME,
    password: config.REDIS_PASSWORD || undefined,
    socket: {
        host: 'redis-12516.crce196.sa-east-1-2.ec2.cloud.redislabs.com',
        port: 12516
    }
});

export async function connectRedis(): Promise<void> {
  try{

  await client.connect();
  logger.info('Redis connection established');
  }catch(e) {
    console.error(e)
  }

}

export async function disconnectRedis(): Promise<void> {
  await client.quit();
  logger.info('Redis connection closed');
}
