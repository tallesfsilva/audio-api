import { z } from 'zod';

export const CreateTranscriptionWordSchema = z.object({
  word: z.string(),
  startTime: z.number().optional(),
  endTime: z.number().optional(),
  probability: z.number().optional(),
});

export const CreateTranscriptionSegmentSchema = z.object({
  segmentId: z.number(),
  startTime: z.number(),
  endTime: z.number(),
  text: z.string(),
  words: z.array(CreateTranscriptionWordSchema).optional(),
});

export const CreateTranscriptionSchema = z.object({
  jobId: z.string().uuid(),
  filename: z.string(),
  language: z.string().max(20).optional(),
  durationSeconds: z.number().optional(),
  transcript: z.string().optional(),
  segments: z.array(CreateTranscriptionSegmentSchema).optional(),
});

export const UpdateTranscriptionSchema = z.object({
  transcript: z.string().optional(),
  language: z.string().max(20).optional(),
  durationSeconds: z.number().optional(),
});

export const CreateQuoteSchema = z.object({
  quote: z.string(),
  startTime: z.number().optional(),
  endTime: z.number().optional(),
  relevanceScore: z.number().optional(),
});

export const CreateQuotesSchema = z.object({
  quotes: z.array(CreateQuoteSchema).min(1),
});

export const SearchDialogueSchema = z.object({
  q: z.string().min(1),
});

export const PaginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
});

export type CreateTranscriptionDto = z.infer<typeof CreateTranscriptionSchema>;
export type UpdateTranscriptionDto = z.infer<typeof UpdateTranscriptionSchema>;
export type CreateQuotesDto = z.infer<typeof CreateQuotesSchema>;
export type SearchDialogueDto = z.infer<typeof SearchDialogueSchema>;
export type PaginationDto = z.infer<typeof PaginationSchema>;
