// =============================================================================
// Payment Service
// =============================================================================
// Processor-agnostic checkout + webhook orchestration. All Stripe/Worthy
// specifics live behind the PaymentProvider (src/providers/payment); this layer
// only knows the business flow: create a checkout, and on a verified completion
// event, provision the account.
// =============================================================================

import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { getPaymentProvider } from '../providers/payment/index.js';
import { provisionAccount } from './challenge.service.js';

interface CreateCheckoutParams {
  userId: string;
  email: string;
  planType: string;
  accountSize: number;
}

export const createCheckoutSession = async (
  params: CreateCheckoutParams,
): Promise<{ checkoutUrl: string }> => {
  const provider = getPaymentProvider();

  const result = await provider.createCheckoutSession({
    ...params,
    successUrl: `${config.frontendUrl}/dashboard?checkout=success`,
    cancelUrl: `${config.frontendUrl}/pricing?checkout=cancelled`,
  });

  return { checkoutUrl: result.checkoutUrl };
};

/**
 * Verify + handle an inbound payment webhook. Signature verification happens
 * inside the provider; a verified completion event provisions the account.
 * Throws on an invalid/unverifiable webhook so the route can 400.
 */
export const handlePaymentWebhook = async (
  rawBody: Buffer,
  headers: Record<string, string | string[] | undefined>,
): Promise<void> => {
  const provider = getPaymentProvider();
  const event = await provider.parseWebhookEvent({ rawBody, headers });

  if (event.type !== 'payment.completed') {
    logger.debug({ provider: provider.name, reason: event.reason }, 'Payment webhook ignored');
    return;
  }

  logger.info(
    {
      provider: provider.name,
      userId: event.userId,
      planType: event.planType,
      accountSize: event.accountSize,
      paymentId: event.paymentId,
    },
    'Processing completed payment',
  );

  try {
    await provisionAccount({
      userId: event.userId,
      planType: event.planType,
      accountSize: event.accountSize,
      // Idempotency reference — column is named stripePaymentId for historical
      // reasons but holds whichever processor's payment id (Worthy included).
      stripePaymentId: event.paymentId,
      amountPaid: event.amountPaid,
    });
    logger.info({ userId: event.userId }, 'Account provisioned successfully after payment');
  } catch (error) {
    logger.error(
      { error, userId: event.userId },
      'Failed to provision account after payment — manual intervention may be required',
    );
  }
};
