// src/modules/payments/controller/payments.controller.ts
import { Request, Response } from 'express';
import { paymentsService } from '../service/payments.service';
import { constructWebhookEvent } from '../../../infrastructure/stripe/stripe.provider';
import { CreateCheckoutSchema, CreatePortalSchema } from '../dto/payments.dto';
import { respond, respondCreated } from '../../../shared/utils/apiResponse';
import { UnauthorizedError, AppError } from '../../../shared/errors';
import { logger } from '../../../shared/utils/logger';

class PaymentsController {
  // POST /api/v1/payments/checkout
  async createCheckout(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const dto = CreateCheckoutSchema.parse(req.body);
    const result = await paymentsService.createCheckoutSession(req.user.sub, dto);
    respondCreated(res, result);
  }

  // POST /api/v1/payments/portal
  async createPortal(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const dto = CreatePortalSchema.parse(req.body);
    const result = await paymentsService.createPortalSession(req.user.sub, dto);
    respond(res, result);
  }

  // GET /api/v1/payments/subscription
  async getSubscription(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const subscription = await paymentsService.getSubscription(req.user.sub);
    respond(res, subscription ?? null);
  }

  // POST /api/v1/payments/webhook
  // NOTE: this route must receive the RAW body — do NOT apply express.json() to it.
  async webhook(req: Request, res: Response): Promise<void> {
    const signature = req.headers['stripe-signature'];

    if (!signature || typeof signature !== 'string') {
      throw new AppError('Missing Stripe-Signature header', 400, 'MISSING_SIGNATURE');
    }

    // req.body is the raw Buffer here (see router for the rawBody middleware)
    let event;
    try {
      event = constructWebhookEvent(req.body, signature);
    } catch (err) {
      logger.warn('Webhook signature verification failed', { err });
      throw new AppError('Invalid webhook signature', 400, 'INVALID_SIGNATURE');
    }

    logger.info('Stripe webhook received', { type: event.type, id: event.id });

    switch (event.type) {
      case 'checkout.session.completed':
        await paymentsService.handleCheckoutCompleted(
          event.data.object as import('stripe').default.Checkout.Session,
        );
           await paymentsService.handleCheckoutSessionCompleted(
          event.data.object as import('stripe').default.Checkout.Session,
        );
  
        break;

      case 'customer.subscription.updated':
        await paymentsService.handleSubscriptionUpdated(
          event.data.object as import('stripe').default.Subscription,
        );
        break;

      case 'customer.subscription.deleted':
        await paymentsService.handleSubscriptionDeleted(
          event.data.object as import('stripe').default.Subscription,
        );
        break;

      case 'invoice.payment_succeeded':
     
        break;

      

      case 'invoice.payment_failed':
        await paymentsService.handleInvoicePaymentFailed(
          event.data.object as import('stripe').default.Invoice,
        );
        break;

      default:
        logger.debug('Unhandled Stripe event type', { type: event.type });
    }

    // Always respond 200 so Stripe doesn't retry
    res.json({ received: true });
  }
}

export const paymentsController = new PaymentsController();
