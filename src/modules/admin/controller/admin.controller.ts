// src/modules/admin/controller/admin.controller.ts
import { Request, Response } from "express";
import { adminService } from "../service/admin.service"
import { SubscriptionStatus } from "@/shared/types/domain";

class AdminController {
  async getUsers(req: Request, res: Response) {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const order = (req.query.order as "newest" | "oldest") || "newest";

    const result = await adminService.getUsers(page, limit, order);
    res.json(result);
  }

  async getRecentUsers(req: Request, res: Response) {
    const limit = Number(req.query.limit) || 10;

    const result = await adminService.getRecentUsers(limit);
    res.json(result);
  }

  async getSubscriptions(req: Request, res: Response) {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const status = req.query.status as SubscriptionStatus | undefined;

    const result = await adminService.getSubscriptions(page, limit, status);
    res.json(result);
  }
 
  async listTickets(res: Response): Promise<void> {
    try {
 
    // const page = Number(req.query.page) || 1;
    // const limit = Number(req.query.limit) || 20;
 
      const tickets = await adminService.listTickets();
         res.json(tickets);
    } catch (err) {
     

    }
  }
  async getRevenueStats(res: Response) {
    const result = await adminService.getRevenueStats();
    res.json(result);
  }
}

export const adminController = new AdminController();
