import jwt from 'jsonwebtoken';
import { UserRole, UserStatus, KycStatus } from '@prisma/client';
import {
  login,
  refreshAccessToken,
  requestPasswordReset,
  resetPassword,
} from '../auth.service';
import type { JwtPayload } from '../../api/middleware/auth';

// =============================================================================
// Mocks
// =============================================================================

const mockFindUserByEmailWithCredentials = jest.fn();
const mockFindUserById = jest.fn();
const mockUpdateLastLogin = jest.fn();
const mockResetFailedAttempts = jest.fn();
const mockIncrementFailedAttempts = jest.fn();
const mockLockCredentials = jest.fn();
const mockDeleteAllUserSessions = jest.fn();
const mockCreateSession = jest.fn();
const mockFindSessionByToken = jest.fn();
const mockDeleteSession = jest.fn();
const mockSetPasswordResetToken = jest.fn();
const mockFindUserByResetTokenHash = jest.fn();
const mockConsumePasswordReset = jest.fn();
const mockSendPasswordResetEmail = jest.fn();

jest.mock('../../repositories/auth.repository', () => ({
  findUserByEmail: jest.fn(),
  findUserByEmailWithCredentials: (...args: unknown[]) =>
    mockFindUserByEmailWithCredentials(...args),
  findUserById: (...args: unknown[]) => mockFindUserById(...args),
  createUserWithPassword: jest.fn(),
  createOAuthUser: jest.fn(),
  findOAuthAccount: jest.fn(),
  linkOAuthAccount: jest.fn(),
  createSession: (...args: unknown[]) => mockCreateSession(...args),
  findSessionByToken: (...args: unknown[]) => mockFindSessionByToken(...args),
  deleteSession: (...args: unknown[]) => mockDeleteSession(...args),
  deleteAllUserSessions: (...args: unknown[]) => mockDeleteAllUserSessions(...args),
  updateLastLogin: (...args: unknown[]) => mockUpdateLastLogin(...args),
  incrementFailedAttempts: (...args: unknown[]) => mockIncrementFailedAttempts(...args),
  resetFailedAttempts: (...args: unknown[]) => mockResetFailedAttempts(...args),
  lockCredentials: (...args: unknown[]) => mockLockCredentials(...args),
  setPasswordResetToken: (...args: unknown[]) => mockSetPasswordResetToken(...args),
  findUserByResetTokenHash: (...args: unknown[]) => mockFindUserByResetTokenHash(...args),
  consumePasswordReset: (...args: unknown[]) => mockConsumePasswordReset(...args),
}));

jest.mock('../email.service', () => ({
  sendPasswordResetEmail: (...args: unknown[]) => mockSendPasswordResetEmail(...args),
}));

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// bcrypt.compare always succeeds — we want to test session logic, not hashing
jest.mock('bcrypt', () => ({
  compare: jest.fn().mockResolvedValue(true),
  hash: jest.fn().mockResolvedValue('hashed-password'),
}));

// =============================================================================
// Fixtures
// =============================================================================

const baseUser = {
  id: 'user-1',
  email: 'trader@example.com',
  firstName: 'Trader',
  lastName: 'One',
  phone: null,
  platformUserId: null,
  role: UserRole.TRADER,
  status: UserStatus.ACTIVE,
  kycStatus: KycStatus.PENDING,
  emailVerified: true,
  emailVerifiedAt: new Date('2026-01-01'),
  lastLoginAt: null,
  lastLoginIp: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const userWithCredentials = {
  ...baseUser,
  credentials: {
    userId: baseUser.id,
    passwordHash: '$2b$10$fake-hash',
    failedAttempts: 0,
    lockedUntil: null,
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateSession.mockResolvedValue({});
  mockDeleteAllUserSessions.mockResolvedValue(0);
  mockSetPasswordResetToken.mockResolvedValue(undefined);
  mockConsumePasswordReset.mockResolvedValue(undefined);
  mockSendPasswordResetEmail.mockResolvedValue(undefined);
});

// =============================================================================
// login — single-session enforcement
// =============================================================================

describe('login (single-session enforcement)', () => {
  it('evicts all prior sessions before creating the new one', async () => {
    mockFindUserByEmailWithCredentials.mockResolvedValue(userWithCredentials);
    mockDeleteAllUserSessions.mockResolvedValue(2); // pretend 2 prior sessions existed

    await login({ email: baseUser.email, password: 'whatever' });

    // The eviction must happen, and must precede session creation.
    expect(mockDeleteAllUserSessions).toHaveBeenCalledWith(baseUser.id);
    expect(mockCreateSession).toHaveBeenCalledTimes(1);

    const evictOrder = mockDeleteAllUserSessions.mock.invocationCallOrder[0]!;
    const createOrder = mockCreateSession.mock.invocationCallOrder[0]!;
    expect(evictOrder).toBeLessThan(createOrder);
  });

  it('mints a session id and embeds it as sid in both access and refresh tokens', async () => {
    mockFindUserByEmailWithCredentials.mockResolvedValue(userWithCredentials);

    const result = await login({ email: baseUser.email, password: 'whatever' });

    const accessPayload = jwt.decode(result.tokens.accessToken) as JwtPayload;
    const refreshPayload = jwt.decode(result.tokens.refreshToken) as JwtPayload;

    expect(accessPayload.type).toBe('access');
    expect(refreshPayload.type).toBe('refresh');
    expect(accessPayload.sid).toBeTruthy();
    expect(accessPayload.sid).toBe(refreshPayload.sid);

    // And the Session row was created with that same id (this is the linchpin
    // of single-session enforcement — middleware looks up Session by sid).
    const createArgs = mockCreateSession.mock.calls[0]![0];
    expect(createArgs.id).toBe(accessPayload.sid);
    expect(createArgs.userId).toBe(baseUser.id);
    expect(createArgs.token).toBe(result.tokens.refreshToken);
  });
});

// =============================================================================
// refreshAccessToken — session validity
// =============================================================================

describe('refreshAccessToken', () => {
  it('rejects when the session row no longer exists (kicked by another login)', async () => {
    // Build a refresh token referencing a session that has since been deleted.
    const refreshToken = jwt.sign(
      { sub: baseUser.id, email: baseUser.email, role: baseUser.role, type: 'refresh', sid: 'gone-sid' },
      process.env['JWT_SECRET'] as string,
      { expiresIn: '30d' }
    );

    mockFindSessionByToken.mockResolvedValue(null); // session was evicted

    await expect(refreshAccessToken(refreshToken)).rejects.toThrow('Session has been revoked');
  });

  it('rejects when the stored session id does not match the token sid', async () => {
    const refreshToken = jwt.sign(
      { sub: baseUser.id, email: baseUser.email, role: baseUser.role, type: 'refresh', sid: 'token-sid' },
      process.env['JWT_SECRET'] as string,
      { expiresIn: '30d' }
    );

    // Token row found, but its id is different (would happen if the token was
    // re-inserted with a different PK — defense-in-depth check).
    mockFindSessionByToken.mockResolvedValue({
      id: 'different-sid',
      userId: baseUser.id,
      token: refreshToken,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(refreshAccessToken(refreshToken)).rejects.toThrow('Session has been revoked');
  });

  it('issues a new access token bound to the same sid when the session is valid', async () => {
    const sid = 'valid-sid';
    const refreshToken = jwt.sign(
      { sub: baseUser.id, email: baseUser.email, role: baseUser.role, type: 'refresh', sid },
      process.env['JWT_SECRET'] as string,
      { expiresIn: '30d' }
    );

    mockFindSessionByToken.mockResolvedValue({
      id: sid,
      userId: baseUser.id,
      token: refreshToken,
      expiresAt: new Date(Date.now() + 60_000),
    });
    mockFindUserById.mockResolvedValue(baseUser);

    const result = await refreshAccessToken(refreshToken);
    const decoded = jwt.decode(result.accessToken) as JwtPayload;

    expect(decoded.sid).toBe(sid);
    expect(decoded.type).toBe('access');
    expect(decoded.sub).toBe(baseUser.id);
  });
});

// =============================================================================
// requestPasswordReset — forgot-password flow
// =============================================================================

describe('requestPasswordReset', () => {
  it('stores a hashed token and sends a reset email for a credentialed user', async () => {
    mockFindUserByEmailWithCredentials.mockResolvedValue(userWithCredentials);

    await expect(
      requestPasswordReset({ email: baseUser.email })
    ).resolves.toBeUndefined();

    expect(mockSetPasswordResetToken).toHaveBeenCalledTimes(1);
    const [userId, tokenHash, expiresAt] = mockSetPasswordResetToken.mock.calls[0]!;
    expect(userId).toBe(baseUser.id);
    // Hash, not raw token — must be the 64-char SHA-256 hex digest.
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(expiresAt).toBeInstanceOf(Date);
    expect((expiresAt as Date).getTime()).toBeGreaterThan(Date.now());

    expect(mockSendPasswordResetEmail).toHaveBeenCalledTimes(1);
    const [emailUser, rawToken, isFirstPasswordSet] =
      mockSendPasswordResetEmail.mock.calls[0]!;
    expect(emailUser).toMatchObject({ email: baseUser.email, firstName: baseUser.firstName });
    expect(typeof rawToken).toBe('string');
    expect((rawToken as string).length).toBeGreaterThan(20);
    // The raw token must NOT equal the stored hash — that's the whole point.
    expect(rawToken).not.toBe(tokenHash);
    expect(isFirstPasswordSet).toBe(false);
  });

  it('treats OAuth-only users as a first-password-set flow', async () => {
    mockFindUserByEmailWithCredentials.mockResolvedValue({
      ...baseUser,
      credentials: null, // OAuth-only signup — no credentials row yet
    });

    await requestPasswordReset({ email: baseUser.email });

    expect(mockSetPasswordResetToken).toHaveBeenCalledTimes(1);
    const [, , ] = mockSetPasswordResetToken.mock.calls[0]!;
    const [, , isFirstPasswordSet] = mockSendPasswordResetEmail.mock.calls[0]!;
    expect(isFirstPasswordSet).toBe(true);
  });

  it('silently no-ops when no user matches the email (no enumeration)', async () => {
    mockFindUserByEmailWithCredentials.mockResolvedValue(null);

    await expect(
      requestPasswordReset({ email: 'nobody@example.com' })
    ).resolves.toBeUndefined();

    expect(mockSetPasswordResetToken).not.toHaveBeenCalled();
    expect(mockSendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('does not send a reset for banned or suspended users', async () => {
    mockFindUserByEmailWithCredentials.mockResolvedValue({
      ...userWithCredentials,
      status: UserStatus.BANNED,
    });

    await requestPasswordReset({ email: baseUser.email });

    expect(mockSetPasswordResetToken).not.toHaveBeenCalled();
    expect(mockSendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('still resolves successfully when the email send fails', async () => {
    mockFindUserByEmailWithCredentials.mockResolvedValue(userWithCredentials);
    mockSendPasswordResetEmail.mockRejectedValueOnce(new Error('SES down'));

    await expect(
      requestPasswordReset({ email: baseUser.email })
    ).resolves.toBeUndefined();

    // Token was still persisted before the email attempt.
    expect(mockSetPasswordResetToken).toHaveBeenCalled();
  });
});

// =============================================================================
// resetPassword — completing the reset
// =============================================================================

describe('resetPassword', () => {
  const futureExpiry = () => new Date(Date.now() + 30 * 60 * 1000);

  it('rejects an unknown token with a generic message (no information leak)', async () => {
    mockFindUserByResetTokenHash.mockResolvedValue(null);

    await expect(
      resetPassword({ token: 'bogus', newPassword: 'NewPass1!' })
    ).rejects.toThrow('This password reset link is invalid or has expired');

    expect(mockConsumePasswordReset).not.toHaveBeenCalled();
    expect(mockDeleteAllUserSessions).not.toHaveBeenCalled();
  });

  it('rejects an expired token with the same generic message', async () => {
    mockFindUserByResetTokenHash.mockResolvedValue({
      ...baseUser,
      credentials: {
        ...userWithCredentials.credentials,
        resetToken: 'sha256-hash',
        resetTokenExpiry: new Date(Date.now() - 1000), // expired 1s ago
      },
    });

    await expect(
      resetPassword({ token: 'rawtoken', newPassword: 'NewPass1!' })
    ).rejects.toThrow('This password reset link is invalid or has expired');

    expect(mockConsumePasswordReset).not.toHaveBeenCalled();
  });

  it('rejects when the account is no longer active', async () => {
    mockFindUserByResetTokenHash.mockResolvedValue({
      ...baseUser,
      status: UserStatus.BANNED,
      credentials: {
        ...userWithCredentials.credentials,
        resetToken: 'sha256-hash',
        resetTokenExpiry: futureExpiry(),
      },
    });

    await expect(
      resetPassword({ token: 'rawtoken', newPassword: 'NewPass1!' })
    ).rejects.toThrow('This account is no longer active');

    expect(mockConsumePasswordReset).not.toHaveBeenCalled();
  });

  it('swaps the password and evicts every existing session on success', async () => {
    mockFindUserByResetTokenHash.mockResolvedValue({
      ...baseUser,
      credentials: {
        ...userWithCredentials.credentials,
        resetToken: 'sha256-hash',
        resetTokenExpiry: futureExpiry(),
      },
    });

    await resetPassword({ token: 'rawtoken', newPassword: 'NewPass1!' });

    expect(mockConsumePasswordReset).toHaveBeenCalledWith(baseUser.id, 'hashed-password');
    expect(mockDeleteAllUserSessions).toHaveBeenCalledWith(baseUser.id);

    // Order matters — the password must be updated BEFORE sessions are evicted
    // (the new state is what the user will re-authenticate against).
    const consumeOrder = mockConsumePasswordReset.mock.invocationCallOrder[0]!;
    const evictOrder = mockDeleteAllUserSessions.mock.invocationCallOrder[0]!;
    expect(consumeOrder).toBeLessThan(evictOrder);
  });
});
