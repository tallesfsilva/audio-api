// src/modules/payments/repository/payments.repository.ts
import { prisma } from '../../../infrastructure/database/client';
import { PlanTier, SubscriptionStatus, Subscription } from '../../../shared/types/domain';

export type { SubscriptionStatus, Subscription } from '../../../shared/types/domain';

class PaymentsRepository {
  // ── User ────────────────────────────────────────────────────────────────────

  async findUserById(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, stripeCustomerId: true, planTier: true },
    });
  }

  async saveStripeCustomerId(userId: string, stripeCustomerId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { stripeCustomerId },
    });
  }

  async findUserByStripeCustomerId(stripeCustomerId: string) {
    return prisma.user.findUnique({
      where: { stripeCustomerId },
      select: { id: true, email: true, planTier: true },
    });
  }

  async updateUserPlan(userId: string, tier: PlanTier, quotaMinutes: number): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        planTier:     tier,
        monthlyQuota: quotaMinutes,
        usedMinutes:  0,
        quotaResetAt: new Date(),
      },
    });
  }

  // ── Subscription ────────────────────────────────────────────────────────────

  async upsertSubscription(data: {
    userId: string;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    stripePriceId: string;
    stripeProductId: string;
    planTier: PlanTier;
    status: SubscriptionStatus;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
    canceledAt: Date | null;
    trialEnd: Date | null;
  }): Promise<Subscription> {
    return prisma.subscription.upsert({
      where: { userId: data.userId }, 
      create: {...data},
      update: {
        stripeCustomerId: data.stripeCustomerId,
        stripeSubscriptionId: data.stripeSubscriptionId,
        stripePriceId: data.stripePriceId,
        stripeProductId: data.stripeProductId,
        planTier: data.planTier,
        status: data.status,
        currentPeriodStart: data.currentPeriodStart,
        currentPeriodEnd: data.currentPeriodEnd,
        cancelAtPeriodEnd: data.cancelAtPeriodEnd,
        canceledAt: data.canceledAt,
        trialEnd: data.trialEnd,
      },
    }) as Promise<Subscription>;
  }

async findSubscriptionByUserId(userId: string): Promise<Subscription | null> {
  return prisma.subscription.findUnique({
    where: { userId },
    include: {
      payments: true,
    },
  }) as Promise<Subscription | null>;
}

  async findSubscriptionByStripeId(stripeSubscriptionId: string): Promise<Subscription | null> {
    return prisma.subscription.findUnique({
      where: { stripeSubscriptionId },
    }) as Promise<Subscription | null>;
  }

  async updateSubscriptionStatus(
    stripeSubscriptionId: string,
    status: SubscriptionStatus,
    extra?: Partial<Pick<Subscription, 'cancelAtPeriodEnd' | 'canceledAt' | 'currentPeriodEnd'>>,
  ): Promise<void> {
    await prisma.subscription.update({
      where: { stripeSubscriptionId },
      data: { status, ...extra },
    });
  }

  async deleteSubscription(stripeSubscriptionId: string): Promise<void> {
    await prisma.subscription.delete({ where: { stripeSubscriptionId } });
  }
}

export const paymentsRepository = new PaymentsRepository();
