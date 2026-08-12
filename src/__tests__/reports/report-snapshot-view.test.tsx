/**
 * Client-facing report page (Plan 35-06, delivered 13 Aug 2026).
 *
 * The page a CLIENT sees when they click "View Report" in the email. It must
 * render entirely from the frozen snapshot — never live data — and degrade
 * gracefully on the payload shapes that actually exist in production
 * (including one row whose `report` is null).
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ReportSnapshotView from '@/app/reports/view/[token]/ReportSnapshotView'

const line = (name: string, actual: number, budget = 0, variance = 0) => ({
  account_name: name,
  xero_account_name: name,
  is_budget_only: false,
  actual,
  budget,
  variance_amount: variance,
  variance_percent: 0,
  ytd_actual: actual,
  ytd_budget: budget,
  ytd_variance_amount: variance,
  ytd_variance_percent: 0,
  unspent_budget: 0,
  budget_next_month: 0,
  budget_annual_total: 0,
  prior_year: null,
})

function makeSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    captured_at: '2026-08-13T00:00:00Z',
    business: { id: 'b1', name: 'Dragon Roofing', slug: null, industry: 'Construction' },
    period: { month: '2026-07-01', fiscal_year: 2027, label: 'July 2026' },
    coach: { name: 'Matt Malouf', email: 'matt@wisdomcg.com.au' },
    report: {
      report_month: '2026-07',
      fiscal_year: 2027,
      has_budget: true,
      summary: {
        revenue: { actual: 1_230_584, budget: 1_360_284, variance: -129_700, variance_percent: -9.5 },
        cogs: { actual: 763_805, budget: 812_090, variance: 48_285, variance_percent: 5.9 },
        gross_profit: { actual: 466_779, budget: 548_194, variance: -81_415, gp_percent: 37.9 },
        opex: { actual: 217_591, budget: 355_446, variance: 137_855, variance_percent: 38.8 },
        net_profit: { actual: 249_188, budget: 192_748, variance: 56_440, np_percent: 20.2 },
      },
      sections: [
        { category: 'Revenue', lines: [line('Sales - Insurance', 950_933, 1_000_000, -49_067)], subtotal: line('Total Revenue', 1_230_584, 1_360_284, -129_700) },
        { category: 'Cost of Sales', lines: [line('Tradies Contractors', 496_230, 520_000, 23_770)], subtotal: line('Total Cost of Sales', 763_805, 812_090, 48_285) },
      ],
      gross_profit_row: line('Gross Profit', 466_779, 548_194, -81_415),
      net_profit_row: line('Net Profit', 249_188, 192_748, 56_440),
    },
    commentary: {
      'Tradies Contractors': { coach_note: 'Subcontractor spend tracked below plan this month.', vendor_summary: [] },
      'Empty Note': { coach_note: '   ', vendor_summary: [] },
    },
    settings_applied: { sections: {}, template_id: null },
    ...overrides,
  } as never
}

describe('client report page', () => {
  it('renders the headline scorecard, the detail and the coach notes', () => {
    render(<ReportSnapshotView snapshot={makeSnapshot()} snapshotTakenAt="2026-08-13T00:00:00Z" />)

    expect(screen.getByText('Dragon Roofing')).toBeInTheDocument()
    expect(screen.getByText(/July 2026 financial report/)).toBeInTheDocument()

    // Scorecard headline figures (whole dollars, no cents). The same figure
    // legitimately appears twice — scorecard + section subtotal — so assert
    // on presence rather than uniqueness.
    expect(screen.getAllByText('$1,230,584').length).toBeGreaterThan(0)
    expect(screen.getAllByText('$249,188').length).toBeGreaterThan(0)
    // Revenue is shown against budget in the scorecard.
    expect(screen.getAllByText(/vs budget/).length).toBeGreaterThan(0)

    // Detail rows + subtotals.
    expect(screen.getByText('Sales - Insurance')).toBeInTheDocument()
    expect(screen.getByText('Total Cost of Sales')).toBeInTheDocument()
    expect(screen.getByText('Net Profit')).toBeInTheDocument()

    // Budget columns present because has_budget is true.
    expect(screen.getByText('Budget')).toBeInTheDocument()
    expect(screen.getByText('Difference')).toBeInTheDocument()

    // Coach commentary shown; blank notes filtered out.
    expect(screen.getByText(/Subcontractor spend tracked below plan/)).toBeInTheDocument()
    expect(screen.queryByText('Empty Note')).not.toBeInTheDocument()
  })

  it('hides budget columns entirely when the report has no budget', () => {
    const snap = makeSnapshot()
    ;(snap as never as { report: { has_budget: boolean } }).report.has_budget = false
    render(<ReportSnapshotView snapshot={snap} snapshotTakenAt={null} />)

    expect(screen.queryByText('Budget')).not.toBeInTheDocument()
    expect(screen.queryByText('Difference')).not.toBeInTheDocument()
    // Actuals still render.
    expect(screen.getByText('Sales - Insurance')).toBeInTheDocument()
  })

  it('degrades gracefully when the snapshot has no report body (prod has such a row)', () => {
    render(<ReportSnapshotView snapshot={makeSnapshot({ report: null })} snapshotTakenAt={null} />)
    expect(screen.getByText(/attached to the email as a PDF/i)).toBeInTheDocument()
    // Must not crash or show an empty shell with no explanation.
    expect(screen.getByText('Dragon Roofing')).toBeInTheDocument()
  })

  it('shows the older-format notice for a future schema version', () => {
    render(<ReportSnapshotView snapshot={makeSnapshot({ schema_version: 2 })} snapshotTakenAt={null} />)
    expect(screen.getByText(/older format/i)).toBeInTheDocument()
  })

  it('accepts sections stored as a named map (monthly_report_snapshots shape)', () => {
    const snap = makeSnapshot()
    ;(snap as never as { report: { sections: unknown } }).report.sections = {
      revenue: { category: 'Revenue', lines: [line('Sales - Insurance', 950_933)], subtotal: line('Total Revenue', 950_933) },
    }
    render(<ReportSnapshotView snapshot={snap} snapshotTakenAt={null} />)
    expect(screen.getByText('Sales - Insurance')).toBeInTheDocument()
  })
})
