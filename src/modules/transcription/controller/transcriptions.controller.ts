// src/modules/transcriptions/controller/transcriptions.controller.ts
import { Request, Response } from 'express';
import { transcriptionsService } from '../service/transcriptions.service';
import {
  CreateTranscriptionSchema,
  UpdateTranscriptionSchema,
  CreateQuotesSchema,
  SearchDialogueSchema,
  PaginationSchema,
} from '../dto/transcription.dto'
import { respond, respondCreated, respondNoContent } from '../../../shared/utils/apiResponse';
import { UnauthorizedError } from '../../../shared/errors';

class TranscriptionsController {
  async create(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const dto = CreateTranscriptionSchema.parse(req.body);
    const result = await transcriptionsService.create({
      ...dto,
      userId: req.user.sub,
    });
    respondCreated(res, result);
  }

  async list(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const { page, pageSize } = PaginationSchema.parse(req.query);
    const result = await transcriptionsService.listForUser(req.user.sub, page, pageSize);
    respond(res, result);
  }

  async getById(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const result = await transcriptionsService.getById(req.params.id, req.user.sub);
    respond(res, result);
  }

  async getByJobId(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const result = await transcriptionsService.getByJobId(req.params.jobId, req.user.sub);
    respond(res, result);
  }

  async getWithSegments(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const result = await transcriptionsService.getWithSegments(req.params.id, req.user.sub);
    respond(res, result);
  }


    async translate(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const {id:transcriptionId} = req.params
    const {targetLanguage} = req.body


    const result = await transcriptionsService.translateTranscrption(transcriptionId, targetLanguage);
    respond(res, result);
  }


  async getQuotes(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const result = await transcriptionsService.getQuotes(req.params.id, req.user.sub);
    respond(res, result);
  }

  async addQuotes(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const dto = CreateQuotesSchema.parse(req.body);
    const result = await transcriptionsService.addQuotes(
      req.params.id,
      req.user.sub,
      dto.quotes,
    );
    respondCreated(res, result);
  }

  async searchDialogue(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const { q } = SearchDialogueSchema.parse(req.query);
    const result = await transcriptionsService.searchDialogue(req.params.id, req.user.sub, q);
    respond(res, result);
  }

  async searchLibrary(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const { q } = SearchDialogueSchema.parse(req.query);
    const result = await transcriptionsService.searchDialogueAcrossLibrary(req.user.sub, q);
    respond(res, result);
  }

  async update(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const dto = UpdateTranscriptionSchema.parse(req.body);
    const result = await transcriptionsService.update(req.params.id, req.user.sub, dto);
    respond(res, result);
  }

  async delete(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    await transcriptionsService.delete(req.params.id, req.user.sub);
    respondNoContent(res);
  }
}

export const transcriptionsController = new TranscriptionsController();