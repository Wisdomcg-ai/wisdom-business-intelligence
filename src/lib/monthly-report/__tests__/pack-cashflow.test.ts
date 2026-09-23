/**
 * The cashflow composition the monthly-report page did inline between its
 * fetches, now shared with the preview harness. Pinned against the engine run
 * the way the page used to run it, so the lift changed where the code lives
 * and nothing about what the page prints.
 */
import { describe, it, expect } from 'vitest'
import {
  buildPackCashflowForecast,
  mergeCashflowAssumptions,
  packCashflowBasisFor,
  packCashflowPlLines,
  packMonthLabel,
} from '../pack-cashflow'
import { applyPackOpening, buildPackCashflowLines } from '../pack-cashflow-lines'
import type { OpeningBank } from '../opening-bank'
import type { FullYearReport } from '@/app/finances/monthly-report/types'
import { generateCashflowForecast, getDefaultCashflowAssumptions, KEYWORD_EXPENSE_GROUP_ORDER } from '@/lib/cashflow/engine'
import { FORECAST, plLine, smallBusinessPL } from '@/lib/cashflow/__fixtures__/small-business'

const READ: OpeningBank = { status: 'read', amount: 167629.81, asAt: '2025-06-30' }

const fullYear = (): FullYearReport => ({
  sections: [{
    category: 'Revenue',
    lines: [{
      account_name: 'Canvas Sales', category: 'Revenue',
      months: ['2025-07', '2025-08', '2025-09'].map((m, i) => ({
        month: m, actual: i < 2 ? 337402 - i * 41575 : 0, budget: 371142, approved_budget: 279320, prior_year: 0,
        source: i < 2 ? 'actual' : 'forecast',
      })),
      projected_total: 0, annual_budget: 0, approved_annual_budget: 0, variance_amount: 0, variance_percent: 0,
    }],
  }],
} as unknown as FullYearReport)

describe('mergeCashflowAssumptions', () => {
  it('is the defaults when nothing is saved', () => {
    expect(mergeCashflowAssumptions(null)).toEqual(getDefaultCashflowAssumptions())
    expect(mergeCashflowAssumptions(undefined)).toEqual(getDefaultCashflowAssumptions())
  })

  it('lays saved values over the defaults, never leaving loans or stock changes undefined', () => {
    const merged = mergeCashflowAssumptions({ dso_days: 45, loans: undefined, planned_stock_changes: undefined })
    expect(merged.dso_days).toBe(45)
    expect(merged.loans).toEqual([])
    expect(merged.planned_stock_changes).toEqual({})
  })
})

describe('packCashflowPlLines', () => {
  it('prefers the Full Year composition and falls back to the forecast\'s own lines', () => {
    const forecastLines = smallBusinessPL()
    expect(packCashflowPlLines(null, '2025-08', forecastLines)).toBe(forecastLines)
    const composed = packCashflowPlLines(fullYear(), '2025-08', forecastLines)
    expect(composed).toEqual(buildPackCashflowLines(fullYear(), '2025-08').lines)
    expect(composed[0].actual_months).toEqual({ '2025-07': 337402, '2025-08': 295827 })
  })
})

describe('buildPackCashflowForecast', () => {
  it('is exactly the engine run the page used to make', () => {
    const saved = { dso_days: 45, opening_trade_debtors: 267324, opening_bank_balance: 265684.92, balance_date: '2025-07-31' }
    const built = buildPackCashflowForecast({
      fullYear: fullYear(), reportMonth: '2025-08', forecast: FORECAST, forecastLines: smallBusinessPL(), savedAssumptions: saved, opening: READ,
    })
    const plLines = buildPackCashflowLines(fullYear(), '2025-08').lines
    const assumptions = { ...getDefaultCashflowAssumptions(), ...saved, loans: [], planned_stock_changes: {} }
    const byHand = generateCashflowForecast(
      plLines, null, applyPackOpening(assumptions as never, READ, FORECAST.actual_start_month), FORECAST, [], { signedExpenses: true },
    )
    // The engine run, plus the statement and group order the page prints rows in.
    expect(built).toEqual({ ...byHand, line_order: ['Canvas Sales'], expense_group_order: [...KEYWORD_EXPENSE_GROUP_ORDER] })
    // The read opening replaced the synced one, and the synced debtors were dropped.
    expect(built!.assumptions.opening_bank_balance).toBe(167629.81)
    expect(built!.assumptions.opening_trade_debtors).toBe(0)
  })

  it('refuses an opening read for a different year than the engine starts in', () => {
    const built = buildPackCashflowForecast({
      fullYear: null, reportMonth: '2025-08', forecast: FORECAST, forecastLines: smallBusinessPL(), savedAssumptions: null,
      opening: { status: 'read', amount: 5, asAt: '2026-06-30' },
    })
    expect(built!.assumptions.opening_bank_balance).toBe(0)
    expect(built!.assumptions.balance_date).toBe('')
  })

  it("keeps the engine's abs on the forecast's own lines, where an expense's sign means nothing", () => {
    // Prod forecast 9e9c3f8f stores Wages and Salaries actuals as a
    // cumulative year-to-date series with one −659,999.88 reversal. On the
    // fallback path — no Full Year report — that month is still a payment.
    const wages = plLine('Wages and Salaries', 'Operating Expenses', -659999.88)
    const built = buildPackCashflowForecast({
      fullYear: null, reportMonth: '2025-08', forecast: FORECAST, forecastLines: [wages], savedAssumptions: null, opening: READ,
    })!
    const byHand = generateCashflowForecast(
      [wages], null, applyPackOpening(mergeCashflowAssumptions(null), READ, FORECAST.actual_start_month), FORECAST,
    )
    expect(built.months[0].cash_outflows).toBeGreaterThan(0)
    expect(built.months.map((m) => m.cash_outflows)).toEqual(byHand.months.map((m) => m.cash_outflows))
  })

  it('answers null when there are no lines to run', () => {
    expect(buildPackCashflowForecast({
      fullYear: null, reportMonth: '2025-08', forecast: FORECAST, forecastLines: [], savedAssumptions: null, opening: READ,
    })).toBeNull()
  })
})

describe('packCashflowBasisFor', () => {
  it('reads the opening off the cashflow that will be printed', () => {
    const cf = buildPackCashflowForecast({
      fullYear: fullYear(), reportMonth: '2025-08', forecast: FORECAST, forecastLines: [], savedAssumptions: null, opening: READ,
    })
    expect(packCashflowBasisFor(fullYear(), '2025-08', cf)).toBe(
      'Opening bank $167,630 at 30 Jun 2025 · Jul 2025 to Aug 2025 from the actual P&L, cash timing estimated · ' +
        'approved budget for Sep 2025 · debtors 30 days, cost-of-sales creditors 30 days',
    )
    expect(packCashflowBasisFor(null, '2025-08', null)).toBeNull()
  })
})

describe('packMonthLabel', () => {
  it("prints September as the table header does, never en-AU's \"Sept\"", () => {
    expect(packMonthLabel('2026-09')).toBe('Sep 2026')
    expect(packMonthLabel('2027-06')).toBe('Jun 2027')
    expect(packMonthLabel('not-a-month')).toBe('not-a-month')
  })
})
