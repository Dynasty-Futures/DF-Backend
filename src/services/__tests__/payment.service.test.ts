import { createCheckoutSession, handlePaymentWebhook } from '../payment.service';
import type {
  PaymentCompletedEvent,
  PaymentEvent,
} from '../../providers/payment/payment.provider';

// =============================================================================
// Mocks
// =============================================================================

const mockCreateCheckoutSession = jest.fn();
const mockParseWebhookEvent = jest.fn();

jest.mock('../../providers/payment/index', () => ({
  getPaymentProvider: () => ({
    name: 'stripe',
    createCheckoutSession: (...args: unknown[]) => mockCreateCheckoutSession(...args),
    parseWebhookEvent: (...args: unknown[]) => mockParseWebhookEvent(...args),
  }),
}));

const mockProvisionAccount = jest.fn();
jest.mock('../challenge.service', () => ({
  provisionAccount: (...args: unknown[]) => mockProvisionAccount(...args),
}));

jest.mock('../../config/index', () => ({
  config: { frontendUrl: 'https://app.test' },
}));

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// =============================================================================
// Fixtures
// =============================================================================

const completedEvent = (
  overrides: Partial<PaymentCompletedEvent> = {},
): PaymentEvent => ({
  type: 'payment.completed',
  userId: 'user-1',
  planType: 'standard',
  accountSize: 50000,
  amountPaid: 199,
  paymentId: 'sub_123',
  ...overrides,
});

// =============================================================================
// Tests
// =============================================================================

describe('paymentService.createCheckoutSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateCheckoutSession.mockResolvedValue({ checkoutUrl: 'https://pay.test/abc' });
  });

  it('builds success/cancel URLs from frontendUrl and returns the checkout URL', async () => {
    const result = await createCheckoutSession({
      userId: 'user-1',
      email: 'trader@example.com',
      planType: 'standard',
      accountSize: 50000,
    });

    expect(mockCreateCheckoutSession).toHaveBeenCalledWith({
      userId: 'user-1',
      email: 'trader@example.com',
      planType: 'standard',
      accountSize: 50000,
      successUrl: 'https://app.test/dashboard?checkout=success',
      cancelUrl: 'https://app.test/pricing?checkout=cancelled',
    });
    expect(result).toEqual({ checkoutUrl: 'https://pay.test/abc' });
  });
});

describe('paymentService.handlePaymentWebhook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProvisionAccount.mockResolvedValue(undefined);
  });

  it('provisions the account on a completed payment, passing paymentId as the idempotency ref', async () => {
    mockParseWebhookEvent.mockResolvedValue(completedEvent());

    await handlePaymentWebhook(Buffer.from('{}'), { 'stripe-signature': 'sig' });

    expect(mockProvisionAccount).toHaveBeenCalledWith({
      userId: 'user-1',
      planType: 'standard',
      accountSize: 50000,
      stripePaymentId: 'sub_123',
      amountPaid: 199,
    });
  });

  it('does not provision when the event is ignored', async () => {
    mockParseWebhookEvent.mockResolvedValue({ type: 'ignored', reason: 'payment_intent.created' });

    await handlePaymentWebhook(Buffer.from('{}'), {});

    expect(mockProvisionAccount).not.toHaveBeenCalled();
  });

  it('swallows provisioning errors so the webhook still acks (no retry storm)', async () => {
    mockParseWebhookEvent.mockResolvedValue(completedEvent());
    mockProvisionAccount.mockRejectedValueOnce(new Error('YPF down'));

    await expect(
      handlePaymentWebhook(Buffer.from('{}'), { 'stripe-signature': 'sig' }),
    ).resolves.toBeUndefined();
  });

  it('propagates verification failures so the route can 400', async () => {
    mockParseWebhookEvent.mockRejectedValue(new Error('Invalid webhook signature'));

    await expect(handlePaymentWebhook(Buffer.from('{}'), {})).rejects.toThrow(
      'Invalid webhook signature',
    );
    expect(mockProvisionAccount).not.toHaveBeenCalled();
  });
});
