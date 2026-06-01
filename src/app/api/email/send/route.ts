import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { checkRateLimit, createRateLimitKey, RATE_LIMIT_CONFIGS } from '@/lib/utils/rate-limiter';
import * as Sentry from '@sentry/nextjs'
import {
  sendEmail,
  sendClientInvitation,
  sendPasswordReset,
  sendSessionReminder,
  sendMessageNotification
} from '@/lib/email/resend';
import { csrfProtection } from '@/lib/security/csrf';
import { z } from 'zod';
import { withSchema } from '@/lib/api/with-schema';

// POST body: { type, ...params } — `type` selects the email template; the per-type
// params (to/subject/html/from/replyTo/clientName/...) are forwarded to the resend
// helpers, so the named fields are modeled and the rest passthrough.
const PostBodySchema = z
  .object({
    type: z.string(),
    to: z.string().optional(),
    subject: z.string().optional(),
    html: z.string().optional(),
    from: z.string().optional(),
    replyTo: z.string().optional(),
  })
  .passthrough();

async function postHandler(request: NextRequest) {
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

    // R32 (SEC-N5): this generic sender accepts an arbitrary `to` for every
    // email type, so an unrestricted gate let ANY authenticated user blast
    // WisdomBI-branded invitations / password-resets / reminders to ANY address
    // — a turnkey phishing primitive. The endpoint has no in-app callers (every
    // legitimate flow calls the resend helpers directly from its own
    // ownership-gated route), so the whole route is locked to super_admin. This
    // also subsumes the per-type 'custom' admin check below.
    // R31 (SEC-N4): gate on the canonical `system_roles` source of truth.
    const { data: roleData } = await supabase
      .from('system_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (roleData?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Rate limit: 10 emails per hour per user
    const rateLimit = await checkRateLimit(
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
        // Admin privilege is already enforced at the top of the handler
        // (R32 locked the entire route to super_admin), so no per-type check
        // is needed here.
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
    Sentry.captureException(error, { tags: { route: 'email/send' }, extra: { context: "[API] Email send error" } } as any);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const POST = withSchema(
  'email/send',
  PostBodySchema,
  postHandler as unknown as (request: Request) => Promise<Response>
);
