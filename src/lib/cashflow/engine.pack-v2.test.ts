/**
 * The engine's cash model v2 options, one at a time, on small hand-checkable
 * inputs. Urban Road's full figures are pinned in pack-cash-model.test.ts;
 * that every option is inert when absent is pinned in engine.golden.test.ts.
 */
import { describe, it, expect } from 'vitest'
import { generateCashflowForecast } from './engine'
import { SYSTEM_SCHEDULES } from './schedules'
import { FORECAST, baseAssumptions } from './__fixtures__/small-business'
import type { PLLine } from '@/app/finances/forecast/types'

const months = ['2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']
const window = { ...FORECAST, actual_start_month: '2025-07', actual_end_month: '2025-06', forecast_start_month: '2025-07' }
const line = (account_name: string, category: string, monthly: number, extra: Partial<PLLine> = {}): PLLine => ({
  account_name, category, actual_months: {}, forecast_months: Object.fromEntries(months.map((m) => [m, monthly])), ...extra,
})
const v = (ls: { label: string; value: number }[], label: string) => ls.find((l) => l.label === label)?.value ?? 0
const opex = (m: { expense_groups: { lines: { label: string; value: number }[] }[] }, label: string) => v(m.expense_groups.flatMap((g) => g.lines), label)
const schedules = { gst: SYSTEM_SCHEDULES.quarterly_feb_may_aug_nov, paygw: SYSTEM_SCHEDULES.monthly_ias_quarterly_bas_agent, super: SYSTEM_SCHEDULES.payday }

describe('firstMonthSpill: false', () => {
  it('month 0 receives only its own same-bucket sales, not a copy of its later buckets', () => {
    const lines = [line('Sales', 'Revenue', 30000)]
    const a = baseAssumptions({ dso_days: 15 })
    const spill = generateCashflowForecast(lines, null, a, window)
    const none = generateCashflowForecast(lines, null, a, window, [], { firstMonthSpill: false })
    expect(spill.months[0].cash_inflows).toBeCloseTo(33000, 2)
    expect(none.months[0].cash_inflows).toBeCloseTo(16500, 2)
    expect(none.months[1].cash_inflows).toBeCloseTo(33000, 2)
  })
})

describe('openingReceivables / openingPayables', () => {
  it('allocates the balance across the lines by weight, in the first month', () => {
    const lines = [line('Canvas', 'Revenue', 0), line('Posters', 'Revenue', 0), line('Antons', 'Cost of Sales', 0), line('Rent', 'Operating Expenses', 0)]
    const out = generateCashflowForecast(lines, null, baseAssumptions(), window, [], {
      openingReceivables: { amount: 1000, weights: { Canvas: 3, Posters: 1 } },
      openingPayables: { amount: 500, weights: { Antons: 4, Rent: 1 } },
    })
    expect(v(out.months[0].income_lines, 'Canvas')).toBeCloseTo(750, 2)
    expect(v(out.months[0].income_lines, 'Posters')).toBeCloseTo(250, 2)
    expect(v(out.months[0].cogs_lines, 'Antons')).toBeCloseTo(400, 2)
    expect(opex(out.months[0], 'Rent')).toBeCloseTo(100, 2)
    expect(out.months[1].cash_inflows).toBe(0)
  })

  it('with no weights at all, one labelled lump row — never a dropped balance', () => {
    const out = generateCashflowForecast([], null, baseAssumptions(), window, [], {
      openingReceivables: { amount: 1000, weights: { Canvas: 0 } },
      openingPayables: { amount: 500, weights: {} },
    })
    expect(v(out.months[0].income_lines, 'Opening Debtors Collected')).toBe(1000)
    expect(v(out.months[0].cogs_lines, 'Opening Creditors Paid')).toBe(500)
  })
})

describe('gstRateForLine', () => {
  const rates: Record<string, number | null> = { Canvas: 0.1, 'NZ Sales': 0.15, 'USA Sales': 0, Rent: 0.1, Insurance: null }
  const lines = [line('Canvas', 'Revenue', 1000), line('NZ Sales', 'Revenue', 1000), line('USA Sales', 'Revenue', 1000), line('Rent', 'Operating Expenses', 1000), line('Insurance', 'Operating Expenses', 1000)]
  const run = (extra = {}) => generateCashflowForecast(lines, null, baseAssumptions({ dso_days: 0, dpo_days: 0 }), window, [], {
    gstRateForLine: (l) => rates[l.account_name] ?? null, firstMonthSpill: false, ...extra,
  })

  it('grosses each line up at its own rate; an unknown rate keeps the keyword treatment', () => {
    const m = run().months[0]
    expect(v(m.income_lines, 'NZ Sales')).toBeCloseTo(1150, 2)
    expect(v(m.income_lines, 'USA Sales')).toBeCloseTo(1000, 2)
    expect(opex(m, 'Rent')).toBeCloseTo(1100, 2)
    // Keywords call insurance GST-exempt.
    expect(opex(m, 'Insurance')).toBeCloseTo(1000, 2)
  })

  it('accrues GST per line and pays it on the schedule: Jul–Sep in November', () => {
    const out = run({ schedules, liabilityLabels: { gst: 'GST Collected & Paid' } })
    // (100 + 150 + 0 − 100) a month × 3
    expect(v(out.months[4].liability_lines, 'GST Collected & Paid')).toBeCloseTo(-450, 2)
    for (const i of [0, 1, 2, 3, 5]) expect(v(out.months[i].liability_lines, 'GST Collected & Paid')).toBe(0)
    // Oct–Dec in February
    expect(v(out.months[7].liability_lines, 'GST Collected & Paid')).toBeCloseTo(-450, 2)
  })

  it('cash basis: GST on the cash as it is received and paid', () => {
    const lines2 = [line('Canvas', 'Revenue', 1100 / 1.1)]
    const out = generateCashflowForecast(lines2, null, baseAssumptions({ dso_days: 30 }), window, [], {
      gstRateForLine: () => 0.1, gstBasis: 'cash', firstMonthSpill: false, schedules: { ...schedules, gst: SYSTEM_SCHEDULES.monthly_activity_statement },
      openingReceivables: { amount: 2200, weights: { Canvas: 1 } },
    })
    // July collects only the opening debtors, whose GST the opening GST
    // liability already carries (see the next describe) — so no GST due in
    // August. August collects July's 1,100: its 100 of GST is due in September.
    expect(v(out.months[0].liability_lines, 'GST / BAS Payment')).toBe(0)
    expect(v(out.months[1].liability_lines, 'GST / BAS Payment')).toBe(0)
    expect(v(out.months[2].liability_lines, 'GST / BAS Payment')).toBeCloseTo(-100, 2)
  })
})

describe('payroll by code', () => {
  const lines = [
    line('Wages', 'Operating Expenses', 10000, { account_code: '62170' }),
    line('Super', 'Operating Expenses', 1200, { account_code: '62160' }),
    line('Staff Amenities', 'Operating Expenses', 100, { account_code: '62130' }),
  ]
  const rate = Object.fromEntries(months.map((m) => [m, 0.2]))

  it('pays wages net under their own name, never pays super as an expense, and leaves amenities alone', () => {
    const out = generateCashflowForecast(lines, null, baseAssumptions({ gst_registered: false }), window, [], {
      payroll: { wagesCodes: ['62170'], superCodes: ['62160'], paygRateByMonth: rate }, schedules,
      liabilityLabels: { paygw: 'ATO Creditors (BAS)', super: 'Superannuation Payable' },
    })
    const jul = out.months[0]
    expect(opex(jul, 'Wages')).toBeCloseTo(8000, 2)
    expect(opex(jul, 'Super')).toBe(0)
    expect(opex(jul, 'Staff Amenities')).toBeCloseTo(100, 2)
    expect(v(jul.liability_lines, 'Superannuation Payable')).toBeCloseTo(-1200, 2) // payday
    expect(v(jul.liability_lines, 'ATO Creditors (BAS)')).toBe(0)
    // The agent pattern pays June and July in August; June is before the window.
    expect(v(out.months[1].liability_lines, 'ATO Creditors (BAS)')).toBeCloseTo(-2000, 2)
    expect(v(out.months[2].liability_lines, 'ATO Creditors (BAS)')).toBeCloseTo(-2000, 2) // August's, in September
    expect(out.months[0].net_movement + out.months[1].net_movement).toBeCloseTo(-(8000 + 1200 + 100) * 2 - 2000, 2)
  })

  it('without schedules, PAYG and super accrue into the WD.5 balances and are paid on the old frequencies', () => {
    const out = generateCashflowForecast(lines, null, baseAssumptions({ gst_registered: false, payg_wh_reporting_frequency: 'monthly', super_payment_frequency: 'monthly' }), window, [], {
      payroll: { wagesCodes: ['62170'], superCodes: ['62160'], paygRateByMonth: rate },
    })
    expect(v(out.months[1].liability_lines, 'PAYG Withholding')).toBeCloseTo(-2000, 2)
    expect(v(out.months[1].liability_lines, 'Superannuation')).toBeCloseTo(-1200, 2)
  })
})

describe('openingLiabilities', () => {
  it('pays each on its month, and one already due in the first month', () => {
    const out = generateCashflowForecast([], null, baseAssumptions(), window, [], {
      schedules,
      openingLiabilities: [
        { label: 'GST Collected & Paid', kind: 'gst', amount: 37895.34, dueMonth: '2025-11' },
        { label: 'Superannuation Payable', kind: 'super', amount: 1260.47, dueMonth: '2025-06' },
        { label: 'PAYG Payroll Tax Withheld', kind: 'other', amount: 16674, dueMonth: '2025-07' },
      ],
      liabilityLabels: { gst: 'GST Collected & Paid', super: 'Superannuation Payable' },
    })
    expect(v(out.months[0].liability_lines, 'Superannuation Payable')).toBeCloseTo(-1260.47, 2)
    expect(v(out.months[0].liability_lines, 'PAYG Payroll Tax Withheld')).toBeCloseTo(-16674, 2)
    expect(v(out.months[4].liability_lines, 'GST Collected & Paid')).toBeCloseTo(-37895.34, 2)
  })
})

describe('opexTimedByDpo', () => {
  it('pays operating expenses on creditor days, as Cost of Sales is paid', () => {
    const lines = [line('Ad Spend', 'Operating Expenses', 3000)]
    const out = generateCashflowForecast(lines, null, baseAssumptions({ dpo_days: 29, gst_applicable_expense_pct: 0 }), window, [], { opexTimedByDpo: true, firstMonthSpill: false })
    expect(opex(out.months[0], 'Ad Spend')).toBeCloseTo(100, 2)
    expect(opex(out.months[1], 'Ad Spend')).toBeCloseTo(3000, 2)
  })
})

describe('gstBasis: cash, with opening debtors and creditors', () => {
  it('does not charge GST on the opening balances again — the ledger GST account the caller opens on already holds it', () => {
    const lines = [line('Canvas', 'Revenue', 0), line('Antons', 'Cost of Sales', 0)]
    const out = generateCashflowForecast(lines, null, baseAssumptions({ dso_days: 0, dpo_days: 0 }), window, [], {
      gstRateForLine: () => 0.1,
      gstBasis: 'cash',
      firstMonthSpill: false,
      openingReceivables: { amount: 1100, weights: { Canvas: 1 } },
      openingPayables: { amount: 550, weights: { Antons: 1 } },
      schedules: { ...schedules, gst: SYSTEM_SCHEDULES.monthly_activity_statement },
      liabilityLabels: { gst: 'GST Collected & Paid' },
    })
    expect(v(out.months[0].income_lines, 'Canvas')).toBeCloseTo(1100, 2)
    // July's receipts and payments are the opening balances only: no GST due in August.
    expect(v(out.months[1].liability_lines, 'GST Collected & Paid')).toBe(0)
  })
})
