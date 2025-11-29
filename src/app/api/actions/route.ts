import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { notifyCoachActionCompleted } from '@/lib/notifications'

export async function GET(request: Request) {
  const supabase = await createRouteHandlerClient()
  const { searchParams } = new URL(request.url)
  const businessId = searchParams.get('business_id')
  const status = searchParams.get('status')

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let query = supabase
      .from('session_actions')
      .select(`
        *,
        coaching_sessions!inner (
          id,
          title,
          scheduled_at
        )
      `)
      .order('created_at', { ascending: false })

    // Filter by business if specified
    if (businessId) {
      query = query.eq('business_id', businessId)
    } else {
      // Get user's business (for clients)
      const { data: businessData } = await supabase
        .from('businesses')
        .select('id')
        .eq('owner_id', user.id)
        .single()

      if (businessData) {
        query = query.eq('business_id', businessData.id)
      } else {
        // Coach - get all actions for their clients
        const { data: businesses } = await supabase
          .from('businesses')
          .select('id')
          .eq('assigned_coach_id', user.id)

        const businessIds = businesses?.map(b => b.id) || []
        if (businessIds.length > 0) {
          query = query.in('business_id', businessIds)
        } else {
          return NextResponse.json({ success: true, actions: [] })
        }
      }
    }

    // Filter by status if specified
    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    const { data: actions, error: actionsError } = await query

    if (actionsError) {
      console.error('Error loading actions:', actionsError)
      return NextResponse.json({ error: 'Failed to load actions' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      actions: actions || []
    })

  } catch (error) {
    console.error('Actions API error:', error)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  const supabase = await createRouteHandlerClient()

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action_id, status } = body

    if (!action_id || !status) {
      return NextResponse.json({ error: 'action_id and status required' }, { status: 400 })
    }

    // Update action status
    const { data: action, error: updateError } = await supabase
      .from('session_actions')
      .update({ status })
      .eq('id', action_id)
      .select('*, coaching_sessions!inner(business_id, businesses!inner(business_name, assigned_coach_id))')
      .single()

    if (updateError) {
      console.error('Error updating action:', updateError)
      return NextResponse.json({ error: 'Failed to update action' }, { status: 500 })
    }

    // If action was just completed, notify the coach
    if (status === 'completed' && action) {
      const session = (action as any).coaching_sessions
      const business = session?.businesses
      const coachId = business?.assigned_coach_id
      const businessName = business?.business_name

      if (coachId && businessName) {
        // Get client name
        const { data: clientData } = await supabase
          .from('businesses')
          .select('owner_id')
          .eq('id', session.business_id)
          .single()

        if (clientData) {
          const { data: userData } = await supabase.auth.admin.getUserById(clientData.owner_id)
          const clientName = userData.user?.user_metadata?.full_name || userData.user?.email || 'Client'

          // Send notification to coach
          await notifyCoachActionCompleted(
            coachId,
            session.business_id,
            action.action_text,
            clientName
          )
        }
      }
    }

    return NextResponse.json({
      success: true,
      action
    })

  } catch (error) {
    console.error('Update action API error:', error)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
