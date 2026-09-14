/**
 * An elapsed month as the bank saw it: Urban Road's July and August 2026,
 * from the real ledger mirror, tied to the cent to the money-flow page's bank
 * movement on CBA Cheque + Bus Online Saver.
 */
import { describe, it, expect } from 'vitest'
import { deriveMoneyFlow } from '../money-flow'
import { deriveActualCashMonth, RESIDUAL_LABEL, SYNC_GAP_LABEL, type CashPlRow } from '../pack-cash-actuals'
import { payslipsByMonth, taxRateLookup } from '../pack-cash-model'
import { UR_ACCOUNTS, UR_BANK_IDS, UR_BS_ROWS, UR_CREDIT_CARD_IDS, UR_PAY_RUNS, UR_PL_ROWS } from './urban-road-ledger-fixture'
import { urbanRoadCashModel } from './urban-road-cash-model-config'
import { urbanRoadFullYear } from './urban-road-full-year-fixture'

const cfg = urbanRoadCashModel()
const rate = taxRateLookup(UR_ACCOUNTS, cfg.gst.tax_rate_overrides)
const labels = urbanRoadFullYear().sections.flatMap((s) => s.lines.map((l) => ({ account_code: l.account_code, account_name: l.account_name, group: l.group })))
const payslips = payslipsByMonth(UR_PAY_RUNS)

function month(m: string, opts: { plRows?: CashPlRow[]; payslips?: boolean; cfg?: typeof cfg } = {}) {
  const plRows = opts.plRows ?? UR_PL_ROWS
  const flow = deriveMoneyFlow(UR_BS_ROWS, m, { bankAccountIds: UR_BANK_IDS, creditCardAccountIds: UR_CREDIT_CARD_IDS, plRows })
  expect(flow.comparable).toBe(true)
  return {
    flow,
    cash: deriveActualCashMonth({
      flow, plRows, labels, taxRate: rate, payslips: opts.payslips === false ? null : payslips[m] ?? null, cfg: opts.cfg ?? cfg,
    }),
  }
}
const line = (lines: { label: string; value: number }[] | undefined, label: string) => lines?.find((l) => l.label === label)?.value
const expense = (m: ReturnType<typeof month>['cash'], label: string) =>
  m.expense_groups.flatMap((g) => g.lines).find((l) => l.label === label)?.value

describe('deriveActualCashMonth — Urban Road July 2026', () => {
  const { flow, cash } = month('2026-07')

  it('opens and closes on the bank mirror and moves exactly as the money-flow page says', () => {
    expect(cash.bank_at_beginning).toBe(117986.53)
    expect(cash.bank_at_end).toBe(149432.86)
    expect(flow.bank.delta).toBe(31446.33)
    expect(cash.net_movement).toBe(31446.33)
    expect(cash.source).toBe('actual')
  })

  it('every row adds to Net Movement, with nothing over a cent left for the rounding row', () => {
    const sum = cash.cash_inflows - cash.cash_outflows + cash.movement_in_assets + cash.movement_in_liabilities
      + (cash.movement_in_equity ?? 0) + cash.other_inflows + (cash.unreconciled_movement ?? 0)
    expect(sum).toBeCloseTo(cash.net_movement, 2)
    expect(Math.abs(cash.reconciliation.residual)).toBeLessThan(0.5)
    expect(cash.unreconciled_lines?.find((l) => l.label === SYNC_GAP_LABEL)).toBeUndefined()
  })

  it('receipts are sales grossed up by tax type plus the debtors collected: 495,217.03 + 47,967.04 + 137,071.17', () => {
    expect(cash.cash_inflows).toBeCloseTo(680255.24, 1)
  })

  it('the GST row is the ledger movement less the GST inside the rows: 9,714.05 − 12,574.18', () => {
    expect(line(cash.liability_lines, 'GST Collected & Paid')).toBeCloseTo(-2860.13, 1)
  })

  it('wages are paid net of the payslips\' PAYG, and PAYG through ATO Creditors (BAS) nets to nothing', () => {
    expect(expense(cash, 'Employ - Wages & Salaries')).toBeCloseTo(32327.4, 2)
    expect(line(cash.liability_lines, 'ATO Creditors (BAS)')).toBeUndefined() // 9,688.00 − 9,688.00
    expect(cash.reconciliation.payg_separated).toBe(true)
  })

  it('super has no expense row; the liability row pays the expense and the payable\'s movement', () => {
    expect(expense(cash, 'Employ - Superannuation')).toBeUndefined()
    expect(line(cash.liability_lines, 'Superannuation Payable')).toBeCloseTo(-6302.35, 2)
  })

  it('prints every other balance-sheet movement, Stock on Hand included, so the month ties', () => {
    expect(line(cash.asset_lines, 'Stock on Hand (Zoho)')).toBeCloseTo(3413.35, 2)
    expect(line(cash.asset_lines, 'Urban Road Tax Savings acct')).toBeCloseTo(-66000, 2)
    expect(line(cash.liability_lines, 'SKA Family Trust Loan a/c')).toBeCloseTo(-10000, 2)
  })

  it('knows every tax type it met', () => {
    expect(cash.reconciliation.unknown_tax_accounts).toEqual([])
  })

  it('files expenses under the statement\'s headings', () => {
    expect(cash.expense_groups.find((g) => g.lines.some((l) => l.label === 'Insurance excl Workers Comp'))?.group).toBe('Other Operating Expenses')
  })
})

describe('deriveActualCashMonth — Urban Road August 2026', () => {
  const { cash } = month('2026-08')

  it('ties to the −31,708.01 bank movement and closes on Calxa\'s September opening, 117,724.85', () => {
    expect(cash.bank_at_beginning).toBe(149432.86)
    expect(cash.net_movement).toBe(-31708.01)
    expect(cash.bank_at_end).toBe(117724.85)
  })

  it('receipts 433,837.70; GST row −835.10; net wages 40,409.25; super −5,041.88; stock +7,029.54', () => {
    expect(cash.cash_inflows).toBeCloseTo(433837.7, 1)
    expect(line(cash.liability_lines, 'GST Collected & Paid')).toBeCloseTo(-835.1, 1)
    expect(expense(cash, 'Employ - Wages & Salaries')).toBeCloseTo(40409.25, 2)
    expect(line(cash.liability_lines, 'Superannuation Payable')).toBeCloseTo(-5041.88, 2)
    expect(line(cash.asset_lines, 'Stock on Hand (Zoho)')).toBeCloseTo(7029.54, 2)
  })

  it('carries the +37,913 August entry on ATO Creditors (BAS) as what it is: 50,023 moved, 12,110 of it PAYG', () => {
    expect(line(cash.liability_lines, 'ATO Creditors (BAS)')).toBeCloseTo(37913, 2)
  })

  it('NZ Sales grossed up at the TAX003 override, USA Sales not at all', () => {
    // The NZ row carries its GST-inclusive sales plus its share of the debtors movement.
    const noDebtors = month('2026-08', { cfg: { ...cfg, debtors_account_ids: ['not-on-the-sheet'] } }).cash
    expect(line(noDebtors.income_lines, 'NZ Sales')).toBeCloseTo(50837.52 * 1.15, 2)
    expect(line(noDebtors.income_lines, 'USA Sales')).toBeCloseTo(8322.25, 2)
  })
})

describe('deriveActualCashMonth — what stops a month tying is printed, never absorbed', () => {
  it('a late $854 credit note in the P&L but not the balance sheet is its own row, and the month still ties', () => {
    const late = UR_PL_ROWS.map((r) => r.account_name === 'Returns & Allowances'
      ? { ...r, monthly_values: { ...r.monthly_values, '2026-08': Number(r.monthly_values['2026-08']) - 853.8 } }
      : r)
    const { cash } = month('2026-08', { plRows: late })
    expect(line(cash.unreconciled_lines, SYNC_GAP_LABEL)).toBeCloseTo(853.8, 2)
    expect(cash.reconciliation.sync_gap).toBeCloseTo(853.8, 2)
    expect(cash.net_movement).toBe(-31708.01)
  })

  it('no pay runs: wages print gross, and ATO Creditors (BAS) prints its raw movement', () => {
    const { cash } = month('2026-07', { payslips: false })
    expect(expense(cash, 'Employ - Wages & Salaries')).toBeCloseTo(42015.4, 2)
    expect(line(cash.liability_lines, 'ATO Creditors (BAS)')).toBeCloseTo(9688, 2)
    expect(cash.reconciliation.payslips_missing).toBe(true)
    expect(cash.net_movement).toBe(31446.33)
  })

  it('an account with no known tax type is grossed up at 0%, named, and the month still ties', () => {
    const noCanvas = taxRateLookup(UR_ACCOUNTS.filter((a) => a.account_code !== '41000'), {})
    const flow = deriveMoneyFlow(UR_BS_ROWS, '2026-07', { bankAccountIds: UR_BANK_IDS, plRows: UR_PL_ROWS })
    const cash = deriveActualCashMonth({ flow, plRows: UR_PL_ROWS, labels, taxRate: noCanvas, payslips: payslips['2026-07'], cfg })
    expect(cash.reconciliation.unknown_tax_accounts).toEqual(expect.arrayContaining(['Canvas Sales', 'NZ Sales']))
    expect(cash.net_movement).toBe(31446.33)
  })

  it('the residual row is labelled for what it is', () => {
    const { cash } = month('2026-08')
    for (const l of cash.unreconciled_lines ?? []) expect([RESIDUAL_LABEL, SYNC_GAP_LABEL]).toContain(l.label)
  })
})
