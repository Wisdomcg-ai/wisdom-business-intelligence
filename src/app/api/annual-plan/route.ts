import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * GET /api/annual-plan?user_id=xxx
 * Fetches the user's annual plan data including Year 1 targets from Goals & Targets wizard
 *
 * This API fetches data from:
 * 1. business_financial_goals table (Year 1 targets from Goals & Targets wizard)
 * 2. Strategic initiatives (selected for annual plan)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('user_id')

    if (!userId) {
      return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
    }

    // 1. Get business profile to find business_id
    const { data: businessProfile } = await supabase
      .from('business_profiles')
      .select('id, business_name, annual_revenue')
      .eq('user_id', userId)
      .maybeSingle()

    if (!businessProfile) {
      return NextResponse.json({
        error: 'No business profile found',
        revenue_target: null,
        profit_target: null,
        source: 'none'
      }, { status: 404 })
    }

    // 2. Get financial goals from Goals & Targets wizard
    const { data: financialGoals, error: goalsError } = await supabase
      .from('business_financial_goals')
      .select('*')
      .eq('business_id', businessProfile.id)
      .maybeSingle()

    // Extract Year 1 targets (12-month targets)
    let revenueTarget = null
    let grossProfitTarget = null
    let profitTarget = null
    let goalsDate = null

    if (financialGoals && !goalsError) {
      revenueTarget = financialGoals.revenue_year1 || null
      grossProfitTarget = financialGoals.gross_profit_year1 || null
      profitTarget = financialGoals.net_profit_year1 || null
      goalsDate = financialGoals.updated_at
    }

    // 3. Get strategic initiatives selected for annual plan
    const { data: initiatives } = await supabase
      .from('strategic_initiatives')
      .select('*')
      .eq('user_id', userId)
      .eq('selected_for_annual_plan', true)
      .order('created_at', { ascending: false })

    // Prepare response
    const annualPlanData = {
      // Financial targets (Year 1 from Goals & Targets wizard)
      revenue_target: revenueTarget,
      gross_profit_target: grossProfitTarget,
      profit_target: profitTarget,

      // Source information
      has_financial_goals: !!financialGoals,
      goals_date: goalsDate,

      // Strategic context
      initiatives_count: initiatives?.length || 0,
      initiatives: initiatives || [],

      // Business context
      business_name: businessProfile.business_name || '',
      business_id: businessProfile.id,
      current_revenue: businessProfile.annual_revenue || null,

      // Metadata
      source: financialGoals ? 'goals_wizard' : 'none'
    }

    return NextResponse.json(annualPlanData)

  } catch (error) {
    console.error('Error fetching annual plan:', error)
    return NextResponse.json(
      { error: 'Failed to fetch annual plan data' },
      { status: 500 }
    )
  }
}
