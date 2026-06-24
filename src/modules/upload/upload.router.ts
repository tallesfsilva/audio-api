// src/modules/upload/upload.router.ts
import { Router } from 'express';
import { uploadController } from './controller/upload.controller';
import { authenticate } from '../../shared/guards/authenticate';

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
  (req, res) => uploadController.upload(req, res),
);


router.post(
  '/sign-url',
  authenticate,
  // checkTranscriptionQuota,
  (req, res) => uploadController.signUrl(req, res),
);

export default router;
