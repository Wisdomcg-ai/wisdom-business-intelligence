/**
 * The bank balance the pack's cashflow page opens the year with.
 *
 * Urban Road's August pack opened July at $0 bank. The business has no saved
 * cashflow assumptions, so `loadCashflowForecast` fell back to
 * `getDefaultCashflowAssumptions()` — `opening_bank_balance: 0` — and every
 * closing balance on the page was the year's cumulative movement presented as
 * money in the bank. The real Total Bank at 30 Jun 2026 was $167,629.81, and
 * it was already sitting in the synced balance-sheet mirror (`xero_bs_lines`).
 *
 * Two rules live here so that no second copy can drift:
 *  1. WHAT COUNTS AS BANK — section 'Bank' AND account_type 'asset'. The same
 *     definition the money-flow page proves itself against (Δbank ≡ sources −
 *     uses). A credit card is a liability even when it is filed near a bank
 *     account, and counting one would overstate cash by whatever is owing on it.
 *  2. WHEN THE YEAR OPENS — the last day before the fiscal year starts, from the
 *     report month and the business's own `fiscal_year_start`. Never the clock:
 *     a pack re-run in October for August must still open at 30 June.
 *
 * Fail-open house rule — three states, never a fabricated zero. "Unavailable"
 * is its own answer, carried to the page so it can say so, because a
 * projection silently built on $0 reads exactly like a real one.
 *
 * Pure — the route is a thin IO wrapper.
 */

export interface BankRowInput {
  tenant_id: string | null
  /** 'asset' | 'liability' | 'equity' (canonical, from the BS mirror). */
  account_type: string
  section: string | null
  /** 'YYYY-MM-DD' */
  balance_date: string
  balance: number | string | null
}

export interface OpeningTenant {
  tenant_id: string
  /** functional_currency from xero_connections; null is treated as AUD. */
  currency: string | null
}

export type OpeningBank =
  | { status: 'read'; amount: number; asAt: string }
  | { status: 'unavailable'; asAt: string | null; reason: string }

/** The money-flow definition of a bank account. Shared, not re-derived. */
export function isBankRow(r: { section: string | null; account_type: string }): boolean {
  return r.section === 'Bank' && r.account_type === 'asset'
}

/**
 * The balance date the fiscal year containing `reportMonth` opens from: the
 * last day of the month before its first month.
 *
 *   ('2026-08', 7) → '2026-06-30'   FY2027 opens 1 Jul 2026
 *   ('2026-06', 7) → '2025-06-30'   June still belongs to FY2026
 *   ('2026-08', 1) → '2025-12-31'   a calendar-year business
 */
export function openingBalanceDate(reportMonth: string, yearStartMonth: number): string {
  const [y, m] = reportMonth.split('-').map(Number)
  const start = Number.isInteger(yearStartMonth) && yearStartMonth >= 1 && yearStartMonth <= 12
    ? yearStartMonth
    : 7
  // The calendar year the fiscal year STARTED in.
  const startYear = m >= start ? y : y - 1
  // Day 0 of the start month is the last day of the month before it.
  const d = new Date(Date.UTC(startYear, start - 1, 0))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

const num = (v: number | string | null | undefined) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

/**
 * Total Bank at `asAt` across the business's active Xero organisations.
 *
 * @param rows    balance-sheet mirror rows; rows at other dates are ignored
 * @param tenants the business's ACTIVE connections. Tenant ids are shared
 *                between businesses (IICT's orgs appear under two business
 *                ids), so the caller scopes by connection, not by business_id.
 */
export function totalBankAt(
  rows: BankRowInput[],
  asAt: string,
  tenants: OpeningTenant[],
): OpeningBank {
  if (tenants.length === 0) {
    return { status: 'unavailable', asAt, reason: 'no active Xero connection' }
  }

  // Never sum a foreign currency at 1:1 (IICT holds HKD — FX-01). The pack's
  // single-entity cashflow has no translation step, so it declines instead.
  const foreign = tenants.filter((t) => (t.currency || 'AUD').toUpperCase() !== 'AUD')
  if (foreign.length > 0) {
    return { status: 'unavailable', asAt, reason: 'a Xero organisation reports in a foreign currency' }
  }

  const wanted = new Set(tenants.map((t) => t.tenant_id))
  const atDate = rows.filter((r) => r.balance_date === asAt && r.tenant_id !== null && wanted.has(r.tenant_id))

  // Every organisation must have a balance sheet on that date. An org the sync
  // never reached would otherwise contribute nothing and understate the total
  // with no sign that anything was missing.
  const synced = new Set(atDate.map((r) => r.tenant_id))
  if (tenants.some((t) => !synced.has(t.tenant_id))) {
    return { status: 'unavailable', asAt, reason: `no synced balance sheet at ${asAt}` }
  }

  // A synced balance sheet with no bank rows is a real $0, not a missing one.
  const total = atDate.filter(isBankRow).reduce((s, r) => s + num(r.balance), 0)
  return { status: 'read', amount: Math.round(total * 100) / 100, asAt }
}
