/**
 * Expense accounts, gathered under headings with a subtotal each.
 *
 * Urban Road's pack carries 49 operating-expense accounts. Calxa prints them
 * under nine headings — Employment Expense, Travel & Accommodation,
 * Professional Expense, IT Hardware and Software, Marketing and Advertising,
 * Occupancy Expense, Foreign Currency Gains and Losses, Bank and Other Fees,
 * Other Operating Expenses — each with its own subtotal line. Ours printed one
 * flat alphabetical list, so a reader looking for "what did we spend on people
 * this month" had to add five rows up in their head, and the page read as a
 * ledger export rather than a statement.
 *
 * Two facts, two homes, on purpose:
 *
 *   - WHICH group an account belongs to is a property of the account, and lives
 *     on `account_mappings.report_subcategory` (one row per Xero account).
 *   - WHAT ORDER the headings run in is the coach's editorial choice and lives
 *     on `monthly_report_settings.expense_group_order`. It matches no property
 *     of the accounts: ordering Urban Road's nine groups by their lowest
 *     account code gives Professional, Bank, Other, Employment, Occupancy, FX,
 *     IT, Marketing, Travel — a different order from the one this client has
 *     been reading for two years.
 *
 * A client with no subcategories set gets exactly what it gets today: one
 * ungrouped run of lines, no headings, no subtotals. Grouping is opt-in per
 * client and this module is the only thing that decides what "grouped" means.
 */

import type { ReportLine } from '@/app/finances/monthly-report/types'
import { calcVariance } from './shared'

export interface ExpenseGroup {
  /** The heading, or null for the run of accounts that carry no group. */
  name: string | null
  lines: ReportLine[]
  /**
   * The group's own row. Null for the ungrouped run — a subtotal under no
   * heading is a number a reader cannot name, and Calxa does not print one.
   */
  subtotal: ReportLine | null
}

const sum = (lines: readonly ReportLine[], pick: (l: ReportLine) => number): number =>
  lines.reduce((t, l) => t + (Number.isFinite(pick(l)) ? pick(l) : 0), 0)

/**
 * A group's subtotal.
 *
 * Every column is summed from the group's own lines and the variances are
 * RE-DERIVED from those sums rather than added up — adding percentages is how
 * a subtotal ends up disagreeing with its own two columns. Prior year stays
 * null unless at least one line has one, so a group with no history shows a
 * dash rather than a zero it did not earn.
 */
function subtotalOf(name: string, lines: readonly ReportLine[]): ReportLine {
  const actual = sum(lines, l => l.actual)
  const budget = sum(lines, l => l.budget)
  const ytdActual = sum(lines, l => l.ytd_actual)
  const ytdBudget = sum(lines, l => l.ytd_budget)
  const { amount: varAmt, percent: varPct } = calcVariance(actual, budget, false)
  const { amount: ytdVarAmt, percent: ytdVarPct } = calcVariance(ytdActual, ytdBudget, false)
  const anyPriorYear = lines.some(l => l.prior_year !== null && l.prior_year !== undefined)

  return {
    account_name: name,
    xero_account_name: null,
    group: name,
    is_budget_only: lines.every(l => l.is_budget_only),
    actual,
    budget,
    variance_amount: varAmt,
    variance_percent: varPct,
    ytd_actual: ytdActual,
    ytd_budget: ytdBudget,
    ytd_variance_amount: ytdVarAmt,
    ytd_variance_percent: ytdVarPct,
    unspent_budget: sum(lines, l => l.unspent_budget),
    budget_next_month: sum(lines, l => l.budget_next_month),
    budget_annual_total: sum(lines, l => l.budget_annual_total),
    prior_year: anyPriorYear ? sum(lines, l => l.prior_year ?? 0) : null,
  }
}

/**
 * @param lines the section's lines, in the order the statement would print them
 * @param order the coach's heading order; groups outside it sort after,
 *              alphabetically, so a newly-grouped account appears rather than
 *              silently vanishing into the ungrouped run
 */
export function groupExpenseLines(
  lines: readonly ReportLine[],
  order: readonly string[] | null | undefined,
): ExpenseGroup[] {
  const named = new Map<string, ReportLine[]>()
  const ungrouped: ReportLine[] = []

  for (const line of lines) {
    const g = (line.group ?? '').trim()
    if (!g) { ungrouped.push(line); continue }
    const bucket = named.get(g)
    if (bucket) bucket.push(line)
    else named.set(g, [line])
  }

  // Nothing is grouped — hand back the flat list untouched. This is the path
  // every client that has not opted in takes, and it must be a no-op.
  if (named.size === 0) return [{ name: null, lines: [...lines], subtotal: null }]

  const declared = (order ?? []).filter(name => named.has(name))
  const undeclared = [...named.keys()]
    .filter(name => !declared.includes(name))
    .sort((a, b) => a.localeCompare(b))

  const groups: ExpenseGroup[] = [...declared, ...undeclared].map(name => {
    const groupLines = named.get(name)!
    return { name, lines: groupLines, subtotal: subtotalOf(name, groupLines) }
  })

  // The accounts nobody has grouped yet run last, under no heading. Naming that
  // run "Other" would claim a grouping decision the coach has not made.
  if (ungrouped.length > 0) groups.push({ name: null, lines: ungrouped, subtotal: null })

  return groups
}

/** True when this section should render headings at all. */
export function hasExpenseGroups(lines: readonly ReportLine[]): boolean {
  return lines.some(l => (l.group ?? '').trim() !== '')
}
