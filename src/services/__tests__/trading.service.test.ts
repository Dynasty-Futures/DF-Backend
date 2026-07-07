import { requestUpgrade, getCheckoutUrl } from '../trading.service';
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
  ServiceUnavailableError,
} from '../../utils/errors';

// =============================================================================
// Mocks
// =============================================================================

const mockAccountFindUnique = jest.fn();

jest.mock('../../utils/database', () => ({
  prisma: {
    account: {
      findUnique: (...args: unknown[]) => mockAccountFindUnique(...args),
    },
  },
}));

const mockGetAccount = jest.fn();
const mockUpgradeAccount = jest.fn();
const mockGetProgram = jest.fn();
const mockGetRefCode = jest.fn();

jest.mock('../../providers/index', () => ({
  getTradingPlatformProvider: () => ({
    getAccount: (...args: unknown[]) => mockGetAccount(...args),
    upgradeAccount: (...args: unknown[]) => mockUpgradeAccount(...args),
    getProgram: (...args: unknown[]) => mockGetProgram(...args),
    getRefCode: (...args: unknown[]) => mockGetRefCode(...args),
  }),
}));

const mockSyncFromYPF = jest.fn();
jest.mock('../ypf-sync.service', () => ({
  syncAccountFromYPF: (...args: unknown[]) => mockSyncFromYPF(...args),
}));

// sync.service is imported by trading.service but unused on the upgrade path.
jest.mock('../sync.service', () => ({
  syncAccountFromPlatform: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// =============================================================================
// Fixtures
// =============================================================================

const linkedAccount = (overrides: Record<string, unknown> = {}) => ({
  id: 'acc-1',
  userId: 'user-1',
  platformAccountId: 'p-acc-1',
  platformUserId: 'p-usr-1',
  accountType: { name: 'ADVANCED_50K' },
  ...overrides,
});

const liveAccount = (overrides: Record<string, unknown> = {}) => ({
  platformAccountId: 'p-acc-1',
  platformUserId: 'p-usr-1',
  accountName: 'trader@example.com',
  status: 'Active',
  balance: 53000,
  startingBalance: 50000,
  currency: 'USD',
  isLevelUpReached: true,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockSyncFromYPF.mockResolvedValue(undefined);
});

// =============================================================================
// requestUpgrade
// =============================================================================

describe('requestUpgrade', () => {
  it('upgrades an eligible account and reconciles the local challenge', async () => {
    mockAccountFindUnique.mockResolvedValue(linkedAccount());
    mockGetAccount.mockResolvedValue(liveAccount({ isLevelUpReached: true }));
    const upgraded = liveAccount({ status: 'Active', programId: 'prog-funded' });
    mockUpgradeAccount.mockResolvedValue(upgraded);

    const result = await requestUpgrade('acc-1', 'user-1');

    expect(mockUpgradeAccount).toHaveBeenCalledWith('p-usr-1', 'p-acc-1');
    expect(mockSyncFromYPF).toHaveBeenCalledWith({
      localAccountId: 'acc-1',
      liveAccount: upgraded,
    });
    expect(result).toBe(upgraded);
  });

  it('proceeds when isLevelUpReached is absent (permissive — YPF is final authority)', async () => {
    mockAccountFindUnique.mockResolvedValue(linkedAccount());
    mockGetAccount.mockResolvedValue(liveAccount({ isLevelUpReached: undefined }));
    mockUpgradeAccount.mockResolvedValue(liveAccount());

    await requestUpgrade('acc-1', 'user-1');

    expect(mockUpgradeAccount).toHaveBeenCalled();
  });

  it('blocks when YPF reports the level-up has not been reached', async () => {
    mockAccountFindUnique.mockResolvedValue(linkedAccount());
    mockGetAccount.mockResolvedValue(liveAccount({ isLevelUpReached: false }));

    await expect(requestUpgrade('acc-1', 'user-1')).rejects.toBeInstanceOf(
      BadRequestError,
    );
    expect(mockUpgradeAccount).not.toHaveBeenCalled();
  });

  it('blocks when an upgrade has already been requested', async () => {
    mockAccountFindUnique.mockResolvedValue(linkedAccount());
    mockGetAccount.mockResolvedValue(
      liveAccount({ upgradeRequestDate: '2026-06-28T00:00:00Z' }),
    );

    await expect(requestUpgrade('acc-1', 'user-1')).rejects.toBeInstanceOf(
      BadRequestError,
    );
    expect(mockUpgradeAccount).not.toHaveBeenCalled();
  });

  it('blocks when the account is not Active (e.g. already UpgradePending)', async () => {
    mockAccountFindUnique.mockResolvedValue(linkedAccount());
    mockGetAccount.mockResolvedValue(liveAccount({ status: 'UpgradePending' }));

    await expect(requestUpgrade('acc-1', 'user-1')).rejects.toBeInstanceOf(
      BadRequestError,
    );
    expect(mockUpgradeAccount).not.toHaveBeenCalled();
  });

  it('still resolves when the post-upgrade sync fails (poller backstop)', async () => {
    mockAccountFindUnique.mockResolvedValue(linkedAccount());
    mockGetAccount.mockResolvedValue(liveAccount());
    const upgraded = liveAccount();
    mockUpgradeAccount.mockResolvedValue(upgraded);
    mockSyncFromYPF.mockRejectedValue(new Error('sync blew up'));

    const result = await requestUpgrade('acc-1', 'user-1');
    expect(result).toBe(upgraded);
  });

  it('blocks Standard accounts (they require paid activation, not a free upgrade)', async () => {
    mockAccountFindUnique.mockResolvedValue(
      linkedAccount({ accountType: { name: 'STANDARD_25K' } }),
    );

    await expect(requestUpgrade('acc-1', 'user-1')).rejects.toBeInstanceOf(
      BadRequestError,
    );
    expect(mockGetAccount).not.toHaveBeenCalled();
    expect(mockUpgradeAccount).not.toHaveBeenCalled();
  });

  it('throws NotFound when the account is missing', async () => {
    mockAccountFindUnique.mockResolvedValue(null);
    await expect(requestUpgrade('missing', 'user-1')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('throws Forbidden when the account belongs to another user', async () => {
    mockAccountFindUnique.mockResolvedValue(linkedAccount({ userId: 'other' }));
    await expect(requestUpgrade('acc-1', 'user-1')).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(mockGetAccount).not.toHaveBeenCalled();
  });
});

// =============================================================================
// getCheckoutUrl (reset / activation)
// =============================================================================

describe('getCheckoutUrl', () => {
  const program = (overrides: Record<string, unknown> = {}) => ({
    programId: 'prog-1',
    name: '50k Standard',
    initialBalance: 50000,
    currency: 'USD',
    accountResetUrl:
      'https://checkout.dynastyfuturesdyn.com/checkout/?add-to-cart=64',
    activationUrl:
      'https://checkout.dynastyfuturesdyn.com/checkout/?add-to-cart=48&program-activation=1',
    isRequireActivation: true,
    ...overrides,
  });

  it('mints a ref code and appends it to the reset URL', async () => {
    mockAccountFindUnique.mockResolvedValue(linkedAccount());
    mockGetAccount.mockResolvedValue(liveAccount({ programId: 'prog-1' }));
    mockGetProgram.mockResolvedValue(program());
    mockGetRefCode.mockResolvedValue('REF123');

    const { url } = await getCheckoutUrl('acc-1', 'user-1', 'reset');

    expect(mockGetProgram).toHaveBeenCalledWith('prog-1');
    expect(mockGetRefCode).toHaveBeenCalledWith('p-usr-1', 'p-acc-1');
    // `add-to-cart` MUST be stripped (it causes the checkout↔cart redirect
    // loop); the ypf-ref binds the product itself.
    expect(url).toBe(
      'https://checkout.dynastyfuturesdyn.com/checkout/?ypf-ref=REF123',
    );
    expect(url).not.toContain('add-to-cart');
  });

  it('uses the activation URL for activation purpose (keeps discriminator, drops add-to-cart)', async () => {
    mockAccountFindUnique.mockResolvedValue(linkedAccount());
    mockGetAccount.mockResolvedValue(liveAccount({ programId: 'prog-1' }));
    mockGetProgram.mockResolvedValue(program());
    mockGetRefCode.mockResolvedValue('REF123');

    const { url } = await getCheckoutUrl('acc-1', 'user-1', 'activation');

    expect(url).not.toContain('add-to-cart');
    expect(url).toContain('program-activation=1');
    expect(url).toContain('ypf-ref=REF123');
  });

  it('blocks when the program has no URL for the requested purpose', async () => {
    mockAccountFindUnique.mockResolvedValue(linkedAccount());
    mockGetAccount.mockResolvedValue(liveAccount({ programId: 'prog-1' }));
    mockGetProgram.mockResolvedValue(
      program({ activationUrl: undefined, isRequireActivation: false }),
    );

    await expect(
      getCheckoutUrl('acc-1', 'user-1', 'activation'),
    ).rejects.toBeInstanceOf(BadRequestError);
    expect(mockGetRefCode).not.toHaveBeenCalled();
  });

  it('surfaces a retryable error when YPF fails to mint a ref code (N/A → null)', async () => {
    mockAccountFindUnique.mockResolvedValue(linkedAccount());
    mockGetAccount.mockResolvedValue(liveAccount({ programId: 'prog-1' }));
    mockGetProgram.mockResolvedValue(program());
    mockGetRefCode.mockResolvedValue(null);

    await expect(
      getCheckoutUrl('acc-1', 'user-1', 'reset'),
    ).rejects.toBeInstanceOf(ServiceUnavailableError);
  });

  it('throws NotFound when the account is missing', async () => {
    mockAccountFindUnique.mockResolvedValue(null);
    await expect(
      getCheckoutUrl('missing', 'user-1', 'reset'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws Forbidden when the account belongs to another user', async () => {
    mockAccountFindUnique.mockResolvedValue(linkedAccount({ userId: 'other' }));
    await expect(
      getCheckoutUrl('acc-1', 'user-1', 'reset'),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(mockGetAccount).not.toHaveBeenCalled();
  });
});
