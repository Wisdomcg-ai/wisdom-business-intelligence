/**
 * WD.4 — Where Did Our Money Go?
 *
 * The funds-flow derivation: every non-bank balance-sheet movement between two
 * month-ends is a source or a use of cash, and by the accounting equation
 * their net IS the bank movement — to the cent, with no plug figure. That
 * identity is the page's own proof: when it doesn't hold (the stored BS fails
 * A = L + E at either date, a month is missing, or the business is
 * multi-entity with mixed currencies) the page says "couldn't check" instead
 * of rendering a story that doesn't add up.
 *
 * Sign conventions (verified against prod 2026-09-01): liabilities and equity
 * are stored POSITIVE; A − L − E = 0 on clean tenants.
 *
 * Classification:
 *   bank            = section 'Bank' AND account_type 'asset'
 *   asset   Δ up    → USE   ("more money tied up")     Δ down → SOURCE
 *   liability Δ up  → SOURCE ("owed more")             Δ down → USE
 *   equity  Δ up    → SOURCE (profit / capital in)     Δ down → USE
 *
 * Pure — the route is a thin IO wrapper.
 */

export interface BsRowInput {
  account_name: string
  /** 'asset' | 'liability' | 'equity' (canonical, from the BS mirror). */
  account_type: string
  section: string | null
  tenant_id: string
  balances_by_date: Record<string, number | string | null>
}

export interface FlowItem {
  label: string
  section: string | null
  amount: number
  /** 'asset' | 'liability' | 'equity' — for grouping/wording in the renderer. */
  kind: string
}

export interface MoneyFlow {
  comparable: boolean
  /** Set when not comparable — shown to the reader verbatim. */
  reason?: string
  period_month: string
  prior_month: string
  bank: { start: number; end: number; delta: number }
  sources: FlowItem[]
  uses: FlowItem[]
  /** sources − uses − Δbank. 0 by construction when the equation holds. */
  continuity_residual: number
}

/** Last calendar day of 'YYYY-MM' as 'YYYY-MM-DD'. */
export function endOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
}

/** Prior 'YYYY-MM'. */
export function priorMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

const round2 = (v: number) => Math.round(v * 100) / 100
const num = (v: number | string | null | undefined) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

const notComparable = (period: string, prior: string, reason: string): MoneyFlow => ({
  comparable: false,
  reason,
  period_month: period,
  prior_month: prior,
  bank: { start: 0, end: 0, delta: 0 },
  sources: [],
  uses: [],
  continuity_residual: 0,
})

export function deriveMoneyFlow(
  rows: BsRowInput[],
  period: string,
  opts: { equationTolerance?: number; minItem?: number } = {},
): MoneyFlow {
  const prior = priorMonth(period)
  const endKey = endOfMonth(period)
  const startKey = endOfMonth(prior)
  // The stored equation holds to ~the cent on clean tenants; $1 absorbs
  // accumulated rounding without letting a real imbalance through.
  const equationTolerance = opts.equationTolerance ?? 1
  // Sub-cent deltas are storage noise, not movements.
  const minItem = opts.minItem ?? 0.005

  if (rows.length === 0) {
    return notComparable(period, prior, 'No stored balance sheet for this business yet.')
  }

  // WD.6 ships per-entity columns; until then a multi-entity flow would sum
  // mixed currencies (IICT holds HKD) — refuse honestly.
  const tenants = new Set(rows.map((r) => r.tenant_id))
  if (tenants.size > 1) {
    return notComparable(period, prior, 'This business has multiple Xero organisations — per-entity money flow arrives with the entity columns work.')
  }

  // Both month-ends must exist on at least one row; a business synced mid-year
  // has no prior month to move from.
  const hasEnd = rows.some((r) => r.balances_by_date[endKey] !== undefined)
  const hasStart = rows.some((r) => r.balances_by_date[startKey] !== undefined)
  if (!hasEnd || !hasStart) {
    return notComparable(
      period, prior,
      !hasEnd
        ? `No stored balance sheet for ${period} yet — sync may not have reached it.`
        : `No stored balance sheet for ${prior} — the month before this one hasn't been synced.`,
    )
  }

  // The page's licence to render: A − L − E within tolerance at BOTH dates.
  for (const [label, key] of [[prior, startKey], [period, endKey]] as const) {
    let a = 0, l = 0, e = 0
    for (const r of rows) {
      const v = num(r.balances_by_date[key])
      if (r.account_type === 'asset') a += v
      else if (r.account_type === 'liability') l += v
      else if (r.account_type === 'equity') e += v
    }
    if (Math.abs(a - l - e) > equationTolerance) {
      return notComparable(
        period, prior,
        `The stored balance sheet for ${label} doesn't balance (off by ${round2(a - l - e)}) — the flow can't be trusted until the sync is repaired.`,
      )
    }
  }

  const isBank = (r: BsRowInput) => r.section === 'Bank' && r.account_type === 'asset'

  let bankStart = 0
  let bankEnd = 0
  const sources: FlowItem[] = []
  const uses: FlowItem[] = []

  for (const r of rows) {
    const start = num(r.balances_by_date[startKey])
    const end = num(r.balances_by_date[endKey])
    if (isBank(r)) {
      bankStart += start
      bankEnd += end
      continue
    }
    const d = end - start
    if (Math.abs(d) < minItem) continue

    const item = (amount: number): FlowItem => ({
      label: r.account_name,
      section: r.section,
      amount: round2(amount),
      kind: r.account_type,
    })
    if (r.account_type === 'asset') {
      if (d > 0) uses.push(item(d))
      else sources.push(item(-d))
    } else {
      // liability and equity share polarity: up = source, down = use
      if (d > 0) sources.push(item(d))
      else uses.push(item(-d))
    }
  }

  sources.sort((a, b) => b.amount - a.amount)
  uses.sort((a, b) => b.amount - a.amount)

  const bankDelta = round2(bankEnd - bankStart)
  const totalSources = sources.reduce((s, i) => s + i.amount, 0)
  const totalUses = uses.reduce((s, i) => s + i.amount, 0)
  const residual = round2(totalSources - totalUses - bankDelta)

  return {
    comparable: true,
    period_month: period,
    prior_month: prior,
    bank: { start: round2(bankStart), end: round2(bankEnd), delta: bankDelta },
    sources,
    uses,
    continuity_residual: residual,
  }
}
