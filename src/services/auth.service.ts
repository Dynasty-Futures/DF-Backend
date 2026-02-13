import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import type { StringValue } from 'ms';
import { OAuth2Client } from 'google-auth-library';
import { UserStatus } from '@prisma/client';

import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import {
  AuthenticationError,
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
  updateLastLogin,
  incrementFailedAttempts,
  resetFailedAttempts,
  lockCredentials,
  type SafeUser,
} from '../repositories/auth.repository.js';
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
 * Generate a JWT access token.
 */
export const generateAccessToken = (user: SafeUser): string => {
  const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
    sub: user.id,
    email: user.email,
    role: user.role,
    type: 'access',
  };

  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn as StringValue,
  });
};

/**
 * Generate a JWT refresh token (longer-lived).
 */
export const generateRefreshToken = (user: SafeUser): string => {
  const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
    sub: user.id,
    email: user.email,
    role: user.role,
    type: 'refresh',
  };

  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.refreshExpiresIn as StringValue,
  });
};

/**
 * Generate both access and refresh tokens for a user.
 */
const generateTokenPair = (user: SafeUser): TokenPair => {
  return {
    accessToken: generateAccessToken(user),
    refreshToken: generateRefreshToken(user),
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
}

export interface AuthResult {
  user: SafeUser;
  tokens: TokenPair;
}

/**
 * Register a new user with email/password.
 */
export const register = async (input: RegisterInput): Promise<AuthResult> => {
  const { email, password, firstName, lastName } = input;

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

  // Generate tokens
  const tokens = generateTokenPair(user);

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

  // Generate tokens
  const tokens = generateTokenPair(safeUser);

  // Store refresh token as a session
  const refreshExpiresAt = new Date(
    Date.now() + parseDurationMs(config.jwt.refreshExpiresIn)
  );

  await createSession({
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
    }
  }

  // Update last login
  await updateLastLogin(user.id, ipAddress);

  // Generate tokens
  const tokens = generateTokenPair(user);

  // Store refresh token as session
  const refreshExpiresAt = new Date(
    Date.now() + parseDurationMs(config.jwt.refreshExpiresIn)
  );

  await createSession({
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
 */
export const refreshAccessToken = async (
  refreshToken: string
): Promise<{ accessToken: string; user: SafeUser }> => {
  // Verify the refresh token
  const decoded = verifyToken(refreshToken);

  if (decoded.type !== 'refresh') {
    throw new InvalidTokenError('Expected a refresh token');
  }

  // Check that the session still exists in the database
  const session = await findSessionByToken(refreshToken);
  if (!session) {
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

  // Issue new access token with fresh user data
  const accessToken = generateAccessToken(user);

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
