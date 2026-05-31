import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import { withQuerySchema, withSchema } from '@/lib/api/with-schema'

export const dynamic = 'force-dynamic'

// GET searchParams: ?unread_only=true&limit=50 (both optional, string-typed query).
const GetQuerySchema = z
  .object({
    unread_only: z.string().optional(),
    limit: z.string().optional(),
  })
  .passthrough()

// PUT body: { notification_id?, mark_all_read? } — one of the two drives the update.
const PutBodySchema = z
  .object({
    notification_id: z.string().optional(),
    mark_all_read: z.boolean().optional(),
  })
  .passthrough()

// GET /api/notifications - List user's notifications
async function getHandler(request: Request) {
  const supabase = await createRouteHandlerClient()

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const unreadOnly = searchParams.get('unread_only') === 'true'
    const limit = parseInt(searchParams.get('limit') || '50')

    let query = supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (unreadOnly) {
      query = query.eq('read', false)
    }

    const { data: notifications, error } = await query

    if (error) {
      Sentry.captureException(error, { tags: { route: 'notifications' }, extra: { context: "Error fetching notifications" } } as any)
      return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 })
    }

    return NextResponse.json({ success: true, notifications })

  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'notifications' }, extra: { context: "Notifications API error" } } as any)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}

export const GET = withQuerySchema('notifications', GetQuerySchema, getHandler)

// PUT /api/notifications - Mark notification(s) as read
async function putHandler(request: Request) {
  const supabase = await createRouteHandlerClient()

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { notification_id, mark_all_read } = body

    if (mark_all_read) {
      // Mark all notifications as read
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', user.id)
        .eq('read', false)

      if (error) {
        Sentry.captureException(error, { tags: { route: 'notifications' }, extra: { context: "Error marking all notifications as read" } } as any)
        return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 })
      }

      return NextResponse.json({ success: true, message: 'All notifications marked as read' })
    } else if (notification_id) {
      // Mark specific notification as read
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notification_id)
        .eq('user_id', user.id) // Ensure user owns this notification

      if (error) {
        Sentry.captureException(error, { tags: { route: 'notifications' }, extra: { context: "Error marking notification as read" } } as any)
        return NextResponse.json({ error: 'Failed to update notification' }, { status: 500 })
      }

      return NextResponse.json({ success: true, message: 'Notification marked as read' })
    } else {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'notifications' }, extra: { context: "Notifications API error" } } as any)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}

export const PUT = withSchema('notifications', PutBodySchema, putHandler)
