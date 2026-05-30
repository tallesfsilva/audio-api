// src/shared/types/queue.ts
// These types define the contract between the Node API and the Python worker.
// Keep in sync with the Python worker's type definitions.

export type ModelSize = 'tiny' | 'base' | 'small' | 'medium' | 'large' | 'large-v2' | 'large-v3';

export type TranscriptionLanguage =
  | 'auto' | 'en' | 'es' | 'fr' | 'de' | 'it' | 'pt' | 'ru' | 'ja' | 'ko' | 'zh';

export type OutputFormat = 'json' | 'srt' | 'vtt' | 'txt' | 'tsv';

/** Job data written by Node API → consumed by Python worker */
export interface TranscriptionJobData {
  jobId: string;
  userId: string;
  fileKey: string;           // storage path or S3 key
  originalFileName: string;
  fileSizeBytes: number;

  // Transcription params
  language: TranscriptionLanguage;
  modelSize: ModelSize;
  outputFormat: OutputFormat;
  enableDiarization: boolean;
  enableTimestamps: boolean;

  // Callback info (worker POSTs progress/results here)
  callbackUrl: string;       // e.g. http://api:3000/internal/jobs/:id/callback
  callbackSecret: string;    // HMAC secret for callback verification
}

/** Progress update sent by Python worker → Node API */
export interface TranscriptionProgressUpdate {
  jobId: string;
  progress: number;          // 0–100
  message?: string;
}

/** Final result sent by Python worker → Node API */
export interface TranscriptionResult {
  jobId: string;
  success: boolean;
  durationSeconds?: number;
  wordCount?: number;
  charCount?: number;
  resultKey?: string;        // storage path for full transcript file
  resultText?: string;       // first 500 chars preview
  errorMessage?: string;
}

/** BullMQ job names */
export const QUEUE_EVENTS = {
  TRANSCRIPTION: 'transcription',
} as const;
