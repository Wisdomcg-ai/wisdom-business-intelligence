import { describe, it, expect } from 'vitest'
import {
  calcVariance,
  mapTypeToCategory,
  buildSubtotal,
  getMonthRange,
  getNextMonth,
  getPriorYearMonth,
  type ReportLine,
} from './shared'

describe('calcVariance', () => {
  it('returns favourable positive variance when revenue actual exceeds budget', () => {
    const result = calcVariance(100, 80, true)
    expect(result.amount).toBe(20)
    expect(result.percent).toBeCloseTo(25, 6)
  })

  it('returns negative (unfavourable) variance when expense actual exceeds budget', () => {
    const result = calcVariance(100, 80, false)
    expect(result.amount).toBe(-20)
    expect(result.percent).toBeCloseTo(-25, 6)
  })

  it('guards against divide-by-zero when budget is zero', () => {
    const result = calcVariance(10, 0, true)
    expect(result.amount).toBe(10)
    expect(result.percent).toBe(0)
  })

  it('returns negative amount when revenue actual is below budget', () => {
    const result = calcVariance(60, 100, true)
    expect(result.amount).toBe(-40)
    expect(result.percent).toBeCloseTo(-40, 6)
  })

  it('returns positive amount when expense actual is below budget', () => {
    const result = calcVariance(60, 100, false)
    expect(result.amount).toBe(40)
    expect(result.percent).toBeCloseTo(40, 6)
  })

  it('uses absolute value of budget when computing percent (negative budget edge case)', () => {
    const result = calcVariance(-50, -100, false)
    // expense: amount = budget - actual = -100 - -50 = -50
    expect(result.amount).toBe(-50)
    // percent = -50 / Math.abs(-100) * 100 = -50
    expect(result.percent).toBeCloseTo(-50, 6)
  })
})

describe('mapTypeToCategory', () => {
  it("maps 'revenue' → 'Revenue'", () => {
    expect(mapTypeToCategory('revenue')).toBe('Revenue')
  })

  it("maps 'cogs' → 'Cost of Sales'", () => {
    expect(mapTypeToCategory('cogs')).toBe('Cost of Sales')
  })

  it("maps 'opex' → 'Operating Expenses'", () => {
    expect(mapTypeToCategory('opex')).toBe('Operating Expenses')
  })

  it("maps 'other_income' → 'Other Income'", () => {
    expect(mapTypeToCategory('other_income')).toBe('Other Income')
  })

  it("maps 'other_expense' → 'Other Expenses'", () => {
    expect(mapTypeToCategory('other_expense')).toBe('Other Expenses')
  })

  it("maps unknown account types to 'Other Expenses'", () => {
    expect(mapTypeToCategory('unknown')).toBe('Other Expenses')
  })

  it('is case-insensitive', () => {
    expect(mapTypeToCategory('REVENUE')).toBe('Revenue')
    expect(mapTypeToCategory('Cogs')).toBe('Cost of Sales')
    expect(mapTypeToCategory('OPEX')).toBe('Operating Expenses')
  })

  it('handles empty/undefined account type by returning Other Expenses', () => {
    expect(mapTypeToCategory('')).toBe('Other Expenses')
    // @ts-expect-error — intentionally testing runtime defensive branch
    expect(mapTypeToCategory(undefined)).toBe('Other Expenses')
  })
})

describe('getMonthRange', () => {
  it('returns 12 keys for a full fiscal year Jul→Jun', () => {
    const range = getMonthRange('2025-07', '2026-06')
    expect(range).toHaveLength(12)
    expect(range[0]).toBe('2025-07')
    expect(range[11]).toBe('2026-06')
    expect(range).toEqual([
      '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12',
      '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
    ])
  })

  it('returns a single key when start == end', () => {
    const range = getMonthRange('2026-03', '2026-03')
    expect(range).toEqual(['2026-03'])
  })

  it('handles year rollover mid-range correctly', () => {
    const range = getMonthRange('2025-11', '2026-02')
    expect(range).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })
})

describe('getNextMonth', () => {
  it('rolls over year boundary from December to January', () => {
    expect(getNextMonth('2025-12')).toBe('2026-01')
  })

  it('increments month within a year', () => {
    expect(getNextMonth('2026-03')).toBe('2026-04')
  })

  it('pads single-digit months with leading zero', () => {
    expect(getNextMonth('2026-01')).toBe('2026-02')
    expect(getNextMonth('2026-09')).toBe('2026-10')
  })
})

describe('getPriorYearMonth', () => {
  it('returns same month in the prior year', () => {
    expect(getPriorYearMonth('2026-03')).toBe('2025-03')
  })

  it('preserves zero-padding for single-digit months', () => {
    expect(getPriorYearMonth('2026-01')).toBe('2025-01')
    expect(getPriorYearMonth('2026-09')).toBe('2025-09')
  })
})

describe('buildSubtotal', () => {
  const makeLine = (overrides: Partial<ReportLine>): ReportLine => ({
    account_name: 'x',
    xero_account_name: null,
    is_budget_only: false,
    actual: 0,
    budget: 0,
    variance_amount: 0,
    variance_percent: 0,
    ytd_actual: 0,
    ytd_budget: 0,
    ytd_variance_amount: 0,
    ytd_variance_percent: 0,
    unspent_budget: 0,
    budget_next_month: 0,
    budget_annual_total: 0,
    prior_year: null,
    ...overrides,
  })

  it('sums actual and budget across lines and labels the subtotal', () => {
    const lines: ReportLine[] = [
      makeLine({ actual: 100, budget: 80, variance_amount: 20 }),
      makeLine({ actual: 50, budget: 40, variance_amount: 10 }),
    ]
    const subtotal = buildSubtotal(lines, 'Total Revenue')
    expect(subtotal.account_name).toBe('Total Revenue')
    expect(subtotal.actual).toBe(150)
    expect(subtotal.budget).toBe(120)
    expect(subtotal.variance_amount).toBe(30)
    // variance_percent is placeholder — recalculated at call site
    expect(subtotal.variance_percent).toBe(0)
    expect(subtotal.ytd_variance_percent).toBe(0)
  })

  it('aggregates ytd figures across lines', () => {
    const lines: ReportLine[] = [
      makeLine({ ytd_actual: 1000, ytd_budget: 900, ytd_variance_amount: 100, unspent_budget: 200, budget_next_month: 50, budget_annual_total: 1200 }),
      makeLine({ ytd_actual: 500, ytd_budget: 450, ytd_variance_amount: 50, unspent_budget: 100, budget_next_month: 25, budget_annual_total: 600 }),
    ]
    const subtotal = buildSubtotal(lines, 'Total')
    expect(subtotal.ytd_actual).toBe(1500)
    expect(subtotal.ytd_budget).toBe(1350)
    expect(subtotal.ytd_variance_amount).toBe(150)
    expect(subtotal.unspent_budget).toBe(300)
    expect(subtotal.budget_next_month).toBe(75)
    expect(subtotal.budget_annual_total).toBe(1800)
  })

  it('prior_year is null when every line has null prior_year', () => {
    const lines: ReportLine[] = [
      makeLine({ prior_year: null }),
      makeLine({ prior_year: null }),
    ]
    const subtotal = buildSubtotal(lines, 'Total')
    expect(subtotal.prior_year).toBeNull()
  })

  it('prior_year sums when at least one line has a non-null prior_year', () => {
    const lines: ReportLine[] = [
      makeLine({ prior_year: 100 }),
      makeLine({ prior_year: null }),
      makeLine({ prior_year: 50 }),
    ]
    const subtotal = buildSubtotal(lines, 'Total')
    // null lines contribute 0 via (l.prior_year || 0)
    expect(subtotal.prior_year).toBe(150)
  })

  it('returns zeroed subtotal for an empty lines array', () => {
    const subtotal = buildSubtotal([], 'Empty Subtotal')
    expect(subtotal.account_name).toBe('Empty Subtotal')
    expect(subtotal.actual).toBe(0)
    expect(subtotal.budget).toBe(0)
    expect(subtotal.prior_year).toBeNull()
  })
})
