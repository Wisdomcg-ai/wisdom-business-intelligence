import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
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
      .select('id, business_name, status, created_at')
      .eq('assigned_coach_id', user.id)

    const businessIds = businesses?.map(b => b.id) || []

    if (businessIds.length === 0) {
      return NextResponse.json({
        success: true,
        analytics: {
          overview: {
            totalClients: 0,
            activeClients: 0,
            totalSessions: 0,
            avgResponseTime: null,
            clientSatisfaction: null
          },
          charts: {
            sessionsOverTime: [],
            clientEngagement: [],
            actionCompletion: []
          }
        }
      })
    }

    const twelveMonthsAgo = new Date()
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)

    // Get all sessions for this coach's clients
    const { data: sessions } = await supabase
      .from('coaching_sessions')
      .select('id, business_id, scheduled_at, status, created_at')
      .in('business_id', businessIds)
      .gte('scheduled_at', twelveMonthsAgo.toISOString())
      .order('scheduled_at', { ascending: true })

    // Get all actions for this coach's clients
    const { data: actions } = await supabase
      .from('session_actions')
      .select('id, business_id, status, created_at, completed_at')
      .in('business_id', businessIds)
      .gte('created_at', twelveMonthsAgo.toISOString())

    // Process data
    const sessionsOverTime = processSessionsOverTime(sessions || [])
    const clientEngagement = processClientEngagement(businesses || [], sessions || [], actions || [])
    const actionCompletion = processActionCompletionOverTime(actions || [])

    // Calculate overview metrics
    const totalClients = businesses?.length || 0
    const activeClients = businesses?.filter(b => b.status === 'active').length || 0
    const totalSessions = sessions?.length || 0
    const avgResponseTime = calculateAverageResponseTime(sessions || [])
    const completedActions = actions?.filter(a => a.status === 'completed').length || 0
    const totalActions = actions?.length || 0
    const overallCompletionRate = totalActions > 0 ? Math.round((completedActions / totalActions) * 100) : 0

    return NextResponse.json({
      success: true,
      analytics: {
        overview: {
          totalClients,
          activeClients,
          totalSessions,
          totalActions,
          completedActions,
          overallCompletionRate,
          avgResponseTime
        },
        charts: {
          sessionsOverTime,
          clientEngagement,
          actionCompletion
        }
      }
    })

  } catch (error) {
    console.error('Coach analytics API error:', error)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}

// Helper functions

function processSessionsOverTime(sessions: any[]) {
  const monthlyData: { [key: string]: number } = {}

  sessions.forEach(session => {
    const date = new Date(session.scheduled_at)
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    monthlyData[monthKey] = (monthlyData[monthKey] || 0) + 1
  })

  return Object.entries(monthlyData).map(([month, count]) => ({
    month,
    sessions: count
  })).sort((a, b) => a.month.localeCompare(b.month))
}

function processClientEngagement(businesses: any[], sessions: any[], actions: any[]) {
  return businesses.map(business => {
    const clientSessions = sessions.filter(s => s.business_id === business.id)
    const clientActions = actions.filter(a => a.business_id === business.id)
    const completedActions = clientActions.filter(a => a.status === 'completed').length

    const engagementScore = calculateEngagementScore({
      sessionCount: clientSessions.length,
      actionCount: clientActions.length,
      completionRate: clientActions.length > 0 ? (completedActions / clientActions.length) * 100 : 0
    })

    return {
      clientName: business.business_name,
      sessions: clientSessions.length,
      actions: clientActions.length,
      completionRate: clientActions.length > 0 ? Math.round((completedActions / clientActions.length) * 100) : 0,
      engagement: engagementScore
    }
  }).sort((a, b) => b.engagement - a.engagement)
}

function processActionCompletionOverTime(actions: any[]) {
  const monthlyData: { [key: string]: { total: number; completed: number } } = {}

  actions.forEach(action => {
    const date = new Date(action.created_at)
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = { total: 0, completed: 0 }
    }

    monthlyData[monthKey].total++
    if (action.status === 'completed') {
      monthlyData[monthKey].completed++
    }
  })

  return Object.entries(monthlyData).map(([month, data]) => ({
    month,
    total: data.total,
    completed: data.completed,
    rate: Math.round((data.completed / data.total) * 100)
  })).sort((a, b) => a.month.localeCompare(b.month))
}

function calculateAverageResponseTime(sessions: any[]) {
  const completedSessions = sessions
    .filter(s => s.status === 'completed')
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())

  if (completedSessions.length < 2) return null

  let totalGap = 0
  for (let i = 1; i < completedSessions.length; i++) {
    const gap = new Date(completedSessions[i].scheduled_at).getTime() -
                new Date(completedSessions[i - 1].scheduled_at).getTime()
    totalGap += gap
  }

  const avgGapMs = totalGap / (completedSessions.length - 1)
  const avgGapDays = Math.round(avgGapMs / (1000 * 60 * 60 * 24))

  return avgGapDays
}

function calculateEngagementScore(metrics: {
  sessionCount: number
  actionCount: number
  completionRate: number
}) {
  let score = 0

  // Sessions (max 40 points)
  score += Math.min(metrics.sessionCount * 4, 40)

  // Actions (max 30 points)
  score += Math.min(metrics.actionCount * 2, 30)

  // Completion rate (max 30 points)
  score += (metrics.completionRate / 100) * 30

  return Math.min(Math.round(score), 100)
}
