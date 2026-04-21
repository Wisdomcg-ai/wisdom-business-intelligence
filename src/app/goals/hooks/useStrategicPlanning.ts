/**
 * Strategic Planning Hook
 * =======================
 *
 * CRITICAL: BUSINESS ID ARCHITECTURE
 * -----------------------------------
 * This application has THREE different ID types that can represent a "business":
 *
 * 1. `user.id` (from Supabase Auth)
 *    - The authenticated user's ID
 *    - Example: '52343ba5-7da0-4d76-8f5f-73f336164aa6'
 *    - USED BY: SWOT analysis data (swot_items table uses this as business_id)
 *
 * 2. `businesses.id` (from businesses table)
 *    - The business entity ID in the multi-tenant system
 *    - Example: '8c8c63b2-bdc4-4115-9375-8d0fd89acc00'
 *    - USED BY: Coach-client relationships, assigned_coach_id
 *
 * 3. `business_profiles.id` (from business_profiles table)
 *    - The business profile ID containing business details
 *    - Example: 'fa0a80e8-e58e-40aa-b34a-8db667d4b221'
 *    - USED BY: ALL strategic planning data (goals, KPIs, initiatives, etc.)
 *
 * IMPORTANT RULES:
 * ----------------
 * - Strategic planning data (financial goals, initiatives, KPIs) is stored using business_profiles.id
 * - SWOT data is stored using user.id (the owner's auth ID)
 * - When loading data for coach view, use businesses.id to find the client,
 *   but use business_profiles.id to load/save the actual planning data
 * - The `ownerUserId` state tracks the original owner's user.id for SWOT queries
 *
 * AUTO-SAVE IMPLEMENTATION:
 * ------------------------
 * - Auto-save is enabled with proper safeguards
 * - isDirty flag tracks when USER makes changes (not when loading data)
 * - isLoadComplete flag prevents save during initial data load
 * - 2-second debounce prevents excessive saves
 * - Empty state guard prevents saving empty data
 * - Manual save button remains as fallback
 *
 * @param overrideBusinessId - Pass a businesses.id when viewing as a coach
 */
'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { FinancialData, CoreMetricsData, KPIData, StrategicInitiative, YearType, MonthlyTargetsData } from '../types'
import { STANDARD_KPIS, INDUSTRY_KPIS } from '../utils/constants'
import { FinancialService } from '../services/financial-service'
import { KPIService } from '../services/kpi-service'
import { StrategicPlanningService } from '../services/strategic-planning-service'
import { OperationalActivitiesService, OperationalActivity } from '../services/operational-activities-service'
import { createClient } from '@/lib/supabase/client'
import { isNearYearEnd, getMonthsUntilYearEnd, DEFAULT_YEAR_START_MONTH, getCurrentFiscalYear, startMonthFromYearType } from '@/lib/utils/fiscal-year-utils'
import { ExtendedPeriodInfo } from '../types'

interface KeyAction {
  id: string
  action: string
  owner?: string
  dueDate?: string
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export function useStrategicPlanning(overrideBusinessId?: string) {
  // Loading & Error States
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [businessId, setBusinessId] = useState<string>('') // business_profiles.id — used for strategic data
  const [businessesId, setBusinessesId] = useState<string>('') // businesses.id — used for FK-constrained tables (business_kpis)
  const [userId, setUserId] = useState<string>('')
  const [ownerUserId, setOwnerUserId] = useState<string>('') // The actual owner's user.id for SWOT queries
  const [industry, setIndustry] = useState<string>('building_construction')
  const supabase = createClient()

  // Auto-save states
  const [isDirty, setIsDirty] = useState(false)
  const [isLoadComplete, setIsLoadComplete] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  // Auto-save refs
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isSavingRef = useRef(false)

  // Mark data as dirty and trigger auto-save
  const markDirty = useCallback(() => {
    if (!isLoadComplete) {
      console.log('[AutoSave] Skipping markDirty - load not complete')
      return
    }
    setIsDirty(true)
  }, [isLoadComplete])

  // Step 1: Financial Data & KPIs - Initialize with empty defaults to prevent hydration mismatch
  const [financialData, setFinancialData] = useState<FinancialData>({
    revenue: { current: 0, year1: 0, year2: 0, year3: 0 },
    grossProfit: { current: 0, year1: 0, year2: 0, year3: 0 },
    grossMargin: { current: 0, year1: 0, year2: 0, year3: 0 },
    netProfit: { current: 0, year1: 0, year2: 0, year3: 0 },
    netMargin: { current: 0, year1: 0, year2: 0, year3: 0 },
    customers: { current: 0, year1: 0, year2: 0, year3: 0 },
    employees: { current: 0, year1: 0, year2: 0, year3: 0 }
  })

  const [coreMetrics, setCoreMetrics] = useState<CoreMetricsData>({
    leadsPerMonth: { current: 0, year1: 0, year2: 0, year3: 0 },
    conversionRate: { current: 0, year1: 0, year2: 0, year3: 0 },
    avgTransactionValue: { current: 0, year1: 0, year2: 0, year3: 0 },
    teamHeadcount: { current: 0, year1: 0, year2: 0, year3: 0 },
    ownerHoursPerWeek: { current: 0, year1: 0, year2: 0, year3: 0 }
  })

  const [kpis, setKpis] = useState<KPIData[]>([])

  const [yearType, setYearType] = useState<YearType>('FY')

  // Extended period state (Phase 14)
  const [isExtendedPeriod, setIsExtendedPeriod] = useState(false)
  const [year1Months, setYear1Months] = useState(12)
  const [currentYearRemainingMonths, setCurrentYearRemainingMonths] = useState(0)
  const [fiscalYearStart, setFiscalYearStart] = useState(DEFAULT_YEAR_START_MONTH)

  // Annual review detection (Phase 15)
  const [hasNextYearAnnualPlan, setHasNextYearAnnualPlan] = useState(false)
  const [annualReviewYear, setAnnualReviewYear] = useState<number | null>(null)

  // Step 2: Strategic Ideas
  const [strategicIdeas, setStrategicIdeas] = useState<StrategicInitiative[]>([])

  // Step 3: Roadmap Suggestions
  const [roadmapSuggestions, setRoadmapSuggestions] = useState<StrategicInitiative[]>([])

  // Step 4: 12-Month Initiatives
  const [twelveMonthInitiatives, setTwelveMonthInitiatives] = useState<StrategicInitiative[]>([])

  // Step 5: Annual Plan by Quarter
  const [annualPlanByQuarter, setAnnualPlanByQuarter] = useState<Record<string, StrategicInitiative[]>>({
    q1: [],
    q2: [],
    q3: [],
    q4: []
  })

  // Step 5: Quarterly Targets
  const [quarterlyTargets, setQuarterlyTargets] = useState<Record<string, { q1: string; q2: string; q3: string; q4: string }>>({})

  // Step 5: Monthly Targets (for 90-day sprint planning)
  const [monthlyTargets, setMonthlyTargets] = useState<MonthlyTargetsData>({})

  // Step 6: 90-Day Sprint
  const [sprintFocus, setSprintFocus] = useState<StrategicInitiative[]>([])
  const [sprintKeyActions, setSprintKeyActions] = useState<KeyAction[]>([])

  // Operational Activities
  const [operationalActivities, setOperationalActivities] = useState<OperationalActivity[]>([])

  // Update financial value with auto-calculation
  const updateFinancialValue = useCallback(
    (metric: keyof FinancialData, period: 'current' | 'year1' | 'year2' | 'year3', value: number, isPercentage?: boolean) => {
      setFinancialData(prev => {
        const newData = {
          ...prev,
          [metric]: {
            ...prev[metric],
            [period]: value
          }
        }

        // Auto-calculate related metrics
        const revenue = metric === 'revenue' ? value : prev.revenue[period]

        if (revenue > 0) {
          // If Gross Margin % changes, calculate Gross Profit $
          if (metric === 'grossMargin') {
            newData.grossProfit = {
              ...newData.grossProfit,
              [period]: Math.round(revenue * (value / 100))
            }
          }
          // If Gross Profit $ changes, calculate Gross Margin %
          else if (metric === 'grossProfit') {
            newData.grossMargin = {
              ...newData.grossMargin,
              [period]: Math.round((value / revenue) * 100 * 100) / 100 // Round to 2 decimals
            }
          }
          // If Net Margin % changes, calculate Net Profit $
          else if (metric === 'netMargin') {
            newData.netProfit = {
              ...newData.netProfit,
              [period]: Math.round(revenue * (value / 100))
            }
          }
          // If Net Profit $ changes, calculate Net Margin %
          else if (metric === 'netProfit') {
            newData.netMargin = {
              ...newData.netMargin,
              [period]: Math.round((value / revenue) * 100 * 100) / 100 // Round to 2 decimals
            }
          }
          // If Revenue changes, recalculate both Gross Profit and Net Profit based on existing margins
          else if (metric === 'revenue') {
            const grossMarginPercent = prev.grossMargin[period]
            const netMarginPercent = prev.netMargin[period]

            if (grossMarginPercent > 0) {
              newData.grossProfit = {
                ...newData.grossProfit,
                [period]: Math.round(value * (grossMarginPercent / 100))
              }
            }

            if (netMarginPercent > 0) {
              newData.netProfit = {
                ...newData.netProfit,
                [period]: Math.round(value * (netMarginPercent / 100))
              }
            }
          }
        }

        return newData
      })
      markDirty()
    },
    [markDirty]
  )

  // Update core metrics value
  const updateCoreMetric = useCallback(
    (metric: keyof CoreMetricsData, period: 'current' | 'year1' | 'year2' | 'year3', value: number) => {
      setCoreMetrics(prev => ({
        ...prev,
        [metric]: {
          ...prev[metric],
          [period]: value
        }
      }))
      markDirty()
    },
    [markDirty]
  )

  // Update KPI value
  const updateKPIValue = useCallback(
    (kpiId: string, field: 'currentValue' | 'year1Target' | 'year2Target' | 'year3Target', value: number) => {
      console.log(`[Strategic Planning] 📝 updateKPIValue called: kpiId=${kpiId}, field=${field}, value=${value}`)
      setKpis(prev => {
        const updated = prev.map(kpi =>
          kpi.id === kpiId
            ? { ...kpi, [field]: value }
            : kpi
        )
        // Log the updated KPI
        const kpi = updated.find(k => k.id === kpiId)
        console.log(`[Strategic Planning] 📊 KPI after update:`, kpi ? {
          name: kpi.name,
          currentValue: kpi.currentValue,
          year1Target: kpi.year1Target,
          year2Target: kpi.year2Target,
          year3Target: kpi.year3Target
        } : 'NOT FOUND')
        return updated
      })
      markDirty()
    },
    [markDirty]
  )

  // Add KPI
  const addKPI = useCallback((kpi: KPIData) => {
    setKpis(prev => {
      // Check if KPI already exists
      if (prev.some(k => k.id === kpi.id)) {
        return prev
      }
      // Add new KPI with initialized values
      const newKPI = {
        ...kpi,
        currentValue: kpi.currentValue || 0,
        year1Target: kpi.year1Target || 0,
        year2Target: kpi.year2Target || 0,
        year3Target: kpi.year3Target || 0
      }
      return [...prev, newKPI]
    })
    markDirty()
  }, [markDirty])

  // Delete KPI
  const deleteKPI = useCallback((kpiId: string) => {
    setKpis(prev => prev.filter(k => k.id !== kpiId))
    markDirty()
  }, [markDirty])

  // Save via API route (used for coach/admin mode to bypass RLS)
  const saveViaApi = useCallback(async (): Promise<boolean> => {
    try {
      console.log('[Strategic Planning] 💾 Saving via API route (coach mode)...')
      const response = await fetch('/api/goals/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: businessesId || overrideBusinessId,
          profileId: businessId,
          ownerUserId: ownerUserId,
          data: {
            financial: {
              financialData,
              coreMetrics,
              yearType,
              quarterlyTargets,
              extendedPeriod: {
                isExtendedPeriod,
                year1Months,
                currentYearRemainingMonths
              }
            },
            kpis,
            initiatives: {
              strategicIdeas,
              roadmapSuggestions,
              twelveMonthInitiatives,
              current_remainder: annualPlanByQuarter.current_remainder || [],
              q1: annualPlanByQuarter.q1 || [],
              q2: annualPlanByQuarter.q2 || [],
              q3: annualPlanByQuarter.q3 || [],
              q4: annualPlanByQuarter.q4 || [],
              sprintFocus
            },
            sprintKeyActions,
            operationalActivities
          }
        })
      })

      const result = await response.json()
      console.log('[Strategic Planning] 📡 API save result:', result)

      if (!response.ok || !result.success) {
        console.error('[Strategic Planning] ❌ API save failed:', result.errors || result.error)
        return false
      }

      return true
    } catch (err) {
      console.error('[Strategic Planning] ❌ API save error:', err)
      return false
    }
  }, [
    businessId, businessesId, overrideBusinessId, ownerUserId,
    financialData, coreMetrics, yearType, quarterlyTargets,
    isExtendedPeriod, year1Months, currentYearRemainingMonths,
    kpis, strategicIdeas, roadmapSuggestions, twelveMonthInitiatives,
    annualPlanByQuarter, sprintFocus, sprintKeyActions, operationalActivities
  ])

  // Save all data to Supabase with auto-debouncing
  const saveAllData = useCallback(async () => {
    // Guard: prevent concurrent saves
    if (isSavingRef.current) {
      console.log('[AutoSave] Already saving, skipping...')
      return false
    }

    try {
      if (!businessId || !userId) {
        console.log('[Strategic Planning] ⚠️ Cannot save: missing businessId or userId')
        return false
      }

      // CRITICAL: When coach is viewing a client, use the client's owner ID for saves
      const saveUserId = ownerUserId || userId

      // Guard: Don't save empty financial data (prevents data loss)
      if (financialData.revenue.current === 0 &&
          financialData.revenue.year1 === 0 &&
          financialData.revenue.year2 === 0 &&
          financialData.revenue.year3 === 0 &&
          !isLoadComplete) {
        console.log('[AutoSave] Skipping save - empty state guard triggered')
        return false
      }

      isSavingRef.current = true
      setSaveStatus('saving')
      console.log(`[Strategic Planning] 💾 Saving... businessId: ${businessId}, saveUserId: ${saveUserId}, isCoachMode: ${!!overrideBusinessId}`)

      // COACH MODE: Use API route to bypass RLS
      // When overrideBusinessId is set, the current user is a coach/admin viewing
      // a client's data. The browser client's RLS policies may block direct writes,
      // so we route through the API which uses the service role client.
      if (overrideBusinessId) {
        const apiSuccess = await saveViaApi()

        // Also save to localStorage as backup
        if (typeof window !== 'undefined') {
          localStorage.setItem('strategicPlan', JSON.stringify({
            financialData, coreMetrics, kpis, yearType, strategicIdeas,
            roadmapSuggestions, twelveMonthInitiatives, annualPlanByQuarter,
            quarterlyTargets, monthlyTargets, sprintFocus, sprintKeyActions,
            operationalActivities, lastSaved: new Date().toISOString()
          }))
        }

        isSavingRef.current = false

        if (apiSuccess) {
          console.log('[Strategic Planning] ✅ API save successful (coach mode)')
          setSaveStatus('saved')
          setLastSaved(new Date())
          setIsDirty(false)
          return true
        } else {
          console.error('[Strategic Planning] ❌ API save failed (coach mode)')
          setSaveStatus('error')
          return false
        }
      }

      // NORMAL MODE: Direct Supabase calls via services
      console.log(`[Strategic Planning] 💾 Direct save mode (client/owner)`)

      // Save all sections independently
      const saveErrors: string[] = []

      // Save financial data
      const financialResult = await FinancialService.saveFinancialGoals(
        businessId, saveUserId, financialData, yearType, coreMetrics, quarterlyTargets,
        { isExtendedPeriod, year1Months, currentYearRemainingMonths }
      )
      if (!financialResult.success) {
        console.error('[Strategic Planning] ❌ Financial save failed:', financialResult.error)
        saveErrors.push(`Financial: ${financialResult.error}`)
      }

      // Save KPIs — use businesses.id for FK-constrained column
      const kpiBusinessId = businessesId || businessId
      const kpiResult = await KPIService.saveUserKPIs(kpiBusinessId, saveUserId, kpis)
      if (!kpiResult.success) {
        console.error('[Strategic Planning] ❌ KPI save failed:', kpiResult.error)
        saveErrors.push(`KPIs: ${kpiResult.error}`)
      }

      // Save strategic ideas (Step 2)
      const strategicIdeasResult = await StrategicPlanningService.saveInitiatives(businessId, saveUserId, strategicIdeas, 'strategic_ideas')
      if (!strategicIdeasResult.success) saveErrors.push(`Strategic ideas: ${strategicIdeasResult.error}`)

      // Save roadmap suggestions (Step 3)
      const roadmapResult = await StrategicPlanningService.saveInitiatives(businessId, saveUserId, roadmapSuggestions, 'roadmap')
      if (!roadmapResult.success) saveErrors.push(`Roadmap: ${roadmapResult.error}`)

      // Save 12-month initiatives (Step 4)
      const twelveMonthResult = await StrategicPlanningService.saveInitiatives(businessId, saveUserId, twelveMonthInitiatives, 'twelve_month')
      if (!twelveMonthResult.success) saveErrors.push(`12-month: ${twelveMonthResult.error}`)

      // Save quarterly plans (Step 5)
      const q1Result = await StrategicPlanningService.saveInitiatives(businessId, saveUserId, annualPlanByQuarter.q1, 'q1')
      if (!q1Result.success) saveErrors.push(`Q1: ${q1Result.error}`)
      const q2Result = await StrategicPlanningService.saveInitiatives(businessId, saveUserId, annualPlanByQuarter.q2, 'q2')
      if (!q2Result.success) saveErrors.push(`Q2: ${q2Result.error}`)
      const q3Result = await StrategicPlanningService.saveInitiatives(businessId, saveUserId, annualPlanByQuarter.q3, 'q3')
      if (!q3Result.success) saveErrors.push(`Q3: ${q3Result.error}`)
      const q4Result = await StrategicPlanningService.saveInitiatives(businessId, saveUserId, annualPlanByQuarter.q4, 'q4')
      if (!q4Result.success) saveErrors.push(`Q4: ${q4Result.error}`)

      // Save current_remainder (Step 4 - extended period)
      if (annualPlanByQuarter.current_remainder) {
        const crResult = await StrategicPlanningService.saveInitiatives(businessId, saveUserId, annualPlanByQuarter.current_remainder, 'current_remainder')
        if (!crResult.success) saveErrors.push(`Current remainder: ${crResult.error}`)
      }

      // Save sprint focus (Step 6)
      const sprintResult = await StrategicPlanningService.saveInitiatives(businessId, saveUserId, sprintFocus, 'sprint')
      if (!sprintResult.success) saveErrors.push(`Sprint: ${sprintResult.error}`)

      // Save sprint key actions
      const sprintActionsResult = await StrategicPlanningService.saveSprintActions(businessId, saveUserId, sprintKeyActions)
      if (!sprintActionsResult.success) saveErrors.push(`Sprint actions: ${sprintActionsResult.error}`)

      // Save operational activities
      const operationalActivitiesResult = await OperationalActivitiesService.saveActivities(businessId, saveUserId, operationalActivities)
      if (!operationalActivitiesResult.success) saveErrors.push(`Operational activities: ${operationalActivitiesResult.error}`)

      // localStorage backup
      if (typeof window !== 'undefined') {
        localStorage.setItem('strategicPlan', JSON.stringify({
          financialData, coreMetrics, kpis, yearType, strategicIdeas,
          roadmapSuggestions, twelveMonthInitiatives, annualPlanByQuarter,
          quarterlyTargets, monthlyTargets, sprintFocus, sprintKeyActions,
          operationalActivities, lastSaved: new Date().toISOString()
        }))
      }

      isSavingRef.current = false

      if (saveErrors.length > 0) {
        console.error(`[Strategic Planning] ⚠️ ${saveErrors.length} section(s) failed:`, saveErrors)
        setSaveStatus('error')
        return false
      }

      console.log('[Strategic Planning] ✅ Successfully saved all data')
      setSaveStatus('saved')
      setLastSaved(new Date())
      setIsDirty(false)
      return true
    } catch (err) {
      console.error('[Strategic Planning] ❌ Error saving data:', err)
      setError('Failed to save data')
      isSavingRef.current = false
      setSaveStatus('error')
      return false
    }
  }, [
    businessId,
    businessesId,
    userId,
    ownerUserId,
    overrideBusinessId,
    financialData,
    coreMetrics,
    kpis,
    yearType,
    isExtendedPeriod,
    year1Months,
    currentYearRemainingMonths,
    strategicIdeas,
    roadmapSuggestions,
    twelveMonthInitiatives,
    annualPlanByQuarter,
    quarterlyTargets,
    monthlyTargets,
    sprintFocus,
    sprintKeyActions,
    operationalActivities,
    isLoadComplete,
    saveViaApi
  ])

  // Load data from Supabase on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true)

        // Get current user
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          console.log('[Strategic Planning] ⚠️ No user logged in')
          setIsLoading(false)
          return
        }

        setUserId(user.id)

        // IMPORTANT: If overrideBusinessId is undefined, wait for BusinessContext to provide it
        // This prevents team members from loading their own profile instead of the business they're accessing
        // The component should pass activeBusiness.id once BusinessContext finishes loading
        if (overrideBusinessId === undefined) {
          console.log('[Strategic Planning] ⏳ Waiting for business ID from context...')
          setIsLoading(false)
          return
        }

        // If overrideBusinessId is provided (coach viewing client OR team member), use it
        let bizId: string
        let ownerUser: string = user.id
        // Local copy of fiscal year start for extended period detection
        // (useState setters are async so we track it synchronously here)
        let localFiscalYearStart: number = DEFAULT_YEAR_START_MONTH

        if (overrideBusinessId) {
          // Coach view - overrideBusinessId is businesses.id
          // But Goals data is stored with business_profiles.id - we need to look it up!
          console.log(`[Strategic Planning] 🔍 Coach view - overrideBusinessId: ${overrideBusinessId}`)

          // PRIMARY METHOD: Use API route to resolve IDs (bypasses RLS)
          // The browser client may not have SELECT access to business_profiles,
          // so we use a server-side API route with the service role client.
          let foundProfileId: string | null = null
          let foundIndustry: string | null = null

          try {
            const resolveResponse = await fetch(`/api/goals/resolve-business?business_id=${overrideBusinessId}`)
            if (resolveResponse.ok) {
              const resolved = await resolveResponse.json()
              console.log(`[Strategic Planning] ✅ API resolved:`, resolved)

              if (resolved.profileId) {
                foundProfileId = resolved.profileId
              }
              if (resolved.industry) {
                foundIndustry = resolved.industry
              }
              if (resolved.ownerUserId) {
                ownerUser = resolved.ownerUserId
              }
              if (resolved.fiscalYearStart) {
                localFiscalYearStart = resolved.fiscalYearStart
                setFiscalYearStart(resolved.fiscalYearStart)
              }
            } else {
              console.warn(`[Strategic Planning] ⚠️ API resolve failed (${resolveResponse.status}), falling back to client-side lookup`)
            }
          } catch (apiError) {
            console.warn('[Strategic Planning] ⚠️ API resolve unavailable, falling back to client-side lookup')
          }

          // FALLBACK: Client-side lookup if API route failed
          if (!foundProfileId) {
            // Source 1: businesses table
            const { data: business } = await supabase
              .from('businesses')
              .select('owner_id, owner_email, name')
              .eq('id', overrideBusinessId)
              .maybeSingle()

            if (business?.owner_id) {
              ownerUser = business.owner_id
            }

            // Source 2: business_profiles by business_id
            const { data: profileByBizId } = await supabase
              .from('business_profiles')
              .select('id, user_id, industry')
              .eq('business_id', overrideBusinessId)
              .maybeSingle()

            if (profileByBizId?.id) {
              foundProfileId = profileByBizId.id
              foundIndustry = profileByBizId.industry
            }

            // Source 3: business_profiles by owner user_id
            if (!foundProfileId && ownerUser) {
              const { data: profileByUser } = await supabase
                .from('business_profiles')
                .select('id, industry')
                .eq('user_id', ownerUser)
                .maybeSingle()

              if (profileByUser?.id) {
                foundProfileId = profileByUser.id
                foundIndustry = profileByUser.industry
              }
            }
          }

          // Set the business ID and owner
          if (foundProfileId) {
            bizId = foundProfileId
            if (foundIndustry) {
              setIndustry(foundIndustry)
            }
          } else {
            // Last resort fallback
            console.warn(`[Strategic Planning] ⚠️ No business_profiles found, using businesses.id as fallback`)
            bizId = overrideBusinessId
          }

          console.log(`[Strategic Planning] 📥 Coach view - profileId: ${bizId}, owner: ${ownerUser}`)

          // Track the original businesses.id for FK-constrained tables
          setBusinessesId(overrideBusinessId)
        } else {
          // Normal user view - get their business_profile
          // IMPORTANT: Goals data is stored with business_profiles.id as the business_id
          // This is different from businesses.id - do not change this!
          const { data: profile, error: profileError } = await supabase
            .from('business_profiles')
            .select('id, industry, business_id, fiscal_year_start')
            .eq('user_id', user.id)
            .single()

          console.log(`[Strategic Planning] 🔍 User ID: ${user.id}`)
          console.log(`[Strategic Planning] 🔍 Profile query result:`, { profile, profileError: profileError?.message })

          // Never fall back to user.id as a business_profiles.id — it is an
          // auth UUID and would silently write to a non-existent row. If the
          // profile hasn't been created yet, bail out and let the page show
          // an onboarding/empty state.
          if (!profile?.id) {
            console.warn('[Strategic Planning] No business_profiles row for user — aborting load')
            setIsLoading(false)
            return
          }
          bizId = profile.id
          ownerUser = user.id // For SWOT queries, SWOT stores with user.id as business_id

          console.log(`[Strategic Planning] 🔍 Using bizId: ${bizId}, ownerUser: ${ownerUser}`)

          // Track the businesses.id for FK-constrained tables
          if (profile?.business_id) {
            setBusinessesId(profile.business_id)
          }

          // Set industry from profile, fallback to default
          if (profile?.industry) {
            setIndustry(profile.industry)
            console.log(`[Strategic Planning] ✅ Loaded industry: ${profile.industry}`)
          }
          if (profile?.fiscal_year_start) {
            localFiscalYearStart = profile.fiscal_year_start
            setFiscalYearStart(profile.fiscal_year_start)
          }
        }

        setBusinessId(bizId)
        setOwnerUserId(ownerUser)

        console.log(`[Strategic Planning] 📥 Loading data for business: ${bizId}`)

        // Load financial data, core metrics, and quarterly targets from Supabase
        const {
          financialData: loadedFinancialData,
          coreMetrics: loadedCoreMetrics,
          yearType: loadedYearType,
          quarterlyTargets: loadedQuarterlyTargets,
          extendedPeriod: loadedExtendedPeriod
        } = await FinancialService.loadFinancialGoals(bizId)

        // Load KPIs from Supabase
        // business_kpis.business_id references businesses(id), so try that first
        // Then fall back to business_profiles.id for legacy data
        const kpiBizId = overrideBusinessId || bizId
        let loadedKPIs = await KPIService.getUserKPIs(kpiBizId)
        if (loadedKPIs.length === 0 && kpiBizId !== bizId) {
          console.log(`[Strategic Planning] 🔄 No KPIs found with businesses.id, trying business_profiles.id`)
          loadedKPIs = await KPIService.getUserKPIs(bizId)
        }

        // ── Extended Period Detection (Phase 14) ────────────────────
        // Use localFiscalYearStart (synchronously set above) rather than
        // the useState value (which is async and may not have updated yet).
        const effectiveYearStart = localFiscalYearStart

        // Track detected state locally (useState is async)
        let detectedExtended = false

        if (loadedExtendedPeriod?.isExtendedPeriod) {
          // Returning user — restore saved extended period state
          console.log('[Strategic Planning] Restoring saved extended period:', loadedExtendedPeriod)
          setIsExtendedPeriod(true)
          setYear1Months(loadedExtendedPeriod.year1Months)
          setCurrentYearRemainingMonths(loadedExtendedPeriod.currentYearRemainingMonths)
          detectedExtended = true
        } else if (ownerUser === user.id && !loadedFinancialData) {
          // First-time user (client's own view only, not coach viewing) — check if near year end
          const nearEnd = isNearYearEnd(new Date(), effectiveYearStart)
          if (nearEnd) {
            const monthsLeft = getMonthsUntilYearEnd(new Date(), effectiveYearStart)
            console.log(`[Strategic Planning] First-time client near year end — ${monthsLeft} months remaining, activating extended period`)
            setIsExtendedPeriod(true)
            setCurrentYearRemainingMonths(monthsLeft)
            setYear1Months(monthsLeft + 12)
            detectedExtended = true
          }
        }
        // ── End Extended Period Detection ────────────────────────────

        // Set loaded data or defaults
        if (loadedFinancialData) {
          setFinancialData(loadedFinancialData)
          setYearType(loadedYearType)
          console.log('[Strategic Planning] ✅ Loaded financial data from Supabase')
        }

        if (loadedCoreMetrics) {
          setCoreMetrics(loadedCoreMetrics)
          console.log('[Strategic Planning] ✅ Loaded core metrics from Supabase')
        }

        if (loadedQuarterlyTargets && Object.keys(loadedQuarterlyTargets).length > 0) {
          setQuarterlyTargets(loadedQuarterlyTargets)
          console.log(`[Strategic Planning] ✅ Loaded quarterly targets from Supabase`)
        }

        if (loadedKPIs && loadedKPIs.length > 0) {
          setKpis(loadedKPIs)
          console.log(`[Strategic Planning] ✅ Loaded ${loadedKPIs.length} KPIs from Supabase`)
        }

        // Load strategic planning data from Supabase (Steps 2-6)
        // IMPORTANT: Try multiple possible business IDs if the primary one returns empty
        // This handles legacy data that may have been saved under user.id instead of profile.id
        const fallbackIds = [bizId]
        if (user.id !== bizId) fallbackIds.push(user.id)

        console.log(`[Strategic Planning] 🔍 Will try loading from IDs:`, fallbackIds)

        // Step 2: Strategic Ideas - try primary ID, fallback to user.id if empty
        let loadedStrategicIdeas = await StrategicPlanningService.loadInitiatives(bizId, 'strategic_ideas')
        if (loadedStrategicIdeas.length === 0 && user.id !== bizId) {
          console.log(`[Strategic Planning] 🔄 No strategic ideas found with bizId, trying user.id: ${user.id}`)
          loadedStrategicIdeas = await StrategicPlanningService.loadInitiatives(user.id, 'strategic_ideas')
        }
        if (loadedStrategicIdeas && loadedStrategicIdeas.length > 0) {
          setStrategicIdeas(loadedStrategicIdeas)
          console.log(`[Strategic Planning] ✅ Loaded ${loadedStrategicIdeas.length} strategic ideas from Supabase`)
        }

        // Step 3: Roadmap Suggestions - with fallback
        let loadedRoadmap = await StrategicPlanningService.loadInitiatives(bizId, 'roadmap')
        if (loadedRoadmap.length === 0 && user.id !== bizId) {
          loadedRoadmap = await StrategicPlanningService.loadInitiatives(user.id, 'roadmap')
        }
        if (loadedRoadmap && loadedRoadmap.length > 0) {
          setRoadmapSuggestions(loadedRoadmap)
          console.log(`[Strategic Planning] ✅ Loaded ${loadedRoadmap.length} roadmap suggestions from Supabase`)
        }

        // Step 4: 12-Month Initiatives - with fallback
        let loadedTwelveMonth = await StrategicPlanningService.loadInitiatives(bizId, 'twelve_month')
        if (loadedTwelveMonth.length === 0 && user.id !== bizId) {
          loadedTwelveMonth = await StrategicPlanningService.loadInitiatives(user.id, 'twelve_month')
        }
        if (loadedTwelveMonth && loadedTwelveMonth.length > 0) {
          setTwelveMonthInitiatives(loadedTwelveMonth)
          console.log(`[Strategic Planning] ✅ Loaded ${loadedTwelveMonth.length} twelve-month initiatives from Supabase`)
        }

        // Step 5: Annual Plan by Quarter - with fallback for each
        let loadedQ1 = await StrategicPlanningService.loadInitiatives(bizId, 'q1')
        let loadedQ2 = await StrategicPlanningService.loadInitiatives(bizId, 'q2')
        let loadedQ3 = await StrategicPlanningService.loadInitiatives(bizId, 'q3')
        let loadedQ4 = await StrategicPlanningService.loadInitiatives(bizId, 'q4')

        // Fallback to user.id for quarterly data if primary returns empty
        if (user.id !== bizId) {
          if (loadedQ1.length === 0) loadedQ1 = await StrategicPlanningService.loadInitiatives(user.id, 'q1')
          if (loadedQ2.length === 0) loadedQ2 = await StrategicPlanningService.loadInitiatives(user.id, 'q2')
          if (loadedQ3.length === 0) loadedQ3 = await StrategicPlanningService.loadInitiatives(user.id, 'q3')
          if (loadedQ4.length === 0) loadedQ4 = await StrategicPlanningService.loadInitiatives(user.id, 'q4')
        }

        console.log('[Strategic Planning] 🔍 Q2 loaded from database:', loadedQ2.map(i => ({ id: i.id, title: i.title, assignedTo: i.assignedTo })))

        // Load current_remainder initiatives (extended period)
        let loadedCurrentRemainder = await StrategicPlanningService.loadInitiatives(bizId, 'current_remainder')
        if (loadedCurrentRemainder.length === 0 && user.id !== bizId) {
          loadedCurrentRemainder = await StrategicPlanningService.loadInitiatives(user.id, 'current_remainder')
        }

        setAnnualPlanByQuarter({
          ...(loadedCurrentRemainder.length > 0 || detectedExtended ? { current_remainder: loadedCurrentRemainder || [] } : {}),
          q1: loadedQ1 || [],
          q2: loadedQ2 || [],
          q3: loadedQ3 || [],
          q4: loadedQ4 || []
        })
        console.log(`[Strategic Planning] ✅ Loaded quarterly plans from Supabase (Q1: ${loadedQ1.length}, Q2: ${loadedQ2.length}, Q3: ${loadedQ3.length}, Q4: ${loadedQ4.length})`)

        // Step 6: 90-Day Sprint - with fallback
        let loadedSprintFocus = await StrategicPlanningService.loadInitiatives(bizId, 'sprint')
        if (loadedSprintFocus.length === 0 && user.id !== bizId) {
          loadedSprintFocus = await StrategicPlanningService.loadInitiatives(user.id, 'sprint')
        }
        if (loadedSprintFocus && loadedSprintFocus.length > 0) {
          setSprintFocus(loadedSprintFocus)
          console.log(`[Strategic Planning] ✅ Loaded ${loadedSprintFocus.length} sprint focus items from Supabase`)
        }

        let loadedSprintActions = await StrategicPlanningService.loadSprintActions(bizId)
        if (loadedSprintActions.length === 0 && user.id !== bizId) {
          loadedSprintActions = await StrategicPlanningService.loadSprintActions(user.id)
        }
        if (loadedSprintActions && loadedSprintActions.length > 0) {
          setSprintKeyActions(loadedSprintActions)
          console.log(`[Strategic Planning] ✅ Loaded ${loadedSprintActions.length} sprint key actions from Supabase`)
        }

        // Load operational activities - with fallback
        let loadedOperationalActivities = await OperationalActivitiesService.loadActivities(bizId)
        if (loadedOperationalActivities.length === 0 && user.id !== bizId) {
          loadedOperationalActivities = await OperationalActivitiesService.loadActivities(user.id)
        }
        if (loadedOperationalActivities && loadedOperationalActivities.length > 0) {
          setOperationalActivities(loadedOperationalActivities)
          console.log(`[Strategic Planning] ✅ Loaded ${loadedOperationalActivities.length} operational activities from Supabase`)
        }

        setIsLoading(false)
        // Mark that initial load is complete - auto-save can now run
        // Use a small delay to ensure all state updates have settled
        setTimeout(() => {
          setIsLoadComplete(true)
          console.log('[AutoSave] Load complete - auto-save now enabled')
        }, 500)
      } catch (err) {
        console.error('[Strategic Planning] ❌ Error loading data:', err)
        setError('Failed to load saved data')
        setIsLoading(false)
      }
    }

    loadData()
  }, [supabase, overrideBusinessId])

  // Auto-save effect - triggers when isDirty is true
  useEffect(() => {
    // Only auto-save if:
    // 1. Load is complete (prevents saving during initial load)
    // 2. Data is dirty (user has made changes)
    // 3. We have business and user IDs
    if (!isLoadComplete || !isDirty || !businessId || !userId) {
      if (isDirty) {
        console.log(`[AutoSave] ⚠️ Dirty but can't save: isLoadComplete=${isLoadComplete}, businessId=${businessId ? 'set' : 'MISSING'}, userId=${userId ? 'set' : 'MISSING'}`)
      }
      return
    }

    console.log('[AutoSave] Change detected, scheduling save in 2 seconds...')

    // Clear any existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    // Set new debounced save
    saveTimeoutRef.current = setTimeout(() => {
      console.log('[AutoSave] Executing auto-save...')
      saveAllData()
    }, 2000)

    // Cleanup timeout on unmount or dependency change
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [isLoadComplete, isDirty, businessId, userId, saveAllData])

  // Reset saved status after 3 seconds
  useEffect(() => {
    if (saveStatus === 'saved') {
      const timer = setTimeout(() => {
        setSaveStatus('idle')
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [saveStatus])

  // Warn user about unsaved changes on page unload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty && isLoadComplete) {
        e.preventDefault()
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?'
        return e.returnValue
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty, isLoadComplete])

  // Detect if next year was already planned in Q4 annual review (Phase 15)
  useEffect(() => {
    const bizId = businessesId || businessId
    if (!bizId) return

    const detectAnnualPlan = async () => {
      try {
        const supabase = createClient()
        const ysm = startMonthFromYearType(yearType || 'FY')
        const currentFY = getCurrentFiscalYear(ysm)

        // A completed annual review for the current FY means next year is planned
        const { data: annualReview } = await supabase
          .from('quarterly_reviews')
          .select('id, year, annual_initiative_plan')
          .eq('business_id', bizId)
          .eq('review_type', 'annual')
          .eq('status', 'completed')
          .eq('year', currentFY)
          .maybeSingle()

        const hasAnnualPlan = Boolean(
          annualReview?.annual_initiative_plan?.initiatives?.length > 0
        )

        setHasNextYearAnnualPlan(hasAnnualPlan)
        if (hasAnnualPlan) {
          setAnnualReviewYear(currentFY + 1)
          console.log(`[StrategicPlanning] Detected annual review for FY${currentFY} — next year (FY${currentFY + 1}) already planned`)
        }
      } catch (err) {
        console.error('[StrategicPlanning] Error detecting annual plan:', err)
        // Non-fatal — just don't show banner
      }
    }

    detectAnnualPlan()
  }, [businessId, businessesId, yearType])

  // Wrapper functions for setters that also mark dirty
  const setStrategicIdeasWithDirty = useCallback((ideas: StrategicInitiative[] | ((prev: StrategicInitiative[]) => StrategicInitiative[])) => {
    setStrategicIdeas(ideas)
    markDirty()
  }, [markDirty])

  const setRoadmapSuggestionsWithDirty = useCallback((suggestions: StrategicInitiative[] | ((prev: StrategicInitiative[]) => StrategicInitiative[])) => {
    setRoadmapSuggestions(suggestions)
    markDirty()
  }, [markDirty])

  const setTwelveMonthInitiativesWithDirty = useCallback((initiatives: StrategicInitiative[] | ((prev: StrategicInitiative[]) => StrategicInitiative[])) => {
    setTwelveMonthInitiatives(initiatives)
    markDirty()
  }, [markDirty])

  const setAnnualPlanByQuarterWithDirty = useCallback((plan: Record<string, StrategicInitiative[]> | ((prev: Record<string, StrategicInitiative[]>) => Record<string, StrategicInitiative[]>)) => {
    setAnnualPlanByQuarter(plan)
    markDirty()
  }, [markDirty])

  const setQuarterlyTargetsWithDirty = useCallback((targets: Record<string, { q1: string; q2: string; q3: string; q4: string }> | ((prev: Record<string, { q1: string; q2: string; q3: string; q4: string }>) => Record<string, { q1: string; q2: string; q3: string; q4: string }>)) => {
    setQuarterlyTargets(targets)
    markDirty()
  }, [markDirty])

  const setMonthlyTargetsWithDirty = useCallback((targets: MonthlyTargetsData | ((prev: MonthlyTargetsData) => MonthlyTargetsData)) => {
    setMonthlyTargets(targets)
    markDirty()
  }, [markDirty])

  const setSprintFocusWithDirty = useCallback((focus: StrategicInitiative[] | ((prev: StrategicInitiative[]) => StrategicInitiative[])) => {
    setSprintFocus(focus)
    markDirty()
  }, [markDirty])

  const setSprintKeyActionsWithDirty = useCallback((actions: KeyAction[] | ((prev: KeyAction[]) => KeyAction[])) => {
    setSprintKeyActions(actions)
    markDirty()
  }, [markDirty])

  const setOperationalActivitiesWithDirty = useCallback((activities: OperationalActivity[] | ((prev: OperationalActivity[]) => OperationalActivity[])) => {
    setOperationalActivities(activities)
    markDirty()
  }, [markDirty])

  const setYearTypeWithDirty = useCallback((type: YearType) => {
    setYearType(type)
    markDirty()
  }, [markDirty])

  return {
    // Loading & Error
    isLoading,
    error,

    // Auto-save status
    isDirty,
    saveStatus,
    lastSaved,

    // Step 1
    financialData,
    updateFinancialValue,
    coreMetrics,
    updateCoreMetric,
    kpis,
    updateKPIValue,
    addKPI,
    deleteKPI,
    yearType,
    setYearType: setYearTypeWithDirty,
    businessId,
    ownerUserId, // The owner's user.id for SWOT queries
    industry,

    // Step 2
    strategicIdeas,
    setStrategicIdeas: setStrategicIdeasWithDirty,

    // Step 3
    roadmapSuggestions,
    setRoadmapSuggestions: setRoadmapSuggestionsWithDirty,

    // Step 4
    twelveMonthInitiatives,
    setTwelveMonthInitiatives: setTwelveMonthInitiativesWithDirty,

    // Step 5
    annualPlanByQuarter,
    setAnnualPlanByQuarter: setAnnualPlanByQuarterWithDirty,
    quarterlyTargets,
    setQuarterlyTargets: setQuarterlyTargetsWithDirty,
    monthlyTargets,
    setMonthlyTargets: setMonthlyTargetsWithDirty,

    // Step 6
    sprintFocus,
    setSprintFocus: setSprintFocusWithDirty,
    sprintKeyActions,
    setSprintKeyActions: setSprintKeyActionsWithDirty,

    // Operational Activities
    operationalActivities,
    setOperationalActivities: setOperationalActivitiesWithDirty,

    // Extended period (Phase 14)
    isExtendedPeriod,
    year1Months,
    currentYearRemainingMonths,
    fiscalYearStart,

    // Annual review detection (Phase 15)
    hasNextYearAnnualPlan,
    annualReviewYear,

    // Save
    saveAllData,
    markDirty
  }
}