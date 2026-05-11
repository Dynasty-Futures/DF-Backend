import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import { authenticate } from '../auth';
import { UnauthorizedError, InvalidTokenError } from '../../../utils/errors';
import type { Request, Response, NextFunction } from 'express';

// =============================================================================
// Mocks
// =============================================================================

const mockFindSessionById = jest.fn();

jest.mock('../../../repositories/auth.repository', () => ({
  findSessionById: (...args: unknown[]) => mockFindSessionById(...args),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// =============================================================================
// Helpers
// =============================================================================

const makeToken = (overrides: Partial<{ sub: string; sid: string; type: string }> = {}) =>
  jwt.sign(
    {
      sub: overrides.sub ?? 'user-1',
      email: 'trader@example.com',
      role: UserRole.TRADER,
      type: overrides.type ?? 'access',
      sid: overrides.sid ?? 'session-1',
    },
    process.env['JWT_SECRET'] as string,
    { expiresIn: '7d' }
  );

const runMiddleware = async (token: string | null) => {
  const req = {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  } as unknown as Request;
  const res = {} as Response;
  const next: NextFunction = jest.fn();
  await authenticate(req, res, next);
  return { req, next: next as jest.Mock };
};

beforeEach(() => {
  jest.clearAllMocks();
});

// =============================================================================
// authenticate — session enforcement
// =============================================================================

describe('authenticate (single-session enforcement)', () => {
  it('passes when the JWT is valid and its session exists for the same user', async () => {
    mockFindSessionById.mockResolvedValue({ id: 'session-1', userId: 'user-1' });

    const { req, next } = await runMiddleware(makeToken());

    expect(next).toHaveBeenCalledWith();
    expect(req.user).toEqual({
      id: 'user-1',
      email: 'trader@example.com',
      role: UserRole.TRADER,
    });
  });

  it('401s when the session has been evicted (another browser logged in)', async () => {
    mockFindSessionById.mockResolvedValue(null);

    const { next } = await runMiddleware(makeToken());

    const err = next.mock.calls[0]![0];
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(err.message).toBe('Session has been invalidated');
  });

  it('401s when the session belongs to a different user (token/session mismatch)', async () => {
    mockFindSessionById.mockResolvedValue({ id: 'session-1', userId: 'someone-else' });

    const { next } = await runMiddleware(makeToken({ sub: 'user-1' }));

    const err = next.mock.calls[0]![0];
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(err.message).toBe('Session has been invalidated');
  });

  it('rejects when the access token has no sid claim', async () => {
    const legacyToken = jwt.sign(
      { sub: 'user-1', email: 'x@y.com', role: UserRole.TRADER, type: 'access' },
      process.env['JWT_SECRET'] as string,
      { expiresIn: '7d' }
    );

    const { next } = await runMiddleware(legacyToken);

    const err = next.mock.calls[0]![0];
    expect(err).toBeInstanceOf(InvalidTokenError);
    expect(mockFindSessionById).not.toHaveBeenCalled();
  });

  it('does not check the session when the token is a refresh token', async () => {
    const { next } = await runMiddleware(makeToken({ type: 'refresh' }));

    const err = next.mock.calls[0]![0];
    expect(err).toBeInstanceOf(InvalidTokenError);
    expect(mockFindSessionById).not.toHaveBeenCalled();
  });
});
