'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useBusinessContext } from '@/hooks/useBusinessContext'
import { Printer, Loader2, ExternalLink, CheckCircle2, Circle, Lightbulb, FileText } from 'lucide-react'
import { calculateQuarters, determinePlanYear } from '@/app/goals/utils/quarters'
import type { YearType } from '@/app/goals/types'
import PageHeader from '@/components/ui/PageHeader'

// Only log in development
const isDev = process.env.NODE_ENV === 'development'
const devLog = (message: string, ...args: any[]) => {
  if (isDev) {
    console.log(message, ...args)
  }
}

interface OnePagePlanData {
  // Vision/Mission/Values
  vision: string
  mission: string
  coreValues: string[]

  // SWOT
  strengths: string[]
  weaknesses: string[]
  opportunities: string[]
  threats: string[]

  // Financial & Metrics
  financialGoals: {
    year3: { revenue: number; grossProfit: number; netProfit: number }
    year1: { revenue: number; grossProfit: number; netProfit: number }
    quarter: { revenue: number; grossProfit: number; netProfit: number }
  }

  coreMetrics: {
    year3: { [key: string]: any }
    year1: { [key: string]: any }
    quarter: { [key: string]: any }
  }

  kpis: Array<{
    name: string
    category: string
    year3Target: number
    year1Target: number
    quarterTarget: number
  }>

  // Strategic Initiatives (12-month plan)
  strategicInitiatives: Array<{
    title: string
    quarters: string[] // ['Q1', 'Q3'] etc
    owner?: string
  }>

  // Current Quarter Rocks (90-day sprint)
  quarterlyRocks: Array<{
    action: string
    owner?: string
    dueDate?: string
  }>

  currentQuarter: string
  currentQuarterLabel: string // e.g., "Q2 (Oct-Dec)"
  yearType: YearType
  planYear: number
  companyName: string

  // Owner Personal Goals
  ownerGoals: {
    desiredHoursPerWeek?: number
    currentHoursPerWeek?: number
    primaryGoal?: string
    timeHorizon?: string
    exitStrategy?: string
  }
}

export default function OnePagePlan() {
  const router = useRouter()
  const supabase = createClient()
  const { activeBusiness, isLoading: contextLoading } = useBusinessContext()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<OnePagePlanData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Calculate strategic health metrics
  const calculatePlanHealth = (planData: OnePagePlanData) => {
    const sections = [
      { name: 'Vision', complete: !!planData.vision, link: '/vision-mission' },
      { name: 'Mission', complete: !!planData.mission, link: '/vision-mission' },
      { name: 'Core Values', complete: planData.coreValues.length >= 3, link: '/vision-mission' },
      { name: 'SWOT Analysis', complete: planData.strengths.length > 0 && planData.weaknesses.length > 0, link: '/swot' },
      { name: 'Financial Goals', complete: planData.financialGoals.year1.revenue > 0, link: '/goals' },
      { name: '12-Month Initiatives', complete: planData.strategicInitiatives.length >= 3, link: '/goals' },
      { name: 'Quarterly Rocks', complete: planData.quarterlyRocks.length >= 1, link: '/goals' },
    ]

    const completedCount = sections.filter(s => s.complete).length
    const totalCount = sections.length
    const percentage = Math.round((completedCount / totalCount) * 100)

    return { sections, completedCount, totalCount, percentage }
  }

  // Generate coaching insights based on plan data
  const generateCoachingInsights = (planData: OnePagePlanData) => {
    const insights: string[] = []

    // Vision/Mission insights
    if (!planData.vision) {
      insights.push('Define your 3-year vision to give your team a clear destination to work towards.')
    }
    if (!planData.mission) {
      insights.push('Your mission statement helps everyone understand WHY your business exists.')
    }
    if (planData.coreValues.length < 3) {
      insights.push('Add at least 3 core values to guide decision-making across your organization.')
    }

    // SWOT insights
    if (planData.strengths.length === 0) {
      insights.push('Identify your key strengths - these are your competitive advantages to leverage.')
    }
    if (planData.opportunities.length > 0 && planData.strategicInitiatives.length === 0) {
      insights.push('You\'ve identified opportunities but no initiatives. Consider creating action plans.')
    }
    if (planData.threats.length > 0 && planData.quarterlyRocks.length === 0) {
      insights.push('You\'ve identified threats. Add quarterly rocks to address your most urgent risks.')
    }

    // Goals insights
    if (planData.financialGoals.year1.revenue > 0 && planData.financialGoals.quarter.revenue === 0) {
      insights.push('Set quarterly revenue targets to track progress toward your annual goal.')
    }
    if (planData.strategicInitiatives.length > 10) {
      insights.push('You have many initiatives. Consider prioritizing the top 5-7 for better focus.')
    }
    if (planData.quarterlyRocks.length > 5) {
      insights.push('More than 5 quarterly rocks can dilute focus. Prioritize your top 3-5.')
    }
    if (planData.quarterlyRocks.length > 0 && planData.quarterlyRocks.every(r => !r.owner)) {
      insights.push('Assign owners to your quarterly rocks to ensure accountability.')
    }

    // Positive insights when things are good
    if (insights.length === 0) {
      if (planData.strategicInitiatives.length >= 3 && planData.quarterlyRocks.length >= 3) {
        insights.push('Your strategic plan is well-structured. Review quarterly to stay on track.')
      }
      if (planData.vision && planData.mission && planData.coreValues.length >= 3) {
        insights.push('Strong foundation! Your vision, mission, and values create clear direction.')
      }
    }

    return insights.slice(0, 3) // Return top 3 insights
  }

  useEffect(() => {
    if (!contextLoading) {
      loadAllData()
    }
  }, [contextLoading, activeBusiness?.id])

  // Auto-reload data when page becomes visible (user navigates back)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadAllData()
      }
    }

    const handleFocus = () => {
      loadAllData()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [])

  const loadAllData = async () => {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()

      devLog('[One Page Plan] 🔍 User:', user?.id)

      if (!user) {
        router.push('/auth/login')
        return
      }

      // Determine which business to load:
      // 1. If activeBusiness is set (coach viewing client), use it
      // 2. Otherwise, load user's own business profile
      let businessId: string
      let profile: any = null

      if (activeBusiness?.id) {
        // Coach view - activeBusiness.id is businesses.id
        const businessesId = activeBusiness.id
        devLog('[One Page Plan] 🏢 Coach view - loading client business:', businessesId)

        // Load profile by business_id instead of user_id
        const { data: profileData, error: profileError } = await supabase
          .from('business_profiles')
          .select('id, industry, owner_info, key_roles')
          .eq('business_id', businessesId)
          .single()

        profile = profileData
        devLog('[One Page Plan] 🏢 Business Profile query (coach view):', { profile, error: profileError })

        // CRITICAL: Use business_profiles.id for data queries (strategic_initiatives, etc.)
        // These tables use business_profiles.id as their business_id, not businesses.id
        businessId = profile?.id || businessesId
        devLog('[One Page Plan] 🏢 Using businessId for data queries:', businessId)
      } else {
        // Normal user view - get their business profile
        // Use activeBusiness.ownerId if available (coach viewing client)
        const targetUserId = activeBusiness?.ownerId || user.id
        const { data: profileData, error: profileError } = await supabase
          .from('business_profiles')
          .select('id, industry, owner_info, key_roles')
          .eq('user_id', targetUserId)
          .single()

        profile = profileData
        devLog('[One Page Plan] 🏢 Business Profile query:', { profile, error: profileError })

        // Fallback to user.id if no profile (same as strategic planning wizard)
        businessId = profile?.id || user.id
      }

      // Parse owner_info if it exists (JSONB field)
      const ownerInfo = profile?.owner_info || {}

      // Build team members lookup map (ID -> name) from profile data
      // This matches how Step5SprintPlanning loads team members
      const teamMembersMap: Record<string, string> = {}

      // Add owner from owner_info
      if (ownerInfo.owner_name) {
        teamMembersMap[`owner-${businessId}`] = ownerInfo.owner_name
      }

      // Add business partners from owner_info.partners
      if (ownerInfo.partners && Array.isArray(ownerInfo.partners)) {
        ownerInfo.partners.forEach((partner: any, index: number) => {
          if (partner.name && partner.name.trim()) {
            teamMembersMap[`partner-${businessId}-${index}`] = partner.name
          }
        })
      }

      // Add team members from key_roles
      if (profile?.key_roles && Array.isArray(profile.key_roles)) {
        profile.key_roles.forEach((role: any, index: number) => {
          if (role.name && role.name.trim()) {
            teamMembersMap[`role-${businessId}-${index}`] = role.name
          }
        })
      }

      // Also load dynamically added team members from localStorage
      // These are members added via Step5SprintPlanning with IDs like 'member-timestamp' or 'role-timestamp'
      if (typeof window !== 'undefined') {
        try {
          const storedMembers = localStorage.getItem('team_members')
          if (storedMembers) {
            const members = JSON.parse(storedMembers)
            if (Array.isArray(members)) {
              members.forEach((member: any) => {
                if (member.id && member.name) {
                  teamMembersMap[member.id] = member.name
                }
              })
            }
          }
        } catch (e) {
          console.warn('[One Page Plan] Could not load team members from localStorage:', e)
        }
      }

      devLog('[One Page Plan] 👥 Team Members Map:', teamMembersMap)

      // Create flexible lookup arrays for fallback matching
      // This handles cases where assigned_to uses a different business ID or simple index
      const teamMembersList: { id: string; name: string; type: string; index: number }[] = []

      // Build a list of all team members with their types and indices
      if (ownerInfo.owner_name) {
        teamMembersList.push({ id: `owner-${businessId}`, name: ownerInfo.owner_name, type: 'owner', index: 0 })
      }
      if (ownerInfo.partners && Array.isArray(ownerInfo.partners)) {
        ownerInfo.partners.forEach((partner: any, index: number) => {
          if (partner.name && partner.name.trim()) {
            teamMembersList.push({ id: `partner-${businessId}-${index}`, name: partner.name, type: 'partner', index })
          }
        })
      }
      if (profile?.key_roles && Array.isArray(profile.key_roles)) {
        profile.key_roles.forEach((role: any, index: number) => {
          if (role.name && role.name.trim()) {
            teamMembersList.push({ id: `role-${businessId}-${index}`, name: role.name, type: 'role', index })
          }
        })
      }

      // Smart team member resolver that handles:
      // 1. Direct ID match (exact match in teamMembersMap)
      // 2. Type+index match (e.g., "role-different-business-id-3" matches role at index 3)
      // 3. Simple numeric index (e.g., "1" matches team member at position 1)
      const resolveTeamMember = (assignedTo: string): string => {
        if (!assignedTo) return ''

        // Try direct lookup first
        if (teamMembersMap[assignedTo]) {
          return teamMembersMap[assignedTo]
        }

        // Try matching by type and index (handles different business IDs)
        // Pattern: type-businessId-index (e.g., "role-uuid-3", "partner-uuid-1")
        const typeIndexMatch = assignedTo.match(/^(owner|partner|role)-[a-f0-9-]+-(\d+)$/)
        if (typeIndexMatch) {
          const [, type, indexStr] = typeIndexMatch
          const index = parseInt(indexStr, 10)
          const match = teamMembersList.find(m => m.type === type && m.index === index)
          if (match) {
            console.log(`[One Page Plan] ✅ Resolved "${assignedTo}" via type+index to "${match.name}"`)
            return match.name
          }
        }

        // Handle owner-only format (no index)
        if (assignedTo.match(/^owner-[a-f0-9-]+$/)) {
          const match = teamMembersList.find(m => m.type === 'owner')
          if (match) {
            console.log(`[One Page Plan] ✅ Resolved "${assignedTo}" via owner type to "${match.name}"`)
            return match.name
          }
        }

        // Try simple numeric index (for legacy data like "1", "2", etc.)
        if (/^\d+$/.test(assignedTo)) {
          const index = parseInt(assignedTo, 10)
          if (index >= 0 && index < teamMembersList.length) {
            const match = teamMembersList[index]
            console.log(`[One Page Plan] ✅ Resolved "${assignedTo}" via numeric index to "${match.name}"`)
            return match.name
          }
        }

        // No match found, return original
        console.log(`[One Page Plan] ⚠️ Could not resolve "${assignedTo}" - returning as-is`)
        return assignedTo
      }

      devLog('[One Page Plan] 👥 Team Members List:', teamMembersList)

      // Get company name from businesses table
      // Use business ID when viewing as coach, otherwise use owner_id
      const targetOwnerId = activeBusiness?.ownerId || user.id
      const { data: businessData } = activeBusiness?.id
        ? await supabase
            .from('businesses')
            .select('name')
            .eq('id', activeBusiness.id)
            .single()
        : await supabase
            .from('businesses')
            .select('name')
            .eq('owner_id', targetOwnerId)
            .limit(1)
            .single()

      const companyName = businessData?.name || 'Your Company'
      devLog('[One Page Plan] ✅ Business ID:', businessId, 'Name:', companyName)

      // Load Vision/Mission/Values
      // When viewing as coach, use the client's owner ID instead of the coach's user ID
      const ownerUserId = activeBusiness?.ownerId || user.id
      const { data: visionMissionData, error: vmError } = await supabase
        .from('strategy_data')
        .select('vision_mission')
        .eq('user_id', ownerUserId)
        .single()

      devLog('[One Page Plan] 📖 Vision/Mission data:', { data: visionMissionData, error: vmError })

      const visionMission = visionMissionData?.vision_mission || {}

      // Load SWOT - get ALL items from ALL analyses for this user (since items may be spread across quarters)
      devLog('[One Page Plan] 📅 Looking for SWOT:', { businessId, ownerUserId })

      let swotItems: any[] = []

      // Get all SWOT analyses for this user (try both businessId and ownerUserId)
      // When viewing as coach, use client's businessId and ownerId
      const { data: allAnalyses, error: analysesError } = await supabase
        .from('swot_analyses')
        .select('id, business_id, quarter, year')
        .or(`business_id.eq.${businessId},business_id.eq.${ownerUserId}`)

      console.log('[One Page Plan] 💡 All user analyses:', JSON.stringify({
        count: allAnalyses?.length || 0,
        ids: allAnalyses?.map(a => a.id?.substring(0, 8)),
        error: analysesError?.message
      }))

      if (allAnalyses && allAnalyses.length > 0) {
        // Get all analysis IDs
        const analysisIds = allAnalyses.map(a => a.id)

        // Get ALL items from ALL analyses for this user
        const { data: allItems, error: itemsError } = await supabase
          .from('swot_items')
          .select('id, swot_analysis_id, category, title, description, status')
          .in('swot_analysis_id', analysisIds)
          .or('status.eq.active,status.eq.carried-forward,status.is.null')
          .order('created_at', { ascending: false })

        console.log('[One Page Plan] 💡 All SWOT items for user:', JSON.stringify({
          count: allItems?.length || 0,
          byCategory: {
            strength: allItems?.filter(i => i.category === 'strength').length || 0,
            weakness: allItems?.filter(i => i.category === 'weakness').length || 0,
            opportunity: allItems?.filter(i => i.category === 'opportunity').length || 0,
            threat: allItems?.filter(i => i.category === 'threat').length || 0
          },
          error: itemsError?.message
        }))

        swotItems = allItems || []
      }

      devLog('[One Page Plan] 💡 SWOT items extracted:', swotItems?.length)

      // Load Financial Goals & Core Metrics
      const { data: financialGoals, error: finError } = await supabase
        .from('business_financial_goals')
        .select('*')
        .eq('business_id', businessId)
        .single()

      devLog('[One Page Plan] 💰 Financial Goals data:', { data: financialGoals, error: finError })

      // Get year type from financial goals (FY = July-June, CY = Jan-Dec)
      const yearType: YearType = (financialGoals?.year_type as YearType) || 'FY'
      const planYear = determinePlanYear(yearType)

      // Calculate quarters based on year type
      const quarters = calculateQuarters(yearType, planYear)
      // Find the PLANNING quarter (next quarter, not current) - users plan ahead
      const currentQuarterIdx = quarters.findIndex(q => q.isCurrent)
      const planningQuarterIdx = currentQuarterIdx >= 0
        ? (currentQuarterIdx + 1) % 4
        : 0
      // Use planning quarter (next quarter) instead of current quarter
      const planningQuarterInfo = quarters[planningQuarterIdx]
      const currentQuarter = planningQuarterInfo.label // 'Q1', 'Q2', etc.
      const currentQuarterLabel = `${planningQuarterInfo.label} (${planningQuarterInfo.months}) - Planning`

      devLog('[One Page Plan] 📅 Year settings:', { yearType, planYear, currentQuarter, currentQuarterLabel, planningForNextQuarter: true })

      // Load KPIs
      const { data: kpisData, error: kpiError } = await supabase
        .from('business_kpis')
        .select('*')
        .eq('business_id', businessId)

      devLog('[One Page Plan] 📊 KPIs data:', { count: kpisData?.length, error: kpiError })

      // Load Quarterly Targets
      const { data: quarterlyTargetsData, error: qtError } = await supabase
        .from('business_financial_goals')
        .select('quarterly_targets')
        .eq('business_id', businessId)
        .single()

      devLog('[One Page Plan] 📅 Quarterly Targets data:', { data: quarterlyTargetsData, error: qtError })

      // Quarterly targets structure: { 'revenue': { q1: '...', q2: '...' }, 'grossProfit': {...}, ... }
      // We need to transform it to { revenue: value, grossProfit: value, ... } for current quarter
      const allQuarterlyTargets = quarterlyTargetsData?.quarterly_targets || {}
      const qKey = currentQuarter.toLowerCase() as 'q1' | 'q2' | 'q3' | 'q4'

      // Extract current quarter values from each metric
      const currentQuarterTargets = {
        revenue: parseFloat(allQuarterlyTargets['revenue']?.[qKey] || '0') || 0,
        grossProfit: parseFloat(allQuarterlyTargets['grossProfit']?.[qKey] || '0') || 0,
        netProfit: parseFloat(allQuarterlyTargets['netProfit']?.[qKey] || '0') || 0,
        leadsPerMonth: parseFloat(allQuarterlyTargets['leadsPerMonth']?.[qKey] || '0') || 0,
        conversionRate: parseFloat(allQuarterlyTargets['conversionRate']?.[qKey] || '0') || 0,
        avgTransactionValue: parseFloat(allQuarterlyTargets['avgTransactionValue']?.[qKey] || '0') || 0,
        teamHeadcount: parseFloat(allQuarterlyTargets['teamHeadcount']?.[qKey] || '0') || 0,
        ownerHoursPerWeek: parseFloat(allQuarterlyTargets['ownerHoursPerWeek']?.[qKey] || '0') || 0,
        customers: parseFloat(allQuarterlyTargets['customers']?.[qKey] || '0') || 0,
      }

      devLog('[One Page Plan] 📅 Current Quarter Targets:', { quarter: currentQuarter, qKey, raw: allQuarterlyTargets, parsed: currentQuarterTargets })

      // Load Strategic Initiatives (12-month plan)
      const { data: initiatives, error: initError } = await supabase
        .from('strategic_initiatives')
        .select('*')
        .eq('business_id', businessId)
        .eq('step_type', 'twelve_month')
        .order('order_index', { ascending: true })

      devLog('[One Page Plan] 🎯 Strategic Initiatives:', { count: initiatives?.length, error: initError })

      // Load current quarter initiatives for rocks
      const currentQuarterStepType = currentQuarter.toLowerCase() // 'q1', 'q2', 'q3', or 'q4'
      const { data: quarterInitiatives, error: quarterError } = await supabase
        .from('strategic_initiatives')
        .select('*')
        .eq('business_id', businessId)
        .eq('step_type', currentQuarterStepType)
        .order('order_index', { ascending: true })

      console.log(`[One Page Plan] 🪨 ${currentQuarter} Initiatives:`, { count: quarterInitiatives?.length, error: quarterError })

      // Note: We use quarterInitiatives (from strategic_initiatives table with current quarter filter)
      // instead of sprint_key_actions because sprint_key_actions doesn't have a quarter field
      // This ensures Quarterly Rocks always show the current quarter's initiatives
      devLog('[One Page Plan] ⚡ Using Quarter Initiatives for Rocks:', { count: quarterInitiatives?.length })

      // Debug: Log what we're about to assemble
      devLog('[One Page Plan] 🔧 Assembling data...')
      console.log('  - Vision Mission:', visionMission)
      console.log('  - SWOT Items:', swotItems?.length)
      console.log('  - Financial Goals structure:', financialGoals ? Object.keys(financialGoals) : 'null')
      console.log('  - KPIs count:', kpisData?.length)

      // Assemble the data
      const planData: OnePagePlanData = {
        vision: visionMission.vision_statement || '',
        mission: visionMission.mission_statement || '',
        coreValues: (visionMission.core_values || []).filter((v: string) => v.trim()),

        // SWOT items already filtered by status in query - just filter by category
        strengths: swotItems
          .filter((item: any) => item.category === 'strength')
          .slice(0, 5)
          .map((item: any) => item.title),
        weaknesses: swotItems
          .filter((item: any) => item.category === 'weakness')
          .slice(0, 5)
          .map((item: any) => item.title),
        opportunities: swotItems
          .filter((item: any) => item.category === 'opportunity')
          .slice(0, 5)
          .map((item: any) => item.title),
        threats: swotItems
          .filter((item: any) => item.category === 'threat')
          .slice(0, 5)
          .map((item: any) => item.title),

        financialGoals: {
          year3: {
            revenue: financialGoals?.revenue_year3 || 0,
            grossProfit: financialGoals?.gross_profit_year3 || 0,
            netProfit: financialGoals?.net_profit_year3 || 0,
          },
          year1: {
            revenue: financialGoals?.revenue_year1 || 0,
            grossProfit: financialGoals?.gross_profit_year1 || 0,
            netProfit: financialGoals?.net_profit_year1 || 0,
          },
          quarter: {
            revenue: currentQuarterTargets?.revenue || 0,
            grossProfit: currentQuarterTargets?.grossProfit || 0,
            netProfit: currentQuarterTargets?.netProfit || 0,
          },
        },

        coreMetrics: {
          year3: {
            leadsPerMonth: financialGoals?.leads_per_month_year3 || 0,
            conversionRate: financialGoals?.conversion_rate_year3 || 0,
            avgTransactionValue: financialGoals?.avg_transaction_value_year3 || 0,
            teamHeadcount: financialGoals?.team_headcount_year3 || 0,
            ownerHoursPerWeek: financialGoals?.owner_hours_per_week_year3 || 0,
          },
          year1: {
            leadsPerMonth: financialGoals?.leads_per_month_year1 || 0,
            conversionRate: financialGoals?.conversion_rate_year1 || 0,
            avgTransactionValue: financialGoals?.avg_transaction_value_year1 || 0,
            teamHeadcount: financialGoals?.team_headcount_year1 || 0,
            ownerHoursPerWeek: financialGoals?.owner_hours_per_week_year1 || 0,
          },
          quarter: {
            leadsPerMonth: currentQuarterTargets?.leadsPerMonth || 0,
            conversionRate: currentQuarterTargets?.conversionRate || 0,
            avgTransactionValue: currentQuarterTargets?.avgTransactionValue || 0,
            teamHeadcount: currentQuarterTargets?.teamHeadcount || 0,
            ownerHoursPerWeek: currentQuarterTargets?.ownerHoursPerWeek || 0,
          },
        },

        kpis: (kpisData || []).slice(0, 5).map((kpi: any) => ({
          name: kpi.kpi_name || kpi.name,
          category: kpi.category || '',
          year3Target: kpi.year3_target || 0,
          year1Target: kpi.year1_target || 0,
          quarterTarget: kpi.quarter_target || 0,
        })),

        strategicInitiatives: (initiatives || []).map((init: any) => ({
          title: init.title,
          quarters: [], // We'll need to load quarterly assignments
          owner: init.assigned_to ? resolveTeamMember(init.assigned_to) : undefined
        })),

        quarterlyRocks: (quarterInitiatives || []).map((init: any) => ({
          action: init.title,
          owner: init.assigned_to ? resolveTeamMember(init.assigned_to) : undefined,
          dueDate: init.timeline
        })),

        currentQuarter,
        currentQuarterLabel,
        yearType,
        planYear,
        companyName,

        ownerGoals: {
          desiredHoursPerWeek: ownerInfo?.desired_hours,
          currentHoursPerWeek: ownerInfo?.current_hours,
          primaryGoal: ownerInfo?.primary_goal,
          timeHorizon: ownerInfo?.time_horizon,
          exitStrategy: ownerInfo?.exit_strategy
        }
      }

      devLog('[One Page Plan] ✅ Final assembled data:', planData)
      devLog('[One Page Plan] 📋 Strategic Initiatives Array:', planData.strategicInitiatives)
      devLog('[One Page Plan] 📋 First Initiative:', planData.strategicInitiatives[0])
      devLog('[One Page Plan] 🪨 Quarterly Rocks Array:', planData.quarterlyRocks)
      devLog('[One Page Plan] 🪨 First Rock:', planData.quarterlyRocks[0])
      devLog('[One Page Plan] 👤 Owner Goals:', planData.ownerGoals)
      setData(planData)
      setLastUpdated(new Date())
    } catch (err) {
      console.error('[One Page Plan] ❌ Error loading data:', err)
      console.error('[One Page Plan] ❌ Error details:', err instanceof Error ? err.message : String(err))
      console.error('[One Page Plan] ❌ Error stack:', err instanceof Error ? err.stack : 'No stack trace')
      setError(`Failed to load plan data: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  // Calculate margin percentage (profit / revenue * 100)
  const calculateMargin = (profit: number, revenue: number): string => {
    if (!revenue || revenue === 0) return '-'
    const margin = (profit / revenue) * 100
    return `${margin.toFixed(1)}%`
  }

  const handlePrint = () => {
    window.print()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-brand-orange mx-auto mb-4" />
          <p className="text-gray-600">Loading your One Page Plan...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 font-medium mb-2">Error loading plan</p>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page Header - Hidden when printing */}
      <div className="print:hidden">
        <PageHeader
          variant="banner"
          title="One Page Strategic Plan"
          subtitle={`${data.companyName} • Year ${data.planYear} • ${data.yearType === 'FY' ? 'Financial Year' : 'Calendar Year'}`}
          icon={FileText}
          backLink={{ href: '/dashboard', label: 'Back to Dashboard' }}
          actions={
            <>
              <button
                onClick={() => router.push('/goals')}
                className="flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2 bg-brand-orange hover:bg-brand-orange-600 text-white rounded-lg font-medium text-sm"
              >
                <ExternalLink className="w-4 h-4" />
                <span className="hidden sm:inline">Edit Strategic Plan</span>
                <span className="sm:hidden">Edit</span>
              </button>
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg font-medium text-sm"
              >
                <Printer className="w-4 h-4" />
                <span className="hidden sm:inline">Print</span>
              </button>
            </>
          }
        />
      </div>

      {/* Strategic Health Dashboard - Hidden when printing */}
      {data && (() => {
        const health = calculatePlanHealth(data)
        const insights = generateCoachingInsights(data)
        return (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-6 print:hidden">
            <div className="rounded-xl shadow-sm border border-gray-200 bg-white p-4 sm:p-6">
              <div className="flex flex-col lg:flex-row items-start gap-4 sm:gap-6">
                {/* Health Score */}
                <div className="flex-shrink-0">
                  <div className="relative">
                    <svg className="w-24 h-24 sm:w-28 sm:h-28" viewBox="0 0 100 100">
                      <circle
                        cx="50"
                        cy="50"
                        r="42"
                        stroke="#e5e7eb"
                        strokeWidth="8"
                        fill="none"
                        transform="rotate(-90 50 50)"
                      />
                      <circle
                        cx="50"
                        cy="50"
                        r="42"
                        stroke={health.percentage >= 70 ? '#22c55e' : health.percentage >= 40 ? '#f59e0b' : '#ef4444'}
                        strokeWidth="8"
                        fill="none"
                        strokeDasharray={`${(health.percentage / 100) * 264} 264`}
                        strokeLinecap="round"
                        transform="rotate(-90 50 50)"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-2xl sm:text-3xl font-bold text-gray-900">{health.percentage}%</span>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 text-center mt-2 font-medium">Plan Health</p>
                </div>

                {/* Section Checklist */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">Strategic Plan Completeness</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    {health.sections.map((section, idx) => (
                      <Link
                        key={idx}
                        href={section.link}
                        className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded ${
                          section.complete
                            ? 'text-green-700 bg-green-50 hover:bg-green-100'
                            : 'text-gray-600 bg-gray-50 hover:bg-gray-100'
                        }`}
                      >
                        {section.complete ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                        ) : (
                          <Circle className="w-3.5 h-3.5 text-gray-400" />
                        )}
                        <span className="truncate">{section.name}</span>
                      </Link>
                    ))}
                  </div>
                </div>

                {/* Quarter Focus Visualization */}
                <div className="flex-shrink-0 w-full sm:w-auto">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-sm font-semibold text-gray-900">Quarter Focus</h3>
                    <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                      {data.yearType === 'FY' ? 'Financial Year' : 'Calendar Year'}
                    </span>
                  </div>
                  <div className="flex gap-1 overflow-x-auto">
                    {(() => {
                      const quarters = calculateQuarters(data.yearType, data.planYear)
                      return quarters.map((q) => (
                        <div
                          key={q.id}
                          className={`flex flex-col items-center justify-center rounded px-2 py-1.5 ${
                            q.isCurrent
                              ? 'bg-brand-orange text-white ring-2 ring-brand-orange-300'
                              : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          <span className="text-xs font-semibold">{q.label}</span>
                          <span className={`text-[9px] ${q.isCurrent ? 'text-brand-orange-100' : 'text-gray-400'}`}>{q.months}</span>
                        </div>
                      ))
                    })()}
                  </div>
                  <div className="mt-2 text-xs text-gray-600 space-y-0.5">
                    <p><span className="font-medium">{data.strategicInitiatives.length}</span> annual initiatives</p>
                    <p><span className="font-medium">{data.quarterlyRocks.length}</span> {data.currentQuarterLabel} rocks</p>
                  </div>
                </div>

                {/* Coaching Insights */}
                {insights.length > 0 && (
                  <div className="flex-shrink-0 w-full lg:max-w-xs">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Lightbulb className="w-4 h-4 text-amber-500" />
                      <h3 className="text-sm font-semibold text-gray-900">Coaching Insights</h3>
                    </div>
                    <ul className="space-y-1.5">
                      {insights.map((insight, idx) => (
                        <li key={idx} className="text-xs text-gray-600 leading-relaxed">
                          {insight}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* One Page Plan - Printable */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow-lg rounded-xl print:shadow-none print:rounded-none">
          {/* Header */}
          <div className="border-b-4 border-gray-900 p-4 sm:p-6 print:p-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 print:text-2xl">{data.companyName}</h1>
                <p className="text-sm sm:text-base text-gray-600 mt-1">One Page Strategic Plan</p>
              </div>
              <div className="sm:text-right">
                <p className="text-sm sm:text-base font-semibold text-gray-900">Year {data.planYear}</p>
                <p className="text-xs sm:text-sm text-gray-600">{new Date().toLocaleDateString()}</p>
                {lastUpdated && (
                  <p className="text-xs text-gray-500">Updated {lastUpdated.toLocaleTimeString()}</p>
                )}
                <p className="text-xs sm:text-sm text-red-600 mt-1 font-medium">CONFIDENTIAL</p>
              </div>
            </div>
          </div>

          {/* Vision, Mission & Core Values Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 border-b border-gray-300">
            <div className="md:border-r border-gray-300 flex flex-col border-b md:border-b-0">
              <div className="bg-brand-orange-50 px-3 py-2 border-b border-gray-300">
                <h3 className="text-xs sm:text-sm font-bold text-brand-navy uppercase text-center print:text-xs">Vision (Where We're Going)</h3>
              </div>
              <div className="flex-1 flex items-center justify-center p-3 sm:p-4">
                {data.vision ? (
                  <p className="text-xs sm:text-sm text-gray-900 leading-relaxed text-center print:text-xs">{data.vision}</p>
                ) : (
                  <div className="text-center">
                    <p className="text-xs sm:text-sm text-gray-500 mb-2">Vision not set</p>
                    <Link href="/vision-mission" className="text-xs text-brand-orange hover:text-brand-orange-800 underline print:hidden">
                      Set your vision →
                    </Link>
                  </div>
                )}
              </div>
            </div>
            <div className="md:border-r border-gray-300 flex flex-col border-b md:border-b-0">
              <div className="bg-brand-orange-50 px-3 py-2 border-b border-gray-300">
                <h3 className="text-xs sm:text-sm font-bold text-brand-navy uppercase text-center print:text-xs">Mission (Why We Exist)</h3>
              </div>
              <div className="flex-1 flex items-center justify-center p-3 sm:p-4">
                {data.mission ? (
                  <p className="text-xs sm:text-sm text-gray-900 leading-relaxed text-center print:text-xs">{data.mission}</p>
                ) : (
                  <div className="text-center">
                    <p className="text-xs sm:text-sm text-gray-500 mb-2">Mission not set</p>
                    <Link href="/vision-mission" className="text-xs text-brand-orange hover:text-brand-orange-800 underline print:hidden">
                      Set your mission →
                    </Link>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col">
              <div className="bg-brand-orange-50 px-3 py-2 border-b border-gray-300">
                <h3 className="text-xs sm:text-sm font-bold text-brand-navy uppercase text-center print:text-xs">Core Values</h3>
              </div>
              <div className="flex-1 flex items-center justify-center p-3 sm:p-4">
                {data.coreValues.length > 0 ? (
                  <ul className="space-y-1 text-center">
                    {data.coreValues.slice(0, 8).map((value, idx) => (
                      <li key={idx} className="text-xs sm:text-sm text-gray-900 print:text-xs">
                        {value}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-center">
                    <p className="text-xs sm:text-sm text-gray-500 mb-2">Core values not set</p>
                    <Link href="/vision-mission" className="text-xs text-brand-orange hover:text-brand-orange-800 underline">
                      Add core values →
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* SWOT Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border-b border-gray-300">
            <div className="p-3 sm:p-4 lg:border-r border-gray-300 border-b sm:border-b lg:border-b-0">
              <h3 className="text-xs sm:text-sm font-bold text-green-700 uppercase mb-2 print:text-xs">Strengths</h3>
              {data.strengths.length > 0 ? (
                <ol className="space-y-1">
                  {data.strengths.slice(0, 5).map((item, idx) => (
                    <li key={idx} className="text-xs sm:text-sm text-gray-800 print:text-xs">{idx + 1}. {item}</li>
                  ))}
                </ol>
              ) : (
                <div className="text-center py-4">
                  <p className="text-xs text-gray-500 mb-2">No strengths identified</p>
                  <Link href="/swot" className="text-xs text-brand-orange hover:text-brand-orange-800 underline print:hidden">
                    Complete SWOT →
                  </Link>
                </div>
              )}
            </div>

            <div className="p-3 sm:p-4 sm:border-r lg:border-r border-gray-300 border-b sm:border-b-0 lg:border-b-0">
              <h3 className="text-xs sm:text-sm font-bold text-brand-orange-700 uppercase mb-2 print:text-xs">Weaknesses</h3>
              {data.weaknesses.length > 0 ? (
                <ol className="space-y-1">
                  {data.weaknesses.slice(0, 5).map((item, idx) => (
                    <li key={idx} className="text-xs sm:text-sm text-gray-800 print:text-xs">{idx + 1}. {item}</li>
                  ))}
                </ol>
              ) : (
                <div className="text-center py-4">
                  <p className="text-xs text-gray-500 mb-2">No weaknesses identified</p>
                  <Link href="/swot" className="text-xs text-brand-orange hover:text-brand-orange-800 underline print:hidden">
                    Complete SWOT →
                  </Link>
                </div>
              )}
            </div>

            <div className="p-3 sm:p-4 lg:border-r border-gray-300 border-b sm:border-b lg:border-b-0">
              <h3 className="text-xs sm:text-sm font-bold text-brand-orange-700 uppercase mb-2 print:text-xs">Opportunities</h3>
              {data.opportunities.length > 0 ? (
                <ol className="space-y-1">
                  {data.opportunities.slice(0, 5).map((item, idx) => (
                    <li key={idx} className="text-xs sm:text-sm text-gray-800 print:text-xs">{idx + 1}. {item}</li>
                  ))}
                </ol>
              ) : (
                <div className="text-center py-4">
                  <p className="text-xs text-gray-500 mb-2">No opportunities identified</p>
                  <Link href="/swot" className="text-xs text-brand-orange hover:text-brand-orange-800 underline print:hidden">
                    Complete SWOT →
                  </Link>
                </div>
              )}
            </div>

            <div className="p-3 sm:p-4">
              <h3 className="text-xs sm:text-sm font-bold text-red-700 uppercase mb-2 print:text-xs">Threats</h3>
              {data.threats.length > 0 ? (
                <ol className="space-y-1">
                  {data.threats.slice(0, 5).map((item, idx) => (
                    <li key={idx} className="text-xs sm:text-sm text-gray-800 print:text-xs">{idx + 1}. {item}</li>
                  ))}
                </ol>
              ) : (
                <div className="text-center py-4">
                  <p className="text-xs text-gray-500 mb-2">No threats identified</p>
                  <Link href="/swot" className="text-xs text-brand-orange hover:text-brand-orange-800 underline print:hidden">
                    Complete SWOT →
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Goals & Metrics Table */}
          <div className="border-b border-gray-300 overflow-x-auto">
            <div className="bg-brand-orange-50 px-3 py-2 border-b border-gray-300">
              <h3 className="text-xs sm:text-sm font-bold text-brand-navy uppercase print:text-xs">Goals & Key Metrics</h3>
            </div>
            <table className="w-full text-xs sm:text-sm print:text-xs">
              <colgroup>
                <col className="w-[30%]" />
                <col className="w-[20%]" />
                <col className="w-[25%]" />
                <col className="w-[25%]" />
              </colgroup>
              <thead>
                <tr className="bg-gray-100 border-b border-gray-300">
                  <th className="text-left p-2 font-semibold text-gray-700">Metric</th>
                  <th className="text-center p-2 font-semibold text-gray-700">3-Year Goal</th>
                  <th className="text-center p-2 font-semibold text-brand-orange-700">1-Year Goal</th>
                  <th className="text-center p-2 font-semibold text-green-700">{data.currentQuarterLabel} Target</th>
                </tr>
              </thead>
              <tbody>
                {/* Financial Goals Section */}
                <tr className="bg-gray-100">
                  <td colSpan={4} className="p-2 font-bold text-gray-700 text-xs uppercase">Financial Goals</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="p-2 font-semibold pl-4">Revenue</td>
                  <td className="p-2 text-center">{formatCurrency(data.financialGoals.year3.revenue)}</td>
                  <td className="p-2 text-center font-semibold text-brand-navy">{formatCurrency(data.financialGoals.year1.revenue)}</td>
                  <td className="p-2 text-center font-semibold text-green-700">{formatCurrency(data.financialGoals.quarter.revenue)}</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="p-2 font-semibold pl-4">Gross Profit</td>
                  <td className="p-2 text-center">
                    <div>{formatCurrency(data.financialGoals.year3.grossProfit)}</div>
                    <div className="text-xs text-gray-500">({calculateMargin(data.financialGoals.year3.grossProfit, data.financialGoals.year3.revenue)})</div>
                  </td>
                  <td className="p-2 text-center font-semibold text-brand-navy">
                    <div>{formatCurrency(data.financialGoals.year1.grossProfit)}</div>
                    <div className="text-xs text-brand-orange font-normal">({calculateMargin(data.financialGoals.year1.grossProfit, data.financialGoals.year1.revenue)})</div>
                  </td>
                  <td className="p-2 text-center font-semibold text-green-700">
                    <div>{formatCurrency(data.financialGoals.quarter.grossProfit)}</div>
                    <div className="text-xs text-green-600 font-normal">({calculateMargin(data.financialGoals.quarter.grossProfit, data.financialGoals.quarter.revenue)})</div>
                  </td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="p-2 font-semibold pl-4">Net Profit</td>
                  <td className="p-2 text-center">
                    <div>{formatCurrency(data.financialGoals.year3.netProfit)}</div>
                    <div className="text-xs text-gray-500">({calculateMargin(data.financialGoals.year3.netProfit, data.financialGoals.year3.revenue)})</div>
                  </td>
                  <td className="p-2 text-center font-semibold text-brand-navy">
                    <div>{formatCurrency(data.financialGoals.year1.netProfit)}</div>
                    <div className="text-xs text-brand-orange font-normal">({calculateMargin(data.financialGoals.year1.netProfit, data.financialGoals.year1.revenue)})</div>
                  </td>
                  <td className="p-2 text-center font-semibold text-green-700">
                    <div>{formatCurrency(data.financialGoals.quarter.netProfit)}</div>
                    <div className="text-xs text-green-600 font-normal">({calculateMargin(data.financialGoals.quarter.netProfit, data.financialGoals.quarter.revenue)})</div>
                  </td>
                </tr>

                {/* Core Business Metrics Section */}
                <tr className="bg-gray-100">
                  <td colSpan={4} className="p-2 font-bold text-gray-700 text-xs uppercase">Core Business Metrics</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="p-2 font-semibold pl-4">Leads per Month</td>
                  <td className="p-2 text-center">{data.coreMetrics.year3.leadsPerMonth || 0}</td>
                  <td className="p-2 text-center font-semibold text-brand-navy">{data.coreMetrics.year1.leadsPerMonth || 0}</td>
                  <td className="p-2 text-center font-semibold text-green-700">{data.coreMetrics.quarter.leadsPerMonth || 0}</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="p-2 font-semibold pl-4">Conversion Rate (%)</td>
                  <td className="p-2 text-center">{data.coreMetrics.year3.conversionRate || 0}%</td>
                  <td className="p-2 text-center font-semibold text-brand-navy">{data.coreMetrics.year1.conversionRate || 0}%</td>
                  <td className="p-2 text-center font-semibold text-green-700">{data.coreMetrics.quarter.conversionRate || 0}%</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="p-2 font-semibold pl-4">Avg Transaction Value</td>
                  <td className="p-2 text-center">{formatCurrency(data.coreMetrics.year3.avgTransactionValue || 0)}</td>
                  <td className="p-2 text-center font-semibold text-brand-navy">{formatCurrency(data.coreMetrics.year1.avgTransactionValue || 0)}</td>
                  <td className="p-2 text-center font-semibold text-green-700">{formatCurrency(data.coreMetrics.quarter.avgTransactionValue || 0)}</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="p-2 font-semibold pl-4">Team Headcount (FTE)</td>
                  <td className="p-2 text-center">{data.coreMetrics.year3.teamHeadcount || 0}</td>
                  <td className="p-2 text-center font-semibold text-brand-navy">{data.coreMetrics.year1.teamHeadcount || 0}</td>
                  <td className="p-2 text-center font-semibold text-green-700">{data.coreMetrics.quarter.teamHeadcount || 0}</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="p-2 font-semibold pl-4">Owner Hours per Week</td>
                  <td className="p-2 text-center">{data.coreMetrics.year3.ownerHoursPerWeek || 0}</td>
                  <td className="p-2 text-center font-semibold text-brand-navy">{data.coreMetrics.year1.ownerHoursPerWeek || 0}</td>
                  <td className="p-2 text-center font-semibold text-green-700">{data.coreMetrics.quarter.ownerHoursPerWeek || 0}</td>
                </tr>

                {/* Top KPIs Section */}
                <tr className="bg-gray-100">
                  <td colSpan={4} className="p-2 font-bold text-gray-700 text-xs uppercase">Key Performance Indicators</td>
                </tr>
                {data.kpis.slice(0, 5).map((kpi, idx) => (
                  <tr key={idx} className="border-b border-gray-200">
                    <td className="p-2 font-semibold pl-4">{kpi.name}</td>
                    <td className="p-2 text-center">{kpi.year3Target}</td>
                    <td className="p-2 text-center font-semibold text-brand-navy">{kpi.year1Target}</td>
                    <td className="p-2 text-center font-semibold text-green-700">{kpi.quarterTarget}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Strategic Initiatives & Quarterly Rocks - Aligned with columns */}
          <div className="grid grid-cols-1 lg:grid-cols-[30%_20%_25%_25%] border-t border-gray-300">
            {/* Owner Personal Goals - Left columns (only show if data exists) */}
            {(data.ownerGoals.primaryGoal || data.ownerGoals.desiredHoursPerWeek || data.ownerGoals.timeHorizon || data.ownerGoals.exitStrategy) ? (
              <div className="lg:col-span-2 lg:border-r border-gray-300 border-b lg:border-b-0">
                <div className="bg-brand-orange-50 px-3 py-2 border-b border-gray-300">
                  <h3 className="text-xs sm:text-sm font-bold text-brand-navy uppercase print:text-xs">What I Want From This Business</h3>
                </div>
                <div className="p-3 sm:p-4 space-y-2">
                  {data.ownerGoals.primaryGoal && (
                    <div>
                      <p className="text-[10px] font-semibold text-gray-700 uppercase mb-0.5 print:text-[8px]">Primary Goal</p>
                      <p className="text-xs sm:text-sm font-bold text-gray-900 print:text-xs">{data.ownerGoals.primaryGoal}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {data.ownerGoals.timeHorizon && (
                      <div>
                        <p className="text-[10px] font-semibold text-gray-700 uppercase mb-0.5 print:text-[8px]">Time Horizon</p>
                        <p className="text-xs sm:text-sm text-gray-900 print:text-xs">{data.ownerGoals.timeHorizon}</p>
                      </div>
                    )}
                    {data.ownerGoals.exitStrategy && (
                      <div>
                        <p className="text-[10px] font-semibold text-gray-700 uppercase mb-0.5 print:text-[8px]">Exit Strategy</p>
                        <p className="text-xs sm:text-sm text-gray-900 print:text-xs">{data.ownerGoals.exitStrategy}</p>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {data.ownerGoals.currentHoursPerWeek && (
                      <div>
                        <p className="text-[10px] font-semibold text-gray-700 uppercase mb-0.5 print:text-[8px]">Current Hours/Week</p>
                        <p className="text-xs sm:text-sm font-bold text-gray-900 print:text-xs">{data.ownerGoals.currentHoursPerWeek} hrs</p>
                      </div>
                    )}
                    {data.ownerGoals.desiredHoursPerWeek && (
                      <div>
                        <p className="text-[10px] font-semibold text-gray-700 uppercase mb-0.5 print:text-[8px]">Desired Hours/Week</p>
                        <p className="text-xs sm:text-sm font-bold text-gray-900 print:text-xs">{data.ownerGoals.desiredHoursPerWeek} hrs</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              // Empty placeholder when no owner goals data
              <div className="lg:col-span-2 lg:border-r border-gray-300 bg-gray-50 hidden lg:block"></div>
            )}

            {/* Strategic Initiatives - Under 1-Year Goal */}
            <div className="lg:border-r border-gray-300 border-b lg:border-b-0">
              <div className="bg-brand-orange-50 px-3 py-2 border-b border-gray-300">
                <h3 className="text-xs sm:text-sm font-bold text-brand-navy uppercase print:text-xs">12-Month Initiatives</h3>
              </div>
              <div className="p-3 sm:p-4">
                <ol className="space-y-1">
                  {data.strategicInitiatives.slice(0, 12).map((initiative, idx) => (
                    <li key={idx} className="text-xs sm:text-sm print:text-xs">
                      <span className="font-medium text-gray-900">{idx + 1}. {initiative.title}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            {/* Current Quarter Rocks - Under Quarter Target */}
            <div>
              <div className="bg-brand-orange-50 px-3 py-2 border-b border-gray-300">
                <h3 className="text-xs sm:text-sm font-bold text-brand-navy uppercase print:text-xs">{data.currentQuarterLabel} Rocks</h3>
              </div>
              <div className="p-3 sm:p-4">
                <ol className="space-y-1">
                  {data.quarterlyRocks.slice(0, 5).map((rock, idx) => (
                    <li key={idx} className="text-xs sm:text-sm print:text-xs">
                      <div className="font-medium text-gray-900">{idx + 1}. {rock.action}</div>
                      {(rock.owner || rock.dueDate) && (
                        <div className="text-[10px] text-gray-600 mt-0.5 print:text-[8px]">
                          {rock.owner && <span>Owner: {rock.owner}</span>}
                          {rock.owner && rock.dueDate && <span> • </span>}
                          {rock.dueDate && <span>Due: {new Date(rock.dueDate).toLocaleDateString()}</span>}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-gray-300 p-4 bg-gray-50 text-center print:hidden">
            <p className="text-xs text-gray-600">
              Generated with Business Coaching Platform • {new Date().toLocaleDateString()} •
              <button onClick={() => router.push('/goals')} className="text-brand-orange hover:underline ml-1">
                Edit Strategic Plan →
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
