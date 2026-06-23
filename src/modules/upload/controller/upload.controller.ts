// src/modules/upload/controller/upload.controller.ts
import { Request, Response } from 'express';
import { uploadService } from '../service/upload.service';
import { UploadBodySchema } from '../dto/upload.dto';
import { respondCreated } from '../../../shared/utils/apiResponse';
import { UnauthorizedError, ValidationError } from '../../../shared/errors';
 
 
class UploadController {
  async upload(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();

    const params = UploadBodySchema.parse(req.body);
    const job = await uploadService.ingest(req.user.sub,params);

    respondCreated(res, {
      jobId: job.id,
      status: job.status,
      originalFileName: job.originalFileName,
      fileSizeBytes: job.fileSizeBytes,
      language: job.language,
      modelSize: job.modelSize,
      outputFormat: job.outputFormat,
      queuedAt: job.queuedAt,
    });
  }



async signUrl(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();

      const { filename, contentType } = req.body;

      if (!req.body) {
        throw new ValidationError('No file provided. Send a multipart/form-data request with field "file".');
      }
        if (!filename || !contentType) {
          throw new ValidationError("filename and contentType are required");
    }
    const result = await uploadService.signUrl(req.user.sub, { filename, contentType });

    respondCreated(res, result);
  
  }
}

export const uploadController = new UploadController();
 

