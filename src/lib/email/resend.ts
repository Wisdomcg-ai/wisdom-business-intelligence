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

  // Fix URL to use /auth/login
  const authLoginUrl = loginUrl.replace('/login', '/auth/login');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 0; background-color: #f9fafb;">
      <div style="background-color: #ffffff; margin: 20px; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">

        <!-- Header -->
        <div style="background: linear-gradient(135deg, #0d9488, #14b8a6); padding: 40px 20px; text-align: center;">
          <div style="display: inline-block; width: 60px; height: 60px; background: rgba(255,255,255,0.2); border-radius: 16px; line-height: 60px; margin-bottom: 16px;">
            <span style="color: white; font-size: 28px; font-weight: bold;">W</span>
          </div>
          <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 600;">Welcome to Wisdom BI</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 16px;">Let's get started</p>
        </div>

        <!-- Content -->
        <div style="padding: 32px 24px;">
          <p style="font-size: 18px; color: #1f2937; margin: 0 0 16px 0;">Hi ${clientName},</p>

          <p style="color: #4b5563; margin: 0 0 24px 0;">
            Great news! <strong>${coachName}</strong> has set up your <strong>${businessName}</strong> dashboard on Wisdom BI.
            You now have a dedicated space to track your goals, monitor progress, and stay aligned with your coach.
          </p>

          <!-- Credentials Box -->
          ${tempPassword ? `
          <div style="background: #f8fafc; border: 2px solid #e2e8f0; border-radius: 12px; padding: 24px; margin: 24px 0;">
            <p style="margin: 0 0 16px 0; font-size: 14px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Your Login Details</p>

            <div style="margin-bottom: 12px;">
              <p style="margin: 0 0 4px 0; font-size: 12px; color: #94a3b8; font-weight: 500;">EMAIL</p>
              <p style="margin: 0; font-size: 16px; color: #1e293b; font-family: monospace; background: #fff; padding: 10px 14px; border-radius: 6px; border: 1px solid #e2e8f0;">${to}</p>
            </div>

            <div>
              <p style="margin: 0 0 4px 0; font-size: 12px; color: #94a3b8; font-weight: 500;">TEMPORARY PASSWORD</p>
              <p style="margin: 0; font-size: 16px; color: #1e293b; font-family: monospace; background: #fff; padding: 10px 14px; border-radius: 6px; border: 1px solid #e2e8f0;">${tempPassword}</p>
            </div>
          </div>
          ` : ''}

          <!-- CTA Button -->
          <div style="text-align: center; margin: 32px 0;">
            <table cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto;">
              <tr>
                <td style="background-color: #0d9488; border-radius: 10px; padding: 16px 48px;">
                  <a href="${authLoginUrl}" style="color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block;">
                    Log In to Your Dashboard
                  </a>
                </td>
              </tr>
            </table>
          </div>

          <!-- Security Note -->
          <p style="text-align: center; color: #64748b; font-size: 13px; margin: 0 0 24px 0;">
            You'll be prompted to set your own password on first login.
          </p>

          <!-- What's Next -->
          <div style="background: #f0fdfa; border-radius: 10px; padding: 20px; margin-top: 24px;">
            <p style="margin: 0 0 12px 0; font-weight: 600; color: #0d9488; font-size: 14px;">What you can do:</p>
            <ul style="margin: 0; padding-left: 20px; color: #4b5563; font-size: 14px;">
              <li style="margin-bottom: 6px;">Set and track your quarterly goals</li>
              <li style="margin-bottom: 6px;">Monitor your key business metrics</li>
              <li style="margin-bottom: 6px;">Communicate directly with your coach</li>
              <li>Review your progress anytime</li>
            </ul>
          </div>
        </div>

        <!-- Footer -->
        <div style="background: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0;">
          <p style="margin: 0 0 8px 0; color: #64748b; font-size: 13px;">
            Questions? Just reply to this email.
          </p>
          <p style="margin: 0; color: #94a3b8; font-size: 12px;">
            Wisdom Business Intelligence
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to,
    subject: `Welcome to Wisdom BI, ${clientName}`,
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
