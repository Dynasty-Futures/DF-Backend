import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { SupportTicket } from '@prisma/client';
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
