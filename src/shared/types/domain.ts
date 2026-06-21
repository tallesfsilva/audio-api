// src/shared/types/domain.ts
// Hand-maintained types that mirror the Prisma schema.
// Using string union types (not enums) so Prisma's returned plain strings
// are directly assignable without any casting.

import { $Enums } from "@prisma/client";

// ── Enums ─────────────────────────────────────────────────────────────────────
export interface MulterS3File extends Express.Multer.File {
  bucket: string;
  key: string;
  location: string;
  etag: string;
}
export type JobStatus =
  | 'PENDING'
  | 'QUEUED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export const JobStatus = {
  PENDING:    'PENDING',
  QUEUED:     'QUEUED',
  PROCESSING: 'PROCESSING',
  COMPLETED:  'COMPLETED',
  FAILED:     'FAILED',
  CANCELLED:  'CANCELLED',
} as const;

export type PlanTier = 'FREE' | 'STARTER' | 'PRO' | 'ENTERPRISE';

export const PlanTier = {
  FREE:       'FREE',
  STARTER:    'STARTER',
  PRO:        'PRO',
  ENTERPRISE: 'ENTERPRISE',
} as const;
  
export type SubscriptionStatus =
  | 'INCOMPLETE'
  | 'INCOMPLETE_EXPIRED'
  | 'TRIALING'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'CANCELED'
  | 'UNPAID'
  | 'PAUSED';

export const SubscriptionStatus = {
  INCOMPLETE:          'INCOMPLETE',
  INCOMPLETE_EXPIRED:  'INCOMPLETE_EXPIRED',
  TRIALING:            'TRIALING',
  ACTIVE:              'ACTIVE',
  PAST_DUE:            'PAST_DUE',
  CANCELED:            'CANCELED',
  UNPAID:              'UNPAID',
  PAUSED:              'PAUSED',
} as const;

export type TranscriptionLanguage =
  | 'auto' | 'en' | 'es' | 'fr' | 'de' | 'it' | 'pt' | 'ru' | 'ja' | 'ko' | 'zh';

export type OutputFormat = 'json' | 'srt' | 'vtt' | 'txt' | 'tsv';

// ── Models ────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  planTier: PlanTier;
  monthlyQuota: number;
  usedMinutes: number;
  quotaResetAt: Date;
  stripeCustomerId: string | null;
  createdAt: Date;
  updatedAt: Date;
  role:$Enums.UserRole;

  // Relations (optional — only present when explicitly included in queries)
  subscription?: Subscription | null;
}

export interface Subscription {
  id: string;
  userId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripePriceId: string;
  stripeProductId: string;
  planTier: PlanTier;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  trialEnd: Date | null;
  createdAt: Date;
  updatedAt: Date;
  amountCents: number

  // Relation (optional)
  user?: User;
}

export interface Job {
  id: string;
  userId: string;
  originalFileName: string;
  fileKey: string;
  fileSizeBytes: string | number;
  durationSeconds: number | null;
  language: TranscriptionLanguage;
  outputFormat: OutputFormat;
  modelSize: string;
  enableDiarization: boolean;
  enableTimestamps: boolean;
  status: JobStatus;
  bullJobId: string | null;
  queuedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  errorMessage: string | null;
  retryCount: number;
  progress: number;
  resultKey: string | null;
  resultText: string | null;
  resultTextKey: string | null;
  wordCount: number | null;
  charCount: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RefreshToken {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
}


export interface Word {
  word: string;
  start: number;
  end: number;
  prob: number;
}

export interface Segment {
  id: number;
  start: number;
  end: number;
  text: string;
  words?: Word[];
}

export interface Result {
  jobId: string;
  success: boolean;
  durationSeconds?: number;
  wordCount?: number;
  charCount?: number;
  resultKey?: string;
  resultText?: string;
  transcription?: string;
  resultTextKey?: string;
  erroMessage?: string | null;
  segments?: Segment[];
}