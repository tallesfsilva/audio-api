// src/modules/jobs/service/jobs.service.ts
import { Job, JobStatus } from '../../../shared/types/domain';
import { jobRepository, JobsPage, ListJobsFilter } from '../repository/jobs.repository';
import { transcriptionQueue } from '../../../queue/producers/transcription.producer';
import { ForbiddenError, NotFoundError, AppError } from '../../../shared/errors';
import { TranscriptionResult } from '../../../shared/types/queue';
import { deleteFile } from '../../../infrastructure/storage/local.driver';
import { logger } from '../../../shared/utils/logger';

class JobsService {
  async list(userId: string, filter: Omit<ListJobsFilter, 'userId'>): Promise<JobsPage> {
    return jobRepository.list({ ...filter, userId });
  }

  async getById(jobId: string, userId: string): Promise<Job> {
    const job = await jobRepository.findByIdAndUserId(jobId, userId);
    if (!job) throw new NotFoundError('Job');
    return job;
  }

  async cancel(jobId: string, userId: string): Promise<Job> {
    const job = await jobRepository.findByIdAndUserId(jobId, userId);
    if (!job) throw new NotFoundError('Job');

    const cancellable: JobStatus[] = [JobStatus.PENDING, JobStatus.QUEUED];
    if (!cancellable.includes(job.status)) {
      throw new AppError(
        `Cannot cancel a job with status "${job.status}"`,
        409,
        'INVALID_JOB_STATE',
      );
    }

    // Remove from BullMQ if queued
    if (job.bullJobId) {
      await transcriptionQueue.cancelJob(job.bullJobId).catch((e) =>
        logger.warn('Could not remove BullMQ job', { jobId, e }),
      );
    }

    return jobRepository.markAsCancelled(jobId);
  }

  async delete(jobId: string, userId: string): Promise<void> {
    const job = await jobRepository.findByIdAndUserId(jobId, userId);
    if (!job) throw new NotFoundError('Job');

    const deletable: JobStatus[] = [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED];
    if (!deletable.includes(job.status)) {
      throw new AppError(
        `Cannot delete a job with status "${job.status}". Cancel it first.`,
        409,
        'INVALID_JOB_STATE',
      );
    }

    // Clean up storage files
    await Promise.allSettled([
      job.fileKey ? deleteFile(job.fileKey) : Promise.resolve(),
      job.resultKey ? deleteFile(job.resultKey) : Promise.resolve(),
    ]);

    await jobRepository.delete(jobId);
  }

  async applyCallbackResult(
    jobId: string,
    result: TranscriptionResult,
  ): Promise<void> {
    const job = await jobRepository.findById(jobId);
    if (!job) {
      logger.warn('Callback received for unknown job', { jobId });
      return;
    }

    if (result.success) {
      await jobRepository.markAsCompleted(jobId, {
        durationSeconds: result.durationSeconds,
        wordCount: result.wordCount,
        charCount: result.charCount,
        resultKey: result.resultKey,
        resultText: result.resultText,
      });

      // Bill the minutes used
      if (result.durationSeconds) {
        const minutes = result.durationSeconds / 60;
        await jobRepository.incrementUserMinutes(job.userId, minutes);
      }
    } else {
      await jobRepository.markAsFailed(jobId, result.errorMessage ?? 'Worker reported failure');
    }

    logger.info('Job callback applied', { jobId, success: result.success });
  }

  async updateProgress(jobId: string, progress: number): Promise<void> {
    await jobRepository.updateProgress(jobId, progress);
  }

  async getQueueMetrics() {
    return transcriptionQueue.getQueueMetrics();
  }
}

export const jobsService = new JobsService();
