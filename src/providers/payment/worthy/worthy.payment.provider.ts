import { PaymentError } from '../../../utils/errors.js';
import type {
  CheckoutSessionResult,
  CreateCheckoutParams,
  PaymentEvent,
  PaymentProvider,
  WebhookRequest,
} from '../payment.provider.js';

// =============================================================================
// Worthy Payment Provider — STUB
// =============================================================================
// Placeholder for the planned migration off Stripe to Worthy. The integration
// spec/credentials are not yet available, so both methods throw until the real
// adapter is implemented.
//
// To complete the swap once Worthy's API is known:
//   1. Implement createCheckoutSession (hosted checkout → redirect URL), carrying
//      userId/planType/accountSize so they come back on the completion webhook.
//   2. Implement parseWebhookEvent: verify Worthy's signature against
//      `req.headers`, and map a successful payment to a PaymentCompletedEvent
//      ({ userId, planType, accountSize, amountPaid, paymentId }). Everything
//      else returns { type: 'ignored' }.
//   3. Add WORTHY_* env vars to config and set PAYMENT_PROVIDER=worthy.
// Nothing else in the app needs to change — provisioning is provider-agnostic.
// =============================================================================

const NOT_IMPLEMENTED =
  'Worthy payment provider is not implemented yet. Set PAYMENT_PROVIDER=stripe until the Worthy adapter is ready.';

export class WorthyPaymentProvider implements PaymentProvider {
  readonly name = 'worthy';

  createCheckoutSession(
    _params: CreateCheckoutParams,
  ): Promise<CheckoutSessionResult> {
    return Promise.reject(new PaymentError(NOT_IMPLEMENTED));
  }

  parseWebhookEvent(_req: WebhookRequest): Promise<PaymentEvent> {
    return Promise.reject(new PaymentError(NOT_IMPLEMENTED));
  }
}
