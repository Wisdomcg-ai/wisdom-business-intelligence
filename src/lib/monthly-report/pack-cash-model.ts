/**
 * The pack's cashflow model v2: one CashflowForecastData for the fiscal year,
 * feeding both the chart and the table.
 *
 *   fiscal-year start … report month   ACTUAL cash (pack-cash-actuals), each
 *                                      month tied to the bank movement
 *   report month + 1 … fiscal-year end the APPROVED budget, run through the
 *                                      engine's v2 options: debtor and
 *                                      creditor days, GST by tax type, the
 *                                      real opening debtors, creditors and ATO
 *                                      balances paid on their schedules
 *
 * The engine opens on the bank at the report-month end — the last actual
 * month's closing balance, which is the balance-sheet mirror's — so the first
 * budget month's Bank at Beginning is the figure Where Did Our Money Go closes
 * on (Urban Road, 31 Aug 2026: $117,724.85, Calxa's "Bank at Beginning" for
 * September).
 *
 * Opt-in per business (monthly_report_settings.cash_model). Without it every
 * client prints v1 unchanged.
 *
 * Pure — pack-cash-model-load does the reading.
 */
import type {
  CashflowAssumptions,
  CashflowForecastData,
  CashflowForecastMonth,
  CashflowLine,
  FinancialForecast,
  PLLine,
} from '@/app/finances/forecast/types'
import type { FullYearReport } from '@/app/finances/monthly-report/types'
import { buildTotals, generateCashflowForecast, getDefaultCashflowAssumptions } from '@/lib/cashflow/engine'
import { dueMonthKey } from '@/lib/cashflow/schedules'
import { cashModelSchedule, gstRateForTaxType, type CashModelConfig } from './cash-model-config'
import { deriveMoneyFlow, endOfMonth, priorMonth, summariseMonthPl, type BsRowInput } from './money-flow'
import { openingBalanceDate } from './opening-bank'
import { buildPackCashflowLines } from './pack-cashflow-lines'
import { deriveActualCashMonth, UNEXPLAINED_LABEL, type ActualCashReconciliation, type CashLineLabel, type CashPlRow, type MonthPayslips } from './pack-cash-actuals'
import { packExpenseGroupOrder } from './pack-cashflow'
import { packMonthYear } from '@/app/finances/monthly-report/services/pack-style'

export interface CashModelAccount {
  xero_account_id: string
  account_code: string | null
  account_name: string
  tax_type: string | null
}

export interface CashModelPayRun {
  payment_date: string
  wages: number | string
  tax: number | string
  super_amount: number | string
}

/** Everything the model reads, for ONE Xero organisation (the loader refuses more). */
export interface CashModelInputs {
  bsRows: BsRowInput[]
  plRows: CashPlRow[]
  accounts: CashModelAccount[]
  payRuns: CashModelPayRun[]
  bankAccountIds: string[] | null
  creditCardAccountIds: string[]
  /** business_profiles.fiscal_year_start (1-12). */
  fiscalYearStart: number
}

export type CashTerms =
  | {
      status: 'derived'
      dso_days: number
      dpo_days: number
      /** What the days were measured on, for the basis line and the preflight. */
      inputs: { debtors: number; creditors: number; billings: number; purchases: number; days: number; months: string[] }
    }
  | { status: 'unavailable'; reason: string }

export type PackCashModel =
  | {
      status: 'ready'
      cashflow: CashflowForecastData
      basis: string
      reconciliation: ActualCashReconciliation[]
      /** For the preflight and the harness: said to the coach, not printed in the pack. */
      warnings: string[]
    }
  | { status: 'refused'; reason: string }

const round2 = (v: number) => Math.round(v * 100) / 100 || 0
const num = (v: number | string | null | undefined) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}
const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

export function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

function monthsBetween(first: string, last: string): string[] {
  const out: string[] = []
  for (let m = first; m <= last && out.length < 240; m = nextMonth(m)) out.push(m)
  return out
}

function daysIn(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** '2026-06-30' → '30 Jun 2026', by string. */
function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${packMonthYear(`${y}-${String(m).padStart(2, '0')}`).replace(/ \d+$/, '')} ${y}`
}

function fmtDollars(v: number): string {
  const r = Math.round(v)
  return `${r < 0 ? '-' : ''}$${Math.abs(r).toLocaleString('en-AU')}`
}

/**
 * The GST rate of an account, from xero_accounts by AccountID, then code, then
 * name, through the config's overrides. Null when the tax type is unknown.
 */
export function taxRateLookup(accounts: CashModelAccount[], overrides: Record<string, number>) {
  const byId = new Map<string, string | null>()
  const byCode = new Map<string, string | null>()
  const byName = new Map<string, string | null>()
  for (const a of accounts) {
    if (a.xero_account_id) byId.set(norm(a.xero_account_id), a.tax_type)
    if (a.account_code) byCode.set(norm(a.account_code), a.tax_type)
    byName.set(norm(a.account_name), a.tax_type)
  }
  return (r: { account_id?: string | null; account_code?: string | null; account_name: string }): number | null => {
    const type = (r.account_id ? byId.get(norm(r.account_id)) : undefined)
      ?? (r.account_code ? byCode.get(norm(r.account_code)) : undefined)
      ?? byName.get(norm(r.account_name))
    return gstRateForTaxType(type ?? null, overrides)
  }
}

/** Pay runs summed by the month they were paid in. */
export function payslipsByMonth(runs: CashModelPayRun[]): Record<string, MonthPayslips> {
  const out: Record<string, MonthPayslips> = {}
  for (const r of runs) {
    const m = String(r.payment_date ?? '').slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(m)) continue
    const o = (out[m] ??= { wages: 0, tax: 0, super_amount: 0, runs: 0 })
    o.wages += num(r.wages)
    o.tax += num(r.tax)
    o.super_amount += num(r.super_amount)
    o.runs += 1
  }
  return out
}

/** Σ of the named accounts' balances at `date`, as the mirror stores them. Null when none is on the sheet that day. */
function balanceOf(rows: BsRowInput[], ids: readonly string[], date: string): number | null {
  const wanted = new Set(ids.map(norm))
  let found = false
  let total = 0
  for (const r of rows) {
    if (!wanted.has(norm(r.account_id))) continue
    const v = r.balances_by_date?.[date]
    if (v === undefined || v === null) continue
    found = true
    total += num(v)
  }
  return found ? round2(total) : null
}

/** A sheet exists at `date` when any row carries it (an account at $0 is left off). */
function sheetExists(rows: BsRowInput[], date: string): boolean {
  return rows.some((r) => r.balances_by_date?.[date] !== undefined)
}

/**
 * Debtor and creditor days from the client's own ledger: the report-month-end
 * balance over the trailing three months' GST-inclusive billings (or
 * purchases, Cost of Sales and operating expenses excluding payroll) per day.
 * Urban Road at 31 Aug 2026: DSO 278,428.06 ÷ (1,749,755.85 / 92) = 14.6 → 15;
 * DPO 380,205.08 ÷ (1,322,140.49 / 92) = 26.5 → 27. Calxa used 19 and 29.
 * Rounded to whole days, never clamped.
 */
export function deriveCashTerms(inputs: Pick<CashModelInputs, 'bsRows' | 'plRows' | 'accounts'>, reportMonth: string, cfg: CashModelConfig): CashTerms {
  const months = [priorMonth(priorMonth(reportMonth)), priorMonth(reportMonth), reportMonth]
  const missing = months.filter((m) => summariseMonthPl(inputs.plRows, m) === null)
  if (missing.length > 0) {
    return { status: 'unavailable', reason: `debtor and creditor days need three synced months of P&L; ${missing.map(packMonthYear).join(', ')} ${missing.length === 1 ? 'is' : 'are'} missing` }
  }
  const end = endOfMonth(reportMonth)
  const debtors = balanceOf(inputs.bsRows, cfg.debtors_account_ids, end)
  const creditors = balanceOf(inputs.bsRows, cfg.creditors_account_ids, end)
  if (debtors === null || creditors === null) {
    return { status: 'unavailable', reason: `the debtors or creditors account is not on the balance sheet at ${fmtDate(end)}` }
  }
  const rate = taxRateLookup(inputs.accounts, cfg.gst.tax_rate_overrides)
  const payroll = new Set([...cfg.wages_codes, ...cfg.super.expense_codes].map(norm))
  let billings = 0
  let purchases = 0
  for (const r of inputs.plRows) {
    for (const m of months) {
      const v = num(r.monthly_values?.[m])
      if (v === 0) continue
      const gross = v * (1 + (rate(r) ?? 0))
      if (r.account_type === 'revenue') billings += gross
      else if (['cogs', 'opex', 'other_expense'].includes(r.account_type) && !(r.account_code && payroll.has(norm(r.account_code)))) purchases += gross
    }
  }
  const days = months.reduce((s, m) => s + daysIn(m), 0)
  if (billings <= 0 || purchases <= 0) {
    return { status: 'unavailable', reason: 'the last three months have no billings or no purchases to measure days against' }
  }
  return {
    status: 'derived',
    dso_days: Math.round(debtors / (billings / days)),
    dpo_days: Math.round(creditors / (purchases / days)),
    inputs: { debtors, creditors, billings: round2(billings), purchases: round2(purchases), days, months },
  }
}

/**
 * The GST owed at the report-month end that the model's first BAS pays.
 *
 * 'quarter_to_date_movement': the movement since the end of the last period
 * the schedule has already settled. Urban Road on quarterly_feb_may_aug_nov at
 * 31 Aug: July and August are due in November, June was due in August, so
 * 69,410.61 − 31,515.27 = 37,895.34, and the November BAS is that plus
 * September's GST — 51,783 against Calxa's 50,636. 'balance' pays the whole
 * account, which would put the $31,515.27 left over from June into November
 * too (about 80,218) — which is right is a bookkeeping question, so it is the
 * coach's setting.
 */
export function openingGst(
  bsRows: BsRowInput[],
  reportMonth: string,
  cfg: CashModelConfig,
): { amount: number; dueMonth: string; settledEnd: string | null; leftOver: number; leftOverByAccount: Array<{ account_id: string; amount: number }> } | { reason: string } {
  const schedule = cashModelSchedule(cfg.gst.schedule)
  const dueMonth = dueMonthKey(reportMonth, schedule)
  const end = endOfMonth(reportMonth)
  const closing = balanceOf(bsRows, cfg.gst.account_ids, end) ?? 0
  if (cfg.gst.opening === 'balance') return { amount: closing, dueMonth, settledEnd: null, leftOver: 0, leftOverByAccount: [] }
  let start = reportMonth
  for (let i = 0; i < 12 && dueMonthKey(priorMonth(start), schedule) === dueMonth; i++) start = priorMonth(start)
  const settledEnd = endOfMonth(priorMonth(start))
  if (!sheetExists(bsRows, settledEnd)) {
    return { reason: `the quarter-to-date GST needs the balance sheet at ${fmtDate(settledEnd)}, which is not synced` }
  }
  const settled = balanceOf(bsRows, cfg.gst.account_ids, settledEnd) ?? 0
  const leftOverByAccount = cfg.gst.account_ids
    .map((id) => ({ account_id: id, amount: balanceOf(bsRows, [id], settledEnd) ?? 0 }))
    .filter((a) => Math.abs(a.amount) >= 0.005)
  return { amount: round2(closing - settled), dueMonth, settledEnd, leftOver: settled, leftOverByAccount }
}

/** The months a schedule pays in, in the order they fall after `from`: 'Nov/Feb/May/Aug'. */
function paymentMonthsText(name: string, from: string): string {
  if (name === 'payday') return 'each pay run'
  if (name === 'monthly_activity_statement') return 'monthly, the month after'
  if (name === 'monthly_arrears') return 'monthly in arrears'
  const periods = cashModelSchedule(name)
  const seen: string[] = []
  let m = from
  for (let i = 0; i < 12; i++, m = nextMonth(m)) {
    const label = packMonthYear(m).split(' ')[0]
    if (periods.includes(Number(m.slice(5))) && !seen.includes(label)) seen.push(label)
  }
  return seen.join('/')
}

/** Every month-end from `first` to `last` ('YYYY-MM-DD'), inclusive. */
function monthEnds(firstEnd: string, lastEnd: string): string[] {
  return monthsBetween(firstEnd.slice(0, 7), lastEnd.slice(0, 7)).map(endOfMonth)
}

/**
 * The configured accounts, checked against the ledger before a figure is
 * built on them. balanceOf answers null for an id that matches nothing, and
 * the first cut read that as $0: Urban Road with debtors_account_ids
 * ['905e1394-typo'] opened September on no debtors — receipts 180,933
 * against 459,361 — while July and August still tied (the real Trade Debtors
 * printed as an ordinary asset row), so nothing looked wrong.
 *
 *   on the balance sheet at a month-end in the window  → used
 *   in the chart of accounts, never on the sheet        → $0, said in a warning
 *   neither                                             → refused, named
 */
export function checkCashModelAccounts(
  inputs: Pick<CashModelInputs, 'bsRows' | 'accounts'>,
  cfg: CashModelConfig,
  window: { fyOpening: string; reportEnd: string },
): { reason: string } | { warnings: string[] } {
  const ends = monthEnds(window.fyOpening, window.reportEnd)
  const onSheet = new Set<string>()
  for (const r of inputs.bsRows) {
    if (!r.account_id) continue
    if (ends.some((d) => r.balances_by_date?.[d] !== undefined && r.balances_by_date?.[d] !== null)) onSheet.add(norm(r.account_id))
  }
  const inChart = new Map(inputs.accounts.map((a) => [norm(a.xero_account_id), a.account_name]))
  const roles: Array<[string, readonly string[]]> = [
    ['debtors_account_ids', cfg.debtors_account_ids],
    ['creditors_account_ids', cfg.creditors_account_ids],
    ['gst.account_ids', cfg.gst.account_ids],
    ['paygw.liability_account_ids', cfg.paygw.liability_account_ids],
    ['super.payable_account_ids', cfg.super.payable_account_ids],
    ['opening_ato_accounts', cfg.opening_ato_accounts.map((a) => a.account_id)],
  ]
  const missing: string[] = []
  const warnings: string[] = []
  for (const [role, ids] of roles) {
    for (const id of ids) {
      if (onSheet.has(norm(id))) continue
      const charted = inChart.get(norm(id))
      if (charted !== undefined) {
        warnings.push(`${charted} (${role}) holds nothing at any month-end from ${fmtDate(window.fyOpening)} to ${fmtDate(window.reportEnd)} — counted as $0`)
      } else {
        missing.push(`${role} ${id}`)
      }
    }
  }
  if (missing.length > 0) {
    return { reason: `the cash model names ${missing.length === 1 ? 'an account' : 'accounts'} not on this business's balance sheet or chart of accounts (${missing.join('; ')}) — check the ids in the cash model settings` }
  }
  return { warnings }
}

/**
 * The ATO and super balances at the report-month end that no forecast month
 * pays. Which account holds Urban Road's PAYG is the coach's setting (ATO
 * Creditors (BAS) 21250 or PAYG Payroll Tax Withheld 21390); whichever is not
 * chosen is paid in no month, and the first cut said nothing — $10,741 or
 * $16,674 of tax owed that the bank line never pays. Named by the account's
 * name, because nothing else marks an account as the ATO's; an account the
 * coach has listed in opening_ato_accounts — paid or 'excluded' — is a
 * decision, not an omission.
 */
const ATO_NAME = /\b(ato|payg|bas|ias|gst|super|superannuation|withholding|withheld|w\/holding|company tax|income tax)\b/i
function unpaidAtoBalances(rows: BsRowInput[], cfg: CashModelConfig, end: string): Array<{ name: string; amount: number }> {
  const handled = new Set([
    ...cfg.gst.account_ids, ...cfg.paygw.liability_account_ids, ...cfg.super.payable_account_ids,
    ...cfg.opening_ato_accounts.map((a) => a.account_id),
  ].map(norm))
  const out: Array<{ name: string; amount: number }> = []
  for (const r of rows) {
    if (r.account_type !== 'liability' || handled.has(norm(r.account_id)) || !ATO_NAME.test(r.account_name ?? '')) continue
    const amount = num(r.balances_by_date?.[end])
    if (Math.abs(amount) >= 1) out.push({ name: r.account_name, amount: round2(amount) })
  }
  return out
}

export function buildPackCashModel(args: {
  fullYear: FullYearReport | null | undefined
  reportMonth: string
  config: CashModelConfig
  inputs: CashModelInputs
}): PackCashModel {
  const { reportMonth, config: cfg, inputs } = args
  const fyOpening = openingBalanceDate(reportMonth, inputs.fiscalYearStart)
  const fyStart = nextMonth(fyOpening.slice(0, 7))
  const fyEnd = monthsBetween(fyStart, '9999-12')[11]
  const actualMonths = monthsBetween(fyStart, reportMonth)
  const warnings: string[] = []
  const rate = taxRateLookup(inputs.accounts, cfg.gst.tax_rate_overrides)
  const built = buildPackCashflowLines(args.fullYear ?? null, reportMonth)
  const labels: CashLineLabel[] = built.lines.map((l) => ({ account_code: l.account_code ?? null, account_name: l.account_name, group: l.report_group ?? null }))
  const payslips = payslipsByMonth(inputs.payRuns)
  const accountNames: Record<string, string> = {}
  for (const r of inputs.bsRows) if (r.account_id) accountNames[norm(r.account_id)] = r.account_name

  const accountCheck = checkCashModelAccounts(inputs, cfg, { fyOpening, reportEnd: endOfMonth(reportMonth) })
  if ('reason' in accountCheck) return { status: 'refused', reason: accountCheck.reason }
  warnings.push(...accountCheck.warnings)

  // ── Actual months ──
  const actual: CashflowForecastMonth[] = []
  const reconciliation: ActualCashReconciliation[] = []
  for (const m of actualMonths) {
    const flow = deriveMoneyFlow(inputs.bsRows, m, {
      bankAccountIds: inputs.bankAccountIds,
      creditCardAccountIds: inputs.creditCardAccountIds,
      plRows: inputs.plRows,
    })
    if (!flow.comparable) return { status: 'refused', reason: `${packMonthYear(m)}: ${flow.reason}` }
    const month = deriveActualCashMonth({
      flow, plRows: inputs.plRows, labels, taxRate: rate, payslips: payslips[m] ?? null, cfg, accountNames,
    })
    const { reconciliation: rec, ...cashMonth } = month
    // What the rows cannot explain beyond the balance sheets' own tolerance
    // (money flow lets each end be $1 out) is the model, not the ledger. The
    // first cut printed it as an "Unexplained difference" row of any size —
    // Net Movement still read the bank's figure, so the column tied by
    // construction and the preflight only warned. A client pack does not
    // carry a plug; the page prints why instead.
    const unexplained = (cashMonth.unreconciled_lines ?? []).find((l) => l.label === UNEXPLAINED_LABEL)
    if (unexplained && Math.abs(unexplained.value) > 2) {
      return { status: 'refused', reason: `${packMonthYear(m)}: the cash rows do not add to the bank movement — ${fmtDollars(unexplained.value)} is unexplained, so the cash model settings do not describe this ledger (an account in the wrong role, or payroll codes that do not match)` }
    }
    actual.push(cashMonth)
    reconciliation.push(rec)
    if (rec.payslip_tax_unmatched) {
      warnings.push(`${packMonthYear(m)}: pay runs withheld ${fmtDollars(payslips[m]?.tax ?? 0)} of PAYG but no wages account in wages_codes booked anything — wages and PAYG print as booked`)
    }
    if (rec.unknown_tax_accounts.length > 0) {
      warnings.push(`${packMonthYear(m)}: no known GST rate for ${rec.unknown_tax_accounts.join(', ')} — grossed up at 0%, so the GST row carries their GST`)
    }
    if (rec.sync_gap !== 0 && Math.round(rec.sync_gap) !== 0) {
      warnings.push(`${packMonthYear(m)}: the P&L and the balance sheet disagree about the month's profit by ${fmtDollars(rec.sync_gap)} — printed as its own row`)
    }
    if (rec.payslips_missing) {
      warnings.push(`${packMonthYear(m)}: no pay runs synced — wages print gross and PAYG is not separated`)
    }
  }

  // ── Budget months ──
  const lastActual = actual[actual.length - 1]
  let forecastMonths: CashflowForecastMonth[] = []
  let terms: { dso: number; dpo: number; dsoDerived: boolean; dpoDerived: boolean } | null = null
  const firstForecast = reportMonth >= fyEnd ? null : nextMonth(reportMonth)
  /** The PAYG rate and where it came from, for the basis; null when wages are paid gross. */
  let paygText: string | null = null

  if (firstForecast) {
    if (built.budgetMonths.length === 0) {
      return { status: 'refused', reason: 'there is no Full Year report to take the budget months from' }
    }
    let derivedTerms: CashTerms | null = null
    const needDerived = cfg.dso_days === 'derived' || cfg.dpo_days === 'derived'
    if (needDerived) {
      derivedTerms = deriveCashTerms(inputs, reportMonth, cfg)
      if (derivedTerms.status === 'unavailable') {
        return { status: 'refused', reason: `Debtor and creditor days are set to come from the ledger, but ${derivedTerms.reason}` }
      }
    }
    const dso = cfg.dso_days === 'derived' ? (derivedTerms as Extract<CashTerms, { status: 'derived' }>).dso_days : cfg.dso_days
    const dpo = cfg.dpo_days === 'derived' ? (derivedTerms as Extract<CashTerms, { status: 'derived' }>).dpo_days : cfg.dpo_days
    terms = { dso, dpo, dsoDerived: cfg.dso_days === 'derived', dpoDerived: cfg.dpo_days === 'derived' }

    // The budget for the months after the report, and nothing else: the
    // actual months are above, and an actual left in a line would be read by
    // getLineValue first. Other Expenses go through as operating expenses
    // under their own heading — the engine has no Other Expenses section, and
    // a month that dropped them would not add up.
    const window = new Set(monthsBetween(firstForecast, fyEnd))
    const lines: PLLine[] = built.lines.map((l) => ({
      ...l,
      ...(l.category === 'Other Expenses' ? { category: 'Operating Expenses', report_group: l.report_group ?? 'Other Expenses' } : {}),
      actual_months: {},
      forecast_months: Object.fromEntries(Object.entries(l.forecast_months).filter(([m]) => window.has(m))),
    }))
    const lineByLabel = new Map(lines.map((l) => [norm(l.account_name), l]))
    const labelFor = (r: CashPlRow) =>
      (r.account_code ? lines.find((l) => l.account_code && norm(l.account_code) === norm(r.account_code)) : undefined)?.account_name
      ?? lineByLabel.get(norm(r.account_name))?.account_name
      ?? r.account_name
    const unknownForecast = new Set<string>()
    const lineRate = (l: PLLine) => {
      const r = rate({ account_code: l.account_code ?? null, account_name: l.account_name })
      if (r === null && Object.values(l.forecast_months).some((v) => v !== 0)) unknownForecast.add(l.account_name)
      return r
    }

    const payrollCodes = new Set([...cfg.wages_codes, ...cfg.super.expense_codes].map(norm))
    const isPayroll = (code: string | null | undefined) => !!code && payrollCodes.has(norm(code))
    // Calxa's rule for the opening balances: collected and paid in the first
    // forecast month, apportioned by the last actual month's GST-inclusive
    // amounts — creditors across Cost of Sales and operating expenses
    // excluding wages and super. Urban Road's August base is 361,584.41, the
    // base Calxa's own September figures imply (~361,338).
    const weights = (types: string[]) => {
      const w: Record<string, number> = {}
      for (const r of inputs.plRows) {
        if (!types.includes(r.account_type) || isPayroll(r.account_code)) continue
        const v = num(r.monthly_values?.[reportMonth])
        if (v === 0) continue
        const label = labelFor(r)
        w[label] = (w[label] ?? 0) + v * (1 + (rate(r) ?? 0))
      }
      if (Object.values(w).some((v) => Math.abs(v) > 0.005)) return w
      // Nothing booked in the last actual month: the first budget month's mix.
      const first: Record<string, number> = {}
      const categories = types.includes('revenue') ? ['Revenue'] : ['Cost of Sales', 'Operating Expenses']
      for (const l of lines) {
        if (!categories.includes(l.category ?? '') || isPayroll(l.account_code)) continue
        const v = l.forecast_months[firstForecast] ?? 0
        if (v !== 0) first[l.account_name] = v * (1 + (lineRate(l) ?? 0))
      }
      return first
    }
    const end = endOfMonth(reportMonth)
    const debtors = balanceOf(inputs.bsRows, cfg.debtors_account_ids, end) ?? 0
    const creditors = balanceOf(inputs.bsRows, cfg.creditors_account_ids, end) ?? 0

    // PAYG rate: the latest actual month's payslips, or the configured rate.
    let paygRate = 0
    if (cfg.paygw.rate === 'payslips') {
      const latest = [...actualMonths].reverse().find((m) => (payslips[m]?.wages ?? 0) > 0)
      if (latest) {
        paygRate = payslips[latest].tax / payslips[latest].wages
        paygText = `${(paygRate * 100).toFixed(2)}% (${packMonthYear(latest)} payslips)`
        warnings.push(`PAYG withheld from budget wages at ${(paygRate * 100).toFixed(2)}%, ${packMonthYear(latest)}'s payslips`)
      } else if (cfg.wages_codes.length > 0) {
        warnings.push('PAYG rate is set to come from payslips, but no pay runs are synced this year — budget wages are paid gross and no PAYG is remitted')
      }
    } else {
      paygRate = cfg.paygw.rate
      paygText = `${(paygRate * 100).toFixed(2)}% (set)`
    }

    const gst = openingGst(inputs.bsRows, reportMonth, cfg)
    if ('reason' in gst) return { status: 'refused', reason: `Opening GST: ${gst.reason}` }
    if (gst.settledEnd && Math.abs(gst.leftOver) >= 1) {
      // By account: Urban Road's $28,435 is GST Collected & Paid $31,515
      // less GST adjustments' unmoved −$3,080, and the bookkeeper is asked
      // about the $31,515.
      const byAccount = gst.leftOverByAccount.map((a) => `${accountNames[norm(a.account_id)] ?? a.account_id} ${fmtDollars(a.amount)}`).join(', ')
      warnings.push(`The GST accounts held ${fmtDollars(gst.leftOver)} at ${fmtDate(gst.settledEnd)}${byAccount ? ` (${byAccount})` : ''}, a period its BAS should have settled; the model pays only the quarter-to-date movement (${fmtDollars(gst.amount)}), so that balance is in no forecast payment`)
    }
    if (cfg.gst.basis === 'cash') {
      warnings.push('GST on a cash basis: the opening GST is the ledger\'s, which Xero posts when an invoice or bill is raised, so the opening debtors and creditors are collected and paid without GST being charged on them again — the first BAS is approximate until it is lodged')
    }
    for (const a of unpaidAtoBalances(inputs.bsRows, cfg, end)) {
      warnings.push(`${a.name} holds ${fmtDollars(a.amount)} at ${fmtDate(end)} and is in no forecast payment — name it in paygw, super or opening_ato_accounts (pay or excluded)`)
    }
    const nameOf = (ids: readonly string[], fallback: string) => ids.map((id) => accountNames[norm(id)]).find(Boolean) ?? fallback
    const paygSchedule = cashModelSchedule(cfg.paygw.schedule)
    const superSchedule = cashModelSchedule(cfg.super.schedule)
    const gstAndPayroll = new Set([...cfg.gst.account_ids, ...cfg.paygw.liability_account_ids, ...cfg.super.payable_account_ids].map(norm))
    const openingLiabilities = [
      { label: nameOf(cfg.gst.account_ids, 'GST'), kind: 'gst' as const, amount: gst.amount, dueMonth: gst.dueMonth },
      ...(cfg.paygw.liability_account_ids.length > 0
        ? [{ label: nameOf(cfg.paygw.liability_account_ids, 'PAYG Withholding'), kind: 'paygw' as const, amount: balanceOf(inputs.bsRows, cfg.paygw.liability_account_ids, end) ?? 0, dueMonth: dueMonthKey(reportMonth, paygSchedule) }]
        : []),
      ...(cfg.super.payable_account_ids.length > 0
        ? [{ label: nameOf(cfg.super.payable_account_ids, 'Superannuation Payable'), kind: 'super' as const, amount: balanceOf(inputs.bsRows, cfg.super.payable_account_ids, end) ?? 0, dueMonth: dueMonthKey(reportMonth, superSchedule) }]
        : []),
      ...cfg.opening_ato_accounts
        .filter((a) => a.pay === 'first_forecast_month' && !gstAndPayroll.has(norm(a.account_id)))
        .map((a) => ({ label: nameOf([a.account_id], a.account_id), kind: 'other' as const, amount: balanceOf(inputs.bsRows, [a.account_id], end) ?? 0, dueMonth: firstForecast })),
    ]

    const assumptions: CashflowAssumptions = {
      ...getDefaultCashflowAssumptions(),
      dso_days: dso,
      dpo_days: dpo,
      gst_registered: true,
      gst_rate: 0.1,
      payg_instalment_frequency: 'none',
      opening_bank_balance: lastActual.bank_at_end,
      balance_date: end,
    }
    const forecast = {
      id: 'cash-model-v2',
      business_id: args.fullYear?.business_id ?? '',
      user_id: '',
      name: 'Cash model v2',
      fiscal_year: args.fullYear?.fiscal_year ?? Number(fyEnd.slice(0, 4)),
      year_type: 'FY',
      // No month of the window is actual: they all start after the report.
      actual_start_month: firstForecast,
      actual_end_month: reportMonth,
      forecast_start_month: firstForecast,
      forecast_end_month: fyEnd,
    } as FinancialForecast
    const run = generateCashflowForecast(lines, null, assumptions, forecast, [], {
      signedExpenses: true,
      firstMonthSpill: false,
      gstRateForLine: lineRate,
      gstBasis: cfg.gst.basis,
      openingReceivables: { amount: debtors, weights: weights(['revenue']) },
      openingPayables: { amount: creditors, weights: weights(['cogs', 'opex', 'other_expense']) },
      opexTimedByDpo: cfg.opex_timing === 'dpo',
      payroll: {
        wagesCodes: cfg.wages_codes,
        superCodes: cfg.super.expense_codes,
        paygRateByMonth: Object.fromEntries([...window].map((m) => [m, paygRate])),
      },
      schedules: { gst: cashModelSchedule(cfg.gst.schedule), paygw: paygSchedule, super: superSchedule },
      openingLiabilities,
      liabilityLabels: {
        gst: nameOf(cfg.gst.account_ids, 'GST'),
        paygw: nameOf(cfg.paygw.liability_account_ids, 'PAYG Withholding'),
        super: nameOf(cfg.super.payable_account_ids, 'Superannuation Payable'),
      },
    })
    forecastMonths = run.months
    if (unknownForecast.size > 0) {
      warnings.push(`Budget months: no known GST rate for ${[...unknownForecast].join(', ')} — timed with the old keyword GST treatment`)
    }
    if (forecastMonths.length > 0 && Math.abs(forecastMonths[0].bank_at_beginning - lastActual.bank_at_end) > 0.005) {
      return { status: 'refused', reason: 'the first budget month does not open on the last actual month\'s bank' }
    }
  }

  const months = [...actual, ...forecastMonths]
  const totals = buildTotals(months)
  const equity = aggregate(months.flatMap((m) => m.equity_lines ?? []))
  const unreconciled = aggregate(months.flatMap((m) => m.unreconciled_lines ?? []))
  totals.equity_lines = equity
  totals.movement_in_equity = round2(equity.reduce((s, l) => s + l.value, 0))
  totals.unreconciled_lines = unreconciled
  totals.unreconciled_movement = round2(unreconciled.reduce((s, l) => s + l.value, 0))

  let lowest = { value: Infinity, month: '' }
  for (const m of months) if (m.bank_at_end < lowest.value) lowest = { value: m.bank_at_end, month: m.month }

  const plLinesForOrder = built.lines
  const cashflow: CashflowForecastData = {
    forecast_id: '',
    assumptions: {
      ...getDefaultCashflowAssumptions(),
      dso_days: terms?.dso ?? 0,
      dpo_days: terms?.dpo ?? 0,
      opening_bank_balance: actual[0]?.bank_at_beginning ?? 0,
      balance_date: fyOpening,
    },
    months,
    totals,
    lowest_bank_balance: lowest.value === Infinity ? 0 : round2(lowest.value),
    lowest_bank_month: lowest.month,
    line_order: plLinesForOrder.map((l) => l.account_name),
    expense_group_order: [...packExpenseGroupOrder(plLinesForOrder), 'Other Expenses'],
    cash_model: {
      version: 2,
      last_actual_month: reportMonth,
      first_forecast_month: firstForecast,
      dso_days: terms?.dso ?? null,
      dpo_days: terms?.dpo ?? null,
      basis: '',
      warnings,
    },
  }

  const basis = packCashModelBasis({
    actualMonths,
    budgetMonths: firstForecast ? monthsBetween(firstForecast, fyEnd) : [],
    approvedThroughout: built.approvedThroughout,
    opening: { amount: cashflow.assumptions.opening_bank_balance, asAt: fyOpening },
    terms,
    opexOnDpo: cfg.opex_timing === 'dpo',
    basText: firstForecast ? paymentMonthsText(cfg.gst.schedule, firstForecast) : null,
    payroll: firstForecast && (cfg.wages_codes.length > 0 || cfg.super.expense_codes.length > 0)
      ? {
          payg: cfg.paygw.liability_account_ids.length > 0 && paygText
            ? { rate: paygText, paid: paymentMonthsText(cfg.paygw.schedule, firstForecast) }
            : null,
          superPaid: cfg.super.payable_account_ids.length > 0 ? paymentMonthsText(cfg.super.schedule, firstForecast) : null,
        }
      : null,
    payslipsMissing: reconciliation.filter((r) => r.payslips_missing).map((r) => r.month),
  })
  cashflow.cash_model!.basis = basis

  return { status: 'ready', cashflow, basis, reconciliation, warnings }
}

function aggregate(lines: CashflowLine[]): CashflowLine[] {
  const map = new Map<string, number>()
  for (const l of lines) map.set(l.label, (map.get(l.label) ?? 0) + l.value)
  return [...map.entries()].map(([label, value]) => ({ label, value: round2(value) }))
}

/**
 * The basis sentence for a v2 page. It says which months are the bank's cash
 * and which are the budget, and — because only the section totals of an
 * actual month are ledger facts — that the account rows in those months are a
 * split, so no reader takes "Canvas Sales" in July for a banked amount.
 */
export function packCashModelBasis(a: {
  actualMonths: string[]
  budgetMonths: string[]
  approvedThroughout: boolean
  opening: { amount: number; asAt: string }
  terms: { dso: number; dpo: number; dsoDerived: boolean; dpoDerived: boolean } | null
  opexOnDpo: boolean
  basText: string | null
  /** The budget months' payroll cash: PAYG rate and source and when it is paid, and when super is paid. */
  payroll?: { payg: { rate: string; paid: string } | null; superPaid: string | null } | null
  payslipsMissing: string[]
}): string {
  const range = (ms: string[]) => (ms.length === 1 ? packMonthYear(ms[0]) : `${packMonthYear(ms[0])} to ${packMonthYear(ms[ms.length - 1])}`)
  const parts = [`Opening bank ${fmtDollars(a.opening.amount)} at ${fmtDate(a.opening.asAt)}`]
  if (a.actualMonths.length > 0) {
    parts.push(`${range(a.actualMonths)} actual cash from the bank and balance sheet; totals are actual, each account's share of receipts and payments is apportioned by its P&L`)
  }
  if (a.budgetMonths.length > 0) {
    parts.push(`${a.approvedThroughout ? 'approved budget' : 'forecast'} ${range(a.budgetMonths)}`)
    if (a.terms) {
      // Each term says where it came from when the two differ: the first cut
      // printed "(from the ledger)" when either was derived, so a set 19 days
      // read as measured.
      const { dso, dpo, dsoDerived, dpoDerived } = a.terms
      const days = dsoDerived === dpoDerived
        ? `debtors ${dso} days, creditors ${dpo} days${dsoDerived ? ' (from the ledger)' : ''}`
        : `debtors ${dso} days (${dsoDerived ? 'from the ledger' : 'set'}), creditors ${dpo} days (${dpoDerived ? 'from the ledger' : 'set'})`
      parts.push(`${days}${a.opexOnDpo ? ', expenses on creditor days' : ''}`)
    }
    if (a.basText) parts.push(`BAS ${a.basText}`)
    if (a.payroll) {
      const pay: string[] = []
      if (a.payroll.payg) pay.push(`wages net of PAYG at ${a.payroll.payg.rate}, PAYG paid ${a.payroll.payg.paid}`)
      if (a.payroll.superPaid) pay.push(`super ${a.payroll.superPaid}`)
      if (pay.length > 0) parts.push(pay.join(', '))
    }
  }
  if (a.payslipsMissing.length > 0) {
    parts.push(`PAYG not separated in ${a.payslipsMissing.map(packMonthYear).join(', ')} — no pay runs synced`)
  }
  return parts.join(' · ')
}
