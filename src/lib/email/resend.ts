import { Resend } from 'resend';

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY);

// Default from address - update this to your verified domain
const DEFAULT_FROM = 'WisdomBI <noreply@mail.wisdombi.ai>';

/**
 * Escape HTML entities to prevent XSS in email templates
 */
function escapeHtml(text: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, char => htmlEntities[char]);
}

// Brand colors
const BRAND_ORANGE = '#F5821F';
const BRAND_NAVY = '#172238';
const BRAND_ORANGE_LIGHT = '#fff8f1';
const BRAND_NAVY_LIGHT = '#f4f6f9';

// Logo URL - uses production domain for email compatibility
const LOGO_URL = 'https://wisdombi.ai/images/logo-main.png';

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

export interface EmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

/**
 * Common email header with WisdomBI branding
 */
const getEmailHeader = () => `
  <div style="text-align: center; margin-bottom: 30px;">
    <img src="${LOGO_URL}" alt="WisdomBI" style="max-width: 180px; height: auto;" />
  </div>
`;

/**
 * Common email footer with WisdomBI branding
 */
const getEmailFooter = (to?: string) => `
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
  <p style="color: #9ca3af; font-size: 12px; text-align: center;">
    WisdomBI - Business Intelligence Platform<br>
    ${to ? `This email was sent to ${to}` : ''}
  </p>
`;

/**
 * Primary CTA button style
 */
const getPrimaryButton = (url: string, text: string) => `
  <div style="text-align: center; margin: 30px 0;">
    <a href="${url}" style="display: inline-block; background: ${BRAND_ORANGE}; color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px;">
      ${text}
    </a>
  </div>
`;

/**
 * Send an email using Resend
 */
export async function sendEmail(options: SendEmailOptions): Promise<EmailResult> {
  try {
    const { data, error } = await resend.emails.send({
      from: options.from || DEFAULT_FROM,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo,
      headers: options.headers,
    });

    if (error) {
      console.error('[Email] Failed to send:', error);
      return { success: false, error: error.message };
    }

    console.log('[Email] Sent successfully:', data?.id);
    return { success: true, id: data?.id };
  } catch (err) {
    console.error('[Email] Error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error'
    };
  }
}

/**
 * Send client invitation email
 */
export async function sendClientInvitation(params: {
  to: string;
  clientName: string;
  coachName: string;
  businessName: string;
  loginUrl: string;
  tempPassword?: string;
}): Promise<EmailResult> {
  const { to, clientName, coachName, businessName, loginUrl, tempPassword } = params;

  // Escape user-provided content to prevent XSS
  const safeClientName = escapeHtml(clientName);
  const safeCoachName = escapeHtml(coachName);
  const safeBusinessName = escapeHtml(businessName);
  const safeTempPassword = tempPassword ? escapeHtml(tempPassword) : undefined;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      ${getEmailHeader()}

      <h2 style="color: ${BRAND_NAVY};">Welcome to Your Business Intelligence Platform</h2>

      <p>Hi ${safeClientName},</p>

      <p><strong>${safeCoachName}</strong> has invited you to join <strong>${safeBusinessName}</strong> on WisdomBI - your dedicated platform for tracking business goals, metrics, and growth.</p>

      <div style="background: ${BRAND_ORANGE_LIGHT}; border: 1px solid #fcd5b8; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <p style="margin: 0 0 10px 0;"><strong>What you can do:</strong></p>
        <ul style="margin: 0; padding-left: 20px;">
          <li>Track your annual and quarterly goals</li>
          <li>Monitor key business metrics</li>
          <li>Communicate with your coach</li>
          <li>Complete weekly reviews</li>
          <li>Access your one-page business plan</li>
        </ul>
      </div>

      ${safeTempPassword ? `
      <div style="background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <p style="margin: 0 0 10px 0;"><strong>Your temporary password:</strong></p>
        <code style="background: #fff; padding: 8px 16px; border-radius: 4px; font-size: 16px; display: inline-block;">${safeTempPassword}</code>
        <p style="margin: 10px 0 0 0; font-size: 14px; color: #92400e;">Please change this after your first login.</p>
      </div>
      ` : ''}

      ${getPrimaryButton(loginUrl, 'Get Started')}

      <p style="color: #6b7280; font-size: 14px;">
        If you have any questions, simply reply to this email or reach out to your coach directly through the platform.
      </p>

      ${getEmailFooter(to)}
    </body>
    </html>
  `;

  return sendEmail({
    to,
    subject: `${safeCoachName} invited you to ${safeBusinessName} on WisdomBI`,
    html,
    replyTo: undefined, // Could add coach's email here
  });
}

/**
 * Send password reset email
 */
export async function sendPasswordReset(params: {
  to: string;
  name: string;
  resetUrl: string;
}): Promise<EmailResult> {
  const { to, name, resetUrl } = params;
  const safeName = escapeHtml(name);

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      ${getEmailHeader()}

      <h2 style="color: ${BRAND_NAVY}; text-align: center;">Reset Your Password</h2>

      <p>Hi ${safeName},</p>

      <p>We received a request to reset your password. Click the button below to create a new password:</p>

      ${getPrimaryButton(resetUrl, 'Reset Password')}

      <p style="color: #6b7280; font-size: 14px;">
        This link will expire in 1 hour. If you didn't request this, you can safely ignore this email.
      </p>

      ${getEmailFooter()}
    </body>
    </html>
  `;

  return sendEmail({
    to,
    subject: 'Reset your WisdomBI password',
    html,
  });
}

/**
 * Send session reminder email
 */
export async function sendSessionReminder(params: {
  to: string;
  clientName: string;
  coachName: string;
  sessionDate: string;
  sessionTime: string;
  meetingLink?: string;
}): Promise<EmailResult> {
  const { to, clientName, coachName, sessionDate, sessionTime, meetingLink } = params;
  const safeClientName = escapeHtml(clientName);
  const safeCoachName = escapeHtml(coachName);
  const safeSessionDate = escapeHtml(sessionDate);
  const safeSessionTime = escapeHtml(sessionTime);

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      ${getEmailHeader()}

      <h2 style="color: ${BRAND_NAVY}; text-align: center;">Session Reminder</h2>

      <p>Hi ${safeClientName},</p>

      <p>This is a reminder about your upcoming coaching session with <strong>${safeCoachName}</strong>.</p>

      <div style="background: ${BRAND_ORANGE_LIGHT}; border: 1px solid #fcd5b8; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
        <p style="margin: 0; font-size: 18px; font-weight: 600; color: ${BRAND_ORANGE};">${safeSessionDate}</p>
        <p style="margin: 5px 0 0 0; font-size: 24px; font-weight: bold; color: ${BRAND_NAVY};">${safeSessionTime}</p>
      </div>

      ${meetingLink ? getPrimaryButton(meetingLink, 'Join Meeting') : ''}

      <p style="color: #6b7280; font-size: 14px;">
        Before your session, consider reviewing your weekly progress and any action items from your last meeting.
      </p>

      ${getEmailFooter()}
    </body>
    </html>
  `;

  return sendEmail({
    to,
    subject: `Reminder: Coaching session with ${safeCoachName} on ${safeSessionDate}`,
    html,
  });
}

/**
 * Send new message notification
 */
export async function sendMessageNotification(params: {
  to: string;
  recipientName: string;
  senderName: string;
  messagePreview: string;
  dashboardUrl: string;
}): Promise<EmailResult> {
  const { to, recipientName, senderName, messagePreview, dashboardUrl } = params;
  const safeRecipientName = escapeHtml(recipientName);
  const safeSenderName = escapeHtml(senderName);
  const safeMessagePreview = escapeHtml(messagePreview);

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      ${getEmailHeader()}

      <p>Hi ${safeRecipientName},</p>

      <p>You have a new message from <strong>${safeSenderName}</strong>:</p>

      <div style="background: #f3f4f6; border-left: 4px solid ${BRAND_ORANGE}; padding: 15px 20px; margin: 20px 0; border-radius: 0 8px 8px 0;">
        <p style="margin: 0; color: #4b5563; font-style: italic;">"${safeMessagePreview}"</p>
      </div>

      ${getPrimaryButton(dashboardUrl, 'View Message')}

      ${getEmailFooter()}
    </body>
    </html>
  `;

  return sendEmail({
    to,
    subject: `New message from ${safeSenderName}`,
    html,
  });
}

/**
 * Send a test email to verify branding
 */
export async function sendTestEmail(params: {
  to: string;
  name?: string;
}): Promise<EmailResult> {
  const { to, name = 'there' } = params;
  const safeName = escapeHtml(name);

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      ${getEmailHeader()}

      <h2 style="color: ${BRAND_NAVY}; text-align: center;">Email Branding Test</h2>

      <p>Hi ${safeName},</p>

      <p>This is a test email to verify that the WisdomBI email branding is working correctly.</p>

      <div style="background: ${BRAND_ORANGE_LIGHT}; border: 1px solid #fcd5b8; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <p style="margin: 0 0 10px 0;"><strong>Brand Colors:</strong></p>
        <ul style="margin: 0; padding-left: 20px;">
          <li>Brand Orange: <span style="color: ${BRAND_ORANGE}; font-weight: bold;">${BRAND_ORANGE}</span></li>
          <li>Brand Navy: <span style="color: ${BRAND_NAVY}; font-weight: bold;">${BRAND_NAVY}</span></li>
        </ul>
      </div>

      <div style="background: ${BRAND_NAVY_LIGHT}; border: 1px solid #cdd7e5; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <p style="margin: 0; color: ${BRAND_NAVY};">
          <strong>This is a secondary info box</strong><br>
          Using the navy color scheme for variety.
        </p>
      </div>

      ${getPrimaryButton('#', 'Primary Button Example')}

      <p style="color: #6b7280; font-size: 14px;">
        If this email looks good, the branding update was successful!
      </p>

      ${getEmailFooter(to)}
    </body>
    </html>
  `;

  return sendEmail({
    to,
    subject: 'WisdomBI - Email Branding Test',
    html,
  });
}

export { resend };
