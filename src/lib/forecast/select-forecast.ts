/**
 * Which of a business's forecasts for a fiscal year the app means, and what
 * its period columns should read today.
 *
 * Lifted out of ForecastService.getOrCreateForecast, which is a browser-client
 * class, so the preview harness (scripts/preview-pack.ts) picks the SAME
 * forecast for the pack's cashflow page. The service still does the writing —
 * it persists the period correction and creates a shell when there is nothing
 * to pick; the harness does neither, and applies the correction in memory only.
 */
import { calculateForecastPeriods, DEFAULT_YEAR_START_MONTH } from '@/lib/utils/fiscal-year-utils'

type ForecastRow = Record<string, any>

/**
 * H7 — selection order matters. Since drafts are created is_active=false
 * (PR-A), an abandoned wizard session leaves the NEWEST row: it has
 * assumptions (autosave wrote them) but zero forecast_pl_lines, so the page
 * fell back to "estimated" YTD actuals and the real active forecast became
 * invisible. The old `assumptions != null` guard was also dead code — the
 * column defaults to '{}', which is never null. Prefer: active → has
 * assumptions → newest.
 *
 * `rows` must be newest-first (the service orders by updated_at desc). Returns
 * the chosen row itself, with wizard_v4 assumptions mapped onto `assumptions`
 * when the dedicated column is empty — the service's own normalisation.
 */
export function pickForecast<T extends ForecastRow>(rows: T[] | null | undefined): T | null {
  if (!rows || rows.length === 0) return null
  const forecast =
    rows.find((f) => f.is_active) ||
    rows.find((f) => f.assumptions && Object.keys(f.assumptions).length > 0) ||
    rows[0]
  // Map wizard_v4 assumptions from category_assumptions if dedicated column doesn't exist
  if (!forecast.assumptions && forecast.category_assumptions?.wizard_v4?.assumptions) {
    ;(forecast as ForecastRow).assumptions = forecast.category_assumptions.wizard_v4.assumptions
  }
  return forecast
}

export const FORECAST_PERIOD_FIELDS = [
  'baseline_start_month',
  'baseline_end_month',
  'actual_start_month',
  'actual_end_month',
  'forecast_start_month',
  'forecast_end_month',
] as const

export type ForecastPeriods = ReturnType<typeof calculateForecastPeriods>

/**
 * The periods a forecast for `fiscalYear` should carry as of today (rolling
 * forecasts move their windows), and whether this one is out of date.
 */
export function forecastPeriodsFor(
  forecast: ForecastRow,
  fiscalYear: number,
  yearStartMonth: number = DEFAULT_YEAR_START_MONTH,
): { periods: ForecastPeriods; needsUpdate: boolean } {
  const periods = calculateForecastPeriods(fiscalYear, yearStartMonth)
  const needsUpdate = FORECAST_PERIOD_FIELDS.some((k) => forecast[k] !== (periods as ForecastRow)[k])
  return { periods, needsUpdate }
}

/**
 * The forecast the monthly pack's v1 cashflow runs on — found, never written.
 *
 * The page used ForecastService.getOrCreateForecast, which PERSISTS the period
 * correction above (and creates an empty shell when there is nothing to pick).
 * Exporting a pack therefore rewrote financial_forecasts: IICT's inactive
 * forecast 88199866 had actual_end_month moved from 2026-04 to 2026-08 on every
 * load, Dragon Roofing's 7b90633d from 2026-07 to 2026-08 (IICT-53, DRG-48).
 * Here the same forecast is picked from the same ids (the businesses id and its
 * profile's, as the service looks) and the correction is applied to the row in
 * memory only — the cashflow is built on the periods the service would have
 * saved, and the forecast page, which owns those columns, still saves them.
 * No forecast is `forecast: null`: the pack has no cashflow, and no shell is
 * made for it.
 *
 * Shared by the monthly-report page and scripts/preview-pack.ts.
 */
export async function findPackForecast<T extends ForecastRow = ForecastRow>(
  supabase: { from: (table: string) => any },
  businessId: string,
  fiscalYear: number,
): Promise<{ forecast: T | null; error: string | null }> {
  const { data: profile, error: profileError } = await supabase
    .from('business_profiles')
    .select('id')
    .eq('business_id', businessId)
    .maybeSingle()
  if (profileError) return { forecast: null, error: profileError.message ?? 'business profile lookup failed' }
  const ids = [...new Set([businessId, profile?.id].filter((id): id is string => typeof id === 'string' && id !== ''))]

  const { data: rows, error } = await supabase
    .from('financial_forecasts')
    .select('*')
    .in('business_id', ids)
    .eq('fiscal_year', fiscalYear)
    .order('updated_at', { ascending: false })
    .limit(10)
  if (error) return { forecast: null, error: error.message ?? 'forecast lookup failed' }

  const forecast = pickForecast(rows as T[] | null)
  if (!forecast) return { forecast: null, error: null }
  const { periods, needsUpdate } = forecastPeriodsFor(forecast, fiscalYear)
  if (needsUpdate) {
    const row = forecast as ForecastRow
    row.fiscal_year = fiscalYear
    for (const k of FORECAST_PERIOD_FIELDS) row[k] = (periods as ForecastRow)[k]
  }
  return { forecast, error: null }
}
