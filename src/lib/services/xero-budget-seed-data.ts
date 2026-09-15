/**
 * DB reads for the Xero budget seed — kept out of the pure transform so the
 * transform stays testable and the route stays thin.
 *
 * Both reads key on `tenant_id` (the Xero org id), never on business_id: the
 * catalog and the P&L mirror carry business_id in different id-spaces from
 * financial_forecasts, and joining across them is the platform's #1 incident
 * class. tenant_id is unique per org and present on both tables.
 */
import type { CatalogAccount, AccountActuals } from './xero-budget-seed-service'
import { readAllRows } from '@/lib/supabase/read-all-rows'

type SupabaseLike = { from: (table: string) => any }

/**
 * Every row the read matches, or a thrown error — never part of them.
 *
 * PostgREST caps a single response at the project's max-rows setting (1000 by
 * default, configurable lower), and a capped read drops rows without an error —
 * the first Urban Road seed lost 3 of 298 catalogued accounts that way. These
 * reads used to page ordered by account_code, which is not unique (rows tied on
 * a code could land on two pages or none), and stopped on a short page, which a
 * lower cap also produces. readAllRows pages by id to an empty page.
 */
async function readEveryRow<T>(label: string, build: () => any): Promise<T[]> {
  const read = await readAllRows<T>(label, build)
  if (!read.ok) throw read.error
  return read.rows
}

/** Chart of accounts as last synced (xero_accounts). */
export async function loadAccountsCatalog(supabase: SupabaseLike, tenantId: string): Promise<CatalogAccount[]> {
  const data = await readEveryRow<any>('xero_accounts', () =>
    supabase
      .from('xero_accounts')
      .select('id, xero_account_id, account_code, account_name, xero_type, xero_status')
      .eq('tenant_id', tenantId),
  )
  return data.map((r: any) => ({
    accountId: String(r.xero_account_id),
    accountCode: r.account_code == null ? null : String(r.account_code),
    accountName: String(r.account_name ?? ''),
    xeroType: r.xero_type == null ? null : String(r.xero_type),
    status: r.xero_status == null ? null : String(r.xero_status),
  }))
}

/**
 * Synced P&L actuals by account code, monthly — accruals basis and not
 * soft-deleted, the rows xero_pl_lines_wide_compat is built from.
 *
 * Read from the table, not the view: the view is a GROUP BY with no key to page
 * by. The view emitted one row per (account, section, name, …) with a month
 * map; this sums the same rows per code and month instead, which is the same
 * figure — the natural key (business, tenant, account_id, period_month, basis)
 * allows one row per account per month, so no month of the view was ever a
 * choice between rows.
 *
 * Rows for one code with different names (an account renamed in Xero) take the
 * name and type of the code's latest month, so the answer does not depend on
 * which row a page happened to return first.
 */
export async function loadAccountActuals(supabase: SupabaseLike, tenantId: string): Promise<AccountActuals[]> {
  const data = await readEveryRow<any>('xero_pl_lines', () =>
    supabase
      .from('xero_pl_lines')
      .select('id, account_code, account_name, account_type, period_month, amount')
      .eq('tenant_id', tenantId)
      .eq('basis', 'accruals')
      .is('deleted_at', null),
  )
  const byCode = new Map<string, { actuals: AccountActuals; namedFrom: string }>()
  for (const r of data) {
    const code = r.account_code == null ? null : String(r.account_code)
    if (!code) continue
    const month = String(r.period_month ?? '').slice(0, 7)
    let entry = byCode.get(code)
    if (!entry) {
      entry = {
        actuals: { accountCode: code, accountName: '', accountType: null, monthly: {} },
        namedFrom: '',
      }
      byCode.set(code, entry)
    }
    if (month > entry.namedFrom) {
      entry.namedFrom = month
      entry.actuals.accountName = String(r.account_name ?? '')
      entry.actuals.accountType = r.account_type == null ? null : String(r.account_type)
    }
    const amount = typeof r.amount === 'number' ? r.amount : Number(r.amount)
    if (month && Number.isFinite(amount)) {
      entry.actuals.monthly[month] = (entry.actuals.monthly[month] ?? 0) + amount
    }
  }
  return Array.from(byCode.values(), (e) => e.actuals)
}
