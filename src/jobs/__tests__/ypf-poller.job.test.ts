import { AccountStatus } from '@prisma/client';
import {
  reconcileRemovedAccounts,
  reconcileReactivatedAccounts,
  reconcileRestoredAccounts,
} from '../ypf-poller.job';
import type { PlatformAccountResult } from '../../providers/types';

// =============================================================================
// Mocks — only ypf-sync / challenge-transition are exercised by the reconcile
// passes; the rest are stubbed so the module graph loads cleanly.
// =============================================================================

const mockSoftDelete = jest.fn();
const mockReactivate = jest.fn();

jest.mock('../../services/ypf-sync.service', () => ({
  softDeleteRemovedAccount: (...args: unknown[]) => mockSoftDelete(...args),
  isYpfDisabledState: (state: string) =>
    state === 'Disabled' || state === 'disabled',
  isYpfActiveState: (state: string) => state === 'Active' || state === 'active',
}));

jest.mock('../../services/challenge-transition.service', () => ({
  reactivateChallenge: (...args: unknown[]) => mockReactivate(...args),
}));

const mockFindMany = jest.fn();
const mockUpdate = jest.fn();

jest.mock('../../utils/database', () => ({
  prisma: {
    account: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));
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

const failedAcct = (id: string, platformAccountId: string | null) => ({
  id,
  platformAccountId,
  status: AccountStatus.FAILED,
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

// =============================================================================
// reconcileReactivatedAccounts
// =============================================================================

describe('reconcileReactivatedAccounts', () => {
  it('reactivates a FAILED account that YPF now reports Active', async () => {
    const map = new Map([['p1', live('p1', 'Active')]]);
    await reconcileReactivatedAccounts([failedAcct('a1', 'p1')], map);
    expect(mockReactivate).toHaveBeenCalledTimes(1);
    expect(mockReactivate).toHaveBeenCalledWith('a1');
  });

  it('does NOT reactivate when YPF still reports the account Breached', async () => {
    const map = new Map([['p1', live('p1', 'Breached')]]);
    await reconcileReactivatedAccounts([failedAcct('a1', 'p1')], map);
    expect(mockReactivate).not.toHaveBeenCalled();
  });

  it('ignores accounts that are not locally failed', async () => {
    const map = new Map([['p1', live('p1', 'Active')]]);
    await reconcileReactivatedAccounts(
      [{ id: 'a1', platformAccountId: 'p1', status: AccountStatus.EVALUATION }],
      map,
    );
    expect(mockReactivate).not.toHaveBeenCalled();
  });

  it('does nothing when the failed account is absent from the live snapshot', async () => {
    await reconcileReactivatedAccounts([failedAcct('a1', 'p1')], new Map());
    expect(mockReactivate).not.toHaveBeenCalled();
  });
});

// =============================================================================
// reconcileRestoredAccounts
// =============================================================================

describe('reconcileRestoredAccounts', () => {
  it('restores a soft-deleted account that YPF still reports (e.g. UpgradePending)', async () => {
    mockFindMany.mockResolvedValue([{ id: 'a1', platformAccountId: 'p1' }]);
    const map = new Map([['p1', live('p1', 'UpgradePending')]]);

    await reconcileRestoredAccounts(map);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'a1' },
        data: expect.objectContaining({
          deletedAt: null,
          status: AccountStatus.EVALUATION,
        }),
      }),
    );
  });

  it('does NOT restore an account YPF reports as Disabled (genuinely removed)', async () => {
    mockFindMany.mockResolvedValue([{ id: 'a1', platformAccountId: 'p1' }]);
    const map = new Map([['p1', live('p1', 'Disabled')]]);

    await reconcileRestoredAccounts(map);

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('does NOT restore an account absent from the live sweep (truly gone)', async () => {
    mockFindMany.mockResolvedValue([{ id: 'a1', platformAccountId: 'p1' }]);

    await reconcileRestoredAccounts(new Map());

    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
