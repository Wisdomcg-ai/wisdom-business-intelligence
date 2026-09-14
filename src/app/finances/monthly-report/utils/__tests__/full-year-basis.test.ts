/**
 * The Full Year page on the approved-budget basis, against Urban Road's real
 * August 2026 figures and the Calxa Current Year Budget pages they replace.
 *
 * Every Calxa figure below ties to the dollar except where August's Returns &
 * Allowances enters: Calxa printed (6,122), live Xero now says (6,976) — a
 * credit posted after the Calxa pack ran — so Income, Gross Profit, Operating
 * Profit and Net Profit for August and the year sit $854 lower here.
 */
import { describe, it, expect } from 'vitest'
import {
  fullYearBasis,
  fullYearCell,
  fullYearProjected,
  fullYearVariance,
  deriveFullYearOperatingProfit,
  fullYearSectionLabel,
  fullYearMonthLabel,
  fullYearPeriodLabel,
  approvedBudgetGaps,
  fullYearBasisNote,
} from '../full-year-basis'
import { withoutSilentFullYearLines, isSilentFullYearLine } from '@/lib/monthly-report/empty-lines'
import { groupFullYearLines } from '@/lib/monthly-report/full-year-groups'
import { urbanRoadFullYear, urbanRoadOnForecast } from './fixtures/urban-road-fy'
import type { FullYearLine, FullYearReport } from '../../types'

const r = Math.round
const cells = (l: FullYearLine, basis = fullYearBasis(urbanRoadFullYear())) => l.months.map((m) => r(fullYearCell(m, basis)))
const section = (fy: FullYearReport, category: string) => fy.sections.find((s) => s.category === category)!
const account = (fy: FullYearReport, name: string) =>
  fy.sections.flatMap((s) => s.lines).find((l) => l.account_name === name)!

describe('fullYearBasis', () => {
  it('is the approved budget for Urban Road, which is on the budget store', () => {
    expect(fullYearBasis(urbanRoadFullYear())).toBe('approved_budget')
  })

  it('stays on the forecast for a report with no approved budget', () => {
    expect(fullYearBasis(urbanRoadOnForecast())).toBe('forecast')
    expect(fullYearBasis(null)).toBe('forecast')
  })
})

describe('Urban Road FY2027 on the approved basis — Calxa pages 16-18', () => {
  const fy = urbanRoadFullYear()
  const basis = 'approved_budget' as const

  it('fills the unclosed months of wages from the approved budget, not the wizard forecast', () => {
    const wages = account(fy, 'Employ - Wages & Salaries')
    expect(cells(wages, basis)).toEqual([
      42_015, 52_519, 42_015, 42_015, 52_519, 42_015, 44_788, 44_788, 55_986, 44_788, 55_986, 44_788,
    ])
    expect(r(fullYearProjected(wages, basis))).toBe(564_223)
    // The forecast basis is the number the page used to print: 76,182 a month.
    expect(r(fullYearCell(wages.months[2], 'forecast'))).toBe(76_182)
  })

  it('gives Contractors excl. Artists its budget, which the forecast has no line for', () => {
    const contractors = account(fy, 'Contractors excl. Artists')
    expect(cells(contractors, basis).slice(2, 6)).toEqual([28_525, 28_525, 28_525, 30_925])
    expect(r(fullYearProjected(contractors, basis))).toBe(358_562)
  })

  it('ties Superannuation and IT Costs Software to Calxa', () => {
    expect(r(fullYearProjected(account(fy, 'Employ - Superannuation'), basis))).toBe(67_708)
    expect(r(fullYearProjected(account(fy, 'IT Costs Software'), basis))).toBe(169_813)
  })

  it('ties the section totals', () => {
    expect(r(fullYearProjected(section(fy, 'Cost of Sales').subtotal, basis))).toBe(3_552_500)
    const opex = section(fy, 'Operating Expenses').subtotal
    expect(cells(opex, basis)).toEqual([
      163_596, 162_235, 155_047, 162_392, 182_656, 154_692, 158_660, 152_660, 167_808, 158_315, 167_389, 164_848,
    ])
    expect(r(fullYearProjected(opex, basis))).toBe(1_950_297)
    // Calxa 6,023,634, less the $854 August credit.
    expect(r(fullYearProjected(section(fy, 'Revenue').subtotal, basis))).toBe(6_022_780)
  })

  it('ties the Employment Expense group row', () => {
    const opex = section(fy, 'Operating Expenses')
    const groups = groupFullYearLines(withoutSilentFullYearLines(opex.lines, basis), fy.expense_group_order, opex.category)
    const employment = groups.find((g) => g.name === 'Employment Expense')!
    expect(cells(employment.subtotal!, basis).slice(0, 3)).toEqual([47_394, 60_271, 48_626])
    expect(r(fullYearProjected(employment.subtotal!, basis))).toBe(649_407)
  })

  it('derives Operating Profit, the row the page never had', () => {
    const op = deriveFullYearOperatingProfit(fy)!
    expect(cells(op, basis)).toEqual([
      14_009, 132_590, 15_256, 16_311, 140_492, 15_611, 20_043, 33_383, 19_049, 29_438, 6_350, 77_450,
    ])
    expect(r(fullYearProjected(op, basis))).toBe(519_983)
  })

  it('ties Net Profit', () => {
    expect(cells(fy.net_profit, basis).slice(2)).toEqual([
      15_256, 16_311, 140_492, 15_611, 20_043, 33_383, 19_049, 29_438, 6_350, 77_450,
    ])
    expect(r(fullYearProjected(fy.net_profit, basis))).toBe(520_152)
  })

  it('reconciles: every Projected Total is its months, and every total is its parts', () => {
    const sum = (ls: FullYearLine[]) => ls.reduce((s, l) => s + fullYearProjected(l, basis), 0)
    for (const s of fy.sections) {
      // What a reader checks with a pencil: the printed months add to the
      // printed total, give or take the half-dollar rounding of twelve cells.
      for (const l of [...s.lines, s.subtotal]) {
        const printed = cells(l, basis).reduce((t, c) => t + c, 0)
        expect(Math.abs(r(fullYearProjected(l, basis)) - printed)).toBeLessThanOrEqual(6)
      }
      // The section total against the lines it covers — including the silent
      // ones, which are zero on this basis and so cannot move it.
      expect(fullYearProjected(s.subtotal, basis)).toBeCloseTo(sum(s.lines), 2)
      expect(sum(withoutSilentFullYearLines(s.lines, basis))).toBeCloseTo(sum(s.lines), 2)
    }
    const p = (c: string) => fullYearProjected(section(fy, c).subtotal, basis)
    expect(fullYearProjected(fy.gross_profit, basis)).toBeCloseTo(p('Revenue') - p('Cost of Sales'), 2)
    const op = fullYearProjected(deriveFullYearOperatingProfit(fy)!, basis)
    expect(op).toBeCloseTo(fullYearProjected(fy.gross_profit, basis) - p('Operating Expenses'), 2)
    expect(fullYearProjected(fy.net_profit, basis)).toBeCloseTo(op + p('Other Income'), 2)
  })

  it('drops the wizard-only "Other Income" line on this basis, and only on this basis', () => {
    // SYS-OTHER-INCOME: $18 a month in the forecast, nothing actual, nothing
    // approved. Calxa has no such row.
    const phantom = section(fy, 'Revenue').lines.find((l) => l.account_name === 'Other Income')!
    expect(isSilentFullYearLine(phantom, basis)).toBe(true)
    expect(isSilentFullYearLine(phantom, 'forecast')).toBe(false)
    expect(isSilentFullYearLine(phantom)).toBe(false)
    // A budget-only account is NOT silent: Materialised, never posted, budgeted 5,000.
    expect(isSilentFullYearLine(account(fy, 'Materialised'), basis)).toBe(false)
  })
})

describe('the forecast basis is the page it was', () => {
  it('matches the payload projected_total on every line', () => {
    const fy = urbanRoadOnForecast()
    for (const s of fy.sections) {
      for (const l of [...s.lines, s.subtotal]) {
        expect(fullYearProjected(l, 'forecast')).toBeCloseTo(l.projected_total, 6)
      }
    }
  })
})

describe('fullYearVariance', () => {
  const fy = urbanRoadFullYear()

  it('measures against the same yardstick the months come from, favourable-positive', () => {
    // Canvas Sales: projected 3,730,495 against an approved year of 3,655,906 —
    // income over budget is favourable.
    const canvas = account(fy, 'Canvas Sales')
    expect(r(fullYearVariance(canvas, 'approved_budget').amount)).toBe(r(fullYearProjected(canvas, 'approved_budget') - canvas.approved_annual_budget!))
    expect(fullYearVariance(canvas, 'approved_budget').amount).toBeGreaterThan(0)
    // A cost over its budget is unfavourable: negative.
    const opex = section(fy, 'Operating Expenses').subtotal
    expect(fullYearVariance(opex, 'approved_budget').amount).toBeCloseTo(opex.approved_annual_budget! - fullYearProjected(opex, 'approved_budget'), 2)
  })

  it('gives no percentage against a zero yardstick', () => {
    expect(fullYearVariance(account(fy, 'Services'), 'approved_budget').percent).toBeNull()
  })
})

describe('labels', () => {
  it('uses the pack words for sections', () => {
    expect(fullYearSectionLabel('Revenue')).toBe('Income')
    expect(fullYearSectionLabel('Operating Expenses')).toBe('Expense')
    expect(fullYearSectionLabel('Other Expenses')).toBe('Other Expense')
    expect(fullYearSectionLabel('Cost of Sales')).toBe('Cost of Sales')
  })

  it('prints Sep, not Sept, and the period from the months', () => {
    expect(fullYearMonthLabel('2026-09')).toBe('Sep 2026')
    expect(fullYearPeriodLabel(urbanRoadFullYear())).toBe('Jul 2026 - Jun 2027')
  })
})

describe('approvedBudgetGaps — a version that does not reach every month', () => {
  const six = ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12']

  it('names the unclosed months the version has no rows for, and leaves the approved basis', () => {
    const fy: FullYearReport = { ...urbanRoadFullYear(), approved_months_covered: six }
    expect(approvedBudgetGaps(fy)).toEqual(['2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06'])
    expect(fullYearBasis(fy)).toBe('forecast')
  })

  it('ignores a gap in a closed month — that cell is an actual', () => {
    const fy: FullYearReport = {
      ...urbanRoadFullYear(),
      approved_months_covered: ['2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06'],
    }
    expect(approvedBudgetGaps(fy)).toEqual([])
    expect(fullYearBasis(fy)).toBe('approved_budget')
  })

  it('counts a payload without the field as covered — it cannot be checked', () => {
    expect(approvedBudgetGaps(urbanRoadFullYear())).toEqual([])
  })
})

describe('fullYearBasisNote', () => {
  const noForecast = (fy: FullYearReport): FullYearReport => ({ ...fy, forecast_available: false })

  it('says nothing on the approved basis, forecast or not', () => {
    expect(fullYearBasisNote(urbanRoadFullYear(), true)).toBeNull()
    expect(fullYearBasisNote(noForecast(urbanRoadFullYear()), true)).toBeNull()
  })

  it('says nothing for a client on the forecast that has one', () => {
    expect(fullYearBasisNote(urbanRoadOnForecast(), false)).toBeNull()
  })

  it('tells a budget-store client the months are the forecast', () => {
    expect(fullYearBasisNote(urbanRoadOnForecast(), true)).toBe(
      'No approved budget is in force for FY2027, so the months after Aug 2026 are the forecast, not the budget.',
    )
  })

  it('is one sentence when there is neither', () => {
    expect(fullYearBasisNote(noForecast(urbanRoadOnForecast()), true)).toBe(
      'No approved budget is in force for FY2027 and no forecast exists, so the months after Aug 2026 have no figure and Projected is actuals to date.',
    )
    expect(fullYearBasisNote(noForecast(urbanRoadOnForecast()), false)).toBe(
      'No forecast exists for FY2027, so the months after Aug 2026 have no figure and Projected is actuals to date.',
    )
  })
})

describe('deriveFullYearOperatingProfit — nothing between it and Net Profit', () => {
  it('is null, rather than Net Profit under another name', () => {
    const fy = urbanRoadFullYear()
    expect(deriveFullYearOperatingProfit(fy)).not.toBeNull()
    fy.sections = fy.sections.filter((s) => s.category !== 'Other Income')
    expect(deriveFullYearOperatingProfit(fy)).toBeNull()
  })
})
