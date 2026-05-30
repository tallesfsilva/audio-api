// src/modules/upload/dto/upload.dto.ts
import { z } from 'zod';

export const UploadBodySchema = z.object({
  language: z
    .enum(['auto', 'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh'])
    .default('auto'),
  modelSize: z
    .enum(['tiny', 'base', 'small', 'medium', 'large', 'large-v2', 'large-v3'])
    .default('base'),
  outputFormat: z.enum(['json', 'srt', 'vtt', 'txt', 'tsv']).default('json'),
  enableDiarization: z
    .string()
    .transform((v) => v === 'true')
    .pipe(z.boolean())
    .default('false'),
  enableTimestamps: z
    .string()
    .transform((v) => v !== 'false')
    .pipe(z.boolean())
    .default('true'),
});

export type UploadBodyDto = z.infer<typeof UploadBodySchema>;
