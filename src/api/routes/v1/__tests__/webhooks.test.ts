import express from 'express';
import request from 'supertest';

// =============================================================================
// Mocks
// =============================================================================

// Mutable config object so each test can flip the webhook secret / discovery
// switch. The route reads these at request time, so mutating between tests works.
const mockConfig = {
  ypf: {
    webhook: { secret: undefined as string | undefined },
    discovery: { enabled: true },
  },
};
jest.mock('../../../../config/index', () => ({ config: mockConfig }));

const mockTrigger = jest.fn();
jest.mock('../../../../services/account-discovery.service', () => ({
  triggerDiscoverySweep: (...args: unknown[]) => mockTrigger(...args),
}));

const mockHandleAffiliate = jest.fn();
jest.mock('../../../../services/affiliate.service', () => ({
  handleAffiliateWebhookEvent: (...args: unknown[]) => mockHandleAffiliate(...args),
}));

jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import webhooksRouter from '../webhooks';

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/v1/webhooks', webhooksRouter);
  return app;
};

const SECRET = 'whsec_test_123';

beforeEach(() => {
  jest.clearAllMocks();
  mockConfig.ypf.webhook.secret = SECRET;
  mockConfig.ypf.discovery.enabled = true;
  mockHandleAffiliate.mockResolvedValue(undefined);
});

// =============================================================================
// Tests
// =============================================================================

describe('POST /v1/webhooks/ypf', () => {
  it('returns 503 when no webhook secret is configured', async () => {
    mockConfig.ypf.webhook.secret = undefined;

    const res = await request(buildApp()).post('/v1/webhooks/ypf').send({});

    expect(res.status).toBe(503);
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it('returns 401 when the secret is missing', async () => {
    const res = await request(buildApp()).post('/v1/webhooks/ypf').send({});

    expect(res.status).toBe(401);
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it('returns 401 when the secret is wrong', async () => {
    const res = await request(buildApp())
      .post('/v1/webhooks/ypf')
      .set('X-Webhook-Secret', 'nope')
      .send({});

    expect(res.status).toBe(401);
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it('triggers a discovery sweep with a valid X-Webhook-Secret header', async () => {
    const res = await request(buildApp())
      .post('/v1/webhooks/ypf')
      .set('X-Webhook-Secret', SECRET)
      .send({ event: 'account.created' });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ success: true, triggered: true });
    expect(mockTrigger).toHaveBeenCalledTimes(1);
  });

  it('accepts the secret via Authorization: Bearer', async () => {
    const res = await request(buildApp())
      .post('/v1/webhooks/ypf')
      .set('Authorization', `Bearer ${SECRET}`)
      .send({});

    expect(res.status).toBe(202);
    expect(mockTrigger).toHaveBeenCalledTimes(1);
  });

  it('accepts the secret via ?secret= query param', async () => {
    const res = await request(buildApp())
      .post(`/v1/webhooks/ypf?secret=${SECRET}`)
      .send({});

    expect(res.status).toBe(202);
    expect(mockTrigger).toHaveBeenCalledTimes(1);
  });

  it('acks without sweeping when discovery is disabled', async () => {
    mockConfig.ypf.discovery.enabled = false;

    const res = await request(buildApp())
      .post('/v1/webhooks/ypf')
      .set('X-Webhook-Secret', SECRET)
      .send({});

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ success: true, triggered: false });
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it('routes Affiliate* events to the affiliate handler (no discovery sweep)', async () => {
    const res = await request(buildApp())
      .post('/v1/webhooks/ypf')
      .set('X-Webhook-Secret', SECRET)
      .send({ webhookType: 'AffiliatePartnerApproved', externalId: 'user-1' });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ success: true, handled: 'affiliate' });
    expect(mockHandleAffiliate).toHaveBeenCalledWith(
      'AffiliatePartnerApproved',
      expect.objectContaining({ externalId: 'user-1' })
    );
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it('triggers discovery (not affiliate) for AccountCreated via webhookType', async () => {
    const res = await request(buildApp())
      .post('/v1/webhooks/ypf')
      .set('X-Webhook-Secret', SECRET)
      .send({ webhookType: 'AccountCreated' });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ success: true, triggered: true });
    expect(mockTrigger).toHaveBeenCalledTimes(1);
    expect(mockHandleAffiliate).not.toHaveBeenCalled();
  });
});
