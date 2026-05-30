// src/modules/upload/service/upload.service.ts
import path from 'path';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { Job } from '../../../shared/types/domain';
import {Prisma} from '@prisma/client';
import { config } from '../../../config';
import { jobRepository } from '../../jobs/repository/jobs.repository';
import { transcriptionQueue } from '../../../queue/producers/transcription.producer';
import { QuotaExceededError } from '../../../shared/errors';
import { TranscriptionJobData } from '../../../shared/types/queue';
import { UploadBodyDto } from '../dto/upload.dto';
import { logger } from '../../../shared/utils/logger';

// One-time HMAC secret for callback verification between Node ↔ Python
const CALLBACK_SECRET = crypto
  .createHmac('sha256', config.JWT_ACCESS_SECRET)
  .update('callback-secret')
  .digest('hex');

class UploadService {
  async ingest(
    userId: string,
    file: Express.Multer.File,
    params: UploadBodyDto,
  ): Promise<Job> {
    // 1. Check quota
    const { usedMinutes, monthlyQuota } = await jobRepository.getUserUsage(userId);
    if (usedMinutes >= monthlyQuota) throw new QuotaExceededError();

    // 2. Build storage key relative to base path
    //    multer already saved the file; compute the relative key from basePath
    const basePath = path.resolve(config.STORAGE_LOCAL_BASE_PATH);
    const fileKey = path.relative(basePath, file.path);

    // 3. Create DB record (PENDING)
    const jobId = uuidv4();
    const jobData: Prisma.JobCreateInput = {
      id: jobId,
      user: { connect: { id: userId } },
      originalFileName: file.originalname,
      fileKey,
      fileSizeBytes: file.size,
      language: params.language as Prisma.EnumTranscriptionLanguageFieldUpdateOperationsInput['set'],
      outputFormat: params.outputFormat as Prisma.EnumOutputFormatFieldUpdateOperationsInput['set'],
      modelSize: params.modelSize,
      enableDiarization: params.enableDiarization,
      enableTimestamps: params.enableTimestamps,
    };

    const job = await jobRepository.create(jobData);

    // 4. Build queue payload
    const callbackUrl = `${config.NODE_ENV === 'production' ? 'http://api:3000' : `http://localhost:${config.PORT}`}${config.API_PREFIX}/internal/jobs/${jobId}/callback`;

    const queuePayload: TranscriptionJobData = {
      jobId,
      userId,
      fileKey,
      originalFileName: file.originalname,
      fileSizeBytes: file.size,
      language: params.language,
      modelSize: params.modelSize,
      outputFormat: params.outputFormat,
      enableDiarization: params.enableDiarization,
      enableTimestamps: params.enableTimestamps,
      callbackUrl,
      callbackSecret: CALLBACK_SECRET,
    };

    // 5. Enqueue
    const bullJobId = await transcriptionQueue.enqueue(queuePayload);

    // 6. Update job with BullMQ ID
    const updatedJob = await jobRepository.markAsQueued(jobId, bullJobId);

    logger.info('File ingested and job queued', {
      jobId,
      userId,
      fileSize: file.size,
      model: params.modelSize,
    });

    return updatedJob;
  }
}

export const uploadService = new UploadService();
