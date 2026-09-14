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
import { generateCashflowForecast, getDefaultCashflowAssumptions, KEYWORD_EXPENSE_GROUP_ORDER } from '@/lib/cashflow/engine'
import type { CashflowAssumptions, CashflowForecastData, FinancialForecast, PLLine } from '@/app/finances/forecast/types'
import type { FullYearReport } from '@/app/finances/monthly-report/types'
import { packMonthYear } from '@/app/finances/monthly-report/services/pack-style'
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
  return composePackCashflowLines(fullYear, reportMonth, forecastLines).lines
}

/** The lines, and whether they are the Xero P&L composition or the forecast's own. */
function composePackCashflowLines(
  fullYear: FullYearReport | null | undefined,
  reportMonth: string,
  forecastLines: PLLine[],
): { lines: PLLine[]; fromXeroPl: boolean } {
  const composed = buildPackCashflowLines(fullYear ?? null, reportMonth)
  return composed.lines.length > 0
    ? { lines: composed.lines, fromXeroPl: true }
    : { lines: forecastLines, fromXeroPl: false }
}

/**
 * The order the page prints expense groups in after the coach's own order:
 * mapping groups alphabetically, as partitionByGroup orders them on the
 * statement pages, then the engine's keyword headings for accounts nobody has
 * grouped, in the engine's order (Employment first, Other Operating last).
 *
 * Put on the data because the months cannot supply it: a group is absent from
 * every month before its first cash, so first appearance printed Dragon
 * Roofing's Employment Expense last — its wages start in August.
 */
export function packExpenseGroupOrder(plLines: readonly PLLine[]): string[] {
  const mapped = new Set<string>()
  for (const line of plLines) {
    const group = line.category === 'Operating Expenses' ? line.report_group?.trim() : ''
    if (group) mapped.add(group)
  }
  const alphabetical = [...mapped].sort((a, b) => a.localeCompare(b))
  return [...alphabetical, ...KEYWORD_EXPENSE_GROUP_ORDER.filter((g) => !mapped.has(g))]
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
  const { lines: plLines, fromXeroPl } = composePackCashflowLines(args.fullYear, args.reportMonth, args.forecastLines)
  if (plLines.length === 0) return null
  const assumptions = mergeCashflowAssumptions(args.savedAssumptions)
  const cashflow = generateCashflowForecast(
    plLines,
    null,
    applyPackOpening(assumptions, args.opening, args.forecast.actual_start_month),
    args.forecast,
    [],
    // Only lines composed from the Xero P&L keep their sign: there a negative
    // expense month is a credit. The fallback is the forecast's own stored
    // lines, where it need not be — see CashflowEngineOptions.signedExpenses.
    { signedExpenses: fromXeroPl },
  )
  return {
    ...cashflow,
    // Statement order, so the page prints Services before Returns & Allowances
    // as the income page does, rather than after it because its first cash
    // lands in September.
    line_order: plLines.map((l) => l.account_name),
    expense_group_order: packExpenseGroupOrder(plLines),
  }
}

/**
 * 'YYYY-MM' → 'Aug 2026': the pack's one month label, so the basis line and
 * the table header under it come from the same table.
 *
 * Not toLocaleDateString: en-AU's short September is "Sept", so the basis line
 * read "approved budget Sept 2026" over a table whose header says "Sep 2026".
 */
export const packMonthLabel = packMonthYear

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
  const a = cashflow?.assumptions
  return packCashflowBasis(
    buildPackCashflowLines(fullYear ?? null, reportMonth),
    packMonthLabel,
    packOpeningFromAssumptions(a),
    a ? { dsoDays: a.dso_days, dpoDays: a.dpo_days } : undefined,
  )
}
