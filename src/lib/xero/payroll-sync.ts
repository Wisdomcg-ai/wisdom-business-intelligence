/**
 * WB.2 — payroll sync: Xero AU pay runs, payslips and employees into tables.
 *
 * Payroll was the last Xero fact fetched LIVE at page-view time (unpaged run
 * list, one detail call per run, one per employee — N+1 against a 60-req/min
 * tenant cap, no history, nothing for a tie-out gate to assert against). This
 * module puts it on the same footing as the P&L/BS: synced by the 6-hourly
 * orchestrator, read from the database.
 *
 * Shape rules (matching the rest of the platform):
 *   - rows are written with business_id = PROFILE id (same space the
 *     orchestrator writes xero_pl_lines); readers use resolveBusinessProfileIds
 *   - every Xero call goes through fetchXeroWithRateLimit (paced 429/5xx
 *     handling; RateLimitDailyExceededError pauses the tenant)
 *   - the run header is upserted first with detail_synced_at NULL, and stamped
 *     only after its payslips are stored — so a backfill interrupted by the
 *     run budget converges across cycles without re-fetching finished runs
 *
 * Budget: the caller passes a deadline (ms epoch). The sync checks it between
 * units of work and stops cleanly, reporting skipped=true; the orchestrator's
 * stalest-first rotation picks the remainder up next cycle. Detail fetches per
 * invocation are additionally capped so one giant first backfill cannot starve
 * every other business in the run.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import * as Sentry from '@sentry/nextjs'
import { fetchXeroWithRateLimit, RateLimitDailyExceededError } from './xero-api-client'
import { getValidAccessToken } from './token-manager'
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import {
  PAY_RUNS_ORDER,
  payRunLookbackCutoff,
  shouldFetchNextPayRunPage,
  oldestPeriodEnd,
} from './payrun-paging'

export interface PayrollSyncResult {
  business_id: string
  tenants_synced: number
  runs_upserted: number
  details_fetched: number
  payslips_upserted: number
  employees_upserted: number
  xero_requests: number
  /** True when the deadline or detail cap stopped work early. */
  skipped_some: boolean
  errors: string[]
}

export interface PayrollSyncOptions {
  /** Stop starting new work past this ms-epoch deadline. */
  deadlineMs?: number
  /** Max pay-run detail fetches this invocation (backfill pacing). Default 40. */
  maxDetailFetches?: number
  /** Months of history to keep synced. Default 26 (matches P&L window). */
  lookbackMonths?: number
}

/** Parse Xero's /Date(ms+zone)/ format with ISO fallback. */
export function parseXeroDate(dateStr: string | undefined | null): Date | null {
  if (!dateStr) return null
  const match = dateStr.match(/\/Date\((\d+)([+-]\d+)?\)\//)
  if (match) return new Date(parseInt(match[1]))
  const d = new Date(dateStr)
  return isNaN(d.getTime()) ? null : d
}

const isoDate = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null)

/**
 * Decide the grouping for one payslip. Resolution order (first hit wins):
 *   1. the employee's Xero EmployeeGroupName (native field, DD's shape)
 *   2. flat — null group (every current WisdomBI client)
 * Earnings-rate account-code grouping and a manual map are future sources;
 * they slot in here without touching readers, which only see group_key.
 */
export function resolveGroupKey(employee: { employee_group_name?: string | null } | undefined): {
  group_key: string | null
  group_label: string | null
} {
  const name = employee?.employee_group_name?.trim()
  if (name) return { group_key: name.toLowerCase(), group_label: name }
  return { group_key: null, group_label: null }
}

/**
 * Which stored pay runs still need their payslip detail?
 * Pure so the backfill-convergence rule is testable: never re-fetch a stamped
 * run, oldest-first so history fills deterministically, capped.
 */
export function pickRunsNeedingDetail<
  T extends { pay_run_id: string; detail_synced_at: string | null; payment_date: string },
>(runs: ReadonlyArray<T>, cap: number): T[] {
  return runs
    .filter((r) => r.detail_synced_at === null)
    .sort((a, b) => (a.payment_date < b.payment_date ? -1 : 1))
    .slice(0, Math.max(0, cap))
}

export async function syncPayrollForBusiness(
  supabase: SupabaseClient,
  businessId: string,
  opts: PayrollSyncOptions = {},
): Promise<PayrollSyncResult> {
  const deadlineMs = opts.deadlineMs ?? Number.POSITIVE_INFINITY
  const maxDetailFetches = opts.maxDetailFetches ?? 40
  const lookbackMonths = opts.lookbackMonths ?? 26

  const ids = await resolveBusinessProfileIds(supabase, businessId)
  const profileId = ids.profileId ?? businessId

  const result: PayrollSyncResult = {
    business_id: businessId,
    tenants_synced: 0,
    runs_upserted: 0,
    details_fetched: 0,
    payslips_upserted: 0,
    employees_upserted: 0,
    xero_requests: 0,
    skipped_some: false,
    errors: [],
  }

  const { data: connections, error: connErr } = await supabase
    .from('xero_connections')
    .select('id, tenant_id, tenant_name, business_id')
    .in('business_id', ids.all)
    .eq('is_active', true)

  if (connErr) throw connErr
  if (!connections || connections.length === 0) return result

  const outOfTime = () => Date.now() >= deadlineMs

  for (const conn of connections) {
    if (outOfTime()) {
      result.skipped_some = true
      break
    }
    try {
      const tokenResult = await getValidAccessToken(conn as any, supabase)
      if (!tokenResult.success || !tokenResult.accessToken) {
        result.errors.push(`${conn.tenant_id}: token refresh failed`)
        continue
      }
      const xero = (url: string) => {
        result.xero_requests++
        return fetchXeroWithRateLimit(url, {
          accessToken: tokenResult.accessToken!,
          tenantId: conn.tenant_id,
        })
      }

      // ── 1. Payroll calendars → calendar_type lookup ────────────────────────
      const calendarType = new Map<string, string>()
      const calRes = await xero('https://api.xero.com/payroll.xro/1.0/PayrollCalendars')
      if (calRes.ok) {
        for (const cal of calRes.json?.PayrollCalendars ?? []) {
          if (cal.PayrollCalendarID) calendarType.set(cal.PayrollCalendarID, cal.CalendarType ?? 'UNKNOWN')
        }
      } else if (calRes.status === 403 || calRes.status === 401) {
        // Org has no payroll, or the connection predates the payroll scopes.
        // Not an error for this pipeline — record and move on.
        result.errors.push(`${conn.tenant_id}: payroll not accessible (${calRes.status})`)
        continue
      }

      // ── 2. Employees (paged) ───────────────────────────────────────────────
      let empPage = 1
      while (!outOfTime()) {
        const empRes = await xero(`https://api.xero.com/payroll.xro/1.0/Employees?page=${empPage}`)
        if (!empRes.ok) break
        const emps: any[] = empRes.json?.Employees ?? []
        if (emps.length > 0) {
          const rows = emps
            .filter((e) => e.EmployeeID)
            .map((e) => ({
              business_id: profileId,
              tenant_id: conn.tenant_id,
              employee_id: e.EmployeeID,
              first_name: e.FirstName ?? null,
              last_name: e.LastName ?? null,
              start_date: isoDate(parseXeroDate(e.StartDate)),
              termination_date: isoDate(parseXeroDate(e.TerminationDate)),
              payroll_calendar_id: e.PayrollCalendarID ?? null,
              employee_group_name: e.EmployeeGroupName ?? null,
              job_title: e.JobTitle ?? null,
              status: e.Status ?? null,
              updated_at: new Date().toISOString(),
            }))
          const { error } = await supabase
            .from('xero_employees')
            .upsert(rows, { onConflict: 'business_id,tenant_id,employee_id', ignoreDuplicates: false })
          if (error) throw error
          result.employees_upserted += rows.length
        }
        if (emps.length < 100) break
        empPage++
      }

      // Group lookup for payslip rows (read back what we just stored so a
      // partial employee page still resolves from prior syncs).
      const { data: empRows } = await supabase
        .from('xero_employees')
        .select('employee_id, employee_group_name')
        .eq('business_id', profileId)
        .eq('tenant_id', conn.tenant_id)
      const empById = new Map((empRows ?? []).map((e) => [e.employee_id, e]))

      // ── 3. Pay run headers (paged, newest-first, cutoff-bounded) ──────────
      // Cutoff: keep the full lookback window synced. payRunLookbackCutoff's
      // month arg is the window start expressed as a report month.
      const now = new Date()
      const windowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - lookbackMonths, 1))
      const cutoff = payRunLookbackCutoff(
        `${windowStart.getUTCFullYear()}-${String(windowStart.getUTCMonth() + 1).padStart(2, '0')}`,
        0,
      )

      let page = 1
      while (!outOfTime()) {
        const runsRes = await xero(
          `https://api.xero.com/payroll.xro/1.0/PayRuns?page=${page}&order=${encodeURIComponent(PAY_RUNS_ORDER)}`,
        )
        if (!runsRes.ok) {
          result.errors.push(`${conn.tenant_id}: PayRuns page ${page} → ${runsRes.status}`)
          break
        }
        const pageRuns: any[] = runsRes.json?.PayRuns ?? []
        const rows = pageRuns
          .filter((pr) => pr.PayRunID && parseXeroDate(pr.PaymentDate))
          .map((pr) => ({
            business_id: profileId,
            tenant_id: conn.tenant_id,
            pay_run_id: pr.PayRunID,
            payroll_calendar_id: pr.PayrollCalendarID ?? null,
            calendar_type: calendarType.get(pr.PayrollCalendarID) ?? null,
            period_start: isoDate(parseXeroDate(pr.PayRunPeriodStartDate)),
            period_end: isoDate(parseXeroDate(pr.PayRunPeriodEndDate)),
            payment_date: isoDate(parseXeroDate(pr.PaymentDate))!,
            status: pr.PayRunStatus ?? 'UNKNOWN',
            wages: Number(pr.Wages ?? 0),
            tax: Number(pr.Tax ?? 0),
            super_amount: Number(pr.Super ?? 0),
            net_pay: Number(pr.NetPay ?? 0),
            updated_at: new Date().toISOString(),
          }))
        if (rows.length > 0) {
          // Header upsert must NOT clear detail_synced_at on runs already
          // detailed — so the column is simply absent from the update payload.
          const { error } = await supabase
            .from('xero_pay_runs')
            .upsert(rows, { onConflict: 'business_id,tenant_id,pay_run_id', ignoreDuplicates: false })
          if (error) throw error
          result.runs_upserted += rows.length
        }
        if (
          !shouldFetchNextPayRunPage({
            pageCount: pageRuns.length,
            pageNumber: page,
            oldestPeriodEnd: oldestPeriodEnd(pageRuns, parseXeroDate),
            cutoff,
          })
        ) {
          break
        }
        page++
      }

      // ── 4. Payslip detail for runs not yet detailed ───────────────────────
      const { data: needing } = await supabase
        .from('xero_pay_runs')
        .select('pay_run_id, detail_synced_at, payment_date, calendar_type, period_start, period_end')
        .eq('business_id', profileId)
        .eq('tenant_id', conn.tenant_id)
        .eq('status', 'POSTED')
        .is('detail_synced_at', null)

      const toDetail = pickRunsNeedingDetail(
        (needing ?? []) as any[],
        maxDetailFetches - result.details_fetched,
      )
      if ((needing?.length ?? 0) > toDetail.length) result.skipped_some = true

      for (const run of toDetail) {
        if (outOfTime()) {
          result.skipped_some = true
          break
        }
        const detRes = await xero(`https://api.xero.com/payroll.xro/1.0/PayRuns/${run.pay_run_id}`)
        if (!detRes.ok) {
          result.errors.push(`${conn.tenant_id}: PayRuns/${run.pay_run_id} → ${detRes.status}`)
          continue
        }
        result.details_fetched++
        const detail = detRes.json?.PayRuns?.[0]
        const payslips: any[] = detail?.Payslips ?? []
        const rows = payslips
          .filter((ps) => ps.PayslipID && ps.EmployeeID)
          .map((ps) => {
            const group = resolveGroupKey(empById.get(ps.EmployeeID))
            return {
              business_id: profileId,
              tenant_id: conn.tenant_id,
              pay_run_id: run.pay_run_id,
              payslip_id: ps.PayslipID,
              employee_id: ps.EmployeeID,
              employee_name: `${ps.FirstName ?? ''} ${ps.LastName ?? ''}`.trim() || 'Unknown',
              payment_date: run.payment_date,
              period_start: (run as any).period_start ?? null,
              period_end: (run as any).period_end ?? null,
              calendar_type: (run as any).calendar_type ?? null,
              wages: Number(ps.Wages ?? 0),
              tax: Number(ps.Tax ?? 0),
              super_amount: Number(ps.Super ?? 0),
              reimbursements: Number(ps.Reimbursements ?? 0),
              net_pay: Number(ps.NetPay ?? 0),
              group_key: group.group_key,
              group_label: group.group_label,
              updated_at: new Date().toISOString(),
            }
          })
        if (rows.length > 0) {
          const { error } = await supabase
            .from('xero_payslip_lines')
            .upsert(rows, { onConflict: 'business_id,tenant_id,payslip_id', ignoreDuplicates: false })
          if (error) throw error
          result.payslips_upserted += rows.length
        }
        // Stamp AFTER the payslips landed — the convergence contract.
        const { error: stampErr } = await supabase
          .from('xero_pay_runs')
          .update({ detail_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('business_id', profileId)
          .eq('tenant_id', conn.tenant_id)
          .eq('pay_run_id', run.pay_run_id)
        if (stampErr) {
          // Un-stamped but stored payslips just re-upsert next cycle (idempotent
          // natural key) — capture, don't fail the tenant.
          Sentry.captureException(stampErr, {
            tags: { invariant: 'payroll-sync-detail-stamp' },
            extra: { businessId, tenantId: conn.tenant_id, payRunId: run.pay_run_id },
          } as any)
        }
      }

      result.tenants_synced++
    } catch (err) {
      if (err instanceof RateLimitDailyExceededError) {
        result.errors.push(`${conn.tenant_id}: daily rate limit — paused until UTC midnight`)
        result.skipped_some = true
        continue
      }
      result.errors.push(`${conn.tenant_id}: ${String((err as Error)?.message ?? err)}`)
      Sentry.captureException(err, {
        tags: { invariant: 'payroll-sync' },
        extra: { businessId, tenantId: conn.tenant_id },
      } as any)
    }
  }

  return result
}
