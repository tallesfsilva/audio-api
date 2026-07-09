// src/modules/jobs/jobs.router.ts
import { Router } from 'express';
import { jobsController } from './controller/jobs.controller';
import { authenticate } from '../../shared/guards/authenticate';

const router = Router();

// All job routes require authentication
router.use(authenticate);

/** GET /api/v1/jobs */
router.get('/', (req, res) => jobsController.list(req, res));

/** GET /api/v1/jobs/metrics  — queue health (admin use or dashboards) */
router.get('/metrics', (req, res) => jobsController.queueMetrics(req, res));

/** GET /api/v1/jobs/:id */
router.get('/:id', (req, res) => jobsController.getById(req, res));

/** POST /api/v1/jobs/:id/cancel */
router.post('/:id/cancel', (req, res) => jobsController.cancel(req, res));

/** DELETE /api/v1/jobs/:id */
router.delete('/:id', (req, res) => jobsController.delete(req, res));

export default router;
