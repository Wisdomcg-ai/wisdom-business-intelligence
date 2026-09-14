/**
 * The Contractors Payment Summary (Calxa p14) with Urban Road's June–August
 * 2026 figures: the sheet's contractors, prod's budgets and departments, the
 * ledger's 61400 and the approved budget. See urban-road-contractors-fixture.
 */
import { describe, it, expect } from 'vitest'
import {
  buildContractorSheetModel,
  contractorWindowForLayout,
  parseContractorPageConfig,
  windowMonthKeys,
  type ContractorPageConfig,
} from '../contractor-page'
import { contractorDetail, LEDGER, SHEET } from './urban-road-contractors-fixture'
import type { SubscriptionDetailData } from '@/app/finances/monthly-report/types'

const calxa = (over: Record<string, unknown> = {}): ContractorPageConfig => {
  const parsed = parseContractorPageConfig({ layout: 'calxa', ...over })
  if (!parsed.ok) throw new Error(parsed.reason)
  return parsed.config
}
const rowOf = (model: ReturnType<typeof buildContractorSheetModel>, label: string) => model.rows.find((r) => r.label === label)!

describe('parseContractorPageConfig', () => {
  it('is the standard page with no config, as every other client has it', () => {
    expect(parseContractorPageConfig(undefined)).toEqual({
      ok: true,
      config: { layout: 'rollup', months: 2, basis: 'gross', subtotal_variance: false, unallocated_row: false, uncategorised_label: 'Uncategorised' },
    })
  })

  it('under calxa: three months, net, subtotal variances and Unallocated', () => {
    expect(calxa()).toEqual({ layout: 'calxa', months: 3, basis: 'net', subtotal_variance: true, unallocated_row: true, uncategorised_label: 'Uncategorised' })
    expect(calxa({ months: 4 }).months).toBe(4)
  })

  it('refuses a calxa option without the calxa layout, and says which', () => {
    const parsed = parseContractorPageConfig({ months: 3 })
    expect(parsed.ok).toBe(false)
    expect(parsed.config.layout).toBe('rollup')
    if (!parsed.ok) expect(parsed.reason).toBe('months applies only to layout calxa')
  })

  it('refuses a config it cannot read, with the reason', () => {
    const parsed = parseContractorPageConfig({ layout: 'sheet' })
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.reason).toContain('layout')
  })
})

describe('contractorWindowForLayout', () => {
  it('asks the route for nothing new unless a calxa placement wants more months', () => {
    expect(contractorWindowForLayout([])).toBe(2)
    expect(contractorWindowForLayout([{ type: 'contractor_detail' }])).toBe(2)
    expect(contractorWindowForLayout([{ type: 'contractor_detail', config: { months: 5 } }])).toBe(2)
    expect(contractorWindowForLayout([{ type: 'contractor_detail', config: { layout: 'calxa' } }])).toBe(3)
    expect(contractorWindowForLayout([
      { type: 'contractor_detail', config: { layout: 'calxa' } },
      { type: 'contractor_detail', config: { layout: 'calxa', months: 4 } },
      { type: 'payroll_grid', config: { months: 6 } },
    ])).toBe(4)
  })
})

describe('windowMonthKeys', () => {
  it('ends at the report month, oldest first, across a year end', () => {
    expect(windowMonthKeys('2026-08', 3)).toEqual(['2026-06', '2026-07', '2026-08'])
    expect(windowMonthKeys('2027-01', 4)).toEqual(['2026-10', '2026-11', '2026-12', '2027-01'])
    expect(windowMonthKeys('2026-8', 3)).toEqual([])
  })
})

describe('buildContractorSheetModel — Urban Road, August 2026', () => {
  const model = () => buildContractorSheetModel(contractorDetail(), calxa())

  it('prints June, July and August, and every contractor — departments first, then those nobody has filed', () => {
    const m = model()
    expect(m.title).toBe('Contractors Payment Summary')
    expect(m.months).toEqual(['2026-06', '2026-07', '2026-08'])
    const names = m.rows.filter((r) => r.kind === 'contractor').map((r) => r.label)
    expect(names).toHaveLength(SHEET.length)
    expect(names.slice(0, 3)).toEqual(['Ailene Alfonso', 'Akshay Nirmal Proprietorship', 'Allaine Fria'])
    expect(names.slice(-3)).toEqual(['Airtasker', 'go sweet spot', 'Kim Andrea Ambrocio'])
    expect(rowOf(m, 'Kim Andrea Ambrocio')).toMatchObject({ category: 'Uncategorised', budget: 1320, months: [900, 1500, 1200] })
    expect(rowOf(m, 'Akshay Nirmal Proprietorship')).toMatchObject({ category: 'All Departments', budget: 6000, months: [4681, 4721, 5851] })
  })

  it('states go sweet spot in the P&L\'s money — A$403, not the NZD bill\'s 561.40', () => {
    expect(rowOf(model(), 'go sweet spot').months).toEqual([0, 0, 403])
    expect(rowOf(buildContractorSheetModel(contractorDetail(), calxa({ basis: 'gross' })), 'go sweet spot').months).toEqual([0, 0, 561.4])
  })

  it('TOTAL is the ledger\'s 61400 each month, and its Budget column the contractor budgets', () => {
    expect(rowOf(model(), 'TOTAL')).toMatchObject({ budget: 30081, months: [23173.42, 29910.6, 31029.3] })
  })

  it('puts each month\'s approved budget under its own month — June has none — and signs the variance', () => {
    const m = model()
    // Calxa prints 28,007 under June and 30,081 under July; the budget is July's and August's.
    expect(rowOf(m, 'Budget').months).toEqual([null, 28007, 28375])
    // Over budget is negative: August is 2,654 OVER, which Calxa prints as a positive 2,654.
    expect(rowOf(m, 'Variance $').months).toEqual([null, -1903.6, -2654.3])
    expect(rowOf(m, 'Variance %').months).toEqual([null, -6.8, -9.35])
    expect(m.notes).toContain('June 2026 has no budget: no approved budget version is locked for FY2026.')
  })

  it('prints no Unallocated row for what cents rounding leaves — the whole-dollar rows are 42c, 60c and 70c off the ledger', () => {
    // Each residual prints as $1 or $0, and the note would name a journal that
    // does not exist. Per-line conversion of PHP and NZD bills leaves this much.
    const m = model()
    expect(m.rows.some((r) => r.kind === 'unallocated')).toBe(false)
    expect(m.pivot.some((r) => r.kind === 'unallocated')).toBe(false)
    expect(m.notes.join(' ')).not.toContain('Unallocated')
  })

  it('carries a dollar or more the contractors do not account for in Unallocated, and says so', () => {
    const d = contractorDetail()
    const account = d.accounts[0]
    // The rows add to 31,030 in August; the ledger is $1.20 more. July stays 60c under.
    const actual = { ...LEDGER, '2026-08': 31031.2 }
    Object.assign(account, { total_actual: 31031.2, window: { ...account.window!, actual } })
    const m = buildContractorSheetModel(d, calxa())
    expect(rowOf(m, 'Unallocated')).toMatchObject({ budget: undefined, months: [0.42, 0.6, 1.2] })
    expect(m.pivot.find((r) => r.kind === 'unallocated')).toMatchObject({ name: 'Unallocated', actual: 1.2 })
    const note = m.notes.find((n) => n.startsWith('Unallocated is'))!
    // Only the month that is more than rounding is named as unaccounted for.
    expect(note.startsWith('Unallocated is the part of Contractors excl. Artists in Xero that no contractor\'s bill or payment accounts for (Aug 2026: 1)')).toBe(true)
    expect(note).toContain('under a dollar')
  })

  it('prints no Unallocated row when the contractors foot to the ledger', () => {
    const d = contractorDetail()
    const account = d.accounts[0]
    const footed = { '2026-06': 23173, '2026-07': 29910, '2026-08': 31030 }
    Object.assign(account, { total_actual: 31030, total_prior_month: 29910, window: { ...account.window!, actual: footed } })
    const m = buildContractorSheetModel(d, calxa())
    expect(m.rows.some((r) => r.kind === 'unallocated')).toBe(false)
    expect(m.pivot.some((r) => r.kind === 'unallocated')).toBe(false)
    expect(m.notes.join(' ')).not.toContain('Unallocated')
  })

  it('rolls August up by department, uncategorised first, the department on its first row only, each subtotal with its variance', () => {
    const m = model()
    const subtotals = m.pivot.filter((r) => r.kind === 'subtotal').map((r) => [r.category, r.budget, r.actual, r.variance])
    expect(subtotals).toEqual([
      ['Uncategorised Total', 1320, 1793, -473],
      ['All Departments Total', 6000, 5851, 149],
      // Calxa's 7,818 is the same four figures in cents.
      ['Creative/Product Total', 4872, 7819, -2947],
      ['Finance Total', 3000, 2797, 203],
      ['Marketing Total', 5994, 4327, 1667],
      ['Operations Total', 6270, 6723, -453],
      ['Sales/Commercial Total', 2625, 1720, 905],
    ])
    const operations = m.pivot.filter((r) => r.kind === 'contractor' && ['Honeybee Dionio', 'Maxx Tud', 'Reena Rosales'].includes(r.name))
    expect(operations.map((r) => [r.category, r.name, r.variance])).toEqual([
      ['Operations', 'Honeybee Dionio', -315], ['', 'Maxx Tud', -298], ['', 'Reena Rosales', 160],
    ])
    expect(m.pivot[0]).toMatchObject({ category: 'Uncategorised', name: 'Airtasker', budget: 0, actual: 190, variance: -190 })
    expect(m.pivot.at(-1)).toMatchObject({ kind: 'grand_total', category: 'Grand Total', budget: 30081, actual: LEDGER['2026-08'], variance: -948.3 })
    expect(m.pivot.at(-2)).toMatchObject({ kind: 'subtotal', category: 'Sales/Commercial Total' })
  })

  it('leaves subtotal variances blank when the placement asks', () => {
    const m = buildContractorSheetModel(contractorDetail(), calxa({ subtotal_variance: false }))
    expect(m.pivot.filter((r) => r.kind === 'subtotal').every((r) => r.variance === undefined)).toBe(true)
  })

  it('an answer without the window still prints this month and last, and says which months were not loaded', () => {
    const d: SubscriptionDetailData = contractorDetail()
    d.accounts = d.accounts.map(({ window: _w, ...a }) => ({
      ...a,
      vendors: a.vendors.map(({ months: _m, statement, ...v }) => ({ ...v, statement: { ...statement!, months: undefined } })),
    }))
    const m = buildContractorSheetModel(d, calxa())
    expect(rowOf(m, 'Kim Andrea Ambrocio').months).toEqual([null, 1500, 1200])
    expect(rowOf(m, 'TOTAL').months).toEqual([null, 29910.6, 31029.3])
    expect(rowOf(m, 'Budget').months).toEqual([null, null, 28375])
    expect(m.notes).toContain('June 2026 was not loaded for this page, so it prints as a dash.')
    expect(m.notes).toContain('June 2026 and July 2026 have no budget: the budget was not loaded for this page.')
  })

  it('withholds the contractor figures when the orgs keep different currencies, rather than add them', () => {
    const d = contractorDetail()
    d.statement_unavailable = { reason: 'mixed_currencies', currencies: ['AUD', 'HKD'] }
    const m = buildContractorSheetModel(d, calxa())
    expect(m.rows.filter((r) => r.kind === 'contractor')).toEqual([])
    expect(m.rows.some((r) => r.kind === 'unallocated')).toBe(false)
    expect(m.notes.join(' ')).toContain('different currencies (AUD and HKD)')
    // The contractor budgets exist; they were withheld with the rows. A budget
    // of 0 and the whole ledger as an overspend would state what is not known.
    expect(rowOf(m, 'TOTAL')).toMatchObject({ budget: null, months: [23173.42, 29910.6, 31029.3] })
    expect(m.pivot.at(-1)).toMatchObject({ kind: 'grand_total', budget: null, actual: 31029.3, variance: null })
    // The account's own approved budget is not the contractors', and still prints.
    expect(rowOf(m, 'Budget').months).toEqual([null, 28007, 28375])
  })
})
