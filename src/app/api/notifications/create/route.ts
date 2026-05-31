import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import { withSchema } from '@/lib/api/with-schema'

// POST body: notification fields. target_user_id/type/title/message required; rest optional.
const PostBodySchema = z
  .object({
    target_user_id: z.string(),
    business_id: z.string().nullish(),
    type: z.string(),
    title: z.string(),
    message: z.string(),
    link: z.string().nullish(),
    metadata: z.unknown().optional(),
  })
  .passthrough()

// POST /api/notifications/create - Create a notification (internal use)
async function postHandler(request: Request) {
  const supabase = await createRouteHandlerClient()

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      target_user_id,
      business_id,
      type,
      title,
      message,
      link,
      metadata
    } = body

    // Validate required fields
    if (!target_user_id || !type || !title || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Verify requester can notify target user (must be coach, admin, or same business)
    if (target_user_id !== user.id) {
      const { data: coachAccess } = await supabase
        .from('businesses')
        .select('id')
        .eq('assigned_coach_id', user.id)
        .eq('owner_id', target_user_id)
        .limit(1)
        .maybeSingle()

      const { data: teamAccess } = await supabase
        .from('business_users')
        .select('business_id')
        .eq('user_id', user.id)
        .limit(1)

      const { data: targetTeam } = await supabase
        .from('business_users')
        .select('business_id')
        .eq('user_id', target_user_id)
        .limit(1)

      const sharedBusiness = teamAccess?.some(t =>
        targetTeam?.some(tt => tt.business_id === t.business_id)
      )

      if (!coachAccess && !sharedBusiness) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    }

    // Insert notification
    const { data: notification, error } = await supabase
      .from('notifications')
      .insert({
        user_id: target_user_id,
        business_id,
        type,
        title,
        message,
        link,
        metadata
      })
      .select()
      .single()

    if (error) {
      Sentry.captureException(error, { tags: { route: 'notifications/create' }, extra: { context: "Error creating notification" } } as any)
      return NextResponse.json({ error: 'Failed to create notification' }, { status: 500 })
    }

    return NextResponse.json({ success: true, notification })

  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'notifications/create' }, extra: { context: "Create notification API error" } } as any)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}

export const POST = withSchema('notifications/create', PostBodySchema, postHandler)
