// src/modules/auth/auth.router.ts
import { Router } from 'express';
import { authController } from './controller/auth.controller';
import { authenticate } from '../../shared/guards/authenticate';

const router = Router();

/** POST /api/v1/auth/signup */
router.post('/signup', (req, res) => authController.signUp(req, res));

/** POST /api/v1/auth/login */
router.post('/login', (req, res) => authController.login(req, res));

/** POST /api/v1/auth/refresh */
router.post('/refresh', (req, res) => authController.refresh(req, res));

/** POST /api/v1/auth/logout */
router.post('/logout', (req, res) => authController.logout(req, res));

/** POST /api/v1/auth/logout-all  (requires auth) */
router.post('/logout-all', authenticate, (req, res) => authController.logoutAll(req, res));

/** GET /api/v1/auth/me  (requires auth) */
router.get('/me', authenticate, (req, res) => authController.me(req, res));

export default router;
