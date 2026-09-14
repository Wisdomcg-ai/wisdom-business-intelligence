/**
 * The database half of the two-month payroll grid: payslips, start dates and
 * the wages budget, handed to the pure buildPayrollGrid.
 *
 * Shared by /api/monthly-report/payroll-grid and scripts/preview-pack.ts. The
 * harness used to read the payslips its own way — by business_id rather than
 * through the connection resolver, and with no budget row at all — so the page
 * it showed was not the page the export printed.
 *
 * Reads only. The caller supplies the client and is responsible for
 * authorisation.
 */
import * as Sentry from '@sentry/nextjs'
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import { resolveXeroConnections } from '@/lib/business/resolveXeroBusinessId'
import { resolveBudget } from '@/lib/budgets/resolve-budget'
import { buildPayrollGrid, type PayslipRow, type EmployeeRow, type PayrollGrid } from './payroll-grid'

type Client = any

export interface PayrollGridLoadInput {
  business_id: string
  report_month: string
  fiscal_year: number
  /** How many months to show, ending at report_month. Calxa shows two. */
  months?: number
}

/** `data: null` carries the reason — not an error, an absence the page can state. */
export type PayrollGridLoadResult = { data: PayrollGrid; reason?: undefined } | { data: null; reason: string }

/** ['2026-07', '2026-08'] for report_month 2026-08, count 2. */
export function payrollMonthWindow(reportMonth: string, count: number): string[] {
  const [y, m] = reportMonth.split('-').map(Number)
  const out: string[] = []
  for (let back = count - 1; back >= 0; back--) {
    const total = y * 12 + (m - 1) - back
    out.push(`${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`)
  }
  return out
}

export async function loadPayrollGrid(supabase: Client, input: PayrollGridLoadInput): Promise<PayrollGridLoadResult> {
  const { business_id, report_month, fiscal_year, months } = input

  const window = payrollMonthWindow(report_month, months ?? 2)
  const from = `${window[0]}-01`
  // Exclusive upper bound on the first of the month AFTER the last one.
  const [ly, lm] = window[window.length - 1].split('-').map(Number)
  const to = lm === 12 ? `${ly + 1}-01-01` : `${ly}-${String(lm + 1).padStart(2, '0')}-01`

  const { connections } = await resolveXeroConnections(supabase, business_id)
  const tenantIds = (connections ?? []).map((c: { tenant_id: string }) => c.tenant_id).filter(Boolean)
  if (tenantIds.length === 0) {
    return { data: null, reason: 'no Xero connection' }
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
    return { data: null, reason: 'no payslips synced for this period' }
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
  return { data: grid }
}
