import { logger } from '../utils/logger.js';
import { AccountNotFoundError } from '../utils/errors.js';
import {
  getAccounts,
  getAccountById,
  getAccountStats,
  type AccountFilters,
  type AccountPaginationOptions,
  type AccountWithRelations,
} from '../repositories/account.repository.js';
import type { PaginatedResult } from '../repositories/user.repository.js';

// =============================================================================
// Account Service
// =============================================================================
// Business logic for account management: listing, detail views, statistics.
// =============================================================================

/**
 * List accounts with filtering and pagination (admin only).
 */
export const listAccounts = async (
  filters: AccountFilters = {},
  pagination: AccountPaginationOptions = { page: 1, limit: 20 }
): Promise<PaginatedResult<AccountWithRelations>> => {
  logger.debug({ filters, pagination }, 'Listing accounts');
  return getAccounts(filters, pagination);
};

/**
 * Get a single account by ID.
 */
export const getAccount = async (id: string): Promise<AccountWithRelations> => {
  const account = await getAccountById(id);
  if (!account) {
    throw new AccountNotFoundError(id);
  }
  return account;
};

/**
 * Get account statistics (admin dashboard).
 */
export const getStatistics = async () => {
  return getAccountStats();
};
