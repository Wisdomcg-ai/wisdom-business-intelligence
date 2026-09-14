/**
 * One elapsed month of the pack's cashflow, as the cash that actually moved.
 *
 * v1 printed Urban Road's July as the accrual P&L run through DSO/DPO timing,
 * with a copy of July's own sales standing in for the June debtors: $544,739
 * of "cash in" the bank never saw. Here the month is anchored to the
 * balance-sheet mirror, through the same deriveMoneyFlow call — same bank set,
 * same sync, same refusals — as the Where Did Our Money Go page, so this
 * column's Net Movement IS that page's "How this Affected Our Bank" total.
 * July: 117,986.53 → 149,432.86, +31,446.33. August: 149,432.86 → 117,724.85,
 * −31,708.01. To the cent.
 *
 * Every cell is one of three things, and nothing else:
 *   (a) a ledger movement — Stock on Hand, a loan, Tax Savings;
 *   (b) a P&L account grossed up by its Xero tax type — the GST inside it;
 *   (c) an apportionment whose TOTAL is a ledger movement — the debtors and
 *       creditors movements, split across accounts in proportion to their
 *       GST-inclusive amounts.
 * The substitutions (gross-up, net wages, super paid through the liability)
 * each move an amount between rows of the same column, so the rows add to
 * surplus + every balance-sheet movement, which by the accounting equation is
 * the bank movement.
 *
 * What (c) means for a reader: only the section totals and Net Movement are
 * ledger facts. "Canvas Sales 371,142 received in July" is Canvas's share of
 * July's receipts, not a banked amount — the basis line says so.
 *
 * Pure — the loader does the reading.
 */
import type { CashflowExpenseGroup, CashflowForecastMonth, CashflowLine } from '@/app/finances/forecast/types'
import { classifyExpenseGroup } from '@/lib/cashflow/engine'
import type { FlowItem, MoneyFlow } from './money-flow'
import type { CashModelConfig } from './cash-model-config'

/** One account's row from the P&L mirror (xero_pl_lines_wide_compat). */
export interface CashPlRow {
  tenant_id: string
  account_id?: string | null
  account_code?: string | null
  account_name: string
  /** 'revenue' | 'cogs' | 'opex' | 'other_income' | 'other_expense' */
  account_type: string
  monthly_values: Record<string, number | string | null>
}

/** The statement's name and heading for an account (a Full Year line). */
export interface CashLineLabel {
  account_code?: string | null
  account_name: string
  group?: string | null
}

export interface MonthPayslips {
  wages: number
  tax: number
  super_amount: number
  runs: number
}

export interface ActualCashReconciliation {
  month: string
  /** flow.bank.delta — what the rows must add to. */
  bank_delta: number
  net_movement: number
  /** Δ(earnings) − P&L surplus: a P&L and a balance sheet from different syncs. */
  sync_gap: number
  /** What the 'Movements under 50c and rounding' / unexplained row carries. */
  residual: number
  /** Accounts with activity whose tax type is unknown — grossed up at 0%; the GST row absorbs it. */
  unknown_tax_accounts: string[]
  /** True when PAYG was taken out of wages and paid through its liability row. */
  payg_separated: boolean
  /** Wages were booked but no pay runs are synced for the month: wages print gross, PAYG as its raw movement. */
  payslips_missing: boolean
  /** Pay runs withheld tax this month but no wages account (wages_codes) booked anything: PAYG prints as its raw movement. */
  payslip_tax_unmatched: boolean
}

export type ActualCashMonth = CashflowForecastMonth & { reconciliation: ActualCashReconciliation }

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const round2 = (v: number) => Math.round(v * 100) / 100 || 0
const num = (v: number | string | null | undefined) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}
const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

export const SYNC_GAP_LABEL = 'Difference between P&L and balance sheet syncs'
export const RESIDUAL_LABEL = 'Movements under 50c and rounding'
export const UNEXPLAINED_LABEL = 'Unexplained difference'

/** An item's movement signed as cash: a source positive, a use negative. */
function cashOf(item: FlowItem, sources: Set<FlowItem>): number {
  return sources.has(item) ? item.amount : -item.amount
}

export function deriveActualCashMonth(args: {
  flow: MoneyFlow
  plRows: CashPlRow[]
  /** The statement lines, for each account's printed name and heading. */
  labels: CashLineLabel[]
  /** GST rate for a P&L row by its Xero tax type; null when unknown. */
  taxRate: (row: CashPlRow) => number | null
  payslips: MonthPayslips | null
  cfg: CashModelConfig
  /** Xero AccountID → the balance sheet's account name, for rows with no movement this month. */
  accountNames?: Record<string, string>
}): ActualCashMonth {
  const { flow, cfg } = args
  const m = flow.period_month
  const ids = (list: readonly string[]) => new Set(list.map(norm))
  const debtorIds = ids(cfg.debtors_account_ids)
  const creditorIds = ids(cfg.creditors_account_ids)
  const gstIds = ids(cfg.gst.account_ids)
  const paygIds = ids(cfg.paygw.liability_account_ids)
  const superIds = ids(cfg.super.payable_account_ids)
  const wagesCodes = new Set(cfg.wages_codes.map(norm))
  const superCodes = new Set(cfg.super.expense_codes.map(norm))
  const nameOf = (list: readonly string[], fallback: string) => {
    for (const id of list) {
      const hit = [...flow.sources, ...flow.uses].find((i) => norm(i.account_id) === norm(id))
      if (hit) return hit.label
      const named = args.accountNames?.[norm(id)] ?? args.accountNames?.[id]
      if (named) return named
    }
    return fallback
  }

  // ── Statement labels ──
  const byCode = new Map<string, CashLineLabel>()
  const byName = new Map<string, CashLineLabel>()
  for (const l of args.labels) {
    if (l.account_code && !byCode.has(norm(l.account_code))) byCode.set(norm(l.account_code), l)
    if (!byName.has(norm(l.account_name))) byName.set(norm(l.account_name), l)
  }
  const labelOf = (r: CashPlRow): CashLineLabel =>
    (r.account_code ? byCode.get(norm(r.account_code)) : undefined) ?? byName.get(norm(r.account_name)) ?? { account_name: r.account_name }

  // ── The month's P&L, one entry per account ──
  type Entry = { row: CashPlRow; label: CashLineLabel; amount: number; rate: number }
  const entries: Entry[] = []
  const unknownTax: string[] = []
  for (const r of args.plRows) {
    const raw = r.monthly_values?.[m]
    if (raw === undefined || raw === null) continue
    const amount = num(raw)
    if (amount === 0) continue
    const isPayroll = !!r.account_code && (wagesCodes.has(norm(r.account_code)) || superCodes.has(norm(r.account_code)))
    const label = labelOf(r)
    // By the mirror row, then by the statement line it matched: Xero's
    // system FX row reaches the P&L mirror with no code ("Foreign Currency
    // Gains and Losses") while the chart of accounts files it as 62700
    // "Foreign Currency Loss/Gain", which the Full Year line carries.
    const known = args.taxRate(r)
      ?? (label.account_code ? args.taxRate({ ...r, account_id: null, account_code: label.account_code, account_name: label.account_name }) : null)
    if (known === null && !isPayroll) unknownTax.push(r.account_name)
    entries.push({ row: r, label, amount, rate: isPayroll ? 0 : (known ?? 0) })
  }
  const ofType = (...types: string[]) => entries.filter((e) => types.includes(e.row.account_type))
  const isWages = (e: Entry) => !!e.row.account_code && wagesCodes.has(norm(e.row.account_code))
  const isSuper = (e: Entry) => !!e.row.account_code && superCodes.has(norm(e.row.account_code))

  const revenue = ofType('revenue')
  const otherIncome = ofType('other_income')
  const payments = ofType('cogs', 'opex', 'other_expense')
  const surplus = revenue.reduce((s, e) => s + e.amount, 0) + otherIncome.reduce((s, e) => s + e.amount, 0)
    - payments.reduce((s, e) => s + e.amount, 0)
  const gstOut = [...revenue, ...otherIncome].reduce((s, e) => s + e.amount * e.rate, 0)
  const gstIn = payments.reduce((s, e) => s + e.amount * e.rate, 0)

  // ── Balance-sheet movements, signed as cash ──
  const sources = new Set(flow.sources)
  const items = [...flow.sources, ...flow.uses]
  const cashIn = (set: Set<string>) => items.filter((i) => set.has(norm(i.account_id))).reduce((s, i) => s + cashOf(i, sources), 0)
  const debtorsCash = cashIn(debtorIds)
  const creditorsCash = cashIn(creditorIds)

  // PAYG and super come out of the expense rows only when there is a
  // liability row for them to go through; otherwise the expense is paid as
  // booked and the liability's movement prints as it is.
  //
  // PAYG also needs a wages row to come out of. The first cut took the
  // payslips' tax off the PAYG row whenever there were payslips, whether or
  // not a wages row added it back: Urban Road with no (or a misspelt) wages
  // code printed July with an "Unexplained difference" of exactly the
  // payslips' $9,688.07 PAYG, and Net Movement still read the bank's figure.
  const wagesBooked = payments.some(isWages)
  const paygSeparated = !!args.payslips && paygIds.size > 0 && wagesBooked
  const payslipTax = paygSeparated ? args.payslips!.tax : 0
  const superViaLiability = superIds.size > 0

  // ── Income ──
  const incomeAgg = new Map<string, number>()
  const add = (map: Map<string, number>, label: string, v: number) => map.set(label, (map.get(label) ?? 0) + v)
  const grossRevenue = revenue.reduce((s, e) => s + e.amount * (1 + e.rate), 0)
  for (const e of revenue) add(incomeAgg, e.label.account_name, e.amount * (1 + e.rate))
  if (Math.abs(debtorsCash) >= 0.005) {
    if (Math.abs(grossRevenue) < 0.005) add(incomeAgg, nameOf(cfg.debtors_account_ids, 'Trade Debtors'), debtorsCash)
    else for (const e of revenue) add(incomeAgg, e.label.account_name, debtorsCash * (e.amount * (1 + e.rate)) / grossRevenue)
  }

  // ── Cost of Sales and Expense ──
  const cogsAgg = new Map<string, number>()
  const groupAgg = new Map<string, Map<string, number>>()
  const addPayment = (e: Entry, v: number) => {
    if (e.row.account_type === 'cogs') { add(cogsAgg, e.label.account_name, v); return }
    const group = e.label.group?.trim()
      || (e.row.account_type === 'other_expense' ? 'Other Expenses' : classifyExpenseGroup(e.label.account_name))
    if (!groupAgg.has(group)) groupAgg.set(group, new Map())
    add(groupAgg.get(group)!, e.label.account_name, v)
  }
  const apportioned = payments.filter((e) => !isWages(e) && !isSuper(e))
  const grossApportioned = apportioned.reduce((s, e) => s + e.amount * (1 + e.rate), 0)
  for (const e of apportioned) addPayment(e, e.amount * (1 + e.rate))
  if (Math.abs(creditorsCash) >= 0.005) {
    if (Math.abs(grossApportioned) < 0.005) add(cogsAgg, nameOf(cfg.creditors_account_ids, 'Trade Creditors'), -creditorsCash)
    else for (const e of apportioned) addPayment(e, -creditorsCash * (e.amount * (1 + e.rate)) / grossApportioned)
  }
  const wages = payments.filter(isWages)
  const wagesTotal = wages.reduce((s, e) => s + e.amount, 0)
  for (const e of wages) {
    // The payslips' tax, shared across the wages accounts by their amounts.
    const share = Math.abs(wagesTotal) < 0.005 ? 1 / wages.length : e.amount / wagesTotal
    addPayment(e, e.amount - payslipTax * share)
  }
  const superExpense = payments.filter(isSuper)
  if (!superViaLiability) for (const e of superExpense) addPayment(e, e.amount)
  const superTotal = superExpense.reduce((s, e) => s + e.amount, 0)

  // ── Liabilities, assets, equity ──
  const liabilityAgg = new Map<string, number>()
  const assetAgg = new Map<string, number>()
  const equityAgg = new Map<string, number>()
  const special = new Set([...debtorIds, ...creditorIds, ...gstIds, ...paygIds, ...superIds])
  for (const i of items) {
    if (special.has(norm(i.account_id))) continue
    const v = cashOf(i, sources)
    if (i.kind === 'asset') add(assetAgg, i.label, v)
    else if (i.kind === 'equity') add(equityAgg, i.label, v)
    else add(liabilityAgg, i.label, v)
  }
  // The debtors/creditors ids are an asset and a liability respectively; one
  // misfiled under the other (a debtor with a credit balance kind) still
  // moves cash through its section above, never twice.
  add(liabilityAgg, nameOf(cfg.gst.account_ids, 'GST'), cashIn(gstIds) - (gstOut - gstIn))
  if (paygIds.size > 0) add(liabilityAgg, nameOf(cfg.paygw.liability_account_ids, 'PAYG Withholding'), cashIn(paygIds) - payslipTax)
  if (superIds.size > 0) add(liabilityAgg, nameOf(cfg.super.payable_account_ids, 'Superannuation Payable'), cashIn(superIds) - superTotal)

  // ── Lines ──
  const toLines = (map: Map<string, number>): CashflowLine[] =>
    [...map.entries()].map(([label, v]) => ({ label, value: round2(v) })).filter((l) => l.value !== 0)
  const income_lines = toLines(incomeAgg)
  const cogs_lines = toLines(cogsAgg)
  const expense_groups: CashflowExpenseGroup[] = [...groupAgg.entries()]
    .map(([group, map]) => {
      const lines = toLines(map)
      return { group, lines, subtotal: round2(lines.reduce((s, l) => s + l.value, 0)) }
    })
    .filter((g) => g.lines.length > 0)
  const asset_lines = toLines(assetAgg)
  const liability_lines = toLines(liabilityAgg)
  const equity_lines = toLines(equityAgg)
  const other_income_lines = otherIncome.length === 0 ? [] : toLines(
    otherIncome.reduce((map, e) => add(map, e.label.account_name, e.amount * (1 + e.rate)), new Map<string, number>()),
  )
  const sum = (ls: CashflowLine[]) => round2(ls.reduce((s, l) => s + l.value, 0))
  const cash_inflows = sum(income_lines)
  const cash_outflows = round2(sum(cogs_lines) + expense_groups.reduce((s, g) => s + g.subtotal, 0))
  const movement_in_assets = sum(asset_lines)
  const movement_in_liabilities = sum(liability_lines)
  const movement_in_equity = sum(equity_lines)
  const other_inflows = sum(other_income_lines)
  const rowsNet = round2(cash_inflows - cash_outflows + movement_in_assets + movement_in_liabilities + movement_in_equity + other_inflows)

  // ── What stops the rows adding to the bank, as rows ──
  // The sync gap shows when it would show on the money-flow page (a whole
  // dollar after rounding) — not at the design's $1: the two pages of one
  // pack must agree about whether the P&L and balance sheet disagree.
  const unreconciled_lines: CashflowLine[] = []
  const syncGap = round2(flow.earnings_movement - surplus)
  if (Math.round(syncGap) !== 0) unreconciled_lines.push({ label: SYNC_GAP_LABEL, value: syncGap })
  const residual = round2(flow.bank.delta - rowsNet - unreconciled_lines.reduce((s, l) => s + l.value, 0))
  if (residual !== 0) {
    // Under a dollar is the sub-50c balances money flow does not list, the
    // cents the P&L and the balance sheet round differently, and the
    // rounding of these rows. More is a balance sheet that does not balance
    // by up to money flow's $1 tolerance at each end — said, not absorbed.
    const small = Math.abs(residual) < 1 || Math.abs(residual - flow.unlisted_movement) < 1
    unreconciled_lines.push({ label: small ? RESIDUAL_LABEL : UNEXPLAINED_LABEL, value: residual })
  }
  const unreconciled_movement = sum(unreconciled_lines)
  const net_movement = round2(rowsNet + unreconciled_movement)

  const [yy, mm] = m.split('-').map(Number)
  return {
    month: m,
    monthLabel: `${MONTH_ABBR[mm - 1]} ${yy}`,
    source: 'actual',
    bank_at_beginning: flow.bank.start,
    income_lines,
    cash_inflows,
    cogs_lines,
    expense_groups,
    cash_outflows,
    asset_lines,
    movement_in_assets,
    liability_lines,
    movement_in_liabilities,
    other_income_lines,
    other_inflows,
    equity_lines,
    movement_in_equity,
    unreconciled_lines,
    unreconciled_movement,
    net_movement,
    bank_at_end: flow.bank.end,
    net_profit: round2(surplus),
    reconciliation: {
      month: m,
      bank_delta: flow.bank.delta,
      net_movement,
      sync_gap: syncGap,
      residual,
      unknown_tax_accounts: unknownTax,
      payslips_missing: wages.length > 0 && !args.payslips,
      payslip_tax_unmatched: !!args.payslips && paygIds.size > 0 && !wagesBooked && Math.abs(args.payslips.tax) >= 0.005,
      payg_separated: paygSeparated,
    },
  }
}
