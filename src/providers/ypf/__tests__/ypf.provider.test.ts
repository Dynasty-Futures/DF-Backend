// ── Mocks ──────────────────────────────────────────────────────────────────

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
const mockDel = jest.fn();

jest.mock('../ypf.client', () => ({
  YPFClient: jest.fn().mockImplementation(() => ({
    get: mockGet,
    post: mockPost,
    put: mockPut,
    del: mockDel,
  })),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { YPFProvider } from '../ypf.provider';
import { YPFClient } from '../ypf.client';

// ── Helpers ────────────────────────────────────────────────────────────────

const makeYpfUser = (overrides: Record<string, unknown> = {}) => ({
  id: 'usr-001',
  email: 'trader@example.com',
  state: 'Active',
  kycStatus: 'pending',
  createdAt: '2026-05-01T10:00:00Z',
  updateAt: '2026-05-15T10:00:00Z',
  profile: {
    firstname: 'Sam',
    lastname: 'Tester',
    country: 'US',
    phone: '+15555550100',
  },
  ...overrides,
});

const makeYpfAccount = (overrides: Record<string, unknown> = {}) => ({
  id: 'acc-001',
  userId: 'usr-001',
  programId: 'prog-50k-p1',
  email: 'trader@example.com',
  firstname: 'Sam',
  lastname: 'Tester',
  createdAt: '2026-05-01T10:00:00Z',
  updatedAt: '2026-05-15T10:00:00Z',
  tradeServer: 'Volumetrica',
  login: 'VOL-LOGIN-123',
  password: 'pwd-abc',
  balance: 50000,
  equity: 50000,
  drawDown: 0,
  state: 'Active',
  currency: 'USD',
  extraValues: [
    { Key: 'VolumetricaUserId', Value: 'vol-uuid-deadbeef' },
    { Key: 'VolumetricaAccountId', Value: 'vol-acc-9001' },
  ],
  ...overrides,
});

const makeYpfBreach = (overrides: Record<string, unknown> = {}) => ({
  timestamp: '2026-05-15T14:32:00Z',
  ruleId: 'rule-dl',
  ruleName: 'DailyLoss',
  ruleValue: { value: -1500, threshold: -1000 },
  reasoning: { reason: 'Daily loss exceeded' },
  isSoftBreach: false,
  ...overrides,
});

const makeYpfProgram = (overrides: Record<string, unknown> = {}) => ({
  id: 'prog-50k-p1',
  name: 'Standard 50K Phase 1',
  description: 'Evaluation phase',
  currency: 'USD',
  initialBalance: 50000,
  nextProgramId: 'prog-50k-funded',
  isEnabled: true,
  isWithdrawalAllowed: false,
  createdAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

const makeYpfPayout = (overrides: Record<string, unknown> = {}) => ({
  id: 'payout-001',
  userId: 'usr-001',
  accountId: 'acc-001',
  amount: 2500,
  currency: 'USD',
  state: 'Pending',
  type: 'Rise',
  profitSplit: 90,
  commission: 0,
  transferAmount: 2250,
  createdAt: '2026-05-10T00:00:00Z',
  ...overrides,
});

// ── Suite ──────────────────────────────────────────────────────────────────

describe('YPFProvider', () => {
  let provider: YPFProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new YPFProvider(new YPFClient());
  });

  // ── User ─────────────────────────────────────────────────────────────────

  describe('createUser', () => {
    it('posts the YPF body shape and maps response to PlatformUserResult', async () => {
      mockPost.mockResolvedValueOnce(makeYpfUser());

      const result = await provider.createUser({
        email: 'trader@example.com',
        firstName: 'Sam',
        lastName: 'Tester',
        country: 'US',
        phone: '+15555550100',
      });

      expect(mockPost).toHaveBeenCalledWith('/users', {
        email: 'trader@example.com',
        firstname: 'Sam',
        lastname: 'Tester',
        country: 'US',
        isRegisterUserOnly: true,
        phone: '+15555550100',
      });
      expect(result.platformUserId).toBe('usr-001');
      expect(result.email).toBe('trader@example.com');
      expect(result.firstName).toBe('Sam');
      expect(result.lastName).toBe('Tester');
      expect(result.country).toBe('US');
    });
  });

  describe('getUser', () => {
    it('fetches user by id and maps profile fields', async () => {
      mockGet.mockResolvedValueOnce(makeYpfUser());

      const result = await provider.getUser('usr-001');

      expect(mockGet).toHaveBeenCalledWith('/users/usr-001');
      expect(result.platformUserId).toBe('usr-001');
      expect(result.firstName).toBe('Sam');
      expect(result.phone).toBe('+15555550100');
    });
  });

  // ── Account ──────────────────────────────────────────────────────────────

  describe('createAccount', () => {
    it('requires programId and surfaces extraValues + loginCredentials', async () => {
      mockPost.mockResolvedValueOnce(makeYpfAccount());

      const result = await provider.createAccount({
        platformUserId: 'usr-001',
        programId: 'prog-50k-p1',
        currency: 'USD',
        tradeServer: 'Volumetrica',
      });

      expect(mockPost).toHaveBeenCalledWith('/users/usr-001/accounts', {
        programId: 'prog-50k-p1',
        currency: 'USD',
        mtVersion: 'Volumetrica',
      });
      expect(result.platformAccountId).toBe('acc-001');
      expect(result.platformUserId).toBe('usr-001');
      expect(result.programId).toBe('prog-50k-p1');
      expect(result.loginCredentials).toEqual({
        login: 'VOL-LOGIN-123',
        password: 'pwd-abc',
      });
      // Flat extraValues — VolumetricaUserId is what drives SSO
      expect(result.extraValues).toEqual({
        VolumetricaUserId: 'vol-uuid-deadbeef',
        VolumetricaAccountId: 'vol-acc-9001',
      });
    });

    it('throws if programId is missing', async () => {
      await expect(
        provider.createAccount({
          platformUserId: 'usr-001',
        }),
      ).rejects.toThrow(/programId/);
      expect(mockPost).not.toHaveBeenCalled();
    });
  });

  describe('getAccount', () => {
    it('uses nested URL and maps extraValues into flat record', async () => {
      mockGet.mockResolvedValueOnce(makeYpfAccount());

      const result = await provider.getAccount('usr-001', 'acc-001');

      expect(mockGet).toHaveBeenCalledWith('/users/usr-001/accounts/acc-001');
      expect(result.extraValues?.['VolumetricaUserId']).toBe(
        'vol-uuid-deadbeef',
      );
    });
  });

  describe('listUserAccounts', () => {
    it('maps an array response', async () => {
      mockGet.mockResolvedValueOnce([
        makeYpfAccount(),
        makeYpfAccount({ id: 'acc-002', extraValues: [] }),
      ]);

      const result = await provider.listUserAccounts('usr-001');

      expect(mockGet).toHaveBeenCalledWith('/users/usr-001/accounts');
      expect(result).toHaveLength(2);
      expect(result[0]!.platformAccountId).toBe('acc-001');
      expect(result[1]!.platformAccountId).toBe('acc-002');
      expect(result[1]!.extraValues).toBeUndefined();
    });
  });

  describe('blockAccount', () => {
    it('calls DELETE on the nested URL', async () => {
      mockDel.mockResolvedValueOnce(undefined);

      await provider.blockAccount('usr-001', 'acc-001');

      expect(mockDel).toHaveBeenCalledWith('/users/usr-001/accounts/acc-001');
    });
  });

  describe('manualBreachAccount', () => {
    it('PUTs with ruleName + reason body', async () => {
      mockPut.mockResolvedValueOnce(undefined);

      await provider.manualBreachAccount(
        'usr-001',
        'acc-001',
        'MaxDrawdown',
        'Admin override',
      );

      expect(mockPut).toHaveBeenCalledWith(
        '/users/usr-001/accounts/acc-001/manualbreach',
        { ruleName: 'MaxDrawdown', reason: 'Admin override' },
      );
    });
  });

  describe('updateAccountBalance', () => {
    it('PUTs with amount body', async () => {
      mockPut.mockResolvedValueOnce(undefined);

      await provider.updateAccountBalance('usr-001', 'acc-001', 5000);

      expect(mockPut).toHaveBeenCalledWith(
        '/users/usr-001/accounts/acc-001/balance',
        { amount: 5000 },
      );
    });
  });

  // ── Breaches ─────────────────────────────────────────────────────────────

  describe('getAccountBreaches', () => {
    it('maps soft vs hard severity from isSoftBreach', async () => {
      mockGet.mockResolvedValueOnce([
        makeYpfBreach({ isSoftBreach: false }),
        makeYpfBreach({ isSoftBreach: true, ruleName: 'Consistency' }),
      ]);

      const result = await provider.getAccountBreaches('usr-001', 'acc-001');

      expect(mockGet).toHaveBeenCalledWith(
        '/users/usr-001/accounts/acc-001/breaches',
      );
      expect(result).toHaveLength(2);
      expect(result[0]!.severity).toBe('hard');
      expect(result[0]!.ruleName).toBe('DailyLoss');
      expect(result[0]!.triggeredValue).toBe(-1500);
      expect(result[0]!.thresholdValue).toBe(-1000);
      expect(result[1]!.severity).toBe('soft');
    });
  });

  describe('getTenantBreaches', () => {
    it('joins account IDs into a comma-separated query param', async () => {
      mockGet.mockResolvedValueOnce([]);

      await provider.getTenantBreaches(['acc-001', 'acc-002']);

      expect(mockGet).toHaveBeenCalledWith('/tenant/breaches', {
        accountIds: 'acc-001,acc-002',
      });
    });
  });

  // ── Tenant poll ──────────────────────────────────────────────────────────

  describe('listTenantAccounts', () => {
    it('hits /tenant/accounts and maps array', async () => {
      mockGet.mockResolvedValueOnce([makeYpfAccount()]);

      const result = await provider.listTenantAccounts();

      expect(mockGet).toHaveBeenCalledWith('/tenant/accounts');
      expect(result).toHaveLength(1);
    });
  });

  // ── Programs ─────────────────────────────────────────────────────────────

  describe('listPrograms', () => {
    it('passes name filter when provided', async () => {
      mockGet.mockResolvedValueOnce([makeYpfProgram()]);

      const result = await provider.listPrograms({ name: 'Standard 50K' });

      expect(mockGet).toHaveBeenCalledWith('/programs', {
        name: 'Standard 50K',
      });
      expect(result[0]!.programId).toBe('prog-50k-p1');
      expect(result[0]!.nextProgramId).toBe('prog-50k-funded');
    });
  });

  describe('getProgram', () => {
    it('fetches by id', async () => {
      mockGet.mockResolvedValueOnce(makeYpfProgram());

      const result = await provider.getProgram('prog-50k-p1');

      expect(mockGet).toHaveBeenCalledWith('/programs/prog-50k-p1');
      expect(result.initialBalance).toBe(50000);
    });
  });

  // ── Payouts ──────────────────────────────────────────────────────────────

  describe('createPayout', () => {
    it('posts { type, amount, accountId, payoutDetails } and maps response', async () => {
      mockPost.mockResolvedValueOnce(makeYpfPayout());

      const payoutDetails = {
        accountHolder: 'Jane Doe',
        accountNumber: '123456789',
        swiftBic: 'CHASUS33',
        currency: 'USD',
      };
      const result = await provider.createPayout('usr-001', {
        platformAccountId: 'acc-001',
        amount: 2500,
        currency: 'USD',
        method: 'Rise',
        payoutDetails,
      });

      expect(mockPost).toHaveBeenCalledWith('/users/usr-001/payouts', {
        type: 'Rise',
        amount: 2500,
        accountId: 'acc-001',
        payoutDetails,
      });
      expect(result.platformPayoutId).toBe('payout-001');
      expect(result.status).toBe('Pending');
      expect(result.method).toBe('Rise');
      expect(result.transferAmount).toBe(2250);
      expect(result.profitSplit).toBe(90);
    });
  });

  describe('approvePayout', () => {
    it('PUTs to /payouts/{id}/approve with no body', async () => {
      mockPut.mockResolvedValueOnce(undefined);

      await provider.approvePayout('payout-001');

      expect(mockPut).toHaveBeenCalledWith('/payouts/payout-001/approve');
    });
  });

  describe('rejectPayout', () => {
    it('PUTs reason in body when provided', async () => {
      mockPut.mockResolvedValueOnce(undefined);

      await provider.rejectPayout('payout-001', 'KYC failed');

      expect(mockPut).toHaveBeenCalledWith('/payouts/payout-001/reject', {
        reason: 'KYC failed',
      });
    });
  });

  // ── Data retrieval ───────────────────────────────────────────────────────

  describe('getDailySnapshots', () => {
    it('passes startDate as ISO string', async () => {
      mockGet.mockResolvedValueOnce([
        {
          date: '2026-05-10',
          openBalance: 50000,
          closeBalance: 50800,
          highBalance: 51000,
          lowBalance: 49800,
          dailyPnl: 800,
          totalPnl: 800,
          dailyDrawdown: -0.4,
          currentDrawdown: 0,
          tradesCount: 3,
          winningTrades: 2,
          losingTrades: 1,
        },
      ]);

      const result = await provider.getDailySnapshots(
        'usr-001',
        'acc-001',
        new Date('2026-05-01T00:00:00Z'),
      );

      expect(mockGet).toHaveBeenCalledWith(
        '/users/usr-001/accounts/acc-001/dailydrawdown',
        { startDate: '2026-05-01T00:00:00.000Z' },
      );
      expect(result).toHaveLength(1);
      expect(result[0]!.platformAccountId).toBe('acc-001');
      expect(result[0]!.dailyPnl).toBe(800);
    });
  });

  describe('getHistoricalTrades', () => {
    it('passes startDate and optional endDate', async () => {
      mockGet.mockResolvedValueOnce([
        {
          id: 'trade-1',
          symbol: 'ESZ4',
          side: 'BUY',
          quantity: 1,
          entryPrice: 5000.25,
          exitPrice: 5005.5,
          realizedPnl: 5.25,
          commission: 2.5,
          entryTime: '2026-05-10T13:00:00Z',
          exitTime: '2026-05-10T13:15:00Z',
        },
      ]);

      const result = await provider.getHistoricalTrades(
        'usr-001',
        'acc-001',
        new Date('2026-05-01T00:00:00Z'),
        new Date('2026-05-15T00:00:00Z'),
      );

      expect(mockGet).toHaveBeenCalledWith(
        '/users/usr-001/accounts/acc-001/history',
        {
          startDate: '2026-05-01T00:00:00.000Z',
          endDate: '2026-05-15T00:00:00.000Z',
        },
      );
      expect(result[0]!.externalId).toBe('trade-1');
      expect(result[0]!.symbol).toBe('ESZ4');
      expect(result[0]!.side).toBe('BUY');
    });
  });
});
