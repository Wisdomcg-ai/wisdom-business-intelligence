/**
 * The pack's Cashflow Forecast table against Calxa's pages 23-25, on Urban
 * Road's own August 2026 figures.
 *
 * The page it replaces printed payments as positive figures, collected row
 * labels month by month (so a late first cash month sent an account to the end
 * of its section), grouped expenses by account-name keyword and had no Total
 * column. None of that changes a dollar of the cash; all of it changes what a
 * reader sees beside the Calxa pack.
 */
import { describe, it, expect } from 'vitest'
import { buildPackCashflowRows, type PackCashflowRow } from '../pack-cashflow-rows'
import { buildPackCashflowForecast } from '../pack-cashflow'
import { urbanRoadFullYear, UR_EXPENSE_GROUP_ORDER } from './urban-road-full-year-fixture'
import type { CashflowForecastData, FinancialForecast } from '@/app/finances/forecast/types'

const FY2027: FinancialForecast = {
  id: 'ac18b877-e155-49a7-ad88-5399352a0dc5',
  business_id: '28d41193-38ae-4071-a2b1-0dbea90a38fd',
  user_id: 'u',
  name: 'FY2027 Forecast (from Xero budget)',
  fiscal_year: 2027,
  year_type: 'FY',
  actual_start_month: '2026-07',
  actual_end_month: '2026-08',
  forecast_start_month: '2026-09',
  forecast_end_month: '2027-06',
} as FinancialForecast

function urbanRoadCashflow(): CashflowForecastData {
  const cf = buildPackCashflowForecast({
    fullYear: urbanRoadFullYear(),
    reportMonth: '2026-08',
    forecast: FY2027,
    forecastLines: [],
    savedAssumptions: null,
    opening: { status: 'read', amount: 167629.81, asAt: '2026-06-30' },
  })
  expect(cf).not.toBeNull()
  return cf!
}

const rows = () => buildPackCashflowRows(urbanRoadCashflow(), UR_EXPENSE_GROUP_ORDER)
const labels = (rs: PackCashflowRow[]) => rs.map((r) => r.label)
const row = (rs: PackCashflowRow[], label: string, kind?: PackCashflowRow['kind']) => {
  const found = rs.find((r) => r.label === label && (!kind || r.kind === kind))
  expect(found, `row "${label}"`).toBeDefined()
  return found!
}
const round = (vs: number[]) => vs.map((v) => Math.round(v))

/** The accounts under an expense group row, up to the next group or subtotal. */
function membersOf(rs: PackCashflowRow[], group: string): string[] {
  const start = rs.findIndex((r) => r.kind === 'group' && r.label === group)
  expect(start, `group "${group}"`).toBeGreaterThanOrEqual(0)
  const members: string[] = []
  for (const r of rs.slice(start + 1)) {
    if (r.kind !== 'line') break
    members.push(r.label)
  }
  return members
}

describe('buildPackCashflowRows — Urban Road, August 2026', () => {
  it('prints a credit to an expense account as money in, not as a payment', () => {
    // Repairs & Maintenance Warehouse was credited $502.83 in July and $132.83
    // in August. Math.abs made them (543) and (143) outflows; Calxa prints a
    // credit as a positive figure (+156 in its September).
    const rm = row(rows(), 'Repairs & Maintenance Warehouse')
    expect(round(rm.values.slice(0, 3))).toEqual([543, 143, -108])
  })

  it('prints every payment row and expense group row as a negative', () => {
    const rs = rows()
    expect(Math.round(row(rs, 'Antons Canvas').values[0])).toBe(-229_091)
    expect(Math.round(row(rs, 'Employment Expense', 'group').values[0])).toBe(-47_421)
    expect(Math.round(row(rs, 'Cash Outflows from Operation').values[0])).toBe(-522_117)
    // Receipts stay positive; a discount or a return is money out of income.
    expect(Math.round(row(rs, 'Canvas Sales').values[0])).toBe(371_142)
    expect(Math.round(row(rs, 'Returns & Allowances').values[0])).toBe(-24_859)
  })

  it('files accounts under their mapping group, not the engine keywords', () => {
    const rs = rows()
    // 'worker' filed Insurance under Employment; 'internet' filed Telephone
    // under IT; 'airfare' never matched "Air Fares".
    expect(membersOf(rs, 'Other Operating Expenses')).toContain('Insurance excl Workers Comp')
    expect(membersOf(rs, 'Employment Expense')).not.toContain('Insurance excl Workers Comp')
    expect(membersOf(rs, 'Occupancy Expense')).toEqual(expect.arrayContaining([
      'Telephone & Internet', 'USA Company Expenses', 'Repairs & Maintenance Warehouse',
    ]))
    expect(membersOf(rs, 'Travel & Accommodation')).toEqual(expect.arrayContaining([
      "T/E - Air Fares/Taxis - O'seas", 'T/E - Air Fares/Taxis - Aust', 'T/E - Trade Shows',
    ]))
    expect(membersOf(rs, 'Bank and Other Fees')).toEqual(expect.arrayContaining(['Shopify Fees', 'Licence Fees']))
  })

  it("prints the groups in the coach's order, the FX group between Occupancy and Bank and Other Fees", () => {
    const groups = rows().filter((r) => r.kind === 'group').map((r) => r.label)
    expect(groups).toEqual(UR_EXPENSE_GROUP_ORDER)
  })

  it('prints accounts in statement order, not in the order their cash first lands', () => {
    const ls = labels(rows())
    const before = (a: string, b: string) => expect(ls.indexOf(a), `${a} before ${b}`).toBeLessThan(ls.indexOf(b))
    // Services' only actual is August's, collected in September.
    before('Services', 'Returns & Allowances')
    before('Materialised', 'USA Sales')
    before('Cushions & Decor', 'Art Supplies')
    before('Art Supplies', 'Packaging')
    expect(membersOf(rows(), 'Marketing and Advertising')[0]).toBe('Marketing - Advertising')
    before('Licence Fees', 'Merchant Fees')
  })

  it('uses Calxa\'s labels and always prints Other Inflows', () => {
    const ls = labels(rows())
    for (const label of ['Bank at Beginning', 'Income', 'Cash Inflows from Operation', 'Cost of Sales', 'Expense',
      'Cash Outflows from Operation', 'Liability', 'Movement in Liabilities', 'Other Inflows', 'Net Movement', 'Bank at End']) {
      expect(ls).toContain(label)
    }
    expect(ls).not.toContain('Cash Inflows from Operations')
    expect(ls).not.toContain('Balance Sheet — Liabilities')

    // A cashflow with no other income still prints the row, at zero.
    const cf = urbanRoadCashflow()
    const quiet = { ...cf, months: cf.months.map((m) => ({ ...m, other_income_lines: [], other_inflows: 0 })) }
    const other = row(buildPackCashflowRows(quiet, UR_EXPENSE_GROUP_ORDER), 'Other Inflows')
    expect(other.values.every((v) => v === 0)).toBe(true)
    expect(labels(buildPackCashflowRows(quiet, UR_EXPENSE_GROUP_ORDER))).not.toContain('Other Income')
  })

  it('carries a Total column: first opening, last closing, every other row summed', () => {
    const rs = rows()
    expect(Math.round(row(rs, 'Bank at Beginning').total!)).toBe(167_630)
    expect(Math.round(row(rs, 'Bank at End').total!)).toBe(652_465)
    expect(Math.round(row(rs, 'Net Movement').total!)).toBe(484_836)
    for (const r of rs) {
      if (r.kind === 'heading') expect(r.total).toBeNull()
      else if (r.kind !== 'bank') expect(r.total).toBeCloseTo(r.values.reduce((s, v) => s + v, 0), 6)
    }
  })

  it('adds up down the page in every month: the rows are the engine\'s cash, only re-signed', () => {
    const rs = rows()
    const cf = urbanRoadCashflow()
    cf.months.forEach((m, i) => {
      const at = (label: string) => row(rs, label).values[i]
      const groupSum = rs.filter((r) => r.kind === 'group').reduce((s, r) => s + r.values[i], 0)
      const cogsStart = rs.findIndex((r) => r.label === 'Cost of Sales')
      const expenseStart = rs.findIndex((r) => r.label === 'Expense')
      const cogsSum = rs.slice(cogsStart + 1, expenseStart).reduce((s, r) => s + r.values[i], 0)
      expect(cogsSum + groupSum).toBeCloseTo(at('Cash Outflows from Operation'), 1)
      expect(at('Cash Inflows from Operation') + at('Cash Outflows from Operation') + at('Movement in Liabilities') + at('Other Inflows'))
        .toBeCloseTo(at('Net Movement'), 1)
      expect(at('Bank at Beginning') + at('Net Movement')).toBeCloseTo(at('Bank at End'), 1)
      expect(at('Bank at End')).toBe(m.bank_at_end)
    })
    for (const g of rs.filter((r) => r.kind === 'group')) {
      const members = membersOf(rs, g.label).map((label) => rs.find((r) => r.kind === 'line' && r.label === label)!)
      g.values.forEach((v, i) => expect(members.reduce((s, r) => s + r.values[i], 0)).toBeCloseTo(v, 1))
    }
  })

  it('with no coach order, prints mapping groups alphabetically, as the statement pages do', () => {
    const groups = buildPackCashflowRows(urbanRoadCashflow(), null).filter((r) => r.kind === 'group').map((r) => r.label)
    expect(groups).toEqual([...UR_EXPENSE_GROUP_ORDER].sort((a, b) => a.localeCompare(b)))
  })

  it('does not let the month a group first has cash decide where it prints', () => {
    // Dragon Roofing, July 2026: Employment Expense only has cash from August,
    // and printed after the two groups with July cash.
    const expense = (account_name: string, group: string | null, july: number) => ({
      account_name, category: 'Operating Expenses', group,
      months: ['2026-07', '2026-08', '2026-09'].map((month, i) => ({
        month, actual: i === 0 ? july : i === 1 ? 1000 : 0, budget: 1000, approved_budget: 1000, prior_year: 0,
      })),
    })
    const cashflowOf = (lines: ReturnType<typeof expense>[]) => buildPackCashflowForecast({
      fullYear: { sections: [{ category: 'Operating Expenses', lines }] } as never,
      reportMonth: '2026-08', forecast: FY2027, forecastLines: [], savedAssumptions: null,
      opening: { status: 'read', amount: 0, asAt: '2026-06-30' },
    })!
    const groupsOf = (cf: CashflowForecastData) =>
      buildPackCashflowRows(cf, null).filter((r) => r.kind === 'group').map((r) => r.label)

    const mapped = cashflowOf([
      expense('Motor Vehicle Expenses', 'Other Operating Expenses', 500),
      expense('Subscriptions', 'Less Operating Expenses', 500),
      expense('Wages and Salaries', 'Employment Expense', 0),
    ])
    expect(mapped.months[0].expense_groups.map((g) => g.group)).not.toContain('Employment Expense')
    expect(groupsOf(mapped)).toEqual(['Employment Expense', 'Less Operating Expenses', 'Other Operating Expenses'])

    // No mapping at all: the engine's keyword headings in the engine's order,
    // Employment first, whichever month its cash starts.
    const keywords = cashflowOf([expense('Rent', null, 500), expense('Wages', null, 0)])
    expect(groupsOf(keywords)).toEqual(['Employment Expense', 'Occupancy Expense'])

    // Mixed: the coach's headings first, then the keyword headings of the
    // accounts nobody has grouped — where partitionByGroup puts them.
    const mixed = cashflowOf([expense('Rent', null, 500), expense('Wages', null, 0), expense('Subscriptions', 'Less Operating Expenses', 0)])
    expect(groupsOf(mixed)).toEqual(['Less Operating Expenses', 'Employment Expense', 'Occupancy Expense'])
  })

  it('keeps first-appearance order when the cashflow carries no statement order', () => {
    const cf = urbanRoadCashflow()
    const legacy = { ...cf, line_order: undefined }
    const ls = labels(buildPackCashflowRows(legacy, UR_EXPENSE_GROUP_ORDER))
    // The old behaviour, still printed rather than dropped.
    expect(ls.indexOf('Services')).toBeGreaterThan(ls.indexOf('Returns & Allowances'))
  })
})
