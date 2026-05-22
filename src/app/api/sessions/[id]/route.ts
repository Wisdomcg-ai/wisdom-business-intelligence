import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createRouteHandlerClient()
  const sessionId = params.id

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get session — actions are linked via session_notes, not coaching_sessions directly
    const { data: session, error: sessionError } = await supabase
      .from('coaching_sessions')
      .select('*')
      .eq('id', sessionId)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Verify user has access (coach or client)
    const { data: business } = await supabase
      .from('businesses')
      .select('assigned_coach_id, owner_id')
      .eq('id', session.business_id)
      .single()

    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }
    if (business.assigned_coach_id !== user.id && business.owner_id !== user.id) {
      // Super-admin bypass — see notes in chat/messages/route.ts.
      const { data: isSuper } = await supabase.rpc('auth_is_super_admin')
      if (!isSuper) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    }

    return NextResponse.json({
      success: true,
      session
    })

  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'sessions/[id]' }, extra: { context: "Get session API error" } } as any)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createRouteHandlerClient()
  const sessionId = params.id

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { title, scheduled_at, duration_minutes, status, notes, agenda, summary } = body

    // Get session to verify access
    const { data: existingSession } = await supabase
      .from('coaching_sessions')
      .select('business_id, coach_id')
      .eq('id', sessionId)
      .single()

    if (!existingSession || existingSession.coach_id !== user.id) {
      return NextResponse.json({ error: 'Session not found or access denied' }, { status: 404 })
    }

    // Build update object
    const updateData: any = { updated_at: new Date().toISOString() }
    if (title !== undefined) updateData.title = title
    if (scheduled_at !== undefined) updateData.scheduled_at = scheduled_at
    if (duration_minutes !== undefined) updateData.duration_minutes = duration_minutes
    if (status !== undefined) updateData.status = status
    if (notes !== undefined) updateData.notes = notes
    if (agenda !== undefined) updateData.agenda = agenda
    if (summary !== undefined) updateData.summary = summary

    // Update session
    const { data: session, error: updateError } = await supabase
      .from('coaching_sessions')
      .update(updateData)
      .eq('id', sessionId)
      .select()
      .single()

    if (updateError) {
      Sentry.captureException(updateError, { tags: { route: 'sessions/[id]' }, extra: { context: "Error updating session" } } as any)
      return NextResponse.json({ error: 'Failed to update session' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      session
    })

  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'sessions/[id]' }, extra: { context: "Update session API error" } } as any)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createRouteHandlerClient()
  const sessionId = params.id

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get session to verify access
    const { data: existingSession } = await supabase
      .from('coaching_sessions')
      .select('coach_id')
      .eq('id', sessionId)
      .single()

    if (!existingSession || existingSession.coach_id !== user.id) {
      return NextResponse.json({ error: 'Session not found or access denied' }, { status: 404 })
    }

    // Delete session (cascade will delete actions)
    const { error: deleteError } = await supabase
      .from('coaching_sessions')
      .delete()
      .eq('id', sessionId)

    if (deleteError) {
      Sentry.captureException(deleteError, { tags: { route: 'sessions/[id]' }, extra: { context: "Error deleting session" } } as any)
      return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Session deleted successfully'
    })

  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'sessions/[id]' }, extra: { context: "Delete session API error" } } as any)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
