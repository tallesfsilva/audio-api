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
import { transcriptionsService } from '../transcription/service/transcriptions.service';
import { mapSegment } from '@/shared/utils/translate';
const router = Router();

let transporter: Transporter | null = null;

import { Storage } from '@google-cloud/storage';

const storage = new Storage({
  keyFilename: "/SECRET/SERVICE_ACCOUNT",
});
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
  resultKey: string;
}): Promise<void> {
  const mailer = getTransporter();

  await mailer.sendMail({
    from: config.SUPPORT_INBOX_EMAIL,
    to: params.to,
    subject: params.subject ?? `Your transcription is ready (#${params.jobId})`,
   text: [
  `Your transcription is ready!`,
  ``,
  `File: ${params.filename}`,
  `Job ID: ${params.jobId}`,
  ``,
  `Download your subtitles:`,
  `${params.resultKey}`,
].join("\n"),
html: `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Your transcription is ready</title>
</head>

<body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">

<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f7;padding:40px 20px;">
<tr>
<td align="center">

<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">

<tr>
<td style="background:#111827;padding:32px;text-align:center;">
<h1 style="margin:0;color:#ffffff;font-size:30px;font-weight:700;">
🎬 Subcult
</h1>
</td>
</tr>

<tr>
<td style="padding:48px 40px;">

<h2 style="margin:0 0 20px;font-size:28px;font-weight:700;color:#111827;">
Your transcription is ready!
</h2>

<p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#4b5563;">
Good news! We've finished processing your video and your subtitles are ready to download.
</p>

<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:32px 0;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;">
<tr>
<td style="padding:20px;">

<p style="margin:0 0 8px;font-size:13px;color:#6b7280;font-weight:600;">
FILE
</p>

<p style="margin:0 0 20px;font-size:16px;color:#111827;">
<strong>${escapeHtml(params.filename)}</strong>
</p>

<p style="margin:0 0 8px;font-size:13px;color:#6b7280;font-weight:600;">
JOB ID
</p>

<p style="margin:0;font-family:monospace;font-size:14px;color:#374151;">
${escapeHtml(params.jobId)}
</p>

</td>
</tr>
</table>

<table role="presentation" cellspacing="0" cellpadding="0" style="margin:36px auto;">
<tr>
<td align="center" bgcolor="#6D28D9" style="border-radius:8px;">
<a
href="${params.resultKey}"
style="
display:inline-block;
padding:16px 34px;
font-size:16px;
font-weight:600;
color:#ffffff;
text-decoration:none;
">
⬇ Download Subtitle (.srt)
</a>
</td>
</tr>
</table>

<p style="margin:32px 0 12px;font-size:14px;color:#6b7280;">
If the button doesn't work, copy and paste this link into your browser:
</p>

<p style="margin:0;word-break:break-all;font-size:14px;">
<a href="${params.resultKey}" style="color:#2563eb;text-decoration:none;">
${params.resultKey}
</a>
</p>

<hr style="margin:40px 0;border:none;border-top:1px solid #e5e7eb;">

<p style="margin:0;font-size:14px;line-height:1.7;color:#6b7280;">
Thank you for using <strong>Subcult</strong>. We hope your subtitles help bring your content to a wider audience.
</p>

</td>
</tr>

<tr>
<td style="background:#f9fafb;padding:24px;text-align:center;border-top:1px solid #e5e7eb;">

<p style="margin:0;font-size:13px;color:#9ca3af;">
© ${new Date().getFullYear()} Subcult. All rights reserved.
</p>

</td>
</tr>

</table>

</td>
</tr>
</table>

</body>
</html>
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
// const WordSchema = z.object({
//   word: z.string(),
//   start: z.number(),
//   end: z.number(),
//   prob: z.number(),
// });

export const TranscriptionLanguageSchema = z.enum([
  "auto",
  "en",
  "es",
  "fr",
  "de",
  "it",
  "pt",
  "ru",
  "ja",
  "ko",
  "zh",
]);
// const SegmentSchema = z.object({
//   id: z.number(),
//   start: z.number(),
//   end: z.number(),
//   text: z.string(),
//   words: z.array(WordSchema).optional(),
// });
const ResultSchema = z.object({
  jobId: z.string().uuid(),
  success: z.boolean(),
  language : z.enum([
  "auto",
  "af", "am", "ar", "as", "az",
  "ba", "be", "bg", "bn", "bo", "br", "bs",
  "ca", "cs", "cy",
  "da", "de",
  "el", "en", "es", "et", "eu",
  "fa", "fi", "fo", "fr",
  "gl", "gu",
  "ha", "haw", "he", "hi", "hr", "ht", "hu", "hy",
  "id", "is", "it",
  "ja", "jw",
  "ka", "kk", "km", "kn", "ko",
  "la", "lb", "ln", "lo", "lt", "lv",
  "mg", "mi", "mk", "ml", "mn", "mr", "ms", "mt", "my",
  "ne", "nl", "nn", "no",
  "oc",
  "pa", "pl", "ps", "pt",
  "ro", "ru",
  "sa", "sd", "si", "sk", "sl", "sn", "so", "sq", "sr", "su", "sv", "sw",
  "ta", "te", "tg", "th", "tk", "tl", "tr", "tt",
  "uk", "ur", "uz",
  "vi",
  "yi", "yo",
  "zh"
]),

  durationSeconds: z.number().optional(),
  wordCount: z.number().int().optional(),
  charCount: z.number().int().optional(),

  resultKey: z.string().optional(),
  resultText: z.string().optional(),
  transcription: z.string().optional(),
  resultTextKey: z.string().optional(),

  erroMessage: z.string().nullable().optional(),

  transcriptionKey: z.string(),
  // resultAssKey: z.string(),
});

 


const TranslateSchema = z.object({
  targetLanguage: z.string(),
  jobId: z.string().uuid(),
  sourceLanguage: z.string(),
  transcriptionKey: z.string()
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


/** POST /api/v1/internal/jobs/:id/progress */
router.post('/jobs/:id/translate',  express.json({
  verify: (req: Request, _res, buf) => {
    req.rawBody = buf; // Buffer of the exact bytes received
  }
}), async (req: Request, res: Response,  next: NextFunction) => {
  try{



  verifyCallbackSignature(req);

  const body = TranslateSchema.parse(req.body);

  if (body.jobId !== req.params.id) {
      throw new ValidationError('jobId mismatch');
    }

  const [contents] = await storage.bucket(config.GCS_BUCKET).file(body.transcriptionKey).download();

  const transcription = JSON.parse(contents.toString("utf8"));
  const segmentsMapped = mapSegment(transcription.segments as []) 
  const strTranslated = await transcriptionsService.translateTranscrptionWorker(segmentsMapped,body.sourceLanguage, body.targetLanguage)

 
  respond(res, {strTranslated: strTranslated.str, transcript: strTranslated.transcript,  success: true });
    }catch(e){
      console.error("Error parsing: ", e)
      next(new ValidationError('Error Parsing'));
    }
});


/** POST /api/v1/internal/jobs/:id/callback */
// router.post('/jobs/:id/callback-v2',  express.json({
//   limit: '5mb',
//   verify: (req: Request, _res:Response, buf) => {
//     req.rawBody = buf; // Buffer of the exact bytes received
//   },
// }), async (req: Request, res: Response, next: NextFunction) => {
//   try{
//     verifyCallbackSignature(req);
//     const body = ResultSchema.parse(req.body);

//     if (body.jobId !== req.params.id) {
//       throw new ValidationError('jobId mismatch');
//     }
//     respond(res, { received: true });
//     jobsService.applyCallbackResult(body.jobId, body).catch(err => {
//           logger.error('Failed to apply callback result', { jobId: body.jobId, err });
//       });
      
//     const job = await jobRepository.findJobAndUser(body.jobId)
    

//     await sendUserConfirmationEmail({
//         to: job?.user?.email as string,
//         subject: "Your Transcription Job is Completed!",
//         jobId: body.jobId,
//         filename: job?.originalFileName as string,
//         resultKey: job?.resultKey as string,

//     })
//     const io = getSocket();
   

//     if(io){
//        io.to(`job:${body.jobId}`).emit("job:update", {
//       jobId: body.jobId,
//       status: "done",
//   });
//   }

//     logger.info('Job callback received', { jobId: body.jobId, success: body.success });
    
//   }catch(e){
//       console.error("Error parsing: ", e)
//       next(new ValidationError('Error Parsing'));
//   }
  
// });





/** POST /api/v1/internal/jobs/:id/callback */
router.post('/jobs/:id/callback',  express.json({
  limit: '5mb',
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
        resultKey: body?.resultKey as string,

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
