// src/modules/billing/billing.router.ts
import { Router } from 'express';
import { billingController } from './controller/billing.controller';
import { authenticate } from '../../shared/guards/authenticate';

const router = Router();

/** GET /api/v1/billing/plans — public */
router.get('/plans', (req, res) => billingController.getPlans(req, res));

/** GET /api/v1/billing/overview — usage + plan + subscription status */
router.get('/overview', authenticate, (req, res) => billingController.getOverview(req, res));

export default router;
