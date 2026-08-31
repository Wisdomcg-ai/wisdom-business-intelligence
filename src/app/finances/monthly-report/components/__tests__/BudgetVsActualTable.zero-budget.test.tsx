/**
 * WA.3 — a missing budget must never render as a favourable variance.
 *
 * Envisage Mar-26 is stored in production showing revenue "+$62,035, 0.0%"
 * against a budget that did not exist — `calcVariance` returns the full actual
 * as the variance and 0% when budget is 0, and the honest explanation was an
 * amber strip BELOW ~50 rows of table. Three-state rule (value / empty /
 * could-not-compare): no budget → Budget and Variance cells render "—", and
 * the explanation leads the table.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import BudgetVsActualTable from '../BudgetVsActualTable'
import type { GeneratedReport, ReportLine, MonthlyReportSettings } from '../../types'

function line(partial: Partial<ReportLine>): ReportLine {
  return {
    account_name: 'x',
    xero_account_name: 'x',
    is_budget_only: false,
    actual: 0, budget: 0, variance_amount: 0, variance_percent: 0,
    ytd_actual: 0, ytd_budget: 0, ytd_variance_amount: 0, ytd_variance_percent: 0,
    unspent_budget: 0, budget_next_month: 0, budget_annual_total: 0,
    prior_year: null,
    ...partial,
  }
}

const settings: MonthlyReportSettings = {
  business_id: 'b1',
  sections: {
    revenue_detail: true, cogs_detail: true, opex_detail: true,
    payroll_detail: false, subscription_detail: false, balance_sheet: false,
    cashflow: false, trend_charts: false,
    chart_cash_runway: false, chart_cumulative_net_cash: false,
    chart_working_capital_gap: false, chart_revenue_vs_expenses: false,
    chart_revenue_breakdown: false, chart_variance_heatmap: false,
    chart_budget_burn_rate: false, chart_break_even: false,
    chart_team_cost_pct: false, chart_cost_per_employee: false,
    chart_subscription_creep: false,
  },
  show_prior_year: false,
  show_ytd: false,
  show_unspent_budget: false,
  show_budget_next_month: false,
  show_budget_annual_total: false,
  budget_forecast_id: null,
}

function reportWith(overrides: Partial<GeneratedReport>): GeneratedReport {
  const rev = line({ account_name: 'Consulting Income', actual: 62_035, variance_amount: 62_035 })
  return {
    business_id: 'b1',
    report_month: '2026-03',
    fiscal_year: 2026,
    settings,
    sections: [
      { category: 'Revenue', lines: [rev], subtotal: line({ account_name: 'Total Revenue', actual: 62_035, variance_amount: 62_035 }) },
    ],
    summary: {
      revenue: { actual: 62_035, budget: 0, variance: 62_035, variance_percent: 0 },
      cogs: { actual: 0, budget: 0, variance: 0, variance_percent: 0 },
      gross_profit: { actual: 62_035, budget: 0, variance: 62_035, gp_percent: 100 },
      opex: { actual: 0, budget: 0, variance: 0, variance_percent: 0 },
      net_profit: { actual: 62_035, budget: 0, variance: 62_035, np_percent: 100 },
    },
    gross_profit_row: line({ account_name: 'Gross Profit', actual: 62_035, variance_amount: 62_035 }),
    net_profit_row: line({ account_name: 'Net Profit', actual: 62_035, variance_amount: 62_035 }),
    is_draft: false,
    unreconciled_count: 0,
    has_budget: false,
    ...overrides,
  }
}

describe('BudgetVsActualTable — no budget (the Envisage Mar-26 shape)', () => {
  it('renders "—" in Budget and Variance cells, not a $62k favourable variance', () => {
    render(<BudgetVsActualTable report={reportWith({})} />)
    // The actual is real and appears (line + subtotal + Net Profit row); the
    // variance cells that used to duplicate it are dashed.
    expect(screen.getAllByText('$62,035').length).toBe(3)
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(6)
    // The divide-by-zero percent lie is gone entirely.
    expect(screen.queryByText('+0.0%')).toBeNull()
  })

  it('leads with the explanation banner instead of trailing the table', () => {
    const { container } = render(<BudgetVsActualTable report={reportWith({})} />)
    const banner = screen.getByText(/No budget forecast found/)
    const table = container.querySelector('table')
    expect(banner).toBeTruthy()
    expect(table).toBeTruthy()
    // Banner precedes the table in document order.
    expect(
      banner.compareDocumentPosition(table!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})

describe('BudgetVsActualTable — $0-budget line inside a budgeted report', () => {
  it('keeps the real dollar variance but drops the "0.0%"', () => {
    const unbudgeted = line({
      account_name: 'Legal expenses', actual: 1_940, budget: 0,
      variance_amount: -1_940, variance_percent: 0,
    })
    const budgeted = line({
      account_name: 'Rent', actual: 500, budget: 400,
      variance_amount: -100, variance_percent: -25,
    })
    const report = reportWith({
      has_budget: true,
      sections: [
        {
          category: 'Operating Expenses',
          lines: [unbudgeted, budgeted],
          subtotal: line({ account_name: 'Total Operating Expenses', actual: 2_440, budget: 400, variance_amount: -2_040, variance_percent: -510 }),
        },
      ],
    })
    render(<BudgetVsActualTable report={report} />)
    // Unbudgeted overspend still shows as a real dollar variance…
    expect(screen.getAllByText('-$1,940').length).toBeGreaterThanOrEqual(1)
    // …but its percent cell is "—" while the budgeted line keeps its percent.
    expect(screen.getByText('-25.0%')).toBeTruthy()
    expect(screen.queryByText('+0.0%')).toBeNull()
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1)
  })
})
