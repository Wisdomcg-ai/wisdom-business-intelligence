/**
 * Ratio Analysis — one account (or several, or a statement total) as a
 * percentage of another, month by month, with trailing averages.
 *
 * The generalisable half of Urban Road's hand-built "COGS Tables" page:
 * Freight % of Income and Posters COGS % of Posters income, for the report
 * month and the two before it, each with a six- and a three-month average. Any
 * client can have the same page by configuration; nothing here knows about
 * freight or posters.
 *
 * Every rule lives in this module so it can be tested without a PDF:
 *
 *   - ratio = numerator / denominator × 100, unclamped. A negative numerator
 *     (a credit-note month) is a negative ratio, and prints as one.
 *   - A cell that cannot be computed is EMPTY WITH A REASON, never 0%. The sync
 *     writes no zero rows, so "nothing posted" and "$0 posted" are the same
 *     fact to us — and Urban Road's August Posters COGS is exactly that case:
 *     the supplier had not billed, Xero shows $0, and a 0% cost ratio would
 *     have told the client posters were free that month.
 *   - An average is printed only when EVERY month in its window has a ratio.
 *     Averaging the five months that exist and calling it a six-month average
 *     is a different number under the same heading.
 *   - An average is the MEAN OF THE MONTHLY RATIOS, over a window that includes
 *     the column's own month — not total freight over total income. That is
 *     how the reference pack computes it: its printed 9.60 / 10.35 / 10.56 and
 *     9.61 / 9.46 / 9.08 are reproduced to 2dp by this rule and by no other
 *     (see the method-proof test).
 *   - The latest month prints as it stands. Figures are live from the ledger,
 *     not frozen at report time.
 */
import { z } from 'zod'
import {
  ACCOUNT_CODE_RE,
  STATEMENT_TOTALS,
  shiftMonth,
  type AccountActuals,
  type StatementTotal,
} from './account-actuals'

export type { AccountActuals, StatementTotal } from './account-actuals'

// ── Config ───────────────────────────────────────────────────────────────────

const labelSchema = z.string().trim().min(1).max(80)

const trailingSchema = z
  .array(z.number().int().min(2).max(12))
  .max(4)
  .refine((a) => new Set(a).size === a.length, { message: 'each trailing average may appear once' })

const operandSchema = z.union([
  // Strict, so an operand naming BOTH accounts and a total is refused rather
  // than silently read as whichever branch matched first.
  z.strictObject({
    accounts: z.array(z.string().trim().regex(ACCOUNT_CODE_RE, 'not a Xero account code')).min(1).max(20),
    label: labelSchema.optional(),
  }),
  z.strictObject({
    total: z.enum(STATEMENT_TOTALS as [StatementTotal, ...StatementTotal[]]),
    label: labelSchema.optional(),
  }),
])

const configSchema = z.strictObject({
  months_shown: z.number().int().min(1).max(6).default(3),
  trailing_averages: trailingSchema.default([6, 3]),
  show_amounts: z.boolean().default(true),
  ratios: z
    .array(
      z.strictObject({
        label: labelSchema,
        numerator: operandSchema,
        denominator: operandSchema,
        trailing_averages: trailingSchema.optional(),
      }),
    )
    .min(1)
    .max(4),
})

export type RatioOperand = z.infer<typeof operandSchema>
export type RatioAnalysisConfig = z.infer<typeof configSchema>
export type RatioDefinition = RatioAnalysisConfig['ratios'][number]

export type ParsedRatioConfig = { ok: true; config: RatioAnalysisConfig } | { ok: false; reason: string }

/**
 * Parse a placed widget's config. A bad config is a sentence for the page, not
 * an exception: generateFromLayout's catch prints "Render error" and hides the
 * cause from the only person who can fix it.
 */
export function parseRatioAnalysisConfig(config: unknown): ParsedRatioConfig {
  const result = configSchema.safeParse(config ?? {})
  if (result.success) return { ok: true, config: result.data }
  const reason = result.error.issues
    .slice(0, 3)
    .map((issue) => (issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message))
    .join('; ')
  return { ok: false, reason }
}

function trailingFor(config: RatioAnalysisConfig, ratio: RatioDefinition): number[] {
  return ratio.trailing_averages ?? config.trailing_averages
}

/**
 * The data every placement needs, so the loader fetches ONCE: the longest
 * window any ratio reads (its columns plus its widest average reaching back
 * from the oldest column), and every account code named anywhere.
 */
export function requiredWindow(configs: readonly RatioAnalysisConfig[]): { months: number; codes: string[] } {
  let months = 0
  const codes = new Set<string>()
  for (const config of configs) {
    for (const ratio of config.ratios) {
      const widest = Math.max(1, ...trailingFor(config, ratio))
      months = Math.max(months, config.months_shown + widest - 1)
      for (const op of [ratio.numerator, ratio.denominator]) {
        if ('accounts' in op) for (const c of op.accounts) codes.add(c)
      }
    }
  }
  return { months, codes: [...codes].sort() }
}

// ── Table ────────────────────────────────────────────────────────────────────

export type RatioCell = { kind: 'value'; value: number } | { kind: 'empty'; reason: string }

export interface RatioRow {
  kind: 'numerator' | 'denominator' | 'ratio' | 'average'
  label: string
  /** Months in the average's window; only on 'average' rows. */
  window?: number
  /** One per column, newest first. */
  cells: RatioCell[]
}

export interface RatioTable {
  label: string
  /** Column months, NEWEST FIRST — the reference pack reads right to left. */
  months: string[]
  rows: RatioRow[]
  /** The trailing windows printed, in the order given. Empty = no averages. */
  averages: number[]
  /** Every distinct reason behind an empty cell, in first-seen order. */
  reasons: string[]
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** '2026-08' → 'Aug 2026'. String arithmetic, so no timezone can move it. */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${MONTH_NAMES[m - 1]} ${y}`
}

const TOTAL_LABELS: Record<StatementTotal, string> = {
  income: 'Total Income',
  cost_of_sales: 'Total Cost of Sales',
  gross_profit: 'Gross Profit',
  operating_expenses: 'Total Operating Expenses',
}

/**
 * 'Freight to Customer (55000)'. Some Xero names already carry their code —
 * Urban Road's 41700 is named 'Posters (41700)' — and appending it again
 * printed 'Posters (41700) (41700)'.
 */
function accountLabel(name: string, code: string): string {
  return name.trim().endsWith(`(${code})`) ? name.trim() : `${name} (${code})`
}

function operandLabel(op: RatioOperand, actuals: AccountActuals | null): string {
  if (op.label) return op.label
  if ('total' in op) return TOTAL_LABELS[op.total]
  return op.accounts
    .map((code) => {
      const name = actuals?.accounts[code]?.name
      return name ? accountLabel(name, code) : code
    })
    .join(' + ')
}

type Amount = { kind: 'value'; value: number } | { kind: 'empty'; reason: string }

/** The operand's dollar figure for one month, or why there isn't one. */
function operandAmount(op: RatioOperand, actuals: AccountActuals, month: string): Amount {
  if ('total' in op) {
    const v = actuals.totals[op.total]?.[month]
    return v === undefined
      ? { kind: 'empty', reason: `no ${TOTAL_LABELS[op.total]} posted for ${monthLabel(month)}` }
      : { kind: 'value', value: v }
  }
  let sum = 0
  const unposted: string[] = []
  for (const code of op.accounts) {
    const account = actuals.accounts[code]
    // Checked by the caller before any month is looked at; defended here too.
    if (!account) return { kind: 'empty', reason: `account ${code} not found` }
    const v = account.values[month]
    // A single-account operand the coach has labelled is named as the row is,
    // so the note under the table points at a line the reader can see.
    const name = op.label && op.accounts.length === 1 ? op.label : account.name
    if (v === undefined) unposted.push(accountLabel(name, code))
    else sum += v
  }
  // Any unposted account empties the cell, not only all of them. A partial sum
  // is an understated figure under a heading that promises the whole group.
  if (unposted.length > 0) {
    return { kind: 'empty', reason: `no amount posted to ${unposted.join(', ')} for ${monthLabel(month)}` }
  }
  return { kind: 'value', value: sum }
}

/**
 * The cell for one month, checked in the order a reader needs the answer:
 * a configuration fault first (it empties every month), then history, then
 * the month's own postings.
 */
function ratioCell(ratio: RatioDefinition, actuals: AccountActuals, month: string): { ratio: RatioCell; num: Amount; den: Amount } {
  const fail = (reason: string) => {
    const empty = { kind: 'empty' as const, reason }
    return { ratio: empty, num: empty, den: empty }
  }

  for (const op of [ratio.numerator, ratio.denominator]) {
    if ('accounts' in op) {
      for (const code of op.accounts) {
        if (!actuals.accounts[code]) return fail(`account ${code} not found`)
      }
    }
  }

  const first = actuals.first_synced_month
  if (!first || month < first) {
    return fail(first ? `not enough history — synced from ${monthLabel(first)}` : 'not enough history — nothing has synced')
  }
  if (!actuals.months.includes(month)) {
    // Not a fact about the ledger: the loader asked for a shorter window than
    // this table reads. Said plainly so it is found, not averaged around.
    return fail(`${monthLabel(month)} was not loaded for this page`)
  }

  const num = operandAmount(ratio.numerator, actuals, month)
  const den = operandAmount(ratio.denominator, actuals, month)
  if (num.kind === 'empty') return { ratio: num, num, den }
  if (den.kind === 'empty') return { ratio: den, num, den }
  if (den.value === 0) {
    return { ratio: { kind: 'empty', reason: `${operandLabel(ratio.denominator, actuals)} was zero for ${monthLabel(month)}` }, num, den }
  }
  if (den.value < 0) {
    // A percentage of a negative base inverts its meaning (more freight would
    // read as a smaller share). Stated, not printed.
    return { ratio: { kind: 'empty', reason: `${operandLabel(ratio.denominator, actuals)} was negative for ${monthLabel(month)}` }, num, den }
  }
  return { ratio: { kind: 'value', value: (num.value / den.value) * 100 }, num, den }
}

export const AVERAGE_NEEDS_EVERY_MONTH =
  'an average is shown only when every month in its window has a ratio'

export interface RatioTableOptions {
  months_shown: number
  trailing_averages: number[]
  show_amounts: boolean
}

export function buildRatioTable(
  actuals: AccountActuals,
  ratio: RatioDefinition,
  reportMonth: string,
  opts: RatioTableOptions,
): RatioTable {
  const trailing = ratio.trailing_averages ?? opts.trailing_averages
  const months = Array.from({ length: opts.months_shown }, (_, i) => shiftMonth(reportMonth, -i))

  const memo = new Map<string, ReturnType<typeof ratioCell>>()
  const at = (month: string) => {
    let hit = memo.get(month)
    if (!hit) {
      hit = ratioCell(ratio, actuals, month)
      memo.set(month, hit)
    }
    return hit
  }

  const rows: RatioRow[] = []
  if (opts.show_amounts) {
    rows.push({ kind: 'numerator', label: operandLabel(ratio.numerator, actuals), cells: months.map((m) => at(m).num) })
    rows.push({ kind: 'denominator', label: operandLabel(ratio.denominator, actuals), cells: months.map((m) => at(m).den) })
  }
  rows.push({ kind: 'ratio', label: ratio.label, cells: months.map((m) => at(m).ratio) })

  for (const window of trailing) {
    rows.push({
      kind: 'average',
      label: `${window}-month avg %`,
      window,
      cells: months.map((column): RatioCell => {
        // The window INCLUDES the column's own month: August's six-month
        // average is March to August.
        const span = Array.from({ length: window }, (_, i) => shiftMonth(column, -(window - 1) + i))
        const missing = span.filter((m) => at(m).ratio.kind === 'empty')
        if (missing.length > 0) {
          return {
            kind: 'empty',
            reason: `the ${window}-month average needs a ratio for every month from ${monthLabel(span[0])} to ${monthLabel(column)}`,
          }
        }
        const sum = span.reduce((t, m) => t + (at(m).ratio as { value: number }).value, 0)
        return { kind: 'value', value: sum / window }
      }),
    })
  }

  // The reasons printed under the block. For an average, the note names what
  // emptied the month INSIDE its window — the unbilled August — and then states
  // the averaging rule once. Listing each column's window range instead put six
  // near-identical sentences under a three-column table.
  const reasons: string[] = []
  const note = (r: string) => { if (!reasons.includes(r)) reasons.push(r) }
  let averageShort = false
  for (const row of rows) {
    row.cells.forEach((cell, i) => {
      if (cell.kind !== 'empty') return
      if (row.kind !== 'average' || !row.window) {
        note(cell.reason)
        return
      }
      averageShort = true
      for (let k = row.window - 1; k >= 0; k--) {
        const inner = at(shiftMonth(months[i], -k)).ratio
        if (inner.kind === 'empty') note(inner.reason)
      }
    })
  }
  if (averageShort) note(AVERAGE_NEEDS_EVERY_MONTH)

  return { label: ratio.label, months, rows, averages: trailing, reasons }
}

// ── Formatting ───────────────────────────────────────────────────────────────

/** The text a cell prints: '9.65%', '50,925', '(1,204)', or '—'. */
export function formatRatioCell(row: Pick<RatioRow, 'kind'>, cell: RatioCell): string {
  if (cell.kind === 'empty') return '—'
  if (row.kind === 'ratio' || row.kind === 'average') {
    const text = Math.abs(cell.value).toFixed(2)
    return Math.round(cell.value * 100) < 0 ? `(${text}%)` : `${text}%`
  }
  const abs = Math.abs(cell.value).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  // Rounded before the sign test, as packMoney does: -0.4 is not "(0)".
  return Math.round(cell.value) < 0 ? `(${abs})` : abs
}
