import { reconcileRemovedAccounts } from '../ypf-poller.job';
import type { PlatformAccountResult } from '../../providers/types';

// =============================================================================
// Mocks — only ypf-sync is exercised by reconcileRemovedAccounts; the rest are
// stubbed so the module graph loads cleanly.
// =============================================================================

const mockSoftDelete = jest.fn();

jest.mock('../../services/ypf-sync.service', () => ({
  softDeleteRemovedAccount: (...args: unknown[]) => mockSoftDelete(...args),
  isYpfDisabledState: (state: string) =>
    state === 'Disabled' || state === 'disabled',
}));

jest.mock('../../utils/database', () => ({ prisma: {} }));
jest.mock('../../utils/redis', () => ({ getRedisClient: () => null }));
jest.mock('../../providers/index', () => ({ getTradingPlatformProvider: () => ({}) }));
jest.mock('../../services/payout.service', () => ({ syncPayouts: jest.fn() }));
jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// =============================================================================
// Helpers
// =============================================================================

const live = (
  platformAccountId: string,
  status: string,
): PlatformAccountResult =>
  ({ platformAccountId, status }) as PlatformAccountResult;

const localAcct = (id: string, platformAccountId: string | null) => ({
  id,
  platformAccountId,
});

beforeEach(() => jest.clearAllMocks());

// =============================================================================
// reconcileRemovedAccounts
// =============================================================================

describe('reconcileRemovedAccounts', () => {
  it('soft-deletes an account absent from a complete, non-empty sweep (removed upstream)', async () => {
    const map = new Map([['p-keep', live('p-keep', 'Breached')]]);
    await reconcileRemovedAccounts(
      [localAcct('a-keep', 'p-keep'), localAcct('a-gone', 'p-gone')],
      map,
      true,
    );
    expect(mockSoftDelete).toHaveBeenCalledTimes(1);
    expect(mockSoftDelete).toHaveBeenCalledWith('a-gone');
  });

  it('soft-deletes an account YPF reports as Disabled even if present in the map', async () => {
    const map = new Map([['p-dis', live('p-dis', 'Disabled')]]);
    await reconcileRemovedAccounts([localAcct('a-dis', 'p-dis')], map, true);
    expect(mockSoftDelete).toHaveBeenCalledWith('a-dis');
  });

  it('does NOT delete on absence when the sweep was incomplete (API blip guard)', async () => {
    const map = new Map([['p-keep', live('p-keep', 'Active')]]);
    await reconcileRemovedAccounts(
      [localAcct('a-gone', 'p-gone')],
      map,
      false, // a status query failed this poll
    );
    expect(mockSoftDelete).not.toHaveBeenCalled();
  });

  it('does NOT delete on absence when the sweep returned zero accounts', async () => {
    await reconcileRemovedAccounts(
      [localAcct('a-gone', 'p-gone')],
      new Map(),
      true,
    );
    expect(mockSoftDelete).not.toHaveBeenCalled();
  });

  it('keeps accounts present in any swept status (e.g. Upgraded/Inactive)', async () => {
    const map = new Map([
      ['p-up', live('p-up', 'Upgraded')],
      ['p-in', live('p-in', 'Inactive')],
    ]);
    await reconcileRemovedAccounts(
      [localAcct('a-up', 'p-up'), localAcct('a-in', 'p-in')],
      map,
      true,
    );
    expect(mockSoftDelete).not.toHaveBeenCalled();
  });
});
