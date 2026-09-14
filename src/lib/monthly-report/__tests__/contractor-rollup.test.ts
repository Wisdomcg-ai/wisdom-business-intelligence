/**
 * Contractors, categories and figures are Urban Road's August 2026 Calxa page:
 * grand total $31,029 against a $28,375 budget.
 */
import { describe, it, expect } from 'vitest'
import { rollUpContractors, contractorLoadReason } from '../contractor-rollup'
import type { SubscriptionDetailData, SubscriptionVendorLine } from '@/app/finances/monthly-report/types'

function vendor(name: string, actual: number, budget: number, prior = 0): SubscriptionVendorLine {
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, '')
  return {
    vendor_name: name,
    vendor_key: key,
    prior_month_actual: prior,
    actual,
    budget,
    variance: budget - actual,
    transaction_count: actual > 0 ? 1 : 0,
    category: CATEGORIES.get(key) ?? null,
  }
}

function data(vendors: SubscriptionVendorLine[], second: SubscriptionVendorLine[] = []): SubscriptionDetailData {
  const group = (code: string, vs: SubscriptionVendorLine[]) => ({
    account_code: code,
    account_name: `Account ${code}`,
    vendors: vs,
    total_prior_month: vs.reduce((t, v) => t + v.prior_month_actual, 0),
    total_actual: vs.reduce((t, v) => t + v.actual, 0),
    total_budget: vs.reduce((t, v) => t + v.budget, 0),
    total_variance: vs.reduce((t, v) => t + v.variance, 0),
  })
  const accounts = [group('61400', vendors)]
  if (second.length) accounts.push(group('61410', second))
  return {
    accounts,
    grand_total: { prior_month: 0, actual: 0, budget: 0, variance: 0 },
    report_month: '2026-08',
  }
}

const CATEGORIES = new Map<string, string | null>([
  ['ailenealfonso', 'Marketing'],
  ['larramartinez', 'Marketing'],
  ['honeybeedionio', 'Operations'],
  ['maxxtud', 'Operations'],
  ['katrinaredondo', 'Finance'],
  ['upworkglobal', 'Sales/Commercial'],
])
const ORDER = ['All Departments', 'Creative/Product', 'Finance', 'Marketing', 'Operations', 'Sales/Commercial']

describe('rollUpContractors', () => {
  it('returns an empty rollup rather than throwing when there is no detail', () => {
    const out = rollUpContractors(null, ORDER)
    expect(out.contractors).toEqual([])
    expect(out.categories).toEqual([])
    expect(out.grand_total).toEqual({ prior_month: 0, budget: 0, actual: 0, variance: 0 })
  })

  it('lists contractors alphabetically, not by spend', () => {
    // Spend order would put Mark first and move him the month he bills less.
    const out = rollUpContractors(
      data([vendor('Mark Joseph Judaya', 5549, 2800), vendor('Ailene Alfonso', 2099, 2922)]),
      ORDER,
    )
    expect(out.contractors.map(c => c.vendor_name)).toEqual(['Ailene Alfonso', 'Mark Joseph Judaya'])
  })

  it('signs an overrun negative, as the rest of the pack does', () => {
    // Mark Joseph Judaya: budget 2,800, paid 5,549.
    const [c] = rollUpContractors(data([vendor('Mark Joseph Judaya', 5549, 2800)]), ORDER).contractors
    expect(c.variance).toBe(-2749)
  })

  it('sums one contractor paid out of two nominated accounts', () => {
    const out = rollUpContractors(
      data([vendor('Upwork Global', 1000, 1650, 900)], [vendor('Upwork Global', 382, 0, 442)]),
      ORDER,
    )
    expect(out.contractors).toHaveLength(1)
    expect(out.contractors[0].actual).toBe(1382)
    expect(out.contractors[0].budget).toBe(1650)
    expect(out.contractors[0].prior_month_actual).toBe(1342)
    expect(out.contractors[0].variance).toBe(268)
  })

  it('rolls categories up in the coach order and subtotals each', () => {
    const out = rollUpContractors(
      data([
        vendor('Ailene Alfonso', 2099, 2922),
        vendor('Larra Martinez', 2228, 3072),
        vendor('Honeybee Dionio', 2625, 2310),
        vendor('Katrina Redondo', 2797, 3000),
      ]),
      ORDER,
    )
    expect(out.categories.map(g => g.name)).toEqual(['Finance', 'Marketing', 'Operations'])
    const marketing = out.categories.find(g => g.name === 'Marketing')!
    expect(marketing.subtotal.budget).toBe(5994)
    expect(marketing.subtotal.actual).toBe(4327)
    expect(marketing.subtotal.variance).toBe(1667)
    // Operations overspent: 2,310 budget against 2,625 paid.
    expect(out.categories.find(g => g.name === 'Operations')!.subtotal.variance).toBe(-315)
  })

  it('runs contractors nobody has categorised last, under no heading', () => {
    const out = rollUpContractors(
      data([vendor('Airtasker', 190, 0), vendor('Ailene Alfonso', 2099, 2922)]),
      ORDER,
    )
    expect(out.categories.map(g => g.name)).toEqual(['Marketing', null])
    expect(out.categories[1].contractors.map(c => c.vendor_name)).toEqual(['Airtasker'])
  })

  it('shows a category the coach has not ordered rather than dropping it', () => {
    const v = { ...vendor('New Person', 100, 0), category: 'Brand New Team' }
    const out = rollUpContractors(data([v]), ORDER)
    expect(out.categories.map(g => g.name)).toEqual(['Brand New Team'])
  })

  it('grand total is the contractors, not the response envelope', () => {
    // The envelope's grand_total covers whatever accounts were requested; the
    // page's total must be the rows it actually prints.
    const out = rollUpContractors(
      data([vendor('A', 31029, 28375, 29911)]),
      ORDER,
    )
    expect(out.grand_total.actual).toBe(31029)
    expect(out.grand_total.budget).toBe(28375)
    expect(out.grand_total.variance).toBe(-2654)
    expect(out.grand_total.prior_month).toBe(29911)
  })

  it('treats an empty-string category as uncategorised', () => {
    const v = { ...vendor('A', 1, 0), category: '' }
    expect(rollUpContractors(data([v]), ORDER).categories[0].name).toBeNull()
  })
})

describe('contractorLoadReason — what the page says when the rows are missing or partial', () => {
  const empty = (extra: Partial<SubscriptionDetailData> = {}): SubscriptionDetailData => ({
    accounts: [], grand_total: { prior_month: 0, actual: 0, budget: 0, variance: 0 }, report_month: '2026-08', ...extra,
  })

  it('an unconnected business is could-not-check, never "no contractor payments were found"', () => {
    const reason = contractorLoadReason(empty({ complete: false, incomplete_reason: 'the business has no active Xero connection' }), 0)
    expect(reason).toBe('the contractor figures could not be fully read from Xero (the business has no active Xero connection)')
    expect(reason).not.toMatch(/no contractor payments/)
  })

  it('a complete crawl with no rows is the one case that may say nothing was paid', () => {
    expect(contractorLoadReason(empty({ complete: true }), 0)).toBe('no contractor payments were found in Xero for this month')
  })

  it('a complete crawl with no rows, but the ledger shows spend on these accounts (a journal), does not say nobody was paid', () => {
    const reason = contractorLoadReason(empty({ complete: true, grand_total: { prior_month: 0, actual: 3250.4, budget: 0, variance: 0 } }), 0)
    expect(reason).toBe('no contractor bills or payments were found in Xero, though the ledger shows $3,250 on these accounts this month')
    expect(reason).not.toMatch(/no contractor payments were found/)
  })

  it('an answer that does not say whether it is complete (an older response, a payload file) is not read as empty', () => {
    expect(contractorLoadReason(empty(), 0)).toBe('the contractor figures could not be confirmed as complete')
  })

  it('rows from a complete crawl need no reason; rows from a partial one carry it', () => {
    expect(contractorLoadReason(empty({ complete: true }), 3)).toBeUndefined()
    expect(contractorLoadReason(empty({ complete: false, incomplete_reason: 'Xero could not be read for Urban Road Pty Ltd' }), 3))
      .toBe('the contractor figures could not be fully read from Xero (Xero could not be read for Urban Road Pty Ltd)')
    // With rows, an unknown answer is left as it always was: the rows print.
    expect(contractorLoadReason(empty(), 3)).toBeUndefined()
  })

  it('no data at all is could-not-check', () => {
    expect(contractorLoadReason(null, 0)).toBe('the contractor figures could not be confirmed as complete')
  })
})
