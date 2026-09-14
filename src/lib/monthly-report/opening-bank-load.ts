/**
 * The database half of the pack's opening bank: Total Bank on the day before
 * the report's fiscal year starts, from the STORED balance-sheet mirror, handed
 * to the pure totalBankAt.
 *
 * Shared by /api/monthly-report/opening-bank and scripts/preview-pack.ts.
 * Reads only; the caller supplies the client and is responsible for
 * authorisation. Throws on a database error — the route turns that into a 500
 * and the page into 'unavailable'.
 */
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import { openingBalanceDate, parseBankAccountIds, totalBankAt, type KnownAccountInput, type OpeningBank } from './opening-bank'
import { loadBankAccountIds } from './bank-accounts-load'

type Client = any

/**
 * @param opts.bankAccountIds the bank set to use instead of the stored one —
 *   the preview harness passes its settings (with any --settings-override)
 *   through here. Omitted, the business's saved choice is read.
 */
export async function loadOpeningBank(
  supabase: Client,
  businessId: string,
  reportMonth: string,
  opts: { bankAccountIds?: string[] | null } = {},
): Promise<OpeningBank> {
  const ids = await resolveBusinessProfileIds(supabase, businessId)
  const bankAccountIds = parseBankAccountIds(opts.bankAccountIds !== undefined
    ? opts.bankAccountIds
    : await loadBankAccountIds(supabase, businessId))

  // The fiscal year is the business's own, not the clock's and not an assumed
  // July: every profile is 7 today, but the day one isn't, a hard-coded July
  // would open the year on the wrong balance sheet without a sound.
  const { data: profile } = await supabase
    .from('business_profiles')
    .select('fiscal_year_start')
    .eq('id', ids.profileId)
    .maybeSingle()
  const asAt = openingBalanceDate(reportMonth, Number(profile?.fiscal_year_start ?? 7))

  // Scope by ACTIVE connection and join on tenant_id (CLAUDE.md): tenant ids
  // are shared across business ids — IICT's orgs sit under an inactive
  // business too — and xero_connections.business_id is businesses-space while
  // the mirror is written under the profile id.
  const { data: conns, error: connErr } = await supabase
    .from('xero_connections')
    .select('tenant_id, functional_currency')
    .in('business_id', ids.all)
    .eq('is_active', true)
  if (connErr) throw connErr
  const tenants = (conns ?? [])
    .filter((c: { tenant_id: string | null }) => !!c.tenant_id)
    .map((c: { tenant_id: string; functional_currency: string | null }) => ({
      tenant_id: c.tenant_id,
      currency: c.functional_currency,
    }))

  let rows: Array<Record<string, unknown>> = []
  if (tenants.length > 0) {
    const { data, error } = await supabase
      .from('xero_bs_lines')
      .select('tenant_id, account_id, account_type, section, balance_date, balance')
      .in('business_id', ids.all)
      .in('tenant_id', tenants.map((t: { tenant_id: string }) => t.tenant_id))
      .eq('balance_date', asAt)
      // Accruals only. The money-flow page reads xero_bs_lines_wide_compat,
      // whose view filters basis = 'accruals'; this reads the table, so it
      // must say it. Prod holds accruals rows alone today — but the day a
      // cash-basis balance sheet syncs, an unfiltered sum adds both bases
      // together and roughly doubles Total Bank without a single error.
      .eq('basis', 'accruals')
    if (error) throw error
    rows = data ?? []
  }

  // The chosen accounts as the mirror holds them on ANY date, so an account
  // Xero left off the opening sheet at $0 is told apart from an id the sync
  // never wrote (totalBankAt). account_id is a uuid column: an id that is not
  // one cannot be in the mirror, and sending it would fail the whole query.
  let knownAccounts: KnownAccountInput[] = []
  const uuidIds = (bankAccountIds ?? []).filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id))
  if (tenants.length > 0 && uuidIds.length > 0) {
    const { data, error } = await supabase
      .from('xero_bs_lines')
      .select('tenant_id, account_id, account_type')
      .in('business_id', ids.all)
      .in('tenant_id', tenants.map((t: { tenant_id: string }) => t.tenant_id))
      .in('account_id', uuidIds)
      .eq('basis', 'accruals')
    if (error) throw error
    knownAccounts = (data ?? []).map((r: Record<string, unknown>) => ({
      tenant_id: (r.tenant_id as string | null) ?? null,
      account_id: (r.account_id as string | null) ?? null,
      account_type: String(r.account_type ?? ''),
    }))
  }

  return totalBankAt(
    rows.map((r) => ({
      tenant_id: (r.tenant_id as string | null) ?? null,
      account_id: (r.account_id as string | null) ?? null,
      account_type: String(r.account_type ?? ''),
      section: (r.section as string | null) ?? null,
      balance_date: String(r.balance_date ?? ''),
      balance: (r.balance as number | string | null) ?? null,
    })),
    asAt,
    tenants,
    bankAccountIds,
    { knownAccounts },
  )
}
