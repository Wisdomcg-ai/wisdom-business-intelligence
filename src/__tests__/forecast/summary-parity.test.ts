/**
 * Phase 2 — does the forecast that was STORED equal the one that was APPROVED?
 *
 * The wizard's summary is derived from WizardState; forecast_pl_lines is derived
 * independently from ForecastAssumptions. Nothing has ever compared them, which
 * is why "the number on screen isn't the number in the report" keeps recurring —
 * each fix addressed one bucket rather than the divergence itself.
 *
 * The cases below are the real shapes: a clean publish, the Envisage forecast
 * that stores no Cost of Sales at all (gross margin renders as 100%), and a
 * forecast whose summary says one thing while nothing was materialised.
 */
import { describe, it, expect } from 'vitest'
import {
  checkSummaryParity,
  approvedOperatingExpenses,
  type ParityLine,
  type ParityYearSummary,
} from '@/lib/forecast/summary-parity'

const FY_MONTHS = [
  '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12',
  '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06',
]

/** Spread an annual amount evenly across the fiscal year. */
function line(category: string, annual: number, months = FY_MONTHS): ParityLine {
  const forecast_months: Record<string, number> = {}
  for (const m of months) forecast_months[m] = annual / months.length
  return { category, forecast_months }
}

const summary = (over: Partial<ParityYearSummary> = {}): ParityYearSummary => ({
  revenue: 1_200_000,
  cogs: 600_000,
  teamCosts: 300_000,
  subscriptions: 24_000,
  opex: 150_000,
  depreciation: 12_000,
  otherExpenses: 0,
  investments: 0,
  otherIncome: 0,
  xeroOtherExpense: 0,
  netProfit: 114_000, // 1.2M − 600k − (300k + 24k + 150k + 12k)
  ...over,
})

describe('a forecast that materialised correctly', () => {
  const stored: ParityLine[] = [
    line('Revenue', 1_200_000),
    line('Cost of Sales', 600_000),
    line('Operating Expenses', 300_000), // team
    line('Operating Expenses', 24_000),  // subscriptions
    line('Operating Expenses', 150_000), // opex
    line('Operating Expenses', 12_000),  // depreciation
  ]

  it('reports a match', () => {
    const r = checkSummaryParity(summary(), stored, FY_MONTHS)
    expect(r.matches).toBe(true)
    expect(r.divergences).toEqual([])
  })

  it('agrees on net profit', () => {
    const r = checkSummaryParity(summary(), stored, FY_MONTHS)
    expect(r.netProfit.approved).toBe(114_000)
    expect(r.netProfit.stored).toBe(114_000)
  })
})

describe('the Envisage shape — lines stored, but no Cost of Sales at all', () => {
  // Verified in prod: both Envisage forecasts carry P&L lines with zero COGS
  // rows, so every budget-vs-actual report shows a 100% gross margin.
  const stored: ParityLine[] = [
    line('Revenue', 1_200_000),
    line('Operating Expenses', 486_000),
  ]

  it('catches the missing $600k of cost of sales', () => {
    const r = checkSummaryParity(summary(), stored, FY_MONTHS)
    expect(r.matches).toBe(false)
    expect(r.cogs.approved).toBe(600_000)
    expect(r.cogs.stored).toBe(0)
    expect(r.cogs.difference).toBe(-600_000)
  })

  it('ranks the largest divergence first', () => {
    const r = checkSummaryParity(summary(), stored, FY_MONTHS)
    expect(r.divergences[0].bucket).toBe('cogs')
  })
})

describe('a summary with nothing materialised behind it', () => {
  it('flags every bucket rather than reporting a quiet match', () => {
    const r = checkSummaryParity(summary(), [], FY_MONTHS)
    expect(r.matches).toBe(false)
    expect(r.monthsCovered).toBe(0)
    expect(r.netProfit.stored).toBe(0)
    expect(r.netProfit.approved).toBe(114_000)
  })
})

describe('bucket mapping', () => {
  it('files Other Income on the revenue side, where the materialiser puts it', () => {
    const s = summary({ otherIncome: 50_000, netProfit: 164_000 })
    const stored: ParityLine[] = [
      line('Revenue', 1_200_000),
      line('Other Income', 50_000),
      line('Cost of Sales', 600_000),
      line('Operating Expenses', 486_000),
    ]
    const r = checkSummaryParity(s, stored, FY_MONTHS)
    expect(r.revenue.approved).toBe(1_250_000)
    expect(r.matches).toBe(true)
  })

  it('counts an unrecognised category as expense, so a new bucket surfaces', () => {
    // Treating an unknown category as income would overstate profit and hide the
    // problem; counting it as expense makes it show up as a divergence.
    const stored: ParityLine[] = [
      line('Revenue', 1_200_000),
      line('Cost of Sales', 600_000),
      line('Operating Expenses', 486_000),
      line('Something New', 10_000),
    ]
    const r = checkSummaryParity(summary(), stored, FY_MONTHS)
    expect(r.operatingExpenses.stored).toBe(496_000)
    expect(r.matches).toBe(false)
  })

  it('sums every expense bucket the canonical net-profit formula subtracts', () => {
    expect(
      approvedOperatingExpenses({
        teamCosts: 1, subscriptions: 2, opex: 4, depreciation: 8,
        otherExpenses: 16, investments: 32, xeroOtherExpense: 64,
      }),
    ).toBe(127)
  })

  it('excludes otherIncome from the expense side — it is added, not subtracted', () => {
    expect(approvedOperatingExpenses({ opex: 100, otherIncome: 999 })).toBe(100)
  })
})

describe('multi-year forecasts', () => {
  it('compares only the requested year', () => {
    // A 2-year line set against a 1-year summary must not read as double.
    const twoYears = [...FY_MONTHS, '2027-07', '2027-08']
    const stored: ParityLine[] = [
      line('Revenue', 1_400_000, twoYears),
      line('Cost of Sales', 700_000, twoYears),
      line('Operating Expenses', 567_000, twoYears),
    ]
    const r = checkSummaryParity(summary(), stored, FY_MONTHS)
    // 12 of the 14 months fall in Y1.
    expect(r.revenue.stored).toBe(1_200_000)
    expect(r.matches).toBe(true)
  })
})

describe('tolerance', () => {
  it('ignores sub-dollar rounding drift from per-line cent rounding', () => {
    const stored: ParityLine[] = [
      line('Revenue', 1_200_000.4),
      line('Cost of Sales', 600_000.3),
      line('Operating Expenses', 486_000.2),
    ]
    expect(checkSummaryParity(summary(), stored, FY_MONTHS).matches).toBe(true)
  })

  it('does not ignore a real difference', () => {
    const stored: ParityLine[] = [
      line('Revenue', 1_200_000),
      line('Cost of Sales', 600_000),
      line('Operating Expenses', 486_050),
    ]
    const r = checkSummaryParity(summary(), stored, FY_MONTHS)
    expect(r.matches).toBe(false)
    expect(r.operatingExpenses.difference).toBe(50)
  })
})

describe('degenerate input', () => {
  it('never throws on null summary or null lines', () => {
    expect(() => checkSummaryParity(null, null)).not.toThrow()
    expect(checkSummaryParity(null, null).monthsCovered).toBe(0)
  })

  it('ignores non-numeric month values rather than producing NaN', () => {
    const bad: ParityLine[] = [
      { category: 'Revenue', forecast_months: { '2026-07': Number.NaN as unknown as number } },
    ]
    expect(Number.isNaN(checkSummaryParity(summary(), bad, FY_MONTHS).revenue.stored)).toBe(false)
  })
})
