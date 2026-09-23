/**
 * Bank-reconciliation sweep for the CFO production board.
 *
 * Per tenant: count the unreconciled items, bucketed by transaction month,
 * and persist them to reconciliation_snapshots with the latest check outcome
 * in reconciliation_checks (fail-closed: an errored check is recorded as
 * status='error', never as zero outstanding).
 *
 * SOURCE — Accounting API unreconciled account transactions:
 *   GET /api.xro/2.0/BankTransactions?where=Status=="AUTHORISED" AND
 *       IsReconciled==false AND Date>=DateTime(..)
 * This is the ONLY population the Accounting API exposes: transactions
 * already recorded in Xero that have not been matched to a statement line.
 * Rows carry source='account_transactions' so readers label it honestly —
 * "unreconciled transactions", never "to reconcile".
 *
 * WHAT IT CANNOT SEE — bank-feed STATEMENT LINES, the population behind
 * Xero's "Reconcile N items" banner (uncoded feed lines have no transaction
 * yet; IICT's Airwallex feed proved 25 such lines invisible here). The
 * Reports/BankStatement report that carries them sits behind the
 * accounting.reports.bankstatement.read scope (Xero's 2 Apr 2024 carve-out),
 * and Xero API support confirmed on 2 Sep 2026 that the scope is no longer
 * granted to any app — statement lines are Finance / Bank Feeds API only,
 * restricted to banks and regulated partners. The primary statement-report
 * path this module carried from #443 to #450 therefore 401'd on every
 * tenant on every sweep (12/12 on 2 Sep 2026) and was removed; banner-exact
 * numbers come from the dashboard capture recorded as its own source.
 *
 * CURRENCY: every bucket carries the bank account's CurrencyCode (IICT's
 * feed is HKD); readers must never sum or render values across differing
 * currencies as AUD.
 */
import { getValidAccessToken } from '@/lib/xero/token-manager'
import {
  fetchXeroWithRateLimit,
  RateLimitDailyExceededError,
} from '@/lib/xero/xero-api-client'
import {
  bucketByMonth,
  xeroDateToMonthKey,
  type MonthBucket,
  type UnreconciledItem,
} from './bucketing'
import { UNRECONCILED_AUTHORISED, sinceWhere } from './where-clauses'
import { SWEEP_WINDOW_MONTHS } from './bucketing'

type SupabaseLike = { from: (table: string) => any }

/**
 * The one population the Accounting API can see: recorded bank transactions
 * not yet reconciled. Bank-feed statement lines (the "Reconcile N items"
 * banner) are not reachable by this app — see the module header.
 */
export type SweepSource = 'account_transactions'

export interface AccountBuckets {
  bankAccountId: string
  bankAccountName: string | null
  /** ISO code of the bank account's currency; null when Xero omits it. */
  currency: string | null
  buckets: MonthBucket[]
}

export interface TenantSweepResult {
  tenantId: string
  /** Canonical businesses-space id (resolved by the caller). */
  businessId: string
  status: 'ok' | 'error'
  error?: string
  /** Honesty caveats about an OK result (truncated at the page cap,
   *  transactions without an account id dropped) — persisted with it. */
  caveats?: string[]
  source: SweepSource
  accounts: AccountBuckets[]
  totalCount: number
  totalValue: number
}

// ─── Pure helpers (unit-tested) ─────────────────────────────────────────────

const pad2 = (n: number) => String(n).padStart(2, '0')
const isoDay = (d: Date) =>
  `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`

/**
 * Lookback window: first day of the month (monthsBack−1) months before `now`,
 * through today.
 */
export function sweepWindow(
  now: Date,
  monthsBack: number = SWEEP_WINDOW_MONTHS,
): { fromDate: string; toDate: string } {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (monthsBack - 1), 1))
  return { fromDate: isoDay(from), toDate: isoDay(now) }
}

/**
 * Group Accounting-API bank transactions by bank account. Transactions
 * missing an account id are dropped (and counted, so the caveat can say so).
 */
export function groupAccountTransactions(transactions: any[]): {
  byAccount: Map<string, { name: string | null; items: UnreconciledItem[] }>
  dropped: number
} {
  const byAccount = new Map<string, { name: string | null; items: UnreconciledItem[] }>()
  let dropped = 0
  for (const txn of transactions) {
    const accountId = txn?.BankAccount?.AccountID
    if (!accountId) {
      dropped++
      continue
    }
    const entry: { name: string | null; items: UnreconciledItem[] } = byAccount.get(accountId) ?? {
      name: txn?.BankAccount?.Name ?? null,
      items: [],
    }
    entry.items.push({
      date: txn?.DateString ?? txn?.Date ?? '',
      amount: Math.abs(txn?.Total ?? 0),
    })
    byAccount.set(accountId, entry)
  }
  return { byAccount, dropped }
}

export function sumBuckets(accounts: AccountBuckets[]): { totalCount: number; totalValue: number } {
  let totalCount = 0
  let totalValue = 0
  for (const account of accounts) {
    for (const bucket of account.buckets) {
      totalCount += bucket.count
      totalValue += bucket.value
    }
  }
  return { totalCount, totalValue: Math.round(totalValue * 100) / 100 }
}

// ─── Xero IO ────────────────────────────────────────────────────────────────

const ACCOUNTING_BASE = 'https://api.xero.com/api.xro/2.0'
/** Safety cap on pagination: 10 pages × 100 = 1000 unreconciled txns. A full
 *  final page is reported as a caveat — the count is then a FLOOR. */
const MAX_PAGES = 10

interface BankAccountRef {
  bankAccountId: string
  bankAccountName: string | null
  currency: string | null
}

/**
 * Live bank-account listing (incl. credit cards — Xero types them BANK too).
 * Live rather than the xero_accounts cache because the cache doesn't carry
 * CurrencyCode, and currency is load-bearing for value display.
 */
async function listBankAccounts(
  tenantId: string,
  accessToken: string,
): Promise<BankAccountRef[]> {
  const url = `${ACCOUNTING_BASE}/Accounts?where=${encodeURIComponent('Type=="BANK"')}`
  const res = await fetchXeroWithRateLimit(url, { accessToken, tenantId })
  if (!Array.isArray(res.json?.Accounts)) {
    // A 2xx body without an Accounts array must refuse: treating it as "no
    // bank accounts" records an ok/zero check and deletes the tenant's prior
    // snapshots — an infrastructure failure masquerading as all-clear.
    throw new Error('Accounts response shape not recognised (no Accounts array)')
  }
  const accounts = res.json.Accounts
  return accounts
    .filter((a: any) => a?.Status === 'ACTIVE' && a?.AccountID)
    .map((a: any) => ({
      bankAccountId: a.AccountID,
      bankAccountName: a.Name ?? null,
      currency: a.CurrencyCode ?? null,
    }))
}

async function fetchUnreconciledAccountTransactions(
  tenantId: string,
  accessToken: string,
  window: { fromDate: string },
  accountCurrency: Map<string, string | null>,
): Promise<{ accounts: AccountBuckets[]; truncated: boolean; dropped: number }> {
  const since = sinceWhere(window.fromDate)
  const where = since ? `${UNRECONCILED_AUTHORISED} AND ${since}` : UNRECONCILED_AUTHORISED
  const transactions: any[] = []
  let truncated = false
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${ACCOUNTING_BASE}/BankTransactions?where=${encodeURIComponent(where)}&page=${page}`
    const res = await fetchXeroWithRateLimit(url, { accessToken, tenantId })
    const batch = Array.isArray(res.json?.BankTransactions) ? res.json.BankTransactions : []
    transactions.push(...batch)
    if (batch.length < 100) break
    // A full final page means the cap cut us off — the count is a FLOOR and
    // must be labelled, never stored as if complete.
    if (page === MAX_PAGES) truncated = true
  }
  const { byAccount, dropped } = groupAccountTransactions(transactions)
  return {
    accounts: Array.from(byAccount.entries()).map(([bankAccountId, entry]) => ({
      bankAccountId,
      bankAccountName: entry.name,
      currency: accountCurrency.get(bankAccountId) ?? null,
      buckets: bucketByMonth(entry.items),
    })),
    truncated,
    dropped,
  }
}

/**
 * Sweep one tenant. Never throws for per-tenant problems — returns
 * status='error' so callers can aggregate; only programming errors escape.
 */
export async function sweepTenant(
  supabase: SupabaseLike,
  connection: { id: string; tenant_id: string },
  canonicalBusinessId: string,
  now: Date = new Date(),
): Promise<TenantSweepResult> {
  const base: Omit<TenantSweepResult, 'status' | 'source'> = {
    tenantId: connection.tenant_id,
    businessId: canonicalBusinessId,
    accounts: [],
    totalCount: 0,
    totalValue: 0,
  }

  const token = await getValidAccessToken({ id: connection.id }, supabase as any)
  if (!token.success || !token.accessToken) {
    return {
      ...base,
      status: 'error',
      source: 'account_transactions',
      error: `token: ${token.error ?? 'unknown'}${token.shouldDeactivate ? ' (needs reconnect)' : ''}`,
    }
  }

  const window = sweepWindow(now, SWEEP_WINDOW_MONTHS)

  try {
    const bankAccounts = await listBankAccounts(connection.tenant_id, token.accessToken)
    if (bankAccounts.length === 0) {
      // A tenant with no active bank accounts genuinely has nothing to
      // reconcile — an OK check with zero buckets, not an error.
      return { ...base, status: 'ok', source: 'account_transactions' }
    }
    const accountCurrency = new Map(bankAccounts.map(a => [a.bankAccountId, a.currency]))

    const swept = await fetchUnreconciledAccountTransactions(
      connection.tenant_id,
      token.accessToken,
      window,
      accountCurrency,
    )
    const caveats: string[] = []
    if (swept.truncated) {
      caveats.push(`truncated at ${MAX_PAGES * 100} transactions — count is a floor`)
    }
    if (swept.dropped > 0) {
      caveats.push(`${swept.dropped} transaction(s) lacked a bank account id and were not counted`)
    }
    return {
      ...base,
      ...sumBuckets(swept.accounts),
      status: 'ok',
      source: 'account_transactions',
      caveats: caveats.length > 0 ? caveats : undefined,
      accounts: swept.accounts,
    }
  } catch (err) {
    if (err instanceof RateLimitDailyExceededError) {
      return { ...base, status: 'error', source: 'account_transactions', error: 'xero daily rate limit — retry tomorrow' }
    }
    const message = err instanceof Error ? err.message.slice(0, 250) : String(err)
    return { ...base, status: 'error', source: 'account_transactions', error: message }
  }
}

// ─── Persistence ────────────────────────────────────────────────────────────

/**
 * Persist one tenant's sweep. Returns an error string (for the caller's
 * aggregated Sentry event) or null on success. On an errored check the
 * existing snapshot buckets are deliberately kept — stale data plus an
 * errored check reads "couldn't refresh", which beats an empty green board.
 */
export async function persistTenantSweep(
  supabase: SupabaseLike,
  result: TenantSweepResult,
  checkedAtIso: string = new Date().toISOString(),
): Promise<string | null> {
  // onConflict MUST match the unique constraint on reconciliation_checks
  // (tenant_id) — a mismatched conflict target fails on every call and
  // supabase-js reports it via `error`, not by throwing (the financial_metrics
  // lesson).
  const notes = [result.error, ...(result.caveats ?? [])]
    .filter(Boolean)
    .join(' | ')
  const { error: checkError } = await supabase.from('reconciliation_checks').upsert(
    {
      tenant_id: result.tenantId,
      business_id: result.businessId,
      source: result.source,
      status: result.status,
      // On an ok check this may carry honesty caveats (truncation, dropped
      // rows) — readers only SURFACE it for status='error', but it is always
      // available for diagnosis.
      error_message: notes || null,
      // An errored check stores NULL totals, never a confident zero — a
      // reader that misses the status column must not see "0 outstanding".
      total_unreconciled_count: result.status === 'ok' ? result.totalCount : null,
      total_unreconciled_value: result.status === 'ok' ? result.totalValue : null,
      checked_at: checkedAtIso,
    },
    { onConflict: 'tenant_id' },
  )
  if (checkError) return `reconciliation_checks upsert failed: ${checkError.message}`

  if (result.status !== 'ok') return null

  const rows = result.accounts.flatMap(account =>
    account.buckets.map(bucket => ({
      tenant_id: result.tenantId,
      business_id: result.businessId,
      bank_account_id: account.bankAccountId,
      bank_account_name: account.bankAccountName,
      currency: account.currency,
      month: `${bucket.month}-01`,
      unreconciled_count: bucket.count,
      unreconciled_value: bucket.value,
      source: result.source,
      checked_at: checkedAtIso,
    })),
  )
  // Ordered-safe swap: write the new rows first (upsert on the table's real
  // unique key), then clear anything from earlier sweeps. If the write fails,
  // the previous complete sweep remains intact — the old delete-then-insert
  // could leave an ok check row with zero snapshot rows behind it.
  if (rows.length > 0) {
    const { error: upsertError } = await supabase
      .from('reconciliation_snapshots')
      .upsert(rows, { onConflict: 'tenant_id,bank_account_id,month,source' })
    if (upsertError) return `reconciliation_snapshots upsert failed: ${upsertError.message}`
  }
  const { error: staleError } = await supabase
    .from('reconciliation_snapshots')
    .delete()
    .eq('tenant_id', result.tenantId)
    .neq('checked_at', checkedAtIso)
  if (staleError) return `reconciliation_snapshots stale-delete failed: ${staleError.message}`
  return null
}
