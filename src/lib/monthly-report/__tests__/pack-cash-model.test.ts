/**
 * Cash model v2 end to end on Urban Road's real ledger and approved budget:
 * July and August as the bank's cash, September to June from the budget,
 * checked against the figures Calxa's August 2026 pack (pp23-25) prints and the
 * reverse-engineering of how it gets them (wave5 cash design, proofs 3 and 4).
 */
import { describe, it, expect } from 'vitest'
import { buildPackCashModel, deriveCashTerms, openingGst, packCashModelBasis, type CashModelInputs } from '../pack-cash-model'
import { parseCashModelConfig } from '../cash-model-config'
import { buildPackCashflowRows, type PackCashflowRow } from '../pack-cashflow-rows'
import { packCashflowChartData } from '../pack-cashflow-chart'
import { deriveMoneyFlow } from '../money-flow'
import { UR_ACCOUNTS, UR_BANK_IDS, UR_BS_ROWS, UR_CREDIT_CARD_IDS, UR_PAY_RUNS, UR_PL_ROWS } from './urban-road-ledger-fixture'
import { urbanRoadCashModel } from './urban-road-cash-model-config'
import { urbanRoadFullYear, UR_EXPENSE_GROUP_ORDER } from './urban-road-full-year-fixture'

const inputs = (over: Partial<CashModelInputs> = {}): CashModelInputs => ({
  bsRows: UR_BS_ROWS,
  plRows: UR_PL_ROWS,
  accounts: UR_ACCOUNTS,
  payRuns: UR_PAY_RUNS,
  bankAccountIds: UR_BANK_IDS,
  creditCardAccountIds: UR_CREDIT_CARD_IDS,
  fiscalYearStart: 7,
  ...over,
})

function ready(config = urbanRoadCashModel(), over: Partial<CashModelInputs> = {}, reportMonth = '2026-08') {
  const model = buildPackCashModel({ fullYear: urbanRoadFullYear(), reportMonth, config, inputs: inputs(over) })
  if (model.status !== 'ready') throw new Error(model.reason)
  return model
}

const calxaTerms = urbanRoadCashModel({ dso_days: 19, dpo_days: 29 })
const at = (model: ReturnType<typeof ready>, month: string) => model.cashflow.months.find((m) => m.month === month)!
const v = (lines: { label: string; value: number }[], label: string) => lines.find((l) => l.label === label)?.value ?? 0
const expense = (m: ReturnType<typeof at>, label: string) => v(m.expense_groups.flatMap((g) => g.lines), label)

describe('buildPackCashModel — the year, Jul 2026 to Jun 2027', () => {
  const model = ready(calxaTerms)
  const cf = model.cashflow

  it('covers the fiscal year: two actual months, then ten budget months', () => {
    expect(cf.months.map((m) => m.month)).toEqual([
      '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06',
    ])
    expect(cf.months.map((m) => m.source)).toEqual(['actual', 'actual', ...Array(10).fill('forecast')])
    expect(cf.cash_model).toMatchObject({ version: 2, last_actual_month: '2026-08', first_forecast_month: '2026-09', dso_days: 19, dpo_days: 29, basis: model.basis })
  })

  it('opens the year on the 30 June bank and the budget on the 31 August bank, each month on the last', () => {
    expect(cf.totals.bank_at_beginning).toBe(117986.53)
    expect(at(model, '2026-09').bank_at_beginning).toBe(117724.85)
    for (let i = 1; i < cf.months.length; i++) expect(cf.months[i].bank_at_beginning).toBeCloseTo(cf.months[i - 1].bank_at_end, 2)
  })

  it('each actual month\'s Net Movement is the money-flow page\'s bank movement', () => {
    for (const m of ['2026-07', '2026-08']) {
      const flow = deriveMoneyFlow(UR_BS_ROWS, m, { bankAccountIds: UR_BANK_IDS, plRows: UR_PL_ROWS })
      expect(at(model, m).net_movement).toBe(flow.bank.delta)
    }
    expect(model.reconciliation.map((r) => r.net_movement)).toEqual([31446.33, -31708.01])
  })

  it('September collects the 31 August debtors across the sales accounts by August\'s mix, with no spill of September\'s own sales', () => {
    const sep = at(model, '2026-09')
    // 279,320 × 1.1 × 11/30 + 278,428.06 × Canvas's share of August's GST-inclusive billings.
    expect(v(sep.income_lines, 'Canvas Sales')).toBeCloseTo(268331, -1)
    expect(Math.abs(v(sep.income_lines, 'Canvas Sales') - 268331)).toBeLessThan(1)
    expect(sep.income_lines.find((l) => l.label === 'Opening Debtors Collected')).toBeUndefined()
  })

  it('November is 11/30 of its own billings and 19/30 of October\'s: 0.3667 × 561,198 + 0.6333 × 307,252', () => {
    expect(Math.abs(v(at(model, '2026-11').income_lines, 'Canvas Sales') - 400366)).toBeLessThan(1)
  })

  it('pays the 31 August creditors across COGS and expenses, and times expenses on creditor days as Calxa does', () => {
    const sep = at(model, '2026-09')
    expect(Math.abs(v(sep.cogs_lines, 'Antons Canvas') - 186950)).toBeLessThan(1)
    expect(Math.abs(expense(sep, 'Marketing Digital Ad Spend') - 25002)).toBeLessThan(1)
    expect(Math.abs(expense(sep, 'Insurance excl Workers Comp') - 2611)).toBeLessThan(1)
    // Office Expenses: 500 budget, BAS Excluded, 1/30 paid in its own month.
    expect(Math.abs(expense(sep, 'Office Expenses') - 17)).toBeLessThan(1)
  })

  it('grosses NZ Sales up at 15% and USA Sales not at all', () => {
    const oct = at(model, '2026-10')
    expect(v(oct.income_lines, 'NZ Sales')).toBeCloseTo(2875, 2)
    expect(v(oct.income_lines, 'USA Sales')).toBeCloseTo(15000, 2)
  })

  it('pays wages net of PAYG under their own name, and no super expense row', () => {
    const oct = at(model, '2026-10')
    const rate = 2422 / 10503.85
    expect(expense(oct, 'Employ - Wages & Salaries')).toBeCloseTo(42015 * (1 - rate), 1)
    expect(expense(oct, 'Employ - Superannuation')).toBe(0)
  })

  it('pays the ATO Creditors (BAS) balance in September, then PAYG on the agent\'s monthly IAS dates', () => {
    const rate = 2422 / 10503.85
    expect(v(at(model, '2026-09').liability_lines, 'ATO Creditors (BAS)')).toBeCloseTo(-10741, 2)
    expect(v(at(model, '2026-10').liability_lines, 'ATO Creditors (BAS)')).toBe(0)
    expect(v(at(model, '2026-11').liability_lines, 'ATO Creditors (BAS)')).toBeCloseTo(-(42015 + 42015) * rate, 1) // 19,375.82
    expect(v(at(model, '2026-12').liability_lines, 'ATO Creditors (BAS)')).toBeCloseTo(-52519 * rate, 1) // 12,109.94
    expect(v(at(model, '2027-02').liability_lines, 'ATO Creditors (BAS)')).toBeCloseTo(-(42015 + 44788) * rate, 1) // Dec + Jan
  })

  it('pays super on payday: the 31 August payable and September\'s super in September', () => {
    expect(v(at(model, '2026-09').liability_lines, 'Superannuation Payable')).toBeCloseTo(-6302.47, 2)
    expect(v(at(model, '2026-10').liability_lines, 'Superannuation Payable')).toBeCloseTo(-5042, 2)
  })

  it('pays the first BAS in November: quarter-to-date GST plus September\'s, 37,895.34 + 13,888.10', () => {
    const nov = v(at(model, '2026-11').liability_lines, 'GST Collected & Paid')
    expect(Math.abs(nov - -51783)).toBeLessThan(2)
    expect(v(at(model, '2026-09').liability_lines, 'GST Collected & Paid')).toBe(0)
    expect(v(at(model, '2026-10').liability_lines, 'GST Collected & Paid')).toBe(0)
    expect(v(at(model, '2027-02').liability_lines, 'GST Collected & Paid')).toBeLessThan(0)
    expect(v(at(model, '2027-05').liability_lines, 'GST Collected & Paid')).toBeLessThan(0)
  })

  it('draws the chart from the same months: actual months stack their real rows, the bank line follows the mirror', () => {
    const points = packCashflowChartData(cf)
    expect(points[1].bankAtEnd).toBe(117724.85)
    expect(points[0].values.assets).toBe(at(model, '2026-07').movement_in_assets)
  })

  it('prints Actual-month balance-sheet rows, and a Total that is the year', () => {
    const rows = buildPackCashflowRows(cf, UR_EXPENSE_GROUP_ORDER)
    const row = (label: string) => rows.find((r) => r.label === label) as PackCashflowRow
    expect(row('Stock on Hand (Zoho)').values.slice(0, 2)).toEqual([3413.35, 7029.54])
    expect(row('Bank at End').total).toBe(cf.months[11].bank_at_end)
    expect(row('Net Movement').values[1]).toBe(-31708.01)
  })

  it('warns about what it could not say in the pack', () => {
    expect(model.warnings.some((w) => w.includes('$28,435 at 30 Jun 2026'))).toBe(true)
    expect(model.warnings.some((w) => w.startsWith('PAYG withheld from budget wages at 23.06%'))).toBe(true)
  })

  it('says in the basis which months are the bank\'s and that account rows are apportioned', () => {
    expect(model.basis).toBe(
      'Opening bank $117,987 at 30 Jun 2026 · Jul 2026 to Aug 2026 actual cash from the bank and balance sheet; totals are actual, each account\'s share of receipts and payments is apportioned by its P&L · approved budget Sep 2026 to Jun 2027 · debtors 19 days, creditors 29 days, expenses on creditor days · BAS Nov/Feb/May/Aug',
    )
  })
})

describe('deriveCashTerms', () => {
  it('measures Urban Road\'s own days: DSO 14.6 → 15, DPO 26.46 → 26 (the design quoted 27, rounding 26.46 up)', () => {
    const t = deriveCashTerms(inputs(), '2026-08', urbanRoadCashModel())
    if (t.status !== 'derived') throw new Error(t.reason)
    expect(t.inputs.debtors).toBeCloseTo(278428.06, 2)
    expect(t.inputs.creditors).toBeCloseTo(380205.08, 2)
    expect(t.inputs.days).toBe(92)
    expect(t.inputs.debtors / (t.inputs.billings / 92)).toBeCloseTo(14.6, 1)
    expect(t.inputs.creditors / (t.inputs.purchases / 92)).toBeCloseTo(26.5, 1)
    expect([t.dso_days, t.dpo_days]).toEqual([15, 26])
  })

  it('is unavailable with fewer than three synced months, and the model refuses rather than guess', () => {
    const short = UR_PL_ROWS.map((r) => ({ ...r, monthly_values: Object.fromEntries(Object.entries(r.monthly_values).filter(([m]) => m !== '2026-06')) }))
    expect(deriveCashTerms(inputs({ plRows: short }), '2026-08', urbanRoadCashModel()).status).toBe('unavailable')
    const model = buildPackCashModel({ fullYear: urbanRoadFullYear(), reportMonth: '2026-08', config: urbanRoadCashModel(), inputs: inputs({ plRows: short }) })
    expect(model.status).toBe('refused')
    // A number needs no derivation.
    expect(buildPackCashModel({ fullYear: urbanRoadFullYear(), reportMonth: '2026-08', config: calxaTerms, inputs: inputs({ plRows: short }) }).status).toBe('ready')
  })

  it('derived terms print as such in the basis', () => {
    expect(ready().basis).toContain('debtors 15 days, creditors 26 days (from the ledger)')
  })
})

describe('openingGst', () => {
  it('quarter to date: 31 Aug less 30 Jun, due November; the 30 June balance is reported as left over', () => {
    const g = openingGst(UR_BS_ROWS, '2026-08', urbanRoadCashModel())
    if ('reason' in g) throw new Error(g.reason)
    expect(g.dueMonth).toBe('2026-11')
    expect(g.settledEnd).toBe('2026-06-30')
    expect(g.amount).toBeCloseTo(37895.34, 2)
    expect(g.leftOver).toBeCloseTo(31515.27 - 3080.27, 2) // GST Collected & Paid, less GST adjustments' unmoved −3,080.27
  })

  it('balance: the whole account, due November', () => {
    const g = openingGst(UR_BS_ROWS, '2026-08', urbanRoadCashModel({ gst: { ...urbanRoadCashModel().gst, opening: 'balance' } }))
    if ('reason' in g) throw new Error(g.reason)
    expect(g.amount).toBeCloseTo(69410.61 - 3080.27, 2)
  })

  it('refuses when the settled period\'s balance sheet is not synced', () => {
    const noJune = UR_BS_ROWS.map((r) => ({ ...r, balances_by_date: Object.fromEntries(Object.entries(r.balances_by_date).filter(([d]) => d !== '2026-06-30')) }))
    expect('reason' in openingGst(noJune, '2026-08', urbanRoadCashModel())).toBe(true)
  })
})

describe('buildPackCashModel — fail-open', () => {
  it('refuses a month the money flow cannot prove, naming the month', () => {
    const unbalanced = UR_BS_ROWS.map((r) => r.account_name === 'Trade Debtors'
      ? { ...r, balances_by_date: { ...r.balances_by_date, '2026-07-31': Number(r.balances_by_date['2026-07-31']) + 5000 } }
      : r)
    const model = buildPackCashModel({ fullYear: urbanRoadFullYear(), reportMonth: '2026-08', config: calxaTerms, inputs: inputs({ bsRows: unbalanced }) })
    expect(model.status).toBe('refused')
    if (model.status === 'refused') expect(model.reason).toMatch(/^Jul 2026: .*doesn't balance/)
  })

  it('refuses a multi-organisation ledger — never pools two orgs', () => {
    const second = UR_BS_ROWS.slice(0, 3).map((r) => ({ ...r, tenant_id: 'other-org' }))
    const model = buildPackCashModel({ fullYear: urbanRoadFullYear(), reportMonth: '2026-08', config: calxaTerms, inputs: inputs({ bsRows: [...UR_BS_ROWS, ...second] }) })
    expect(model.status).toBe('refused')
  })

  it('refuses when there is no Full Year report to take the budget from', () => {
    expect(buildPackCashModel({ fullYear: null, reportMonth: '2026-08', config: calxaTerms, inputs: inputs() }).status).toBe('refused')
  })

  it('without pay runs, budget wages are paid gross and the coach is told', () => {
    const model = ready(calxaTerms, { payRuns: [] })
    expect(expense(at(model, '2026-10'), 'Employ - Wages & Salaries')).toBeCloseTo(42015, 2)
    expect(model.warnings.some((w) => w.includes('no pay runs are synced this year'))).toBe(true)
    expect(model.basis).toContain('PAYG not separated in Jul 2026, Aug 2026')
  })

  it('a report month at the fiscal year end is all actual and runs no budget', () => {
    const basis = packCashModelBasis({
      actualMonths: ['2026-07'], budgetMonths: [], approvedThroughout: false, opening: { amount: 1, asAt: '2026-06-30' },
      terms: null, opexOnDpo: true, basText: null, payslipsMissing: [],
    })
    expect(basis).not.toContain('budget')
  })
})

describe('parseCashModelConfig', () => {
  it('absent or disabled is off — v1', () => {
    expect(parseCashModelConfig(null)).toEqual({ status: 'off' })
    expect(parseCashModelConfig(undefined)).toEqual({ status: 'off' })
    expect(parseCashModelConfig({ enabled: false, anything: 1 })).toEqual({ status: 'off' })
  })

  it('reads the design\'s Urban Road settings', () => {
    const parsed = parseCashModelConfig(urbanRoadCashModel())
    expect(parsed.status).toBe('on')
  })

  it('an unknown key or a missing Matt input is a reason, never a silent default', () => {
    const typo = parseCashModelConfig({ ...urbanRoadCashModel(), dso_dayz: 19 })
    expect(typo.status).toBe('invalid')
    const { paygw: _omit, ...noPayg } = urbanRoadCashModel()
    const missing = parseCashModelConfig(noPayg)
    expect(missing.status).toBe('invalid')
    if (missing.status === 'invalid') expect(missing.reason).toContain('paygw')
  })
})

describe('what an actual month could not explain, on the page and in the preflight', () => {
  const late = UR_PL_ROWS.map((r) => r.account_name === 'Returns & Allowances'
    ? { ...r, monthly_values: { ...r.monthly_values, '2026-08': Number(r.monthly_values['2026-08']) - 853.8 } }
    : r)

  it('a P&L and balance sheet from different syncs print their difference as a row; cents of rounding do not', () => {
    const clean = buildPackCashflowRows(ready(calxaTerms).cashflow, UR_EXPENSE_GROUP_ORDER)
    expect(clean.some((r) => r.kind === 'unreconciled')).toBe(false)
    const rows = buildPackCashflowRows(ready(calxaTerms, { plRows: late }).cashflow, UR_EXPENSE_GROUP_ORDER)
    const gap = rows.find((r) => r.kind === 'unreconciled')!
    expect(gap.label).toBe('Difference between P&L and balance sheet syncs')
    expect(gap.values[1]).toBeCloseTo(853.8, 2)
    // Still on the Net Movement row that the bank moved by.
    expect(rows.find((r) => r.label === 'Net Movement')!.values[1]).toBe(-31708.01)
  })

  it('preflight: passes a tied model, warns on a sync gap, fails a month that does not add up', async () => {
    const { runPreflight } = await import('../preflight')
    const { deriveMoneyFlow } = await import('../money-flow')
    const report = { report_month: '2026-08', sections: [], summary: { revenue: { actual: 1 }, cogs: { actual: 0 }, opex: { actual: 0 }, net_profit: { actual: 1 } }, is_draft: true, has_budget: true } as never
    const moneyFlow = deriveMoneyFlow(UR_BS_ROWS, '2026-08', { bankAccountIds: UR_BANK_IDS, plRows: UR_PL_ROWS })
    const check = (cashflow: unknown) => runPreflight({ report, moneyFlow, cashflow: cashflow as never }).find((r) => r.key === 'cash_model_ties')!

    const tied = ready(calxaTerms).cashflow
    const clean = { ...tied, cash_model: { ...tied.cash_model!, warnings: [] } }
    expect(check(clean).status).toBe('pass')
    expect(check(ready(calxaTerms, { plRows: late }).cashflow)).toMatchObject({ status: 'warn', detail: expect.stringContaining('Difference between P&L and balance sheet syncs 853.8') })

    const broken = { ...clean, months: clean.months.map((m, i) => (i === 0 ? { ...m, net_movement: m.net_movement + 100 } : m)) }
    expect(check(broken).status).toBe('fail')
  })
})
