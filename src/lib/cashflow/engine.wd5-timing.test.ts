/**
 * WD.5 — the movement rows that make Bank at End real.
 *
 * The defect family: every ATO/super payment used to sweep up the CURRENT
 * month's accrual too. An October BAS (for Jul–Sep) also paid October's GST;
 * quarterly super in January included January's; monthly GST reporters paid
 * the current month instead of "the 21st of the following month". And GST
 * input credits on stock/asset purchases were added to the month's GST-paid
 * AFTER the accrual had been rolled, so they never reduced any BAS.
 *
 * These tests pin the corrected semantics: a payment settles the OPENING
 * balance (owed at last month-end); current-month accruals roll forward.
 * Plus the CASH-CONT internal continuity net: bank chains exactly and
 * net_movement equals the sum of its displayed parts — every month.
 */
import { describe, it, expect } from 'vitest'
import { generateCashflowForecast } from './engine'
import {
  FY_MONTHS,
  FORECAST,
  baseAssumptions,
  plLine,
} from './__fixtures__/small-business'
import type { CashflowForecastData, CashflowForecastMonth } from '@/app/finances/forecast/types'

const month = (data: CashflowForecastData, mk: string): CashflowForecastMonth => {
  const m = data.months.find((x) => x.month === mk)
  if (!m) throw new Error(`month ${mk} missing`)
  return m
}

const liabilityLine = (m: CashflowForecastMonth, label: string) =>
  m.liability_lines.find((l) => l.label === label)

/**
 * Revenue-only world: $100,000/mo accrual revenue (ex-GST). The engine
 * grosses cash receipts up to $110,000 GST-inclusive ⇒ $10,000 GST/mo.
 */
const revenueOnly = () => [
  plLine('Sales', 'Revenue', 100_000, { actualMonths: [FY_MONTHS[0]], forecastMonths: FY_MONTHS.slice(1) }),
]

describe('WD.5 — quarterly BAS covers the QUARTER, not the payment month', () => {
  // DSO 0 so cash lands in its own month and each month accrues exactly 10k.
  const data = generateCashflowForecast(
    revenueOnly(), null,
    baseAssumptions({ dso_days: 0, dpo_days: 0, gst_applicable_expense_pct: 0 }),
    FORECAST,
  )

  it("October pays Jul+Aug+Sep GST (3 months), NOT October's too", () => {
    const oct = liabilityLine(month(data, '2025-10'), 'GST / BAS Payment')
    expect(oct).toBeTruthy()
    // 3 × 10,000 — the old code paid 4 × 10,000 here.
    expect(Math.abs(oct!.value)).toBeCloseTo(30_000, 0)
  })

  it('February pays the full Oct-Dec quarter PLUS January (accrued since)', () => {
    // Payment months are Feb/Apr/Jul/Oct: the Oct–Dec quarter is settled in
    // February, by which time January has also accrued — opening balance at
    // 1 Feb is Oct+Nov+Dec+Jan = 40k. (The engine models payment months, not
    // per-quarter earmarking; what matters is nothing is paid EARLY.)
    const feb = liabilityLine(month(data, '2026-02'), 'GST / BAS Payment')
    expect(Math.abs(feb!.value)).toBeCloseTo(40_000, 0)
  })

  it('no BAS line in a non-payment month', () => {
    expect(liabilityLine(month(data, '2025-11'), 'GST / BAS Payment')).toBeUndefined()
  })
})

describe('WD.5 — monthly GST reporter pays one month in arrears', () => {
  const data = generateCashflowForecast(
    revenueOnly(), null,
    baseAssumptions({
      dso_days: 0, dpo_days: 0, gst_applicable_expense_pct: 0,
      gst_reporting_frequency: 'monthly',
      opening_gst_liability: 7_500,
    }),
    FORECAST,
  )

  it("month 1 pays the OPENING liability, not month 1's own GST", () => {
    const m1 = liabilityLine(month(data, FY_MONTHS[0]), 'GST / BAS Payment')
    expect(Math.abs(m1!.value)).toBeCloseTo(7_500, 0)
  })

  it("month 2 pays month 1's net GST", () => {
    const m2 = liabilityLine(month(data, FY_MONTHS[1]), 'GST / BAS Payment')
    expect(Math.abs(m2!.value)).toBeCloseTo(10_000, 0)
  })
})

describe('WD.5 — asset/stock GST credits now reach the BAS', () => {
  it('a big stock purchase reduces the next quarterly BAS', () => {
    const withStock = generateCashflowForecast(
      revenueOnly(), null,
      baseAssumptions({
        dso_days: 0, dpo_days: 0, gst_applicable_expense_pct: 0,
        // $50k (ex-GST) stock purchase in August ⇒ $5k input credit.
        planned_stock_changes: { '2025-08': 50_000 },
      }),
      FORECAST,
    )
    const without = generateCashflowForecast(
      revenueOnly(), null,
      baseAssumptions({ dso_days: 0, dpo_days: 0, gst_applicable_expense_pct: 0 }),
      FORECAST,
    )
    const basWith = Math.abs(liabilityLine(month(withStock, '2025-10'), 'GST / BAS Payment')!.value)
    const basWithout = Math.abs(liabilityLine(month(without, '2025-10'), 'GST / BAS Payment')!.value)
    // The credit was previously dropped entirely (both BAS equal).
    expect(basWithout - basWith).toBeCloseTo(5_000, 0)
  })
})

describe('WD.5 — CASH-CONT: internal continuity holds every month', () => {
  const data = generateCashflowForecast(
    [
      ...revenueOnly(),
      plLine('Materials', 'Cost of Sales', 30_000),
      plLine('Rent', 'Operating Expenses', 8_000),
    ],
    null,
    baseAssumptions({
      opening_gst_liability: 5_000,
      opening_super_liability: 3_000,
      planned_stock_changes: { '2025-09': 10_000 },
      loans: [{ name: 'Van', balance: 20_000, interest_rate: 0.08, monthly_repayment: 800, is_interest_only: false }],
    }),
    FORECAST,
  )

  it('bank chains exactly: beginning[i+1] === end[i], first = opening', () => {
    expect(data.months[0].bank_at_beginning).toBeCloseTo(100_000, 2)
    for (let i = 1; i < data.months.length; i++) {
      expect(data.months[i].bank_at_beginning).toBeCloseTo(data.months[i - 1].bank_at_end, 2)
    }
  })

  it('net_movement equals the sum of its displayed parts — no invisible movements', () => {
    for (const m of data.months) {
      const parts = m.cash_inflows - m.cash_outflows + m.movement_in_assets + m.movement_in_liabilities + m.other_inflows
      expect(m.net_movement).toBeCloseTo(parts, 1)
      expect(m.bank_at_end).toBeCloseTo(m.bank_at_beginning + m.net_movement, 1)
    }
  })
})

describe('WD.5 — quarterly super pays the opening balance only', () => {
  it("January super payment excludes January's own accrual", () => {
    // Payroll fixture: constant super per month.
    const payroll = {
      wages_admin_monthly: {},
      wages_cogs_monthly: {},
      payg_monthly: {},
      superannuation_monthly: Object.fromEntries(FY_MONTHS.map((m) => [m, 2_000])),
    } as any
    const data = generateCashflowForecast(
      revenueOnly(), payroll,
      baseAssumptions({ dso_days: 0, dpo_days: 0 }),
      FORECAST,
    )
    // Super payment months: Jan/Apr/Jul/Oct. October pays Jul+Aug+Sep.
    const oct = liabilityLine(month(data, '2025-10'), 'Superannuation')
    expect(Math.abs(oct!.value)).toBeCloseTo(6_000, 0)
    // January pays Oct+Nov+Dec — NOT January's 2k as well.
    const jan = liabilityLine(month(data, '2026-01'), 'Superannuation')
    expect(Math.abs(jan!.value)).toBeCloseTo(6_000, 0)
  })
})
