import { AffiliateApplication, AffiliateApplicationStatus, Prisma } from '@prisma/client';
import { prisma } from '../utils/database.js';

// =============================================================================
// Affiliate Application Repository
// =============================================================================

export interface CreateAffiliateApplicationData {
  creatorId?: string | undefined;
  applicantEmail?: string | undefined;
  websiteUrl?: string | undefined;
  youtubeUrl?: string | undefined;
  xUrl?: string | undefined;
  instagramUrl?: string | undefined;
  facebookUrl?: string | undefined;
  telegramUrl?: string | undefined;
  discordUrl?: string | undefined;
  isFundedTrader: boolean;
  hasActiveDynastyAccount: boolean;
  promotionPlan: string;
  primaryTrafficMethod: string;
  createsCustomContent: boolean;
  contentUpdateFrequency: string;
  preferredAffiliateCode: string;
  restrictedJurisdictionConfirmation: boolean;
}

/**
 * Persist a new affiliate application.
 */
export const createAffiliateApplication = async (
  data: CreateAffiliateApplicationData
): Promise<AffiliateApplication> => {
  return prisma.affiliateApplication.create({
    data: {
      isFundedTrader: data.isFundedTrader,
      hasActiveDynastyAccount: data.hasActiveDynastyAccount,
      promotionPlan: data.promotionPlan,
      primaryTrafficMethod: data.primaryTrafficMethod,
      createsCustomContent: data.createsCustomContent,
      contentUpdateFrequency: data.contentUpdateFrequency,
      preferredAffiliateCode: data.preferredAffiliateCode,
      restrictedJurisdictionConfirmation: data.restrictedJurisdictionConfirmation,
      // Only include optional fields when present so we store NULL rather than ''
      ...(data.creatorId && { creatorId: data.creatorId }),
      ...(data.applicantEmail && { applicantEmail: data.applicantEmail }),
      ...(data.websiteUrl && { websiteUrl: data.websiteUrl }),
      ...(data.youtubeUrl && { youtubeUrl: data.youtubeUrl }),
      ...(data.xUrl && { xUrl: data.xUrl }),
      ...(data.instagramUrl && { instagramUrl: data.instagramUrl }),
      ...(data.facebookUrl && { facebookUrl: data.facebookUrl }),
      ...(data.telegramUrl && { telegramUrl: data.telegramUrl }),
      ...(data.discordUrl && { discordUrl: data.discordUrl }),
    },
  });
};

/**
 * Record the affiliate-platform registration/approval outcome on an application.
 */
export const updateApplicationPlatformResult = async (
  id: string,
  data: {
    platformPartnerId?: string | undefined;
    platformStatus?: string | undefined;
    status?: AffiliateApplicationStatus | undefined;
  }
): Promise<void> => {
  await prisma.affiliateApplication.update({
    where: { id },
    data: {
      ...(data.platformPartnerId && { platformPartnerId: data.platformPartnerId }),
      ...(data.platformStatus && { platformStatus: data.platformStatus }),
      ...(data.status && { status: data.status }),
    },
  });
};

/**
 * Find the application a webhook refers to, by its affiliate-platform partner id
 * or by the DF user id (externalId). Most recent first.
 */
export const findApplicationForWebhook = async (keys: {
  platformPartnerId?: string | undefined;
  creatorId?: string | undefined;
}): Promise<AffiliateApplication | null> => {
  const or: Prisma.AffiliateApplicationWhereInput[] = [];
  if (keys.platformPartnerId) or.push({ platformPartnerId: keys.platformPartnerId });
  if (keys.creatorId) or.push({ creatorId: keys.creatorId });
  if (or.length === 0) return null;

  return prisma.affiliateApplication.findFirst({
    where: { OR: or },
    orderBy: { createdAt: 'desc' },
  });
};
