import { AccountStatus } from '@prisma/client';
import {
  syncAccountFromYPF,
  isYpfDisabledState,
} from '../ypf-sync.service';

// =============================================================================
// Mocks
// =============================================================================

const mockAccountFindUnique = jest.fn();
const mockAccountUpdate = jest.fn();

jest.mock('../../utils/database', () => ({
  prisma: {
    account: {
      findUnique: (...a: unknown[]) => mockAccountFindUnique(...a),
      update: (...a: unknown[]) => mockAccountUpdate(...a),
    },
  },
}));

const mockGetAccount = jest.fn();
const mockGetAccountBreaches = jest.fn();
const mockListPrograms = jest.fn();

jest.mock('../../providers/index', () => ({
  getTradingPlatformProvider: () => ({
    getAccount: (...a: unknown[]) => mockGetAccount(...a),
    getAccountBreaches: (...a: unknown[]) => mockGetAccountBreaches(...a),
    listPrograms: (...a: unknown[]) => mockListPrograms(...a),
  }),
}));

const mockSyncAccountFromPlatform = jest.fn();
jest.mock('../sync.service', () => ({
  syncAccountFromPlatform: (...a: unknown[]) => mockSyncAccountFromPlatform(...a),
}));

const mockFailChallenge = jest.fn();
const mockAdvanceChallenge = jest.fn();
const mockCloseUpgradedAccount = jest.fn();
jest.mock('../challenge-transition.service', () => ({
  failChallenge: (...a: unknown[]) => mockFailChallenge(...a),
  advanceChallenge: (...a: unknown[]) => mockAdvanceChallenge(...a),
  closeUpgradedAccount: (...a: unknown[]) => mockCloseUpgradedAccount(...a),
}));

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// =============================================================================
// Tests
// =============================================================================

const linkedAccount = (status: AccountStatus = AccountStatus.EVALUATION) => ({
  id: 'acc-1',
  status,
  platformAccountId: 'p1',
  platformUserId: 'u1',
});

beforeEach(() => {
  jest.clearAllMocks();
  // Catalog: eval program chains to a funded (terminal, null next) program.
  mockListPrograms.mockResolvedValue([
    { programId: 'prog-eval', name: 'Eval', nextProgramId: 'prog-funded' },
    { programId: 'prog-funded', name: 'Funded', nextProgramId: null },
  ]);
});

describe('isYpfDisabledState', () => {
  it('matches Disabled (any case) and nothing else', () => {
    expect(isYpfDisabledState('Disabled')).toBe(true);
    expect(isYpfDisabledState('disabled')).toBe(true);
    expect(isYpfDisabledState('Active')).toBe(false);
    expect(isYpfDisabledState('Breached')).toBe(false);
  });
});

describe('syncAccountFromYPF — disabled handling', () => {
  it('soft-deletes a local account when YPF reports Disabled and skips balance sync', async () => {
    mockAccountFindUnique.mockResolvedValue(linkedAccount());

    await syncAccountFromYPF({
      localAccountId: 'acc-1',
      liveAccount: { status: 'Disabled' } as never,
    });

    expect(mockAccountUpdate).toHaveBeenCalledTimes(1);
    const arg = mockAccountUpdate.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'acc-1' });
    expect(arg.data.status).toBe(AccountStatus.CLOSED);
    expect(arg.data.deletedAt).toBeInstanceOf(Date);

    // Removed accounts must not run balance sync or transitions.
    expect(mockSyncAccountFromPlatform).not.toHaveBeenCalled();
    expect(mockFailChallenge).not.toHaveBeenCalled();
    expect(mockAdvanceChallenge).not.toHaveBeenCalled();
  });

  it('does not soft-delete an active account — proceeds to balance sync', async () => {
    mockAccountFindUnique.mockResolvedValue(linkedAccount());

    await syncAccountFromYPF({
      localAccountId: 'acc-1',
      liveAccount: { status: 'Active', programId: 'prog-eval' } as never,
    });

    expect(mockAccountUpdate).not.toHaveBeenCalled();
    expect(mockSyncAccountFromPlatform).toHaveBeenCalledTimes(1);
  });
});

describe('syncAccountFromYPF — eval→funded transition', () => {
  it('advances an evaluation account whose live program is now funded', async () => {
    mockAccountFindUnique.mockResolvedValue(
      linkedAccount(AccountStatus.EVALUATION),
    );

    await syncAccountFromYPF({
      localAccountId: 'acc-1',
      liveAccount: { status: 'Active', programId: 'prog-funded' } as never,
    });

    expect(mockAdvanceChallenge).toHaveBeenCalledWith('acc-1');
    expect(mockFailChallenge).not.toHaveBeenCalled();
  });

  it('does not advance while still on an evaluation program', async () => {
    mockAccountFindUnique.mockResolvedValue(
      linkedAccount(AccountStatus.EVALUATION),
    );

    await syncAccountFromYPF({
      localAccountId: 'acc-1',
      liveAccount: { status: 'Active', programId: 'prog-eval' } as never,
    });

    expect(mockAdvanceChallenge).not.toHaveBeenCalled();
  });

  it('does not advance an account already marked funded', async () => {
    mockAccountFindUnique.mockResolvedValue(linkedAccount(AccountStatus.FUNDED));

    await syncAccountFromYPF({
      localAccountId: 'acc-1',
      liveAccount: { status: 'Active', programId: 'prog-funded' } as never,
    });

    expect(mockAdvanceChallenge).not.toHaveBeenCalled();
  });
});

describe('syncAccountFromYPF — superseded (Upgraded) handling', () => {
  it('closes an Upgraded account instead of advancing it (YPF spawned a new funded account)', async () => {
    mockAccountFindUnique.mockResolvedValue(
      linkedAccount(AccountStatus.EVALUATION),
    );

    await syncAccountFromYPF({
      localAccountId: 'acc-1',
      // Retired account keeps its eval program; the new funded account is separate.
      liveAccount: { status: 'Upgraded', programId: 'prog-eval' } as never,
    });

    expect(mockCloseUpgradedAccount).toHaveBeenCalledWith('acc-1');
    expect(mockAdvanceChallenge).not.toHaveBeenCalled();
    expect(mockFailChallenge).not.toHaveBeenCalled();
  });

  it('still closes an Upgraded account that was already advanced to FUNDED locally (self-heal)', async () => {
    mockAccountFindUnique.mockResolvedValue(linkedAccount(AccountStatus.FUNDED));

    await syncAccountFromYPF({
      localAccountId: 'acc-1',
      liveAccount: { status: 'Upgraded', programId: 'prog-eval' } as never,
    });

    expect(mockCloseUpgradedAccount).toHaveBeenCalledWith('acc-1');
    expect(mockAdvanceChallenge).not.toHaveBeenCalled();
  });
});
