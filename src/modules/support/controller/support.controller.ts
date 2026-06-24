// src/modules/upload/controller/upload.controller.ts
import { Request, Response } from 'express';
import { respondCreated } from '../../../shared/utils/apiResponse';
import { ValidationError } from '../../../shared/errors';
import { logger } from '@/shared/utils/logger';
import { SupportContactPayload } from '@/shared/types/domain';
import { uploadService } from '../service/support.service';
 
 
class SupportController {
  async sendEmail(req: Request, res: Response): Promise<void> {
 
  try {
    const payload = req.body as Partial<SupportContactPayload>;
 
    // Adjust to however your auth middleware exposes the current user.
    const userId = (req as any).user?.id as string | undefined;
    const userEmail = (req as any).user?.email as string | undefined;
 
    const result = await uploadService.createSupportTicket(payload as SupportContactPayload, {
      userId,
      userEmail,
    });
 
   respondCreated(res,result);
  } catch (err) {
    logger.error("Error sending email:" , err)
     throw new ValidationError("Errro validating")
  }
}
}
 
export const supportController = new SupportController();
 

