// src/modules/billing/service/billing.service.ts
import { PlanTier } from '@prisma/client';
import { prisma } from '../../../infrastructure/database/client';
import { NotFoundError } from '../../../shared/errors';
import { logger } from '../../../shared/utils/logger';

export interface Plan {
  tier: PlanTier;
  name: string;
  priceMonthly: number;   // USD cents
  monthlyQuotaMinutes: number;
  maxFileSizeMb: number;
  maxConcurrentJobs: number;
  models: string[];
  features: string[];
}

export const PLANS: Record<PlanTier, Plan> = {
  FREE: {
    tier: PlanTier.FREE,
    name: 'Free',
    priceMonthly: 0,
    monthlyQuotaMinutes: 60,
    maxFileSizeMb: 50,
    maxConcurrentJobs: 1,
    models: ['tiny', 'base'],
    features: ['60 min/month', 'Up to 50 MB files', 'JSON & TXT output', 'base model'],
  },
  STARTER: {
    tier: PlanTier.STARTER,
    name: 'Starter',
    priceMonthly: 999,
    monthlyQuotaMinutes: 600,
    maxFileSizeMb: 200,
    maxConcurrentJobs: 3,
    models: ['tiny', 'base', 'small', 'medium'],
    features: ['600 min/month', 'Up to 200 MB files', 'All output formats', 'medium model'],
  },
  PRO: {
    tier: PlanTier.PRO,
    name: 'Pro',
    priceMonthly: 2999,
    monthlyQuotaMinutes: 3000,
    maxFileSizeMb: 500,
    maxConcurrentJobs: 10,
    models: ['tiny', 'base', 'small', 'medium', 'large', 'large-v2', 'large-v3'],
    features: [
      '3000 min/month',
      'Up to 500 MB files',
      'All output formats',
      'large-v3 model',
      'Speaker diarization',
      'Priority queue',
    ],
  },
  ENTERPRISE: {
    tier: PlanTier.ENTERPRISE,
    name: 'Enterprise',
    priceMonthly: 0, // custom pricing
    monthlyQuotaMinutes: 999999,
    maxFileSizeMb: 2000,
    maxConcurrentJobs: 100,
    models: ['tiny', 'base', 'small', 'medium', 'large', 'large-v2', 'large-v3'],
    features: [
      'Unlimited minutes',
      'Up to 2 GB files',
      'All output formats',
      'large-v3 model',
      'Speaker diarization',
      'Dedicated queue',
      'SLA',
      'SSO',
    ],
  },
};

export interface BillingOverview {
  currentPlan: Plan;
  usedMinutes: number;
  remainingMinutes: number;
  usagePercent: number;
  quotaResetAt: Date;
}

class BillingService {
  getPlans(): Plan[] {
    return Object.values(PLANS);
  }

  getPlan(tier: PlanTier): Plan {
    return PLANS[tier];
  }

  async getOverview(userId: string): Promise<BillingOverview> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        planTier: true,
        usedMinutes: true,
        monthlyQuota: true,
        quotaResetAt: true,
      },
    });
    if (!user) throw new NotFoundError('User');

    const currentPlan = PLANS[user.planTier];
    const remaining = Math.max(0, user.monthlyQuota - user.usedMinutes);
    const usagePercent =
      user.monthlyQuota > 0
        ? Math.min(100, Math.round((user.usedMinutes / user.monthlyQuota) * 100))
        : 0;

    return {
      currentPlan,
      usedMinutes: user.usedMinutes,
      remainingMinutes: remaining,
      usagePercent,
      quotaResetAt: user.quotaResetAt,
    };
  }

  /**
   * Mock plan selection — in production replace with Stripe Checkout / Billing Portal.
   * This immediately updates the user's plan and quota for demo purposes.
   */
  async selectPlan(userId: string, tier: PlanTier): Promise<BillingOverview> {
    const plan = PLANS[tier];

    await prisma.user.update({
      where: { id: userId },
      data: {
        planTier: tier,
        monthlyQuota: plan.monthlyQuotaMinutes,
      },
    });

    logger.info('Plan updated (mocked)', { userId, tier });

    return this.getOverview(userId);
  }
}

export const billingService = new BillingService();
