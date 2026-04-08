/**
 * Forecast Adjust-Forward API Route
 *
 * Scales remaining forecast months (from today onward) for revenue lines
 * by a given adjustment percentage.
 *
 * Body: { adjustmentPct: number (-50 to 50), yearStartMonth: 1 | 7, fiscalYear: number }
 *
 * Only modifies forecast_months — never touches actual_months.
 * Returns 403 if the forecast is locked.
 */

import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateFiscalMonthKeys } from '@/lib/utils/fiscal-year-utils'

export const dynamic = 'force-dynamic'

// Categories that map to Revenue in the P&L (must stay in sync with quarterly-summary + actuals-summary)
const REVENUE_CATEGORIES = ['Revenue', 'revenue', 'Trading Revenue', 'Other Revenue']

function isRevenue(category?: string, accountType?: string): boolean {
  if (accountType && accountType.toLowerCase() === 'revenue') return true
  if (!category) return false
  return REVENUE_CATEGORIES.some(c => c.toLowerCase() === category.toLowerCase())
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createRouteHandlerClient()

  try {
    // Auth check
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: forecastId } = await params

    if (!forecastId) {
      return NextResponse.json({ error: 'Forecast ID is required' }, { status: 400 })
    }

    // Parse and validate request body
    let adjustmentPct: number
    let yearStartMonth: number
    let fiscalYear: number

    try {
      const body = await request.json()
      adjustmentPct = body.adjustmentPct
      yearStartMonth = body.yearStartMonth
      fiscalYear = body.fiscalYear
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    if (typeof adjustmentPct !== 'number' || isNaN(adjustmentPct) || adjustmentPct < -50 || adjustmentPct > 50) {
      return NextResponse.json({ error: 'adjustmentPct must be a number between -50 and 50' }, { status: 400 })
    }

    if (yearStartMonth !== 1 && yearStartMonth !== 7) {
      return NextResponse.json({ error: 'yearStartMonth must be 1 (CY) or 7 (FY)' }, { status: 400 })
    }

    if (!Number.isInteger(fiscalYear) || fiscalYear <= 0) {
      return NextResponse.json({ error: 'fiscalYear must be a positive integer' }, { status: 400 })
    }

    // Fetch forecast row
    const { data: forecast, error: forecastError } = await supabase
      .from('financial_forecasts')
      .select('id, business_id, fiscal_year, is_locked')
      .eq('id', forecastId)
      .maybeSingle()

    if (forecastError) {
      console.error('[adjust-forward] Error fetching forecast:', forecastError)
      return NextResponse.json({ error: 'Failed to fetch forecast' }, { status: 500 })
    }

    if (!forecast) {
      return NextResponse.json({ error: 'Forecast not found' }, { status: 404 })
    }

    if (forecast.is_locked) {
      return NextResponse.json(
        { error: 'Forecast is locked — cannot apply adjustments' },
        { status: 403 }
      )
    }

    // Determine which month keys are "remaining" (from today forward within the fiscal year)
    const allKeys = generateFiscalMonthKeys(fiscalYear, yearStartMonth)
    const now = new Date()
    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const remainingKeys = allKeys.filter(key => key >= currentKey)

    if (remainingKeys.length === 0) {
      return NextResponse.json(
        { error: 'No remaining months to adjust in this fiscal year' },
        { status: 400 }
      )
    }

    // Fetch all forecast_pl_lines for this forecast
    const { data: plLines, error: linesError } = await supabase
      .from('forecast_pl_lines')
      .select('id, category, account_type, forecast_months')
      .eq('forecast_id', forecastId)

    if (linesError) {
      console.error('[adjust-forward] Error fetching pl_lines:', linesError)
      return NextResponse.json({ error: 'Failed to fetch P&L lines' }, { status: 500 })
    }

    const lines = plLines || []

    // Calculate adjustment factor: -10% => 0.9, +10% => 1.1
    const factor = 1 + (adjustmentPct / 100)

    // Only adjust revenue lines
    const revenueLines = lines.filter(line =>
      isRevenue(line.category, line.account_type)
    )

    let adjustedCount = 0

    for (const line of revenueLines) {
      const forecastMonths = { ...(line.forecast_months as Record<string, number> || {}) }

      for (const key of remainingKeys) {
        const existing = forecastMonths[key] || 0
        forecastMonths[key] = Math.round(existing * factor)
      }

      const { error: updateError } = await supabase
        .from('forecast_pl_lines')
        .update({ forecast_months: forecastMonths })
        .eq('id', line.id)

      if (updateError) {
        console.error('[adjust-forward] Error updating line', line.id, updateError)
        return NextResponse.json({ error: 'Failed to update forecast line' }, { status: 500 })
      }

      adjustedCount++
    }

    console.log('[adjust-forward] Applied', adjustmentPct, '% to', adjustedCount, 'revenue lines,', remainingKeys.length, 'months')

    return NextResponse.json({
      success: true,
      adjustedLines: adjustedCount,
      remainingMonths: remainingKeys.length,
      adjustmentPct,
    })
  } catch (err) {
    console.error('[adjust-forward] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
