'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBusinessContext } from '@/hooks/useBusinessContext'
import { resolveBusinessId } from '@/lib/business/resolveBusinessId'
import { getCurrentFiscalYear, getQuarterForMonth, getFiscalYearStartDate, getFiscalYearEndDate, getQuarterDefs, DEFAULT_YEAR_START_MONTH } from '@/lib/utils/fiscal-year-utils'
import type { FinancialGoals, Rock, DashboardData, DashboardError, DashboardInsight, SuggestedAction } from '../types'

interface UseDashboardDataReturn {
  data: DashboardData
  isLoading: boolean
  error: DashboardError | null
  businessId: string | null
  userId: string | null
  refresh: () => Promise<void>
}

type TeamMembersMap = Record<string, string>

const ysm: number = DEFAULT_YEAR_START_MONTH

/**
 * Calculate the current fiscal quarter
 */
function getCurrentQuarter(): 'q1' | 'q2' | 'q3' | 'q4' {
  const now = new Date()
  const q = getQuarterForMonth(now.getMonth() + 1, ysm)
  return `q${q}` as 'q1' | 'q2' | 'q3' | 'q4'
}

/**
 * Get the next quarter (planning quarter)
 */
function getNextQuarter(current: 'q1' | 'q2' | 'q3' | 'q4'): 'q1' | 'q2' | 'q3' | 'q4' {
  const quarterOrder: ('q1' | 'q2' | 'q3' | 'q4')[] = ['q1', 'q2', 'q3', 'q4']
  const currentIndex = quarterOrder.indexOf(current)
  return quarterOrder[(currentIndex + 1) % 4]
}

/**
 * Get the end date of the current quarter
 */
function getQuarterEndDate(): Date {
  const now = new Date()
  const q = getQuarterForMonth(now.getMonth() + 1, ysm)
  const defs = getQuarterDefs(ysm)
  const def = defs[q - 1]
  const fy = getCurrentFiscalYear(ysm)
  // Determine the calendar year for this quarter's end month
  const endCalYear = def.endMonth >= ysm
    ? (ysm === 1 ? fy : fy - 1)
    : fy
  return new Date(endCalYear, def.endMonth - 1 + 1, 0) // Last day of endMonth
}

/**
 * Get the end date of the financial year
 */
function getFYEndDate(): Date {
  const fy = getCurrentFiscalYear(ysm)
  return getFiscalYearEndDate(fy, ysm)
}

/**
 * Calculate days between two dates
 */
function daysBetween(date1: Date, date2: Date): number {
  const oneDay = 24 * 60 * 60 * 1000
  return Math.round(Math.abs((date2.getTime() - date1.getTime()) / oneDay))
}

/**
 * Calculate financial margins from raw values
 */
function calculateGoals(revenue: number, grossProfit: number, netProfit: number): FinancialGoals {
  return {
    revenue,
    grossProfit,
    grossMargin: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
    netProfit,
    netMargin: revenue > 0 ? (netProfit / revenue) * 100 : 0
  }
}

/**
 * Generate smart insight based on current data
 */
function generateInsight(rocks: Rock[], quarterDaysRemaining: number, weeklyGoals: string[]): DashboardInsight {
  // Check for rocks needing attention first (highest priority)
  const atRiskRocks = rocks.filter(r => r.status === 'at_risk')
  const behindRocks = rocks.filter(r => r.status === 'not_started' && r.progressPercentage === 0)

  if (atRiskRocks.length > 0) {
    const rock = atRiskRocks[0]
    const dailyProgress = quarterDaysRemaining > 0
      ? ((100 - rock.progressPercentage) / quarterDaysRemaining).toFixed(1)
      : '0'
    return {
      type: 'rock_attention',
      title: 'Focus Needed',
      message: `"${rock.title}" is at ${rock.progressPercentage}% with ${quarterDaysRemaining} days left. Needs ${dailyProgress}% daily progress.`,
      actionLabel: 'Update Progress',
      actionHref: '/one-page-plan',
      priority: 'high'
    }
  }

  if (behindRocks.length > 0) {
    const rock = behindRocks[0]
    return {
      type: 'rock_attention',
      title: 'Get Started',
      message: `"${rock.title}" hasn't started yet. ${quarterDaysRemaining} days left in the quarter.`,
      actionLabel: 'Start Now',
      actionHref: '/one-page-plan',
      priority: 'high'
    }
  }

  // Check for weekly review needed (Friday-Sunday)
  const dayOfWeek = new Date().getDay()
  if (dayOfWeek >= 5 || dayOfWeek === 0) {
    if (weeklyGoals.length === 0) {
      return {
        type: 'weekly_review',
        title: 'Weekly Review Time',
        message: 'Set your priorities for next week to stay focused on what matters.',
        actionLabel: 'Start Review',
        actionHref: '/reviews/weekly',
        priority: 'medium'
      }
    }
  }

  // Quarter deadline approaching
  if (quarterDaysRemaining <= 14) {
    return {
      type: 'goal_deadline',
      title: 'Quarter Ending Soon',
      message: `Only ${quarterDaysRemaining} days left. Review your rocks and push for completion.`,
      actionLabel: 'Review Rocks',
      actionHref: '/one-page-plan',
      priority: 'medium'
    }
  }

  // Check for celebration (all rocks on track or completed)
  const completedRocks = rocks.filter(r => r.status === 'completed' || r.progressPercentage === 100)
  if (rocks.length > 0 && completedRocks.length === rocks.length) {
    return {
      type: 'celebration',
      title: 'Outstanding!',
      message: 'All your quarterly rocks are complete. Time to plan your next wins.',
      actionLabel: 'Plan Next Quarter',
      actionHref: '/one-page-plan',
      priority: 'low'
    }
  }

  // Default positive insight
  const onTrackCount = rocks.filter(r => r.status === 'on_track' || r.status === 'completed').length
  return {
    type: 'goal_deadline',
    title: 'Stay the Course',
    message: `${onTrackCount} of ${rocks.length} rocks on track. ${quarterDaysRemaining} days to finish strong.`,
    actionLabel: 'View Progress',
    actionHref: '/one-page-plan',
    priority: 'low'
  }
}

/**
 * Generate contextual suggested actions
 */
function generateSuggestedActions(
  rocks: Rock[],
  weeklyGoals: string[],
  quarterDaysRemaining: number
): SuggestedAction[] {
  const actions: SuggestedAction[] = []

  // Check for at-risk rocks
  const atRiskRocks = rocks.filter(r => r.status === 'at_risk' || (r.status === 'not_started' && r.progressPercentage === 0))
  if (atRiskRocks.length > 0) {
    actions.push({
      id: 'update-rocks',
      label: `Update ${atRiskRocks.length} rock${atRiskRocks.length > 1 ? 's' : ''} needing attention`,
      description: 'Review and update progress',
      href: '/one-page-plan',
      priority: 'high',
      icon: 'rock'
    })
  }

  // Weekly review reminder
  const dayOfWeek = new Date().getDay()
  if ((dayOfWeek >= 5 || dayOfWeek === 0) && weeklyGoals.length === 0) {
    actions.push({
      id: 'weekly-review',
      label: 'Complete your weekly review',
      description: 'Set priorities for next week',
      href: '/reviews/weekly',
      priority: 'high',
      icon: 'review'
    })
  }

  // Quarter ending soon
  if (quarterDaysRemaining <= 21) {
    actions.push({
      id: 'quarter-check',
      label: `${quarterDaysRemaining} days left in quarter`,
      description: 'Review quarterly progress',
      href: '/one-page-plan',
      priority: quarterDaysRemaining <= 7 ? 'high' : 'medium',
      icon: 'goal'
    })
  }

  // Always suggest forecast review
  actions.push({
    id: 'review-forecast',
    label: 'Review financial forecast',
    description: 'Stay on top of the numbers',
    href: '/finances/forecast',
    priority: 'low',
    icon: 'forecast'
  })

  return actions.slice(0, 3) // Max 3 suggestions
}

export function useDashboardData(): UseDashboardDataReturn {
  const supabase = useMemo(() => createClient(), [])
  const { activeBusiness, currentUser, businessProfileId: cachedProfileId, isLoading: contextLoading } = useBusinessContext()

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<DashboardError | null>(null)
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  const [data, setData] = useState<DashboardData>({
    annualGoals: null,
    quarterlyGoals: null,
    currentQuarter: getCurrentQuarter(),
    rocks: [],
    weeklyGoals: [],
    quarterDaysRemaining: daysBetween(new Date(), getQuarterEndDate()),
    yearDaysRemaining: daysBetween(new Date(), getFYEndDate())
  })

  const buildTeamMembersMap = useCallback(async (bId: string): Promise<TeamMembersMap> => {
    const map: TeamMembersMap = {}

    const { data: profile } = await supabase
      .from('business_profiles')
      .select('owner_info, key_roles')
      .eq('id', bId)
      .maybeSingle()

    if (!profile) return map

    const ownerInfo = profile.owner_info as { owner_name?: string } | null
    if (ownerInfo?.owner_name) {
      map[`owner-${bId}`] = ownerInfo.owner_name
    }

    const keyRoles = profile.key_roles as Array<{ name?: string }> | null
    if (keyRoles && Array.isArray(keyRoles)) {
      keyRoles.forEach((role, index) => {
        if (role.name?.trim()) {
          map[`role-${bId}-${index}`] = role.name
        }
      })
    }

    return map
  }, [supabase])

  const loadAnnualGoals = useCallback(async (bId: string): Promise<FinancialGoals | null> => {
    const { data, error } = await supabase
      .from('business_financial_goals')
      .select('revenue_year1, gross_profit_year1, net_profit_year1')
      .eq('business_id', bId)
      .maybeSingle()

    if (error || !data) return null

    const revenue = parseFloat(data.revenue_year1) || 0
    const grossProfit = parseFloat(data.gross_profit_year1) || 0
    const netProfit = parseFloat(data.net_profit_year1) || 0

    if (revenue === 0 && grossProfit === 0 && netProfit === 0) return null

    return calculateGoals(revenue, grossProfit, netProfit)
  }, [supabase])

  const loadQuarterlyGoals = useCallback(async (bId: string, quarter: string): Promise<FinancialGoals | null> => {
    const { data, error } = await supabase
      .from('business_financial_goals')
      .select('quarterly_targets')
      .eq('business_id', bId)
      .maybeSingle()

    if (error || !data?.quarterly_targets) return null

    const targets = data.quarterly_targets
    const revenueQ = parseFloat(targets.revenue?.[quarter]) || 0
    const grossProfitQ = parseFloat(targets.grossProfit?.[quarter]) || 0
    const netProfitQ = parseFloat(targets.netProfit?.[quarter]) || 0

    if (revenueQ === 0 && grossProfitQ === 0 && netProfitQ === 0) return null

    return calculateGoals(revenueQ, grossProfitQ, netProfitQ)
  }, [supabase])

  const loadRocks = useCallback(async (bId: string, quarter: string, teamMap: TeamMembersMap): Promise<Rock[]> => {
    const { data, error } = await supabase
      .from('strategic_initiatives')
      .select('id, title, assigned_to, status, progress_percentage')
      .eq('business_id', bId)
      .eq('step_type', quarter)
      .order('order_index', { ascending: true })

    if (error || !data) return []

    return data.map(rock => ({
      id: rock.id,
      title: rock.title,
      owner: rock.assigned_to
        ? (teamMap[rock.assigned_to] || rock.assigned_to)
        : 'Unassigned',
      status: (rock.status as Rock['status']) || 'not_started',
      progressPercentage: rock.progress_percentage || 0
    }))
  }, [supabase])

  const loadWeeklyGoals = useCallback(async (bId: string, uId: string): Promise<string[]> => {
    const { data, error } = await supabase
      .from('weekly_reviews')
      .select('next_week_goals')
      .eq('business_id', bId)
      .eq('user_id', uId)
      .order('week_start_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error || !data?.next_week_goals) return []

    return data.next_week_goals
  }, [supabase])

  const loadDashboardData = useCallback(async () => {
    try {
      // Wait for context to finish loading
      if (contextLoading) {
        return
      }

      setIsLoading(true)
      setError(null)

      const { data: { user }, error: authError } = await supabase.auth.getUser()

      if (authError || !user) {
        setError({
          type: 'auth',
          message: 'Please sign in to view your dashboard',
          details: authError?.message
        })
        setIsLoading(false)
        return
      }

      setUserId(user.id)

      // Use cached businessProfileId from context (resolved during init)
      // Falls back to querying if not cached.
      // IMPORTANT: When a coach is viewing a client, activeBusiness holds the
      // client's business — never fall back to user.id (that's the coach).
      let bId: string
      if (cachedProfileId) {
        bId = cachedProfileId
      } else if (activeBusiness?.id) {
        const { data: profile } = await supabase
          .from('business_profiles')
          .select('id')
          .eq('business_id', activeBusiness.id)
          .maybeSingle()
        bId = profile?.id || activeBusiness.id
      } else {
        // No cached profile and no activeBusiness — route through the shared
        // role-aware resolver. Returns a `businesses.id` (or null for coach
        // without a client); we then translate to `business_profiles.id`
        // because this hook's downstream queries target business_profiles.id.
        const resolved = await resolveBusinessId(supabase, {
          userId: user.id,
          role: currentUser?.role ?? null,
          activeBusinessId: null,
        })

        if (!resolved.businessId) {
          console.log('[Dashboard] No business resolved (reason=' + resolved.reason + ')')
          setIsLoading(false)
          return
        }

        const { data: profile } = await supabase
          .from('business_profiles')
          .select('id')
          .eq('business_id', resolved.businessId)
          .maybeSingle()

        if (!profile?.id) {
          console.log('[Dashboard] No business_profile for businesses.id:', resolved.businessId)
          setIsLoading(false)
          return
        }
        bId = profile.id
      }
      setBusinessId(bId)

      const currentQuarter = getCurrentQuarter()
      const planningQuarter = getNextQuarter(currentQuarter)
      const quarterDaysRemaining = daysBetween(new Date(), getQuarterEndDate())
      const yearDaysRemaining = daysBetween(new Date(), getFYEndDate())

      // Use activeBusiness ownerId if viewing as coach, otherwise current user
      const targetUserId = activeBusiness?.ownerId || user.id

      // Parallelize teamMap with goals/weekly — rocks will use teamMap after
      const [teamMap, annualGoals, currentQuarterGoals, weeklyGoals] = await Promise.all([
        buildTeamMembersMap(bId),
        loadAnnualGoals(bId),
        loadQuarterlyGoals(bId, currentQuarter),
        loadWeeklyGoals(bId, targetUserId)
      ])

      const currentQuarterRocks = await loadRocks(bId, currentQuarter, teamMap)

      // If current quarter has no rocks, check the planning quarter (next quarter)
      // This handles the case where users plan ahead for the next quarter
      let displayQuarter = currentQuarter
      let quarterlyGoals = currentQuarterGoals
      let rocks = currentQuarterRocks

      if (currentQuarterRocks.length === 0) {
        const planningQuarterRocks = await loadRocks(bId, planningQuarter, teamMap)
        if (planningQuarterRocks.length > 0) {
          displayQuarter = planningQuarter
          rocks = planningQuarterRocks
          quarterlyGoals = await loadQuarterlyGoals(bId, planningQuarter)
        }
      }

      // Calculate smart data
      const rocksNeedingAttention = rocks.filter(
        r => r.status === 'at_risk' || (r.status === 'not_started' && r.progressPercentage === 0)
      )
      const rocksOnTrack = rocks.filter(
        r => r.status === 'on_track' || r.status === 'completed'
      )

      // Generate insight and actions
      const insight = generateInsight(rocks, quarterDaysRemaining, weeklyGoals)
      const suggestedActions = generateSuggestedActions(rocks, weeklyGoals, quarterDaysRemaining)

      // Calculate progress estimates (simplified - would need actual YTD data for real implementation)
      const now = new Date()
      const fy = getCurrentFiscalYear(ysm)
      const fyStart = getFiscalYearStartDate(fy, ysm)
      const totalFYDays = daysBetween(fyStart, getFYEndDate())
      const elapsedFYDays = daysBetween(fyStart, now)
      const annualProgress = Math.round((elapsedFYDays / totalFYDays) * 100)

      const quarterStart = getQuarterStartDate(displayQuarter)
      const totalQuarterDays = daysBetween(quarterStart, getQuarterEndDate())
      const elapsedQuarterDays = daysBetween(quarterStart, now)
      const quarterlyProgress = Math.round((elapsedQuarterDays / totalQuarterDays) * 100)

      setData({
        annualGoals,
        quarterlyGoals,
        currentQuarter: displayQuarter,
        rocks,
        weeklyGoals,
        insight,
        suggestedActions,
        quarterDaysRemaining,
        yearDaysRemaining,
        annualProgress,
        quarterlyProgress,
        rocksNeedingAttention,
        rocksOnTrack,
        isShowingPlanningQuarter: displayQuarter !== currentQuarter
      })

      setIsLoading(false)
    } catch (err) {
      setError({
        type: 'network',
        message: 'Failed to load dashboard data',
        details: err instanceof Error ? err.message : 'Unknown error'
      })
      setIsLoading(false)
    }
  }, [supabase, buildTeamMembersMap, loadAnnualGoals, loadQuarterlyGoals, loadRocks, loadWeeklyGoals, activeBusiness?.id, cachedProfileId, contextLoading, currentUser?.role])

  useEffect(() => {
    loadDashboardData()
  }, [loadDashboardData])

  return {
    data,
    isLoading,
    error,
    businessId,
    userId,
    refresh: loadDashboardData
  }
}

/**
 * Get the start date of a quarter
 */
function getQuarterStartDate(quarter: 'q1' | 'q2' | 'q3' | 'q4'): Date {
  const qNum = parseInt(quarter.charAt(1))
  const defs = getQuarterDefs(ysm)
  const def = defs[qNum - 1]
  const fy = getCurrentFiscalYear(ysm)
  // Determine the calendar year for this quarter's start month
  const startCalYear = def.startMonth >= ysm
    ? (ysm === 1 ? fy : fy - 1)
    : fy
  return new Date(startCalYear, def.startMonth - 1, 1)
}
