import { Resend } from 'resend';

// Lazy-initialize Resend client (only at runtime, not build time)
let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

// Default from address - update this to your verified domain
const DEFAULT_FROM = 'Wisdom BI <noreply@mail.wisdombi.ai>';

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
}

export interface EmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

/**
 * Send an email using Resend
 */
export async function sendEmail(options: SendEmailOptions): Promise<EmailResult> {
  try {
    const resend = getResendClient();
    const { data, error } = await resend.emails.send({
      from: options.from || DEFAULT_FROM,
      to: options.to,
      subject: options.subject,
      html: options.html,
      replyTo: options.replyTo,
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

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <div style="display: inline-block; width: 50px; height: 50px; background: linear-gradient(135deg, #14b8a6, #0d9488); border-radius: 12px; line-height: 50px;">
          <span style="color: white; font-size: 24px; font-weight: bold;">W</span>
        </div>
        <h1 style="color: #0d9488; margin: 10px 0 0 0;">Wisdom BI</h1>
      </div>

      <h2 style="color: #1f2937;">Welcome to Your Business Intelligence Platform</h2>

      <p>Hi ${clientName},</p>

      <p><strong>${coachName}</strong> has invited you to join <strong>${businessName}</strong> on Wisdom BI - your dedicated platform for tracking business goals, metrics, and growth.</p>

      <div style="background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <p style="margin: 0 0 10px 0;"><strong>What you can do:</strong></p>
        <ul style="margin: 0; padding-left: 20px;">
          <li>Track your annual and quarterly goals</li>
          <li>Monitor key business metrics</li>
          <li>Communicate with your coach</li>
          <li>Complete weekly reviews</li>
          <li>Access your one-page business plan</li>
        </ul>
      </div>

      ${tempPassword ? `
      <div style="background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <p style="margin: 0 0 10px 0;"><strong>Your temporary password:</strong></p>
        <code style="background: #fff; padding: 8px 16px; border-radius: 4px; font-size: 16px; display: inline-block;">${tempPassword}</code>
        <p style="margin: 10px 0 0 0; font-size: 14px; color: #92400e;">Please change this after your first login.</p>
      </div>
      ` : ''}

      <div style="text-align: center; margin: 30px 0;">
        <a href="${loginUrl}" style="display: inline-block; background: #0d9488; color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px;">
          Get Started
        </a>
      </div>

      <p style="color: #6b7280; font-size: 14px;">
        If you have any questions, simply reply to this email or reach out to your coach directly through the platform.
      </p>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

      <p style="color: #9ca3af; font-size: 12px; text-align: center;">
        Wisdom Business Intelligence<br>
        This email was sent to ${to}
      </p>
    </body>
    </html>
  `;

  return sendEmail({
    to,
    subject: `${coachName} invited you to ${businessName} on Wisdom BI`,
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

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <div style="display: inline-block; width: 50px; height: 50px; background: linear-gradient(135deg, #14b8a6, #0d9488); border-radius: 12px; line-height: 50px;">
          <span style="color: white; font-size: 24px; font-weight: bold;">W</span>
        </div>
      </div>

      <h2 style="color: #1f2937; text-align: center;">Reset Your Password</h2>

      <p>Hi ${name},</p>

      <p>We received a request to reset your password. Click the button below to create a new password:</p>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}" style="display: inline-block; background: #0d9488; color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px;">
          Reset Password
        </a>
      </div>

      <p style="color: #6b7280; font-size: 14px;">
        This link will expire in 1 hour. If you didn't request this, you can safely ignore this email.
      </p>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

      <p style="color: #9ca3af; font-size: 12px; text-align: center;">
        Wisdom Business Intelligence
      </p>
    </body>
    </html>
  `;

  return sendEmail({
    to,
    subject: 'Reset your Wisdom BI password',
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

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <div style="display: inline-block; width: 50px; height: 50px; background: linear-gradient(135deg, #14b8a6, #0d9488); border-radius: 12px; line-height: 50px;">
          <span style="color: white; font-size: 24px; font-weight: bold;">W</span>
        </div>
      </div>

      <h2 style="color: #1f2937; text-align: center;">Session Reminder</h2>

      <p>Hi ${clientName},</p>

      <p>This is a reminder about your upcoming coaching session with <strong>${coachName}</strong>.</p>

      <div style="background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
        <p style="margin: 0; font-size: 18px; font-weight: 600; color: #0d9488;">${sessionDate}</p>
        <p style="margin: 5px 0 0 0; font-size: 24px; font-weight: bold; color: #1f2937;">${sessionTime}</p>
      </div>

      ${meetingLink ? `
      <div style="text-align: center; margin: 30px 0;">
        <a href="${meetingLink}" style="display: inline-block; background: #0d9488; color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px;">
          Join Meeting
        </a>
      </div>
      ` : ''}

      <p style="color: #6b7280; font-size: 14px;">
        Before your session, consider reviewing your weekly progress and any action items from your last meeting.
      </p>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

      <p style="color: #9ca3af; font-size: 12px; text-align: center;">
        Wisdom Business Intelligence
      </p>
    </body>
    </html>
  `;

  return sendEmail({
    to,
    subject: `Reminder: Coaching session with ${coachName} on ${sessionDate}`,
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

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <div style="display: inline-block; width: 50px; height: 50px; background: linear-gradient(135deg, #14b8a6, #0d9488); border-radius: 12px; line-height: 50px;">
          <span style="color: white; font-size: 24px; font-weight: bold;">W</span>
        </div>
      </div>

      <p>Hi ${recipientName},</p>

      <p>You have a new message from <strong>${senderName}</strong>:</p>

      <div style="background: #f3f4f6; border-left: 4px solid #0d9488; padding: 15px 20px; margin: 20px 0; border-radius: 0 8px 8px 0;">
        <p style="margin: 0; color: #4b5563; font-style: italic;">"${messagePreview}"</p>
      </div>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${dashboardUrl}" style="display: inline-block; background: #0d9488; color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px;">
          View Message
        </a>
      </div>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

      <p style="color: #9ca3af; font-size: 12px; text-align: center;">
        Wisdom Business Intelligence
      </p>
    </body>
    </html>
  `;

  return sendEmail({
    to,
    subject: `New message from ${senderName}`,
    html,
  });
}

export { getResendClient };
