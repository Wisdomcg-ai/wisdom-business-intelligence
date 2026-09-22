/**
 * The KPI cards above the P&L must agree with the P&L.
 *
 * Urban Road, 7 Sep 2026: the "Net Profit" card read $530k (8.8%) — the Step-1
 * GOAL — while the table under it and the wizard's Review both said $536,245
 * (8.9%). The cards now show the plan, with the goal beside it.
 */
import { describe, it, expect } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import ForecastKPISummary from '@/app/finances/forecast/components/ForecastKPISummary'
import type { FinancialForecast, PLLine } from '@/app/finances/forecast/types'
import type { ForecastAssumptions } from '@/app/finances/forecast/components/wizard-v4/types/assumptions'

const july = (total: number) => ({ '2026-07': total })
const line = (category: string, total: number, name = category): PLLine =>
  ({ account_name: name, category, actual_months: {}, forecast_months: july(total) } as PLLine)

/** Urban Road FY2027 as stored: NP $536,245 (8.9%). */
const PL: PLLine[] = [
  line('Revenue', 6_028_196, 'Sales'),
  line('Other Income', 221),
  line('Cost of Sales', 3_550_072),
  line('Operating Expenses', 916_586, 'Wages & Salaries'),
  line('Operating Expenses', 1_025_514, 'Everything else'),
]

const FORECAST = {
  id: 'f-1', fiscal_year: 2027, name: 'FY2027 Forecast (from Xero budget)',
  revenue_goal: 6_028_196, gross_profit_goal: 2_477_589, net_profit_goal: 530_481,
} as unknown as FinancialForecast

/** Goals as the operator set them in Step 1: 41.1% GP, 8.8% NP. */
const ASSUMPTIONS = {
  goals: { year1: { revenue: 6_028_196.46, grossProfitPct: 41.1, netProfitPct: 8.8 } },
  revenue: { lines: [{ priorYearTotal: 5_500_000 }] },
  team: { existingTeam: [{ includeInForecast: true }, { includeInForecast: true }], plannedHires: [] },
} as unknown as ForecastAssumptions

const renderCards = (props: Partial<React.ComponentProps<typeof ForecastKPISummary>> = {}) =>
  render(
    <ForecastKPISummary
      assumptions={ASSUMPTIONS}
      forecast={FORECAST}
      plLines={PL}
      yearStartMonth={7}
      {...props}
    />,
  )

describe('ForecastKPISummary', () => {
  it('shows the PLAN from the stored P&L, not the goal, and names the goal beside it', () => {
    renderCards()
    // $536,245 (8.9%) — what the P&L and the wizard Review say.
    expect(screen.getByText('$536k (8.9%)')).toBeInTheDocument()
    expect(screen.getByText('Goal $530k (8.8%)')).toBeInTheDocument()
    // The old behaviour printed the goal as the headline figure.
    expect(screen.queryByText('$530k (8.8%)')).toBeNull()
  })

  it('does not repeat the goal when the plan matches it', () => {
    renderCards()
    // Revenue and GP% land on the goal, so no "Goal …" subtitle for those.
    expect(screen.getByText('$6.0M')).toBeInTheDocument()
    expect(screen.queryByText('Goal $6.0M')).toBeNull()
    expect(screen.getByText('41.1%')).toBeInTheDocument()
    expect(screen.queryByText('Goal 41.1%')).toBeNull()
  })

  it('flags a plan that misses the goal on revenue and margin', () => {
    const short = [
      line('Revenue', 5_000_000, 'Sales'),
      line('Cost of Sales', 3_550_072),
      line('Operating Expenses', 1_200_000),
    ]
    renderCards({ plLines: short })
    expect(screen.getByText('$5.0M')).toBeInTheDocument()
    expect(screen.getByText('Goal $6.0M')).toBeInTheDocument()
    expect(screen.getByText('29.0%')).toBeInTheDocument()   // GP% of the plan
    expect(screen.getByText('Goal 41.1%')).toBeInTheDocument()
    expect(screen.getByText('$250k (5.0%)')).toBeInTheDocument()
    expect(screen.getByText('Goal $530k (8.8%)')).toBeInTheDocument()
  })

  it('falls back to the goals, labelled Target, when no forecast has been generated', () => {
    renderCards({ plLines: [] })
    expect(screen.getByText('$6.0M')).toBeInTheDocument()
    expect(screen.getByText('$530k (8.8%)')).toBeInTheDocument()
    expect(screen.getAllByText('Target')).toHaveLength(3)
  })

  it('falls back to the goals in estimated mode (Xero actuals are not a plan)', () => {
    renderCards({ isEstimatedMode: true })
    expect(screen.getByText('$530k (8.8%)')).toBeInTheDocument()
    expect(screen.queryByText('$536k (8.9%)')).toBeNull()
    expect(screen.getAllByText('Target')).toHaveLength(3)
  })

  it('measures the prior-year trend against the figure actually on the card', () => {
    renderCards()
    // Plan revenue 6,028,417 vs prior year 5,500,000 → +10%
    expect(screen.getByText(/10%/)).toBeInTheDocument()
  })

  it('still counts the team from the assumptions', () => {
    renderCards()
    expect(screen.getByText('2 people')).toBeInTheDocument()
  })
})
