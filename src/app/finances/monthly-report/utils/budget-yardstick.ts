import type { GeneratedReport } from '../types'

/**
 * What the word "Budget" means on the monthly statement — in one place, because
 * three pages of the pack and one browser tab all print it.
 *
 * The monthly Budget-vs-Actual statement switched to the APPROVED budget out of
 * budget_versions the moment a client moved to budget_source='budget_version'.
 * The Full Year page in the same pack shows that budget in a column headed
 * "Approved Budget" and gives "Forecast" to a different number beside it. So a
 * reader who maps the unqualified "Budget" on pack page 4 onto "Forecast" on
 * page 16 reconciles the wrong two columns — on the most-read pages there are.
 *
 * The rule the types.ts docblock states: anything that puts the word Budget in
 * front of a reader has to consult budget_source. Read it POSITIVELY —
 * nineteen businesses have no settings row at all, and the failure that costs
 * money is calling a forecast an approved budget, never the reverse.
 *
 * For the ten clients still on a forecast this returns exactly the labels those
 * pages already carried, and their packs do not change: there is only one
 * yardstick in them and "Budget" names it.
 */
export interface StatementYardstick {
  /** Column head over the report month's budget figures. */
  columnLabel: string
  /** Column head over the YTD budget figures. */
  ytdColumnLabel: string
  /**
   * The line naming the yardstick for every budget-derived column on the page
   * — including the ones too narrow to rename (Unspent, Next Mth, Annual).
   * Null when "Budget" is unambiguous, so nothing is added to a pack that does
   * not need it.
   */
  note: string | null
}

export function statementYardstick(
  report: Pick<GeneratedReport, 'budget_source' | 'budget_forecast_name'>,
): StatementYardstick {
  if (report.budget_source !== 'budget_version') {
    return { columnLabel: 'Budget', ytdColumnLabel: 'YTD Budget', note: null }
  }
  // budget_forecast_name is the resolver's label for whatever produced the
  // column, which for this branch is the budget version. Naming the version
  // matters more than naming the source: a locked version is the thing the
  // client signed, and a pack that cannot be tied back to one is not evidence.
  const version = (report.budget_forecast_name ?? '').trim()
  return {
    columnLabel: 'Approved Budget',
    ytdColumnLabel: 'YTD Approved Budget',
    note:
      `Every budget figure on this page is the approved budget` +
      `${version ? ` (${version})` : ''} — not the forecast. ` +
      `The Full Year page names the same yardstick “Approved Budget”.`,
  }
}
