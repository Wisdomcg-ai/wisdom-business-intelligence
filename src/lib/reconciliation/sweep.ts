/**
 * Bank-reconciliation sweep for the CFO production board.
 *
 * Per tenant: count the unreconciled items, bucketed by transaction month,
 * and persist them to reconciliation_snapshots with the latest check outcome
 * in reconciliation_checks (fail-closed: an errored check is recorded as
 * status='error', never as zero outstanding).
 *
 * Primary source — Xero Finance API bank statement lines (the same items
 * Xero's "reconcile" banner counts):
 *   GET /finance.xro/1.0/BankStatementsPlus/statements
 *       ?BankAccountID=..&FromDate=..&ToDate=..&SummaryOnly=true
 * Requires the finance.bankstatementsplus.read scope, which existing org
 * connections have NOT consented to yet — they 403 until Matt reconnects
 * each org. That is the expected initial state, not an error, so a 403
 * downgrades the tenant to the fallback source:
 *
 * Fallback source — Accounting API unreconciled account transactions
 * (what the pre-board /api/Xero/reconciliation check counted):
 *   GET /api.xro/2.0/BankTransactions?where=Status=="AUTHORISED" AND
 *       IsReconciled==false AND Date>=DateTime(..)
 * Counts the account-transaction side, which can differ from the banner —
 * rows carry source='account_transactions' so the UI can label it.
 */
import { getValidAccessToken } from '@/lib/xero/token-manager'
import {
  fetchXeroWithRateLimit,
  RateLimitDailyExceededError,
} from '@/lib/xero/xero-api-client'
import {
  bucketByMonth,
  outstandingStatementLines,
  type FinanceStatementLine,
  type MonthBucket,
  type UnreconciledItem,
} from './bucketing'

type SupabaseLike = { from: (table: string) => any }

export type SweepSource = 'statement_lines' | 'account_transactions'

export interface AccountBuckets {
  bankAccountId: string
  bankAccountName: string | null
  buckets: MonthBucket[]
}

export interface TenantSweepResult {
  tenantId: string
  /** Canonical businesses-space id (resolved by the caller). */
  businessId: string
  status: 'ok' | 'error'
  error?: string
  source: SweepSource
  accounts: AccountBuckets[]
  totalCount: number
  totalValue: number
}

// ─── Pure helpers (unit-tested) ─────────────────────────────────────────────

/**
 * 12-month lookback window: first day of the month 11 months before `now`,
 * through today. Matches the Finance API's maximum FromDate..ToDate range.
 */
export function sweepWindow(now: Date): { fromDate: string; toDate: string } {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1))
  const pad = (n: number) => String(n).padStart(2, '0')
  const iso = (d: Date) =>
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  return { fromDate: iso(from), toDate: iso(now) }
}

/** Flatten a BankStatementsPlus response into its statement lines. */
export function flattenStatementLines(json: any): FinanceStatementLine[] {
  const statements = Array.isArray(json?.statements) ? json.statements : []
  const lines: FinanceStatementLine[] = []
  for (const statement of statements) {
    if (Array.isArray(statement?.statementLines)) {
      lines.push(...statement.statementLines)
    }
  }
  return lines
}

/**
 * Group Accounting-API bank transactions by bank account. Transactions
 * missing an account id are dropped (they cannot be attributed to a
 * reconcile queue) — callers report the drop count.
 */
export function groupFallbackTransactions(transactions: any[]): {
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

/** True when `err` is the typed message fetchXeroWithRateLimit throws for this HTTP status. */
export function isXeroHttpError(err: unknown, status: number): boolean {
  return err instanceof Error && err.message.startsWith(`xero ${status} `)
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

const FINANCE_BASE = 'https://api.xero.com/finance.xro/1.0'
const ACCOUNTING_BASE = 'https://api.xero.com/api.xro/2.0'
/** Safety cap on fallback pagination: 10 pages × 100 = 1000 unreconciled txns. */
const FALLBACK_MAX_PAGES = 10

interface BankAccountRef {
  bankAccountId: string
  bankAccountName: string | null
}

/**
 * Bank accounts (incl. credit cards — Xero types them BANK too) for a tenant.
 * Cache-first from xero_accounts (refreshed by the 6-hourly sync); falls back
 * to a live Accounts call for tenants the catalog hasn't covered yet.
 */
async function listBankAccounts(
  supabase: SupabaseLike,
  tenantId: string,
  accessToken: string,
): Promise<BankAccountRef[]> {
  const { data: cached, error } = await supabase
    .from('xero_accounts')
    .select('xero_account_id, account_name, xero_status')
    .eq('tenant_id', tenantId)
    .eq('xero_type', 'BANK')
  if (!error && Array.isArray(cached) && cached.length > 0) {
    return cached
      .filter((a: any) => (a.xero_status ?? 'ACTIVE') === 'ACTIVE' && a.xero_account_id)
      .map((a: any) => ({ bankAccountId: a.xero_account_id, bankAccountName: a.account_name ?? null }))
  }

  const url = `${ACCOUNTING_BASE}/Accounts?where=${encodeURIComponent('Type=="BANK"')}`
  const res = await fetchXeroWithRateLimit(url, { accessToken, tenantId })
  const accounts = Array.isArray(res.json?.Accounts) ? res.json.Accounts : []
  return accounts
    .filter((a: any) => a?.Status === 'ACTIVE' && a?.AccountID)
    .map((a: any) => ({ bankAccountId: a.AccountID, bankAccountName: a.Name ?? null }))
}

async function fetchStatementLineBuckets(
  tenantId: string,
  accessToken: string,
  account: BankAccountRef,
  window: { fromDate: string; toDate: string },
): Promise<MonthBucket[]> {
  const url =
    `${FINANCE_BASE}/BankStatementsPlus/statements` +
    `?BankAccountID=${encodeURIComponent(account.bankAccountId)}` +
    `&FromDate=${window.fromDate}&ToDate=${window.toDate}&SummaryOnly=true`
  const res = await fetchXeroWithRateLimit(url, { accessToken, tenantId })
  return bucketByMonth(outstandingStatementLines(flattenStatementLines(res.json)))
}

async function fetchFallbackAccounts(
  tenantId: string,
  accessToken: string,
  window: { fromDate: string },
): Promise<AccountBuckets[]> {
  const [y, m, d] = window.fromDate.split('-').map(Number)
  const where = `Status=="AUTHORISED" AND IsReconciled==false AND Date>=DateTime(${y},${m},${d})`
  const transactions: any[] = []
  for (let page = 1; page <= FALLBACK_MAX_PAGES; page++) {
    const url = `${ACCOUNTING_BASE}/BankTransactions?where=${encodeURIComponent(where)}&page=${page}`
    const res = await fetchXeroWithRateLimit(url, { accessToken, tenantId })
    const batch = Array.isArray(res.json?.BankTransactions) ? res.json.BankTransactions : []
    transactions.push(...batch)
    if (batch.length < 100) break
  }
  const { byAccount } = groupFallbackTransactions(transactions)
  return Array.from(byAccount.entries()).map(([bankAccountId, entry]) => ({
    bankAccountId,
    bankAccountName: entry.name,
    buckets: bucketByMonth(entry.items),
  }))
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
      source: 'statement_lines',
      error: `token: ${token.error ?? 'unknown'}${token.shouldDeactivate ? ' (needs reconnect)' : ''}`,
    }
  }

  const window = sweepWindow(now)

  try {
    const bankAccounts = await listBankAccounts(supabase, connection.tenant_id, token.accessToken)
    if (bankAccounts.length === 0) {
      // A tenant with no active bank accounts genuinely has nothing to
      // reconcile — an OK check with zero buckets, not an error.
      return { ...base, status: 'ok', source: 'statement_lines' }
    }

    // Primary: statement lines. A 403 on the FIRST account means the finance
    // scope isn't consented for this org — expected until Matt reconnects it —
    // so the whole tenant downgrades to the fallback source.
    const accounts: AccountBuckets[] = []
    try {
      for (const account of bankAccounts) {
        const buckets = await fetchStatementLineBuckets(
          connection.tenant_id,
          token.accessToken,
          account,
          window,
        )
        if (buckets.length > 0) {
          accounts.push({ ...account, buckets })
        }
      }
      return { ...base, ...sumBuckets(accounts), status: 'ok', source: 'statement_lines', accounts }
    } catch (err) {
      if (!isXeroHttpError(err, 403)) throw err
    }

    const fallbackAccounts = await fetchFallbackAccounts(
      connection.tenant_id,
      token.accessToken,
      window,
    )
    return {
      ...base,
      ...sumBuckets(fallbackAccounts),
      status: 'ok',
      source: 'account_transactions',
      accounts: fallbackAccounts,
    }
  } catch (err) {
    if (err instanceof RateLimitDailyExceededError) {
      return { ...base, status: 'error', source: 'statement_lines', error: 'xero daily rate limit — retry tomorrow' }
    }
    return {
      ...base,
      status: 'error',
      source: 'statement_lines',
      error: err instanceof Error ? err.message.slice(0, 300) : String(err),
    }
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
  const { error: checkError } = await supabase.from('reconciliation_checks').upsert(
    {
      tenant_id: result.tenantId,
      business_id: result.businessId,
      source: result.source,
      status: result.status,
      error_message: result.error ?? null,
      total_unreconciled_count: result.totalCount,
      total_unreconciled_value: result.totalValue,
      checked_at: checkedAtIso,
    },
    { onConflict: 'tenant_id' },
  )
  if (checkError) return `reconciliation_checks upsert failed: ${checkError.message}`

  if (result.status !== 'ok') return null

  const { error: deleteError } = await supabase
    .from('reconciliation_snapshots')
    .delete()
    .eq('tenant_id', result.tenantId)
  if (deleteError) return `reconciliation_snapshots delete failed: ${deleteError.message}`

  const rows = result.accounts.flatMap(account =>
    account.buckets.map(bucket => ({
      tenant_id: result.tenantId,
      business_id: result.businessId,
      bank_account_id: account.bankAccountId,
      bank_account_name: account.bankAccountName,
      month: `${bucket.month}-01`,
      unreconciled_count: bucket.count,
      unreconciled_value: bucket.value,
      source: result.source,
      checked_at: checkedAtIso,
    })),
  )
  if (rows.length === 0) return null

  const { error: insertError } = await supabase.from('reconciliation_snapshots').insert(rows)
  if (insertError) return `reconciliation_snapshots insert failed: ${insertError.message}`
  return null
}
