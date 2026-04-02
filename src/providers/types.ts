// =============================================================================
// Platform-Agnostic Trading Provider Types
// =============================================================================
// These DTOs decouple the rest of the app from any specific trading platform's
// API schema. Services and routes only work with these types.
// =============================================================================

// ── User ────────────────────────────────────────────────────────────────────

export interface CreatePlatformUserParams {
  email: string;
  firstName: string;
  lastName: string;
  country: string;
  phone?: string | undefined;
  address?: string | undefined;
  postalCode?: string | undefined;
  city?: string | undefined;
  state?: string | undefined;
  birthday?: Date | undefined;
  language?: string | undefined;
  /** Your internal user ID — stored as extEntityId on the platform */
  externalId?: string | undefined;
}

export interface UpdatePlatformUserParams {
  email?: string | undefined;
  firstName?: string | undefined;
  lastName?: string | undefined;
  country?: string | undefined;
  phone?: string | undefined;
  address?: string | undefined;
  postalCode?: string | undefined;
  city?: string | undefined;
  state?: string | undefined;
  birthday?: Date | undefined;
  language?: string | undefined;
}

export interface InvitePlatformUserParams {
  country: string;
  email?: string | undefined;
  /** Your internal user ID — prevents duplicate invitations */
  externalId?: string | undefined;
}

/** Returned after POST /User (create) or PUT /User (update). */
export interface PlatformUserCreateResult {
  platformUserId: string;
  username?: string | undefined;
}

/** Returned after GET /User — the full user profile view. */
export interface PlatformUserResult {
  platformUserId: string;
  email?: string | undefined;
  firstName?: string | undefined;
  lastName?: string | undefined;
  userName?: string | undefined;
  phone?: string | undefined;
  address?: string | undefined;
  postalCode?: string | undefined;
  city?: string | undefined;
  state?: string | undefined;
  country?: string | undefined;
  birthday?: Date | undefined;
  organizationStatus?: number | undefined;
  webAccessDisabled?: boolean | undefined;
  extEntityId?: string | undefined;
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
}

export interface PlatformInviteResult {
  platformUserId: string;
  status: number;
  inviteUrl?: string | undefined;
  externalId?: string | undefined;
  inviteId?: string | undefined;
}

// ── Account ─────────────────────────────────────────────────────────────────

export interface CreatePlatformAccountParams {
  platformUserId: string;
  accountName: string;
  startingBalance: number;
  /** Platform-specific account group / template ID */
  groupId?: string | undefined;
  currency?: string | undefined;
}

export interface PlatformAccountResult {
  platformAccountId: string;
  platformUserId: string;
  accountName: string;
  status: string;
  balance: number;
  equity?: number | undefined;
  openPnl?: number | undefined;
  margin?: number | undefined;
  startingBalance: number;
  currency: string;
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
}

// ── Report ──────────────────────────────────────────────────────────────────

export interface PlatformReportResult {
  platformAccountId: string;
  startDate: Date;
  endDate: Date;
  totalPnl: number;
  totalTrades: number;
  winRate: number;
  averageWin: number;
  averageLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio?: number | undefined;
  bestDay?: number | undefined;
  worstDay?: number | undefined;
  raw?: Record<string, unknown> | undefined;
}

// ── Snapshots ───────────────────────────────────────────────────────────────

export interface PlatformSnapshotResult {
  platformAccountId: string;
  date: Date;
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

// ── Trades ──────────────────────────────────────────────────────────────────

export interface PlatformTradeResult {
  externalId: string;
  platformAccountId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  entryPrice: number;
  exitPrice?: number | undefined;
  realizedPnl?: number | undefined;
  commission: number;
  entryTime: Date;
  exitTime?: Date | undefined;
  metadata?: Record<string, unknown> | undefined;
}

// ── Dashboard / Login ───────────────────────────────────────────────────────

export interface PlatformLoginUrlResult {
  url: string;
}

export interface PlatformIFrameUrlResult {
  url: string;
}

/** iFrame variant type for the different embed modes */
export type IFrameType =
  | 'dashboard'
  | 'portfolio'
  | 'userGoal'
  | 'economicCalendar'
  | 'webApp';
