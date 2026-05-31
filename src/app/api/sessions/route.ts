import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import { withSchema, withQuerySchema } from '@/lib/api/with-schema'

export const dynamic = 'force-dynamic'

// VALID-05a (observe mode): GET filters sessions by business; POST creates a session.
const SessionsGetQuerySchema = z.object({
  business_id: z.string().optional(),
})

const SessionsPostSchema = z.object({
  business_id: z.string(),
  title: z.string(),
  scheduled_at: z.string(),
  duration_minutes: z.number().optional(),
  agenda: z.array(z.any()).optional(),
})

async function getHandler(request: Request) {
  const supabase = await createRouteHandlerClient()
  const { searchParams } = new URL(request.url)
  const businessId = searchParams.get('business_id')

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let query = supabase
      .from('coaching_sessions')
      .select('*')
      .order('scheduled_at', { ascending: false })

    // Filter by business if specified
    if (businessId) {
      query = query.eq('business_id', businessId)
    } else {
      // Coach sees all their clients' sessions
      const { data: businesses } = await supabase
        .from('businesses')
        .select('id')
        .eq('assigned_coach_id', user.id)

      const businessIds = businesses?.map(b => b.id) || []
      if (businessIds.length > 0) {
        query = query.in('business_id', businessIds)
      } else {
        // No clients, return empty
        return NextResponse.json({ success: true, sessions: [] })
      }
    }

    const { data: sessions, error: sessionsError } = await query

    if (sessionsError) {
      Sentry.captureException(sessionsError, { tags: { route: 'sessions' }, extra: { context: "Error loading sessions" } } as any)
      return NextResponse.json({ error: 'Failed to load sessions' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      sessions: sessions || []
    })

  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'sessions' }, extra: { context: "Sessions API error" } } as any)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}

async function postHandler(request: Request) {
  const supabase = await createRouteHandlerClient()

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is coach or super admin
    const { data: roleData } = await supabase
      .from('system_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!roleData || (roleData.role !== 'coach' && roleData.role !== 'super_admin')) {
      return NextResponse.json({ error: 'Access denied. Coach privileges required.' }, { status: 403 })
    }

    const body = await request.json()
    const { business_id, title, scheduled_at, duration_minutes, agenda } = body

    // Validate required fields
    if (!business_id || !title || !scheduled_at) {
      return NextResponse.json(
        { error: 'Missing required fields: business_id, title, scheduled_at' },
        { status: 400 }
      )
    }

    // Verify coach has access to this business
    const { data: business } = await supabase
      .from('businesses')
      .select('id')
      .eq('id', business_id)
      .eq('assigned_coach_id', user.id)
      .maybeSingle()

    if (!business) {
      return NextResponse.json({ error: 'Business not found or access denied' }, { status: 404 })
    }

    // Create session
    const { data: session, error: sessionError } = await supabase
      .from('coaching_sessions')
      .insert({
        business_id,
        coach_id: user.id,
        title,
        scheduled_at,
        duration_minutes: duration_minutes || 60,
        agenda: agenda || [],
        status: 'scheduled'
      })
      .select()
      .single()

    if (sessionError) {
      Sentry.captureException(sessionError, { tags: { route: 'sessions' }, extra: { context: "Error creating session" } } as any)
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      session
    })

  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'sessions' }, extra: { context: "Create session API error" } } as any)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}

export const GET = withQuerySchema('sessions', SessionsGetQuerySchema, getHandler)
export const POST = withSchema('sessions', SessionsPostSchema, postHandler)
