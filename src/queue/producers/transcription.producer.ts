// src/queue/producers/transcription.producer.ts
import { Job, Queue } from 'bullmq';
import { bullMQConnectionOptions } from '../../infrastructure/redis/client';
import { config } from '../../config';
import { TranscriptionJobData, QUEUE_EVENTS } from '../../shared/types/queue';
import { logger } from '../../shared/utils/logger';
 
import { formatDuration } from '@/shared/utils/jobs';
import { TooManyRequestsError } from '@/shared/errors';

class TranscriptionQueue {
  private queue: Queue<TranscriptionJobData>;




  constructor() {
    this.queue = new Queue<TranscriptionJobData>(config.QUEUE_NAME, {
      connection: bullMQConnectionOptions,
      defaultJobOptions: {
        attempts: config.QUEUE_MAX_RETRIES,
        backoff: {
          type: 'exponential',
          delay: config.QUEUE_BACKOFF_DELAY_MS,
        },
        removeOnComplete: { count: 1 },
        removeOnFail: { count: 10 },
      },
    });
    logger.info(`TranscriptionQueue initialized: "${config.QUEUE_NAME}"`);
  }

  async getQueue(): Promise< Queue> {
 
    return this.queue;

  }

  async enqueue(data: TranscriptionJobData, plan: string): Promise<string> {
   
    const priority = await  this.getJobPriority(data.userId ,plan)
    const job = await this.queue.add(QUEUE_EVENTS.TRANSCRIPTION, data, {
      jobId: data.jobId,
      priority: priority,
    });
    logger.debug('Job enqueued', { jobId: data.jobId, bullJobId: job.id });
    return job.id!;
   
  }
  async getJob(jobId: string): Promise<any> {
    try{
 const job = await this.queue.getJob(jobId);
    if (job) {
      return job
    }
    }catch(e){
       console.log(e)
    
   
      
    }
  }
async checkJobCap(userId: string, plan: string): Promise<void> {
  const CAP: Record<string, number> = { pro: 5, free: 2 };
  const waitingJobs = await this.queue.getWaiting();
  const userJobCount = waitingJobs.filter(
    j => j.data.userId === userId
  ).length;
  if (userJobCount >= (CAP[plan] ?? 2)) {
    throw new TooManyRequestsError(
      `You already have ${userJobCount} jobs in queue`
    );
  }
}
async getJobPriority(userId: string, plan: string): Promise<number> {
  const basePriority =this.priorityByPlan(plan)

  const [waitingJobs, activeJobs] = await Promise.all([
    this.queue.getWaiting(),
    this.queue.getActive(),
  ]);

  const userJobsInFlight = [...waitingJobs, ...activeJobs].filter(
    j => j.data.userId === userId
  ).length;

  return basePriority + userJobsInFlight;
}
  private async getQueuePosition(job: Job): Promise<number> {
      const waiting = await this.queue.getWaiting();
      return waiting.findIndex(j => j.id === job.id) + 1;
  }
  
 async getQueueStatus(jobId: string, userId: string, plan: string) {
  try {
    const job = await this.queue.getJob(jobId);
    if (!job) throw new Error("Job not found");

    const status = await job.getState();
    const position = status === "waiting"
      ? await this.getQueuePosition(job)
      : 0;

    const waitingJobs = await this.queue.getWaiting(0, position);
    const waitSeconds = waitingJobs.reduce(
      (sum: number, j) => sum + (j.data.estimatedJobDurationSecs ?? 0), 0
    );

    // How many jobs this user already has queued (for cap enforcement info)
    const userJobsInQueue = waitingJobs.filter(
      j => j.data.userId === userId
    ).length;

    return {
      position,
      estimatedWaitSeconds: waitSeconds,
      estimatedWaitLabel: formatDuration(waitSeconds),
      userJobsInQueue,
      canSubmitMore: userJobsInQueue < (plan === "pro" ? 5 : 2),
    };
  } catch (e) {
    logger.error("getQueueStatus failed", { jobId, error: e });
    return null;
  }
}
  async cancelJob(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (job) {
      await job.remove();
      logger.info('Job removed from queue', { jobId });
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

  private priorityByPlan(plan: string): number {

      if(plan==="PRO"){
        return 1;
      }else{
        return 5;
      }

}
}
export const transcriptionQueue = new TranscriptionQueue();
