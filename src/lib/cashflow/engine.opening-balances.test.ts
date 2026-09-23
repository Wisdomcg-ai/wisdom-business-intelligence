/**
 * F3 (22 Sep 2026 system diagnostic) — opening debtors were collected twice.
 *
 * Month 0 collected the opening receivable from the balance sheet AND a
 * "first-month spillover" of month 0's own sales, which stands in for exactly
 * the same thing: collections from invoices raised before the forecast. The
 * comment in the engine claimed they were "additive, not duplicates".
 *
 * $100k/month of sales on 30 debtor days with $110k of opening debtors
 * collected $210k in July instead of $110k — a whole month of sales too much,
 * carried through the October BAS and the year-end bank. Creditors the same.
 *
 * The spillover is a FALLBACK for when the balance is unknown, per side: with a
 * balance it is not used, without one it still is. The monthly-report pack
 * already passed firstMonthSpill: false, so this brings the forecast wizard and
 * the consolidated cashflow onto the pack's footing.
 */
import { describe, it, expect } from 'vitest'
import { generateCashflowForecast } from './engine'
import { FORECAST, baseAssumptions, plLine } from './__fixtures__/small-business'

/** $100k of sales a month, nothing else — receipts are then purely a timing question. */
const salesOnly = [plLine('Sales', 'Revenue', 100_000)]
/** $40k of purchases a month, nothing else. */
const cogsOnly = [plLine('Materials', 'Cost of Sales', 40_000)]

const noGst = (over = {}) => baseAssumptions({ gst_registered: false, gst_rate: 0, gst_applicable_expense_pct: 0, ...over })

const receipts = (data: ReturnType<typeof generateCashflowForecast>, i = 0) => data.months[i].cash_inflows
const payments = (data: ReturnType<typeof generateCashflowForecast>, i = 0) => data.months[i].cash_outflows

describe('opening debtors are collected once', () => {
  it('month 0 collects the opening balance and nothing else on 30-day terms', () => {
    const data = generateCashflowForecast(
      salesOnly, null,
      noGst({ dso_days: 30, opening_trade_debtors: 110_000, opening_trade_creditors: 0 }),
      FORECAST,
    )
    // 30 debtor days moves a month's sales wholly into the next month, so July
    // collects only what was already owed on 1 July. The old engine added a
    // "spill" of July's own $100k on top and reported $210k.
    expect(receipts(data)).toBeCloseTo(110_000, 2)
  })

  it('without an opening balance the spillover still stands in for it', () => {
    const data = generateCashflowForecast(
      salesOnly, null,
      noGst({ dso_days: 30, opening_trade_debtors: 0, opening_trade_creditors: 0 }),
      FORECAST,
    )
    // Nothing is known about pre-forecast sales, so steady state is assumed:
    // July's own $100k stands in for June's invoices landing in July.
    expect(receipts(data)).toBeCloseTo(100_000, 2)
  })

  it('the duplicate is gone for the whole year, not just July', () => {
    const withBalance = generateCashflowForecast(
      salesOnly, null,
      noGst({ dso_days: 30, opening_trade_debtors: 110_000, opening_trade_creditors: 0 }),
      FORECAST,
    )
    const total = withBalance.months.reduce((sum, m) => sum + m.cash_inflows, 0)
    // July–May collected August–June (June's sales land after the year ends),
    // plus the opening balance. The old engine also counted July twice: $1.31m.
    expect(total).toBeCloseTo(100_000 * 11 + 110_000, 2)
  })
})

describe('opening creditors are paid once', () => {
  it('month 0 pays the opening balance and nothing else on 30-day terms', () => {
    const data = generateCashflowForecast(
      cogsOnly, null,
      noGst({ dpo_days: 30, dso_days: 0, opening_trade_creditors: 31_000, opening_trade_debtors: 0 }),
      FORECAST,
    )
    // The old engine also paid July's own $40k of purchases: $71k.
    expect(payments(data)).toBeCloseTo(31_000, 2)
  })

  it('without an opening balance the spillover still stands in for it', () => {
    const data = generateCashflowForecast(
      cogsOnly, null,
      noGst({ dpo_days: 30, dso_days: 0, opening_trade_creditors: 0, opening_trade_debtors: 0 }),
      FORECAST,
    )
    expect(payments(data)).toBeCloseTo(40_000, 2)
  })
})

describe('the two sides are decided independently', () => {
  it('known debtors and unknown creditors: receipts lose the spillover, payments keep it', () => {
    const data = generateCashflowForecast(
      [...salesOnly, ...cogsOnly], null,
      noGst({ dso_days: 30, dpo_days: 30, opening_trade_debtors: 110_000, opening_trade_creditors: 0 }),
      FORECAST,
    )
    expect(receipts(data)).toBeCloseTo(110_000, 2)
    expect(payments(data)).toBeCloseTo(40_000, 2)
  })
})
