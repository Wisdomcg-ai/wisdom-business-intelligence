/**
 * The database half of Where Did Our Money Go: the stored balance-sheet mirror,
 * the month's P&L from the same sync, the business's bank accounts and which of
 * its accounts Xero calls a credit card, handed to the pure deriveMoneyFlow.
 *
 * Shared by /api/monthly-report/money-flow and scripts/preview-pack.ts. Reads
 * only; the caller supplies the client and is responsible for authorisation.
 */
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import { deriveMoneyFlow, endOfMonth, priorMonth, type MoneyFlow } from './money-flow'
import { loadBankAccountIds } from './bank-accounts-load'

type Client = any

export interface MoneyFlowLoadResult {
  flow: MoneyFlow
  /** For the renderer's caption: the actual dates compared. */
  dates: { start: string; end: string }
}

/**
 * @param opts.bankAccountIds the bank set to use instead of the stored one —
 *   the preview harness passes its settings (with any --settings-override)
 *   through here. Omitted, the business's saved choice is read.
 */
export async function loadMoneyFlow(
  supabase: Client,
  businessId: string,
  periodMonth: string,
  opts: { bankAccountIds?: string[] | null } = {},
): Promise<MoneyFlowLoadResult> {
  const ids = await resolveBusinessProfileIds(supabase, businessId)

  // Only the two month-end keys are needed, but jsonb column selection is
  // all-or-nothing through PostgREST — the row count per business is small
  // (fleet max ~80 BS accounts), so read whole rows.
  const { data: rows, error } = await supabase
    .from('xero_bs_lines_wide_compat')
    .select('account_id, account_code, account_name, account_type, section, tenant_id, balances_by_date')
    .in('business_id', ids.all)
  if (error) throw error
  const bsRows = rows ?? []

  // The surplus comes from the P&L the SAME sync wrote, not the report
  // snapshot: the page's last line proves surplus + came from − spent = the
  // bank movement, and a snapshot generated before a late posting would make
  // that proof fail for a reason that has nothing to do with the cash. (Urban
  // Road's $853.80 credit note to Returns & Allowances and a ~$160 PayPal
  // receipt, both posted after Calxa ran, are in both halves of the mirror and
  // in neither of Calxa's.)
  const { data: plRows, error: plErr } = await supabase
    .from('xero_pl_lines_wide_compat')
    .select('tenant_id, account_type, monthly_values')
    .in('business_id', ids.all)
  if (plErr) throw plErr

  const bankAccountIds = opts.bankAccountIds !== undefined
    ? opts.bankAccountIds
    : await loadBankAccountIds(supabase, businessId)

  // Credit cards by the chart of accounts, scoped by tenant (xero_accounts'
  // business_id is businesses-space; the mirror is profile-space).
  const tenants = [...new Set(bsRows.map((r: { tenant_id: string }) => r.tenant_id).filter(Boolean))]
  let creditCardAccountIds: string[] = []
  if (tenants.length > 0) {
    const { data: cards, error: cardErr } = await supabase
      .from('xero_accounts')
      .select('xero_account_id')
      .in('tenant_id', tenants)
      .eq('bank_account_type', 'CREDITCARD')
    if (cardErr) throw cardErr
    creditCardAccountIds = (cards ?? []).map((c: { xero_account_id: string }) => c.xero_account_id)
  }

  const flow = deriveMoneyFlow(
    bsRows.map((r: any) => ({
      account_id: r.account_id ?? null,
      account_code: r.account_code ?? null,
      account_name: r.account_name,
      account_type: r.account_type,
      section: r.section,
      tenant_id: r.tenant_id,
      balances_by_date: r.balances_by_date ?? {},
    })),
    periodMonth,
    {
      bankAccountIds,
      creditCardAccountIds,
      plRows: (plRows ?? []).map((r: any) => ({
        tenant_id: r.tenant_id,
        account_type: r.account_type,
        monthly_values: r.monthly_values ?? {},
      })),
    },
  )

  return { flow, dates: { start: endOfMonth(priorMonth(periodMonth)), end: endOfMonth(periodMonth) } }
}
