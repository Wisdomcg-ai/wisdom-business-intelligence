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
