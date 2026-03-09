import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase/server'

// GET /api/processes — list all processes for the user
export async function GET(request: Request) {
  try {
    const supabase = await createRouteHandlerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const requestedUserId = searchParams.get('user_id')
    const userId = requestedUserId || user.id

    // If requesting another user's processes, verify access
    if (requestedUserId && requestedUserId !== user.id) {
      // Check if the requesting user is a team member or coach of a business owned by the target user
      const { data: accessCheck } = await supabase
        .from('business_users')
        .select('business_id, businesses!inner(owner_id)')
        .eq('user_id', user.id)

      const { data: coachCheck } = await supabase
        .from('businesses')
        .select('id')
        .eq('assigned_coach_id', user.id)
        .eq('owner_id', requestedUserId)

      const hasTeamAccess = accessCheck?.some(
        (bu: any) => (bu.businesses as any)?.owner_id === requestedUserId
      )
      const hasCoachAccess = coachCheck && coachCheck.length > 0

      if (!hasTeamAccess && !hasCoachAccess) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    }

    const { data, error } = await supabase
      .from('process_diagrams')
      .select('id, name, description, status, step_count, swimlane_count, created_at, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('[Processes API] List error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ processes: data || [] })
  } catch (error) {
    console.error('[Processes API] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/processes — create a new process
export async function POST(request: Request) {
  try {
    const supabase = await createRouteHandlerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const { name, description, process_data, user_id } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Process name is required' }, { status: 400 })
    }

    const targetUserId = user_id || user.id

    // If creating for another user, verify access
    if (user_id && user_id !== user.id) {
      const { data: accessCheck } = await supabase
        .from('business_users')
        .select('business_id, businesses!inner(owner_id)')
        .eq('user_id', user.id)

      const { data: coachCheck } = await supabase
        .from('businesses')
        .select('id')
        .eq('assigned_coach_id', user.id)
        .eq('owner_id', user_id)

      const hasTeamAccess = accessCheck?.some(
        (bu: any) => (bu.businesses as any)?.owner_id === user_id
      )
      const hasCoachAccess = coachCheck && coachCheck.length > 0

      if (!hasTeamAccess && !hasCoachAccess) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    }

    const { data, error } = await supabase
      .from('process_diagrams')
      .insert({
        user_id: targetUserId,
        name: name.trim(),
        description: description || null,
        status: 'draft',
        process_data: process_data || { notes: [], swimlanes: [], phases: [], steps: [], flows: [] },
        step_count: 0,
        decision_count: 0,
        swimlane_count: 0,
      })
      .select()
      .single()

    if (error) {
      console.error('[Processes API] Create error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ process: data }, { status: 201 })
  } catch (error) {
    console.error('[Processes API] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
