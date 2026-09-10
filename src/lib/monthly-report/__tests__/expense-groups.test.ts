/**
 * Figures and group names are Urban Road's August 2026 pack.
 */
import { describe, it, expect } from 'vitest'
import { groupExpenseLines, hasExpenseGroups } from '../expense-groups'
import type { ReportLine } from '@/app/finances/monthly-report/types'

function line(over: Partial<ReportLine> & { account_name: string }): ReportLine {
  return {
    xero_account_name: over.account_name,
    is_budget_only: false,
    actual: 0, budget: 0, variance_amount: 0, variance_percent: 0,
    ytd_actual: 0, ytd_budget: 0, ytd_variance_amount: 0, ytd_variance_percent: 0,
    unspent_budget: 0, budget_next_month: 0, budget_annual_total: 0,
    prior_year: null,
    ...over,
  }
}

const ORDER = [
  'Employment Expense', 'Travel & Accommodation', 'Professional Expense',
  'IT Hardware and Software', 'Marketing and Advertising', 'Occupancy Expense',
  'Foreign Currency Gains and Losses', 'Bank and Other Fees', 'Other Operating Expenses',
]

describe('groupExpenseLines', () => {
  it('is a no-op for a client that has grouped nothing', () => {
    const lines = [line({ account_name: 'Rent - Office' }), line({ account_name: 'Cleaning' })]
    const out = groupExpenseLines(lines, ORDER)
    expect(out).toHaveLength(1)
    expect(out[0].name).toBeNull()
    expect(out[0].subtotal).toBeNull()
    expect(out[0].lines.map(l => l.account_name)).toEqual(['Rent - Office', 'Cleaning'])
  })

  it('follows the coach order, not the alphabet and not the account codes', () => {
    const lines = [
      line({ account_name: 'Bank Fees', group: 'Bank and Other Fees' }),
      line({ account_name: 'Accounting Fees', group: 'Professional Expense' }),
      line({ account_name: 'Employ - Wages & Salaries', group: 'Employment Expense' }),
    ]
    // Alphabetically this is Bank, Employment, Professional; by lowest account
    // code it is Professional (60100), Bank (60550), Employment (62130).
    expect(groupExpenseLines(lines, ORDER).map(g => g.name)).toEqual([
      'Employment Expense', 'Professional Expense', 'Bank and Other Fees',
    ])
  })

  it('subtotals a group from its own lines', () => {
    // Urban Road's Employment Expense, August 2026: budget 59,479 / actual 60,271.
    const lines = [
      line({ account_name: 'Employ - Staff Amenities', group: 'Employment Expense', actual: 1240.81, budget: 450, ytd_actual: 1370, ytd_budget: 900 }),
      line({ account_name: 'Employ - Staff Recruitment', group: 'Employment Expense', actual: 208.16, budget: 208, ytd_actual: 416, ytd_budget: 416 }),
      line({ account_name: 'Employ - Superannuation', group: 'Employment Expense', actual: 6302.35, budget: 6302, ytd_actual: 11344, ytd_budget: 11344 }),
      line({ account_name: 'Employ - Wages & Salaries', group: 'Employment Expense', actual: 52519.25, budget: 52519, ytd_actual: 94535, ytd_budget: 94534 }),
    ]
    const [g] = groupExpenseLines(lines, ORDER)
    expect(g.subtotal!.account_name).toBe('Employment Expense')
    expect(g.subtotal!.actual).toBeCloseTo(60270.57, 2)
    expect(g.subtotal!.budget).toBeCloseTo(59479, 2)
    // Expense convention: budget − actual, so an overrun is negative.
    expect(g.subtotal!.variance_amount).toBeCloseTo(-791.57, 2)
    expect(g.subtotal!.ytd_actual).toBeCloseTo(107665, 2)
  })

  it('derives the subtotal percentage from the sums, never by adding percentages', () => {
    const lines = [
      line({ account_name: 'A', group: 'G', actual: 100, budget: 50, variance_percent: -100 }),
      line({ account_name: 'B', group: 'G', actual: 100, budget: 150, variance_percent: 33.3 }),
    ]
    const [g] = groupExpenseLines(lines, ORDER)
    // 200 against 200 is on budget, whatever the two rows' percentages add to.
    expect(g.subtotal!.variance_amount).toBe(0)
    expect(g.subtotal!.variance_percent).toBe(0)
  })

  it('shows a dash, not a zero, when no line in the group has a prior year', () => {
    const lines = [line({ account_name: 'A', group: 'G', actual: 10, prior_year: null })]
    expect(groupExpenseLines(lines, ORDER)[0].subtotal!.prior_year).toBeNull()

    const withHistory = [
      line({ account_name: 'A', group: 'G', prior_year: null }),
      line({ account_name: 'B', group: 'G', prior_year: 881 }),
    ]
    expect(groupExpenseLines(withHistory, ORDER)[0].subtotal!.prior_year).toBe(881)
  })

  it('puts a group the coach has not ordered after the ones they have', () => {
    const lines = [
      line({ account_name: 'Bank Fees', group: 'Bank and Other Fees' }),
      line({ account_name: 'Freight', group: 'Zebra Group' }),
      line({ account_name: 'Amex', group: 'Aardvark Group' }),
    ]
    // A newly-created group must APPEAR, sorted, rather than vanish.
    expect(groupExpenseLines(lines, ORDER).map(g => g.name)).toEqual([
      'Bank and Other Fees', 'Aardvark Group', 'Zebra Group',
    ])
  })

  it('runs the accounts nobody has grouped last, under no heading and no subtotal', () => {
    const lines = [
      line({ account_name: 'Donations' }),
      line({ account_name: 'Bank Fees', group: 'Bank and Other Fees' }),
    ]
    const out = groupExpenseLines(lines, ORDER)
    expect(out.map(g => g.name)).toEqual(['Bank and Other Fees', null])
    // Naming it "Other" would claim a decision the coach has not made.
    expect(out[1].subtotal).toBeNull()
    expect(out[1].lines.map(l => l.account_name)).toEqual(['Donations'])
  })

  it('treats a blank or whitespace group as ungrouped', () => {
    const lines = [line({ account_name: 'A', group: '   ' }), line({ account_name: 'B', group: null })]
    const out = groupExpenseLines(lines, ORDER)
    expect(out).toHaveLength(1)
    expect(out[0].name).toBeNull()
  })

  it('survives no order at all', () => {
    const lines = [
      line({ account_name: 'B', group: 'Beta' }),
      line({ account_name: 'A', group: 'Alpha' }),
    ]
    expect(groupExpenseLines(lines, null).map(g => g.name)).toEqual(['Alpha', 'Beta'])
  })
})

describe('hasExpenseGroups', () => {
  it('is false until a coach groups something', () => {
    expect(hasExpenseGroups([line({ account_name: 'A' })])).toBe(false)
    expect(hasExpenseGroups([line({ account_name: 'A', group: '  ' })])).toBe(false)
    expect(hasExpenseGroups([line({ account_name: 'A', group: 'Employment Expense' })])).toBe(true)
  })
})
