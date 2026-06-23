// src/modules/billing/service/billing.service.ts
import { prisma } from '../../../infrastructure/database/client';
import { PlanTier } from '../../../shared/types/domain';
import { NotFoundError } from '../../../shared/errors';

export interface Plan {
  tier: PlanTier;
  name: string;
  priceMonthly: number;
  monthlyQuotaMinutes: number;
  maxFileSizeMb: number;
  maxConcurrentJobs: number;
  models: string[];
  features: string[];
}

export const PLANS: Record<PlanTier, Plan> = {
  FREE: {
    tier: 'FREE',
    name: 'Free',
    priceMonthly: 0,
    monthlyQuotaMinutes: 60,
    maxFileSizeMb: 50,
    maxConcurrentJobs: 1,
    models: ['tiny', 'base'],
    features: ['60 min/month', 'Up to 50 MB files', 'JSON & TXT output', 'base model'],
  },
  STARTER: {
    tier: 'STARTER',
    name: 'Starter',
    priceMonthly: 999,
    monthlyQuotaMinutes: 600,
    maxFileSizeMb: 200,
    maxConcurrentJobs: 3,
    models: ['tiny', 'base', 'small', 'medium'],
    features: ['600 min/month', 'Up to 200 MB files', 'All output formats', 'medium model'],
  },
  PRO: {
    tier: 'PRO',
    name: 'Pro',
    priceMonthly: 2999,
    monthlyQuotaMinutes: 1200,
    maxFileSizeMb: 500,
    maxConcurrentJobs: 10,
    models: ['tiny', 'base', 'small', 'medium', 'large', 'large-v2', 'large-v3'],
    features: ['1200 min/month', 'All formats', 'large-v3 model', 'Priority queue'],
  },
  ENTERPRISE: {
    tier: 'ENTERPRISE',
    name: 'Enterprise',
    priceMonthly: 0,
    monthlyQuotaMinutes: 999999,
    maxFileSizeMb: 2000,
    maxConcurrentJobs: 100,
    models: ['tiny', 'base', 'small', 'medium', 'large', 'large-v2', 'large-v3'],
    features: ['Unlimited minutes', 'Up to 2 GB files', 'All formats', 'large-v3 model', 'Diarization', 'Dedicated queue', 'SLA', 'SSO'],
  },
};

export interface BillingOverview {
  currentPlan: Plan;
  usedMinutes: number;
  remainingMinutes: number;
  usagePercent: number;
  quotaResetAt: Date;
  subscription: {
    status: string;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
  } | null;
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
        subscription: {
          select: {
            status: true,
            currentPeriodEnd: true,
            cancelAtPeriodEnd: true,
          },
        },
      },
    });
    if (!user) throw new NotFoundError('User');

    const currentPlan = PLANS[user.planTier as PlanTier];
    const remaining = Math.max(0, user.monthlyQuota - user.usedMinutes);
    const usagePercent = user.monthlyQuota > 0
      ? Math.min(100, Math.round((user.usedMinutes / user.monthlyQuota) * 100))
      : 0;

    return {
      currentPlan,
      usedMinutes: user.usedMinutes,
      remainingMinutes: remaining,
      usagePercent,
      quotaResetAt: user.quotaResetAt,
      subscription: user.subscription
        ? {
            status: user.subscription.status,
            currentPeriodEnd: user.subscription.currentPeriodEnd,
            cancelAtPeriodEnd: user.subscription.cancelAtPeriodEnd,
          }
        : null,
    };
  }
}

export const billingService = new BillingService();
