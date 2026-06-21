// src/modules/payments/payments.router.ts
import { Router, Request, Response, NextFunction } from 'express';
import express from 'express';
import { paymentsController } from './controller/payments.controller';
import { authenticate } from '../../shared/guards/authenticate';

const router = Router();

// ── Stripe webhook ────────────────────────────────────────────────────────────
// CRITICAL: Stripe signature verification requires the raw, unparsed request body.
// We apply express.raw() ONLY to this route BEFORE the global express.json() runs.
// Mount this router BEFORE express.json() in app.ts (already handled — see app.ts).
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  (req: Request, res: Response) => paymentsController.webhook(req, res),
);

// ── Authenticated routes ──────────────────────────────────────────────────────

/**
 * POST /api/v1/payments/checkout
 * Body: { tier: 'STARTER' | 'PRO' | 'ENTERPRISE', successUrl?, cancelUrl? }
 * Returns: { url: string }  ← redirect the user here
 */
router.post('/checkout', express.json({ limit: '1mb' }), authenticate, (req: Request, res: Response) =>
  paymentsController.createCheckout(req, res),
);

/**
 * POST /api/v1/payments/portal
 * Body: { returnUrl? }
 * Returns: { url: string }  ← redirect the user here to manage billing
 */
router.post('/portal', express.json({ limit: '1mb' }), authenticate, (req: Request, res: Response) =>
  paymentsController.createPortal(req, res),
);

/**
 * GET /api/v1/payments/subscription
 * Returns the current user's Subscription record or null
 */
router.get('/subscription', express.json({ limit: '1mb' }), authenticate, (req: Request, res: Response) =>
  paymentsController.getSubscription(req, res),
);

export default router;
