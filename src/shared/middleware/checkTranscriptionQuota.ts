import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../infrastructure/database/client';
import { logger } from '../utils/logger';


export async function checkTranscriptionQuota(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = req.user?.sub; // adjust based on your auth middleware
  if (!userId) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      subscription: {
        include: {
          payments: {
            where: { status: 'SUCCEEDED' },
            orderBy: { paidAt: 'desc' },
            take: 5, // recent payments are enough to check current period
          },
        },
      },
    },
  });

  if (!user) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  // FREE tier: simple quota check
  if (user.planTier === 'FREE') {
    if (user.usedMinutes >= user.monthlyQuota) {
      res.status(403).json({
        success: false,
        error: 'Monthly quota exceeded. Upgrade your plan to continue.',
      });
      return;
    }
    next();
    return;
  }

  // Paid tier: subscription must exist and be valid
  const subscription = user.subscription;
  if (!subscription) {
    logger.warn('Paid plan tier without subscription record', { userId });
    res.status(403).json({
      success: false,
      error: 'No active subscription found.',
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
    res.status(403).json({
      success: false,
      error: 'Your subscription is not active. Please renew to continue.',
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
    res.status(403).json({
      success: false,
      error: 'No valid payment found for the current billing period.',
    });
    return;
  }

  // Quota check still applies, even on paid tiers
  if (user.usedMinutes >= user.monthlyQuota) {
    res.status(403).json({
      success: false,
      error: 'Monthly quota exceeded.',
    });
    return;
  }

  next();
}