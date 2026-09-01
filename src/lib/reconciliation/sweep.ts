/**
 * Bank-reconciliation sweep for the CFO production board.
 *
 * Per tenant: count the unreconciled items, bucketed by transaction month,
 * and persist them to reconciliation_snapshots with the latest check outcome
 * in reconciliation_checks (fail-closed: an errored check is recorded as
 * status='error', never as zero outstanding).
 *
 * PRIMARY source — Accounting API Bank Statement report:
 *   GET /api.xro/2.0/Reports/BankStatement?bankAccountID=..&fromDate=..&toDate=..
 * Returns the imported bank-feed STATEMENT LINES with a per-line Reconciled
 * column — the same population as Xero's "Reconcile N items" banner (proven
 * against IICT's Airwallex feed: 25 uncoded lines invisible to the
 * account-transaction count). OPERATIVE REALITY: since Xero's April 2024
 * carve-out this report requires the addendum-gated
 * accounting.reports.bankstatement.read scope — this app's tokens 401
 * (AuthorizationUnsuccessful, proven live), so every tenant currently falls
 * through to the fallback with the reason recorded, until Matt's signed
 * addendum lands. (The endpoint is real but absent from Xero's OpenAPI
 * spec — XeroAPI/xero-node#313.)
 *
 * FALLBACK source — Accounting API unreconciled account transactions:
 *   GET /api.xro/2.0/BankTransactions?where=Status=="AUTHORISED" AND
 *       IsReconciled==false AND Date>=DateTime(..)
 * Used per tenant when the statement report fails or its shape isn't
 * recognised (a shape we can't parse must never read as "all clear").
 * Rows carry source so the UI can label which population was counted.
 *
 * CURRENCY: statement lines are denominated in the bank account's currency
 * (IICT's feed is HKD). Every bucket carries the account's CurrencyCode;
 * readers must never sum or render values across differing currencies as AUD.
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
import { STATEMENT_WINDOW_MONTHS, FALLBACK_WINDOW_MONTHS } from './bucketing'

type SupabaseLike = { from: (table: string) => any }

export type SweepSource = 'statement_lines' | 'account_transactions'

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
  /** Why the statement-line primary path was abandoned for this tenant —
   *  recorded on the check row so a silent fallback is diagnosable. */
  fallbackReason?: string
  /** Honesty caveats about an OK result (fallback truncated at the page cap,
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
  monthsBack: number = FALLBACK_WINDOW_MONTHS,
): { fromDate: string; toDate: string } {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (monthsBack - 1), 1))
  return { fromDate: isoDay(from), toDate: isoDay(now) }
}

/**
 * The statement-line window (24 months) split into ≤12-month chunks. The
 * Bank Statement report is undocumented in Xero's spec, and its sibling
 * Finance-API endpoint caps ranges at 12 months — chunking by design means
 * we never depend on the longer range being accepted.
 */
export function statementWindows(now: Date): { fromDate: string; toDate: string }[] {
  const whole = sweepWindow(now, STATEMENT_WINDOW_MONTHS)
  const mid = sweepWindow(now, FALLBACK_WINDOW_MONTHS)
  const dayBeforeMid = new Date(Date.parse(`${mid.fromDate}T00:00:00Z`) - 86_400_000)
  return [
    { fromDate: whole.fromDate, toDate: isoDay(dayBeforeMid) },
    { fromDate: mid.fromDate, toDate: whole.toDate },
  ]
}

export interface ParsedStatementReport {
  /** False when the report shape wasn't recognised — the caller MUST fall
   *  back, never treat it as zero outstanding. `reason` names what refused. */
  parsed: boolean
  items: UnreconciledItem[]
  reason?: string
}

/**
 * Parse a Reports/BankStatement response down to its unreconciled statement
 * lines. Standard Xero report envelope: Reports[0].Rows with a Header row
 * naming the columns (Date / Description / Reference / Reconciled / Source /
 * Amount / Balance) and Section rows holding the data rows. Opening/closing
 * balance rows have no Reconciled value and are skipped; only an explicit
 * Reconciled === "No" counts as outstanding.
 */
export function parseBankStatementReport(json: any): ParsedStatementReport {
  const refuse = (reason: string): ParsedStatementReport => ({ parsed: false, items: [], reason })

  const report = Array.isArray(json?.Reports) ? json.Reports[0] : null
  const topRows = Array.isArray(report?.Rows) ? report.Rows : null
  if (!topRows) return refuse('no Reports[0].Rows envelope')

  let dateIdx = -1
  let reconciledIdx = -1
  let amountIdx = -1
  let descriptionIdx = -1
  let headerConflict = false

  const dataRows: any[] = []
  const walk = (rows: any[]) => {
    for (const row of rows) {
      if (row?.RowType === 'Header' && Array.isArray(row.Cells)) {
        const next = { date: -1, reconciled: -1, amount: -1, description: -1 }
        row.Cells.forEach((cell: any, i: number) => {
          const title = String(cell?.Value ?? '').trim().toLowerCase()
          if (title === 'date') next.date = i
          if (title === 'reconciled') next.reconciled = i
          if (title === 'amount') next.amount = i
          if (title === 'description') next.description = i
        })
        // A second header whose indices disagree would misindex earlier
        // sections' rows — refuse rather than last-header-wins.
        if (
          reconciledIdx >= 0 &&
          (next.date !== dateIdx || next.reconciled !== reconciledIdx || next.amount !== amountIdx)
        ) {
          headerConflict = true
        }
        dateIdx = next.date
        reconciledIdx = next.reconciled
        amountIdx = next.amount
        descriptionIdx = next.description
      } else if (row?.RowType === 'Row' && Array.isArray(row.Cells)) {
        dataRows.push(row)
      }
      if (Array.isArray(row?.Rows)) walk(row.Rows)
    }
  }
  walk(topRows)

  if (headerConflict) return refuse('conflicting duplicate header rows')
  if (dateIdx < 0 || reconciledIdx < 0 || amountIdx < 0) {
    return refuse('header lacks a Date, Reconciled, or Amount column')
  }

  const items: UnreconciledItem[] = []
  for (const row of dataRows) {
    const cells = row.Cells
    const description = String(cells[descriptionIdx]?.Value ?? '')
    if (/^(opening|closing) balance$/i.test(description.trim())) continue

    // A row too short to carry a Reconciled cell must refuse — coercing the
    // missing cell to '' would count a truncated UNRECONCILED row as
    // reconciled.
    const reconciledCell = cells[reconciledIdx]
    if (reconciledCell === undefined || reconciledCell.Value === undefined) {
      return refuse('data row missing its Reconciled cell')
    }
    const reconciled = String(reconciledCell.Value).trim().toLowerCase()
    // Closed vocabulary: yes/no, plus '' for balance-style rows. ANY other
    // token means the column's vocabulary drifted — refuse rather than read
    // an unknown value as "reconciled".
    if (reconciled !== 'yes' && reconciled !== 'no' && reconciled !== '') {
      return refuse(`unrecognised Reconciled value "${String(reconciledCell.Value).slice(0, 30)}"`)
    }
    if (reconciled !== 'no') continue

    const date = String(cells[dateIdx]?.Value ?? '')
    if (!xeroDateToMonthKey(date)) {
      // An explicitly-UNRECONCILED line whose date we cannot read must refuse
      // the whole report: silently dropping it zeroes the count on a date-
      // format change in an endpoint Xero doesn't document.
      return refuse(`unparseable date "${date.slice(0, 30)}" on an unreconciled row`)
    }
    const amount = Number(String(cells[amountIdx]?.Value ?? '0').replace(/,/g, ''))
    items.push({ date, amount: Math.abs(Number.isFinite(amount) ? amount : 0) })
  }
  return { parsed: true, items }
}

/**
 * Group Accounting-API bank transactions by bank account (fallback source).
 * Transactions missing an account id are dropped.
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
/** Safety cap on fallback pagination: 10 pages × 100 = 1000 unreconciled txns. */
const FALLBACK_MAX_PAGES = 10

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

async function fetchStatementLineItems(
  tenantId: string,
  accessToken: string,
  account: BankAccountRef,
  window: { fromDate: string; toDate: string },
): Promise<ParsedStatementReport> {
  const url =
    `${ACCOUNTING_BASE}/Reports/BankStatement` +
    `?bankAccountID=${encodeURIComponent(account.bankAccountId)}` +
    `&fromDate=${window.fromDate}&toDate=${window.toDate}`
  const res = await fetchXeroWithRateLimit(url, { accessToken, tenantId })
  return parseBankStatementReport(res.json)
}

async function fetchFallbackAccounts(
  tenantId: string,
  accessToken: string,
  window: { fromDate: string },
  accountCurrency: Map<string, string | null>,
): Promise<{ accounts: AccountBuckets[]; truncated: boolean; dropped: number }> {
  const since = sinceWhere(window.fromDate)
  const where = since ? `${UNRECONCILED_AUTHORISED} AND ${since}` : UNRECONCILED_AUTHORISED
  const transactions: any[] = []
  let truncated = false
  for (let page = 1; page <= FALLBACK_MAX_PAGES; page++) {
    const url = `${ACCOUNTING_BASE}/BankTransactions?where=${encodeURIComponent(where)}&page=${page}`
    const res = await fetchXeroWithRateLimit(url, { accessToken, tenantId })
    const batch = Array.isArray(res.json?.BankTransactions) ? res.json.BankTransactions : []
    transactions.push(...batch)
    if (batch.length < 100) break
    // A full final page means the cap cut us off — the count is a FLOOR and
    // must be labelled, never stored as if complete.
    if (page === FALLBACK_MAX_PAGES) truncated = true
  }
  const { byAccount, dropped } = groupFallbackTransactions(transactions)
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
      source: 'statement_lines',
      error: `token: ${token.error ?? 'unknown'}${token.shouldDeactivate ? ' (needs reconnect)' : ''}`,
    }
  }

  // Statement lines look back STATEMENT_WINDOW_MONTHS in ≤12-month chunks;
  // the fallback keeps its shorter FALLBACK_WINDOW_MONTHS bound (see
  // bucketing.ts for why the two differ).
  const stmtWindows = statementWindows(now)
  const fallbackWindow = sweepWindow(now, FALLBACK_WINDOW_MONTHS)
  // Hoisted so the double-failure path (statement refused AND fallback threw)
  // still names the original statement-report reason on the check row.
  let fallbackReason: string | undefined

  try {
    const bankAccounts = await listBankAccounts(connection.tenant_id, token.accessToken)
    if (bankAccounts.length === 0) {
      // A tenant with no active bank accounts genuinely has nothing to
      // reconcile — an OK check with zero buckets, not an error.
      return { ...base, status: 'ok', source: 'statement_lines' }
    }
    const accountCurrency = new Map(bankAccounts.map(a => [a.bankAccountId, a.currency]))

    // Primary: statement lines from the Bank Statement report. If ANY
    // account's report can't be fetched or parsed, the whole tenant falls
    // back — a partial statement-line picture must not read as complete.
    try {
      const accounts: AccountBuckets[] = []
      for (const account of bankAccounts) {
        const items: UnreconciledItem[] = []
        for (const chunk of stmtWindows) {
          const parsed = await fetchStatementLineItems(
            connection.tenant_id,
            token.accessToken,
            account,
            chunk,
          )
          if (!parsed.parsed) {
            throw new Error(
              `bank statement report shape not recognised (${account.bankAccountName ?? account.bankAccountId}): ${parsed.reason ?? 'unknown'}`,
            )
          }
          items.push(...parsed.items)
        }
        const buckets = bucketByMonth(items)
        if (buckets.length > 0) {
          accounts.push({ ...account, buckets })
        }
      }
      return { ...base, ...sumBuckets(accounts), status: 'ok', source: 'statement_lines', accounts }
    } catch (primaryErr) {
      if (primaryErr instanceof RateLimitDailyExceededError) throw primaryErr
      // Fall through to the account-transaction count, labelled as such —
      // but never silently: the reason lands on the check row.
      fallbackReason = `statement report unavailable: ${
        primaryErr instanceof Error ? primaryErr.message.slice(0, 250) : String(primaryErr)
      }`
    }

    const fallback = await fetchFallbackAccounts(
      connection.tenant_id,
      token.accessToken,
      fallbackWindow,
      accountCurrency,
    )
    const caveats: string[] = []
    if (fallback.truncated) {
      caveats.push(`fallback truncated at ${FALLBACK_MAX_PAGES * 100} transactions — count is a floor`)
    }
    if (fallback.dropped > 0) {
      caveats.push(`${fallback.dropped} transaction(s) lacked a bank account id and were not counted`)
    }
    return {
      ...base,
      ...sumBuckets(fallback.accounts),
      status: 'ok',
      source: 'account_transactions',
      fallbackReason,
      caveats: caveats.length > 0 ? caveats : undefined,
      accounts: fallback.accounts,
    }
  } catch (err) {
    if (err instanceof RateLimitDailyExceededError) {
      return { ...base, status: 'error', source: 'statement_lines', error: 'xero daily rate limit — retry tomorrow' }
    }
    const message = err instanceof Error ? err.message.slice(0, 250) : String(err)
    return {
      ...base,
      status: 'error',
      source: 'statement_lines',
      // Double failure: the fallback died AFTER the statement path was
      // abandoned — keep both reasons on the row.
      error: fallbackReason ? `${message} (after ${fallbackReason})` : message,
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
  const notes = [result.error ?? result.fallbackReason, ...(result.caveats ?? [])]
    .filter(Boolean)
    .join(' | ')
  const { error: checkError } = await supabase.from('reconciliation_checks').upsert(
    {
      tenant_id: result.tenantId,
      business_id: result.businessId,
      source: result.source,
      status: result.status,
      // On an ok check this may carry the fallback reason and honesty caveats
      // (truncation, dropped rows) — readers only SURFACE it for
      // status='error', but it is always available for diagnosis.
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
