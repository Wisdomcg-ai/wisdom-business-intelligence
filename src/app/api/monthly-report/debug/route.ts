// /api/monthly-report/debug
// Diagnostic endpoint to debug the forecast → monthly report pipeline
// Shows forecast_pl_lines, xero_pl_lines, account_mappings, and match analysis

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids'

export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    // Auth check
    const supabase = await createRouteHandlerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const business_id = searchParams.get('business_id')
    if (!business_id) {
      return NextResponse.json({ error: 'business_id required' }, { status: 400 })
    }

    // 1. Find active forecast (resolve business_profiles.id from businesses.id)
    const ids = await resolveBusinessIds(supabaseAdmin, business_id)
    let forecast: any = null
    const { data: fc } = await supabaseAdmin
      .from('financial_forecasts')
      .select('id, name, fiscal_year, is_active, is_completed, created_at, updated_at')
      .in('business_id', ids.all)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (fc) { forecast = fc }

    // 2. Get forecast_pl_lines
    let forecastLines: any[] = []
    if (forecast) {
      const { data } = await supabaseAdmin
        .from('forecast_pl_lines')
        .select('id, account_name, category, forecast_months, actual_months, is_from_xero')
        .eq('forecast_id', forecast.id)
      forecastLines = data || []
    }

    // 3. Get xero_pl_lines
    const { data: xeroLines } = await supabaseAdmin
      .from('xero_pl_lines')
      .select('account_name, account_type, section, monthly_values')
      .eq('business_id', business_id)

    // 4. Get account_mappings
    const { data: mappings } = await supabaseAdmin
      .from('account_mappings')
      .select('xero_account_name, report_category, forecast_pl_line_id, forecast_pl_line_name, is_confirmed')
      .eq('business_id', business_id)

    // 5. Build match analysis
    const forecastByNameLower = new Map<string, any>()
    for (const fl of forecastLines) {
      forecastByNameLower.set(fl.account_name.toLowerCase(), fl)
    }

    const matchAnalysis = (xeroLines || []).map(xero => {
      const mapping = (mappings || []).find(m => m.xero_account_name === xero.account_name)
      const exactMatch = forecastByNameLower.get(xero.account_name.toLowerCase())
      const linkedViaMapping = mapping?.forecast_pl_line_id
        ? forecastLines.find(fl => fl.id === mapping.forecast_pl_line_id)
        : null

      // Normalize for fuzzy matching
      const xeroNorm = normalizeName(xero.account_name)
      const fuzzyMatch = forecastLines.find(fl => normalizeName(fl.account_name) === xeroNorm)

      // Check for non-zero budget
      const matchedLine = linkedViaMapping || exactMatch || fuzzyMatch
      const hasBudgetData = matchedLine
        ? Object.values(matchedLine.forecast_months || {}).some((v: any) => v !== 0)
        : false

      // Sample month from actuals
      const sampleActualMonth = Object.keys(xero.monthly_values || {})[0] || null
      const sampleActualValue = sampleActualMonth ? xero.monthly_values[sampleActualMonth] : null

      return {
        xero_account: xero.account_name,
        xero_type: xero.account_type,
        mapping_exists: !!mapping,
        mapping_category: mapping?.report_category || null,
        linked_forecast_line: linkedViaMapping?.account_name || null,
        exact_name_match: exactMatch?.account_name || null,
        fuzzy_name_match: fuzzyMatch?.account_name || null,
        has_budget_data: hasBudgetData,
        match_status: linkedViaMapping ? 'linked' : exactMatch ? 'exact_match' : fuzzyMatch ? 'fuzzy_only' : 'no_match',
        sample_actual: sampleActualValue,
      }
    })

    // 6. Summary
    const totalXero = (xeroLines || []).length
    const linked = matchAnalysis.filter(m => m.match_status === 'linked').length
    const exactMatched = matchAnalysis.filter(m => m.match_status === 'exact_match').length
    const fuzzyOnly = matchAnalysis.filter(m => m.match_status === 'fuzzy_only').length
    const noMatch = matchAnalysis.filter(m => m.match_status === 'no_match').length
    const withBudget = matchAnalysis.filter(m => m.has_budget_data).length

    // 7. Forecast lines that have NO matching Xero account
    const matchedForecastNames = new Set(
      matchAnalysis
        .map(m => m.linked_forecast_line || m.exact_name_match || m.fuzzy_name_match)
        .filter(Boolean)
        .map((n: string) => n.toLowerCase())
    )
    const unmatchedForecastLines = forecastLines
      .filter(fl => !matchedForecastNames.has(fl.account_name.toLowerCase()))
      .map(fl => ({
        account_name: fl.account_name,
        category: fl.category,
        has_forecast_data: Object.values(fl.forecast_months || {}).some((v: any) => v !== 0),
        sample_month: Object.keys(fl.forecast_months || {})[0],
        sample_value: Object.values(fl.forecast_months || {})[0],
      }))

    return NextResponse.json({
      forecast: forecast ? {
        id: forecast.id,
        name: forecast.name,
        fiscal_year: forecast.fiscal_year,
        is_active: forecast.is_active,
        is_completed: forecast.is_completed,
      } : null,
      counts: {
        forecast_pl_lines: forecastLines.length,
        xero_pl_lines: totalXero,
        account_mappings: (mappings || []).length,
      },
      match_summary: {
        linked_via_mapping: linked,
        exact_name_match: exactMatched,
        fuzzy_match_possible: fuzzyOnly,
        no_match: noMatch,
        with_budget_data: withBudget,
      },
      match_detail: matchAnalysis,
      unmatched_forecast_lines: unmatchedForecastLines,
      forecast_lines_sample: forecastLines.slice(0, 5).map(fl => ({
        name: fl.account_name,
        category: fl.category,
        months: Object.keys(fl.forecast_months || {}).slice(0, 3),
        sample_values: Object.entries(fl.forecast_months || {}).slice(0, 3),
      })),
      xero_lines_sample: (xeroLines || []).slice(0, 5).map(xl => ({
        name: xl.account_name,
        type: xl.account_type,
        months: Object.keys(xl.monthly_values || {}).slice(0, 3),
        sample_values: Object.entries(xl.monthly_values || {}).slice(0, 3),
      })),
    })

  } catch (error) {
    console.error('[Report Debug] Error:', error)
    return NextResponse.json({ error: 'Debug failed' }, { status: 500 })
  }
}

/** Normalize account name for fuzzy matching */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[&]/g, 'and')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
