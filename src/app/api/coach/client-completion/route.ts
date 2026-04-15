import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// ─── Types ────────────────────────────────────────────────────────────────────

type ModuleStatus = 'completed' | 'in_progress' | 'not_started'

interface ClientCompletion {
  businessId: string
  businessName: string
  ownerId: string | null
  modules: Record<string, ModuleStatus>
  engagement: {
    lastLogin: string | null
    weeklyReviewStreak: number
    daysSinceSession: number | null
    openActions: number
    unreadMessages: number
    engagementScore: number
  }
  alerts: string[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Wrap a Supabase query so one failure doesn't kill the whole batch */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safeQuery<T>(
  fn: () => PromiseLike<{ data: T | null; error: any }>
): Promise<T | null> {
  try {
    const { data, error } = await fn()
    if (error) {
      console.warn('[client-completion] query error:', error.message)
      return null
    }
    return data
  } catch (e: any) {
    console.warn('[client-completion] query exception:', e.message)
    return null
  }
}

/** Calculate days between two dates */
function daysBetween(a: Date, b: Date): number {
  return Math.floor(Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24))
}

/** Calculate weekly review streak (consecutive completed weeks, most recent first) */
function calcStreak(
  reviews: Array<{ week_start_date: string; is_completed: boolean }> | null
): number {
  if (!reviews || reviews.length === 0) return 0

  // Sort by week_start_date descending
  const sorted = [...reviews]
    .filter((r) => r.is_completed)
    .sort((a, b) => b.week_start_date.localeCompare(a.week_start_date))

  if (sorted.length === 0) return 0

  let streak = 1
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1].week_start_date)
    const curr = new Date(sorted[i].week_start_date)
    const diff = daysBetween(prev, curr)
    // Allow 6-8 day gap to account for slight date variations
    if (diff >= 5 && diff <= 9) {
      streak++
    } else {
      break
    }
  }
  return streak
}

/** Score engagement 0-100 based on multiple signals */
function calcEngagementScore(engagement: {
  lastLogin: string | null
  weeklyReviewStreak: number
  daysSinceSession: number | null
  openActions: number
  unreadMessages: number
}): number {
  let score = 0

  // Login recency (0-25)
  if (engagement.lastLogin) {
    const daysSinceLogin = daysBetween(new Date(), new Date(engagement.lastLogin))
    if (daysSinceLogin <= 1) score += 25
    else if (daysSinceLogin <= 3) score += 20
    else if (daysSinceLogin <= 7) score += 15
    else if (daysSinceLogin <= 14) score += 8
    else if (daysSinceLogin <= 30) score += 3
  }

  // Weekly review streak (0-25)
  if (engagement.weeklyReviewStreak >= 8) score += 25
  else if (engagement.weeklyReviewStreak >= 4) score += 20
  else if (engagement.weeklyReviewStreak >= 2) score += 12
  else if (engagement.weeklyReviewStreak >= 1) score += 6

  // Session recency (0-25)
  if (engagement.daysSinceSession !== null) {
    if (engagement.daysSinceSession <= 7) score += 25
    else if (engagement.daysSinceSession <= 14) score += 20
    else if (engagement.daysSinceSession <= 30) score += 12
    else if (engagement.daysSinceSession <= 60) score += 5
  }

  // Action responsiveness (0-25): fewer open = more responsive
  if (engagement.openActions === 0) score += 25
  else if (engagement.openActions <= 2) score += 18
  else if (engagement.openActions <= 5) score += 10
  else if (engagement.openActions <= 10) score += 5

  return Math.min(100, score)
}

/** Generate alert strings based on engagement data and module status */
function generateAlerts(
  modules: Record<string, ModuleStatus>,
  engagement: ClientCompletion['engagement']
): string[] {
  const alerts: string[] = []

  // Login alerts
  if (!engagement.lastLogin) {
    alerts.push('Never logged in')
  } else {
    const daysSinceLogin = daysBetween(new Date(), new Date(engagement.lastLogin))
    if (daysSinceLogin >= 30) alerts.push(`No login ${daysSinceLogin}d+`)
    else if (daysSinceLogin >= 14) alerts.push(`No login ${daysSinceLogin}d`)
  }

  // Session alerts
  if (engagement.daysSinceSession === null) {
    alerts.push('No sessions yet')
  } else if (engagement.daysSinceSession >= 30) {
    alerts.push(`No session ${engagement.daysSinceSession}d`)
  }

  // Key module alerts
  if (modules['forecast'] === 'not_started') alerts.push('No forecast')
  if (modules['assessment'] === 'not_started') alerts.push('Assessment incomplete')
  if (modules['xero_connected'] === 'not_started') alerts.push('Xero not connected')
  if (modules['goals'] === 'not_started') alerts.push('No goals set')

  // Action overload
  if (engagement.openActions >= 10) alerts.push(`${engagement.openActions} open actions`)

  // Stalled weekly reviews
  if (engagement.weeklyReviewStreak === 0 && modules['weekly_reviews'] === 'not_started') {
    alerts.push('No weekly reviews')
  }

  return alerts
}

// ─── GET Handler ──────────────────────────────────────────────────────────────

export async function GET() {
  const supabase = await createRouteHandlerClient()

  try {
    // ── Auth ──────────────────────────────────────────────────────
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: roleData } = await supabase
      .from('system_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (!roleData || (roleData.role !== 'coach' && roleData.role !== 'super_admin')) {
      return NextResponse.json(
        { error: 'Access denied. Coach privileges required.' },
        { status: 403 }
      )
    }

    // ── Step 1: Get all businesses assigned to this coach ─────────
    const { data: businesses, error: bizError } = await supabase
      .from('businesses')
      .select('id, business_name, name, owner_id, status')
      .eq('assigned_coach_id', user.id)
      .order('business_name', { ascending: true })

    if (bizError) {
      console.error('[client-completion] businesses query error:', bizError)
      return NextResponse.json({ error: 'Failed to load clients' }, { status: 500 })
    }

    if (!businesses || businesses.length === 0) {
      return NextResponse.json({ clients: [] })
    }

    // ── Step 2: Collect all IDs ──────────────────────────────────
    const businessIds = businesses.map((b) => b.id)
    const ownerIds = businesses.map((b) => b.owner_id).filter(Boolean) as string[]

    // Get business_profiles.id (profileIds) for tables that use that FK
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type ProfileRow = { id: string; business_id: string; user_id: string; business_name: string; mission: string | null; vision: string | null; owner_info: any }
    const profilesResult = await safeQuery<ProfileRow[]>(() =>
      supabase
        .from('business_profiles')
        .select('id, business_id, user_id, business_name, mission, vision, owner_info')
        .in('business_id', businessIds)
    )
    const profiles = profilesResult || []
    const profileIds = profiles.map((p: ProfileRow) => p.id)

    // Build lookup maps
    const profileByBusinessId = new Map(profiles.map((p: ProfileRow) => [p.business_id, p]))
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const profileByUserId = new Map(profiles.map((p: ProfileRow) => [p.user_id, p]))

    // ── Step 3: Pre-build OR filter strings ────────────────────────
    const q = (ids: string[]) => ids.join(',')
    const allXeroIds = [...businessIds, ...profileIds]
    const xeroFilter = `business_id.in.(${q(allXeroIds)})`
    const ownerOrBizFilter = ownerIds.length > 0
      ? `user_id.in.(${q(ownerIds)}),business_id.in.(${q(businessIds)})`
      : `business_id.in.(${q(businessIds)})`
    const ownerOrProfileFilter = ownerIds.length > 0
      ? `user_id.in.(${q(ownerIds)}),business_id.in.(${q(profileIds.length > 0 ? profileIds : ['__none__'])})`
      : `business_id.in.(${q(profileIds.length > 0 ? profileIds : ['__none__'])})`
    const qrIds = [...profileIds, ...ownerIds]

    // ── Row type aliases for safeQuery generics ──────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type R = Record<string, any>

    // ── Step 3b: Parallel batch queries ──────────────────────────
    const [
      // SETUP
      assessmentsResult,
      xeroConnectionsResult,
      // PLAN
      swotResult,
      goalsResult,
      planSnapshotsResult,
      initiativesResult,
      // FINANCE
      forecastsResult,
      metricsSnapshotsResult,
      // EXECUTE
      weeklyReviewsResult,
      quarterlyReviewsResult,
      issuesResult,
      ideasResult,
      openLoopsResult,
      stopDoingResult,
      // TEAM
      teamDataResult,
      // SYSTEMS
      processesResult,
      // COACHING
      sessionNotesResult,
      chatMessagesResult,
      // ENGAGEMENT
      usersResult,
      coachingSessionsResult,
      sessionActionsResult,
    ] = await Promise.all([
      // ── SETUP ──
      // 2. Assessments
      safeQuery<R[]>(() =>
        supabase
          .from('assessments')
          .select('id, user_id, status')
          .in('user_id', ownerIds.length > 0 ? ownerIds : ['__none__'])
          .eq('status', 'completed')
      ),
      // 3. Xero Connected — check both businessIds and profileIds
      safeQuery<R[]>(() =>
        supabase
          .from('xero_connections')
          .select('id, business_id')
          .or(xeroFilter)
      ),
      // ── PLAN ──
      // 5. SWOT (uses user_id as business_id — legacy pattern)
      safeQuery<R[]>(() =>
        supabase
          .from('swot_analyses')
          .select('id, business_id')
          .in('business_id', ownerIds.length > 0 ? ownerIds : ['__none__'])
      ),
      // 6. Goals
      safeQuery<R[]>(() =>
        supabase
          .from('business_financial_goals')
          .select('id, business_id, user_id')
          .or(ownerOrProfileFilter)
      ),
      // 7. One-Page Plan snapshots
      safeQuery<R[]>(() =>
        supabase
          .from('plan_snapshots')
          .select('id, business_id')
          .in('business_id', profileIds.length > 0 ? profileIds : ['__none__'])
      ),
      // 8. Strategic Initiatives (uses business_profiles.id)
      safeQuery<R[]>(() =>
        supabase
          .from('strategic_initiatives')
          .select('id, business_id')
          .in('business_id', profileIds.length > 0 ? profileIds : ['__none__'])
      ),
      // ── FINANCE ──
      // 9. Forecast
      safeQuery<R[]>(() =>
        supabase
          .from('financial_forecasts')
          .select('id, business_id, is_completed')
          .in('business_id', profileIds.length > 0 ? profileIds : ['__none__'])
      ),
      // 10/12. Weekly Metrics Snapshots
      safeQuery<R[]>(() =>
        supabase
          .from('weekly_metrics_snapshots')
          .select('id, business_id, week_ending_date, created_at')
          .in('business_id', profileIds.length > 0 ? profileIds : ['__none__'])
      ),
      // ── EXECUTE ──
      // 13. Weekly Reviews
      safeQuery<R[]>(() =>
        supabase
          .from('weekly_reviews')
          .select('id, business_id, user_id, is_completed, week_start_date')
          .in('business_id', businessIds)
      ),
      // 14. Quarterly Reviews (uses business_id — either profileId or ownerIds)
      safeQuery<R[]>(() =>
        supabase
          .from('quarterly_reviews')
          .select('id, business_id, status')
          .in('business_id', qrIds.length > 0 ? qrIds : ['__none__'])
      ),
      // 15. Issues List (has both user_id and business_id)
      safeQuery<R[]>(() =>
        supabase
          .from('issues_list')
          .select('id, user_id, business_id')
          .or(ownerOrBizFilter)
      ),
      // 16. Ideas (has both user_id and business_id)
      safeQuery<R[]>(() =>
        supabase
          .from('ideas')
          .select('id, user_id, business_id')
          .or(ownerOrBizFilter)
      ),
      // 17. Open Loops (has both user_id and business_id)
      safeQuery<R[]>(() =>
        supabase
          .from('open_loops')
          .select('id, user_id, business_id')
          .or(ownerOrBizFilter)
      ),
      // 18. Stop Doing Items
      safeQuery<R[]>(() =>
        supabase
          .from('stop_doing_items')
          .select('id, user_id')
          .in('user_id', ownerIds.length > 0 ? ownerIds : ['__none__'])
      ),
      // ── TEAM ──
      // 19/20. Team Data (accountability_chart + org_chart)
      safeQuery<R[]>(() =>
        supabase
          .from('team_data')
          .select('id, user_id, accountability_chart, org_chart')
          .in('user_id', ownerIds.length > 0 ? ownerIds : ['__none__'])
      ),
      // ── SYSTEMS ──
      // 22. Processes
      safeQuery<R[]>(() =>
        supabase
          .from('process_diagrams')
          .select('id, user_id')
          .in('user_id', ownerIds.length > 0 ? ownerIds : ['__none__'])
      ),
      // ── COACHING ──
      // 23. Session Notes
      safeQuery<R[]>(() =>
        supabase
          .from('session_notes')
          .select('id, business_id')
          .in('business_id', businessIds)
      ),
      // 24. Messages
      safeQuery<R[]>(() =>
        supabase
          .from('messages')
          .select('id, business_id, sender_id, read, created_at')
          .in('business_id', businessIds)
      ),
      // ── ENGAGEMENT ──
      // Last login
      safeQuery<R[]>(() =>
        supabase
          .from('users')
          .select('id, last_login_at')
          .in('id', ownerIds.length > 0 ? ownerIds : ['__none__'])
      ),
      // Coaching sessions (for days-since-session)
      safeQuery<R[]>(() =>
        supabase
          .from('coaching_sessions')
          .select('id, business_id, scheduled_at, status')
          .in('business_id', businessIds)
          .eq('status', 'completed')
          .order('scheduled_at', { ascending: false })
      ),
      // Session actions (for open action count)
      safeQuery<R[]>(() =>
        supabase
          .from('session_actions')
          .select('id, business_id, status')
          .in('business_id', businessIds)
          .in('status', ['open', 'in_progress', 'pending'])
      ),
    ])

    // ── Step 4: Build lookup indexes ─────────────────────────────

    // Helper to group array items by a key
    function groupBy<T>(items: T[] | null, key: keyof T): Map<string, T[]> {
      const map = new Map<string, T[]>()
      if (!items) return map
      for (const item of items) {
        const k = String(item[key])
        const arr = map.get(k) || []
        arr.push(item)
        map.set(k, arr)
      }
      return map
    }

    // Build sets/maps for quick lookups
    const assessmentsByUser = new Set(
      (assessmentsResult || []).map((a) => a.user_id)
    )

    const xeroByBusiness = new Set(
      (xeroConnectionsResult || []).map((x) => x.business_id)
    )

    const swotByUser = new Set(
      (swotResult || []).map((s) => s.business_id) // business_id = user_id in this table
    )

    const goalsByUser = groupBy(goalsResult, 'user_id')
    const goalsByProfile = groupBy(goalsResult, 'business_id')

    const planSnapshotsByProfile = groupBy(planSnapshotsResult, 'business_id')
    const initiativesByProfile = groupBy(initiativesResult, 'business_id')

    const forecastsByProfile = groupBy(forecastsResult, 'business_id')
    const metricsByProfile = groupBy(metricsSnapshotsResult, 'business_id')

    const weeklyReviewsByBusiness = groupBy(weeklyReviewsResult, 'business_id')
    const quarterlyReviewsByBusiness = groupBy(quarterlyReviewsResult, 'business_id')

    const issuesByUser = groupBy(issuesResult, 'user_id')
    const issuesByBusiness = groupBy(issuesResult, 'business_id')

    const ideasByUser = groupBy(ideasResult, 'user_id')
    const ideasByBusiness = groupBy(ideasResult, 'business_id')

    const openLoopsByUser = groupBy(openLoopsResult, 'user_id')
    const openLoopsByBusiness = groupBy(openLoopsResult, 'business_id')

    const stopDoingByUser = groupBy(stopDoingResult, 'user_id')

    const teamDataByUser = new Map(
      (teamDataResult || []).map((t) => [t.user_id, t])
    )

    const processesByUser = groupBy(processesResult, 'user_id')

    const sessionNotesByBusiness = groupBy(sessionNotesResult, 'business_id')
    const chatMessagesByBusiness = groupBy(chatMessagesResult, 'business_id')

    const userLoginMap = new Map(
      (usersResult || []).map((u) => [u.id, u.last_login_at])
    )

    const coachingSessionsByBusiness = groupBy(coachingSessionsResult, 'business_id')
    const actionsByBusiness = groupBy(sessionActionsResult, 'business_id')

    // ── Step 5: Build per-client results ─────────────────────────
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    const clients: ClientCompletion[] = businesses.map((biz) => {
      const ownerId = biz.owner_id || null
      const profile = profileByBusinessId.get(biz.id)
      const profileId = profile?.id || null

      // ── Module completion ──────────────────────────────────────
      const modules: Record<string, ModuleStatus> = {}

      // 1. Business Profile
      modules['business_profile'] = profile?.business_name ? 'completed' : 'not_started'

      // 2. Assessment
      modules['assessment'] = ownerId && assessmentsByUser.has(ownerId) ? 'completed' : 'not_started'

      // 3. Xero Connected (check both businesses.id and business_profiles.id)
      modules['xero_connected'] =
        xeroByBusiness.has(biz.id) || (profileId && xeroByBusiness.has(profileId))
          ? 'completed'
          : 'not_started'

      // 4. Vision & Mission
      const hasVision = !!(
        profile?.mission ||
        profile?.vision ||
        (profile?.owner_info && typeof profile.owner_info === 'object' &&
          ((profile.owner_info as any).mission || (profile.owner_info as any).vision))
      )
      modules['vision_mission'] = hasVision ? 'completed' : 'not_started'

      // 5. SWOT (uses user_id as business_id in swot_analyses)
      modules['swot'] = ownerId && swotByUser.has(ownerId) ? 'completed' : 'not_started'

      // 6. Goals
      const hasGoals =
        (ownerId && (goalsByUser.get(ownerId)?.length || 0) > 0) ||
        (profileId && (goalsByProfile.get(profileId)?.length || 0) > 0)
      modules['goals'] = hasGoals ? 'completed' : 'not_started'

      // 7. One-Page Plan
      const hasSnapshot = profileId && (planSnapshotsByProfile.get(profileId)?.length || 0) > 0
      const hasInitiativesForPlan = profileId && (initiativesByProfile.get(profileId)?.length || 0) > 0
      modules['one_page_plan'] = hasSnapshot
        ? 'completed'
        : hasInitiativesForPlan
          ? 'in_progress'
          : 'not_started'

      // 8. Strategic Initiatives
      const initiativeCount = profileId
        ? (initiativesByProfile.get(profileId)?.length || 0)
        : 0
      modules['strategic_initiatives'] = initiativeCount > 0 ? 'completed' : 'not_started'

      // 9. Forecast
      const forecasts = profileId ? (forecastsByProfile.get(profileId) || []) : []
      const hasCompletedForecast = forecasts.some((f) => f.is_completed)
      const hasAnyForecast = forecasts.length > 0
      modules['forecast'] = hasCompletedForecast
        ? 'completed'
        : hasAnyForecast
          ? 'in_progress'
          : 'not_started'

      // 10. Monthly Report
      const snapshots = profileId ? (metricsByProfile.get(profileId) || []) : []
      modules['monthly_report'] = snapshots.length > 0 ? 'completed' : 'not_started'

      // 11. Cashflow (derives from forecast)
      modules['cashflow'] = hasCompletedForecast ? 'completed' : hasAnyForecast ? 'in_progress' : 'not_started'

      // 12. KPI Dashboard (recent metrics snapshot within 30 days)
      const hasRecentMetrics = snapshots.some((s) => {
        const snapshotDate = new Date(s.week_ending_date || s.created_at)
        return snapshotDate >= thirtyDaysAgo
      })
      modules['kpi_dashboard'] = hasRecentMetrics
        ? 'completed'
        : snapshots.length > 0
          ? 'in_progress'
          : 'not_started'

      // 13. Weekly Reviews
      const weeklyReviews = weeklyReviewsByBusiness.get(biz.id) || []
      const completedReviews = weeklyReviews.filter((r) => r.is_completed)
      modules['weekly_reviews'] =
        completedReviews.length >= 4
          ? 'completed'
          : completedReviews.length > 0
            ? 'in_progress'
            : 'not_started'

      // 14. Quarterly Review (check both profileId and ownerId keys)
      const qReviews = [
        ...(profileId ? (quarterlyReviewsByBusiness.get(profileId) || []) : []),
        ...(ownerId ? (quarterlyReviewsByBusiness.get(ownerId) || []) : []),
      ]
      const hasCompletedQR = qReviews.some((r) => r.status === 'completed')
      modules['quarterly_review'] = hasCompletedQR
        ? 'completed'
        : qReviews.length > 0
          ? 'in_progress'
          : 'not_started'

      // 15. Issues List
      const issueCount =
        (ownerId ? (issuesByUser.get(ownerId)?.length || 0) : 0) +
        (issuesByBusiness.get(biz.id)?.length || 0)
      modules['issues_list'] = issueCount > 0 ? 'completed' : 'not_started'

      // 16. Ideas
      const ideaCount =
        (ownerId ? (ideasByUser.get(ownerId)?.length || 0) : 0) +
        (ideasByBusiness.get(biz.id)?.length || 0)
      modules['ideas'] = ideaCount > 0 ? 'completed' : 'not_started'

      // 17. Open Loops
      const loopCount =
        (ownerId ? (openLoopsByUser.get(ownerId)?.length || 0) : 0) +
        (openLoopsByBusiness.get(biz.id)?.length || 0)
      modules['open_loops'] = loopCount > 0 ? 'completed' : 'not_started'

      // 18. To-Do / Stop Doing
      const stopDoingCount = ownerId ? (stopDoingByUser.get(ownerId)?.length || 0) : 0
      modules['stop_doing'] = stopDoingCount > 0 ? 'completed' : 'not_started'

      // 19. Accountability Chart
      const teamData = ownerId ? teamDataByUser.get(ownerId) : null
      const hasAccChart = !!(
        teamData?.accountability_chart &&
        typeof teamData.accountability_chart === 'object' &&
        Object.keys(teamData.accountability_chart as Record<string, unknown>).length > 0
      )
      modules['accountability_chart'] = hasAccChart ? 'completed' : 'not_started'

      // 20. Org Chart
      const hasOrgChart = !!(
        teamData?.org_chart &&
        typeof teamData.org_chart === 'object' &&
        Object.keys(teamData.org_chart as Record<string, unknown>).length > 0
      )
      modules['org_chart'] = hasOrgChart ? 'completed' : 'not_started'

      // 21. Value Proposition (check business_profiles for value prop in owner_info)
      const hasValueProp = !!(
        profile?.owner_info &&
        typeof profile.owner_info === 'object' &&
        ((profile.owner_info as any).value_proposition ||
          (profile.owner_info as any).valueProposition ||
          (profile.owner_info as any).unique_value)
      )
      modules['value_proposition'] = hasValueProp ? 'completed' : 'not_started'

      // 22. Processes
      const processCount = ownerId ? (processesByUser.get(ownerId)?.length || 0) : 0
      modules['processes'] = processCount > 0 ? 'completed' : 'not_started'

      // 23. Session Notes (count-based, not boolean)
      const noteCount = sessionNotesByBusiness.get(biz.id)?.length || 0
      modules['session_notes'] = noteCount > 0 ? 'completed' : 'not_started'

      // 24. Messages (count-based)
      const msgCount = chatMessagesByBusiness.get(biz.id)?.length || 0
      modules['messages'] = msgCount > 0 ? 'completed' : 'not_started'

      // ── Engagement signals ─────────────────────────────────────
      const lastLogin = ownerId ? (userLoginMap.get(ownerId) || null) : null

      const streak = calcStreak(
        weeklyReviews.map((r) => ({
          week_start_date: r.week_start_date,
          is_completed: !!r.is_completed,
        }))
      )

      const completedSessions = coachingSessionsByBusiness.get(biz.id) || []
      const lastCompletedSession = completedSessions[0] // already sorted desc
      const daysSinceSession = lastCompletedSession
        ? daysBetween(now, new Date(lastCompletedSession.scheduled_at))
        : null

      const openActions = actionsByBusiness.get(biz.id)?.length || 0

      const bizMessages = chatMessagesByBusiness.get(biz.id) || []
      const unreadMessages = bizMessages.filter(
        (m) => m.sender_id !== user.id && !m.read
      ).length

      const engagement = {
        lastLogin,
        weeklyReviewStreak: streak,
        daysSinceSession,
        openActions,
        unreadMessages,
        engagementScore: 0, // calculated below
      }
      engagement.engagementScore = calcEngagementScore(engagement)

      // ── Alerts ─────────────────────────────────────────────────
      const alerts = generateAlerts(modules, engagement)

      // Convert module keys from snake_case to camelCase to match frontend component
      const camelModules: Record<string, ModuleStatus> = {}
      const keyMap: Record<string, string> = {
        business_profile: 'businessProfile',
        xero_connected: 'xeroConnected',
        vision_mission: 'visionMission',
        one_page_plan: 'onePagePlan',
        strategic_initiatives: 'strategicInitiatives',
        monthly_report: 'monthlyReport',
        kpi_dashboard: 'kpiDashboard',
        weekly_reviews: 'weeklyReviews',
        quarterly_review: 'quarterlyReview',
        issues_list: 'issuesList',
        open_loops: 'openLoops',
        stop_doing: 'stopDoing',
        accountability_chart: 'accountability',
        org_chart: 'orgChart',
        hiring_roadmap: 'hiringRoadmap',
        value_proposition: 'valueProposition',
        session_notes: 'sessionNotes',
      }
      for (const [key, value] of Object.entries(modules)) {
        camelModules[keyMap[key] || key] = value as ModuleStatus
      }

      return {
        businessId: biz.id,
        businessName: biz.business_name || biz.name || 'Unnamed',
        ownerId,
        modules: camelModules,
        engagement,
        alerts,
      }
    })

    return NextResponse.json({ clients })
  } catch (error) {
    console.error('[client-completion] Unexpected error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
