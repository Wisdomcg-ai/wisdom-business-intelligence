import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildFuzzyLookup } from '@/lib/utils/account-matching'
import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// Map Xero account_type to report_category
function mapAccountTypeToCategory(accountType: string): string {
  switch ((accountType || '').toLowerCase()) {
    case 'revenue':
      return 'Revenue'
    case 'cogs':
      return 'Cost of Sales'
    case 'opex':
      return 'Operating Expenses'
    case 'other_income':
      return 'Other Income'
    case 'other_expense':
      return 'Other Expenses'
    default:
      return 'Operating Expenses'
  }
}

/**
 * POST /api/monthly-report/auto-map
 * Auto-generates initial account mappings from xero_pl_lines.
 * Matching priority:
 *   1. Exact account_code match (most reliable)
 *   2. Fuzzy name match (exact → normalized → word-order independent)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { business_id } = body

    if (!business_id) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 })
    }

    // Resolve dual business IDs (businesses.id vs business_profiles.id)
    const ids = await resolveBusinessIds(supabase, business_id)

    // 1. Query all Xero accounts including account_code (if column exists)
    let { data: xeroAccounts, error: xeroError } = await supabase
      .from('xero_pl_lines')
      .select('account_name, account_code, account_type, section')
      .in('business_id', ids.all)

    // Fallback: if account_code column doesn't exist yet
    if (xeroError?.message?.includes('account_code')) {
      const fallback = await supabase
        .from('xero_pl_lines')
        .select('account_name, account_type, section')
        .in('business_id', ids.all)
      xeroAccounts = (fallback.data || []).map(a => ({ ...a, account_code: null })) as any
      xeroError = fallback.error
    }

    if (xeroError) {
      console.error('[Auto-Map] Error fetching xero_pl_lines:', xeroError)
      return NextResponse.json({ error: 'Failed to fetch Xero accounts' }, { status: 500 })
    }

    if (!xeroAccounts || xeroAccounts.length === 0) {
      return NextResponse.json({
        success: true,
        mapped_count: 0,
        matched_to_forecast_count: 0,
        message: 'No Xero accounts found for this business',
      })
    }

    // Deduplicate by account_name
    const uniqueAccounts = new Map<string, { account_name: string; account_code: string | null; account_type: string; section: string }>()
    for (const acc of xeroAccounts) {
      if (acc.account_name && !uniqueAccounts.has(acc.account_name)) {
        uniqueAccounts.set(acc.account_name, {
          account_name: acc.account_name,
          account_code: acc.account_code || null,
          account_type: acc.account_type || '',
          section: acc.section || '',
        })
      }
    }

    // 2. Find active budget forecast to match forecast P&L lines
    let forecastPLLines: { id: string; account_name: string; account_code: string | null }[] = []
    let matchedToForecastCount = 0
    let matchedByCode = 0
    let matchedByName = 0

    let activeForecast: any = null
    let forecastError: any = null
    const { data: fc, error: err } = await supabase
      .from('financial_forecasts')
      .select('id')
      .in('business_id', ids.all)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (fc) { activeForecast = fc }
    if (err) { forecastError = err }

    if (forecastError) {
      console.error('[Auto-Map] Error fetching active forecast:', forecastError)
    }

    if (activeForecast) {
      const { data: plLines, error: plError } = await supabase
        .from('forecast_pl_lines')
        .select('id, account_name, account_code')
        .eq('forecast_id', activeForecast.id)

      if (plError) {
        console.error('[Auto-Map] Error fetching forecast_pl_lines:', plError)
      } else {
        forecastPLLines = plLines || []
      }
    }

    // Build code-based lookup: account_code → forecast line
    const forecastByCode = new Map<string, { id: string; account_name: string }>()
    for (const line of forecastPLLines) {
      if (line.account_code) {
        forecastByCode.set(line.account_code, { id: line.id, account_name: line.account_name })
      }
    }

    // Build fuzzy name lookup (fallback)
    const findForecastByName = buildFuzzyLookup(
      forecastPLLines,
      (line) => line.account_name
    )

    // 3. Build mapping rows
    const mappingRows = Array.from(uniqueAccounts.values()).map(acc => {
      const reportCategory = mapAccountTypeToCategory(acc.account_type)

      // Priority 1: Match by account_code (deterministic, handles name variations)
      let forecastMatch: { id: string; account_name: string } | undefined
      if (acc.account_code) {
        forecastMatch = forecastByCode.get(acc.account_code)
        if (forecastMatch) matchedByCode++
      }

      // Priority 2: Fuzzy name match (exact → normalized → word-order independent)
      if (!forecastMatch) {
        forecastMatch = findForecastByName(acc.account_name)
        if (forecastMatch) matchedByName++
      }

      if (forecastMatch) matchedToForecastCount++

      return {
        business_id,
        xero_account_code: acc.account_code || null,
        xero_account_name: acc.account_name,
        xero_account_type: acc.account_type || null,
        report_category: reportCategory,
        report_subcategory: acc.section || null,
        forecast_pl_line_id: forecastMatch?.id || null,
        forecast_pl_line_name: forecastMatch?.account_name || null,
        is_auto_mapped: true,
        is_confirmed: false,
        updated_at: new Date().toISOString(),
      }
    })

    // 4. Upsert all mappings
    const { data: upserted, error: upsertError } = await supabase
      .from('account_mappings')
      .upsert(mappingRows, {
        onConflict: 'business_id,xero_account_name',
        ignoreDuplicates: false,
      })
      .select()

    if (upsertError) {
      console.error('[Auto-Map] Error upserting mappings:', upsertError)
      return NextResponse.json(
        { error: upsertError.message || 'Failed to create auto-mappings' },
        { status: 500 }
      )
    }

    console.log(`[Auto-Map] Success: ${upserted?.length || 0} accounts mapped, ${matchedToForecastCount} matched to forecast (${matchedByCode} by code, ${matchedByName} by name)`)

    return NextResponse.json({
      success: true,
      mapped_count: upserted?.length || 0,
      matched_to_forecast_count: matchedToForecastCount,
      matched_by_code: matchedByCode,
      matched_by_name: matchedByName,
    })

  } catch (error) {
    console.error('Error in POST /api/monthly-report/auto-map:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
