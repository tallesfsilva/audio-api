import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../infrastructure/database/client';
import { logger } from '../utils/logger';

 import { Storage } from '@google-cloud/storage';
import { config } from '@/config';
  
 const storage = new Storage({
   keyFilename: "/SECRET/SERVICE_ACCOUNT",
 });
//  const storage = new Storage();


 async function rejectAndCleanup(
  res: Response,
  objectName: string | undefined,
  userId: string,
  statusCode: number,
  errorPayload: Record<string, unknown>,
): Promise<void> {
  if (objectName) {
    try {
      await storage.bucket(config.GCS_BUCKET).file(objectName).delete();
    } catch (delErr) {
      logger.error("Failed to delete file after quota rejection", {
        userId,
        fileName: objectName,
        error: delErr,
      });
    }
  }
  res.status(statusCode).json(errorPayload);
}

export async function checkTranscriptionQuota(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
    try {
  const userId = req.user?.sub; 

      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }


      const user = await prisma.user.findUnique({
          where: { id: userId }
      });

    if (!user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

   
    const newJobMinutes = Number(req.body.durationSeconds) / 60; 
      const activeReservation = await prisma.job.aggregate({
      where: {
        userId: user.id,
        status: { in: ["QUEUED", "PROCESSING"] },
      },
      _sum: { durationSeconds: true },
    });

    const reservedMinutes = (activeReservation._sum.durationSeconds ?? 0) / 60;
    const committed = user.usedMinutes + reservedMinutes;

    if (committed + newJobMinutes >= user.monthlyQuota) {
       await rejectAndCleanup(res, req.body.objectName, user.id, 403, {
        error: "Monthly quota exceeded!! Please upgrade your plan!",
      });
          return;
    }

    if (user.planTier !== "PRO") {
      if (user.usedMinutes >= user.monthlyQuota) {
        
         await rejectAndCleanup(res, req.body.objectName, user.id, 403, {
        error: "Monthly quota exceeded!! Please upgrade your plan!",
      });
          return;
        return;
      }

      return next();
    }   
    const subscription = await prisma.subscription.findUnique({
          where: { userId: user.id },
             include: {
                payments: {
                  where: { status: "SUCCEEDED" },
                  orderBy: { paidAt: "desc" },
                  take: 5,
                },
              },
      });
  
     
     if (!subscription) {
          logger.warn('Paid plan tier without subscription record', { userId });
           await rejectAndCleanup(res, req.body.objectName, user.id, 403, {
        error: "No active subscription found!",
      });
         
        return;
  }

 
  const now = new Date();
  const periodStillValid = subscription.currentPeriodEnd > now;

  const isActive = subscription.status === 'ACTIVE' && periodStillValid;
  const isCanceledButGraced =
    subscription.status === 'CANCELED' &&
    subscription.cancelAtPeriodEnd &&
    periodStillValid;

  if (!isActive && !isCanceledButGraced) {
      await rejectAndCleanup(res, req.body.objectName, user.id, 403, {
        error: "Your subscription is not active. Please renew to continue.",
      });
    
    return;
  }

  // Require a successful payment covering the current period
  const hasPaymentForCurrentPeriod = subscription.payments.some(
    (payment) =>
      payment.status === 'SUCCEEDED' &&
      payment.paidAt &&
      payment.paidAt >= subscription.currentPeriodStart &&
      payment.paidAt <= subscription.currentPeriodEnd,
  );

  if (!hasPaymentForCurrentPeriod) {
    logger.warn('Active subscription without payment for current period', {
      userId,
      subscriptionId: subscription.id,
    });
     await rejectAndCleanup(res, req.body.objectName, user.id, 403, {
        error: "No valid payment found for the current billing period.",
      });
  
    return;
  }

  // Quota check still applies, even on paid tiers
  if (user.usedMinutes >= user.monthlyQuota) {
    
     await rejectAndCleanup(res, req.body.objectName, user.id, 403, {
        error: "Monthly quota exceeded!! Please upgrade your plan!",
      });
    return;
  }


    return next();


    } catch (err) {
    console.error("❌ checkTranscriptionQuota failed:", err);
    res.status(500).json({
      error: "Internal middleware error"
    });
  }
}