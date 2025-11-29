import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createRouteHandlerClient()
  const clientId = params.id

  try {
    // Check if user is authenticated
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
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Get business details (RLS will ensure coach can only access assigned clients)
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('*')
      .eq('id', clientId)
      .eq('assigned_coach_id', user.id)
      .single()

    if (businessError || !business) {
      return NextResponse.json({ error: 'Client not found or access denied' }, { status: 404 })
    }

    // Get session count and last session date
    const { data: sessions } = await supabase
      .from('coaching_sessions')
      .select('id, scheduled_at, status')
      .eq('business_id', clientId)
      .order('scheduled_at', { ascending: false })

    const sessionCount = sessions?.length || 0
    const lastSession = sessions?.[0]
    const upcomingSessions = sessions?.filter(s => s.status === 'scheduled' && new Date(s.scheduled_at) > new Date()) || []

    // Get action items count
    const { data: actions } = await supabase
      .from('session_actions')
      .select('id, status')
      .eq('business_id', clientId)

    const totalActions = actions?.length || 0
    const completedActions = actions?.filter(a => a.status === 'completed').length || 0
    const pendingActions = actions?.filter(a => a.status !== 'completed').length || 0

    // Get unread messages count
    const { data: messages } = await supabase
      .from('chat_messages')
      .select('id')
      .eq('business_id', clientId)
      .neq('sender_id', user.id)
      // TODO: Add read/unread tracking

    const unreadMessages = 0 // Placeholder until we add read tracking

    return NextResponse.json({
      success: true,
      client: {
        ...business,
        metrics: {
          sessionCount,
          lastSessionDate: lastSession?.scheduled_at || null,
          upcomingSessionsCount: upcomingSessions.length,
          totalActions,
          completedActions,
          pendingActions,
          unreadMessages
        }
      }
    })

  } catch (error) {
    console.error('Coach client detail API error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createRouteHandlerClient()
  const clientId = params.id

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
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const body = await request.json()
    const { status, program_type, session_frequency, enabled_modules } = body

    // Update business (RLS will ensure coach can only update assigned clients)
    const updateData: any = {}
    if (status) updateData.status = status
    if (program_type) updateData.program_type = program_type
    if (session_frequency) updateData.session_frequency = session_frequency
    if (enabled_modules) updateData.enabled_modules = enabled_modules

    const { data: updated, error: updateError } = await supabase
      .from('businesses')
      .update(updateData)
      .eq('id', clientId)
      .eq('assigned_coach_id', user.id)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating client:', updateError)
      return NextResponse.json({ error: 'Failed to update client' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      client: updated
    })

  } catch (error) {
    console.error('Coach client update API error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
