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
  const [businessId, setBusinessId] = useState<string>('')
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
      // The ownerUserId contains the actual business owner's ID, not the coach's ID
      // This ensures data is saved under the correct owner and can be loaded by both
      // the owner and the coach
      const saveUserId = ownerUserId || userId
      console.log(`[Strategic Planning] 💾 Using saveUserId: ${saveUserId} (ownerUserId: ${ownerUserId}, userId: ${userId})`)

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
      console.log('[Strategic Planning] 💾 Saving to Supabase...')
      console.log('[Strategic Planning] 📊 KPIs to save:', kpis.length, 'items')
      kpis.forEach((kpi, idx) => {
        console.log(`[Strategic Planning] KPI ${idx + 1}: "${kpi.name}" - current=${kpi.currentValue}, y1=${kpi.year1Target}, y2=${kpi.year2Target}, y3=${kpi.year3Target}`)
      })
      console.log('[Strategic Planning] 📊 Annual Plan by Quarter:', {
        q1: annualPlanByQuarter.q1?.map(i => ({ id: i.id, title: i.title, assignedTo: i.assignedTo })),
        q2: annualPlanByQuarter.q2?.map(i => ({ id: i.id, title: i.title, assignedTo: i.assignedTo })),
        q3: annualPlanByQuarter.q3?.map(i => ({ id: i.id, title: i.title, assignedTo: i.assignedTo })),
        q4: annualPlanByQuarter.q4?.map(i => ({ id: i.id, title: i.title, assignedTo: i.assignedTo }))
      })

      // Save financial data, core metrics, and quarterly targets
      const financialResult = await FinancialService.saveFinancialGoals(
        businessId,
        saveUserId,
        financialData,
        yearType,
        coreMetrics,
        quarterlyTargets
      )

      if (!financialResult.success) {
        setError(`Failed to save financial data: ${financialResult.error}`)
        return false
      }

      // Save KPIs
      const kpiResult = await KPIService.saveUserKPIs(businessId, saveUserId, kpis)

      if (!kpiResult.success) {
        setError(`Failed to save KPIs: ${kpiResult.error}`)
        return false
      }

      // Save strategic ideas (Step 2)
      const strategicIdeasResult = await StrategicPlanningService.saveInitiatives(
        businessId,
        saveUserId,
        strategicIdeas,
        'strategic_ideas'
      )

      if (!strategicIdeasResult.success) {
        setError(`Failed to save strategic ideas: ${strategicIdeasResult.error}`)
        return false
      }

      // Save roadmap suggestions (Step 3)
      const roadmapResult = await StrategicPlanningService.saveInitiatives(
        businessId,
        saveUserId,
        roadmapSuggestions,
        'roadmap'
      )

      if (!roadmapResult.success) {
        setError(`Failed to save roadmap: ${roadmapResult.error}`)
        return false
      }

      // Save 12-month initiatives (Step 4)
      const twelveMonthResult = await StrategicPlanningService.saveInitiatives(
        businessId,
        saveUserId,
        twelveMonthInitiatives,
        'twelve_month'
      )

      if (!twelveMonthResult.success) {
        setError(`Failed to save 12-month initiatives: ${twelveMonthResult.error}`)
        return false
      }

      // Save quarterly plans (Step 5)
      const q1Result = await StrategicPlanningService.saveInitiatives(
        businessId,
        saveUserId,
        annualPlanByQuarter.q1,
        'q1'
      )

      if (!q1Result.success) {
        setError(`Failed to save Q1 plan: ${q1Result.error}`)
        return false
      }

      const q2Result = await StrategicPlanningService.saveInitiatives(
        businessId,
        saveUserId,
        annualPlanByQuarter.q2,
        'q2'
      )

      if (!q2Result.success) {
        setError(`Failed to save Q2 plan: ${q2Result.error}`)
        return false
      }

      const q3Result = await StrategicPlanningService.saveInitiatives(
        businessId,
        saveUserId,
        annualPlanByQuarter.q3,
        'q3'
      )

      if (!q3Result.success) {
        setError(`Failed to save Q3 plan: ${q3Result.error}`)
        return false
      }

      const q4Result = await StrategicPlanningService.saveInitiatives(
        businessId,
        saveUserId,
        annualPlanByQuarter.q4,
        'q4'
      )

      if (!q4Result.success) {
        setError(`Failed to save Q4 plan: ${q4Result.error}`)
        return false
      }

      // Save sprint focus (Step 6)
      const sprintResult = await StrategicPlanningService.saveInitiatives(
        businessId,
        saveUserId,
        sprintFocus,
        'sprint'
      )

      if (!sprintResult.success) {
        setError(`Failed to save sprint focus: ${sprintResult.error}`)
        return false
      }

      // Save sprint key actions (Step 6)
      const sprintActionsResult = await StrategicPlanningService.saveSprintActions(
        businessId,
        saveUserId,
        sprintKeyActions
      )

      if (!sprintActionsResult.success) {
        setError(`Failed to save sprint actions: ${sprintActionsResult.error}`)
        return false
      }

      // Save operational activities
      const operationalActivitiesResult = await OperationalActivitiesService.saveActivities(
        businessId,
        saveUserId,
        operationalActivities
      )

      if (!operationalActivitiesResult.success) {
        setError(`Failed to save operational activities: ${operationalActivitiesResult.error}`)
        return false
      }

      // Also save to localStorage as backup
      if (typeof window !== 'undefined') {
        const allData = {
          financialData,
          coreMetrics,
          kpis,
          yearType,
          strategicIdeas,
          roadmapSuggestions,
          twelveMonthInitiatives,
          annualPlanByQuarter,
          quarterlyTargets,
          monthlyTargets,
          sprintFocus,
          sprintKeyActions,
          operationalActivities,
          lastSaved: new Date().toISOString()
        }
        localStorage.setItem('strategicPlan', JSON.stringify(allData))
      }

      console.log('[Strategic Planning] ✅ Successfully saved all data')

      // NOTE: We intentionally do NOT reload state after save here
      // Reloading could overwrite current state with empty arrays if business_id
      // doesn't match. The proper UUIDs will be loaded on next page refresh.
      // This prevents data loss while still saving correctly to DB.

      isSavingRef.current = false
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
    userId,
    ownerUserId,
    financialData,
    coreMetrics,
    kpis,
    yearType,
    strategicIdeas,
    roadmapSuggestions,
    twelveMonthInitiatives,
    annualPlanByQuarter,
    quarterlyTargets,
    sprintFocus,
    sprintKeyActions,
    operationalActivities,
    isLoadComplete
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

        // If overrideBusinessId is provided (coach viewing client), use it
        let bizId: string
        let ownerUser: string = user.id

        if (overrideBusinessId) {
          // Coach view - overrideBusinessId is businesses.id
          // But Goals data is stored with business_profiles.id - we need to look it up!
          console.log(`[Strategic Planning] 🔍 Coach view - overrideBusinessId: ${overrideBusinessId}`)

          // COMPREHENSIVE LOOKUP: Try multiple sources to find the correct IDs
          // This mirrors the approach used in the coach client page and SWOT page
          const possibleUserIds: string[] = []
          let foundProfileId: string | null = null
          let foundIndustry: string | null = null

          // Source 1: Get owner_id and owner_email from the businesses table
          const { data: business, error: businessError } = await supabase
            .from('businesses')
            .select('owner_id, owner_email, name')
            .eq('id', overrideBusinessId)
            .single()

          console.log(`[Strategic Planning] 🔍 Source 1 - Business lookup:`, { owner_id: business?.owner_id, owner_email: business?.owner_email, name: business?.name, error: businessError?.message })

          if (business?.owner_id) {
            possibleUserIds.push(business.owner_id)
            ownerUser = business.owner_id
          }

          // Source 2: Check business_profiles by business_id
          try {
            const { data: profileByBizId } = await supabase
              .from('business_profiles')
              .select('id, user_id, industry')
              .eq('business_id', overrideBusinessId)
              .maybeSingle()

            if (profileByBizId?.id) {
              foundProfileId = profileByBizId.id
              foundIndustry = profileByBizId.industry
              if (profileByBizId.user_id && !possibleUserIds.includes(profileByBizId.user_id)) {
                possibleUserIds.push(profileByBizId.user_id)
              }
              console.log(`[Strategic Planning] 🔍 Source 2 - Found profile by business_id:`, { profile_id: profileByBizId.id, user_id: profileByBizId.user_id })
            }
          } catch (e) {
            console.log(`[Strategic Planning] Source 2 lookup failed`)
          }

          // Source 3: Check business_users table
          if (!foundProfileId) {
            try {
              const { data: businessUsers } = await supabase
                .from('business_users')
                .select('user_id')
                .eq('business_id', overrideBusinessId)

              if (businessUsers && businessUsers.length > 0) {
                businessUsers.forEach((bu: any) => {
                  if (bu.user_id && !possibleUserIds.includes(bu.user_id)) {
                    possibleUserIds.push(bu.user_id)
                    console.log(`[Strategic Planning] 🔍 Source 3 - Found user from business_users:`, bu.user_id)
                  }
                })
              }
            } catch (e) {
              console.log(`[Strategic Planning] Source 3 lookup failed`)
            }
          }

          // Source 4: Look up user by owner_email
          if (!foundProfileId && business?.owner_email) {
            try {
              const { data: userByEmail } = await supabase
                .from('users')
                .select('id')
                .eq('email', business.owner_email)
                .maybeSingle()

              if (userByEmail?.id && !possibleUserIds.includes(userByEmail.id)) {
                possibleUserIds.push(userByEmail.id)
                console.log(`[Strategic Planning] 🔍 Source 4 - Found user by email:`, business.owner_email, '->', userByEmail.id)
              }
            } catch (e) {
              console.log(`[Strategic Planning] Source 4 lookup failed`)
            }
          }

          // Source 5: Look up by business_name match
          if (!foundProfileId && business?.name) {
            try {
              const { data: profilesByName } = await supabase
                .from('business_profiles')
                .select('id, user_id, industry')
                .ilike('business_name', business.name)

              if (profilesByName && profilesByName.length > 0) {
                profilesByName.forEach((p: any) => {
                  if (!foundProfileId && p.id) {
                    foundProfileId = p.id
                    foundIndustry = p.industry
                  }
                  if (p.user_id && !possibleUserIds.includes(p.user_id)) {
                    possibleUserIds.push(p.user_id)
                    console.log(`[Strategic Planning] 🔍 Source 5 - Found user by business_name match:`, business.name, '->', p.user_id)
                  }
                })
              }
            } catch (e) {
              console.log(`[Strategic Planning] Source 5 lookup failed`)
            }
          }

          // Now try to find business_profile using all possible user IDs
          if (!foundProfileId && possibleUserIds.length > 0) {
            for (const userId of possibleUserIds) {
              try {
                const { data: profileByUser } = await supabase
                  .from('business_profiles')
                  .select('id, industry')
                  .eq('user_id', userId)
                  .maybeSingle()

                if (profileByUser?.id) {
                  foundProfileId = profileByUser.id
                  foundIndustry = profileByUser.industry
                  console.log(`[Strategic Planning] ✅ Found profile via user_id lookup:`, userId, '->', profileByUser.id)
                  break
                }
              } catch (e) {
                // Continue to next user ID
              }
            }
          }

          console.log(`[Strategic Planning] 📊 All possible user IDs:`, possibleUserIds)

          // Set the business ID and owner
          if (foundProfileId) {
            bizId = foundProfileId
            if (foundIndustry) {
              setIndustry(foundIndustry)
            }
          } else {
            // Last resort fallback - use overrideBusinessId directly
            console.warn(`[Strategic Planning] ⚠️ No business_profiles found, using businesses.id as fallback`)
            bizId = overrideBusinessId
          }

          // Update ownerUser if we found better user IDs
          if (possibleUserIds.length > 0 && !ownerUser) {
            ownerUser = possibleUserIds[0]
          }

          console.log(`[Strategic Planning] 📥 Coach view - loading client business: ${bizId}, owner: ${ownerUser}`)
        } else {
          // Normal user view - get their business_profile
          // IMPORTANT: Goals data is stored with business_profiles.id as the business_id
          // This is different from businesses.id - do not change this!
          const { data: profile, error: profileError } = await supabase
            .from('business_profiles')
            .select('id, industry')
            .eq('user_id', user.id)
            .single()

          console.log(`[Strategic Planning] 🔍 User ID: ${user.id}`)
          console.log(`[Strategic Planning] 🔍 Profile query result:`, { profile, profileError: profileError?.message })

          bizId = profile?.id || user.id
          ownerUser = user.id // For SWOT queries, SWOT stores with user.id as business_id

          console.log(`[Strategic Planning] 🔍 Using bizId: ${bizId}, ownerUser: ${ownerUser}`)

          // Set industry from profile, fallback to default
          if (profile?.industry) {
            setIndustry(profile.industry)
            console.log(`[Strategic Planning] ✅ Loaded industry: ${profile.industry}`)
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
          quarterlyTargets: loadedQuarterlyTargets
        } = await FinancialService.loadFinancialGoals(bizId)

        // Load KPIs from Supabase
        const loadedKPIs = await KPIService.getUserKPIs(bizId)

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

        setAnnualPlanByQuarter({
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

    // Save
    saveAllData,
    markDirty
  }
}