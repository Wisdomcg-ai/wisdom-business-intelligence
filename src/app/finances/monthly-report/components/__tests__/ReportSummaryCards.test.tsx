/**
 * WA.2 — the summary-card variance badge shows the VARIANCE percentage.
 *
 * The GP and Net Profit cards used to pass the margin (gp_percent /
 * np_percent) into the badge, so the number in brackets beside the dollar
 * variance was a different metric than the dollars. Sharon King Jul-26 read
 * "−$14,835 (−1.0%)" — a −1.0% net MARGIN printed beside a −109.6% variance,
 * on the first figures anyone sees on the page.
 *
 * Also pins the WA.3-adjacent honesty rule for this component: a $0 budget
 * renders no percentage at all, never "(+0.0%)".
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ReportSummaryCards from '../ReportSummaryCards'
import type { ReportSummary } from '../../types'

// Sharon King hearing, Jul 2026 — from the stored production snapshot.
const SHARON_KING: ReportSummary = {
  revenue: { actual: 126_211.23, budget: 126_190.69, variance: 20.54, variance_percent: 0.016 },
  cogs: { actual: 37_675.17, budget: 37_675, variance: -0.17, variance_percent: -0.0005 },
  gross_profit: { actual: 88_536.06, budget: 88_515.69, variance: 20.37, gp_percent: 70.149 },
  opex: { actual: 89_837.59, budget: 74_981.84, variance: -14_855.75, variance_percent: -19.81 },
  net_profit: { actual: -1_301.53, budget: 13_533.85, variance: -14_835.38, np_percent: -1.03 },
}

describe('ReportSummaryCards — badge percentage is the variance, not the margin', () => {
  it('Net Profit badge shows −109.6% (variance ÷ budget), not the −1.0% margin', () => {
    render(<ReportSummaryCards summary={SHARON_KING} hasBudget={true} />)
    // −14,835.38 / 13,533.85 = −109.6%
    expect(screen.getByText(/\(-109\.6%\)/)).toBeTruthy()
    // The old bug: the margin printed inside the badge brackets.
    expect(screen.queryByText(/\(-1\.0%\)/)).toBeNull()
  })

  it('the margin still appears — as the card sub-label, where it belongs', () => {
    render(<ReportSummaryCards summary={SHARON_KING} hasBudget={true} />)
    expect(screen.getByText('NP -1.0%')).toBeTruthy()
    expect(screen.getByText('GP 70.1%')).toBeTruthy()
  })

  it('Gross Profit badge shows the variance % (~0.0%), not the 70% margin', () => {
    render(<ReportSummaryCards summary={SHARON_KING} hasBudget={true} />)
    // Revenue (20.54/126,190.69) and GP (20.37/88,515.69) both land at +0.0%.
    expect(screen.getAllByText(/\(\+0\.0%\)/).length).toBe(2)
    expect(screen.queryByText(/\(\+70\.1%\)/)).toBeNull()
  })

  it('a $0 budget renders the dollar variance with NO percentage, never "+0.0%"', () => {
    const noBudget: ReportSummary = {
      ...SHARON_KING,
      net_profit: { actual: 500, budget: 0, variance: 500, np_percent: 10 },
    }
    render(<ReportSummaryCards summary={noBudget} hasBudget={true} />)
    const badges = screen.getAllByText(/\+\$500/)
    expect(badges.length).toBeGreaterThan(0)
    expect(badges[0].textContent).not.toContain('%')
  })

  it('renders no badges at all when hasBudget is false', () => {
    render(<ReportSummaryCards summary={SHARON_KING} hasBudget={false} />)
    expect(screen.queryByText(/vs budget|\(\+|\(-/)).toBeNull()
    expect(screen.queryByText(/Budget:/)).toBeNull()
  })
})
