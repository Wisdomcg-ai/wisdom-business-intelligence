/**
 * The Wages page (Calxa-style wages breakdown), built from the database:
 * account totals against the resolved budget, and employee detail from the
 * STORED payslips.
 *
 * Shared by /api/monthly-report/wages-detail and scripts/preview-pack.ts.
 *
 * A business whose payroll backfill has never run has nothing stored, and the
 * route falls back to a live Xero pull. That pull needs a token, and taking a
 * token can refresh and rotate it — a write — so it is NOT done here: the
 * caller injects it as `fetchLivePayroll`. The route does; the read-only
 * harness does not, and `live_fallback` says when that mattered.
 *
 * The caller supplies the client and is responsible for authorisation.
 */
import * as Sentry from '@sentry/nextjs'
import { forecastBelongsToBusiness } from '@/lib/budgets/owned-forecast'
import { resolveBudget } from '@/lib/budgets/resolve-budget'
import { buildFuzzyLookup } from '@/lib/utils/account-matching'

/** The report's currency. A wages row from an org in another currency is not added to it. */
const PRESENTATION_CURRENCY = 'AUD'
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import {
  matchEmployeeName,
  tokenSortKey,
  computePayrollPhasing,
  computePayrollTies,
  buildWagesBudgetResolver,
} from '@/app/api/monthly-report/wages-detail/_helpers'
import type { WagesDetailData } from '@/app/finances/monthly-report/types'
import { cleanEmployeeName } from './payroll-grid'
import {
  budgetRosterFromLayout,
  rosterEmployeeBudgets,
  type RosterEmployeeBudget,
  type RosterEmployeeRecord,
  type RosterUnpaidBudget,
} from './wages-roster-budget'

type Client = any

export interface WagesDetailLoadInput {
  business_id: string
  report_month: string
  fiscal_year: number
  wages_account_names: string[]
  budget_forecast_id?: string
  /** Who asked — recorded on the not-owned-forecast warning only. */
  actor_id?: string | null
  /**
   * The pack layout being rendered, whose Payroll Report roster sets the
   * per-employee budgets. The page sends the layout it holds — just saved, or a
   * default template's applied on load and never saved — and the harness the
   * one it renders, so the Wages Analysis page reads the roster the Payroll
   * Report page prints. Null: no layout, so no roster. Absent (undefined): the
   * business's stored monthly_report_settings.pdf_layout.
   */
  pdf_layout?: unknown
}

/** One employee's payslips for the month, however they were obtained. */
export interface EmployeePayData {
  name: string
  employeeId: string
  jobTitle?: string
  calendarType: string
  annualSalary?: number
  /** calendarType is the run's own, where the payslip carried one; otherwise the employee's. */
  payslips: { date: string; periodStart: string; periodEnd: string; gross: number; tax: number; superAmt: number; net: number; calendarType?: string | null }[]
}

export interface LivePayrollResult {
  payrollAvailable: boolean
  employees: EmployeePayData[]
  payRunDates: string[]
}

/** The live Xero payroll pull, for a business with nothing stored. */
export type LivePayrollFetcher = (connection: any) => Promise<LivePayrollResult>

/**
 * not_needed          — payslips were stored (or the business has pay-run history)
 * used                — nothing stored; the injected live pull ran
 * skipped_no_fetcher  — nothing stored and no live pull was supplied; the
 *                       employee rows are therefore missing from this build
 */
export type WagesLiveFallback = 'not_needed' | 'used' | 'skipped_no_fetcher'

export interface WagesDetailLoadResult {
  data: WagesDetailData
  live_fallback: WagesLiveFallback
}

export const WAGES_FREQUENCY_LABELS: Record<string, string> = {
  WEEKLY: 'Weekly',
  FORTNIGHTLY: 'Fortnightly',
  FOURWEEKLY: '4-Weekly',
  MONTHLY: 'Monthly',
  TWICEMONTHLY: 'Twice Monthly',
  QUARTERLY: 'Quarterly',
}
const FREQUENCY_LABELS = WAGES_FREQUENCY_LABELS

function estimatePayRunsInMonth(frequency: string): number {
  switch (frequency) {
    case 'WEEKLY': return 4
    case 'FORTNIGHTLY': return 2
    case 'FOURWEEKLY': return 1
    case 'MONTHLY': return 1
    case 'TWICEMONTHLY': return 2
    case 'QUARTERLY': return 0
    default: return 2 // default fortnightly
  }
}

export async function loadWagesDetail(
  supabase: Client,
  input: WagesDetailLoadInput,
  options: { fetchLivePayroll?: LivePayrollFetcher } = {},
): Promise<WagesDetailLoadResult> {
  const { business_id, report_month, fiscal_year, wages_account_names, budget_forecast_id } = input

  // Return empty data if no wages accounts configured
  if (!wages_account_names || wages_account_names.length === 0) {
    return {
      live_fallback: 'not_needed',
      data: {
        accounts: [],
        employees: [],
        employee_totals: { actual: 0, budget: 0, variance: 0 },
        grand_total: { actual: 0, budget: 0, variance: 0 },
        payroll_available: false,
        pay_run_dates: [],
      },
    }
  }

  // ===== 1. Resolve dual business IDs and forecast ID =====
  const ids = await resolveBusinessProfileIds(supabase, business_id)

  // Which yardstick this client is held to. Read POSITIVELY and off the same
  // row the statement pages read: nineteen businesses have no settings row at
  // all, so this arrives undefined rather than 'forecast', and a `!==
  // 'forecast'` test would switch every one of them onto the budget store.
  const { data: reportSettings } = await supabase
    .from('monthly_report_settings')
    .select('budget_source, pdf_layout')
    .eq('business_id', business_id)
    .maybeSingle()
  const budgetSource: 'forecast' | 'budget_version' =
    reportSettings?.budget_source === 'budget_version' ? 'budget_version' : 'forecast'

  // The pin arrives in the REQUEST BODY, and everything below runs on the
  // service-role client, which bypasses RLS. Without this check a caller with
  // access to one business could name another tenant's forecast and read its
  // budget and its named salaries. Validated against ids.all because
  // financial_forecasts.business_id is business_profiles-space.
  let forecastId: string | undefined
  if (budget_forecast_id) {
    const owned = await forecastBelongsToBusiness(supabase, budget_forecast_id, ids.all)
    if (owned) {
      forecastId = budget_forecast_id
    } else {
      // Ignore it and fall through to this business's own active forecast:
      // the caller gets their own data rather than an error, and the attempt
      // is recorded.
      Sentry.captureMessage('[WagesDetail] budget_forecast_id does not belong to this business — ignoring', {
        level: 'warning' as any,
        tags: { invariant: 'forecast-id-not-owned', route: 'monthly-report/wages-detail' },
        extra: { business_id, user_id: input.actor_id ?? null, requestedForecastId: budget_forecast_id },
      } as any)
    }
  }

  // ===== 1b. The BUDGET, through the resolver every other page uses =====
  //
  // This page used to read forecast_pl_lines unconditionally. For a client on
  // the budget store that put the FORECAST under the word "Budget" on a page
  // bound into a pack whose statement pages head "Approved Budget" over a
  // different number for the same account — Urban Road's August 2026
  // 'Employ - Wages & Salaries' is $52,519 approved and $76,182 in the
  // forecast. And for the five clients with no effective forecast the column
  // was $0 throughout, which the page reported as a 100% favourable variance
  // on wages.
  //
  // Same resolver, same inputs (business, FY, month) as generate/route.ts, so
  // the two pages of one pack cannot resolve different budgets. Only the
  // report month is asked for: this page reads no other window.
  const resolvedBudget = await resolveBudget(supabase, {
    businessId: business_id,
    profileId: ids.profileId,
    fiscalYear: fiscal_year,
    reportMonth: report_month,
    months: [report_month],
    budgetSource,
    pin: { budgetForecastId: forecastId ?? null },
  })

  // The per-EMPLOYEE plan is a different object: only a forecast has one, and
  // the approved budget is not split by employee. It follows the resolver's
  // forecast when there is one, and is honestly absent when there is not —
  // rather than silently borrowing the pin's forecast behind an approved
  // budget's back.
  const employeePlanForecastId: string | null = resolvedBudget.forecastId

  // ===== 2. Fetch DB data in parallel =====
  const [plResult, payrollFlagResult, mappingsResult, forecastEmpResult, forecastSettingsResult, connectionsResult] = await Promise.all([
    // Actuals from xero_pl_lines (search both ID formats)
    supabase
      .from('xero_pl_lines_wide_compat')
      .select('tenant_id, account_name, monthly_values')
      .in('business_id', ids.all),
    // is_from_payroll, for the resolved budget's lines. The resolver does not
    // carry the flag (budget_versions has no such notion), and the fourth
    // matching tier below reads it — so it is fetched alongside and joined by
    // line id, which keeps a forecast client's page byte-identical.
    employeePlanForecastId
      ? supabase
          .from('forecast_pl_lines')
          .select('id, is_from_payroll')
          .eq('forecast_id', employeePlanForecastId)
      : Promise.resolve({ data: [] }),
    // Account mappings bridge
    supabase
      .from('account_mappings')
      .select('xero_account_name, forecast_pl_line_name')
      .eq('business_id', business_id),
    // Forecast employees (budget) — include pay_per_period, monthly_cost, start_date
    employeePlanForecastId
      ? supabase
          .from('forecast_employees')
          .select('employee_name, position, category, annual_salary, super_rate, pay_per_period, monthly_cost, start_date, is_active')
          .eq('forecast_id', employeePlanForecastId)
          .eq('is_active', true)
          .order('annual_salary', { ascending: false })
      : Promise.resolve({ data: [] }),
    // Forecast payroll frequency
    employeePlanForecastId
      ? supabase
          .from('financial_forecasts')
          .select('payroll_frequency')
          .eq('id', employeePlanForecastId)
          .single()
      : Promise.resolve({ data: null }),
    // Which org each mirror row belongs to, and in what currency (F5).
    supabase
      .from('xero_connections')
      .select('tenant_id, functional_currency')
      .in('business_id', ids.all),
  ])

  const plLines = (plResult.data || []) as {
    tenant_id?: string | null
    account_name: string
    monthly_values: Record<string, number> | null
  }[]
  const wagesConnections = (connectionsResult?.data || []) as { tenant_id: string; functional_currency: string | null }[]
  const payrollLineIds = new Set(
    ((payrollFlagResult.data || []) as { id: string; is_from_payroll: boolean | null }[])
      .filter((r) => r.is_from_payroll)
      .map((r) => r.id),
  )
  const budgetLines = resolvedBudget.lines.map((line) => ({
    account_name: line.account_name,
    category: line.category,
    forecast_months: line.forecast_months,
    is_from_payroll: payrollLineIds.has(line.id),
  }))
  const budgetAvailable = resolvedBudget.source !== 'none'
  const mappings = mappingsResult.data || []
  const allForecastEmployees = (forecastEmpResult.data || []) as {
    employee_name: string; position: string; category: string
    annual_salary: number; super_rate: number; pay_per_period: number | null
    monthly_cost: number | null; start_date: string | null; is_active: boolean
  }[]
  const forecastFrequency = ((forecastSettingsResult.data as any)?.payroll_frequency || 'fortnightly').toUpperCase()

  // Filter out employees who haven't started yet (start_date > end of report month)
  const reportMonthEnd = `${report_month}-31` // Safe: any date comparison works since months max at 31
  const forecastEmployees = allForecastEmployees.filter(e => {
    if (!e.start_date) return true // No start date = already active
    return e.start_date <= reportMonthEnd
  })

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[WagesDetail] forecastId=${forecastId}, forecastFrequency=${forecastFrequency}`)
  }
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[WagesDetail] ${forecastEmployees.length} forecast employees (${allForecastEmployees.length} total, ${allForecastEmployees.length - forecastEmployees.length} filtered out as future hires):`, forecastEmployees.map(e => ({
      name: e.employee_name,
      annual_salary: e.annual_salary,
      monthly_cost: e.monthly_cost,
      pay_per_period: e.pay_per_period,
      start_date: e.start_date,
    })))
  }

  // ===== 3. Build lookups for P&L matching =====
  //
  // F5 (22 Sep 2026 diagnostic): the mirror holds ONE ROW PER ORG per account,
  // and the lookup returns a single line — so a multi-org business showed one
  // org's wages and called it the total. Dragon Roofing's $40,000 and $25,000
  // read as $40,000 (or $25,000, whichever row came first). Rows for the same
  // account name are summed.
  //
  // Only orgs in the report's currency are summed: adding another currency's
  // wages one-for-one would be the F1 bug in a different place. A foreign org's
  // rows are left out and reported rather than silently mixed in.
  const foreignTenants = new Set(
    (wagesConnections ?? [])
      .filter((c) => {
        const currency = (c.functional_currency ?? '').toString().trim().toUpperCase()
        return currency !== '' && currency !== PRESENTATION_CURRENCY
      })
      .map((c) => c.tenant_id as string),
  )
  const excludedForeignRows: string[] = []
  const summedByName = new Map<string, { account_name: string; monthly_values: Record<string, number> }>()
  for (const line of plLines) {
    const tenantId = (line as { tenant_id?: string | null }).tenant_id ?? ''
    if (foreignTenants.has(tenantId)) {
      excludedForeignRows.push(`${line.account_name} (${tenantId})`)
      continue
    }
    const key = (line.account_name ?? '').trim().toLowerCase()
    const existing = summedByName.get(key)
    if (!existing) {
      summedByName.set(key, {
        account_name: line.account_name,
        monthly_values: { ...(line.monthly_values ?? {}) },
      })
      continue
    }
    for (const [month, value] of Object.entries(line.monthly_values ?? {})) {
      existing.monthly_values[month] = (existing.monthly_values[month] ?? 0) + (value ?? 0)
    }
  }
  if (excludedForeignRows.length > 0) {
    Sentry.captureMessage('[WagesDetail] wages rows in another currency were left out of the totals', {
      level: 'warning' as any,
      tags: { invariant: 'wages_detail_foreign_org_excluded', route: 'monthly-report/wages-detail' },
      extra: { business_id, report_month, rows: excludedForeignRows.slice(0, 20) },
    } as any)
  }

  const actualLookup = buildFuzzyLookup([...summedByName.values()], (item) => item.account_name)

  const xeroToForecast = new Map<string, string>()
  const forecastToXero = new Map<string, string>()
  for (const m of mappings) {
    if (m.xero_account_name && m.forecast_pl_line_name) {
      xeroToForecast.set(m.xero_account_name.toLowerCase(), m.forecast_pl_line_name)
      forecastToXero.set(m.forecast_pl_line_name.toLowerCase(), m.xero_account_name)
    }
  }

  // The four matching tiers, unchanged and now in one testable place. Fed the
  // resolved budget, so which object they search — the approved budget or the
  // forecast — is settled once, upstream, for the whole page.
  const resolveWagesBudget = buildWagesBudgetResolver(budgetLines, xeroToForecast)

  // ===== 4. Account-level breakdown (P&L totals) =====
  let grandActual = 0
  let grandBudget = 0

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[WagesDetail] wages_account_names from settings:`, wages_account_names)
  }
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[WagesDetail] xero_pl_lines accounts:`, plLines.map(l => l.account_name))
  }
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[WagesDetail] report_month: ${report_month}`)
  }

  const accounts = wages_account_names.map(name => {
    let actualLine = actualLookup(name)
    if (!actualLine) {
      const mappedXeroName = forecastToXero.get(name.toLowerCase())
      if (mappedXeroName) actualLine = actualLookup(mappedXeroName)
    }
    const actual = actualLine?.monthly_values ? Math.abs(actualLine.monthly_values[report_month] || 0) : 0
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[WagesDetail] Account "${name}": actualLine=${actualLine ? 'found' : 'NOT FOUND'}, actual=${actual}, monthKeys=${actualLine?.monthly_values ? Object.keys(actualLine.monthly_values).slice(0,3).join(',') : 'none'}`)
    }

    const budget = resolveWagesBudget(name, report_month)
    grandActual += actual
    grandBudget += budget
    const variance = budget - actual
    const variance_percent = budget !== 0 ? (variance / budget) * 100 : 0

    return {
      account_name: name,
      actual: Math.round(actual * 100) / 100,
      budget: Math.round(budget * 100) / 100,
      variance: Math.round(variance * 100) / 100,
      variance_percent: Math.round(variance_percent * 10) / 10,
    }
  })

  // ===== 5. Employee-level detail from PayRuns =====
  const employeePayMap = new Map<string, EmployeePayData>()
  let payrollAvailable = false
  const payRunDatesSet = new Set<string>()

  // WB.2 — stored-first. The payroll sync writes xero_payslip_lines on the
  // 6-hourly cycle; reading them here replaces a live N+1 fetch chain
  // (unpaged run list + one detail call per run + one Employees/{id} per
  // matched employee) that ran on EVERY page view against a 60-req/min
  // tenant cap. Two functional wins over the live path:
  //   - multi-org businesses get ALL tenants' payslips (the live path took
  //     `.limit(1)` on connections, silently dropping Dragon's and IICT's
  //     other orgs);
  //   - jobTitle/annualSalary per-employee detail calls are gone (annualSalary
  //     was assigned and never read; position falls back to the forecast row).
  // The live path below survives ONLY as a fallback for a business whose
  // backfill hasn't run yet; it disappears once fleet backfill converges.
  const [monthYear, monthNum] = report_month.split('-').map(Number)
  const monthStart = `${report_month}-01`
  const monthEnd = `${monthYear}-${String(monthNum).padStart(2, '0')}-${String(new Date(monthYear, monthNum, 0).getDate()).padStart(2, '0')}`

  const { data: storedSlips, error: storedErr } = await supabase
    .from('xero_payslip_lines')
    .select('employee_id, employee_name, payment_date, period_start, period_end, calendar_type, wages, tax, super_amount, net_pay')
    .in('business_id', ids.all)
    .gte('payment_date', monthStart)
    .lte('payment_date', monthEnd)

  if (storedErr) {
    Sentry.captureException(storedErr, { tags: { route: 'monthly-report/wages-detail', invariant: 'payroll-stored-read' }, extra: { business_id, report_month } } as any)
  }

  if (storedSlips && storedSlips.length > 0) {
    payrollAvailable = true
    for (const slip of storedSlips) {
      payRunDatesSet.add(slip.payment_date)
      let entry = employeePayMap.get(slip.employee_id)
      if (!entry) {
        entry = {
          name: slip.employee_name,
          employeeId: slip.employee_id,
          jobTitle: undefined,
          calendarType: slip.calendar_type || 'UNKNOWN',
          payslips: [],
        }
        employeePayMap.set(slip.employee_id, entry)
      }
      entry.payslips.push({
        date: slip.payment_date,
        periodStart: slip.period_start ?? '',
        periodEnd: slip.period_end ?? '',
        gross: Number(slip.wages ?? 0),
        tax: Number(slip.tax ?? 0),
        superAmt: Number(slip.super_amount ?? 0),
        net: Number(slip.net_pay ?? 0),
        calendarType: slip.calendar_type ?? null,
      })
    }
  }

  let liveFallback: WagesLiveFallback = 'not_needed'
  try {
    // Fallback: nothing stored for this month AND nothing stored for the
    // business at all → backfill hasn't reached it; use the live path. A
    // business WITH stored history but zero slips this month is a real
    // "no pay runs this month", not a reason to hammer the API.
    let useLiveFallback = false
    if (!payrollAvailable) {
      const { count } = await supabase
        .from('xero_pay_runs')
        .select('id', { count: 'exact', head: true })
        .in('business_id', ids.all)
      useLiveFallback = (count ?? 0) === 0
      payrollAvailable = !useLiveFallback ? true : payrollAvailable
    }

    const { data: connection } = useLiveFallback
      ? await supabase
          .from('xero_connections')
          .select('*')
          .in('business_id', ids.all)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle()
      : { data: null as any }

    if (connection) {
      // The live Xero pull belongs to the caller. The route passes one; a
      // read-only caller (scripts/preview-pack.ts) passes none, and the page
      // is then built from what is stored — and says so.
      if (!options.fetchLivePayroll) {
        liveFallback = 'skipped_no_fetcher'
      } else {
        const live = await options.fetchLivePayroll(connection)
        liveFallback = 'used'
        if (live.payrollAvailable) payrollAvailable = true
        for (const d of live.payRunDates) payRunDatesSet.add(d)
        for (const e of live.employees) employeePayMap.set(e.employeeId, e)
      }
    }
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[WagesDetail] Could not fetch Xero payroll data:', err)
    }
  }

  // ===== 5b. Per-employee budgets from the Payroll Report roster =====
  //
  // Only where no forecast employee plan applies — a forecast client's page
  // is exactly what it was — and only where a roster gives someone a weekly
  // salary, so a client without one reads nothing more than before.
  let rosterBudgets: Map<string, RosterEmployeeBudget> | null = null
  let rosterUnpaid: { budgets: RosterUnpaidBudget[]; payCycle: string | null } = { budgets: [], payCycle: null }
  let employeeRoster: WagesDetailData['employee_roster']
  const budgetRoster = forecastEmployees.length === 0
    ? budgetRosterFromLayout(input.pdf_layout !== undefined ? input.pdf_layout : reportSettings?.pdf_layout)
    : null
  if (budgetRoster) {
    const paid = Array.from(employeePayMap.values())
    const { data: employeeRows, error: employeeErr } = await supabase
      .from('xero_employees')
      .select('employee_id, first_name, last_name, start_date, termination_date')
      .in('business_id', ids.all)
    if (employeeErr) {
      // Without start dates a mid-month starter would be budgeted for the
      // whole month. Could-not-check, said on the page, not a guess.
      Sentry.captureException(employeeErr, { tags: { route: 'monthly-report/wages-detail', invariant: 'wages-roster-start-dates-read' }, extra: { business_id, report_month } } as any)
      employeeRoster = { status: 'unavailable', reason: 'start_dates_unreadable' }
    } else {
      const records: RosterEmployeeRecord[] = ((employeeRows || []) as {
        employee_id: string; first_name: string | null; last_name: string | null; start_date: string | null; termination_date: string | null
      }[]).map((r) => ({
        employee_id: r.employee_id,
        name: `${r.first_name ?? ''} ${r.last_name ?? ''}`,
        start_date: r.start_date,
        termination_date: r.termination_date,
      }))
      const recordOf = new Map(records.map((r) => [r.employee_id, r]))
      const result = rosterEmployeeBudgets({
        roster: budgetRoster,
        payslips: paid.flatMap((e) => e.payslips.map((ps) => ({
          payment_date: ps.date,
          calendar_type: ps.calendarType !== undefined ? ps.calendarType : e.calendarType,
          period_start: ps.periodStart || null,
          period_end: ps.periodEnd || null,
        }))),
        employees: paid.map((e) => ({
          employee_id: e.employeeId,
          name: e.name,
          start_date: recordOf.get(e.employeeId)?.start_date ?? null,
          termination_date: recordOf.get(e.employeeId)?.termination_date ?? null,
        })),
        records,
      })
      if (result.ok) {
        rosterBudgets = new Map(paid.map((e, i) => [e.employeeId, result.employees[i]]))
        rosterUnpaid = { budgets: result.unpaid, payCycle: result.pay_cycle }
        employeeRoster = { status: 'applied', missing: [], unchecked: result.unchecked }
      } else {
        employeeRoster = { status: 'unavailable', reason: result.reason }
      }
    }
  }

  // ===== 6. Build employee result rows =====
  const employees: any[] = []
  const matchedForecastKeys = new Set<string>()
  let empActualTotal = 0
  let empBudgetTotal = 0

  // Re-fetch connection tenant_id for Sentry tagging on fuzzy matches.
  // (Connection was fetched inside the try block above; pull it again for
  // metadata only — if it's missing, Sentry tags fall back to undefined.)
  let sentryTenantId: string | undefined
  try {
    const { data: connRow } = await supabase
      .from('xero_connections')
      .select('tenant_id')
      .in('business_id', ids.all)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
    sentryTenantId = connRow?.tenant_id || undefined
  } catch {
    // non-fatal — tag will just be undefined
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[WagesDetail] employeePayMap has ${employeePayMap.size} Xero employees:`, Array.from(employeePayMap.values()).map(e => ({
      name: e.name, calendarType: e.calendarType, payslipCount: e.payslips.length,
      totalGross: e.payslips.reduce((s, p) => s + p.gross, 0),
    })))
  }

  // Build candidate list once per request (haystack of forecast employee names).
  const forecastNameList = forecastEmployees.map(fe => fe.employee_name)

  // Process Xero payroll employees
  for (const [, xeData] of employeePayMap) {
    const totalActual = xeData.payslips.reduce((sum, ps) => sum + ps.gross, 0)
    const calType = xeData.calendarType
    const frequencyLabel = FREQUENCY_LABELS[calType] || calType

    // Match Xero name → forecast employee via layered matcher
    // (exact → token_sort → fuzzy fallback). See _helpers.ts.
    const matchResult = matchEmployeeName(xeData.name, forecastNameList)
    const forecastMatch = matchResult.matched
      ? forecastEmployees.find(fe => fe.employee_name === matchResult.matched) || null
      : null

    // B1 invariant: when the layered matcher had to fall back to fuzzy
    // (Levenshtein), capture to Sentry so we can observe real-world
    // divergence patterns between Xero payroll names and forecast names.
    if (forecastMatch && matchResult.via === 'fuzzy') {
      try {
        Sentry.captureMessage('Xero payroll name fuzzy match', {
          level: 'warning',
          tags: {
            invariant: 'xero_payroll_name_fuzzy_match',
            business_id: business_id,
            tenant_id: sentryTenantId,
          },
          extra: {
            xero_name: xeData.name,
            forecast_name: matchResult.matched,
            distance: matchResult.distance,
            report_month,
            fiscal_year,
          },
        } as any)
      } catch (sentryErr) {
        // Sentry failure must never abort the request
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[wages-detail] Sentry capture failed', sentryErr)
        }
      }
    }

    let budgetTotal = 0
    let category = forecastMatch?.category || 'Wages Admin'
    // A roster that gives this person no weekly salary: no budget, which is
    // not a budget of $0 and not a variance of their whole pay.
    let budgetMissing = false

    if (forecastMatch) {
      matchedForecastKeys.add(tokenSortKey(forecastMatch.employee_name))
      category = forecastMatch.category

      // Budget priority:
      // 1. monthly_cost from forecast (most accurate — what the user set)
      // 2. annual_salary / 12 (monthly equivalent)
      if (forecastMatch.monthly_cost && Number(forecastMatch.monthly_cost) > 0) {
        budgetTotal = Number(forecastMatch.monthly_cost)
      } else if (forecastMatch.annual_salary && Number(forecastMatch.annual_salary) > 0) {
        budgetTotal = Number(forecastMatch.annual_salary) / 12
      }
    } else if (rosterBudgets) {
      // Reached only with no forecast employees at all (5b), so a roster never
      // sits beside a forecast match.
      const rostered = rosterBudgets.get(xeData.employeeId)
      if (rostered?.budget != null) budgetTotal = rostered.budget
      else budgetMissing = true
    }

    const variance = budgetMissing ? 0 : budgetTotal - totalActual
    const variancePct = budgetTotal !== 0 ? (variance / budgetTotal) * 100 : 0

    empActualTotal += totalActual
    empBudgetTotal += budgetTotal

    employees.push({
      name: xeData.name,
      position: xeData.jobTitle || forecastMatch?.position || '',
      category,
      pay_frequency: frequencyLabel,
      budget_per_period: Math.round(budgetTotal * 100) / 100,
      actual_total: Math.round(totalActual * 100) / 100,
      budget_total: Math.round(budgetTotal * 100) / 100,
      pay_runs: xeData.payslips.map(ps => ({
        date: ps.date,
        period_start: ps.periodStart,
        period_end: ps.periodEnd,
        gross_earnings: Math.round(ps.gross * 100) / 100,
        tax: Math.round(ps.tax * 100) / 100,
        super_amount: Math.round(ps.superAmt * 100) / 100,
        net_pay: Math.round(ps.net * 100) / 100,
      })),
      variance: Math.round(variance * 100) / 100,
      variance_percent: Math.round(variancePct * 10) / 10,
      source: forecastMatch ? 'both' : 'xero',
      ...(budgetMissing ? { budget_missing: true } : {}),
    })
  }

  // Rostered with a weekly salary but paid nothing this month: they keep their
  // budget and a row, as a forecast's budgeted-not-paid employee does below —
  // a missing person is a real variance, and the Budget total is the roster's.
  // A leaver has no weeks in the month and no row (wages-roster-budget).
  for (const r of rosterUnpaid.budgets) {
    const cycle = rosterUnpaid.payCycle ?? ''
    empBudgetTotal += r.budget
    employees.push({
      name: r.name,
      position: '',
      category: 'Wages Admin',
      pay_frequency: FREQUENCY_LABELS[cycle] || cycle,
      budget_per_period: r.budget,
      actual_total: 0,
      budget_total: r.budget,
      pay_runs: [],
      variance: r.budget,
      variance_percent: 100,
      source: 'roster' as const,
    })
  }

  // Add forecast-only employees (not in Xero payroll)
  for (const fe of forecastEmployees) {
    if (matchedForecastKeys.has(tokenSortKey(fe.employee_name))) continue

    const frequencyLabel = FREQUENCY_LABELS[forecastFrequency] || forecastFrequency

    // Monthly budget: monthly_cost if set, else annual_salary / 12
    let budgetTotal = 0
    if (fe.monthly_cost && Number(fe.monthly_cost) > 0) {
      budgetTotal = Number(fe.monthly_cost)
    } else if (fe.annual_salary) {
      budgetTotal = fe.annual_salary / 12
    }

    empBudgetTotal += budgetTotal

    employees.push({
      name: fe.employee_name,
      position: fe.position || '',
      category: fe.category || 'Wages Admin',
      pay_frequency: frequencyLabel,
      budget_per_period: Math.round(budgetTotal * 100) / 100,
      actual_total: 0,
      budget_total: Math.round(budgetTotal * 100) / 100,
      pay_runs: [],
      variance: Math.round(budgetTotal * 100) / 100,
      variance_percent: 100,
      source: 'forecast' as const,
    })
  }

  // Sort: highest actual first
  employees.sort((a, b) => b.actual_total - a.actual_total || b.budget_total - a.budget_total)

  const payRunDates = Array.from(payRunDatesSet).sort()
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[WagesDetail] ${employeePayMap.size} Xero employees, ${forecastEmployees.length} forecast employees, ${employees.length} combined, ${payRunDates.length} pay runs`)
  }

  // WB.5 — PAY-TIES inputs, captured BEFORE the backfill below makes the
  // comparison circular (accounts[0].actual would just echo the payroll
  // total). Warning-only: payment-date pay runs vs period-end accruals can
  // legitimately disagree; the banner names the delta, it never blocks.
  const payrollSuperTotal = Array.from(employeePayMap.values()).reduce(
    (s, e) => s + e.payslips.reduce((x, ps) => x + ps.superAmt, 0),
    0,
  )
  const ties = computePayrollTies({
    payrollGross: empActualTotal,
    payrollSuper: payrollSuperTotal,
    accountsActual: grandActual,
    wagesAccountNames: wages_account_names,
  })

  // WB.4 — five-Friday detection: an extra weekly run inflates the month
  // ~25% against a 4-week budget; without the note it reads as an overspend.
  const phasing = computePayrollPhasing({
    payRunDates,
    calendarTypes: Array.from(employeePayMap.values())
      .filter((e) => e.payslips.length > 0)
      .map((e) => e.calendarType),
    typicalRunsFor: estimatePayRunsInMonth,
  })

  // If account-level P&L has no actuals but we have PayRun employee data,
  // use employee totals as the grand total (Xero Payroll doesn't always
  // create P&L line items that appear in the standard P&L report)
  const finalActual = grandActual > 0 ? grandActual : empActualTotal
  // The roster is a per-employee yardstick. The account table's budget stays
  // the resolver's, so a roster never stands in for an account budget of 0.
  const finalBudget = grandBudget > 0 ? grandBudget : rosterBudgets ? 0 : empBudgetTotal

  if (employeeRoster?.status === 'applied') {
    employeeRoster.missing = employees.filter((e) => e.budget_missing).map((e) => cleanEmployeeName(e.name))
  }

  // Also backfill account-level actuals from employee PayRun totals
  // when no P&L line exists for the wages accounts
  if (grandActual === 0 && empActualTotal > 0 && accounts.length > 0) {
    // Distribute employee actuals across the configured wages accounts proportionally
    // (or put it all on the first account if only one)
    accounts[0].actual = Math.round(empActualTotal * 100) / 100
    accounts[0].variance = Math.round((accounts[0].budget - empActualTotal) * 100) / 100
    accounts[0].variance_percent = accounts[0].budget !== 0
      ? Math.round(((accounts[0].budget - empActualTotal) / accounts[0].budget) * 1000) / 10
      : 0
  }

  return {
    live_fallback: liveFallback,
    data: {
      accounts,
      // What the account-level Budget column IS, carried back rather than
      // re-derived by each surface. 'none' is the honest empty: the tab and
      // the pack dash every budget-derived cell and say why, instead of
      // printing $0 and a 100%-favourable variance on wages.
      budget_provenance: {
        source: resolvedBudget.source,
        label: resolvedBudget.label,
        reason: resolvedBudget.noBudgetReason,
        fiscal_year,
      },
      // The per-employee plan is a forecast's, or else the Payroll Report
      // roster's weekly salaries. False means there is no plan for this month
      // — not that the team is budgeted at nothing.
      employee_plan_available: forecastEmployees.length > 0 || employeeRoster?.status === 'applied',
      ...(employeeRoster ? { employee_roster: employeeRoster } : {}),
      employees,
      employee_totals: {
        actual: Math.round(empActualTotal * 100) / 100,
        budget: Math.round(empBudgetTotal * 100) / 100,
        variance: Math.round((empBudgetTotal - empActualTotal) * 100) / 100,
      },
      grand_total: {
        actual: Math.round(finalActual * 100) / 100,
        budget: Math.round(finalBudget * 100) / 100,
        variance: Math.round((finalBudget - finalActual) * 100) / 100,
      },
      payroll_available: payrollAvailable,
      pay_run_dates: payRunDates,
      phasing,
      ties,
    },
  }
}
