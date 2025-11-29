// Supabase Edge Function for sending email notifications
// This function runs on a schedule (every 15 minutes) to check for unsent notifications

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface Notification {
  id: string
  user_id: string
  type: string
  title: string
  message: string
  link?: string
  created_at: string
}

interface User {
  id: string
  email: string
}

serve(async (req) => {
  try {
    // Create Supabase client with service role
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Get all unsent notifications
    const { data: notifications, error: notificationsError } = await supabase
      .from('notifications')
      .select(`
        id,
        user_id,
        type,
        title,
        message,
        link,
        created_at
      `)
      .eq('sent_email', false)
      .order('created_at', { ascending: true })
      .limit(100) // Process 100 at a time

    if (notificationsError) {
      console.error('Error fetching notifications:', notificationsError)
      return new Response(JSON.stringify({ error: 'Failed to fetch notifications' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    if (!notifications || notifications.length === 0) {
      return new Response(JSON.stringify({ message: 'No notifications to send', count: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    console.log(`Found ${notifications.length} notifications to send`)

    // Group notifications by user to batch emails
    const notificationsByUser = new Map<string, Notification[]>()
    for (const notification of notifications) {
      const userNotifs = notificationsByUser.get(notification.user_id) || []
      userNotifs.push(notification)
      notificationsByUser.set(notification.user_id, userNotifs)
    }

    // Get user emails
    const userIds = Array.from(notificationsByUser.keys())
    const { data: authUsers, error: usersError } = await supabase.auth.admin.listUsers()

    if (usersError) {
      console.error('Error fetching users:', usersError)
      return new Response(JSON.stringify({ error: 'Failed to fetch users' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const userEmailMap = new Map<string, string>()
    authUsers.users.forEach(user => {
      if (user.email && userIds.includes(user.id)) {
        userEmailMap.set(user.id, user.email)
      }
    })

    // Check notification preferences
    const { data: preferences, error: prefsError } = await supabase
      .from('notification_preferences')
      .select('*')
      .in('user_id', userIds)

    const prefsMap = new Map()
    preferences?.forEach(pref => {
      prefsMap.set(pref.user_id, pref)
    })

    let sentCount = 0
    const sentNotificationIds: string[] = []

    // Send emails
    for (const [userId, userNotifications] of notificationsByUser.entries()) {
      const userEmail = userEmailMap.get(userId)
      if (!userEmail) {
        console.log(`No email found for user ${userId}, skipping`)
        continue
      }

      const userPrefs = prefsMap.get(userId)

      // Filter notifications based on preferences
      const notificationsToSend = userNotifications.filter(notif => {
        if (!userPrefs) return true // Send if no preferences set

        switch (notif.type) {
          case 'session_reminder':
            return userPrefs.email_session_reminders !== false
          case 'chat_message':
            return userPrefs.email_chat_messages !== false
          case 'action_due':
            return userPrefs.email_action_due !== false
          case 'document_shared':
            return userPrefs.email_document_shared !== false
          default:
            return true
        }
      })

      if (notificationsToSend.length === 0) {
        console.log(`User ${userId} has disabled notifications, skipping`)
        continue
      }

      // Send email via Resend
      for (const notification of notificationsToSend) {
        try {
          const emailHtml = generateEmailHtml(notification)

          const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${RESEND_API_KEY}`
            },
            body: JSON.stringify({
              from: 'Business Coaching Platform <notifications@yourdomain.com>',
              to: [userEmail],
              subject: notification.title,
              html: emailHtml
            })
          })

          if (response.ok) {
            sentCount++
            sentNotificationIds.push(notification.id)
            console.log(`Sent email for notification ${notification.id} to ${userEmail}`)
          } else {
            const errorText = await response.text()
            console.error(`Failed to send email for notification ${notification.id}:`, errorText)
          }
        } catch (emailError) {
          console.error(`Error sending email for notification ${notification.id}:`, emailError)
        }
      }
    }

    // Mark notifications as sent
    if (sentNotificationIds.length > 0) {
      const { error: updateError } = await supabase
        .from('notifications')
        .update({
          sent_email: true,
          email_sent_at: new Date().toISOString()
        })
        .in('id', sentNotificationIds)

      if (updateError) {
        console.error('Error updating notification status:', updateError)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Sent ${sentCount} emails`,
        processed: notifications.length,
        sent: sentCount
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Edge function error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})

function generateEmailHtml(notification: Notification): string {
  const { title, message, link, type } = notification

  const linkButton = link
    ? `<a href="${link}" style="display: inline-block; padding: 12px 24px; background-color: #2563EB; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px;">View Details</a>`
    : ''

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 0;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <!-- Header -->
                <tr>
                  <td style="background-color: #2563EB; padding: 30px; border-radius: 8px 8px 0 0;">
                    <h1 style="margin: 0; color: white; font-size: 24px; font-weight: 600;">Business Coaching Platform</h1>
                  </td>
                </tr>

                <!-- Body -->
                <tr>
                  <td style="padding: 40px 30px;">
                    <h2 style="margin: 0 0 20px 0; color: #111827; font-size: 20px; font-weight: 600;">${title}</h2>
                    <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px; line-height: 1.6;">${message}</p>
                    ${linkButton}
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="padding: 30px; background-color: #f9fafb; border-radius: 0 0 8px 8px; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0; color: #6b7280; font-size: 14px; text-align: center;">
                      You received this email because you have an account with Business Coaching Platform.
                    </p>
                    <p style="margin: 10px 0 0 0; color: #6b7280; font-size: 12px; text-align: center;">
                      <a href="https://yourdomain.com/settings/notifications" style="color: #2563EB; text-decoration: none;">Manage notification preferences</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `
}
