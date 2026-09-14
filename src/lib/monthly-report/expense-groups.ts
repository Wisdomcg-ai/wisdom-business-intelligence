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
 *
 * The variance takes the SECTION's polarity, the same test the generate route
 * applies to every line. It used to be expense polarity (budget − actual)
 * whatever the section, so a grouped income section printed its shortfall as a
 * favourable figure on the group row: Precision's "Trading Income" read 66,826
 * two rows above a Total Income of (66,826), over accounts that were all short.
 */
function subtotalOf(name: string, lines: readonly ReportLine[], isRevenue: boolean): ReportLine {
  const actual = sum(lines, l => l.actual)
  const budget = sum(lines, l => l.budget)
  const ytdActual = sum(lines, l => l.ytd_actual)
  const ytdBudget = sum(lines, l => l.ytd_budget)
  const { amount: varAmt, percent: varPct } = calcVariance(actual, budget, isRevenue)
  const { amount: ytdVarAmt, percent: ytdVarPct } = calcVariance(ytdActual, ytdBudget, isRevenue)
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
 * The group an account belongs to, read off its mapping row.
 *
 * Group assignment is a property of the ACCOUNT (account_mappings.
 * report_subcategory), and this is the only function that reads it: the
 * Actual vs Budget route and the Full Year route both call it, for Xero lines
 * and for budget-only / forecast-only lines alike, so an account cannot sit
 * under one heading on one page and under another two pages later.
 *
 * That is deliberately NOT what Calxa does. Urban Road's August 2026 Calxa pack
 * puts Bank Revaluations under Other Operating Expenses on its Actual vs Budget
 * page and under Bank and Other Fees on its Full Year page, and Memberships &
 * Registrations the other way round — so two pages of one pack disagree about
 * what "Bank and Other Fees" contains. WisdomBI does not copy that: the two
 * pages of a WisdomBI pack agree with each other, and where that makes a Full
 * Year group subtotal differ from Calxa's, the difference is Calxa's
 * inconsistency, not a mis-mapped account.
 *
 * No trimming here — partitionByGroup trims — so the payload carries what the
 * mapping row actually holds.
 */
export function mappingGroup(
  m: { report_subcategory?: string | null } | null | undefined,
): string | null {
  return m?.report_subcategory ?? null
}

/**
 * Split lines into their groups: membership and heading order, no arithmetic.
 *
 * Shared by the Actual vs Budget page (ReportLine) and the Full Year page
 * (FullYearLine). Their subtotals are shaped differently, but the headings must
 * come out in the same order with the same members, so that decision is made
 * once. Input order is preserved inside each group — lines handed in statement
 * order stay in statement order under their heading.
 *
 * @param lines the section's lines, in the order the statement would print them
 * @param order the coach's heading order; groups outside it sort after,
 *              alphabetically, so a newly-grouped account appears rather than
 *              silently vanishing into the ungrouped run
 */
export function partitionByGroup<T extends { group?: string | null }>(
  lines: readonly T[],
  order: readonly string[] | null | undefined,
): { name: string | null; lines: T[] }[] {
  const named = new Map<string, T[]>()
  const ungrouped: T[] = []

  for (const line of lines) {
    const g = (line.group ?? '').trim()
    if (!g) { ungrouped.push(line); continue }
    const bucket = named.get(g)
    if (bucket) bucket.push(line)
    else named.set(g, [line])
  }

  // Nothing is grouped — hand back the flat list untouched. This is the path
  // every client that has not opted in takes, and it must be a no-op.
  if (named.size === 0) return [{ name: null, lines: [...lines] }]

  const declared = (order ?? []).filter(name => named.has(name))
  const undeclared = [...named.keys()]
    .filter(name => !declared.includes(name))
    .sort((a, b) => a.localeCompare(b))

  const groups: { name: string | null; lines: T[] }[] = [...declared, ...undeclared]
    .map(name => ({ name, lines: named.get(name)! }))

  // The accounts nobody has grouped yet run last, under no heading. Naming that
  // run "Other" would claim a grouping decision the coach has not made.
  if (ungrouped.length > 0) groups.push({ name: null, lines: ungrouped })

  return groups
}

/**
 * @param lines    the section's lines, in the order the statement would print them
 * @param order    the coach's heading order; see partitionByGroup
 * @param category the section's category, which sets the subtotal's variance
 *                 sign — required, because a default is how income groups got
 *                 expense polarity (see subtotalOf)
 */
export function groupExpenseLines(
  lines: readonly ReportLine[],
  order: readonly string[] | null | undefined,
  category: string,
): ExpenseGroup[] {
  const isRevenue = category === 'Revenue' || category === 'Other Income'
  return partitionByGroup(lines, order).map(g => ({
    ...g,
    subtotal: g.name ? subtotalOf(g.name, g.lines, isRevenue) : null,
  }))
}

/**
 * The groups as the pack prints them under a heading already labelled
 * `sectionLabel`: a section whose ONLY group carries the heading's own name is
 * handed back ungrouped.
 *
 * Envisage maps all five income accounts to the group "Income", and the pack
 * calls the Revenue section "Income" — so its pages read "Income / Income",
 * with a group subtotal equal to Total Income a few rows down. That row says
 * nothing the heading and the total do not. With other groups beside it the
 * row is kept: its subtotal is then a figure no other row prints, and a reader
 * needs the name to find it. Case and spacing are ignored, as a coach typing
 * "income" means the same thing.
 */
export function withoutHeadingEcho<G extends { name: string | null; subtotal: unknown }>(
  groups: G[],
  sectionLabel: string,
): G[] {
  const only = groups.length === 1 ? groups[0] : null
  if (!only?.name || only.name.trim().toLowerCase() !== sectionLabel.trim().toLowerCase()) return groups
  return [{ ...only, name: null, subtotal: null }]
}

/** True when this section should render headings at all. */
export function hasExpenseGroups(lines: readonly ReportLine[]): boolean {
  return lines.some(l => (l.group ?? '').trim() !== '')
}
