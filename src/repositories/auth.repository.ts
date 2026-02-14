import { Prisma, User, UserCredential, OAuthAccount, Session, UserRole, UserStatus } from '@prisma/client';
import { prisma } from '../utils/database.js';

// =============================================================================
// Auth Repository
// =============================================================================
// Data-access layer for authentication-related tables:
//   users, user_credentials, oauth_accounts, sessions
// =============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Fields returned when fetching a user (no sensitive credential data). */
export type SafeUser = Omit<User, 'deletedAt'>;

/** User with credentials attached (for login verification). */
export type UserWithCredentials = User & {
  credentials: UserCredential | null;
};

/** User with OAuth accounts attached. */
export type UserWithOAuth = User & {
  oauthAccounts: OAuthAccount[];
};

export interface CreateUserData {
  email: string;
  firstName: string;
  lastName: string;
  role?: UserRole;
  status?: UserStatus;
  emailVerified?: boolean;
  emailVerifiedAt?: Date | null;
}

export interface CreateUserWithPasswordData extends CreateUserData {
  passwordHash: string;
}

export interface CreateOAuthUserData extends CreateUserData {
  provider: string;
  providerId: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: Date | null;
}

export interface CreateSessionData {
  userId: string;
  token: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  expiresAt: Date;
}

// ---------------------------------------------------------------------------
// Select sets (keep credential data out of general queries)
// ---------------------------------------------------------------------------

const safeUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
  status: true,
  kycStatus: true,
  emailVerified: true,
  emailVerifiedAt: true,
  lastLoginAt: true,
  lastLoginIp: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.UserSelect;

// =============================================================================
// User Queries
// =============================================================================

/**
 * Find a user by email (safe fields only).
 */
export const findUserByEmail = async (email: string): Promise<SafeUser | null> => {
  return prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: safeUserSelect,
  }) as Promise<SafeUser | null>;
};

/**
 * Find a user by email WITH credentials (for password verification).
 */
export const findUserByEmailWithCredentials = async (
  email: string
): Promise<UserWithCredentials | null> => {
  return prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { credentials: true },
  });
};

/**
 * Find a user by ID (safe fields only).
 */
export const findUserById = async (id: string): Promise<SafeUser | null> => {
  return prisma.user.findUnique({
    where: { id },
    select: safeUserSelect,
  }) as Promise<SafeUser | null>;
};

/**
 * Find a user by ID WITH credentials.
 */
export const findUserByIdWithCredentials = async (
  id: string
): Promise<UserWithCredentials | null> => {
  return prisma.user.findUnique({
    where: { id },
    include: { credentials: true },
  });
};

// =============================================================================
// User Creation
// =============================================================================

/**
 * Create a user with email/password credentials inside a single transaction.
 */
export const createUserWithPassword = async (
  data: CreateUserWithPasswordData
): Promise<SafeUser> => {
  const user = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        email: data.email.toLowerCase(),
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role ?? UserRole.TRADER,
        status: data.status ?? UserStatus.PENDING_VERIFICATION,
        emailVerified: data.emailVerified ?? false,
        ...(data.emailVerifiedAt != null ? { emailVerifiedAt: data.emailVerifiedAt } : {}),
      },
    });

    await tx.userCredential.create({
      data: {
        userId: newUser.id,
        passwordHash: data.passwordHash,
      },
    });

    return newUser;
  });

  // Return safe projection
  return {
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
    lastLoginAt: user.lastLoginAt,
    lastLoginIp: user.lastLoginIp,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
};

/**
 * Create a user via OAuth (e.g. Google) inside a single transaction.
 * Marks email as verified since the OAuth provider has already verified it.
 */
export const createOAuthUser = async (
  data: CreateOAuthUserData
): Promise<SafeUser> => {
  const user = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        email: data.email.toLowerCase(),
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role ?? UserRole.TRADER,
        status: data.status ?? UserStatus.ACTIVE,
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
    });

    await tx.oAuthAccount.create({
      data: {
        userId: newUser.id,
        provider: data.provider,
        providerId: data.providerId,
        accessToken: data.accessToken ?? null,
        refreshToken: data.refreshToken ?? null,
        expiresAt: data.expiresAt ?? null,
      },
    });

    return newUser;
  });

  return {
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
    lastLoginAt: user.lastLoginAt,
    lastLoginIp: user.lastLoginIp,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
};

// =============================================================================
// OAuth Account Queries
// =============================================================================

/**
 * Find an OAuth account by provider + provider ID.
 */
export const findOAuthAccount = async (
  provider: string,
  providerId: string
): Promise<(OAuthAccount & { user: SafeUser }) | null> => {
  const account = await prisma.oAuthAccount.findUnique({
    where: {
      provider_providerId: { provider, providerId },
    },
    include: {
      user: { select: safeUserSelect },
    },
  });

  return account as (OAuthAccount & { user: SafeUser }) | null;
};

/**
 * Link an OAuth provider to an existing user.
 */
export const linkOAuthAccount = async (
  userId: string,
  provider: string,
  providerId: string,
  tokens?: {
    accessToken?: string | null;
    refreshToken?: string | null;
    expiresAt?: Date | null;
  }
): Promise<OAuthAccount> => {
  return prisma.oAuthAccount.create({
    data: {
      userId,
      provider,
      providerId,
      accessToken: tokens?.accessToken ?? null,
      refreshToken: tokens?.refreshToken ?? null,
      expiresAt: tokens?.expiresAt ?? null,
    },
  });
};

// =============================================================================
// Session Management
// =============================================================================

/**
 * Create a new session record.
 */
export const createSession = async (data: CreateSessionData): Promise<Session> => {
  return prisma.session.create({
    data: {
      userId: data.userId,
      token: data.token,
      ipAddress: data.ipAddress ?? null,
      userAgent: data.userAgent ?? null,
      expiresAt: data.expiresAt,
    },
  });
};

/**
 * Find a session by token.
 */
export const findSessionByToken = async (token: string): Promise<Session | null> => {
  return prisma.session.findUnique({
    where: { token },
  });
};

/**
 * Delete a session (logout).
 */
export const deleteSession = async (token: string): Promise<void> => {
  try {
    await prisma.session.delete({
      where: { token },
    });
  } catch (error) {
    // Ignore "record not found" – session may already be deleted
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      return;
    }
    throw error;
  }
};

/**
 * Delete all sessions for a user (e.g. on password change).
 */
export const deleteAllUserSessions = async (userId: string): Promise<number> => {
  const result = await prisma.session.deleteMany({
    where: { userId },
  });
  return result.count;
};

/**
 * Delete expired sessions (cleanup job).
 */
export const deleteExpiredSessions = async (): Promise<number> => {
  const result = await prisma.session.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });
  return result.count;
};

// =============================================================================
// User Updates
// =============================================================================

/**
 * Update the user's last login timestamp and IP address.
 */
export const updateLastLogin = async (
  userId: string,
  ipAddress?: string | null
): Promise<void> => {
  await prisma.user.update({
    where: { id: userId },
    data: {
      lastLoginAt: new Date(),
      lastLoginIp: ipAddress ?? null,
    },
  });
};

/**
 * Increment the failed login attempts counter on credentials.
 */
export const incrementFailedAttempts = async (userId: string): Promise<number> => {
  const cred = await prisma.userCredential.update({
    where: { userId },
    data: {
      failedAttempts: { increment: 1 },
    },
  });
  return cred.failedAttempts;
};

/**
 * Reset failed attempts and clear lockout.
 */
export const resetFailedAttempts = async (userId: string): Promise<void> => {
  await prisma.userCredential.update({
    where: { userId },
    data: {
      failedAttempts: 0,
      lockedUntil: null,
    },
  });
};

/**
 * Lock a user's credentials until a given time.
 */
export const lockCredentials = async (
  userId: string,
  until: Date
): Promise<void> => {
  await prisma.userCredential.update({
    where: { userId },
    data: {
      lockedUntil: until,
    },
  });
};
