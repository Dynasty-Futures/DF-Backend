import { randomUUID, randomBytes, createHash } from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import type { StringValue } from 'ms';
import { OAuth2Client } from 'google-auth-library';
import { UserStatus } from '@prisma/client';

import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import {
  AuthenticationError,
  BadRequestError,
  ConflictError,
  UnauthorizedError,
  ValidationError,
  InvalidTokenError,
  TokenExpiredError,
} from '../utils/errors.js';
import {
  findUserByEmail,
  findUserByEmailWithCredentials,
  findUserById,
  createUserWithPassword,
  createOAuthUser,
  findOAuthAccount,
  linkOAuthAccount,
  createSession,
  findSessionByToken,
  deleteSession,
  deleteAllUserSessions,
  updateLastLogin,
  incrementFailedAttempts,
  resetFailedAttempts,
  lockCredentials,
  setPasswordResetToken,
  findUserByResetTokenHash,
  consumePasswordReset,
  type SafeUser,
} from '../repositories/auth.repository.js';
import { sendPasswordResetEmail } from './email.service.js';
import { ensurePlatformUserAsync } from './user.service.js';
import type { JwtPayload } from '../api/middleware/auth.js';

// =============================================================================
// Auth Service
// =============================================================================
// Business logic for registration, login, Google SSO, token management.
// =============================================================================

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 30;
const GOOGLE_PROVIDER = 'google';

// ---------------------------------------------------------------------------
// Google OAuth Client (lazy-init)
// ---------------------------------------------------------------------------

let _googleClient: OAuth2Client | null = null;

const getGoogleClient = (): OAuth2Client => {
  if (!_googleClient) {
    _googleClient = new OAuth2Client(config.google.clientId);
  }
  return _googleClient;
};

// ---------------------------------------------------------------------------
// Token Helpers
// ---------------------------------------------------------------------------

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Generate a JWT access token bound to a specific session.
 */
export const generateAccessToken = (user: SafeUser, sessionId: string): string => {
  const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
    sub: user.id,
    email: user.email,
    role: user.role,
    type: 'access',
    sid: sessionId,
  };

  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn as StringValue,
  });
};

/**
 * Generate a JWT refresh token bound to a specific session.
 */
export const generateRefreshToken = (user: SafeUser, sessionId: string): string => {
  const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
    sub: user.id,
    email: user.email,
    role: user.role,
    type: 'refresh',
    sid: sessionId,
  };

  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.refreshExpiresIn as StringValue,
  });
};

/**
 * Generate both access and refresh tokens for a user, both bound to the same session.
 */
const generateTokenPair = (user: SafeUser, sessionId: string): TokenPair => {
  return {
    accessToken: generateAccessToken(user, sessionId),
    refreshToken: generateRefreshToken(user, sessionId),
  };
};

/**
 * Verify and decode a JWT (any type).
 */
export const verifyToken = (token: string): JwtPayload => {
  try {
    return jwt.verify(token, config.jwt.secret) as JwtPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new TokenExpiredError('Token has expired');
    }
    throw new InvalidTokenError('Invalid token');
  }
};

/**
 * Parse a duration string (e.g. "30d") to milliseconds.
 */
const parseDurationMs = (duration: string): number => {
  const match = /^(\d+)([smhd])$/.exec(duration);
  if (!match) return 30 * 24 * 60 * 60 * 1000; // default 30 days

  const value = parseInt(match[1] as string, 10);
  switch (match[2]) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return 30 * 24 * 60 * 60 * 1000;
  }
};

// =============================================================================
// Register
// =============================================================================

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

export interface AuthResult {
  user: SafeUser;
  tokens: TokenPair;
}

/**
 * Register a new user with email/password.
 *
 * Single-session policy: brand-new accounts have no prior sessions, so we just
 * create the first one. (No need to delete — there's nothing to delete.)
 */
export const register = async (input: RegisterInput): Promise<AuthResult> => {
  const { email, password, firstName, lastName, ipAddress, userAgent } = input;

  // Check if email is already taken
  const existing = await findUserByEmail(email);
  if (existing) {
    throw new ConflictError('An account with this email already exists');
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, config.security.bcryptRounds);

  // Create user + credentials
  const user = await createUserWithPassword({
    email,
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    passwordHash,
  });

  logger.info({ userId: user.id, email: user.email }, 'New user registered');

  // Pre-create the trading-platform (YPF) user. Fire-and-forget + gated — never
  // blocks or fails registration (see ensurePlatformUserAsync).
  ensurePlatformUserAsync(user.id);

  // Mint a session ID up-front so it can be embedded in tokens AND used as the
  // Session row's PK. This keeps token.sid === Session.id, which is how the
  // authenticate middleware enforces single-session-per-user.
  const sessionId = randomUUID();
  const tokens = generateTokenPair(user, sessionId);

  const refreshExpiresAt = new Date(
    Date.now() + parseDurationMs(config.jwt.refreshExpiresIn)
  );

  await createSession({
    id: sessionId,
    userId: user.id,
    token: tokens.refreshToken,
    ipAddress: ipAddress ?? null,
    userAgent: userAgent ?? null,
    expiresAt: refreshExpiresAt,
  });

  return { user, tokens };
};

// =============================================================================
// Login (email + password)
// =============================================================================

export interface LoginInput {
  email: string;
  password: string;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

/**
 * Authenticate a user with email and password.
 */
export const login = async (input: LoginInput): Promise<AuthResult> => {
  const { email, password, ipAddress, userAgent } = input;

  // Find user with credentials
  const user = await findUserByEmailWithCredentials(email);

  if (!user || !user.credentials) {
    throw new AuthenticationError('Invalid email or password');
  }

  // Account exists but has no password set (OAuth-only signup, or in the middle
  // of a first-password-set flow). Tell them to use the SSO they signed up with.
  if (!user.credentials.passwordHash) {
    throw new AuthenticationError(
      'This account uses Google Sign-In. Please continue with Google.'
    );
  }

  // Check account status
  if (user.status === UserStatus.BANNED) {
    throw new AuthenticationError('This account has been banned');
  }
  if (user.status === UserStatus.SUSPENDED) {
    throw new AuthenticationError('This account has been suspended');
  }

  // Check lockout
  if (user.credentials.lockedUntil && user.credentials.lockedUntil > new Date()) {
    const minutesLeft = Math.ceil(
      (user.credentials.lockedUntil.getTime() - Date.now()) / 60000
    );
    throw new AuthenticationError(
      `Account is temporarily locked. Try again in ${minutesLeft} minute(s).`
    );
  }

  // Verify password
  const isValidPassword = await bcrypt.compare(password, user.credentials.passwordHash);

  if (!isValidPassword) {
    // Increment failed attempts
    const attempts = await incrementFailedAttempts(user.id);

    if (attempts >= MAX_FAILED_ATTEMPTS) {
      const lockUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
      await lockCredentials(user.id, lockUntil);
      logger.warn({ userId: user.id, attempts }, 'Account locked due to failed attempts');
      throw new AuthenticationError(
        `Too many failed attempts. Account locked for ${LOCKOUT_MINUTES} minutes.`
      );
    }

    throw new AuthenticationError('Invalid email or password');
  }

  // Successful login – reset failed attempts
  await resetFailedAttempts(user.id);

  // Update last login
  await updateLastLogin(user.id, ipAddress);

  // Build safe user (strip credentials)
  const safeUser: SafeUser = {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    platformUserId: user.platformUserId,
    role: user.role,
    status: user.status,
    kycStatus: user.kycStatus,
    emailVerified: user.emailVerified,
    emailVerifiedAt: user.emailVerifiedAt,
    lastLoginAt: new Date(),
    lastLoginIp: ipAddress ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };

  // Single-session-per-user: kick every prior session before issuing tokens.
  // Any browser/tab still holding the old access token will 401 on its next
  // authenticated request (authenticate middleware looks up Session by sid).
  const evicted = await deleteAllUserSessions(user.id);
  if (evicted > 0) {
    logger.info({ userId: user.id, evicted }, 'Prior sessions evicted on new login');
  }

  // Mint session ID up-front so it can be embedded in tokens AND used as the
  // Session row's PK.
  const sessionId = randomUUID();
  const tokens = generateTokenPair(safeUser, sessionId);

  const refreshExpiresAt = new Date(
    Date.now() + parseDurationMs(config.jwt.refreshExpiresIn)
  );

  await createSession({
    id: sessionId,
    userId: user.id,
    token: tokens.refreshToken,
    ipAddress: ipAddress ?? null,
    userAgent: userAgent ?? null,
    expiresAt: refreshExpiresAt,
  });

  logger.info({ userId: user.id }, 'User logged in');

  return { user: safeUser, tokens };
};

// =============================================================================
// Google SSO
// =============================================================================

export interface GoogleAuthInput {
  idToken: string;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

/**
 * Authenticate or register a user via Google ID token.
 *
 * Flow:
 * 1. Verify the Google ID token
 * 2. If an OAuthAccount already exists for this Google sub → log in
 * 3. If the email exists but no OAuth link → link Google account to existing user
 * 4. Otherwise → create a new user with Google as the provider
 */
export const googleAuth = async (input: GoogleAuthInput): Promise<AuthResult> => {
  const { idToken, ipAddress, userAgent } = input;

  // 1. Verify with Google
  const client = getGoogleClient();
  let googlePayload;

  try {
    const clientId = config.google.clientId;
    if (!clientId) {
      throw new Error('Google Client ID not configured');
    }

    const ticket = await client.verifyIdToken({
      idToken,
      audience: clientId,
    });
    googlePayload = ticket.getPayload();
  } catch (err) {
    if (err instanceof AuthenticationError) throw err;
    throw new AuthenticationError('Invalid Google ID token');
  }

  if (!googlePayload || !googlePayload.email) {
    throw new AuthenticationError('Google token does not contain an email');
  }

  if (googlePayload.email_verified === false) {
    throw new AuthenticationError('Google email is not verified');
  }

  const googleEmail = googlePayload.email;
  const googleSub = googlePayload.sub;
  const googleFirstName = googlePayload.given_name || googlePayload.name?.split(' ')[0] || '';
  const googleLastName = googlePayload.family_name || googlePayload.name?.split(' ').slice(1).join(' ') || '';

  // 2. Check if this Google account is already linked
  const existingOAuth = await findOAuthAccount(GOOGLE_PROVIDER, googleSub);

  let user: SafeUser;

  if (existingOAuth) {
    // Google account already linked — log in
    user = existingOAuth.user;

    // Check account status
    if (user.status === UserStatus.BANNED) {
      throw new AuthenticationError('This account has been banned');
    }
    if (user.status === UserStatus.SUSPENDED) {
      throw new AuthenticationError('This account has been suspended');
    }
  } else {
    // 3. Check if a user with this email already exists
    const existingUser = await findUserByEmail(googleEmail);

    if (existingUser) {
      // Link Google to existing account
      await linkOAuthAccount(existingUser.id, GOOGLE_PROVIDER, googleSub);
      user = existingUser;

      logger.info(
        { userId: user.id, provider: GOOGLE_PROVIDER },
        'Google account linked to existing user'
      );
    } else {
      // 4. Create new user via Google
      user = await createOAuthUser({
        email: googleEmail,
        firstName: googleFirstName,
        lastName: googleLastName,
        provider: GOOGLE_PROVIDER,
        providerId: googleSub,
      });

      logger.info(
        { userId: user.id, email: googleEmail },
        'New user registered via Google SSO'
      );

      // Pre-create the trading-platform (YPF) user for genuinely new signups
      // only. Fire-and-forget + gated — never blocks or fails auth.
      ensurePlatformUserAsync(user.id);
    }
  }

  // Update last login
  await updateLastLogin(user.id, ipAddress);

  // Single-session-per-user: kick every prior session before issuing tokens.
  const evicted = await deleteAllUserSessions(user.id);
  if (evicted > 0) {
    logger.info(
      { userId: user.id, evicted, provider: GOOGLE_PROVIDER },
      'Prior sessions evicted on new login'
    );
  }

  // Mint session ID up-front (used as both the Session row PK and the sid claim).
  const sessionId = randomUUID();
  const tokens = generateTokenPair(user, sessionId);

  const refreshExpiresAt = new Date(
    Date.now() + parseDurationMs(config.jwt.refreshExpiresIn)
  );

  await createSession({
    id: sessionId,
    userId: user.id,
    token: tokens.refreshToken,
    ipAddress: ipAddress ?? null,
    userAgent: userAgent ?? null,
    expiresAt: refreshExpiresAt,
  });

  logger.info({ userId: user.id, provider: GOOGLE_PROVIDER }, 'User authenticated via Google');

  return { user, tokens };
};

// =============================================================================
// Token Refresh
// =============================================================================

/**
 * Issue a new access token using a valid refresh token.
 *
 * The new access token carries the same `sid` as the refresh token, so
 * authenticated requests continue to be tied to the same Session row. If that
 * row has been deleted (e.g., the user logged in elsewhere), this throws.
 */
export const refreshAccessToken = async (
  refreshToken: string
): Promise<{ accessToken: string; user: SafeUser }> => {
  // Verify the refresh token
  const decoded = verifyToken(refreshToken);

  if (decoded.type !== 'refresh') {
    throw new InvalidTokenError('Expected a refresh token');
  }

  if (!decoded.sid) {
    throw new InvalidTokenError('Refresh token is missing a session identifier');
  }

  // Check that the session still exists in the database. We look up by token
  // (existing behavior) and additionally confirm the row's id matches the sid
  // claim — guards against a token reuse where the row was replaced.
  const session = await findSessionByToken(refreshToken);
  if (!session || session.id !== decoded.sid) {
    throw new UnauthorizedError('Session has been revoked');
  }

  // Check session expiry
  if (session.expiresAt < new Date()) {
    await deleteSession(refreshToken);
    throw new TokenExpiredError('Refresh token has expired');
  }

  // Fetch the latest user data
  const user = await findUserById(decoded.sub);
  if (!user) {
    throw new UnauthorizedError('User not found');
  }

  if (user.status === UserStatus.BANNED || user.status === UserStatus.SUSPENDED) {
    await deleteSession(refreshToken);
    throw new AuthenticationError('Account is no longer active');
  }

  // Issue new access token with fresh user data, bound to the same session.
  const accessToken = generateAccessToken(user, session.id);

  return { accessToken, user };
};

// =============================================================================
// Logout
// =============================================================================

/**
 * Invalidate the session associated with the given refresh token.
 */
export const logout = async (refreshToken: string): Promise<void> => {
  await deleteSession(refreshToken);
  logger.debug('Session invalidated');
};

// =============================================================================
// Get Current User
// =============================================================================

/**
 * Fetch the current authenticated user's profile.
 */
export const getMe = async (userId: string): Promise<SafeUser> => {
  const user = await findUserById(userId);

  if (!user) {
    throw new UnauthorizedError('User not found');
  }

  return user;
};

// =============================================================================
// Password Reset
// =============================================================================
//
// Two-step flow with the email channel as the proof of identity:
//   1. requestPasswordReset(email) — mints a token, hashes it, persists the
//      hash on UserCredential, emails the RAW token in a one-time link.
//   2. resetPassword(token, newPassword) — re-hashes the incoming token,
//      looks it up, swaps the password, evicts all sessions.
//
// Security choices:
//   • The DB only ever stores SHA-256(token). If the DB leaks, the raw token
//     is not recoverable, so attackers can't use leaked rows for ATO.
//   • requestPasswordReset returns void unconditionally — the route never
//     branches on whether the user existed, preventing email enumeration.
//   • OAuth-only users (no passwordHash) are supported too: this becomes a
//     "set your password" flow. setPasswordResetToken upserts the credentials
//     row so we have somewhere to stash the token hash.
// =============================================================================

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 60 minutes
const RESET_TOKEN_BYTES = 32;

const hashResetToken = (rawToken: string): string =>
  createHash('sha256').update(rawToken).digest('hex');

const generateResetToken = (): string =>
  randomBytes(RESET_TOKEN_BYTES).toString('base64url');

export interface RequestPasswordResetInput {
  email: string;
}

/**
 * Initiate a password reset. Always resolves successfully — the caller must
 * not branch on whether the email exists. If the email maps to a user, an
 * email is sent (or attempted; failures are swallowed and logged).
 */
export const requestPasswordReset = async (
  input: RequestPasswordResetInput
): Promise<void> => {
  const email = input.email.toLowerCase();
  const user = await findUserByEmailWithCredentials(email);

  if (!user) {
    // No user — silently no-op to avoid enumeration.
    logger.info({ email }, 'Password reset requested for unknown email');
    return;
  }

  if (user.status === UserStatus.BANNED || user.status === UserStatus.SUSPENDED) {
    // Don't help non-active accounts recover access.
    logger.info(
      { userId: user.id, status: user.status },
      'Password reset blocked for non-active account'
    );
    return;
  }

  const rawToken = generateResetToken();
  const tokenHash = hashResetToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  await setPasswordResetToken(user.id, tokenHash, expiresAt);

  const isFirstPasswordSet = !user.credentials || !user.credentials.passwordHash;

  try {
    await sendPasswordResetEmail(
      { email: user.email, firstName: user.firstName },
      rawToken,
      isFirstPasswordSet
    );
    logger.info({ userId: user.id, isFirstPasswordSet }, 'Password reset email dispatched');
  } catch (err) {
    // Don't propagate — caller MUST return a generic success to the client.
    logger.error({ err, userId: user.id }, 'Failed to send password reset email');
  }
};

export interface ResetPasswordInput {
  token: string;
  newPassword: string;
}

/**
 * Complete a password reset. Verifies the token, swaps the password, and
 * evicts every existing session (kicks any open tabs / attackers).
 *
 * Throws BadRequestError for any token failure — the message is intentionally
 * generic so we don't leak which check failed.
 */
export const resetPassword = async (input: ResetPasswordInput): Promise<void> => {
  const { token, newPassword } = input;

  const tokenHash = hashResetToken(token);
  const found = await findUserByResetTokenHash(tokenHash);

  if (!found || !found.credentials.resetTokenExpiry) {
    throw new BadRequestError('This password reset link is invalid or has expired');
  }

  if (found.credentials.resetTokenExpiry < new Date()) {
    throw new BadRequestError('This password reset link is invalid or has expired');
  }

  if (found.status === UserStatus.BANNED || found.status === UserStatus.SUSPENDED) {
    throw new AuthenticationError('This account is no longer active');
  }

  const newHash = await bcrypt.hash(newPassword, config.security.bcryptRounds);

  await consumePasswordReset(found.id, newHash);

  // Kick every active session — if an attacker was riding an old session, this
  // boots them. Also evicts the user's other tabs, prompting a fresh login.
  const evicted = await deleteAllUserSessions(found.id);

  logger.info(
    { userId: found.id, evictedSessions: evicted },
    'Password reset completed'
  );
};
