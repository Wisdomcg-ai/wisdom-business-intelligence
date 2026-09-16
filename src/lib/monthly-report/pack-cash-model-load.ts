/**
 * The database half of cash model v2: the business's switch and settings,
 * and — only when it is on — the balance-sheet mirror, P&L mirror, chart of
 * accounts (for tax types) and pay runs for every one of its active Xero
 * organisations, handed to the pure buildPackCashModel.
 *
 * Shared by /api/monthly-report/cash-model and scripts/preview-pack.ts.
 * Reads only; the caller supplies the client and is responsible for
 * authorisation. Throws on a database error.
 *
 * Every read is scoped to this business's ids (resolveBusinessProfileIds) AND
 * its active tenants: tenant ids are shared across business ids (IICT's orgs
 * sit under two), and xero_accounts is joined on tenant_id, never
 * business_id — its business_id is businesses-space, the mirrors are profile-
 * space.
 *
 * ONE organisation: exactly the read this always was — no organisation list,
 * no rates, byte-identical to before P9.
 *
 * MORE THAN ONE (Dragon Roofing, IICT): every organisation's rows are
 * translated into the presentation currency (multi-org-consolidate.ts — the
 * same closing/average-rate convention P8's consolidated balance sheet uses)
 * and relabelled onto one virtual tenant, so buildPackCashModel — which knows
 * nothing about consolidation — runs over the whole business exactly as it
 * runs over one organisation. The debtor, creditor, GST, PAYG and super
 * account ids in cash_model may then simply list BOTH organisations' Xero
 * AccountIDs together (balanceOf sums by id, not by tenant), the same way
 * wages_codes already lists account CODES that can repeat across
 * organisations. A rate this business needs and does not have refuses,
 * naming the organisation and the date or month.
 */
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import { loadBankAccountIds } from './bank-accounts-load'
import { loadCashModelConfig } from './cash-model-config-load'
import { parseBankAccountIds } from './opening-bank'
import type { CashModelConfig, ParsedCashModelConfig } from './cash-model-config'
import { cashModelNeededBalanceSheetDates, type CashModelInputs, type CashModelPayRun } from './pack-cash-model'
import { endOfMonth } from './money-flow'
import {
  buildRateMaps,
  consolidateBalanceRows,
  consolidateFlowRows,
  currencyOf,
  pairOf,
  type ConsolidationOrg,
  type FxRateLike,
} from './multi-org-consolidate'

type Client = any

/** PostgREST's row cap. A read that comes back this full may have been cut short. */
const ROW_CAP = 1000

export type CashModelLoadResult =
  | { status: 'off' }
  | { status: 'refused'; reason: string }
  | { status: 'ready'; config: CashModelConfig; inputs: CashModelInputs }

interface ConnectionRow {
  tenant_id: string | null
  tenant_name?: string | null
  display_name?: string | null
  display_order?: number | null
  functional_currency: string | null
}

function organisationsOf(rows: readonly ConnectionRow[]): ConsolidationOrg[] {
  const seen = new Set<string>()
  const distinct = rows.filter((c) => {
    if (!c.tenant_id || seen.has(c.tenant_id)) return false
    seen.add(c.tenant_id)
    return true
  })
  return distinct
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (a.c.display_order ?? 0) - (b.c.display_order ?? 0) || a.i - b.i)
    .map(({ c }) => ({
      tenant_id: c.tenant_id as string,
      name: c.display_name || c.tenant_name || (c.tenant_id as string),
      functional_currency: c.functional_currency,
    }))
}

/**
 * wages_codes and super.expense_codes are Xero account CODES, matched
 * (bookedTo, pack-cash-model.ts) across the WHOLE consolidated ledger with no
 * tenant awareness at all — the one cash_model field that works this way,
 * because a code can legitimately repeat across a coach's organisations for
 * the same kind of account. It is not guaranteed to: DRG-40 found 26 of
 * Dragon Roofing and Easy Hail Claim's 74 shared codes name different
 * accounts. A code this business's own organisations disagree about — one
 * calls it wages, another calls it something else entirely — is refused
 * here, naming both, before anything is merged and the distinction is lost.
 */
export function payrollCodeCollisions(
  accounts: readonly { tenant_id: string; account_code: string | null; account_name: string }[],
  organisations: readonly ConsolidationOrg[],
  codes: readonly { role: string; code: string }[],
): string | null {
  const norm = (s: string) => s.trim().toLowerCase()
  const nameByTenant = new Map<string, Map<string, string>>()
  for (const a of accounts) {
    if (!a.account_code) continue
    const code = norm(a.account_code)
    if (!nameByTenant.has(code)) nameByTenant.set(code, new Map())
    const byTenant = nameByTenant.get(code)!
    if (!byTenant.has(a.tenant_id)) byTenant.set(a.tenant_id, norm(a.account_name))
  }
  const orgName = new Map(organisations.map((o) => [o.tenant_id, o.name]))
  const problems: string[] = []
  const seenCodes = new Set<string>()
  for (const { role, code } of codes) {
    const key = `${role}::${norm(code)}`
    if (seenCodes.has(key)) continue
    seenCodes.add(key)
    const byTenant = nameByTenant.get(norm(code))
    if (!byTenant || byTenant.size < 2) continue
    if (new Set(byTenant.values()).size < 2) continue
    const detail = [...byTenant.entries()].map(([t, name]) => `${orgName.get(t) ?? t} calls it "${name}"`).join(', ')
    problems.push(`${role} ${code} names a different account in more than one organisation (${detail})`)
  }
  if (problems.length === 0) return null
  return `the cash model's account codes are not safe to share across these organisations (${problems.join('; ')}) — list each organisation's own AccountID instead, or fix the code in Xero`
}

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
    .select('tenant_id, tenant_name, display_name, display_order, functional_currency')
    .in('business_id', ids.all)
    .eq('is_active', true)
  if (connErr) throw connErr
  const organisations = organisationsOf((conns ?? []) as ConnectionRow[])
  if (organisations.length === 0) return { status: 'refused', reason: 'There is no active Xero connection to read the cash from.' }

  const { data: profile } = await supabase
    .from('business_profiles')
    .select('fiscal_year_start')
    .eq('id', ids.profileId)
    .maybeSingle()
  const fiscalYearStart = Number(profile?.fiscal_year_start ?? 7)

  const bankAccountIds = parseBankAccountIds(opts.bankAccountIds !== undefined
    ? opts.bankAccountIds
    : await loadBankAccountIds(supabase, businessId))

  if (organisations.length === 1) {
    if (currencyOf(organisations[0]) !== 'AUD') {
      return { status: 'refused', reason: 'The Xero organisation reports in a foreign currency, which this cashflow cannot translate.' }
    }
    return loadSingleTenantInputs(supabase, ids.all, organisations[0].tenant_id, reportMonth, parsed.config, bankAccountIds, fiscalYearStart)
  }

  return loadMultiTenantInputs(supabase, ids.all, organisations, reportMonth, parsed.config, bankAccountIds, fiscalYearStart)
}

async function loadSingleTenantInputs(
  supabase: Client,
  businessIds: string[],
  tenant: string,
  reportMonth: string,
  config: CashModelConfig,
  bankAccountIds: string[] | null,
  fiscalYearStart: number,
): Promise<CashModelLoadResult> {
  const { data: bsRows, error: bsErr } = await supabase
    .from('xero_bs_lines_wide_compat')
    .select('account_id, account_code, account_name, account_type, section, tenant_id, balances_by_date')
    .in('business_id', businessIds)
    .eq('tenant_id', tenant)
  if (bsErr) throw bsErr

  const { data: plRows, error: plErr } = await supabase
    .from('xero_pl_lines_wide_compat')
    .select('tenant_id, account_id, account_code, account_name, account_type, monthly_values')
    .in('business_id', businessIds)
    .eq('tenant_id', tenant)
  if (plErr) throw plErr

  const { data: accounts, error: accErr } = await supabase
    .from('xero_accounts')
    .select('xero_account_id, account_code, account_name, tax_type, bank_account_type, xero_class, xero_type')
    .eq('tenant_id', tenant)
  if (accErr) throw accErr

  // The fiscal year's pay runs, to the report month's end. POSTED only: a
  // draft run has paid nobody.
  const { data: payRuns, error: runErr } = await supabase
    .from('xero_pay_runs')
    .select('payment_date, wages, tax, super_amount, status')
    .in('business_id', businessIds)
    .eq('tenant_id', tenant)
    .gte('payment_date', `${Number(reportMonth.slice(0, 4)) - 1}-${reportMonth.slice(5, 7)}-01`)
    .lte('payment_date', endOfMonth(reportMonth))
  if (runErr) throw runErr

  const accountRows = (accounts ?? []) as Array<{ xero_account_id: string; account_code: string | null; account_name: string; tax_type: string | null; bank_account_type: string | null; xero_class?: string | null; xero_type?: string | null }>
  return {
    status: 'ready',
    config,
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
      accounts: accountRows.map(({ xero_account_id, account_code, account_name, tax_type, xero_class, xero_type }) => ({ xero_account_id, account_code, account_name, tax_type, xero_class: xero_class ?? null, xero_type: xero_type ?? null })),
      payRuns: ((payRuns ?? []) as any[])
        .filter((r) => String(r.status ?? '').toUpperCase() === 'POSTED')
        .map((r) => ({ payment_date: String(r.payment_date), wages: r.wages, tax: r.tax, super_amount: r.super_amount })),
      bankAccountIds,
      creditCardAccountIds: accountRows.filter((a) => a.bank_account_type === 'CREDITCARD').map((a) => a.xero_account_id),
      fiscalYearStart,
    },
  }
}

async function loadMultiTenantInputs(
  supabase: Client,
  businessIds: string[],
  organisations: ConsolidationOrg[],
  reportMonth: string,
  config: CashModelConfig,
  bankAccountIds: string[] | null,
  fiscalYearStart: number,
): Promise<CashModelLoadResult> {
  const tenants = organisations.map((o) => o.tenant_id)

  const { data: bsRows, error: bsErr } = await supabase
    .from('xero_bs_lines_wide_compat')
    .select('account_id, account_code, account_name, account_type, section, tenant_id, balances_by_date')
    .in('business_id', businessIds)
    .in('tenant_id', tenants)
  if (bsErr) throw bsErr

  const { data: plRows, error: plErr } = await supabase
    .from('xero_pl_lines_wide_compat')
    .select('tenant_id, account_id, account_code, account_name, account_type, monthly_values')
    .in('business_id', businessIds)
    .in('tenant_id', tenants)
  if (plErr) throw plErr

  // tenant_id too: wages_codes and super.expense_codes match by Xero account
  // CODE, not AccountID, across the whole consolidated ledger (bookedTo,
  // pack-cash-model.ts) — the only cash_model fields that do. Two
  // organisations can and do reuse a code for two different accounts (DRG-40:
  // 26 of Dragon and Easy Hail's 74 shared codes name different accounts), so
  // that has to be checked per organisation, before anything is merged onto
  // one virtual tenant and the distinction is lost for good.
  const { data: accounts, error: accErr } = await supabase
    .from('xero_accounts')
    .select('tenant_id, xero_account_id, account_code, account_name, tax_type, bank_account_type, xero_class, xero_type')
    .in('tenant_id', tenants)
  if (accErr) throw accErr

  const codeCollision = payrollCodeCollisions(
    (accounts ?? []) as Array<{ tenant_id: string; account_code: string | null; account_name: string }>,
    organisations,
    [
      ...config.wages_codes.map((code) => ({ role: 'wages_codes', code })),
      ...config.super.expense_codes.map((code) => ({ role: 'super.expense_codes', code })),
    ],
  )
  if (codeCollision) return { status: 'refused', reason: codeCollision }

  // The exact dates this build reads — the fiscal-year window plus GST's own
  // settled-end look-back (cashModelNeededBalanceSheetDates) — never every
  // date any organisation's mirror has ever carried: an unfiltered
  // xero_bs_lines_wide_compat read spans a business's whole synced history,
  // which for one organisation can predate a same-currency sibling by years
  // and a foreign one by longer than fx_rates itself goes back (IICT-50).
  const neededDates = cashModelNeededBalanceSheetDates(reportMonth, fiscalYearStart, config)

  const foreignPairs = [...new Set(organisations.filter((o) => currencyOf(o) !== 'AUD').map((o) => pairOf(o)))]
  let rates: FxRateLike[] = []
  if (foreignPairs.length > 0) {
    // Bounded to what this build could need: the balance-sheet dates above,
    // and every pay run's own translation window (payRunFrom below) — never
    // an unfiltered read of the whole currency pair's history, which grows
    // without bound and, unordered, PostgREST's cap can return the OLDEST
    // rows first rather than the ones this report actually wants.
    const payRunFrom = `${Number(reportMonth.slice(0, 4)) - 1}-${reportMonth.slice(5, 7)}-01`
    const rateFrom = payRunFrom < neededDates[0] ? payRunFrom : neededDates[0]
    const rateTo = neededDates[neededDates.length - 1]
    const { data, error: rateErr } = await supabase
      .from('fx_rates')
      .select('currency_pair, rate_type, period, rate')
      .in('currency_pair', foreignPairs)
      .gte('period', `${rateFrom.slice(0, 7)}-01`)
      .lte('period', rateTo)
      .limit(ROW_CAP)
    if (rateErr) throw rateErr
    rates = (data ?? []) as FxRateLike[]
  }

  const bsMapped = ((bsRows ?? []) as any[]).map((r) => ({
    account_id: r.account_id ?? null,
    account_code: r.account_code ?? null,
    account_name: r.account_name,
    account_type: r.account_type,
    section: r.section,
    tenant_id: r.tenant_id,
    balances_by_date: r.balances_by_date ?? {},
  }))

  // Every organisation needs its own balance sheet at every date this build
  // reads before anything is merged: without this, an organisation whose
  // sync stalled for one of those months vanishes into the combined ledger
  // for that month alone, contributing a silent $0 with no sign anything was
  // missing — the same trap money-flow.ts's own per-organisation check
  // guards against for Where Did Our Money Go.
  for (const org of organisations) {
    for (const d of neededDates) {
      const hasRow = bsMapped.some((r) => r.tenant_id === org.tenant_id && r.balances_by_date[d] !== undefined && r.balances_by_date[d] !== null)
      if (!hasRow) return { status: 'refused', reason: `No stored balance sheet for ${org.name} at ${d} — sync may not have reached it.` }
    }
  }

  const bsConsolidated = consolidateBalanceRows(bsMapped, organisations, rates, neededDates)
  if (!bsConsolidated.ok) return { status: 'refused', reason: bsConsolidated.reason }

  const plMapped = ((plRows ?? []) as any[]).map((r) => ({
    tenant_id: r.tenant_id,
    account_id: r.account_id ?? null,
    account_code: r.account_code ?? null,
    account_name: r.account_name,
    account_type: r.account_type,
    monthly_values: r.monthly_values ?? {},
  }))
  const plConsolidated = consolidateFlowRows(plMapped, organisations, rates)
  if (!plConsolidated.ok) return { status: 'refused', reason: plConsolidated.reason }

  // Pay runs carry no tenant_id of their own, so a foreign organisation's must
  // be translated (at the payment month's average rate) before they are
  // merged, or attribution — and the rate to use — is lost for good.
  const { average } = buildRateMaps(rates)
  let payRuns: CashModelPayRun[] = []
  const missingPayRunRate: string[] = []
  for (const org of organisations) {
    const { data: runs, error: runErr } = await supabase
      .from('xero_pay_runs')
      .select('payment_date, wages, tax, super_amount, status')
      .in('business_id', businessIds)
      .eq('tenant_id', org.tenant_id)
      .gte('payment_date', `${Number(reportMonth.slice(0, 4)) - 1}-${reportMonth.slice(5, 7)}-01`)
      .lte('payment_date', endOfMonth(reportMonth))
    if (runErr) throw runErr
    const posted = ((runs ?? []) as any[]).filter((r) => String(r.status ?? '').toUpperCase() === 'POSTED')
    const foreign = currencyOf(org) !== 'AUD'
    for (const r of posted) {
      let rate = 1
      if (foreign) {
        const month = String(r.payment_date ?? '').slice(0, 7)
        const found = average.get(`${pairOf(org)}@${month}`)
        if (found === undefined) { missingPayRunRate.push(`${pairOf(org)}@${month}`); continue }
        rate = found
      }
      payRuns.push({
        payment_date: String(r.payment_date),
        wages: Number(r.wages ?? 0) * rate,
        tax: Number(r.tax ?? 0) * rate,
        super_amount: Number(r.super_amount ?? 0) * rate,
      })
    }
  }
  if (missingPayRunRate.length > 0) {
    const byPair = new Map<string, string[]>()
    for (const k of [...new Set(missingPayRunRate)]) {
      const [pair, month] = k.split('@')
      byPair.set(pair, [...(byPair.get(pair) ?? []), month])
    }
    const clauses = [...byPair.entries()].map(([pair, ms]) => `${pair} monthly average rate is stored for ${ms.sort().join(', ')}`)
    return { status: 'refused', reason: `no ${clauses.join('; no ')}` }
  }

  const accountRows = (accounts ?? []) as Array<{ xero_account_id: string; account_code: string | null; account_name: string; tax_type: string | null; bank_account_type: string | null; xero_class?: string | null; xero_type?: string | null }>

  return {
    status: 'ready',
    config,
    inputs: {
      bsRows: bsConsolidated.rows,
      plRows: plConsolidated.rows,
      accounts: accountRows.map(({ xero_account_id, account_code, account_name, tax_type, xero_class, xero_type }) => ({ xero_account_id, account_code, account_name, tax_type, xero_class: xero_class ?? null, xero_type: xero_type ?? null })),
      payRuns,
      bankAccountIds,
      creditCardAccountIds: accountRows.filter((a) => a.bank_account_type === 'CREDITCARD').map((a) => a.xero_account_id),
      fiscalYearStart,
    },
  }
}
