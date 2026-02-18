import { Prisma, AccountStatus } from '@prisma/client';
import { prisma } from '../utils/database.js';
import type { PaginatedResult } from './user.repository.js';

// =============================================================================
// Account Repository
// =============================================================================
// Data-access layer for account management (admin listing, detail views).
// =============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AccountFilters {
  status?: AccountStatus | undefined;
  accountTypeId?: string | undefined;
  userId?: string | undefined;
  search?: string | undefined;
}

export interface AccountPaginationOptions {
  page: number;
  limit: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'currentBalance' | 'status' | 'totalPnl' | 'currentDrawdown' | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
}

const accountInclude = {
  user: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
    },
  },
  accountType: {
    select: {
      id: true,
      name: true,
      displayName: true,
      accountSize: true,
    },
  },
} as const satisfies Prisma.AccountInclude;

export type AccountWithRelations = Prisma.AccountGetPayload<{
  include: typeof accountInclude;
}>;

// =============================================================================
// Queries
// =============================================================================

/**
 * List accounts with filtering and pagination.
 * Includes related user and account type data.
 */
export const getAccounts = async (
  filters: AccountFilters = {},
  pagination: AccountPaginationOptions = { page: 1, limit: 20 }
): Promise<PaginatedResult<AccountWithRelations>> => {
  const { page, limit, sortBy = 'createdAt', sortOrder = 'desc' } = pagination;
  const skip = (page - 1) * limit;

  const where: Prisma.AccountWhereInput = {
    deletedAt: null,
  };

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.accountTypeId) {
    where.accountTypeId = filters.accountTypeId;
  }

  if (filters.userId) {
    where.userId = filters.userId;
  }

  if (filters.search) {
    const term = filters.search.trim();
    where.OR = [
      { id: { contains: term, mode: 'insensitive' } },
      { user: { email: { contains: term, mode: 'insensitive' } } },
      { user: { firstName: { contains: term, mode: 'insensitive' } } },
      { user: { lastName: { contains: term, mode: 'insensitive' } } },
    ];
  }

  const [accounts, total] = await Promise.all([
    prisma.account.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
      include: accountInclude,
    }),
    prisma.account.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    data: accounts,
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
 * Find an account by ID with user and account type relations.
 */
export const getAccountById = async (id: string): Promise<AccountWithRelations | null> => {
  return prisma.account.findUnique({
    where: { id, deletedAt: null },
    include: accountInclude,
  });
};

/**
 * Get account count statistics grouped by status.
 */
export const getAccountStats = async (): Promise<{
  total: number;
  byStatus: Record<string, number>;
}> => {
  const [total, statusCounts] = await Promise.all([
    prisma.account.count({ where: { deletedAt: null } }),
    prisma.account.groupBy({
      by: ['status'],
      where: { deletedAt: null },
      _count: { status: true },
    }),
  ]);

  const byStatus: Record<string, number> = {};
  for (const status of Object.values(AccountStatus)) {
    byStatus[status] = 0;
  }
  for (const item of statusCounts) {
    byStatus[item.status] = item._count.status;
  }

  return { total, byStatus };
};
