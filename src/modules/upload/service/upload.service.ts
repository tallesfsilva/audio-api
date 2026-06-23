// src/modules/upload/service/upload.service.ts
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { Job } from '../../../shared/types/domain';
import {Prisma} from '@prisma/client';
import { config } from '../../../config';
import { jobRepository } from '../../jobs/repository/jobs.repository';
import { transcriptionQueue } from '../../../queue/producers/transcription.producer';
import { NotFoundError, QuotaExceededError, ValidationError } from '../../../shared/errors';
import { TranscriptionJobData } from '../../../shared/types/queue';
import { SignUrlRequestDto, SignUrlResponseDto, UploadBodyDto } from '../dto/upload.dto';
import { logger } from '../../../shared/utils/logger';import { estimateProcessingSeconds, formatDuration } from '@/shared/utils/jobs';
import { authRepository } from '@/modules/auth/repository/auth.repository';

import { Storage } from '@google-cloud/storage';
 
const storage = new Storage();
const BUCKET_NAME = config.GCS_UPLOAD_BUCKET as string;
const SIGNED_URL_EXPIRY_MS = 60 * 60 * 1000; // 1 hour
// One-time HMAC secret for callback verification between Node ↔ Python
const CALLBACK_SECRET = crypto
  .createHmac('sha256', config.JWT_ACCESS_SECRET)
  .update('callback-secret')
  .digest('hex');

class UploadService {
  async ingest(
    userId: string,
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

    const fileKey = params.objectName;

    // const s3 = new S3Client({
    //     region: config.AWS_REGION,
    //       credentials: {
    //         accessKeyId: config.AWS_ACCESS_KEY_ID,
    //         secretAccessKey:config.AWS_SECRET_ACCESS_KEY,
    //       },
    // });
    // const signedUrl = await getSignedUrl(
    //           s3,
    //           new GetObjectCommand({
    //             Bucket: config.AWS_S3_BUCKET,
    //             Key: fileKey,
    //           }),
    //           { expiresIn: 3600 }
    //         );
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
    // const audioDurationSeconds = await getAudioDuration(signedUrl);

    const estimatedJobDuration = estimateProcessingSeconds(
      params.durationSeconds,
      params.modelSize,
      params.enableDiarization,
    );
    const estimatedLabel = formatDuration(estimatedJobDuration);
    // const fileMetadata = await s3.send(
    //       new HeadObjectCommand({
    //         Bucket: file.bucket,
    //         Key: file.key,
    //       }),
    //     );
    // 3. Create DB record (PENDING)
    const jobId = params.jobId;
    const jobData: Prisma.JobCreateInput = {
      id: jobId,
      user: { connect: { id: userId } },
      originalFileName: params.filename,
      fileKey,
      fileSizeBytes:  params.sizeBytes?.toString() ?? "",
      language: params.language as Prisma.EnumTranscriptionLanguageFieldUpdateOperationsInput['set'],
      outputFormat: params.outputFormat as Prisma.EnumOutputFormatFieldUpdateOperationsInput['set'],
      modelSize: params.modelSize,
      enableDiarization: params.enableDiarization,
      enableTimestamps: params.enableTimestamps,
      estimatedJobDurationSecs: estimatedJobDuration,
      estimatedJobDurationMin: estimatedLabel,
      totalAudioDurationSec:  params.durationSeconds
  
    };

   await jobRepository.create(jobData);

    // 4. Build queue payload
    const callbackUrl = `${config.NODE_ENV === 'production' ? 'http://api:3000' : `http://localhost:${config.PORT}`}${config.API_PREFIX}/internal/jobs/${jobId}/callback`;
    
    const queuePayload: TranscriptionJobData = {
      jobId,
      userId,
      fileKey,
      originalFileName: params.filename,
      fileSizeBytes: params.sizeBytes as number ,
      language: params.language,
      modelSize: params.modelSize,
      outputFormat: params.outputFormat,
      enableDiarization: params.enableDiarization,
      enableTimestamps: params.enableTimestamps,
      callbackUrl,
      callbackSecret: CALLBACK_SECRET,
      estimatedJobDurationSecs: estimatedJobDuration,
      estimatedJobDurationMin: estimatedLabel,
      totalAudioDurationSec:  params.durationSeconds
    };

    // 5. Enqueue
    const bullJobId = await transcriptionQueue.enqueue(queuePayload, user.planTier);

    // 6. Update job with BullMQ ID
    const updatedJob = await jobRepository.markAsQueued(jobId, bullJobId);

    const status = await transcriptionQueue.getQueueStatus(bullJobId, userId, user.planTier);

    logger.info('File ingested and job queued', {
      jobId,
      userId,
      fileSize: params.sizeBytes,
      model: params.modelSize,
      status:status
    });

    return updatedJob;

  
  }

async signUrl(userId: string, params: SignUrlRequestDto): Promise<SignUrlResponseDto> {
    const { filename, contentType } = params;
    const jobId = uuidv4();
    const objectName = `uploads/${userId}/${jobId}/${filename}`;
    const gcsPath = `gs://${BUCKET_NAME}/${objectName}`;

    const blob = storage.bucket(BUCKET_NAME).file(objectName);

    let uploadUrl: string;
    try {
      [uploadUrl] = await blob.getSignedUrl({
        version: "v4",
        action: "write",
        expires: Date.now() + SIGNED_URL_EXPIRY_MS,
        contentType,
      });
    } catch (err) {
      console.error("Failed to sign URL", err);
      throw new ValidationError("could not generate signed url");
    }

      return { jobId, uploadUrl, objectName, gcsPath };
        }
}

export const uploadService = new UploadService();
