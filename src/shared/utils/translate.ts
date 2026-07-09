
import { v2 as Translate } from "@google-cloud/translate";
import { Word } from "../types/domain";
 

const translateClient = new Translate.Translate({
  projectId: "substantial-mix-485814-v7",
});
 

export function mapSegment(segments:  any[]) {
  try{
  return segments.map((seg) => ({
     segmentId:   seg.segmentId,
    startTime:   Number(seg.startTime),
    endTime: Number(seg.endTime),
    text: seg.text,
    originalText: seg?.originalText,
    language: (seg as any).language,
    words: (seg as any).words,
    language_probability: (seg as any).language_probability,
  }));
}catch(e){
  throw e
}
}
/**
 * Each segment now carries its own detected source language.
 * Update SegmentInput accordingly in your payload/types.
 */
export interface SegmentInput {
  segmentId: number;
  startTime: number;
  endTime: number;
  text: string;
  originalText?: string;
  words?: Word[];
  language: string; 
  language_probability?: number;
}

 

export interface TranslatedSegment {
  segmentId: number;
  startTime: number;
  originalText?: string;
  translatedText?: string;
  language?: string;
  endTime: number;
  text: string;
}

// --------------------------------------------------------------------------
// Internal: group segments by sourceLanguage, preserving their original index
// so we can rebuild in-order results after translating each group separately.
// --------------------------------------------------------------------------

interface IndexedSegment {
  originalIndex: number;
  segment: SegmentInput;
}

// --------------------------------------------------------------------------
// Google Translate call with alignment validation + per-segment fallback
// --------------------------------------------------------------------------

async function translateBatch(
  texts: string[],
  targetLang: string,
  sourceLang?: string | null
): Promise<string[]> {
  const [translations] = await translateClient.translate(texts, {
    from: sourceLang ?? undefined, // omit to let Google auto-detect per string
    to: targetLang,
  });

  // translateClient.translate returns a string when input is a string,
  // and string[] when input is string[] — texts is always string[] here,
  // but guard anyway since alignment correctness matters most.
  const result = Array.isArray(translations) ? translations : [translations];

  if (result.length !== texts.length) {
    throw new Error(`Alignment mismatch: sent ${texts.length}, received ${result.length}`);
  }
  return result;
}

async function translateOneByOne(
  segments: SegmentInput[],
  targetLang: string,
  sourceLang?: string | null
): Promise<string[]> {
  const outputs: string[] = [];
  for (const seg of segments) {
    try {
      const [translated] = await translateBatch([seg.text], targetLang, sourceLang);
      outputs.push(translated);
    } catch (err) {
      console.error(`Segment ${seg.segmentId} failed to translate, keeping original text`, err);
      outputs.push(seg.text); // never drop a line
    }
  }
  return outputs;
}
function makeBatches(
  segments: SegmentInput[],
  maxChars = 15000, // Google Translate batches well; stay under request limits
  maxItems = 100
): SegmentInput[][] {
  const batches: SegmentInput[][] = [];
  let current: SegmentInput[] = [];
  let currentChars = 0;

  for (const seg of segments) {
    if (current.length && (currentChars + seg.text.length > maxChars || current.length >= maxItems)) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(seg);
    currentChars += seg.text.length;
  }
  if (current.length) batches.push(current);

  return batches;
}
function groupBySourceLanguage(segments: SegmentInput[]): Map<string, IndexedSegment[]> {
  const groups = new Map<string, IndexedSegment[]>();

  segments.forEach((segment, originalIndex) => {
    // Normalise null/unknown to the sentinel "auto" so Google auto-detects
    const key = segment.language ?? "auto";

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ originalIndex, segment });
  });

  return groups;
}

// --------------------------------------------------------------------------
// Refactored translateAll
// --------------------------------------------------------------------------

export async function translateAll(
  segments: SegmentInput[],
  targetLang: string,
  translateSub?: boolean
): Promise<TranslatedSegment[]> {
  // Pre-allocate result array so we can write back by original index
  // regardless of which group/batch finishes in what order.
  const results = new Array<TranslatedSegment>(segments.length);

  const groups = groupBySourceLanguage(segments);

  // Process each source-language group independently.
  // Groups with the same source language share batches → fewer API calls.
  for (const [sourceLang, indexed] of groups) {
    const resolvedSource = sourceLang === "auto" ? null : sourceLang;

    // --- Skip translation: source and target are the same language ---
    // Normalise to base tag before comparing ("pt-BR" → "pt") so variants
    // don't cause unnecessary round-trips.
    const baseSource = resolvedSource?.split("-")[0].toLowerCase();
    const baseTarget = targetLang.split("-")[0].toLowerCase();

    if (baseSource && baseSource === baseTarget) {
      for (const { originalIndex, segment } of indexed) {
        results[originalIndex] = {
          segmentId: segment.segmentId,
          startTime: segment.startTime,
          originalText: segment.originalText,
          endTime: segment.endTime,
          text: segment.text, // no-op: copy original text
        };
      }
      continue;
    }

    // --- Translate this group in batches ---
    const groupSegments = indexed.map((i) => i.segment);
    const batches = makeBatches(groupSegments);

    let groupDone = 0;

    for (const batch of batches) {

      const texts = batch.map((s) => translateSub ? s?.originalText as string : s.text);
      let translatedTexts: string[];

      try {
        translatedTexts = await translateBatch(texts, targetLang, resolvedSource);
      } catch (err) {
        console.warn(
          `Batch of ${batch.length} (${sourceLang} → ${targetLang}) failed/misaligned, retrying per-segment`,
          err
        );
        translatedTexts = await translateOneByOne(batch, targetLang, resolvedSource);
      }

      batch.forEach((seg, batchIndex) => {
        // Map back to the original position in the output array
        const originalIndex = indexed[groupDone + batchIndex].originalIndex;

        results[originalIndex] = {
          segmentId: seg.segmentId,
          startTime: seg.startTime,
          originalText: seg.originalText,
          endTime: seg.endTime,
          text: translateSub ? seg.text : translatedTexts[batchIndex],
          translatedText: translateSub ? translatedTexts[batchIndex] : ""
        };
      });

      groupDone += batch.length;
    }
  }

  return results;
}