import { describe, it, expect } from 'vitest'
import {
  DEFAULT_PAYROLL_GRID_CONFIG,
  parsePayrollGridConfig,
  payrollWindowForLayout,
  payrollWindowSize,
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
    expect(parsed.config).toEqual({ layout: 'grid', window: 'fixed', months: 2, roster: [], difference_fills: false })
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
