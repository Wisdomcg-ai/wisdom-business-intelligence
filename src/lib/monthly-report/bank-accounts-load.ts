/**
 * The database half of "which accounts are bank": the business's chosen list,
 * monthly_report_settings.bank_account_ids, parsed by parseBankAccountIds.
 *
 * Shared by money-flow-load and opening-bank-load so the money-flow page and
 * the cashflow page's opening balance can never read two different bank sets.
 * Reads only; the caller supplies the client and is responsible for
 * authorisation.
 *
 * The column arrives by a migration applied by hand after merge, so this code
 * reaches prod first. A schema that does not have it yet answers exactly as a
 * business that has not chosen: null, every Bank-section asset account — which
 * is what every pack printed before the column existed. Any other database
 * error throws, because guessing the bank set is how a page ends up reconciling
 * to a figure nobody asked for.
 */
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import { parseBankAccountIds } from './opening-bank'

type Client = any

/** Postgres undefined_column, or PostgREST's stale schema cache for a column added moments ago. */
function isMissingColumn(error: { code?: string } | null | undefined): boolean {
  return error?.code === '42703' || error?.code === 'PGRST204'
}

export async function loadBankAccountIds(supabase: Client, businessId: string): Promise<string[] | null> {
  const ids = await resolveBusinessProfileIds(supabase, businessId)

  // The settings row is keyed by whichever id the settings page saved under —
  // businesses.id for every client today — so read both and prefer that one.
  const { data, error } = await supabase
    .from('monthly_report_settings')
    .select('business_id, bank_account_ids')
    .in('business_id', ids.all)
  if (error) {
    if (isMissingColumn(error)) return null
    throw error
  }
  const rows = (data ?? []) as Array<{ business_id: string; bank_account_ids: unknown }>
  const row = rows.find((r) => r.business_id === ids.businessId) ?? rows[0]
  return parseBankAccountIds(row?.bank_account_ids)
}
