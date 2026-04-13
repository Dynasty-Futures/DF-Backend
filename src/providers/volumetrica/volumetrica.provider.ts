// =============================================================================
// Volumetrica Provider — TradingPlatformProvider Adapter
// =============================================================================
// Maps the platform-agnostic TradingPlatformProvider interface to Volumetrica
// Propfirm API V2 endpoints under /api/v2/Propsite/*.
//
// All Volumetrica responses are wrapped in { success: bool, data: T }.
// The VolumetricaClient automatically unwraps this envelope.
// =============================================================================

import type { TradingPlatformProvider } from '../trading-platform.provider.js';
import type {
  CreatePlatformUserParams,
  PlatformUserCreateResult,
  PlatformUserResult,
  UpdatePlatformUserParams,
  InvitePlatformUserParams,
  PlatformInviteResult,
  CreatePlatformAccountParams,
  PlatformAccountResult,
  PlatformReportResult,
  PlatformSnapshotResult,
  PlatformTradeResult,
  IFrameType,
  PaginatedResult,
  PlatformAccountHeader,
  PlatformAccountInfo,
  PlatformAccountLiveSnapshot,
  PlatformAccountOwner,
  PlatformBulkTrade,
  PlatformBulkFill,
  PlatformBulkOrder,
  PlatformBulkTransaction,
  PlatformBulkDailySnapshot,
  PlatformSessionLog,
  CreatePlatformTradingRuleParams,
  PlatformTradingRuleResult,
  ListAccountsByRuleParams,
  ChangeAccountStatusParams,
  ChangeAccountPermissionParams,
  ChangeAccountVisibilityParams,
  UpdateAccountBalanceParams,
  ChangeAccountScheduleParams,
  BulkEnableAccountsParams,
  BulkDisableAccountsParams,
  PlatformBulkEnableDisableResult,
} from '../types.js';
import { VolumetricaClient } from './volumetrica.client.js';
import { logger } from '../../utils/logger.js';

// ── Volumetrica API response shapes (post-unwrap, i.e. the `data` field) ────

/** GET /User response — full user profile */
interface VolUserViewModel {
  id: string | null;
  organizationStatus: number | null;
  userName: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  mobilePhone: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  fiscalCode: string | null;
  birthday: string | null;
  nodeIndex: number | null;
  webAccessDisabled: boolean;
  culture: string | null;
  theme: number | null;
  creationUtc: string;
  updateUtc: string;
  overrideWebPlatform: boolean;
  userType: number;
  systemAccess: number | null;
  extEntityId: string | null;
  wssAllowedIP: string | null;
}

/** POST /User and PUT /User response — userId + generated credentials */
interface VolUserResult {
  userId: string | null;
  username: string | null;
  password: string | null;
  encryptionMode: number;
}

/** POST /User/Invite response */
interface VolInvitationResult {
  userId: string | null;
  status: number;
  inviteUrl: string | null;
  externalId: string | null;
  inviteId: string | null;
}

/** Generic trading account shape returned by most account endpoints */
interface VolAccount {
  id: string;
  userId: string;
  name: string;
  status: string;
  balance: number;
  equity?: number;
  unrealizedPnl?: number;
  margin?: number;
  startingBalance: number;
  currency?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface VolReport {
  accountId: string;
  startDate: string;
  endDate: string;
  totalPnl: number;
  totalTrades: number;
  winRate: number;
  averageWin: number;
  averageLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio?: number;
  bestDay?: number;
  worstDay?: number;
  [key: string]: unknown;
}

interface VolSnapshot {
  accountId: string;
  date: string;
  openBalance: number;
  closeBalance: number;
  highBalance: number;
  lowBalance: number;
  dailyPnl: number;
  totalPnl: number;
  dailyDrawdown: number;
  currentDrawdown: number;
  tradesCount: number;
  winningTrades: number;
  losingTrades: number;
}

interface VolTrade {
  id: string;
  accountId: string;
  symbol: string;
  side: string;
  quantity: number;
  entryPrice: number;
  exitPrice?: number;
  realizedPnl?: number;
  commission: number;
  entryTime: string;
  exitTime?: string;
  metadata?: Record<string, unknown>;
}

// ── Volumetrica Bulk API response shapes ────────────────────────────────────

interface VolAccountHeader {
  accountId: string | null;
  id: number;
  displayId: string | null;
  header: string | null;
  description: string | null;
  currency: number;
  startBalance: number;
  balance: number;
  maximumBalance: number;
  minimumBalance: number;
  sessionNumbers: number;
  enabled: boolean;
  mode: number;
  status: number;
  tradingPermission: number;
  visibility: number;
  creationDate: string;
  disableDate: string | null;
  endDate: string | null;
  tradingRuleId: string | null;
  accountFamilyId: string | null;
  reason: string | null;
  ownerUser: VolOwnerCompact | null;
}

interface VolOwnerCompact {
  userId: string | null;
  fullName: string | null;
  username: string | null;
  email: string | null;
  extEntityId: string | null;
}

interface VolAccountInfoViewModel {
  status: number;
  tradingPermission: number;
  reason: string | null;
  reasonTradingPermission: string | null;
  riskPauseRestoreUtcMs: number | null;
  snapshot: VolSnapshotViewModel;
  tradingRuleId: string | null;
}

interface VolSnapshotViewModel {
  accountId: number;
  currency: number;
  startBalance: number;
  balance: number;
  equity: number | null;
  marginAvailable: number;
  marginUsed: number;
  minimumBalance: number;
  maximumBalance: number;
  intradayStartBalance: number;
  intradayMinimumBalance: number;
  intradayMaximumBalance: number;
  intradayNumberOfTrades: number;
  dailyPL: number;
  dailyNetPL: number;
  stopDrawdownBalance: number | null;
  stopDrawdownIntradayBalance: number | null;
  profitTargetBalance: number | null;
  updateUtc: string;
}

interface VolBulkTrade {
  tradeId: number;
  symbolName: string | null;
  contract: { contractName: string | null } | null;
  entryDate: number;
  exitDate: number;
  entrySessionDate: string;
  exitSessionDate: string;
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  grossPl: number;
  netPl: number;
  convertedGrossPl: number;
  convertedNetPl: number;
  overnight: boolean;
  overweekend: boolean;
  isCloseTrade: boolean;
  maxDrawdown: number | null;
  maxRunup: number | null;
  currency: string | null;
}

interface VolBulkFill {
  fillId: number;
  contractId: number;
  symbolName: string | null;
  executeDtUtc: string;
  sessionDate: string;
  price: number;
  quantity: number;
  commissions: number;
}

interface VolBulkOrder {
  orderId: number;
  contractId: number;
  symbolName: string | null;
  status: number;
  ordType: number;
  insertDtUtc: string;
  executeDtUtc: string | null;
  cancelDtUtc: string | null;
  insertPrice: number;
  executePrice: number | null;
  totalQty: number;
  filledQty: number;
  modified: boolean;
  source: number;
  reason: number;
}

interface VolBulkTransaction {
  transactionId: number;
  accountId: number;
  utc: string;
  type: number;
  description: string | null;
  amount: number;
}

interface VolBulkDailySnapshot {
  accountId: number;
  currency: number;
  startBalance: number;
  balance: number;
  equity: number | null;
  marginAvailable: number;
  marginUsed: number;
  minimumBalance: number;
  maximumBalance: number;
  intradayStartBalance: number;
  intradayMinimumBalance: number;
  intradayMaximumBalance: number;
  intradayNumberOfTrades: number;
  dailyPL: number;
  dailyNetPL: number;
  stopDrawdownBalance: number | null;
  stopDrawdownIntradayBalance: number | null;
  profitTargetBalance: number | null;
  updateUtc: string;
  utcDate: string;
}

interface VolSessionLog {
  sessionId: number;
  appUserId: string | null;
  startUtc: string;
  endUtc: string | null;
  platform: number | null;
  ip: string | null;
}

/** Response item from EnableBulk / DisableBulk */
interface VolBulkEnableDisableResult {
  accountId: string | null;
  success: boolean;
  errorMessage: string | null;
  errorCode: number;
}

// ── Enum maps ─────────────────────────────────────────────────────────────

const ACCOUNT_STATUS_MAP: Record<number, string> = {
  0: 'Initialized',
  1: 'Enabled',
  2: 'ChallengeSuccess',
  4: 'ChallengeFailed',
  8: 'Disabled',
};

const ACCOUNT_MODE_MAP: Record<number, string> = {
  0: 'Evaluation',
  1: 'SimFunded',
  2: 'Funded',
  3: 'Live',
  4: 'Trial',
  5: 'Contest',
  100: 'Training',
};

const TRADING_PERMISSION_MAP: Record<number, string> = {
  0: 'Trading',
  1: 'ReadOnly',
  2: 'RiskPause',
  3: 'LiquidateOnly',
};

const VISIBILITY_MAP: Record<number, string> = {
  0: 'Default',
  1: 'Hidden',
  2: 'Visible',
};

const CURRENCY_MAP: Record<number, string> = {
  0: 'EUR', 1: 'USD', 2: 'AUD', 3: 'GBP', 4: 'XCD', 5: 'XOF',
  6: 'NZD', 7: 'NOK', 8: 'XAF', 9: 'ZAR', 10: 'XPF', 11: 'CLP',
  12: 'DKK', 13: 'INR', 14: 'RUB', 15: 'TRY', 16: 'DZD', 17: 'MRU',
  18: 'MAD', 19: 'ILS', 20: 'JOD', 21: 'BND', 22: 'SGD', 23: 'HKD',
  24: 'CHF', 25: 'ANG', 26: 'SHP', 27: 'FKP', 28: 'CAD', 29: 'BRL',
  30: 'CZK', 31: 'USDT', 32: 'USDC', 33: 'BTC', 34: 'ETH', 35: 'JPY',
  36: 'SEK', 37: 'CNH', 38: 'COP', 39: 'HUF', 40: 'KRW', 41: 'MXN',
  42: 'TWD',
};

const ORDER_STATUS_MAP: Record<number, string> = {
  0: 'Cancelled',
  1: 'Working',
  2: 'Filled',
  3: 'Rejected',
};

const ORDER_TYPE_MAP: Record<number, string> = {
  0: 'Market',
  1: 'Limit',
  2: 'Stop',
};

const ORDER_SOURCE_MAP: Record<number, string> = {
  0: 'Client', 1: 'Web', 2: 'Internal', 3: 'Hub', 4: 'Bracket',
  5: 'Client_Manual', 6: 'Client_Auto', 7: 'Client_Copy',
};

const ORDER_REASON_MAP: Record<number, string> = {
  0: 'Unknown', 1: 'Submission_Order', 2: 'Submission_OcoGroup',
  3: 'Submission_Bracket', 10: 'Liquidation_Flat', 11: 'Liquidation_Reverse',
  12: 'Liquidation_Rollover', 13: 'Liquidation_RiskRule',
  14: 'Liquidation_TradingHours', 15: 'Liquidation_AccountStatus',
  16: 'Liquidation_AccountReset', 17: 'Liquidation_AccountPermission',
  99: 'Liquidation_Utility',
};

const TRANSACTION_TYPE_MAP: Record<number, string> = {
  1: 'Deposit', 2: 'Withdrawal', 3: 'BalanceAdjustment',
  4: 'CommissionFee', 5: 'Trade',
};

const PLATFORM_MAP: Record<number, string> = {
  0: 'VOLUMETRICA_TRADING', 1: 'QUANTOWER', 2: 'ATAS',
};

// ── Reverse enum maps (platform-agnostic string → Volumetrica numeric) ────

const REVERSE_ACCOUNT_STATUS: Record<string, number> = {
  Initialized: 0, Enabled: 1, ChallengeSuccess: 2, ChallengeFailed: 4, Disabled: 8,
};

const REVERSE_TRADING_PERMISSION: Record<string, number> = {
  Trading: 0, ReadOnly: 1, RiskPause: 2, LiquidateOnly: 3,
};

const REVERSE_VISIBILITY: Record<string, number> = {
  Default: 0, Hidden: 1, Visible: 2,
};

const REVERSE_BALANCE_ACTION: Record<string, number> = {
  Add: 0, Subtract: 1, Set: 2, Withdraw: 3, Deposit: 4, InternalUpdate: 5,
};

const REVERSE_ORDER_FILTER_STATUS: Record<string, number> = {
  Cancelled: 0, Working: 1, Filled: 2, Rejected: 3,
};

const REVERSE_RULE_REFERENCE: Record<string, number> = {
  Application: 0, Organization: 1, OrganizationOwner: 2,
};

// ── Volumetrica TradingRule response shapes ─────────────────────────────────

interface VolTradingRuleResult {
  ruleId: string | null;
  description: string | null;
  organizationReferenceId: string | null;
}

interface VolTradingRuleListResult {
  data: VolTradingRuleResult[];
  recordsTotal: number;
  recordsFiltered: number;
}

const API = '/api/v2/Propsite';

// Volumetrica IFrame endpoint paths keyed by our IFrameType
const IFRAME_PATHS: Record<IFrameType, string> = {
  dashboard: `${API}/User/IFrame`,
  portfolio: `${API}/User/IFramePortfolio`,
  userGoal: `${API}/User/IFrameUserGoal`,
  economicCalendar: `${API}/User/IFrameEconomicCalendar`,
  webApp: `${API}/User/VolumetricaWebApp`,
};

// =============================================================================
// Provider Implementation
// =============================================================================

export class VolumetricaProvider implements TradingPlatformProvider {
  private readonly client: VolumetricaClient;

  constructor() {
    this.client = new VolumetricaClient();
  }

  // ── User Operations ─────────────────────────────────────────────────────

  /**
   * POST /api/v2/Propsite/User
   * Body: UserInputModel — required: email, firstName, lastName, country
   * Response: UserResult { userId, username, password, encryptionMode }
   */
  async createUser(params: CreatePlatformUserParams): Promise<PlatformUserCreateResult> {
    logger.info({ email: params.email }, 'Volumetrica: creating user');

    const res = await this.client.post<VolUserResult>(`${API}/User`, {
      email: params.email,
      firstName: params.firstName,
      lastName: params.lastName,
      country: params.country,
      ...(params.phone && { mobilePhone: params.phone }),
      ...(params.address && { address: params.address }),
      ...(params.postalCode && { postalCode: params.postalCode }),
      ...(params.city && { city: params.city }),
      ...(params.state && { state: params.state }),
      ...(params.birthday && { birthday: params.birthday.toISOString() }),
      ...(params.language && { language: params.language }),
      ...(params.externalId && { extEntityId: params.externalId }),
    });

    return {
      platformUserId: res.userId ?? '',
      username: res.username ?? undefined,
    };
  }

  /**
   * GET /api/v2/Propsite/User?userId={userId}
   * Response: UserViewModel — full user profile
   */
  async getUser(platformUserId: string): Promise<PlatformUserResult> {
    const user = await this.client.get<VolUserViewModel>(`${API}/User`, {
      userId: platformUserId,
    });
    return this.mapUserViewModel(user);
  }

  /**
   * PUT /api/v2/Propsite/User?userId={userId}
   * Body: UserInputModel (partial update)
   * Response: UserResult { userId, username, password, encryptionMode }
   */
  async updateUser(
    platformUserId: string,
    params: UpdatePlatformUserParams,
  ): Promise<PlatformUserCreateResult> {
    const body: Record<string, unknown> = {};

    if (params.email !== undefined) body['email'] = params.email;
    if (params.firstName !== undefined) body['firstName'] = params.firstName;
    if (params.lastName !== undefined) body['lastName'] = params.lastName;
    if (params.country !== undefined) body['country'] = params.country;
    if (params.phone !== undefined) body['mobilePhone'] = params.phone;
    if (params.address !== undefined) body['address'] = params.address;
    if (params.postalCode !== undefined) body['postalCode'] = params.postalCode;
    if (params.city !== undefined) body['city'] = params.city;
    if (params.state !== undefined) body['state'] = params.state;
    if (params.birthday !== undefined) body['birthday'] = params.birthday.toISOString();
    if (params.language !== undefined) body['language'] = params.language;

    const res = await this.client.put<VolUserResult>(
      `${API}/User?userId=${encodeURIComponent(platformUserId)}`,
      body,
    );

    return {
      platformUserId: res.userId ?? platformUserId,
      username: res.username ?? undefined,
    };
  }

  /**
   * POST /api/v2/Propsite/User/Invite
   * Body: UserOrganizationInviteRequest — required: country
   * Response: UserInvitationResult { userId, status, inviteUrl, externalId, inviteId }
   */
  async inviteUser(params: InvitePlatformUserParams): Promise<PlatformInviteResult> {
    const res = await this.client.post<VolInvitationResult>(
      `${API}/User/Invite`,
      {
        country: params.country,
        ...(params.email && { email: params.email }),
        ...(params.externalId && { externalId: params.externalId }),
      },
    );

    return {
      platformUserId: res.userId ?? '',
      status: res.status,
      inviteUrl: res.inviteUrl ?? undefined,
      externalId: res.externalId ?? undefined,
      inviteId: res.inviteId ?? undefined,
    };
  }

  // ── Account Operations ──────────────────────────────────────────────────

  async createAccount(
    params: CreatePlatformAccountParams,
  ): Promise<PlatformAccountResult> {
    logger.info(
      { platformUserId: params.platformUserId, name: params.accountName },
      'Volumetrica: creating trading account',
    );

    const account = await this.client.post<VolAccount>(
      `${API}/TradingAccount`,
      {
        userId: params.platformUserId,
        name: params.accountName,
        startingBalance: params.startingBalance,
        ...(params.groupId && { groupId: params.groupId }),
        ...(params.currency && { currency: params.currency }),
      },
    );

    return this.mapAccount(account);
  }

  async getAccount(platformAccountId: string): Promise<PlatformAccountResult> {
    const account = await this.client.get<VolAccount>(
      `${API}/TradingAccount`,
      { id: platformAccountId },
    );
    return this.mapAccount(account);
  }

  async getAccountsByUser(
    platformUserId: string,
  ): Promise<PlatformAccountResult[]> {
    const accounts = await this.client.get<VolAccount[]>(
      `${API}/TradingAccount/ListByUserId`,
      { userId: platformUserId },
    );
    return accounts.map((a) => this.mapAccount(a));
  }

  async enableAccount(
    platformAccountId: string,
  ): Promise<PlatformAccountResult> {
    const account = await this.client.post<VolAccount>(
      `${API}/TradingAccount/Enable`,
      { id: platformAccountId },
    );
    return this.mapAccount(account);
  }

  async disableAccount(
    platformAccountId: string,
    reason?: string,
  ): Promise<PlatformAccountResult> {
    const account = await this.client.post<VolAccount>(
      `${API}/TradingAccount/Disable`,
      { id: platformAccountId, ...(reason && { reason }) },
    );
    return this.mapAccount(account);
  }

  async resetAccount(
    platformAccountId: string,
  ): Promise<PlatformAccountResult> {
    logger.info({ platformAccountId }, 'Volumetrica: resetting account');

    const account = await this.client.post<VolAccount>(
      `${API}/TradingAccount/Reset`,
      { id: platformAccountId },
    );
    return this.mapAccount(account);
  }

  async deleteAccount(platformAccountId: string): Promise<void> {
    logger.info({ platformAccountId }, 'Volumetrica: deleting account');

    await this.client.del(`${API}/TradingAccount?id=${platformAccountId}`);
  }

  // ── Data Retrieval ──────────────────────────────────────────────────────

  async getAccountReport(
    platformAccountId: string,
    startDt: Date,
    endDt?: Date,
  ): Promise<PlatformReportResult> {
    const report = await this.client.get<VolReport>(
      `${API}/TradingAccount/Report`,
      {
        id: platformAccountId,
        startDt: startDt.toISOString(),
        ...(endDt && { endDt: endDt.toISOString() }),
      },
    );

    return {
      platformAccountId: report.accountId,
      startDate: new Date(report.startDate),
      endDate: new Date(report.endDate),
      totalPnl: report.totalPnl,
      totalTrades: report.totalTrades,
      winRate: report.winRate,
      averageWin: report.averageWin,
      averageLoss: report.averageLoss,
      profitFactor: report.profitFactor,
      maxDrawdown: report.maxDrawdown,
      maxDrawdownPercent: report.maxDrawdownPercent,
      sharpeRatio: report.sharpeRatio,
      bestDay: report.bestDay,
      worstDay: report.worstDay,
      raw: report,
    };
  }

  async getDailySnapshots(
    platformAccountId: string,
    startDt?: Date,
  ): Promise<PlatformSnapshotResult[]> {
    const snapshots = await this.client.get<VolSnapshot[]>(
      `${API}/TradingAccount/DailySnapshots`,
      {
        id: platformAccountId,
        ...(startDt && { startDt: startDt.toISOString() }),
      },
    );

    return snapshots.map((s) => ({
      platformAccountId: s.accountId,
      date: new Date(s.date),
      openBalance: s.openBalance,
      closeBalance: s.closeBalance,
      highBalance: s.highBalance,
      lowBalance: s.lowBalance,
      dailyPnl: s.dailyPnl,
      totalPnl: s.totalPnl,
      dailyDrawdown: s.dailyDrawdown,
      currentDrawdown: s.currentDrawdown,
      tradesCount: s.tradesCount,
      winningTrades: s.winningTrades,
      losingTrades: s.losingTrades,
    }));
  }

  async getHistoricalTrades(
    platformAccountId: string,
    startDt: Date,
    endDt?: Date,
  ): Promise<PlatformTradeResult[]> {
    const trades = await this.client.get<VolTrade[]>(
      `${API}/TradingAccount/HistoricalTrades`,
      {
        id: platformAccountId,
        startDt: startDt.toISOString(),
        ...(endDt && { endDt: endDt.toISOString() }),
      },
    );

    return trades.map((t) => ({
      externalId: t.id,
      platformAccountId: t.accountId,
      symbol: t.symbol,
      side: t.side.toUpperCase() as 'BUY' | 'SELL',
      quantity: t.quantity,
      entryPrice: t.entryPrice,
      exitPrice: t.exitPrice,
      realizedPnl: t.realizedPnl,
      commission: t.commission,
      entryTime: new Date(t.entryTime),
      exitTime: t.exitTime ? new Date(t.exitTime) : undefined,
      metadata: t.metadata,
    }));
  }

  // ── Login / Dashboard ─────────────────────────────────────────────────

  /**
   * POST /api/v2/Propsite/User/LoginUrl
   * Body: LoginUrlInputModel { userId, accountId?, forceDefaultTheme? }
   * Response: StringApiSuccessDataResponse — data is the URL string
   */
  async getLoginUrl(platformUserId: string): Promise<string> {
    const url = await this.client.post<string>(
      `${API}/User/LoginUrl`,
      { userId: platformUserId },
    );
    return url;
  }

  /**
   * POST /api/v2/Propsite/User/IFrame (or IFramePortfolio, IFrameUserGoal, etc.)
   * Body: LoginUrlInputModel { userId, accountId?, forceDefaultTheme? }
   * Response: StringApiSuccessDataResponse — data is the URL string
   */
  async getIFrameUrl(
    platformUserId: string,
    type: IFrameType = 'dashboard',
    accountId?: string | undefined,
  ): Promise<string> {
    const path = IFRAME_PATHS[type];
    const body: Record<string, unknown> = { userId: platformUserId };
    if (accountId) body['accountId'] = accountId;

    const url = await this.client.post<string>(path, body);
    return url;
  }

  // ── Trading Rule Operations ────────────────────────────────────────

  /**
   * POST /api/v2/Propsite/TradingRule
   * Creates a new trading rule with drawdown, profit target, and consistency settings.
   */
  async createTradingRule(
    params: CreatePlatformTradingRuleParams,
  ): Promise<PlatformTradingRuleResult> {
    logger.info({ name: params.name }, 'Volumetrica: creating trading rule');

    const body: Record<string, unknown> = {
      description: params.name,
      organizationReferenceId: params.organizationReferenceId,
      // Max drawdown (total)
      maxDrawdownMode: params.maxDrawdownMode,
      maxDrawdownMoney: params.maxDrawdownMoney,
      maxDrawdownPercentual: 0,
      maxDrawdownSelection: 0, // Highest
      maxDrawdownAction: params.maxDrawdownAction,
      maxDrawdownTrailingMode: params.maxDrawdownMode === 0 ? 0 : undefined, // Continuous when trailing
      // Intraday (daily) drawdown
      maxIntradayDrawdownMode: 1, // StaticStartBalance — daily loss from session start
      maxIntradayDrawdownMoney: params.intradayMaxDrawdownMoney,
      maxIntradayDrawdownPercentual: 0,
      maxIntradayDrawdownSelection: 0, // Highest
      maxIntradayDrawdownAction: params.intradayMaxDrawdownAction,
      // Min trading days
      minSessionNumbers: params.minSessionNumbers ?? 0,
      // Overnight/weekend
      failOnOvernight: false,
      failOnOverweekend: params.overweekendAction !== undefined && params.overweekendAction !== 0,
    };

    // Profit target (only for evaluation phases)
    if (params.profitTargetMoney !== undefined && params.profitTargetMoney > 0) {
      body['profitTargetAction'] = params.profitTargetAction ?? 0;
      body['profitTargetCalculation'] = 0; // Profit mode
      body['profitTargetMoney'] = params.profitTargetMoney;
      body['profitTargetPercentual'] = 0;
      body['profitTargetSelection'] = 0; // Highest
      body['profitTargetSituation'] = 2; // NoneOrdersAndPositions
    }

    // Consistency rule
    if (params.consistencyPercentual !== undefined && params.consistencyPercentual > 0) {
      body['consistencyAction'] = 1; // Enable
      body['consistencyMode'] = 1; // BestTradingDayTargetRatio
      body['consistencyPercentual'] = params.consistencyPercentual;
    }

    // News restriction
    if (params.newsRestrictionAction !== undefined && params.newsRestrictionAction > 0) {
      body['tradingNewsAction'] = params.newsRestrictionAction;
      body['tradingNewsWindowSeconds'] = 120; // 2 min window around events
    }

    const result = await this.client.post<VolTradingRuleResult>(
      `${API}/TradingRule`,
      body,
    );

    return this.mapTradingRule(result);
  }

  /**
   * GET /api/v2/Propsite/TradingRule?ruleId={id}
   */
  async getTradingRule(ruleId: string): Promise<PlatformTradingRuleResult> {
    const result = await this.client.get<VolTradingRuleResult>(
      `${API}/TradingRule`,
      { ruleId },
    );
    return this.mapTradingRule(result);
  }

  /**
   * GET /api/v2/Propsite/TradingRule/List
   */
  async listTradingRules(): Promise<PlatformTradingRuleResult[]> {
    const result = await this.client.get<VolTradingRuleListResult>(
      `${API}/TradingRule/List`,
    );
    return result.data.map((r) => this.mapTradingRule(r));
  }

  /**
   * POST /api/v2/Propsite/TradingAccount/ChangeTradingRule
   */
  async assignTradingRule(
    platformAccountId: string,
    tradingRuleId: string,
  ): Promise<void> {
    logger.info(
      { platformAccountId, tradingRuleId },
      'Volumetrica: assigning trading rule to account',
    );

    await this.client.post(`${API}/TradingAccount/ChangeTradingRule`, {
      accountId: platformAccountId,
      ruleId: tradingRuleId,
    });
  }

  // ── Bulk Operations ──────────────────────────────────────────────────

  async getBulkAccountsEnabled(): Promise<PlatformAccountHeader[]> {
    logger.info('Volumetrica: fetching bulk enabled accounts');
    const accounts = await this.client.get<VolAccountHeader[]>(
      `${API}/Bulk/AccountsEnabled`,
    );
    return accounts.map((a) => this.mapAccountHeader(a));
  }

  async getBulkAccountsInfo(): Promise<Record<string, PlatformAccountInfo>> {
    logger.info('Volumetrica: fetching bulk account info snapshots');
    const dict = await this.client.get<Record<string, VolAccountInfoViewModel>>(
      `${API}/Bulk/AccountsInfosEnabled`,
    );
    return this.mapAccountInfoDict(dict);
  }

  async getBulkAccountsInfoByRule(
    ruleId: string,
  ): Promise<Record<string, PlatformAccountInfo>> {
    logger.info({ ruleId }, 'Volumetrica: fetching bulk account info by rule');
    const dict = await this.client.get<Record<string, VolAccountInfoViewModel>>(
      `${API}/Bulk/AccountsInfoByRule`,
      { ruleId },
    );
    return this.mapAccountInfoDict(dict);
  }

  async getBulkAccountsDisabled(
    startDt?: Date,
    endDt?: Date,
  ): Promise<PlatformAccountHeader[]> {
    logger.info('Volumetrica: fetching bulk disabled accounts');
    const accounts = await this.client.get<VolAccountHeader[]>(
      `${API}/Bulk/AccountsDisabled`,
      {
        ...(startDt && { utcStartDt: startDt.toISOString() }),
        ...(endDt && { utcEndDt: endDt.toISOString() }),
      },
    );
    return accounts.map((a) => this.mapAccountHeader(a));
  }

  async getBulkTrades(
    startDt: Date,
    endDt?: Date,
    nextPageToken?: string,
  ): Promise<PaginatedResult<Record<string, PlatformBulkTrade[]>>> {
    logger.info('Volumetrica: fetching bulk trades');
    const res = await this.client.getPaged<Record<string, VolBulkTrade[]>>(
      `${API}/Bulk/TradesList`,
      {
        utcStartDt: startDt.toISOString(),
        ...(endDt && { utcEndDt: endDt.toISOString() }),
        extendedTradeDetails: true,
        ...(nextPageToken && { nextPageToken }),
      },
    );

    const mapped: Record<string, PlatformBulkTrade[]> = {};
    if (res.data) {
      for (const [accountId, trades] of Object.entries(res.data)) {
        mapped[accountId] = trades.map((t) => this.mapBulkTrade(t));
      }
    }

    return { data: mapped, nextPageToken: res.nextPageToken };
  }

  async getBulkFills(
    startDt: Date,
    endDt?: Date,
    nextPageToken?: string,
  ): Promise<PaginatedResult<Record<string, PlatformBulkFill[]>>> {
    logger.info('Volumetrica: fetching bulk fills');
    const res = await this.client.getPaged<Record<string, VolBulkFill[]>>(
      `${API}/Bulk/FillList`,
      {
        utcStartDt: startDt.toISOString(),
        ...(endDt && { utcEndDt: endDt.toISOString() }),
        ...(nextPageToken && { nextPageToken }),
      },
    );

    const mapped: Record<string, PlatformBulkFill[]> = {};
    if (res.data) {
      for (const [accountId, fills] of Object.entries(res.data)) {
        mapped[accountId] = fills.map((f) => this.mapBulkFill(f));
      }
    }

    return { data: mapped, nextPageToken: res.nextPageToken };
  }

  async getBulkOrders(
    startDt: Date,
    endDt?: Date,
    orderStatus?: string,
    nextPageToken?: string,
  ): Promise<PaginatedResult<Record<string, PlatformBulkOrder[]>>> {
    logger.info('Volumetrica: fetching bulk orders');
    const res = await this.client.getPaged<Record<string, VolBulkOrder[]>>(
      `${API}/Bulk/OrderList`,
      {
        utcStartDt: startDt.toISOString(),
        ...(endDt && { utcEndDt: endDt.toISOString() }),
        ...(orderStatus && { filterStatus: orderStatus }),
        ...(nextPageToken && { nextPageToken }),
      },
    );

    const mapped: Record<string, PlatformBulkOrder[]> = {};
    if (res.data) {
      for (const [accountId, orders] of Object.entries(res.data)) {
        mapped[accountId] = orders.map((o) => this.mapBulkOrder(o));
      }
    }

    return { data: mapped, nextPageToken: res.nextPageToken };
  }

  async getBulkTransactions(
    startDt: Date,
    endDt?: Date,
    nextPageToken?: string,
  ): Promise<PaginatedResult<Record<string, PlatformBulkTransaction[]>>> {
    logger.info('Volumetrica: fetching bulk transactions');
    const res = await this.client.getPaged<
      Record<string, VolBulkTransaction[]>
    >(`${API}/Bulk/TransactionList`, {
      utcStartDt: startDt.toISOString(),
      ...(endDt && { utcEndDt: endDt.toISOString() }),
      ...(nextPageToken && { nextPageToken }),
    });

    const mapped: Record<string, PlatformBulkTransaction[]> = {};
    if (res.data) {
      for (const [accountId, txns] of Object.entries(res.data)) {
        mapped[accountId] = txns.map((t) => this.mapBulkTransaction(t));
      }
    }

    return { data: mapped, nextPageToken: res.nextPageToken };
  }

  async getBulkDailySnapshots(
    startDt: Date,
    nextPageToken?: string,
  ): Promise<PaginatedResult<Record<string, PlatformBulkDailySnapshot[]>>> {
    logger.info('Volumetrica: fetching bulk daily snapshots');
    const res = await this.client.getPaged<
      Record<string, VolBulkDailySnapshot[]>
    >(`${API}/Bulk/DailySnapshots`, {
      utcStartDt: startDt.toISOString(),
      ...(nextPageToken && { nextPageToken }),
    });

    const mapped: Record<string, PlatformBulkDailySnapshot[]> = {};
    if (res.data) {
      for (const [accountId, snaps] of Object.entries(res.data)) {
        mapped[accountId] = snaps.map((s) => this.mapBulkDailySnapshot(s));
      }
    }

    return { data: mapped, nextPageToken: res.nextPageToken };
  }

  async getBulkSessionLogs(
    startDt?: Date,
    endDt?: Date,
    platform?: string,
    nextPageToken?: string,
  ): Promise<PaginatedResult<PlatformSessionLog[]>> {
    logger.info('Volumetrica: fetching bulk session logs');
    const res = await this.client.getPaged<VolSessionLog[]>(
      `${API}/Bulk/SessionLogs`,
      {
        ...(startDt && { utcStartDt: startDt.toISOString() }),
        ...(endDt && { utcEndDt: endDt.toISOString() }),
        ...(platform && { platform }),
        ...(nextPageToken && { nextPageToken }),
      },
    );

    const mapped = (res.data ?? []).map((s) => this.mapSessionLog(s));
    return { data: mapped, nextPageToken: res.nextPageToken };
  }

  // ── Account Management ──────────────────────────────────────────────

  async listAccountsByRule(params: ListAccountsByRuleParams): Promise<PlatformAccountHeader[]> {
    logger.info({ ruleId: params.ruleId }, 'Volumetrica: listing accounts by rule');
    const accounts = await this.client.get<VolAccountHeader[]>(
      `${API}/TradingAccount/ListByRuleId`,
      {
        ruleId: params.ruleId,
        ...(params.includeDisabled !== undefined && { includeDisabled: params.includeDisabled }),
      },
    );
    return accounts.map((a) => this.mapAccountHeader(a));
  }

  async getHistoricalOrders(
    accountId: string,
    startDt: Date,
    endDt?: Date,
    filterStatus?: string,
  ): Promise<PlatformBulkOrder[]> {
    logger.info({ accountId }, 'Volumetrica: fetching historical orders');
    const orders = await this.client.get<VolBulkOrder[]>(
      `${API}/TradingAccount/HistoricalOrders`,
      {
        accountId,
        startDt: startDt.toISOString(),
        ...(endDt && { endDt: endDt.toISOString() }),
        ...(filterStatus && { filterStatus: REVERSE_ORDER_FILTER_STATUS[filterStatus] }),
      },
    );
    return orders.map((o) => this.mapBulkOrder(o));
  }

  async getHistoricalTransactions(
    accountId: string,
    startDt: Date,
    endDt?: Date,
  ): Promise<PlatformBulkTransaction[]> {
    logger.info({ accountId }, 'Volumetrica: fetching historical transactions');
    const txns = await this.client.get<VolBulkTransaction[]>(
      `${API}/TradingAccount/HistoricalTransactions`,
      {
        accountId,
        startDt: startDt.toISOString(),
        ...(endDt && { endDt: endDt.toISOString() }),
      },
    );
    return txns.map((t) => this.mapBulkTransaction(t));
  }

  async getEnabledAccountIds(): Promise<string[]> {
    logger.info('Volumetrica: fetching enabled account IDs');
    return this.client.get<string[]>(`${API}/TradingAccount/EnabledAccountsId`);
  }

  async bulkEnableAccounts(
    params: BulkEnableAccountsParams,
  ): Promise<PlatformBulkEnableDisableResult[]> {
    logger.info('Volumetrica: bulk enabling accounts');
    const results = await this.client.post<VolBulkEnableDisableResult[]>(
      `${API}/TradingAccount/EnableBulk`,
      {
        ...(params.ruleReference && {
          tradingRuleReference: REVERSE_RULE_REFERENCE[params.ruleReference],
        }),
        ...(params.ruleId && { ruleId: params.ruleId }),
        ...(params.tradingPermission && {
          tradingPermission: REVERSE_TRADING_PERMISSION[params.tradingPermission],
        }),
        ...(params.visibility && { visibility: REVERSE_VISIBILITY[params.visibility] }),
      },
    );
    return results.map((r) => this.mapBulkEnableDisableResult(r));
  }

  async bulkDisableAccounts(
    params: BulkDisableAccountsParams,
  ): Promise<PlatformBulkEnableDisableResult[]> {
    logger.info('Volumetrica: bulk disabling accounts');
    const results = await this.client.post<VolBulkEnableDisableResult[]>(
      `${API}/TradingAccount/DisableBulk`,
      {
        ...(params.ruleReference && {
          tradingRuleReference: REVERSE_RULE_REFERENCE[params.ruleReference],
        }),
        ...(params.ruleId && { ruleId: params.ruleId }),
        ...(params.reason && { reason: params.reason }),
        ...(params.forceClose !== undefined && { forceClose: params.forceClose }),
        ...(params.visibility && { visibility: REVERSE_VISIBILITY[params.visibility] }),
      },
    );
    return results.map((r) => this.mapBulkEnableDisableResult(r));
  }

  async changeAccountStatus(params: ChangeAccountStatusParams): Promise<PlatformAccountHeader> {
    logger.info({ accountId: params.accountId }, 'Volumetrica: changing account status');
    const result = await this.client.post<VolAccountHeader>(
      `${API}/TradingAccount/ChangeStatus`,
      {
        accountId: params.accountId,
        ...(params.status && { status: REVERSE_ACCOUNT_STATUS[params.status] }),
        ...(params.tradingPermission && {
          tradingPermission: REVERSE_TRADING_PERMISSION[params.tradingPermission],
        }),
        ...(params.reason && { reason: params.reason }),
        ...(params.forceClose !== undefined && { forceClose: params.forceClose }),
      },
    );
    return this.mapAccountHeader(result);
  }

  async changeAccountPermission(
    params: ChangeAccountPermissionParams,
  ): Promise<PlatformAccountHeader> {
    logger.info({ accountId: params.accountId }, 'Volumetrica: changing account permission');
    const result = await this.client.post<VolAccountHeader>(
      `${API}/TradingAccount/ChangePermission`,
      {
        accountId: params.accountId,
        tradingPermission: REVERSE_TRADING_PERMISSION[params.tradingPermission],
        ...(params.forceClose !== undefined && { forceClose: params.forceClose }),
        ...(params.reason && { reason: params.reason }),
      },
    );
    return this.mapAccountHeader(result);
  }

  async changeAccountVisibility(
    params: ChangeAccountVisibilityParams,
  ): Promise<PlatformAccountHeader> {
    logger.info({ accountId: params.accountId }, 'Volumetrica: changing account visibility');
    const result = await this.client.post<VolAccountHeader>(
      `${API}/TradingAccount/ChangeVisibility`,
      {
        accountId: params.accountId,
        ...(params.visibility && { visibility: REVERSE_VISIBILITY[params.visibility] }),
      },
    );
    return this.mapAccountHeader(result);
  }

  async updateAccountBalance(params: UpdateAccountBalanceParams): Promise<void> {
    logger.info({ accountId: params.accountId }, 'Volumetrica: updating account balance');
    await this.client.post(`${API}/TradingAccount/UpdateBalance`, {
      accountId: params.accountId,
      ...(params.action && { action: REVERSE_BALANCE_ACTION[params.action] }),
      ...(params.value !== undefined && { value: params.value }),
      ...(params.moveDrawdownToThresholdLimit !== undefined && {
        moveDrawdownToThresholdLimit: params.moveDrawdownToThresholdLimit,
      }),
    });
  }

  async changeAccountSchedule(params: ChangeAccountScheduleParams): Promise<PlatformAccountHeader> {
    logger.info({ accountId: params.accountId }, 'Volumetrica: changing account schedule');
    const result = await this.client.post<VolAccountHeader>(
      `${API}/TradingAccount/ChangeSchedule`,
      {
        accountId: params.accountId,
        ...(params.startDate && { startDate: params.startDate.toISOString() }),
        ...(params.endDate && { endDate: params.endDate.toISOString() }),
      },
    );
    return this.mapAccountHeader(result);
  }

  // ── Mapping Helpers ───────────────────────────────────────────────────

  private mapUserViewModel(user: VolUserViewModel): PlatformUserResult {
    return {
      platformUserId: user.id ?? '',
      email: user.email ?? undefined,
      firstName: user.firstName ?? undefined,
      lastName: user.lastName ?? undefined,
      userName: user.userName ?? undefined,
      phone: user.mobilePhone ?? undefined,
      address: user.address ?? undefined,
      postalCode: user.postalCode ?? undefined,
      city: user.city ?? undefined,
      state: user.state ?? undefined,
      country: user.country ?? undefined,
      birthday: user.birthday ? new Date(user.birthday) : undefined,
      organizationStatus: user.organizationStatus ?? undefined,
      webAccessDisabled: user.webAccessDisabled,
      extEntityId: user.extEntityId ?? undefined,
      createdAt: user.creationUtc ? new Date(user.creationUtc) : undefined,
      updatedAt: user.updateUtc ? new Date(user.updateUtc) : undefined,
    };
  }

  private mapTradingRule(rule: VolTradingRuleResult): PlatformTradingRuleResult {
    return {
      tradingRuleId: rule.ruleId ?? '',
      name: rule.description ?? '',
      organizationReferenceId: rule.organizationReferenceId ?? undefined,
    };
  }

  private mapAccount(account: VolAccount): PlatformAccountResult {
    return {
      platformAccountId: account.id,
      platformUserId: account.userId,
      accountName: account.name,
      status: account.status,
      balance: account.balance,
      equity: account.equity,
      openPnl: account.unrealizedPnl,
      margin: account.margin,
      startingBalance: account.startingBalance,
      currency: account.currency ?? 'USD',
      createdAt: account.createdAt ? new Date(account.createdAt) : undefined,
      updatedAt: account.updatedAt ? new Date(account.updatedAt) : undefined,
    };
  }

  private mapAccountHeader(h: VolAccountHeader): PlatformAccountHeader {
    return {
      platformAccountId: h.accountId ?? String(h.id),
      displayId: h.displayId ?? undefined,
      name: h.header ?? undefined,
      description: h.description ?? undefined,
      currency: CURRENCY_MAP[h.currency] ?? 'USD',
      startingBalance: h.startBalance,
      balance: h.balance,
      maxBalance: h.maximumBalance,
      minBalance: h.minimumBalance,
      sessionCount: h.sessionNumbers,
      enabled: h.enabled,
      mode: ACCOUNT_MODE_MAP[h.mode] ?? String(h.mode),
      status: ACCOUNT_STATUS_MAP[h.status] ?? String(h.status),
      tradingPermission: TRADING_PERMISSION_MAP[h.tradingPermission] ?? String(h.tradingPermission),
      visibility: VISIBILITY_MAP[h.visibility] ?? String(h.visibility),
      createdAt: new Date(h.creationDate),
      disabledAt: h.disableDate ? new Date(h.disableDate) : undefined,
      endAt: h.endDate ? new Date(h.endDate) : undefined,
      tradingRuleId: h.tradingRuleId ?? undefined,
      accountFamilyId: h.accountFamilyId ?? undefined,
      reason: h.reason ?? undefined,
      owner: h.ownerUser ? this.mapOwner(h.ownerUser) : undefined,
    };
  }

  private mapOwner(o: VolOwnerCompact): PlatformAccountOwner {
    return {
      platformUserId: o.userId ?? undefined,
      fullName: o.fullName ?? undefined,
      username: o.username ?? undefined,
      email: o.email ?? undefined,
      externalId: o.extEntityId ?? undefined,
    };
  }

  private mapAccountInfoDict(
    dict: Record<string, VolAccountInfoViewModel>,
  ): Record<string, PlatformAccountInfo> {
    const result: Record<string, PlatformAccountInfo> = {};
    for (const [accountId, info] of Object.entries(dict)) {
      result[accountId] = this.mapAccountInfo(info);
    }
    return result;
  }

  private mapAccountInfo(info: VolAccountInfoViewModel): PlatformAccountInfo {
    return {
      status: ACCOUNT_STATUS_MAP[info.status] ?? String(info.status),
      tradingPermission: TRADING_PERMISSION_MAP[info.tradingPermission] ?? String(info.tradingPermission),
      reason: info.reason ?? undefined,
      reasonTradingPermission: info.reasonTradingPermission ?? undefined,
      riskPauseRestoreUtcMs: info.riskPauseRestoreUtcMs ?? undefined,
      tradingRuleId: info.tradingRuleId ?? undefined,
      snapshot: this.mapLiveSnapshot(info.snapshot),
    };
  }

  private mapLiveSnapshot(s: VolSnapshotViewModel): PlatformAccountLiveSnapshot {
    return {
      platformAccountId: String(s.accountId),
      currency: CURRENCY_MAP[s.currency] ?? 'USD',
      startBalance: s.startBalance,
      balance: s.balance,
      equity: s.equity ?? undefined,
      marginAvailable: s.marginAvailable,
      marginUsed: s.marginUsed,
      minBalance: s.minimumBalance,
      maxBalance: s.maximumBalance,
      dailyPnl: s.dailyPL,
      dailyNetPnl: s.dailyNetPL,
      intradayStartBalance: s.intradayStartBalance,
      intradayMinBalance: s.intradayMinimumBalance,
      intradayMaxBalance: s.intradayMaximumBalance,
      intradayNumberOfTrades: s.intradayNumberOfTrades,
      stopDrawdownBalance: s.stopDrawdownBalance ?? undefined,
      stopDrawdownIntradayBalance: s.stopDrawdownIntradayBalance ?? undefined,
      profitTargetBalance: s.profitTargetBalance ?? undefined,
      updatedAt: new Date(s.updateUtc),
    };
  }

  private mapBulkTrade(t: VolBulkTrade): PlatformBulkTrade {
    return {
      tradeId: t.tradeId,
      symbolName: t.symbolName ?? undefined,
      contractName: t.contract?.contractName ?? undefined,
      entryDate: t.entryDate,
      exitDate: t.exitDate,
      entrySessionDate: t.entrySessionDate,
      exitSessionDate: t.exitSessionDate,
      quantity: t.quantity,
      entryPrice: t.entryPrice,
      exitPrice: t.exitPrice,
      grossPnl: t.grossPl,
      netPnl: t.netPl,
      convertedGrossPnl: t.convertedGrossPl,
      convertedNetPnl: t.convertedNetPl,
      overnight: t.overnight,
      overweekend: t.overweekend,
      isCloseTrade: t.isCloseTrade,
      maxDrawdown: t.maxDrawdown ?? undefined,
      maxRunup: t.maxRunup ?? undefined,
      currency: t.currency ?? undefined,
    };
  }

  private mapBulkFill(f: VolBulkFill): PlatformBulkFill {
    return {
      fillId: f.fillId,
      contractId: f.contractId,
      symbolName: f.symbolName ?? undefined,
      executedAt: new Date(f.executeDtUtc),
      sessionDate: f.sessionDate,
      price: f.price,
      quantity: f.quantity,
      commissions: f.commissions,
    };
  }

  private mapBulkOrder(o: VolBulkOrder): PlatformBulkOrder {
    return {
      orderId: o.orderId,
      contractId: o.contractId,
      symbolName: o.symbolName ?? undefined,
      status: ORDER_STATUS_MAP[o.status] ?? String(o.status),
      orderType: ORDER_TYPE_MAP[o.ordType] ?? String(o.ordType),
      insertedAt: new Date(o.insertDtUtc),
      executedAt: o.executeDtUtc ? new Date(o.executeDtUtc) : undefined,
      cancelledAt: o.cancelDtUtc ? new Date(o.cancelDtUtc) : undefined,
      insertPrice: o.insertPrice,
      executePrice: o.executePrice ?? undefined,
      totalQuantity: o.totalQty,
      filledQuantity: o.filledQty,
      modified: o.modified,
      source: ORDER_SOURCE_MAP[o.source] ?? String(o.source),
      reason: ORDER_REASON_MAP[o.reason] ?? String(o.reason),
    };
  }

  private mapBulkTransaction(t: VolBulkTransaction): PlatformBulkTransaction {
    return {
      transactionId: t.transactionId,
      accountId: t.accountId,
      occurredAt: new Date(t.utc),
      type: TRANSACTION_TYPE_MAP[t.type] ?? String(t.type),
      description: t.description ?? undefined,
      amount: t.amount,
    };
  }

  private mapBulkDailySnapshot(s: VolBulkDailySnapshot): PlatformBulkDailySnapshot {
    return {
      platformAccountId: s.accountId,
      currency: CURRENCY_MAP[s.currency] ?? 'USD',
      startBalance: s.startBalance,
      balance: s.balance,
      equity: s.equity ?? undefined,
      marginAvailable: s.marginAvailable,
      marginUsed: s.marginUsed,
      minBalance: s.minimumBalance,
      maxBalance: s.maximumBalance,
      intradayStartBalance: s.intradayStartBalance,
      intradayMinBalance: s.intradayMinimumBalance,
      intradayMaxBalance: s.intradayMaximumBalance,
      intradayNumberOfTrades: s.intradayNumberOfTrades,
      dailyPnl: s.dailyPL,
      dailyNetPnl: s.dailyNetPL,
      stopDrawdownBalance: s.stopDrawdownBalance ?? undefined,
      stopDrawdownIntradayBalance: s.stopDrawdownIntradayBalance ?? undefined,
      profitTargetBalance: s.profitTargetBalance ?? undefined,
      updatedAt: new Date(s.updateUtc),
      snapshotDate: new Date(s.utcDate),
    };
  }

  private mapSessionLog(s: VolSessionLog): PlatformSessionLog {
    return {
      sessionId: s.sessionId,
      appUserId: s.appUserId ?? undefined,
      startedAt: new Date(s.startUtc),
      endedAt: s.endUtc ? new Date(s.endUtc) : undefined,
      platform: s.platform !== null ? (PLATFORM_MAP[s.platform] ?? String(s.platform)) : undefined,
      ip: s.ip ?? undefined,
    };
  }

  private mapBulkEnableDisableResult(
    r: VolBulkEnableDisableResult,
  ): PlatformBulkEnableDisableResult {
    return {
      platformAccountId: r.accountId ?? '',
      success: r.success,
      errorMessage: r.errorMessage ?? undefined,
      errorCode: r.errorCode !== 0 ? r.errorCode : undefined,
    };
  }
}
