import { AccountStatus, ChallengePhase } from '@prisma/client';
import { discoverAccounts } from '../account-discovery.service';
import type { PlatformAccountResult } from '../../providers/types';

// =============================================================================
// Mocks
// =============================================================================

const mockAccountFindUnique = jest.fn();
const mockUserFindFirst = jest.fn();
const mockAccountTypeFindFirst = jest.fn();
const mockTransaction = jest.fn();

const mockTxUserUpdate = jest.fn();
const mockTxAccountCreate = jest.fn();
const mockTxChallengeCreate = jest.fn();

jest.mock('../../utils/database', () => ({
  prisma: {
    account: {
      findUnique: (...args: unknown[]) => mockAccountFindUnique(...args),
    },
    user: {
      findFirst: (...args: unknown[]) => mockUserFindFirst(...args),
    },
    accountType: {
      findFirst: (...args: unknown[]) => mockAccountTypeFindFirst(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

const mockListTenantAccounts = jest.fn();

jest.mock('../../providers/index', () => ({
  getTradingPlatformProvider: () => ({
    listTenantAccounts: (...args: unknown[]) => mockListTenantAccounts(...args),
  }),
}));

jest.mock('../../config/index', () => ({
  config: {
    ypf: { discovery: { statuses: ['Active'] } },
  },
}));

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// =============================================================================
// Fixtures
// =============================================================================

const ypfAccount = (
  overrides: Partial<PlatformAccountResult> = {},
): PlatformAccountResult => ({
  platformAccountId: 'ypf-acc-1',
  platformUserId: 'ypf-usr-1',
  programId: 'prog-eval-50k',
  email: 'trader@example.com',
  accountName: 'trader@example.com',
  status: 'Active',
  balance: 50000,
  startingBalance: 50000,
  currency: 'USD',
  nextProgramName: '50k Funded', // has a successor → evaluation phase
  ...overrides,
});

const accountType = {
  id: 'at-1',
  accountSize: 50000,
  ypfProgramId: 'prog-eval-50k',
  challengeRules: [
    {
      phase: ChallengePhase.PHASE_1,
      profitTarget: 8,
      maxDailyLoss: 4,
      maxTotalDrawdown: 10,
      minTradingDays: 3,
    },
    {
      phase: ChallengePhase.FUNDED,
      profitTarget: 0,
      maxDailyLoss: 4,
      maxTotalDrawdown: 10,
      minTradingDays: 0,
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  // Default: nothing linked yet, user + program found, tx invokes its callback.
  mockAccountFindUnique.mockResolvedValue(null);
  mockUserFindFirst.mockResolvedValue({ id: 'user-1', platformUserId: null });
  mockAccountTypeFindFirst.mockResolvedValue(accountType);
  mockTxAccountCreate.mockResolvedValue({ id: 'local-acc-1' });
  mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<void>) =>
    cb({
      user: { update: (...a: unknown[]) => mockTxUserUpdate(...a) },
      account: { create: (...a: unknown[]) => mockTxAccountCreate(...a) },
      challenge: { create: (...a: unknown[]) => mockTxChallengeCreate(...a) },
    }),
  );
});

// =============================================================================
// Tests
// =============================================================================

describe('discoverAccounts', () => {
  it('sweeps tenant accounts using the configured statuses', async () => {
    mockListTenantAccounts.mockResolvedValue([]);
    await discoverAccounts();
    expect(mockListTenantAccounts).toHaveBeenCalledWith('Active');
  });

  it('links a new evaluation account to its DF user and creates a challenge', async () => {
    mockListTenantAccounts.mockResolvedValue([ypfAccount()]);

    const result = await discoverAccounts();

    expect(result.created).toBe(1);
    expect(result.scanned).toBe(1);

    // Account created as EVALUATION, balances from YPF, linked to platform IDs.
    expect(mockTxAccountCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        accountTypeId: 'at-1',
        status: AccountStatus.EVALUATION,
        startingBalance: 50000,
        currentBalance: 50000,
        highWaterMark: 50000,
        platformAccountId: 'ypf-acc-1',
        platformUserId: 'ypf-usr-1',
      }),
    });
    // Challenge copies PHASE_1 rule targets.
    expect(mockTxChallengeCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId: 'local-acc-1',
        phase: ChallengePhase.PHASE_1,
        profitTarget: 8,
        minTradingDays: 3,
      }),
    });
    // Backfills platformUserId on the user (was null).
    expect(mockTxUserUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { platformUserId: 'ypf-usr-1' },
    });
  });

  it('treats an account with no nextProgramName as funded', async () => {
    mockListTenantAccounts.mockResolvedValue([
      ypfAccount({ nextProgramName: undefined }),
    ]);

    const result = await discoverAccounts();

    expect(result.created).toBe(1);
    expect(mockTxAccountCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: AccountStatus.FUNDED,
        fundedAt: expect.any(Date),
      }),
    });
    expect(mockTxChallengeCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ phase: ChallengePhase.FUNDED }),
    });
  });

  it('persists VolumetricaUserId from extraValues when present', async () => {
    mockListTenantAccounts.mockResolvedValue([
      ypfAccount({ extraValues: { VolumetricaUserId: 'vol-123' } }),
    ]);

    await discoverAccounts();

    expect(mockTxAccountCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ volumetricaUserId: 'vol-123' }),
    });
  });

  it('is idempotent — skips accounts already linked locally', async () => {
    mockAccountFindUnique.mockResolvedValue({ id: 'already-here' });
    mockListTenantAccounts.mockResolvedValue([ypfAccount()]);

    const result = await discoverAccounts();

    expect(result.skippedExisting).toBe(1);
    expect(result.created).toBe(0);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('skips accounts with no email', async () => {
    mockListTenantAccounts.mockResolvedValue([ypfAccount({ email: undefined })]);

    const result = await discoverAccounts();

    expect(result.skippedNoEmail).toBe(1);
    expect(result.created).toBe(0);
  });

  it('skips when no DF user matches the checkout email', async () => {
    mockUserFindFirst.mockResolvedValue(null);
    mockListTenantAccounts.mockResolvedValue([ypfAccount()]);

    const result = await discoverAccounts();

    expect(result.skippedNoUser).toBe(1);
    expect(result.created).toBe(0);
  });

  it('matches the user email case-insensitively', async () => {
    mockListTenantAccounts.mockResolvedValue([
      ypfAccount({ email: 'Trader@Example.com' }),
    ]);

    await discoverAccounts();

    expect(mockUserFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          email: { equals: 'Trader@Example.com', mode: 'insensitive' },
        }),
      }),
    );
  });

  it('skips when the YPF program is not linked to an AccountType', async () => {
    mockAccountTypeFindFirst.mockResolvedValue(null);
    mockListTenantAccounts.mockResolvedValue([ypfAccount()]);

    const result = await discoverAccounts();

    expect(result.skippedNoProgram).toBe(1);
    expect(result.created).toBe(0);
  });

  it('does not backfill platformUserId when the user already has one', async () => {
    mockUserFindFirst.mockResolvedValue({
      id: 'user-1',
      platformUserId: 'existing-ypf-usr',
    });
    mockListTenantAccounts.mockResolvedValue([ypfAccount()]);

    await discoverAccounts();

    expect(mockTxUserUpdate).not.toHaveBeenCalled();
    expect(mockTxAccountCreate).toHaveBeenCalled();
  });

  it('counts a failed link without aborting the rest of the sweep', async () => {
    mockTransaction.mockRejectedValueOnce(new Error('db down'));
    mockListTenantAccounts.mockResolvedValue([
      ypfAccount({ platformAccountId: 'ypf-acc-1', email: 'a@example.com' }),
      ypfAccount({ platformAccountId: 'ypf-acc-2', email: 'b@example.com' }),
    ]);

    const result = await discoverAccounts();

    expect(result.failed).toBe(1);
    expect(result.created).toBe(1);
  });
});
