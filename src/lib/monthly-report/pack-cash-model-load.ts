/**
 * The database half of cash model v2: the business's switch and settings, and
 * — only when it is on — the one Xero organisation's balance-sheet mirror,
 * P&L mirror, chart of accounts (for tax types) and pay runs, handed to the
 * pure buildPackCashModel.
 *
 * Shared by /api/monthly-report/cash-model and scripts/preview-pack.ts.
 * Reads only; the caller supplies the client and is responsible for
 * authorisation. Throws on a database error.
 *
 * Every read is scoped to this business's ids (resolveBusinessProfileIds) AND
 * its one active tenant: tenant ids are shared across business ids (IICT's
 * orgs sit under two), and xero_accounts is joined on tenant_id, never
 * business_id — its business_id is businesses-space, the mirrors are profile-
 * space.
 *
 * Refused, never pooled: a business with more than one active organisation
 * (Dragon Roofing, IICT) or one reporting in a foreign currency — the same
 * refusal, in the same words, as the money-flow page and the opening bank.
 */
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import { loadBankAccountIds } from './bank-accounts-load'
import { loadCashModelConfig } from './cash-model-config-load'
import { parseBankAccountIds } from './opening-bank'
import type { CashModelConfig, ParsedCashModelConfig } from './cash-model-config'
import type { CashModelInputs } from './pack-cash-model'
import { endOfMonth } from './money-flow'

type Client = any

export type CashModelLoadResult =
  | { status: 'off' }
  | { status: 'refused'; reason: string }
  | { status: 'ready'; config: CashModelConfig; inputs: CashModelInputs }

/**
 * @param opts.config the cash_model to use instead of the stored one — the
 *   preview harness passes --settings-override's through here. Omitted, the
 *   business's saved setting is read.
 * @param opts.bankAccountIds as for loadMoneyFlow.
 */
export async function loadPackCashModel(
  supabase: Client,
  businessId: string,
  reportMonth: string,
  opts: { config?: ParsedCashModelConfig; bankAccountIds?: string[] | null } = {},
): Promise<CashModelLoadResult> {
  const parsed = opts.config ?? (await loadCashModelConfig(supabase, businessId))
  if (parsed.status === 'off') return { status: 'off' }
  if (parsed.status === 'invalid') return { status: 'refused', reason: parsed.reason }

  const ids = await resolveBusinessProfileIds(supabase, businessId)

  const { data: conns, error: connErr } = await supabase
    .from('xero_connections')
    .select('tenant_id, functional_currency')
    .in('business_id', ids.all)
    .eq('is_active', true)
  if (connErr) throw connErr
  const tenants = [...new Map(
    ((conns ?? []) as Array<{ tenant_id: string | null; functional_currency: string | null }>)
      .filter((c) => !!c.tenant_id)
      .map((c) => [c.tenant_id as string, c]),
  ).values()]
  if (tenants.length === 0) return { status: 'refused', reason: 'There is no active Xero connection to read the cash from.' }
  if (tenants.length > 1) {
    return { status: 'refused', reason: 'This business has multiple Xero organisations — per-entity money flow arrives with the entity columns work.' }
  }
  if ((tenants[0].functional_currency || 'AUD').toUpperCase() !== 'AUD') {
    return { status: 'refused', reason: 'The Xero organisation reports in a foreign currency, which this cashflow cannot translate.' }
  }
  const tenant = tenants[0].tenant_id as string

  const { data: profile } = await supabase
    .from('business_profiles')
    .select('fiscal_year_start')
    .eq('id', ids.profileId)
    .maybeSingle()
  const fiscalYearStart = Number(profile?.fiscal_year_start ?? 7)

  const { data: bsRows, error: bsErr } = await supabase
    .from('xero_bs_lines_wide_compat')
    .select('account_id, account_code, account_name, account_type, section, tenant_id, balances_by_date')
    .in('business_id', ids.all)
    .eq('tenant_id', tenant)
  if (bsErr) throw bsErr

  const { data: plRows, error: plErr } = await supabase
    .from('xero_pl_lines_wide_compat')
    .select('tenant_id, account_id, account_code, account_name, account_type, monthly_values')
    .in('business_id', ids.all)
    .eq('tenant_id', tenant)
  if (plErr) throw plErr

  const { data: accounts, error: accErr } = await supabase
    .from('xero_accounts')
    .select('xero_account_id, account_code, account_name, tax_type, bank_account_type, xero_class')
    .eq('tenant_id', tenant)
  if (accErr) throw accErr

  // The fiscal year's pay runs, to the report month's end. POSTED only: a
  // draft run has paid nobody.
  const { data: payRuns, error: runErr } = await supabase
    .from('xero_pay_runs')
    .select('payment_date, wages, tax, super_amount, status')
    .in('business_id', ids.all)
    .eq('tenant_id', tenant)
    .gte('payment_date', `${Number(reportMonth.slice(0, 4)) - 1}-${reportMonth.slice(5, 7)}-01`)
    .lte('payment_date', endOfMonth(reportMonth))
  if (runErr) throw runErr

  const bankAccountIds = parseBankAccountIds(opts.bankAccountIds !== undefined
    ? opts.bankAccountIds
    : await loadBankAccountIds(supabase, businessId))

  const accountRows = (accounts ?? []) as Array<{ xero_account_id: string; account_code: string | null; account_name: string; tax_type: string | null; bank_account_type: string | null; xero_class?: string | null }>
  return {
    status: 'ready',
    config: parsed.config,
    inputs: {
      bsRows: ((bsRows ?? []) as any[]).map((r) => ({
        account_id: r.account_id ?? null,
        account_code: r.account_code ?? null,
        account_name: r.account_name,
        account_type: r.account_type,
        section: r.section,
        tenant_id: r.tenant_id,
        balances_by_date: r.balances_by_date ?? {},
      })),
      plRows: ((plRows ?? []) as any[]).map((r) => ({
        tenant_id: r.tenant_id,
        account_id: r.account_id ?? null,
        account_code: r.account_code ?? null,
        account_name: r.account_name,
        account_type: r.account_type,
        monthly_values: r.monthly_values ?? {},
      })),
      accounts: accountRows.map(({ xero_account_id, account_code, account_name, tax_type, xero_class }) => ({ xero_account_id, account_code, account_name, tax_type, xero_class: xero_class ?? null })),
      payRuns: ((payRuns ?? []) as any[])
        .filter((r) => String(r.status ?? '').toUpperCase() === 'POSTED')
        .map((r) => ({ payment_date: String(r.payment_date), wages: r.wages, tax: r.tax, super_amount: r.super_amount })),
      bankAccountIds,
      creditCardAccountIds: accountRows.filter((a) => a.bank_account_type === 'CREDITCARD').map((a) => a.xero_account_id),
      fiscalYearStart,
    },
  }
}
