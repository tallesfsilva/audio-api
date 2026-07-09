// subtitle.controller.ts

import { Request, Response, NextFunction } from "express";
import { subtitleService } from "../service/subtitle.service";
import { SubtitleFormat } from "@/shared/types/subtitle.types";
 

class SubtitleController {
 

  // POST /subtitles
async create(req: Request, res: Response, next: NextFunction): Promise<void>{
    try {
      const { id  } = req.params;
      const format = req.query.format as SubtitleFormat
     let assOption;
     if(req?.body && format === "ASS"){
        assOption = req.body
     }
      const translate = req.query.translate==="true" ? true : false;
      const userId = req.user!.sub;

      const result = await subtitleService.create({ userId, jobId: id, format, translate, assOption});

       res.setHeader("Content-Type", result.mimeType);

        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${result.filename}"`
        );

        res.setHeader("Content-Length", Buffer.byteLength(result.content, "utf8"));

        res.send({data: result.content, filename: result.filename});
            } catch (err) {
            next(err);
    }
  };

//   // GET /subtitles
//   findAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
//     try {
//       const userId = req.user!.id;
//       const subtitles = await this.service.findAllByUser(userId);
//       res.json({ data: subtitles });
//     } catch (err) {
//       next(err);
//     }
//   };

//   // GET /subtitles/:id
//   findById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
//     try {
//       const { id } = req.params;
//       const userId = req.user!.id;

//       const subtitle = await this.service.findById(id, userId);
//       res.json({ data: subtitle });
//     } catch (err) {
//       next(err);
//     }
//   };

//   // GET /subtitles/transcription/:transcriptionId
//   findByTranscription = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
//     try {
//       const { transcriptionId } = req.params;
//       const userId = req.user!.id;

//       const subtitles = await this.service.findByTranscription(transcriptionId, userId);
//       res.json({ data: subtitles });
//     } catch (err) {
//       next(err);
//     }
//   };
// }

// // --------------------------------------------------------------------------
// // Global error handler (register AFTER routes in app.ts)
// // --------------------------------------------------------------------------

// export function subtitleErrorHandler(
//   err: Error,
//   _req: Request,
//   res: Response,
//   _next: NextFunction
// ): void {
//   if (err instanceof NotFoundError || err instanceof BadRequestError) {
//     res.status(err.statusCode).json({ error: err.message });
//     return;
//   }

//   console.error("[SubtitleController] Unhandled error:", err);
//   res.status(500).json({ error: "Internal server error" });
}

export const subtitleController = new SubtitleController()