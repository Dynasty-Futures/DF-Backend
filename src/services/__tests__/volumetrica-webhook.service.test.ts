import { AccountStatus } from '@prisma/client';
import { handleWebhookEvent } from '../volumetrica-webhook.service';

// =============================================================================
// Mocks
// =============================================================================

const mockAccountFindFirst = jest.fn();

jest.mock('../../utils/database', () => ({
  prisma: {
    account: { findFirst: (...args: unknown[]) => mockAccountFindFirst(...args) },
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
});

// =============================================================================
// Tests
// =============================================================================

describe('handleWebhookEvent', () => {
  const localAccount = {
    id: 'acc-1',
    status: AccountStatus.EVALUATION,
    yourPropFirmId: 'vol-acc-123',
  };

  const makePayload = (status: number, reason?: string) => ({
    dtUtc: '2026-04-10T12:00:00Z',
    category: 0, // Accounts
    event: 1, // Updated
    tradingAccount: {
      id: 'vol-acc-123',
      status,
      ...(reason && { reason }),
    },
  });

  it('calls failChallenge on CHALLENGE_FAILED (status 4)', async () => {
    mockAccountFindFirst.mockResolvedValue(localAccount);

    await handleWebhookEvent(makePayload(4, 'Max drawdown exceeded'));

    expect(mockFailChallenge).toHaveBeenCalledWith(
      'acc-1',
      'Max drawdown exceeded',
      expect.any(String),
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
      expect.any(String),
    );
  });

  it('ignores non-account-update events', async () => {
    await handleWebhookEvent({
      dtUtc: '2026-04-10T12:00:00Z',
      category: 99,
      event: 1,
      tradingAccount: { id: 'vol-acc-123', status: 4 },
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
