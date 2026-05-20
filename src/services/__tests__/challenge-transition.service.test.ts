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

jest.mock('../../utils/database', () => ({
  prisma: {
    account: { findUnique: (...args: unknown[]) => mockAccountFindUnique(...args) },
    $transaction: (fn: (tx: unknown) => Promise<void>) => mockTransaction(fn),
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

// $transaction runs the callback with a mock tx
beforeEach(() => {
  jest.clearAllMocks();
  mockTransaction.mockImplementation(async (fn) => {
    const tx = {
      challenge: { update: mockChallengeUpdate, create: mockChallengeCreate },
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
    mockAccountFindUnique.mockResolvedValue({ ...activeAccount, challenges: [] });
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
    platformAccountId: 'ypf-acc-123',
    platformUserId: 'ypf-usr-1',
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
        },
      ],
    },
  };

  it('advances PHASE_1 to FUNDED with new challenge', async () => {
    mockAccountFindUnique.mockResolvedValue(accountWithPhase1);

    await advanceChallenge('acc-1');

    expect(mockChallengeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ch-1' },
        data: expect.objectContaining({ status: ChallengeStatus.PASSED }),
      }),
    );

    expect(mockChallengeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountId: 'acc-1',
          phase: ChallengePhase.FUNDED,
          status: ChallengeStatus.ACTIVE,
        }),
      }),
    );

    expect(mockAccountUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'acc-1' },
        data: expect.objectContaining({ status: AccountStatus.FUNDED }),
      }),
    );
  });

  it('skips when account not found', async () => {
    mockAccountFindUnique.mockResolvedValue(null);
    await advanceChallenge('acc-missing');
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('skips when no active challenge', async () => {
    mockAccountFindUnique.mockResolvedValue({ ...accountWithPhase1, challenges: [] });
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
});
