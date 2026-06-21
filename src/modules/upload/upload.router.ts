// src/modules/upload/upload.router.ts
import { Router } from 'express';
import { uploadController } from './controller/upload.controller';
import { authenticate } from '../../shared/guards/authenticate';
import { uploadMiddleware } from '../../infrastructure/storage/multer';
import { checkTranscriptionQuota } from '@/shared/middleware/checkTranscriptionQuota';

const router = Router();

/**
 * POST /api/v1/upload
 * Content-Type: multipart/form-data
 * Fields:
 *   file          — audio/video file (required)
 *   language      — transcription language (default: auto)
 *   modelSize     — whisper model (default: base)
 *   outputFormat  — output format (default: json)
 *   enableDiarization — boolean string (default: false)
 *   enableTimestamps  — boolean string (default: true)
 */
router.post(
  '/',
  authenticate,
  checkTranscriptionQuota,
  uploadMiddleware.single('file'),
  (req, res) => uploadController.upload(req, res),
);

export default router;
