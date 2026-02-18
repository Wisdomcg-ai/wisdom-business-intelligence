import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

    return NextResponse.json({
      settings,
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
    } = body

    if (!business_id) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 })
    }

    // Merge provided sections with defaults (so partial updates work)
    const mergedSections = sections
      ? { ...DEFAULT_SECTIONS, ...sections }
      : DEFAULT_SECTIONS

    const { data: settings, error } = await supabase
      .from('monthly_report_settings')
      .upsert(
        {
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
        },
        {
          onConflict: 'business_id',
          ignoreDuplicates: false,
        }
      )
      .select()
      .single()

    if (error) {
      console.error('[Monthly Report Settings] Error upserting settings:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to save settings' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, settings })

  } catch (error) {
    console.error('Error in POST /api/monthly-report/settings:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
