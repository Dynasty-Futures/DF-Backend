import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// =============================================================================
// Mocks
// =============================================================================
// We mount the REAL `authenticate` middleware + real error handler so the test
// exercises the actual auth wiring on the route (not a stubbed-away guard). Only
// config / session lookup / service / logger are mocked at the boundary.

const JWT_SECRET = 'testsecret';
jest.mock('../../../../config/index', () => ({
  config: { jwt: { secret: JWT_SECRET }, isProduction: false },
}));

const mockFindSessionById = jest.fn();
jest.mock('../../../../repositories/auth.repository', () => ({
  findSessionById: (...args: unknown[]) => mockFindSessionById(...args),
}));

const mockSubmit = jest.fn();
jest.mock('../../../../services/index', () => ({
  affiliateService: {
    submitApplication: (...args: unknown[]) => mockSubmit(...args),
    getMyAffiliateStatus: jest.fn(),
  },
}));

jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import affiliatesRouter from '../affiliates';
import { errorHandler } from '../../../middleware/error-handler';

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/v1/affiliates', affiliatesRouter);
  app.use(errorHandler);
  return app;
};

// A body that satisfies the apply schema (≥1 social URL + all required fields).
const validBody = {
  websiteUrl: 'https://example.com',
  isFundedTrader: true,
  hasActiveDynastyAccount: false,
  promotionPlan: 'YouTube reviews',
  primaryTrafficMethod: 'Organic search',
  createsCustomContent: true,
  contentUpdateFrequency: 'Weekly',
  preferredAffiliateCode: 'TRADER15',
  restrictedJurisdictionConfirmation: true,
};

const signToken = (overrides: Record<string, unknown> = {}) =>
  jwt.sign(
    {
      sub: 'user-1',
      email: 'trader@example.com',
      role: 'TRADER',
      type: 'access',
      sid: 'sess-1',
      ...overrides,
    },
    JWT_SECRET
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockFindSessionById.mockResolvedValue({ id: 'sess-1', userId: 'user-1' });
  mockSubmit.mockResolvedValue({ id: 'app-1', status: 'PENDING' });
});

// =============================================================================
// Tests
// =============================================================================

describe('POST /v1/affiliates/apply', () => {
  it('rejects an anonymous submission with 401 and never calls the service', async () => {
    const res = await request(buildApp()).post('/v1/affiliates/apply').send(validBody);

    expect(res.status).toBe(401);
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('accepts an authenticated submission and binds it to the logged-in user', async () => {
    const res = await request(buildApp())
      .post('/v1/affiliates/apply')
      .set('Authorization', `Bearer ${signToken()}`)
      .send(validBody);

    expect(res.status).toBe(201);
    expect(mockSubmit).toHaveBeenCalledTimes(1);
    expect(mockSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        creatorId: 'user-1',
        applicantEmail: 'trader@example.com',
        preferredAffiliateCode: 'TRADER15',
      })
    );
  });

  it('still validates the body for an authenticated user (422 on a bad payload)', async () => {
    const res = await request(buildApp())
      .post('/v1/affiliates/apply')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ ...validBody, websiteUrl: '', youtubeUrl: '', preferredAffiliateCode: '' });

    expect(res.status).toBe(422);
    expect(mockSubmit).not.toHaveBeenCalled();
  });
});
