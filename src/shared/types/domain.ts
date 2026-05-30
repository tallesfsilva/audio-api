// src/shared/types/domain.ts
// Hand-maintained types that mirror the Prisma schema.
// These are used throughout the app instead of importing from '@prisma/client'
// directly, so the code compiles before `prisma generate` has been run and
// works cleanly in editors without the generated client present.

export enum JobStatus {
  PENDING = 'PENDING',
  QUEUED = 'QUEUED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum PlanTier {
  FREE = 'FREE',
  STARTER = 'STARTER',
  PRO = 'PRO',
  ENTERPRISE = 'ENTERPRISE',
}

export enum TranscriptionLanguage {
  auto = 'auto',
  en = 'en',
  es = 'es',
  fr = 'fr',
  de = 'de',
  it = 'it',
  pt = 'pt',
  ru = 'ru',
  ja = 'ja',
  ko = 'ko',
  zh = 'zh',
}

export enum OutputFormat {
  json = 'json',
  srt = 'srt',
  vtt = 'vtt',
  txt = 'txt',
  tsv = 'tsv',
}

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  planTier: PlanTier;
  monthlyQuota: number;
  usedMinutes: number;
  quotaResetAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Job {
  id: string;
  userId: string;
  originalFileName: string;
  fileKey: string;
  fileSizeBytes: number;
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
