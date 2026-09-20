/**
 * The database half of Bank Balances & Movement: the business's organisations,
 * the balance-sheet mirror at the two month-ends the page prints, the chart of
 * accounts, the exchange rates and the coach's chosen bank accounts — handed to
 * the pure buildBankBalances.
 *
 * Shared by /api/monthly-report/bank-balances and scripts/preview-pack.ts.
 * Reads only; the caller supplies the client and is responsible for
 * authorisation. Throws on a database error the page cannot do without — the
 * mirror, the rates, the chosen list — because a page built without them is a
 * wrong page, not a smaller one. The chart of accounts alone may fail: it
 * decides nothing about a figure, only whether a chosen account with no balance
 * in either month can be told from one this report does not cover.
 */
import * as Sentry from '@sentry/nextjs'
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import { balanceSheetDates } from './balance-sheet-rows'
import { parseBankAccountIds } from './opening-bank'
import { buildBankBalances, type BankBalancesResult } from './bank-balances'
import {
  consolidationOrganisations,
  type ConsolidationConnection,
} from './consolidated-balance-sheet-load'
import type { BsCatalogueAccount, FxRateInput, MirrorBsRow } from './consolidated-balance-sheet'

type Client = any

/** PostgREST's row cap. A read that comes back this full may have been cut short, and a short page is a wrong one. */
const ROW_CAP = 1000

/** Postgres undefined_column, or PostgREST's stale schema cache for a column added moments ago. */
function isMissingColumn(error: { code?: string } | null | undefined): boolean {
  return error?.code === '42703' || error?.code === 'PGRST204'
}

/**
 * The accounts the page prints: the business's own list
 * (monthly_report_settings.bank_balance_account_ids), or the cashflow's bank
 * accounts when it has not chosen one.
 *
 * The column arrives by a migration applied by hand after merge, so this code
 * reaches prod first. A schema that does not have it yet answers exactly as a
 * business that has not chosen: the cashflow's list. Any other database error
 * throws — guessing which accounts are the bank is how a page ends up totalling
 * to a figure nobody asked for.
 */
export async function loadBankBalanceAccountIds(supabase: Client, businessId: string): Promise<string[] | null> {
  const ids = await resolveBusinessProfileIds(supabase, businessId)

  // The settings row is keyed by whichever id the settings page saved under —
  // businesses.id for every client today — so read both and prefer that one.
  const read = async (columns: string) => supabase.from('monthly_report_settings').select(columns).in('business_id', ids.all)
  let { data, error } = await read('business_id, bank_balance_account_ids, bank_account_ids')
  if (error && isMissingColumn(error)) {
    ({ data, error } = await read('business_id, bank_account_ids'))
  }
  if (error) throw error

  const rows = (data ?? []) as Array<{ business_id: string; bank_balance_account_ids?: unknown; bank_account_ids?: unknown }>
  const row = rows.find((r) => r.business_id === ids.businessId) ?? rows[0]
  return parseBankAccountIds(row?.bank_balance_account_ids) ?? parseBankAccountIds(row?.bank_account_ids)
}

export async function loadBankBalances(
  supabase: Client,
  businessId: string,
  month: string,
  opts: { connections?: readonly ConsolidationConnection[]; accountIds?: string[] | null } = {},
): Promise<BankBalancesResult> {
  const ids = await resolveBusinessProfileIds(supabase, businessId)

  let connections = opts.connections
  if (!connections) {
    const { data, error } = await supabase
      .from('xero_connections')
      .select('tenant_id, tenant_name, display_name, display_order, functional_currency, include_in_consolidation')
      .in('business_id', ids.all)
      .eq('is_active', true)
    if (error) throw error
    connections = (data ?? []) as ConsolidationConnection[]
  }
  const { organisations } = consolidationOrganisations(connections)
  if (organisations.length === 0) {
    return { ok: false, reason: 'no Xero organisation is connected to this business' }
  }

  const accountIds = opts.accountIds !== undefined ? opts.accountIds : await loadBankBalanceAccountIds(supabase, businessId)

  const { current, prior } = balanceSheetDates(month, 'mom')
  const included = organisations.map((o) => o.tenant_id)

  // One read per date. A balance sheet is tens of rows an organisation, so a
  // date stays far under the cap. Accruals only: this reads the table, not the
  // basis-filtered view. The WHOLE sheet, not only the chosen accounts —
  // "this organisation has not synced" is answered by the sheet being empty.
  const rows: MirrorBsRow[] = []
  for (const date of [current, prior]) {
    const { data, error } = await supabase
      .from('xero_bs_lines')
      .select('tenant_id, account_id, account_code, account_name, account_type, section, balance_date, balance')
      .in('business_id', ids.all)
      .in('tenant_id', included)
      .eq('balance_date', date)
      .eq('basis', 'accruals')
      .limit(ROW_CAP)
    if (error) throw error
    if ((data ?? []).length >= ROW_CAP) {
      throw new Error(`[BankBalances] xero_bs_lines at ${date} reached the ${ROW_CAP}-row cap — the page may be incomplete`)
    }
    rows.push(...((data ?? []) as MirrorBsRow[]))
  }

  // EVERY organisation of the business, not only the ones this report covers:
  // that is what tells a chosen account of an excluded organisation (left out,
  // with a line saying so) from an id nothing knows (the page refuses).
  //
  // Balance-sheet classes only, one organisation at a time, to stay under the
  // cap: xero_accounts is written under BOTH business ids, so every account of
  // an organisation is there twice, and a whole chart of accounts doubled is
  // close enough to 1,000 rows to matter.
  const allTenants = [...new Set(connections.map((c) => c.tenant_id).filter(Boolean) as string[])]
  let accounts: BsCatalogueAccount[] | null = []
  for (const tenant of allTenants) {
    const { data, error } = await supabase
      .from('xero_accounts')
      .select('tenant_id, xero_account_id, account_code, xero_class, bank_account_type, last_synced_at')
      .eq('tenant_id', tenant)
      .in('xero_class', ['ASSET', 'LIABILITY', 'EQUITY'])
      .limit(ROW_CAP)
    if (error || (data ?? []).length >= ROW_CAP) {
      Sentry.captureMessage('[BankBalances] account catalogue unavailable — a chosen account with no balance cannot be checked', {
        level: 'warning',
        extra: { businessId, tenant, error: error?.message ?? null, rows: data?.length ?? null },
      } as any)
      accounts = null
      break
    }
    accounts.push(...((data ?? []) as BsCatalogueAccount[]))
  }

  const rates: FxRateInput[] = []
  const pairs = [
    ...new Set(
      organisations
        .map((o) => (o.functional_currency ?? '').trim().toUpperCase())
        .filter((c) => c && c !== 'AUD')
        .map((c) => `${c}/AUD`),
    ),
  ]
  for (const pair of pairs) {
    const { data, error } = await supabase
      .from('fx_rates')
      .select('currency_pair, rate_type, period, rate')
      .eq('currency_pair', pair)
      .eq('rate_type', 'closing_spot')
      .in('period', [current, prior])
      .limit(ROW_CAP)
    if (error) throw error
    rates.push(...((data ?? []) as FxRateInput[]))
  }

  return buildBankBalances({ businessId, month, organisations, rows, accounts, rates, accountIds })
}
