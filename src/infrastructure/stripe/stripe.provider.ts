// src/infrastructure/stripe/stripe.provider.ts
import Stripe from 'stripe';
import { config } from '../../config';
import { PlanTier } from '../../shared/types/domain';
import { logger } from '../../shared/utils/logger';

// ── Singleton ─────────────────────────────────────────────────────────────────
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!config.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }
    _stripe = new Stripe(config.STRIPE_SECRET_KEY, {
      typescript: true,
      telemetry: false,
    });
    logger.info('Stripe client initialised');
  }
  return _stripe;
}

// ── Price catalogue ───────────────────────────────────────────────────────────
// Map each paid plan tier to its Stripe Price ID.
// FREE has no price (no checkout needed).
// Set these in your .env — they come from your Stripe Dashboard.
export function getPriceId(tier: PlanTier): string {
  const map: Partial<Record<PlanTier, string | undefined>> = {
    STARTER:    config.STRIPE_PRICE_STARTER,
    PRO:        config.STRIPE_PRICE_PRO,
    ENTERPRISE: config.STRIPE_PRICE_ENTERPRISE,
  };
  const priceId = map[tier];
  if (!priceId) throw new Error(`No Stripe price configured for plan: ${tier}`);
  return priceId;
}

// ── Customer helpers ──────────────────────────────────────────────────────────

export async function findOrCreateCustomer(
  userId: string,
  email: string,
  name: string,
  existingCustomerId?: string | null,
): Promise<string> {
  const stripe = getStripe();

  if (existingCustomerId) return existingCustomerId;

  const customer = await stripe.customers.create({
    email,
    name,
    metadata: { userId },
  });

  logger.info('Stripe customer created', { customerId: customer.id, userId });
  return customer.id;
}

// ── Webhook signature verification ───────────────────────────────────────────

export function constructWebhookEvent(
  rawBody: Buffer,
  signature: string,
): Stripe.Event {
  if (!config.STRIPE_WEBHOOK_SECRET) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  }
  return getStripe().webhooks.constructEvent(
    rawBody,
    signature,
    config.STRIPE_WEBHOOK_SECRET,
  );
}
