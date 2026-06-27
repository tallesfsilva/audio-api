// src/shared/types/queue.ts
// These types define the contract between the Node API and the Python worker.
// Keep in sync with the Python worker's type definitions.

import { Segment } from "./domain";

export type ModelSize = 'tiny' | 'base' | 'small' | 'medium' | 'large' | 'large-v2' | 'large-v3';

export type TranscriptionLanguage =
  | "auto"
  | "af" | "am" | "ar" | "as" | "az"
  | "ba" | "be" | "bg" | "bn" | "bo" | "br" | "bs"
  | "ca" | "cs" | "cy"
  | "da" | "de"
  | "el" | "en" | "es" | "et" | "eu"
  | "fa" | "fi" | "fo" | "fr"
  | "gl" | "gu"
  | "ha" | "haw" | "he" | "hi" | "hr" | "ht" | "hu" | "hy"
  | "id" | "is" | "it"
  | "ja" | "jw"
  | "ka" | "kk" | "km" | "kn" | "ko"
  | "la" | "lb" | "ln" | "lo" | "lt" | "lv"
  | "mg" | "mi" | "mk" | "ml" | "mn" | "mr" | "ms" | "mt" | "my"
  | "ne" | "nl" | "nn" | "no"
  | "oc"
  | "pa" | "pl" | "ps" | "pt"
  | "ro" | "ru"
  | "sa" | "sd" | "si" | "sk" | "sl" | "sn" | "so" | "sq" | "sr" | "su" | "sv" | "sw"
  | "ta" | "te" | "tg" | "th" | "tk" | "tl" | "tr" | "tt"
  | "uk" | "ur" | "uz"
  | "vi"
  | "yi" | "yo"
  | "zh";

export type OutputFormat = 'json' | 'srt' | 'vtt' | 'txt' | 'tsv';

/** Job data written by Node API → consumed by Python worker */
export interface TranscriptionJobData {
  jobId: string;
  userId: string;
  fileKey: string;           // storage path or S3 key
  originalFileName: string;
  fileSizeBytes: number;
  targetLanguage?: string;

  // Transcription params
  language: TranscriptionLanguage;
  modelSize: ModelSize;
  outputFormat: OutputFormat;
  enableDiarization: boolean;
  enableTimestamps: boolean;
  estimatedJobDurationSecs: number;
  estimatedJobDurationMin: string;
  totalAudioDurationSec: number;
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
  resultTextKey?: string;
  language: TranscriptionLanguage;
  segments?: Segment[];
  transcription?: string;
}

/** BullMQ job names */
export const QUEUE_EVENTS = {
  TRANSCRIPTION: 'transcription',
} as const;
