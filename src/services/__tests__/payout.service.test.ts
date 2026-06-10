import { AccountStatus, PayoutMethod, PayoutStatus } from '@prisma/client';
import {
  getEligibleAccounts,
  requestPayout,
  syncPayouts,
  RequestPayoutInput,
} from '../payout.service';
import { BadRequestError, NotFoundError, PlatformError } from '../../utils/errors';

// =============================================================================
// Mocks
// =============================================================================

const mockAccountFindMany = jest.fn();
const mockAccountFindFirst = jest.fn();

jest.mock('../../utils/database', () => ({
  prisma: {
    account: {
      findMany: (...args: unknown[]) => mockAccountFindMany(...args),
      findFirst: (...args: unknown[]) => mockAccountFindFirst(...args),
    },
  },
}));

const mockCreatePayout = jest.fn();
const mockListPayouts = jest.fn();

jest.mock('../../providers/index', () => ({
  getTradingPlatformProvider: () => ({
    createPayout: (...args: unknown[]) => mockCreatePayout(...args),
    listPayouts: (...args: unknown[]) => mockListPayouts(...args),
  }),
}));

const mockRepoCreate = jest.fn();
const mockFindActive = jest.fn();
const mockFindById = jest.fn();
const mockFindByUser = jest.fn();
const mockFindReconcilable = jest.fn();
const mockUpdateFromPlatform = jest.fn();

jest.mock('../../repositories/payout.repository', () => ({
  createPayout: (...args: unknown[]) => mockRepoCreate(...args),
  findActivePayoutForAccount: (...args: unknown[]) => mockFindActive(...args),
  findPayoutByIdForUser: (...args: unknown[]) => mockFindById(...args),
  findPayoutsByUserId: (...args: unknown[]) => mockFindByUser(...args),
  findReconcilablePayouts: (...args: unknown[]) => mockFindReconcilable(...args),
  updatePayoutFromPlatform: (...args: unknown[]) => mockUpdateFromPlatform(...args),
}));

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// =============================================================================
// Fixtures
// =============================================================================

const accountType = { displayName: 'Standard 25K', name: 'STANDARD_25K' };

const fundedAccount = (overrides: Record<string, unknown> = {}) => ({
  id: 'acc-1',
  userId: 'user-1',
  status: AccountStatus.FUNDED,
  platformAccountId: 'p-acc-1',
  platformUserId: 'p-usr-1',
  currentBalance: 27500,
  startingBalance: 25000,
  accountType,
  user: { platformUserId: 'p-usr-1' },
  ...overrides,
});

const payoutRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'po-1',
  accountId: 'acc-1',
  amount: 2000,
  currency: 'USD',
  status: PayoutStatus.PENDING,
  method: PayoutMethod.RISE,
  transferType: 'Rise',
  profitSplit: 90,
  commission: 0,
  transferAmount: 1800,
  rejectionReason: null,
  requestedAt: new Date('2026-06-09T00:00:00Z'),
  processedAt: null,
  account: { accountType },
  ...overrides,
});

const platformResult = (overrides: Record<string, unknown> = {}) => ({
  platformPayoutId: 'ypf-po-1',
  platformUserId: 'p-usr-1',
  platformAccountId: 'p-acc-1',
  amount: 2000,
  currency: 'USD',
  status: 'Pending',
  method: 'Rise',
  profitSplit: 90,
  commission: 0,
  transferAmount: 1800,
  ...overrides,
});

const bank = {
  accountHolder: 'Jane Doe',
  accountNumber: '123456789',
  swiftBic: 'CHASUS33',
  currency: 'USD',
};

const requestInput = (overrides: Partial<RequestPayoutInput> = {}): RequestPayoutInput => ({
  userId: 'user-1',
  accountId: 'acc-1',
  amount: 2000,
  payoutDetails: bank,
  ...overrides,
});

// =============================================================================
// Tests
// =============================================================================

describe('payoutService.getEligibleAccounts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindActive.mockResolvedValue(null);
  });

  it('returns funded accounts with withdrawable profit and marks them eligible', async () => {
    mockAccountFindMany.mockResolvedValue([fundedAccount()]);

    const acct = (await getEligibleAccounts('user-1'))[0]!;

    expect(acct.accountName).toBe('Standard 25K');
    expect(acct.availableProfit).toBe(2500);
    expect(acct.eligible).toBe(true);
    expect(acct.hasPendingPayout).toBe(false);
  });

  it('marks an account ineligible when a payout is already in progress', async () => {
    mockAccountFindMany.mockResolvedValue([fundedAccount()]);
    mockFindActive.mockResolvedValue({ id: 'po-existing' });

    const acct = (await getEligibleAccounts('user-1'))[0]!;

    expect(acct.hasPendingPayout).toBe(true);
    expect(acct.eligible).toBe(false);
  });

  it('reports zero profit (ineligible) when balance is at or below starting', async () => {
    mockAccountFindMany.mockResolvedValue([
      fundedAccount({ currentBalance: 24000 }),
    ]);

    const acct = (await getEligibleAccounts('user-1'))[0]!;

    expect(acct.availableProfit).toBe(0);
    expect(acct.eligible).toBe(false);
  });
});

describe('payoutService.requestPayout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAccountFindFirst.mockResolvedValue(fundedAccount());
    mockFindActive.mockResolvedValue(null);
    mockCreatePayout.mockResolvedValue(platformResult());
    mockRepoCreate.mockResolvedValue(payoutRow());
    mockFindById.mockResolvedValue(payoutRow());
  });

  it('submits to YPF with type=Rise + pass-through bank details and persists the mirror', async () => {
    const dto = await requestPayout(requestInput());

    expect(mockCreatePayout).toHaveBeenCalledWith('p-usr-1', {
      platformAccountId: 'p-acc-1',
      amount: 2000,
      currency: 'USD',
      method: 'Rise',
      payoutDetails: bank,
    });
    expect(mockRepoCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'acc-1',
        method: PayoutMethod.RISE,
        transferType: 'Rise',
        platformPayoutId: 'ypf-po-1',
      })
    );
    expect(dto.status).toBe(PayoutStatus.PENDING);
    expect(dto.transferAmount).toBe(1800);
  });

  it('rejects a non-funded account without calling YPF', async () => {
    mockAccountFindFirst.mockResolvedValue(
      fundedAccount({ status: AccountStatus.EVALUATION })
    );

    await expect(requestPayout(requestInput())).rejects.toBeInstanceOf(
      BadRequestError
    );
    expect(mockCreatePayout).not.toHaveBeenCalled();
  });

  it('rejects when the amount exceeds withdrawable profit', async () => {
    await expect(
      requestPayout(requestInput({ amount: 5000 }))
    ).rejects.toBeInstanceOf(BadRequestError);
    expect(mockCreatePayout).not.toHaveBeenCalled();
  });

  it('rejects a missing account with NotFoundError', async () => {
    mockAccountFindFirst.mockResolvedValue(null);

    await expect(requestPayout(requestInput())).rejects.toBeInstanceOf(
      NotFoundError
    );
  });

  it('rejects when the account is not linked to the platform', async () => {
    mockAccountFindFirst.mockResolvedValue(
      fundedAccount({ platformAccountId: null, platformUserId: null, user: { platformUserId: null } })
    );

    await expect(requestPayout(requestInput())).rejects.toBeInstanceOf(
      PlatformError
    );
    expect(mockCreatePayout).not.toHaveBeenCalled();
  });

  it('blocks a second request while one is in progress', async () => {
    mockFindActive.mockResolvedValue({ id: 'po-existing' });

    await expect(requestPayout(requestInput())).rejects.toBeInstanceOf(
      BadRequestError
    );
    expect(mockCreatePayout).not.toHaveBeenCalled();
  });

  it('surfaces a PlatformError and persists nothing when YPF rejects the call', async () => {
    mockCreatePayout.mockRejectedValueOnce(new Error('YPF 500'));

    await expect(requestPayout(requestInput())).rejects.toBeInstanceOf(
      PlatformError
    );
    expect(mockRepoCreate).not.toHaveBeenCalled();
  });
});

describe('payoutService.syncPayouts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('mirrors an approval from YPF into the local record', async () => {
    mockFindReconcilable.mockResolvedValue([
      { id: 'po-1', platformPayoutId: 'ypf-po-1', status: PayoutStatus.PENDING },
    ]);
    mockListPayouts.mockResolvedValue([
      platformResult({ status: 'Approved', transferAmount: 1800 }),
    ]);

    const updated = await syncPayouts();

    expect(updated).toBe(1);
    expect(mockUpdateFromPlatform).toHaveBeenCalledWith(
      'po-1',
      expect.objectContaining({ status: PayoutStatus.APPROVED })
    );
  });

  it('does nothing when the upstream status is unchanged', async () => {
    mockFindReconcilable.mockResolvedValue([
      { id: 'po-1', platformPayoutId: 'ypf-po-1', status: PayoutStatus.PENDING },
    ]);
    mockListPayouts.mockResolvedValue([platformResult({ status: 'Pending' })]);

    const updated = await syncPayouts();

    expect(updated).toBe(0);
    expect(mockUpdateFromPlatform).not.toHaveBeenCalled();
  });

  it('skips the provider call entirely when nothing is reconcilable', async () => {
    mockFindReconcilable.mockResolvedValue([]);

    const updated = await syncPayouts();

    expect(updated).toBe(0);
    expect(mockListPayouts).not.toHaveBeenCalled();
  });
});
