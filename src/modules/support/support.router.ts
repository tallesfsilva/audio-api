// src/modules/upload/upload.router.ts
import { Router } from 'express';
 import { supportController } from './controller/support.controller';
import { authenticate } from '../../shared/guards/authenticate';



const router  = Router();

router.post("/contact",authenticate,  (req, res) => supportController.sendEmail(req, res));
 
export default router;
