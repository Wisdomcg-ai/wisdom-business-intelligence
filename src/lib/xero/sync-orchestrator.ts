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
function fyTotalUrl(fy: number, fyStartMonth: number): string {
  const qs = `fromDate=${getFYStart(fy, fyStartMonth)}&toDate=${getFYEnd(fy, fyStartMonth)}&standardLayout=false&paymentsOnly=false`
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

    for (const conn of connections) {
      if (opts.tenantIdFilter && conn.tenant_id !== opts.tenantIdFilter) continue

      // 3a. Get a valid access token for this specific connection.
      const tokenResult = await getValidAccessToken(
        { id: conn.id },
        supabase as any,
      )
      if (!tokenResult.success || !tokenResult.accessToken) {
        // Token failure for one connection is treated as a hard error for
        // that connection — surfaces in sync_jobs.error via the catch below
        // (NOT a silent swallow).
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
        // 3b. Fetch canonical by-month. `periods` is per-window: 11 for prior
        // FY (full 12 months); (months_elapsed_in_FY - 1) for current FY YTD,
        // so columns stay inside the FY and the reconciler oracle aligns.
        const byMonthResp = await fetch(byMonthUrl(window.base, window.periods), { headers })
        xeroRequestCount++
        if (!byMonthResp.ok) {
          throw new Error(
            `Xero PL-by-month ${byMonthResp.status} for tenant ${conn.tenant_id} fy ${window.fy}`,
          )
        }
        const byMonthJson = await byMonthResp.json()
        await sleep(XERO_REQUEST_DELAY_MS)

        // 3c. Fetch single-period FY total for reconciliation.
        const fyTotalResp = await fetch(
          fyTotalUrl(window.fy, fyStartMonth),
          { headers },
        )
        xeroRequestCount++
        if (!fyTotalResp.ok) {
          throw new Error(
            `Xero FY-total ${fyTotalResp.status} for tenant ${conn.tenant_id} fy ${window.fy}`,
          )
        }
        const fyTotalJson = await fyTotalResp.json()
        await sleep(XERO_REQUEST_DELAY_MS)

        // 3d. Parse + reconcile (D-08 fail-loud — collect discrepancies, do
        // NOT auto-correct, do NOT abort the loop).
        const monthlyRows = parsePLByMonth(byMonthJson)
        const fyTotals = parseFYTotalResponse(fyTotalJson)
        const recResult = reconcilePL(monthlyRows, fyTotals, 0.01)
        if (recResult.status === 'mismatch') {
          for (const d of recResult.discrepancies) {
            allDiscrepancies.push({ ...d })
          }
        }

        // 3e. Upsert long-format rows. ON CONFLICT
        // (business_id, tenant_id, account_code, period_month) — targets the
        // plain unique constraint `xero_pl_lines_natural_key_uniq` (44-05
        // migration 4). The constraint is plain (no COALESCE), so Supabase
        // upsert can match it by column list.
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
          // Supabase upsert doesn't distinguish insert vs update; track
          // total affected as inserted (operators can audit via sync_jobs).
          rowsInserted += dbRows.length
        }

        // 3f. Coverage record per (tenant, fy).
        coveragePerWindow.push(computeCoverage(monthlyRows, window.expectedMonths))
      }
    }

    // 4. Compute final status. Coverage aggregated across windows.
    //    Reconciliation discrepancies determine partial vs success.
    const expectedTotal = fyWindows.reduce((sum, w) => sum + w.expectedMonths, 0)
    coverage = aggregateCoverage(coveragePerWindow, expectedTotal)
    finalStatus = allDiscrepancies.length === 0 ? 'success' : 'partial'
    finalError =
      allDiscrepancies.length > 0
        ? `Reconciliation mismatch on ${allDiscrepancies.length} accounts`
        : null

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
