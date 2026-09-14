/**
 * The rows of the pack's Cashflow Forecast table, in the order and with the
 * signs Calxa prints them — worked out once, away from jsPDF, so the page and
 * its tests read the same answer.
 *
 * Presentation only. Every figure is the engine's; this module decides which
 * row a figure sits on, what the row is called and which way round it reads.
 *
 * What it fixes against the page it replaces (Urban Road, August 2026):
 *   - Outflows read as outflows. The page printed Antons Canvas as 229,091 and
 *     only the Cash Outflows subtotal as a negative; Calxa prints every payment
 *     row, and every expense group row, as a bracketed negative. A credit
 *     therefore reads as a positive figure in an expense section, which is
 *     what it is.
 *   - Statement order. Labels were collected month by month into a Set, so an
 *     account whose first cash month was late printed at the END of its
 *     section: Services after Returns & Allowances, Art Supplies after Freight
 *     to Customer.
 *   - The coach's group order. The page prints groups in
 *     monthly_report_settings.expense_group_order, as the Actual vs Budget and
 *     Full Year pages do, then in the cashflow's expense_group_order.
 *   - A Total column (Bank at Beginning is the first opening, Bank at End the
 *     last closing, every other row its twelve months summed).
 *   - Calxa's labels: "Cash Inflows from Operation", "Expense", "Asset",
 *     "Liability", and an "Other Inflows" row that prints even when it is 0.
 */

import type { CashflowForecastData, CashflowLine } from '@/app/finances/forecast/types'

export type PackCashflowRowKind = 'bank' | 'heading' | 'line' | 'group' | 'subtotal' | 'net'

export interface PackCashflowRow {
  kind: PackCashflowRowKind
  label: string
  /** 0 = flush left, 1 = under a section heading, 2 = under an expense group. */
  indent: 0 | 1 | 2
  /** One figure per month, signed as printed: money in positive, money out negative. Empty on a heading. */
  values: number[]
  /** The Total column, or null on a heading. */
  total: number | null
}

/**
 * @param cf         the engine's cashflow, as the pack will print it
 * @param groupOrder the coach's expense-group order; groups it does not name
 *                   follow in cf.expense_group_order (see packExpenseGroupOrder)
 */
export function buildPackCashflowRows(
  cf: CashflowForecastData,
  groupOrder?: readonly string[] | null,
): PackCashflowRow[] {
  const months = cf.months
  const rows: PackCashflowRow[] = []
  const sum = (values: number[]) => values.reduce((s, v) => s + v, 0)
  const figures = (kind: PackCashflowRowKind, label: string, indent: 0 | 1 | 2, values: number[]): PackCashflowRow =>
    ({ kind, label, indent, values, total: sum(values) })
  const heading = (label: string): PackCashflowRow => ({ kind: 'heading', label, indent: 0, values: [], total: null })
  const rank = statementRank(cf.line_order)

  /** Every label a section carries in any month, in statement order, as rows. */
  const lineRows = (pick: (m: (typeof months)[number]) => CashflowLine[], sign: 1 | -1, indent: 1 | 2): PackCashflowRow[] =>
    orderLabels(months.flatMap((m) => pick(m).map((l) => l.label)), rank).map((label) =>
      figures('line', label, indent, months.map((m) => sign * valueOf(pick(m), label))),
    )

  const bankAtBeginning = months.map((m) => m.bank_at_beginning)
  rows.push({ kind: 'bank', label: 'Bank at Beginning', indent: 0, values: bankAtBeginning, total: bankAtBeginning[0] ?? 0 })

  rows.push(heading('Income'))
  rows.push(...lineRows((m) => m.income_lines, 1, 1))
  rows.push(figures('subtotal', 'Cash Inflows from Operation', 0, months.map((m) => m.cash_inflows)))

  const cogs = lineRows((m) => m.cogs_lines, -1, 1)
  if (cogs.length > 0) {
    rows.push(heading('Cost of Sales'))
    rows.push(...cogs)
  }

  const groups = orderGroups(months.flatMap((m) => m.expense_groups.map((g) => g.group)), groupOrder, cf.expense_group_order)
  if (groups.length > 0) {
    rows.push(heading('Expense'))
    for (const group of groups) {
      const linesOf = (m: (typeof months)[number]) => m.expense_groups.find((g) => g.group === group)?.lines ?? []
      rows.push(figures('group', group, 1, months.map((m) => -(m.expense_groups.find((g) => g.group === group)?.subtotal ?? 0))))
      rows.push(...lineRows(linesOf, -1, 2))
    }
  }
  rows.push(figures('subtotal', 'Cash Outflows from Operation', 0, months.map((m) => -m.cash_outflows)))

  // The engine already signs balance-sheet movements as cash: a stock purchase
  // or a BAS payment is negative, a GST refund positive.
  const assets = lineRows((m) => m.asset_lines, 1, 1)
  if (assets.length > 0) {
    rows.push(heading('Asset'))
    rows.push(...assets)
    rows.push(figures('subtotal', 'Movement in Assets', 0, months.map((m) => m.movement_in_assets)))
  }

  const liabilities = lineRows((m) => m.liability_lines, 1, 1)
  if (liabilities.length > 0) {
    rows.push(heading('Liability'))
    rows.push(...liabilities)
    rows.push(figures('subtotal', 'Movement in Liabilities', 0, months.map((m) => m.movement_in_liabilities)))
  }

  const otherIncome = lineRows((m) => m.other_income_lines, 1, 1)
  if (otherIncome.length > 0) {
    rows.push(heading('Other Income'))
    rows.push(...otherIncome)
  }
  // Printed at 0 too. A row that disappears when it is empty cannot be told
  // apart from a row the page forgot, and Net Movement adds it either way.
  rows.push(figures('subtotal', 'Other Inflows', 0, months.map((m) => m.other_inflows)))

  rows.push(figures('net', 'Net Movement', 0, months.map((m) => m.net_movement)))

  const bankAtEnd = months.map((m) => m.bank_at_end)
  rows.push({ kind: 'bank', label: 'Bank at End', indent: 0, values: bankAtEnd, total: bankAtEnd[bankAtEnd.length - 1] ?? 0 })

  return rows
}

function valueOf(lines: CashflowLine[], label: string): number {
  // Summed, not found: the engine aggregates by label within a section, so one
  // label is one line — but if two ever share a name the row must carry both.
  return lines.reduce((s, l) => (l.label === label ? s + l.value : s), 0)
}

function statementRank(order: readonly string[] | undefined): Map<string, number> {
  const rank = new Map<string, number>()
  for (const [i, name] of (order ?? []).entries()) {
    if (!rank.has(name)) rank.set(name, i)
  }
  return rank
}

/**
 * Unique labels in statement order. A label the statement does not name —
 * the engine's own rows, such as "Opening Debtors Collected" or "Gross
 * Wages" — keeps its first-appearance place after the named ones, so it is
 * printed rather than dropped.
 */
function orderLabels(seen: string[], rank: Map<string, number>): string[] {
  const unique = [...new Set(seen)]
  const first = new Map(unique.map((label, i) => [label, i]))
  return unique.sort((a, b) => {
    const ra = rank.get(a)
    const rb = rank.get(b)
    if (ra !== undefined && rb !== undefined) return ra - rb
    if (ra !== undefined) return -1
    if (rb !== undefined) return 1
    return first.get(a)! - first.get(b)!
  })
}

/**
 * The coach's order first, then the cashflow's own expense_group_order, then —
 * for a cashflow that carries none, or a group it does not name — the order
 * the groups first have cash, so a group is printed rather than dropped.
 */
function orderGroups(
  seen: string[],
  order: readonly string[] | null | undefined,
  fallback: readonly string[] | undefined,
): string[] {
  const unique = [...new Set(seen)]
  const result: string[] = []
  for (const name of [...(order ?? []), ...(fallback ?? []), ...unique]) {
    if (unique.includes(name) && !result.includes(name)) result.push(name)
  }
  return result
}
