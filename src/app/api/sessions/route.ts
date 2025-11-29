import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
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
      console.error('Error loading sessions:', sessionsError)
      return NextResponse.json({ error: 'Failed to load sessions' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      sessions: sessions || []
    })

  } catch (error) {
    console.error('Sessions API error:', error)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}

export async function POST(request: Request) {
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
      .single()

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
      .single()

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
      console.error('Error creating session:', sessionError)
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      session
    })

  } catch (error) {
    console.error('Create session API error:', error)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
