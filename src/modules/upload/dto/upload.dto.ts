// src/modules/upload/dto/upload.dto.ts
import { z } from 'zod';

export const UploadBodySchema = z.object({
  jobId: z.string(),

  gcsPath: z.string().startsWith('gs://'),

  objectName: z.string().min(1),

  filename: z.string().min(1),

  sizeBytes: z.number().int().positive(),

  targetLanguage: z.string().optional(),

  durationSeconds: z.number().positive(),

  language: z.enum([
    'auto',
    'en',
    'es',
    'fr',
    'de',
    'it',
    'pt',
    'ru',
    'ja',
    'ko',
    'zh',
  ]),
 outputFormat: z.enum(['json', 'srt', 'vtt', 'txt', 'tsv']).default('json'),
  modelSize: z.enum([
    'tiny',
    'base',
    'small',
    'medium',
    'large',
    'large-v2',
    'large-v3',
  ]),

  enableDiarization: z.boolean().default(false),

  enableTimestamps: z.boolean().default(true),
});



export interface SignUrlRequestDto {
  filename: string;
  contentType: string;
}

export interface SignUrlResponseDto {
  jobId: string;
  uploadUrl: string;
  objectName: string;
  gcsPath: string;
}

export type UploadBodyDto = z.infer<typeof UploadBodySchema>;
