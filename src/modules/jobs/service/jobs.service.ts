// src/modules/jobs/service/jobs.service.ts
import { Job, JobStatus } from '../../../shared/types/domain';
import { jobRepository, JobsPage, ListJobsFilter } from '../repository/jobs.repository';
import { transcriptionQueue } from '../../../queue/producers/transcription.producer';
import { CreateTranscriptionInput, transcriptionsRepository } from '@/modules/transcription/repository/transcription.repository';
import { NotFoundError, AppError } from '../../../shared/errors';
import { TranscriptionResult } from '../../../shared/types/queue';

import { logger } from '../../../shared/utils/logger';
 
import { config } from '@/config';
 
import { Storage } from '@google-cloud/storage';
import { translateAll } from '@/shared/utils/translate';


// const storage = new Storage();
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
    targetLanguage: result.targetLanguage,
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
        segmentId: segment.segmentId,

        startTime: segment.startTime,
        endTime: segment.endTime,

        text: segment.text,
        originalText: segment?.originalText,

        language: segment.language as string ?? result.language,

        language_probability: segment.language_probability,

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
     
      });

      // Bill the minutes used
      if (result.durationSeconds) {
        const minutes = result.durationSeconds / 60;
        await jobRepository.incrementUserMinutes(job.userId, minutes);
      }

       const [contents] = await storage.bucket(config.GCS_BUCKET).file(result.transcriptionKey).download();
        
        const transcription = JSON.parse(contents.toString("utf8"));
        result.segments = transcription.segments;
        let targetLanguage = "";
        let transcriptionTranslated  = null;

        if(result?.targetLanguage){
          targetLanguage = result.targetLanguage;
        
          transcriptionTranslated =  await translateAll(transcription.segments ,targetLanguage, false);
        }
        
       result.segments =   transcriptionTranslated ? transcriptionTranslated : transcription

        const transcriptionInput =
          buildCreateTranscriptionInput(
            job,
            result
          );

        await transcriptionsRepository.create(
          transcriptionInput
        );

        const file = storage
        .bucket(config.GCS_UPLOAD_BUCKET)
        .file(result.transcriptionKey);

         await file.delete()


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
