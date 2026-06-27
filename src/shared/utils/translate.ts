
import { v2 as Translate } from "@google-cloud/translate";
import { Storage } from "@google-cloud/storage";
import { config } from "@/config";

const translateClient = new Translate.Translate({
  projectId: "substantial-mix-485814-v7 ",
});
// const storage = new Storage();

const storage = new Storage({
  keyFilename: "/SECRET/SERVICE_ACCOUNT",
});
const BUCKET_NAME = config.GCS_UPLOAD_BUCKET as string;
interface SegmentInput {
  id: bigint;
  segmentId: number;
  startTime: any;
  endTime: any;
  text: string;
 
}

interface TranslatedSegment {
  segmentId: number;
  startTime: number;
  endTime: number;
  translatedText: string;
}// --------------------------------------------------------------------------
// Batching — group consecutive segments for context, capped by size
// --------------------------------------------------------------------------

function makeBatches(
  segments: SegmentInput[],
  maxChars = 4000, // Google Translate batches well; stay under request limits
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

// --------------------------------------------------------------------------
// SRT building + GCS upload
// --------------------------------------------------------------------------

function formatSrtTimestamp(seconds: number): string {
  const ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const millis = ms % 1000;
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(millis, 3)}`;
}
export function mapSegment(segments: any[]) {
  return segments.map((seg) => ({
    segmentId: seg.id,
    startTime: seg.start,
    endTime: seg.end,
    text: seg.text,
  }));
}

export function buildSrt(translated: TranslatedSegment[]): string {
  return translated
    .map((seg, i) => {
      return [
        String(i + 1),
        `${formatSrtTimestamp(seg.startTime)} --> ${formatSrtTimestamp(seg.endTime)}`,
        seg.translatedText,
        "",
      ].join("\n");
    })
    .join("\n");
}

export async function uploadToGcs(userId: string, fileName: string, targetLang: string, srtContent: string): Promise<string> {


  const parsedFilename = fileName.split(".")[0] ;
  const blobPath = `results/${userId}/translations/${parsedFilename}.${targetLang}.srt`;
  const bucket = storage.bucket(BUCKET_NAME);
  await bucket.file(blobPath).save(srtContent, {
    contentType: "text/plain; charset=utf-8",
  });
 
 const file = bucket.file(blobPath as string);
        
    const [signedUrl] = await file.getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + 60 * 60 * 1000, // 1 hour
        responseDisposition: `attachment;`,
    });

    return signedUrl;


}
export async function translateAll(
  segments: SegmentInput[],
  targetLang: string,
  sourceLang: string | null | undefined,
): Promise<TranslatedSegment[]> {
  const batches = makeBatches(segments);
  const results: TranslatedSegment[] = [];
 
  let done = 0;

  for (const batch of batches) {
    const texts = batch.map((s) => s.text);
    let translatedTexts: string[];

    try {
      translatedTexts = await translateBatch(texts, targetLang, sourceLang);
    } catch (err) {
      console.warn(`Batch of ${batch.length} failed/misaligned, retrying per-segment`, err);
      translatedTexts = await translateOneByOne(batch, targetLang, sourceLang);
    }

    batch.forEach((seg, i) => {
      results.push({
        segmentId: seg.segmentId,
        startTime: seg.startTime,
        endTime: seg.endTime,
        translatedText: translatedTexts[i],
      });
    });

    done += batch.length;
  }

  return results;
}

 