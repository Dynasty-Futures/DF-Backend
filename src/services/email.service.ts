import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { AffiliateApplication, SupportTicket } from '@prisma/client';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

// =============================================================================
// SES Client
// =============================================================================

const createSesClient = (): SESClient | null => {
  // No SES client needed in development — emails are logged instead
  if (config.isDevelopment) {
    return null;
  }

  const clientConfig: ConstructorParameters<typeof SESClient>[0] = {
    region: config.aws.region,
  };

  // Use explicit credentials if provided, otherwise fall back to default AWS credential chain (IAM role, etc.)
  if (config.aws.accessKeyId && config.aws.secretAccessKey) {
    clientConfig.credentials = {
      accessKeyId: config.aws.accessKeyId,
      secretAccessKey: config.aws.secretAccessKey,
    };
  }

  return new SESClient(clientConfig);
};

const sesClient = createSesClient();

// =============================================================================
// Generic Email Sender
// =============================================================================

interface SendEmailParams {
  to: string | string[];
  subject: string;
  htmlBody: string;
  textBody: string;
  replyTo?: string | string[];
}

/**
 * Send an email via AWS SES.
 * In development mode, logs the email to the console instead of sending.
 */
export const sendEmail = async (params: SendEmailParams): Promise<void> => {
  const { to, subject, htmlBody, textBody, replyTo } = params;
  const toAddresses = Array.isArray(to) ? to : [to];
  const replyToAddresses = replyTo
    ? Array.isArray(replyTo) ? replyTo : [replyTo]
    : undefined;
  const fromEmail = config.aws.ses.fromEmail;

  // Development mode: log instead of sending
  if (config.isDevelopment) {
    logger.info(
      {
        emailDev: true,
        to: toAddresses,
        from: fromEmail,
        replyTo: replyToAddresses,
        subject,
        textBody,
      },
      `[EMAIL - DEV MODE] Would send email to ${toAddresses.join(', ')}`
    );
    return;
  }

  if (!sesClient) {
    logger.warn('SES client not initialized — skipping email send');
    return;
  }

  const command = new SendEmailCommand({
    Source: fromEmail,
    Destination: {
      ToAddresses: toAddresses,
    },
    ReplyToAddresses: replyToAddresses,
    Message: {
      Subject: {
        Data: subject,
        Charset: 'UTF-8',
      },
      Body: {
        Html: {
          Data: htmlBody,
          Charset: 'UTF-8',
        },
        Text: {
          Data: textBody,
          Charset: 'UTF-8',
        },
      },
    },
  });

  const result = await sesClient.send(command);

  logger.info(
    { messageId: result.MessageId, to: toAddresses, subject },
    'Email sent successfully via SES'
  );
};

// =============================================================================
// Support Ticket Email Notification
// =============================================================================

/**
 * Build the HTML body for a support ticket notification email.
 */
const buildTicketHtml = (ticket: SupportTicket): string => {
  const rows = [
    { label: 'Ticket ID', value: ticket.id },
    { label: 'Name', value: ticket.name ?? 'N/A (authenticated user)' },
    { label: 'Email', value: ticket.email ?? 'N/A (authenticated user)' },
    { label: 'Subject', value: ticket.subject },
    { label: 'Priority', value: ticket.priority },
    { label: 'Status', value: ticket.status },
    ...(ticket.relatedEntity
      ? [{ label: 'Related Entity', value: `${ticket.relatedEntity} (${ticket.relatedEntityId ?? 'N/A'})` }]
      : []),
    { label: 'Created At', value: ticket.createdAt.toISOString() },
  ];

  const tableRows = rows
    .map(
      (r) =>
        `<tr>
          <td style="padding:8px 12px;font-weight:bold;border:1px solid #ddd;background:#f9f9f9;">${r.label}</td>
          <td style="padding:8px 12px;border:1px solid #ddd;">${r.value}</td>
        </tr>`
    )
    .join('\n');

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="color:#333;">New Support Ticket Submitted</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        ${tableRows}
      </table>
      <h3 style="color:#333;">Message</h3>
      <div style="padding:12px;background:#f5f5f5;border:1px solid #ddd;border-radius:4px;white-space:pre-wrap;">${ticket.description}</div>
    </div>
  `.trim();
};

/**
 * Build the plain-text body for a support ticket notification email.
 */
const buildTicketText = (ticket: SupportTicket): string => {
  const lines = [
    '=== New Support Ticket Submitted ===',
    '',
    `Ticket ID:  ${ticket.id}`,
    `Name:       ${ticket.name ?? 'N/A (authenticated user)'}`,
    `Email:      ${ticket.email ?? 'N/A (authenticated user)'}`,
    `Subject:    ${ticket.subject}`,
    `Priority:   ${ticket.priority}`,
    `Status:     ${ticket.status}`,
  ];

  if (ticket.relatedEntity) {
    lines.push(`Related:    ${ticket.relatedEntity} (${ticket.relatedEntityId ?? 'N/A'})`);
  }

  lines.push(
    `Created At: ${ticket.createdAt.toISOString()}`,
    '',
    '--- Message ---',
    '',
    ticket.description
  );

  return lines.join('\n');
};

/**
 * Send a notification email to the support team when a new ticket is created.
 * This function handles its own errors — it logs failures rather than throwing,
 * so callers can safely fire-and-forget.
 */
export const sendSupportTicketNotification = async (
  ticket: SupportTicket
): Promise<void> => {
  try {
    const supportEmail = config.aws.ses.supportEmail;
    const subject = `[New Ticket #${ticket.id.slice(0, 8)}] ${ticket.subject}`;

    const emailParams: SendEmailParams = {
      to: supportEmail,
      subject,
      htmlBody: buildTicketHtml(ticket),
      textBody: buildTicketText(ticket),
    };

    if (ticket.email) {
      emailParams.replyTo = ticket.email;
    }

    await sendEmail(emailParams);
  } catch (err) {
    logger.error(
      { err, ticketId: ticket.id },
      'Failed to send support ticket notification email'
    );
  }
};

// =============================================================================
// Password Reset Email
// =============================================================================

interface PasswordResetEmailUser {
  email: string;
  firstName: string;
}

const RESET_LINK_TTL_MINUTES = 60;

const buildPasswordResetHtml = (
  firstName: string,
  resetUrl: string,
  isFirstPasswordSet: boolean
): string => {
  const heading = isFirstPasswordSet ? 'Set your password' : 'Reset your password';
  const body = isFirstPasswordSet
    ? `We received a request to set a password for your Dynasty Futures account. You usually sign in with Google — setting a password lets you sign in either way.`
    : `We received a request to reset the password for your Dynasty Futures account.`;

  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#222;">
      <h2 style="color:#111;">${heading}</h2>
      <p>Hi ${firstName || 'there'},</p>
      <p>${body}</p>
      <p style="margin:24px 0;">
        <a href="${resetUrl}"
           style="background:#111;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block;">
          ${heading}
        </a>
      </p>
      <p style="font-size:13px;color:#666;">
        This link expires in ${RESET_LINK_TTL_MINUTES} minutes. If the button doesn't work, paste this URL into your browser:
        <br /><span style="word-break:break-all;">${resetUrl}</span>
      </p>
      <p style="font-size:13px;color:#666;">
        If you didn't request this, you can safely ignore this email — your account is unchanged.
      </p>
    </div>
  `.trim();
};

const buildPasswordResetText = (
  firstName: string,
  resetUrl: string,
  isFirstPasswordSet: boolean
): string => {
  const heading = isFirstPasswordSet ? 'Set your password' : 'Reset your password';
  const body = isFirstPasswordSet
    ? `We received a request to set a password for your Dynasty Futures account. You usually sign in with Google — setting a password lets you sign in either way.`
    : `We received a request to reset the password for your Dynasty Futures account.`;

  return [
    `=== ${heading} ===`,
    '',
    `Hi ${firstName || 'there'},`,
    '',
    body,
    '',
    `Open this link to continue (expires in ${RESET_LINK_TTL_MINUTES} minutes):`,
    resetUrl,
    '',
    `If you didn't request this, you can safely ignore this email — your account is unchanged.`,
  ].join('\n');
};

/**
 * Send a password reset email with a one-time link.
 *
 * Errors are thrown — callers should decide whether to swallow them. For the
 * forgot-password flow, callers SHOULD swallow so the response shape doesn't
 * leak whether the email exists.
 */
export const sendPasswordResetEmail = async (
  user: PasswordResetEmailUser,
  rawToken: string,
  isFirstPasswordSet: boolean
): Promise<void> => {
  const resetUrl = `${config.frontendUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
  const subject = isFirstPasswordSet
    ? 'Set your Dynasty Futures password'
    : 'Reset your Dynasty Futures password';

  await sendEmail({
    to: user.email,
    subject,
    htmlBody: buildPasswordResetHtml(user.firstName, resetUrl, isFirstPasswordSet),
    textBody: buildPasswordResetText(user.firstName, resetUrl, isFirstPasswordSet),
  });
};

// =============================================================================
// Affiliate Application Email Notification
// =============================================================================

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Build the HTML body for an affiliate application notification email.
 */
const buildAffiliateApplicationHtml = (app: AffiliateApplication): string => {
  const yesNo = (v: boolean): string => (v ? 'Yes' : 'No');

  const socialRows = [
    { label: 'Website', value: app.websiteUrl },
    { label: 'YouTube', value: app.youtubeUrl },
    { label: 'X (Twitter)', value: app.xUrl },
    { label: 'Instagram', value: app.instagramUrl },
    { label: 'Facebook', value: app.facebookUrl },
    { label: 'Telegram', value: app.telegramUrl },
    { label: 'Discord', value: app.discordUrl },
  ].filter((r): r is { label: string; value: string } => Boolean(r.value));

  const rows = [
    { label: 'Application ID', value: app.id },
    { label: 'Applicant Email', value: app.applicantEmail ?? 'N/A (anonymous)' },
    { label: 'Preferred Affiliate Code', value: app.preferredAffiliateCode },
    { label: 'Funded Trader', value: yesNo(app.isFundedTrader) },
    { label: 'Active Dynasty Account', value: yesNo(app.hasActiveDynastyAccount) },
    { label: 'Creates Custom Content', value: yesNo(app.createsCustomContent) },
    {
      label: 'Restricted-Jurisdiction Confirmation',
      value: yesNo(app.restrictedJurisdictionConfirmation),
    },
    { label: 'Status', value: app.status },
    { label: 'Submitted At', value: app.createdAt.toISOString() },
  ];

  const renderTable = (data: { label: string; value: string }[]): string =>
    data
      .map(
        (r) =>
          `<tr>
          <td style="padding:8px 12px;font-weight:bold;border:1px solid #ddd;background:#f9f9f9;">${escapeHtml(r.label)}</td>
          <td style="padding:8px 12px;border:1px solid #ddd;">${escapeHtml(r.value)}</td>
        </tr>`
      )
      .join('\n');

  const socialSection = socialRows.length
    ? `<h3 style="color:#333;">Web & Social Presence</h3>
       <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">${renderTable(socialRows)}</table>`
    : '';

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="color:#333;">New Affiliate Application</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        ${renderTable(rows)}
      </table>
      ${socialSection}
      <h3 style="color:#333;">Promotion Plan</h3>
      <div style="padding:12px;background:#f5f5f5;border:1px solid #ddd;border-radius:4px;white-space:pre-wrap;margin-bottom:16px;">${escapeHtml(app.promotionPlan)}</div>
      <h3 style="color:#333;">Primary Traffic Method</h3>
      <div style="padding:12px;background:#f5f5f5;border:1px solid #ddd;border-radius:4px;white-space:pre-wrap;margin-bottom:16px;">${escapeHtml(app.primaryTrafficMethod)}</div>
      <h3 style="color:#333;">Content Update Frequency</h3>
      <div style="padding:12px;background:#f5f5f5;border:1px solid #ddd;border-radius:4px;white-space:pre-wrap;">${escapeHtml(app.contentUpdateFrequency)}</div>
    </div>
  `.trim();
};

/**
 * Build the plain-text body for an affiliate application notification email.
 */
const buildAffiliateApplicationText = (app: AffiliateApplication): string => {
  const yesNo = (v: boolean): string => (v ? 'Yes' : 'No');

  const lines = [
    '=== New Affiliate Application ===',
    '',
    `Application ID:            ${app.id}`,
    `Applicant Email:           ${app.applicantEmail ?? 'N/A (anonymous)'}`,
    `Preferred Affiliate Code:  ${app.preferredAffiliateCode}`,
    `Funded Trader:             ${yesNo(app.isFundedTrader)}`,
    `Active Dynasty Account:    ${yesNo(app.hasActiveDynastyAccount)}`,
    `Creates Custom Content:    ${yesNo(app.createsCustomContent)}`,
    `Restricted-Jur. Confirmed: ${yesNo(app.restrictedJurisdictionConfirmation)}`,
    `Status:                    ${app.status}`,
    `Submitted At:              ${app.createdAt.toISOString()}`,
    '',
    '--- Web & Social Presence ---',
  ];

  const socials: [string, string | null][] = [
    ['Website', app.websiteUrl],
    ['YouTube', app.youtubeUrl],
    ['X (Twitter)', app.xUrl],
    ['Instagram', app.instagramUrl],
    ['Facebook', app.facebookUrl],
    ['Telegram', app.telegramUrl],
    ['Discord', app.discordUrl],
  ];
  for (const [label, value] of socials) {
    if (value) lines.push(`${label}: ${value}`);
  }

  lines.push(
    '',
    '--- Promotion Plan ---',
    app.promotionPlan,
    '',
    '--- Primary Traffic Method ---',
    app.primaryTrafficMethod,
    '',
    '--- Content Update Frequency ---',
    app.contentUpdateFrequency
  );

  return lines.join('\n');
};

/**
 * Send a notification email to the affiliate team when a new application is submitted.
 * Handles its own errors — logs failures rather than throwing — so callers can
 * safely fire-and-forget.
 */
export const sendAffiliateApplicationNotification = async (
  application: AffiliateApplication
): Promise<void> => {
  try {
    const affiliateEmail = config.aws.ses.affiliateEmail;
    const subject = `[New Affiliate Application] ${application.preferredAffiliateCode}`;

    const emailParams: SendEmailParams = {
      to: affiliateEmail,
      subject,
      htmlBody: buildAffiliateApplicationHtml(application),
      textBody: buildAffiliateApplicationText(application),
    };

    if (application.applicantEmail) {
      emailParams.replyTo = application.applicantEmail;
    }

    await sendEmail(emailParams);
  } catch (err) {
    logger.error(
      { err, applicationId: application.id },
      'Failed to send affiliate application notification email'
    );
  }
};
