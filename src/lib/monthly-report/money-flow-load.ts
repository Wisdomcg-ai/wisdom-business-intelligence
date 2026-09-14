/**
 * The database half of Where Did Our Money Go: the stored balance-sheet mirror
 * handed to the pure deriveMoneyFlow.
 *
 * Shared by /api/monthly-report/money-flow and scripts/preview-pack.ts. Reads
 * only; the caller supplies the client and is responsible for authorisation.
 */
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import { deriveMoneyFlow, endOfMonth, priorMonth, type MoneyFlow } from './money-flow'

type Client = any

export interface MoneyFlowLoadResult {
  flow: MoneyFlow
  /** For the renderer's caption: the actual dates compared. */
  dates: { start: string; end: string }
}

export async function loadMoneyFlow(supabase: Client, businessId: string, periodMonth: string): Promise<MoneyFlowLoadResult> {
  const ids = await resolveBusinessProfileIds(supabase, businessId)

  // Only the two month-end keys are needed, but jsonb column selection is
  // all-or-nothing through PostgREST — the row count per business is small
  // (fleet max ~80 BS accounts), so read whole rows.
  const { data: rows, error } = await supabase
    .from('xero_bs_lines_wide_compat')
    .select('account_name, account_type, section, tenant_id, balances_by_date')
    .in('business_id', ids.all)
  if (error) throw error

  const flow = deriveMoneyFlow(
    (rows ?? []).map((r: any) => ({
      account_name: r.account_name,
      account_type: r.account_type,
      section: r.section,
      tenant_id: r.tenant_id,
      balances_by_date: r.balances_by_date ?? {},
    })),
    periodMonth,
  )

  return { flow, dates: { start: endOfMonth(priorMonth(periodMonth)), end: endOfMonth(periodMonth) } }
}
