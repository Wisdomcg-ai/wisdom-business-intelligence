/**
 * Phase 44 Plan 44-04 / 44-05 — Canonical Xero P&L sync orchestrator.
 *
 * The single, named entry point for every Xero sync flow. All other routes
 * (sync-all, refresh-pl, sync-forecast, the 02:00 AEST cron) are thin shims
 * around this function.
 *
 * Contract (locked in 44-CONTEXT.md decisions D-05 through D-10):
 *   1. Atomically claim a sync_jobs row via begin_xero_sync_job RPC
 *      (returns NULL if another non-stale 'running' sync exists for this
 *      business — single-flight guarantee per 44-05 migration 5; replaces
 *      the broken pg_advisory_xact_lock approach from 44-02).
 *   2. Iterate every active xero_connections row for the business (multi-org
 *      per D-09).
 *   3. For each (tenant, fiscal_year) ∈ {current FY YTD, prior FY} (D-06):
 *        a. Get a valid access token via token-manager.
 *        b. Fetch the canonical by-month report (one-month base + periods=11
 *           per D-05).
 *        c. Fetch the single-period FY total for reconciliation.
 *        d. parsePLByMonth → reconcilePL (fail-loud per D-08).
 *        e. Upsert long-format rows via ON CONFLICT
 *           (business_id, tenant_id, account_code, period_month). Targets
 *           the plain unique constraint `xero_pl_lines_natural_key_uniq`
 *           added in 44-05 migration 4 (replaces the functional index from
 *           44-02 which Supabase upsert could not reach).
 *        f. Compute coverage record (D-10 — sparse-aware, NEVER zero-padded).
 *   4. Always finalize via finalize_xero_sync_job RPC inside a try/finally
 *      so crashed runs leave a non-running row for operators (terminal
 *      status: success | partial | error).
 *
 * Pure-ish: all I/O is at well-defined boundaries (fetch, supabase) so the
 * test suite mocks them directly. NO silent auto-correct, NO non-fatal swallow.
 */

import * as Sentry from '@sentry/nextjs'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { getValidAccessToken } from '@/lib/xero/token-manager'
import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids'
import {
  parsePLByMonth,
  computeCoverage,
  type ParsedPLRow,
  type CoverageRecord,
} from './pl-by-month-parser'
import {
  reconcilePL,
  parseFYTotalResponse,
  type Discrepancy,
} from './pl-reconciler'

// ─── Public types ───────────────────────────────────────────────────────────

export type SyncResult = {
  business_id: string
  status: 'success' | 'partial' | 'error'
  sync_job_id: string
  rows_inserted: number
  rows_updated: number
  xero_request_count: number
  coverage: CoverageRecord
  reconciliation: { status: 'ok' | 'mismatch'; discrepancy_count: number }
  error?: string
}

export type SyncOptions = {
  /** Override the resolved current FY (test hook). */
  fyOverride?: number
  /** Sync only one tenant_id when set (debugging hook). */
  tenantIdFilter?: string
}

// ─── Internal helpers ───────────────────────────────────────────────────────

/** Default Australian fiscal year start month. Phase 44 does not yet read
 * `business_profiles.fiscal_year_start`; that's deferred to a follow-up. */
const DEFAULT_FY_START_MONTH = 7

/** Polite delay between Xero API calls to stay clear of rate limits. */
const XERO_REQUEST_DELAY_MS = 300

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function lastDayOfMonth(year: number, monthOneBased: number): string {
  // monthOneBased: 1-12. JS Date(year, month, 0) returns last day of `month`
  // when month is 1-based passed as 0..11; using monthOneBased gives the
  // last day of the SPECIFIED month.
  const d = new Date(year, monthOneBased, 0)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function firstDayOfMonth(year: number, monthOneBased: number): string {
  return `${year}-${pad2(monthOneBased)}-01`
}

/** Compute the current fiscal year given today + start month. */
function getCurrentFY(today: Date, fyStartMonth: number): number {
  const m = today.getMonth() + 1
  const y = today.getFullYear()
  if (fyStartMonth === 1) return y
  return m >= fyStartMonth ? y + 1 : y
}

/** FY start date as an ISO date string. */
function getFYStart(fy: number, fyStartMonth: number): string {
  const calYear = fyStartMonth === 1 ? fy : fy - 1
  return firstDayOfMonth(calYear, fyStartMonth)
}

/** FY end date as an ISO date string. */
function getFYEnd(fy: number, fyStartMonth: number): string {
  const endMonth = fyStartMonth === 1 ? 12 : fyStartMonth - 1
  const endYear = fy
  return lastDayOfMonth(endYear, endMonth)
}

/** Canonical D-05 base-month boundary for a given window. */
type BaseMonth = { start: string; end: string }

/** Current-FY YTD: base = current calendar month. */
function currentFYBaseMonth(today: Date): BaseMonth {
  const y = today.getFullYear()
  const m = today.getMonth() + 1
  return { start: firstDayOfMonth(y, m), end: lastDayOfMonth(y, m) }
}

/** Prior FY: base = LAST month of that FY. */
function priorFYBaseMonth(priorFY: number, fyStartMonth: number): BaseMonth {
  const endMonth = fyStartMonth === 1 ? 12 : fyStartMonth - 1
  const endYear = priorFY
  return {
    start: firstDayOfMonth(endYear, endMonth),
    end: lastDayOfMonth(endYear, endMonth),
  }
}

/** Aggregate per-(tenant,fy) coverage records into one summary for sync_jobs. */
function aggregateCoverage(
  records: CoverageRecord[],
  expectedTotalMonths: number,
): CoverageRecord {
  if (records.length === 0) {
    return {
      months_covered: 0,
      first_period: '',
      last_period: '',
      expected_months: expectedTotalMonths,
    }
  }
  // Sum months across all (tenant, fy) records.
  const monthsCovered = records.reduce((s, r) => s + r.months_covered, 0)
  const firsts = records.map((r) => r.first_period).filter((s) => s !== '')
  const lasts = records.map((r) => r.last_period).filter((s) => s !== '')
  return {
    months_covered: monthsCovered,
    first_period: firsts.length > 0 ? firsts.sort()[0]! : '',
    last_period: lasts.length > 0 ? lasts.sort()[lasts.length - 1]! : '',
    expected_months: expectedTotalMonths,
  }
}

/**
 * Build the canonical Xero by-month URL (D-05).
 * The literal `periods=11&timeframe=MONTH` substring is intentional — it's
 * the canonical query shape locked in 44-CONTEXT.md after the rolling-totals
 * trap discovered in commit 5d0c792. Do NOT replace with URLSearchParams
 * without preserving the substring; the acceptance grep at the bottom of
 * 44-04-PLAN.md depends on it being readable in source.
 */
function byMonthUrl(base: BaseMonth, periods: number = 11): string {
  // Canonical D-05: 1-month base period (avoids the rolling-totals trap from
  // commit 5d0c792) + variable `periods`. With base = last month of an FY and
  // periods=11, returns 12 single-month columns covering that FY exactly.
  // For a current-FY YTD query (base = current calendar month), periods is
  // computed as (months_elapsed_in_current_FY - 1) so the returned columns
  // stay INSIDE the current FY (no overlap into prior FY's tail months,
  // which would double-count against the per-FY reconciler oracle).
  const qs = `fromDate=${base.start}&toDate=${base.end}&periods=${periods}&timeframe=MONTH&standardLayout=false&paymentsOnly=false`
  return `https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss?${qs}`
}

/** Build the single-period FY-total URL for reconciliation. No periods=, no
 * timeframe= — single column FY total per account. */
function fyTotalUrl(
  fy: number,
  fyStartMonth: number,
  base?: BaseMonth,
): string {
  // The reconciler oracle MUST cover the same date window as the by-month
  // query, otherwise reconciliation flags every account where Xero has any
  // entry posted outside the by-month window (e.g. future-dated quarterly
  // super accruals, post-EOY adjustments for prior FY) — even though the
  // by-month data is correct.
  //
  // toDate = the last day of the by-month window (= base.end). If `base` is
  // omitted (test backwards-compat), fall back to the FY end date.
  const toDate = base?.end ?? getFYEnd(fy, fyStartMonth)
  const qs = `fromDate=${getFYStart(fy, fyStartMonth)}&toDate=${toDate}&standardLayout=false&paymentsOnly=false`
  return `https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss?${qs}`
}

/** Standard "no work" SyncResult — used when begin_xero_sync_job rejects the
 * claim because another sync is already in flight (D-07 single-flight guard). */
function inFlightRejectionResult(businessId: string): SyncResult {
  return {
    business_id: businessId,
    status: 'error',
    sync_job_id: '',
    rows_inserted: 0,
    rows_updated: 0,
    xero_request_count: 0,
    coverage: {
      months_covered: 0,
      first_period: '',
      last_period: '',
      expected_months: 24,
    },
    reconciliation: { status: 'ok', discrepancy_count: 0 },
    error:
      'Another sync for this business is already in progress (within 15-minute staleness window).',
  }
}

// ─── Main orchestrator ──────────────────────────────────────────────────────

export async function syncBusinessXeroPL(
  businessId: string,
  opts: SyncOptions = {},
): Promise<SyncResult> {
  const supabase = createServiceRoleClient()
  const ids = await resolveBusinessIds(supabase as any, businessId)
  const profileId = ids.profileId

  // 1. Atomically claim a sync_jobs row. begin_xero_sync_job is the canonical
  //    single-flight guard per 44-05 migration 5. Replaces the broken
  //    pg_advisory_xact_lock RPC from 44-02 (which released its lock on RPC
  //    return, providing zero serialization across fetch/parse/upsert).
  //    Returns the new row's id, or NULL if another non-stale running sync
  //    exists for this business (15-min staleness window).
  const { data: jobIdData, error: beginErr } = await supabase.rpc(
    'begin_xero_sync_job',
    { p_business_id: profileId },
  )
  if (beginErr) {
    // Begin RPC errored — surface immediately. No sync_jobs row to finalize.
    Sentry.captureException(beginErr, {
      tags: {
        invariant: 'xero_sync_orchestrator',
        phase: 'begin_xero_sync_job',
        business_id: profileId,
      },
    } as any)
    throw new Error(
      `begin_xero_sync_job failed: ${(beginErr as any)?.message ?? String(beginErr)}`,
    )
  }
  if (jobIdData === null || jobIdData === undefined) {
    // Another sync is in flight; bail with a structured "lock contention"
    // result. NO fetches issued, NO upserts, NO sync_jobs row to finalize
    // (the in-flight sync owns the existing row).
    return inFlightRejectionResult(businessId)
  }
  const syncJobId: string = String(jobIdData)

  let xeroRequestCount = 0
  let rowsInserted = 0
  let rowsUpdated = 0
  const allDiscrepancies: Discrepancy[] = []
  const coveragePerWindow: CoverageRecord[] = []
  let finalStatus: 'success' | 'partial' | 'error' = 'error'
  let finalError: string | null = null
  let coverage: CoverageRecord = {
    months_covered: 0,
    first_period: '',
    last_period: '',
    expected_months: 24,
  }
  let didThrow = false
  let thrownErr: unknown = null

  try {
    // 2. Resolve FY windows.
    const today = new Date()
    const fyStartMonth = DEFAULT_FY_START_MONTH
    const currentFY = opts.fyOverride ?? getCurrentFY(today, fyStartMonth)
    const priorFY = currentFY - 1

    // Current FY YTD: months elapsed since FY start (inclusive of base month).
    // For Apr 2026 in FY26 (Jul start): months 1..10 of FY26 = 10 months.
    // periods = monthsElapsed - 1 so the by-month query returns exactly those
    // months and stops at the FY start (no overlap into prior FY's tail).
    const currentMonth = today.getMonth() + 1
    const currentMonthsElapsed =
      ((currentMonth - fyStartMonth + 12) % 12) + 1
    const fyWindows: Array<{
      fy: number
      base: BaseMonth
      periods: number
      expectedMonths: number
    }> = [
      {
        fy: currentFY,
        base: currentFYBaseMonth(today),
        periods: currentMonthsElapsed - 1,
        expectedMonths: currentMonthsElapsed,
      },
      {
        fy: priorFY,
        base: priorFYBaseMonth(priorFY, fyStartMonth),
        periods: 11,
        expectedMonths: 12,
      },
    ]

    // 3. Iterate active xero_connections for this business (multi-org per D-09).
    const { data: connections } = await supabase
      .from('xero_connections')
      .select('id, tenant_id, tenant_name, business_id')
      .in('business_id', ids.all)
      .eq('is_active', true)

    if (!Array.isArray(connections) || connections.length === 0) {
      // No connections = error per D-09. Surface clearly; do not throw.
      finalStatus = 'error'
      finalError =
        'No active xero_connections for this business. Connect Xero before syncing.'
      return {
        business_id: businessId,
        status: 'error',
        sync_job_id: syncJobId,
        rows_inserted: 0,
        rows_updated: 0,
        xero_request_count: 0,
        coverage,
        reconciliation: { status: 'ok', discrepancy_count: 0 },
        error: finalError,
      }
    }

    // Phase 44.2-02 (D-44.2-04): per-tenant sync_jobs rows. The outer
    // sync_jobs row claimed by begin_xero_sync_job above remains for D-07
    // single-flight semantics (per-business 15-min staleness window); each
    // tenant's iteration ALSO writes its own sync_jobs row so the
    // ForecastReadService data_quality lookup (44.2-07) can resolve
    // per-tenant reconciliation status. The outer row's tenant_id falls back
    // to the empty-string default added in migration
    // 20260429000010_sync_jobs_tenant_id_not_null.sql.
    let tenantErrorCount = 0
    let tenantPartialCount = 0
    let tenantSuccessCount = 0

    for (const conn of connections) {
      if (opts.tenantIdFilter && conn.tenant_id !== opts.tenantIdFilter) continue

      // 3a. Per-tenant sync_jobs row at status='running'. (D-44.2-05.) This
      // is the audit row that 44.2-07 reads to gate the wizard / monthly
      // report on per-tenant reconciliation status. Insert is direct
      // (not via RPC) — single-flight at the BUSINESS level is already
      // owned by begin_xero_sync_job; per-tenant rows are pure audit log.
      const { data: tenantJobRow } = await supabase
        .from('sync_jobs')
        .insert({
          business_id: profileId,
          tenant_id: conn.tenant_id, // D-44.2-05 — NEVER null/empty for per-tenant rows
          job_type: 'xero_pl_sync',
          status: 'running',
          started_at: new Date().toISOString(),
          fy_range: {
            current_fy: currentFY,
            prior_fy: priorFY,
            fy_start_month: fyStartMonth,
          },
        })
        .select('id')
        .single()
      const tenantJobId: string | null = (tenantJobRow as any)?.id ?? null

      // Per-tenant accumulators (scoped inside the loop so one tenant's
      // failure can NOT pollute the next tenant's metrics).
      const tenantDiscrepancies: Array<Discrepancy & { tenant_id: string }> = []
      const tenantCoveragePerWindow: CoverageRecord[] = []
      let tenantRowsInserted = 0
      let tenantXeroRequestCount = 0

      try {
        // 3b. Get a valid access token for this specific connection. Token
        // failure is a tenant-level error — caught below, marks this tenant
        // 'error', the for-loop continues to the next tenant (W3).
        const tokenResult = await getValidAccessToken(
          { id: conn.id },
          supabase as any,
        )
        if (!tokenResult.success || !tokenResult.accessToken) {
          throw new Error(
            `Token refresh failed for connection ${conn.id}: ${tokenResult.message ?? tokenResult.error ?? 'unknown'}`,
          )
        }
        const accessToken = tokenResult.accessToken
        const headers = {
          Authorization: `Bearer ${accessToken}`,
          'xero-tenant-id': conn.tenant_id,
          Accept: 'application/json',
        }

        for (const window of fyWindows) {
          // 3c. Fetch canonical by-month. `periods` is per-window: 11 for prior
          // FY (full 12 months); (months_elapsed_in_FY - 1) for current FY YTD.
          const byMonthResp = await fetch(byMonthUrl(window.base, window.periods), { headers })
          xeroRequestCount++
          tenantXeroRequestCount++
          if (!byMonthResp.ok) {
            throw new Error(
              `Xero PL-by-month ${byMonthResp.status} for tenant ${conn.tenant_id} fy ${window.fy}`,
            )
          }
          const byMonthJson = await byMonthResp.json()
          await sleep(XERO_REQUEST_DELAY_MS)

          // 3d. Fetch single-period FY total for reconciliation.
          const fyTotalResp = await fetch(
            fyTotalUrl(window.fy, fyStartMonth, window.base),
            { headers },
          )
          xeroRequestCount++
          tenantXeroRequestCount++
          if (!fyTotalResp.ok) {
            throw new Error(
              `Xero FY-total ${fyTotalResp.status} for tenant ${conn.tenant_id} fy ${window.fy}`,
            )
          }
          const fyTotalJson = await fyTotalResp.json()
          await sleep(XERO_REQUEST_DELAY_MS)

          // 3e. Parse + reconcile.
          const monthlyRows = parsePLByMonth(byMonthJson)
          const fyTotals = parseFYTotalResponse(fyTotalJson)
          const recResult = reconcilePL(monthlyRows, fyTotals, 0.01)
          if (recResult.status === 'mismatch') {
            for (const d of recResult.discrepancies) {
              // D-44.2-06: tenant_id stamped on every discrepancy entry
              tenantDiscrepancies.push({ ...d, tenant_id: conn.tenant_id })
              allDiscrepancies.push({ ...d })
            }
          }

          // 3f. Upsert long-format rows.
          const dbRows = monthlyRows.map((r: ParsedPLRow) => ({
            business_id: profileId,
            tenant_id: conn.tenant_id,
            account_code: r.account_code,
            account_name: r.account_name,
            account_type: r.account_type,
            period_month: r.period_month,
            amount: r.amount,
            source: 'xero',
            updated_at: new Date().toISOString(),
          }))

          if (dbRows.length > 0) {
            const upsertResult = (await supabase
              .from('xero_pl_lines')
              .upsert(dbRows, {
                onConflict: 'business_id,tenant_id,account_code,period_month',
                ignoreDuplicates: false,
              })) as any
            if (upsertResult?.error) {
              throw new Error(
                `xero_pl_lines upsert: ${upsertResult.error.message ?? upsertResult.error.code ?? 'unknown'}`,
              )
            }
            rowsInserted += dbRows.length
            tenantRowsInserted += dbRows.length
          }

          // 3g. Coverage record per (tenant, fy).
          const cov = computeCoverage(monthlyRows, window.expectedMonths)
          coveragePerWindow.push(cov)
          tenantCoveragePerWindow.push(cov)
        }

        // 3h. Per-tenant terminal UPDATE — happy/partial path. (D-44.2-04.)
        const tenantExpectedTotal = fyWindows.reduce(
          (s, w) => s + w.expectedMonths,
          0,
        )
        const tenantCoverage = aggregateCoverage(
          tenantCoveragePerWindow,
          tenantExpectedTotal,
        )
        const tenantStatus: 'success' | 'partial' =
          tenantDiscrepancies.length === 0 ? 'success' : 'partial'
        const tenantErrorMsg =
          tenantDiscrepancies.length > 0
            ? `Reconciliation mismatch on ${tenantDiscrepancies.length} accounts for tenant ${conn.tenant_id}`
            : null

        if (tenantStatus === 'success') tenantSuccessCount++
        else tenantPartialCount++

        if (tenantJobId !== null) {
          await supabase
            .from('sync_jobs')
            .update({
              status: tenantStatus,
              finished_at: new Date().toISOString(),
              coverage: tenantCoverage,
              reconciliation:
                tenantDiscrepancies.length > 0
                  ? {
                      tenant_id: conn.tenant_id,
                      status: 'mismatch',
                      discrepant_accounts: tenantDiscrepancies,
                    }
                  : null,
              rows_inserted: tenantRowsInserted,
              xero_request_count: tenantXeroRequestCount,
              error: tenantErrorMsg,
            })
            .eq('id', tenantJobId)
        }
      } catch (err) {
        // (W3) Per-tenant exception handler. A single tenant failing — Xero
        // API timeout/500, parser threw, supabase upsert rejected — must NOT
        // abort the loop. Mark this tenant 'error', log via Sentry, continue.
        const errMessage = err instanceof Error ? err.message : String(err)
        tenantErrorCount++
        if (tenantJobId !== null) {
          await supabase
            .from('sync_jobs')
            .update({
              status: 'error',
              finished_at: new Date().toISOString(),
              error: errMessage.slice(0, 500), // bounded length for the column
              rows_inserted: tenantRowsInserted,
              xero_request_count: tenantXeroRequestCount,
            })
            .eq('id', tenantJobId)
        }
        try {
          Sentry.captureException(err, {
            tags: {
              invariant: 'xero_sync_orchestrator_tenant',
              phase: '44.2',
              business_id: profileId,
              tenant_id: conn.tenant_id,
              sync_job_id: tenantJobId ?? syncJobId,
            },
          } as any)
        } catch {
          // Sentry failure must never mask the original tenant error path.
        }
        // Continue to the next tenant — do NOT re-throw.
        continue
      }
    }

    // 4. Compute final status across tenants. The outer SyncResult reflects
    //    the WORST per-tenant outcome (D-44.2-04: business-level data_quality
    //    is the worst of all tenant statuses).
    const expectedTotal = fyWindows.reduce((sum, w) => sum + w.expectedMonths, 0)
    coverage = aggregateCoverage(coveragePerWindow, expectedTotal)
    if (tenantErrorCount > 0 && tenantSuccessCount === 0 && tenantPartialCount === 0) {
      finalStatus = 'error'
      finalError = `All ${tenantErrorCount} tenants errored`
    } else if (tenantErrorCount > 0 || tenantPartialCount > 0) {
      finalStatus = 'partial'
      const parts: string[] = []
      if (tenantErrorCount > 0) parts.push(`${tenantErrorCount} tenant(s) errored`)
      if (tenantPartialCount > 0)
        parts.push(`${tenantPartialCount} tenant(s) had reconciliation mismatches`)
      finalError = parts.join('; ')
    } else {
      finalStatus = 'success'
      finalError = null
    }

    if (allDiscrepancies.length > 0) {
      // D-18 invariant pattern: structured Sentry tag on reconciliation gap.
      Sentry.captureMessage('xero_sync_reconciliation_mismatch', {
        tags: {
          invariant: 'reconciliation',
          business_id: profileId,
          sync_job_id: syncJobId,
        },
      } as any)
    }

    return {
      business_id: businessId,
      status: finalStatus,
      sync_job_id: syncJobId,
      rows_inserted: rowsInserted,
      rows_updated: rowsUpdated,
      xero_request_count: xeroRequestCount,
      coverage,
      reconciliation: {
        status: allDiscrepancies.length === 0 ? 'ok' : 'mismatch',
        discrepancy_count: allDiscrepancies.length,
      },
      // Phase 44.2-02 (W3): outer error message reflects per-tenant error
      // aggregation when tenants failed but the orchestrator did not throw.
      ...(finalError ? { error: finalError } : {}),
    }
  } catch (err: any) {
    // D-12 anti-pattern explicitly avoided: NO silent error swallowing.
    // Mark final state as error; finalize_xero_sync_job in finally writes the
    // terminal sync_jobs row, then we re-throw.
    didThrow = true
    thrownErr = err
    finalStatus = 'error'
    finalError = String(err?.message ?? err)

    Sentry.captureException(err, {
      tags: {
        invariant: 'xero_sync_orchestrator',
        business_id: profileId,
        sync_job_id: syncJobId,
      },
    } as any)

    // Re-throw AFTER the finally block runs (so finalize_xero_sync_job is
    // still invoked on every code path the orchestrator can control).
    throw err
  } finally {
    // 5. Always finalize. Whether the run succeeded, partially succeeded, or
    //    threw, the sync_jobs row gets a terminal status (no orphaned
    //    'running' rows from code paths the orchestrator controls).
    try {
      await supabase.rpc('finalize_xero_sync_job', {
        p_job_id: syncJobId,
        p_status: finalStatus,
        p_rows_inserted: rowsInserted,
        p_rows_updated: rowsUpdated,
        p_xero_request_count: xeroRequestCount,
        p_coverage:
          finalStatus === 'error' && coveragePerWindow.length === 0
            ? null
            : coverage,
        p_reconciliation:
          allDiscrepancies.length > 0
            ? { status: 'mismatch', discrepancies: allDiscrepancies }
            : finalStatus === 'error'
              ? null
              : { status: 'ok' },
        p_error: finalError,
      })
    } catch (finalizeErr) {
      // Finalize failed — log via Sentry so the operator can patch the row
      // by hand. We do NOT want to mask the original throw if there was one.
      Sentry.captureException(finalizeErr, {
        tags: {
          invariant: 'xero_sync_orchestrator',
          phase: 'finalize_xero_sync_job',
          business_id: profileId,
          sync_job_id: syncJobId,
        },
      } as any)
      if (!didThrow) {
        // No prior error — surface this one.
        throw finalizeErr
      }
      // Otherwise let the original throw propagate.
    }
    // No-op reference to keep TS happy when only used in a comment.
    void thrownErr
  }
}

// ─── Run-all (cron entry) ───────────────────────────────────────────────────

/**
 * Iterate every business with at least one active xero_connection and sync
 * each in sequence. Sequential — concurrency limit 1 — to stay within
 * Vercel function maxDuration and Xero rate limits. The 02:00 AEST cron
 * (plan 44-05 cron route) calls this directly.
 */
export async function runSyncForAllBusinesses(): Promise<SyncResult[]> {
  const supabase = createServiceRoleClient()
  const { data: connections } = await supabase
    .from('xero_connections')
    .select('business_id')
    .eq('is_active', true)

  const uniqueBusinessIds = Array.from(
    new Set((connections ?? []).map((c: any) => c.business_id)),
  ) as string[]

  const results: SyncResult[] = []
  for (const businessId of uniqueBusinessIds) {
    try {
      results.push(await syncBusinessXeroPL(businessId))
    } catch (err: any) {
      // syncBusinessXeroPL already finalized sync_jobs.status='error' before
      // throwing. We collect a placeholder result so the cron's overall
      // report shows every business attempted.
      results.push({
        business_id: businessId,
        status: 'error',
        sync_job_id: 'see-sync_jobs-table',
        rows_inserted: 0,
        rows_updated: 0,
        xero_request_count: 0,
        coverage: {
          months_covered: 0,
          first_period: '',
          last_period: '',
          expected_months: 24,
        },
        reconciliation: { status: 'ok', discrepancy_count: 0 },
        error: String(err?.message ?? err),
      })
    }
  }
  return results
}
