import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildFuzzyLookup, isAccountMatch } from '@/lib/utils/account-matching'
import { getValidAccessToken } from '@/lib/xero/token-manager'
import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// Normalize employee name for matching
function normEmployeeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim()
}

// Parse Xero .NET date format: "/Date(1609459200000+0000)/"
function parseXeroDate(dateStr: string): Date | null {
  if (!dateStr) return null
  const match = dateStr.match(/\/Date\((\d+)([+-]\d+)?\)\//)
  if (match) return new Date(parseInt(match[1]))
  // Fallback to ISO
  const d = new Date(dateStr)
  return isNaN(d.getTime()) ? null : d
}

// Pay periods per year by calendar type
const PAY_PERIODS: Record<string, number> = {
  WEEKLY: 52,
  FORTNIGHTLY: 26,
  FOURWEEKLY: 13,
  MONTHLY: 12,
  TWICEMONTHLY: 24,
  QUARTERLY: 4,
}

const FREQUENCY_LABELS: Record<string, string> = {
  WEEKLY: 'Weekly',
  FORTNIGHTLY: 'Fortnightly',
  FOURWEEKLY: '4-Weekly',
  MONTHLY: 'Monthly',
  TWICEMONTHLY: 'Twice Monthly',
  QUARTERLY: 'Quarterly',
}

/**
 * POST /api/monthly-report/wages-detail
 * Returns Calxa-style wages breakdown:
 * - Account-level totals (actual vs budget from P&L lines)
 * - Employee-level detail from Xero PayRuns with budget comparison
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { business_id, report_month, fiscal_year, wages_account_names, budget_forecast_id } = body as {
      business_id: string
      report_month: string
      fiscal_year: number
      wages_account_names: string[]
      budget_forecast_id?: string
    }

    if (!business_id || !report_month || !fiscal_year) {
      return NextResponse.json(
        { error: 'business_id, report_month, and fiscal_year are required' },
        { status: 400 }
      )
    }

    // Return empty data if no wages accounts configured
    if (!wages_account_names || wages_account_names.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          accounts: [],
          employees: [],
          employee_totals: { actual: 0, budget: 0, variance: 0 },
          grand_total: { actual: 0, budget: 0, variance: 0 },
          payroll_available: false,
          pay_run_dates: [],
        },
      })
    }

    // ===== 1. Resolve forecast ID =====
    let forecastId = budget_forecast_id
    if (!forecastId) {
      // Resolve business_profiles.id from businesses.id
      const idsToTry = await resolveBusinessIds(supabase, business_id)
      for (const id of idsToTry) {
        const { data: forecast } = await supabase
          .from('financial_forecasts')
          .select('id')
          .eq('business_id', id)
          .eq('fiscal_year', fiscal_year)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (forecast) { forecastId = forecast.id; break }
      }
    }

    // ===== 2. Fetch DB data in parallel =====
    const [plResult, budgetResult, mappingsResult, forecastEmpResult, forecastSettingsResult] = await Promise.all([
      // Actuals from xero_pl_lines
      supabase
        .from('xero_pl_lines')
        .select('account_name, monthly_values')
        .eq('business_id', business_id),
      // Budget from forecast_pl_lines
      forecastId
        ? supabase
            .from('forecast_pl_lines')
            .select('account_name, category, forecast_months, is_from_payroll')
            .eq('forecast_id', forecastId)
        : Promise.resolve({ data: [] }),
      // Account mappings bridge
      supabase
        .from('account_mappings')
        .select('xero_account_name, forecast_pl_line_name')
        .eq('business_id', business_id),
      // Forecast employees (budget) — include pay_per_period, monthly_cost, start_date
      forecastId
        ? supabase
            .from('forecast_employees')
            .select('employee_name, position, category, annual_salary, super_rate, pay_per_period, monthly_cost, start_date, is_active')
            .eq('forecast_id', forecastId)
            .eq('is_active', true)
            .order('annual_salary', { ascending: false })
        : Promise.resolve({ data: [] }),
      // Forecast payroll frequency
      forecastId
        ? supabase
            .from('financial_forecasts')
            .select('payroll_frequency')
            .eq('id', forecastId)
            .single()
        : Promise.resolve({ data: null }),
    ])

    const plLines = plResult.data || []
    const budgetLines = (budgetResult.data || []) as { account_name: string; category: string; forecast_months: Record<string, number>; is_from_payroll: boolean }[]
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

    console.log(`[WagesDetail] forecastId=${forecastId}, forecastFrequency=${forecastFrequency}`)
    console.log(`[WagesDetail] ${forecastEmployees.length} forecast employees (${allForecastEmployees.length} total, ${allForecastEmployees.length - forecastEmployees.length} filtered out as future hires):`, forecastEmployees.map(e => ({
      name: e.employee_name,
      annual_salary: e.annual_salary,
      monthly_cost: e.monthly_cost,
      pay_per_period: e.pay_per_period,
      start_date: e.start_date,
    })))

    // ===== 3. Build lookups for P&L matching =====
    const actualLookup = buildFuzzyLookup(plLines, (item) => item.account_name)
    const budgetLookup = buildFuzzyLookup(budgetLines, (item) => item.account_name)

    const xeroToForecast = new Map<string, string>()
    const forecastToXero = new Map<string, string>()
    for (const m of mappings) {
      if (m.xero_account_name && m.forecast_pl_line_name) {
        xeroToForecast.set(m.xero_account_name.toLowerCase(), m.forecast_pl_line_name)
        forecastToXero.set(m.forecast_pl_line_name.toLowerCase(), m.xero_account_name)
      }
    }

    // ===== 4. Account-level breakdown (P&L totals) =====
    let grandActual = 0
    let grandBudget = 0

    console.log(`[WagesDetail] wages_account_names from settings:`, wages_account_names)
    console.log(`[WagesDetail] xero_pl_lines accounts:`, plLines.map(l => l.account_name))
    console.log(`[WagesDetail] report_month: ${report_month}`)

    const accounts = wages_account_names.map(name => {
      let actualLine = actualLookup(name)
      if (!actualLine) {
        const mappedXeroName = forecastToXero.get(name.toLowerCase())
        if (mappedXeroName) actualLine = actualLookup(mappedXeroName)
      }
      const actual = actualLine?.monthly_values ? Math.abs(actualLine.monthly_values[report_month] || 0) : 0
      console.log(`[WagesDetail] Account "${name}": actualLine=${actualLine ? 'found' : 'NOT FOUND'}, actual=${actual}, monthKeys=${actualLine?.monthly_values ? Object.keys(actualLine.monthly_values).slice(0,3).join(',') : 'none'}`)

      let bestBudgetValue = 0
      const directBudget = budgetLookup(name)
      if (directBudget?.forecast_months) {
        bestBudgetValue = Math.abs(directBudget.forecast_months[report_month] || 0)
      }
      if (bestBudgetValue === 0) {
        for (const bl of budgetLines) {
          if (isAccountMatch(name, bl.account_name)) {
            const val = Math.abs(bl.forecast_months?.[report_month] || 0)
            if (val > bestBudgetValue) bestBudgetValue = val
          }
        }
      }
      if (bestBudgetValue === 0) {
        const mappedForecastName = xeroToForecast.get(name.toLowerCase())
        if (mappedForecastName) {
          const bridgeBudget = budgetLookup(mappedForecastName)
          if (bridgeBudget?.forecast_months) {
            bestBudgetValue = Math.abs(bridgeBudget.forecast_months[report_month] || 0)
          }
        }
      }
      if (bestBudgetValue === 0) {
        for (const pl of budgetLines.filter(bl => bl.is_from_payroll)) {
          const val = Math.abs(pl.forecast_months?.[report_month] || 0)
          if (val > bestBudgetValue) bestBudgetValue = val
        }
      }

      const budget = bestBudgetValue
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
    interface EmployeePayData {
      name: string
      employeeId: string
      jobTitle?: string
      calendarType: string
      annualSalary?: number
      payslips: { date: string; periodStart: string; periodEnd: string; gross: number; tax: number; superAmt: number; net: number }[]
    }

    const employeePayMap = new Map<string, EmployeePayData>()
    let payrollAvailable = false
    const payRunDatesSet = new Set<string>()

    try {
      const { data: connection } = await supabase
        .from('xero_connections')
        .select('*')
        .eq('business_id', business_id)
        .eq('is_active', true)
        .single()

      if (connection) {
        const tokenResult = await getValidAccessToken(connection, supabase)
        if (tokenResult.success && tokenResult.accessToken) {
          const xeroHeaders = {
            'Authorization': `Bearer ${tokenResult.accessToken}`,
            'xero-tenant-id': connection.tenant_id,
            'Accept': 'application/json',
          }

          // Fetch PayCalendars and PayRuns in parallel
          const [calResp, runsResp] = await Promise.all([
            fetch('https://api.xero.com/payroll.xro/1.0/PayCalendars', { headers: xeroHeaders }),
            fetch('https://api.xero.com/payroll.xro/1.0/PayRuns', { headers: xeroHeaders }),
          ])

          // Build calendar type lookup
          const calendarMap = new Map<string, string>()
          if (calResp.ok) {
            const calData = await calResp.json()
            const calendars = calData?.PayrollCalendars || []
            console.log(`[WagesDetail] PayCalendars: ${calendars.length} found`, calendars.map((c: any) => ({
              id: c.PayrollCalendarID, name: c.Name, type: c.CalendarType
            })))
            for (const cal of calendars) {
              calendarMap.set(cal.PayrollCalendarID, cal.CalendarType || 'UNKNOWN')
            }
          } else {
            console.log(`[WagesDetail] PayCalendars fetch failed: ${calResp.status}`)
          }

          if (runsResp.ok) {
            const runsData = await runsResp.json()
            payrollAvailable = true

            // Filter to POSTED pay runs where PaymentDate falls in report month
            const [reportYear, reportMonthNum] = report_month.split('-').map(Number)
            const monthPayRuns = (runsData?.PayRuns || []).filter((pr: any) => {
              if (pr.PayRunStatus !== 'POSTED') return false
              const payDate = parseXeroDate(pr.PaymentDate)
              if (!payDate) return false
              return payDate.getFullYear() === reportYear && (payDate.getMonth() + 1) === reportMonthNum
            })

            console.log(`[WagesDetail] Found ${monthPayRuns.length} POSTED pay runs in ${report_month} (of ${runsData?.PayRuns?.length || 0} total)`)

            // Fetch detail for each pay run to get payslip amounts
            const payRunDetails = await Promise.all(
              monthPayRuns.map(async (pr: any) => {
                try {
                  const resp = await fetch(
                    `https://api.xero.com/payroll.xro/1.0/PayRuns/${pr.PayRunID}`,
                    { headers: xeroHeaders }
                  )
                  if (resp.ok) {
                    const data = await resp.json()
                    return data?.PayRuns?.[0] || null
                  }
                } catch {
                  // Skip failures
                }
                return null
              })
            )

            // Process payslips from each pay run
            for (const pr of payRunDetails.filter(Boolean)) {
              const calType = calendarMap.get(pr.PayrollCalendarID) || 'UNKNOWN'
              const payDate = parseXeroDate(pr.PaymentDate)
              const periodStart = parseXeroDate(pr.PayRunPeriodStartDate)
              const periodEnd = parseXeroDate(pr.PayRunPeriodEndDate)
              const payDateStr = payDate?.toISOString().slice(0, 10) || ''
              const periodStartStr = periodStart?.toISOString().slice(0, 10) || ''
              const periodEndStr = periodEnd?.toISOString().slice(0, 10) || ''

              if (payDateStr) payRunDatesSet.add(payDateStr)

              for (const ps of pr.Payslips || []) {
                const empId = ps.EmployeeID
                const name = `${ps.FirstName || ''} ${ps.LastName || ''}`.trim()

                if (!employeePayMap.has(empId)) {
                  employeePayMap.set(empId, {
                    name,
                    employeeId: empId,
                    jobTitle: undefined,
                    calendarType: calType,
                    payslips: [],
                  })
                }

                employeePayMap.get(empId)!.payslips.push({
                  date: payDateStr,
                  periodStart: periodStartStr,
                  periodEnd: periodEndStr,
                  gross: ps.Wages || 0,
                  tax: ps.Tax || 0,
                  superAmt: ps.Super || 0,
                  net: ps.NetPay || 0,
                })
              }
            }

            // Fetch employee details (job title + annual salary) for matched employees
            if (employeePayMap.size > 0) {
              const detailPromises = Array.from(employeePayMap.keys()).map(async (empId) => {
                try {
                  const resp = await fetch(
                    `https://api.xero.com/payroll.xro/1.0/Employees/${empId}`,
                    { headers: xeroHeaders }
                  )
                  if (resp.ok) {
                    const data = await resp.json()
                    const ed = data?.Employees?.[0]
                    if (ed) {
                      const entry = employeePayMap.get(empId)!
                      entry.jobTitle = ed.JobTitle || undefined
                      // Extract annual salary from PayTemplate for budget fallback
                      if (ed.PayTemplate?.EarningsLines) {
                        for (const line of ed.PayTemplate.EarningsLines) {
                          if (line.AnnualSalary) {
                            entry.annualSalary = parseFloat(line.AnnualSalary)
                            break
                          }
                        }
                      }
                    }
                  }
                } catch {
                  // Skip
                }
              })
              await Promise.all(detailPromises)
            }
          } else {
            console.log(`[WagesDetail] PayRuns fetch failed: ${runsResp.status} - need to reconnect Xero with payroll.payruns.read scope`)
            // Don't create fake actuals — just mark payroll as unavailable
            // Budget-only data from forecast_employees will still show
          }
        }
      }
    } catch (err) {
      console.log('[WagesDetail] Could not fetch Xero payroll data:', err)
    }

    // ===== 6. Build employee result rows =====
    const employees: any[] = []
    const matchedForecastNames = new Set<string>()
    let empActualTotal = 0
    let empBudgetTotal = 0

    console.log(`[WagesDetail] employeePayMap has ${employeePayMap.size} Xero employees:`, Array.from(employeePayMap.values()).map(e => ({
      name: e.name, calendarType: e.calendarType, payslipCount: e.payslips.length,
      totalGross: e.payslips.reduce((s, p) => s + p.gross, 0),
    })))

    // Process Xero payroll employees
    for (const [, xeData] of employeePayMap) {
      const totalActual = xeData.payslips.reduce((sum, ps) => sum + ps.gross, 0)
      const calType = xeData.calendarType
      const frequencyLabel = FREQUENCY_LABELS[calType] || calType

      // Match to forecast employee
      const forecastMatch = forecastEmployees.find(fe =>
        normEmployeeName(fe.employee_name) === normEmployeeName(xeData.name)
      )

      let budgetTotal = 0
      let category = forecastMatch?.category || 'Wages Admin'

      if (forecastMatch) {
        matchedForecastNames.add(normEmployeeName(forecastMatch.employee_name))
        category = forecastMatch.category

        // Budget priority:
        // 1. monthly_cost from forecast (most accurate — what the user set)
        // 2. annual_salary / 12 (monthly equivalent)
        if (forecastMatch.monthly_cost && Number(forecastMatch.monthly_cost) > 0) {
          budgetTotal = Number(forecastMatch.monthly_cost)
        } else if (forecastMatch.annual_salary && Number(forecastMatch.annual_salary) > 0) {
          budgetTotal = Number(forecastMatch.annual_salary) / 12
        }
      }

      const variance = budgetTotal - totalActual
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
      })
    }

    // Add forecast-only employees (not in Xero payroll)
    for (const fe of forecastEmployees) {
      if (matchedForecastNames.has(normEmployeeName(fe.employee_name))) continue

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
    console.log(`[WagesDetail] ${employeePayMap.size} Xero employees, ${forecastEmployees.length} forecast employees, ${employees.length} combined, ${payRunDates.length} pay runs`)

    // If account-level P&L has no actuals but we have PayRun employee data,
    // use employee totals as the grand total (Xero Payroll doesn't always
    // create P&L line items that appear in the standard P&L report)
    const finalActual = grandActual > 0 ? grandActual : empActualTotal
    const finalBudget = grandBudget > 0 ? grandBudget : empBudgetTotal

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

    return NextResponse.json({
      success: true,
      data: {
        accounts,
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
      },
    })
  } catch (error) {
    console.error('[WagesDetail] Error:', error)
    return NextResponse.json({ error: 'Failed to load wages detail' }, { status: 500 })
  }
}

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
