/**
 * WD.2 — section-scoped Budget-vs-Actual tables.
 *
 * The Calxa packs carry per-section detail tables ("Income Analysis | Table",
 * "COGS Analysis | Table", "EXPENSES Analysis | Table") alongside the full
 * statement. WisdomBI's detail renderer already draws the full statement; a
 * WC.1 config on the placed widget scopes it to a section subset instead of
 * minting per-section table widgets.
 *
 * Config shapes accepted on a `budget_vs_actual` widget:
 *   { section: 'income' | 'cogs' | 'expense' }   — shorthand, matches the
 *                                                  analysis charts' vocabulary
 *   { sections: ['Revenue', 'Other Income'] }    — explicit category list
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

const TITLES: Record<string, string> = {
  Revenue: 'Income Analysis',
  'Cost of Sales': 'COGS Analysis',
  'Operating Expenses': 'Expenses Analysis',
  'Other Income': 'Other Income Analysis',
  'Other Expenses': 'Other Expenses Analysis',
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
 * Page title for a filtered table. One category gets its Calxa-style name;
 * multiple get a joined label; null filter keeps the full-statement title
 * (returned as null so the caller uses its default).
 */
export function sectionTableTitle(filter: ReportCategory[] | null): string | null {
  if (!filter || filter.length === 0) return null
  if (filter.length === 1) return TITLES[filter[0]] ?? `${filter[0]} Analysis`
  return filter.map((c) => TITLES[c] ?? c).join(' + ')
}
