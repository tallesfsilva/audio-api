// src/modules/admin/admin.router.ts
import { Router } from "express";
import { adminController } from "./controller/admin.controller";
import { requireAdmin } from "../admin/middleware/admin.middleware"
import { authenticate } from "@/shared/guards/authenticate";

const router = Router();
router.use(authenticate);
router.use(requireAdmin);

router.get("/users", adminController.getUsers);
router.get("/users/recent", adminController.getRecentUsers);
router.get("/subscriptions", adminController.getSubscriptions);
router.get("/revenue", adminController.getRevenueStats);
router.get("/support/tickets", adminController.listTickets);

export default router;
