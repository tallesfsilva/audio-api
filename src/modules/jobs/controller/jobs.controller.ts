// src/modules/jobs/controller/jobs.controller.ts
import { Request, Response } from 'express';
import { jobsService } from '../service/jobs.service';
import { ListJobsQuerySchema, JobIdParamSchema } from '../dto/jobs.dto';
import { respond, respondNoContent } from '../../../shared/utils/apiResponse';
import { UnauthorizedError } from '../../../shared/errors';

class JobsController {
  async list(req: Request, res: Response): Promise<void> {
   try{
    if (!req.user) throw new UnauthorizedError();
    const query = ListJobsQuerySchema.parse(req.query);
    let userID = ""
    if (req.user.role !== "ADMIN"){
         userID = req.user.sub
    }
    const page = await jobsService.list(userID, query);
    respond(res, page.items, 200, {
      total: page.total,
      page: page.page,
      pageSize: page.pageSize,
      totalPages: page.totalPages,
    });
   }catch(e){
    console.error(e)
   }

  }

  async getById(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const { id } = JobIdParamSchema.parse(req.params);
    const job = await jobsService.getById(id, req.user.sub);
    respond(res, job);
  }

   async download(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const {type} = req.query
    const { id } = JobIdParamSchema.parse(req.params);
    const url = await jobsService.download(id, type as string);
    respond(res, url);
  }

  async cancel(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const { id } = JobIdParamSchema.parse(req.params);
    const job = await jobsService.cancel(id, req.user.sub);
    respond(res, job);
  }

  async delete(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const { id } = JobIdParamSchema.parse(req.params);
    await jobsService.delete(id, req.user.sub);
    respondNoContent(res);
  }

  async queueMetrics(_req: Request, res: Response): Promise<void> {
    const metrics = await jobsService.getQueueMetrics();
    respond(res, metrics);
  }
}

export const jobsController = new JobsController();
