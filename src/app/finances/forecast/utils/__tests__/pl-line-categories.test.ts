/**
 * The one rule for bucketing forecast_pl_lines and summing a year of the plan.
 */
import { describe, it, expect } from 'vitest'
import {
  isRevenueLine,
  isCOGSLine,
  isOpExLine,
  sumAnnualPlan,
} from '../pl-line-categories'
import type { PLLine } from '../../types'

const FY27 = ['2026-07','2026-08','2026-09','2026-10','2026-11','2026-12','2027-01','2027-02','2027-03','2027-04','2027-05','2027-06']
const FY28 = ['2027-07','2027-08','2027-09','2027-10','2027-11','2027-12','2028-01','2028-02','2028-03','2028-04','2028-05','2028-06']

const line = (over: Partial<PLLine> & { forecast_months?: Record<string, number> }): PLLine => ({
  account_name: 'Line', category: 'Revenue', actual_months: {}, forecast_months: {}, ...over,
} as PLLine)

/** The predicates only read these two fields. */
const cat = (category: string | null, account_type: string | null = null) =>
  ({ category, account_type }) as Pick<PLLine, 'category' | 'account_type'>

/** Put the whole annual figure in July — the sum is what matters here. */
const july = (total: number) => ({ '2026-07': total })

describe('bucketing', () => {
  it('revenue includes Other Income (it sits above the bottom line in Xero)', () => {
    expect(isRevenueLine(cat('Revenue'))).toBe(true)
    expect(isRevenueLine(cat('Other Income'))).toBe(true)
    expect(isRevenueLine(cat('Trading Revenue'))).toBe(true)
    // Actuals-only rows carry account_type but no category (Phase 65).
    expect(isRevenueLine(cat(null, 'other_income'))).toBe(true)
    expect(isRevenueLine(cat('Operating Expenses'))).toBe(false)
  })

  it('COGS matches by category or account_type, and never counts as OpEx', () => {
    expect(isCOGSLine(cat('Cost of Sales'))).toBe(true)
    expect(isCOGSLine(cat(null, 'cogs'))).toBe(true)
    expect(isOpExLine(cat('Cost of Sales'))).toBe(false)
  })

  it('anything not revenue or COGS is OpEx', () => {
    expect(isOpExLine(cat('Operating Expenses'))).toBe(true)
    expect(isOpExLine(cat('Other Expenses'))).toBe(true)
    expect(isOpExLine(cat('Other Income'))).toBe(false)
  })
})

describe('sumAnnualPlan', () => {
  // Urban Road FY2027, as stored on 7 Sep 2026.
  const URBAN_ROAD: PLLine[] = [
    line({ account_name: 'Sales', category: 'Revenue', forecast_months: july(6_028_196) }),
    line({ account_name: 'Other Income', category: 'Other Income', forecast_months: july(221) }),
    line({ account_name: 'Cost of Sales', category: 'Cost of Sales', forecast_months: july(3_550_072) }),
    line({ account_name: 'Wages & Salaries', category: 'Operating Expenses', forecast_months: july(916_586) }),
    line({ account_name: 'Everything else', category: 'Operating Expenses', forecast_months: july(1_025_514) }),
  ]

  it('reproduces the stored P&L the wizard Review agreed on', () => {
    const t = sumAnnualPlan(URBAN_ROAD, FY27)
    expect(t.revenue).toBe(6_028_417) // revenue + other income
    expect(t.cogs).toBe(3_550_072)
    expect(t.opex).toBe(1_942_100)
    expect(t.netProfit).toBe(536_245)
    expect(t.netProfitPct).toBeCloseTo(8.9, 1)
    expect(t.grossProfitPct).toBeCloseTo(41.1, 1)
    expect(t.hasPlan).toBe(true)
  })

  it('sums ONE year — a 3-year forecast does not print three years on a Year-1 card', () => {
    const multiYear = [
      line({ category: 'Revenue', forecast_months: { ...july(1_000_000), '2027-07': 9_000_000 } }),
      line({ category: 'Cost of Sales', forecast_months: { ...july(400_000), '2027-07': 3_600_000 } }),
    ]
    const y1 = sumAnnualPlan(multiYear, FY27)
    expect(y1.revenue).toBe(1_000_000)
    expect(y1.netProfit).toBe(600_000)
    const y2 = sumAnnualPlan(multiYear, FY28)
    expect(y2.revenue).toBe(9_000_000)
  })

  it('ignores actual_months — this is the plan, not the landing view', () => {
    const withActuals = [
      line({ category: 'Revenue', forecast_months: july(500_000), actual_months: july(123_456) }),
    ]
    expect(sumAnnualPlan(withActuals, FY27).revenue).toBe(500_000)
  })

  it('hasPlan is false when the rows carry no plan for those months', () => {
    expect(sumAnnualPlan([], FY27).hasPlan).toBe(false)
    // Lines exist, but all their data is in another year.
    expect(sumAnnualPlan([line({ category: 'Revenue', forecast_months: { '2027-07': 100 } })], FY27).hasPlan).toBe(false)
    // Expenses but no revenue is not a plan worth printing totals from.
    expect(sumAnnualPlan([line({ category: 'Operating Expenses', forecast_months: july(5_000) })], FY27).hasPlan).toBe(false)
  })

  it('tolerates missing / malformed month maps', () => {
    const messy = [
      line({ category: 'Revenue', forecast_months: undefined as unknown as Record<string, number> }),
      line({ category: 'Revenue', forecast_months: { '2026-07': Number.NaN, '2026-08': 1_000 } }),
    ]
    expect(sumAnnualPlan(messy, FY27).revenue).toBe(1_000)
  })
})
