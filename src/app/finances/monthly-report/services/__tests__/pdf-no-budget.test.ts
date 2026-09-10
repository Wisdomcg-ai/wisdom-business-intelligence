/**
 * A pack for a client with no budget.
 *
 * The web tab has dashed every budget and variance cell since WA.3 and raises
 * an amber banner; ReportSummaryCards drops its Budget line entirely. The PDF
 * printed `fmtCurrency(line.budget)` and `fmtVariance(line.variance_amount)`
 * unconditionally, so the coach's screen and the client's pack said different
 * things about the same month — and the pack's version was $0 budgets with the
 * whole actual as a favourable variance on every line.
 *
 * Live for the three clients whose monthly report resolves no budget.
 */
import { describe, it, expect } from 'vitest'
import { MonthlyReportPDFService } from '../monthly-report-pdf-service'
import { fixtureReport, docText } from './pdf-pack-fixture'

const noBudget = (overrides = {}) =>
  fixtureReport({
    has_budget: false,
    budget_source: 'none',
    sections: [
      {
        category: 'Revenue',
        lines: [
          {
            account_name: 'Sales',
            xero_account_name: 'Sales',
            is_budget_only: false,
            actual: 62_035,
            budget: 0,
            variance_amount: 62_035,
            variance_percent: 0,
            ytd_actual: 62_035,
            ytd_budget: 0,
            ytd_variance_amount: 62_035,
            ytd_variance_percent: 0,
            unspent_budget: 0,
            budget_next_month: 0,
            budget_annual_total: 0,
            prior_year: null,
          },
        ],
        subtotal: {
          account_name: 'Total Revenue',
          xero_account_name: 'Total Revenue',
          is_budget_only: false,
          actual: 62_035,
          budget: 0,
          variance_amount: 62_035,
          variance_percent: 0,
          ytd_actual: 62_035,
          ytd_budget: 0,
          ytd_variance_amount: 62_035,
          ytd_variance_percent: 0,
          unspent_budget: 0,
          budget_next_month: 0,
          budget_annual_total: 0,
          prior_year: null,
        },
      },
    ],
    ...overrides,
  })

describe('the PDF has the same three states as the tab', () => {
  it('does not print the actual again as a favourable variance', () => {
    const text = docText(new MonthlyReportPDFService(noBudget(), {}).generate())
    // The actual is real and appears; the $0 budget and the variance that
    // merely repeats the actual do not.
    expect(text).toContain('$62,035')
    expect(text).not.toContain('+0.0%')
  })

  it('says why, off no_budget_reason, rather than showing a wall of dashes', () => {
    const text = docText(
      new MonthlyReportPDFService(noBudget({ no_budget_reason: 'version_not_yet_effective' }), {}).generate(),
    )
    expect(text).toContain('takes effect after this month')
  })

  it('falls back to the forecast sentence when the resolver gave no reason', () => {
    const text = docText(new MonthlyReportPDFService(noBudget({ no_budget_reason: null }), {}).generate())
    expect(text).toContain('no active forecast was found for FY2027')
  })

  it('leaves a budgeted pack showing its budget figures', () => {
    const text = docText(new MonthlyReportPDFService(fixtureReport(), {}).generate())
    expect(text).toContain('$90,000')
    expect(text).not.toContain('No budget for this month')
  })
})
