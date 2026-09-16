/**
 * The database half of Where Did Our Money Go: the stored balance-sheet mirror,
 * the month's P&L from the same sync, the business's bank accounts and which of
 * its accounts Xero calls a credit card, handed to the pure deriveMoneyFlow.
 *
 * Shared by /api/monthly-report/money-flow and scripts/preview-pack.ts. Reads
 * only; the caller supplies the client and is responsible for authorisation.
 */
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import { deriveConsolidatedMoneyFlow, deriveMoneyFlow, endOfMonth, priorMonth, type MoneyFlow, type MoneyFlowOrganisation } from './money-flow'
import { loadBankAccountIds } from './bank-accounts-load'
import type { FxRateLike } from './multi-org-consolidate'

type Client = any

/** PostgREST's row cap. A read that comes back this full may have been cut short. */
const ROW_CAP = 1000

/**
 * The business's active Xero organisations, one per tenant (a connection can
 * be read under more than one business id — IICT's sat under two), in display
 * order, named for the "Added together" note.
 */
async function loadActiveOrganisations(supabase: Client, businessIds: string[]): Promise<MoneyFlowOrganisation[]> {
  const { data, error } = await supabase
    .from('xero_connections')
    .select('tenant_id, tenant_name, display_name, display_order, functional_currency, is_active')
    .in('business_id', businessIds)
    .eq('is_active', true)
  if (error) throw error
  const seen = new Set<string>()
  const rows = ((data ?? []) as Array<{
    tenant_id: string | null
    tenant_name: string | null
    display_name: string | null
    display_order: number | null
    functional_currency: string | null
  }>).filter((c) => {
    if (!c.tenant_id || seen.has(c.tenant_id)) return false
    seen.add(c.tenant_id)
    return true
  })
  return rows
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (a.c.display_order ?? 0) - (b.c.display_order ?? 0) || a.i - b.i)
    .map(({ c }) => ({
      tenant_id: c.tenant_id as string,
      name: c.display_name || c.tenant_name || (c.tenant_id as string),
      functional_currency: c.functional_currency,
    }))
}

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

  const mappedBsRows = bsRows.map((r: any) => ({
    account_id: r.account_id ?? null,
    account_code: r.account_code ?? null,
    account_name: r.account_name,
    account_type: r.account_type,
    section: r.section,
    tenant_id: r.tenant_id,
    balances_by_date: r.balances_by_date ?? {},
  }))
  const mappedPlRows = (plRows ?? []).map((r: any) => ({
    tenant_id: r.tenant_id,
    account_type: r.account_type,
    monthly_values: r.monthly_values ?? {},
  }))

  // Single-organisation businesses (every client but Dragon Roofing and IICT
  // Group today) take exactly the path this always took — no organisations
  // read, no rates read, byte-identical output.
  if (tenants.length <= 1) {
    const flow = deriveMoneyFlow(mappedBsRows, periodMonth, {
      bankAccountIds,
      creditCardAccountIds,
      plRows: mappedPlRows,
    })
    return { flow, dates: { start: endOfMonth(priorMonth(periodMonth)), end: endOfMonth(periodMonth) } }
  }

  // P9 — more than one Xero organisation. Scoped to the business's ACTIVE
  // connections (never a stale tenant whose rows are just old data left
  // behind, and never IICT Group Pty Ltd, gone since 10 Sep 2026): rows for a
  // tenant outside that set are excluded explicitly here, rather than left for
  // deriveConsolidatedMoneyFlow to silently drop.
  const organisations = await loadActiveOrganisations(supabase, ids.all)
  const activeIds = new Set(organisations.map((o) => o.tenant_id))
  const scopedBsRows = mappedBsRows.filter((r: { tenant_id: string }) => activeIds.has(r.tenant_id))
  const scopedPlRows = mappedPlRows.filter((r: { tenant_id: string }) => activeIds.has(r.tenant_id))

  const foreignPairs = [...new Set(
    organisations
      .filter((o) => (o.functional_currency ?? 'AUD').trim().toUpperCase() !== 'AUD')
      .map((o) => `${(o.functional_currency ?? '').trim().toUpperCase()}/AUD`),
  )]
  let rates: FxRateLike[] = []
  if (foreignPairs.length > 0) {
    const { data, error: rateErr } = await supabase
      .from('fx_rates')
      .select('currency_pair, rate_type, period, rate')
      .in('currency_pair', foreignPairs)
      .limit(ROW_CAP)
    if (rateErr) throw rateErr
    rates = (data ?? []) as FxRateLike[]
  }

  const flow = deriveConsolidatedMoneyFlow(scopedBsRows, periodMonth, organisations, {
    bankAccountIds,
    creditCardAccountIds,
    plRows: scopedPlRows,
    rates,
  })

  return { flow, dates: { start: endOfMonth(priorMonth(periodMonth)), end: endOfMonth(periodMonth) } }
}
