/**
 * The database half of account-actuals: read the ledger, refuse what cannot be
 * described, hand the rows to the pure builder.
 *
 * Shared by /api/monthly-report/account-actuals and scripts/preview-pack.ts.
 * The harness exists so a page can be LOOKED AT before it ships; a harness
 * that read the ledger its own way would be looking at a different page.
 *
 * The caller supplies the client and is responsible for authorisation — both
 * callers hold a service-role client, which bypasses RLS.
 */
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import { resolveXeroConnections } from '@/lib/business/resolveXeroBusinessId'
import {
  accountActualsRefusal,
  buildAccountActuals,
  type AccountActuals,
  type ConnectionRow,
  type MappingRow,
  type PlLineRow,
} from './account-actuals'

export type AccountActualsResult = { data: AccountActuals } | { unavailable_reason: string }

export async function loadAccountActuals(
  supabase: { from: (table: string) => any },
  businessId: string,
  endMonth: string,
  months: number,
  codes: readonly string[],
): Promise<AccountActualsResult> {
  const ids = await resolveBusinessProfileIds(supabase, businessId)

  // xero_pl_lines_wide_compat is accruals-only by definition (the view filters
  // basis = 'accruals'), so a cash-basis row cannot double a figure here.
  const { data: rows, error: rowsErr } = await supabase
    .from('xero_pl_lines_wide_compat')
    .select('business_id, tenant_id, account_code, account_name, account_type, monthly_values, updated_at')
    .in('business_id', ids.all)
  if (rowsErr) throw rowsErr

  const plRows = (rows ?? []) as (PlLineRow & { business_id: string })[]

  // xero_connections is businesses-space; match the ledger's orgs on
  // tenant_id, never on business_id.
  const { connections } = await resolveXeroConnections(supabase, businessId)
  const rowTenantIds = [...new Set(plRows.map((r) => r.tenant_id).filter((t): t is string => !!t))]
  let rowTenantConnections: ConnectionRow[] = []
  if (rowTenantIds.length > 0) {
    const { data: tenantConns, error: connErr } = await supabase
      .from('xero_connections')
      .select('tenant_id, functional_currency')
      .in('tenant_id', rowTenantIds)
    if (connErr) throw connErr
    rowTenantConnections = (tenantConns ?? []) as ConnectionRow[]
  }

  const refusal = accountActualsRefusal({
    activeConnections: (connections ?? []) as ConnectionRow[],
    rows: plRows,
    rowTenantConnections,
  })
  if (refusal) return { unavailable_reason: refusal }

  // Both id-spaces: Urban Road's mappings live under businesses.id while its
  // ledger lives under business_profiles.id. The statement reads the
  // businesses.id rows (generate/route.ts), so where both spaces name the same
  // account those are ordered LAST and win the builder's last-writer map.
  const { data: maps, error: mapsErr } = await supabase
    .from('account_mappings')
    .select('business_id, xero_account_name, report_category')
    .in('business_id', ids.all)
  if (mapsErr) throw mapsErr
  const mappings = ((maps ?? []) as (MappingRow & { business_id: string })[])
    .slice()
    .sort((a, b) => Number(a.business_id === ids.businessId) - Number(b.business_id === ids.businessId))

  return { data: buildAccountActuals(plRows, mappings, endMonth, months, codes) }
}
