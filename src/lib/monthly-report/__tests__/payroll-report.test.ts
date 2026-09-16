/**
 * The Payroll Report's P10 model: roster areas with subtotals, each employee's
 * month budget and variance, pay shading, the budget basis (decision 4), a
 * fortnightly roster, and months before the financial year.
 *
 *   - Distinct Directions, August 2026 (Calxa p12-13): four areas whose totals
 *     are 45,962 / 123,283 / 55,284 / 21,325 = 245,854, against Calxa's roster
 *     budget 245,584 — or the approved wages budget 237,711, which the P&L page
 *     prints (DD-19, DD-20)
 *   - an IICT-shaped fortnightly roster: a pay run is two weeks, and a month
 *     with three fortnightly runs is six weeks, not three (IICT-40)
 *   - Dragon's three-month window in August reaching back to June, where the
 *     approved budget belongs to the year that has closed (DRG-37)
 */
import { describe, it, expect } from 'vitest'
import { buildPayrollReport } from '../payroll-report'
import { buildPayrollGrid, type PayslipRow } from '../payroll-grid'
import { parsePayrollGridConfig, type PayrollGridConfig } from '../payroll-grid-config'
import {
  CALXA_AREA_TOTALS,
  DD_APPROVED_WAGES_AUG,
  DD_ROSTER,
  DD_ROSTER_WITHOUT_AREAS,
  ddGrid,
} from './fixtures/dd-payrun-2026-08'

const config = (c: Record<string, unknown>): PayrollGridConfig => {
  const parsed = parsePayrollGridConfig(c)
  if (!parsed.ok) throw new Error(parsed.reason)
  return parsed.config
}

const DD = { layout: 'calxa', months: 1, difference_fills: true, roster: DD_ROSTER, employee_month_columns: true, pay_fills: true, standard_units_column: false }
const round = (n: number | null) => (n === null ? null : Math.round(n))

describe('Distinct Directions, August 2026 — roster areas', () => {
  it("prints Calxa's four areas, in roster order, each totalled; all areas come to 245,854", () => {
    const r = buildPayrollReport(ddGrid(), config({ ...DD, budget_basis: 'roster' }))
    expect(r.has_areas).toBe(true)
    expect(r.groups.map((g) => g.area)).toEqual(['Head Office', 'Bathurst', 'Orange', 'Dubbo'])
    expect(r.groups.map((g) => g.employees.length)).toEqual([6, 17, 9, 3])
    for (const g of r.groups) {
      const calxa = CALXA_AREA_TOTALS[g.area as keyof typeof CALXA_AREA_TOTALS]
      expect([round(g.totals.month_actual), round(g.totals.month_budget)]).toEqual([calxa.actual, calxa.budget])
    }
    expect(round(r.totals.month_actual)).toBe(245854)
    expect(r.totals.month_actual).toBe(245853.69)
    expect(r.groups.reduce((t, g) => t + g.totals.month_actual, 0)).toBeCloseTo(245853.69, 2)
    // Each area's run totals add to the run's total: 73,993 / 57,130 / 58,551 / 56,180.
    expect(Object.values(r.totals.runs).map(Math.round)).toEqual([73993, 57130, 58551, 56180])
    expect(r.totals.period_salary).toBe(61396)
    expect(r.not_on_roster).toEqual([])
  })

  it("the roster basis is Calxa's: weekly × the four pay Fridays, 245,584, and a Difference of (270)", () => {
    const r = buildPayrollReport(ddGrid(), config({ ...DD, budget_basis: 'roster' }))
    const aug = r.months[0]
    expect(aug).toMatchObject({ month: '2026-08', weeks: 4, pay_cycle: 'WEEKLY', budget_source: 'roster', roster_budget: 245584, budget: 245584 })
    expect(aug.difference).toBe(-269.69)
    expect(r.totals.month_budget).toBe(245584)
    expect(r.notes.join(' ')).toContain('weekly salary × the weeks of the month’s pay runs')
  })

  it('the approved basis (decision 4, the default) prints the P&L wages budget, and says how far the roster is from it', () => {
    const r = buildPayrollReport(ddGrid(), config(DD))
    const aug = r.months[0]
    expect(aug).toMatchObject({ budget_source: 'approved', budget: DD_APPROVED_WAGES_AUG, roster_budget: 245584 })
    expect(aug.difference).toBe(-8142.69)
    // The employee columns stay the roster's — there is no per-employee approved budget.
    expect(r.totals.month_budget).toBe(245584)
    expect(r.notes).toContain('The roster’s budgets for Aug 2026 total 245,584 against the approved wages budget of 237,711 — 7,873 apart.')
  })

  it("each employee's month: paid, weekly × 4, budget − paid", () => {
    const r = buildPayrollReport(ddGrid(), config({ ...DD, budget_basis: 'roster' }))
    const all = r.groups.flatMap((g) => g.employees)
    const by = (name: string) => all.find((e) => e.name === name)!
    // Adam Davey's final pay: 222 hours of annual leave.
    expect(by('Adam Davey')).toMatchObject({ area: 'Bathurst', month_actual: 16298.8, month_budget: 10768, month_variance: -5530.8 })
    // A leaver is budgeted for the whole month (no Xero record to end it) — Calxa's $5,860 favourable.
    expect(by('Billie Costello')).toMatchObject({ month_actual: 871.71, month_budget: 6732, month_variance: 5860.29 })
    // Started on the 24th with no budget carried: the first pay is all variance.
    expect(by('Elinor Anthoney')).toMatchObject({ month_budget: 0, month_variance: -1384.62 })
    // Xero's name for Calxa's Felicity Crome, and her $0 payslip on the 28th.
    expect(by('Felicity Cummings')).toMatchObject({ area: 'Orange', month_actual: 2923.89, month_budget: 4252 })
    expect(by('Kate Davey').period_salary).toBe(2692)
  })

  it('shades each pay against the weekly budget: over by more than $1 is red, at or under green, no budget amber, no pay unshaded', () => {
    const r = buildPayrollReport(ddGrid(), config({ ...DD, budget_basis: 'roster' }))
    const all = r.groups.flatMap((g) => g.employees)
    const by = (name: string) => all.find((e) => e.name === name)!
    expect(by('Danielle Rimmer').fills).toEqual({ '2026-08-07': 'under', '2026-08-14': 'over', '2026-08-21': 'under', '2026-08-28': 'under' })
    // Kate Davey is paid 2,692.30 against 2,692 — within the $1 tolerance.
    expect(Object.values(by('Kate Davey').fills)).toEqual(['under', 'under', 'under', 'under'])
    expect(by('Elinor Anthoney').fills).toEqual({ '2026-08-07': null, '2026-08-14': null, '2026-08-21': null, '2026-08-28': 'no_budget' })
    expect(by('Billie Costello').fills['2026-08-14']).toBeNull()
    expect(by('Felicity Cummings').fills['2026-08-28']).toBeNull()
    // With no tolerance, the 30 cents is over.
    const strict = buildPayrollReport(ddGrid(), config({ ...DD, fill_tolerance: 0 }))
    expect(strict.groups[0].employees.find((e) => e.name === 'Kate Davey')!.fills['2026-08-07']).toBe('over')
  })

  it('a roster without areas is one group, in roster order — the page as A06 placed it', () => {
    const r = buildPayrollReport(ddGrid(), config({ ...DD, roster: DD_ROSTER_WITHOUT_AREAS }))
    expect(r.has_areas).toBe(false)
    expect(r.groups).toHaveLength(1)
    expect(r.groups[0].area).toBeNull()
    expect(r.groups[0].employees[0].name).toBe('Daniel Jarvis')
    expect(round(r.groups[0].totals.month_actual)).toBe(245854)
  })

  it('someone paid who is not on the roster follows the areas, under their own heading, and is named', () => {
    const r = buildPayrollReport(ddGrid(), config({ ...DD, roster: DD_ROSTER.filter((e) => e.name !== 'Jismi Joy') }))
    expect(r.groups.map((g) => g.area)).toEqual(['Head Office', 'Bathurst', 'Orange', 'Dubbo', null])
    expect(r.groups[4].employees.map((e) => e.name)).toEqual(['Jismi Joy'])
    expect(r.groups[4].employees[0]).toMatchObject({ month_budget: null, month_variance: null })
    expect(r.not_on_roster).toEqual(['Jismi Joy'])
    expect(round(r.totals.month_actual)).toBe(245854)
  })
})

describe('a roster entry whose salary has not been typed in yet', () => {
  // The panel writes no salary key for a blank cell, so this is one keystroke
  // away on the shipped DD config: a new starter the coach has not costed.
  const blankFor = (...names: string[]) =>
    DD_ROSTER.map(({ weekly_salary, ...rest }) => (names.includes(rest.name) ? rest : { ...rest, weekly_salary }))
  const BLANK = blankFor('Patrick Kelly')

  it('is a dash of its own, and no total under the same heading counts it as nothing', () => {
    const r = buildPayrollReport(ddGrid(), config({ ...DD, roster: BLANK }))
    const bathurst = r.groups.find((g) => g.area === 'Bathurst')!
    expect(bathurst.employees.find((e) => e.name === 'Patrick Kelly')).toMatchObject({ month_budget: null, month_variance: null })
    // Patrick's 8,848 is missing from every one of these, so none of them prints.
    expect(bathurst.totals).toMatchObject({ month_budget: null, month_variance: null, period_salary: null })
    expect(bathurst.totals.month_actual).toBe(123282.85)
    expect(r.totals).toMatchObject({ month_budget: null, month_variance: null, period_salary: null })
    // Every other area is whole, and still prints.
    expect(round(r.groups.find((g) => g.area === 'Head Office')!.totals.month_budget)).toBe(45916)
  })

  it("the month's roster budget is not counted, and says whose salary is missing", () => {
    const r = buildPayrollReport(ddGrid(), config({ ...DD, roster: BLANK }))
    expect(r.months[0]).toMatchObject({ roster_budget: null, budget: DD_APPROVED_WAGES_AUG, budget_source: 'approved' })
    expect(r.months[0].roster_reason).toBe('the roster gives no salary for Patrick Kelly')
    expect(r.notes).toContain('Aug 2026’s roster budget could not be counted: the roster gives no salary for Patrick Kelly.')
    // The sentence whose job is to flag the gap must not report near-agreement
    // over 34 of 35 people: 236,736 against 237,711 is 975 apart, and false.
    expect(r.notes.join(' ')).not.toContain('apart')
  })

  it('the roster basis prints a dash, never a total over part of the team', () => {
    const r = buildPayrollReport(ddGrid(), config({ ...DD, roster: BLANK, budget_basis: 'roster' }))
    expect(r.months[0]).toMatchObject({ budget: null, difference: null, budget_source: null })
    expect(r.notes.join(' ')).toContain('could not be counted: the roster gives no salary for Patrick Kelly')
  })

  it('names everyone whose salary is missing', () => {
    const r = buildPayrollReport(ddGrid(), config({ ...DD, roster: blankFor('Patrick Kelly', 'Annie Bell') }))
    expect(r.months[0].roster_reason).toBe('the roster gives no salary for Patrick Kelly and Annie Bell')
  })

  it('someone paid who is not on the roster at all still leaves the roster’s own budget countable', () => {
    // A budget nobody was rostered for is a real overrun, and the page already
    // names them ("listed last"); a missing figure is not the same thing.
    const r = buildPayrollReport(ddGrid(), config({ ...DD, roster: DD_ROSTER.filter((e) => e.name !== 'Jismi Joy'), budget_basis: 'roster' }))
    expect(r.months[0]).toMatchObject({ budget: 245584 - 1822 * 4, roster_reason: null })
    expect(r.not_on_roster).toEqual(['Jismi Joy'])
  })
})

describe('a placement with none of the P10 options', () => {
  it('is the grid it was: one group, the approved budget, no notes', () => {
    const r = buildPayrollReport(ddGrid(), config({ layout: 'calxa', months: 1, roster: DD_ROSTER_WITHOUT_AREAS }))
    expect(r.groups).toHaveLength(1)
    expect(r.months[0]).toMatchObject({ budget: DD_APPROVED_WAGES_AUG, budget_source: 'approved' })
    expect(r.months[0].difference).toBe(-8142.69)
    expect(r.notes).toEqual([])
  })
})

// ── An IICT-shaped fortnightly payroll ─────────────────────────────────────

const fortnight = (payment_date: string): Pick<PayslipRow, 'calendar_type' | 'period_start' | 'period_end'> => {
  const end = new Date(`${payment_date}T00:00:00Z`)
  end.setUTCDate(end.getUTCDate() - 1)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 13)
  return { calendar_type: 'FORTNIGHTLY', period_start: start.toISOString().slice(0, 10), period_end: end.toISOString().slice(0, 10) }
}

// Wednesdays a fortnight apart: two runs in July and August, three in September.
const FORTNIGHTS = ['2026-07-08', '2026-07-22', '2026-08-05', '2026-08-19', '2026-09-02', '2026-09-16', '2026-09-30']
const IICT_STAFF: [string, string, number, number][] = [
  ['e-jm', 'Jennifer Moore', 2707, 2546],
  ['e-jb', 'Joelson Batista', 5352, 5400],
]
const iictGrid = () => buildPayrollGrid(
  FORTNIGHTS.flatMap((d) => IICT_STAFF.map(([id, name, , paid]) => ({ employee_id: id, employee_name: name, payment_date: d, wages: paid, super_amount: 0, ...fortnight(d) }))),
  IICT_STAFF.map(([employee_id]) => ({ employee_id, start_date: '2020-01-01' })),
  ['2026-07', '2026-08', '2026-09'],
  {},
)

describe('a fortnightly roster (IICT-40)', () => {
  const FORTNIGHTLY = {
    layout: 'calxa', months: 3, salary_period: 'fortnight', budget_basis: 'roster', employee_month_columns: true, pay_fills: true,
    roster: IICT_STAFF.map(([employee_id, name, perFortnight]) => ({ name, employee_id, fortnightly_salary: perFortnight })),
  }

  it('counts two weeks a run: four weeks in July and August, six in September', () => {
    const r = buildPayrollReport(iictGrid(), config(FORTNIGHTLY))
    expect(r.months.map((m) => [m.month, m.run_dates.length, m.weeks, m.pay_cycle])).toEqual([
      ['2026-07', 2, 4, 'FORTNIGHTLY'],
      ['2026-08', 2, 4, 'FORTNIGHTLY'],
      ['2026-09', 3, 6, 'FORTNIGHTLY'],
    ])
    // 8,059 a fortnight: 16,118 for a two-run month, 24,177 for September's three.
    expect(r.months.map((m) => m.budget)).toEqual([16118, 16118, 24177])
    expect(r.months.map((m) => m.difference)).toEqual([16118 - 15892, 16118 - 15892, 24177 - 23838])
  })

  it('the salary column and its total are per fortnight; the report month budgets each person at three fortnights', () => {
    const r = buildPayrollReport(iictGrid(), config(FORTNIGHTLY))
    const [jen, joel] = r.groups[0].employees
    expect([jen.period_salary, joel.period_salary, r.totals.period_salary]).toEqual([2707, 5352, 8059])
    expect([jen.month_budget, joel.month_budget]).toEqual([8121, 16056])
    expect(jen.month_variance).toBe(8121 - 3 * 2546)
  })

  it('shades a fortnight’s pay against the fortnight’s salary, not the week’s', () => {
    const r = buildPayrollReport(iictGrid(), config(FORTNIGHTLY))
    const [jen, joel] = r.groups[0].employees
    expect(Object.values(jen.fills).every((f) => f === 'under')).toBe(true)
    expect(Object.values(joel.fills).every((f) => f === 'over')).toBe(true)
  })

  it('the same roster stated weekly budgets the same months', () => {
    const weekly = {
      ...FORTNIGHTLY,
      salary_period: 'week',
      roster: IICT_STAFF.map(([employee_id, name, perFortnight]) => ({ name, employee_id, weekly_salary: perFortnight / 2 })),
    }
    const r = buildPayrollReport(iictGrid(), config(weekly))
    expect(r.months.map((m) => m.budget)).toEqual([16118, 16118, 24177])
    expect(r.groups[0].employees.map((e) => e.period_salary)).toEqual([1353.5, 2676])
    expect(Object.values(r.groups[0].employees[1].fills).every((f) => f === 'over')).toBe(true)
  })
})

// ── Dragon's June, before the financial year ───────────────────────────────

const DRAGON_RUNS = [
  '2026-06-05', '2026-06-12', '2026-06-19', '2026-06-26',
  '2026-07-03', '2026-07-10', '2026-07-17', '2026-07-24', '2026-07-31',
  '2026-08-07', '2026-08-14', '2026-08-21', '2026-08-28',
]
const DRAGON: [string, string, number, number][] = [
  ['d-lps', 'Leisa Porteous-Semple', 784, 784],
  ['d-ew', 'Eli Williams', 433, 433],
  ['d-bp', 'Ben Padmore', 2885, 2885],
  ['d-jp', 'Jordan PAMENTER', 2692.5, 2692],
]
const week = (payment_date: string): Pick<PayslipRow, 'calendar_type' | 'period_start' | 'period_end'> => {
  const end = new Date(`${payment_date}T00:00:00Z`)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 6)
  return { calendar_type: 'WEEKLY', period_start: start.toISOString().slice(0, 10), period_end: end.toISOString().slice(0, 10) }
}
/** The loader leaves June out of the approved budget: it belongs to FY2026 (payroll-grid-load). */
const dragonGrid = () => buildPayrollGrid(
  DRAGON_RUNS.flatMap((d) => DRAGON.map(([id, name, , paid]) => ({ employee_id: id, employee_name: name, payment_date: d, wages: paid, super_amount: 0, ...week(d) }))),
  DRAGON.map(([employee_id]) => ({ employee_id, start_date: '2017-07-01' })),
  ['2026-06', '2026-07', '2026-08'],
  { '2026-07': 26023 * 5 / 4, '2026-08': 26023 },
)
const DRAGON_ROSTER = DRAGON.map(([employee_id, name, weekly]) => ({ name: name === 'Jordan PAMENTER' ? 'Jordan' : name, employee_id, weekly_salary: weekly }))

describe("a window reaching back before the financial year (DRG-37)", () => {
  it('June prints a dash, as it always has, unless the placement asks for the roster', () => {
    const today = buildPayrollReport(dragonGrid(), config({ layout: 'calxa', months: 3, roster: DRAGON_ROSTER }))
    expect(today.months.map((m) => [m.month, m.budget, m.difference])).toEqual([
      ['2026-06', null, null],
      ['2026-07', 32528.75, 32528.75 - 33970],
      ['2026-08', 26023, 26023 - 27176],
    ])
  })

  it("with earlier_months 'roster', June's Budget is weekly × June's four runs — Calxa's 27,178 and $2 under", () => {
    const r = buildPayrollReport(dragonGrid(), config({ layout: 'calxa', months: 3, roster: DRAGON_ROSTER, earlier_months: 'roster' }))
    expect(r.months[0]).toMatchObject({ month: '2026-06', budget: 27178, budget_source: 'roster', difference: 2 })
    // July and August keep the approved budget.
    expect(r.months.slice(1).map((m) => m.budget_source)).toEqual(['approved', 'approved'])
    expect(r.notes.join(' ')).toContain('Jun 2026 is before this financial year, so its Budget is the roster’s')
  })

  it("on the roster basis every month is the roster's: 27,178 / 33,972.50 / 27,178", () => {
    const r = buildPayrollReport(dragonGrid(), config({ layout: 'calxa', months: 3, roster: DRAGON_ROSTER, budget_basis: 'roster' }))
    expect(r.months.map((m) => m.budget)).toEqual([27178, 33972.5, 27178])
  })
})

describe('a roster budget that cannot be counted is a dash and a sentence, never a guess', () => {
  it('pay runs read without their pay cycle', () => {
    const noCycle = buildPayrollGrid(
      ['2026-08-07', '2026-08-14'].map((d) => ({ employee_id: 'e1', employee_name: 'A', payment_date: d, wages: 1000, super_amount: 0 })),
      [{ employee_id: 'e1', start_date: null }],
      ['2026-08'],
      { '2026-08': 4000 },
    )
    const r = buildPayrollReport(noCycle, config({ layout: 'calxa', months: 1, budget_basis: 'roster', roster: [{ name: 'A', weekly_salary: 1000 }] }))
    expect(r.months[0]).toMatchObject({ budget: null, difference: null, roster_budget: null })
    expect(r.notes.join(' ')).toContain('Aug 2026’s roster budget could not be counted: a pay run carries no pay cycle')
  })

  it('a month on two pay cycles', () => {
    const mixed = buildPayrollGrid(
      [
        { employee_id: 'e1', employee_name: 'A', payment_date: '2026-08-07', wages: 1000, super_amount: 0, ...week('2026-08-07') },
        { employee_id: 'e2', employee_name: 'B', payment_date: '2026-08-12', wages: 2000, super_amount: 0, ...fortnight('2026-08-12') },
      ],
      [],
      ['2026-08'],
    )
    const r = buildPayrollReport(mixed, config({ layout: 'calxa', months: 1, budget_basis: 'roster', roster: [{ name: 'A', weekly_salary: 1000 }] }))
    expect(r.months[0].budget).toBeNull()
    expect(r.notes.join(' ')).toContain('more than one pay cycle')
  })

  it("start dates that could not be read", () => {
    const grid = { ...ddGrid(), records_unreadable: true }
    const r = buildPayrollReport(grid, config({ ...DD, budget_basis: 'roster' }))
    expect(r.months[0].budget).toBeNull()
    expect(r.notes.join(' ')).toContain('start dates could not be read')
  })
})

describe('someone rostered and employed but not paid this month', () => {
  it('is budgeted, listed in their area with dashes, and named', () => {
    const grid = buildPayrollGrid(
      ['2026-08-07', '2026-08-14'].map((d) => ({ employee_id: 'e1', employee_name: 'Paid Person', payment_date: d, wages: 1000, super_amount: 0, ...week(d) })),
      [
        { employee_id: 'e1', start_date: '2020-01-01', name: 'Paid Person' },
        { employee_id: 'e2', start_date: '2020-01-01', termination_date: null, name: 'On Leave' },
      ],
      ['2026-08'],
      { '2026-08': 4000 },
    )
    const roster = [
      { name: 'Paid Person', employee_id: 'e1', area: 'Orange', weekly_salary: 1000 },
      { name: 'On Leave', employee_id: 'e2', area: 'Orange', weekly_salary: 800 },
    ]
    const r = buildPayrollReport(grid, config({ layout: 'calxa', months: 1, roster, employee_month_columns: true, budget_basis: 'roster' }))
    const leave = r.groups[0].employees.find((e) => e.name === 'On Leave')!
    expect(leave).toMatchObject({ unpaid: true, month_actual: 0, month_budget: 1600, month_variance: 1600 })
    expect(Object.values(leave.cells).every((c) => c === null)).toBe(true)
    expect(r.months[0].budget).toBe(3600)
    expect(r.totals.month_budget).toBe(3600)
    expect(r.notes.join(' ')).toContain('Budgeted but not paid in Aug 2026: On Leave (1,600).')
  })
})
