import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createRouteHandlerClient()

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const businessId = params.id

    // Verify user has access to this business
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('assigned_coach_id, owner_id')
      .eq('id', businessId)
      .single()

    if (businessError || !business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    const isCoach = business.assigned_coach_id === user.id
    const isClient = business.owner_id === user.id

    if (!isCoach && !isClient) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Get session data over time (last 12 months)
    const twelveMonthsAgo = new Date()
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)

    const { data: sessions } = await supabase
      .from('coaching_sessions')
      .select('id, scheduled_at, status, created_at')
      .eq('business_id', businessId)
      .gte('scheduled_at', twelveMonthsAgo.toISOString())
      .order('scheduled_at', { ascending: true })

    // Get actions data
    const { data: actions } = await supabase
      .from('session_actions')
      .select('id, status, created_at, due_date, completed_at')
      .eq('business_id', businessId)
      .gte('created_at', twelveMonthsAgo.toISOString())

    // Get financial goals over time
    const { data: financialGoals } = await supabase
      .from('business_financial_goals')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: true })

    // Get forecast data if available
    const { data: forecasts } = await supabase
      .from('financial_forecasts')
      .select('id, created_at, version_name, forecast_data')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(10)

    // Process session frequency data (by month)
    const sessionsByMonth = processSessionsByMonth(sessions || [])

    // Process action completion rate over time
    const actionCompletionData = processActionCompletionData(actions || [])

    // Process financial progress (if goals exist)
    const financialProgress = processFinancialProgress(financialGoals || [], forecasts || [])

    // Calculate overall metrics
    const totalSessions = sessions?.length || 0
    const completedSessions = sessions?.filter(s => s.status === 'completed').length || 0
    const totalActions = actions?.length || 0
    const completedActions = actions?.filter(a => a.status === 'completed').length || 0
    const actionCompletionRate = totalActions > 0 ? Math.round((completedActions / totalActions) * 100) : 0

    // Calculate average response time (time between sessions)
    const avgSessionGap = calculateAverageSessionGap(sessions || [])

    // Calculate health score (0-100)
    const healthScore = calculateHealthScore({
      sessionCount: totalSessions,
      actionCompletionRate,
      recentActivity: sessions?.filter(s => {
        const thirtyDaysAgo = new Date()
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
        return new Date(s.created_at) > thirtyDaysAgo
      }).length || 0
    })

    return NextResponse.json({
      success: true,
      analytics: {
        overview: {
          totalSessions,
          completedSessions,
          totalActions,
          completedActions,
          actionCompletionRate,
          avgSessionGap,
          healthScore
        },
        charts: {
          sessionsByMonth,
          actionCompletionData,
          financialProgress
        }
      }
    })

  } catch (error) {
    console.error('Analytics API error:', error)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}

// Helper functions

function processSessionsByMonth(sessions: any[]) {
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

function processActionCompletionData(actions: any[]) {
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
    completionRate: Math.round((data.completed / data.total) * 100)
  })).sort((a, b) => a.month.localeCompare(b.month))
}

function processFinancialProgress(goals: any[], forecasts: any[]) {
  if (goals.length === 0) return []

  // Get latest forecast data if available
  const latestForecast = forecasts[0]
  const forecastData = latestForecast?.forecast_data

  // Map goals to chart data
  return goals.map(goal => ({
    goal: goal.goal_name || 'Revenue',
    target: parseFloat(goal.target_value) || 0,
    current: parseFloat(goal.current_value) || 0,
    progress: goal.target_value > 0
      ? Math.round((parseFloat(goal.current_value) / parseFloat(goal.target_value)) * 100)
      : 0
  }))
}

function calculateAverageSessionGap(sessions: any[]) {
  if (sessions.length < 2) return null

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

function calculateHealthScore(metrics: {
  sessionCount: number
  actionCompletionRate: number
  recentActivity: number
}) {
  let score = 0

  // Session count (max 40 points)
  if (metrics.sessionCount >= 10) score += 40
  else score += metrics.sessionCount * 4

  // Action completion rate (max 40 points)
  score += (metrics.actionCompletionRate / 100) * 40

  // Recent activity (max 20 points)
  if (metrics.recentActivity >= 5) score += 20
  else score += metrics.recentActivity * 4

  return Math.min(Math.round(score), 100)
}
