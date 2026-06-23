// src/modules/payments/service/payments.service.ts
import Stripe from 'stripe';
import { config } from '../../../config';
import { PlanTier } from '../../../shared/types/domain';
import { PLANS } from '../../billing/service/billing.service';
import {
  paymentsRepository,
 
} from '../repository/payments.repository';
import { SubscriptionStatus } from '@prisma/client';
import {
  getStripe,
  getPriceId,
  findOrCreateCustomer,
} from '../../../infrastructure/stripe/stripe.provider';
import { AppError, NotFoundError } from '../../../shared/errors';
import { logger } from '../../../shared/utils/logger';
import { CreateCheckoutDto, CreatePortalDto } from '../dto/payments.dto';

import { prisma } from '@/infrastructure/database/client';

// Maps Stripe subscription status strings → our SubscriptionStatus type
function toSubscriptionStatus(
  stripeStatus: Stripe.Subscription['status']
): SubscriptionStatus {
  const map: Record<
    Stripe.Subscription['status'],
    SubscriptionStatus
  > = {
    incomplete: 'INCOMPLETE',
    incomplete_expired: 'INCOMPLETE_EXPIRED',
    trialing: 'TRIALING',
    active: 'ACTIVE',
    past_due: 'PAST_DUE',
    canceled: 'CANCELED',
    unpaid: 'UNPAID',
    paused: 'PAUSED',
  };

  return map[stripeStatus] ?? 'INCOMPLETE';
}
// Reads the planTier stored in the Stripe Price metadata.
// In your Stripe dashboard set metadata.planTier = STARTER / PRO / ENTERPRISE
// on each Price object. Falls back to matching by price ID.
function planTierFromPrice(price: Stripe.Price): PlanTier {
  const meta = (price.metadata?.planTier ?? '') as string;
  if (['STARTER', 'PRO', 'ENTERPRISE'].includes(meta)) return meta as PlanTier;

  // Fallback: match by configured price IDs
  if (price.id === config.STRIPE_PRICE_STARTER)   return 'STARTER';
  if (price.id === config.STRIPE_PRICE_PRO)        return 'PRO';
  if (price.id === config.STRIPE_PRICE_ENTERPRISE) return 'ENTERPRISE';

  logger.warn('Could not determine planTier from price', { priceId: price.id });
  return 'STARTER';
}

class PaymentsService {
  // ── Checkout ───────────────────────────────────────────────────────────────

  async createCheckoutSession(
    userId: string,
    dto: CreateCheckoutDto,
  ): Promise<{ url: string }> {
    const stripe = getStripe();

    const user = await paymentsRepository.findUserById(userId);
    if (!user) throw new NotFoundError('User');

    // Prevent downgrade via checkout — user must cancel first
    const existing = await paymentsRepository.findSubscriptionByUserId(userId);
    if (existing && existing.status === 'ACTIVE') {
      throw new AppError(
        'You already have an active subscription. Use the billing portal to change plans.',
        409,
        'SUBSCRIPTION_EXISTS',
      );
    }

    const customerId = await findOrCreateCustomer(
      userId,
      user.email,
      user.name,
      user.stripeCustomerId,
    );

    // Persist customer ID if newly created
    if (!user.stripeCustomerId) {
      await paymentsRepository.saveStripeCustomerId(userId, customerId);
    }

    const priceId = getPriceId(dto.tier as PlanTier);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: dto.successUrl ?? config.STRIPE_SUCCESS_URL,
      cancel_url:  dto.cancelUrl  ?? config.STRIPE_CANCEL_URL,
      subscription_data: {
        metadata: { userId, planTier: dto.tier },
      },
      metadata: { userId, planTier: dto.tier },
      allow_promotion_codes: true,
    });

    if (!session.url) {
      throw new AppError('Failed to create Stripe checkout session', 500, 'STRIPE_ERROR');
    }

    logger.info('Checkout session created', { userId, tier: dto.tier, sessionId: session.id });
    return { url: session.url };
  }

  // ── Billing Portal ─────────────────────────────────────────────────────────

  async createPortalSession(
    userId: string,
    dto: CreatePortalDto,
  ): Promise<{ url: string }> {
    const stripe = getStripe();

    const user = await paymentsRepository.findUserById(userId);
    if (!user) throw new NotFoundError('User');

    if (!user.stripeCustomerId) {
      throw new AppError(
        'No billing account found. Please subscribe to a plan first.',
        404,
        'NO_STRIPE_CUSTOMER',
      );
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: dto.returnUrl ?? config.STRIPE_CANCEL_URL,
    });

    logger.info('Portal session created', { userId });
    return { url: session.url };
  }

  // ── Current subscription ───────────────────────────────────────────────────

  async getSubscription(userId: string) {
    return paymentsRepository.findSubscriptionByUserId(userId);
  }

  // ── Webhook event handlers ─────────────────────────────────────────────────

  async handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const stripe = getStripe();
    const subscriptionId = session.subscription as string;
    if (!subscriptionId) return;

    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price.product'],
    });

    await this._syncSubscription(subscription);
    logger.info('checkout.session.completed handled', { subscriptionId });
  }

  async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    await this._syncSubscription(subscription);
    logger.info('customer.subscription.updated handled', { subscriptionId: subscription.id });
  }

  async handleInvoicePaymentSucceeded(
  invoice: Stripe.Invoice,
): Promise<void> {
  const subscriptionId =
    typeof invoice.parent?.subscription_details?.subscription === 'string'
      ? invoice.parent?.subscription_details?.subscription 
      : invoice.parent?.subscription_details?.subscription.id 
  if (!subscriptionId) return;
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await this._syncSubscription(subscription);
  const dbSubscription = await prisma.subscription.findUnique({
    where: {
      stripeSubscriptionId: subscriptionId,
    },
  });
  if (!dbSubscription) {
    logger.warn('Subscription not found', { subscriptionId });
    return;
  }
  // Prevent duplicate processing
  const existingPayment = await prisma.payment.findUnique({
    where: {
      stripeInvoiceId: invoice.id,
    },
  });
  if (!existingPayment) {
    await prisma.payment.create({
      data: {
        subscriptionId: dbSubscription.id,
        stripeInvoiceId: invoice.id,
        stripePaymentIntentId:
          typeof invoice.payments?.data[0].payment.payment_intent === 'string'
            ? invoice.payments?.data[0].payment.payment_intent
            : invoice.payments?.data[0].id,
        amountCents: invoice.amount_paid,
        currency: invoice.currency,
        status: 'SUCCEEDED',
        paidAt: invoice.status_transitions?.paid_at
          ? new Date(invoice.status_transitions.paid_at * 1000)
          : new Date(),
        stripeData: invoice as {}
      },
    });
  }
  logger.info('invoice.payment_succeeded handled', {
    subscriptionId,
    invoiceId: invoice.id,
  });
}

  async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    const userId = subscription.metadata?.userId;
    if (!userId) {
      logger.warn('subscription.deleted: no userId in metadata', { id: subscription.id });
      return;
    }

    await paymentsRepository.updateSubscriptionStatus(subscription.id, 'CANCELED', {
      canceledAt: new Date(),
    });

    // Downgrade user to FREE
    await paymentsRepository.updateUserPlan(userId, 'FREE', PLANS['FREE'].monthlyQuotaMinutes);

    logger.info('Subscription deleted — user downgraded to FREE', { userId });
  }
async handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  // Only handle subscription checkouts that completed successfully
  if (session.mode !== 'subscription' || session.payment_status !== 'paid') {
    return;
  }

  const subscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id;

  if (!subscriptionId) {
    logger.warn('No subscriptionId in checkout.session.completed', {
      sessionId: session.id,
    });
    return;
  }

  const invoiceId =
    typeof session.invoice === 'string'
      ? session.invoice
      : session.invoice?.id;

  if (!invoiceId) {
    logger.warn('No invoiceId in checkout.session.completed', {
      sessionId: session.id,
    });
    return;
  }

  const stripe = getStripe();

  // Sync subscription state
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await this._syncSubscription(subscription);

  const dbSubscription = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: subscriptionId },
  });

  if (!dbSubscription) {
    logger.warn('Subscription not found after sync', { subscriptionId });
    return;
  }

  // Prevent duplicate processing
  const existingPayment = await prisma.payment.findUnique({
    where: { stripeInvoiceId: invoiceId },
  });

  if (existingPayment) {
    logger.info('Payment already recorded, skipping', { invoiceId });
    return;
  }

  // Fetch the full invoice — session payload doesn't include
  // amount_paid, payment_intent, or status_transitions
  const invoice = await stripe.invoices.retrieve(invoiceId);

  const paymentIntentId =
     typeof invoice.payments?.data[0].payment.payment_intent === 'string'
            ? invoice.payments?.data[0].payment.payment_intent
            : invoice.payments?.data[0].id;

  await prisma.payment.create({
    data: {
      subscriptionId: dbSubscription.id,
      stripeInvoiceId: invoice.id,
      stripePaymentIntentId: paymentIntentId ?? null,
      amountCents: invoice.amount_paid,
      currency: invoice.currency,
      status: 'SUCCEEDED',
      paidAt: invoice.status_transitions?.paid_at
        ? new Date(invoice.status_transitions.paid_at * 1000)
        : new Date(),
      stripeData: invoice as {},
    },
  });

  logger.info('checkout.session.completed handled', {
    subscriptionId,
    invoiceId,
    sessionId: session.id,
    userId: session.metadata?.userId,
    planTier: session.metadata?.planTier,
  });
}
  async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const subscriptionId =
      typeof invoice.parent?.subscription_details?.subscription === 'string'
      ? invoice.parent?.subscription_details?.subscription 
      : invoice.parent?.subscription_details?.subscription.id 

    if (!subscriptionId) return;

    await paymentsRepository.updateSubscriptionStatus(subscriptionId, 'PAST_DUE');
    logger.warn('invoice.payment_failed — subscription marked PAST_DUE', { subscriptionId });
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async _syncSubscription(subscription: Stripe.Subscription): Promise<void> {
    try{
  
    const userId = subscription.metadata?.userId;
    if (!userId) {
      logger.warn('_syncSubscription: no userId in metadata', { id: subscription.id });
      return;
    }

    const item       = subscription.items.data[0];
    const price      = item.price as Stripe.Price;
    const product    = price.product as Stripe.Product | string;
    const productId  = typeof product === 'string' ? product : product.id;
    const planTier   = planTierFromPrice(price);
    const status     = toSubscriptionStatus(subscription.status);

    // Upsert subscription record
    await paymentsRepository.upsertSubscription({
      userId,
      stripeCustomerId:     subscription.customer as string,
      stripeSubscriptionId: subscription.id,
      stripePriceId:        price.id,
      stripeProductId:      productId,
      planTier,
      status,
      currentPeriodStart: new Date(item.current_period_start * 1000),
      currentPeriodEnd:   new Date(item.current_period_end   * 1000),
      cancelAtPeriodEnd:   Number(subscription.cancel_at) ? true : false,
      canceledAt:         subscription.canceled_at
        ? new Date(subscription.canceled_at * 1000)
        : null,
      trialEnd: subscription.trial_end
        ? new Date(subscription.trial_end * 1000)
        : null,
    });

    // Sync user plan only when subscription is billable
  if (['ACTIVE', 'TRIALING', "CANCELLED"].includes(status)) {
      await paymentsRepository.updateUserPlan(
        userId,
        planTier,
        PLANS[planTier].monthlyQuotaMinutes,
      );
    }

  }catch(e){
    console.log(e)

    }
  }
}

export const paymentsService = new PaymentsService();
