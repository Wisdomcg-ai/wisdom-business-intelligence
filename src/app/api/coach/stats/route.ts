import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
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
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Get all businesses assigned to this coach
    const { data: businesses } = await supabase
      .from('businesses')
      .select('id, status')
      .eq('assigned_coach_id', user.id)

    const businessIds = businesses?.map(b => b.id) || []
    const totalClients = businesses?.length || 0
    const activeClients = businesses?.filter(b => b.status === 'active').length || 0
    const pendingClients = businesses?.filter(b => b.status === 'pending').length || 0

    // Get sessions stats
    let totalSessions = 0
    let upcomingSessions = 0
    let thisMonthSessions = 0

    if (businessIds.length > 0) {
      const { data: allSessions } = await supabase
        .from('coaching_sessions')
        .select('id, scheduled_at, status')
        .in('business_id', businessIds)

      totalSessions = allSessions?.length || 0
      upcomingSessions = allSessions?.filter(s =>
        s.status === 'scheduled' && new Date(s.scheduled_at) > new Date()
      ).length || 0

      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      thisMonthSessions = allSessions?.filter(s =>
        new Date(s.scheduled_at) >= startOfMonth
      ).length || 0
    }

    // Get actions stats
    let totalActions = 0
    let pendingActions = 0
    let completedActions = 0

    if (businessIds.length > 0) {
      const { data: allActions } = await supabase
        .from('session_actions')
        .select('id, status')
        .in('business_id', businessIds)

      totalActions = allActions?.length || 0
      pendingActions = allActions?.filter(a => a.status === 'open' || a.status === 'in_progress').length || 0
      completedActions = allActions?.filter(a => a.status === 'completed').length || 0
    }

    // Get recent activity (last 10 events)
    const recentActivity: Array<{
      type: string
      title: string
      business_name: string
      date: string
      status: string
    }> = []

    if (businessIds.length > 0) {
      // Recent sessions
      const { data: recentSessions } = await supabase
        .from('coaching_sessions')
        .select(`
          id,
          title,
          scheduled_at,
          status,
          businesses!inner(id, business_name)
        `)
        .in('business_id', businessIds)
        .order('scheduled_at', { ascending: false })
        .limit(5)

      if (recentSessions) {
        recentSessions.forEach(session => {
          recentActivity.push({
            type: 'session',
            title: session.title,
            business_name: (session as any).businesses.business_name,
            date: session.scheduled_at,
            status: session.status
          })
        })
      }

      // Recent actions completed
      const { data: recentActions } = await supabase
        .from('session_actions')
        .select(`
          id,
          action_text,
          status,
          created_at,
          coaching_sessions!inner(businesses!inner(business_name))
        `)
        .in('business_id', businessIds)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(5)

      if (recentActions) {
        recentActions.forEach(action => {
          const session = (action as any).coaching_sessions
          const business = session?.businesses
          recentActivity.push({
            type: 'action_completed',
            title: action.action_text,
            business_name: business?.business_name || 'Unknown',
            date: action.created_at,
            status: 'completed'
          })
        })
      }
    }

    // Sort by date and take top 10
    recentActivity.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    const topActivity = recentActivity.slice(0, 10)

    return NextResponse.json({
      success: true,
      stats: {
        clients: {
          total: totalClients,
          active: activeClients,
          pending: pendingClients
        },
        sessions: {
          total: totalSessions,
          upcoming: upcomingSessions,
          thisMonth: thisMonthSessions
        },
        actions: {
          total: totalActions,
          pending: pendingActions,
          completed: completedActions,
          completionRate: totalActions > 0 ? Math.round((completedActions / totalActions) * 100) : 0
        },
        recentActivity: topActivity
      }
    })

  } catch (error) {
    console.error('Coach stats API error:', error)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
