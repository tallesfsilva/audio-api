// src/modules/billing/controller/billing.controller.ts
import { Request, Response } from 'express';
import { billingService } from '../service/billing.service';
import { respond } from '../../../shared/utils/apiResponse';
import { UnauthorizedError } from '../../../shared/errors';

class BillingController {
  async getPlans(_req: Request, res: Response): Promise<void> {
    respond(res, billingService.getPlans());
  }

  async getOverview(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    respond(res, await billingService.getOverview(req.user.sub));
  }
}

export const billingController = new BillingController();
