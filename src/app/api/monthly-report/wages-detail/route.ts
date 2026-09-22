import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'
import { getValidAccessToken } from '@/lib/xero/token-manager'
import * as Sentry from '@sentry/nextjs'
import { requireSectionPermission } from '@/lib/permissions/requireSectionPermission'
import { enforceSectionPermission } from '@/lib/permissions/sectionPermissionConfig'
import {
  PAY_RUNS_ORDER,
  payRunLookbackCutoff,
  shouldFetchNextPayRunPage,
  oldestPeriodEnd,
} from './_helpers'
import {
  loadWagesDetail,
  type EmployeePayData,
  type LivePayrollResult,
} from '@/lib/monthly-report/wages-detail-load'
import { z } from 'zod'
import { withSchema } from '@/lib/api/with-schema'

export const dynamic = 'force-dynamic'

// VALID-05a (observe mode): POST returns wages detail for a report month.
const WagesDetailPostSchema = z.object({
  business_id: z.string(),
  report_month: z.string(),
  fiscal_year: z.number(),
  wages_account_names: z.array(z.string()).optional(),
  budget_forecast_id: z.string().optional(),
  pdf_layout: z.any().optional(),
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey()
)

// Parse Xero .NET date format: "/Date(1609459200000+0000)/"
function parseXeroDate(dateStr: string): Date | null {
  if (!dateStr) return null
  const match = dateStr.match(/\/Date\((\d+)([+-]\d+)?\)\//)
  if (match) return new Date(parseInt(match[1]))
  // Fallback to ISO
  const d = new Date(dateStr)
  return isNaN(d.getTime()) ? null : d
}

/**
 * The live Xero payroll pull, for a business whose payroll backfill has never
 * run. Takes a token — which may refresh it — so it lives here and is injected
 * into the shared loader; the read-only preview harness never runs it.
 */
async function fetchLivePayroll(connection: any, report_month: string): Promise<LivePayrollResult> {
  const employeePayMap = new Map<string, EmployeePayData>()
  const payRunDatesSet = new Set<string>()
  let payrollAvailable = false

  const tokenResult = await getValidAccessToken(connection, supabase)
  if (tokenResult.success && tokenResult.accessToken) {
    const xeroHeaders = {
      'Authorization': `Bearer ${tokenResult.accessToken}`,
      'xero-tenant-id': connection.tenant_id,
      'Accept': 'application/json',
    }

    // W0.2 — PayRuns is paginated at 100 per page. Fetching it unordered
    // and unpaged (as this route used to) means only ever seeing whichever
    // 100 runs Xero returned first: a weekly-payroll client passes 100 runs
    // in about two years, after which the report month goes missing and the
    // page renders an empty state rather than an error. Order newest-first
    // and page until we're safely past the window. See _helpers.ts.
    const payRunCutoff = payRunLookbackCutoff(report_month)
    const allPayRuns: any[] = []
    let payRunsOk = false
    let payRunsStatus = 0

    const fetchPayRunPage = async (page: number) =>
      fetch(
        `https://api.xero.com/payroll.xro/1.0/PayRuns?page=${page}&order=${encodeURIComponent(PAY_RUNS_ORDER)}`,
        { headers: xeroHeaders },
      )

    // Page 1 runs alongside PayCalendars; later pages are rare (one page
    // covers ~2 years of weekly payroll) and only fetched when needed.
    const [calResp, firstRunsResp] = await Promise.all([
      fetch('https://api.xero.com/payroll.xro/1.0/PayCalendars', { headers: xeroHeaders }),
      fetchPayRunPage(1),
    ])

    let runsResp = firstRunsResp
    let pageNumber = 1
    while (true) {
      payRunsStatus = runsResp.status
      if (!runsResp.ok) break
      payRunsOk = true

      const pageData = await runsResp.json()
      const pageRuns: any[] = pageData?.PayRuns || []
      allPayRuns.push(...pageRuns)

      if (
        !shouldFetchNextPayRunPage({
          pageCount: pageRuns.length,
          pageNumber,
          oldestPeriodEnd: oldestPeriodEnd(pageRuns, parseXeroDate),
          cutoff: payRunCutoff,
        })
      ) {
        break
      }

      pageNumber += 1
      runsResp = await fetchPayRunPage(pageNumber)
    }

    // Build calendar type lookup
    const calendarMap = new Map<string, string>()
    if (calResp.ok) {
      const calData = await calResp.json()
      const calendars = calData?.PayrollCalendars || []
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[WagesDetail] PayCalendars: ${calendars.length} found`, calendars.map((c: any) => ({
          id: c.PayrollCalendarID, name: c.Name, type: c.CalendarType
        })))
      }
      for (const cal of calendars) {
        calendarMap.set(cal.PayrollCalendarID, cal.CalendarType || 'UNKNOWN')
      }
    } else {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[WagesDetail] PayCalendars fetch failed: ${calResp.status}`)
      }
    }

    if (payRunsOk) {
      payrollAvailable = true

      // Filter to POSTED pay runs where PaymentDate falls in report month
      const [reportYear, reportMonthNum] = report_month.split('-').map(Number)
      const monthPayRuns = allPayRuns.filter((pr: any) => {
        if (pr.PayRunStatus !== 'POSTED') return false
        const payDate = parseXeroDate(pr.PaymentDate)
        if (!payDate) return false
        return payDate.getFullYear() === reportYear && (payDate.getMonth() + 1) === reportMonthNum
      })

      if (process.env.NODE_ENV !== 'production') {
        console.log(`[WagesDetail] Found ${monthPayRuns.length} POSTED pay runs in ${report_month} (of ${allPayRuns.length} fetched across ${pageNumber} page(s))`)
      }

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
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[WagesDetail] PayRuns fetch failed: ${payRunsStatus} - need to reconnect Xero with payroll.payruns.read scope`)
      }
      // Don't create fake actuals — just mark payroll as unavailable
      // Budget-only data from forecast_employees will still show
    }
  }

  return {
    payrollAvailable,
    employees: Array.from(employeePayMap.values()),
    payRunDates: Array.from(payRunDatesSet),
  }
}

/**
 * POST /api/monthly-report/wages-detail
 * Returns Calxa-style wages breakdown:
 * - Account-level totals (actual vs budget from P&L lines)
 * - Employee-level detail from Xero PayRuns with budget comparison
 */
async function postHandler(request: Request) {
  try {
    // Phase 65-02: introduce user auth so requireSectionPermission has a userId.
    // The module-level service-role `supabase` continues to be used for data fetching below.
    const authClient = await createRouteHandlerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { business_id, report_month, fiscal_year, wages_account_names, budget_forecast_id, pdf_layout } = body as {
      business_id: string
      report_month: string
      fiscal_year: number
      wages_account_names: string[]
      budget_forecast_id?: string
      pdf_layout?: unknown
    }

    if (!business_id || !report_month || !fiscal_year) {
      return NextResponse.json(
        { error: 'business_id, report_month, and fiscal_year are required' },
        { status: 400 }
      )
    }

    // Phase 65: section-permission gate (LOG_ONLY by default, ENFORCE via env var)
    const _sectionVerdict = await requireSectionPermission(
      authClient,          // auth-bound client; NEVER pass a service-role client here
      user.id,
      business_id,
      'finances',
    )
    const _sectionBlocked = enforceSectionPermission(
      _sectionVerdict,
      'finances',
      'api/monthly-report/wages-detail',
      user.id,
      business_id,
    )
    if (_sectionBlocked) return _sectionBlocked

    // R29 (SEC-N2): hard authorization gate. The section-permission check above
    // is LOG_ONLY by default, so it does not block cross-tenant access on its
    // own. The module-level Supabase client is service-role and bypasses RLS,
    // making this the only durable tenant-isolation enforcement on this route.
    const _hasAccess = await verifyBusinessAccess(user.id, business_id)
    if (!_hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // The build lives in lib/monthly-report/wages-detail-load, shared with
    // scripts/preview-pack.ts. Only the live Xero fallback stays here.
    //
    // pdf_layout is the layout the page is printing, whose Payroll Report
    // roster sets the per-employee budgets — so the Wages Analysis page and the
    // Payroll Report page of one export read one roster. It only picks weekly
    // salaries for this business's own payslips, which the checks above have
    // authorised. Not sent: the stored layout.
    const result = await loadWagesDetail(
      supabase,
      { business_id, report_month, fiscal_year, wages_account_names, budget_forecast_id, actor_id: user.id, pdf_layout },
      { fetchLivePayroll: (connection) => fetchLivePayroll(connection, report_month) },
    )

    return NextResponse.json({ success: true, data: result.data })
  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'monthly-report/wages-detail' }, extra: { context: "[WagesDetail] Error" } } as any)
    return NextResponse.json({ error: 'Failed to load wages detail' }, { status: 500 })
  }
}

export const POST = withSchema('monthly-report/wages-detail', WagesDetailPostSchema, postHandler)
