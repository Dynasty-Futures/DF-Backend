import { UserRole, UserStatus } from '@prisma/client';
import { logger } from '../utils/logger.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors.js';
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
