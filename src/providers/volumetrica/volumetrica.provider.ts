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
}
