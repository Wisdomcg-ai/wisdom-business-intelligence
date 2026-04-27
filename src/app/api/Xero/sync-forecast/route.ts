/**
 * Sync Forecast from Xero
 *
 * Copies P&L data from xero_pl_lines (source of truth, synced daily by sync-all)
 * into forecast_pl_lines.actual_months for a specific forecast.
 *
 * This gives ALL downstream systems (PLForecastTable, cashflow engine, dashboard,
 * quarterly review, export) access to the full 24 months of historical data.
 *
 * NO Xero API calls are made — we read from the already-synced local data.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { resolveXeroBusinessId } from '@/lib/utils/resolve-xero-business-id'
import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids'
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// Map xero_pl_lines.account_type enum to forecast_pl_lines.category display string
const ACCOUNT_TYPE_TO_CATEGORY: Record<string, string> = {
  revenue: 'Revenue',
  cogs: 'Cost of Sales',
  opex: 'Operating Expenses',
  other_income: 'Other Income',
  other_expense: 'Other Expenses',
}

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const authClient = await createRouteHandlerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { business_id, forecast_id } = await request.json()

    if (!business_id || !forecast_id) {
      return NextResponse.json(
        { error: 'business_id and forecast_id are required' },
        { status: 400 },
      )
    }

    // Verify access
    const hasAccess = await verifyBusinessAccess(user.id, business_id)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Verify Xero connection exists
    const { connection } = await resolveXeroBusinessId(supabase, business_id)
    if (!connection) {
      return NextResponse.json(
        { error: 'No active Xero connection found' },
        { status: 404 },
      )
    }

    // Verify forecast exists
    const { data: forecast, error: forecastError } = await supabase
      .from('financial_forecasts')
      .select('id, fiscal_year, actual_start_month, actual_end_month')
      .eq('id', forecast_id)
      .maybeSingle()

    if (forecastError || !forecast) {
      return NextResponse.json({ error: 'Forecast not found' }, { status: 404 })
    }

    // ── Read from xero_pl_lines (source of truth) ────────────────────────
    // This table is populated daily by sync-all cron with 24 months of Xero data.
    // No Xero API calls needed — we just copy the local data.
    const ids = await resolveBusinessIds(supabase, business_id)

    const { data: xeroLines, error: xeroError } = await supabase
      .from('xero_pl_lines')
      .select('account_name, account_code, account_type, monthly_values')
      .in('business_id', ids.all)

    if (xeroError) {
      console.error('[Sync Forecast] Failed to read xero_pl_lines:', xeroError)
      return NextResponse.json(
        { error: 'Failed to read Xero data' },
        { status: 500 },
      )
    }

    if (!xeroLines || xeroLines.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No Xero P&L data available. Run a Xero sync first.',
        lines_count: 0,
      })
    }

    // ── Build forecast_pl_lines from xero_pl_lines ───────────────────────
    // Dedupe by account_code (or account_name when code missing) to satisfy the
    // unique_forecast_account constraint on (forecast_id, account_code). When
    // sync-all races against itself, xero_pl_lines can contain duplicate rows
    // for the same account; without this, the insert below fails atomically
    // with a 23505 violation and no Xero data lands in the forecast.
    const dedupMap = new Map<string, any>()
    for (const xl of xeroLines as any[]) {
      const key = xl.account_code || `name:${xl.account_name}`
      const existing = dedupMap.get(key)
      // Keep the row with more months of data; tie-break by longer monthly_values
      const existingMonths = existing ? Object.keys(existing.monthly_values || {}).length : -1
      const candidateMonths = Object.keys(xl.monthly_values || {}).length
      if (!existing || candidateMonths > existingMonths) {
        dedupMap.set(key, xl)
      }
    }
    const dedupedXero = Array.from(dedupMap.values())
    if (dedupedXero.length !== xeroLines.length) {
      console.warn(`[Sync Forecast] Deduplicated xero_pl_lines: ${xeroLines.length} → ${dedupedXero.length} for forecast ${forecast_id}`)
    }

    const plLines = dedupedXero
      .filter((xl: any) => {
        // Only include lines that have data
        const values = xl.monthly_values || {}
        return Object.values(values).some((v: any) => v !== 0)
      })
      .map((xl: any) => ({
        account_name: xl.account_name,
        account_code: xl.account_code || undefined,
        account_type: xl.account_type,
        category: ACCOUNT_TYPE_TO_CATEGORY[xl.account_type] || 'Operating Expenses',
        actual_months: xl.monthly_values || {},  // ALL 24 months
        is_from_xero: true,
      }))

    // ── Preserve existing forecast_months (wizard budget data) ───────────
    const { data: existingLines } = await supabase
      .from('forecast_pl_lines')
      .select('account_name, forecast_months, forecast_method, is_from_payroll, sort_order')
      .eq('forecast_id', forecast_id)

    const existingLookup = new Map<string, any>()
    ;(existingLines || []).forEach((line: any) => {
      existingLookup.set(line.account_name, line)
    })

    // ── Delete existing Xero-synced lines ────────────────────────────────
    // Fail loudly: if delete is silently swallowed, the subsequent insert
    // collides with the unique_forecast_account constraint and the whole
    // sync is wasted. Better to surface the problem.
    const { error: deleteError } = await supabase
      .from('forecast_pl_lines')
      .delete()
      .eq('forecast_id', forecast_id)
      .eq('is_from_xero', true)

    if (deleteError) {
      console.error('[Sync Forecast] Delete error:', deleteError)
      return NextResponse.json(
        { error: 'Failed to clear existing Xero-synced lines', detail: deleteError.message },
        { status: 500 },
      )
    }

    // ── Insert new lines with full 24-month actual_months ────────────────
    if (plLines.length > 0) {
      const linesToInsert = plLines.map((line: any, index: number) => {
        const existing = existingLookup.get(line.account_name)
        return {
          forecast_id,
          ...line,
          sort_order: existing?.sort_order ?? index,
          forecast_months: existing?.forecast_months && Object.keys(existing.forecast_months).length > 0
            ? existing.forecast_months
            : {},
          forecast_method: existing?.forecast_method || undefined,
        }
      })

      const { error: insertError } = await supabase
        .from('forecast_pl_lines')
        .insert(linesToInsert)

      if (insertError) {
        console.error('[Sync Forecast] Insert error:', insertError)
        return NextResponse.json(
          { error: 'Failed to save P&L data', details: insertError },
          { status: 500 },
        )
      }
    }

    // ── Update timestamps ────────────────────────────────────────────────
    const now = new Date()
    const lastCompleteMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const actualEndStr = `${lastCompleteMonth.getFullYear()}-${String(lastCompleteMonth.getMonth() + 1).padStart(2, '0')}`

    await supabase
      .from('financial_forecasts')
      .update({
        last_xero_sync_at: now.toISOString(),
        actual_end_month: actualEndStr,
      })
      .eq('id', forecast_id)

    return NextResponse.json({
      success: true,
      message: `Synced ${plLines.length} P&L lines from Xero data`,
      lines_count: plLines.length,
    })
  } catch (error) {
    console.error('[Sync Forecast] Error:', error)
    const message = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack?.slice(0, 500) : undefined
    return NextResponse.json(
      { error: 'Failed to sync forecast data', detail: message, stack },
      { status: 500 },
    )
  }
}
