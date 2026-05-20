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
import type { PlatformUserResult } from '../providers/types.js';

// =============================================================================
// User Service
// =============================================================================
// Business logic for user management: listing, profile updates, admin actions.
// =============================================================================

// =============================================================================
// List / Get
// =============================================================================

export const listUsers = async (
  filters: UserFilters = {},
  pagination: UserPaginationOptions = { page: 1, limit: 20 },
): Promise<PaginatedResult<SafeUser>> => {
  return getUsers(filters, pagination);
};

export const getUser = async (
  targetUserId: string,
  requesterId: string,
  requesterRole: UserRole,
): Promise<SafeUser> => {
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

export const updateProfile = async (
  userId: string,
  data: UpdateUserProfileData,
): Promise<SafeUser> => {
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

export const changeUserRole = async (
  targetUserId: string,
  newRole: UserRole,
  adminId: string,
): Promise<SafeUser> => {
  const target = await getUserById(targetUserId);
  if (!target) {
    throw new NotFoundError(`User ${targetUserId} not found`);
  }

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
    { targetUserId, previousRole: target.role, newRole, adminId },
    'User role changed by admin',
  );

  return updated;
};

// =============================================================================
// Admin: Status Change
// =============================================================================

export const changeUserStatus = async (
  targetUserId: string,
  newStatus: UserStatus,
  adminId: string,
): Promise<SafeUser> => {
  const target = await getUserById(targetUserId);
  if (!target) {
    throw new NotFoundError(`User ${targetUserId} not found`);
  }

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
    { targetUserId, previousStatus: target.status, newStatus, adminId },
    'User status changed by admin',
  );

  return updated;
};

// =============================================================================
// Admin: Update User (general)
// =============================================================================

export const adminUpdate = async (
  targetUserId: string,
  data: {
    firstName?: string | undefined;
    lastName?: string | undefined;
    phone?: string | null | undefined;
    role?: UserRole | undefined;
    status?: UserStatus | undefined;
  },
  adminId: string,
): Promise<SafeUser> => {
  const target = await getUserById(targetUserId);
  if (!target) {
    throw new NotFoundError(`User ${targetUserId} not found`);
  }

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
    { targetUserId, updates: Object.keys(data), adminId },
    'User updated by admin',
  );

  return updated;
};

// =============================================================================
// Admin: Delete User (soft)
// =============================================================================

export const deleteUser = async (
  targetUserId: string,
  adminId: string,
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

export const getStatistics = async () => {
  return getUserStats();
};

// =============================================================================
// Platform User Operations
// =============================================================================
// NOTE: YPF v1 does not expose user update or invite endpoints, so the
// previous `syncUserToPlatform` and `invitePlatformUser` methods were removed.
// User profile drift is one-way only now: local → never pushed back to YPF.

export const createPlatformUser = async (
  userId: string,
): Promise<PlatformUserResult> => {
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
