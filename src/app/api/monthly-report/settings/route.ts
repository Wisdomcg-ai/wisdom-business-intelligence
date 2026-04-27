import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { revertReportIfApproved } from '@/lib/reports/revert-report'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const DEFAULT_SECTIONS = {
  revenue_detail: true,
  cogs_detail: true,
  opex_detail: true,
  payroll_detail: false,
  subscription_detail: false,
  balance_sheet: false,
  cashflow: false,
  trend_charts: true,
  chart_revenue_vs_expenses: true,
  chart_revenue_breakdown: true,
  chart_variance_heatmap: true,
  chart_budget_burn_rate: true,
  chart_break_even: true,
  chart_cash_runway: false,
  chart_cumulative_net_cash: false,
  chart_working_capital_gap: false,
  chart_team_cost_pct: false,
  chart_cost_per_employee: false,
  chart_subscription_creep: false,
}

const DEFAULT_SETTINGS = {
  sections: DEFAULT_SECTIONS,
  show_prior_year: true,
  show_ytd: true,
  show_unspent_budget: true,
  show_budget_next_month: true,
  show_budget_annual_total: true,
  budget_forecast_id: null,
  subscription_account_codes: [],
  wages_account_names: [],
}

/**
 * GET /api/monthly-report/settings?business_id=xxx
 * Returns the settings for this business. If none exist, return the defaults.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('business_id')

    if (!businessId) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 })
    }

    const { data: settings, error } = await supabase
      .from('monthly_report_settings')
      .select('*')
      .eq('business_id', businessId)
      .maybeSingle()

    if (error) {
      console.error('[Monthly Report Settings] Error fetching settings:', error)
      return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
    }

    // If no row exists, return defaults without creating a row
    if (!settings) {
      return NextResponse.json({
        settings: {
          business_id: businessId,
          ...DEFAULT_SETTINGS,
        },
        is_default: true,
      })
    }

    // Merge stored sections with defaults so keys added after initial save are always present
    const mergedSettings = {
      ...settings,
      sections: { ...DEFAULT_SECTIONS, ...(settings.sections ?? {}) },
    }

    return NextResponse.json({
      settings: mergedSettings,
      is_default: false,
    })

  } catch (error) {
    console.error('Error in GET /api/monthly-report/settings:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/monthly-report/settings
 * Upsert settings for a business
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      business_id,
      sections,
      show_prior_year,
      show_ytd,
      show_unspent_budget,
      show_budget_next_month,
      show_budget_annual_total,
      budget_forecast_id,
      subscription_account_codes,
      wages_account_names,
      pdf_layout,
      // Optional: month being edited (YYYY-MM). When provided, an approved/sent report
      // for that month silently reverts to draft per Phase 35 D-16. Settings are business-
      // level so without a month we cannot scope the revert; callers that have a current
      // month should pass it.
      report_month,
    } = body

    if (!business_id) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 })
    }

    // Merge provided sections with defaults (so partial updates work)
    const mergedSections = sections
      ? { ...DEFAULT_SECTIONS, ...sections }
      : DEFAULT_SECTIONS

    const baseData: Record<string, any> = {
      business_id,
      sections: mergedSections,
      show_prior_year: show_prior_year ?? DEFAULT_SETTINGS.show_prior_year,
      show_ytd: show_ytd ?? DEFAULT_SETTINGS.show_ytd,
      show_unspent_budget: show_unspent_budget ?? DEFAULT_SETTINGS.show_unspent_budget,
      show_budget_next_month: show_budget_next_month ?? DEFAULT_SETTINGS.show_budget_next_month,
      show_budget_annual_total: show_budget_annual_total ?? DEFAULT_SETTINGS.show_budget_annual_total,
      budget_forecast_id: budget_forecast_id || null,
      subscription_account_codes: subscription_account_codes || [],
      wages_account_names: wages_account_names || [],
      updated_at: new Date().toISOString(),
    }

    // Only include pdf_layout when explicitly provided
    if (pdf_layout !== undefined) {
      baseData.pdf_layout = pdf_layout
    }

    let { data: settings, error } = await supabase
      .from('monthly_report_settings')
      .upsert(baseData, {
        onConflict: 'business_id',
        ignoreDuplicates: false,
      })
      .select()
      .single()

    // If the error is about pdf_layout column not existing, retry without it
    if (error && pdf_layout !== undefined && error.message?.includes('pdf_layout')) {
      console.warn('[Monthly Report Settings] pdf_layout column not found, retrying without it')
      delete baseData.pdf_layout
      const retry = await supabase
        .from('monthly_report_settings')
        .upsert(baseData, {
          onConflict: 'business_id',
          ignoreDuplicates: false,
        })
        .select()
        .single()
      settings = retry.data
      error = retry.error
    }

    if (error) {
      console.error('[Monthly Report Settings] Error upserting settings:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to save settings' },
        { status: 500 }
      )
    }

    // Phase 35 D-16: Silently revert an approved or sent report to draft after a coach edit
    // (template / section toggle / pdf layout). Preserves snapshot_data (D-18) so the
    // already-sent email link keeps rendering the version the client received.
    // Settings are business-level, so we only revert when the caller passes the current
    // report_month; callers without that context are no-ops here.
    if (report_month) {
      try {
        const periodMonth = `${report_month}-01`
        await revertReportIfApproved(supabase, business_id, periodMonth)
      } catch (revertErr) {
        // Do not fail the save if revert tracking fails — log and continue.
        console.error('[monthly-report/settings] revertReportIfApproved failed:', revertErr)
      }
    }

    return NextResponse.json({ success: true, settings })

  } catch (error) {
    console.error('Error in POST /api/monthly-report/settings:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
