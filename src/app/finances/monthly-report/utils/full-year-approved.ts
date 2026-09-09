import type { FullYearReport, FullYearLine } from '../types'

/**
 * The approved-budget column on the Full Year page.
 *
 * Two yardsticks now exist for the same client. The FORECAST answers "where
 * will we land"; the APPROVED budget out of budget_versions answers "what were
 * we held to". The monthly Budget-vs-Actual page already switched to the
 * approved budget the moment a client moved to budget_source='budget_version'
 * — the Full Year page did not, so pages 4/6/10 of the pack were measured
 * against one number and pages 16-18 against another, with nothing on either
 * page saying which. For Urban Road the two differ by $83k in August alone,
 * because the forecast's closed months were overwritten with actuals by the
 * seeder while the approved budget still says 450,000.
 *
 * This module holds the predicates both surfaces ask — one per yardstick — so
 * the browser tab and the PDF can never disagree about which of them the page
 * is holding a client to, or about whether it is there at all.
 */

/** Rendered in place of a number that does not exist. Not "$0" — see below. */
export const VALUE_ABSENT = '—'

/**
 * Does this report carry an approved budget at all?
 *
 * Derived from the payload rather than from a settings flag on purpose: the
 * question the column actually depends on is "did the budget store answer",
 * and budget_source='budget_version' is only the first half of that. A client
 * switched over whose version is not yet in force, is ambiguous, or has no
 * lines gets `approved_annual_budget: null` on every row from the route, and
 * must see no column at all — not an empty one, which a reader fills in as
 * zero.
 *
 * Net profit is the probe because it is the one line every report has and the
 * route builds it last, out of every section: if anything anywhere resolved an
 * approved budget, net profit's is non-null.
 */
export function hasApprovedBudget(report: FullYearReport | null | undefined): boolean {
  if (!report) return false
  if (report.net_profit?.approved_annual_budget != null) return true
  // Belt and braces for a payload built before net profit carried the field
  // (a snapshot frozen between #493 and this change): a section subtotal that
  // has one is proof enough.
  return (report.sections ?? []).some((s) => s.subtotal?.approved_annual_budget != null)
}

/**
 * Format one line's approved annual total, or the absent marker.
 *
 * The formatter is passed in because the tab and the PDF each have their own
 * (locale string vs jsPDF's bracketed negatives) and this must not become a
 * third one that rounds differently from the column next to it.
 */
export function formatApprovedAnnual(line: FullYearLine, fmt: (n: number) => string): string {
  const value = line.approved_annual_budget
  return value == null ? VALUE_ABSENT : fmt(value)
}

/**
 * Is there a forecast behind this page's Forecast and variance columns?
 *
 * The Full Year page's variances are projection-vs-FORECAST, and when no active
 * forecast exists for the fiscal year the route has nothing to put in them. It
 * used to send 0 anyway: every row's annual_budget was 0, the percentage guard
 * `annualBudget !== 0 ? … : 0` rendered an uncomputable variance as 0.0%, and
 * the variance amount came out as the whole projection — tinted green, because
 * beating a budget of nothing is favourable. Distinct Directions is in exactly
 * that state (their only FY2027 forecast is is_active = false), so their August
 * revenue would have read Forecast $0, Var +$992,932, +0.0%, beside a real
 * $6,973,968 approved budget. A missing number printed as a triumph.
 *
 * Derived from the payload rather than trusted from one field, for the same
 * reason hasApprovedBudget is: a snapshot frozen before the route said so
 * carries no flag. The evidence is exact rather than heuristic — the route
 * already demotes a forecast with no materialised lines to "no forecast", so a
 * report in which no line budgets anything in any month IS the no-forecast
 * state, in every number this page can show.
 */
export function hasForecastBudget(report: FullYearReport | null | undefined): boolean {
  if (!report) return false
  if (typeof report.forecast_available === 'boolean') return report.forecast_available

  const lines: FullYearLine[] = [
    ...(report.sections ?? []).flatMap((s) => [...(s.lines ?? []), s.subtotal]),
    report.gross_profit,
    report.net_profit,
  ].filter(Boolean) as FullYearLine[]
  if (lines.length === 0) return false
  return lines.some((l) => l.annual_budget !== 0 || (l.months ?? []).some((m) => m.budget !== 0))
}

/**
 * Format a forecast-side number, or the absent marker when there is no
 * forecast. A real forecast that budgets nothing for an account is a decision
 * and still prints $0; only the absence of a forecast prints a mark.
 */
export function formatForecastValue(
  value: number,
  forecastAvailable: boolean,
  fmt: (n: number) => string,
): string {
  return forecastAvailable ? fmt(value) : VALUE_ABSENT
}

/**
 * The one line the page says when its forecast columns are empty, or null when
 * there is a forecast. A column of dashes with nothing explaining them is the
 * empty-state-as-instruction trap: the reader supplies their own explanation,
 * and it is usually "the system is broken" or "we budgeted nothing".
 */
export function forecastAbsentNote(report: FullYearReport | null | undefined): string | null {
  if (!report || hasForecastBudget(report)) return null
  const fy = report.fiscal_year ? `FY${report.fiscal_year}` : 'this fiscal year'
  return hasApprovedBudget(report)
    ? `No forecast exists for ${fy}; the approved budget is the only yardstick on this page, and Projected is actuals to date.`
    : `No forecast exists for ${fy}, so this page has no yardstick to measure against and Projected is actuals to date.`
}
