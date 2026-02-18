import Stripe from 'stripe';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { PaymentError, ValidationError } from '../utils/errors.js';
import { provisionAccount } from './challenge.service.js';

// =============================================================================
// Stripe Client
// =============================================================================

const stripe = new Stripe(config.stripe.secretKey ?? '', {
  apiVersion: '2025-02-24.acacia',
});

// =============================================================================
// Stripe Price ID Mapping
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

const VALID_PLAN_TYPES: PlanType[] = ['standard', 'advanced', 'dynasty'];
const VALID_ACCOUNT_SIZES: AccountSize[] = [25000, 50000, 100000, 150000];

// =============================================================================
// Create Checkout Session
// =============================================================================

interface CreateCheckoutParams {
  userId: string;
  email: string;
  planType: string;
  accountSize: number;
}

export const createCheckoutSession = async (
  params: CreateCheckoutParams
): Promise<{ checkoutUrl: string }> => {
  const { userId, email, planType, accountSize } = params;

  if (!VALID_PLAN_TYPES.includes(planType as PlanType)) {
    throw new ValidationError('Invalid plan type', {
      field: 'planType',
      allowed: VALID_PLAN_TYPES,
    });
  }

  if (!VALID_ACCOUNT_SIZES.includes(accountSize as AccountSize)) {
    throw new ValidationError('Invalid account size', {
      field: 'accountSize',
      allowed: VALID_ACCOUNT_SIZES,
    });
  }

  const priceId = STRIPE_PRICE_MAP[planType as PlanType][accountSize as AccountSize];

  if (!priceId) {
    throw new ValidationError('No price configured for this plan and size combination');
  }

  if (!config.stripe.secretKey) {
    throw new PaymentError('Payment system is not configured');
  }

  const frontendUrl = config.frontendUrl ?? 'http://localhost:5173';

  logger.info(
    { userId, planType, accountSize, priceId },
    'Creating Stripe checkout session'
  );

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      metadata: {
        userId,
        planType,
        accountSize: String(accountSize),
      },
      success_url: `${frontendUrl}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/pricing?checkout=cancelled`,
    });

    if (!session.url) {
      throw new PaymentError('Failed to generate checkout URL');
    }

    logger.info(
      { userId, sessionId: session.id },
      'Stripe checkout session created'
    );

    return { checkoutUrl: session.url };
  } catch (error) {
    if (error instanceof PaymentError || error instanceof ValidationError) {
      throw error;
    }

    logger.error({ error, userId }, 'Failed to create Stripe checkout session');
    throw new PaymentError('Unable to initiate checkout. Please try again.');
  }
};

// =============================================================================
// Handle Webhook Event
// =============================================================================

export const handleWebhookEvent = async (
  payload: Buffer,
  signature: string
): Promise<void> => {
  if (!config.stripe.webhookSecret) {
    logger.error('Stripe webhook secret is not configured');
    throw new PaymentError('Webhook verification not configured');
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      payload,
      signature,
      config.stripe.webhookSecret
    );
  } catch (error) {
    logger.error({ error }, 'Stripe webhook signature verification failed');
    throw new PaymentError('Invalid webhook signature');
  }

  logger.info({ eventType: event.type, eventId: event.id }, 'Processing Stripe webhook event');

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutCompleted(session);
      break;
    }

    default:
      logger.debug({ eventType: event.type }, 'Unhandled Stripe webhook event type');
  }
};

// =============================================================================
// Webhook Handlers
// =============================================================================

const handleCheckoutCompleted = async (
  session: Stripe.Checkout.Session
): Promise<void> => {
  const { userId, planType, accountSize } = session.metadata ?? {};

  if (!userId || !planType || !accountSize) {
    logger.error(
      { sessionId: session.id, metadata: session.metadata },
      'Checkout session missing required metadata'
    );
    return;
  }

  const amountPaid = session.amount_total ? session.amount_total / 100 : 0;

  logger.info(
    {
      sessionId: session.id,
      userId,
      planType,
      accountSize,
      amountPaid,
      paymentIntentId: session.payment_intent,
    },
    'Processing completed checkout'
  );

  try {
    await provisionAccount({
      userId,
      planType,
      accountSize: Number(accountSize),
      stripePaymentId: (session.payment_intent as string) ?? session.id,
      amountPaid,
    });

    logger.info(
      { userId, sessionId: session.id },
      'Account provisioned successfully after checkout'
    );
  } catch (error) {
    logger.error(
      { error, userId, sessionId: session.id },
      'Failed to provision account after checkout — manual intervention may be required'
    );
  }
};
