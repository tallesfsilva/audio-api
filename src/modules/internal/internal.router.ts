// src/modules/internal/internal.router.ts
// This router is called by the Python worker, NOT by the frontend.
// Secured by HMAC signature verification — never expose to public without it.

import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { config } from '../../config';
import { jobsService } from '../jobs/service/jobs.service';
import { respond } from '../../shared/utils/apiResponse';
import { UnauthorizedError, ValidationError } from '../../shared/errors';
import { logger } from '../../shared/utils/logger';
import express from 'express';
import { getSocket } from '@/infrastructure/socket';


const router = Router();


// Regenerate the same callback secret used in upload.service.ts
const CALLBACK_SECRET = crypto
  .createHmac('sha256', config.JWT_ACCESS_SECRET)
  .update('callback-secret')
  .digest('hex');

function verifyCallbackSignature(req: Request): void {
  const signature = req.headers['x-callback-signature'] as string | undefined;
  if (!signature) throw new UnauthorizedError('Missing callback signature');


   const rawBody = (req as any).rawBody;
  if (!rawBody) throw new UnauthorizedError('Missing raw body for signature verification');

  
  const expected = crypto
    .createHmac('sha256', CALLBACK_SECRET)
    .update(rawBody)
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
const WordSchema = z.object({
  word: z.string(),
  start: z.number(),
  end: z.number(),
  prob: z.number(),
});

const SegmentSchema = z.object({
  id: z.number(),
  start: z.number(),
  end: z.number(),
  text: z.string(),
  words: z.array(WordSchema).optional(),
});
const ResultSchema = z.object({
  jobId: z.string().uuid(),
  success: z.boolean(),

  durationSeconds: z.number().optional(),
  wordCount: z.number().int().optional(),
  charCount: z.number().int().optional(),

  resultKey: z.string().optional(),
  resultText: z.string().optional(),
  transcription: z.string().optional(),
  resultTextKey: z.string().optional(),

  erroMessage: z.string().nullable().optional(),

  segments: z.array(SegmentSchema).optional(),
});

/** POST /api/v1/internal/jobs/:id/progress */
router.post('/jobs/:id/progress',  express.json({
  verify: (req: Request, _res, buf) => {
    req.rawBody = buf; // Buffer of the exact bytes received
  }
}), async (req: Request, res: Response) => {
  verifyCallbackSignature(req);
  const body = ProgressSchema.parse(req.body);

  if (body.jobId !== req.params.id) {
    throw new ValidationError('jobId mismatch');
  }
  const io = getSocket();
   

  await jobsService.updateProgress(body.jobId, body.progress);

  if(io){

    io.to(`job:${body.jobId}`).emit("job:update", {
      jobId: body.jobId,
      status: "processing",
      progress: body.progress,
      message: body.message || ""
  });
  }
   

  logger.debug('Progress update received', { jobId: body.jobId, progress: body.progress });
  respond(res, { received: true });
});

/** POST /api/v1/internal/jobs/:id/callback */
router.post('/jobs/:id/callback',  express.json({
   limit: '50mb',
  verify: (req: Request, _res:Response, buf) => {
    req.rawBody = buf; // Buffer of the exact bytes received
  },
}), async (req: Request, res: Response, next: NextFunction) => {
  try{
    verifyCallbackSignature(req);
    const body = ResultSchema.parse(req.body);

    if (body.jobId !== req.params.id) {
      throw new ValidationError('jobId mismatch');
    }
    respond(res, { received: true });
    jobsService.applyCallbackResult(body.jobId, body).catch(err => {
          logger.error('Failed to apply callback result', { jobId: body.jobId, err });
      });
    
    const io = getSocket();
   

    if(io){
       io.to(`job:${body.jobId}`).emit("job:update", {
      jobId: body.jobId,
      status: "done",
  });
  }

    logger.info('Job callback received', { jobId: body.jobId, success: body.success });
    
  }catch(e){
      console.error("Error parsing: ", e)
      next(new ValidationError('Error Parsing'));
  }
  
});

export default router;
