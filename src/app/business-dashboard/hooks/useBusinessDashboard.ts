'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBusinessContext } from '@/contexts/BusinessContext'
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
  const { activeBusiness } = useBusinessContext()
  const [mounted, setMounted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

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

  // Load data on mount
  useEffect(() => {
    setMounted(true)
    loadData()
  }, [])

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
      loadCurrentWeekSnapshot()
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

      // Determine which business to load:
      // 1. If overrideBusinessId is provided (explicit), use it (assumed to be business_profiles.id)
      // 2. If activeBusiness is set (coach viewing client), look up business_profiles.id
      // 3. Otherwise, load user's own business profile
      //
      // IMPORTANT: Dashboard data (financial goals, KPIs, snapshots) uses business_profiles.id
      // But activeBusiness.id is businesses.id - we must look up the correct profile ID
      let bizId: string

      if (overrideBusinessId) {
        bizId = overrideBusinessId
      } else if (activeBusiness?.id) {
        // Coach view: activeBusiness.id is businesses.id
        // Need to get the corresponding business_profiles.id
        const { data: profile } = await supabase
          .from('business_profiles')
          .select('id')
          .eq('business_id', activeBusiness.id)
          .single()

        if (profile?.id) {
          bizId = profile.id
        } else {
          console.warn('[BusinessDashboard] No business_profiles found for businesses.id:', activeBusiness.id)
          bizId = activeBusiness.id // Fallback
        }
      } else {
        const { data: profile } = await supabase
          .from('business_profiles')
          .select('id, industry')
          .eq('user_id', user.id)
          .single()
        bizId = profile?.id || user.id
      }

      setBusinessId(bizId)

      // Load targets
      const {
        financialData: loadedFinancial,
        coreMetrics: loadedCore,
        yearType: loadedYearType
      } = await FinancialService.loadFinancialGoals(bizId)
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
    await WeeklyMetricsService.saveSnapshot(updatedSnapshot)
  }, [currentSnapshot])

  // Update past snapshot
  const updatePastSnapshot = useCallback(async (snapshot: WeeklyMetricsSnapshot | null, updates: Partial<WeeklyMetricsSnapshot>) => {
    if (!snapshot) return

    const updatedSnapshot = { ...snapshot, ...updates }
    setSnapshots(prev => prev.map(s =>
      s.week_ending_date === snapshot.week_ending_date ? updatedSnapshot : s
    ))
    await WeeklyMetricsService.saveSnapshot(updatedSnapshot)
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

  // Get trend status
  const getTrendStatus = useCallback((actual: number, target: number, percentComplete: number): 'ahead' | 'on-track' | 'behind' => {
    if (target === 0) return 'on-track'

    const expectedAtThisPoint = (target * percentComplete) / 100
    const percentOfExpected = (actual / expectedAtThisPoint) * 100

    if (percentOfExpected >= 95) return 'ahead'
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
    return `$${value.toLocaleString()}`
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
