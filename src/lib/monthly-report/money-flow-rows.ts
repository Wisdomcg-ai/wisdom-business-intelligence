/**
 * The rows of the Where Did Our Money Go? page, and the one choice a placement
 * can make about them.
 *
 * Decided here rather than in the PDF service so the arithmetic the page
 * prints — every total and the last line — is under test on its own, with
 * Urban Road's real August figures, apart from how jsPDF lays it out.
 */
import { z } from 'zod'
import { flowSurplus, type MoneyFlow } from './money-flow'
import { listOf } from './multi-org-consolidate'

/**
 * A placement's config. Strict: the layout editor's options panel offers only
 * these values (placement-options), but a config typed by hand in SQL still
 * reaches the page, and a typo there ('Surplus', or lastLine for last_line)
 * must come back as a reason the page prints, not as the default quietly
 * standing in for what was asked.
 *
 * last_line — what the page's last line says.
 *   'reconciliation' (default) — Net Movement = Surplus + Came From − Spent,
 *     which is the bank's movement: the line proves the page. Urban Road,
 *     August 2026: 132,701 + 110,429 − 274,838 = (31,708), the bank Total
 *     directly above it.
 *   'surplus' — Calxa's line, which repeats the Surplus / Deficit (Calxa p26:
 *     "Net Movement 133,555" under a bank Total of (31,708)). For a client who
 *     wants the pack they have always had, line for line.
 *
 * summary_codes — how the Summary Income and Expenditure lines are labelled.
 *   'plain' (default) — Income, Cost of Sales, Expense, Other Income, Other
 *     Expense.
 *   'calxa' — with Calxa's report-group numbers, 400 · Income … as its pack
 *     prints them. The numbers are Calxa's mapping, not Xero's; on a client who
 *     never used Calxa they are noise.
 *
 * bank_rows — which accounts How this Affected Our Bank lists.
 *   'all' (default) — every chosen bank account with a balance at either date.
 *   'moved' — only those whose movement prints as something other than 0.
 *     Calxa's Distinct Directions p22 leaves Cash Draw, OFFSET and Petty Cash
 *     off; ours printed "Petty Cash 156 156 0" (DD-33). The Total is the
 *     bank's movement either way, so nothing it proves changes.
 */
export const MONEY_FLOW_LAST_LINES = ['reconciliation', 'surplus'] as const
export const MONEY_FLOW_SUMMARY_CODES = ['plain', 'calxa'] as const
export const MONEY_FLOW_BANK_ROWS = ['all', 'moved'] as const

const configSchema = z.strictObject({
  last_line: z.enum(MONEY_FLOW_LAST_LINES).default('reconciliation'),
  summary_codes: z.enum(MONEY_FLOW_SUMMARY_CODES).default('plain'),
  bank_rows: z.enum(MONEY_FLOW_BANK_ROWS).default('all'),
})

export type MoneyFlowConfig = z.infer<typeof configSchema>
export type MoneyFlowLastLine = MoneyFlowConfig['last_line']

export type ParsedMoneyFlowConfig = { ok: true; config: MoneyFlowConfig } | { ok: false; reason: string }

/** widget.config → a MoneyFlowConfig, or the reason it is not one (as parseRatioAnalysisConfig). */
export function parseMoneyFlowConfig(raw: unknown): ParsedMoneyFlowConfig {
  const result = configSchema.safeParse(raw ?? {})
  if (result.success) return { ok: true, config: result.data }
  const reason = result.error.issues
    .slice(0, 3)
    .map((issue) => (issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message))
    .join('; ')
  return { ok: false, reason }
}

export type MoneyFlowRow =
  | { type: 'section'; label: string }
  | { type: 'line'; label: string; opening: number | null; closing: number | null; movement: number }
  | { type: 'total'; label: string; movement: number }
  | { type: 'last'; label: string; movement: number }

export interface MoneyFlowRows {
  rows: MoneyFlowRow[]
  /** Printed under the table, in this order. Empty on a page that ties. */
  notes: string[]
}

const round2 = (v: number) => Math.round(v * 100) / 100

/**
 * A movement under 50c prints as "0" — the rule deriveMoneyFlow already applies
 * to the sources and uses (its minItem), here for bank_rows 'moved'.
 */
const PRINTS_AS_ZERO = 0.5

/** Whole dollars, as the page prints them — for the wording of a note. */
const dollars = (v: number) => {
  const abs = Math.round(Math.abs(v)).toLocaleString('en-AU')
  return v < 0 ? `(${abs})` : abs
}

/**
 * The Summary Income and Expenditure lines. With summary_codes 'calxa' they
 * carry Calxa's report-group numbers — 400 Income, 500 Cost of Sales, 600
 * Expense, 800 Other Income, 900 Other Expense (the last from Calxa's Distinct
 * Directions mapping; Urban Road has none to print). Income always prints; the
 * others only when there is a dollar to show, the way Calxa leaves Other
 * Expense off Urban Road's page.
 */
function summaryLines(flow: MoneyFlow, codes: MoneyFlowConfig['summary_codes']): MoneyFlowRow[] {
  const s = flow.summary
  if (!s) return []
  const lines: [string, string, number, boolean][] = [
    ['400', 'Income', s.income, true],
    ['500', 'Cost of Sales', s.cost_of_sales, false],
    ['600', 'Expense', s.expense, false],
    ['800', 'Other Income', s.other_income, false],
    ['900', 'Other Expense', s.other_expense, false],
  ]
  return lines
    .filter(([, , v, always]) => always || Math.round(v) !== 0)
    .map(([code, name, v]) => ({
      type: 'line' as const,
      label: codes === 'calxa' ? `${code} · ${name}` : name,
      opening: null,
      closing: null,
      movement: v,
    }))
}

/**
 * The page's own proof: Surplus + Came From - Spent, the movements under 50c
 * that no row lists included, against the bank movement.
 *
 * Built from the P&L surplus, not the balance sheet's earnings movement that
 * continuity_residual uses. The two agree unless the P&L and the balance sheet
 * disagree about the month's profit, and then only this one is what the page
 * prints — so preflight reads it from here rather than re-deriving it.
 */
export function moneyFlowProof(flow: Pick<MoneyFlow, 'summary' | 'earnings_movement' | 'sources' | 'uses' | 'unlisted_movement' | 'bank'>): {
  reconciled: number
  gap: number
  /** The note the page prints under the table, or null when the gap would not show. */
  gapNote: string | null
} {
  const surplus = flowSurplus(flow)
  const cameFrom = round2(flow.sources.reduce((s, i) => s + i.amount, 0))
  const spent = round2(flow.uses.reduce((s, i) => s + i.amount, 0))
  const reconciled = round2(surplus + cameFrom - spent + flow.unlisted_movement)
  // Only when the difference would show on the page. It is not a rounding
  // artefact to hide: the P&L and the balance sheet disagree about the month's
  // profit — a posting straight to retained earnings, or a sync caught between
  // the two reports — and the reader should know before trusting the rest.
  const gap = round2(reconciled - flow.bank.delta)
  // A hyphen, not U+2212: jsPDF's Helvetica is WinAnsi, which has no minus
  // sign, and one character outside it garbles the whole line.
  const gapNote = Math.round(gap) !== 0
    ? `Surplus + Came From - Spent is ${dollars(reconciled)}, which misses the bank movement of ${dollars(flow.bank.delta)} by ${dollars(gap)}: ` +
      "the month's profit on the income statement and on the balance sheet differ by that much."
    : null
  return { reconciled, gap, gapNote }
}

export function moneyFlowRows(flow: MoneyFlow, config: MoneyFlowConfig): MoneyFlowRows {
  const rows: MoneyFlowRow[] = []
  const notes: string[] = []
  const surplus = flowSurplus(flow)
  const cameFrom = round2(flow.sources.reduce((s, i) => s + i.amount, 0))
  const spent = round2(flow.uses.reduce((s, i) => s + i.amount, 0))

  rows.push({ type: 'section', label: 'Summary Income and Expenditure' })
  rows.push(...summaryLines(flow, config.summary_codes))
  rows.push({ type: 'total', label: 'Surplus / Deficit', movement: surplus })

  rows.push({ type: 'section', label: 'Where Our Money Came From' })
  for (const i of flow.sources) rows.push({ type: 'line', label: i.label, opening: i.opening, closing: i.closing, movement: i.amount })
  rows.push({ type: 'total', label: 'Total', movement: cameFrom })

  rows.push({ type: 'section', label: "Where We've Spent Our Money" })
  for (const i of flow.uses) rows.push({ type: 'line', label: i.label, opening: i.opening, closing: i.closing, movement: i.amount })
  rows.push({ type: 'total', label: 'Total', movement: spent })

  rows.push({ type: 'section', label: 'How this Affected Our Bank' })
  for (const b of flow.bank_accounts) {
    if (config.bank_rows === 'moved' && Math.abs(b.movement) < PRINTS_AS_ZERO) continue
    rows.push({ type: 'line', label: b.label, opening: b.opening, closing: b.closing, movement: b.movement })
  }
  rows.push({ type: 'total', label: 'Total', movement: flow.bank.delta })

  // The movements under 50c that no row lists still belong in the proof, or a
  // page whose Rounding account moved 7c would miss its bank by 7c.
  const { reconciled, gapNote } = moneyFlowProof(flow)
  rows.push({
    type: 'last',
    label: 'Net Movement',
    movement: config.last_line === 'surplus' ? surplus : reconciled,
  })

  // Named first, the way P8's consolidated balance sheet does: nothing else on
  // this page says which organisations it added, and a group that quietly
  // loses a connection would otherwise print every total short and silent.
  if (flow.organisations && flow.organisations.length > 0) {
    notes.push(
      `Added together: ${listOf(flow.organisations.map((o) => (o.currency === 'AUD' ? o.name : `${o.name} (${o.currency})`)))}.`,
    )
  }
  if (!flow.summary) {
    notes.push("This month's income and expenses are not in the stored Xero sync, so the surplus is the movement in earnings on the balance sheet.")
  }
  if (gapNote) notes.push(gapNote)
  // Two different mistakes in a bank list, said as two different things: an
  // account the balance sheet does not hold (closed, or an id from another
  // organisation) and one it holds as something other than cash.
  for (const a of flow.non_asset_bank_accounts) {
    notes.push(`${a.label} is chosen as a bank account for this report, but it is ${a.kind === 'asset' ? 'an' : 'a'} ${a.kind} in this balance sheet, so it is not counted as bank.`)
  }
  if (flow.unmatched_bank_account_ids.length > 0) {
    const n = flow.unmatched_bank_account_ids.length
    notes.push(`${n} of the bank accounts chosen for this report ${n === 1 ? 'is' : 'are'} not in this balance sheet, so ${n === 1 ? 'it is' : 'they are'} not counted as bank - check the report settings.`)
  }

  return { rows, notes }
}
