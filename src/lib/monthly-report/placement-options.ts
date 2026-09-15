/**
 * The presentation options a coach sets on a placed page from the layout
 * editor, and the one reading of each the PDF applies:
 *
 *   cover_page         reconciliation_line — the report's own line under
 *                      "Prepared on", or Calxa's sentence counted from the CFO
 *                      board's captured Xero badge (DD-14, pack-reconciliation)
 *   executive_summary  margins — Additional Information with both margins, the
 *                      net profit margin only (IICT-13), or none (DD-29)
 *   money_flow         last_line, summary_codes and bank_rows — the page's own
 *                      strict config (money-flow-rows); bank_rows 'moved'
 *                      leaves off accounts that did not move (DD-33)
 *
 * Every option's default is the page as it printed before the option existed,
 * and Apply stores a value only when it differs from that default, so a
 * placement nobody changed keeps the config it had and prints the same bytes.
 *
 * The cover and summary readers are lenient — a value they do not know is the
 * default, because a cover has nowhere to print a configuration error. The
 * money-flow page keeps its strict rule, and the panel offers only the values
 * that rule accepts — the same lists, in the same order (placement-options.test).
 */
export const COVER_RECONCILIATION_LINES = ['standard', 'xero_badge'] as const
export type CoverReconciliationLine = (typeof COVER_RECONCILIATION_LINES)[number]

export const SUMMARY_MARGINS = ['both', 'net_only', 'none'] as const
export type SummaryMargins = (typeof SUMMARY_MARGINS)[number]

const pick = <T extends string>(allowed: readonly T[], value: unknown, fallback: T): T =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback

/** cover_page config.reconciliation_line. */
export function coverReconciliationLine(config: unknown): CoverReconciliationLine {
  return pick(COVER_RECONCILIATION_LINES, (config as { reconciliation_line?: unknown } | null | undefined)?.reconciliation_line, 'standard')
}

/** executive_summary config.margins. */
export function summaryMargins(config: unknown): SummaryMargins {
  return pick(SUMMARY_MARGINS, (config as { margins?: unknown } | null | undefined)?.margins, 'both')
}

export interface PlacementChoice {
  value: string
  label: string
  /** For the canvas line under the placed page; absent for the default. */
  short?: string
  help?: string
}

export interface PlacementOption {
  key: string
  label: string
  help?: string
  default: string
  choices: PlacementChoice[]
}

export interface PlacementOptionSet {
  title: string
  options: PlacementOption[]
}

export type PlacementOptionsType = 'cover_page' | 'executive_summary' | 'money_flow'

export const PLACEMENT_OPTIONS: Record<PlacementOptionsType, PlacementOptionSet> = {
  cover_page: {
    title: 'Cover page options',
    options: [
      {
        key: 'reconciliation_line',
        label: 'Reconciliation line under “Prepared on”',
        default: 'standard',
        choices: [
          {
            value: 'standard',
            label: 'The report’s own line',
            help: '“There are still 3 unreconciled transactions when this report is generated.” when the report carries a count. A draft otherwise says “Draft — figures may change”.',
          },
          {
            value: 'xero_badge',
            label: 'Counted from the Xero badge (CFO board)',
            short: 'Reconciliation from the Xero badge',
            help: '“Please note that no items remain unreconciled as of this report”, or how many do: the lines dated in or before the report month in the latest recon round — as of when the report was finalised or approved, so every copy says the same. Without a fresh capture of every Xero organisation, taken after the month ended, with every line dated by the round’s date pass, the report’s own line prints instead.',
          },
        ],
      },
    ],
  },
  executive_summary: {
    title: 'Summary page options',
    options: [
      {
        key: 'margins',
        label: 'Additional Information',
        help: 'The margin rows under Net Profit.',
        default: 'both',
        choices: [
          { value: 'both', label: 'Gross Profit Margin and Net Profit Margin' },
          { value: 'net_only', label: 'Net Profit Margin only', short: 'Net margin only' },
          { value: 'none', label: 'Leave Additional Information off', short: 'No margins' },
        ],
      },
    ],
  },
  money_flow: {
    title: 'Where Did Our Money Go options',
    options: [
      {
        key: 'last_line',
        label: 'Net Movement',
        default: 'reconciliation',
        choices: [
          { value: 'reconciliation', label: 'The bank’s movement — Surplus + Came From − Spent, which proves the page' },
          { value: 'surplus', label: 'Repeats the Surplus / Deficit, as Calxa prints it', short: 'Last line repeats the surplus' },
        ],
      },
      {
        key: 'summary_codes',
        label: 'Summary line labels',
        default: 'plain',
        choices: [
          { value: 'plain', label: 'Income, Cost of Sales, Expense' },
          { value: 'calxa', label: 'With Calxa’s report-group numbers — 400 · Income, 500 · Cost of Sales', short: 'Calxa numbers' },
        ],
      },
      {
        key: 'bank_rows',
        label: 'How this Affected Our Bank',
        default: 'all',
        choices: [
          { value: 'all', label: 'Every bank account with a balance' },
          {
            value: 'moved',
            label: 'Only the accounts that moved this month',
            short: 'Moved bank accounts only',
            help: 'An account whose opening and closing balances print the same is left off. The Total is unchanged.',
          },
        ],
      },
    ],
  },
}

export function hasPlacementOptions(type: string): type is PlacementOptionsType {
  return Object.prototype.hasOwnProperty.call(PLACEMENT_OPTIONS, type)
}

const asObject = (config: unknown): Record<string, unknown> =>
  config && typeof config === 'object' && !Array.isArray(config) ? (config as Record<string, unknown>) : {}

/**
 * A stored config as the panel's choices, and what the panel cannot show:
 * `unrecognised` keys no option owns (typed by hand), which Apply keeps unless
 * told otherwise; `invalid` owned keys holding a value no choice offers, which
 * Apply replaces with the choice shown.
 */
export function readPlacementOptions(
  type: PlacementOptionsType,
  config: unknown,
): { values: Record<string, string>; unrecognised: string[]; invalid: string[] } {
  const stored = asObject(config)
  const { options } = PLACEMENT_OPTIONS[type]
  const values: Record<string, string> = {}
  const invalid: string[] = []
  for (const option of options) {
    const offered = option.choices.map((c) => c.value)
    values[option.key] = pick(offered, stored[option.key], option.default)
    if (option.key in stored && !offered.includes(stored[option.key] as string)) invalid.push(option.key)
  }
  const unrecognised = Object.keys(stored).filter((key) => !options.some((o) => o.key === key))
  return { values, unrecognised, invalid }
}

/**
 * The config Apply stores: the keys no option owns (unless dropped), then each
 * option whose value is an offered choice other than its default.
 */
export function applyPlacementOptions(
  type: PlacementOptionsType,
  config: unknown,
  values: Record<string, string>,
  opts: { dropUnrecognised?: boolean } = {},
): Record<string, unknown> {
  const { options } = PLACEMENT_OPTIONS[type]
  const owned = new Set(options.map((o) => o.key))
  const next: Record<string, unknown> = {}
  if (!opts.dropUnrecognised) {
    for (const [key, value] of Object.entries(asObject(config))) {
      if (!owned.has(key)) next[key] = value
    }
  }
  for (const option of options) {
    const value = values[option.key]
    if (value !== option.default && option.choices.some((c) => c.value === value)) next[option.key] = value
  }
  return next
}

/**
 * The line under a placed page on the editor's canvas. A money-flow config the
 * page will refuse says so here, so the error is not first seen in the PDF.
 */
export function placementOptionsSummary(type: PlacementOptionsType, config: unknown): string {
  const { values, unrecognised, invalid } = readPlacementOptions(type, config)
  if (type === 'money_flow' && unrecognised.length + invalid.length > 0) return 'Settings need attention'
  const set = PLACEMENT_OPTIONS[type].options
    .filter((o) => values[o.key] !== o.default)
    .map((o) => o.choices.find((c) => c.value === values[o.key])?.short ?? values[o.key])
  return set.length > 0 ? set.join(' · ') : 'Standard'
}
