import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { checkRateLimit, createRateLimitKey, RATE_LIMIT_CONFIGS } from '@/lib/utils/rate-limiter';
import {
  sendEmail,
  sendClientInvitation,
  sendPasswordReset,
  sendSessionReminder,
  sendMessageNotification
} from '@/lib/email/resend';
import { csrfProtection } from '@/lib/security/csrf';

export async function POST(request: NextRequest) {
  try {
    // CSRF protection
    const csrf = await csrfProtection(request);
    if (!csrf.valid) {
      return NextResponse.json({ error: csrf.error }, { status: 403 });
    }

    const supabase = await createRouteHandlerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit: 10 emails per hour per user
    const rateLimit = checkRateLimit(
      createRateLimitKey('email-send', user.id),
      RATE_LIMIT_CONFIGS.email
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rateLimit.resetIn / 1000)) } }
      );
    }

    const body = await request.json();
    const { type, ...params } = body;

    let result;

    switch (type) {
      case 'client-invitation':
        result = await sendClientInvitation({
          to: params.to,
          clientName: params.clientName,
          coachName: params.coachName,
          businessName: params.businessName,
          loginUrl: params.loginUrl,
          tempPassword: params.tempPassword
        });
        break;

      case 'password-reset':
        result = await sendPasswordReset({
          to: params.to,
          name: params.name,
          resetUrl: params.resetUrl
        });
        break;

      case 'session-reminder':
        result = await sendSessionReminder({
          to: params.to,
          clientName: params.clientName,
          coachName: params.coachName,
          sessionDate: params.sessionDate,
          sessionTime: params.sessionTime,
          meetingLink: params.meetingLink
        });
        break;

      case 'message-notification':
        result = await sendMessageNotification({
          to: params.to,
          recipientName: params.recipientName,
          senderName: params.senderName,
          messagePreview: params.messagePreview,
          dashboardUrl: params.dashboardUrl
        });
        break;

      case 'custom':
        // Custom emails require admin privileges to prevent abuse
        const { data: adminCheck } = await supabase
          .from('users')
          .select('system_role')
          .eq('id', user.id)
          .single();

        if (adminCheck?.system_role !== 'super_admin') {
          return NextResponse.json(
            { error: 'Custom emails require admin privileges' },
            { status: 403 }
          );
        }

        result = await sendEmail({
          to: params.to,
          subject: params.subject,
          html: params.html,
          from: params.from,
          replyTo: params.replyTo
        });
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid email type' },
          { status: 400 }
        );
    }

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to send email' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, id: result.id });
  } catch (error) {
    console.error('[API] Email send error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
