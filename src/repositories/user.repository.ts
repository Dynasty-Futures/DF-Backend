import { Prisma, UserRole, UserStatus } from '@prisma/client';
import { prisma } from '../utils/database.js';
import type { SafeUser } from './auth.repository.js';

// =============================================================================
// User Repository
// =============================================================================
// Data-access layer for user management (admin CRUD, profile updates).
// Authentication-specific operations live in auth.repository.ts.
// =============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserFilters {
  role?: UserRole | undefined;
  status?: UserStatus | undefined;
  search?: string | undefined; // search email, firstName, lastName
}

export interface UserPaginationOptions {
  page: number;
  limit: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'email' | 'lastName' | 'role' | 'status' | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export interface UpdateUserProfileData {
  firstName?: string | undefined;
  lastName?: string | undefined;
  phone?: string | null | undefined;
}

export interface AdminUpdateUserData extends UpdateUserProfileData {
  role?: UserRole | undefined;
  status?: UserStatus | undefined;
  emailVerified?: boolean | undefined;
}

// ---------------------------------------------------------------------------
// Select (safe user fields -- no credentials)
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

const safeUserWithCountSelect = {
  ...safeUserSelect,
  _count: { select: { accounts: true } },
} as const satisfies Prisma.UserSelect;

export type SafeUserWithCount = SafeUser & { _count: { accounts: number } };

// =============================================================================
// Queries
// =============================================================================

/**
 * List users with filtering and pagination.
 */
export const getUsers = async (
  filters: UserFilters = {},
  pagination: UserPaginationOptions = { page: 1, limit: 20 }
): Promise<PaginatedResult<SafeUserWithCount>> => {
  const { page, limit, sortBy = 'createdAt', sortOrder = 'desc' } = pagination;
  const skip = (page - 1) * limit;

  // Build where clause
  const where: Prisma.UserWhereInput = {
    deletedAt: null, // exclude soft-deleted users
  };

  if (filters.role) {
    where.role = filters.role;
  }

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.search) {
    const term = filters.search.trim();
    where.OR = [
      { email: { contains: term, mode: 'insensitive' } },
      { firstName: { contains: term, mode: 'insensitive' } },
      { lastName: { contains: term, mode: 'insensitive' } },
    ];
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
      select: safeUserWithCountSelect,
    }),
    prisma.user.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    data: users as SafeUserWithCount[],
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasMore: page < totalPages,
    },
  };
};

/**
 * Find a user by ID (safe fields).
 */
export const getUserById = async (id: string): Promise<SafeUser | null> => {
  return prisma.user.findUnique({
    where: { id, deletedAt: null },
    select: safeUserSelect,
  }) as Promise<SafeUser | null>;
};

/**
 * Update a user's profile (self-service fields only).
 */
export const updateUserProfile = async (
  id: string,
  data: UpdateUserProfileData
): Promise<SafeUser | null> => {
  try {
    const updateData: Prisma.UserUpdateInput = {};

    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.phone !== undefined) updateData.phone = data.phone;

    return await prisma.user.update({
      where: { id, deletedAt: null },
      data: updateData,
      select: safeUserSelect,
    }) as SafeUser;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      return null;
    }
    throw error;
  }
};

/**
 * Admin: update a user (profile, role, status).
 */
export const adminUpdateUser = async (
  id: string,
  data: AdminUpdateUserData
): Promise<SafeUser | null> => {
  try {
    const updateData: Prisma.UserUpdateInput = {};

    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.role !== undefined) updateData.role = data.role;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.emailVerified !== undefined) {
      updateData.emailVerified = data.emailVerified;
      if (data.emailVerified) {
        updateData.emailVerifiedAt = new Date();
      }
    }

    return await prisma.user.update({
      where: { id, deletedAt: null },
      data: updateData,
      select: safeUserSelect,
    }) as SafeUser;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      return null;
    }
    throw error;
  }
};

/**
 * Soft-delete a user.
 */
export const softDeleteUser = async (id: string): Promise<SafeUser | null> => {
  try {
    return await prisma.user.update({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
      select: safeUserSelect,
    }) as SafeUser;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      return null;
    }
    throw error;
  }
};

/**
 * Get user count statistics.
 */
export const getUserStats = async (): Promise<{
  total: number;
  byRole: Record<string, number>;
  byStatus: Record<string, number>;
}> => {
  const [total, roleCounts, statusCounts] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.user.groupBy({
      by: ['role'],
      where: { deletedAt: null },
      _count: { role: true },
    }),
    prisma.user.groupBy({
      by: ['status'],
      where: { deletedAt: null },
      _count: { status: true },
    }),
  ]);

  const byRole: Record<string, number> = {};
  for (const role of Object.values(UserRole)) {
    byRole[role] = 0;
  }
  for (const item of roleCounts) {
    byRole[item.role] = item._count.role;
  }

  const byStatus: Record<string, number> = {};
  for (const status of Object.values(UserStatus)) {
    byStatus[status] = 0;
  }
  for (const item of statusCounts) {
    byStatus[item.status] = item._count.status;
  }

  return { total, byRole, byStatus };
};
