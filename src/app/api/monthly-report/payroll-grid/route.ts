import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'
import { requireSectionPermission } from '@/lib/permissions/requireSectionPermission'
import { enforceSectionPermission } from '@/lib/permissions/sectionPermissionConfig'
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import { resolveXeroConnections } from '@/lib/business/resolveXeroBusinessId'
import { resolveBudget } from '@/lib/budgets/resolve-budget'
import { buildPayrollGrid, type PayslipRow, type EmployeeRow } from '@/lib/monthly-report/payroll-grid'
import { withSchema } from '@/lib/api/with-schema'
import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

/**
 * The two-month payroll grid: every employee against every pay run.
 *
 * Reads no Xero API. `xero_payslip_lines` has carried a row per employee per
 * pay run since the payroll sync landed, which is the entire content of the
 * Google Sheet tab this replaces — the tab existed because Calxa cannot see a
 * payslip, not because anybody was making a judgement.
 */
const PayrollGridPostSchema = z.object({
  business_id: z.string(),
  report_month: z.string(),
  fiscal_year: z.number(),
  /** How many months to show, ending at report_month. Calxa shows two. */
  months: z.number().int().min(1).max(6).optional(),
})

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, getSupabaseSecretKey())

/** ['2026-07', '2026-08'] for report_month 2026-08, count 2. */
function monthWindow(reportMonth: string, count: number): string[] {
  const [y, m] = reportMonth.split('-').map(Number)
  const out: string[] = []
  for (let back = count - 1; back >= 0; back--) {
    const total = y * 12 + (m - 1) - back
    out.push(`${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`)
  }
  return out
}

async function postHandler(request: Request, body: unknown) {
  try {
    const authClient = await createRouteHandlerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { business_id, report_month, fiscal_year, months } = body as {
      business_id: string
      report_month: string
      fiscal_year: number
      months?: number
    }

    const verdict = await requireSectionPermission(authClient, user.id, business_id, 'finances')
    const blocked = enforceSectionPermission(verdict, 'finances', 'api/monthly-report/payroll-grid', user.id, business_id)
    if (blocked) return blocked

    // The module client is service-role and bypasses RLS, so this is the only
    // durable tenant gate on the route.
    if (!(await verifyBusinessAccess(user.id, business_id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const window = monthWindow(report_month, months ?? 2)
    const from = `${window[0]}-01`
    // Exclusive upper bound on the first of the month AFTER the last one.
    const [ly, lm] = window[window.length - 1].split('-').map(Number)
    const to = lm === 12 ? `${ly + 1}-01-01` : `${ly}-${String(lm + 1).padStart(2, '0')}-01`

    const { connections } = await resolveXeroConnections(supabase, business_id)
    const tenantIds = (connections ?? []).map((c: { tenant_id: string }) => c.tenant_id).filter(Boolean)
    if (tenantIds.length === 0) {
      return NextResponse.json({ success: true, data: null, reason: 'no Xero connection' })
    }

    const { data: payslips } = await supabase
      .from('xero_payslip_lines')
      .select('employee_id, employee_name, payment_date, wages, super_amount')
      .in('tenant_id', tenantIds)
      .gte('payment_date', from)
      .lt('payment_date', to)

    if (!payslips || payslips.length === 0) {
      // Not an error: a client whose payroll is not run through Xero has no
      // grid to show, and saying so beats printing an empty table.
      return NextResponse.json({ success: true, data: null, reason: 'no payslips synced for this period' })
    }

    const { data: employees } = await supabase
      .from('xero_employees')
      .select('employee_id, start_date')
      .in('tenant_id', tenantIds)

    // ── The month's wages budget, from the same yardstick the statement uses ──
    const budgets: Record<string, number> = {}
    try {
      const ids = await resolveBusinessProfileIds(supabase, business_id)
      const { data: settingsRow } = await supabase
        .from('monthly_report_settings')
        .select('budget_source, budget_forecast_id, wages_account_names')
        .eq('business_id', business_id)
        .maybeSingle()

      const wagesNames: string[] = Array.isArray(settingsRow?.wages_account_names)
        ? (settingsRow!.wages_account_names as string[])
        : []

      if (wagesNames.length > 0) {
        const resolved = await resolveBudget(supabase, {
          businessId: business_id,
          profileId: ids.profileId,
          fiscalYear: fiscal_year,
          reportMonth: report_month,
          months: window,
          budgetSource: settingsRow?.budget_source === 'budget_version' ? 'budget_version' : 'forecast',
          pin: { budgetForecastId: settingsRow?.budget_forecast_id ?? null },
        })

        // Wages only — the grid's Budget row is the wages line, not the whole
        // employment group. Super has its own line and its own row elsewhere.
        const wanted = new Set(wagesNames.map((n) => n.trim().toLowerCase()))
        for (const line of resolved.lines) {
          if (!wanted.has((line.account_name ?? '').trim().toLowerCase())) continue
          if ((line.account_name ?? '').toLowerCase().includes('super')) continue
          for (const month of window) {
            budgets[month] = (budgets[month] ?? 0) + Math.abs((line.forecast_months || {})[month] || 0)
          }
        }
      }
    } catch (err) {
      // A missing budget prints as a dash; it must not cost the whole page.
      Sentry.captureException(err, {
        tags: { invariant: 'payroll-grid-budget' },
        extra: { business_id, report_month },
      } as never)
    }

    const grid = buildPayrollGrid(
      payslips as PayslipRow[],
      (employees ?? []) as EmployeeRow[],
      window,
      budgets,
    )

    return NextResponse.json({ success: true, data: grid })
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: 'monthly-report/payroll-grid' },
      extra: { context: '[PayrollGrid] Error' },
    } as never)
    return NextResponse.json({ error: 'Failed to build the payroll grid' }, { status: 500 })
  }
}

export const POST = withSchema('monthly-report/payroll-grid', PayrollGridPostSchema, postHandler)
