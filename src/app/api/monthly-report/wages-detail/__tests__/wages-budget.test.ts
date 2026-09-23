/**
 * The wages page's account budget, and the word over it.
 *
 * The page read `forecast_pl_lines` unconditionally and never consulted
 * budget_source. Urban Road has payroll_detail on, so the page is in their
 * August pack: it headed an unqualified "Budget" over $76,182 for
 * 'Employ - Wages & Salaries' while pages 4, 6 and 10 of the same pack headed
 * "Approved Budget" over $52,519 for the same account. Two numbers, one word,
 * one pack — and for the five clients with no effective forecast the column was
 * $0 throughout, which the page reported as a 100% favourable variance on
 * wages.
 *
 * Figures are Urban Road Pty Ltd, August 2026, off locked budget version
 * "Overall Budget (Xero, rev 12 Aug 2026)": 62170 Employ - Wages & Salaries
 * $52,519 and 62160 Employ - Superannuation $6,302.
 */
import { describe, it, expect } from 'vitest'
import { buildWagesBudgetResolver, type WagesBudgetLine } from '../_helpers'
import { wagesYardstick, wagesEmployeeYardstick } from '@/app/finances/monthly-report/utils/budget-yardstick'

/** Urban Road's approved budget, as the resolver hands it to this page. */
const APPROVED: WagesBudgetLine[] = [
  { account_name: 'Employ - Wages & Salaries', forecast_months: { '2026-07': 42015, '2026-08': 52519 } },
  { account_name: 'Employ - Superannuation', forecast_months: { '2026-07': 5042, '2026-08': 6302 } },
  { account_name: 'Employ - Staff Amenities', forecast_months: { '2026-08': 450 } },
]

/** The forecast the page used to read instead — same client, same month. */
const FORECAST: WagesBudgetLine[] = [
  { account_name: 'Wages & Salaries', forecast_months: { '2026-08': 76182.16 }, is_from_payroll: true },
  { account_name: 'Superannuation', forecast_months: { '2026-08': 5625.86 }, is_from_payroll: true },
]

const WAGES_ACCOUNTS = ['Employ - Wages & Salaries', 'Employ - Superannuation']

describe('the wages page measures against the budget the client is held to', () => {
  it('takes Urban Road August wages and super off the approved budget', () => {
    const resolve = buildWagesBudgetResolver(APPROVED, new Map())
    expect(resolve(WAGES_ACCOUNTS[0], '2026-08')).toBe(52519)
    expect(resolve(WAGES_ACCOUNTS[1], '2026-08')).toBe(6302)
  })

  it('is a different number from the forecast the page used to read', () => {
    const approved = buildWagesBudgetResolver(APPROVED, new Map())
    const forecast = buildWagesBudgetResolver(FORECAST, new Map())
    // The forecast's account names differ from the Xero ones; the name-order
    // tier still matches them, which is exactly why the two columns looked
    // comparable.
    expect(forecast(WAGES_ACCOUNTS[0], '2026-08')).toBeCloseTo(76182.16, 2)
    expect(approved(WAGES_ACCOUNTS[0], '2026-08')).not.toBeCloseTo(76182.16, 2)
  })

  it('reads the month asked for, not whichever month has a figure', () => {
    const resolve = buildWagesBudgetResolver(APPROVED, new Map())
    expect(resolve(WAGES_ACCOUNTS[0], '2026-07')).toBe(42015)
    expect(resolve(WAGES_ACCOUNTS[0], '2026-12')).toBe(0)
  })

  it('leaves a forecast client exactly where they were, payroll fallback included', () => {
    // Fourth tier: no name match at all, so any payroll-derived forecast line
    // will do. Unchanged behaviour — ten clients' pages depend on it.
    const resolve = buildWagesBudgetResolver(FORECAST, new Map())
    expect(resolve('Contractor Payments', '2026-08')).toBeCloseTo(76182.16, 2)
  })

  it('does not borrow a payroll line when the budget is the approved one', () => {
    // budget_versions carries no is_from_payroll, so the guess tier cannot
    // fire: an unmatched account reports no budget rather than another
    // account's.
    const resolve = buildWagesBudgetResolver(APPROVED, new Map())
    expect(resolve('Contractor Payments', '2026-08')).toBe(0)
  })

  it('bridges through account_mappings when the names differ', () => {
    const resolve = buildWagesBudgetResolver(
      [{ account_name: 'Payroll — all staff', forecast_months: { '2026-08': 1000 } }],
      new Map([['salaries (xero)', 'Payroll — all staff']]),
    )
    expect(resolve('Salaries (Xero)', '2026-08')).toBe(1000)
  })
})

describe('the word over the wages page money', () => {
  it('names the approved budget, and the version, for a budget-store client', () => {
    const y = wagesYardstick({
      source: 'budget_version',
      label: 'Overall Budget (Xero, rev 12 Aug 2026)',
      fiscal_year: 2027,
    })
    expect(y.columnLabel).toBe('Approved Budget')
    expect(y.available).toBe(true)
    expect(y.note).toContain('Overall Budget (Xero, rev 12 Aug 2026)')
    expect(y.note).toContain('not the forecast')
  })

  it('leaves a forecast client with the word they had, and no note', () => {
    const y = wagesYardstick({ source: 'forecast', label: 'FY2027 Forecast', fiscal_year: 2027 })
    expect(y.columnLabel).toBe('Budget')
    expect(y.note).toBeNull()
    expect(y.available).toBe(true)
  })

  it('a response from before this field is rendered exactly as it was', () => {
    const y = wagesYardstick(undefined)
    expect(y.columnLabel).toBe('Budget')
    expect(y.available).toBe(true)
    expect(y.absentNote).toBeNull()
  })

  it('says why, rather than showing $0, when nothing resolved', () => {
    const y = wagesYardstick({ source: 'none', reason: 'no_version_in_force', fiscal_year: 2027 })
    expect(y.available).toBe(false)
    expect(y.absentNote).toContain('FY2027')
    expect(y.absentNote).toContain('no approved budget version is locked')
  })

  it('names the forecast path when there is no forecast at all', () => {
    const y = wagesYardstick({ source: 'none', reason: null, fiscal_year: 2027 })
    expect(y.available).toBe(false)
    expect(y.absentNote).toContain('no active forecast was found for FY2027')
  })
})

describe('the per-employee column is a different object', () => {
  it('dashes it, and says so, when no per-employee plan exists', () => {
    const y = wagesEmployeeYardstick({ source: 'budget_version' }, false)
    expect(y.available).toBe(false)
    expect(y.absentNote).toContain('No per-employee plan')
  })

  it('calls it the forecast when the page above it is the approved budget', () => {
    const y = wagesEmployeeYardstick({ source: 'budget_version' }, true)
    expect(y.columnLabel).toBe('Forecast')
    expect(y.note).toContain('not split by employee')
  })

  it('leaves a forecast client with one word for both tables', () => {
    const y = wagesEmployeeYardstick({ source: 'forecast' }, true)
    expect(y.columnLabel).toBe('Budget')
    expect(y.note).toBeNull()
  })
})

describe('the per-employee column from the Payroll Report roster', () => {
  it('is available, headed "Budget", with one plain line naming the source', () => {
    const y = wagesEmployeeYardstick({ source: 'budget_version' }, true, { status: 'applied', missing: [], unchecked: [] })
    expect(y).toEqual({
      columnLabel: 'Budget',
      note: 'Per-employee budgets are the Payroll Report roster’s weekly salaries × this month’s pay runs.',
      available: true,
      absentNote: null,
    })
  })

  it('names anyone the roster gives no weekly salary, and says the total is left out', () => {
    const y = wagesEmployeeYardstick({ source: 'budget_version' }, true, { status: 'applied', missing: ['Thomas White', 'Casual Person'], unchecked: [] })
    expect(y.note).toBe(
      'Per-employee budgets are the Payroll Report roster’s weekly salaries × this month’s pay runs. ' +
        'No weekly salary on the roster for Thomas White and Casual Person, so their Budget is shown as “—” and the Budget total is left out.',
    )
  })

  it('says why, when the roster could not be turned into a budget for the month', () => {
    const y = wagesEmployeeYardstick({ source: 'budget_version' }, false, { status: 'unavailable', reason: 'mixed_pay_cycles' })
    expect(y.available).toBe(false)
    expect(y.columnLabel).toBe('Budget')
    expect(y.absentNote).toBe(
      'The Payroll Report roster’s weekly salaries could not be turned into this month’s budget because ' +
        'this month’s pay runs are on more than one pay cycle, so the per-employee Budget and Variance columns are shown as “—”.',
    )
  })
})

/**
 * F5 (22 Sep 2026 system diagnostic) — the last-resort payroll tier multiplied
 * the budget. Every configured wages account that matched nothing took the
 * LARGEST payroll-flagged budget line, so one $50,000 plan line was counted
 * once per account: a grand budget of $150,000 against a $50,000 plan, and a
 * favourable variance the client never had.
 */
describe('a payroll budget line is spent once', () => {
  const PAYROLL_ONLY: WagesBudgetLine[] = [
    { account_name: 'Production Wages', forecast_months: { '2026-08': 50_000 }, is_from_payroll: true },
  ]
  // Three accounts the coach configured, none of which this budget names.
  const UNMATCHED = ['Warehouse Wages', 'Admin Wages', 'Site Wages']

  it('the first account takes it and the others fall through at zero', () => {
    const resolve = buildWagesBudgetResolver(PAYROLL_ONLY, new Map())
    const budgets = UNMATCHED.map((name) => resolve(name, '2026-08'))
    expect(budgets).toEqual([50_000, 0, 0])
    expect(budgets.reduce((a, b) => a + b, 0)).toBe(50_000)
  })

  it('two payroll lines cover two accounts, largest first, and never a third', () => {
    const twoLines: WagesBudgetLine[] = [
      ...PAYROLL_ONLY,
      { account_name: 'Casual Wages', forecast_months: { '2026-08': 12_000 }, is_from_payroll: true },
    ]
    const resolve = buildWagesBudgetResolver(twoLines, new Map())
    expect(UNMATCHED.map((name) => resolve(name, '2026-08'))).toEqual([50_000, 12_000, 0])
  })

  it('each month is counted on its own', () => {
    const resolve = buildWagesBudgetResolver(
      [{ account_name: 'Production Wages', forecast_months: { '2026-07': 48_000, '2026-08': 50_000 }, is_from_payroll: true }],
      new Map(),
    )
    expect(resolve('Warehouse Wages', '2026-07')).toBe(48_000)
    expect(resolve('Admin Wages', '2026-07')).toBe(0)
    // August has its own claim to spend.
    expect(resolve('Warehouse Wages', '2026-08')).toBe(50_000)
    expect(resolve('Admin Wages', '2026-08')).toBe(0)
  })

  it('an account that matches the budget by name is unaffected — it never reaches this tier', () => {
    const resolve = buildWagesBudgetResolver(
      [
        { account_name: 'Employ - Wages & Salaries', forecast_months: { '2026-08': 52_519 } },
        { account_name: 'Production Wages', forecast_months: { '2026-08': 50_000 }, is_from_payroll: true },
      ],
      new Map(),
    )
    expect(resolve('Employ - Wages & Salaries', '2026-08')).toBe(52_519)
    // The payroll line is still unclaimed for an account that found nothing.
    expect(resolve('Warehouse Wages', '2026-08')).toBe(50_000)
  })
})
