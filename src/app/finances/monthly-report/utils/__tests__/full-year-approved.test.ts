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
import {
  hasApprovedBudget,
  formatApprovedAnnual,
  hasForecastBudget,
  formatForecastValue,
  forecastAbsentNote,
  VALUE_ABSENT,
} from '../full-year-approved'
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

  it('is false on the totals alone, even when a version label came through', () => {
    // budget_source='budget_version' with an unlocked or not-yet-effective
    // version. This case used to carry a fixture byte-identical to the one
    // above it, so it proved nothing the previous case did not: at this level
    // "never switched over" and "switched over and unresolvable" produce the
    // same payload, which is exactly why the predicate reads the numbers rather
    // than a settings flag. What it CAN pin is that a stray label does not
    // conjure the column — a header over an empty column is read as a budget of
    // zero, and every variance off zero comes out favourable.
    //
    // The route-side half (does the route send nulls for that client at all) is
    // covered in api/monthly-report/full-year/__tests__.
    const labelWithoutBudget = report({
      sections: report().sections.map((s) => ({ ...s, subtotal: line(s.subtotal.account_name, null) })),
      gross_profit: line('Gross Profit', null),
      net_profit: line('Net Profit', null),
      approved_budget_label: 'Overall Budget (Xero, rev 12 Aug 2026)',
    })
    expect(hasApprovedBudget(labelWithoutBudget)).toBe(false)
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
    expect(formatApprovedAnnual(line('Anything', null), fmt)).toBe(VALUE_ABSENT)
    expect(formatApprovedAnnual(line('Anything', null), fmt)).not.toBe('$0')
  })

  it('renders a real zero as $0', () => {
    expect(formatApprovedAnnual(line('Unbudgeted account', 0), fmt)).toBe('$0')
  })

  it('uses the passed-in formatter, so the column cannot round differently from its neighbour', () => {
    expect(formatApprovedAnnual(line('Revenue', 6973968), (n) => `[${n}]`)).toBe('[6973968]')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The forecast side of the same page.
//
// Every variance column here is projection-vs-FORECAST. With no active forecast
// for the year the route computes 0 for all of them, and 0 is not the answer —
// it is the absence of one. Rendered as a number, Distinct Directions' August
// revenue reads Projected $992,932 | Forecast $0 | Var +$992,932 in green |
// +0.0%, beside a real $6,973,968 approved budget: a missing number printed as
// a triumph. Their only FY2027 forecast is is_active = false, so this is the
// August pack and not a hypothetical.
// ─────────────────────────────────────────────────────────────────────────────

describe('hasForecastBudget', () => {
  it('trusts the route when the route said so', () => {
    expect(hasForecastBudget(report({ forecast_available: true }))).toBe(true)
    expect(hasForecastBudget(report({ forecast_available: false }))).toBe(false)
  })

  it('reads the evidence for a payload frozen before the flag existed', () => {
    // No flag, no forecast money anywhere: that IS the no-forecast state, in
    // every number this page can show.
    expect(hasForecastBudget(report())).toBe(false)

    const withForecast = report({
      net_profit: line('Net Profit', 2113185, 1_800_000),
    })
    expect(hasForecastBudget(withForecast)).toBe(true)
  })

  it('is false for a missing report rather than throwing', () => {
    expect(hasForecastBudget(null)).toBe(false)
    expect(hasForecastBudget(undefined)).toBe(false)
  })
})

describe('formatForecastValue', () => {
  const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-AU')}`

  it('renders the absent marker when there is no forecast, never $0', () => {
    expect(formatForecastValue(0, false, fmt)).toBe(VALUE_ABSENT)
    expect(formatForecastValue(992932, false, fmt)).toBe(VALUE_ABSENT)
  })

  it('renders a real forecast of nothing as $0', () => {
    // A forecast that genuinely budgets nothing for an account is a decision,
    // and $0 is the honest rendering of a decision.
    expect(formatForecastValue(0, true, fmt)).toBe('$0')
  })
})

describe('forecastAbsentNote', () => {
  it('says nothing when there is a forecast', () => {
    expect(forecastAbsentNote(report({ forecast_available: true }))).toBeNull()
  })

  it('names the year and the remaining yardstick', () => {
    const note = forecastAbsentNote(report({ forecast_available: false }))
    expect(note).toContain('FY2027')
    expect(note).toContain('approved budget')
  })

  it('says there is no yardstick at all when there is no approved budget either', () => {
    const neither = report({
      forecast_available: false,
      sections: report().sections.map((s) => ({ ...s, subtotal: line(s.subtotal.account_name, null) })),
      gross_profit: line('Gross Profit', null),
      net_profit: line('Net Profit', null),
      approved_budget_label: null,
    })
    expect(forecastAbsentNote(neither)).toContain('no yardstick')
  })
})
