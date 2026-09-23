/**
 * The Full Year page's expense groups.
 *
 * Every account, code, group and Jul/Aug actual below is Urban Road's, read
 * from prod (xero_pl_lines + account_mappings, September 2026) and checked
 * against the Calxa August 2026 Full Year page. Forecast and approved-budget
 * figures past August are synthetic — they exist to prove the invariant, not
 * to reproduce a pack.
 */
import { describe, it, expect } from 'vitest'
import { groupFullYearLines } from '../full-year-groups'
import { buildFullYearSubtotal } from '../full-year-subtotal'
import { compareStatementLines } from '../statement-order'
import type { FullYearLine, FullYearMonthData } from '@/app/finances/monthly-report/types'

const FY_MONTHS = [
  '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12',
  '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06',
]
const OPEX = 'Operating Expenses'

const ORDER = [
  'Employment Expense', 'Travel & Accommodation', 'Professional Expense',
  'IT Hardware and Software', 'Marketing and Advertising', 'Occupancy Expense',
  'Foreign Currency Gains and Losses', 'Bank and Other Fees', 'Other Operating Expenses',
]

/**
 * A line with Jul/Aug closed. `forecast` fills Sep–Jun; `approved` is a flat
 * monthly approved budget, or null for "no approved budget on this line".
 */
function fyLine(o: {
  code: string | null
  name: string
  group: string | null
  jul: number
  aug: number
  forecast?: number
  approved?: number | null
  priorYear?: number
}): FullYearLine {
  const forecast = o.forecast ?? 0
  const months: FullYearMonthData[] = FY_MONTHS.map((month, i) => {
    const closed = i < 2
    return {
      month,
      actual: i === 0 ? o.jul : i === 1 ? o.aug : 0,
      budget: forecast,
      approved_budget: o.approved === undefined || o.approved === null ? null : o.approved,
      prior_year: o.priorYear ?? 0,
      source: closed ? 'actual' : 'forecast',
    }
  })
  const projected = months.reduce((s, m) => s + (m.source === 'actual' ? m.actual : m.budget), 0)
  const annual = months.reduce((s, m) => s + m.budget, 0)
  const approvedAnnual = months.some(m => m.approved_budget !== null)
    ? months.reduce((s, m) => s + (m.approved_budget ?? 0), 0)
    : null
  return {
    account_name: o.name,
    account_code: o.code,
    group: o.group,
    category: OPEX,
    months,
    projected_total: projected,
    annual_budget: annual,
    approved_annual_budget: approvedAnnual,
    variance_amount: annual - projected,
    variance_percent: annual !== 0 ? ((annual - projected) / Math.abs(annual)) * 100 : 0,
  }
}

const EMP = 'Employment Expense'
const TRV = 'Travel & Accommodation'
const PRO = 'Professional Expense'
const IT = 'IT Hardware and Software'
const MKT = 'Marketing and Advertising'
const OCC = 'Occupancy Expense'
const FX = 'Foreign Currency Gains and Losses'
const BANK = 'Bank and Other Fees'
const OTHER = 'Other Operating Expenses'

/** Urban Road's visible operating expenses, August 2026, in statement order. */
function urbanRoadOpex(): FullYearLine[] {
  const rows: FullYearLine[] = [
    // Employment Expense
    fyLine({ code: '62130', name: 'Employ - Staff Amenities', group: EMP, jul: 129.04, aug: 1240.81, forecast: 450, approved: 450, priorYear: 300 }),
    fyLine({ code: '62150', name: 'Employ - Staff Recruitment', group: EMP, jul: 208.16, aug: 208.16, forecast: 208, approved: 208 }),
    fyLine({ code: '62160', name: 'Employ - Superannuation', group: EMP, jul: 5041.88, aug: 6302.35, forecast: 5042, approved: 5042, priorYear: 4800 }),
    fyLine({ code: '62170', name: 'Employ - Wages & Salaries', group: EMP, jul: 42015.40, aug: 52519.25, forecast: 42015, approved: 42015, priorYear: 40000 }),
    fyLine({ code: '62180', name: "Employ - Workers' Compensation", group: EMP, jul: 0, aug: 0, forecast: 911, approved: 911 }),
    // Travel & Accommodation
    fyLine({ code: '68850', name: 'T/E - Accom, Meals-Aust Travel', group: TRV, jul: 347.39, aug: 0, forecast: 250 }),
    fyLine({ code: '68860', name: 'T/E - Accom, Meals -OS Travel', group: TRV, jul: 1253.91, aug: 0, forecast: 3250 }),
    fyLine({ code: '68950', name: 'T/E - Air Fares/Taxis - Aust', group: TRV, jul: 102.59, aug: 129.54 }),
    fyLine({ code: '68960', name: "T/E - Air Fares/Taxis - O'seas", group: TRV, jul: 4350.33, aug: 582.54 }),
    fyLine({ code: '69200', name: 'T/E - Trade Shows', group: TRV, jul: 2522.04, aug: 0 }),
    // Professional Expense
    fyLine({ code: '60100', name: 'Accounting Fees', group: PRO, jul: 787.50, aug: 0, forecast: 900, approved: 900 }),
    fyLine({ code: '60700', name: 'Bookkeeping Fees', group: PRO, jul: 1265.00, aug: 1265.00, forecast: 1300, approved: 1300 }),
    // IT Hardware and Software
    fyLine({ code: '63700', name: 'IT Costs Software', group: IT, jul: 13764.27, aug: 14725.73, forecast: 13697, approved: 13697 }),
    fyLine({ code: '63705', name: 'IT Costs Hardware', group: IT, jul: 0, aug: 0, forecast: 300, approved: 300 }),
    fyLine({ code: '63710', name: 'IT Website & App Design and Maintenance', group: IT, jul: 0, aug: 0, forecast: 500, approved: 500 }),
    // Marketing and Advertising
    fyLine({ code: '64550', name: 'Marketing - Advertising', group: MKT, jul: 0, aug: 137.54, forecast: 500 }),
    fyLine({ code: '64600', name: 'Marketing Digital Ad Spend', group: MKT, jul: 19175.27, aug: 23143.86, forecast: 20000 }),
    fyLine({ code: '64610', name: 'Marketing Digital Services', group: MKT, jul: 9430.34, aug: 9245.14, forecast: 9500 }),
    fyLine({ code: '64850', name: 'Marketing - Trade Shows', group: MKT, jul: 5972.31, aug: 0 }),
    // Occupancy Expense
    fyLine({ code: '62500', name: 'Electricity', group: OCC, jul: 1503.22, aug: 0, forecast: 500 }),
    fyLine({ code: '63100', name: 'Office Expenses', group: OCC, jul: 0, aug: 0, forecast: 500 }),
    fyLine({ code: '63200', name: 'Cleaning', group: OCC, jul: 921.46, aug: 572.18, forecast: 500 }),
    fyLine({ code: '66000', name: 'Rent - Office', group: OCC, jul: 6881.76, aug: 6881.76, forecast: 6882, approved: 6882, priorYear: 6700 }),
    fyLine({ code: '66001', name: 'Outgoings', group: OCC, jul: 2574.57, aug: 2574.57, forecast: 2575 }),
    fyLine({ code: '66400', name: 'Repairs & Maintenance Warehouse', group: OCC, jul: -502.83, aug: -132.83, forecast: 100 }),
    fyLine({ code: '68000', name: 'Telephone & Internet', group: OCC, jul: 3264.18, aug: 299.14, forecast: 350 }),
    fyLine({ code: '69500', name: 'USA Company Expenses', group: OCC, jul: 22.28, aug: 21.95 }),
    // Foreign Currency Gains and Losses — Xero folds Bank Revaluations (497)
    // and Unrealised/Realised Currency Gains into this one line: Jul 77 − 124 +
    // 286 = 238.61, Aug 97 + 484 + 338 = 919.25.
    fyLine({ code: '62700', name: 'Foreign Currency Gains and Losses', group: FX, jul: 238.61, aug: 919.25, forecast: 2, approved: 2 }),
    // Bank and Other Fees
    fyLine({ code: '60550', name: 'Bank Fees', group: BANK, jul: 11.01, aug: 11.00, forecast: 15 }),
    fyLine({ code: '60560', name: 'Bank & Credit Card Interest', group: BANK, jul: 481.24, aug: 484.92, forecast: 300 }),
    fyLine({ code: '60570', name: 'Shopify Fees', group: BANK, jul: 4148.16, aug: 2623.08, forecast: 4000 }),
    fyLine({ code: '64200', name: 'Licence Fees', group: BANK, jul: 0, aug: 10.00 }),
    fyLine({ code: '64900', name: 'Memberships & Registrations', group: BANK, jul: 188.28, aug: 376.55, forecast: 225 }),
    fyLine({ code: '65400', name: 'Merchant Fees', group: BANK, jul: 2213.58, aug: 1926.21, forecast: 2200 }),
    // Other Operating Expenses
    fyLine({ code: '61400', name: 'Contractors excl. Artists', group: OTHER, jul: 29910.60, aug: 31029.30, forecast: 28525, approved: 28525 }),
    fyLine({ code: '63500', name: 'Insurance excl Workers Comp', group: OTHER, jul: 2188.24, aug: 2188.24, forecast: 2188 }),
    fyLine({ code: '64780', name: 'Research & Development Samples', group: OTHER, jul: 0, aug: 0, forecast: 250 }),
    fyLine({ code: '65600', name: 'Printing & Stationery', group: OTHER, jul: 436.05, aug: 199.31, forecast: 375 }),
    fyLine({ code: '68700', name: 'Training & Seminars', group: OTHER, jul: 2750, aug: 2750, forecast: 2750 }),
    // No account_mappings row for either — forecast-only, ungrouped.
    fyLine({ code: '497', name: 'Bank Revaluations', group: null, jul: 0, aug: 0, forecast: 20 }),
    fyLine({ code: '62800', name: 'General Expenses', group: null, jul: 0, aug: 0, forecast: 2500 }),
  ]
  // The order the route hands the renderers.
  return rows.sort(compareStatementLines)
}

const byName = (groups: ReturnType<typeof groupFullYearLines>, name: string | null) =>
  groups.find(g => g.name === name)!

describe('groupFullYearLines — Urban Road, August 2026', () => {
  it('subtotals Bank and Other Fees to the dollar', () => {
    const bank = byName(groupFullYearLines(urbanRoadOpex(), ORDER, OPEX), BANK)
    expect(bank.lines.map(l => l.account_code)).toEqual(['60550', '60560', '60570', '64200', '64900', '65400'])
    expect(bank.subtotal!.months[0].actual).toBeCloseTo(7042.27, 2)
    expect(bank.subtotal!.months[1].actual).toBeCloseTo(5431.76, 2)
  })

  it('subtotals Other Operating Expenses to the dollar', () => {
    const other = byName(groupFullYearLines(urbanRoadOpex(), ORDER, OPEX), OTHER)
    expect(other.subtotal!.months[0].actual).toBeCloseTo(35284.89, 2)
    expect(other.subtotal!.months[1].actual).toBeCloseTo(36166.85, 2)
  })

  it('carries the folded FX actuals under the FX heading', () => {
    const fx = byName(groupFullYearLines(urbanRoadOpex(), ORDER, OPEX), FX)
    expect(fx.lines.map(l => l.account_name)).toEqual(['Foreign Currency Gains and Losses'])
    expect(fx.subtotal!.months[0].actual).toBeCloseTo(238.61, 2)
    expect(fx.subtotal!.months[1].actual).toBeCloseTo(919.25, 2)
  })

  it('follows the coach order even though the input is in code order', () => {
    const input = urbanRoadOpex()
    // Code order puts Bank (60550) before Employment (62130) and Professional
    // (60100) first of all; the headings must not follow that.
    expect(input[0].account_code).toBe('497')
    expect(groupFullYearLines(input, ORDER, OPEX).map(g => g.name)).toEqual([...ORDER, null])
  })

  it('keeps code order inside each group', () => {
    for (const g of groupFullYearLines(urbanRoadOpex(), ORDER, OPEX)) {
      expect([...g.lines].sort(compareStatementLines)).toEqual(g.lines)
    }
  })

  it('runs the unmapped accounts last, under no heading and with no subtotal', () => {
    const groups = groupFullYearLines(urbanRoadOpex(), ORDER, OPEX)
    const last = groups[groups.length - 1]
    expect(last.name).toBeNull()
    expect(last.subtotal).toBeNull()
    expect(last.lines.map(l => [l.account_code, l.account_name])).toEqual([
      ['497', 'Bank Revaluations'],
      ['62800', 'General Expenses'],
    ])
  })

  it('summary ≡ statement: the groups add back to the section total in every column', () => {
    const lines = urbanRoadOpex()
    const total = buildFullYearSubtotal(lines, `Total ${OPEX}`, OPEX, FY_MONTHS)
    const groups = groupFullYearLines(lines, ORDER, OPEX)
    // What a reader adds up on the page: each group's subtotal row, plus the
    // lines of the ungrouped run, which have no subtotal of their own.
    const rows = groups.flatMap(g => (g.subtotal ? [g.subtotal] : g.lines))

    const add = (pick: (l: FullYearLine) => number) => rows.reduce((s, l) => s + pick(l), 0)
    FY_MONTHS.forEach((_, i) => {
      expect(add(l => l.months[i].actual)).toBeCloseTo(total.months[i].actual, 6)
      expect(add(l => l.months[i].budget)).toBeCloseTo(total.months[i].budget, 6)
      expect(add(l => l.months[i].approved_budget ?? 0)).toBeCloseTo(total.months[i].approved_budget ?? 0, 6)
      expect(add(l => l.months[i].prior_year)).toBeCloseTo(total.months[i].prior_year, 6)
    })
    expect(add(l => l.projected_total)).toBeCloseTo(total.projected_total, 6)
    expect(add(l => l.annual_budget)).toBeCloseTo(total.annual_budget, 6)
    expect(add(l => l.approved_annual_budget ?? 0)).toBeCloseTo(total.approved_annual_budget ?? 0, 6)

    // And the section total is Calxa's Total Expense: 163,596 / 162,235.
    expect(total.months[0].actual).toBeCloseTo(163595.84, 2)
    expect(total.months[1].actual).toBeCloseTo(162234.55, 2)
  })

  it('gives an expense group subtotal the expense variance sign (forecast − projected)', () => {
    const emp = byName(groupFullYearLines(urbanRoadOpex(), ORDER, OPEX), EMP)
    const st = emp.subtotal!
    expect(st.variance_amount).toBeCloseTo(st.annual_budget - st.projected_total, 6)
    expect(st.variance_percent).toBeCloseTo((st.variance_amount / Math.abs(st.annual_budget)) * 100, 6)
    expect(st.account_name).toBe(EMP)
    expect(st.group).toBe(EMP)
  })

  it('gives a revenue-side group the income sign (projected − forecast)', () => {
    const lines = [
      { ...fyLine({ code: '41000', name: 'Sales', group: 'Online', jul: 500, aug: 500, forecast: 400 }), category: 'Revenue' },
    ]
    const [g] = groupFullYearLines(lines, null, 'Revenue')
    expect(g.subtotal!.variance_amount).toBeCloseTo(g.subtotal!.projected_total - g.subtotal!.annual_budget, 6)
  })

  it('leaves a group with no approved budget on any line at null, not $0', () => {
    const travel = byName(groupFullYearLines(urbanRoadOpex(), ORDER, OPEX), TRV)
    expect(travel.lines.every(l => l.approved_annual_budget === null)).toBe(true)
    expect(travel.subtotal!.approved_annual_budget).toBeNull()
    expect(travel.subtotal!.months.every(m => m.approved_budget === null)).toBe(true)
  })

  it('is a no-op for a client that has grouped nothing', () => {
    const lines = urbanRoadOpex().map(l => ({ ...l, group: null }))
    const out = groupFullYearLines(lines, ORDER, OPEX)
    expect(out).toHaveLength(1)
    expect(out[0].name).toBeNull()
    expect(out[0].subtotal).toBeNull()
    expect(out[0].lines).toEqual(lines)
  })

  it('treats a payload built before `group` existed as ungrouped', () => {
    const lines = urbanRoadOpex().map(({ group: _g, ...rest }) => rest as FullYearLine)
    const out = groupFullYearLines(lines, ORDER, OPEX)
    expect(out).toHaveLength(1)
    expect(out[0].subtotal).toBeNull()
  })
})
