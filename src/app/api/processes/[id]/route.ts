import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase/server'

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
