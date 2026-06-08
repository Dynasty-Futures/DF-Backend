import { AffiliateApplicationStatus } from '@prisma/client';
import { submitApplication, SubmitAffiliateApplicationInput } from '../affiliate.service';
import { ValidationError } from '../../utils/errors';

// =============================================================================
// Mocks
// =============================================================================

const mockCreateAffiliateApplication = jest.fn();
const mockSendAffiliateApplicationNotification = jest.fn();

jest.mock('../../repositories/affiliate.repository', () => ({
  createAffiliateApplication: (...args: unknown[]) => mockCreateAffiliateApplication(...args),
}));

jest.mock('../email.service', () => ({
  sendAffiliateApplicationNotification: (...args: unknown[]) =>
    mockSendAffiliateApplicationNotification(...args),
}));

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// =============================================================================
// Fixtures
// =============================================================================

const validInput = (): SubmitAffiliateApplicationInput => ({
  websiteUrl: 'https://mysite.com',
  isFundedTrader: true,
  hasActiveDynastyAccount: false,
  promotionPlan: 'YouTube reviews and a newsletter.',
  primaryTrafficMethod: 'Long-form YouTube videos.',
  createsCustomContent: true,
  contentUpdateFrequency: 'Weekly, YouTube drives the most traffic.',
  preferredAffiliateCode: 'goat15',
  restrictedJurisdictionConfirmation: true,
});

const persisted = (overrides: Record<string, unknown> = {}) => ({
  id: 'app-1',
  creatorId: null,
  applicantEmail: null,
  websiteUrl: 'https://mysite.com',
  youtubeUrl: null,
  xUrl: null,
  instagramUrl: null,
  facebookUrl: null,
  telegramUrl: null,
  discordUrl: null,
  isFundedTrader: true,
  hasActiveDynastyAccount: false,
  promotionPlan: 'YouTube reviews and a newsletter.',
  primaryTrafficMethod: 'Long-form YouTube videos.',
  createsCustomContent: true,
  contentUpdateFrequency: 'Weekly, YouTube drives the most traffic.',
  preferredAffiliateCode: 'GOAT15',
  restrictedJurisdictionConfirmation: true,
  status: AffiliateApplicationStatus.PENDING,
  createdAt: new Date('2026-06-08'),
  updatedAt: new Date('2026-06-08'),
  ...overrides,
});

// =============================================================================
// Tests
// =============================================================================

describe('affiliateService.submitApplication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateAffiliateApplication.mockResolvedValue(persisted());
    mockSendAffiliateApplicationNotification.mockResolvedValue(undefined);
  });

  it('persists a valid application and fires the notification email', async () => {
    const result = await submitApplication(validInput());

    expect(mockCreateAffiliateApplication).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('app-1');
    expect(result.status).toBe(AffiliateApplicationStatus.PENDING);
    expect(mockSendAffiliateApplicationNotification).toHaveBeenCalledWith(persisted());
  });

  it('normalizes the affiliate code to uppercase and trims text fields', async () => {
    await submitApplication({
      ...validInput(),
      preferredAffiliateCode: '  goat15  ',
      promotionPlan: '  has spaces  ',
    });

    const data = mockCreateAffiliateApplication.mock.calls[0][0];
    expect(data.preferredAffiliateCode).toBe('GOAT15');
    expect(data.promotionPlan).toBe('has spaces');
  });

  it('captures creatorId and applicantEmail when the submitter is authenticated', async () => {
    await submitApplication({
      ...validInput(),
      creatorId: 'user-1',
      applicantEmail: 'Trader@Example.com',
    });

    const data = mockCreateAffiliateApplication.mock.calls[0][0];
    expect(data.creatorId).toBe('user-1');
    expect(data.applicantEmail).toBe('trader@example.com');
  });

  it('accepts an application with a non-website social URL', async () => {
    await expect(
      submitApplication({
        ...validInput(),
        websiteUrl: undefined,
        discordUrl: 'https://discord.gg/abc',
      })
    ).resolves.toBeDefined();
  });

  it('rejects when no website or social URL is provided', async () => {
    await expect(
      submitApplication({ ...validInput(), websiteUrl: undefined })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(mockCreateAffiliateApplication).not.toHaveBeenCalled();
  });

  it('rejects when the restricted-jurisdiction confirmation is missing', async () => {
    await expect(
      submitApplication({ ...validInput(), restrictedJurisdictionConfirmation: false })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(mockCreateAffiliateApplication).not.toHaveBeenCalled();
  });

  it('rejects when the preferred affiliate code is blank', async () => {
    await expect(
      submitApplication({ ...validInput(), preferredAffiliateCode: '   ' })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('still resolves when the notification email fails (fire-and-forget)', async () => {
    mockSendAffiliateApplicationNotification.mockRejectedValueOnce(new Error('SES down'));

    await expect(submitApplication(validInput())).resolves.toBeDefined();
  });
});
