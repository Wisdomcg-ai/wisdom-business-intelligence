/**
 * The P&L the pack's cashflow page is built from: actuals to the end of the
 * reporting period, the budget for the rest of the year.
 *
 * The cashflow page used to project EVERY month of the fiscal year from the
 * forecast, including months already banked. Urban Road's August pack showed
 * July's Canvas Sales at $371,142 on the cashflow page and $337,402 on the
 * income page — the same month, in the same pack, two figures, because one was
 * a projection of a month that had already happened.
 *
 * The engine needs no change to fix this. `getMonthValue` already prefers a
 * line's `actual_months` entry over its `forecast_months` one, month by month;
 * the forecast simply had no actuals in it, having been seeded from the Xero
 * budget. So the fix is to compose the input rather than to alter the
 * arithmetic: real actuals in `actual_months` for the elapsed months, the
 * approved budget in `forecast_months` for the rest.
 *
 * The source is the Full Year report, which the pack already loads and which
 * already carries — per account, per month — the actual, the forecast and the
 * approved budget, reconciled against the statement pages a reader will compare
 * this page to. Deriving them a second time from Xero would be a second answer
 * waiting to disagree with the first.
 */

import type { FullYearReport } from '@/app/finances/monthly-report/types'
import type { PLLine } from '@/app/finances/forecast/types'

export interface PackCashflowLines {
  lines: PLLine[]
  /** Months taken from actuals, oldest first. */
  actualMonths: string[]
  /** Months taken from the budget, oldest first. */
  budgetMonths: string[]
  /**
   * True when every budget month came from the APPROVED budget. False when any
   * fell back to the forecast — the page says which, because "budget" and
   * "forecast" are different promises and a reader is entitled to know whose
   * numbers these are.
   */
  approvedThroughout: boolean
}

const EMPTY: PackCashflowLines = {
  lines: [], actualMonths: [], budgetMonths: [], approvedThroughout: false,
}

/**
 * @param report         the Full Year report, already loaded for the pack
 * @param lastActualMonth the report's own month — every month at or before it
 *                        is an actual, every month after it is budget
 */
export function buildPackCashflowLines(
  report: FullYearReport | null | undefined,
  lastActualMonth: string,
): PackCashflowLines {
  const sections = report?.sections ?? []
  if (sections.length === 0 || !lastActualMonth) return EMPTY

  const actualMonths = new Set<string>()
  const budgetMonths = new Set<string>()
  let approvedThroughout = true
  const lines: PLLine[] = []

  for (const section of sections) {
    for (const line of section.lines ?? []) {
      const actual_months: Record<string, number> = {}
      const forecast_months: Record<string, number> = {}

      for (const md of line.months ?? []) {
        if (!md?.month) continue
        if (md.month <= lastActualMonth) {
          // A banked month is what it is. Zero is a real figure here — the
          // account genuinely moved nothing — so it is written, not skipped:
          // `getMonthValue` treats a MISSING key as "no actual" and falls
          // through to the forecast, which would put a projection back into a
          // month that has already happened.
          actual_months[md.month] = md.actual ?? 0
          actualMonths.add(md.month)
        } else {
          // The approved budget is the yardstick the rest of the pack is held
          // to; the forecast is the fallback for a client who has no approved
          // budget, and is recorded as such rather than passed off as one.
          if (md.approved_budget === null || md.approved_budget === undefined) {
            approvedThroughout = false
            forecast_months[md.month] = md.budget ?? 0
          } else {
            forecast_months[md.month] = md.approved_budget
          }
          budgetMonths.add(md.month)
        }
      }

      lines.push({
        account_name: line.account_name,
        category: line.category,
        actual_months,
        forecast_months,
      } as PLLine)
    }
  }

  if (lines.length === 0) return EMPTY

  return {
    lines,
    actualMonths: [...actualMonths].sort(),
    budgetMonths: [...budgetMonths].sort(),
    // Vacuously true with no budget months at all would be a lie by omission:
    // a page with nothing forecast has nothing to say about whose numbers
    // the forecast used.
    approvedThroughout: budgetMonths.size > 0 && approvedThroughout,
  }
}

/**
 * The sentence the page prints under its title, so a reader knows which half of
 * the row is history and which is a plan.
 */
export function packCashflowBasis(built: PackCashflowLines, fmtMonth: (m: string) => string): string | null {
  if (built.actualMonths.length === 0 && built.budgetMonths.length === 0) return null
  const parts: string[] = []
  if (built.actualMonths.length > 0) {
    const first = built.actualMonths[0]
    const last = built.actualMonths[built.actualMonths.length - 1]
    parts.push(first === last
      ? `Actuals for ${fmtMonth(first)}`
      : `Actuals ${fmtMonth(first)} to ${fmtMonth(last)}`)
  }
  if (built.budgetMonths.length > 0) {
    const first = built.budgetMonths[0]
    const last = built.budgetMonths[built.budgetMonths.length - 1]
    const source = built.approvedThroughout ? 'approved budget' : 'forecast'
    parts.push(first === last
      ? `${source} for ${fmtMonth(first)}`
      : `${source} ${fmtMonth(first)} to ${fmtMonth(last)}`)
  }
  return parts.join(' · ')
}
