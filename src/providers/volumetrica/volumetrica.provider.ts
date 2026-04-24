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
  CancelOrderParams,
  FlatPositionParams,
  ListSubscriptionsParams,
  ListSubscriptionsResult,
  PlatformSubscriptionResult,
  CreateSubscriptionParams,
  ConfirmSubscriptionParams,
  BulkDeactivateSubscriptionsParams,
  PlatformBulkDeactivateSubscriptionsResult,
  ListAccountsParams,
  ListAccountsResult,
  ListUsersParams,
  ListUsersResult,
  PlatformCurrencyRate,
  UpdateCurrencyRateParams,
  PlatformEconomicNewsEvent,
  UpdateEconomicNewsParams,
  ExportTradeListParams,
  PlatformGroupUniverseResult,
  PlatformGroupUniverseExchange,
  PlatformGroupUniverseSymbol,
  PlatformGroupUniverseSymbolGroup,
  CreateGroupUniverseParams,
  ListGroupUniversesParams,
  ListGroupUniversesResult,
  PlatformSymbolInfo,
  PlatformValidationResult,
  DuplicateTradingRuleParams,
  ChangeTradingRuleGroupUniverseParams,
  GenerateTradingTokenParams,
  PlatformTradingTokenResult,
  AuthTradingWssParams,
  PlatformTradingWssAuthResult,
  PlatformWebhookEvent,
  PlatformWebhookBulkEvent,
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

/** Subscription view model returned by Subscription endpoints */
interface VolSubscriptionViewModel {
  subscriptionId: string | null;
  confirmationId: string | null;
  status: number;
  providerStatus: number | null;
  activation: string | null;
  expiration: string | null;
  dxDataProducts: number[] | null;
  dxAgreementSigned: boolean;
  dxAgreementLink: string | null;
  dxSelfCertification: string | null;
  platform: number | null;
  volumetricaPlatform: string | null;
  volumetricaLicense: string | null;
  volumetricaDownloadLink: string | null;
  userId: string | null;
  lastVersionId: number;
}

/** DataTable wrapper for Subscription/List */
interface VolSubscriptionListResult {
  draw: number;
  recordsTotal: number;
  recordsFiltered: number;
  data: VolSubscriptionViewModel[] | null;
}

/** Bulk deactivation response */
interface VolBulkDeactivateResult {
  success: boolean;
  subscriptionDeactivated: VolSubscriptionViewModel[] | null;
  subscriptionErrors: VolSubscriptionViewModel[] | null;
}

// ── Volumetrica Currency Rate response shapes ────────────────────────────

interface VolCurrencyRateElement {
  baseCurrency: number;
  conversionCurrency: number;
  frequencyUpdate: number;
  exchangeRate: number;
  spreadType: number;
  spread: number;
  lastUpdate: string;
}

// ── Volumetrica Economic News response shapes ────────────────────────────

interface VolEconomicCalendarEvent {
  eventId: number;
  utcUnixMs: number;
  description: string | null;
  countryIso: string | null;
  intensity: number;
  inhibit: boolean;
}

// ── Volumetrica Group Universe response shapes ───────────────────────────

interface VolGroupUniverseResult {
  groupId: string | null;
  description: string | null;
  organizationReferenceId: string | null;
  productType: number;
  symbolAllowedMode: number;
  excludeSymbolsNotListed: boolean;
  inhibitTradeCopier: boolean;
  exchanges: VolBaseGroupUniverseExchange[] | null;
  symbols: VolBaseGroupUniverseSymbol[] | null;
  symbolGroups: VolBaseGroupUniverseSymbolGroup[] | null;
  borrowSymbols: number[] | null;
}

interface VolBaseGroupUniverseExchange {
  exchangeId: number;
  commissionsMode: number | null;
  commissions: number;
  makerCommissions: number | null;
  minContractsCalculation: number | null;
  minContractsValue: number | null;
  multipleContracts: number | null;
  minMoneyExpositionUnit: number | null;
  minMoneyExpositionValue: number | null;
  maxMoneyExpositionUnit: number | null;
  maxMoneyExpositionValue: number | null;
  leverage: number | null;
}

interface VolBaseGroupUniverseSymbol {
  symbolId: number;
  margin: number | null;
  commissions: number | null;
  makerCommissions: number | null;
  maxContracts: number | null;
  maxMoneyExposition: number | null;
  leverage: number | null;
}

interface VolBaseGroupUniverseSymbolGroup {
  symbolGroupId: string | null;
  margin: number | null;
  commissions: number | null;
  maxContractsSumMode: number | null;
  maxContractsCalculation: number | null;
  maxContractsValue: number | null;
}

interface VolGroupUniverseListResult {
  draw: number;
  recordsTotal: number;
  recordsFiltered: number;
  data: VolGroupUniverseResult[] | null;
}

// ── Volumetrica Symbol response shapes ───────────────────────────────────

interface VolSymbolInfoViewModel {
  id: number;
  name: string | null;
  description: string | null;
  exchange: string | null;
  symbolGroup: string | null;
  margin: number;
  commission: number;
  inhibitTrading: boolean;
  archived: boolean;
  adv14D: number | null;
  adv50D: number | null;
  adc14D: number | null;
  forceSubscription: boolean;
  tickSize: number;
  tickValue: number;
  baseCurrency: string | null;
  quoteCurrency: string | null;
  category: string | null;
}

// ── Volumetrica Validation response shapes ───────────────────────────────

interface VolRequestValidationResult {
  success: boolean;
  errors: Record<string, string | null> | null;
}

// ── Volumetrica Trading Token response shapes ────────────────────────────

interface VolLoginTradingTokenResult {
  tradingWssEndpoint: string | null;
  tradingWssToken: string | null;
  tradingRestReportHost: string | null;
  tradingRestReportToken: string | null;
  tradingRestTokenExpiration: number;
  tradingApiVersion: number;
}

interface VolLoginDataTradingTokenResult {
  tradingWssEndpoint: string | null;
  tradingWssToken: string | null;
  tradingRestReportHost: string | null;
  tradingRestReportToken: string | null;
  tradingRestTokenExpiration: number;
  tradingApiVersion: number;
  dataRealtimeEndpoint: string | null;
  dataToken: string | null;
  dataIpfEndpoint: string | null;
  dataExchanges: string[] | null;
}

// ── Volumetrica Webhook response shapes ──────────────────────────────────

interface VolWebhookEventViewModel {
  dtUtc: string;
  category: number;
  event: number;
  userId: string | null;
  accountId: string | null;
  tradingAccount: Record<string, unknown> | null;
  tradingPosition: Record<string, unknown> | null;
  subscription: Record<string, unknown> | null;
  tradeReport: Record<string, unknown> | null;
  tradingPortfolio: Record<string, unknown> | null;
  organizationUser: Record<string, unknown> | null;
}

interface VolWebhookBulkViewModel {
  id: string | null;
  data: VolWebhookEventViewModel;
}

/** DataTable wrapper for TradingAccount/List */
interface VolAccountHeaderListResult {
  draw: number;
  recordsTotal: number;
  recordsFiltered: number;
  data: VolAccountHeader[] | null;
}

/** DataTable wrapper for User/List */
interface VolUserListResult {
  draw: number;
  recordsTotal: number;
  recordsFiltered: number;
  data: VolUserViewModel[] | null;
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

// ── Subscription enum maps ────────────────────────────────────────────────

const SUBSCRIPTION_STATUS_MAP: Record<number, string> = {
  0: 'Disabled', 1: 'Active', 2: 'Scheduled',
  3: 'UserOnHold', 4: 'PropfirmOnHold', 5: 'Error',
};

const SUBSCRIPTION_PROVIDER_STATUS_MAP: Record<number, string> = {
  0: 'Disabled', 1: 'Enabled', 2: 'Suspended', 3: 'Terminated', 4: 'Blocked',
};

const REVERSE_SUBSCRIPTION_STATUS: Record<string, number> = {
  Disabled: 0, Active: 1, Scheduled: 2,
  UserOnHold: 3, PropfirmOnHold: 4, Error: 5,
};

const REVERSE_SUBSCRIPTION_PLATFORM: Record<string, number> = {
  VOLUMETRICA_TRADING: 0, QUANTOWER: 1, ATAS: 2,
};

const REVERSE_ORDER_POSITION_FILTER: Record<string, number> = {
  All: 0, Buy: 1, Sell: 2, Winner: 3, Loser: 4,
};

const REVERSE_ACCOUNT_MODE: Record<string, number> = {
  Evaluation: 0, SimFunded: 1, Funded: 2, Live: 3, Trial: 4, Contest: 5, Training: 100,
};

const RATE_FREQUENCY_MAP: Record<number, string> = {
  0: 'Manually', 1: 'Daily', 2: 'Weekly', 3: 'Monthly',
};

const UNIT_VALUE_TYPE_MAP: Record<number, string> = {
  0: 'Absolute', 1: 'Percentual',
};

const NEWS_INTENSITY_MAP: Record<number, string> = {
  1: 'Info', 2: 'Low', 4: 'Medium', 8: 'High',
};

const REVERSE_NEWS_INTENSITY: Record<string, number> = {
  Info: 1, Low: 2, Medium: 4, High: 8,
};

const PRODUCT_TYPE_MAP: Record<number, string> = {
  [-1]: 'Universal', 0: 'Future', 1: 'Stocks', 2: 'Options', 3: 'CFD', 4: 'Crypto',
};

const SYMBOL_ALLOWED_MODE_MAP: Record<number, string> = {
  0: 'SymbolsListed', 1: 'Exchanges', 2: 'All',
};

const WEBHOOK_CATEGORY_MAP: Record<number, string> = {
  0: 'Accounts', 1: 'OvernightPositions', 2: 'Subscriptions',
  3: 'TradeReport', 4: 'Portfolio', 5: 'OrganizationUser',
};

const WEBHOOK_EVENT_MAP: Record<number, string> = {
  0: 'Created', 1: 'Updated', 2: 'Deleted', 3: 'Overnight',
};

// Build reverse currency map from CURRENCY_MAP
const REVERSE_CURRENCY: Record<string, number> = Object.fromEntries(
  Object.entries(CURRENCY_MAP).map(([k, v]) => [v, Number(k)]),
);

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

    const result = await this.client.post<VolTradingRuleResult>(
      `${API}/TradingRule`,
      this.buildTradingRuleBody(params),
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

  // ── Trading Operations ──────────────────────────────────────────────────

  async cancelOrder(params: CancelOrderParams): Promise<void> {
    logger.info({ accountId: params.accountId }, 'Volumetrica: cancelling order');
    await this.client.post(`${API}/Trading/CancelOrder`, {
      accountId: params.accountId,
      ...(params.orderId !== undefined && { orderId: params.orderId }),
      ...(params.filter && { filter: REVERSE_ORDER_POSITION_FILTER[params.filter] }),
    });
  }

  async flatPosition(params: FlatPositionParams): Promise<void> {
    logger.info({ accountId: params.accountId }, 'Volumetrica: flattening position');
    await this.client.post(`${API}/Trading/FlatPosition`, {
      accountId: params.accountId,
      ...(params.contractId !== undefined && { contractId: params.contractId }),
      ...(params.positionId !== undefined && { positionId: params.positionId }),
      ...(params.filter && { filter: REVERSE_ORDER_POSITION_FILTER[params.filter] }),
    });
  }

  // ── Subscription Operations ────────────────────────────────────────────

  async listSubscriptions(
    params?: ListSubscriptionsParams | undefined,
  ): Promise<ListSubscriptionsResult> {
    logger.info('Volumetrica: listing subscriptions');
    const result = await this.client.get<VolSubscriptionListResult>(
      `${API}/Subscription/List`,
      {
        ...(params?.status && { subscriptionStatus: REVERSE_SUBSCRIPTION_STATUS[params.status] }),
        ...(params?.platform && { platform: REVERSE_SUBSCRIPTION_PLATFORM[params.platform] }),
        ...(params?.skip !== undefined && { skip: params.skip }),
        ...(params?.take !== undefined && { take: params.take }),
      },
    );
    return {
      total: result.recordsTotal,
      filtered: result.recordsFiltered,
      subscriptions: (result.data ?? []).map((s) => this.mapSubscription(s)),
    };
  }

  async getSubscription(opts: {
    userId?: string | undefined;
    subscriptionId?: string | undefined;
  }): Promise<PlatformSubscriptionResult> {
    logger.info(opts, 'Volumetrica: getting subscription');
    const result = await this.client.get<VolSubscriptionViewModel>(
      `${API}/Subscription`,
      {
        ...(opts.userId && { userId: opts.userId }),
        ...(opts.subscriptionId && { subscriptionId: opts.subscriptionId }),
      },
    );
    return this.mapSubscription(result);
  }

  async createSubscription(
    params: CreateSubscriptionParams,
  ): Promise<PlatformSubscriptionResult> {
    logger.info({ userId: params.userId }, 'Volumetrica: creating subscription');
    const result = await this.client.post<VolSubscriptionViewModel>(
      `${API}/Subscription`,
      {
        userId: params.userId,
        enabled: params.enabled,
        ...(params.dataFeedProducts && { dataFeedProducts: params.dataFeedProducts }),
        ...(params.platform && { platform: REVERSE_SUBSCRIPTION_PLATFORM[params.platform] }),
        ...(params.startDate && { startDate: params.startDate.toISOString() }),
        ...(params.durationMonths !== undefined && { durationMonths: params.durationMonths }),
        ...(params.durationDays !== undefined && { durationDays: params.durationDays }),
        ...(params.volumetricaPlatform !== undefined && {
          volumetricaPlatform: params.volumetricaPlatform,
        }),
        ...(params.forceUserOnboarding !== undefined && {
          forceUserOnboarding: params.forceUserOnboarding,
        }),
        ...(params.allowedSelfCertification !== undefined && {
          allowedSelfCertification: params.allowedSelfCertification,
        }),
        ...(params.redirectUrl && { redirectUrl: params.redirectUrl }),
      },
    );
    return this.mapSubscription(result);
  }

  async updateSubscription(
    subscriptionId: string,
    params: CreateSubscriptionParams,
  ): Promise<PlatformSubscriptionResult> {
    logger.info({ subscriptionId }, 'Volumetrica: updating subscription');
    const result = await this.client.put<VolSubscriptionViewModel>(
      `${API}/Subscription?subscriptionId=${encodeURIComponent(subscriptionId)}`,
      {
        userId: params.userId,
        enabled: params.enabled,
        ...(params.dataFeedProducts && { dataFeedProducts: params.dataFeedProducts }),
        ...(params.platform && { platform: REVERSE_SUBSCRIPTION_PLATFORM[params.platform] }),
        ...(params.startDate && { startDate: params.startDate.toISOString() }),
        ...(params.durationMonths !== undefined && { durationMonths: params.durationMonths }),
        ...(params.durationDays !== undefined && { durationDays: params.durationDays }),
        ...(params.volumetricaPlatform !== undefined && {
          volumetricaPlatform: params.volumetricaPlatform,
        }),
        ...(params.forceUserOnboarding !== undefined && {
          forceUserOnboarding: params.forceUserOnboarding,
        }),
        ...(params.allowedSelfCertification !== undefined && {
          allowedSelfCertification: params.allowedSelfCertification,
        }),
        ...(params.redirectUrl && { redirectUrl: params.redirectUrl }),
      },
    );
    return this.mapSubscription(result);
  }

  async deleteSubscription(subscriptionId: string): Promise<void> {
    logger.info({ subscriptionId }, 'Volumetrica: deleting subscription');
    await this.client.del(
      `${API}/Subscription?subscriptionId=${encodeURIComponent(subscriptionId)}`,
    );
  }

  async activateSubscription(subscriptionId: string): Promise<PlatformSubscriptionResult> {
    logger.info({ subscriptionId }, 'Volumetrica: activating subscription');
    const result = await this.client.post<VolSubscriptionViewModel>(
      `${API}/Subscription/Active`,
      { subscriptionId },
    );
    return this.mapSubscription(result);
  }

  async confirmSubscription(
    params: ConfirmSubscriptionParams,
  ): Promise<PlatformSubscriptionResult> {
    logger.info({ subscriptionId: params.subscriptionId }, 'Volumetrica: confirming subscription');
    const result = await this.client.post<VolSubscriptionViewModel>(
      `${API}/Subscription/Confirm`,
      {
        subscriptionId: params.subscriptionId,
        confirmationId: params.confirmationId,
      },
    );
    return this.mapSubscription(result);
  }

  async deactivateSubscription(subscriptionId: string): Promise<PlatformSubscriptionResult> {
    logger.info({ subscriptionId }, 'Volumetrica: deactivating subscription');
    const result = await this.client.post<VolSubscriptionViewModel>(
      `${API}/Subscription/Deactive`,
      { subscriptionId },
    );
    return this.mapSubscription(result);
  }

  async bulkDeactivateSubscriptions(
    params: BulkDeactivateSubscriptionsParams,
  ): Promise<PlatformBulkDeactivateSubscriptionsResult> {
    logger.info('Volumetrica: bulk deactivating subscriptions');
    const result = await this.client.post<VolBulkDeactivateResult>(
      `${API}/Subscription/BulkDeactive`,
      {
        includeWithActiveTradingAccounts: params.includeWithActiveTradingAccounts,
        considerScheduledTradingAccountAsActive: params.considerScheduledTradingAccountAsActive,
      },
    );
    return {
      success: result.success,
      deactivated: (result.subscriptionDeactivated ?? []).map((s) => this.mapSubscription(s)),
      errors: (result.subscriptionErrors ?? []).map((s) => this.mapSubscription(s)),
    };
  }

  // ── Account / User Listing ─────────────────────────────────────────────

  async listAccounts(
    params?: ListAccountsParams,
  ): Promise<ListAccountsResult> {
    logger.info('Volumetrica: listing accounts');
    const result = await this.client.get<VolAccountHeaderListResult>(
      `${API}/TradingAccount/List`,
      {
        ...(params?.mode && { mode: REVERSE_ACCOUNT_MODE[params.mode] }),
        ...(params?.status && { status: REVERSE_ACCOUNT_STATUS[params.status] }),
        ...(params?.permission && { permission: REVERSE_TRADING_PERMISSION[params.permission] }),
        ...(params?.familyId && { familyId: params.familyId }),
        ...(params?.groupUniverseId && { groupUniverseId: params.groupUniverseId }),
        ...(params?.tradingRuleId && { tradingRuleId: params.tradingRuleId }),
        ...(params?.filter && { filter: params.filter }),
        ...(params?.skip !== undefined && { skip: params.skip }),
        ...(params?.take !== undefined && { take: params.take }),
      },
    );
    return {
      total: result.recordsTotal,
      filtered: result.recordsFiltered,
      accounts: (result.data ?? []).map((a) => this.mapAccountHeader(a)),
    };
  }

  async listUsers(
    params?: ListUsersParams,
  ): Promise<ListUsersResult> {
    logger.info('Volumetrica: listing users');
    const result = await this.client.get<VolUserListResult>(
      `${API}/User/List`,
      {
        ...(params?.userType !== undefined && { userType: params.userType }),
        ...(params?.organizationStatus !== undefined && { organizationStatus: params.organizationStatus }),
        ...(params?.subscriptionStatus && { subscriptionStatus: REVERSE_SUBSCRIPTION_STATUS[params.subscriptionStatus] }),
        ...(params?.platform && { platform: REVERSE_SUBSCRIPTION_PLATFORM[params.platform] }),
        ...(params?.filter && { filter: params.filter }),
        ...(params?.skip !== undefined && { skip: params.skip }),
        ...(params?.take !== undefined && { take: params.take }),
      },
    );
    return {
      total: result.recordsTotal,
      filtered: result.recordsFiltered,
      users: (result.data ?? []).map((u) => this.mapUserViewModel(u)),
    };
  }

  // ── Currency Rates ────────────────────────────────────────────────────

  async getCurrencyRates(): Promise<PlatformCurrencyRate[]> {
    logger.info('Volumetrica: fetching currency rates');
    const rates = await this.client.get<VolCurrencyRateElement[]>(
      `${API}/CurrencyRates`,
    );
    return rates.map((r) => this.mapCurrencyRate(r));
  }

  async updateCurrencyRates(rates: UpdateCurrencyRateParams[]): Promise<void> {
    logger.info('Volumetrica: updating currency rates');
    const body = rates.map((r) => ({
      baseCurrency: REVERSE_CURRENCY[r.baseCurrency] ?? 1,
      conversionCurrency: REVERSE_CURRENCY[r.conversionCurrency] ?? 1,
      ...(r.frequencyUpdate !== undefined && { frequencyUpdate: r.frequencyUpdate }),
      ...(r.exchangeRate !== undefined && { exchangeRate: r.exchangeRate }),
      ...(r.spreadType !== undefined && { spreadType: r.spreadType }),
      ...(r.spread !== undefined && { spread: r.spread }),
    }));
    await this.client.post(`${API}/CurrencyRates`, body as unknown as Record<string, unknown>);
  }

  // ── Economic News ─────────────────────────────────────────────────────

  async getEconomicNews(): Promise<PlatformEconomicNewsEvent[]> {
    logger.info('Volumetrica: fetching economic news');
    const events = await this.client.get<VolEconomicCalendarEvent[]>(
      `${API}/EconomicNews`,
    );
    return events.map((e) => this.mapEconomicNewsEvent(e));
  }

  async updateEconomicNewsInhibit(params: UpdateEconomicNewsParams): Promise<void> {
    logger.info('Volumetrica: updating economic news inhibit');
    await this.client.post(`${API}/EconomicNews`, {
      resetAll: params.resetAll,
      events: params.events.map((e) => ({
        eventId: e.eventId,
        utcUnixMs: e.utcUnixMs,
        ...(e.description && { description: e.description }),
        ...(e.countryIso && { countryIso: e.countryIso }),
        intensity: REVERSE_NEWS_INTENSITY[e.intensity] ?? e.eventId,
        inhibit: e.inhibit,
      })),
    });
  }

  // ── Export ─────────────────────────────────────────────────────────────

  async exportTradeListCsv(params: ExportTradeListParams): Promise<string> {
    logger.info('Volumetrica: exporting trade list CSV');
    // CSV endpoint returns raw text, not JSON — use get and let the client
    // attempt JSON parse. The endpoint actually returns a string wrapped in
    // the standard { success, data } envelope where data is the CSV string.
    return this.client.get<string>(`${API}/Export/TradeListCsv`, {
      startDt: params.startDt.toISOString(),
      ...(params.endDt && { endDt: params.endDt.toISOString() }),
      ...(params.rawPositions !== undefined && { rawPositions: params.rawPositions }),
    });
  }

  // ── Group Universe ────────────────────────────────────────────────────

  async listGroupUniverses(
    params?: ListGroupUniversesParams,
  ): Promise<ListGroupUniversesResult> {
    logger.info('Volumetrica: listing group universes');
    const result = await this.client.get<VolGroupUniverseListResult>(
      `${API}/GroupUniverse/List`,
      {
        ...(params?.filter && { filter: params.filter }),
        ...(params?.skip !== undefined && { skip: params.skip }),
        ...(params?.take !== undefined && { take: params.take }),
      },
    );
    return {
      total: result.recordsTotal,
      filtered: result.recordsFiltered,
      groupUniverses: (result.data ?? []).map((g) => this.mapGroupUniverse(g)),
    };
  }

  async getGroupUniverse(
    groupId: string,
    reference?: string,
  ): Promise<PlatformGroupUniverseResult> {
    logger.info({ groupId }, 'Volumetrica: getting group universe');
    const result = await this.client.get<VolGroupUniverseResult>(
      `${API}/GroupUniverse`,
      {
        groupId,
        ...(reference && { reference: REVERSE_RULE_REFERENCE[reference] }),
      },
    );
    return this.mapGroupUniverse(result);
  }

  async createGroupUniverse(
    params: CreateGroupUniverseParams,
  ): Promise<PlatformGroupUniverseResult> {
    logger.info('Volumetrica: creating group universe');
    const result = await this.client.post<VolGroupUniverseResult>(
      `${API}/GroupUniverse`,
      this.buildGroupUniverseBody(params),
    );
    return this.mapGroupUniverse(result);
  }

  async updateGroupUniverse(
    groupId: string,
    params: CreateGroupUniverseParams,
    reference?: string,
  ): Promise<PlatformGroupUniverseResult> {
    logger.info({ groupId }, 'Volumetrica: updating group universe');
    const result = await this.client.put<VolGroupUniverseResult>(
      `${API}/GroupUniverse?id=${encodeURIComponent(groupId)}${reference ? `&reference=${REVERSE_RULE_REFERENCE[reference]}` : ''}`,
      this.buildGroupUniverseBody(params),
    );
    return this.mapGroupUniverse(result);
  }

  // ── Symbols ───────────────────────────────────────────────────────────

  async listSymbols(): Promise<PlatformSymbolInfo[]> {
    logger.info('Volumetrica: listing symbols');
    const symbols = await this.client.get<VolSymbolInfoViewModel[]>(
      `${API}/Symbol/List`,
    );
    return symbols.map((s) => this.mapSymbolInfo(s));
  }

  async getContractName(contractId: number): Promise<string> {
    return this.client.get<string>(`${API}/Symbol/ContractName`, { contractId });
  }

  async getSymbolName(contractId: number): Promise<string> {
    return this.client.get<string>(`${API}/Symbol/SymbolName`, { contractId });
  }

  // ── Trading Rule Updates ──────────────────────────────────────────────

  async updateTradingRule(
    ruleId: string,
    params: CreatePlatformTradingRuleParams,
    reference?: string,
  ): Promise<PlatformTradingRuleResult> {
    logger.info({ ruleId }, 'Volumetrica: updating trading rule');
    const body = this.buildTradingRuleBody(params);
    const result = await this.client.put<VolTradingRuleResult>(
      `${API}/TradingRule?id=${encodeURIComponent(ruleId)}${reference ? `&reference=${REVERSE_RULE_REFERENCE[reference]}` : ''}`,
      body,
    );
    return this.mapTradingRule(result);
  }

  async validateTradingRule(
    params: CreatePlatformTradingRuleParams,
  ): Promise<PlatformValidationResult> {
    logger.info('Volumetrica: validating trading rule');
    const body = this.buildTradingRuleBody(params);
    const result = await this.client.post<VolRequestValidationResult>(
      `${API}/TradingRule/Validate`,
      body,
    );
    const errors: Record<string, string> | undefined = result.errors
      ? Object.fromEntries(
          Object.entries(result.errors).filter(
            (entry): entry is [string, string] => entry[1] !== null,
          ),
        )
      : undefined;
    return {
      valid: result.success,
      errors: errors && Object.keys(errors).length > 0 ? errors : undefined,
    };
  }

  async changeTradingRuleGroupUniverse(
    params: ChangeTradingRuleGroupUniverseParams,
  ): Promise<void> {
    logger.info({ ruleId: params.ruleId }, 'Volumetrica: changing trading rule group universe');
    await this.client.post(`${API}/TradingRule/ChangeGroupUniverse`, {
      ruleId: params.ruleId,
      ...(params.ruleReference && { tradingRuleReference: REVERSE_RULE_REFERENCE[params.ruleReference] }),
      groupId: params.groupId,
      ...(params.groupUniverseReference && { groupUniverseReference: REVERSE_RULE_REFERENCE[params.groupUniverseReference] }),
    });
  }

  async duplicateTradingRule(
    params: DuplicateTradingRuleParams,
  ): Promise<PlatformTradingRuleResult> {
    logger.info({ ruleId: params.ruleId }, 'Volumetrica: duplicating trading rule');
    const result = await this.client.post<VolTradingRuleResult>(
      `${API}/TradingRule/Duplicate`,
      {
        ruleId: params.ruleId,
        ...(params.ruleReference && { tradingRuleReference: REVERSE_RULE_REFERENCE[params.ruleReference] }),
        ...(params.newOrganizationRuleId && { newOrganizationRuleId: params.newOrganizationRuleId }),
        ...(params.newDescription && { newDescription: params.newDescription }),
      },
    );
    return this.mapTradingRule(result);
  }

  // ── Trading Token / WSS ───────────────────────────────────────────────

  async generateTradingToken(
    params: GenerateTradingTokenParams,
  ): Promise<PlatformTradingTokenResult> {
    logger.info('Volumetrica: generating trading token');
    const result = await this.client.post<VolLoginTradingTokenResult>(
      `${API}/User/GenerateTradingToken`,
      {
        login: params.login,
        password: params.password,
        ...(params.version !== undefined && { version: params.version }),
        ...(params.platform && { platform: REVERSE_SUBSCRIPTION_PLATFORM[params.platform] }),
      },
    );
    return this.mapTradingToken(result);
  }

  async authTradingWss(
    params: AuthTradingWssParams,
  ): Promise<PlatformTradingWssAuthResult> {
    logger.info('Volumetrica: authenticating trading WSS');
    const result = await this.client.post<VolLoginDataTradingTokenResult>(
      `${API}/User/AuthTradingWss`,
      {
        userId: params.userId,
        ...(params.platform && { platform: REVERSE_SUBSCRIPTION_PLATFORM[params.platform] }),
        ...(params.onlyTrading !== undefined && { onlyTrading: params.onlyTrading }),
        ...(params.ip && { ip: params.ip }),
        ...(params.version !== undefined && { version: params.version }),
      },
    );
    return {
      ...this.mapTradingToken(result),
      dataRealtimeEndpoint: result.dataRealtimeEndpoint ?? undefined,
      dataToken: result.dataToken ?? undefined,
      dataIpfEndpoint: result.dataIpfEndpoint ?? undefined,
      dataExchanges: result.dataExchanges ?? undefined,
    };
  }

  // ── Webhook Reference ─────────────────────────────────────────────────

  async getWebhookModel(): Promise<PlatformWebhookEvent> {
    logger.info('Volumetrica: fetching webhook model');
    const result = await this.client.get<VolWebhookEventViewModel>(
      `${API}/Webhook/GetModel`,
    );
    return this.mapWebhookEvent(result);
  }

  async getWebhookBulkModel(): Promise<PlatformWebhookBulkEvent[]> {
    logger.info('Volumetrica: fetching bulk webhook model');
    const result = await this.client.get<VolWebhookBulkViewModel[]>(
      `${API}/Webhook/GetBulkModel`,
    );
    return result.map((item) => ({
      id: item.id ?? undefined,
      data: this.mapWebhookEvent(item.data),
    }));
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

  private mapCurrencyRate(r: VolCurrencyRateElement): PlatformCurrencyRate {
    return {
      baseCurrency: CURRENCY_MAP[r.baseCurrency] ?? String(r.baseCurrency),
      conversionCurrency: CURRENCY_MAP[r.conversionCurrency] ?? String(r.conversionCurrency),
      frequencyUpdate: RATE_FREQUENCY_MAP[r.frequencyUpdate] ?? String(r.frequencyUpdate),
      exchangeRate: r.exchangeRate,
      spreadType: UNIT_VALUE_TYPE_MAP[r.spreadType] ?? String(r.spreadType),
      spread: r.spread,
      lastUpdate: new Date(r.lastUpdate),
    };
  }

  private mapEconomicNewsEvent(e: VolEconomicCalendarEvent): PlatformEconomicNewsEvent {
    return {
      eventId: e.eventId,
      utcUnixMs: e.utcUnixMs,
      description: e.description ?? undefined,
      countryIso: e.countryIso ?? undefined,
      intensity: NEWS_INTENSITY_MAP[e.intensity] ?? String(e.intensity),
      inhibit: e.inhibit,
    };
  }

  private mapGroupUniverse(g: VolGroupUniverseResult): PlatformGroupUniverseResult {
    return {
      groupId: g.groupId ?? '',
      description: g.description ?? undefined,
      organizationReferenceId: g.organizationReferenceId ?? undefined,
      productType: PRODUCT_TYPE_MAP[g.productType] ?? String(g.productType),
      symbolAllowedMode: SYMBOL_ALLOWED_MODE_MAP[g.symbolAllowedMode] ?? String(g.symbolAllowedMode),
      excludeSymbolsNotListed: g.excludeSymbolsNotListed,
      inhibitTradeCopier: g.inhibitTradeCopier,
      exchanges: g.exchanges?.map((e) => this.mapGroupUniverseExchange(e)),
      symbols: g.symbols?.map((s) => this.mapGroupUniverseSymbol(s)),
      symbolGroups: g.symbolGroups?.map((sg) => this.mapGroupUniverseSymbolGroup(sg)),
      borrowSymbols: g.borrowSymbols ?? undefined,
    };
  }

  private mapGroupUniverseExchange(e: VolBaseGroupUniverseExchange): PlatformGroupUniverseExchange {
    return {
      exchangeId: e.exchangeId,
      commissionsMode: e.commissionsMode ?? undefined,
      commissions: e.commissions,
      makerCommissions: e.makerCommissions ?? undefined,
      minContractsCalculation: e.minContractsCalculation ?? undefined,
      minContractsValue: e.minContractsValue ?? undefined,
      multipleContracts: e.multipleContracts ?? undefined,
      minMoneyExpositionUnit: e.minMoneyExpositionUnit ?? undefined,
      minMoneyExpositionValue: e.minMoneyExpositionValue ?? undefined,
      maxMoneyExpositionUnit: e.maxMoneyExpositionUnit ?? undefined,
      maxMoneyExpositionValue: e.maxMoneyExpositionValue ?? undefined,
      leverage: e.leverage ?? undefined,
    };
  }

  private mapGroupUniverseSymbol(s: VolBaseGroupUniverseSymbol): PlatformGroupUniverseSymbol {
    return {
      symbolId: s.symbolId,
      margin: s.margin ?? undefined,
      commissions: s.commissions ?? undefined,
      makerCommissions: s.makerCommissions ?? undefined,
      maxContracts: s.maxContracts ?? undefined,
      maxMoneyExposition: s.maxMoneyExposition ?? undefined,
      leverage: s.leverage ?? undefined,
    };
  }

  private mapGroupUniverseSymbolGroup(sg: VolBaseGroupUniverseSymbolGroup): PlatformGroupUniverseSymbolGroup {
    return {
      symbolGroupId: sg.symbolGroupId ?? undefined,
      margin: sg.margin ?? undefined,
      commissions: sg.commissions ?? undefined,
      maxContractsSumMode: sg.maxContractsSumMode ?? undefined,
      maxContractsCalculation: sg.maxContractsCalculation ?? undefined,
      maxContractsValue: sg.maxContractsValue ?? undefined,
    };
  }

  private buildGroupUniverseBody(params: CreateGroupUniverseParams): Record<string, unknown> {
    return {
      ...(params.groupId && { groupId: params.groupId }),
      ...(params.description && { description: params.description }),
      ...(params.organizationReferenceId && { organizationReferenceId: params.organizationReferenceId }),
      productType: params.productType,
      symbolAllowedMode: params.symbolAllowedMode,
      ...(params.commissionsMode !== undefined && { commissionsMode: params.commissionsMode }),
      ...(params.commissionsCharge !== undefined && { commissionsCharge: params.commissionsCharge }),
      ...(params.defaultCommissions !== undefined && { defaultCommissions: params.defaultCommissions }),
      ...(params.minOrderCommissions !== undefined && { minOrderCommissions: params.minOrderCommissions }),
      ...(params.maxOrderCommissions !== undefined && { maxOrderCommissions: params.maxOrderCommissions }),
      ...(params.maxOrdersAccountCount !== undefined && { maxOrdersAccountCount: params.maxOrdersAccountCount }),
      ...(params.maxOrdersSymbolCount !== undefined && { maxOrdersSymbolCount: params.maxOrdersSymbolCount }),
      ...(params.economicNewsCountries && { economicNewsCountries: params.economicNewsCountries }),
      ...(params.inhibitTradeCopier !== undefined && { inhibitTradeCopier: params.inhibitTradeCopier }),
      ...(params.intradayLiquidationMinsBefore !== undefined && { intradayLiquidationMinsBefore: params.intradayLiquidationMinsBefore }),
      ...(params.exchanges && { exchanges: params.exchanges }),
      ...(params.symbols && { symbols: params.symbols }),
      ...(params.symbolGroups && { symbolGroups: params.symbolGroups }),
      ...(params.borrowSymbols && { borrowSymbols: params.borrowSymbols }),
    };
  }

  private mapSymbolInfo(s: VolSymbolInfoViewModel): PlatformSymbolInfo {
    return {
      id: s.id,
      name: s.name ?? undefined,
      description: s.description ?? undefined,
      exchange: s.exchange ?? undefined,
      symbolGroup: s.symbolGroup ?? undefined,
      margin: s.margin,
      commission: s.commission,
      inhibitTrading: s.inhibitTrading,
      archived: s.archived,
      adv14D: s.adv14D ?? undefined,
      adv50D: s.adv50D ?? undefined,
      adc14D: s.adc14D ?? undefined,
      forceSubscription: s.forceSubscription,
      tickSize: s.tickSize,
      tickValue: s.tickValue,
      baseCurrency: s.baseCurrency ?? undefined,
      quoteCurrency: s.quoteCurrency ?? undefined,
      category: s.category ?? undefined,
    };
  }

  private buildTradingRuleBody(params: CreatePlatformTradingRuleParams): Record<string, unknown> {
    const body: Record<string, unknown> = {
      description: params.name,
      organizationReferenceId: params.organizationReferenceId,
      maxDrawdownMode: params.maxDrawdownMode,
      maxDrawdownMoney: params.maxDrawdownMoney,
      maxDrawdownPercentual: 0,
      maxDrawdownSelection: 0,
      maxDrawdownAction: params.maxDrawdownAction,
      maxDrawdownTrailingMode: params.maxDrawdownMode === 0 ? 0 : undefined,
      maxIntradayDrawdownMode: 1,
      maxIntradayDrawdownMoney: params.intradayMaxDrawdownMoney,
      maxIntradayDrawdownPercentual: 0,
      maxIntradayDrawdownSelection: 0,
      maxIntradayDrawdownAction: params.intradayMaxDrawdownAction,
      minSessionNumbers: params.minSessionNumbers ?? 0,
      failOnOvernight: false,
      failOnOverweekend: params.overweekendAction !== undefined && params.overweekendAction !== 0,
    };

    if (params.profitTargetMoney !== undefined && params.profitTargetMoney > 0) {
      body['profitTargetAction'] = params.profitTargetAction ?? 0;
      body['profitTargetCalculation'] = 0;
      body['profitTargetMoney'] = params.profitTargetMoney;
      body['profitTargetPercentual'] = 0;
      body['profitTargetSelection'] = 0;
      body['profitTargetSituation'] = 2;
    }

    if (params.consistencyPercentual !== undefined && params.consistencyPercentual > 0) {
      body['consistencyAction'] = 1;
      body['consistencyMode'] = 1;
      body['consistencyPercentual'] = params.consistencyPercentual;
    }

    if (params.newsRestrictionAction !== undefined && params.newsRestrictionAction > 0) {
      body['tradingNewsAction'] = params.newsRestrictionAction;
      body['tradingNewsWindowSeconds'] = 120;
    }

    return body;
  }

  private mapTradingToken(t: VolLoginTradingTokenResult): PlatformTradingTokenResult {
    return {
      wssEndpoint: t.tradingWssEndpoint ?? undefined,
      wssToken: t.tradingWssToken ?? undefined,
      restReportHost: t.tradingRestReportHost ?? undefined,
      restReportToken: t.tradingRestReportToken ?? undefined,
      restTokenExpiration: t.tradingRestTokenExpiration,
      tradingApiVersion: t.tradingApiVersion,
    };
  }

  private mapWebhookEvent(e: VolWebhookEventViewModel): PlatformWebhookEvent {
    return {
      occurredAt: new Date(e.dtUtc),
      category: WEBHOOK_CATEGORY_MAP[e.category] ?? String(e.category),
      event: WEBHOOK_EVENT_MAP[e.event] ?? String(e.event),
      userId: e.userId ?? undefined,
      accountId: e.accountId ?? undefined,
      tradingAccount: e.tradingAccount ?? undefined,
      tradingPosition: e.tradingPosition ?? undefined,
      subscription: e.subscription ?? undefined,
      tradeReport: e.tradeReport ?? undefined,
      tradingPortfolio: e.tradingPortfolio ?? undefined,
      organizationUser: e.organizationUser ?? undefined,
    };
  }

  private mapSubscription(s: VolSubscriptionViewModel): PlatformSubscriptionResult {
    return {
      subscriptionId: s.subscriptionId ?? '',
      confirmationId: s.confirmationId ?? undefined,
      status: (SUBSCRIPTION_STATUS_MAP[s.status] ?? String(s.status)) as PlatformSubscriptionResult['status'],
      providerStatus: s.providerStatus !== null
        ? ((SUBSCRIPTION_PROVIDER_STATUS_MAP[s.providerStatus] ?? String(s.providerStatus)) as PlatformSubscriptionResult['providerStatus'])
        : undefined,
      activation: s.activation ? new Date(s.activation) : undefined,
      expiration: s.expiration ? new Date(s.expiration) : undefined,
      dataFeedProducts: s.dxDataProducts ?? undefined,
      agreementSigned: s.dxAgreementSigned,
      agreementLink: s.dxAgreementLink ?? undefined,
      selfCertification: s.dxSelfCertification ?? undefined,
      platform: s.platform !== null
        ? ((PLATFORM_MAP[s.platform] ?? String(s.platform)) as PlatformSubscriptionResult['platform'])
        : undefined,
      volumetricaPlatform: s.volumetricaPlatform ?? undefined,
      volumetricaLicense: s.volumetricaLicense ?? undefined,
      downloadLink: s.volumetricaDownloadLink ?? undefined,
      userId: s.userId ?? undefined,
      lastVersionId: s.lastVersionId,
    };
  }
}
