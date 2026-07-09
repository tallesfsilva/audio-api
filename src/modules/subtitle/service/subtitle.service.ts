// subtitle.service.ts

 
import { transcriptionsRepository } from "../../transcription/repository/transcription.repository"
import { formatSubtitle, } from "../../../shared/utils/subtitle.formatters";
import {
  CreateSubtitleDTO,
} from "../../../shared/types/subtitle.types";
import { mapSegment } from "@/shared/utils/translate";

 

class SubtitleService {
  
  async create(dto: CreateSubtitleDTO): Promise<any> {
    // 1. Guard: if a non-failed subtitle already exists for this format, return it
    let transcription;
   
    // 2. Fetch transcription + segments — validates ownership in the same query
     transcription = await transcriptionsRepository.findByJobIdWithSegments(
      dto.jobId,
    )

    if (!transcription) {
      throw new NotFoundError(
        `Job ${dto.jobId} not found for user ${dto.userId}`
      );
    }

    if (!transcription.segments.length) {
      throw new BadRequestError(
        `Job ${dto.jobId} has no segments to generate subtitles from`
      );
    }


    let content;
    try {
      const mappedSegments = mapSegment(transcription.segments)
         content = formatSubtitle(mappedSegments, dto.format, false, dto?.assOption);
        const extension = dto.format.toLowerCase();

        const filename = `${transcription.filename.split(".")[0]}.${transcription.targetLanguage}.${extension}`;

        const mimeType = {
            srt: "application/x-subrip",
            ass: "text/x-ssa",
            vtt: "text/vtt",
             txt: "text/vtt",
        }[extension] ?? "text/plain";

        return {
            content,
            filename,
            mimeType,
        };
        
    } catch (err) {
      
      throw err;
    }
 
 
}
//   }

//   // --------------------------------------------------------------------------
//   // Reads
//   // --------------------------------------------------------------------------

//   async findById(id: string, userId: string): Promise<SubtitleResponse> {
//     const subtitle = await this.repository.findById(id, userId);
//     if (!subtitle) throw new NotFoundError(`Subtitle ${id} not found`);
//     return this.withDownloadUrl(subtitle);
//   }

//   async findAllByUser(userId: string): Promise<SubtitleResponse[]> {
//     const subtitles = await this.repository.findAllByUser(userId);
//     return Promise.all(subtitles.map((s) => this.withDownloadUrl(s)));
//   }

//   async findByTranscription(
//     transcriptionId: string,
//     userId: string
//   ): Promise<SubtitleResponse[]> {
//     const subtitles = await this.repository.findByTranscription(transcriptionId, userId);
//     return Promise.all(subtitles.map((s) => this.withDownloadUrl(s)));
//   }

//   // --------------------------------------------------------------------------
//   // GCS
//   // --------------------------------------------------------------------------

//   private async uploadToGcs(
//     subtitleId: string,
//     transcriptionId: string,
//     format: SubtitleFormat,
//     content: string
//   ): Promise<string> {
//     const ext = extensionForFormat(format);
//     const blobPath = `subtitles/${transcriptionId}/${subtitleId}.${ext}`;

//     await this.storage.bucket(GCS_BUCKET).file(blobPath).save(content, {
//       contentType: mimeTypeForFormat(format),
//     });

//     return `gs://${GCS_BUCKET}/${blobPath}`;
//   }

//   private async generateSignedUrl(gcsUri: string): Promise<string> {
//     // gs://bucket/path -> ["bucket", "path"]
//     const withoutScheme = gcsUri.replace("gs://", "");
//     const slashIndex = withoutScheme.indexOf("/");
//     const bucketName = withoutScheme.slice(0, slashIndex);
//     const filePath = withoutScheme.slice(slashIndex + 1);

//     const [url] = await this.storage
//       .bucket(bucketName)
//       .file(filePath)
//       .getSignedUrl({
//         action: "read",
//         expires: Date.now() + SIGNED_URL_TTL_SECONDS * 1000,
//       });

//     return url;
//   }

//   private async withDownloadUrl(subtitle: SubtitleResponse): Promise<SubtitleResponse> {
//     if (!subtitle.gcsUri) return subtitle;

//     try {
//       const downloadUrl = await this.generateSignedUrl(subtitle.gcsUri);
//       return { ...subtitle, downloadUrl };
//     } catch {
//       // Signed URL generation failing should not break the response
//       return subtitle;
//     }
//   }
}

// --------------------------------------------------------------------------
// Domain errors (match whatever error classes your app already uses)
// --------------------------------------------------------------------------

export class NotFoundError extends Error {
  readonly statusCode = 404;
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class BadRequestError extends Error {
  readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }


}
export const subtitleService = new SubtitleService();