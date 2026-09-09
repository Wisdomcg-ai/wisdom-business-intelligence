/**
 * The Full Year page's approved-budget column.
 *
 * The trap this guards: from the moment a client moves to
 * budget_source='budget_version', the monthly Budget-vs-Actual page measures
 * against the APPROVED budget while the Full Year page measures against the
 * FORECAST. One pack, two yardsticks, no label. Distinct Directions has been in
 * that state since 8 Sep 2026, and for Urban Road the gap is $83k in August
 * alone — the seeder overwrote the forecast's closed months with actuals
 * (533,043) while the approved budget still says 450,000.
 *
 * The half that can go wrong quietly is the OTHER half: a client on the budget
 * store whose version isn't in force yet resolves to no approved budget at all,
 * and an approved column printed empty for them reads as a budget of zero and
 * every variance off it comes out favourable. So the column is keyed on "did
 * the store answer", never on "is the client switched over".
 *
 * Figures are Distinct Directions FY2027, which ties to their Calxa pack:
 * income 6,973,968 / cost of sales 10,800 / expense 4,849,983.
 */
import { describe, it, expect } from 'vitest'
import { hasApprovedBudget, formatApprovedAnnual, APPROVED_ABSENT } from '../full-year-approved'
import type { FullYearReport, FullYearLine, FullYearMonthData } from '../../types'

const MONTHS = [
  '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12',
  '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06',
]

function line(name: string, approvedAnnual: number | null, forecastAnnual = 0): FullYearLine {
  const months: FullYearMonthData[] = MONTHS.map((month) => ({
    month,
    budget: forecastAnnual / 12,
    actual: 0,
    approved_budget: approvedAnnual === null ? null : approvedAnnual / 12,
    prior_year: 0,
    source: 'forecast' as const,
  }))
  return {
    account_name: name,
    category: 'Revenue',
    months,
    projected_total: forecastAnnual,
    annual_budget: forecastAnnual,
    approved_annual_budget: approvedAnnual,
    variance_amount: 0,
    variance_percent: 0,
  }
}

function report(over: Partial<FullYearReport> = {}): FullYearReport {
  return {
    business_id: 'c6c741db-6c09-45be-974c-5e6ca2cadf84',
    fiscal_year: 2027,
    last_actual_month: '2026-08',
    sections: [
      { category: 'Revenue', lines: [line('BATHURST: Behavioural Assessment Income', 3310549)], subtotal: line('Total Revenue', 6973968) },
      { category: 'Cost of Sales', lines: [line('BATHURST: Cost of Goods Sold', 2400)], subtotal: line('Total Cost of Sales', 10800) },
      { category: 'Operating Expenses', lines: [line('Offshore Team', 300000)], subtotal: line('Total Operating Expenses', 4849983) },
    ],
    gross_profit: line('Gross Profit', 6963168),
    net_profit: line('Net Profit', 2113185),
    approved_budget_label: 'Overall Budget',
    ...over,
  }
}

describe('hasApprovedBudget', () => {
  it('is true when the budget store answered', () => {
    expect(hasApprovedBudget(report())).toBe(true)
  })

  it('is false for a client still measured against their forecast', () => {
    const forecastOnly = report({
      sections: report().sections.map((s) => ({ ...s, subtotal: line(s.subtotal.account_name, null) })),
      gross_profit: line('Gross Profit', null),
      net_profit: line('Net Profit', null),
      approved_budget_label: null,
    })
    expect(hasApprovedBudget(forecastOnly)).toBe(false)
  })

  it('is false when the client is on the store but no version is in force', () => {
    // budget_source='budget_version' with an unlocked or not-yet-effective
    // version: the route sends nulls, and the column must not appear at all.
    // Appearing-and-empty is the failure mode this exists to prevent.
    const noVersion = report({
      sections: report().sections.map((s) => ({ ...s, subtotal: line(s.subtotal.account_name, null) })),
      gross_profit: line('Gross Profit', null),
      net_profit: line('Net Profit', null),
      approved_budget_label: null,
    })
    expect(hasApprovedBudget(noVersion)).toBe(false)
  })

  it('falls back to the section subtotals when net profit predates the field', () => {
    const frozen = report({ net_profit: { ...line('Net Profit', null) } })
    expect(hasApprovedBudget(frozen)).toBe(true)
  })

  it('is false for a missing report rather than throwing', () => {
    expect(hasApprovedBudget(null)).toBe(false)
    expect(hasApprovedBudget(undefined)).toBe(false)
  })

  it('stays true when the approved budget is a real zero', () => {
    // An account the budget genuinely does not mention is budgeted at $0, and
    // $0 is the honest answer for it. Only the absence of an answer is null,
    // and collapsing the two would drop the column for a client whose whole
    // year happens to net to nothing.
    const zeroed = report({ net_profit: line('Net Profit', 0) })
    expect(hasApprovedBudget(zeroed)).toBe(true)
  })
})

describe('formatApprovedAnnual', () => {
  const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-AU')}`

  it('renders Distinct Directions FY27 to the dollar', () => {
    const r = report()
    expect(formatApprovedAnnual(r.sections[0].subtotal, fmt)).toBe('$6,973,968')
    expect(formatApprovedAnnual(r.sections[1].subtotal, fmt)).toBe('$10,800')
    expect(formatApprovedAnnual(r.sections[2].subtotal, fmt)).toBe('$4,849,983')
  })

  it('renders an absent budget as a mark, never as $0', () => {
    expect(formatApprovedAnnual(line('Anything', null), fmt)).toBe(APPROVED_ABSENT)
    expect(formatApprovedAnnual(line('Anything', null), fmt)).not.toBe('$0')
  })

  it('renders a real zero as $0', () => {
    expect(formatApprovedAnnual(line('Unbudgeted account', 0), fmt)).toBe('$0')
  })

  it('uses the passed-in formatter, so the column cannot round differently from its neighbour', () => {
    expect(formatApprovedAnnual(line('Revenue', 6973968), (n) => `[${n}]`)).toBe('[6973968]')
  })
})
