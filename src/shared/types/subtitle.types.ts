// subtitle.types.ts

import { AssSubtitleStyle } from "../utils/subtitle.formatters";
import { Word } from "./domain";

export enum SubtitleFormat {
  SRT = "SRT",
  VTT = "VTT",
  ASS = "ASS",
  TXT = "TXT"
}

export enum SubtitleStatus {
  PENDING = "PENDING",
  PROCESSING = "PROCESSING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
}

// --------------------------------------------------------------------------
// Request / Response
// --------------------------------------------------------------------------

export interface CreateSubtitleDTO {
  userId: string;
  jobId: string;
  format: SubtitleFormat;
  translate?: boolean;
  assOption?: AssSubtitleStyle
}

export interface SubtitleResponse {
  id: string;
  transcriptionId: string;
  userId: string;
  format: SubtitleFormat;
  status: SubtitleStatus;
  gcsUri: string | null;
  downloadUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// --------------------------------------------------------------------------
// Internal
// --------------------------------------------------------------------------

export interface TranscriptionSegmentRow {
  segmentId: number;
  startTime: number;
  endTime: number;
  text: string;
  words?: Word[];
  language?: string;
  language_probability?: number;
  translatedText?: string;
}

export interface TranscriptionRow {
  id: number;
  userId: string;
  segments: TranscriptionSegmentRow[];
}
