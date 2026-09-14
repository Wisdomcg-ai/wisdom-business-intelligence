/**
 * The pack's cashflow pages, composed from what the export has already loaded:
 * the Full Year report (actuals to the report month, the approved budget
 * after), the client's forecast and its saved cashflow assumptions, and the
 * opening bank read off the balance-sheet mirror.
 *
 * Lifted out of the monthly-report page so scripts/preview-pack.ts runs the
 * same composition the export does — no fetching here, only the arithmetic the
 * page used to do inline between its fetches.
 */
import { generateCashflowForecast, getDefaultCashflowAssumptions } from '@/lib/cashflow/engine'
import type { CashflowAssumptions, CashflowForecastData, FinancialForecast, PLLine } from '@/app/finances/forecast/types'
import type { FullYearReport } from '@/app/finances/monthly-report/types'
import {
  applyPackOpening,
  buildPackCashflowLines,
  packCashflowBasis,
  packOpeningFromAssumptions,
} from './pack-cashflow-lines'
import type { OpeningBank } from './opening-bank'

/**
 * Saved assumptions over the defaults. Null or undefined saved assumptions
 * leave the defaults — exactly what the page did when the assumptions request
 * failed or returned nothing.
 */
export function mergeCashflowAssumptions(saved: Partial<CashflowAssumptions> | null | undefined): CashflowAssumptions {
  const assumptions = getDefaultCashflowAssumptions()
  if (!saved) return assumptions
  return {
    ...assumptions,
    ...saved,
    loans: saved.loans || [],
    planned_stock_changes: saved.planned_stock_changes || {},
  } as CashflowAssumptions
}

/**
 * The P&L lines the cashflow engine runs on: actuals for the months already
 * banked and the approved budget for the rest, falling back to the forecast's
 * own lines when the Full Year report is not to hand. Empty means there is no
 * cashflow page to print.
 */
export function packCashflowPlLines(
  fullYear: FullYearReport | null | undefined,
  reportMonth: string,
  forecastLines: PLLine[],
): PLLine[] {
  const composed = buildPackCashflowLines(fullYear ?? null, reportMonth)
  return composed.lines.length > 0 ? composed.lines : forecastLines
}

/**
 * Run the engine. Null when there are no lines at all.
 *
 * The opening is applied AFTER the merge, so a balance saved by the forecast
 * module's Xero sync can neither replace the real opening bank nor put debtors,
 * creditors and ATO balances back on top of months that are actuals. Urban
 * Road's pack opened at $0 without this. See applyPackOpening.
 */
export function buildPackCashflowForecast(args: {
  fullYear: FullYearReport | null | undefined
  reportMonth: string
  forecast: FinancialForecast
  forecastLines: PLLine[]
  savedAssumptions: Partial<CashflowAssumptions> | null | undefined
  opening: OpeningBank
}): CashflowForecastData | null {
  const plLines = packCashflowPlLines(args.fullYear, args.reportMonth, args.forecastLines)
  if (plLines.length === 0) return null
  const assumptions = mergeCashflowAssumptions(args.savedAssumptions)
  return generateCashflowForecast(
    plLines,
    null,
    applyPackOpening(assumptions, args.opening, args.forecast.actual_start_month),
    args.forecast,
  )
}

/** 'YYYY-MM' → 'Aug 2026', the way the export has always printed it. */
export function packMonthLabel(m: string): string {
  return new Date(`${m}-01T00:00:00`).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })
}

/**
 * The basis sentence under the cashflow title. Read off the report and the
 * cashflow that will actually be printed, so the sentence and the numbers
 * beneath it cannot describe two different starting balances.
 */
export function packCashflowBasisFor(
  fullYear: FullYearReport | null | undefined,
  reportMonth: string,
  cashflow: CashflowForecastData | null | undefined,
): string | null {
  return packCashflowBasis(
    buildPackCashflowLines(fullYear ?? null, reportMonth),
    packMonthLabel,
    packOpeningFromAssumptions(cashflow?.assumptions),
  )
}
