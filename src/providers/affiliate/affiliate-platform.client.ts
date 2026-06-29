// =============================================================================
// Affiliate Platform Client
// =============================================================================
// Thin wrapper around the separate Affiliate Platform API
// (affiliates.production.quant-technology.team) — NOT the YPF client API.
//
// Phase 1 uses only the PUBLIC partner-registration endpoint, which needs the
// `X-Tenant-ID` header (no auth token). Phase 2 (dashboard reads / impersonation)
// will add the `X-Service-Token` header once YPF provides one.
// =============================================================================

import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';

const REQUEST_TIMEOUT_MS = 15_000;

export interface RegisterPartnerInput {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  externalId?: string | undefined;
  preferredAffiliateCode?: string | undefined;
  sponsorRefCode?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface RegisterPartnerResult {
  /** Affiliate-platform partner id (uuid), when returned. */
  partnerId?: string | undefined;
  status?: string | undefined;
  /** True when the partner already existed (HTTP 409) — treated as success. */
  alreadyExists: boolean;
}

/** Whether registration is configured + enabled. */
export const isAffiliateRegistrationEnabled = (): boolean =>
  config.affiliate.registrationEnabled && Boolean(config.affiliate.tenantId);

/**
 * Register a new affiliate partner. Throws on a non-2xx (other than 409, which
 * is surfaced as `alreadyExists`) so the caller can decide how to handle it.
 */
export const registerPartner = async (
  input: RegisterPartnerInput,
): Promise<RegisterPartnerResult> => {
  const base = config.affiliate.apiUrl.replace(/\/+$/, '');

  const res = await fetch(`${base}/api/v1/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Tenant-ID': config.affiliate.tenantId,
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (res.status === 409) {
    logger.info(
      { email: input.email, externalId: input.externalId },
      'affiliate-platform: partner already exists (409)',
    );
    return { alreadyExists: true };
  }

  const body = (await res.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  if (!res.ok) {
    const msg =
      (body && (body['message'] || body['error'])) || `HTTP ${res.status}`;
    throw new Error(`Affiliate registration failed: ${String(msg)}`);
  }

  return {
    partnerId: (body?.['id'] as string | undefined) ?? undefined,
    status: (body?.['status'] as string | undefined) ?? undefined,
    alreadyExists: false,
  };
};

// =============================================================================
// Phase 2 — partner dashboard reads (service token + impersonation)
// =============================================================================

/** Flattened, UI-ready partner dashboard figures. */
export interface PartnerDashboard {
  tierName: string | null;
  /** Commission rate as a percentage (e.g. 10 for 10%). */
  commissionRate: number | null;
  totalRevenue: number;
  totalCommissions: number;
  paidCommissions: number;
  pendingCommissions: number;
  availablePayoutAmount: number;
  payoutOnHoldAmount: number;
  totalOrders: number;
  /** Paid (converted) orders, from the analytics order breakdown. */
  paidOrders: number;
  totalReferralClicks: number;
  totalReferralClicksLast30Days: number;
  /** Direct sign-ups referred by this partner. */
  directReferrals: number;
}

/** Whether partner dashboard reads are configured (service token present). */
export const isAffiliateDashboardEnabled = (): boolean =>
  Boolean(config.affiliate.serviceToken && config.affiliate.tenantId);

const num = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0;

/**
 * Read a partner's dashboard figures by impersonating them with the service
 * token. Impersonation MUST use the affiliate-platform partner UUID (the DF
 * externalId is not resolvable for impersonation). Best-effort: returns `null`
 * if the token is missing or any required call fails, so the dashboard falls
 * back to webhook-mirrored status without erroring.
 */
export const fetchPartnerDashboard = async (
  platformPartnerId: string,
): Promise<PartnerDashboard | null> => {
  if (!isAffiliateDashboardEnabled()) return null;

  const base = config.affiliate.apiUrl.replace(/\/+$/, '');
  const headers = {
    Accept: 'application/json',
    'X-Service-Token': config.affiliate.serviceToken as string,
    'X-Tenant-ID': config.affiliate.tenantId,
    'X-Impersonate-User-Id': platformPartnerId,
  };

  const get = async (path: string): Promise<Record<string, unknown>> => {
    const res = await fetch(`${base}${path}`, {
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
    return (await res.json()) as Record<string, unknown>;
  };

  try {
    // Analytics is the richest source and is required; stats + profile are
    // best-effort enrichments (paid/pending split, sign-up count).
    const analytics = await get('/api/v1/partners/me/analytics');
    const [stats, me] = await Promise.all([
      get('/api/v1/partners/me/stats').catch(() => null),
      get('/api/v1/partners/me').catch(() => null),
    ]);

    const breakdown = (analytics['orderBreakdown'] as Record<string, unknown>) ?? {};

    return {
      tierName:
        (analytics['currentTierName'] as string | undefined) ??
        (me?.['tierName'] as string | undefined) ??
        null,
      commissionRate:
        analytics['effectiveCommissionRate'] != null
          ? num(analytics['effectiveCommissionRate'])
          : stats?.['commissionRate'] != null
            ? num(stats['commissionRate'])
            : null,
      totalRevenue: num(analytics['totalRevenue']),
      totalCommissions: num(analytics['totalCommissions']),
      paidCommissions: num(stats?.['paidCommissions']),
      pendingCommissions: num(stats?.['pendingCommissions']),
      availablePayoutAmount: num(analytics['availablePayoutAmount']),
      payoutOnHoldAmount: num(analytics['payoutOnHoldAmount']),
      totalOrders: num(analytics['totalOrders']),
      paidOrders: num(breakdown['paid']),
      totalReferralClicks: num(analytics['totalReferralClicks']),
      totalReferralClicksLast30Days: num(analytics['totalReferralClicksLast30Days']),
      directReferrals: num(me?.['directReferrals']),
    };
  } catch (err) {
    logger.warn(
      { err, platformPartnerId },
      'affiliate-platform: partner dashboard fetch failed — falling back to webhook data',
    );
    return null;
  }
};
