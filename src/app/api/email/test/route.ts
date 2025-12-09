import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import {
  sendTestEmail,
  sendClientInvitation,
  sendPasswordReset,
  sendSessionReminder,
  sendMessageNotification
} from '@/lib/email/resend';

export async function POST(request: NextRequest) {
  try {
    // Authentication check - require super_admin role
    const supabase = await createRouteHandlerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is super_admin
    const { data: roleData } = await supabase
      .from('system_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!roleData || roleData.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { to, name, type = 'test', all = false } = body;

    if (!to) {
      return NextResponse.json(
        { error: 'Email address (to) is required' },
        { status: 400 }
      );
    }

    // Send all email types for comprehensive testing
    if (all) {
      const results = [];

      // 1. Branding Test
      const testResult = await sendTestEmail({ to, name });
      results.push({ type: 'test', ...testResult });

      // 2. Client Invitation
      const inviteResult = await sendClientInvitation({
        to,
        clientName: name || 'Test User',
        coachName: 'Sarah Coach',
        businessName: 'Acme Corp',
        loginUrl: 'https://wisdombi.ai/login',
        tempPassword: 'TempPass123!'
      });
      results.push({ type: 'client-invitation', ...inviteResult });

      // 3. Password Reset
      const resetResult = await sendPasswordReset({
        to,
        name: name || 'Test User',
        resetUrl: 'https://wisdombi.ai/reset-password?token=abc123'
      });
      results.push({ type: 'password-reset', ...resetResult });

      // 4. Session Reminder
      const reminderResult = await sendSessionReminder({
        to,
        clientName: name || 'Test User',
        coachName: 'Sarah Coach',
        sessionDate: 'Wednesday, December 11th',
        sessionTime: '2:00 PM AEST',
        meetingLink: 'https://zoom.us/j/123456789'
      });
      results.push({ type: 'session-reminder', ...reminderResult });

      // 5. Message Notification
      const messageResult = await sendMessageNotification({
        to,
        recipientName: name || 'Test User',
        senderName: 'Sarah Coach',
        messagePreview: 'Great progress on your quarterly goals! I wanted to check in about the marketing initiative we discussed...',
        dashboardUrl: 'https://wisdombi.ai/messages'
      });
      results.push({ type: 'message-notification', ...messageResult });

      return NextResponse.json({
        success: true,
        message: `All ${results.length} test emails sent to ${to}`,
        results
      });
    }

    // Handle specific email type
    let result;
    switch (type) {
      case 'password-reset':
        result = await sendPasswordReset({
          to,
          name: name || 'Test User',
          resetUrl: 'https://wisdombi.ai/reset-password?token=abc123'
        });
        break;
      case 'client-invitation':
        result = await sendClientInvitation({
          to,
          clientName: name || 'Test User',
          coachName: 'Sarah Coach',
          businessName: 'Acme Corp',
          loginUrl: 'https://wisdombi.ai/login',
          tempPassword: 'TempPass123!'
        });
        break;
      case 'session-reminder':
        result = await sendSessionReminder({
          to,
          clientName: name || 'Test User',
          coachName: 'Sarah Coach',
          sessionDate: 'Wednesday, December 11th',
          sessionTime: '2:00 PM AEST',
          meetingLink: 'https://zoom.us/j/123456789'
        });
        break;
      case 'message-notification':
        result = await sendMessageNotification({
          to,
          recipientName: name || 'Test User',
          senderName: 'Sarah Coach',
          messagePreview: 'Great progress on your quarterly goals! I wanted to check in about the marketing initiative we discussed...',
          dashboardUrl: 'https://wisdombi.ai/messages'
        });
        break;
      default:
        result = await sendTestEmail({ to, name });
    }

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: `${type} email sent to ${to}`,
        id: result.id
      });
    } else {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('[API] Error sending test email:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to send test email' },
      { status: 500 }
    );
  }
}
