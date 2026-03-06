import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase/server'

// Helper: verify the authenticated user has access to a process
async function verifyProcessAccess(
  supabase: Awaited<ReturnType<typeof createRouteHandlerClient>>,
  processId: string,
  userId: string
) {
  // Fetch the process to check ownership
  const { data: process, error } = await supabase
    .from('process_diagrams')
    .select('id, user_id')
    .eq('id', processId)
    .single()

  if (error || !process) {
    return { allowed: false, status: 404, message: 'Process not found' }
  }

  // Owner always has access
  if (process.user_id === userId) {
    return { allowed: true }
  }

  // Check if requesting user is a team member of a business owned by the process creator
  const { data: accessCheck } = await supabase
    .from('business_users')
    .select('business_id, businesses!inner(owner_id)')
    .eq('user_id', userId)

  const hasTeamAccess = accessCheck?.some(
    (bu: any) => (bu.businesses as any)?.owner_id === process.user_id
  )

  if (hasTeamAccess) {
    return { allowed: true }
  }

  // Check if requesting user is a coach assigned to a business owned by the process creator
  const { data: coachCheck } = await supabase
    .from('businesses')
    .select('id')
    .eq('assigned_coach_id', userId)
    .eq('owner_id', process.user_id)

  if (coachCheck && coachCheck.length > 0) {
    return { allowed: true }
  }

  return { allowed: false, status: 403, message: 'Access denied' }
}

// GET /api/processes/[id] — get a single process
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createRouteHandlerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { id } = params

    // Verify access before returning data
    const access = await verifyProcessAccess(supabase, id, user.id)
    if (!access.allowed) {
      return NextResponse.json({ error: access.message }, { status: access.status })
    }

    const { data, error } = await supabase
      .from('process_diagrams')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('[Processes API] Get error:', error)
      return NextResponse.json({ error: error.message }, { status: 404 })
    }

    return NextResponse.json({ process: data })
  } catch (error) {
    console.error('[Processes API] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/processes/[id] — update a process
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createRouteHandlerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { id } = params

    // Verify access before allowing update
    const access = await verifyProcessAccess(supabase, id, user.id)
    if (!access.allowed) {
      return NextResponse.json({ error: access.message }, { status: access.status })
    }

    const body = await request.json()

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (body.name !== undefined) updates.name = body.name
    if (body.description !== undefined) updates.description = body.description
    if (body.status !== undefined) updates.status = body.status
    if (body.process_data !== undefined) updates.process_data = body.process_data
    if (body.step_count !== undefined) updates.step_count = body.step_count
    if (body.decision_count !== undefined) updates.decision_count = body.decision_count
    if (body.swimlane_count !== undefined) updates.swimlane_count = body.swimlane_count

    const { data, error } = await supabase
      .from('process_diagrams')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('[Processes API] Update error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ process: data })
  } catch (error) {
    console.error('[Processes API] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/processes/[id] — delete a process
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createRouteHandlerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { id } = params

    // Verify access before allowing delete
    const access = await verifyProcessAccess(supabase, id, user.id)
    if (!access.allowed) {
      return NextResponse.json({ error: access.message }, { status: access.status })
    }

    const { error } = await supabase
      .from('process_diagrams')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('[Processes API] Delete error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Processes API] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
