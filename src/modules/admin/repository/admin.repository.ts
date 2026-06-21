// src/modules/admin/repository/admin.repository.ts
import { SubscriptionStatus } from '@/shared/types/domain';
import { prisma } from '../../../infrastructure/database/client';
import { startOfMonth, endOfMonth } from "date-fns";

type Order = "newest" | "oldest";

class AdminRepository {
  async findUsers(skip: number, limit: number, order: Order) {
    const direction = order === "newest" ? "desc" : "asc";

    const [data, total] = await prisma.$transaction([
      prisma.user.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: direction },
        select: {
          id: true,
          email: true,
          createdAt: true,
          planTier: true,
          role: true,
          monthlyQuota: true,
          subscription: {
            select: { status: true, planTier: true },
          },
          usedMinutes: true
        },
      }),
      prisma.user.count(),
    ]);

    return { data, total };
  }

  async findRecentUsers(limit: number) {
    return prisma.user.findMany({
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        createdAt: true,
        subscription: {
          select: { status: true, planTier: true },
        },
      },
    });
  }

  async findSubscriptions(skip: number, limit: number, status?: SubscriptionStatus) {
    const where = status ? { status } : {};

    const [data, total] = await prisma.$transaction([
      prisma.subscription.findMany({
        skip,
        take: limit,
        where,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          planTier: true,
          amountCents: true,
          createdAt: true,
          currentPeriodEnd: true,
          user: {
            select: { id: true, email: true },
          },
        },
      }),
      prisma.subscription.count({ where }),
    ]);

    return { data, total };
  }

  async getRevenueStats() {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    const [
      activeSubscriptions,
      allActiveAmounts,
      avgResult,
      newThisMonth,
      canceledThisMonth,
    ] = await prisma.$transaction([
      // active sub count
      prisma.subscription.count({
        where: { status: SubscriptionStatus.ACTIVE },
      }),

      // all active amounts for MRR
      prisma.subscription.findMany({
        where: { status: SubscriptionStatus.ACTIVE  },
        select: { amountCents: true },
      }),

      // average revenue per active subscription
      prisma.subscription.aggregate({
        where: { status: SubscriptionStatus.ACTIVE  },
        _avg: { amountCents: true },
      }),

      // new subs this month
      prisma.subscription.count({
        where: {
          createdAt: { gte: monthStart, lte: monthEnd },
        },
      }),

      // canceled this month
      prisma.subscription.count({
        where: {
          status: SubscriptionStatus.CANCELED, 
          updatedAt: { gte: monthStart, lte: monthEnd },
        },
      }),
    ]);

    return {
      activeSubscriptions,
      allActiveAmounts,
      avgAmountCents: avgResult._avg.amountCents ?? 0,
      newThisMonth,
      canceledThisMonth,
    };
  }
}

export const adminRepository = new AdminRepository();
