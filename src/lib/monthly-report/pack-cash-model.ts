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
import { deriveMoneyFlow, endOfMonth, isEarningsRow, priorMonth, summariseMonthPl, type BsRowInput } from './money-flow'
import { isBankRow, openingBalanceDate } from './opening-bank'
import { buildPackCashflowLines } from './pack-cashflow-lines'
import { deriveActualCashMonth, UNEXPLAINED_LABEL, type ActualCashReconciliation, type CashLineLabel, type CashPlRow, type MonthPayslips } from './pack-cash-actuals'
import { packExpenseGroupOrder } from './pack-cashflow'
import { packMonthYear } from '@/app/finances/monthly-report/services/pack-style'

export interface CashModelAccount {
  xero_account_id: string
  account_code: string | null
  account_name: string
  tax_type: string | null
  /** xero_accounts.xero_class — ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE; for the role check. */
  xero_class?: string | null
  /**
   * xero_accounts.xero_type — Xero's Account.Type. The catalog classes the
   * AU-only payroll types (PAYGLIABILITY, SUPERANNUATIONLIABILITY,
   * WAGESEXPENSE, SUPERANNUATIONEXPENSE) as OTHER, so the role check reads
   * the type when the class says nothing.
   */
  xero_type?: string | null
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

/**
 * Σ of the named accounts' balances at `date`, read as `as` — positive is a
 * debit for an asset, a credit (owed by the business) for a liability. Null
 * when none is on the sheet that day.
 *
 * The mirror stores a balance relative to the kind it files the row under
 * (A − L − E = 0), and it files by the balance's section when that and Xero's
 * class conflict, while the role check reads Xero's class. So a row filed
 * under the other of asset and liability is turned over: an ATO asset in
 * debit listed in opening_ato_accounts is owed TO the business, and the first
 * cut read its +5,000 as owed BY it and paid it out (wave 6, a $10k swing in
 * September).
 */
function balanceOf(rows: BsRowInput[], ids: readonly string[], date: string, as: 'asset' | 'liability'): number | null {
  const wanted = new Set(ids.map(norm))
  const other = as === 'asset' ? 'liability' : 'asset'
  let found = false
  let total = 0
  for (const r of rows) {
    if (!wanted.has(norm(r.account_id))) continue
    const v = r.balances_by_date?.[date]
    if (v === undefined || v === null) continue
    found = true
    total += r.account_type === other ? -num(v) : num(v)
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
  const debtors = balanceOf(inputs.bsRows, cfg.debtors_account_ids, end, 'asset')
  const creditors = balanceOf(inputs.bsRows, cfg.creditors_account_ids, end, 'liability')
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
  const closing = balanceOf(bsRows, cfg.gst.account_ids, end, 'liability') ?? 0
  if (cfg.gst.opening === 'balance') return { amount: closing, dueMonth, settledEnd: null, leftOver: 0, leftOverByAccount: [] }
  let start = reportMonth
  for (let i = 0; i < 12 && dueMonthKey(priorMonth(start), schedule) === dueMonth; i++) start = priorMonth(start)
  const settledEnd = endOfMonth(priorMonth(start))
  if (!sheetExists(bsRows, settledEnd)) {
    return { reason: `the quarter-to-date GST needs the balance sheet at ${fmtDate(settledEnd)}, which is not synced` }
  }
  const settled = balanceOf(bsRows, cfg.gst.account_ids, settledEnd, 'liability') ?? 0
  const leftOverByAccount = cfg.gst.account_ids
    .map((id) => ({ account_id: id, amount: balanceOf(bsRows, [id], settledEnd, 'liability') ?? 0 }))
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
 * Xero's class of a charted account, lower-cased; null when the chart cannot
 * say. The catalog (accounts-catalog classifyXeroAccount) files the AU-only
 * payroll types as OTHER, so for those the type decides: without it a PAYG or
 * super liability the mirror filed as an asset (a debit balance) would be
 * refused as 'an asset', and a WAGESEXPENSE account would rest on the P&L
 * mirror having booked something to it.
 */
function chartClass(a: CashModelAccount | undefined): 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | null {
  if (!a) return null
  const cls = norm(a.xero_class)
  if (cls === 'asset' || cls === 'liability' || cls === 'equity' || cls === 'revenue' || cls === 'expense') return cls
  switch ((a.xero_type ?? '').trim().toUpperCase()) {
    case 'PAYGLIABILITY':
    case 'SUPERANNUATIONLIABILITY':
      return 'liability'
    case 'WAGESEXPENSE':
    case 'SUPERANNUATIONEXPENSE':
      return 'expense'
    default:
      return null
  }
}

/**
 * The configured accounts, checked against the ledger before a figure is
 * built on them. balanceOf answers null for an id that matches nothing, and
 * the first cut read that as $0: Urban Road with debtors_account_ids
 * ['905e1394-typo'] opened September on no debtors — receipts 180,933
 * against 459,361 — while July and August still tied (the real Trade Debtors
 * printed as an ordinary asset row), so nothing looked wrong.
 *
 *   neither on the balance sheet nor in the chart       → refused, named
 *   the wrong kind for its role                         → refused, named
 *   on the balance sheet at a month-end in the window  → used
 *   a charted balance-sheet account, never on the sheet → $0, said in a warning
 *
 * The wrong kind is a real id in the wrong field, which the existence check
 * alone let through with a plausible, wrong forecast (Urban Road, August
 * 2026, the second review): Canvas Sales as debtors opened September on $0
 * of debtors, the cheque account as debtors or the two trade accounts swapped
 * moved September's bank by $25-30k, AUD PayPal as creditors by $16k — and
 * the actual months tied in every case, so the page looked right.
 *
 *   debtors                        a balance-sheet asset
 *   creditors, GST, PAYG, super    a balance-sheet liability
 *   opening ATO accounts           an asset or a liability
 *   any role                       never a bank account, a credit card, an
 *                                  earnings account or a P&L account
 *
 * A bank account is one the mirror files in the bank (the chosen set, or the
 * Bank section) or one Xero types BANK. The type is what catches an overdrawn
 * account: the mirror files it as a liability, outside the Bank section, so
 * it passed as debtors or an opening ATO account (the final verifier, 14 Sep
 * 2026 — an overdraft in opening_ato_accounts was paid out in September), and
 * Xero classes every BANK account ASSET, so in a liability role it was
 * refused as "an asset". A credit card is Xero type BANK too (Urban Road's
 * three, bank_account_type CREDITCARD) and says so first.
 *
 * The kind is Xero's own class where the chart of accounts has it: the
 * balance-sheet mirror files an account by its balance's polarity when the two
 * conflict, and a debtors account in credit is still debtors. Xero's AU payroll
 * types, which the catalog classes OTHER, are read by their type (chartClass).
 * Otherwise the mirror's kind. A P&L account is one Xero classes REVENUE or
 * EXPENSE, or one the P&L mirror carries by AccountID or by the chart's code.
 *
 * The payroll codes and the opening ATO accounts are checked the same way
 * (the third review, wave 6 — each built a ready forecast whose actual months
 * still tied):
 *
 *   wages_codes, super.expense_codes  an expense account: Canvas Sales
 *                                     (41000) or a code that is not in the
 *                                     chart moved September's bank by
 *                                     +$5k (super) to +$31k (wages), the
 *                                     Superannuation Payable code 21490 by $5k
 *   opening_ato_accounts              no account that has another role, and
 *                                     none listed twice: Trade Debtors there
 *                                     too paid $278,428 out in September
 */
export function checkCashModelAccounts(
  inputs: Pick<CashModelInputs, 'bsRows' | 'accounts'> & Partial<Pick<CashModelInputs, 'plRows' | 'bankAccountIds' | 'creditCardAccountIds'>>,
  cfg: CashModelConfig,
  window: { fyOpening: string; reportEnd: string },
): { reason: string } | { warnings: string[] } {
  const ends = monthEnds(window.fyOpening, window.reportEnd)
  const onSheet = new Set<string>()
  const sheetRow = new Map<string, BsRowInput>()
  const sheetByCode = new Map<string, BsRowInput>()
  for (const r of inputs.bsRows) {
    if (r.account_code && !sheetByCode.has(norm(r.account_code))) sheetByCode.set(norm(r.account_code), r)
    if (!r.account_id) continue
    if (!sheetRow.has(norm(r.account_id))) sheetRow.set(norm(r.account_id), r)
    if (ends.some((d) => r.balances_by_date?.[d] !== undefined && r.balances_by_date?.[d] !== null)) onSheet.add(norm(r.account_id))
  }
  const inChart = new Map(inputs.accounts.map((a) => [norm(a.xero_account_id), a]))
  const chartByCode = new Map<string, CashModelAccount>()
  for (const a of inputs.accounts) if (a.account_code && !chartByCode.has(norm(a.account_code))) chartByCode.set(norm(a.account_code), a)
  const plIds = new Set((inputs.plRows ?? []).map((r) => norm(r.account_id)).filter(Boolean))
  const plCodes = new Set((inputs.plRows ?? []).map((r) => norm(r.account_code)).filter(Boolean))
  const plByCode = new Map<string, CashPlRow>()
  for (const r of inputs.plRows ?? []) if (r.account_code && !plByCode.has(norm(r.account_code))) plByCode.set(norm(r.account_code), r)
  const cards = new Set((inputs.creditCardAccountIds ?? []).map(norm))
  const roles: Array<[string, readonly string[], readonly string[]]> = [
    ['debtors_account_ids', cfg.debtors_account_ids, ['asset']],
    ['creditors_account_ids', cfg.creditors_account_ids, ['liability']],
    ['gst.account_ids', cfg.gst.account_ids, ['liability']],
    ['paygw.liability_account_ids', cfg.paygw.liability_account_ids, ['liability']],
    ['super.payable_account_ids', cfg.super.payable_account_ids, ['liability']],
    ['opening_ato_accounts', cfg.opening_ato_accounts.map((a) => a.account_id), ['asset', 'liability']],
  ]
  const missing: string[] = []
  const wrongKind: string[] = []
  const warnings: string[] = []
  // One account, one role — the parser's rule, again here for a caller that
  // holds a CashModelConfig without parsing it.
  const roleOf = new Map<string, string>()
  for (const [role, ids] of roles) {
    for (const id of ids) {
      const key = norm(id)
      const other = roleOf.get(key)
      const name = sheetRow.get(key)?.account_name ?? inChart.get(key)?.account_name ?? id
      if (other && other !== role) wrongKind.push(`${name} in ${role} is also in ${other} — an account can have one role`)
      else if (other && role === 'opening_ato_accounts') wrongKind.push(`${name} is in opening_ato_accounts more than once`)
      if (!other) roleOf.set(key, role)
    }
  }
  for (const [role, ids, kinds] of roles) {
    for (const id of ids) {
      const key = norm(id)
      const row = sheetRow.get(key)
      const charted = inChart.get(key)
      const plRow = plIds.has(key) ? inputs.plRows!.find((r) => norm(r.account_id) === key) : undefined
      if (!row && !charted && !plRow) {
        missing.push(`${role} ${id}`)
        continue
      }
      const name = row?.account_name ?? charted?.account_name ?? plRow!.account_name
      const xeroClass = chartClass(charted)
      const kind = xeroClass === 'asset' || xeroClass === 'liability' || xeroClass === 'equity' ? xeroClass : norm(row?.account_type)
      let wrong: string | null = null
      if (xeroClass === 'revenue' || xeroClass === 'expense' || plIds.has(key) || (!row && !!charted?.account_code && plCodes.has(norm(charted.account_code)))) {
        wrong = 'a profit and loss account, not a balance-sheet account'
      } else if (cards.has(key)) {
        wrong = 'a credit card'
      } else if (row && (isBankRow(row, inputs.bankAccountIds ?? null) || row.section === 'Bank')) {
        wrong = 'a bank account'
      } else if ((charted?.xero_type ?? '').trim().toUpperCase() === 'BANK') {
        wrong = row && row.account_type !== 'asset'
          ? `a bank account (Xero type BANK) the balance sheet files as ${row.account_type === 'equity' ? 'equity' : `a ${row.account_type}`}`
          : 'a bank account (Xero type BANK)'
      } else if (row && isEarningsRow(row)) {
        wrong = 'an earnings account'
      } else if (kind && !kinds.includes(kind)) {
        wrong = `${kind === 'asset' || kind === 'equity' ? 'an' : 'a'} ${kind}, and this setting takes ${kinds.length === 1 ? `${kinds[0] === 'asset' ? 'an' : 'a'} ${kinds[0]}` : 'an asset or a liability'}`
      }
      if (wrong) {
        wrongKind.push(`${name} in ${role} is ${wrong}`)
        continue
      }
      if (!onSheet.has(key)) {
        warnings.push(`${name} (${role}) holds nothing at any month-end from ${fmtDate(window.fyOpening)} to ${fmtDate(window.reportEnd)} — counted as $0`)
      }
    }
  }
  // The payroll codes: an expense account, by code. A code that is also on
  // the balance sheet is a balance-sheet account whatever the chart says.
  const takesExpense = 'and this setting takes an expense account'
  for (const [role, codes] of [['wages_codes', cfg.wages_codes], ['super.expense_codes', cfg.super.expense_codes]] as const) {
    for (const code of codes) {
      const key = norm(code)
      const sheet = sheetByCode.get(key)
      const charted = chartByCode.get(key)
      const pl = plByCode.get(key)
      if (!sheet && !charted && !pl) {
        missing.push(`${role} ${code}`)
        continue
      }
      const name = `${sheet?.account_name ?? pl?.account_name ?? charted!.account_name} (${code})`
      const cls = chartClass(charted)
      let wrong: string | null = null
      if (sheet || cls === 'asset' || cls === 'liability' || cls === 'equity') wrong = `a balance-sheet account, ${takesExpense}`
      else if (cls === 'revenue') wrong = `a revenue account, ${takesExpense}`
      else if (cls !== 'expense') {
        // No class the chart can give: the P&L mirror's type decides.
        if (!pl) wrong = `an account neither the chart of accounts nor the P&L says is an expense, ${takesExpense}`
        else if (!['cogs', 'opex', 'other_expense'].includes(pl.account_type)) wrong = `a revenue account, ${takesExpense}`
      }
      if (wrong) wrongKind.push(`${name} in ${role} is ${wrong}`)
    }
  }
  if (missing.length > 0) {
    return { reason: `the cash model names ${missing.length === 1 ? 'an account' : 'accounts'} not on this business's balance sheet, chart of accounts or P&L (${missing.join('; ')}) — check the ids and codes in the cash model settings` }
  }
  if (wrongKind.length > 0) {
    return { reason: `the cash model settings put ${wrongKind.length === 1 ? 'an account' : 'accounts'} in the wrong role (${wrongKind.join('; ')}) — check the ids in the cash model settings` }
  }
  return { warnings }
}

/**
 * wages_codes and super.expense_codes the wrong way round. Both are expense
 * accounts, so the role check passes them, and the model built a ready
 * forecast $8.5k low at September (Urban Road, wave 6: wages ['62160'],
 * super ['62170']). Super is a fraction of wages — the pay runs say 12% — so
 * super codes that booked MORE than the wages codes over the actual months,
 * while the pay runs paid less super than wages, is the swap, not a ledger.
 * Structural, not a tolerance: no ratio band is chosen here.
 */
function payrollCodesSwapped(plRows: CashPlRow[], cfg: CashModelConfig, months: string[], payslips: Record<string, MonthPayslips>): string | null {
  if (cfg.wages_codes.length === 0 || cfg.super.expense_codes.length === 0) return null
  const wages = bookedTo(plRows, cfg.wages_codes, months)
  const superTotal = bookedTo(plRows, cfg.super.expense_codes, months)
  const paidWages = months.reduce((s, m) => s + (payslips[m]?.wages ?? 0), 0)
  const paidSuper = months.reduce((s, m) => s + (payslips[m]?.super_amount ?? 0), 0)
  if (paidWages <= 0 || paidSuper >= paidWages || superTotal <= 0 || superTotal <= wages) return null
  return `wages_codes and super.expense_codes look swapped: ${monthsText(months)} booked ${fmtDollars(superTotal)} to the super codes (${cfg.super.expense_codes.join(', ')}) and ${fmtDollars(wages)} to the wages codes (${cfg.wages_codes.join(', ')}), while the pay runs paid ${fmtDollars(paidWages)} of wages and ${fmtDollars(paidSuper)} of super — check the codes in the cash model settings`
}

/** Σ the P&L booked to `codes` (matched trimmed, any case) over `months`. */
function bookedTo(plRows: CashPlRow[], codes: readonly string[], months: readonly string[]): number {
  const wanted = new Set(codes.map(norm))
  let s = 0
  for (const r of plRows) {
    if (!r.account_code || !wanted.has(norm(r.account_code))) continue
    for (const m of months) s += num(r.monthly_values?.[m])
  }
  return round2(s)
}

/** 'Jul 2026 to Sep 2026, Nov 2026': ascending months, each unbroken run as a range. */
function monthsText(months: readonly string[]): string {
  const runs: string[][] = []
  for (const m of months) {
    const last = runs[runs.length - 1]
    if (last && nextMonth(last[last.length - 1]) === m) last.push(m)
    else runs.push([m])
  }
  return runs.map((r) => (r.length === 1 ? packMonthYear(r[0]) : `${packMonthYear(r[0])} to ${packMonthYear(r[r.length - 1])}`)).join(', ')
}

/**
 * How far the payroll codes' booked total may sit from the pay runs before
 * the coach is told. A band, not a refusal: an accrual or a pay run dated
 * across a month-end moves wages between months, and Urban Road's codes tie
 * to the cent.
 */
const PAYROLL_CODE_TOLERANCE = 0.1

/**
 * A real expense account in a payroll role, the wrong one. The role check
 * passes any expense account, and the actual months tie whichever it is (the
 * rows are apportioned to the bank), so the error lands only in the budget
 * months: Contractors 61400 added to wages_codes paid Urban Road's budget
 * contractors net of PAYG — Sep bank 112,605 against 133,602 — ready and
 * silent (the final verifier, 14 Sep 2026).
 *
 * The pay runs say what the wages and super were. Over the actual months that
 * have pay runs (a month with none is already warned, and its booked wages
 * are not a difference), the total booked to wages_codes against the pay
 * runs' wages, and to super.expense_codes against their super: past
 * PAYROLL_CODE_TOLERANCE of the pay runs' figure, a warning naming the months
 * and both figures. The model and its output are unchanged.
 */
function payrollCodesDisagree(plRows: CashPlRow[], cfg: CashModelConfig, months: string[], payslips: Record<string, MonthPayslips>): string[] {
  const compared = months.filter((m) => (payslips[m]?.runs ?? 0) > 0)
  if (compared.length === 0) return []
  const out: string[] = []
  const checks = [
    { role: 'wages_codes', codes: cfg.wages_codes, what: 'wages', paid: (p: MonthPayslips) => p.wages },
    { role: 'super.expense_codes', codes: cfg.super.expense_codes, what: 'super', paid: (p: MonthPayslips) => p.super_amount },
  ]
  for (const { role, codes, what, paid: paidOf } of checks) {
    if (codes.length === 0) continue
    const booked = bookedTo(plRows, codes, compared)
    const paid = round2(compared.reduce((s, m) => s + paidOf(payslips[m]), 0))
    if (paid <= 0 || Math.abs(booked - paid) <= PAYROLL_CODE_TOLERANCE * paid) continue
    const pct = Math.round((Math.abs(booked - paid) / paid) * 100)
    out.push(`${monthsText(compared)}: ${role} (${codes.join(', ')}) booked ${fmtDollars(booked)} against ${fmtDollars(paid)} of ${what} on the pay runs, ${pct}% ${booked > paid ? 'more' : 'less'} — the budget months pay these accounts as ${what}; check ${role} in the cash model settings`)
  }
  return out
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
  const swapped = payrollCodesSwapped(inputs.plRows, cfg, actualMonths, payslips)
  if (swapped) return { status: 'refused', reason: swapped }
  // Early in the list: the preflight row shows the first few warnings, and a
  // wrong payroll account moves every budget month.
  warnings.push(...payrollCodesDisagree(inputs.plRows, cfg, actualMonths, payslips))

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
    // What the rows cannot explain is not printed. The first cut printed it
    // as an "Unexplained difference" row of any size — Net Movement still
    // read the bank's figure, so the column tied by construction and the
    // preflight only warned — and the second refused only past $2, so a
    // $1-$2 row still reached the pack. Any Unexplained difference row
    // (UNEXPLAINED_MATERIALITY, shared with the label and the preflight) is
    // a refusal; a client pack does not carry a plug, the page prints why.
    const unexplained = (cashMonth.unreconciled_lines ?? []).find((l) => l.label === UNEXPLAINED_LABEL)
    if (unexplained) {
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
    const debtors = balanceOf(inputs.bsRows, cfg.debtors_account_ids, end, 'asset') ?? 0
    const creditors = balanceOf(inputs.bsRows, cfg.creditors_account_ids, end, 'liability') ?? 0

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
        ? [{ label: nameOf(cfg.paygw.liability_account_ids, 'PAYG Withholding'), kind: 'paygw' as const, amount: balanceOf(inputs.bsRows, cfg.paygw.liability_account_ids, end, 'liability') ?? 0, dueMonth: dueMonthKey(reportMonth, paygSchedule) }]
        : []),
      ...(cfg.super.payable_account_ids.length > 0
        ? [{ label: nameOf(cfg.super.payable_account_ids, 'Superannuation Payable'), kind: 'super' as const, amount: balanceOf(inputs.bsRows, cfg.super.payable_account_ids, end, 'liability') ?? 0, dueMonth: dueMonthKey(reportMonth, superSchedule) }]
        : []),
      // The engine pays an 'other' amount out, so each is read as owed BY
      // the business: an ATO asset in debit (an income tax refund, an ICA in
      // debit) comes through negative, and is received.
      ...cfg.opening_ato_accounts
        .filter((a) => a.pay === 'first_forecast_month' && !gstAndPayroll.has(norm(a.account_id)))
        .map((a) => ({ label: nameOf([a.account_id], a.account_id), kind: 'other' as const, amount: balanceOf(inputs.bsRows, [a.account_id], end, 'liability') ?? 0, dueMonth: firstForecast })),
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
