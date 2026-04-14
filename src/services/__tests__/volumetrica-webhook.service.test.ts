import { AccountStatus, ChallengeStatus, ViolationSeverity, ViolationType } from '@prisma/client';
import { handleWebhookEvent, parseViolationType } from '../volumetrica-webhook.service';

// =============================================================================
// Mocks
// =============================================================================

const mockAccountFindFirst = jest.fn();
const mockAccountUpdate = jest.fn();
const mockChallengeUpdateMany = jest.fn();
const mockRuleViolationCreate = jest.fn();

jest.mock('../../utils/database', () => ({
  prisma: {
    account: {
      findFirst: (...args: unknown[]) => mockAccountFindFirst(...args),
      update: (...args: unknown[]) => mockAccountUpdate(...args),
    },
    challenge: {
      updateMany: (...args: unknown[]) => mockChallengeUpdateMany(...args),
    },
    ruleViolation: {
      create: (...args: unknown[]) => mockRuleViolationCreate(...args),
    },
  },
}));

jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockFailChallenge = jest.fn();
const mockAdvanceChallenge = jest.fn();

jest.mock('../challenge-transition.service', () => ({
  failChallenge: (...args: unknown[]) => mockFailChallenge(...args),
  advanceChallenge: (...args: unknown[]) => mockAdvanceChallenge(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockAccountUpdate.mockResolvedValue({});
  mockChallengeUpdateMany.mockResolvedValue({ count: 1 });
  mockRuleViolationCreate.mockResolvedValue({});
});

// =============================================================================
// Helpers
// =============================================================================

const makeSnapshot = (overrides?: Partial<{
  balance: number;
  startBalance: number;
  maximumBalance: number;
  minimumBalance: number;
  dailyPL: number;
  sessionNumbers: number;
}>) => ({
  balance: 26000,
  startBalance: 25000,
  maximumBalance: 27000,
  minimumBalance: 24000,
  dailyPL: 500,
  sessionNumbers: 5,
  ...overrides,
});

const localAccount = {
  id: 'acc-1',
  status: AccountStatus.EVALUATION,
  yourPropFirmId: 'vol-acc-123',
  maxDrawdownHit: 0,
  challenges: [{ id: 'ch-1', status: ChallengeStatus.ACTIVE }],
};

const localAccountNoChallenges = {
  ...localAccount,
  challenges: [],
};

const makePayload = (
  status: number,
  opts?: {
    reason?: string;
    tradingPermission?: number;
    snapshot?: ReturnType<typeof makeSnapshot>;
  },
) => ({
  dtUtc: '2026-04-10T12:00:00Z',
  category: 0, // Accounts
  event: 1, // Updated
  tradingAccount: {
    id: 'vol-acc-123',
    status,
    tradingPermission: opts?.tradingPermission ?? 0,
    ...(opts?.reason !== undefined && { reason: opts.reason }),
    ...(opts?.snapshot !== undefined && { snapshot: opts.snapshot }),
  },
});

// =============================================================================
// Tests — parseViolationType
// =============================================================================

describe('parseViolationType', () => {
  it.each([
    ['daily loss limit exceeded', ViolationType.DAILY_LOSS_LIMIT],
    ['Intraday drawdown breached', ViolationType.DAILY_LOSS_LIMIT],
    ['Max drawdown exceeded', ViolationType.MAX_DRAWDOWN],
    ['max loss threshold hit', ViolationType.MAX_DRAWDOWN],
    ['Position size too large', ViolationType.POSITION_SIZE],
    ['Too many contracts open', ViolationType.POSITION_SIZE],
    ['News trading detected', ViolationType.NEWS_TRADING],
    ['Weekend holding violation', ViolationType.WEEKEND_HOLDING],
    ['Overnight position detected', ViolationType.WEEKEND_HOLDING],
    ['Consistency rule breached', ViolationType.CONSISTENCY_RULE],
    ['Minimum trading days not met', ViolationType.MINIMUM_TRADING_DAYS],
    ['Trading day requirement failed', ViolationType.MINIMUM_TRADING_DAYS],
    ['Some unknown reason', ViolationType.OTHER],
    ['Account disabled', ViolationType.OTHER],
  ])('parses "%s" as %s', (reason, expected) => {
    expect(parseViolationType(reason)).toBe(expected);
  });
});

// =============================================================================
// Tests — Status Transitions (existing behavior)
// =============================================================================

describe('handleWebhookEvent — status transitions', () => {
  it('calls failChallenge on CHALLENGE_FAILED (status 4) with parsed violation type', async () => {
    mockAccountFindFirst.mockResolvedValue(localAccount);

    await handleWebhookEvent(makePayload(4, { reason: 'Max drawdown exceeded' }));

    expect(mockFailChallenge).toHaveBeenCalledWith(
      'acc-1',
      'Max drawdown exceeded',
      ViolationType.MAX_DRAWDOWN,
    );
  });

  it('calls advanceChallenge on CHALLENGE_SUCCESS (status 2)', async () => {
    mockAccountFindFirst.mockResolvedValue(localAccount);

    await handleWebhookEvent(makePayload(2));

    expect(mockAdvanceChallenge).toHaveBeenCalledWith('acc-1');
  });

  it('calls failChallenge on DISABLED (status 8)', async () => {
    mockAccountFindFirst.mockResolvedValue(localAccount);

    await handleWebhookEvent(makePayload(8));

    expect(mockFailChallenge).toHaveBeenCalledWith(
      'acc-1',
      'Account disabled by platform',
      ViolationType.OTHER,
    );
  });

  it('uses parseViolationType for DISABLED with a reason', async () => {
    mockAccountFindFirst.mockResolvedValue(localAccount);

    await handleWebhookEvent(makePayload(8, { reason: 'Daily loss limit breached' }));

    expect(mockFailChallenge).toHaveBeenCalledWith(
      'acc-1',
      'Daily loss limit breached',
      ViolationType.DAILY_LOSS_LIMIT,
    );
  });

  it('ignores non-account-update events', async () => {
    await handleWebhookEvent({
      dtUtc: '2026-04-10T12:00:00Z',
      category: 99,
      event: 1,
      tradingAccount: { id: 'vol-acc-123', status: 4, tradingPermission: 0 },
    });

    expect(mockAccountFindFirst).not.toHaveBeenCalled();
    expect(mockFailChallenge).not.toHaveBeenCalled();
  });

  it('ignores unknown platform account IDs', async () => {
    mockAccountFindFirst.mockResolvedValue(null);

    await handleWebhookEvent(makePayload(4));

    expect(mockFailChallenge).not.toHaveBeenCalled();
  });

  it('skips non-actionable statuses', async () => {
    mockAccountFindFirst.mockResolvedValue(localAccount);

    await handleWebhookEvent(makePayload(1)); // ENABLED — not actionable

    expect(mockFailChallenge).not.toHaveBeenCalled();
    expect(mockAdvanceChallenge).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Tests — Balance Sync
// =============================================================================

describe('handleWebhookEvent — balance sync', () => {
  it('updates account financial fields from snapshot', async () => {
    mockAccountFindFirst.mockResolvedValue(localAccount);
    const snapshot = makeSnapshot();

    await handleWebhookEvent(makePayload(1, { snapshot }));

    expect(mockAccountUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'acc-1' },
        data: expect.objectContaining({
          currentBalance: 26000,
          highWaterMark: 27000,
          dailyPnl: 500,
          totalPnl: 1000, // 26000 - 25000
          tradingDays: 5,
        }),
      }),
    );
  });

  it('computes currentDrawdown as percentage of startBalance', async () => {
    mockAccountFindFirst.mockResolvedValue(localAccount);
    // maximumBalance=27000, balance=26000, startBalance=25000
    // drawdown = (27000 - 26000) / 25000 * 100 = 4%
    const snapshot = makeSnapshot();

    await handleWebhookEvent(makePayload(1, { snapshot }));

    expect(mockAccountUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currentDrawdown: 4,
        }),
      }),
    );
  });

  it('computes maxDrawdownHit and keeps the worse (higher) value', async () => {
    const accountWithDrawdown = { ...localAccount, maxDrawdownHit: 15 };
    mockAccountFindFirst.mockResolvedValue(accountWithDrawdown);
    // maximumBalance=27000, minimumBalance=24000, startBalance=25000
    // maxDrawdown = (27000 - 24000) / 25000 * 100 = 12%
    // existing maxDrawdownHit = 15, new = 12 → keep 15
    const snapshot = makeSnapshot();

    await handleWebhookEvent(makePayload(1, { snapshot }));

    expect(mockAccountUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          maxDrawdownHit: 15, // kept existing because 15 > 12
        }),
      }),
    );
  });

  it('updates maxDrawdownHit when new value is worse', async () => {
    mockAccountFindFirst.mockResolvedValue(localAccount); // maxDrawdownHit = 0
    // maxDrawdown = (27000 - 24000) / 25000 * 100 = 12%
    const snapshot = makeSnapshot();

    await handleWebhookEvent(makePayload(1, { snapshot }));

    expect(mockAccountUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          maxDrawdownHit: 12,
        }),
      }),
    );
  });

  it('handles zero startBalance without division by zero', async () => {
    mockAccountFindFirst.mockResolvedValue(localAccount);
    const snapshot = makeSnapshot({ startBalance: 0, balance: 0, maximumBalance: 0, minimumBalance: 0 });

    await handleWebhookEvent(makePayload(1, { snapshot }));

    expect(mockAccountUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currentDrawdown: 0,
          maxDrawdownHit: 0,
          totalPnl: 0,
        }),
      }),
    );
  });

  it('does not update account when no snapshot is present', async () => {
    mockAccountFindFirst.mockResolvedValue(localAccount);

    await handleWebhookEvent(makePayload(1)); // no snapshot

    expect(mockAccountUpdate).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Tests — Challenge Progress
// =============================================================================

describe('handleWebhookEvent — challenge progress', () => {
  it('updates active challenge with profit percentage and trading days', async () => {
    mockAccountFindFirst.mockResolvedValue(localAccount);
    // profit = (26000 - 25000) / 25000 * 100 = 4%
    const snapshot = makeSnapshot();

    await handleWebhookEvent(makePayload(1, { snapshot }));

    expect(mockChallengeUpdateMany).toHaveBeenCalledWith({
      where: { accountId: 'acc-1', status: ChallengeStatus.ACTIVE },
      data: {
        currentProfit: 4, // (26000 - 25000) / 25000 * 100
        tradingDaysCount: 5,
      },
    });
  });

  it('does not update challenge when account has no active challenge', async () => {
    mockAccountFindFirst.mockResolvedValue(localAccountNoChallenges);
    const snapshot = makeSnapshot();

    await handleWebhookEvent(makePayload(1, { snapshot }));

    // Balance sync still runs
    expect(mockAccountUpdate).toHaveBeenCalled();
    // But challenge update does not
    expect(mockChallengeUpdateMany).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Tests — Trading Permission Changes
// =============================================================================

describe('handleWebhookEvent — trading permission changes', () => {
  it('creates WARNING RuleViolation for RiskPause', async () => {
    mockAccountFindFirst.mockResolvedValue(localAccount);

    await handleWebhookEvent(makePayload(1, { tradingPermission: 2, reason: 'Daily loss approaching limit' }));

    expect(mockRuleViolationCreate).toHaveBeenCalledWith({
      data: {
        accountId: 'acc-1',
        type: ViolationType.DAILY_LOSS_LIMIT,
        severity: ViolationSeverity.WARNING,
        description: 'Daily loss approaching limit',
        causedFailure: false,
      },
    });
  });

  it('creates WARNING RuleViolation for LiquidateOnly', async () => {
    mockAccountFindFirst.mockResolvedValue(localAccount);

    await handleWebhookEvent(makePayload(1, { tradingPermission: 3 }));

    expect(mockRuleViolationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId: 'acc-1',
        severity: ViolationSeverity.WARNING,
        causedFailure: false,
      }),
    });
  });

  it('does not create violation for Trading (0) or ReadOnly (1)', async () => {
    mockAccountFindFirst.mockResolvedValue(localAccount);

    await handleWebhookEvent(makePayload(1, { tradingPermission: 0 }));
    await handleWebhookEvent(makePayload(1, { tradingPermission: 1 }));

    expect(mockRuleViolationCreate).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Tests — Integration: Phase 1 + Phase 2
// =============================================================================

describe('handleWebhookEvent — integration', () => {
  it('runs status transition AND balance sync together', async () => {
    mockAccountFindFirst.mockResolvedValue(localAccount);
    const snapshot = makeSnapshot();

    await handleWebhookEvent(makePayload(4, { reason: 'Max drawdown exceeded', snapshot }));

    // Phase 1: status transition
    expect(mockFailChallenge).toHaveBeenCalledWith('acc-1', 'Max drawdown exceeded', ViolationType.MAX_DRAWDOWN);
    // Phase 2: balance sync
    expect(mockAccountUpdate).toHaveBeenCalled();
    expect(mockChallengeUpdateMany).toHaveBeenCalled();
  });

  it('balance sync failure does not prevent status transition from succeeding', async () => {
    mockAccountFindFirst.mockResolvedValue(localAccount);
    mockAccountUpdate.mockRejectedValue(new Error('DB write failed'));
    const snapshot = makeSnapshot();

    // Should not throw — phase 2 errors are caught
    await handleWebhookEvent(makePayload(4, { reason: 'Max drawdown exceeded', snapshot }));

    // Phase 1 still ran
    expect(mockFailChallenge).toHaveBeenCalled();
  });

  it('syncs balance for non-actionable status with snapshot', async () => {
    mockAccountFindFirst.mockResolvedValue(localAccount);
    const snapshot = makeSnapshot();

    await handleWebhookEvent(makePayload(1, { snapshot })); // ENABLED — not actionable

    // No status transition
    expect(mockFailChallenge).not.toHaveBeenCalled();
    expect(mockAdvanceChallenge).not.toHaveBeenCalled();
    // But balance still synced
    expect(mockAccountUpdate).toHaveBeenCalled();
    expect(mockChallengeUpdateMany).toHaveBeenCalled();
  });

  it('includes active challenge in findFirst query', async () => {
    mockAccountFindFirst.mockResolvedValue(localAccount);

    await handleWebhookEvent(makePayload(1));

    expect(mockAccountFindFirst).toHaveBeenCalledWith({
      where: { yourPropFirmId: 'vol-acc-123' },
      include: {
        challenges: {
          where: { status: ChallengeStatus.ACTIVE },
          take: 1,
        },
      },
    });
  });
});
