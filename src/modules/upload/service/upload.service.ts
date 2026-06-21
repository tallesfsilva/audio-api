// src/modules/upload/service/upload.service.ts
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { Job, MulterS3File } from '../../../shared/types/domain';
import {Prisma} from '@prisma/client';
import { config } from '../../../config';
import { jobRepository } from '../../jobs/repository/jobs.repository';
import { transcriptionQueue } from '../../../queue/producers/transcription.producer';
import { NotFoundError, QuotaExceededError } from '../../../shared/errors';
import { TranscriptionJobData } from '../../../shared/types/queue';
import { UploadBodyDto } from '../dto/upload.dto';
import { logger } from '../../../shared/utils/logger';
import { getAudioDuration } from "../../../shared/utils/ffprobe";

import {
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { estimateProcessingSeconds, formatDuration } from '@/shared/utils/jobs';
import { authRepository } from '@/modules/auth/repository/auth.repository';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';



// One-time HMAC secret for callback verification between Node ↔ Python
const CALLBACK_SECRET = crypto
  .createHmac('sha256', config.JWT_ACCESS_SECRET)
  .update('callback-secret')
  .digest('hex');

class UploadService {
  async ingest(
    userId: string,
    file: MulterS3File,
    params: UploadBodyDto,
  ): Promise<Job> {

    
    // 1. Check quota
    const { usedMinutes, monthlyQuota } = await jobRepository.getUserUsage(userId);
    if (usedMinutes >= monthlyQuota) throw new QuotaExceededError();


     const user = await authRepository.findUserById(userId);

    if(!user) {
      throw new NotFoundError()
    }

    // 2. Build storage key relative to base path
    //    multer already saved the file; compute the relative key from basePath
    // const ext = path.extname(file.originalname).toLowerCase();

    // const generatedFileName = `${uuidv4()}${ext}`;

    const fileKey = file.key
    

    const s3 = new S3Client({
        region: config.AWS_REGION,
          credentials: {
            accessKeyId: config.AWS_ACCESS_KEY_ID,
            secretAccessKey:config.AWS_SECRET_ACCESS_KEY,
          },
    });
    const signedUrl = await getSignedUrl(
              s3,
              new GetObjectCommand({
                Bucket: config.AWS_S3_BUCKET,
                Key: fileKey,
              }),
              { expiresIn: 3600 }
            );
    //   await s3.send(
    //     new PutObjectCommand({
    //       Bucket: config.AWS_S3_BUCKET,
    //       Key: fileKey,
    //       Body: file.buffer,
    //       ContentType: file.mimetype,
    //       CacheControl: 'max-age=86400',
    //       ContentDisposition: 'attachment',
    //     }),
    // )
    const audioDurationSeconds = await getAudioDuration(signedUrl);

    const estimatedJobDuration = estimateProcessingSeconds(
      audioDurationSeconds,
      params.modelSize,
      params.enableDiarization,
    );
    const estimatedLabel = formatDuration(estimatedJobDuration);
    const fileMetadata = await s3.send(
          new HeadObjectCommand({
            Bucket: file.bucket,
            Key: file.key,
          }),
        );
    // 3. Create DB record (PENDING)
    const jobId = uuidv4();
    const jobData: Prisma.JobCreateInput = {
      id: jobId,
      user: { connect: { id: userId } },
      originalFileName: file.originalname,
      fileKey,
      fileSizeBytes:  fileMetadata.ContentLength?.toString() ?? "",
      language: params.language as Prisma.EnumTranscriptionLanguageFieldUpdateOperationsInput['set'],
      outputFormat: params.outputFormat as Prisma.EnumOutputFormatFieldUpdateOperationsInput['set'],
      modelSize: params.modelSize,
      enableDiarization: params.enableDiarization,
      enableTimestamps: params.enableTimestamps,
      estimatedJobDurationSecs: estimatedJobDuration,
      estimatedJobDurationMin: estimatedLabel,
      totalAudioDurationSec: audioDurationSeconds
  
    };

   await jobRepository.create(jobData);

    // 4. Build queue payload
    const callbackUrl = `${config.NODE_ENV === 'production' ? 'http://api:3000' : `http://localhost:${config.PORT}`}${config.API_PREFIX}/internal/jobs/${jobId}/callback`;
    
    const queuePayload: TranscriptionJobData = {
      jobId,
      userId,
      fileKey,
      originalFileName: file.originalname,
      fileSizeBytes: fileMetadata.ContentLength as number ,
      language: params.language,
      modelSize: params.modelSize,
      outputFormat: params.outputFormat,
      enableDiarization: params.enableDiarization,
      enableTimestamps: params.enableTimestamps,
      callbackUrl,
      callbackSecret: CALLBACK_SECRET,
      estimatedJobDurationSecs: estimatedJobDuration,
      estimatedJobDurationMin: estimatedLabel,
      totalAudioDurationSec: audioDurationSeconds
    };

    // 5. Enqueue
    const bullJobId = await transcriptionQueue.enqueue(queuePayload, user.planTier);

    // 6. Update job with BullMQ ID
    const updatedJob = await jobRepository.markAsQueued(jobId, bullJobId);

    const status = await transcriptionQueue.getQueueStatus(bullJobId, userId, user.planTier);

    logger.info('File ingested and job queued', {
      jobId,
      userId,
      fileSize: file.size,
      model: params.modelSize,
      status:status
    });

    return updatedJob;

  
  }
}

export const uploadService = new UploadService();
