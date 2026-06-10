// =============================================================================
// Payment Provider Interface
// =============================================================================
// Decouples checkout + webhook handling from any specific payment processor.
// Services and routes only ever work with these DTOs, so swapping Stripe for
// Worthy (or anything else) is a single adapter + a config flip — no changes to
// the provisioning flow.
//
// Concrete implementations live under src/providers/payment/<processor>/ and are
// wired up by the factory in ./index.ts (switched on config.paymentProvider).
// =============================================================================

export interface CreateCheckoutParams {
  userId: string;
  email: string;
  /** 'standard' | 'advanced' | 'dynasty' — validated upstream at the route. */
  planType: string;
  /** 25000 | 50000 | 100000 | 150000 */
  accountSize: number;
  /** Where the processor sends the buyer on success (provider may append its
   *  own session-id placeholder). */
  successUrl: string;
  /** Where the processor sends the buyer on cancel. */
  cancelUrl: string;
}

export interface CheckoutSessionResult {
  checkoutUrl: string;
  /** Processor session id, if the processor exposes one. */
  sessionId?: string | undefined;
}

/** A verified, normalized "payment succeeded — provision the account" event. */
export interface PaymentCompletedEvent {
  type: 'payment.completed';
  userId: string;
  planType: string;
  accountSize: number;
  amountPaid: number;
  /** Processor payment/subscription reference — used as the idempotency key. */
  paymentId: string;
}

/** Any other (valid but irrelevant) webhook — acknowledged, no action taken. */
export interface PaymentIgnoredEvent {
  type: 'ignored';
  reason?: string | undefined;
}

export type PaymentEvent = PaymentCompletedEvent | PaymentIgnoredEvent;

/** Raw inbound webhook — the provider verifies the signature against headers. */
export interface WebhookRequest {
  rawBody: Buffer;
  headers: Record<string, string | string[] | undefined>;
}

export interface PaymentProvider {
  /** Identifier for logging/telemetry, e.g. 'stripe' | 'worthy'. */
  readonly name: string;

  /** Create a hosted checkout session and return its redirect URL. */
  createCheckoutSession(
    params: CreateCheckoutParams,
  ): Promise<CheckoutSessionResult>;

  /**
   * Verify + parse an inbound webhook into a normalized event.
   * Throws (PaymentError) when the signature is missing or invalid.
   */
  parseWebhookEvent(req: WebhookRequest): Promise<PaymentEvent>;
}
