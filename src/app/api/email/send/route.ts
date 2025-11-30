import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  sendEmail,
  sendClientInvitation,
  sendPasswordReset,
  sendSessionReminder,
  sendMessageNotification
} from '@/lib/email/resend';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
