import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const supabase = await createRouteHandlerClient()

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      businessId,
      fiscalYear,
      forecastDuration,
      forecastId,
      forecastName,
      createNew,
      isDraft,
      assumptions,
      summary,
    } = body

    if (!businessId || !fiscalYear) {
      return NextResponse.json(
        { error: 'businessId and fiscalYear are required' },
        { status: 400 }
      )
    }

    // Verify user has access to this business
    // businessId is businesses.id — check ownership, team membership, or coach/admin role
    const { data: business, error: bizError } = await supabase
      .from('businesses')
      .select('id, owner_id')
      .eq('id', businessId)
      .maybeSingle()

    if (bizError || !business) {
      return NextResponse.json(
        { error: 'Business not found or access denied' },
        { status: 403 }
      )
    }

    const isOwner = business.owner_id === user.id
    if (!isOwner) {
      // Check team membership
      const { data: teamMember } = await supabase
        .from('business_users')
        .select('id')
        .eq('business_id', businessId)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle()

      if (!teamMember) {
        // Check coach/admin
        const { data: roleData } = await supabase
          .from('system_roles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle()

        const isCoachOrAdmin = roleData?.role === 'coach' || roleData?.role === 'super_admin'
        if (!isCoachOrAdmin) {
          return NextResponse.json(
            { error: 'Business not found or access denied' },
            { status: 403 }
          )
        }
      }
    }

    // financial_forecasts.business_id FK references business_profiles(id),
    // but the wizard passes businesses.id — translate it
    let profileId = businessId
    const { data: profile } = await supabase
      .from('business_profiles')
      .select('id')
      .eq('business_id', businessId)
      .maybeSingle()

    if (profile?.id) {
      profileId = profile.id
    }

    // Build the forecast data to upsert
    const year1 = summary?.year1 || {}
    const forecastData: Record<string, unknown> = {
      business_id: profileId,
      user_id: user.id,
      fiscal_year: fiscalYear,
      name: forecastName || `FY${fiscalYear} Forecast`,
      year_type: 'FY',
      actual_start_month: `${fiscalYear - 2}-07`,
      actual_end_month: `${fiscalYear - 1}-06`,
      forecast_start_month: `${fiscalYear - 1}-07`,
      forecast_end_month: `${fiscalYear + (forecastDuration || 1) - 1}-06`,
      revenue_goal: year1.revenue || 0,
      gross_profit_goal: year1.grossProfit || 0,
      net_profit_goal: year1.netProfit || 0,
      goal_source: 'wizard_v4',
      assumptions: assumptions || null,
      forecast_duration: forecastDuration || 1,
      wizard_state: summary || null,
      updated_at: new Date().toISOString(),
    }

    // If not a draft (i.e., final generate), mark as completed
    if (!isDraft) {
      forecastData.is_completed = true
      forecastData.completed_at = new Date().toISOString()
    }

    let resultForecastId: string

    if (forecastId && !createNew) {
      // UPDATE existing forecast
      const { data: updated, error: updateError } = await supabase
        .from('financial_forecasts')
        .update(forecastData)
        .eq('id', forecastId)
        .select('id')
        .single()

      if (updateError) {
        console.error('[wizard-v4/generate] Update error:', updateError)
        return NextResponse.json(
          { error: 'Failed to update forecast', details: updateError.message },
          { status: 500 }
        )
      }

      resultForecastId = updated.id
    } else {
      // INSERT new forecast
      const { data: inserted, error: insertError } = await supabase
        .from('financial_forecasts')
        .insert(forecastData)
        .select('id')
        .single()

      if (insertError) {
        console.error('[wizard-v4/generate] Insert error:', insertError)
        return NextResponse.json(
          { error: 'Failed to create forecast', details: insertError.message },
          { status: 500 }
        )
      }

      resultForecastId = inserted.id
    }

    return NextResponse.json({
      success: true,
      forecastId: resultForecastId,
    })
  } catch (error) {
    console.error('[wizard-v4/generate] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
