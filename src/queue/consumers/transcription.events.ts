// src/queue/consumers/transcription.events.ts
// This module listens to BullMQ QueueEvents so the Node API can react
// to job state changes emitted by the Python worker process.

import { QueueEvents } from 'bullmq';
import { bullMQConnection } from '../../infrastructure/redis/client';
import { config } from '../../config';
import { logger } from '../../shared/utils/logger';
import { jobRepository } from '../../modules/jobs/repository/jobs.repository';

export function startQueueEventListeners(): void {
  const queueEvents = new QueueEvents(config.QUEUE_NAME, {
    connection: bullMQConnection,
  });

  queueEvents.on('waiting', ({ jobId }) => {
    logger.debug('Job waiting', { jobId });
  });

  queueEvents.on('active', async ({ jobId }) => {
    logger.info('Job active (processing started)', { jobId });
    await jobRepository.markAsProcessing(jobId).catch((e) =>
      logger.error('Failed to mark job as processing', { jobId, e }),
    );
  });

  queueEvents.on('completed', async ({ jobId }) => {
    // Final result is written via the internal callback route;
    // this event confirms BullMQ agrees the job is done.
    logger.info('Job completed (BullMQ)', { jobId });
  });

  queueEvents.on('failed', async ({ jobId, failedReason }) => {
    logger.error('Job failed (BullMQ)', { jobId, failedReason });
    await jobRepository
      .markAsFailed(jobId, failedReason ?? 'Unknown error')
      .catch((e) => logger.error('Failed to mark job as failed in DB', { jobId, e }));
  });

  queueEvents.on('progress', ({ jobId, data }) => {
    logger.debug('Job progress', { jobId, data });
  });

  queueEvents.on('error', (err) => {
    logger.error('QueueEvents error', { err });
  });

  logger.info('BullMQ QueueEvents listeners started');
}
