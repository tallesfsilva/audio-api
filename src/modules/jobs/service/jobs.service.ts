// src/modules/jobs/service/jobs.service.ts
import { Job, JobStatus } from '../../../shared/types/domain';
import { jobRepository, JobsPage, ListJobsFilter } from '../repository/jobs.repository';
import { transcriptionQueue } from '../../../queue/producers/transcription.producer';
import { CreateTranscriptionInput, transcriptionsRepository } from '@/modules/transcription/repository/transcription.repository';
import { NotFoundError, AppError } from '../../../shared/errors';
import { TranscriptionResult } from '../../../shared/types/queue';
import { deleteFile } from '../../../infrastructure/storage/local.driver';
import { logger } from '../../../shared/utils/logger';
 
import { config } from '@/config';
 
 import { Storage } from '@google-cloud/storage';

const storage = new Storage({
  keyFilename: "/SECRET/SERVICE_ACCOUNT",
});
export function buildCreateTranscriptionInput(
  job: Job,
  result: TranscriptionResult
): CreateTranscriptionInput {

  return {
    jobId: job.id,
    userId: job.userId,

    filename: job.originalFileName,

    language: result.language,

    durationSeconds:
      result.durationSeconds ??
      job.durationSeconds ??
      undefined,

    wordCount:
      result.wordCount ??
      undefined,

    charCount:
      result.charCount ??
      undefined,

    transcript:
      result.transcription ??
      undefined,

    segments:
      result.segments?.map(segment => ({
        segmentId: segment.id,

        startTime: segment.start,
        endTime: segment.end,

        text: segment.text,

        words: segment.words?.map(word => ({
          word: word.word.trim(),

          startTime: word.start,
          endTime: word.end,

          probability: word.prob,
        })),
      })),
  };
}
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

    const deletable: JobStatus[] = [JobStatus.PENDING,JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED];
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
        language: result.language,
        resultKey: result.resultKey,
        resultText: result.resultText,
        resultTextKey: result.resultTextKey,
      });

      // Bill the minutes used
      if (result.durationSeconds) {
        const minutes = result.durationSeconds / 60;
        await jobRepository.incrementUserMinutes(job.userId, minutes);
      }
        const transcriptionInput =
          buildCreateTranscriptionInput(
            job,
            result
          );

        await transcriptionsRepository.create(
          transcriptionInput
        );

      // if(transcription && transcription.id){

      //   await transcriptionsRepository.createSearchVector(transcription.id);


      // }

    } else {
      await jobRepository.markAsFailed(jobId, result.errorMessage ?? 'Worker reported failure');
    }

    logger.info('Job callback applied', { jobId, success: result.success });
   
  }


  async updateProgress(jobId: string, progress: number): Promise<void> {
    await jobRepository.updateProgress(jobId, progress);
  }

   async download(jobId: string, type: string): Promise<string> {
      const job = await jobRepository.findById(jobId);

    if(!type){
        throw new Error('Must provide a type srt or text');
    }

  if (!job) {
    throw new Error('Job not found');
  }
  const url = type === "srt" ? job?.resultKey : job?.resultTextKey

     if(!url){
          throw new Error('Subtitle not found');
     }

     const bucket = storage.bucket(config.GCS_BUCKET);
       const file = bucket.file(url as string);
      

      const [signedUrl] = await file.getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + 60 * 60 * 1000, // 1 hour
        responseDisposition: `attachment;`,
      });

      return signedUrl;
 
  }

  async getQueueMetrics() {
    return transcriptionQueue.getQueueMetrics();
  }
}

export const jobsService = new JobsService();
