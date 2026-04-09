import {
  AccountStatus,
  ChallengePhase,
  ChallengeStatus,
  ViolationSeverity,
  ViolationType,
} from '@prisma/client';
import { failChallenge, advanceChallenge } from '../challenge-transition.service';

// =============================================================================
// Mocks
// =============================================================================

const mockTransaction = jest.fn();
const mockAccountFindUnique = jest.fn();
const mockChallengeUpdate = jest.fn();
const mockChallengeCreate = jest.fn();
const mockAccountUpdate = jest.fn();
const mockRuleViolationCreate = jest.fn();
const mockChallengeRuleUpdate = jest.fn();

jest.mock('../../utils/database', () => ({
  prisma: {
    account: { findUnique: (...args: unknown[]) => mockAccountFindUnique(...args) },
    challengeRule: { update: (...args: unknown[]) => mockChallengeRuleUpdate(...args) },
    $transaction: (fn: (tx: unknown) => Promise<void>) =>
      mockTransaction(fn),
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

const mockProvider = {
  assignTradingRule: jest.fn(),
  listTradingRules: jest.fn(),
  createTradingRule: jest.fn(),
};

jest.mock('../../providers/index', () => ({
  getTradingPlatformProvider: () => mockProvider,
}));

// Make $transaction actually run the callback with mock tx
beforeEach(() => {
  jest.clearAllMocks();
  mockTransaction.mockImplementation(async (fn) => {
    const tx = {
      challenge: {
        update: mockChallengeUpdate,
        create: mockChallengeCreate,
      },
      account: { update: mockAccountUpdate },
      ruleViolation: { create: mockRuleViolationCreate },
    };
    return fn(tx);
  });
});

// =============================================================================
// failChallenge
// =============================================================================

describe('failChallenge', () => {
  const activeAccount = {
    id: 'acc-1',
    status: AccountStatus.EVALUATION,
    challenges: [
      { id: 'ch-1', status: ChallengeStatus.ACTIVE, phase: ChallengePhase.PHASE_1 },
    ],
  };

  it('fails the active challenge and account', async () => {
    mockAccountFindUnique.mockResolvedValue(activeAccount);

    await failChallenge('acc-1', 'Max drawdown exceeded', ViolationType.MAX_DRAWDOWN);

    expect(mockChallengeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ch-1' },
        data: expect.objectContaining({ status: ChallengeStatus.FAILED }),
      }),
    );

    expect(mockAccountUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'acc-1' },
        data: expect.objectContaining({
          status: AccountStatus.FAILED,
          failedReason: 'Max drawdown exceeded',
        }),
      }),
    );

    expect(mockRuleViolationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountId: 'acc-1',
          type: ViolationType.MAX_DRAWDOWN,
          severity: ViolationSeverity.CRITICAL,
          causedFailure: true,
        }),
      }),
    );
  });

  it('skips when account not found', async () => {
    mockAccountFindUnique.mockResolvedValue(null);

    await failChallenge('acc-missing', 'reason');

    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('skips when no active challenge', async () => {
    mockAccountFindUnique.mockResolvedValue({
      ...activeAccount,
      challenges: [],
    });

    await failChallenge('acc-1', 'reason');

    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('skips when account already failed (idempotent)', async () => {
    mockAccountFindUnique.mockResolvedValue({
      ...activeAccount,
      status: AccountStatus.FAILED,
    });

    await failChallenge('acc-1', 'reason');

    expect(mockTransaction).not.toHaveBeenCalled();
  });
});

// =============================================================================
// advanceChallenge
// =============================================================================

describe('advanceChallenge', () => {
  const accountWithPhase1 = {
    id: 'acc-1',
    status: AccountStatus.EVALUATION,
    yourPropFirmId: 'vol-acc-123',
    startingBalance: { toNumber: () => 25000 },
    challenges: [
      { id: 'ch-1', status: ChallengeStatus.ACTIVE, phase: ChallengePhase.PHASE_1 },
    ],
    accountType: {
      name: 'STANDARD_25K',
      challengeRules: [
        {
          id: 'rule-funded',
          phase: ChallengePhase.FUNDED,
          profitTarget: 0,
          maxDailyLoss: 3.0,
          maxTotalDrawdown: 6.0,
          drawdownType: 'static',
          minTradingDays: 0,
          consistencyRule: false,
          maxSingleDayProfit: null,
          newsRestriction: false,
          weekendRestriction: false,
          platformRuleId: null,
        },
      ],
    },
  };

  it('advances PHASE_1 to FUNDED with new challenge', async () => {
    mockAccountFindUnique.mockResolvedValue(accountWithPhase1);
    mockProvider.listTradingRules.mockResolvedValue([]);
    mockProvider.createTradingRule.mockResolvedValue({
      tradingRuleId: 'vol-rule-funded',
      name: 'STANDARD_25K_FUNDED',
    });
    mockProvider.assignTradingRule.mockResolvedValue(undefined);

    await advanceChallenge('acc-1');

    // Current challenge marked as PASSED
    expect(mockChallengeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ch-1' },
        data: expect.objectContaining({ status: ChallengeStatus.PASSED }),
      }),
    );

    // New funded challenge created
    expect(mockChallengeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountId: 'acc-1',
          phase: ChallengePhase.FUNDED,
          status: ChallengeStatus.ACTIVE,
        }),
      }),
    );

    // Account updated to FUNDED
    expect(mockAccountUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'acc-1' },
        data: expect.objectContaining({ status: AccountStatus.FUNDED }),
      }),
    );

    // Trading rule assigned on platform
    expect(mockProvider.assignTradingRule).toHaveBeenCalledWith(
      'vol-acc-123',
      'vol-rule-funded',
    );

    // platformRuleId cached
    expect(mockChallengeRuleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'rule-funded' },
        data: { platformRuleId: 'vol-rule-funded' },
      }),
    );
  });

  it('uses cached platformRuleId when available', async () => {
    const withCachedRule = {
      ...accountWithPhase1,
      accountType: {
        ...accountWithPhase1.accountType,
        challengeRules: [
          {
            ...accountWithPhase1.accountType.challengeRules[0],
            platformRuleId: 'vol-rule-cached',
          },
        ],
      },
    };
    mockAccountFindUnique.mockResolvedValue(withCachedRule);
    mockProvider.assignTradingRule.mockResolvedValue(undefined);

    await advanceChallenge('acc-1');

    expect(mockProvider.listTradingRules).not.toHaveBeenCalled();
    expect(mockProvider.createTradingRule).not.toHaveBeenCalled();
    expect(mockProvider.assignTradingRule).toHaveBeenCalledWith(
      'vol-acc-123',
      'vol-rule-cached',
    );
  });

  it('skips when account not found', async () => {
    mockAccountFindUnique.mockResolvedValue(null);

    await advanceChallenge('acc-missing');

    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('skips when no active challenge', async () => {
    mockAccountFindUnique.mockResolvedValue({
      ...accountWithPhase1,
      challenges: [],
    });

    await advanceChallenge('acc-1');

    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('skips when challenge is not PHASE_1', async () => {
    mockAccountFindUnique.mockResolvedValue({
      ...accountWithPhase1,
      challenges: [
        { id: 'ch-funded', status: ChallengeStatus.ACTIVE, phase: ChallengePhase.FUNDED },
      ],
    });

    await advanceChallenge('acc-1');

    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('still completes DB transition if platform rule assignment fails', async () => {
    mockAccountFindUnique.mockResolvedValue(accountWithPhase1);
    mockProvider.listTradingRules.mockRejectedValue(new Error('API down'));

    await advanceChallenge('acc-1');

    // DB transition should still happen
    expect(mockChallengeUpdate).toHaveBeenCalled();
    expect(mockChallengeCreate).toHaveBeenCalled();
    expect(mockAccountUpdate).toHaveBeenCalled();
  });
});
