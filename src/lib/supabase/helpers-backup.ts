// src/lib/supabase/helpers.ts
import { createClient } from './client'
import type { Database } from './types'

type DbStrategicInitiative = Database['public']['Tables']['strategic_initiatives']['Row']
type DbNinetyDaySprint = Database['public']['Tables']['ninety_day_sprints']['Row']

// Batch operations for better performance
export async function batchUpsertKPIs(
  businessProfileId: string,
  kpis: any[]
) {
  const supabase = createClient()
  
  // Delete existing KPIs first
  await supabase
    .from('kpis')
    .delete()
    .eq('business_profile_id', businessProfileId)
  
  // Insert new KPIs
  if (kpis.length > 0) {
    const { error } = await supabase
      .from('kpis')
      .insert(
        kpis.map(kpi => ({
          business_profile_id: businessProfileId,
          kpi_id: kpi.id,
          name: kpi.name,
          category: kpi.category,
          current_value: kpi.currentValue,
          year1_target: kpi.year1Target,
          year2_target: kpi.year2Target,
          year3_target: kpi.year3Target,
          unit: kpi.unit,
          frequency: kpi.frequency
        }))
      )
    
    if (error) throw error
  }
}

export async function batchUpsertStrategicInitiatives(
  businessProfileId: string,
  initiatives: any[]
) {
  const supabase = createClient()
  
  // Get existing initiatives
  const { data: existing } = await supabase
    .from('strategic_initiatives')
    .select('id')
    .eq('business_profile_id', businessProfileId)
  
  const existingIds = new Set(existing?.map(i => i.id) || [])
  
  // Separate initiatives into insert and update
  const toInsert = initiatives.filter(i => 
    i.id.startsWith('roadmap-') || i.id.startsWith('custom-') || !existingIds.has(i.id)
  )
  const toUpdate = initiatives.filter(i => 
    !i.id.startsWith('roadmap-') && !i.id.startsWith('custom-') && existingIds.has(i.id)
  )
  
  // Perform batch operations
  const operations = []
  
  if (toInsert.length > 0) {
    operations.push(
      supabase
        .from('strategic_initiatives')
        .insert(
          toInsert.map((item, index) => ({
            business_profile_id: businessProfileId,
            title: item.title,
            category: item.category,
            is_from_roadmap: item.isFromRoadmap,
            custom_source: item.customSource || null,
            selected: item.selected,
            quarter_assignment: item.quarterAssignment,
            order_index: index
          }))
        )
    )
  }
  
  if (toUpdate.length > 0) {
    operations.push(
      ...toUpdate.map((item, index) =>
        supabase
          .from('strategic_initiatives')
          .update({
            title: item.title,
            category: item.category,
            selected: item.selected,
            quarter_assignment: item.quarterAssignment,
            order_index: toInsert.length + index
          })
          .eq('id', item.id)
      )
    )
  }
  
  await Promise.all(operations)
}

export async function loadCompleteStrategicPlan(businessProfileId: string) {
  const supabase = createClient()
  
  // Load all data in parallel for better performance
  const [
    profileResult,
    goalsResult,
    kpisResult,
    initiativesResult,
    sprintsResult
  ] = await Promise.all([
    supabase
      .from('business_profiles')
      .select('*')
      .eq('id', businessProfileId)
      .single(),
    
    supabase
      .from('strategic_goals')
      .select('*')
      .eq('business_profile_id', businessProfileId)
      .single(),
    
    supabase
      .from('kpis')
      .select('*')
      .eq('business_profile_id', businessProfileId)
      .order('created_at', { ascending: true }),
    
    supabase
      .from('strategic_initiatives')
      .select('*')
      .eq('business_profile_id', businessProfileId)
      .order('order_index', { ascending: true }),
    
    supabase
      .from('ninety_day_sprints')
      .select(`
        *,
        sprint_milestones (*)
      `)
      .eq('business_profile_id', businessProfileId)
      .eq('year', new Date().getFullYear())
      .order('created_at', { ascending: true })
  ])
  
  return {
    profile: profileResult.data,
    goals: goalsResult.data,
    kpis: kpisResult.data || [],
    initiatives: initiativesResult.data || [],
    sprints: sprintsResult.data || []
  }
}

// Quarterly plan helpers
export async function generateQuarterlyPlans(
  businessProfileId: string,
  year: number,
  revenueGoal: number,
  profitGoal: number,
  kpiTargets: any[]
) {
  const supabase = createClient()
  const quarters = ['q1', 'q2', 'q3', 'q4']
  
  const plans = quarters.map((quarter, index) => ({
    business_profile_id: businessProfileId,
    year,
    quarter,
    revenue_target: Math.round(revenueGoal * ((index + 1) / 4)),
    profit_target: Math.round(profitGoal * ((index + 1) / 4)),
    kpi_targets: kpiTargets.map(kpi => ({
      id: kpi.id,
      name: kpi.name,
      target: Math.round(kpi.year1Target * ((index + 1) / 4)),
      unit: kpi.unit
    }))
  }))
  
  const { error } = await supabase
    .from('quarterly_plans')
    .upsert(plans, { onConflict: 'business_profile_id,year,quarter' })
  
  if (error) throw error
  return plans
}

// Export data for reporting
export async function exportStrategicPlanData(businessProfileId: string) {
  const data = await loadCompleteStrategicPlan(businessProfileId)
  
  return {
    exportDate: new Date().toISOString(),
    businessProfile: data.profile,
    strategicGoals: data.goals,
    kpis: data.kpis,
    initiatives: data.initiatives,
    sprints: data.sprints,
    metadata: {
      version: '1.0',
      totalKPIs: data.kpis.length,
      totalInitiatives: data.initiatives.length,
      activeSprintItems: data.sprints.filter((s: any) => s.status !== 'completed').length
    }
  }
}

// Validation helpers
export function validateStrategicPlan(plan: any) {
  const errors: string[] = []
  
  if (!plan.bhag?.statement) {
    errors.push('BHAG statement is required')
  }
  
  if (!plan.threeYearGoals || plan.threeYearGoals.length < 2) {
    errors.push('At least revenue and profit goals are required')
  }
  
  if (plan.selectedInitiatives > 12) {
    errors.push('Maximum 12 initiatives can be selected for annual plan')
  }
  
  if (plan.quarterlyInitiatives) {
    Object.entries(plan.quarterlyInitiatives).forEach(([quarter, items]: [string, any]) => {
      if (items.length > 5) {
        errors.push(`Quarter ${quarter} has too many initiatives (max 5)`)
      }
    })
  }
  
  return {
    isValid: errors.length === 0,
    errors
  }
}

// Real-time collaboration helpers
export function subscribeToStrategicPlan(
  businessProfileId: string,
  onUpdate: (payload: any) => void
) {
  const supabase = createClient()
  
  const channel = supabase.channel(`strategic-plan-${businessProfileId}`)
    .on(
      'postgres_changes',
      { 
        event: '*', 
        schema: 'public',
        filter: `business_profile_id=eq.${businessProfileId}`
      },
      onUpdate
    )
    .subscribe()
  
  return () => {
    supabase.removeChannel(channel)
  }
}

// Progress tracking
export async function calculateStrategicProgress(businessProfileId: string) {
  const data = await loadCompleteStrategicPlan(businessProfileId)
  
  const totalInitiatives = data.initiatives.filter((i: DbStrategicInitiative) => i.selected).length
  const completedSprints = data.sprints.filter((s: DbNinetyDaySprint) => s.status === 'completed').length
  const totalSprints = data.sprints.length
  
  const kpiProgress = data.kpis.map((kpi: any) => {
    const progressPercent = kpi.current_value > 0 && kpi.year1_target > 0
      ? Math.round((kpi.current_value / kpi.year1_target) * 100)
      : 0
    
    return {
      name: kpi.name,
      current: kpi.current_value,
      target: kpi.year1_target,
      progress: progressPercent,
      status: progressPercent >= 100 ? 'achieved' : 
              progressPercent >= 75 ? 'on-track' :
              progressPercent >= 50 ? 'at-risk' : 'behind'
    }
  })
  
  return {
    overallProgress: totalSprints > 0 ? Math.round((completedSprints / totalSprints) * 100) : 0,
    initiativeCount: totalInitiatives,
    sprintCompletion: {
      completed: completedSprints,
      total: totalSprints
    },
    kpiProgress,
    lastUpdated: new Date().toISOString()
  }
}