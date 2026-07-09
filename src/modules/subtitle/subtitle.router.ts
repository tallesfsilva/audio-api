// src/modules/jobs/jobs.router.ts
import { Router } from 'express';
import { subtitleController } from './controller/subtitle.controller';
import { authenticate } from '../../shared/guards/authenticate';
import { NextFunction, Request, Response } from 'express';
const router = Router();

// All job routes require authentication
router.use(authenticate);

/** GET /api/v1/jobs */
router.post('/:id', (req:Request, res:Response, next:NextFunction) => subtitleController.create(req, res, next));
 

export default router;
