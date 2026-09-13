/**
 * The Full Year page's expense groups.
 *
 * The Full Year page printed Operating Expenses as one flat run — A-Z, then
 * account-code order since #517 — which matched neither the Actual vs Budget
 * page two pages earlier nor Calxa's Full Year page, both of which gather
 * Urban Road's 49 expense accounts under nine headings with a subtotal each.
 *
 * Same membership and heading order as the Actual vs Budget page, on purpose:
 * partitionByGroup decides both, and the lines carry their group from the same
 * reader (mappingGroup). Only the subtotal differs, because a Full Year row is
 * twelve months and three totals rather than an actual and a budget.
 *
 * Display only. The route keeps each section's lines flat and in code order;
 * the renderers group them, and the section total, Gross Profit and Net Profit
 * are untouched — the groups move lines under headings, never money between
 * totals.
 */

import type { FullYearLine } from '@/app/finances/monthly-report/types'
import { partitionByGroup } from './expense-groups'
import { buildFullYearSubtotal } from './full-year-subtotal'

export interface FullYearGroup {
  /** The heading, or null for the run of accounts that carry no group. */
  name: string | null
  lines: FullYearLine[]
  /**
   * The group's own row, whose account_name is the group name — renderers
   * print `Total ${name}`. Null for the ungrouped run, as on the Actual vs
   * Budget page: a subtotal under no heading is a number a reader cannot name.
   */
  subtotal: FullYearLine | null
}

/**
 * @param lines    the section's lines, in statement order
 * @param order    the coach's heading order (monthly_report_settings.expense_group_order)
 * @param category the section's category, which sets the subtotal's variance sign
 */
export function groupFullYearLines(
  lines: readonly FullYearLine[],
  order: readonly string[] | null | undefined,
  category: string,
): FullYearGroup[] {
  return partitionByGroup(lines, order).map((g) => ({
    ...g,
    subtotal: g.name
      ? {
          ...buildFullYearSubtotal(g.lines, g.name, category, g.lines[0].months.map((m) => m.month)),
          group: g.name,
        }
      : null,
  }))
}
