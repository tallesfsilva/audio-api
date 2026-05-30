// src/modules/billing/controller/billing.controller.ts
import { Request, Response } from 'express';
import { z } from 'zod';
import { PlanTier } from '@prisma/client';
import { billingService } from '../service/billing.service';
import { respond } from '../../../shared/utils/apiResponse';
import { UnauthorizedError } from '../../../shared/errors';

const SelectPlanSchema = z.object({
  tier: z.nativeEnum(PlanTier),
});

class BillingController {
  async getPlans(_req: Request, res: Response): Promise<void> {
    const plans = billingService.getPlans();
    respond(res, plans);
  }

  async getOverview(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const overview = await billingService.getOverview(req.user.sub);
    respond(res, overview);
  }

  async selectPlan(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const { tier } = SelectPlanSchema.parse(req.body);
    const overview = await billingService.selectPlan(req.user.sub, tier);
    respond(res, overview);
  }
}

export const billingController = new BillingController();
