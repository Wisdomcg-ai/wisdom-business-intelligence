/**
 * Phase B (CFO-only clients) — adapter budget wiring.
 *
 * The consolidation engine has emitted `consolidated.budgetLines` (business-
 * level forecast aligned to the actuals universe) since Phase 34.3, but the
 * adapter discarded it: every consolidated report rendered budget $0 /
 * has_budget:false. These tests pin the new behaviour: budgets flow through
 * with single-entity variance semantics, and a zero-filled budget universe
 * (no forecast) preserves the pre-Phase-B no-budget rendering.
 */
import { describe, it, expect } from 'vitest'
import { adaptConsolidatedToGeneratedReport } from '../useMonthlyReport'

const FY_MONTHS = ['2026-07', '2026-08', '2026-09']

function line(
  account_type: string,
  account_name: string,
  values: Record<string, number>,
) {
  const monthly_values: Record<string, number> = {}
  for (const m of FY_MONTHS) monthly_values[m] = values[m] ?? 0
  return { account_type, account_name, monthly_values }
}

function makeConsolidated(opts: {
  budget?: ReturnType<typeof line>[]
}) {
  return {
    consolidated: {
      lines: [
        line('revenue', 'Sales', { '2026-07': 100_000, '2026-08': 120_000 }),
        line('cogs', 'Materials', { '2026-07': 40_000, '2026-08': 50_000 }),
        line('opex', 'Rent', { '2026-07': 10_000, '2026-08': 10_000 }),
      ],
      budgetLines: opts.budget ?? [],
    },
  }
}

describe('adaptConsolidatedToGeneratedReport — Phase B budget wiring', () => {
  const REPORT_MONTH = '2026-08'

  it('no budget (zero-filled universe): preserves pre-Phase-B rendering', () => {
    const report = adaptConsolidatedToGeneratedReport(
      makeConsolidated({
        budget: [
          line('revenue', 'Sales', {}),
          line('cogs', 'Materials', {}),
          line('opex', 'Rent', {}),
        ],
      }),
      REPORT_MONTH,
      2027,
      'biz-1',
    )

    expect(report.has_budget).toBe(false)
    const sales = report.sections.find((s) => s.category === 'Revenue')!.lines[0]
    expect(sales.actual).toBe(120_000)
    expect(sales.ytd_actual).toBe(220_000)
    expect(sales.budget).toBe(0)
    expect(sales.variance_amount).toBe(0)
    expect(report.summary.net_profit.actual).toBe(60_000)
    expect(report.summary.net_profit.budget).toBe(0)
  })

  it('with budget: per-line values, sign conventions, YTD and annual extras', () => {
    const report = adaptConsolidatedToGeneratedReport(
      makeConsolidated({
        budget: [
          line('revenue', 'Sales', { '2026-07': 110_000, '2026-08': 110_000, '2026-09': 110_000 }),
          line('cogs', 'Materials', { '2026-07': 45_000, '2026-08': 45_000, '2026-09': 45_000 }),
          line('opex', 'Rent', { '2026-07': 12_000, '2026-08': 12_000, '2026-09': 12_000 }),
        ],
      }),
      REPORT_MONTH,
      2027,
      'biz-1',
    )

    expect(report.has_budget).toBe(true)

    // Revenue: actual 120k vs budget 110k → favourable +10k (actual - budget)
    const sales = report.sections.find((s) => s.category === 'Revenue')!.lines[0]
    expect(sales.budget).toBe(110_000)
    expect(sales.variance_amount).toBe(10_000)
    expect(sales.ytd_budget).toBe(220_000)
    expect(sales.budget_annual_total).toBe(330_000)
    expect(sales.budget_next_month).toBe(110_000)
    expect(sales.unspent_budget).toBe(330_000 - 220_000)

    // Expense: actual 50k vs budget 45k → UNfavourable -5k (budget - actual)
    const materials = report.sections.find((s) => s.category === 'Cost of Sales')!.lines[0]
    expect(materials.variance_amount).toBe(-5_000)

    // Summary: NP actual = 60k; NP budget = 110 - 45 - 12 = 53k
    expect(report.summary.net_profit.actual).toBe(60_000)
    expect(report.summary.net_profit.budget).toBe(53_000)
    expect(report.summary.net_profit.variance).toBe(7_000)
    expect(report.net_profit_row.budget_annual_total).toBe((330 - 135 - 36) * 1000)
  })

  it('budget-only account (no actuals all year) is flagged is_budget_only', () => {
    const consolidated = makeConsolidated({
      budget: [
        line('revenue', 'Sales', { '2026-07': 110_000, '2026-08': 110_000 }),
        line('opex', 'Marketing', { '2026-07': 5_000, '2026-08': 5_000 }),
        line('cogs', 'Materials', {}),
        line('opex', 'Rent', {}),
      ],
    })
    // Engine universe includes the budget-only account with zero-filled actuals.
    consolidated.consolidated.lines.push(line('opex', 'Marketing', {}))

    const report = adaptConsolidatedToGeneratedReport(
      consolidated,
      REPORT_MONTH,
      2027,
      'biz-1',
    )

    const marketing = report.sections
      .find((s) => s.category === 'Operating Expenses')!
      .lines.find((l) => l.account_name === 'Marketing')!
    expect(marketing.is_budget_only).toBe(true)
    expect(marketing.budget).toBe(5_000)
    // Rent has actuals → not budget-only even though its budget is zero.
    const rent = report.sections
      .find((s) => s.category === 'Operating Expenses')!
      .lines.find((l) => l.account_name === 'Rent')!
    expect(rent.is_budget_only).toBe(false)
  })

  it('report identity fields survive the adaptation', () => {
    const report = adaptConsolidatedToGeneratedReport(
      makeConsolidated({}),
      REPORT_MONTH,
      2027,
      'biz-1',
    )
    expect(report.is_consolidation).toBe(true)
    expect(report.business_id).toBe('biz-1')
    expect(report.report_month).toBe(REPORT_MONTH)
    expect(report.fiscal_year).toBe(2027)
  })
})
