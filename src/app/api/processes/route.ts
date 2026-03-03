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
    const userId = searchParams.get('user_id') || user.id

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

    const { data, error } = await supabase
      .from('process_diagrams')
      .insert({
        user_id: targetUserId,
        name: name.trim(),
        description: description || null,
        status: 'draft',
        process_data: process_data || { notes: [], swimlanes: [], steps: [], flows: [] },
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
