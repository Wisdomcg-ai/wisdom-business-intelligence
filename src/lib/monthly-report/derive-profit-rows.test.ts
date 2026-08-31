/**
 * WA.1 — canonical profit structure.
 *
 * Pins the corrected P&L shape, signed off 31 Aug 2026 and confirmed against
 * the Calxa packs the monthly report replaces:
 *
 *   Gross Profit     = Revenue − COGS                (trading only)
 *   Operating Profit = GP − Operating Expenses
 *   Net Profit       = OP + Other Income − Other Expenses
 *
 * The old derivations folded Other Income into revenue (inflating GP and GP%)
 * and Other Expenses into opex — and the PDF then printed both again as their
 * own rows, so the summary page did not foot. Net Profit's VALUE is unchanged
 * by the restructure; these tests pin that invariance too.
 */
import { describe, it, expect } from 'vitest'
import { deriveProfitRows, type ReportLine } from './shared'

/** Build a section subtotal with sensible defaults. */
function line(partial: Partial<ReportLine>): ReportLine {
  return {
    account_name: 'x',
    xero_account_name: null,
    is_budget_only: false,
    actual: 0, budget: 0, variance_amount: 0, variance_percent: 0,
    ytd_actual: 0, ytd_budget: 0, ytd_variance_amount: 0, ytd_variance_percent: 0,
    unspent_budget: 0, budget_next_month: 0, budget_annual_total: 0,
    prior_year: null,
    ...partial,
  }
}

// A worked example with every section present. Chosen so each derived figure
// is distinct and hand-checkable:
//   Revenue 1000/900, COGS 400/350, OpEx 300/250, OtherInc 50/40, OtherExp 20/10
const FULL = {
  revenue: line({ actual: 1000, budget: 900, ytd_actual: 5000, ytd_budget: 4500, budget_annual_total: 12000, budget_next_month: 950, prior_year: 800 }),
  cogs: line({ actual: 400, budget: 350, ytd_actual: 2000, ytd_budget: 1750, budget_annual_total: 4000, budget_next_month: 360, prior_year: 300 }),
  opex: line({ actual: 300, budget: 250, ytd_actual: 1500, ytd_budget: 1250, budget_annual_total: 3000, budget_next_month: 260, prior_year: 200 }),
  otherIncome: line({ actual: 50, budget: 40, ytd_actual: 250, ytd_budget: 200, budget_annual_total: 500, budget_next_month: 45, prior_year: 30 }),
  otherExpenses: line({ actual: 20, budget: 10, ytd_actual: 100, ytd_budget: 50, budget_annual_total: 120, budget_next_month: 15, prior_year: 5 }),
  hasBudget: true,
}

describe('deriveProfitRows — structure', () => {
  const d = deriveProfitRows(FULL)

  it('Gross Profit excludes Other Income and Other Expenses', () => {
    expect(d.gross_profit_row.actual).toBe(600) // 1000 − 400, NOT 1050 − 400
    expect(d.gross_profit_row.budget).toBe(550)
    expect(d.summary.gross_profit.actual).toBe(600)
  })

  it('GP% is against trading revenue only', () => {
    expect(d.summary.gross_profit.gp_percent).toBe(60) // 600/1000, not 650/1050
  })

  it('Operating Profit = GP − OpEx', () => {
    expect(d.operating_profit_row.actual).toBe(300) // 600 − 300
    expect(d.operating_profit_row.budget).toBe(300) // 550 − 250
    expect(d.summary.operating_profit.actual).toBe(300)
  })

  it('Net Profit = OP + Other Income − Other Expenses', () => {
    expect(d.net_profit_row.actual).toBe(330) // 300 + 50 − 20
    expect(d.net_profit_row.budget).toBe(330) // 300 + 40 − 10
  })

  it('Net Profit VALUE equals the old folded formula (restructure moves GP, not NP)', () => {
    const old = (1000 + 50) - 400 - (300 + 20)
    expect(d.net_profit_row.actual).toBe(old)
  })

  it('summary.revenue and summary.opex are trading-only', () => {
    expect(d.summary.revenue.actual).toBe(1000)
    expect(d.summary.opex.actual).toBe(300)
  })

  it('Other Income / Other Expenses appear once, as their own summary entries', () => {
    expect(d.summary.other_income.actual).toBe(50)
    expect(d.summary.other_expenses.actual).toBe(20)
    // expense-like variance sign: budget − actual (over-spend is negative)
    expect(d.summary.other_expenses.variance).toBe(-10)
    // revenue-like variance sign for other income
    expect(d.summary.other_income.variance).toBe(10)
  })

  it('the summary foots: rev − cogs = GP; GP − opex = OP; OP + oi − oe = NP', () => {
    const s = d.summary
    expect(s.revenue.actual - s.cogs.actual).toBe(s.gross_profit.actual)
    expect(s.gross_profit.actual - s.opex.actual).toBe(s.operating_profit.actual)
    expect(s.operating_profit.actual + s.other_income.actual - s.other_expenses.actual).toBe(s.net_profit.actual)
  })
})

describe('deriveProfitRows — YTD, annual, next-month, prior-year', () => {
  const d = deriveProfitRows(FULL)

  it('YTD follows the same structure', () => {
    expect(d.gross_profit_row.ytd_actual).toBe(3000)   // 5000 − 2000
    expect(d.operating_profit_row.ytd_actual).toBe(1500) // 3000 − 1500
    expect(d.net_profit_row.ytd_actual).toBe(1650)     // 1500 + 250 − 100
  })

  it('annual budget totals include the other sections only at NP', () => {
    expect(d.gross_profit_row.budget_annual_total).toBe(8000)  // 12000 − 4000
    expect(d.operating_profit_row.budget_annual_total).toBe(5000)
    expect(d.net_profit_row.budget_annual_total).toBe(5380)    // 5000 + 500 − 120
  })

  it('budget next month includes other sections at NP (old code dropped them)', () => {
    expect(d.gross_profit_row.budget_next_month).toBe(590)   // 950 − 360
    expect(d.operating_profit_row.budget_next_month).toBe(330)
    expect(d.net_profit_row.budget_next_month).toBe(360)     // 330 + 45 − 15
  })

  it('prior year follows the same structure', () => {
    expect(d.gross_profit_row.prior_year).toBe(500)     // 800 − 300
    expect(d.operating_profit_row.prior_year).toBe(300) // 500 − 200
    expect(d.net_profit_row.prior_year).toBe(325)       // 300 + 30 − 5
  })

  it('unspent budget = annual − YTD actual', () => {
    expect(d.gross_profit_row.unspent_budget).toBe(5000)  // 8000 − 3000
    expect(d.net_profit_row.unspent_budget).toBe(3730)    // 5380 − 1650
  })
})

describe('deriveProfitRows — edge cases', () => {
  it('missing sections are treated as zero', () => {
    const d = deriveProfitRows({
      revenue: line({ actual: 100, ytd_actual: 100 }),
      hasBudget: false,
    })
    expect(d.gross_profit_row.actual).toBe(100)
    expect(d.operating_profit_row.actual).toBe(100)
    expect(d.net_profit_row.actual).toBe(100)
  })

  it('no budget zeroes unspent instead of producing "0 − YTD actual"', () => {
    const d = deriveProfitRows({
      revenue: line({ actual: 100, ytd_actual: 500 }),
      hasBudget: false,
    })
    expect(d.gross_profit_row.unspent_budget).toBe(0)
    expect(d.net_profit_row.unspent_budget).toBe(0)
  })

  it('prior year stays null when no section carries prior-year data', () => {
    const d = deriveProfitRows({
      revenue: line({ actual: 100, prior_year: null }),
      cogs: line({ actual: 40, prior_year: null }),
      hasBudget: true,
    })
    expect(d.gross_profit_row.prior_year).toBeNull()
    expect(d.operating_profit_row.prior_year).toBeNull()
    expect(d.net_profit_row.prior_year).toBeNull()
  })

  it('zero budgets produce 0% variance, never NaN/Infinity', () => {
    const d = deriveProfitRows({ revenue: line({ actual: 100 }), hasBudget: true })
    expect(d.net_profit_row.variance_percent).toBe(0)
    expect(d.summary.net_profit.np_percent).toBe(100) // 100/100 revenue base
    expect(Number.isFinite(d.summary.gross_profit.gp_percent)).toBe(true)
  })

  it('Sharon King Jul-26 shape: GP no longer carries the $460.69 Other Income budget', () => {
    // From the stored snapshot that motivated this fix: GP budget printed as
    // 88,515.69 = (125,730 + 460.69) − 37,675. Correct is 88,055.
    const d = deriveProfitRows({
      revenue: line({ budget: 125_730 }),
      cogs: line({ budget: 37_675 }),
      otherIncome: line({ budget: 460.69 }),
      hasBudget: true,
    })
    expect(d.gross_profit_row.budget).toBeCloseTo(88_055, 2)
  })
})
