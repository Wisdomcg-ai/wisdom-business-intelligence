import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { convertAssumptionsToPLLines } from '@/app/finances/forecast/services/assumptions-to-pl-lines'
import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids'

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
    // but the wizard passes businesses.id — resolve both IDs
    const ids = await resolveBusinessIds(supabase, businessId)
    const profileId = ids.profileId

    // Build the forecast data to upsert
    const year1 = summary?.year1 || {}
    const forecastData: Record<string, unknown> = {
      business_id: profileId,
      user_id: business.owner_id || user.id,
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
      // Deactivate any existing active forecast for the same (business, FY, type)
      // before inserting. The partial unique index unique_active_forecast_per_fy
      // would otherwise reject the insert with 23505.
      await supabase
        .from('financial_forecasts')
        .update({ is_active: false })
        .eq('business_id', profileId)
        .eq('fiscal_year', fiscalYear)
        .eq('forecast_type', 'forecast')
        .eq('is_active', true)

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

    // Generate P&L lines from assumptions on every save (drafts included).
    // Previously only materialised on final Generate, which left downstream
    // tools (monthly report, cashflow forecast, dashboard) reading 0 P&L
    // lines for any forecast where the user hadn't clicked the final button —
    // even though they'd been editing for hours and assumptions were saved.
    let plLinesGenerated = 0
    if (assumptions) {
      try {
        const { data: existingPLLines } = await supabase
          .from('forecast_pl_lines')
          .select('*')
          .eq('forecast_id', resultForecastId)
          .order('sort_order', { ascending: true })

        const generatedLines = convertAssumptionsToPLLines({
          assumptions,
          forecastStartMonth: forecastData.forecast_start_month as string,
          forecastEndMonth: forecastData.forecast_end_month as string,
          fiscalYear,
          forecastDuration: forecastDuration || 1,
          existingLines: existingPLLines || [],
        })

        if (generatedLines.length > 0) {
          const linesToUpsert = generatedLines.map((line, i) => ({
            id: line.id || crypto.randomUUID(),
            forecast_id: resultForecastId,
            account_name: line.account_name,
            account_code: line.account_code,
            category: line.category,
            subcategory: line.subcategory,
            sort_order: line.sort_order ?? i,
            actual_months: line.actual_months || {},
            forecast_months: line.forecast_months || {},
            is_from_xero: line.is_from_xero || false,
            is_manual: false,
          }))

          const { error: plError } = await supabase
            .from('forecast_pl_lines')
            .upsert(linesToUpsert, { onConflict: 'id' })

          if (plError) {
            console.error('[wizard-v4/generate] P&L lines error:', plError)
            // Non-fatal — forecast was saved, P&L lines just failed
          } else {
            plLinesGenerated = generatedLines.length
          }
        }
      } catch (plErr) {
        console.error('[wizard-v4/generate] P&L lines generation error:', plErr)
        // Non-fatal
      }
    }

    return NextResponse.json({
      success: true,
      forecastId: resultForecastId,
      plLinesGenerated,
    })
  } catch (error) {
    console.error('[wizard-v4/generate] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
