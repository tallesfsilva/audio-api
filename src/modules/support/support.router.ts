// src/modules/upload/upload.router.ts
import { Router } from 'express';
 import { supportController } from './controller/support.controller';
import { authenticate } from '../../shared/guards/authenticate';



const router  = Router();

router.post("/contact",authenticate,  (req, res) => supportController.sendEmail(req, res));
 
router.get("/tickets", authenticate,(req, res) => supportController.listForUser(req, res));
 
// GET /support/tickets/:id — fetch a single ticket (ownership-checked in service)
router.get("/tickets/:id",authenticate, (req, res) => supportController.getById(req, res));
 
// PATCH /support/tickets/:id/status — update ticket status (admin/staff action)
router.patch("/tickets/:id/status",authenticate, (req, res) => supportController.updateStatus(req, res));

export default router;
