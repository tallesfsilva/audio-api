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
