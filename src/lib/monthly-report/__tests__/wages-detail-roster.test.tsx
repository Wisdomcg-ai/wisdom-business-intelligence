/**
 * The Wages Analysis page's per-employee Budget reads the Payroll Report
 * roster, through the one loader the app tab, the wages-detail route and the
 * pack all share.
 *
 * Urban Road, August 2026: approved budget (not split by employee), five weekly
 * runs, and the roster's weekly salaries — Andrea 12,500, Deborah 12,500,
 * Suzanne 7,211.55, Lara 9,615.40, Thomas 3,000, Cheryl 7,692.30.
 *
 * The half that must not move is pinned to goldens captured from the code as
 * it was before the roster was read (fixtures/wages-detail-golden.json): a
 * forecast client with a per-employee plan — whose layout carries a roster
 * with weekly salaries, which must be ignored — and Urban Road's layout as
 * stored today, with no weekly salaries. Loader JSON, tab HTML and the pack
 * page's text runs, byte for byte.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import golden from './fixtures/wages-detail-golden.json'
import { fakeSupabase } from './fake-supabase'
import {
  UR_BUSINESS, UR_PROFILE, FC_BUSINESS, FC_PROFILE, UR_APPROVED_BUDGET, FC_RESOLVED_FORECAST, UR_WAGES_ACCOUNTS,
  UR_EMPLOYEES, UR_AUGUST_RUNS, payslip, urWagesTables, urLayout, urRosterWithSalaries, urRosterWithoutSalaries, urXeroEmployees,
  forecastClientTables, forecastClientRoster,
} from './urban-road-wages-fixture'

const { resolveBudgetMock, sentry } = vi.hoisted(() => ({
  resolveBudgetMock: vi.fn(),
  sentry: { captureException: vi.fn(), captureMessage: vi.fn() },
}))
vi.mock('@sentry/nextjs', () => sentry)
vi.mock('@/lib/business/resolveBusinessProfileIds', () => ({
  resolveBusinessProfileIds: vi.fn(async (_db: unknown, id: string) =>
    id === FC_BUSINESS
      ? { businessId: FC_BUSINESS, profileId: FC_PROFILE, all: [FC_BUSINESS, FC_PROFILE] }
      : { businessId: UR_BUSINESS, profileId: UR_PROFILE, all: [UR_BUSINESS, UR_PROFILE] }),
}))
vi.mock('@/lib/budgets/owned-forecast', () => ({ forecastBelongsToBusiness: vi.fn(async () => true) }))
vi.mock('@/lib/budgets/resolve-budget', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/budgets/resolve-budget')>()),
  resolveBudget: resolveBudgetMock,
}))

import { loadWagesDetail } from '../wages-detail-load'
import WagesAnalysisTab from '@/app/finances/monthly-report/components/WagesAnalysisTab'
import { MonthlyReportPDFService } from '@/app/finances/monthly-report/services/monthly-report-pdf-service'
import { fixtureReport, textRuns, pageContaining } from '@/app/finances/monthly-report/services/__tests__/pdf-pack-fixture'
import type { WagesDetailData } from '@/app/finances/monthly-report/types'

const urInput = { business_id: UR_BUSINESS, report_month: '2026-08', fiscal_year: 2027, wages_account_names: UR_WAGES_ACCOUNTS }
const fcInput = { business_id: FC_BUSINESS, report_month: '2026-08', fiscal_year: 2027, wages_account_names: ['Wages & Salaries', 'Superannuation'] }

const loadUr = (tables: Parameters<typeof urWagesTables>[0], extra: Record<string, unknown> = {}) =>
  loadWagesDetail(fakeSupabase(urWagesTables(tables) as any), { ...urInput, ...extra })

const byName = (data: WagesDetailData) =>
  Object.fromEntries(data.employees.map((e) => [e.name.replace(/\s+/g, ' '), e]))

const tabHtml = (data: WagesDetailData) =>
  render(<WagesAnalysisTab data={data} isLoading={false} error={null} />).container.innerHTML

function packRuns(data: WagesDetailData, budgetSource: string): string[] {
  const doc: any = new MonthlyReportPDFService(fixtureReport({ budget_source: budgetSource } as any), { wagesDetail: data }).generate()
  return textRuns(doc, pageContaining(doc, 'Wages Analysis'))
}

beforeEach(() => {
  resolveBudgetMock.mockReset().mockImplementation(async (_db: unknown, args: { businessId: string }) =>
    args.businessId === FC_BUSINESS ? FC_RESOLVED_FORECAST : UR_APPROVED_BUDGET)
  sentry.captureException.mockReset()
  sentry.captureMessage.mockReset()
})

describe('Urban Road, August 2026 — the roster fills the per-employee Budget', () => {
  it("budgets each employee at the roster's weekly salary × the month's five runs, with the variance against what was paid", async () => {
    const { data } = await loadUr({ pdf_layout: urLayout(urRosterWithSalaries()) })
    const rows = byName(data)
    expect(Object.fromEntries(Object.entries(rows).map(([n, e]) => [n, [e.actual_total, e.budget_total, e.variance]]))).toEqual({
      'Andrea Shinners': [12500, 12500, 0],
      'Deborah Leydon': [12500, 12500, 0],
      'Suzanne Atkin': [7212, 7211.55, -0.45],
      'Lara Powell': [9615, 9615.4, 0.4],
      'Thomas White': [3000, 3000, 0],
      'Cheryl Henderson': [7692, 7692.3, 0.3],
    })
    expect(data.employees.some((e) => e.budget_missing)).toBe(false)
    expect(data.employee_plan_available).toBe(true)
    expect(data.employee_roster).toEqual({ status: 'applied', missing: [], unchecked: [] })
    expect(data.employee_totals.budget).toBe(52519.25)
  })

  it('leaves the account table and its Grand Total on the approved budget', async () => {
    const without = await loadUr({ pdf_layout: urLayout(urRosterWithoutSalaries()) })
    const withRoster = await loadUr({ pdf_layout: urLayout(urRosterWithSalaries()) })
    expect(withRoster.data.accounts).toEqual(without.data.accounts)
    expect(withRoster.data.grand_total).toEqual(without.data.grand_total)
    expect(withRoster.data.budget_provenance).toEqual(without.data.budget_provenance)
  })

  it('reads the layout it is handed over the stored one — how the harness renders a roster before it is saved', async () => {
    const { data } = await loadUr({ pdf_layout: urLayout(urRosterWithoutSalaries()) }, { pdf_layout: urLayout(urRosterWithSalaries()) })
    expect(byName(data)['Andrea Shinners'].budget_total).toBe(12500)
  })

  it('an entry with no weekly salary is a dash, and the total says it is not the whole team', async () => {
    const roster = urRosterWithSalaries().map((r) => (r.name === 'Thomas White' ? { ...r, weekly_salary: null } : r))
    const { data } = await loadUr({ pdf_layout: urLayout(roster) })
    const thomas = byName(data)['Thomas White']
    expect(thomas).toMatchObject({ actual_total: 3000, budget_total: 0, variance: 0, budget_missing: true })
    expect(data.employee_roster).toEqual({ status: 'applied', missing: ['Thomas White'], unchecked: [] })
    expect(data.employees.filter((e) => !e.budget_missing).every((e) => e.budget_total > 0)).toBe(true)
  })

  it('matches a name-only roster entry to the double-spaced payslip name', async () => {
    const roster = urRosterWithSalaries().map((r) => (r.name === 'Suzanne Atkin' ? { name: 'Suzanne Atkin', weekly_salary: 1442.31 } : r))
    const { data } = await loadUr({ pdf_layout: urLayout(roster) })
    expect(byName(data)['Suzanne Atkin'].budget_total).toBe(7211.55)
  })

  it('a mid-month starter is budgeted from their Xero start date', async () => {
    const starter = { id: 'new-starter-1', name: 'Jordan Starter' }
    const { data } = await loadUr({
      pdf_layout: urLayout([...urRosterWithSalaries(), { name: starter.name, employee_id: starter.id, weekly_salary: 1000 }]),
      slips: [...urAugustSlipsPlus(['2026-08-17', '2026-08-24', '2026-08-31'].map((d) => payslip(starter.id, starter.name, d, 1000)))],
      employees: [...UR_EMPLOYEES.map((e) => ({ business_id: UR_PROFILE, employee_id: e.id, start_date: e.start })), { business_id: UR_PROFILE, employee_id: starter.id, start_date: '2026-08-12' }],
    })
    expect(byName(data)['Jordan Starter']).toMatchObject({ actual_total: 3000, budget_total: 3000 })
    expect(byName(data)['Andrea Shinners'].budget_total).toBe(12500)
  })

  it('a fortnightly payroll counts two weeks a run', async () => {
    const slips = UR_EMPLOYEES.flatMap((e) =>
      ['2026-08-07', '2026-08-21'].map((d) => payslip(e.id, e.payslip, d, e.perRun * 2, { calendar_type: 'FORTNIGHTLY', period_days: 14 })))
    const { data } = await loadUr({ pdf_layout: urLayout(urRosterWithSalaries()), slips })
    expect(byName(data)['Lara Powell']).toMatchObject({ actual_total: 7692, budget_total: 7692.32 })
  })

  it('an unknown pay cycle is no roster budget for the month — stated, never guessed', async () => {
    const slips = urAugustSlipsPlus([]).map((s, i) => (i === 0 ? { ...s, calendar_type: null } : s))
    const { data } = await loadUr({ pdf_layout: urLayout(urRosterWithSalaries()), slips })
    expect(data.employee_roster).toEqual({ status: 'unavailable', reason: 'unknown_pay_cycle' })
    expect(data.employee_plan_available).toBe(false)
    expect(data.employees.every((e) => e.budget_total === 0 && !e.budget_missing)).toBe(true)
  })

  it('a start-date read that fails is could-not-check, captured', async () => {
    const { data } = await loadUr({ pdf_layout: urLayout(urRosterWithSalaries()), employees: { error: { message: 'timeout' } } as any })
    expect(data.employee_roster).toEqual({ status: 'unavailable', reason: 'start_dates_unreadable' })
    expect(sentry.captureException).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ tags: expect.objectContaining({ invariant: 'wages-roster-start-dates-read' }) }))
  })
})

function urAugustSlipsPlus(extra: ReturnType<typeof payslip>[]) {
  return [...UR_EMPLOYEES.flatMap((e) => UR_AUGUST_RUNS.map((d) => payslip(e.id, e.payslip, d, e.perRun))), ...extra]
}

describe('the tab and the pack print the roster budgets', () => {
  it('the tab shows each budget, the variance, the total and one plain line naming the source', async () => {
    const { data } = await loadUr({ pdf_layout: urLayout(urRosterWithSalaries()) })
    render(<WagesAnalysisTab data={data} isLoading={false} error={null} />)
    expect(screen.queryByText(/No per-employee plan/)).toBeNull()
    expect(screen.getByText("Per-employee budgets are the Payroll Report roster’s weekly salaries × this month’s pay runs.")).toBeTruthy()
    // Total Paid, Budget, Var ($). 7,211.55 against 7,212 paid is 45 cents
    // over, which the tab's whole-dollar format has always printed as -$0.
    // (getByText collapses the payslip name's double space.)
    const cells = (name: string) => [...screen.getByText(name).closest('tr')!.querySelectorAll('td')].slice(-3).map((td) => td.textContent)
    expect(cells('Suzanne Atkin')).toEqual(['$7,212', '$7,212', '-$0'])
    expect(cells('Andrea Shinners')).toEqual(['$12,500', '$12,500', '$0'])
    expect(cells('Lara Powell')).toEqual(['$9,615', '$9,615', '$0'])
    const total = screen.getAllByText('Total').at(-1)!.closest('tr')!
    expect([...total.querySelectorAll('td')].slice(-3).map((td) => td.textContent)).toEqual(['$52,519', '$52,519', '$0'])
  })

  it('the tab dashes an employee with no weekly salary, and leaves the total out rather than print a part of it', async () => {
    const roster = urRosterWithSalaries().map((r) => (r.name === 'Thomas White' ? { ...r, weekly_salary: null } : r))
    const { data } = await loadUr({ pdf_layout: urLayout(roster) })
    render(<WagesAnalysisTab data={data} isLoading={false} error={null} />)
    const thomas = screen.getByText('Thomas White').closest('tr')!
    expect([...thomas.querySelectorAll('td')].slice(-3).map((td) => td.textContent)).toEqual(['$3,000', '—', '—'])
    const total = screen.getAllByText('Total').at(-1)!.closest('tr')!
    expect([...total.querySelectorAll('td')].slice(-2).map((td) => td.textContent)).toEqual(['—', '—'])
    expect(screen.getByText(/No weekly salary on the roster for Thomas White/)).toBeTruthy()
  })

  it('the tab states why when the roster could not be turned into a budget', async () => {
    const slips = urAugustSlipsPlus([]).map((s, i) => (i === 0 ? { ...s, calendar_type: null } : s))
    const { data } = await loadUr({ pdf_layout: urLayout(urRosterWithSalaries()), slips })
    render(<WagesAnalysisTab data={data} isLoading={false} error={null} />)
    expect(screen.getByText(/a pay run this month has no recognised pay cycle/)).toBeTruthy()
  })

  it('the pack page prints the per-employee budgets under "Budget", and the source line', async () => {
    const { data } = await loadUr({ pdf_layout: urLayout(urRosterWithSalaries()) })
    const runs = packRuns(data, 'budget_version')
    const joined = runs.join(' | ')
    expect(joined).not.toContain('No per-employee plan')
    expect(joined).toContain('Suzanne  Atkin | 7,212 | 7,212 | 0')
    expect(joined).toContain('Lara  Powell | 9,615 | 9,615 | 0')
    expect(joined).toContain('Andrea Shinners | 12,500 | 12,500 | 0')
    expect(joined).toContain('Thomas White | 3,000 | 3,000 | 0')
    expect(runs.filter((r) => r === 'Budget')).toHaveLength(2)
    expect(joined).toContain('Payroll Report roster')
  })

  it('the pack page dashes the employee with no weekly salary', async () => {
    const roster = urRosterWithSalaries().map((r) => (r.name === 'Thomas White' ? { ...r, weekly_salary: null } : r))
    const { data } = await loadUr({ pdf_layout: urLayout(roster) })
    const joined = packRuns(data, 'budget_version').join(' | ')
    expect(joined).toMatch(/Thomas White \| 3,000 \| [^|0-9]* \| [^|0-9]* \|/)
    expect(joined).toContain('Andrea Shinners | 12,500 | 12,500 | 0')
    expect(joined).toContain('Thomas White')
  })
})

describe('a rostered employee with a weekly salary who was not paid this month', () => {
  // Thomas White, $600 a week, with no August payslip — on unpaid leave, or gone.
  const withoutThomas = () => urAugustSlipsPlus([]).filter((s) => s.employee_name !== 'Thomas White')
  const employeesWith = (thomas: Record<string, unknown>) =>
    urXeroEmployees().map((e) => (e.employee_id === 'd2224afe-842c-458f-b851-05b6de773d47' ? { ...e, ...thomas } : e))

  it('stays on the page with their budget, so the employee Budget total is the whole roster’s', async () => {
    const { data } = await loadUr({ pdf_layout: urLayout(urRosterWithSalaries()), slips: withoutThomas() })
    expect(byName(data)['Thomas White']).toMatchObject({ actual_total: 0, budget_total: 3000, variance: 3000, pay_runs: [], pay_frequency: 'Weekly' })
    expect(data.employee_totals).toEqual({ actual: 49519, budget: 52519.25, variance: 3000.25 })
    expect(data.employee_roster).toEqual({ status: 'applied', missing: [], unchecked: [] })
  })

  it('is not budgeted when Xero says they left before the month’s runs', async () => {
    const { data } = await loadUr({
      pdf_layout: urLayout(urRosterWithSalaries()),
      slips: withoutThomas(),
      employees: employeesWith({ termination_date: '2026-07-24' }),
    })
    expect(byName(data)['Thomas White']).toBeUndefined()
    expect(data.employee_totals.budget).toBe(49519.25)
    expect(data.employee_roster).toEqual({ status: 'applied', missing: [], unchecked: [] })
  })

  it('a leaver paid part of the month is budgeted up to their last day', async () => {
    const slips = urAugustSlipsPlus([]).filter((s) => s.employee_name !== 'Thomas White' || s.payment_date <= '2026-08-17')
    const { data } = await loadUr({ pdf_layout: urLayout(urRosterWithSalaries()), slips, employees: employeesWith({ termination_date: '2026-08-12' }) })
    expect(byName(data)['Thomas White']).toMatchObject({ actual_total: 1800, budget_total: 1800, variance: 0 })
  })

  it('someone Xero has no employee record for is named, not budgeted, and the total is not stated', async () => {
    const roster = [...urRosterWithSalaries(), { name: 'Jordan Casual', weekly_salary: 900 }]
    const { data } = await loadUr({ pdf_layout: urLayout(roster) })
    expect(byName(data)['Jordan Casual']).toBeUndefined()
    expect(data.employee_roster).toEqual({ status: 'applied', missing: [], unchecked: ['Jordan Casual'] })
    render(<WagesAnalysisTab data={data} isLoading={false} error={null} />)
    const total = screen.getAllByText('Total').at(-1)!.closest('tr')!
    expect([...total.querySelectorAll('td')].slice(-2).map((td) => td.textContent)).toEqual(['—', '—'])
    expect(screen.getByText(/Jordan Casual was not paid this month and has no Xero employee record/)).toBeTruthy()
  })

  it('the tab shows them paid nothing against their budget, and the total covers everyone', async () => {
    const { data } = await loadUr({ pdf_layout: urLayout(urRosterWithSalaries()), slips: withoutThomas() })
    render(<WagesAnalysisTab data={data} isLoading={false} error={null} />)
    const thomas = screen.getByText('Thomas White').closest('tr')!
    expect([...thomas.querySelectorAll('td')].slice(-3).map((td) => td.textContent)).toEqual(['—', '$3,000', '$3,000'])
    const total = screen.getAllByText('Total').at(-1)!.closest('tr')!
    expect([...total.querySelectorAll('td')].slice(-3).map((td) => td.textContent)).toEqual(['$49,519', '$52,519', '$3,000'])
  })

  it('the pack prints them too', async () => {
    const { data } = await loadUr({ pdf_layout: urLayout(urRosterWithSalaries()), slips: withoutThomas() })
    const joined = packRuns(data, 'budget_version').join(' | ')
    expect(joined).toMatch(/Thomas White \| [^|]* \| 3,000 \| 3,000/)
  })
})

describe('every other client is unchanged, byte for byte', () => {
  it('a forecast client with a per-employee plan — a roster with weekly salaries in its layout is ignored', async () => {
    const withRoster = await loadWagesDetail(fakeSupabase(forecastClientTables({ pdf_layout: urLayout(forecastClientRoster() as any) }) as any), fcInput)
    const withoutLayout = await loadWagesDetail(fakeSupabase(forecastClientTables() as any), fcInput)
    expect(JSON.stringify(withRoster)).toBe(golden.forecast_client.load)
    expect(JSON.stringify(withoutLayout)).toBe(golden.forecast_client.load)
    expect(tabHtml(withRoster.data)).toBe(golden.forecast_client.tab)
    expect(packRuns(withRoster.data, 'forecast')).toEqual(golden.forecast_client.pack)
  })

  it('a client with no weekly salaries on any roster — Urban Road as stored today, and a client with no layout', async () => {
    const stored = await loadUr({ pdf_layout: urLayout(urRosterWithoutSalaries()) })
    const noLayout = await loadUr({})
    const nullLayout = await loadUr({ pdf_layout: null })
    expect(JSON.stringify(stored)).toBe(golden.no_roster.load)
    expect(JSON.stringify(noLayout)).toBe(golden.no_roster.load)
    expect(JSON.stringify(nullLayout)).toBe(golden.no_roster.load)
    expect(tabHtml(stored.data)).toBe(golden.no_roster.tab)
    expect(packRuns(stored.data, 'budget_version')).toEqual(golden.no_roster.pack)
  })

  it('reads no employee start dates unless a roster budget is being built', async () => {
    const db = fakeSupabase(urWagesTables({ pdf_layout: urLayout(urRosterWithoutSalaries()) }) as any)
    await loadWagesDetail(db, urInput)
    expect(db.calls.map((c) => c.table)).not.toContain('xero_employees')
    const fc = fakeSupabase(forecastClientTables({ pdf_layout: urLayout(forecastClientRoster() as any) }) as any)
    await loadWagesDetail(fc, fcInput)
    expect(fc.calls.map((c) => c.table)).not.toContain('xero_employees')
  })
})
