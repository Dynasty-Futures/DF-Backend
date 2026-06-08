import { AffiliateApplication } from '@prisma/client';
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
