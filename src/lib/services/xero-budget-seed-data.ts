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

type SupabaseLike = { from: (table: string) => any }

/**
 * PostgREST caps a single response at the project's max-rows setting (1000 by
 * default, configurable lower). A chart of accounts or a P&L mirror can exceed
 * a low cap, and an unordered, capped read drops rows arbitrarily — the first
 * Urban Road seed lost 3 of 298 catalogued accounts that way. Read in ordered
 * pages until a short page comes back.
 */
const PAGE_SIZE = 1000

async function readAllPages<T>(
  build: () => any,
  orderColumn: string,
  label: string,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build().order(orderColumn, { ascending: true }).range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`${label} read failed: ${error.message}`)
    const page: T[] = Array.isArray(data) ? data : []
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
  }
  return rows
}

/** Chart of accounts as last synced (xero_accounts). */
export async function loadAccountsCatalog(supabase: SupabaseLike, tenantId: string): Promise<CatalogAccount[]> {
  const data = await readAllPages<any>(
    () => supabase
      .from('xero_accounts')
      .select('xero_account_id, account_code, account_name, xero_type, xero_status')
      .eq('tenant_id', tenantId),
    'account_code',
    'xero_accounts',
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
 * Synced P&L actuals by account code (xero_pl_lines_wide_compat, accruals
 * basis). Rows for the same code but different section/name are merged.
 */
export async function loadAccountActuals(supabase: SupabaseLike, tenantId: string): Promise<AccountActuals[]> {
  const data = await readAllPages<any>(
    () => supabase
      .from('xero_pl_lines_wide_compat')
      .select('account_code, account_name, account_type, monthly_values')
      .eq('tenant_id', tenantId),
    'account_code',
    'xero_pl_lines_wide_compat',
  )
  const byCode = new Map<string, AccountActuals>()
  for (const r of data) {
    const code = r.account_code == null ? null : String(r.account_code)
    if (!code) continue
    const monthly: Record<string, number> = {}
    for (const [k, v] of Object.entries((r.monthly_values ?? {}) as Record<string, unknown>)) {
      const n = typeof v === 'number' ? v : Number(v)
      if (Number.isFinite(n)) monthly[k] = n
    }
    const existing = byCode.get(code)
    if (existing) {
      for (const [k, v] of Object.entries(monthly)) existing.monthly[k] = (existing.monthly[k] ?? 0) + v
    } else {
      byCode.set(code, {
        accountCode: code,
        accountName: String(r.account_name ?? ''),
        accountType: r.account_type == null ? null : String(r.account_type),
        monthly,
      })
    }
  }
  return Array.from(byCode.values())
}
