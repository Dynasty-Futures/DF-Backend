import Stripe from 'stripe';
import { config } from '../../../config/index.js';
import { logger } from '../../../utils/logger.js';
import { PaymentError, ValidationError } from '../../../utils/errors.js';
import type {
  CheckoutSessionResult,
  CreateCheckoutParams,
  PaymentEvent,
  PaymentProvider,
  WebhookRequest,
} from '../payment.provider.js';

// =============================================================================
// Stripe Payment Provider
// =============================================================================

type PlanType = 'standard' | 'advanced' | 'dynasty';
type AccountSize = 25000 | 50000 | 100000 | 150000;

const STRIPE_PRICE_MAP: Record<PlanType, Record<AccountSize, string>> = {
  standard: {
    25000: 'price_1T1t5NCTpsQNuNKcBEAYCRqG',
    50000: 'price_1T1t5MCTpsQNuNKc6824tOyu',
    100000: 'price_1T1t5MCTpsQNuNKc50ULTWNy',
    150000: 'price_1T1t5MCTpsQNuNKcwxO0IuM4',
  },
  advanced: {
    25000: 'price_1T1t5LCTpsQNuNKcrWR0CQ6h',
    50000: 'price_1T1t5LCTpsQNuNKcWynq1tUl',
    100000: 'price_1T1t5LCTpsQNuNKcq8o2mUtN',
    150000: 'price_1T1t5LCTpsQNuNKcQiMYq8yl',
  },
  dynasty: {
    25000: 'price_1T1t5KCTpsQNuNKcX5cEWooD',
    50000: 'price_1T1t5KCTpsQNuNKcQq9bMDkK',
    100000: 'price_1T1t5KCTpsQNuNKcfX1aSECA',
    150000: 'price_1T1t5JCTpsQNuNKctXean8ct',
  },
};

const resolvePriceId = (planType: string, accountSize: number): string => {
  const plan = STRIPE_PRICE_MAP[planType as PlanType] as
    | Record<AccountSize, string>
    | undefined;
  const priceId = plan?.[accountSize as AccountSize];
  if (!priceId) {
    throw new ValidationError(
      'No price configured for this plan and size combination',
      { planType, accountSize },
    );
  }
  return priceId;
};

export class StripePaymentProvider implements PaymentProvider {
  readonly name = 'stripe';

  private _client: Stripe | null = null;

  private client(): Stripe {
    if (!this._client) {
      if (!config.stripe.secretKey) {
        throw new PaymentError('Stripe is not configured. Set STRIPE_SECRET_KEY.');
      }
      this._client = new Stripe(config.stripe.secretKey, {
        apiVersion: '2025-02-24.acacia',
      });
    }
    return this._client;
  }

  async createCheckoutSession(
    params: CreateCheckoutParams,
  ): Promise<CheckoutSessionResult> {
    const { userId, email, planType, accountSize, successUrl, cancelUrl } = params;
    const priceId = resolvePriceId(planType, accountSize);

    const metadata = {
      userId,
      planType,
      accountSize: String(accountSize),
    };

    logger.info({ userId, planType, accountSize, priceId }, 'Creating Stripe checkout session');

    try {
      const session = await this.client().checkout.sessions.create({
        mode: 'subscription',
        customer_email: email,
        line_items: [{ price: priceId, quantity: 1 }],
        subscription_data: { metadata },
        metadata,
        // Stripe substitutes the real id for the {CHECKOUT_SESSION_ID} template.
        success_url: `${successUrl}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl,
      });

      if (!session.url) {
        throw new PaymentError('Failed to generate checkout URL');
      }

      logger.info({ userId, sessionId: session.id }, 'Stripe checkout session created');
      return { checkoutUrl: session.url, sessionId: session.id };
    } catch (error) {
      if (error instanceof PaymentError || error instanceof ValidationError) {
        throw error;
      }
      logger.error({ error, userId }, 'Failed to create Stripe checkout session');
      throw new PaymentError('Unable to initiate checkout. Please try again.');
    }
  }

  async parseWebhookEvent(req: WebhookRequest): Promise<PaymentEvent> {
    if (!config.stripe.webhookSecret) {
      logger.error('Stripe webhook secret is not configured');
      throw new PaymentError('Webhook verification not configured');
    }

    const signature = req.headers['stripe-signature'];
    if (!signature || typeof signature !== 'string') {
      throw new PaymentError('Missing stripe-signature header');
    }

    let event: Stripe.Event;
    try {
      event = this.client().webhooks.constructEvent(
        req.rawBody,
        signature,
        config.stripe.webhookSecret,
      );
    } catch (error) {
      logger.error({ error }, 'Stripe webhook signature verification failed');
      throw new PaymentError('Invalid webhook signature');
    }

    logger.info({ eventType: event.type, eventId: event.id }, 'Processing Stripe webhook event');

    if (event.type !== 'checkout.session.completed') {
      return { type: 'ignored', reason: event.type };
    }

    const session = event.data.object as Stripe.Checkout.Session;
    const { userId, planType, accountSize } = session.metadata ?? {};
    if (!userId || !planType || !accountSize) {
      logger.error(
        { sessionId: session.id, metadata: session.metadata },
        'Checkout session missing required metadata',
      );
      return { type: 'ignored', reason: 'missing-metadata' };
    }

    // payment_intent is null on subscription checkouts — fall back to the
    // subscription id (then the session id) as the idempotency reference.
    const paymentId =
      (session.subscription as string | null) ??
      (session.payment_intent as string | null) ??
      session.id;

    return {
      type: 'payment.completed',
      userId,
      planType,
      accountSize: Number(accountSize),
      amountPaid: session.amount_total ? session.amount_total / 100 : 0,
      paymentId,
    };
  }
}
