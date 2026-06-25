// src/modules/upload/controller/upload.controller.ts
import { Request, Response } from 'express';
import { respondCreated } from '../../../shared/utils/apiResponse';
import { ValidationError } from '../../../shared/errors';
import { logger } from '@/shared/utils/logger';
import { SupportContactPayload } from '@/shared/types/domain';
import { supportService } from '../service/support.service';
 
 
class SupportController {
  async sendEmail(req: Request, res: Response): Promise<void> {
 
  try {
    const payload = req.body as Partial<SupportContactPayload>;
 
    // Adjust to however your auth middleware exposes the current user.
    const userId = (req as any).user?.sub as string | undefined;
    const userEmail = (req as any).user?.email as string | undefined;
 
    const result = await supportService.createSupportTicket(payload as SupportContactPayload, {
      userId,
      userEmail,
    });
 
   respondCreated(res,result);
  } catch (err) {
    logger.error("Error sending email:" , err)
     throw new ValidationError("Errro validating")
  }
}


async getById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = (req as any).user?.sub as string | undefined;
 
      const ticket = await supportService.getTicketById(id, { userId });
      respondCreated(res, ticket);
    } catch (err) {
      logger.error("Error fetching support ticket:", err);

    }
  }
 
  async listForUser(req: Request, res: Response): Promise<void> {
    try {
      // Always scoped to the authenticated user — not a route param — so a
      // user can't pass someone else's userId and read their tickets.
      const userId = (req as any).user?.sub as string | undefined;
 
      const tickets = await supportService.listUserTickets(userId as string);
      respondCreated(res, tickets);
    } catch (err) {
      logger.error("Error listing support tickets:", err);

    }
  }
 
  async updateStatus(req: Request, res: Response): Promise<void> {
   
    try {
      const { id } = req.params;
      const { status } = req.body as { status: string };
 
      const ticket = await supportService.updateTicketStatus(id, status);
      respondCreated(res, ticket);
    } catch (err) {
      logger.error("Error updating support ticket status:", err);

    }
  }

}
 
export const supportController = new SupportController();
 

