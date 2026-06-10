// =============================================================================
// Payment Provider Factory
// =============================================================================
// Returns the PaymentProvider implementation selected by config.paymentProvider.
// The only place concrete provider classes are imported. Mirrors the trading
// platform factory in ../index.ts.
// =============================================================================

import { config } from '../../config/index.js';
import type { PaymentProvider } from './payment.provider.js';
import { StripePaymentProvider } from './stripe/stripe.payment.provider.js';
import { WorthyPaymentProvider } from './worthy/worthy.payment.provider.js';

let _cached: PaymentProvider | null = null;

export function getPaymentProvider(): PaymentProvider {
  if (_cached) return _cached;

  switch (config.paymentProvider) {
    case 'stripe':
      _cached = new StripePaymentProvider();
      break;
    case 'worthy':
      _cached = new WorthyPaymentProvider();
      break;
    default:
      throw new Error(`Unknown payment provider: ${config.paymentProvider}`);
  }

  return _cached;
}

export type {
  PaymentProvider,
  CreateCheckoutParams,
  CheckoutSessionResult,
  PaymentEvent,
  PaymentCompletedEvent,
  WebhookRequest,
} from './payment.provider.js';
