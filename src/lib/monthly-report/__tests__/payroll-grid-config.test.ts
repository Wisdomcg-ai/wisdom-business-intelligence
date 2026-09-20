import { describe, it, expect } from 'vitest'
import {
  DEFAULT_PAYROLL_GRID_CONFIG,
  parsePayrollGridConfig,
  payrollWindowForLayout,
  payrollWindowSize,
  weeklySalaryOf,
  isP10Default,
} from '../payroll-grid-config'

/** Urban Road's placement once the Calxa page is turned on (roster names and ids as Xero holds them). */
const URBAN_ROAD = {
  layout: 'calxa',
  window: 'fy_to_date',
  months: 3,
  difference_fills: true,
  roster: [
    { name: 'Andrea Shinners', employee_id: '2c50063e-f7ca-41b9-87e6-befddd844679' },
    { name: 'Deborah Leydon', employee_id: '457cf25d-8639-4ae8-abe7-9d36674f6e43' },
    { name: 'Suzanne Atkin', employee_id: 'c8c1153c-3d2b-4661-b1f6-ef5e92d46f0e' },
    { name: 'Lara Powell', employee_id: 'a1534c56-2619-4b41-b177-7a58c3b7e1e5' },
    { name: 'Thomas White', employee_id: 'd2224afe-842c-458f-b851-05b6de773d47' },
    { name: 'Cheryl Henderson', employee_id: '28cf67bf-460b-4ccf-9ac9-7d3df96718ab' },
  ],
}

describe('parsePayrollGridConfig', () => {
  it('with no config, is the page as it always printed', () => {
    // Every client that placed the grid before this existed gets exactly what
    // it had: two months, the grid layout, highest paid first, no fills.
    const parsed = parsePayrollGridConfig(undefined)
    expect(parsed.ok).toBe(true)
    expect(parsed.config).toEqual({
      layout: 'grid', window: 'fixed', months: 2, roster: [], difference_fills: false,
      // P10 — each at the page as it printed before it existed.
      budget_basis: 'approved', earlier_months: 'dash', salary_period: 'week', employee_month_columns: false,
      pay_fills: false, fill_tolerance: 1, standard_units_column: true, notes: [],
    })
    expect(parsePayrollGridConfig({}).config).toEqual(DEFAULT_PAYROLL_GRID_CONFIG)
  })

  it("reads Urban Road's placement", () => {
    const parsed = parsePayrollGridConfig(URBAN_ROAD)
    expect(parsed.ok).toBe(true)
    expect(parsed.config.layout).toBe('calxa')
    expect(parsed.config.roster.map((r) => r.name)).toEqual([
      'Andrea Shinners', 'Deborah Leydon', 'Suzanne Atkin', 'Lara Powell', 'Thomas White', 'Cheryl Henderson',
    ])
  })

  it('takes the standing figures when the coach has entered them, and blanks as blanks', () => {
    const parsed = parsePayrollGridConfig({
      roster: [
        { name: 'Thomas White', standard_units: 20, weekly_salary: 600 },
        { name: 'Cheryl Henderson', standard_units: null, weekly_salary: null },
        { name: 'Lara Powell' },
      ],
    })
    expect(parsed.ok).toBe(true)
    expect(parsed.config.roster[0]).toEqual({ name: 'Thomas White', standard_units: 20, weekly_salary: 600 })
    expect(parsed.config.roster[1].weekly_salary).toBeNull()
    expect(parsed.config.roster[2].weekly_salary).toBeUndefined()
  })

  it('a config it cannot read names what is wrong, and still carries the defaults', () => {
    const typo = parsePayrollGridConfig({ layout: 'calxa', rooster: [] })
    expect(typo.ok).toBe(false)
    expect(typo.ok ? '' : typo.reason).toContain('rooster')
    expect(typo.config).toEqual(DEFAULT_PAYROLL_GRID_CONFIG)

    const negative = parsePayrollGridConfig({ roster: [{ name: 'Andrea Shinners', weekly_salary: -2500 }] })
    expect(negative.ok).toBe(false)
    expect(negative.ok ? '' : negative.reason).toContain('roster.0.weekly_salary')
  })
})

describe('payrollWindowSize', () => {
  const ur = parsePayrollGridConfig(URBAN_ROAD).config

  it("is the financial year to date, capped at three — Calxa's 'Last 2 Months' in August, 'Last Three Months' in March", () => {
    expect(payrollWindowSize(ur, '2026-07')).toBe(1)
    expect(payrollWindowSize(ur, '2026-08')).toBe(2)
    expect(payrollWindowSize(ur, '2026-09')).toBe(3)
    expect(payrollWindowSize(ur, '2027-03')).toBe(3)
    expect(payrollWindowSize(ur, '2027-06')).toBe(3)
  })

  it('a fixed window ignores the year', () => {
    expect(payrollWindowSize(DEFAULT_PAYROLL_GRID_CONFIG, '2026-07')).toBe(2)
    expect(payrollWindowSize(DEFAULT_PAYROLL_GRID_CONFIG, '2027-03')).toBe(2)
  })

  it('loads the widest window any placement asks for, and two when none is placed', () => {
    expect(payrollWindowForLayout([], '2026-09')).toBe(2)
    expect(payrollWindowForLayout([{ type: 'payroll_grid' }], '2026-09')).toBe(2)
    expect(payrollWindowForLayout([{ type: 'memo' }, { type: 'payroll_grid', config: URBAN_ROAD }], '2026-08')).toBe(2)
    expect(payrollWindowForLayout([{ type: 'payroll_grid', config: URBAN_ROAD }], '2027-03')).toBe(3)
    // A placement whose config does not parse loads the default window.
    expect(payrollWindowForLayout([{ type: 'payroll_grid', config: { months: 'three' } }], '2027-03')).toBe(2)
  })
})

describe('P10 — areas, a fortnightly roster, and the budget basis', () => {
  it("reads Distinct Directions' placement: areas on the roster, the roster budget, month columns and shaded pays", () => {
    const parsed = parsePayrollGridConfig({
      layout: 'calxa',
      months: 1,
      difference_fills: true,
      budget_basis: 'roster',
      employee_month_columns: true,
      pay_fills: true,
      standard_units_column: false,
      notes: ['Adam Davey was paid 222 hours of annual leave on his final pay.'],
      roster: [
        { name: 'Daniel Jarvis', employee_id: '06fd2ce1-4076-4347-a7ed-a9ce67e437e8', area: 'Head Office', weekly_salary: 3185 },
        { name: 'James Baker', employee_id: '84a87517-afe8-458b-9af9-015ba4e56365', area: 'Bathurst', weekly_salary: 2314 },
      ],
    })
    expect(parsed.ok).toBe(true)
    expect(parsed.config.roster.map((r) => r.area)).toEqual(['Head Office', 'Bathurst'])
    expect(parsed.config).toMatchObject({ budget_basis: 'roster', employee_month_columns: true, pay_fills: true, standard_units_column: false })
    expect(parsed.config.notes).toHaveLength(1)
  })

  it("an IICT-shaped roster states each salary per fortnight; the weekly equivalent is half", () => {
    const parsed = parsePayrollGridConfig({
      layout: 'calxa', months: 3, salary_period: 'fortnight',
      roster: [{ name: 'Jennifer Moore', fortnightly_salary: 2707 }, { name: 'Joelson Batista', weekly_salary: 2676 }],
    })
    expect(parsed.ok).toBe(true)
    expect(parsed.config.roster.map(weeklySalaryOf)).toEqual([1353.5, 2676])
  })

  it('an entry may state a weekly or a fortnightly salary, never both — two figures that disagree would print one', () => {
    const both = parsePayrollGridConfig({ roster: [{ name: 'A', weekly_salary: 1000, fortnightly_salary: 2100 }] })
    expect(both.ok).toBe(false)
    expect(both.ok ? '' : both.reason).toContain('roster.0')
    expect(weeklySalaryOf({})).toBeNull()
    expect(weeklySalaryOf({ weekly_salary: null })).toBeNull()
  })

  it('an unknown basis or a tolerance past $100 is a stated reason, not a silent default', () => {
    const basis = parsePayrollGridConfig({ budget_basis: 'forecast' })
    expect(basis.ok ? '' : basis.reason).toContain('budget_basis')
    const tolerance = parsePayrollGridConfig({ fill_tolerance: 500 })
    expect(tolerance.ok ? '' : tolerance.reason).toContain('fill_tolerance')
  })

  it('knows when a placement uses nothing P10 added', () => {
    expect(isP10Default(DEFAULT_PAYROLL_GRID_CONFIG)).toBe(true)
    expect(isP10Default(parsePayrollGridConfig(URBAN_ROAD).config)).toBe(true)
    expect(isP10Default(parsePayrollGridConfig({ roster: [{ name: 'A', area: 'Orange' }] }).config)).toBe(false)
    expect(isP10Default(parsePayrollGridConfig({ roster: [{ name: 'A', fortnightly_salary: 2000 }] }).config)).toBe(false)
    expect(isP10Default(parsePayrollGridConfig({ budget_basis: 'roster' }).config)).toBe(false)
    expect(isP10Default(parsePayrollGridConfig({ notes: ['x'] }).config)).toBe(false)
  })
})
