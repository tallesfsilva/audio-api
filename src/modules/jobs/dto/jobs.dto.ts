// src/modules/jobs/dto/jobs.dto.ts
import { z } from 'zod';
import { JobStatus } from '@prisma/client';

export const ListJobsQuerySchema = z.object({
  status: z.nativeEnum(JobStatus).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const JobIdParamSchema = z.object({
  id: z.string().uuid(),
});

export type ListJobsQuery = z.infer<typeof ListJobsQuerySchema>;
