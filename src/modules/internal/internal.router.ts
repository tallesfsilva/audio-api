// src/modules/internal/internal.router.ts
// This router is called by the Python worker, NOT by the frontend.
// Secured by HMAC signature verification — never expose to public without it.

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { config } from '../../config';
import { jobsService } from '../jobs/service/jobs.service';
import { respond } from '../../shared/utils/apiResponse';
import { UnauthorizedError, ValidationError } from '../../shared/errors';
import { logger } from '../../shared/utils/logger';

const router = Router();

// Regenerate the same callback secret used in upload.service.ts
const CALLBACK_SECRET = crypto
  .createHmac('sha256', config.JWT_ACCESS_SECRET)
  .update('callback-secret')
  .digest('hex');

function verifyCallbackSignature(req: Request): void {
  const signature = req.headers['x-callback-signature'] as string | undefined;
  if (!signature) throw new UnauthorizedError('Missing callback signature');

  const body = JSON.stringify(req.body);
  const expected = crypto
    .createHmac('sha256', CALLBACK_SECRET)
    .update(body)
    .digest('hex');

  const valid = crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expected, 'hex'),
  );

  if (!valid) throw new UnauthorizedError('Invalid callback signature');
}

const ProgressSchema = z.object({
  jobId: z.string().uuid(),
  progress: z.number().int().min(0).max(100),
  message: z.string().optional(),
});

const ResultSchema = z.object({
  jobId: z.string().uuid(),
  success: z.boolean(),
  durationSeconds: z.number().optional(),
  wordCount: z.number().int().optional(),
  charCount: z.number().int().optional(),
  resultKey: z.string().optional(),
  resultText: z.string().max(500).optional(),
  errorMessage: z.string().optional(),
});

/** POST /api/v1/internal/jobs/:id/progress */
router.post('/jobs/:id/progress', async (req: Request, res: Response) => {
  verifyCallbackSignature(req);
  const body = ProgressSchema.parse(req.body);

  if (body.jobId !== req.params.id) {
    throw new ValidationError('jobId mismatch');
  }

  await jobsService.updateProgress(body.jobId, body.progress);
  logger.debug('Progress update received', { jobId: body.jobId, progress: body.progress });
  respond(res, { received: true });
});

/** POST /api/v1/internal/jobs/:id/callback */
router.post('/jobs/:id/callback', async (req: Request, res: Response) => {
  verifyCallbackSignature(req);
  const body = ResultSchema.parse(req.body);

  if (body.jobId !== req.params.id) {
    throw new ValidationError('jobId mismatch');
  }

  await jobsService.applyCallbackResult(body.jobId, body);
  logger.info('Job callback received', { jobId: body.jobId, success: body.success });
  respond(res, { received: true });
});

export default router;
