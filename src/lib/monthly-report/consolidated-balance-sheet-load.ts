/**
 * The database half of the consolidated Balance Sheet page: the business's
 * organisations, the balance-sheet mirror on the dates the page reads, each
 * organisation's account catalogue, the exchange rates and the coach's
 * intercompany loan rules — handed to the pure buildConsolidatedBalanceSheet.
 *
 * Shared by /api/Xero/balance-sheet (a business Xero holds as several
 * organisations) and scripts/preview-pack.ts. Reads only; the caller supplies
 * the client and is responsible for authorisation. Throws on a database error
 * the sheet cannot do without — rows, rates, rules — because a sheet built
 * without them is a wrong sheet, not a smaller one. The catalogue alone is
 * allowed to fail: it decides where a card prints, not what Net Assets is.
 */
import * as Sentry from '@sentry/nextjs'
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import type { BalanceSheetCompare } from '@/app/finances/monthly-report/types'
import type { EliminationRule } from '@/lib/consolidation/types'
import {
  buildConsolidatedBalanceSheet,
  consolidatedBalanceSheetDates,
  type BsCatalogueAccount,
  type ConsolidatedBsOrganisation,
  type ConsolidatedBsResult,
  type FxRateInput,
  type MirrorBsRow,
} from './consolidated-balance-sheet'

type Client = any

/** PostgREST's row cap. A read that comes back this full may have been cut short, and a short sheet is a wrong one. */
const ROW_CAP = 1000

/** A xero_connections row, as much of it as the sheet needs. */
export interface ConsolidationConnection {
  tenant_id: string | null
  tenant_name?: string | null
  display_name?: string | null
  display_order?: number | null
  functional_currency?: string | null
  include_in_consolidation?: boolean | null
}

/**
 * The organisations a consolidated sheet adds together: one per tenant (the
 * connections are read across both id-spaces, so an organisation can come back
 * twice), in display order, leaving out any a coach excluded from the
 * consolidation — named, so the page can say it leaves them out.
 */
export function consolidationOrganisations(connections: readonly ConsolidationConnection[]): {
  organisations: ConsolidatedBsOrganisation[]
  excluded: string[]
} {
  const seen = new Set<string>()
  const distinct = connections.filter((c) => {
    if (!c.tenant_id || seen.has(c.tenant_id)) return false
    seen.add(c.tenant_id)
    return true
  })
  const nameOf = (c: ConsolidationConnection) => c.display_name || c.tenant_name || c.tenant_id!
  const included = distinct
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.include_in_consolidation !== false)
    .sort((a, b) => (a.c.display_order ?? 0) - (b.c.display_order ?? 0) || a.i - b.i)
  return {
    organisations: included.map(({ c }) => ({
      tenant_id: c.tenant_id!,
      name: nameOf(c),
      functional_currency: c.functional_currency ?? null,
    })),
    excluded: distinct.filter((c) => c.include_in_consolidation === false).map(nameOf),
  }
}

export async function loadConsolidatedBalanceSheet(
  supabase: Client,
  businessId: string,
  month: string,
  compare: BalanceSheetCompare,
  opts: { connections?: readonly ConsolidationConnection[] } = {},
): Promise<ConsolidatedBsResult> {
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
  const { organisations, excluded } = consolidationOrganisations(connections)
  if (organisations.length === 0) {
    return { ok: false, reason: 'no Xero organisation is included in this consolidation' }
  }

  // The business's own year, never an assumed July (see openingBalanceDate).
  const { data: profile } = await supabase
    .from('business_profiles')
    .select('fiscal_year_start')
    .eq('id', ids.profileId)
    .maybeSingle()
  const fiscalYearStart = Number(profile?.fiscal_year_start ?? 7)

  const dates = consolidatedBalanceSheetDates(month, compare, fiscalYearStart)
  const isForeign = (o: ConsolidatedBsOrganisation) => (o.functional_currency ?? 'AUD').trim().toUpperCase() !== 'AUD'
  const foreign = organisations.filter(isForeign)
  const all = organisations.map((o) => o.tenant_id)

  // One read per date. A balance sheet is tens of rows an organisation, so a
  // date stays far under the cap where a single read of every date a foreign
  // organisation's walk needs would not. Accruals only: this reads the table,
  // not the basis-filtered view.
  const readDates = [...new Set([dates.current, dates.prior, ...(foreign.length > 0 ? dates.foreign : [])])].sort()
  const rows: MirrorBsRow[] = []
  for (const date of readDates) {
    const tenants = date === dates.current || date === dates.prior ? all : foreign.map((o) => o.tenant_id)
    const { data, error } = await supabase
      .from('xero_bs_lines')
      .select('tenant_id, account_id, account_code, account_name, account_type, section, balance_date, balance')
      .in('business_id', ids.all)
      .in('tenant_id', tenants)
      .eq('balance_date', date)
      .eq('basis', 'accruals')
      .limit(ROW_CAP)
    if (error) throw error
    if ((data ?? []).length >= ROW_CAP) {
      throw new Error(`[ConsolidatedBS] xero_bs_lines at ${date} reached the ${ROW_CAP}-row cap — the sheet may be incomplete`)
    }
    rows.push(...((data ?? []) as MirrorBsRow[]))
  }

  // Keyed on tenant_id (xero_accounts carries both id-spaces), balance-sheet
  // classes only, one organisation at a time to stay under the cap.
  let accounts: BsCatalogueAccount[] | null = []
  for (const tenant of all) {
    const { data, error } = await supabase
      .from('xero_accounts')
      .select('tenant_id, xero_account_id, account_code, xero_class, bank_account_type, last_synced_at')
      .eq('tenant_id', tenant)
      .in('xero_class', ['ASSET', 'LIABILITY', 'EQUITY'])
      .limit(ROW_CAP)
    if (error || (data ?? []).length >= ROW_CAP) {
      Sentry.captureMessage('[ConsolidatedBS] account catalogue unavailable — accounts keep the class Xero’s report gave them', {
        level: 'warning',
        extra: { businessId, tenant, error: error?.message ?? null, rows: data?.length ?? null },
      } as any)
      accounts = null
      break
    }
    accounts.push(...((data ?? []) as BsCatalogueAccount[]))
  }

  const rates: FxRateInput[] = []
  for (const pair of [...new Set(foreign.map((o) => `${(o.functional_currency ?? '').trim().toUpperCase()}/AUD`))]) {
    const { data, error } = await supabase
      .from('fx_rates')
      .select('currency_pair, rate_type, period, rate')
      .eq('currency_pair', pair)
      .gte('period', `${readDates[0].slice(0, 7)}-01`)
      .lte('period', readDates[readDates.length - 1])
      .limit(ROW_CAP)
    if (error) throw error
    rates.push(...((data ?? []) as FxRateInput[]))
  }

  const { data: ruleRows, error: rulesError } = await supabase
    .from('consolidation_elimination_rules')
    .select('*')
    .in('business_id', ids.all)
    .eq('active', true)
  if (rulesError) throw rulesError

  const result = buildConsolidatedBalanceSheet({
    businessId,
    month,
    compare,
    fiscalYearStart,
    organisations,
    rows,
    accounts,
    rates,
    rules: (ruleRows ?? []) as EliminationRule[],
  })
  if (result.ok && excluded.length > 0) {
    result.data.consolidation!.notes.push(
      `Leaves out ${excluded.join(', ')}, which ${excluded.length === 1 ? 'is' : 'are'} not included in this consolidation.`,
    )
  }
  return result
}
