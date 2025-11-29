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

    // Get session to verify access and get business_id
    const { data: session } = await supabase
      .from('coaching_sessions')
      .select('business_id, coach_id')
      .eq('id', sessionId)
      .single()

    if (!session || session.coach_id !== user.id) {
      return NextResponse.json({ error: 'Session not found or access denied' }, { status: 404 })
    }

    const body = await request.json()
    const { action_text, assigned_to, due_date } = body

    if (!action_text) {
      return NextResponse.json({ error: 'action_text is required' }, { status: 400 })
    }

    // Create action
    const { data: action, error: actionError } = await supabase
      .from('session_actions')
      .insert({
        session_id: sessionId,
        business_id: session.business_id,
        action_text,
        assigned_to,
        due_date,
        status: 'open'
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
