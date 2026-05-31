/**
 * Phase 71 plan 71-06 — Wages per-payrun expand UI (S3).
 *
 * Covers:
 *   - S3 — Each employee row has an expand chevron (button with aria-label
 *     "Expand {name}"). Click reveals per-payrun rows (pay date + gross).
 *     Click again collapses. Two employees independent. Existing employee
 *     total still renders when collapsed.
 *
 * Note: imports the production component from
 *   '@/app/finances/monthly-report/components/WagesAnalysisTab'.
 * Tests live at the repo-convention path `src/__tests__/components/` (NOT co-located).
 */
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import WagesAnalysisTab from '@/app/finances/monthly-report/components/WagesAnalysisTab'
import type { WagesDetailData, WagesEmployeeLine, WagesPayRunEntry } from '@/app/finances/monthly-report/types'

// ─── Fixture builders ────────────────────────────────────────────────────────

function makePayRun(date: string, gross: number): WagesPayRunEntry {
  return {
    date,
    period_start: date,
    period_end: date,
    gross_earnings: gross,
    tax: 0,
    super_amount: 0,
    net_pay: gross,
  }
}

function makeEmployee(name: string, payRuns: WagesPayRunEntry[]): WagesEmployeeLine {
  const actualTotal = payRuns.reduce((acc, pr) => acc + pr.gross_earnings, 0)
  return {
    name,
    position: '',
    category: 'admin',
    pay_frequency: 'fortnightly',
    budget_per_period: 0,
    actual_total: actualTotal,
    budget_total: 0,
    pay_runs: payRuns,
    variance: -actualTotal,
    variance_percent: 0,
    source: 'xero',
  }
}

function makeData(employees: WagesEmployeeLine[], payRunDates: string[]): WagesDetailData {
  const actual = employees.reduce((acc, e) => acc + e.actual_total, 0)
  const budget = employees.reduce((acc, e) => acc + e.budget_total, 0)
  return {
    accounts: [
      {
        account_name: 'Wages & Salaries',
        budget,
        actual,
        variance: budget - actual,
      } as unknown as WagesDetailData['accounts'][number],
    ],
    employees,
    employee_totals: { actual, budget, variance: budget - actual },
    grand_total: { actual, budget, variance: budget - actual },
    payroll_available: true,
    pay_run_dates: payRunDates,
  }
}

const baseProps = {
  isLoading: false,
  error: null as string | null,
}

describe('WagesAnalysisTab — S3 per-payrun expand UI', () => {
  it('Test 1: renders chevron collapsed on initial mount; per-payrun detail rows are NOT visible', () => {
    const alice = makeEmployee('Alice', [
      makePayRun('2026-03-14', 4500),
      makePayRun('2026-03-28', 4600),
    ])
    const data = makeData([alice], ['2026-03-14', '2026-03-28'])

    render(<WagesAnalysisTab {...baseProps} data={data} />)

    // Chevron button present
    const expandBtn = screen.getByRole('button', { name: /expand alice/i })
    expect(expandBtn).toBeInTheDocument()

    // Detail header "Pay runs for Alice" should NOT be rendered yet
    expect(screen.queryByText(/pay runs for alice/i)).not.toBeInTheDocument()
  })

  it('Test 2: clicking chevron expands; per-payrun date + gross rows render', () => {
    const alice = makeEmployee('Alice', [
      makePayRun('2026-03-14', 4500),
      makePayRun('2026-03-28', 4600),
    ])
    const data = makeData([alice], ['2026-03-14', '2026-03-28'])

    render(<WagesAnalysisTab {...baseProps} data={data} />)

    fireEvent.click(screen.getByRole('button', { name: /expand alice/i }))

    // Detail header now present
    const detailHeader = screen.getByText(/pay runs for alice/i)
    expect(detailHeader).toBeInTheDocument()

    // The expanded panel should contain both dates and grosses.
    // Use the nearest table-row ancestor of the detail header so we don't
    // accidentally match the per-column header cells in the summary row.
    const panel = detailHeader.closest('tr') as HTMLElement
    expect(panel).not.toBeNull()
    const scoped = within(panel)

    expect(scoped.getByText('2026-03-14')).toBeInTheDocument()
    expect(scoped.getByText('$4,500')).toBeInTheDocument()
    expect(scoped.getByText('2026-03-28')).toBeInTheDocument()
    expect(scoped.getByText('$4,600')).toBeInTheDocument()
  })

  it('Test 3: clicking chevron a second time collapses and hides per-payrun rows', () => {
    const alice = makeEmployee('Alice', [
      makePayRun('2026-03-14', 4500),
      makePayRun('2026-03-28', 4600),
    ])
    const data = makeData([alice], ['2026-03-14', '2026-03-28'])

    render(<WagesAnalysisTab {...baseProps} data={data} />)

    const btn = screen.getByRole('button', { name: /expand alice/i })
    fireEvent.click(btn)
    expect(screen.getByText(/pay runs for alice/i)).toBeInTheDocument()

    fireEvent.click(btn)
    expect(screen.queryByText(/pay runs for alice/i)).not.toBeInTheDocument()
  })

  it('Test 4: expanding one employee does NOT expand another', () => {
    const alice = makeEmployee('Alice', [makePayRun('2026-03-14', 4500)])
    const bob = makeEmployee('Bob', [makePayRun('2026-03-14', 3200)])
    const data = makeData([alice, bob], ['2026-03-14'])

    render(<WagesAnalysisTab {...baseProps} data={data} />)

    fireEvent.click(screen.getByRole('button', { name: /expand alice/i }))

    expect(screen.getByText(/pay runs for alice/i)).toBeInTheDocument()
    expect(screen.queryByText(/pay runs for bob/i)).not.toBeInTheDocument()
  })

  it('Test 5: existing employee total still renders when row is collapsed', () => {
    const alice = makeEmployee('Alice', [
      makePayRun('2026-03-14', 4500),
      makePayRun('2026-03-28', 4600),
    ])
    const data = makeData([alice], ['2026-03-14', '2026-03-28'])

    render(<WagesAnalysisTab {...baseProps} data={data} />)

    // 4500 + 4600 = 9100 → "$9,100" total in summary column.
    // (also appears as account-level total — assert via getAllByText length)
    const totals = screen.getAllByText('$9,100')
    expect(totals.length).toBeGreaterThanOrEqual(1)
  })
})
