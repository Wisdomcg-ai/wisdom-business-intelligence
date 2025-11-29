// Supabase Edge Function for checking actions that are due soon
// This function runs on a schedule (daily) to check for actions due in 3 days

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  try {
    // Create Supabase client with service role
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Calculate time window: actions due in 2-4 days
    const now = new Date()
    const dueWindowStart = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000) // 2 days
    const dueWindowEnd = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000) // 4 days

    console.log(`Checking for actions due between ${dueWindowStart.toISOString()} and ${dueWindowEnd.toISOString()}`)

    // Get all open actions due in the window
    const { data: actions, error: actionsError } = await supabase
      .from('session_actions')
      .select(`
        id,
        action_text,
        due_date,
        business_id,
        coaching_sessions!inner (
          businesses!inner (
            owner_id
          )
        )
      `)
      .in('status', ['open', 'in_progress'])
      .not('due_date', 'is', null)
      .gte('due_date', dueWindowStart.toISOString())
      .lte('due_date', dueWindowEnd.toISOString())

    if (actionsError) {
      console.error('Error fetching actions:', actionsError)
      return new Response(JSON.stringify({ error: 'Failed to fetch actions' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    if (!actions || actions.length === 0) {
      return new Response(JSON.stringify({ message: 'No actions due soon', count: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    console.log(`Found ${actions.length} actions due soon`)

    let createdCount = 0

    // Create notifications for each action
    for (const action of actions) {
      const session = (action as any).coaching_sessions
      const business = session?.businesses
      const clientId = business?.owner_id

      if (!clientId || !action.due_date) {
        console.log(`No client or due date found for action ${action.id}, skipping`)
        continue
      }

      // Check if we already created a reminder for this action
      const { data: existingNotification } = await supabase
        .from('notifications')
        .select('id')
        .eq('type', 'action_due')
        .eq('user_id', clientId)
        .contains('metadata', { action_id: action.id })
        .single()

      if (existingNotification) {
        console.log(`Reminder already exists for action ${action.id}, skipping`)
        continue
      }

      // Calculate days until due
      const dueDate = new Date(action.due_date)
      const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

      // Create notification
      const { error: notificationError } = await supabase
        .from('notifications')
        .insert({
          user_id: clientId,
          business_id: action.business_id,
          type: 'action_due',
          title: 'Action Item Due Soon',
          message: `"${action.action_text}" is due in ${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''}.`,
          link: `/client/actions`,
          metadata: {
            action_id: action.id,
            due_date: action.due_date
          }
        })

      if (notificationError) {
        console.error(`Error creating notification for action ${action.id}:`, notificationError)
      } else {
        createdCount++
        console.log(`Created due soon notification for action ${action.id}`)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Created ${createdCount} action due reminders`,
        checked: actions.length,
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
