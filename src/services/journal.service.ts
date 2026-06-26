// =============================================================================
// Journal Service
// =============================================================================
// Business logic for trader journal entries. Each entry is scoped to one of the
// trader's own accounts on a given calendar day. Ownership is verified against
// the account before any read/write.
// =============================================================================

import { JournalEntry } from '@prisma/client';
import { prisma } from '../utils/database.js';
import { journalRepository } from '../repositories/index.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors.js';

const MAX_CONTENT_LENGTH = 20_000;

/**
 * Parse a `YYYY-MM-DD` string into a Date pinned to UTC midnight. Throws a
 * ValidationError on malformed input so the route returns 422, not 500.
 */
const parseDateOnly = (date: string): Date => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ValidationError('Invalid date — expected YYYY-MM-DD');
  }
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError('Invalid date — expected YYYY-MM-DD');
  }
  return parsed;
};

/**
 * Verify the account exists and belongs to the user. Mirrors the ownership
 * checks in trading.service.
 */
const assertAccountOwnership = async (accountId: string, userId: string): Promise<void> => {
  const account = await prisma.account.findFirst({
    where: { id: accountId, deletedAt: null },
    select: { userId: true },
  });
  if (!account) throw new NotFoundError('Account not found');
  if (account.userId !== userId) throw new ForbiddenError('Not your account');
};

/**
 * Get the journal entry for an account on a given day. Returns null content
 * (not a 404) when the trader simply hasn't written anything yet.
 */
export const getEntry = async (
  userId: string,
  accountId: string,
  date: string
): Promise<{ accountId: string; date: string; content: string }> => {
  await assertAccountOwnership(accountId, userId);
  const entry = await journalRepository.findEntry(accountId, parseDateOnly(date));
  return { accountId, date, content: entry?.content ?? '' };
};

/**
 * Create/update (or clear) the journal entry for an account on a given day.
 * Blank content deletes the row so empty days don't accumulate.
 */
export const saveEntry = async (
  userId: string,
  accountId: string,
  date: string,
  content: string
): Promise<{ accountId: string; date: string; content: string }> => {
  await assertAccountOwnership(accountId, userId);

  if (content.length > MAX_CONTENT_LENGTH) {
    throw new ValidationError(`Journal entry exceeds ${MAX_CONTENT_LENGTH} characters`);
  }

  const parsedDate = parseDateOnly(date);
  const trimmed = content.trim();

  if (trimmed === '') {
    await journalRepository.deleteEntry(accountId, parsedDate);
    return { accountId, date, content: '' };
  }

  const saved: JournalEntry = await journalRepository.upsertEntry(
    userId,
    accountId,
    parsedDate,
    content
  );
  return { accountId, date, content: saved.content };
};
