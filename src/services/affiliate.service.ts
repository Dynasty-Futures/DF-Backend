import crypto from 'crypto';
import {
  AffiliateApplication,
  AffiliateApplicationStatus,
  AffiliateCouponStatus,
} from '@prisma/client';
import { logger } from '../utils/logger.js';
import { ValidationError } from '../utils/errors.js';
import { sendAffiliateApplicationNotification } from './email.service.js';
import {
  createAffiliateApplication,
  updateApplicationPlatformResult,
  findApplicationForWebhook,
  findLatestApplicationByCreator,
  findCouponsByCreator,
  upsertAffiliateCoupon,
  CreateAffiliateApplicationData,
} from '../repositories/affiliate.repository.js';
import { getUserById } from '../repositories/user.repository.js';
import {
  isAffiliateRegistrationEnabled,
  registerPartner,
} from '../providers/affiliate/affiliate-platform.client.js';

// =============================================================================
// Affiliate Service
// =============================================================================

export interface SubmitAffiliateApplicationInput {
  // Populated server-side from auth when the submitter is logged in
  creatorId?: string | undefined;
  applicantEmail?: string | undefined;
  // Web / social presence — at least one is required
  websiteUrl?: string | undefined;
  youtubeUrl?: string | undefined;
  xUrl?: string | undefined;
  instagramUrl?: string | undefined;
  facebookUrl?: string | undefined;
  telegramUrl?: string | undefined;
  discordUrl?: string | undefined;
  // Background
  isFundedTrader: boolean;
  hasActiveDynastyAccount: boolean;
  promotionPlan: string;
  primaryTrafficMethod: string;
  // Content & confirmation
  createsCustomContent: boolean;
  contentUpdateFrequency: string;
  preferredAffiliateCode: string;
  restrictedJurisdictionConfirmation: boolean;
}

const SOCIAL_FIELDS = [
  'websiteUrl',
  'youtubeUrl',
  'xUrl',
  'instagramUrl',
  'facebookUrl',
  'telegramUrl',
  'discordUrl',
] as const satisfies ReadonlyArray<keyof SubmitAffiliateApplicationInput>;

/**
 * Submit a new affiliate application: persist it and notify the affiliate team.
 * Mirrors the support-ticket flow — the email send is fire-and-forget so a
 * transient SES failure never fails the applicant's submission.
 */
export const submitApplication = async (
  input: SubmitAffiliateApplicationInput
): Promise<AffiliateApplication> => {
  // At least one web/social URL is required
  const hasSocial = SOCIAL_FIELDS.some((f) => input[f]?.trim());
  if (!hasSocial) {
    throw new ValidationError('At least one website or social URL is required', {
      fields: [...SOCIAL_FIELDS],
    });
  }

  if (!input.promotionPlan.trim()) {
    throw new ValidationError('Promotion plan is required', { field: 'promotionPlan' });
  }
  if (!input.primaryTrafficMethod.trim()) {
    throw new ValidationError('Primary traffic method is required', {
      field: 'primaryTrafficMethod',
    });
  }
  if (!input.contentUpdateFrequency.trim()) {
    throw new ValidationError('Content update frequency is required', {
      field: 'contentUpdateFrequency',
    });
  }
  if (!input.preferredAffiliateCode.trim()) {
    throw new ValidationError('Preferred affiliate code is required', {
      field: 'preferredAffiliateCode',
    });
  }
  if (!input.restrictedJurisdictionConfirmation) {
    throw new ValidationError(
      'You must confirm you are not in a restricted or sanctioned jurisdiction',
      { field: 'restrictedJurisdictionConfirmation' }
    );
  }

  const data: CreateAffiliateApplicationData = {
    creatorId: input.creatorId,
    applicantEmail: input.applicantEmail?.toLowerCase().trim(),
    websiteUrl: input.websiteUrl?.trim(),
    youtubeUrl: input.youtubeUrl?.trim(),
    xUrl: input.xUrl?.trim(),
    instagramUrl: input.instagramUrl?.trim(),
    facebookUrl: input.facebookUrl?.trim(),
    telegramUrl: input.telegramUrl?.trim(),
    discordUrl: input.discordUrl?.trim(),
    isFundedTrader: input.isFundedTrader,
    hasActiveDynastyAccount: input.hasActiveDynastyAccount,
    promotionPlan: input.promotionPlan.trim(),
    primaryTrafficMethod: input.primaryTrafficMethod.trim(),
    createsCustomContent: input.createsCustomContent,
    contentUpdateFrequency: input.contentUpdateFrequency.trim(),
    preferredAffiliateCode: input.preferredAffiliateCode.trim().toUpperCase(),
    restrictedJurisdictionConfirmation: input.restrictedJurisdictionConfirmation,
  };

  logger.info(
    { creatorId: input.creatorId, preferredAffiliateCode: data.preferredAffiliateCode },
    'Creating affiliate application'
  );

  const application = await createAffiliateApplication(data);

  logger.info({ applicationId: application.id }, 'Affiliate application created successfully');

  // Fire-and-forget: notify the affiliate team
  sendAffiliateApplicationNotification(application).catch((err) => {
    logger.error(
      { err, applicationId: application.id },
      'Failed to send affiliate application email notification'
    );
  });

  // Fire-and-forget: register the applicant as a partner on the affiliate
  // platform so the request reaches the affiliate CRM. Never fails the local
  // submission. Only for logged-in applicants (anonymous lacks a name).
  if (isAffiliateRegistrationEnabled() && input.creatorId) {
    void registerOnAffiliatePlatform(application, input.creatorId).catch((err) => {
      logger.error(
        { err, applicationId: application.id },
        'Failed to register affiliate on the affiliate platform'
      );
    });
  }

  return application;
};

// Sanitize a preferred code to the affiliate platform's constraint
// (^[A-Za-z0-9]{3,20}$); returns undefined when it can't be satisfied so the
// platform assigns a code instead of rejecting the registration.
const sanitizeAffiliateCode = (raw: string): string | undefined => {
  const code = raw.replace(/[^A-Za-z0-9]/g, '').slice(0, 20);
  return code.length >= 3 ? code : undefined;
};

const registerOnAffiliatePlatform = async (
  application: AffiliateApplication,
  creatorId: string
): Promise<void> => {
  const user = await getUserById(creatorId);
  if (!user?.email || !user.firstName || !user.lastName) {
    logger.warn(
      { applicationId: application.id, creatorId },
      'affiliate-platform: missing user name/email — skipping registration'
    );
    return;
  }

  const result = await registerPartner({
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    // Throwaway: the affiliate never logs into the affiliate platform directly;
    // DF surfaces their data via service-token impersonation (Phase 2).
    password: crypto.randomBytes(24).toString('base64url'),
    externalId: creatorId,
    preferredAffiliateCode: sanitizeAffiliateCode(application.preferredAffiliateCode),
    metadata: {
      dfApplicationId: application.id,
      websiteUrl: application.websiteUrl,
      youtubeUrl: application.youtubeUrl,
      xUrl: application.xUrl,
      instagramUrl: application.instagramUrl,
      facebookUrl: application.facebookUrl,
      telegramUrl: application.telegramUrl,
      discordUrl: application.discordUrl,
      isFundedTrader: application.isFundedTrader,
      hasActiveDynastyAccount: application.hasActiveDynastyAccount,
      promotionPlan: application.promotionPlan,
      primaryTrafficMethod: application.primaryTrafficMethod,
      createsCustomContent: application.createsCustomContent,
      contentUpdateFrequency: application.contentUpdateFrequency,
    },
  });

  if (result.alreadyExists) {
    await updateApplicationPlatformResult(application.id, {
      platformStatus: 'ALREADY_REGISTERED',
    });
    return;
  }

  await updateApplicationPlatformResult(application.id, {
    platformPartnerId: result.partnerId,
    platformStatus: result.status ?? 'REGISTERED',
  });
  logger.info(
    { applicationId: application.id, partnerId: result.partnerId, status: result.status },
    'affiliate-platform: partner registered'
  );
};

// Pull a string from a (possibly dot-nested) key on the webhook payload.
const pick = (
  obj: Record<string, unknown>,
  paths: string[]
): string | undefined => {
  for (const path of paths) {
    let cur: unknown = obj;
    for (const seg of path.split('.')) {
      cur = (cur as Record<string, unknown> | undefined)?.[seg];
    }
    if (typeof cur === 'string' && cur.trim()) return cur;
  }
  return undefined;
};

const pickNumber = (obj: Record<string, unknown>, key: string): number | undefined => {
  const v = obj[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
};

// The DF user id is set as the partner's externalId at registration; YPF echoes
// it back under `partnerExternalId` (other keys are defensive fallbacks).
const pickExternalId = (payload: Record<string, unknown>): string | undefined =>
  pick(payload, ['partnerExternalId', 'externalId', 'partner.externalId', 'user.externalId']);

const pickPartnerId = (payload: Record<string, unknown>): string | undefined =>
  pick(payload, ['partnerId', 'partner.id', 'id']);

const COUPON_STATUS_BY_EVENT: Record<string, AffiliateCouponStatus> = {
  AffiliateCouponCreated: AffiliateCouponStatus.CREATED,
  AffiliateCouponApproved: AffiliateCouponStatus.APPROVED,
  AffiliateCouponRejected: AffiliateCouponStatus.REJECTED,
};

/**
 * Handle an affiliate webhook event from YPF (AffiliatePartner* / AffiliateCoupon*).
 * The affiliate read API needs a service token we don't have yet, so we can't
 * re-fetch — local state is updated from the payload (the webhook endpoint is
 * secret-gated, so trusting the body is acceptable). The full payload is logged
 * so any contract drift is visible.
 */
export const handleAffiliateWebhookEvent = async (
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> => {
  logger.info({ eventType, payload }, 'affiliate-webhook: received event');

  if (eventType in COUPON_STATUS_BY_EVENT) {
    await handleCouponEvent(eventType, payload);
    return;
  }
  await handlePartnerEvent(eventType, payload);
};

const handlePartnerEvent = async (
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> => {
  const status =
    eventType === 'AffiliatePartnerApproved'
      ? AffiliateApplicationStatus.APPROVED
      : eventType === 'AffiliatePartnerRejected'
        ? AffiliateApplicationStatus.REJECTED
        : undefined;

  // AffiliatePartnerRegistered carries the referral code + partner id; capture
  // them without changing the local approval status (still PENDING).
  const isRegistered = eventType === 'AffiliatePartnerRegistered';
  if (!status && !isRegistered) {
    return;
  }

  const platformPartnerId = pickPartnerId(payload);
  const externalId = pickExternalId(payload);

  const application = await findApplicationForWebhook({
    platformPartnerId,
    creatorId: externalId,
  });
  if (!application) {
    logger.warn(
      { eventType, platformPartnerId, externalId },
      'affiliate-webhook: no matching local application'
    );
    return;
  }

  await updateApplicationPlatformResult(application.id, {
    ...(status && { status }),
    platformStatus: eventType,
    platformPartnerId,
    referralCode: pick(payload, ['referralCode']),
  });
  logger.info(
    { applicationId: application.id, eventType, status },
    'affiliate-webhook: application updated'
  );
};

const handleCouponEvent = async (
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> => {
  const platformCouponId = pick(payload, ['couponId', 'coupon.id', 'id']);
  const code = pick(payload, ['code', 'coupon.code']);
  if (!platformCouponId || !code) {
    logger.warn({ eventType }, 'affiliate-webhook: coupon event missing couponId/code');
    return;
  }

  await upsertAffiliateCoupon({
    platformCouponId,
    code,
    status: COUPON_STATUS_BY_EVENT[eventType] ?? AffiliateCouponStatus.CREATED,
    platformPartnerId: pickPartnerId(payload),
    creatorId: pickExternalId(payload),
    discountType: pick(payload, ['discountType']),
    discountValue: pickNumber(payload, 'discountValue'),
  });
  logger.info({ eventType, platformCouponId, code }, 'affiliate-webhook: coupon mirrored');
};

// =============================================================================
// Affiliate dashboard (read) — sourced from webhook-mirrored state
// =============================================================================

export interface AffiliateCouponView {
  code: string;
  discountType: string | null;
  discountValue: number;
  status: AffiliateCouponStatus;
}

export interface MyAffiliateStatus {
  /** Whether the user has ever applied. */
  hasApplied: boolean;
  status: AffiliateApplicationStatus | null;
  isApproved: boolean;
  preferredCode: string | null;
  referralCode: string | null;
  appliedAt: string | null;
  coupons: AffiliateCouponView[];
}

/**
 * Build the affiliate dashboard payload for a user from locally-mirrored
 * webhook state. Earnings / clicks / tier data are NOT available without the
 * affiliate-platform service token, so they are intentionally absent here and
 * rendered as "syncing" on the client.
 */
export const getMyAffiliateStatus = async (userId: string): Promise<MyAffiliateStatus> => {
  const [application, coupons] = await Promise.all([
    findLatestApplicationByCreator(userId),
    findCouponsByCreator(userId),
  ]);

  return {
    hasApplied: Boolean(application),
    status: application?.status ?? null,
    isApproved: application?.status === AffiliateApplicationStatus.APPROVED,
    preferredCode: application?.preferredAffiliateCode ?? null,
    referralCode: application?.referralCode ?? null,
    appliedAt: application?.createdAt.toISOString() ?? null,
    coupons: coupons.map((c) => ({
      code: c.code,
      discountType: c.discountType,
      discountValue: c.discountValue,
      status: c.status,
    })),
  };
};
