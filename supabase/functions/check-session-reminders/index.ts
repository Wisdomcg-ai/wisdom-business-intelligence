// Supabase Edge Function for checking upcoming sessions and creating reminder notifications
// This function runs on a schedule (every hour) to check for sessions happening in 24 hours

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  try {
    // Create Supabase client with service role
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Calculate time window: 23-25 hours from now
    const now = new Date()
    const reminderWindowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000) // 23 hours
    const reminderWindowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000) // 25 hours

    console.log(`Checking for sessions between ${reminderWindowStart.toISOString()} and ${reminderWindowEnd.toISOString()}`)

    // Get all scheduled sessions in the 24-hour window
    const { data: sessions, error: sessionsError } = await supabase
      .from('coaching_sessions')
      .select(`
        id,
        title,
        scheduled_at,
        business_id,
        businesses!inner (
          id,
          business_name,
          owner_id
        )
      `)
      .eq('status', 'scheduled')
      .gte('scheduled_at', reminderWindowStart.toISOString())
      .lte('scheduled_at', reminderWindowEnd.toISOString())

    if (sessionsError) {
      console.error('Error fetching sessions:', sessionsError)
      return new Response(JSON.stringify({ error: 'Failed to fetch sessions' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    if (!sessions || sessions.length === 0) {
      return new Response(JSON.stringify({ message: 'No sessions requiring reminders', count: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    console.log(`Found ${sessions.length} sessions requiring reminders`)

    let createdCount = 0

    // Create notifications for each session
    for (const session of sessions) {
      const business = (session as any).businesses
      const clientId = business?.owner_id

      if (!clientId) {
        console.log(`No client found for session ${session.id}, skipping`)
        continue
      }

      // Check if we already created a reminder for this session
      const { data: existingNotification } = await supabase
        .from('notifications')
        .select('id')
        .eq('type', 'session_reminder')
        .eq('user_id', clientId)
        .contains('metadata', { session_id: session.id })
        .single()

      if (existingNotification) {
        console.log(`Reminder already exists for session ${session.id}, skipping`)
        continue
      }

      // Create notification
      const scheduledDate = new Date(session.scheduled_at)
      const { error: notificationError } = await supabase
        .from('notifications')
        .insert({
          user_id: clientId,
          business_id: session.business_id,
          type: 'session_reminder',
          title: 'Upcoming Coaching Session',
          message: `You have a coaching session "${session.title}" scheduled for ${scheduledDate.toLocaleString('en-AU', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}.`,
          link: `/client/sessions?session=${session.id}`,
          metadata: { session_id: session.id }
        })

      if (notificationError) {
        console.error(`Error creating notification for session ${session.id}:`, notificationError)
      } else {
        createdCount++
        console.log(`Created reminder notification for session ${session.id}`)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Created ${createdCount} session reminders`,
        checked: sessions.length,
        created: createdCount
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
