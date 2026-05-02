/**
 * Phase 44.2 Plan 44.2-06F — Shared reconciliation gate logic.
 *
 * The four automated reconciliation invariants from 06E, extracted as pure
 * functions so they can be invoked from BOTH:
 *   - 06E test harness (`src/__tests__/integration/xero-reconciliation-gates.test.ts`)
 *     which feeds them captured fixtures, AND
 *   - 06F verify-production-migration.ts script which feeds them live Xero
 *     responses fetched against production.
 *
 * Same gate logic, two callsites, one source of truth.
 *
 * Each gate returns a structured `{ pass, delta, ... }` result so the caller
 * can print human-readable failures or exit with structured JSON for log
 * aggregation. Tolerance is $0.01 across all gates by default.
 */
import type { ParsedPLRow } from './pl-single-period-parser'
import type { ParsedBSRow } from './bs-single-period-parser'
import type { ParsedTBRow } from './trialbalance-parser'

// ─── Shared helpers ─────────────────────────────────────────────────────────

/**
 * Net profit from a parsed PL row set:
 *   net_profit = revenue + other_income − cogs − opex − other_expense
 *
 * All sign conventions follow the parser's existing AccountType taxonomy
 * (revenue/other_income are positive contributions; cogs/opex/other_expense
 * are positive amounts that subtract from the result).
 */
export function netProfitOf(rows: Array<{ account_type: string; amount: number }>): number {
  let revenue = 0
  let cogs = 0
  let opex = 0
  let otherIncome = 0
  let otherExpense = 0
  for (const r of rows) {
    switch (r.account_type) {
      case 'revenue':
        revenue += r.amount
        break
      case 'cogs':
        cogs += r.amount
        break
      case 'opex':
        opex += r.amount
        break
      case 'other_income':
        otherIncome += r.amount
        break
      case 'other_expense':
        otherExpense += r.amount
        break
      default:
        break
    }
  }
  return revenue + otherIncome - cogs - opex - otherExpense
}

/**
 * Sum the BS earnings accounts (Current Year Earnings + Retained Earnings)
 * at a given balance_date. Used by Gate 2 articulation: monthly PL net
 * profit MUST equal Δ(earnings) across the month.
 *
 * Match by name (case-insensitive substring) because account_id varies per
 * tenant and we don't want this gate to depend on a tenant-specific id
 * mapping. Both 'current year earnings' and 'retained earnings' are Xero
 * system account names with stable wording.
 */
export function bsEarningsTotal(bsRows: Array<{ account_name: string; balance: number }>): number {
  let total = 0
  for (const r of bsRows) {
    const n = r.account_name.toLowerCase()
    if (
      n.includes('current year earnings') ||
      n.includes('retained earnings') ||
      n.includes('profit ~ loss earned this year') ||
      n.includes('profit / loss earned this year')
    ) {
      total += r.balance
    }
  }
  return total
}

// ─── Gate 1 — per-account oracle agreement ──────────────────────────────────

export type Gate1AccountDrift = {
  account_id: string | null
  account_name: string
  account_type: string
  monthly_sum: number
  fy_total: number
  delta: number
}

export type Gate1Result = {
  pass: boolean
  drift_accounts: Gate1AccountDrift[]
  /** The single largest absolute drift across all accounts; 0 if none drift. */
  max_delta: number
}

/**
 * Σ(per-account amount across N single-period monthly captures) ==
 * single-period FY-total amount, per account, within $0.01.
 *
 * Catches by-month aggregation regressions and surfaces SPECIFIC accounts
 * that drift between query shapes. Allow-list is supplied by caller — keys
 * are account names (case-sensitive), e.g. 'Rent', 'Foreign Currency Gains
 * and Losses'. Allow-listed accounts are excluded from drift detection.
 */
export function assertGate1(
  monthlyRows: ParsedPLRow[][],
  fyTotalRows: ParsedPLRow[],
  allowlistedNames: Set<string> = new Set(),
  toleranceCents: number = 0.01,
): Gate1Result {
  // Aggregate monthly captures per account_id (or name fallback).
  const monthlyByAccount = new Map<string, { name: string; type: string; amount: number; account_id: string | null }>()
  for (const monthRows of monthlyRows) {
    for (const r of monthRows) {
      const key = r.account_id || `name:${r.account_name}`
      const cur = monthlyByAccount.get(key) ?? {
        name: r.account_name,
        type: r.account_type,
        amount: 0,
        account_id: r.account_id ?? null,
      }
      cur.amount += r.amount
      monthlyByAccount.set(key, cur)
    }
  }
  // Aggregate FY-total per account_id.
  const fyByAccount = new Map<string, { name: string; type: string; amount: number; account_id: string | null }>()
  for (const r of fyTotalRows) {
    const key = r.account_id || `name:${r.account_name}`
    const cur = fyByAccount.get(key) ?? {
      name: r.account_name,
      type: r.account_type,
      amount: 0,
      account_id: r.account_id ?? null,
    }
    cur.amount += r.amount
    fyByAccount.set(key, cur)
  }
  const allKeys = new Set<string>([...monthlyByAccount.keys(), ...fyByAccount.keys()])
  const drift: Gate1AccountDrift[] = []
  let maxDelta = 0
  for (const k of allKeys) {
    const m = monthlyByAccount.get(k)
    const f = fyByAccount.get(k)
    const accountName = m?.name ?? f?.name ?? '(unknown)'
    if (allowlistedNames.has(accountName)) continue
    const monthlySum = m?.amount ?? 0
    const fyTotal = f?.amount ?? 0
    const delta = Math.round((monthlySum - fyTotal) * 100) / 100
    if (Math.abs(delta) > toleranceCents) {
      drift.push({
        account_id: m?.account_id ?? f?.account_id ?? null,
        account_name: accountName,
        account_type: m?.type ?? f?.type ?? '?',
        monthly_sum: monthlySum,
        fy_total: fyTotal,
        delta,
      })
      if (Math.abs(delta) > Math.abs(maxDelta)) maxDelta = delta
    }
  }
  return {
    pass: drift.length === 0,
    drift_accounts: drift.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
    max_delta: maxDelta,
  }
}

// ─── Gate 2 — PL ↔ BS articulation ──────────────────────────────────────────

export type Gate2Result = {
  pass: boolean
  pl_net_profit: number
  bs_earnings_delta: number
  delta: number
}

/**
 * For a given month-end:
 *   single-period PL net profit for THAT month == Δ(BS Current Year Earnings
 *                                                  + Retained Earnings)
 * across the month. Catches sync-time parser drift, period-boundary errors,
 * and system-account drift.
 */
export function assertGate2(
  monthRows: ParsedPLRow[],
  bsThisMonthEnd: ParsedBSRow[],
  bsPriorMonthEnd: ParsedBSRow[],
  toleranceCents: number = 0.01,
): Gate2Result {
  const plNetProfit = netProfitOf(monthRows)
  const bsEarningsDelta = bsEarningsTotal(bsThisMonthEnd) - bsEarningsTotal(bsPriorMonthEnd)
  const delta = Math.round((plNetProfit - bsEarningsDelta) * 100) / 100
  return {
    pass: Math.abs(delta) <= toleranceCents,
    pl_net_profit: plNetProfit,
    bs_earnings_delta: bsEarningsDelta,
    delta,
  }
}

// ─── Gate 3 — TrialBalance balanced ─────────────────────────────────────────

export type Gate3Result = {
  pass: boolean
  total_debit: number
  total_credit: number
  delta: number
}

/**
 * Σ(debit) == Σ(credit) across all accounts in the TrialBalance, within
 * $0.01. The universal accounting invariant — every journal entry hits both
 * sides, and TB is where they sum.
 */
export function assertGate3(tbRows: ParsedTBRow[], toleranceCents: number = 0.01): Gate3Result {
  let totalDebit = 0
  let totalCredit = 0
  for (const r of tbRows) {
    totalDebit += r.debit
    totalCredit += r.credit
  }
  const delta = Math.round((totalDebit - totalCredit) * 100) / 100
  return {
    pass: Math.abs(delta) <= toleranceCents,
    total_debit: totalDebit,
    total_credit: totalCredit,
    delta,
  }
}

// ─── Gate 4 — Balance Sheet in balance ──────────────────────────────────────

export type Gate4Result = {
  pass: boolean
  assets: number
  liabilities: number
  net_assets: number
  equity: number
  delta: number
}

/**
 * Σ(asset) − Σ(liability) == Σ(equity) within $0.01. The fundamental BS
 * accounting equation. Catches BS classification bugs, system-account
 * miscalculation, and the kind of layout-vs-catalog mismatch that
 * triggered the 06D.1 hot-fix.
 */
export function assertGate4(bsRows: ParsedBSRow[], toleranceCents: number = 0.01): Gate4Result {
  let assets = 0
  let liabilities = 0
  let equity = 0
  for (const r of bsRows) {
    if (r.account_type === 'asset') assets += r.balance
    else if (r.account_type === 'liability') liabilities += r.balance
    else if (r.account_type === 'equity') equity += r.balance
  }
  const netAssets = assets - liabilities
  const delta = Math.round((netAssets - equity) * 100) / 100
  return {
    pass: Math.abs(delta) <= toleranceCents,
    assets,
    liabilities,
    net_assets: netAssets,
    equity,
    delta,
  }
}
