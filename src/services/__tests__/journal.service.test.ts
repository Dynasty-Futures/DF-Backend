import { getEntry, saveEntry } from '../journal.service';
import { NotFoundError, ForbiddenError, ValidationError } from '../../utils/errors';

// =============================================================================
// Mocks
// =============================================================================

const mockAccountFindFirst = jest.fn();

jest.mock('../../utils/database', () => ({
  prisma: {
    account: {
      findFirst: (...args: unknown[]) => mockAccountFindFirst(...args),
    },
  },
}));

const mockFindEntry = jest.fn();
const mockUpsertEntry = jest.fn();
const mockDeleteEntry = jest.fn();

jest.mock('../../repositories/index', () => ({
  journalRepository: {
    findEntry: (...args: unknown[]) => mockFindEntry(...args),
    upsertEntry: (...args: unknown[]) => mockUpsertEntry(...args),
    deleteEntry: (...args: unknown[]) => mockDeleteEntry(...args),
  },
}));

// =============================================================================
// Helpers
// =============================================================================

const USER = 'user-1';
const ACCOUNT = 'acc-1';
const DATE = '2026-06-25';

beforeEach(() => {
  jest.clearAllMocks();
  mockAccountFindFirst.mockResolvedValue({ userId: USER });
});

// =============================================================================
// getEntry
// =============================================================================

describe('journalService.getEntry', () => {
  it('returns the saved content for an owned account', async () => {
    mockFindEntry.mockResolvedValue({ content: 'my notes' });
    const result = await getEntry(USER, ACCOUNT, DATE);
    expect(result).toEqual({ accountId: ACCOUNT, date: DATE, content: 'my notes' });
    // Date passed to the repo is pinned to UTC midnight.
    expect(mockFindEntry).toHaveBeenCalledWith(ACCOUNT, new Date('2026-06-25T00:00:00.000Z'));
  });

  it('returns empty content when no entry exists yet', async () => {
    mockFindEntry.mockResolvedValue(null);
    const result = await getEntry(USER, ACCOUNT, DATE);
    expect(result.content).toBe('');
  });

  it('throws NotFound when the account does not exist', async () => {
    mockAccountFindFirst.mockResolvedValue(null);
    await expect(getEntry(USER, ACCOUNT, DATE)).rejects.toThrow(NotFoundError);
    expect(mockFindEntry).not.toHaveBeenCalled();
  });

  it('throws Forbidden when the account belongs to another user', async () => {
    mockAccountFindFirst.mockResolvedValue({ userId: 'someone-else' });
    await expect(getEntry(USER, ACCOUNT, DATE)).rejects.toThrow(ForbiddenError);
    expect(mockFindEntry).not.toHaveBeenCalled();
  });

  it('rejects a malformed date with ValidationError', async () => {
    await expect(getEntry(USER, ACCOUNT, '06/25/2026')).rejects.toThrow(ValidationError);
  });
});

// =============================================================================
// saveEntry
// =============================================================================

describe('journalService.saveEntry', () => {
  it('upserts non-empty content', async () => {
    mockUpsertEntry.mockResolvedValue({ content: 'today was good' });
    const result = await saveEntry(USER, ACCOUNT, DATE, 'today was good');
    expect(result.content).toBe('today was good');
    expect(mockUpsertEntry).toHaveBeenCalledWith(
      USER,
      ACCOUNT,
      new Date('2026-06-25T00:00:00.000Z'),
      'today was good',
    );
    expect(mockDeleteEntry).not.toHaveBeenCalled();
  });

  it('deletes the entry when content is blank/whitespace', async () => {
    const result = await saveEntry(USER, ACCOUNT, DATE, '   ');
    expect(result.content).toBe('');
    expect(mockDeleteEntry).toHaveBeenCalledWith(ACCOUNT, new Date('2026-06-25T00:00:00.000Z'));
    expect(mockUpsertEntry).not.toHaveBeenCalled();
  });

  it('enforces ownership before writing', async () => {
    mockAccountFindFirst.mockResolvedValue({ userId: 'someone-else' });
    await expect(saveEntry(USER, ACCOUNT, DATE, 'x')).rejects.toThrow(ForbiddenError);
    expect(mockUpsertEntry).not.toHaveBeenCalled();
    expect(mockDeleteEntry).not.toHaveBeenCalled();
  });

  it('rejects content over the length cap', async () => {
    const huge = 'a'.repeat(20_001);
    await expect(saveEntry(USER, ACCOUNT, DATE, huge)).rejects.toThrow(ValidationError);
    expect(mockUpsertEntry).not.toHaveBeenCalled();
  });
});
