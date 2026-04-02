import { UserRole, UserStatus } from '@prisma/client';
import { prisma } from '../utils/database.js';
import { logger } from '../utils/logger.js';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
  PlatformError,
} from '../utils/errors.js';
import {
  getUsers,
  getUserById,
  updateUserProfile,
  adminUpdateUser,
  softDeleteUser,
  getUserStats,
  type UserFilters,
  type UserPaginationOptions,
  type PaginatedResult,
  type UpdateUserProfileData,
} from '../repositories/user.repository.js';
import type { SafeUser } from '../repositories/auth.repository.js';
import { getTradingPlatformProvider } from '../providers/index.js';
import type {
  PlatformUserResult,
  PlatformUserCreateResult,
  PlatformInviteResult,
} from '../providers/types.js';

// =============================================================================
// User Service
// =============================================================================
// Business logic for user management: listing, profile updates, admin actions.
// =============================================================================

// =============================================================================
// List / Get
// =============================================================================

/**
 * List users (admin only).
 */
export const listUsers = async (
  filters: UserFilters = {},
  pagination: UserPaginationOptions = { page: 1, limit: 20 }
): Promise<PaginatedResult<SafeUser>> => {
  return getUsers(filters, pagination);
};

/**
 * Get a user by ID.
 * If the requester is not an admin, they may only fetch their own profile.
 */
export const getUser = async (
  targetUserId: string,
  requesterId: string,
  requesterRole: UserRole
): Promise<SafeUser> => {
  // Non-admins can only view themselves
  if (requesterRole !== UserRole.ADMIN && targetUserId !== requesterId) {
    throw new ForbiddenError('You can only view your own profile');
  }

  const user = await getUserById(targetUserId);
  if (!user) {
    throw new NotFoundError(`User ${targetUserId} not found`);
  }

  return user;
};

// =============================================================================
// Self-Service Profile Update
// =============================================================================

/**
 * Update a user's own profile (firstName, lastName, phone).
 */
export const updateProfile = async (
  userId: string,
  data: UpdateUserProfileData
): Promise<SafeUser> => {
  // Validate at least one field is being updated
  if (
    data.firstName === undefined &&
    data.lastName === undefined &&
    data.phone === undefined
  ) {
    throw new ValidationError('No fields to update');
  }

  const user = await updateUserProfile(userId, data);
  if (!user) {
    throw new NotFoundError(`User ${userId} not found`);
  }

  logger.info({ userId, fields: Object.keys(data) }, 'User profile updated');

  return user;
};

// =============================================================================
// Admin: Role Change
// =============================================================================

/**
 * Change a user's role (admin only).
 */
export const changeUserRole = async (
  targetUserId: string,
  newRole: UserRole,
  adminId: string
): Promise<SafeUser> => {
  const target = await getUserById(targetUserId);
  if (!target) {
    throw new NotFoundError(`User ${targetUserId} not found`);
  }

  // Prevent admins from demoting themselves
  if (targetUserId === adminId && newRole !== UserRole.ADMIN) {
    throw new ForbiddenError('You cannot change your own role');
  }

  if (target.role === newRole) {
    throw new ValidationError(`User already has the ${newRole} role`);
  }

  const updated = await adminUpdateUser(targetUserId, { role: newRole });
  if (!updated) {
    throw new NotFoundError(`User ${targetUserId} not found`);
  }

  logger.info(
    {
      targetUserId,
      previousRole: target.role,
      newRole,
      adminId,
    },
    'User role changed by admin'
  );

  return updated;
};

// =============================================================================
// Admin: Status Change
// =============================================================================

/**
 * Change a user's status (admin only).
 */
export const changeUserStatus = async (
  targetUserId: string,
  newStatus: UserStatus,
  adminId: string
): Promise<SafeUser> => {
  const target = await getUserById(targetUserId);
  if (!target) {
    throw new NotFoundError(`User ${targetUserId} not found`);
  }

  // Prevent admins from suspending/banning themselves
  if (
    targetUserId === adminId &&
    (newStatus === UserStatus.SUSPENDED || newStatus === UserStatus.BANNED)
  ) {
    throw new ForbiddenError('You cannot suspend or ban yourself');
  }

  if (target.status === newStatus) {
    throw new ValidationError(`User already has the ${newStatus} status`);
  }

  const updated = await adminUpdateUser(targetUserId, { status: newStatus });
  if (!updated) {
    throw new NotFoundError(`User ${targetUserId} not found`);
  }

  logger.info(
    {
      targetUserId,
      previousStatus: target.status,
      newStatus,
      adminId,
    },
    'User status changed by admin'
  );

  return updated;
};

// =============================================================================
// Admin: Update User (general)
// =============================================================================

/**
 * Admin: update any user fields (profile + role + status).
 */
export const adminUpdate = async (
  targetUserId: string,
  data: {
    firstName?: string | undefined;
    lastName?: string | undefined;
    phone?: string | null | undefined;
    role?: UserRole | undefined;
    status?: UserStatus | undefined;
  },
  adminId: string
): Promise<SafeUser> => {
  const target = await getUserById(targetUserId);
  if (!target) {
    throw new NotFoundError(`User ${targetUserId} not found`);
  }

  // Safety checks when modifying own account
  if (targetUserId === adminId) {
    if (data.role !== undefined && data.role !== UserRole.ADMIN) {
      throw new ForbiddenError('You cannot change your own role');
    }
    if (
      data.status !== undefined &&
      (data.status === UserStatus.SUSPENDED || data.status === UserStatus.BANNED)
    ) {
      throw new ForbiddenError('You cannot suspend or ban yourself');
    }
  }

  const updated = await adminUpdateUser(targetUserId, data);
  if (!updated) {
    throw new NotFoundError(`User ${targetUserId} not found`);
  }

  logger.info(
    {
      targetUserId,
      updates: Object.keys(data),
      adminId,
    },
    'User updated by admin'
  );

  return updated;
};

// =============================================================================
// Admin: Delete User (soft)
// =============================================================================

/**
 * Soft-delete a user (admin only).
 */
export const deleteUser = async (
  targetUserId: string,
  adminId: string
): Promise<void> => {
  if (targetUserId === adminId) {
    throw new ForbiddenError('You cannot delete your own account');
  }

  const result = await softDeleteUser(targetUserId);
  if (!result) {
    throw new NotFoundError(`User ${targetUserId} not found`);
  }

  logger.info({ targetUserId, adminId }, 'User soft-deleted by admin');
};

// =============================================================================
// Stats
// =============================================================================

/**
 * Get user statistics (admin dashboard).
 */
export const getStatistics = async () => {
  return getUserStats();
};

// =============================================================================
// Platform User Operations
// =============================================================================

/**
 * Create the user on the external trading platform and link the returned
 * `platformUserId` to the local User row.
 *
 * Throws ConflictError if the user is already linked.
 */
export const createPlatformUser = async (
  userId: string,
): Promise<PlatformUserCreateResult> => {
  const user = await prisma.user.findUnique({
    where: { id: userId, deletedAt: null },
  });
  if (!user) throw new NotFoundError(`User ${userId} not found`);

  if (user.platformUserId) {
    throw new ConflictError('User is already linked to a trading platform');
  }

  const provider = getTradingPlatformProvider();

  const result = await provider.createUser({
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    country: 'US',
    phone: user.phone ?? undefined,
    externalId: user.id,
  });

  await prisma.user.update({
    where: { id: userId },
    data: { platformUserId: result.platformUserId },
  });

  logger.info(
    { userId, platformUserId: result.platformUserId },
    'User created on trading platform',
  );

  return result;
};

/**
 * Fetch the user's profile from the external trading platform.
 */
export const getPlatformUser = async (
  userId: string,
): Promise<PlatformUserResult> => {
  const user = await prisma.user.findUnique({
    where: { id: userId, deletedAt: null },
  });
  if (!user) throw new NotFoundError(`User ${userId} not found`);

  if (!user.platformUserId) {
    throw new PlatformError(
      'User is not linked to a trading platform',
      {},
      400,
    );
  }

  const provider = getTradingPlatformProvider();
  return provider.getUser(user.platformUserId);
};

/**
 * Push the local user profile to the trading platform (one-way sync outward).
 * Useful after a local profile update to keep the platform in sync.
 */
export const syncUserToPlatform = async (
  userId: string,
): Promise<PlatformUserCreateResult> => {
  const user = await prisma.user.findUnique({
    where: { id: userId, deletedAt: null },
  });
  if (!user) throw new NotFoundError(`User ${userId} not found`);

  if (!user.platformUserId) {
    throw new PlatformError(
      'User is not linked to a trading platform',
      {},
      400,
    );
  }

  const provider = getTradingPlatformProvider();

  const result = await provider.updateUser(user.platformUserId, {
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone ?? undefined,
  });

  logger.info(
    { userId, platformUserId: user.platformUserId },
    'User profile synced to trading platform',
  );

  return result;
};

/**
 * Invite the user to the trading platform organization. Creates a platform
 * user record and returns an invitation URL that the user must visit to
 * accept. Also links the `platformUserId` locally.
 */
export const invitePlatformUser = async (
  userId: string,
): Promise<PlatformInviteResult> => {
  const user = await prisma.user.findUnique({
    where: { id: userId, deletedAt: null },
  });
  if (!user) throw new NotFoundError(`User ${userId} not found`);

  if (user.platformUserId) {
    throw new ConflictError('User is already linked to a trading platform');
  }

  const provider = getTradingPlatformProvider();

  const result = await provider.inviteUser({
    country: 'US',
    email: user.email,
    externalId: user.id,
  });

  if (result.platformUserId) {
    await prisma.user.update({
      where: { id: userId },
      data: { platformUserId: result.platformUserId },
    });
  }

  logger.info(
    { userId, platformUserId: result.platformUserId, status: result.status },
    'User invited to trading platform',
  );

  return result;
};

/**
 * Unlink a user from the trading platform by clearing platformUserId.
 * Does NOT delete the user on the platform side.
 */
export const unlinkPlatformUser = async (
  userId: string,
  adminId: string,
): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { id: userId, deletedAt: null },
  });
  if (!user) throw new NotFoundError(`User ${userId} not found`);

  if (!user.platformUserId) {
    throw new ValidationError('User is not linked to a trading platform');
  }

  await prisma.user.update({
    where: { id: userId },
    data: { platformUserId: null },
  });

  logger.info(
    { userId, adminId, previousPlatformUserId: user.platformUserId },
    'User unlinked from trading platform',
  );
};
