// src/modules/billing/billing.router.ts
import { Router } from 'express';
import { billingController } from './controller/billing.controller';
import { authenticate } from '../../shared/guards/authenticate';

const router = Router();

/** GET /api/v1/billing/plans — public, no auth needed */
router.get('/plans', (req, res) => billingController.getPlans(req, res));

/** GET /api/v1/billing/overview — current user usage & plan */
router.get('/overview', authenticate, (req, res) => billingController.getOverview(req, res));

/** POST /api/v1/billing/select-plan — mock plan selection */
router.post('/select-plan', authenticate, (req, res) => billingController.selectPlan(req, res));

export default router;
