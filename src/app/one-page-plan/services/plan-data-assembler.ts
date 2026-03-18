import type { SupabaseClient } from '@supabase/supabase-js'
import type { OnePagePlanData } from '../types'
import type { YearType } from '@/app/goals/types'
import { calculateQuarters, determinePlanYear } from '@/app/goals/utils/quarters'

// Only log in development
const isDev = process.env.NODE_ENV === 'development'
const devLog = (message: string, ...args: any[]) => {
  if (isDev) {
    console.log(message, ...args)
  }
}

interface AssemblePlanDataParams {
  businessId?: string
  ownerUserId?: string
  supabase: SupabaseClient
  activeBusiness?: { id: string; ownerId?: string; name?: string } | null
  selectedQuarterId?: string
}

interface AssemblePlanDataResult {
  planData: OnePagePlanData
  allQuarters: ReturnType<typeof calculateQuarters>
  selectedQuarterId: string
}

/**
 * Assembles the full One Page Plan data from all source tables.
 * This is the core data-loading logic extracted from the One Page Plan page.
 * Returns null if the user is not authenticated.
 */
export async function assemblePlanData(params: AssemblePlanDataParams): Promise<AssemblePlanDataResult | null> {
  const { supabase, activeBusiness, selectedQuarterId: inputQuarterId } = params

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Determine which business to load
  // Three IDs needed (matching Goals Wizard pattern):
  //   businessId = business_profiles.id — for strategic_initiatives, business_financial_goals
  //   businessesId = businesses.id — for business_kpis (FK constraint)
  //   ownerUserId = owner's auth user.id — for swot_analyses
  let businessId: string
  let businessesId: string
  let ownerUserId: string
  let profile: any = null

  if (activeBusiness?.id) {
    businessesId = activeBusiness.id
    ownerUserId = activeBusiness.ownerId || user.id
    devLog('[PlanAssembler] Coach/team view - loading client business:', businessesId)

    const { data: profileData } = await supabase
      .from('business_profiles')
      .select('id, industry, owner_info, key_roles')
      .eq('business_id', businessesId)
      .single()

    profile = profileData
    businessId = profile?.id || businessesId

    // If we couldn't get ownerUserId from activeBusiness, look it up
    if (!activeBusiness.ownerId) {
      const { data: bizData } = await supabase
        .from('businesses')
        .select('owner_id')
        .eq('id', businessesId)
        .single()
      ownerUserId = bizData?.owner_id || user.id
    }
  } else {
    ownerUserId = user.id
    const { data: profileData } = await supabase
      .from('business_profiles')
      .select('id, industry, owner_info, key_roles')
      .eq('user_id', ownerUserId)
      .single()

    profile = profileData
    businessId = profile?.id || user.id

    // Look up businesses.id
    const { data: bizData } = await supabase
      .from('businesses')
      .select('id')
      .eq('owner_id', ownerUserId)
      .maybeSingle()
    businessesId = bizData?.id || businessId
  }

  devLog('[PlanAssembler] Resolved IDs:', { businessId, businessesId, ownerUserId })

  // Parse owner_info
  const ownerInfo = profile?.owner_info || {}

  // Build team members lookup map
  const teamMembersMap: Record<string, string> = {}

  if (ownerInfo.owner_name) {
    teamMembersMap[`owner-${businessId}`] = ownerInfo.owner_name
  }
  if (ownerInfo.partners && Array.isArray(ownerInfo.partners)) {
    ownerInfo.partners.forEach((partner: any, index: number) => {
      if (partner.name && partner.name.trim()) {
        teamMembersMap[`partner-${businessId}-${index}`] = partner.name
      }
    })
  }
  if (profile?.key_roles && Array.isArray(profile.key_roles)) {
    profile.key_roles.forEach((role: any, index: number) => {
      if (role.name && role.name.trim()) {
        teamMembersMap[`role-${businessId}-${index}`] = role.name
      }
    })
  }

  // Load team members from localStorage
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
      console.warn('[PlanAssembler] Could not load team members from localStorage:', e)
    }
  }

  // Build flexible lookup arrays
  const teamMembersList: { id: string; name: string; type: string; index: number }[] = []

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

  // Smart team member resolver
  const resolveTeamMember = (assignedTo: string): string => {
    if (!assignedTo) return ''

    if (teamMembersMap[assignedTo]) {
      return teamMembersMap[assignedTo]
    }

    const typeIndexMatch = assignedTo.match(/^(owner|partner|role)-[a-f0-9-]+-(\d+)$/)
    if (typeIndexMatch) {
      const [, type, indexStr] = typeIndexMatch
      const index = parseInt(indexStr, 10)
      const match = teamMembersList.find(m => m.type === type && m.index === index)
      if (match) return match.name
    }

    if (assignedTo.match(/^owner-[a-f0-9-]+$/)) {
      const match = teamMembersList.find(m => m.type === 'owner')
      if (match) return match.name
    }

    if (/^\d+$/.test(assignedTo)) {
      const index = parseInt(assignedTo, 10)
      if (index >= 0 && index < teamMembersList.length) {
        return teamMembersList[index].name
      }
    }

    return assignedTo
  }

  // Get company name
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

  // Load Vision/Mission/Values (ownerUserId already resolved above)
  // Try ownerUserId first, fallback to businessId for legacy data
  let visionMission: any = {}
  const { data: visionMissionData } = await supabase
    .from('strategy_data')
    .select('vision_mission')
    .eq('user_id', ownerUserId)
    .maybeSingle()

  if (visionMissionData?.vision_mission) {
    visionMission = visionMissionData.vision_mission
  } else if (ownerUserId !== businessId) {
    devLog('[PlanAssembler] No vision/mission with ownerUserId, trying businessId')
    const { data: fallbackVM } = await supabase
      .from('strategy_data')
      .select('vision_mission')
      .eq('user_id', businessId)
      .maybeSingle()
    visionMission = fallbackVM?.vision_mission || {}
  }
  devLog('[PlanAssembler] Vision/Mission loaded:', { hasVision: !!visionMission.vision_statement, hasMission: !!visionMission.mission_statement })

  // Load SWOT — collect both review and Goals Wizard SWOT IDs.
  // Actual item loading happens after quarter calculation so we can choose
  // the review SWOT for the planning quarter and Goals Wizard SWOT for others.
  let swotItems: any[] = []
  const uniqueIds = [...new Set([ownerUserId, businessId, businessesId].filter(Boolean))]
  const orFilter = uniqueIds.map(id => `business_id.eq.${id}`).join(',')
  const reviewBizFilter = uniqueIds.map(id => `business_id.eq.${id}`).join(',')
  devLog('[PlanAssembler] SWOT query IDs:', { ownerUserId, businessId, businessesId })

  // Collect review SWOT ID
  let reviewSwotId: string | null = null
  const { data: recentReview } = await supabase
    .from('quarterly_reviews')
    .select('id, swot_analysis_id, quarter, year, status')
    .or(reviewBizFilter)
    .not('swot_analysis_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (recentReview?.swot_analysis_id) {
    reviewSwotId = recentReview.swot_analysis_id
    devLog('[PlanAssembler] Found SWOT from quarterly review:', reviewSwotId, `Q${recentReview.quarter} ${recentReview.year} status=${recentReview.status}`)
  }

  // Collect Goals Wizard / fallback SWOT ID (most recent non-archived analysis)
  let fallbackSwotId: string | null = null
  {
    const { data: allAnalyses } = await supabase
      .from('swot_analyses')
      .select('id, business_id, quarter, year, type, status, created_at')
      .or(orFilter)
      .order('created_at', { ascending: false })
      .limit(5)

    if (allAnalyses && allAnalyses.length > 0) {
      // Prefer the most recent non-archived, non-quarterly (Goals Wizard) analysis
      const goalsWizardAnalysis = allAnalyses.find(a => a.status !== 'archived' && a.type !== 'quarterly')
      const best = goalsWizardAnalysis || allAnalyses.find(a => a.status !== 'archived') || allAnalyses[0]
      fallbackSwotId = best.id
      devLog('[PlanAssembler] Goals Wizard SWOT fallback:', best.id, `Q${best.quarter} ${best.year} type=${best.type}`)
    }
  }

  // SWOT items will be loaded after quarter calculation (see below)

  // Load Financial Goals & Core Metrics
  // Try businessId (business_profiles.id) first, fallback to user.id and businessesId
  let financialGoals: any = null
  const fgIdsToTry = [...new Set([businessId, ownerUserId, businessesId].filter(Boolean))]
  devLog('[PlanAssembler] Financial goals - trying IDs:', fgIdsToTry)

  for (const tryId of fgIdsToTry) {
    const { data: fgData, error: fgErr } = await supabase
      .from('business_financial_goals')
      .select('*')
      .eq('business_id', tryId)
      .maybeSingle()

    if (fgData) {
      financialGoals = fgData
      devLog('[PlanAssembler] Financial goals FOUND with ID:', tryId, '→ year_type:', fgData.year_type, 'revenue_year1:', fgData.revenue_year1)
      break
    }
    devLog('[PlanAssembler] Financial goals NOT found with ID:', tryId, 'error:', fgErr?.message || 'none')
  }

  // Legacy fallback: try business_profile_id column
  if (!financialGoals) {
    const { data: fgLegacy } = await supabase
      .from('business_financial_goals')
      .select('*')
      .eq('business_profile_id', businessId)
      .maybeSingle()
    if (fgLegacy) {
      financialGoals = fgLegacy
      devLog('[PlanAssembler] Financial goals loaded with legacy business_profile_id:', businessId)
    }
  }

  // Ultimate fallback: try user_id column
  if (!financialGoals) {
    const { data: fgByUser } = await supabase
      .from('business_financial_goals')
      .select('*')
      .eq('user_id', ownerUserId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (fgByUser) {
      financialGoals = fgByUser
      devLog('[PlanAssembler] Financial goals loaded with user_id column:', ownerUserId)
    }
  }

  if (!financialGoals) {
    devLog('[PlanAssembler] ⚠️ NO financial goals found with ANY ID. Tried:', fgIdsToTry, '+ legacy + user_id')
  } else {
    devLog('[PlanAssembler] Financial goals result:', {
      id: financialGoals.id,
      business_id: financialGoals.business_id,
      user_id: financialGoals.user_id,
      year_type: financialGoals.year_type,
      revenue_year1: financialGoals.revenue_year1,
      quarterly_targets: financialGoals.quarterly_targets ? 'present' : 'null',
    })
  }

  const yearType: YearType = (financialGoals?.year_type as YearType) || 'FY'
  const planYear = determinePlanYear(yearType)
  const quarters = calculateQuarters(yearType, planYear)

  // Determine which quarter to display
  const currentQuarterIdx = quarters.findIndex(q => q.isCurrent)
  const nextQuarterIdx = currentQuarterIdx >= 0 ? (currentQuarterIdx + 1) % 4 : -1

  let displayQuarterIdx: number
  let effectiveQuarterId = inputQuarterId || null

  // Build list of IDs to try for strategic_initiatives queries
  const initiativeIds = [businessId]
  if (user.id !== businessId) initiativeIds.push(user.id)
  if (businessesId !== businessId && businessesId !== user.id) initiativeIds.push(businessesId)

  if (effectiveQuarterId) {
    displayQuarterIdx = quarters.findIndex(q => q.id === effectiveQuarterId)
    if (displayQuarterIdx < 0) displayQuarterIdx = currentQuarterIdx >= 0 ? currentQuarterIdx : 0
  } else {
    let nextQuarterHasData = false
    if (nextQuarterIdx >= 0) {
      const nextQKey = quarters[nextQuarterIdx].id
      for (const tryId of initiativeIds) {
        const { count } = await supabase
          .from('strategic_initiatives')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', tryId)
          .eq('step_type', nextQKey)
        if ((count || 0) > 0) {
          nextQuarterHasData = true
          break
        }
      }
    }
    displayQuarterIdx = nextQuarterHasData ? nextQuarterIdx : (currentQuarterIdx >= 0 ? currentQuarterIdx : 0)
    effectiveQuarterId = quarters[displayQuarterIdx].id
  }

  const displayQuarterInfo = quarters[displayQuarterIdx]
  const isCurrent = displayQuarterIdx === currentQuarterIdx
  const currentQuarter = displayQuarterInfo.label
  const currentQuarterLabel = `${displayQuarterInfo.label} (${displayQuarterInfo.months})${isCurrent ? '' : ' - Planning'}`

  // Now load SWOT items — use review SWOT for planning quarter, Goals Wizard SWOT for others
  const isViewingPlanningQuarter = displayQuarterIdx === nextQuarterIdx
  const chosenAnalysisId = (isViewingPlanningQuarter && reviewSwotId)
    ? reviewSwotId
    : (fallbackSwotId || reviewSwotId) // For non-planning quarters, prefer Goals Wizard; fall back to review if no other option

  devLog('[PlanAssembler] SWOT selection:', { isViewingPlanningQuarter, displayQuarter: currentQuarter, chosenAnalysisId, reviewSwotId, fallbackSwotId })

  if (chosenAnalysisId) {
    devLog('[PlanAssembler] Loading SWOT items from analysis:', chosenAnalysisId)
    const { data: items } = await supabase
      .from('swot_items')
      .select('id, swot_analysis_id, category, title, description, status')
      .eq('swot_analysis_id', chosenAnalysisId)
      .or('status.eq.active,status.eq.carried-forward,status.is.null')
      .order('created_at', { ascending: false })

    swotItems = items || []

    if (swotItems.length === 0) {
      const { data: unfilteredItems } = await supabase
        .from('swot_items')
        .select('id, swot_analysis_id, category, title, description, status')
        .eq('swot_analysis_id', chosenAnalysisId)
        .order('created_at', { ascending: false })
      swotItems = unfilteredItems || []
    }

    devLog('[PlanAssembler] SWOT items loaded:', swotItems.length, 'by category:', {
      strengths: swotItems.filter((i: any) => i.category === 'strength').length,
      weaknesses: swotItems.filter((i: any) => i.category === 'weakness').length,
      opportunities: swotItems.filter((i: any) => i.category === 'opportunity').length,
      threats: swotItems.filter((i: any) => i.category === 'threat').length,
    })
  }

  // Load KPIs — business_kpis.business_id references businesses.id
  // Try businessesId first, fallback to businessId
  let kpisData: any[] | null = null
  const { data: kpisResult } = await supabase
    .from('business_kpis')
    .select('*')
    .eq('business_id', businessesId)
  if (kpisResult && kpisResult.length > 0) {
    kpisData = kpisResult
    devLog('[PlanAssembler] KPIs loaded with businessesId:', businessesId, kpisResult.length)
  } else if (businessesId !== businessId) {
    const { data: kpiFallback } = await supabase
      .from('business_kpis')
      .select('*')
      .eq('business_id', businessId)
    kpisData = kpiFallback
    devLog('[PlanAssembler] KPIs loaded with businessId fallback:', businessId, kpiFallback?.length || 0)
  }

  // Load Quarterly Targets — per-quarter from financial_goals, with review override for planning quarter
  const allQuarterlyTargets = financialGoals?.quarterly_targets || {}
  const qKey = currentQuarter.toLowerCase() as 'q1' | 'q2' | 'q3' | 'q4'
  devLog('[PlanAssembler] Quarterly targets - looking at key:', qKey, 'allKeys:', Object.keys(allQuarterlyTargets), 'raw:', JSON.stringify(allQuarterlyTargets).substring(0, 200))

  // Helper to extract a quarterly target value from financial_goals
  const getQuarterTarget = (metric: string): number => {
    const val = parseFloat(allQuarterlyTargets[metric]?.[qKey] || '0') || 0
    if (val > 0) return val
    const metricData = allQuarterlyTargets[metric]
    if (!metricData || typeof metricData !== 'object') return 0
    for (const k of ['q1', 'q2', 'q3', 'q4']) {
      const v = parseFloat(metricData[k] || '0') || 0
      if (v > 0) return v
    }
    return 0
  }

  // For the planning quarter, prefer quarterly review targets; for other quarters use financial_goals
  let currentQuarterTargets = {
    revenue: 0, grossProfit: 0, netProfit: 0,
    leadsPerMonth: 0, conversionRate: 0, avgTransactionValue: 0,
    teamHeadcount: 0, ownerHoursPerWeek: 0, customers: 0,
  }
  let usedReviewTargets = false

  // For the planning quarter, prefer quarterly review targets (the most recent user input)
  if (isViewingPlanningQuarter) {
    const reviewBizIds = uniqueIds.map(id => `business_id.eq.${id}`).join(',')
    const { data: latestReviewTargets } = await supabase
      .from('quarterly_reviews')
      .select('quarterly_targets, status')
      .or(reviewBizIds)
      .not('quarterly_targets', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (latestReviewTargets?.quarterly_targets) {
      const rt = latestReviewTargets.quarterly_targets as any
      if ((rt.revenue || 0) > 0 || (rt.grossProfit || 0) > 0 || (rt.netProfit || 0) > 0) {
        currentQuarterTargets = {
          revenue: rt.revenue || 0,
          grossProfit: rt.grossProfit || 0,
          netProfit: rt.netProfit || 0,
          leadsPerMonth: rt.leadsPerMonth || 0,
          conversionRate: rt.conversionRate || 0,
          avgTransactionValue: rt.avgTransactionValue || 0,
          teamHeadcount: rt.teamHeadcount || 0,
          ownerHoursPerWeek: rt.ownerHoursPerWeek || 0,
          customers: rt.customers || 0,
        }
        usedReviewTargets = true
        devLog('[PlanAssembler] Quarterly targets from quarterly_review (planning quarter):', { revenue: currentQuarterTargets.revenue, grossProfit: currentQuarterTargets.grossProfit, netProfit: currentQuarterTargets.netProfit })
      }
    }
  }

  // For non-planning quarters OR if no review data: use financial_goals per-quarter data
  if (!usedReviewTargets) {
    currentQuarterTargets = {
      revenue: getQuarterTarget('revenue'),
      grossProfit: getQuarterTarget('grossProfit'),
      netProfit: getQuarterTarget('netProfit'),
      leadsPerMonth: getQuarterTarget('leadsPerMonth'),
      conversionRate: getQuarterTarget('conversionRate'),
      avgTransactionValue: getQuarterTarget('avgTransactionValue'),
      teamHeadcount: getQuarterTarget('teamHeadcount'),
      ownerHoursPerWeek: getQuarterTarget('ownerHoursPerWeek'),
      customers: getQuarterTarget('customers'),
    }
    devLog('[PlanAssembler] Quarterly targets from financial_goals (fallback):', { revenue: currentQuarterTargets.revenue, grossProfit: currentQuarterTargets.grossProfit, netProfit: currentQuarterTargets.netProfit })
  }

  // Load Strategic Initiatives (12-month plan) — try multiple IDs with fallback
  let initiatives: any[] | null = null
  for (const tryId of initiativeIds) {
    const { data: initData } = await supabase
      .from('strategic_initiatives')
      .select('*')
      .eq('business_id', tryId)
      .eq('step_type', 'twelve_month')
      .order('order_index', { ascending: true })
    if (initData && initData.length > 0) {
      initiatives = initData
      devLog('[PlanAssembler] 12-month initiatives loaded with ID:', tryId, initData.length)
      break
    }
  }
  if (!initiatives) {
    devLog('[PlanAssembler] No 12-month initiatives found with any ID:', initiativeIds)
    initiatives = []
  }

  // Load current quarter initiatives for rocks — try multiple IDs with fallback
  const currentQuarterStepType = currentQuarter.toLowerCase()
  let quarterInitiatives: any[] | null = null
  for (const tryId of initiativeIds) {
    const { data: qiData } = await supabase
      .from('strategic_initiatives')
      .select('*')
      .eq('business_id', tryId)
      .eq('step_type', currentQuarterStepType)
      .order('order_index', { ascending: true })
    if (qiData && qiData.length > 0) {
      quarterInitiatives = qiData
      devLog('[PlanAssembler] Quarter rocks loaded with ID:', tryId, 'step_type:', currentQuarterStepType, qiData.length)
      break
    }
  }
  if (!quarterInitiatives) {
    devLog('[PlanAssembler] No quarter rocks found. Trying sprint step_type as fallback...')
    // Also try 'sprint' step_type in case old sync wrote there
    for (const tryId of initiativeIds) {
      const { data: sprintData } = await supabase
        .from('strategic_initiatives')
        .select('*')
        .eq('business_id', tryId)
        .eq('step_type', 'sprint')
        .order('order_index', { ascending: true })
      if (sprintData && sprintData.length > 0) {
        quarterInitiatives = sprintData
        devLog('[PlanAssembler] Quarter rocks loaded from sprint step_type with ID:', tryId, sprintData.length)
        break
      }
    }
    quarterInitiatives = quarterInitiatives || []
  }

  // Assemble the data
  const planData: OnePagePlanData = {
    vision: visionMission.vision_statement || '',
    mission: visionMission.mission_statement || '',
    coreValues: (visionMission.core_values || []).filter((v: string) => v.trim()),

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
      quarters: [],
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

  return {
    planData,
    allQuarters: quarters,
    selectedQuarterId: effectiveQuarterId!,
  }
}
