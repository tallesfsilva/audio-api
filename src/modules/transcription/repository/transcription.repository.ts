// src/modules/transcriptions/repository/transcriptions.repository.ts
import { Prisma, Transcription, TranscriptionSegment, TranscriptQuote, TranslationSubtitles } from '@prisma/client';
import { prisma } from '../../../infrastructure/database/client';
import { TranslatedSegment } from '@/shared/utils/translate';

export type TranscriptionWithSegments = Prisma.TranscriptionGetPayload<{
  include: { segments: { include: { words: true } } };
}>;

export type TranscriptionWithSegmentsOnly = Prisma.TranscriptionGetPayload<{
   include: { segments: true };
}>;


export type TranscriptionWithQuotes = Prisma.TranscriptionGetPayload<{
  include: { quotes: true };
}>;

export interface CreateSegmentInput {
  segmentId: number;
  startTime: number;
  endTime: number;
  text: string;
  originalText?: string;
  language?: string;
  language_probability?: number;
  words?: Array<{
    word: string;
    startTime?: number;
    endTime?: number;
    probability?: number;
  }>;
}


export interface CreateTranslationInput {
  id: string;
  fileKey: string;
  transcriptionId: string;
  sourceLanguage: string;
  targetLanguage: string;
  createdAt: Date;
  filename: string;
}
export interface CreateTranscriptionInput {
  jobId: string;
  userId: string;
  filename: string;
  targetLanguage?: string;
  language?: string;
  durationSeconds?: number;
  wordCount?: number;
  charCount?: number;
  transcript?: string;
  segments?: CreateSegmentInput[];
}
export interface CreateTranslateSubtitlesDTO {
  fileKey: string;
  transcriptionId: string;
  sourceLanguage: string;
  targetLanguage: string;
  filename: string;
  translatedTranscript: string;
}
export interface CreateQuoteInput {
  quote: string;
  startTime?: number;
  endTime?: number;
  relevanceScore?: number;
}

export interface SearchDialogueResult {
  segmentId: number;
  transcriptionId: string;
  text: string;
  startTime: Prisma.Decimal;
  endTime: Prisma.Decimal;
  rank: number;
}

class TranscriptionsRepository {
  /**
   * Creates a transcription along with its segments and words in one go.
   * Note: search_vector population for segments is expected to be handled
   * by a DB trigger (e.g. tsvector_update_trigger) — not set here.
   */
 async create(input: CreateTranscriptionInput): Promise<Transcription> {
  const SEGMENT_BATCH_SIZE = 500;
  const WORD_BATCH_SIZE = 2000;

  return prisma.$transaction(async (tx) => {
    // Create transcription
    const transcription = await tx.transcription.create({
      data: {
        jobId: input.jobId,
        userId: input.userId,
        filename: input.filename,
        language: input.language,
        targetLanguage: input.targetLanguage,
        durationSeconds: input.durationSeconds,
        wordCount: input.wordCount ?? 0,
        charCount: input.charCount ?? 0,
        transcript: input.transcript,
      },
    });

    if (!input.segments?.length) {
      return transcription;
    }

    // Map original segmentId -> database id
    const segmentMap = new Map<number, bigint>();

    // Insert segments in batches
    for (let i = 0; i < input.segments.length; i += SEGMENT_BATCH_SIZE) {
      const batch = input.segments.slice(i, i + SEGMENT_BATCH_SIZE);

      const createdSegments =
        await tx.transcriptionSegment.createManyAndReturn({
          data: batch.map((segment) => ({
            transcriptionId: transcription.id,
            segmentId: segment.segmentId,
            startTime: segment.startTime,
            originalText: segment?.originalText,
            endTime: segment.endTime,
            text: segment.text,
            language: segment.language,
            language_probability: segment.language_probability,

          })),
          select: {
            id: true,
            segmentId: true,
          },
        });

      for (const segment of createdSegments) {
        segmentMap.set(segment.segmentId, segment.id);
      }
    }

    // Flatten words
    const words = input.segments.flatMap((segment) => {
      const segmentDbId = segmentMap.get(segment.segmentId);

      if (!segmentDbId || !segment.words?.length) {
        return [];
      }

      return segment.words.map((word) => ({
        segmentDbId,
        word: word.word,
        startTime: word.startTime,
        endTime: word.endTime,
        probability: word.probability,
      }));
    });

    // Insert words in batches
    for (let i = 0; i < words.length; i += WORD_BATCH_SIZE) {
      await tx.transcriptionWord.createMany({
        data: words.slice(i, i + WORD_BATCH_SIZE),
      });
    }

    return transcription;
  });
}
  async findById(id: string): Promise<Transcription | null> {
    return prisma.transcription.findUnique({ where: { id } });
  }

  async findByJobId(jobId: string): Promise<Transcription | null> {
    return prisma.transcription.findUnique({ where: { jobId } });
  }
  async findByIdWithSegment(id: string): Promise<TranscriptionWithSegmentsOnly | null> {
    return prisma.transcription.findUnique({
      where: { id },
      include: {
        segments: {
          orderBy: { segmentId: 'asc' },
        },
      },
    });
  }

    async findByJobIdWithSegments(id: string): Promise<TranscriptionWithSegments | null> {
      try{
      return prisma.transcription.findUnique({
      where: { jobId: id },
      include: {
        segments: {
          orderBy: { segmentId: 'asc' },
          include: { words: { orderBy: { startTime: 'asc' } } },
        },
      },
    });
  }catch(e) {
    throw e
  }
  }
  async findByIdWithSegments(id: string): Promise<TranscriptionWithSegments | null> {
    return prisma.transcription.findUnique({
      where: { id },
      include: {
        segments: {
          orderBy: { segmentId: 'asc' },
          include: { words: { orderBy: { startTime: 'asc' } } },
        },
      },
    });
  }

  async findByIdWithQuotes(id: string): Promise<TranscriptionWithQuotes | null> {
    return prisma.transcription.findUnique({
      where: { id },
      include: { quotes: { orderBy: { relevanceScore: 'desc' } } },
    });
  }

  async findManyByUserId(
    userId: string,
    options?: { skip?: number; take?: number },
  ): Promise<Transcription[]> {
    return prisma.transcription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: options?.skip,
      take: options?.take,
    });
  }

  async countByUserId(userId: string): Promise<number> {
    return prisma.transcription.count({ where: { userId } });
  }

  async update(
    id: string,
    data: Partial<{
      transcript: string;
      wordCount: number;
      charCount: number;
      language: string;
      durationSeconds: number;
    }>,
  ): Promise<Transcription> {
    return prisma.transcription.update({ where: { id }, data });
  }

  async delete(id: string): Promise<Transcription> {
    // Cascades to segments, words, and quotes via FK ON DELETE CASCADE
    return prisma.transcription.delete({ where: { id } });
  }

  // ---- Segments ----

  async addSegments(
    transcriptionId: string,
    segments: CreateSegmentInput[],
  ): Promise<TranscriptionSegment[]> {
    return prisma.$transaction(
      segments.map((segment) =>
        prisma.transcriptionSegment.create({
          data: {
            transcriptionId,
            segmentId: segment.segmentId,
            startTime: segment.startTime,
            endTime: segment.endTime,
            text: segment.text,
            ...(segment.words?.length
              ? {
                  words: {
                    create: segment.words.map((word) => ({
                      word: word.word,
                      startTime: word.startTime,
                      endTime: word.endTime,
                      probability: word.probability,
                    })),
                  },
                }
              : {}),
          },
        }),
      ),
    );
  }

async createTranslatedSubtitles(
  data: CreateTranslateSubtitlesDTO
): Promise<TranslationSubtitles> {
  return prisma.translationSubtitles.create({
    data,
  });
}
async updateTranslatedSegments(
  transcriptionId: string,
  segments: TranslatedSegment[]
) {
await prisma.$transaction(
  segments.map(segment =>
    prisma.transcriptionSegment.update({
      where: {
        transcriptionId_segmentId: {
          transcriptionId: transcriptionId,
          segmentId: segment.segmentId,
        },
      },
      data: {
        translatedText: segment.translatedText,
      },
    })
  )
);
}

  async findSegmentsByTranscriptionId(transcriptionId: string): Promise<TranscriptionSegment[]> {
    return prisma.transcriptionSegment.findMany({
      where: { transcriptionId },
      orderBy: { segmentId: 'asc' },
    });
  }

  async createSearchVector(transcriptionId: string): Promise<void>{

    await prisma.$executeRaw`
        UPDATE "TranscriptionSegment"
        SET search_vector = to_tsvector('simple', "text")
        WHERE "transcriptionId" = ${transcriptionId}
`;

  }

  /**
   * Full-text search across one transcription's segments using the
   * Postgres search_vector column + GIN index. Requires a tsvector
   * trigger/generated column to keep search_vector populated.
   */
  async searchDialogue(transcriptionId: string, query: string): Promise<SearchDialogueResult[]> {
return prisma.$queryRaw<SearchDialogueResult[]>`
      SELECT
        id AS "segmentId",
        "transcriptionId" AS "transcriptionId",
        "text",
        "startTime" AS "startTime",
        "endTime" AS "endTime",
        ts_rank(search_vector, plainto_tsquery('simple', ${query})) AS rank
      FROM "TranscriptionSegment"
      WHERE "transcriptionId" = ${transcriptionId}::uuid
        AND search_vector @@ plainto_tsquery('simple', ${query})
      ORDER BY rank DESC
      LIMIT 50
    `;
  }

  /**
   * Cross-library dialogue search, scoped to a user's own transcriptions.
   */
  async searchDialogueForUser(userId: string, query: string): Promise<SearchDialogueResult[]> {
    return prisma.$queryRaw<SearchDialogueResult[]>`
      SELECT
        s.id AS "segmentId",
        s.transcription_id AS "transcriptionId",
        s.text,
        s.start_time AS "startTime",
        s.end_time AS "endTime",
        ts_rank(s.search_vector, websearch_to_tsquery('english', ${query})) AS rank
      FROM transcription_segments s
      INNER JOIN transcriptions t ON t.id = s.transcription_id
      WHERE t.user_id = ${userId}::uuid
        AND s.search_vector @@ websearch_to_tsquery('english', ${query})
      ORDER BY rank DESC
      LIMIT 50
    `;
  }

  // ---- Quotes ----

  async addQuotes(transcriptionId: string, quotes: CreateQuoteInput[]): Promise<TranscriptQuote[]> {
    return prisma.$transaction(
      quotes.map((quote) =>
        prisma.transcriptQuote.create({
          data: {
            transcriptionId,
            quote: quote.quote,
            startTime: quote.startTime,
            endTime: quote.endTime,
            relevanceScore: quote.relevanceScore,
          },
        }),
      ),
    );
  }

  async findQuotesByTranscriptionId(transcriptionId: string): Promise<TranscriptQuote[]> {
    return prisma.transcriptQuote.findMany({
      where: { transcriptionId },
      orderBy: { relevanceScore: 'desc' },
    });
  }

  async deleteQuote(id: string): Promise<TranscriptQuote> {
    return prisma.transcriptQuote.delete({ where: { id } });
  }
}

export const transcriptionsRepository = new TranscriptionsRepository();