import { WorthyPaymentProvider } from '../worthy/worthy.payment.provider';
import { PaymentError } from '../../../utils/errors';

// Guards the seam: until the Worthy adapter is implemented, selecting it must
// fail loudly (never silently no-op a payment).
describe('WorthyPaymentProvider (stub)', () => {
  const provider = new WorthyPaymentProvider();

  it('identifies as worthy', () => {
    expect(provider.name).toBe('worthy');
  });

  it('rejects createCheckoutSession until implemented', async () => {
    await expect(
      provider.createCheckoutSession({
        userId: 'u',
        email: 'e@x.com',
        planType: 'standard',
        accountSize: 50000,
        successUrl: 's',
        cancelUrl: 'c',
      }),
    ).rejects.toBeInstanceOf(PaymentError);
  });

  it('rejects parseWebhookEvent until implemented', async () => {
    await expect(
      provider.parseWebhookEvent({ rawBody: Buffer.from(''), headers: {} }),
    ).rejects.toBeInstanceOf(PaymentError);
  });
});
