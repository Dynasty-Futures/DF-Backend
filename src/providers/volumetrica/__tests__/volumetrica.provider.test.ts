import type {
  PlatformAccountHeader,
  PlatformBulkEnableDisableResult,
  PlatformSubscriptionResult,
} from '../../types';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
const mockDel = jest.fn();
const mockGetPaged = jest.fn();

jest.mock('../volumetrica.client', () => ({
  VolumetricaClient: jest.fn().mockImplementation(() => ({
    get: mockGet,
    post: mockPost,
    put: mockPut,
    del: mockDel,
    getPaged: mockGetPaged,
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

import { VolumetricaProvider } from '../volumetrica.provider';

// ── Helpers ────────────────────────────────────────────────────────────────

const makeVolAccountHeader = (overrides: Record<string, unknown> = {}) => ({
  accountId: 'acc-123',
  id: 1,
  displayId: 'D-001',
  header: 'Test Account',
  description: 'A test account',
  currency: 1, // USD
  startBalance: 50000,
  balance: 48000,
  maximumBalance: 50000,
  minimumBalance: 47000,
  sessionNumbers: 5,
  enabled: true,
  mode: 0, // Evaluation
  status: 1, // Enabled
  tradingPermission: 0, // Trading
  visibility: 0, // Default
  creationDate: '2026-01-01T00:00:00Z',
  disableDate: null,
  endDate: null,
  tradingRuleId: 'rule-1',
  accountFamilyId: null,
  reason: null,
  ownerUser: {
    userId: 'user-1',
    fullName: 'Test User',
    username: 'testuser',
    email: 'test@test.com',
    extEntityId: 'ext-1',
  },
  ...overrides,
});

const makeVolBulkOrder = (overrides: Record<string, unknown> = {}) => ({
  orderId: 100,
  contractId: 200,
  symbolName: 'ESZ4',
  status: 2, // Filled
  ordType: 0, // Market
  insertDtUtc: '2026-03-01T10:00:00Z',
  executeDtUtc: '2026-03-01T10:00:01Z',
  cancelDtUtc: null,
  insertPrice: 5000.25,
  executePrice: 5000.5,
  totalQty: 2,
  filledQty: 2,
  modified: false,
  source: 0, // Client
  reason: 1, // Submission_Order
  ...overrides,
});

const makeVolBulkTransaction = (overrides: Record<string, unknown> = {}) => ({
  transactionId: 500,
  accountId: 1,
  utc: '2026-03-01T12:00:00Z',
  type: 1, // Deposit
  description: 'Initial deposit',
  amount: 50000,
  ...overrides,
});

const makeVolBulkEnableDisableResult = (overrides: Record<string, unknown> = {}) => ({
  accountId: 'acc-123',
  success: true,
  errorMessage: null,
  errorCode: 0,
  ...overrides,
});

// ── Tests ──────────────────────────────────────────────────────────────────

let provider: VolumetricaProvider;

beforeEach(() => {
  jest.clearAllMocks();
  provider = new VolumetricaProvider();
});

// ── listAccountsByRule ──────────────────────────────────────────────────

describe('listAccountsByRule', () => {
  it('calls correct API path with ruleId', async () => {
    mockGet.mockResolvedValue([makeVolAccountHeader()]);
    await provider.listAccountsByRule({ ruleId: 'rule-1' });
    expect(mockGet).toHaveBeenCalledWith('/api/v2/Propsite/TradingAccount/ListByRuleId', {
      ruleId: 'rule-1',
    });
  });

  it('includes includeDisabled when provided', async () => {
    mockGet.mockResolvedValue([]);
    await provider.listAccountsByRule({ ruleId: 'rule-1', includeDisabled: true });
    expect(mockGet).toHaveBeenCalledWith('/api/v2/Propsite/TradingAccount/ListByRuleId', {
      ruleId: 'rule-1',
      includeDisabled: true,
    });
  });

  it('maps VolAccountHeader to PlatformAccountHeader', async () => {
    mockGet.mockResolvedValue([makeVolAccountHeader()]);
    const result = await provider.listAccountsByRule({ ruleId: 'rule-1' });
    expect(result).toHaveLength(1);
    const acc: PlatformAccountHeader = result[0]!;
    expect(acc.platformAccountId).toBe('acc-123');
    expect(acc.status).toBe('Enabled');
    expect(acc.tradingPermission).toBe('Trading');
    expect(acc.visibility).toBe('Default');
    expect(acc.currency).toBe('USD');
    expect(acc.owner?.email).toBe('test@test.com');
  });
});

// ── getHistoricalOrders ──────────────────────────────────────────────────

describe('getHistoricalOrders', () => {
  it('calls correct API path with required params', async () => {
    mockGet.mockResolvedValue([makeVolBulkOrder()]);
    const start = new Date('2026-03-01T00:00:00Z');
    await provider.getHistoricalOrders('acc-1', start);
    expect(mockGet).toHaveBeenCalledWith('/api/v2/Propsite/TradingAccount/HistoricalOrders', {
      accountId: 'acc-1',
      startDt: start.toISOString(),
    });
  });

  it('includes optional endDt and filterStatus', async () => {
    mockGet.mockResolvedValue([]);
    const start = new Date('2026-03-01T00:00:00Z');
    const end = new Date('2026-03-02T00:00:00Z');
    await provider.getHistoricalOrders('acc-1', start, end, 'Filled');
    expect(mockGet).toHaveBeenCalledWith('/api/v2/Propsite/TradingAccount/HistoricalOrders', {
      accountId: 'acc-1',
      startDt: start.toISOString(),
      endDt: end.toISOString(),
      filterStatus: 2, // Filled
    });
  });

  it('maps VolBulkOrder to PlatformBulkOrder', async () => {
    mockGet.mockResolvedValue([makeVolBulkOrder()]);
    const result = await provider.getHistoricalOrders('acc-1', new Date());
    expect(result).toHaveLength(1);
    const order = result[0]!;
    expect(order.orderId).toBe(100);
    expect(order.status).toBe('Filled');
    expect(order.orderType).toBe('Market');
    expect(order.insertedAt).toBeInstanceOf(Date);
    expect(order.executedAt).toBeInstanceOf(Date);
    expect(order.cancelledAt).toBeUndefined();
    expect(order.source).toBe('Client');
    expect(order.reason).toBe('Submission_Order');
  });
});

// ── getHistoricalTransactions ────────────────────────────────────────────

describe('getHistoricalTransactions', () => {
  it('calls correct API path with required params', async () => {
    mockGet.mockResolvedValue([makeVolBulkTransaction()]);
    const start = new Date('2026-03-01T00:00:00Z');
    await provider.getHistoricalTransactions('acc-1', start);
    expect(mockGet).toHaveBeenCalledWith(
      '/api/v2/Propsite/TradingAccount/HistoricalTransactions',
      {
        accountId: 'acc-1',
        startDt: start.toISOString(),
      },
    );
  });

  it('includes optional endDt', async () => {
    mockGet.mockResolvedValue([]);
    const start = new Date('2026-03-01T00:00:00Z');
    const end = new Date('2026-03-02T00:00:00Z');
    await provider.getHistoricalTransactions('acc-1', start, end);
    expect(mockGet).toHaveBeenCalledWith(
      '/api/v2/Propsite/TradingAccount/HistoricalTransactions',
      {
        accountId: 'acc-1',
        startDt: start.toISOString(),
        endDt: end.toISOString(),
      },
    );
  });

  it('maps VolBulkTransaction to PlatformBulkTransaction', async () => {
    mockGet.mockResolvedValue([makeVolBulkTransaction()]);
    const result = await provider.getHistoricalTransactions('acc-1', new Date());
    expect(result).toHaveLength(1);
    const txn = result[0]!;
    expect(txn.transactionId).toBe(500);
    expect(txn.type).toBe('Deposit');
    expect(txn.occurredAt).toBeInstanceOf(Date);
    expect(txn.amount).toBe(50000);
    expect(txn.description).toBe('Initial deposit');
  });
});

// ── getEnabledAccountIds ─────────────────────────────────────────────────

describe('getEnabledAccountIds', () => {
  it('calls correct API path', async () => {
    mockGet.mockResolvedValue(['acc-1', 'acc-2']);
    const result = await provider.getEnabledAccountIds();
    expect(mockGet).toHaveBeenCalledWith('/api/v2/Propsite/TradingAccount/EnabledAccountsId');
    expect(result).toEqual(['acc-1', 'acc-2']);
  });

  it('returns empty array when no accounts', async () => {
    mockGet.mockResolvedValue([]);
    const result = await provider.getEnabledAccountIds();
    expect(result).toEqual([]);
  });
});

// ── bulkEnableAccounts ───────────────────────────────────────────────────

describe('bulkEnableAccounts', () => {
  it('sends correct body with enum conversions', async () => {
    mockPost.mockResolvedValue([makeVolBulkEnableDisableResult()]);
    await provider.bulkEnableAccounts({
      ruleReference: 'Organization',
      ruleId: 'rule-1',
      tradingPermission: 'Trading',
      visibility: 'Visible',
    });
    expect(mockPost).toHaveBeenCalledWith('/api/v2/Propsite/TradingAccount/EnableBulk', {
      tradingRuleReference: 1, // Organization
      ruleId: 'rule-1',
      tradingPermission: 0, // Trading
      visibility: 2, // Visible
    });
  });

  it('omits undefined optional params', async () => {
    mockPost.mockResolvedValue([]);
    await provider.bulkEnableAccounts({});
    expect(mockPost).toHaveBeenCalledWith('/api/v2/Propsite/TradingAccount/EnableBulk', {});
  });

  it('maps results correctly', async () => {
    mockPost.mockResolvedValue([
      makeVolBulkEnableDisableResult(),
      makeVolBulkEnableDisableResult({
        accountId: 'acc-456',
        success: false,
        errorMessage: 'Account not found',
        errorCode: 404,
      }),
    ]);
    const results = await provider.bulkEnableAccounts({});
    expect(results).toHaveLength(2);
    const success: PlatformBulkEnableDisableResult = results[0]!;
    expect(success.platformAccountId).toBe('acc-123');
    expect(success.success).toBe(true);
    expect(success.errorMessage).toBeUndefined();
    expect(success.errorCode).toBeUndefined();
    const failure: PlatformBulkEnableDisableResult = results[1]!;
    expect(failure.platformAccountId).toBe('acc-456');
    expect(failure.success).toBe(false);
    expect(failure.errorMessage).toBe('Account not found');
    expect(failure.errorCode).toBe(404);
  });
});

// ── bulkDisableAccounts ──────────────────────────────────────────────────

describe('bulkDisableAccounts', () => {
  it('sends correct body with all params', async () => {
    mockPost.mockResolvedValue([]);
    await provider.bulkDisableAccounts({
      ruleReference: 'Application',
      ruleId: 'rule-1',
      reason: 'Max drawdown exceeded',
      forceClose: true,
      visibility: 'Hidden',
    });
    expect(mockPost).toHaveBeenCalledWith('/api/v2/Propsite/TradingAccount/DisableBulk', {
      tradingRuleReference: 0, // Application
      ruleId: 'rule-1',
      reason: 'Max drawdown exceeded',
      forceClose: true,
      visibility: 1, // Hidden
    });
  });

  it('sends forceClose: false when explicitly set', async () => {
    mockPost.mockResolvedValue([]);
    await provider.bulkDisableAccounts({ forceClose: false });
    expect(mockPost).toHaveBeenCalledWith('/api/v2/Propsite/TradingAccount/DisableBulk', {
      forceClose: false,
    });
  });
});

// ── changeAccountStatus ──────────────────────────────────────────────────

describe('changeAccountStatus', () => {
  it('sends correct body with enum conversions', async () => {
    mockPost.mockResolvedValue(makeVolAccountHeader({ status: 8 }));
    await provider.changeAccountStatus({
      accountId: 'acc-1',
      status: 'Disabled',
      tradingPermission: 'ReadOnly',
      reason: 'Failed challenge',
      forceClose: true,
    });
    expect(mockPost).toHaveBeenCalledWith('/api/v2/Propsite/TradingAccount/ChangeStatus', {
      accountId: 'acc-1',
      status: 8, // Disabled
      tradingPermission: 1, // ReadOnly
      reason: 'Failed challenge',
      forceClose: true,
    });
  });

  it('returns mapped PlatformAccountHeader', async () => {
    mockPost.mockResolvedValue(makeVolAccountHeader({ status: 2 }));
    const result = await provider.changeAccountStatus({
      accountId: 'acc-1',
      status: 'ChallengeSuccess',
    });
    expect(result.status).toBe('ChallengeSuccess');
    expect(result.platformAccountId).toBe('acc-123');
  });

  it('omits optional fields when not provided', async () => {
    mockPost.mockResolvedValue(makeVolAccountHeader());
    await provider.changeAccountStatus({ accountId: 'acc-1' });
    expect(mockPost).toHaveBeenCalledWith('/api/v2/Propsite/TradingAccount/ChangeStatus', {
      accountId: 'acc-1',
    });
  });
});

// ── changeAccountPermission ──────────────────────────────────────────────

describe('changeAccountPermission', () => {
  it('sends correct body with required tradingPermission', async () => {
    mockPost.mockResolvedValue(makeVolAccountHeader({ tradingPermission: 3 }));
    await provider.changeAccountPermission({
      accountId: 'acc-1',
      tradingPermission: 'LiquidateOnly',
      forceClose: true,
      reason: 'Risk violation',
    });
    expect(mockPost).toHaveBeenCalledWith('/api/v2/Propsite/TradingAccount/ChangePermission', {
      accountId: 'acc-1',
      tradingPermission: 3, // LiquidateOnly
      forceClose: true,
      reason: 'Risk violation',
    });
  });

  it('returns mapped result with updated permission', async () => {
    mockPost.mockResolvedValue(makeVolAccountHeader({ tradingPermission: 2 }));
    const result = await provider.changeAccountPermission({
      accountId: 'acc-1',
      tradingPermission: 'RiskPause',
    });
    expect(result.tradingPermission).toBe('RiskPause');
  });
});

// ── changeAccountVisibility ──────────────────────────────────────────────

describe('changeAccountVisibility', () => {
  it('sends correct body with visibility enum', async () => {
    mockPost.mockResolvedValue(makeVolAccountHeader({ visibility: 1 }));
    await provider.changeAccountVisibility({
      accountId: 'acc-1',
      visibility: 'Hidden',
    });
    expect(mockPost).toHaveBeenCalledWith('/api/v2/Propsite/TradingAccount/ChangeVisibility', {
      accountId: 'acc-1',
      visibility: 1, // Hidden
    });
  });

  it('omits visibility when not provided', async () => {
    mockPost.mockResolvedValue(makeVolAccountHeader());
    await provider.changeAccountVisibility({ accountId: 'acc-1' });
    expect(mockPost).toHaveBeenCalledWith('/api/v2/Propsite/TradingAccount/ChangeVisibility', {
      accountId: 'acc-1',
    });
  });
});

// ── updateAccountBalance ─────────────────────────────────────────────────

describe('updateAccountBalance', () => {
  it('sends correct body with numeric action enum', async () => {
    mockPost.mockResolvedValue(undefined);
    await provider.updateAccountBalance({
      accountId: 'acc-1',
      action: 'Deposit',
      value: 1000,
    });
    expect(mockPost).toHaveBeenCalledWith('/api/v2/Propsite/TradingAccount/UpdateBalance', {
      accountId: 'acc-1',
      action: 4, // Deposit
      value: 1000,
    });
  });

  it('returns void', async () => {
    mockPost.mockResolvedValue(undefined);
    const result = await provider.updateAccountBalance({ accountId: 'acc-1' });
    expect(result).toBeUndefined();
  });

  it('includes moveDrawdownToThresholdLimit when set', async () => {
    mockPost.mockResolvedValue(undefined);
    await provider.updateAccountBalance({
      accountId: 'acc-1',
      action: 'Set',
      value: 50000,
      moveDrawdownToThresholdLimit: true,
    });
    expect(mockPost).toHaveBeenCalledWith('/api/v2/Propsite/TradingAccount/UpdateBalance', {
      accountId: 'acc-1',
      action: 2, // Set
      value: 50000,
      moveDrawdownToThresholdLimit: true,
    });
  });

  it('includes value: 0 when explicitly set', async () => {
    mockPost.mockResolvedValue(undefined);
    await provider.updateAccountBalance({
      accountId: 'acc-1',
      action: 'Set',
      value: 0,
    });
    expect(mockPost).toHaveBeenCalledWith('/api/v2/Propsite/TradingAccount/UpdateBalance', {
      accountId: 'acc-1',
      action: 2,
      value: 0,
    });
  });
});

// ── changeAccountSchedule ────────────────────────────────────────────────

describe('changeAccountSchedule', () => {
  it('sends correct body with date conversions', async () => {
    mockPost.mockResolvedValue(makeVolAccountHeader());
    const start = new Date('2026-04-01T00:00:00Z');
    const end = new Date('2026-04-30T23:59:59Z');
    await provider.changeAccountSchedule({
      accountId: 'acc-1',
      startDate: start,
      endDate: end,
    });
    expect(mockPost).toHaveBeenCalledWith('/api/v2/Propsite/TradingAccount/ChangeSchedule', {
      accountId: 'acc-1',
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    });
  });

  it('omits dates when not provided', async () => {
    mockPost.mockResolvedValue(makeVolAccountHeader());
    await provider.changeAccountSchedule({ accountId: 'acc-1' });
    expect(mockPost).toHaveBeenCalledWith('/api/v2/Propsite/TradingAccount/ChangeSchedule', {
      accountId: 'acc-1',
    });
  });

  it('returns mapped PlatformAccountHeader', async () => {
    mockPost.mockResolvedValue(makeVolAccountHeader());
    const result = await provider.changeAccountSchedule({ accountId: 'acc-1' });
    expect(result.platformAccountId).toBe('acc-123');
    expect(result.createdAt).toBeInstanceOf(Date);
  });
});

// ── Helpers for Trading + Subscription tests ──────────────────────────────

const makeVolSubscription = (overrides: Record<string, unknown> = {}) => ({
  subscriptionId: 'sub-123',
  confirmationId: 'conf-456',
  status: 1, // Active
  providerStatus: 1, // Enabled
  activation: '2026-03-01T00:00:00Z',
  expiration: '2026-04-01T00:00:00Z',
  dxDataProducts: [1, 2, 3],
  dxAgreementSigned: true,
  dxAgreementLink: 'https://example.com/agreement',
  dxSelfCertification: 'non-pro',
  platform: 0, // VOLUMETRICA_TRADING
  volumetricaPlatform: 'Deepchart',
  volumetricaLicense: 'LIC-001',
  volumetricaDownloadLink: 'https://example.com/download',
  userId: 'user-1',
  lastVersionId: 42,
  ...overrides,
});

// ── cancelOrder ────────────────────────────────────────────────────────────

describe('cancelOrder', () => {
  it('calls correct API path with accountId only', async () => {
    mockPost.mockResolvedValue({ success: true });
    await provider.cancelOrder({ accountId: 'acc-1' });
    expect(mockPost).toHaveBeenCalledWith('/api/v2/Propsite/Trading/CancelOrder', {
      accountId: 'acc-1',
    });
  });

  it('includes orderId and filter when provided', async () => {
    mockPost.mockResolvedValue({ success: true });
    await provider.cancelOrder({
      accountId: 'acc-1',
      orderId: 500,
      filter: 'Buy',
    });
    expect(mockPost).toHaveBeenCalledWith('/api/v2/Propsite/Trading/CancelOrder', {
      accountId: 'acc-1',
      orderId: 500,
      filter: 1, // Buy
    });
  });

  it('returns void', async () => {
    mockPost.mockResolvedValue({ success: true });
    const result = await provider.cancelOrder({ accountId: 'acc-1' });
    expect(result).toBeUndefined();
  });
});

// ── flatPosition ───────────────────────────────────────────────────────────

describe('flatPosition', () => {
  it('calls correct API path with accountId only', async () => {
    mockPost.mockResolvedValue({ success: true });
    await provider.flatPosition({ accountId: 'acc-1' });
    expect(mockPost).toHaveBeenCalledWith('/api/v2/Propsite/Trading/FlatPosition', {
      accountId: 'acc-1',
    });
  });

  it('includes all optional params when provided', async () => {
    mockPost.mockResolvedValue({ success: true });
    await provider.flatPosition({
      accountId: 'acc-1',
      contractId: 100,
      positionId: 200,
      filter: 'Sell',
    });
    expect(mockPost).toHaveBeenCalledWith('/api/v2/Propsite/Trading/FlatPosition', {
      accountId: 'acc-1',
      contractId: 100,
      positionId: 200,
      filter: 2, // Sell
    });
  });

  it('returns void', async () => {
    mockPost.mockResolvedValue({ success: true });
    const result = await provider.flatPosition({ accountId: 'acc-1' });
    expect(result).toBeUndefined();
  });
});

// ── listSubscriptions ──────────────────────────────────────────────────────

describe('listSubscriptions', () => {
  it('calls correct API path with no params', async () => {
    mockGet.mockResolvedValue({
      draw: 0,
      recordsTotal: 0,
      recordsFiltered: 0,
      data: [],
    });
    await provider.listSubscriptions();
    expect(mockGet).toHaveBeenCalledWith('/api/v2/Propsite/Subscription/List', {});
  });

  it('includes filters when provided', async () => {
    mockGet.mockResolvedValue({
      draw: 0,
      recordsTotal: 1,
      recordsFiltered: 1,
      data: [makeVolSubscription()],
    });
    await provider.listSubscriptions({
      status: 'Active',
      platform: 'QUANTOWER',
      skip: 0,
      take: 10,
    });
    expect(mockGet).toHaveBeenCalledWith('/api/v2/Propsite/Subscription/List', {
      subscriptionStatus: 1, // Active
      platform: 1, // QUANTOWER
      skip: 0,
      take: 10,
    });
  });

  it('maps response to ListSubscriptionsResult', async () => {
    mockGet.mockResolvedValue({
      draw: 1,
      recordsTotal: 5,
      recordsFiltered: 3,
      data: [makeVolSubscription()],
    });
    const result = await provider.listSubscriptions();
    expect(result.total).toBe(5);
    expect(result.filtered).toBe(3);
    expect(result.subscriptions).toHaveLength(1);
    const sub: PlatformSubscriptionResult = result.subscriptions[0]!;
    expect(sub.subscriptionId).toBe('sub-123');
    expect(sub.status).toBe('Active');
    expect(sub.providerStatus).toBe('Enabled');
    expect(sub.platform).toBe('VOLUMETRICA_TRADING');
    expect(sub.activation).toBeInstanceOf(Date);
    expect(sub.expiration).toBeInstanceOf(Date);
    expect(sub.agreementSigned).toBe(true);
    expect(sub.dataFeedProducts).toEqual([1, 2, 3]);
    expect(sub.downloadLink).toBe('https://example.com/download');
    expect(sub.lastVersionId).toBe(42);
  });

  it('handles null data array', async () => {
    mockGet.mockResolvedValue({
      draw: 0,
      recordsTotal: 0,
      recordsFiltered: 0,
      data: null,
    });
    const result = await provider.listSubscriptions();
    expect(result.subscriptions).toEqual([]);
  });
});

// ── getSubscription ────────────────────────────────────────────────────────

describe('getSubscription', () => {
  it('calls with userId', async () => {
    mockGet.mockResolvedValue(makeVolSubscription());
    await provider.getSubscription({ userId: 'user-1' });
    expect(mockGet).toHaveBeenCalledWith('/api/v2/Propsite/Subscription', {
      userId: 'user-1',
    });
  });

  it('calls with subscriptionId', async () => {
    mockGet.mockResolvedValue(makeVolSubscription());
    await provider.getSubscription({ subscriptionId: 'sub-123' });
    expect(mockGet).toHaveBeenCalledWith('/api/v2/Propsite/Subscription', {
      subscriptionId: 'sub-123',
    });
  });

  it('maps nullable fields correctly', async () => {
    mockGet.mockResolvedValue(
      makeVolSubscription({
        confirmationId: null,
        providerStatus: null,
        activation: null,
        platform: null,
      }),
    );
    const result = await provider.getSubscription({ subscriptionId: 'sub-123' });
    expect(result.confirmationId).toBeUndefined();
    expect(result.providerStatus).toBeUndefined();
    expect(result.activation).toBeUndefined();
    expect(result.platform).toBeUndefined();
  });
});

// ── createSubscription ─────────────────────────────────────────────────────

describe('createSubscription', () => {
  it('sends correct body with required + optional params', async () => {
    mockPost.mockResolvedValue(makeVolSubscription());
    const startDate = new Date('2026-04-01T00:00:00Z');
    await provider.createSubscription({
      userId: 'user-1',
      enabled: true,
      dataFeedProducts: [1, 2],
      platform: 'ATAS',
      startDate,
      durationMonths: 1,
      durationDays: 15,
      volumetricaPlatform: 2,
      forceUserOnboarding: true,
      allowedSelfCertification: 1,
      redirectUrl: 'https://example.com/callback',
    });
    expect(mockPost).toHaveBeenCalledWith('/api/v2/Propsite/Subscription', {
      userId: 'user-1',
      enabled: true,
      dataFeedProducts: [1, 2],
      platform: 2, // ATAS
      startDate: startDate.toISOString(),
      durationMonths: 1,
      durationDays: 15,
      volumetricaPlatform: 2,
      forceUserOnboarding: true,
      allowedSelfCertification: 1,
      redirectUrl: 'https://example.com/callback',
    });
  });

  it('omits optional fields when not provided', async () => {
    mockPost.mockResolvedValue(makeVolSubscription());
    await provider.createSubscription({
      userId: 'user-1',
      enabled: false,
    });
    expect(mockPost).toHaveBeenCalledWith('/api/v2/Propsite/Subscription', {
      userId: 'user-1',
      enabled: false,
    });
  });

  it('returns mapped PlatformSubscriptionResult', async () => {
    mockPost.mockResolvedValue(makeVolSubscription());
    const result = await provider.createSubscription({
      userId: 'user-1',
      enabled: true,
    });
    expect(result.subscriptionId).toBe('sub-123');
    expect(result.status).toBe('Active');
  });
});

// ── updateSubscription ─────────────────────────────────────────────────────

describe('updateSubscription', () => {
  it('calls PUT with subscriptionId in query string', async () => {
    mockPut.mockResolvedValue(makeVolSubscription());
    await provider.updateSubscription('sub-123', {
      userId: 'user-1',
      enabled: true,
    });
    expect(mockPut).toHaveBeenCalledWith(
      '/api/v2/Propsite/Subscription?subscriptionId=sub-123',
      {
        userId: 'user-1',
        enabled: true,
      },
    );
  });

  it('returns mapped subscription', async () => {
    mockPut.mockResolvedValue(makeVolSubscription({ status: 2 }));
    const result = await provider.updateSubscription('sub-123', {
      userId: 'user-1',
      enabled: true,
    });
    expect(result.status).toBe('Scheduled');
  });
});

// ── deleteSubscription ─────────────────────────────────────────────────────

describe('deleteSubscription', () => {
  it('calls DEL with subscriptionId in query string', async () => {
    mockDel.mockResolvedValue(undefined);
    await provider.deleteSubscription('sub-123');
    expect(mockDel).toHaveBeenCalledWith(
      '/api/v2/Propsite/Subscription?subscriptionId=sub-123',
    );
  });

  it('returns void', async () => {
    mockDel.mockResolvedValue(undefined);
    const result = await provider.deleteSubscription('sub-123');
    expect(result).toBeUndefined();
  });
});

// ── activateSubscription ───────────────────────────────────────────────────

describe('activateSubscription', () => {
  it('calls correct API path with subscriptionId', async () => {
    mockPost.mockResolvedValue(makeVolSubscription({ status: 1 }));
    await provider.activateSubscription('sub-123');
    expect(mockPost).toHaveBeenCalledWith('/api/v2/Propsite/Subscription/Active', {
      subscriptionId: 'sub-123',
    });
  });

  it('returns mapped subscription', async () => {
    mockPost.mockResolvedValue(makeVolSubscription({ status: 1 }));
    const result = await provider.activateSubscription('sub-123');
    expect(result.status).toBe('Active');
  });
});

// ── confirmSubscription ────────────────────────────────────────────────────

describe('confirmSubscription', () => {
  it('sends both subscriptionId and confirmationId', async () => {
    mockPost.mockResolvedValue(makeVolSubscription());
    await provider.confirmSubscription({
      subscriptionId: 'sub-123',
      confirmationId: 'conf-456',
    });
    expect(mockPost).toHaveBeenCalledWith('/api/v2/Propsite/Subscription/Confirm', {
      subscriptionId: 'sub-123',
      confirmationId: 'conf-456',
    });
  });

  it('returns mapped subscription', async () => {
    mockPost.mockResolvedValue(makeVolSubscription());
    const result = await provider.confirmSubscription({
      subscriptionId: 'sub-123',
      confirmationId: 'conf-456',
    });
    expect(result.subscriptionId).toBe('sub-123');
    expect(result.confirmationId).toBe('conf-456');
  });
});

// ── deactivateSubscription ─────────────────────────────────────────────────

describe('deactivateSubscription', () => {
  it('calls correct API path', async () => {
    mockPost.mockResolvedValue(makeVolSubscription({ status: 0 }));
    await provider.deactivateSubscription('sub-123');
    expect(mockPost).toHaveBeenCalledWith('/api/v2/Propsite/Subscription/Deactive', {
      subscriptionId: 'sub-123',
    });
  });

  it('returns mapped subscription with Disabled status', async () => {
    mockPost.mockResolvedValue(makeVolSubscription({ status: 0 }));
    const result = await provider.deactivateSubscription('sub-123');
    expect(result.status).toBe('Disabled');
  });
});

// ── bulkDeactivateSubscriptions ────────────────────────────────────────────

describe('bulkDeactivateSubscriptions', () => {
  it('sends correct body', async () => {
    mockPost.mockResolvedValue({
      success: true,
      subscriptionDeactivated: [],
      subscriptionErrors: [],
    });
    await provider.bulkDeactivateSubscriptions({
      includeWithActiveTradingAccounts: true,
      considerScheduledTradingAccountAsActive: false,
    });
    expect(mockPost).toHaveBeenCalledWith('/api/v2/Propsite/Subscription/BulkDeactive', {
      includeWithActiveTradingAccounts: true,
      considerScheduledTradingAccountAsActive: false,
    });
  });

  it('maps deactivated and error subscriptions', async () => {
    mockPost.mockResolvedValue({
      success: true,
      subscriptionDeactivated: [makeVolSubscription({ status: 0 })],
      subscriptionErrors: [makeVolSubscription({ subscriptionId: 'sub-err', status: 5 })],
    });
    const result = await provider.bulkDeactivateSubscriptions({
      includeWithActiveTradingAccounts: false,
      considerScheduledTradingAccountAsActive: false,
    });
    expect(result.success).toBe(true);
    expect(result.deactivated).toHaveLength(1);
    expect(result.deactivated[0]!.status).toBe('Disabled');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.subscriptionId).toBe('sub-err');
    expect(result.errors[0]!.status).toBe('Error');
  });

  it('handles null arrays in response', async () => {
    mockPost.mockResolvedValue({
      success: false,
      subscriptionDeactivated: null,
      subscriptionErrors: null,
    });
    const result = await provider.bulkDeactivateSubscriptions({
      includeWithActiveTradingAccounts: false,
      considerScheduledTradingAccountAsActive: false,
    });
    expect(result.success).toBe(false);
    expect(result.deactivated).toEqual([]);
    expect(result.errors).toEqual([]);
  });
});

// ── listAccounts ──────────────────────────────────────────────────────────

describe('listAccounts', () => {
  it('calls correct API path with no params', async () => {
    mockGet.mockResolvedValue({ draw: 0, recordsTotal: 0, recordsFiltered: 0, data: [] });
    await provider.listAccounts();
    expect(mockGet).toHaveBeenCalledWith('/api/v2/Propsite/TradingAccount/List', {});
  });

  it('includes all filter params with enum conversion', async () => {
    mockGet.mockResolvedValue({ draw: 0, recordsTotal: 1, recordsFiltered: 1, data: [makeVolAccountHeader()] });
    await provider.listAccounts({
      mode: 'Evaluation',
      status: 'Enabled',
      permission: 'Trading',
      familyId: 'fam-1',
      groupUniverseId: 'gu-1',
      tradingRuleId: 'rule-1',
      filter: 'test',
      skip: 0,
      take: 10,
    });
    expect(mockGet).toHaveBeenCalledWith('/api/v2/Propsite/TradingAccount/List', {
      mode: 0,
      status: 1,
      permission: 0,
      familyId: 'fam-1',
      groupUniverseId: 'gu-1',
      tradingRuleId: 'rule-1',
      filter: 'test',
      skip: 0,
      take: 10,
    });
  });

  it('maps response to ListAccountsResult', async () => {
    mockGet.mockResolvedValue({
      draw: 1, recordsTotal: 5, recordsFiltered: 3,
      data: [makeVolAccountHeader()],
    });
    const result = await provider.listAccounts();
    expect(result.total).toBe(5);
    expect(result.filtered).toBe(3);
    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0]!.platformAccountId).toBe('acc-123');
  });

  it('handles null data array', async () => {
    mockGet.mockResolvedValue({ draw: 0, recordsTotal: 0, recordsFiltered: 0, data: null });
    const result = await provider.listAccounts();
    expect(result.accounts).toEqual([]);
  });
});

// ── listUsers ─────────────────────────────────────────────────────────────

const makeVolUser = (overrides: Record<string, unknown> = {}) => ({
  id: 'user-1',
  organizationStatus: 1,
  userName: 'testuser',
  email: 'test@test.com',
  firstName: 'Test',
  lastName: 'User',
  mobilePhone: '+1234567890',
  address: '123 Main St',
  postalCode: '12345',
  city: 'New York',
  state: 'NY',
  country: 'US',
  fiscalCode: null,
  birthday: '1990-01-01T00:00:00Z',
  nodeIndex: 0,
  webAccessDisabled: false,
  culture: null,
  theme: null,
  creationUtc: '2026-01-01T00:00:00Z',
  updateUtc: '2026-01-15T00:00:00Z',
  overrideWebPlatform: false,
  userType: 0,
  systemAccess: null,
  extEntityId: 'ext-1',
  wssAllowedIP: null,
  ...overrides,
});

describe('listUsers', () => {
  it('calls correct API path with no params', async () => {
    mockGet.mockResolvedValue({ draw: 0, recordsTotal: 0, recordsFiltered: 0, data: [] });
    await provider.listUsers();
    expect(mockGet).toHaveBeenCalledWith('/api/v2/Propsite/User/List', {});
  });

  it('includes filters when provided', async () => {
    mockGet.mockResolvedValue({ draw: 0, recordsTotal: 1, recordsFiltered: 1, data: [makeVolUser()] });
    await provider.listUsers({
      userType: 0,
      organizationStatus: 1,
      subscriptionStatus: 'Active',
      platform: 'QUANTOWER',
      filter: 'test',
      skip: 0,
      take: 25,
    });
    expect(mockGet).toHaveBeenCalledWith('/api/v2/Propsite/User/List', {
      userType: 0,
      organizationStatus: 1,
      subscriptionStatus: 1,
      platform: 1,
      filter: 'test',
      skip: 0,
      take: 25,
    });
  });

  it('maps response to ListUsersResult', async () => {
    mockGet.mockResolvedValue({
      draw: 1, recordsTotal: 10, recordsFiltered: 5,
      data: [makeVolUser()],
    });
    const result = await provider.listUsers();
    expect(result.total).toBe(10);
    expect(result.filtered).toBe(5);
    expect(result.users).toHaveLength(1);
    expect(result.users[0]!.platformUserId).toBe('user-1');
    expect(result.users[0]!.email).toBe('test@test.com');
  });
});

// ── getCurrencyRates ──────────────────────────────────────────────────────

describe('getCurrencyRates', () => {
  it('calls correct API path and maps response', async () => {
    mockGet.mockResolvedValue([
      { baseCurrency: 1, conversionCurrency: 0, frequencyUpdate: 1, exchangeRate: 0.92, spreadType: 0, spread: 0.001, lastUpdate: '2026-03-01T00:00:00Z' },
    ]);
    const result = await provider.getCurrencyRates();
    expect(mockGet).toHaveBeenCalledWith('/api/v2/Propsite/CurrencyRates');
    expect(result).toHaveLength(1);
    expect(result[0]!.baseCurrency).toBe('USD');
    expect(result[0]!.conversionCurrency).toBe('EUR');
    expect(result[0]!.frequencyUpdate).toBe('Daily');
    expect(result[0]!.exchangeRate).toBe(0.92);
    expect(result[0]!.spreadType).toBe('Absolute');
    expect(result[0]!.lastUpdate).toBeInstanceOf(Date);
  });
});

// ── updateCurrencyRates ───────────────────────────────────────────────────

describe('updateCurrencyRates', () => {
  it('sends correct body with currency enum conversion', async () => {
    mockPost.mockResolvedValue(undefined);
    await provider.updateCurrencyRates([
      { baseCurrency: 'USD', conversionCurrency: 'EUR', exchangeRate: 0.93 },
    ]);
    expect(mockPost).toHaveBeenCalledWith('/api/v2/Propsite/CurrencyRates', [
      { baseCurrency: 1, conversionCurrency: 0, exchangeRate: 0.93 },
    ]);
  });
});

// ── getEconomicNews ───────────────────────────────────────────────────────

describe('getEconomicNews', () => {
  it('calls correct API path and maps response', async () => {
    mockGet.mockResolvedValue([
      { eventId: 1, utcUnixMs: 1700000000000, description: 'CPI Release', countryIso: 'US', intensity: 8, inhibit: true },
    ]);
    const result = await provider.getEconomicNews();
    expect(mockGet).toHaveBeenCalledWith('/api/v2/Propsite/EconomicNews');
    expect(result).toHaveLength(1);
    expect(result[0]!.eventId).toBe(1);
    expect(result[0]!.intensity).toBe('High');
    expect(result[0]!.inhibit).toBe(true);
    expect(result[0]!.description).toBe('CPI Release');
    expect(result[0]!.countryIso).toBe('US');
  });

  it('maps null description and countryIso to undefined', async () => {
    mockGet.mockResolvedValue([
      { eventId: 2, utcUnixMs: 1700000000000, description: null, countryIso: null, intensity: 1, inhibit: false },
    ]);
    const result = await provider.getEconomicNews();
    expect(result[0]!.description).toBeUndefined();
    expect(result[0]!.countryIso).toBeUndefined();
    expect(result[0]!.intensity).toBe('Info');
  });
});

// ── updateEconomicNewsInhibit ─────────────────────────────────────────────

describe('updateEconomicNewsInhibit', () => {
  it('sends correct body', async () => {
    mockPost.mockResolvedValue(undefined);
    await provider.updateEconomicNewsInhibit({
      resetAll: false,
      events: [{ eventId: 1, utcUnixMs: 1700000000000, intensity: 'High', inhibit: true }],
    });
    expect(mockPost).toHaveBeenCalledWith('/api/v2/Propsite/EconomicNews', {
      resetAll: false,
      events: [{ eventId: 1, utcUnixMs: 1700000000000, intensity: 8, inhibit: true }],
    });
  });
});

// ── exportTradeListCsv ────────────────────────────────────────────────────

describe('exportTradeListCsv', () => {
  it('calls correct API path with required params', async () => {
    mockGet.mockResolvedValue('tradeId,symbol,side\n1,ESZ4,BUY');
    const start = new Date('2026-03-01T00:00:00Z');
    const result = await provider.exportTradeListCsv({ startDt: start });
    expect(mockGet).toHaveBeenCalledWith('/api/v2/Propsite/Export/TradeListCsv', {
      startDt: start.toISOString(),
    });
    expect(result).toContain('tradeId');
  });

  it('includes optional params', async () => {
    mockGet.mockResolvedValue('csv-data');
    const start = new Date('2026-03-01T00:00:00Z');
    const end = new Date('2026-03-02T00:00:00Z');
    await provider.exportTradeListCsv({ startDt: start, endDt: end, rawPositions: true });
    expect(mockGet).toHaveBeenCalledWith('/api/v2/Propsite/Export/TradeListCsv', {
      startDt: start.toISOString(),
      endDt: end.toISOString(),
      rawPositions: true,
    });
  });
});

// ── listGroupUniverses ────────────────────────────────────────────────────

const makeVolGroupUniverse = (overrides: Record<string, unknown> = {}) => ({
  groupId: 'gu-1',
  description: 'Futures Group',
  organizationReferenceId: 'org-ref-1',
  productType: 0,
  symbolAllowedMode: 0,
  excludeSymbolsNotListed: false,
  inhibitTradeCopier: false,
  exchanges: null,
  symbols: null,
  symbolGroups: null,
  borrowSymbols: null,
  ...overrides,
});

describe('listGroupUniverses', () => {
  it('calls correct API path with no params', async () => {
    mockGet.mockResolvedValue({ draw: 0, recordsTotal: 0, recordsFiltered: 0, data: [] });
    await provider.listGroupUniverses();
    expect(mockGet).toHaveBeenCalledWith('/api/v2/Propsite/GroupUniverse/List', {});
  });

  it('maps response to ListGroupUniversesResult', async () => {
    mockGet.mockResolvedValue({
      draw: 1, recordsTotal: 3, recordsFiltered: 2,
      data: [makeVolGroupUniverse()],
    });
    const result = await provider.listGroupUniverses({ filter: 'test', skip: 0, take: 10 });
    expect(result.total).toBe(3);
    expect(result.filtered).toBe(2);
    expect(result.groupUniverses).toHaveLength(1);
    expect(result.groupUniverses[0]!.groupId).toBe('gu-1');
    expect(result.groupUniverses[0]!.productType).toBe('Future');
    expect(result.groupUniverses[0]!.symbolAllowedMode).toBe('SymbolsListed');
  });
});

// ── getGroupUniverse ──────────────────────────────────────────────────────

describe('getGroupUniverse', () => {
  it('calls correct API path with groupId', async () => {
    mockGet.mockResolvedValue(makeVolGroupUniverse());
    await provider.getGroupUniverse('gu-1');
    expect(mockGet).toHaveBeenCalledWith('/api/v2/Propsite/GroupUniverse', { groupId: 'gu-1' });
  });

  it('maps nested exchanges, symbols, and symbolGroups', async () => {
    mockGet.mockResolvedValue(makeVolGroupUniverse({
      exchanges: [{ exchangeId: 1, commissionsMode: 0, commissions: 2.5, makerCommissions: null, minContractsCalculation: null, minContractsValue: null, multipleContracts: null, minMoneyExpositionUnit: null, minMoneyExpositionValue: null, maxMoneyExpositionUnit: null, maxMoneyExpositionValue: null, leverage: null }],
      symbols: [{ symbolId: 100, margin: 500, commissions: 1.5, makerCommissions: null, maxContracts: 10, maxMoneyExposition: null, leverage: null }],
      symbolGroups: [{ symbolGroupId: 'sg-1', margin: 1000, commissions: null, maxContractsSumMode: null, maxContractsCalculation: null, maxContractsValue: null }],
      borrowSymbols: [200, 300],
    }));
    const result = await provider.getGroupUniverse('gu-1');
    expect(result.exchanges).toHaveLength(1);
    expect(result.exchanges![0]!.exchangeId).toBe(1);
    expect(result.exchanges![0]!.commissions).toBe(2.5);
    expect(result.exchanges![0]!.makerCommissions).toBeUndefined();
    expect(result.symbols).toHaveLength(1);
    expect(result.symbols![0]!.symbolId).toBe(100);
    expect(result.symbols![0]!.margin).toBe(500);
    expect(result.symbolGroups).toHaveLength(1);
    expect(result.symbolGroups![0]!.symbolGroupId).toBe('sg-1');
    expect(result.borrowSymbols).toEqual([200, 300]);
  });
});

// ── createGroupUniverse ───────────────────────────────────────────────────

describe('createGroupUniverse', () => {
  it('sends correct body with required params', async () => {
    mockPost.mockResolvedValue(makeVolGroupUniverse());
    await provider.createGroupUniverse({
      description: 'New Group',
      productType: 0,
      symbolAllowedMode: 2,
    });
    expect(mockPost).toHaveBeenCalledWith('/api/v2/Propsite/GroupUniverse', {
      description: 'New Group',
      productType: 0,
      symbolAllowedMode: 2,
    });
  });

  it('returns mapped PlatformGroupUniverseResult', async () => {
    mockPost.mockResolvedValue(makeVolGroupUniverse());
    const result = await provider.createGroupUniverse({ productType: 0, symbolAllowedMode: 0 });
    expect(result.groupId).toBe('gu-1');
    expect(result.productType).toBe('Future');
  });
});

// ── updateGroupUniverse ───────────────────────────────────────────────────

describe('updateGroupUniverse', () => {
  it('calls PUT with groupId in query string', async () => {
    mockPut.mockResolvedValue(makeVolGroupUniverse());
    await provider.updateGroupUniverse('gu-1', {
      description: 'Updated',
      productType: 0,
      symbolAllowedMode: 1,
    });
    expect(mockPut).toHaveBeenCalledWith(
      '/api/v2/Propsite/GroupUniverse?id=gu-1',
      { description: 'Updated', productType: 0, symbolAllowedMode: 1 },
    );
  });
});

// ── listSymbols ───────────────────────────────────────────────────────────

const makeVolSymbol = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  name: 'ESZ4',
  description: 'E-mini S&P 500',
  exchange: 'CME',
  symbolGroup: 'Indices',
  margin: 500,
  commission: 2.5,
  inhibitTrading: false,
  archived: false,
  adv14D: 1000000,
  adv50D: null,
  adc14D: null,
  forceSubscription: false,
  tickSize: 0.25,
  tickValue: 12.5,
  baseCurrency: 'USD',
  quoteCurrency: null,
  category: 'Futures',
  ...overrides,
});

describe('listSymbols', () => {
  it('calls correct API path and maps response', async () => {
    mockGet.mockResolvedValue([makeVolSymbol()]);
    const result = await provider.listSymbols();
    expect(mockGet).toHaveBeenCalledWith('/api/v2/Propsite/Symbol/List');
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(1);
    expect(result[0]!.name).toBe('ESZ4');
    expect(result[0]!.exchange).toBe('CME');
    expect(result[0]!.tickSize).toBe(0.25);
    expect(result[0]!.tickValue).toBe(12.5);
    expect(result[0]!.adv50D).toBeUndefined();
    expect(result[0]!.quoteCurrency).toBeUndefined();
  });
});

// ── getContractName / getSymbolName ───────────────────────────────────────

describe('getContractName', () => {
  it('calls correct API path with contractId', async () => {
    mockGet.mockResolvedValue('ESZ4');
    const result = await provider.getContractName(100);
    expect(mockGet).toHaveBeenCalledWith('/api/v2/Propsite/Symbol/ContractName', { contractId: 100 });
    expect(result).toBe('ESZ4');
  });
});

describe('getSymbolName', () => {
  it('calls correct API path with contractId', async () => {
    mockGet.mockResolvedValue('E-mini S&P 500');
    const result = await provider.getSymbolName(100);
    expect(mockGet).toHaveBeenCalledWith('/api/v2/Propsite/Symbol/SymbolName', { contractId: 100 });
    expect(result).toBe('E-mini S&P 500');
  });
});

// ── updateTradingRule ─────────────────────────────────────────────────────

describe('updateTradingRule', () => {
  const makeRuleParams = () => ({
    name: 'Standard 50K',
    maxDrawdownMoney: 2500,
    maxDrawdownMode: 0,
    maxDrawdownAction: 1,
    intradayMaxDrawdownMoney: 1250,
    intradayMaxDrawdownAction: 1,
  });

  it('calls PUT with ruleId in query string', async () => {
    mockPut.mockResolvedValue({ ruleId: 'rule-1', description: 'Standard 50K', organizationReferenceId: null });
    await provider.updateTradingRule('rule-1', makeRuleParams());
    expect(mockPut).toHaveBeenCalledWith(
      '/api/v2/Propsite/TradingRule?id=rule-1',
      expect.objectContaining({ description: 'Standard 50K' }),
    );
  });

  it('returns mapped PlatformTradingRuleResult', async () => {
    mockPut.mockResolvedValue({ ruleId: 'rule-1', description: 'Standard 50K', organizationReferenceId: 'ref-1' });
    const result = await provider.updateTradingRule('rule-1', makeRuleParams());
    expect(result.tradingRuleId).toBe('rule-1');
    expect(result.name).toBe('Standard 50K');
    expect(result.organizationReferenceId).toBe('ref-1');
  });
});

// ── validateTradingRule ───────────────────────────────────────────────────

describe('validateTradingRule', () => {
  it('maps successful validation', async () => {
    mockPost.mockResolvedValue({ success: true, errors: null });
    const result = await provider.validateTradingRule({
      name: 'Test',
      maxDrawdownMoney: 2500,
      maxDrawdownMode: 0,
      maxDrawdownAction: 1,
      intradayMaxDrawdownMoney: 1250,
      intradayMaxDrawdownAction: 1,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it('maps validation errors', async () => {
    mockPost.mockResolvedValue({
      success: false,
      errors: { maxDrawdownMoney: 'Must be positive', extra: null },
    });
    const result = await provider.validateTradingRule({
      name: 'Test',
      maxDrawdownMoney: -1,
      maxDrawdownMode: 0,
      maxDrawdownAction: 1,
      intradayMaxDrawdownMoney: 1250,
      intradayMaxDrawdownAction: 1,
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual({ maxDrawdownMoney: 'Must be positive' });
  });
});

// ── changeTradingRuleGroupUniverse ────────────────────────────────────────

describe('changeTradingRuleGroupUniverse', () => {
  it('sends correct body with enum conversions', async () => {
    mockPost.mockResolvedValue(undefined);
    await provider.changeTradingRuleGroupUniverse({
      ruleId: 'rule-1',
      ruleReference: 'Organization',
      groupId: 'gu-1',
      groupUniverseReference: 'Application',
    });
    expect(mockPost).toHaveBeenCalledWith('/api/v2/Propsite/TradingRule/ChangeGroupUniverse', {
      ruleId: 'rule-1',
      tradingRuleReference: 1,
      groupId: 'gu-1',
      groupUniverseReference: 0,
    });
  });

  it('returns void', async () => {
    mockPost.mockResolvedValue(undefined);
    const result = await provider.changeTradingRuleGroupUniverse({
      ruleId: 'rule-1',
      groupId: 'gu-1',
    });
    expect(result).toBeUndefined();
  });
});

// ── duplicateTradingRule ──────────────────────────────────────────────────

describe('duplicateTradingRule', () => {
  it('sends correct body', async () => {
    mockPost.mockResolvedValue({ ruleId: 'rule-2', description: 'Copy of Standard 50K', organizationReferenceId: 'new-ref' });
    await provider.duplicateTradingRule({
      ruleId: 'rule-1',
      ruleReference: 'Organization',
      newOrganizationRuleId: 'new-ref',
      newDescription: 'Copy of Standard 50K',
    });
    expect(mockPost).toHaveBeenCalledWith('/api/v2/Propsite/TradingRule/Duplicate', {
      ruleId: 'rule-1',
      tradingRuleReference: 1,
      newOrganizationRuleId: 'new-ref',
      newDescription: 'Copy of Standard 50K',
    });
  });

  it('returns mapped PlatformTradingRuleResult', async () => {
    mockPost.mockResolvedValue({ ruleId: 'rule-2', description: 'Dup Rule', organizationReferenceId: null });
    const result = await provider.duplicateTradingRule({ ruleId: 'rule-1' });
    expect(result.tradingRuleId).toBe('rule-2');
    expect(result.name).toBe('Dup Rule');
  });
});

// ── generateTradingToken ──────────────────────────────────────────────────

describe('generateTradingToken', () => {
  it('calls correct API path with body', async () => {
    mockPost.mockResolvedValue({
      tradingWssEndpoint: 'wss://example.com',
      tradingWssToken: 'token-123',
      tradingRestReportHost: 'https://report.example.com',
      tradingRestReportToken: 'rest-token',
      tradingRestTokenExpiration: 3600,
      tradingApiVersion: 2,
    });
    const result = await provider.generateTradingToken({
      login: 'user@test.com',
      password: 'pass123',
      version: 2,
      platform: 'VOLUMETRICA_TRADING',
    });
    expect(mockPost).toHaveBeenCalledWith('/api/v2/Propsite/User/GenerateTradingToken', {
      login: 'user@test.com',
      password: 'pass123',
      version: 2,
      platform: 0,
    });
    expect(result.wssEndpoint).toBe('wss://example.com');
    expect(result.wssToken).toBe('token-123');
    expect(result.tradingApiVersion).toBe(2);
  });

  it('maps null fields to undefined', async () => {
    mockPost.mockResolvedValue({
      tradingWssEndpoint: null, tradingWssToken: null,
      tradingRestReportHost: null, tradingRestReportToken: null,
      tradingRestTokenExpiration: 0, tradingApiVersion: 1,
    });
    const result = await provider.generateTradingToken({ login: 'u', password: 'p' });
    expect(result.wssEndpoint).toBeUndefined();
    expect(result.wssToken).toBeUndefined();
    expect(result.restReportHost).toBeUndefined();
    expect(result.restReportToken).toBeUndefined();
  });
});

// ── authTradingWss ────────────────────────────────────────────────────────

describe('authTradingWss', () => {
  it('calls correct API path and includes data feed fields', async () => {
    mockPost.mockResolvedValue({
      tradingWssEndpoint: 'wss://trade.example.com',
      tradingWssToken: 'wss-token',
      tradingRestReportHost: null,
      tradingRestReportToken: null,
      tradingRestTokenExpiration: 7200,
      tradingApiVersion: 2,
      dataRealtimeEndpoint: 'wss://data.example.com',
      dataToken: 'data-token',
      dataIpfEndpoint: 'https://ipf.example.com',
      dataExchanges: ['CME', 'CBOT'],
    });
    const result = await provider.authTradingWss({
      userId: 'user-1',
      platform: 'QUANTOWER',
      onlyTrading: false,
      ip: '1.2.3.4',
      version: 2,
    });
    expect(mockPost).toHaveBeenCalledWith('/api/v2/Propsite/User/AuthTradingWss', {
      userId: 'user-1',
      platform: 1,
      onlyTrading: false,
      ip: '1.2.3.4',
      version: 2,
    });
    expect(result.wssEndpoint).toBe('wss://trade.example.com');
    expect(result.dataRealtimeEndpoint).toBe('wss://data.example.com');
    expect(result.dataToken).toBe('data-token');
    expect(result.dataExchanges).toEqual(['CME', 'CBOT']);
  });
});

// ── getWebhookModel ───────────────────────────────────────────────────────

describe('getWebhookModel', () => {
  it('calls correct API path and maps response', async () => {
    mockGet.mockResolvedValue({
      dtUtc: '2026-03-01T10:00:00Z',
      category: 0,
      event: 1,
      userId: 'user-1',
      accountId: 'acc-1',
      tradingAccount: { id: 'acc-1' },
      tradingPosition: null,
      subscription: null,
      tradeReport: null,
      tradingPortfolio: null,
      organizationUser: null,
    });
    const result = await provider.getWebhookModel();
    expect(mockGet).toHaveBeenCalledWith('/api/v2/Propsite/Webhook/GetModel');
    expect(result.occurredAt).toBeInstanceOf(Date);
    expect(result.category).toBe('Accounts');
    expect(result.event).toBe('Updated');
    expect(result.userId).toBe('user-1');
    expect(result.tradingAccount).toEqual({ id: 'acc-1' });
    expect(result.tradingPosition).toBeUndefined();
  });
});

// ── getWebhookBulkModel ───────────────────────────────────────────────────

describe('getWebhookBulkModel', () => {
  it('calls correct API path and maps response', async () => {
    mockGet.mockResolvedValue([
      {
        id: 'event-1',
        data: {
          dtUtc: '2026-03-01T10:00:00Z',
          category: 2,
          event: 0,
          userId: null,
          accountId: null,
          tradingAccount: null,
          tradingPosition: null,
          subscription: { subscriptionId: 'sub-1' },
          tradeReport: null,
          tradingPortfolio: null,
          organizationUser: null,
        },
      },
    ]);
    const result = await provider.getWebhookBulkModel();
    expect(mockGet).toHaveBeenCalledWith('/api/v2/Propsite/Webhook/GetBulkModel');
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('event-1');
    expect(result[0]!.data.category).toBe('Subscriptions');
    expect(result[0]!.data.event).toBe('Created');
    expect(result[0]!.data.subscription).toEqual({ subscriptionId: 'sub-1' });
  });
});
