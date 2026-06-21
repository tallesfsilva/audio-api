// src/modules/transcriptions/service/transcriptions.service.ts
import { Transcription, TranscriptQuote } from '@prisma/client';
import { logger } from '../../../shared/utils/logger'; // adjust path to match your logger location
import { NotFoundError, ForbiddenError } from '../../../shared/errors';
import {
  transcriptionsRepository,
  CreateTranscriptionInput,
  CreateQuoteInput,
  TranscriptionWithSegments,
  TranscriptionWithQuotes,
  SearchDialogueResult,
} from '../repository/transcription.repository';

class TranscriptionsService {
  async create(input: CreateTranscriptionInput): Promise<Transcription> {
    const wordCount = input.wordCount ?? this.countWords(input.transcript);
    const charCount = input.charCount ?? (input.transcript?.length ?? 0);

    const transcription = await transcriptionsRepository.create({
      ...input,
      wordCount,
      charCount,
    });

    logger.info('Transcription created', {
      transcriptionId: transcription.id,
      jobId: input.jobId,
      userId: input.userId,
    });

    return transcription;
  }

  async getById(id: string, userId: string): Promise<Transcription> {
    const transcription = await transcriptionsRepository.findById(id);
    this.assertFoundAndOwned(transcription, userId);
    return transcription as Transcription;
  }

  async getByJobId(jobId: string, userId: string): Promise<Transcription> {
    const transcription = await transcriptionsRepository.findByJobId(jobId);
    this.assertFoundAndOwned(transcription, userId);
    return transcription as Transcription;
  }

  async getWithSegments(id: string, userId: string): Promise<TranscriptionWithSegments> {
    const transcription = await transcriptionsRepository.findByIdWithSegments(id);
    this.assertFoundAndOwned(transcription, userId);
    return transcription as TranscriptionWithSegments;
  }

  async getWithQuotes(id: string, userId: string): Promise<TranscriptionWithQuotes> {
    const transcription = await transcriptionsRepository.findByIdWithQuotes(id);
    this.assertFoundAndOwned(transcription, userId);
    return transcription as TranscriptionWithQuotes;
  }

  async listForUser(
    userId: string,
    page = 1,
    pageSize = 20,
  ): Promise<{ items: Transcription[]; total: number; page: number; pageSize: number }> {
    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      transcriptionsRepository.findManyByUserId(userId, { skip, take: pageSize }),
      transcriptionsRepository.countByUserId(userId),
    ]);
    return { items, total, page, pageSize };
  }

  async update(
    id: string,
    userId: string,
    data: Partial<{ transcript: string; language: string; durationSeconds: number }>,
  ): Promise<Transcription> {
    await this.getById(id, userId); // ownership check

    const updatePayload = {
      ...data,
      ...(data.transcript !== undefined
        ? {
            wordCount: this.countWords(data.transcript),
            charCount: data.transcript.length,
          }
        : {}),
    };

    return transcriptionsRepository.update(id, updatePayload);
  }

  async delete(id: string, userId: string): Promise<Transcription> {
    await this.getById(id, userId); // ownership check
    const deleted = await transcriptionsRepository.delete(id);
    logger.info('Transcription deleted', { transcriptionId: id, userId });
    return deleted;
  }

  // ---- Dialogue search ----

  async searchDialogue(
    transcriptionId: string,
    userId: string,
    query: string,
  ): Promise<SearchDialogueResult[]> {
    await this.getById(transcriptionId, userId); // ownership check
    if (!query?.trim()) return [];
    return transcriptionsRepository.searchDialogue(transcriptionId, query.trim());
  }

  async searchDialogueAcrossLibrary(
    userId: string,
    query: string,
  ): Promise<SearchDialogueResult[]> {
    if (!query?.trim()) return [];
    return transcriptionsRepository.searchDialogueForUser(userId, query.trim());
  }

  // ---- Quotes ----

  async addQuotes(
    transcriptionId: string,
    userId: string,
    quotes: CreateQuoteInput[],
  ): Promise<TranscriptQuote[]> {
    await this.getById(transcriptionId, userId); // ownership check
    return transcriptionsRepository.addQuotes(transcriptionId, quotes);
  }

  async getQuotes(transcriptionId: string, userId: string): Promise<TranscriptQuote[]> {
    await this.getById(transcriptionId, userId); // ownership check
    return transcriptionsRepository.findQuotesByTranscriptionId(transcriptionId);
  }

  // ---- helpers ----

  private assertFoundAndOwned(transcription: Transcription | null, userId: string): void {
    if (!transcription) {
      throw new NotFoundError('Transcription not found');
    }
    if (transcription.userId !== userId) {
      throw new ForbiddenError('You do not have access to this transcription');
    }
  }

  private countWords(text?: string): number {
    if (!text?.trim()) return 0;
    return text.trim().split(/\s+/).length;
  }
}

export const transcriptionsService = new TranscriptionsService();