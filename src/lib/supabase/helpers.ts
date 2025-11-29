// src/lib/supabase/helpers.ts
import { createClient } from './client'
import type { Database } from './types'

type DbBusinessProfile = Database['public']['Tables']['business_profiles']['Row']
type DbStrategicGoals = Database['public']['Tables']['strategic_goals']['Row']
type DbKPI = Database['public']['Tables']['kpis']['Row']
type DbStrategicInitiative = Database['public']['Tables']['strategic_initiatives']['Row']

// =====================================================
// EMERGENCY FIX - BUSINESS PROFILE MANAGEMENT
// =====================================================

export async function ensureBusinessProfile(): Promise<string> {
  const supabase = createClient()
  
  try {
    console.log('🔍 Ensuring business profile exists...')
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      console.error('❌ Authentication error:', userError)
      throw new Error('Not authenticated')
    }
    
    console.log('✅ User authenticated:', user.id)
    
    // Try to get existing business profile with explicit error handling
    const { data: existingProfile, error: selectError } = await supabase
      .from('business_profiles')
      .select('id, company_name')
      .eq('user_id', user.id)
      .maybeSingle() // Use maybeSingle to avoid errors when no rows found
    
    if (selectError) {
      console.error('❌ Error querying business profiles:', selectError)
      throw new Error(`Database query failed: ${selectError.message}`)
    }
    
    if (existingProfile) {
      console.log('✅ Found existing business profile:', existingProfile.id)
      return existingProfile.id
    }
    
    console.log('⚠️ No business profile found, creating new one...')
    
    // Create new business profile
    const { data: newProfile, error: insertError } = await supabase
      .from('business_profiles')
      .insert({
        user_id: user.id,
        company_name: 'My Company',
        current_revenue: 500000,
        employee_count: 2,
        industry: 'professional_services'
      })
      .select('id')
      .single()
    
    if (insertError) {
      console.error('❌ Error creating business profile:', insertError)
      throw new Error(`Failed to create business profile: ${insertError.message}`)
    }
    
    console.log('✅ Created new business profile:', newProfile.id)
    return newProfile.id
    
  } catch (error) {
    console.error('❌ Critical error in ensureBusinessProfile:', error)
    throw error
  }
}

export async function getBusinessProfile(): Promise<DbBusinessProfile | null> {
  const supabase = createClient()
  
  try {
    console.log('🔍 Loading business profile...')
    
    const businessProfileId = await ensureBusinessProfile()
    
    const { data, error } = await supabase
      .from('business_profiles')
      .select('*')
      .eq('id', businessProfileId)
      .single()
    
    if (error) {
      console.error('❌ Error fetching business profile details:', error)
      return null
    }
    
    console.log('✅ Business profile loaded successfully')
    return data
    
  } catch (error) {
    console.error('❌ Error in getBusinessProfile:', error)
    return null
  }
}

// =====================================================
// STRATEGIC GOALS - FIXED VERSION
// =====================================================

export async function upsertStrategicGoals(data: {
  bhag_statement?: string
  bhag_metrics?: string
  bhag_deadline?: string
  three_year_goals?: any
}): Promise<DbStrategicGoals | null> {
  const supabase = createClient()
  
  try {
    console.log('💾 Upserting strategic goals...')
    
    const businessProfileId = await ensureBusinessProfile()
    
    // Check if strategic goals already exist
    const { data: existing, error: selectError } = await supabase
      .from('strategic_goals')
      .select('id')
      .eq('business_profile_id', businessProfileId)
      .maybeSingle()
    
    if (selectError) {
      console.error('❌ Error checking existing strategic goals:', selectError)
      throw selectError
    }
    
    const goalData = {
      business_profile_id: businessProfileId,
      bhag_statement: data.bhag_statement || null,
      bhag_metrics: data.bhag_metrics || null,
      bhag_deadline: data.bhag_deadline || new Date(Date.now() + 3 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      three_year_goals: data.three_year_goals || {}
    }
    
    if (existing?.id) {
      // Update existing record
      const { data: updated, error: updateError } = await supabase
        .from('strategic_goals')
        .update(goalData)
        .eq('id', existing.id)
        .select()
        .single()
      
      if (updateError) {
        console.error('❌ Error updating strategic goals:', updateError)
        throw updateError
      }
      
      console.log('✅ Updated strategic goals successfully')
      return updated
    } else {
      // Insert new record
      const { data: inserted, error: insertError } = await supabase
        .from('strategic_goals')
        .insert(goalData)
        .select()
        .single()
      
      if (insertError) {
        console.error('❌ Error inserting strategic goals:', insertError)
        throw insertError
      }
      
      console.log('✅ Created strategic goals successfully')
      return inserted
    }
  } catch (error) {
    console.error('❌ Error in upsertStrategicGoals:', error)
    return null
  }
}

export async function getStrategicGoals(): Promise<DbStrategicGoals | null> {
  const supabase = createClient()
  
  try {
    console.log('🔍 Loading strategic goals...')
    
    const businessProfileId = await ensureBusinessProfile()
    
    const { data, error } = await supabase
      .from('strategic_goals')
      .select('*')
      .eq('business_profile_id', businessProfileId)
      .maybeSingle()
    
    if (error) {
      console.error('❌ Error fetching strategic goals:', error)
      return null
    }
    
    if (data) {
      console.log('✅ Strategic goals loaded successfully')
    } else {
      console.log('⚠️ No strategic goals found')
    }
    
    return data
  } catch (error) {
    console.error('❌ Error in getStrategicGoals:', error)
    return null
  }
}

// =====================================================
// KPIS - FIXED VERSION
// =====================================================

export async function batchUpsertKPIs(kpis: any[]): Promise<boolean> {
  const supabase = createClient()
  
  try {
    console.log('💾 Batch upserting KPIs...', kpis.length)
    
    const businessProfileId = await ensureBusinessProfile()
    
    // Delete existing KPIs first (safer than complex upsert logic)
    const { error: deleteError } = await supabase
      .from('kpis')
      .delete()
      .eq('business_profile_id', businessProfileId)
    
    if (deleteError) {
      console.warn('⚠️ Warning deleting existing KPIs:', deleteError)
    }
    
    // Insert new KPIs if any provided
    if (kpis.length > 0) {
      const kpiData = kpis.map((kpi, index) => ({
        business_profile_id: businessProfileId,
        kpi_id: kpi.id || kpi.kpi_id || `kpi_${Date.now()}_${index}`,
        name: kpi.name,
        category: kpi.category,
        current_value: Number(kpi.currentValue || kpi.current_value || 0),
        year1_target: Number(kpi.year1Target || kpi.year1_target || 0),
        year2_target: Number(kpi.year2Target || kpi.year2_target || kpi.year1Target || kpi.year1_target || 0) * 1.2,
        year3_target: Number(kpi.year3Target || kpi.year3_target || kpi.year1Target || kpi.year1_target || 0) * 1.5,
        unit: kpi.unit || 'number',
        frequency: kpi.frequency || 'monthly'
      }))
      
      const { error: insertError } = await supabase
        .from('kpis')
        .insert(kpiData)
      
      if (insertError) {
        console.error('❌ Error inserting KPIs:', insertError)
        throw insertError
      }
      
      console.log('✅ Successfully inserted', kpis.length, 'KPIs')
    }
    
    return true
  } catch (error) {
    console.error('❌ Error in batchUpsertKPIs:', error)
    return false
  }
}

export async function getKPIs(): Promise<DbKPI[]> {
  const supabase = createClient()
  
  try {
    console.log('🔍 Loading KPIs...')
    
    const businessProfileId = await ensureBusinessProfile()
    
    const { data, error } = await supabase
      .from('kpis')
      .select('*')
      .eq('business_profile_id', businessProfileId)
      .order('category', { ascending: true })
    
    if (error) {
      console.error('❌ Error fetching KPIs:', error)
      return []
    }
    
    console.log('✅ Loaded', data?.length || 0, 'KPIs')
    return data || []
  } catch (error) {
    console.error('❌ Error in getKPIs:', error)
    return []
  }
}

// =====================================================
// STRATEGIC INITIATIVES - FIXED VERSION  
// =====================================================

export async function batchUpsertStrategicInitiatives(initiatives: any[]): Promise<boolean> {
  const supabase = createClient()
  
  try {
    console.log('💾 Batch upserting strategic initiatives...', initiatives.length)
    
    const businessProfileId = await ensureBusinessProfile()
    
    // Get existing initiatives to avoid duplicates
    const { data: existing, error: selectError } = await supabase
      .from('strategic_initiatives')
      .select('id, title')
      .eq('business_profile_id', businessProfileId)
    
    if (selectError) {
      console.warn('⚠️ Warning checking existing initiatives:', selectError)
    }
    
    const existingTitles = new Set(existing?.map(i => i.title) || [])
    
    // Filter out initiatives that already exist (by title)
    const newInitiatives = initiatives.filter(initiative => 
      !existingTitles.has(initiative.title)
    )
    
    if (newInitiatives.length > 0) {
      const initiativeData = newInitiatives.map((initiative, index) => ({
        business_profile_id: businessProfileId,
        title: initiative.title,
        category: initiative.category || 'Strategic',
        is_from_roadmap: Boolean(initiative.isFromRoadmap || initiative.is_from_roadmap),
        custom_source: initiative.customSource || initiative.custom_source || null,
        selected: Boolean(initiative.selected),
        quarter_assignment: initiative.quarterAssignment || initiative.quarter_assignment || null,
        order_index: initiative.orderIndex || initiative.order_index || index
      }))
      
      const { error: insertError } = await supabase
        .from('strategic_initiatives')
        .insert(initiativeData)
      
      if (insertError) {
        console.error('❌ Error inserting strategic initiatives:', insertError)
        throw insertError
      }
      
      console.log('✅ Successfully inserted', newInitiatives.length, 'new strategic initiatives')
    } else {
      console.log('ℹ️ No new initiatives to insert')
    }
    
    return true
  } catch (error) {
    console.error('❌ Error in batchUpsertStrategicInitiatives:', error)
    return false
  }
}

export async function updateInitiativeSelection(
  initiativeId: string, 
  selected: boolean, 
  quarterAssignment?: string
): Promise<boolean> {
  const supabase = createClient()
  
  try {
    console.log('💾 Updating initiative selection...', initiativeId)
    
    const updateData: any = { selected }
    if (quarterAssignment !== undefined) {
      updateData.quarter_assignment = quarterAssignment
    }
    
    const { error } = await supabase
      .from('strategic_initiatives')
      .update(updateData)
      .eq('id', initiativeId)
    
    if (error) {
      console.error('❌ Error updating initiative selection:', error)
      return false
    }
    
    console.log('✅ Initiative updated successfully')
    return true
  } catch (error) {
    console.error('❌ Error in updateInitiativeSelection:', error)
    return false
  }
}

export async function getStrategicInitiatives(): Promise<DbStrategicInitiative[]> {
  const supabase = createClient()
  
  try {
    console.log('🔍 Loading strategic initiatives...')
    
    const businessProfileId = await ensureBusinessProfile()
    
    const { data, error } = await supabase
      .from('strategic_initiatives')
      .select('*')
      .eq('business_profile_id', businessProfileId)
      .eq('selected', true) // Only get selected initiatives for Annual Plan
      .order('order_index', { ascending: true })
    
    if (error) {
      console.error('❌ Error fetching strategic initiatives:', error)
      return []
    }
    
    console.log('✅ Loaded', data?.length || 0, 'strategic initiatives')
    return data || []
  } catch (error) {
    console.error('❌ Error in getStrategicInitiatives:', error)
    return []
  }
}

// =====================================================
// COMPREHENSIVE DATA LOADING - FIXED VERSION
// =====================================================

export async function loadCompleteStrategicPlan() {
  try {
    console.log('🚀 Loading complete strategic plan...')
    
    // Load business profile first
    const businessProfile = await getBusinessProfile()
    
    if (!businessProfile) {
      console.error('❌ No business profile available')
      return {
        businessProfile: null,
        strategicGoals: null,
        kpis: [],
        initiatives: [],
        isLoaded: false,
        error: 'No business profile found'
      }
    }
    
    // Load all other data in parallel with error isolation
    const [strategicGoals, kpis, initiatives] = await Promise.allSettled([
      getStrategicGoals(),
      getKPIs(), 
      getStrategicInitiatives()
    ])
    
    // Extract results with fallbacks
    const strategicGoalsResult = strategicGoals.status === 'fulfilled' ? strategicGoals.value : null
    const kpisResult = kpis.status === 'fulfilled' ? kpis.value : []
    const initiativesResult = initiatives.status === 'fulfilled' ? initiatives.value : []
    
    console.log('✅ Complete strategic plan loaded:', {
      hasGoals: !!strategicGoalsResult,
      kpisCount: kpisResult.length,
      initiativesCount: initiativesResult.length
    })
    
    return {
      businessProfile,
      strategicGoals: strategicGoalsResult,
      kpis: kpisResult,
      initiatives: initiativesResult,
      isLoaded: true
    }
  } catch (error) {
    console.error('❌ Error loading complete strategic plan:', error)
    return {
      businessProfile: null,
      strategicGoals: null,
      kpis: [],
      initiatives: [],
      isLoaded: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

// =====================================================
// DEMO DATA FALLBACKS - ENHANCED
// =====================================================

export function getDemoStrategicGoals() {
  return {
    id: 'demo-goals',
    business_profile_id: 'demo-profile',
    bhag_statement: 'Build Australia\'s leading business coaching platform serving 1,000+ SMBs by 2027',
    bhag_metrics: '1,000 active clients, $5M ARR, 95% satisfaction rate',
    bhag_deadline: '2027-12-31',
    three_year_goals: {
      revenue_current: 500000,
      revenue_1_year: 750000,
      revenue_2_year: 1200000,
      revenue_3_year: 2000000,
      gross_profit_current: 200000,
      gross_profit_1_year: 337500,
      gross_profit_2_year: 600000,
      gross_profit_3_year: 1000000,
      net_profit_current: 50000,
      net_profit_1_year: 112500,
      net_profit_2_year: 240000,
      net_profit_3_year: 500000,
      gross_margin_current: 40,
      gross_margin_1_year: 45,
      gross_margin_2_year: 50,
      gross_margin_3_year: 50,
      net_margin_current: 10,
      net_margin_1_year: 15,
      net_margin_2_year: 20,
      net_margin_3_year: 25,
      customers_current: 50,
      customers_1_year: 100,
      customers_2_year: 200,
      customers_3_year: 400,
      employees_current: 2,
      employees_1_year: 5,
      employees_2_year: 12,
      employees_3_year: 25,
      year_type: 'FY' as const
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
}

export function getDemoKPIs() {
  return [
    { 
      id: 'demo-kpi-1', 
      name: 'Monthly Recurring Revenue', 
      category: 'Financial', 
      currentValue: 20833, 
      year1Target: 62500,
      unit: 'currency', 
      frequency: 'monthly' 
    },
    { 
      id: 'demo-kpi-2', 
      name: 'Customer Acquisition Cost', 
      category: 'Marketing', 
      currentValue: 250, 
      year1Target: 150,
      unit: 'currency', 
      frequency: 'monthly' 
    },
    { 
      id: 'demo-kpi-3', 
      name: 'Customer Lifetime Value', 
      category: 'Financial', 
      currentValue: 2400, 
      year1Target: 4800,
      unit: 'currency', 
      frequency: 'quarterly' 
    },
    { 
      id: 'demo-kpi-4', 
      name: 'Net Promoter Score', 
      category: 'Customer', 
      currentValue: 45, 
      year1Target: 70,
      unit: 'score', 
      frequency: 'quarterly' 
    },
    { 
      id: 'demo-kpi-5', 
      name: 'Team Satisfaction Score', 
      category: 'People', 
      currentValue: 7.2, 
      year1Target: 8.5,
      unit: 'rating', 
      frequency: 'quarterly' 
    },
    { 
      id: 'demo-kpi-6', 
      name: 'Monthly Active Users', 
      category: 'Product', 
      currentValue: 150, 
      year1Target: 500,
      unit: 'number', 
      frequency: 'monthly' 
    }
  ]
}

export function getDemoInitiatives() {
  return [
    { 
      id: 'demo-init-1', 
      title: 'Launch AI-powered business assessment tool', 
      category: 'Product Development', 
      selected: true, 
      quarterAssignment: 'q1' 
    },
    { 
      id: 'demo-init-2', 
      title: 'Implement comprehensive financial dashboard', 
      category: 'Technology', 
      selected: true, 
      quarterAssignment: 'q1' 
    },
    { 
      id: 'demo-init-3', 
      title: 'Build multi-client coach management system', 
      category: 'Product Development', 
      selected: true, 
      quarterAssignment: 'q2' 
    },
    { 
      id: 'demo-init-4', 
      title: 'Create strategic planning automation', 
      category: 'Product Development', 
      selected: true, 
      quarterAssignment: 'q2' 
    },
    { 
      id: 'demo-init-5', 
      title: 'Develop mobile companion app', 
      category: 'Technology', 
      selected: true, 
      quarterAssignment: 'q3' 
    },
    { 
      id: 'demo-init-6', 
      title: 'Integrate with accounting platforms', 
      category: 'Technology', 
      selected: true, 
      quarterAssignment: 'q3' 
    },
    { 
      id: 'demo-init-7', 
      title: 'Launch partner program for business coaches', 
      category: 'Business Development', 
      selected: true, 
      quarterAssignment: 'q4' 
    },
    { 
      id: 'demo-init-8', 
      title: 'Implement advanced analytics & reporting', 
      category: 'Product Development', 
      selected: false, 
      quarterAssignment: null 
    }
  ]
}