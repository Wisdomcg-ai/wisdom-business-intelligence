import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(
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

    // Get session_note to verify access and get business_id
    // This route is called with a session_notes ID (not coaching_sessions ID)
    const { data: session } = await supabase
      .from('session_notes')
      .select('business_id, coach_id')
      .eq('id', sessionId)
      .single()

    if (!session || session.coach_id !== user.id) {
      return NextResponse.json({ error: 'Session not found or access denied' }, { status: 404 })
    }

    const body = await request.json()
    const { description, due_date } = body

    if (!description) {
      return NextResponse.json({ error: 'description is required' }, { status: 400 })
    }

    // Compute next action_number for this session
    const { count: existingCount } = await supabase
      .from('session_actions')
      .select('id', { count: 'exact', head: true })
      .eq('session_note_id', sessionId)

    const actionNumber = (existingCount ?? 0) + 1

    // Create action with correct column names
    const { data: action, error: actionError } = await supabase
      .from('session_actions')
      .insert({
        session_note_id: sessionId,
        business_id: session.business_id,
        action_number: actionNumber,
        description,
        due_date: due_date || null,
        status: 'pending',
        created_by: user.id
      })
      .select()
      .single()

    if (actionError) {
      console.error('Error creating action:', actionError)
      return NextResponse.json({ error: 'Failed to create action' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      action
    })

  } catch (error) {
    console.error('Create action API error:', error)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
