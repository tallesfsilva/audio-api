// src/queue/producers/transcription.producer.ts
import { Queue, QueueOptions } from 'bullmq';
import { bullMQConnection } from '../../infrastructure/redis/client';
import { config } from '../../config';
import { TranscriptionJobData, QUEUE_EVENTS } from '../../shared/types/queue';
import { logger } from '../../shared/utils/logger';

const queueOptions: QueueOptions = {
  connection: bullMQConnection,
  defaultJobOptions: {
    attempts: config.QUEUE_MAX_RETRIES,
    backoff: {
      type: 'exponential',
      delay: config.QUEUE_BACKOFF_DELAY_MS,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
};

class TranscriptionQueue {
  private queue: Queue<TranscriptionJobData>;

  constructor() {
    this.queue = new Queue<TranscriptionJobData>(config.QUEUE_NAME, queueOptions);
    logger.info(`TranscriptionQueue initialized: "${config.QUEUE_NAME}"`);
  }

  async enqueue(data: TranscriptionJobData): Promise<string> {
    const job = await this.queue.add(QUEUE_EVENTS.TRANSCRIPTION, data, {
      jobId: data.jobId,  // Idempotency: use our DB job ID as BullMQ job ID
      priority: this.priorityByPlan(data.userId), // extend when plan is passed
    });

    logger.debug(`Job enqueued`, { jobId: data.jobId, bullJobId: job.id });
    return job.id!;
  }

  async cancelJob(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (job) {
      await job.remove();
      logger.info(`Job removed from queue`, { jobId });
    }
  }

  async getQueueMetrics() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);
    return { waiting, active, completed, failed, delayed };
  }

  async close(): Promise<void> {
    await this.queue.close();
  }

  // Pro/Enterprise users get higher priority (lower number = higher priority in BullMQ)
  private priorityByPlan(_userId: string): number {
    // TODO: inject plan tier; for now everyone is equal
    return 5;
  }
}

// Singleton export
export const transcriptionQueue = new TranscriptionQueue();
