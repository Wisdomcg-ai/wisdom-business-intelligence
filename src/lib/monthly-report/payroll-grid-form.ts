/**
 * The Payroll Report placement's settings as a form, and the config they store.
 *
 * The panel is thin on purpose (the ratio page's is the precedent): the form
 * state, the round trip and validity all live here, and validity is
 * parsePayrollGridConfig — the same rule the PDF applies — so a config the page
 * would refuse cannot be applied.
 *
 * A choice left at the page's own default is NOT stored, so a placement nobody
 * changed keeps the config it had and prints the same bytes.
 *
 * The salary column is typed in the unit the page prints it in: a roster kept
 * per fortnight (IICT) is entered per fortnight and stored as
 * fortnightly_salary; the same figures per week are stored as weekly_salary.
 * Switching the unit converts what is on screen, so nobody re-types 35 rows.
 */
import {
  DEFAULT_PAYROLL_GRID_CONFIG,
  parsePayrollGridConfig,
  type PayrollGridConfig,
  type PayrollRosterEntry,
} from './payroll-grid-config'

export interface PayrollRosterFormRow {
  name: string
  /** Xero's EmployeeID, kept as it was stored — the panel shows it, and does not invent one. */
  employee_id: string
  area: string
  standard_units: string
  /** In the form's salary period. */
  salary: string
}

export interface PayrollGridForm {
  layout: 'grid' | 'calxa'
  window: 'fixed' | 'fy_to_date'
  months: string
  budget_basis: 'approved' | 'roster'
  earlier_months: 'dash' | 'roster'
  salary_period: 'week' | 'fortnight'
  employee_month_columns: boolean
  pay_fills: boolean
  fill_tolerance: string
  standard_units_column: boolean
  difference_fills: boolean
  /** One bullet a line. */
  notes: string
  roster: PayrollRosterFormRow[]
}

const numberText = (n: number | null | undefined): string =>
  typeof n === 'number' ? String(Math.round(n * 100) / 100) : ''

const parseNumber = (text: string): number | undefined => {
  const trimmed = text.trim()
  if (trimmed === '') return undefined
  const value = Number(trimmed.replace(/[$,]/g, ''))
  return Number.isFinite(value) ? value : Number.NaN
}

export const EMPTY_ROSTER_ROW: PayrollRosterFormRow = { name: '', employee_id: '', area: '', standard_units: '', salary: '' }

/** A stored config as the form, and the reason when it could not be read (the panel says so, and starts from the defaults). */
export function payrollFormFromConfig(config: unknown): { form: PayrollGridForm; unreadable?: string } {
  const parsed = parsePayrollGridConfig(config)
  const c = parsed.config
  const perPeriod = c.salary_period === 'fortnight' ? 2 : 1
  const form: PayrollGridForm = {
    layout: c.layout,
    window: c.window,
    months: String(c.months),
    budget_basis: c.budget_basis,
    earlier_months: c.earlier_months,
    salary_period: c.salary_period,
    employee_month_columns: c.employee_month_columns,
    pay_fills: c.pay_fills,
    fill_tolerance: String(c.fill_tolerance),
    standard_units_column: c.standard_units_column,
    difference_fills: c.difference_fills,
    notes: c.notes.join('\n'),
    roster: c.roster.map((r) => {
      const weekly = typeof r.fortnightly_salary === 'number'
        ? r.fortnightly_salary / 2
        : typeof r.weekly_salary === 'number' ? r.weekly_salary : null
      return {
        name: r.name,
        employee_id: r.employee_id ?? '',
        area: r.area ?? '',
        standard_units: numberText(r.standard_units),
        salary: weekly === null ? '' : numberText(weekly * perPeriod),
      }
    }),
  }
  return parsed.ok ? { form } : { form, unreadable: parsed.reason }
}

/** The config Apply stores: the roster, then every choice that differs from the page's own default. */
export function payrollConfigFromForm(form: PayrollGridForm): Record<string, unknown> {
  const d = DEFAULT_PAYROLL_GRID_CONFIG
  const config: Record<string, unknown> = {}
  const set = (key: string, value: unknown, fallback: unknown) => {
    if (JSON.stringify(value) !== JSON.stringify(fallback)) config[key] = value
  }
  set('layout', form.layout, d.layout)
  set('window', form.window, d.window)
  set('months', parseNumber(form.months) ?? d.months, d.months)
  set('difference_fills', form.difference_fills, d.difference_fills)
  set('budget_basis', form.budget_basis, d.budget_basis)
  set('earlier_months', form.earlier_months, d.earlier_months)
  set('salary_period', form.salary_period, d.salary_period)
  set('employee_month_columns', form.employee_month_columns, d.employee_month_columns)
  set('pay_fills', form.pay_fills, d.pay_fills)
  set('fill_tolerance', parseNumber(form.fill_tolerance) ?? d.fill_tolerance, d.fill_tolerance)
  set('standard_units_column', form.standard_units_column, d.standard_units_column)
  set('notes', form.notes.split('\n').map((n) => n.trim()).filter(Boolean), d.notes)

  const roster = form.roster
    .filter((r) => r.name.trim() !== '' || r.employee_id.trim() !== '' || r.salary.trim() !== '')
    .map((r) => {
      const salary = parseNumber(r.salary)
      const units = parseNumber(r.standard_units)
      const entry: Record<string, unknown> = { name: r.name.trim() }
      if (r.employee_id.trim()) entry.employee_id = r.employee_id.trim()
      if (r.area.trim()) entry.area = r.area.trim()
      if (units !== undefined) entry.standard_units = units
      if (salary !== undefined) {
        entry[form.salary_period === 'fortnight' ? 'fortnightly_salary' : 'weekly_salary'] = salary
      }
      return entry
    })
  if (roster.length > 0) config.roster = roster
  return config
}

export type PayrollFormVerdict =
  | { ok: true; config: Record<string, unknown>; parsed: PayrollGridConfig }
  | { ok: false; reason: string }

/** Valid means the PDF will read it: the panel's Apply is disabled while this says no. */
export function validatePayrollForm(form: PayrollGridForm): PayrollFormVerdict {
  const config = payrollConfigFromForm(form)
  const parsed = parsePayrollGridConfig(config)
  return parsed.ok ? { ok: true, config, parsed: parsed.config } : { ok: false, reason: parsed.reason }
}

/** Switching the salary unit converts what is on screen — nobody re-types 35 rows. */
export function setSalaryPeriod(form: PayrollGridForm, salary_period: 'week' | 'fortnight'): PayrollGridForm {
  if (salary_period === form.salary_period) return form
  const factor = salary_period === 'fortnight' ? 2 : 0.5
  return {
    ...form,
    salary_period,
    roster: form.roster.map((r) => {
      const salary = parseNumber(r.salary)
      return salary === undefined || Number.isNaN(salary) ? r : { ...r, salary: numberText(salary * factor) }
    }),
  }
}

export function moveRosterRow(form: PayrollGridForm, index: number, by: -1 | 1): PayrollGridForm {
  const to = index + by
  if (to < 0 || to >= form.roster.length) return form
  const roster = [...form.roster]
  ;[roster[index], roster[to]] = [roster[to], roster[index]]
  return { ...form, roster }
}

export function removeRosterRow(form: PayrollGridForm, index: number): PayrollGridForm {
  return { ...form, roster: form.roster.filter((_, i) => i !== index) }
}

export function addRosterRow(form: PayrollGridForm): PayrollGridForm {
  return { ...form, roster: [...form.roster, { ...EMPTY_ROSTER_ROW }] }
}

export function updateRosterRow(form: PayrollGridForm, index: number, patch: Partial<PayrollRosterFormRow>): PayrollGridForm {
  return { ...form, roster: form.roster.map((r, i) => (i === index ? { ...r, ...patch } : r)) }
}

/** The line under the placed page on the editor's canvas. */
export function payrollPlacementSummary(config: unknown): string {
  const parsed = parsePayrollGridConfig(config)
  if (!parsed.ok) return 'Settings need attention'
  const c = parsed.config
  const roster: PayrollRosterEntry[] = c.roster
  const parts = [
    c.layout === 'calxa' ? 'Payroll Report' : 'Payroll grid',
    `${c.months} month${c.months === 1 ? '' : 's'}`,
  ]
  if (roster.length > 0) parts.push(`${roster.length} on the roster`)
  if (roster.some((r) => r.area)) parts.push(`${new Set(roster.map((r) => r.area).filter(Boolean)).size} areas`)
  if (c.budget_basis === 'roster') parts.push('roster budget')
  return parts.join(' · ')
}
