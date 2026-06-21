// src/modules/admin/service/admin.service.ts
import { SubscriptionStatus } from "@/shared/types/domain";
import { adminRepository } from "../repository/admin.repository";

type Order = "newest" | "oldest";

class AdminService {
  async getUsers(page: number, limit: number, order: Order) {
    const skip = (page - 1) * limit;
    const { data, total } = await adminRepository.findUsers(skip, limit, order);
    return { data, total, page, limit };
  }

  async getRecentUsers(limit: number) {
    const data = await adminRepository.findRecentUsers(limit);
    return { data };
  }

  async getSubscriptions(page: number, limit: number, status?: SubscriptionStatus) {
    const skip = (page - 1) * limit;
    const { data, total } = await adminRepository.findSubscriptions(skip, limit, status);
    return { data, total, page, limit };
  }

  async getRevenueStats() {
    const {
      activeSubscriptions,
      allActiveAmounts,
      avgAmountCents,
      newThisMonth,
      canceledThisMonth,
    } = await adminRepository.getRevenueStats();

    const mrr = allActiveAmounts.reduce(
      (sum: number, s: { amountCents: number }) => sum + s.amountCents,
      0,
    );

    return {
      mrr,
      totalRevenueCents: mrr,
      averageRevenueCents: Math.round(avgAmountCents),
      activeSubscriptions,
      newSubscriptionsThisMonth: newThisMonth,
      canceledThisMonth,
    };
  }
}

export const adminService = new AdminService();
