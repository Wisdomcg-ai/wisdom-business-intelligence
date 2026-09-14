/**
 * The database half of monthly_report_settings.cash_model, parsed by
 * parseCashModelConfig. Reads only; the caller supplies the client and is
 * responsible for authorisation.
 *
 * The column arrives by a migration applied by hand after merge
 * (20260915000000_monthly_report_cash_model), so this code reaches prod first.
 * A schema without the column answers exactly as a business that has not
 * turned v2 on — 'off', the v1 pages every client printed before — the
 * bank-accounts-load pattern. Any other database error throws: guessing the
 * cash model is how a pack goes out on the wrong one.
 */
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import { parseCashModelConfig, type ParsedCashModelConfig } from './cash-model-config'

type Client = any

/** Postgres undefined_column, or PostgREST's stale schema cache for a column added moments ago. */
function isMissingColumn(error: { code?: string } | null | undefined): boolean {
  return error?.code === '42703' || error?.code === 'PGRST204'
}

export async function loadCashModelConfig(supabase: Client, businessId: string): Promise<ParsedCashModelConfig> {
  const ids = await resolveBusinessProfileIds(supabase, businessId)
  // Keyed by whichever id the settings page saved under — businesses.id for
  // every client today — so read both and prefer that one.
  const { data, error } = await supabase
    .from('monthly_report_settings')
    .select('business_id, cash_model')
    .in('business_id', ids.all)
  if (error) {
    if (isMissingColumn(error)) return { status: 'off' }
    throw error
  }
  const rows = (data ?? []) as Array<{ business_id: string; cash_model: unknown }>
  const row = rows.find((r) => r.business_id === ids.businessId) ?? rows[0]
  return parseCashModelConfig(row?.cash_model)
}
