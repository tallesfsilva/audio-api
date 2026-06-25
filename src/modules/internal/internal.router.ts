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

import nodemailer, { Transporter } from "nodemailer";
import { jobRepository } from '../jobs/repository/jobs.repository';
const router = Router();

let transporter: Transporter | null = null;


function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function sendUserConfirmationEmail(params: {
  to: string;
  subject: string;
  jobId: string;
  filename: string;
  resultText: string;
}): Promise<void> {
  const mailer = getTransporter();

  await mailer.sendMail({
    from: config.SUPPORT_INBOX_EMAIL,
    to: params.to,
    subject: params.subject ?? `Your transcription is ready (#${params.jobId})`,
    text: [
      `Your transcription job for the file "${params.filename}" is complete.`,
      `Job ID: ${params.jobId}`,
      ''
    ].join('\n'),
    html: `
      <p>Your transcription job for "<strong>${escapeHtml(params.filename)}</strong>" is complete.</p>
      <p>Job ID: <code>${escapeHtml(params.jobId)}</code></p>
      <p><strong>Transcript:</strong></p>
    `,
  });
}
function getTransporter(): Transporter {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: Number(config.SMTP_PORT ?? 587),
    secure: false, 
    auth: {
      user: config.SMTP_USER,
      pass: config.SMTP_PASS,
    },
  });

  return transporter;
}

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
      
    const job = await jobRepository.findJobAndUser(body.jobId)
    

    await sendUserConfirmationEmail({
        to: job?.user?.email as string,
        subject: "Your Transcription Job is Completed!",
        jobId: body.jobId,
        filename: job?.originalFileName as string,
        resultText: job?.resultKey as string,

    })
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
