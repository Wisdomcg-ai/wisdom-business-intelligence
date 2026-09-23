/**
 * WB.4 / WB.5 — the Wages tab's house rules, rendered.
 *
 *   - $1 tolerance: a cents-level variance never lights red
 *   - hide $0 rows (no pay AND no budget), with a count line — but an unpaid
 *     employee WITH a budget stays visible (a missing person is a variance)
 *   - five-run phasing note
 *   - PAY-TIES banner: tie / break / silent-when-not-comparable
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import WagesAnalysisTab from '../WagesAnalysisTab'
import type { WagesDetailData } from '../../types'

const emp = (
  name: string,
  actual: number,
  budget: number,
  payRuns: { date: string; gross: number }[] = [],
): WagesDetailData['employees'][number] =>
  ({
    name,
    position: '',
    category: 'Wages Admin',
    pay_frequency: 'Weekly',
    budget_per_period: budget,
    actual_total: actual,
    budget_total: budget,
    pay_runs: payRuns.map((p) => ({
      date: p.date,
      period_start: '',
      period_end: '',
      gross_earnings: p.gross,
      tax: 0,
      super_amount: 0,
      net_pay: p.gross,
    })),
    variance: budget - actual,
    variance_percent: 0,
    source: 'both',
  }) as any

function baseData(overrides: Partial<WagesDetailData> = {}): WagesDetailData {
  return {
    accounts: [
      { account_name: 'Wages and Salaries', actual: 10_000, budget: 10_000, variance: 0, variance_percent: 0 },
    ],
    employees: [emp('Paid Person', 5_000, 5_000.5, [{ date: '2026-07-03', gross: 5_000 }])],
    employee_totals: { actual: 5_000, budget: 5_000.5, variance: 0.5 },
    grand_total: { actual: 10_000, budget: 10_000, variance: 0 },
    payroll_available: true,
    pay_run_dates: ['2026-07-03'],
    phasing: null,
    ties: null,
    ...overrides,
  }
}

describe('WB.4 — $1 tolerance', () => {
  it('a 50-cent variance renders with no red/green colouring', () => {
    render(<WagesAnalysisTab data={baseData()} isLoading={false} error={null} />)
    // $0.50 variance formats to "$1" cell? fmt rounds to 0dp: 0.5 -> "$1"... find the row cell.
    const row = screen.getByText('Paid Person').closest('tr')!
    const redCells = row.querySelectorAll('.text-red-600')
    const greenCells = row.querySelectorAll('.text-green-700')
    expect(redCells.length).toBe(0)
    expect(greenCells.length).toBe(0)
  })
})

describe('WB.4 — hidden $0 rows', () => {
  it('hides no-pay-no-budget employees, keeps unpaid-but-budgeted, and counts', () => {
    const data = baseData({
      employees: [
        emp('Paid Person', 5_000, 5_000, [{ date: '2026-07-03', gross: 5_000 }]),
        emp('Left Last Year', 0, 0),
        emp('On Leave But Budgeted', 0, 4_000),
      ],
    })
    render(<WagesAnalysisTab data={data} isLoading={false} error={null} />)
    expect(screen.queryByText('Left Last Year')).toBeNull()
    expect(screen.getByText('On Leave But Budgeted')).toBeTruthy()
    expect(screen.getByText(/1 employee with no pay and no budget this month hidden/)).toBeTruthy()
  })
})

describe('WB.4 — phasing note', () => {
  it('renders the five-Friday explanation when flagged', () => {
    const data = baseData({
      phasing: { pay_runs_in_month: 5, typical_runs: 4, calendar_type: 'WEEKLY', extra_run: true },
    })
    render(<WagesAnalysisTab data={data} isLoading={false} error={null} />)
    expect(screen.getByText(/5 pay runs fell in this month/)).toBeTruthy()
    expect(screen.getByText(/phasing effect, not an overspend/)).toBeTruthy()
  })

  it('silent on a normal month', () => {
    const data = baseData({
      phasing: { pay_runs_in_month: 4, typical_runs: 4, calendar_type: 'WEEKLY', extra_run: false },
    })
    render(<WagesAnalysisTab data={data} isLoading={false} error={null} />)
    expect(screen.queryByText(/phasing effect/)).toBeNull()
  })
})

describe('WB.5 — PAY-TIES banner', () => {
  const ties = (over: Partial<NonNullable<WagesDetailData['ties']>>) => ({
    payroll_gross: 10_000,
    payroll_super: 1_200,
    payroll_side: 11_200,
    accounts_actual: 11_200,
    includes_super_account: true,
    delta: 0,
    within_tolerance: true,
    comparable: true,
    ...over,
  })

  it('green when it ties', () => {
    render(<WagesAnalysisTab data={baseData({ ties: ties({}) })} isLoading={false} error={null} />)
    expect(screen.getByText(/Payroll ties to the P&L/)).toBeTruthy()
  })

  it('amber with the delta and causes when it breaks — warning, not a block', () => {
    render(
      <WagesAnalysisTab
        data={baseData({
          ties: ties({ accounts_actual: 13_700, delta: 2_500, within_tolerance: false }),
        })}
        isLoading={false}
        error={null}
      />,
    )
    expect(screen.getByText(/does not tie/)).toBeTruthy()
    expect(screen.getByText(/difference \$2,500/)).toBeTruthy()
    expect(screen.getByText(/accrual journals/)).toBeTruthy()
  })

  it('silent when not comparable — never a fake green tick', () => {
    render(
      <WagesAnalysisTab
        data={baseData({ ties: ties({ comparable: false }) })}
        isLoading={false}
        error={null}
      />,
    )
    expect(screen.queryByText(/Payroll ties/)).toBeNull()
    expect(screen.queryByText(/does not tie/)).toBeNull()
  })
})
