import { AffiliateApplication } from '@prisma/client';
import { logger } from '../utils/logger.js';
import { ValidationError } from '../utils/errors.js';
import { sendAffiliateApplicationNotification } from './email.service.js';
import {
  createAffiliateApplication,
  CreateAffiliateApplicationData,
} from '../repositories/affiliate.repository.js';

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

  return application;
};
