/**
 * Urban Road Pty Ltd's August 2026 payroll, as the wages loader reads it: five
 * weekly pay runs (3, 10, 17, 24 and 31 August), six employees, and the
 * Payroll Report placement (calxa-24-w-payroll_grid) whose roster carries the
 * standing weekly salaries Matt typed in on 15 Sep 2026.
 *
 * Per-run pay is the August Total Paid over five runs: 12,500 / 12,500 /
 * 7,212 / 9,615 / 3,000 / 7,692. Two payslip names carry the double space Xero
 * stores ("Suzanne  Atkin"). The approved budget is rev 12 Aug 2026:
 * wages $52,519 and super $6,302 for August.
 */

export const UR_BUSINESS = '28d41193-38ae-4071-a2b1-0dbea90a38fd'
export const UR_PROFILE = 'aabd3c49-4dc8-4aa6-a9a6-75f62ab89ff5'
export const UR_TENANT = '8519c134-ed81-4d9b-8f07-ce499d12b7ee'

export const UR_EMPLOYEES = [
  { id: '2c50063e-f7ca-41b9-87e6-befddd844679', roster: 'Andrea Shinners', payslip: 'Andrea Shinners', start: '2020-03-05', units: 38, weekly: 2500, perRun: 2500 },
  { id: '457cf25d-8639-4ae8-abe7-9d36674f6e43', roster: 'Deborah Leydon', payslip: 'Deborah Leydon', start: '2018-01-22', units: 38, weekly: 2500, perRun: 2500 },
  { id: 'c8c1153c-3d2b-4661-b1f6-ef5e92d46f0e', roster: 'Suzanne Atkin', payslip: 'Suzanne  Atkin', start: '2020-03-01', units: 38, weekly: 1442.31, perRun: 1442.4 },
  { id: 'a1534c56-2619-4b41-b177-7a58c3b7e1e5', roster: 'Lara Powell', payslip: 'Lara  Powell', start: '2022-05-09', units: 38, weekly: 1923.08, perRun: 1923 },
  { id: 'd2224afe-842c-458f-b851-05b6de773d47', roster: 'Thomas White', payslip: 'Thomas White', start: '2018-02-12', units: 20, weekly: 600, perRun: 600 },
  { id: '28cf67bf-460b-4ccf-9ac9-7d3df96718ab', roster: 'Cheryl Henderson', payslip: 'Cheryl Henderson', start: '2025-06-09', units: 38, weekly: 1538.46, perRun: 1538.4 },
] as const

export const UR_AUGUST_RUNS = ['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31']

/** ISO date `days` before `iso`. */
export function daysBefore(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

export interface SlipOptions {
  calendar_type?: string | null
  period_days?: number
  pay_run_id?: string
}

export function payslip(
  employee_id: string,
  employee_name: string,
  payment_date: string,
  wages: number,
  opts: SlipOptions = {},
) {
  const periodDays = opts.period_days ?? 7
  return {
    business_id: UR_PROFILE,
    tenant_id: UR_TENANT,
    pay_run_id: opts.pay_run_id ?? `run-${payment_date}`,
    employee_id,
    employee_name,
    payment_date,
    period_start: daysBefore(payment_date, periodDays - 1),
    period_end: payment_date,
    calendar_type: opts.calendar_type === undefined ? 'WEEKLY' : opts.calendar_type,
    wages,
    tax: 0,
    super_amount: Math.round(wages * 12) / 100,
    net_pay: wages,
  }
}

export const urAugustSlips = () =>
  UR_EMPLOYEES.flatMap((e) => UR_AUGUST_RUNS.map((d) => payslip(e.id, e.payslip, d, e.perRun)))

export const urXeroEmployees = () =>
  UR_EMPLOYEES.map((e) => ({ business_id: UR_PROFILE, tenant_id: UR_TENANT, employee_id: e.id, start_date: e.start }))

type RosterRow = { name: string; employee_id?: string; standard_units?: number | null; weekly_salary?: number | null }

/** The roster as stored today — ids and names, no standing figures. */
export const urRosterWithoutSalaries = (): RosterRow[] => UR_EMPLOYEES.map((e) => ({ name: e.roster, employee_id: e.id }))

/** The roster once Matt adds Standard Units and Weekly Salary (Budget). */
export const urRosterWithSalaries = (): RosterRow[] =>
  UR_EMPLOYEES.map((e) => ({ name: e.roster, employee_id: e.id, standard_units: e.units, weekly_salary: e.weekly }))

export function urLayout(roster: RosterRow[]) {
  return {
    version: 1,
    pages: [
      { id: 'calxa-14', orientation: 'portrait', widgets: [{ id: 'calxa-14-w-wages_detail', type: 'wages_detail', col: 0, row: 0, colSpan: 3, rowSpan: 3 }] },
      {
        id: 'calxa-24',
        orientation: 'landscape',
        widgets: [{
          id: 'calxa-24-w-payroll_grid', type: 'payroll_grid', col: 0, row: 0, colSpan: 3, rowSpan: 3,
          config: { layout: 'calxa', window: 'fy_to_date', months: 3, difference_fills: true, roster },
        }],
      },
    ],
  }
}

export const UR_APPROVED_BUDGET = {
  source: 'budget_version',
  versionId: 'v1',
  forecastId: null,
  noBudgetReason: null,
  label: 'Overall Budget (Xero, rev 12 Aug 2026)',
  lines: [
    { id: 'b1', account_name: 'Employ - Wages & Salaries', category: 'Operating Expenses', forecast_months: { '2026-07': 42015, '2026-08': 52519 } },
    { id: 'b2', account_name: 'Employ - Superannuation', category: 'Operating Expenses', forecast_months: { '2026-07': 5042, '2026-08': 6302 } },
  ],
}

export const UR_WAGES_ACCOUNTS = ['Employ - Wages & Salaries', 'Employ - Superannuation']

/** Every table the wages loader reads, for Urban Road's August. */
export function urWagesTables(opts: { pdf_layout?: unknown; slips?: unknown[]; employees?: unknown[] } = {}) {
  return {
    monthly_report_settings: [{
      business_id: UR_BUSINESS,
      budget_source: 'budget_version',
      ...(opts.pdf_layout === undefined ? {} : { pdf_layout: opts.pdf_layout }),
    }],
    xero_pl_lines_wide_compat: [
      { business_id: UR_PROFILE, account_name: 'Employ - Wages & Salaries', monthly_values: { '2026-08': -52519 } },
      { business_id: UR_PROFILE, account_name: 'Employ - Superannuation', monthly_values: { '2026-08': -6302 } },
    ],
    account_mappings: [],
    xero_payslip_lines: opts.slips ?? urAugustSlips(),
    xero_employees: opts.employees ?? urXeroEmployees(),
    xero_pay_runs: [],
    xero_connections: [{ business_id: UR_BUSINESS, tenant_id: UR_TENANT, is_active: true }],
  }
}

// ── A forecast client, for the half that must not move ──────────────────────

export const FC_BUSINESS = '11111111-1111-4111-8111-111111111111'
export const FC_PROFILE = '22222222-2222-4222-8222-222222222222'
export const FC_TENANT = 'tenant-forecast-client'
export const FC_FORECAST = '33333333-3333-4333-8333-333333333333'

export const FC_RESOLVED_FORECAST = {
  source: 'forecast',
  versionId: null,
  forecastId: FC_FORECAST,
  noBudgetReason: null,
  label: 'FY27 Forecast',
  lines: [
    { id: 'fl1', account_name: 'Wages & Salaries', category: 'Operating Expenses', forecast_months: { '2026-08': 21666.67 } },
    { id: 'fl2', account_name: 'Superannuation', category: 'Operating Expenses', forecast_months: { '2026-08': 2600 } },
  ],
}

export function forecastClientTables(opts: { pdf_layout?: unknown } = {}) {
  const slip = (employee_id: string, employee_name: string, payment_date: string, wages: number) => ({
    business_id: FC_PROFILE, tenant_id: FC_TENANT, pay_run_id: `fc-${payment_date}`, employee_id, employee_name, payment_date,
    period_start: daysBefore(payment_date, 13), period_end: payment_date, calendar_type: 'FORTNIGHTLY',
    wages, tax: 0, super_amount: Math.round(wages * 12) / 100, net_pay: wages,
  })
  return {
    monthly_report_settings: [{
      business_id: FC_BUSINESS,
      budget_source: 'forecast',
      ...(opts.pdf_layout === undefined ? {} : { pdf_layout: opts.pdf_layout }),
    }],
    xero_pl_lines_wide_compat: [
      { business_id: FC_PROFILE, account_name: 'Wages & Salaries', monthly_values: { '2026-08': -20800 } },
      { business_id: FC_PROFILE, account_name: 'Superannuation', monthly_values: { '2026-08': -2496 } },
    ],
    account_mappings: [],
    forecast_pl_lines: [
      { id: 'fl1', forecast_id: FC_FORECAST, is_from_payroll: true },
      { id: 'fl2', forecast_id: FC_FORECAST, is_from_payroll: true },
    ],
    forecast_employees: [
      { forecast_id: FC_FORECAST, employee_name: 'Priya Natarajan', position: 'Operations Manager', category: 'Wages Admin', annual_salary: 130000, super_rate: 0.12, pay_per_period: 5000, monthly_cost: 10833.33, start_date: null, is_active: true },
      { forecast_id: FC_FORECAST, employee_name: 'Sam Brooks', position: 'Technician', category: 'Wages COGS', annual_salary: 104000, super_rate: 0.12, pay_per_period: 4000, monthly_cost: null, start_date: '2024-02-01', is_active: true },
      { forecast_id: FC_FORECAST, employee_name: 'Future Hire', position: 'Apprentice', category: 'Wages COGS', annual_salary: 52000, super_rate: 0.12, pay_per_period: 2000, monthly_cost: null, start_date: '2027-01-15', is_active: true },
      { forecast_id: FC_FORECAST, employee_name: 'Budgeted Not Paid', position: 'Admin', category: 'Wages Admin', annual_salary: 26000, super_rate: 0.12, pay_per_period: 1000, monthly_cost: null, start_date: null, is_active: true },
    ],
    financial_forecasts: [{ id: FC_FORECAST, payroll_frequency: 'fortnightly' }],
    xero_payslip_lines: [
      slip('fc-e1', 'Priya Natarajan', '2026-08-07', 5000),
      slip('fc-e1', 'Priya Natarajan', '2026-08-21', 5000),
      slip('fc-e2', 'Sam  Brooks', '2026-08-07', 4000),
      slip('fc-e2', 'Sam  Brooks', '2026-08-21', 4400),
      slip('fc-e3', 'Casual Unplanned', '2026-08-21', 2400),
    ],
    xero_employees: [
      { business_id: FC_PROFILE, tenant_id: FC_TENANT, employee_id: 'fc-e1', start_date: '2019-07-01' },
      { business_id: FC_PROFILE, tenant_id: FC_TENANT, employee_id: 'fc-e2', start_date: '2024-02-01' },
      { business_id: FC_PROFILE, tenant_id: FC_TENANT, employee_id: 'fc-e3', start_date: '2026-08-15' },
    ],
    xero_pay_runs: [],
    xero_connections: [{ business_id: FC_BUSINESS, tenant_id: FC_TENANT, is_active: true }],
  }
}

/** A roster with weekly salaries for the forecast client — which must be ignored. */
export const forecastClientRoster = () => [
  { name: 'Priya Natarajan', employee_id: 'fc-e1', standard_units: 38, weekly_salary: 9999 },
  { name: 'Sam Brooks', weekly_salary: 8888 },
]
