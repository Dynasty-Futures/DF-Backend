/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PlatformAccountHeader, PlatformBulkEnableDisableResult } from '../../types';

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
