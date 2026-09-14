/**
 * WD.2 — section-scoped Budget-vs-Actual tables.
 *
 * The Calxa packs carry per-section detail tables (income, COGS and expenses,
 * each titled "Actual vs Budget"). WisdomBI's detail renderer already draws the
 * full statement; a WC.1 config on the placed widget scopes it to a section
 * subset instead of minting per-section table widgets.
 *
 * Config shapes accepted on a `budget_vs_actual` widget:
 *   { section: 'income' | 'cogs' | 'expense' }   — shorthand, matches the
 *                                                  analysis charts' vocabulary
 *   { sections: ['Revenue', 'Other Income'] }    — explicit category list
 *   { variance_percent: false }                  — drop the Var (%) columns
 *
 * No config (or anything unrecognised) = the full statement, unchanged.
 */
import type { ReportCategory } from '../types'
import { REPORT_CATEGORIES } from '../types'

const SHORTHAND: Record<string, ReportCategory[]> = {
  income: ['Revenue'],
  cogs: ['Cost of Sales'],
  expense: ['Operating Expenses'],
}

/**
 * Resolve a widget config into a section filter, or null for the full
 * statement. Unknown category strings are dropped; a config that resolves to
 * nothing valid falls back to null rather than rendering an empty table.
 */
export function resolveSectionFilter(
  config: Record<string, unknown> | undefined,
): ReportCategory[] | null {
  if (!config) return null

  if (typeof config.section === 'string' && SHORTHAND[config.section]) {
    return SHORTHAND[config.section]
  }

  if (Array.isArray(config.sections)) {
    const valid = config.sections.filter(
      (s): s is ReportCategory =>
        typeof s === 'string' && (REPORT_CATEGORIES as string[]).includes(s),
    )
    return valid.length > 0 ? valid : null
  }

  return null
}

/**
 * Whether a placed table prints the percentage variance columns.
 *
 * Calxa's Actual vs Budget pages have none: a percentage of a $0 budget is the
 * +1933.5% and -45862.5% Urban Road's August pack printed beside the dollar
 * variance that already said the same thing. They were hard-coded, so no
 * client could turn them off. A per-placement switch rather than a settings
 * column because it is a property of how ONE page reads — and it needs no
 * migration applied by hand before the pack can use it.
 *
 * Absent or anything but `false` keeps them: every pack that has them today
 * keeps them until someone decides otherwise.
 */
export function showsVariancePercent(config: Record<string, unknown> | undefined): boolean {
  return config?.variance_percent !== false
}

/**
 * Page title for a filtered table, or null for the full statement (the caller
 * keeps its default).
 *
 * Every section table is "Actual vs Budget" — the income, COGS and expense
 * tables on Calxa's pages 4, 6 and 10 all carry that one title, and the
 * section names ("Income Analysis", "COGS Analysis") belong to the CHART pages
 * in front of them. Borrowing the chart's name for the table put "COGS
 * Analysis" on two consecutive pages that show different things. A placement
 * that wants another title sets widget.titleOverride.
 */
export function sectionTableTitle(filter: ReportCategory[] | null): string | null {
  if (!filter || filter.length === 0) return null
  return 'Actual vs Budget'
}
