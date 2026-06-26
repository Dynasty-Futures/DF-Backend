import { JournalEntry } from '@prisma/client';
import { prisma } from '../utils/database.js';

// =============================================================================
// Journal Repository
// =============================================================================
// One entry per account per calendar day. `date` is stored as a DATE column, so
// callers pass a Date pinned to UTC midnight (see journal.service).
// =============================================================================

/**
 * Fetch the journal entry for an account on a given day, or null if none.
 */
export const findEntry = async (
  accountId: string,
  date: Date
): Promise<JournalEntry | null> => {
  return prisma.journalEntry.findUnique({
    where: { accountId_date: { accountId, date } },
  });
};

/**
 * Create or update the entry for an account on a given day. An empty/whitespace
 * content deletes the entry (handled in the service) — this path only writes.
 */
export const upsertEntry = async (
  userId: string,
  accountId: string,
  date: Date,
  content: string
): Promise<JournalEntry> => {
  return prisma.journalEntry.upsert({
    where: { accountId_date: { accountId, date } },
    create: { userId, accountId, date, content },
    update: { content },
  });
};

/**
 * Delete the entry for an account on a given day (no-op if absent).
 */
export const deleteEntry = async (accountId: string, date: Date): Promise<void> => {
  await prisma.journalEntry.deleteMany({
    where: { accountId, date },
  });
};
