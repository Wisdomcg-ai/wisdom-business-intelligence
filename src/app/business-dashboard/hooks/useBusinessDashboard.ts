'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'

/**
 * Pace verdict for a metric against its target.
 *
 * 'unknown' is load-bearing, not a nicety: it is what the dashboard shows when a
 * metric cannot be judged (no target, period not started, data failed to load).
 * Before PRES-06 those cases all collapsed into a green badge. Consumers MUST
 * render it as a neutral, non-committal state — never green, never red.
 */
export type TrendStatus = 'ahead' | 'on-track' | 'behind' | 'unknown'
import { createClient } from '@/lib/supabase/client'
import { useBusinessContext } from '@/contexts/BusinessContext'
import { resolveBusinessId } from '@/lib/business/resolveBusinessId'
import { resolveBusinessProfileId } from '@/lib/business/resolveBusinessProfileIds'
import WeeklyMetricsService, { WeeklyMetricsSnapshot } from '../services/weekly-metrics-service'
import DashboardPreferencesService, { DashboardPreferences } from '../services/dashboard-preferences-service'
import { FinancialService } from '../../goals/services/financial-service'
import { KPIService } from '../../goals/services/kpi-service'
import type { FinancialData, CoreMetricsData, KPIData, YearType } from '../../goals/types'
import { calculateQuarters, determinePlanYear } from '../../goals/utils/quarters'
import { parseDollarInput } from '../../goals/utils/formatting'

export interface QuarterColumn {
  type: 'quarter-collapsed' | 'quarter-header' | 'week'
  quarterKey?: string
  quarterLabel?: string
  quarterDateRange?: string
  date?: string
  snapshot?: WeeklyMetricsSnapshot | null
  isCurrentWeek?: boolean
  quarterSnapshots?: WeeklyMetricsSnapshot[]
  isFirstWeekInQuarter?: boolean
}

export interface QuarterInfo {
  id: string
  label: string
  months: string
  startDate: Date
  endDate: Date
  isCurrent: boolean
  isPast: boolean
}

export function useBusinessDashboard(overrideBusinessId?: string) {
  const supabase = createClient()
  const { activeBusiness, currentUser, businessProfileId: cachedProfileId, isLoading: isContextLoading } = useBusinessContext()
  const [mounted, setMounted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  // PRES-05: the dashboard had NO error state. A failed load left every target
  // at its initial 0, and getTrendStatus() maps a 0 target to a green badge —
  // so a total load failure rendered as a full board of "On Track". Surfacing
  // the failure is the only honest option: we cannot know the numbers.
  const [loadError, setLoadError] = useState<string | null>(null)

  const [businessId, setBusinessId] = useState('')
  const [userId, setUserId] = useState('')

  // Fiscal year settings
  const [yearType, setYearType] = useState<YearType>('CY')
  const [planYear, setPlanYear] = useState<number>(new Date().getFullYear())

  // Week preference: 'ending' (Friday) or 'beginning' (Monday)
  const [weekPreference, setWeekPreference] = useState<'ending' | 'beginning'>('ending')

  // All snapshots for the current year
  const [snapshots, setSnapshots] = useState<WeeklyMetricsSnapshot[]>([])
  const [currentSnapshot, setCurrentSnapshot] = useState<WeeklyMetricsSnapshot | null>(null)

  // Expanded quarters state
  const [expandedQuarters, setExpandedQuarters] = useState<string[]>([])

  // Past weeks editing lock state
  const [pastWeeksUnlocked, setPastWeeksUnlocked] = useState(false)

  // View mode: 'quarter' or 'year'
  const [viewMode, setViewMode] = useState<'quarter' | 'year'>('quarter')

  // Dashboard preferences
  const [dashboardPreferences, setDashboardPreferences] = useState<DashboardPreferences | null>(null)
  const [isManageMetricsOpen, setIsManageMetricsOpen] = useState(false)

  // Goals/Targets
  const [financialData, setFinancialData] = useState<FinancialData | null>(null)
  const [coreMetrics, setCoreMetrics] = useState<CoreMetricsData | null>(null)
  const [kpis, setKpis] = useState<KPIData[]>([])

  // Ref for current week column
  const currentWeekRef = useRef<HTMLTableCellElement>(null)

  // Load data on mount - wait for BusinessContext to finish loading first
  useEffect(() => {
    setMounted(true)
    if (isContextLoading) {
      console.log('[BusinessDashboard] Waiting for BusinessContext to load...')
      return
    }
    loadData().catch(console.error)
  }, [isContextLoading])

  // Auto-scroll to current week when data loads
  useEffect(() => {
    if (!isLoading && currentWeekRef.current) {
      setTimeout(() => {
        currentWeekRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center'
        })
      }, 100)
    }
  }, [isLoading])

  // Reload data when week preference changes
  useEffect(() => {
    if (mounted && businessId && userId) {
      loadCurrentWeekSnapshot().catch(console.error)
    }
  }, [weekPreference, mounted, businessId, userId])

  const loadData = async () => {
    try {
      setIsLoading(true)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setIsLoading(false)
        return
      }

      const uid = user.id
      setUserId(uid)

      // Business-profile resolution via shared helper. Resolver returns
      // businesses.id; we translate to business_profiles.id because this
      // hook's downstream queries key on business_profiles.id.
      let bizId: string | null = null

      if (overrideBusinessId) {
        // overrideBusinessId is a businesses.id (the coach `/coach/clients/[id]` route param).
        // Translate it to the canonical business_profiles.id — every downstream query here
        // (business_kpis, business_financial_goals, weekly_metrics_snapshots) is profile-keyed.
        // Do NOT fall back to the raw businesses.id: that re-introduces the wrong namespace and
        // misses every row. null → the empty-state guard below (Phase 74 R-2).
        bizId = await resolveBusinessProfileId(supabase, overrideBusinessId)
      } else if (cachedProfileId) {
        bizId = cachedProfileId
      } else {
        const resolved = await resolveBusinessId(supabase, {
          userId: user.id,
          role: currentUser?.role ?? null,
          activeBusinessId: activeBusiness?.id ?? null,
        })
        if (resolved.businessId) {
          const { data: profile } = await supabase
            .from('business_profiles')
            .select('id, industry')
            .eq('business_id', resolved.businessId)
            .single()
          bizId = profile?.id ?? resolved.businessId
        }
      }

      if (!bizId) {
        // Coach/admin without an active client, or client without a profile yet.
        setIsLoading(false)
        return
      }

      setBusinessId(bizId)
      setLoadError(null)

      // Load targets
      // PRES-05: FinancialService.loadFinancialGoals NEVER THROWS — it swallows
      // its own failures and reports them in an `error` field (financial-service.ts:289-300),
      // returning financialData: null alongside it. The hook used to discard that
      // field, so an RLS denial or a PostgREST 5xx was indistinguishable from
      // "this business has not set targets yet": both produced null targets,
      // which the badge classifier then rendered as a full board of green.
      // A try/catch around this call would NOT have caught it.
      const {
        financialData: loadedFinancial,
        coreMetrics: loadedCore,
        yearType: loadedYearType,
        error: targetsError
      } = await FinancialService.loadFinancialGoals(bizId)
      if (targetsError) {
        setLoadError(targetsError)
        setIsLoading(false)
        return
      }
      const loadedKPIs = await KPIService.getUserKPIs(bizId)

      setFinancialData(loadedFinancial)
      setCoreMetrics(loadedCore)
      setKpis(loadedKPIs)

      // Load dashboard preferences
      const { preferences } = await DashboardPreferencesService.loadPreferences(bizId, uid)
      setDashboardPreferences(preferences)

      // Set year type
      const actualYearType = loadedYearType || 'FY'
      setYearType(actualYearType)

      const correctPlanYear = determinePlanYear(actualYearType)
      setPlanYear(correctPlanYear)

      // Load snapshots
      const yearSnapshots = await WeeklyMetricsService.getRecentSnapshots(bizId, 52)
      setSnapshots(yearSnapshots)

      // Get current week snapshot
      const currentWeekDate = weekPreference === 'ending'
        ? WeeklyMetricsService.getWeekEnding()
        : WeeklyMetricsService.getWeekBeginning()
      const { snapshot: current } = await WeeklyMetricsService.getOrCreateSnapshot(
        bizId,
        uid,
        currentWeekDate
      )

      setCurrentSnapshot(current)
      setIsLoading(false)
    } catch (err) {
      console.error('Error loading data:', err)
      setLoadError(err instanceof Error ? err.message : 'Failed to load dashboard data')
      setIsLoading(false)
    }
  }

  const loadCurrentWeekSnapshot = async () => {
    try {
      const currentWeekDate = weekPreference === 'ending'
        ? WeeklyMetricsService.getWeekEnding()
        : WeeklyMetricsService.getWeekBeginning()

      const { snapshot: current } = await WeeklyMetricsService.getOrCreateSnapshot(
        businessId,
        userId,
        currentWeekDate
      )

      setCurrentSnapshot(current)
    } catch (err) {
      console.error('Error loading current week snapshot:', err)
    }
  }

  // Update current snapshot
  const updateCurrentSnapshot = useCallback(async (updates: Partial<WeeklyMetricsSnapshot>) => {
    if (!currentSnapshot) return

    const updatedSnapshot = { ...currentSnapshot, ...updates }
    setCurrentSnapshot(updatedSnapshot)
    try {
      const result = await WeeklyMetricsService.saveSnapshot(updatedSnapshot)
      if (result && !result.success) {
        console.error('[Dashboard] Snapshot save failed:', result.error)
      }
    } catch (err) {
      console.error('[Dashboard] Snapshot save error:', err)
    }
  }, [currentSnapshot])

  // Update past snapshot
  const updatePastSnapshot = useCallback(async (snapshot: WeeklyMetricsSnapshot | null, updates: Partial<WeeklyMetricsSnapshot>) => {
    if (!snapshot) return

    const updatedSnapshot = { ...snapshot, ...updates }
    setSnapshots(prev => prev.map(s =>
      s.week_ending_date === snapshot.week_ending_date ? updatedSnapshot : s
    ))
    try {
      const result = await WeeklyMetricsService.saveSnapshot(updatedSnapshot)
      if (result && !result.success) {
        console.error('[Dashboard] Past snapshot save failed:', result.error)
      }
    } catch (err) {
      console.error('[Dashboard] Past snapshot save error:', err)
    }
  }, [])

  // Toggle quarter expansion
  const toggleQuarter = useCallback((quarterKey: string) => {
    setExpandedQuarters(prev =>
      prev.includes(quarterKey)
        ? prev.filter(q => q !== quarterKey)
        : [...prev, quarterKey]
    )
  }, [])

  // Check if week is editable
  const isWeekEditable = useCallback((isCurrentWeek: boolean, weekDate?: string): boolean => {
    if (isCurrentWeek) return true
    if (!weekDate) return false

    const currentWeekDate = weekPreference === 'ending'
      ? WeeklyMetricsService.getWeekEnding()
      : WeeklyMetricsService.getWeekBeginning()

    const isPastWeek = weekDate < currentWeekDate
    return isPastWeek && pastWeeksUnlocked
  }, [weekPreference, pastWeeksUnlocked])

  // Calculate QTD
  const calculateQTD = useCallback((quarterSnapshots: WeeklyMetricsSnapshot[], metricKey: keyof WeeklyMetricsSnapshot): number => {
    return quarterSnapshots.reduce((sum, snapshot) => {
      const value = snapshot[metricKey]
      return sum + (typeof value === 'number' ? value : 0)
    }, 0)
  }, [])

  // Calculate KPI QTD
  const calculateKpiQTD = useCallback((quarterSnapshots: WeeklyMetricsSnapshot[], kpiId: string): number => {
    return quarterSnapshots.reduce((sum, snapshot) => {
      const value = snapshot.kpi_actuals?.[kpiId]
      return sum + (typeof value === 'number' ? value : 0)
    }, 0)
  }, [])

  // Get quarter progress
  const getQuarterProgress = useCallback((quarterInfo: QuarterInfo | null) => {
    if (!quarterInfo) return { currentWeek: 0, totalWeeks: 0, percentComplete: 0 }

    const currentWeekDate = weekPreference === 'ending'
      ? WeeklyMetricsService.getWeekEnding()
      : WeeklyMetricsService.getWeekBeginning()

    const allWeeks = WeeklyMetricsService.getWeeksInRange(
      quarterInfo.startDate,
      quarterInfo.endDate,
      weekPreference
    )

    const totalWeeks = allWeeks.length
    const completedWeeks = allWeeks.filter(week => week <= currentWeekDate).length
    const percentComplete = totalWeeks > 0 ? Math.round((completedWeeks / totalWeeks) * 100) : 0

    return { currentWeek: completedWeeks, totalWeeks, percentComplete }
  }, [weekPreference])

  /**
   * Pace verdict for a metric. PRES-06 — this had three separate fail-open paths,
   * every one of which resolved to a reassuring badge:
   *
   *  1. `target === 0` returned 'on-track'. No target set is not "on track" — it
   *     is unjudgeable. Combined with PRES-05 (a failed load leaves targets at 0)
   *     this is what turned a total load failure into a full board of green.
   *  2. `percentComplete === 0` (quarter not started, or getQuarterProgress fell
   *     back to zeros because quarterInfo was null) made expectedAtThisPoint 0, so
   *     `actual / 0` was Infinity -> 'ahead' for any activity at all, and NaN ->
   *     'behind' for none. A missing quarter produced a confident verdict either way.
   *  3. 'ahead' was awarded from 95% of expected pace — i.e. a business 5% BEHIND
   *     plan was shown a green "Ahead" badge with an up arrow.
   *
   * Now: you are 'ahead' only at or above the pace you are meant to be at, and an
   * unjudgeable metric says so instead of guessing. The 85% 'on-track' floor is
   * unchanged — that band is a coaching judgement, not a defect, so it is left
   * exactly as it was.
   */
  const getTrendStatus = useCallback((actual: number, target: number, percentComplete: number): TrendStatus => {
    // No target, or a period that has not started — nothing to measure against.
    if (target <= 0) return 'unknown'
    if (percentComplete <= 0) return 'unknown'

    const expectedAtThisPoint = (target * percentComplete) / 100
    if (expectedAtThisPoint <= 0) return 'unknown'

    const percentOfExpected = (actual / expectedAtThisPoint) * 100
    if (!Number.isFinite(percentOfExpected)) return 'unknown'

    if (percentOfExpected >= 100) return 'ahead'
    if (percentOfExpected >= 85) return 'on-track'
    return 'behind'
  }, [])

  // Save preferences
  const savePreferences = useCallback(async (preferences: DashboardPreferences) => {
    const result = await DashboardPreferencesService.savePreferences(preferences)
    if (result.success) {
      setDashboardPreferences(preferences)
    }
  }, [])

  // Handle KPI creation
  const handleKpiCreated = useCallback(async () => {
    const loadedKPIs = await KPIService.getUserKPIs(businessId)
    setKpis(loadedKPIs)
  }, [businessId])

  // Memoized quarter infos
  const allQuarterInfos = useMemo(() =>
    calculateQuarters(yearType, planYear) as QuarterInfo[],
    [yearType, planYear]
  )

  // Filtered quarters based on view mode
  const quarterInfos = useMemo(() =>
    viewMode === 'quarter'
      ? allQuarterInfos.filter(q => q.isCurrent)
      : allQuarterInfos.filter(q => q.isPast || q.isCurrent),
    [allQuarterInfos, viewMode]
  )

  // Current quarter info
  const currentQuarterInfo = useMemo(() =>
    quarterInfos.find(q => q.isCurrent) || null,
    [quarterInfos]
  )

  const currentQuarter = currentQuarterInfo ? parseInt(currentQuarterInfo.id.substring(1)) : 1

  // Build columns
  const columns = useMemo((): QuarterColumn[] => {
    const cols: QuarterColumn[] = []
    const calculatedCurrentWeekDate = weekPreference === 'ending'
      ? WeeklyMetricsService.getWeekEnding()
      : WeeklyMetricsService.getWeekBeginning()

    const quarters = quarterInfos.map((q, idx) => ({
      quarter: idx + 1,
      year: q.startDate.getFullYear(),
      quarterInfo: q
    }))

    quarters.forEach(({ quarter, year, quarterInfo }) => {
      const quarterKey = `${year}-Q${quarter}`
      const isCurrentQuarter = quarterInfo.isCurrent
      const isExpanded = expandedQuarters.includes(quarterKey)

      const quarterStart = quarterInfo.startDate
      const quarterEnd = quarterInfo.endDate

      let quarterWeekDates = WeeklyMetricsService.getWeeksInRange(quarterStart, quarterEnd, weekPreference)

      if (isCurrentQuarter && !quarterWeekDates.includes(calculatedCurrentWeekDate)) {
        quarterWeekDates = [...quarterWeekDates, calculatedCurrentWeekDate].sort()
      }

      const quarterSnapshots = quarterWeekDates
        .map(date => snapshots.find(s => s.week_ending_date === date) || null)
        .filter(Boolean) as WeeklyMetricsSnapshot[]

      if (isExpanded || isCurrentQuarter) {
        if (!isCurrentQuarter) {
          cols.push({
            type: 'quarter-header',
            quarterKey,
            quarterLabel: quarterInfo.label,
            quarterDateRange: quarterInfo.months,
          })
        }

        quarterWeekDates.forEach((date, idx) => {
          const snapshot = snapshots.find(s => s.week_ending_date === date) || null
          const isCurrentWeek = isCurrentQuarter && date === calculatedCurrentWeekDate

          cols.push({
            type: 'week',
            date,
            snapshot: isCurrentWeek ? currentSnapshot : snapshot,
            isCurrentWeek,
            quarterKey,
            isFirstWeekInQuarter: idx === 0,
          })
        })
      } else {
        cols.push({
          type: 'quarter-collapsed',
          quarterKey,
          quarterLabel: quarterInfo.label,
          quarterDateRange: quarterInfo.months,
          quarterSnapshots,
        })
      }
    })

    return cols
  }, [quarterInfos, expandedQuarters, weekPreference, snapshots, currentSnapshot])

  // Format functions
  const formatCurrency = useCallback((value: number | undefined | null) => {
    if (!value && value !== 0) return ''
    const formatted = `$${Math.abs(value).toLocaleString()}`
    return value < 0 ? `(${formatted})` : formatted
  }, [])

  const formatNumber = useCallback((value: number | undefined | null) => {
    if (!value && value !== 0) return ''
    return value.toLocaleString()
  }, [])

  const formatDate = useCallback((dateString: string) => {
    if (!dateString) return ''
    const [year, month, day] = dateString.split('-').map(Number)
    const date = new Date(year, month - 1, day)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }, [])

  return {
    // State
    mounted,
    isLoading,
    businessId,
    userId,
    yearType,
    planYear,
    weekPreference,
    snapshots,
    currentSnapshot,
    expandedQuarters,
    pastWeeksUnlocked,
    viewMode,
    dashboardPreferences,
    isManageMetricsOpen,
    financialData,
    coreMetrics,
    kpis,
    currentWeekRef,

    // Computed
    allQuarterInfos,
    quarterInfos,
    currentQuarterInfo,
    currentQuarter,
    columns,

    // Setters
    setWeekPreference,
    setPastWeeksUnlocked,
    setViewMode,
    setIsManageMetricsOpen,

    // Actions
    updateCurrentSnapshot,
    updatePastSnapshot,
    toggleQuarter,
    savePreferences,
    handleKpiCreated,

    loadError,

    // Utilities
    isWeekEditable,
    calculateQTD,
    calculateKpiQTD,
    getQuarterProgress,
    getTrendStatus,
    formatCurrency,
    formatNumber,
    formatDate,
    parseDollarInput,
  }
}

export default useBusinessDashboard
