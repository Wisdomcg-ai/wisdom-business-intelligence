/**
 * A Subscription-page crawl rebuilt from what the route itself persisted, for a
 * caller that must not call Xero (scripts/preview-pack.ts).
 *
 * The route writes this month's per-vendor totals to subscription_vendor_actuals
 * (source 'report') every time the page is viewed; the wizard's Step 6 writes
 * history (source 'analyze'). Those rows go through the SAME assembler the route
 * uses — so budgets, budget-only vendors, the P&L account totals and the
 * leakage cards are exactly the route's — but the rows are not the crawl, and
 * four things are lost. Every one is reported in `notes`, and the harness
 * prints them:
 *
 *   1. ACCOUNT. The table has no account dimension. A vendor is placed on the
 *      first requested code its subscription_budgets row names (active or
 *      not); a vendor with no budget row is placed on the first requested code
 *      and listed as `unassigned`.
 *   2. STALENESS. An upsert never deletes, and the route only prunes after a
 *      complete crawl, so a month can hold rows an older crawl wrote for
 *      documents since voided. Only each tenant's newest write batch is kept
 *      (rows within `batchWindowMs` of that tenant-month's latest updated_at);
 *      the rest are listed as `excluded_stale`.
 *   3. TRANSACTION COUNT. One row is one vendor-month total, so a vendor with
 *      a row counts as one posted line — enough for "not billed this month",
 *      not for anything that reads the count as a number.
 *   4. PRIOR MONTH. The route reads the prior month from Xero; here it is that
 *      month's 'report' rows, else its 'analyze' rows, which Step 6 may have
 *      written for a wider set of accounts.
 *
 * Contractor Analysis has no persisted rows at all (the route deliberately
 * never writes contractors through), so it cannot be rebuilt this way.
 */
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import { resolveXeroConnections } from '@/lib/business/resolveXeroBusinessId'
import { addSubscriptionLine, newSubscriptionCrawl, priorMonthKeyOf, type SubscriptionCrawl } from './subscription-detail-build'

type Client = any

export interface PersistedVendorActualRow {
  tenant_id: string
  vendor_key: string
  vendor_name: string
  month: string
  amount: number | string
  source: string
  updated_at: string
}

export interface VendorBudgetAccounts {
  vendor_key: string
  account_codes: string[] | null
}

export interface PersistedCrawlNotes {
  current_source: 'report' | 'analyze' | 'none'
  prior_source: 'report' | 'analyze' | 'none'
  excluded_stale: { month: string; vendor_name: string; amount: number; updated_at: string }[]
  unassigned: { vendor_name: string; amount: number; placed_on: string }[]
}

const DEFAULT_BATCH_WINDOW_MS = 60_000

/** One month's rows: the preferred source, then each tenant's newest batch. */
function rowsForMonth(
  rows: PersistedVendorActualRow[],
  month: string,
  batchWindowMs: number,
): { kept: PersistedVendorActualRow[]; stale: PersistedVendorActualRow[]; source: 'report' | 'analyze' | 'none' } {
  const inMonth = rows.filter((r) => r.month === month)
  const source: 'report' | 'analyze' | 'none' = inMonth.some((r) => r.source === 'report')
    ? 'report'
    : inMonth.some((r) => r.source === 'analyze') ? 'analyze' : 'none'
  if (source === 'none') return { kept: [], stale: [], source }
  const ofSource = inMonth.filter((r) => r.source === source)
  const newestByTenant = new Map<string, number>()
  for (const r of ofSource) {
    const t = Date.parse(r.updated_at)
    if (!Number.isFinite(t)) continue
    newestByTenant.set(r.tenant_id, Math.max(newestByTenant.get(r.tenant_id) ?? -Infinity, t))
  }
  const kept: PersistedVendorActualRow[] = []
  const stale: PersistedVendorActualRow[] = []
  for (const r of ofSource) {
    const newest = newestByTenant.get(r.tenant_id)
    const t = Date.parse(r.updated_at)
    if (newest === undefined || !Number.isFinite(t) || t >= newest - batchWindowMs) kept.push(r)
    else stale.push(r)
  }
  return { kept, stale, source }
}

export function crawlFromPersistedVendorActuals(args: {
  accountCodes: string[]
  reportMonth: string
  /** Xero account code → name, as the route's chart-of-accounts pull would give. */
  accountNames: Map<string, string>
  rows: PersistedVendorActualRow[]
  budgets: VendorBudgetAccounts[]
  batchWindowMs?: number
}): { crawl: SubscriptionCrawl; notes: PersistedCrawlNotes } {
  const { accountCodes, reportMonth, accountNames, rows, budgets } = args
  const window = args.batchWindowMs ?? DEFAULT_BATCH_WINDOW_MS
  const crawl = newSubscriptionCrawl(accountCodes)
  for (const code of accountCodes) {
    const name = accountNames.get(code)
    if (name) crawl.accountNames.set(code, name)
  }
  const notes: PersistedCrawlNotes = { current_source: 'none', prior_source: 'none', excluded_stale: [], unassigned: [] }
  if (accountCodes.length === 0) return { crawl, notes }

  const requested = new Set(accountCodes)
  const accountOf = new Map<string, string>()
  for (const b of budgets) {
    if (!b.vendor_key || accountOf.has(b.vendor_key)) continue
    const hit = (b.account_codes ?? []).find((c) => requested.has(c))
    if (hit) accountOf.set(b.vendor_key, hit)
  }

  const place = (r: PersistedVendorActualRow, isCurrent: boolean) => {
    const amount = Number(r.amount) || 0
    let code = accountOf.get(r.vendor_key)
    if (!code) {
      code = accountCodes[0]
      if (isCurrent) notes.unassigned.push({ vendor_name: r.vendor_name, amount, placed_on: code })
    }
    addSubscriptionLine(crawl, {
      accountCode: code,
      vendorName: r.vendor_name,
      vendorKey: r.vendor_key,
      amount,
      isCurrent,
      tenantId: r.tenant_id,
    })
  }

  const current = rowsForMonth(rows, reportMonth, window)
  const prior = rowsForMonth(rows, priorMonthKeyOf(reportMonth), window)
  notes.current_source = current.source
  notes.prior_source = prior.source
  for (const s of [...current.stale, ...prior.stale]) {
    notes.excluded_stale.push({ month: s.month, vendor_name: s.vendor_name, amount: Number(s.amount) || 0, updated_at: s.updated_at })
  }
  for (const r of current.kept) place(r, true)
  for (const r of prior.kept) place(r, false)
  return { crawl, notes }
}

/** The database reads for crawlFromPersistedVendorActuals. Reads only. */
export async function loadPersistedSubscriptionCrawl(
  supabase: Client,
  input: { business_id: string; report_month: string; account_codes: string[] },
): Promise<{ crawl: SubscriptionCrawl; notes: PersistedCrawlNotes }> {
  const { business_id, report_month, account_codes } = input
  const ids = await resolveBusinessProfileIds(supabase, business_id)
  // Only the orgs the route would crawl: active connections, joined on tenant.
  const { connections } = await resolveXeroConnections(supabase, business_id)
  const tenantIds = (connections ?? []).map((c: { tenant_id: string }) => c.tenant_id).filter(Boolean)
  if (tenantIds.length === 0 || account_codes.length === 0) {
    return crawlFromPersistedVendorActuals({ accountCodes: account_codes, reportMonth: report_month, accountNames: new Map(), rows: [], budgets: [] })
  }

  const months = [report_month, priorMonthKeyOf(report_month)]
  const [{ data: rows, error: rowsErr }, { data: budgets, error: budgetsErr }, { data: accounts, error: accountsErr }] = await Promise.all([
    supabase
      .from('subscription_vendor_actuals')
      .select('tenant_id, vendor_key, vendor_name, month, amount, source, updated_at')
      .in('business_id', ids.all)
      .in('tenant_id', tenantIds)
      .in('month', months),
    supabase
      .from('subscription_budgets')
      .select('vendor_key, account_codes, is_active')
      .eq('business_id', business_id)
      // Active first, so an active row's account wins over an archived one's.
      .order('is_active', { ascending: false }),
    supabase
      .from('xero_accounts')
      .select('account_code, account_name, tenant_id')
      .in('business_id', ids.all)
      .in('tenant_id', tenantIds)
      .in('account_code', account_codes),
  ])
  if (rowsErr) throw rowsErr
  if (budgetsErr) throw budgetsErr
  if (accountsErr) throw accountsErr

  const accountNames = new Map<string, string>()
  for (const a of (accounts ?? []) as { account_code: string; account_name: string }[]) {
    if (a.account_code && a.account_name && !accountNames.has(a.account_code)) accountNames.set(a.account_code, a.account_name)
  }

  return crawlFromPersistedVendorActuals({
    accountCodes: account_codes,
    reportMonth: report_month,
    accountNames,
    rows: (rows ?? []) as PersistedVendorActualRow[],
    budgets: (budgets ?? []) as VendorBudgetAccounts[],
  })
}
