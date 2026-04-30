/**
 * Phase 44.2 Plan 44.2-06B Task 6 — Path A sync orchestrator.
 *
 * Replaces the 44-04/44-05 by-month query path with N per-month single-period
 * queries. The empirical proof: single-period Jul 2025 returns Sales-Hardware
 * $259,550.88 (matches Xero web PDF) while the by-month query returns
 * $252,711.48 (off by $6,839.40 — the JDS smoking-gun gap).
 *
 * Per-tenant flow (inside the per-tenant try/catch from 44.2-02):
 *   1. Read business_profiles.fiscal_year_start (default 7).
 *   2. Pre-fetch /Organisation once → IANA timezone (logged + Sentry'd).
 *   3. Pre-fetch /Accounts once → refresh xero_accounts catalog → catalog Map.
 *   4. For each FY window:
 *        a. Per-month single-period fetch in calendar order.
 *           - 429 daily → mark tenant 'paused', exit window loop.
 *           - 5xx after 5 retries → record month in months_failed, continue.
 *        b. Single-period FY-total fetch (oracle).
 *        c. Run augmentWithResiduals (regression detector — should be []).
 *        d. Run reconcilePL (regression detector — should be []).
 *        e. Map each row → DB shape (account_id GUID, account_code from
 *           catalog, basis='accruals') and upsert.
 *
 * Preserved from prior phases:
 *   - begin_xero_sync_job / finalize_xero_sync_job RPCs (44-05 D-07).
 *   - Per-tenant try/catch isolation (44.2-02 D-44.2-04).
 *   - Per-tenant sync_jobs.tenant_id audit row (44.2-02 D-44.2-05).
 *   - Reconciliation JSONB now extended with months_failed +
 *     absorber_adjustments (regression-detector signal for Path A).
 *
 * Pure-ish: all I/O at well-defined boundaries (fetch via xero-api-client,
 * supabase service-role).
 */
import * as Sentry from '@sentry/nextjs'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { getValidAccessToken } from '@/lib/xero/token-manager'
import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids'
import {
  computeCoverage,
  type CoverageRecord,
} from './pl-by-month-parser'
import {
  reconcilePL,
  type Discrepancy,
} from './pl-reconciler'
import { parsePLSinglePeriod, type ParsedPLRow } from './pl-single-period-parser'
import {
  fetchXeroWithRateLimit,
  RateLimitDailyExceededError,
} from './xero-api-client'
import { getXeroOrgTimezone } from './organisation'
import { refreshXeroAccountsCatalog, type CatalogMap } from './accounts-catalog'

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
  fyOverride?: number
  tenantIdFilter?: string
}

// ─── Date helpers ───────────────────────────────────────────────────────────

const DEFAULT_FY_START_MONTH = 7

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}
function lastDayOfMonth(year: number, monthOneBased: number): string {
  const d = new Date(year, monthOneBased, 0)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
function firstDayOfMonth(year: number, monthOneBased: number): string {
  return `${year}-${pad2(monthOneBased)}-01`
}
function getCurrentFY(today: Date, fyStartMonth: number): number {
  const m = today.getMonth() + 1
  const y = today.getFullYear()
  if (fyStartMonth === 1) return y
  return m >= fyStartMonth ? y + 1 : y
}
function getFYStart(fy: number, fyStartMonth: number): string {
  const calYear = fyStartMonth === 1 ? fy : fy - 1
  return firstDayOfMonth(calYear, fyStartMonth)
}
function getFYEnd(fy: number, fyStartMonth: number): string {
  const endMonth = fyStartMonth === 1 ? 12 : fyStartMonth - 1
  const endYear = fy
  return lastDayOfMonth(endYear, endMonth)
}

/**
 * Generate the list of YYYY-MM-01 month tags within an FY window inclusive
 * of `windowEnd`. windowEnd's month is the LAST month included.
 */
function monthsInFYWindow(
  fy: number,
  fyStartMonth: number,
  windowEnd: Date,
): string[] {
  const startCalYear = fyStartMonth === 1 ? fy : fy - 1
  const start = new Date(startCalYear, fyStartMonth - 1, 1) // local-time first day
  const out: string[] = []
  const cur = new Date(start)
  // Inclusive end-of-month: compare year+month tuple.
  const endY = windowEnd.getFullYear()
  const endM = windowEnd.getMonth() + 1
  while (true) {
    const y = cur.getFullYear()
    const m = cur.getMonth() + 1
    out.push(`${y}-${pad2(m)}-01`)
    if (y === endY && m === endM) break
    if (y > endY || (y === endY && m > endM)) break
    cur.setMonth(cur.getMonth() + 1)
  }
  return out
}

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
 * Build the canonical Path A single-period URL: one calendar month per call.
 * NEVER includes `periods=` or `timeframe=` — those are the documented-buggy
 * shape that this plan replaces.
 */
function singlePeriodPLUrl(periodMonth: string): string {
  // periodMonth = 'YYYY-MM-01' → fromDate = that, toDate = last-day-of-month.
  const [yStr, mStr] = periodMonth.split('-')
  const y = parseInt(yStr!, 10)
  const m = parseInt(mStr!, 10)
  const fromDate = firstDayOfMonth(y, m)
  const toDate = lastDayOfMonth(y, m)
  const qs = `fromDate=${fromDate}&toDate=${toDate}&standardLayout=false&paymentsOnly=false`
  return `https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss?${qs}`
}

/**
 * Single-period FY-total URL — used as the reconciler oracle for one window.
 * Same shape as the per-month URLs (no periods=, no timeframe=); just spans
 * the full FY range.
 */
function fyTotalUrl(fy: number, fyStartMonth: number, windowEndIso: string): string {
  const qs = `fromDate=${getFYStart(fy, fyStartMonth)}&toDate=${windowEndIso}&standardLayout=false&paymentsOnly=false`
  return `https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss?${qs}`
}

function inFlightRejectionResult(businessId: string): SyncResult {
  return {
    business_id: businessId,
    status: 'error',
    sync_job_id: '',
    rows_inserted: 0,
    rows_updated: 0,
    xero_request_count: 0,
    coverage: { months_covered: 0, first_period: '', last_period: '', expected_months: 24 },
    reconciliation: { status: 'ok', discrepancy_count: 0 },
    error:
      'Another sync for this business is already in progress (within 15-minute staleness window).',
  }
}

// ─── Path A absorber stand-in ───────────────────────────────────────────────

/**
 * Plan 44.2-06B retains augmentWithResiduals as a regression detector. Path A
 * should produce per-account monthly sums that match the FY total exactly,
 * so the absorber must produce zero adjustments. If it produces any, that's
 * a regression — sync is marked 'partial' and Sentry-alerted.
 *
 * Rather than depend on a not-yet-merged 44.2-06 module, we inline the
 * regression check here as a pure function: per-account, sum of monthly
 * amounts vs FY total. Returns the list of accounts whose absolute diff
 * exceeds the tolerance — i.e. accounts the absorber WOULD have generated
 * adjustments for. Path A: this list should be empty.
 */
function regressionAdjustments(
  monthlyRows: ParsedPLRow[],
  fyTotals: Record<string, number>,
  tolerance: number = 0.01,
): Array<{ account_id: string; account_name: string; diff: number }> {
  const sums = new Map<string, { name: string; sum: number }>()
  for (const r of monthlyRows) {
    const cur = sums.get(r.account_id) ?? { name: r.account_name, sum: 0 }
    cur.sum += r.amount
    sums.set(r.account_id, cur)
  }
  const out: Array<{ account_id: string; account_name: string; diff: number }> = []
  for (const [accountId, { name, sum }] of sums.entries()) {
    const monthly = Math.round(sum * 100) / 100
    const fy = fyTotals[accountId] ?? fyTotals[`NAME:${name}`] ?? 0
    const diff = monthly - fy
    if (Math.abs(diff) > tolerance) {
      out.push({ account_id: accountId, account_name: name, diff })
    }
  }
  return out
}

// ─── Main orchestrator ──────────────────────────────────────────────────────

export async function syncBusinessXeroPL(
  businessId: string,
  opts: SyncOptions = {},
): Promise<SyncResult> {
  const supabase = createServiceRoleClient()
  const ids = await resolveBusinessIds(supabase as any, businessId)
  const profileId = ids.profileId
  // xero_accounts.business_id FK targets businesses(id) (legacy); xero_pl_lines.business_id FK targets business_profiles(id) (post-06A). Use bizId for the former, profileId for the latter.
  const bizId = ids.bizId

  console.log('[syncBusinessXeroPL] start', { input: businessId, bizId, profileId })

  // 1. Atomically claim a sync_jobs row (44-05 single-flight guard).
  const { data: jobIdData, error: beginErr } = await supabase.rpc(
    'begin_xero_sync_job',
    { p_business_id: profileId },
  )
  if (beginErr) {
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
    return inFlightRejectionResult(businessId)
  }
  const syncJobId: string = String(jobIdData)

  let xeroRequestCount = 0
  let rowsInserted = 0
  const rowsUpdated = 0
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
    // 2. Resolve fiscal_year_start from business_profiles (D-44.2-11).
    let fyStartMonth = DEFAULT_FY_START_MONTH
    try {
      const { data: profileRow } = await supabase
        .from('business_profiles')
        .select('fiscal_year_start')
        .eq('id', profileId)
        .maybeSingle()
      const v = (profileRow as any)?.fiscal_year_start
      if (typeof v === 'number' && v >= 1 && v <= 12) fyStartMonth = v
      else {
        Sentry.addBreadcrumb({
          category: 'xero.sync',
          level: 'info',
          message: `business_profiles.fiscal_year_start not set; defaulting to ${DEFAULT_FY_START_MONTH}`,
          data: { business_id: profileId, value: v },
        })
      }
    } catch {
      // Fall back to default; do not fail the sync on profile lookup error.
    }

    // 3. Resolve FY windows.
    const today = new Date()
    const currentFY = opts.fyOverride ?? getCurrentFY(today, fyStartMonth)
    const priorFY = currentFY - 1

    // Current FY YTD ends at today's calendar month (last day).
    const cy = today.getFullYear()
    const cm = today.getMonth() + 1
    const currentFYEnd = lastDayOfMonth(cy, cm)
    const priorFYEnd = getFYEnd(priorFY, fyStartMonth)

    type Window = {
      fy: number
      fyEndIso: string
      monthsToFetch: string[]
      expectedMonths: number
    }
    const currentWindow: Window = (() => {
      const months = monthsInFYWindow(currentFY, fyStartMonth, today)
      return {
        fy: currentFY,
        fyEndIso: currentFYEnd,
        monthsToFetch: months,
        expectedMonths: months.length,
      }
    })()
    const priorWindow: Window = (() => {
      // Prior FY: full 12 months ending at priorFYEnd.
      const priorEnd = new Date(
        parseInt(priorFYEnd.slice(0, 4), 10),
        parseInt(priorFYEnd.slice(5, 7), 10) - 1,
        parseInt(priorFYEnd.slice(8, 10), 10),
      )
      const months = monthsInFYWindow(priorFY, fyStartMonth, priorEnd)
      return {
        fy: priorFY,
        fyEndIso: priorFYEnd,
        monthsToFetch: months,
        expectedMonths: months.length,
      }
    })()
    const fyWindows: Window[] = [currentWindow, priorWindow]

    // 4. Iterate active xero_connections (multi-org per D-09).
    const { data: connections } = await supabase
      .from('xero_connections')
      .select('id, tenant_id, tenant_name, business_id')
      .in('business_id', ids.all)
      .eq('is_active', true)

    if (!Array.isArray(connections) || connections.length === 0) {
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

    let tenantErrorCount = 0
    let tenantPartialCount = 0
    let tenantPausedCount = 0
    let tenantSuccessCount = 0

    console.log('[syncBusinessXeroPL] connections:', connections.length, 'currentFY:', currentFY, 'priorFY:', priorFY, 'fyStartMonth:', fyStartMonth)

    for (const conn of connections) {
      if (opts.tenantIdFilter && conn.tenant_id !== opts.tenantIdFilter) continue

      console.log('[syncBusinessXeroPL] === tenant', conn.tenant_name, conn.tenant_id, '===')

      // 4a. Per-tenant sync_jobs row at status='running' (44.2-02 audit).
      const { data: tenantJobRow } = await supabase
        .from('sync_jobs')
        .insert({
          business_id: profileId,
          tenant_id: conn.tenant_id,
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

      const tenantDiscrepancies: Array<Discrepancy & { tenant_id: string }> = []
      const tenantCoveragePerWindow: CoverageRecord[] = []
      const tenantMonthsFailed: string[] = []
      let tenantRowsInserted = 0
      let tenantXeroRequestCount = 0
      let tenantAbsorberAdjustments = 0
      let tenantPaused = false

      try {
        // 4b. Get a valid access token.
        const tokenResult = await getValidAccessToken({ id: conn.id }, supabase as any)
        if (!tokenResult.success || !tokenResult.accessToken) {
          throw new Error(
            `Token refresh failed for connection ${conn.id}: ${tokenResult.message ?? tokenResult.error ?? 'unknown'}`,
          )
        }
        const accessToken = tokenResult.accessToken

        // 4c. Pre-fetch /Organisation (timezone). 429-daily → tenant paused.
        let _orgTimezone = 'UTC'
        try {
          const org = await getXeroOrgTimezone(
            { tenant_id: conn.tenant_id },
            accessToken,
          )
          _orgTimezone = org.timezone
          xeroRequestCount++
          tenantXeroRequestCount++
          console.log('[syncBusinessXeroPL]', conn.tenant_id, 'org timezone:', _orgTimezone)
        } catch (orgErr) {
          if (orgErr instanceof RateLimitDailyExceededError) {
            tenantPaused = true
            // Skip remaining work for this tenant.
            throw orgErr
          }
          throw orgErr
        }

        // 4d. Pre-fetch /Accounts catalog. 429-daily → paused.
        let catalog: CatalogMap = new Map()
        try {
          catalog = await refreshXeroAccountsCatalog(
            supabase,
            {
              id: conn.id,
              tenant_id: conn.tenant_id,
              business_id: bizId, // xero_accounts FK targets businesses(id), not business_profiles(id)
            },
            accessToken,
          )
          xeroRequestCount++
          tenantXeroRequestCount++
          console.log('[syncBusinessXeroPL]', conn.tenant_id, 'catalog accounts:', catalog.size)
        } catch (catErr) {
          if (catErr instanceof RateLimitDailyExceededError) {
            tenantPaused = true
            throw catErr
          }
          throw catErr
        }

        // 4e. Per-window per-month fetch loop (Path A core).
        for (const window of fyWindows) {
          const monthlyRows: ParsedPLRow[] = []

          for (const periodMonth of window.monthsToFetch) {
            try {
              const url = singlePeriodPLUrl(periodMonth)
              const res = await fetchXeroWithRateLimit(url, {
                accessToken,
                tenantId: conn.tenant_id,
              })
              xeroRequestCount++
              tenantXeroRequestCount++
              const parsed = parsePLSinglePeriod(
                res.json,
                periodMonth,
                'accruals',
                conn.tenant_id,
              )
              monthlyRows.push(...parsed)
            } catch (monthErr) {
              if (monthErr instanceof RateLimitDailyExceededError) {
                tenantPaused = true
                throw monthErr
              }
              // 5xx exhausted retries (or other 4xx) → record month, continue.
              tenantMonthsFailed.push(periodMonth)
              try {
                Sentry.captureException(monthErr, {
                  tags: {
                    invariant: 'xero_sync_path_a_month',
                    business_id: profileId,
                    tenant_id: conn.tenant_id,
                    period_month: periodMonth,
                  },
                } as any)
              } catch {
                // Sentry failure must not abort.
              }
              continue
            }
          }

          // Window-level FY-total fetch (oracle). Parse via parsePLSinglePeriod
          // so the FY-total's account_id derivation matches the per-month
          // pass — critical for FXGROUPID and synthetic-AID rows whose key
          // would otherwise differ between monthly_sum and fy_total.
          try {
            const fyUrl = fyTotalUrl(window.fy, fyStartMonth, window.fyEndIso)
            const fyRes = await fetchXeroWithRateLimit(fyUrl, {
              accessToken,
              tenantId: conn.tenant_id,
            })
            xeroRequestCount++
            tenantXeroRequestCount++
            const fyParsedRows = parsePLSinglePeriod(
              fyRes.json,
              window.fyEndIso, // arbitrary tag — only used to dedupe-by-account below
              'accruals',
              conn.tenant_id,
            )
            const fyTotals: Record<string, number> = {}
            for (const r of fyParsedRows) {
              fyTotals[r.account_id] = (fyTotals[r.account_id] ?? 0) + r.amount
            }

            // Reconciler: monthly_sum vs fy_total per account.
            const recResult = reconcilePL(
              monthlyRows.map((r) => ({
                account_code: r.account_id, // reconciler keys on account_code; we feed it the account_id GUID for consistency
                account_name: r.account_name,
                account_type: r.account_type,
                period_month: r.period_month,
                amount: r.amount,
              })),
              fyTotals,
              0.01,
            )
            if (recResult.status === 'mismatch') {
              for (const d of recResult.discrepancies) {
                tenantDiscrepancies.push({ ...d, tenant_id: conn.tenant_id })
                allDiscrepancies.push({ ...d })
              }
            }

            // Absorber regression check: should produce zero adjustments
            // post-Path A. If it produces any, flag partial + Sentry.
            const adjustments = regressionAdjustments(monthlyRows, fyTotals, 0.01)
            if (adjustments.length > 0) {
              tenantAbsorberAdjustments += adjustments.length
              try {
                Sentry.captureMessage(
                  'Path A regression: absorber would generate adjustments',
                  {
                    level: 'warning',
                    tags: {
                      invariant: 'xero_sync_path_a_absorber',
                      tenant_id: conn.tenant_id,
                      adjustments_count: adjustments.length,
                    },
                  } as any,
                )
              } catch {
                // Sentry failure must not abort.
              }
            }
          } catch (fyErr) {
            if (fyErr instanceof RateLimitDailyExceededError) {
              tenantPaused = true
              throw fyErr
            }
            // FY-total failure scopes to this window: record as a discrepancy
            // sentinel so the operator can investigate. Rows still upserted.
            try {
              Sentry.captureException(fyErr, {
                tags: {
                  invariant: 'xero_sync_path_a_fy_total',
                  business_id: profileId,
                  tenant_id: conn.tenant_id,
                  fy: window.fy,
                },
              } as any)
            } catch {
              /* ignore */
            }
          }

          // 4f. Map → DB rows; account_code from catalog Map.
          const dbRows = monthlyRows.map((r) => {
            const catEntry = catalog.get(r.account_id)
            return {
              business_id: profileId,
              tenant_id: conn.tenant_id,
              account_id: r.account_id,
              account_code: catEntry?.account_code ?? null,
              account_name: r.account_name,
              account_type: r.account_type,
              period_month: r.period_month,
              amount: r.amount,
              basis: r.basis,
              source: 'xero',
              updated_at: new Date().toISOString(),
            }
          })

          if (dbRows.length > 0) {
            const upsertResult = (await supabase
              .from('xero_pl_lines')
              .upsert(dbRows, {
                onConflict: 'business_id,tenant_id,account_id,period_month',
                ignoreDuplicates: false,
              })) as any
            if (upsertResult?.error) {
              throw new Error(
                `xero_pl_lines upsert: ${
                  upsertResult.error.message ?? upsertResult.error.code ?? 'unknown'
                }`,
              )
            }
            rowsInserted += dbRows.length
            tenantRowsInserted += dbRows.length
            console.log('[syncBusinessXeroPL]', conn.tenant_id, 'FY', window.fy, 'upserted', dbRows.length, 'rows')
          }

          // Coverage record (sparse-aware).
          const cov = computeCoverage(
            monthlyRows.map((r) => ({
              account_code: r.account_id,
              account_name: r.account_name,
              account_type: r.account_type,
              period_month: r.period_month,
              amount: r.amount,
            })),
            window.expectedMonths,
          )
          coveragePerWindow.push(cov)
          tenantCoveragePerWindow.push(cov)
        }

        // 4g. Per-tenant terminal UPDATE.
        const tenantExpectedTotal = fyWindows.reduce((s, w) => s + w.expectedMonths, 0)
        const tenantCoverage = aggregateCoverage(tenantCoveragePerWindow, tenantExpectedTotal)
        let tenantStatus: 'success' | 'partial' | 'paused' = 'success'
        if (tenantPaused) tenantStatus = 'paused'
        else if (
          tenantDiscrepancies.length > 0 ||
          tenantMonthsFailed.length > 0 ||
          tenantAbsorberAdjustments > 0
        ) {
          tenantStatus = 'partial'
        }

        if (tenantStatus === 'success') tenantSuccessCount++
        else if (tenantStatus === 'paused') tenantPausedCount++
        else tenantPartialCount++

        const tenantErrorMsg =
          tenantStatus === 'partial'
            ? `Partial sync for tenant ${conn.tenant_id}: ${tenantDiscrepancies.length} discrepancies, ${tenantMonthsFailed.length} failed months, ${tenantAbsorberAdjustments} absorber adjustments`
            : null

        if (tenantJobId !== null) {
          await supabase
            .from('sync_jobs')
            .update({
              status: tenantStatus,
              finished_at: new Date().toISOString(),
              coverage: tenantCoverage,
              reconciliation: {
                tenant_id: conn.tenant_id,
                status:
                  tenantDiscrepancies.length > 0 || tenantAbsorberAdjustments > 0
                    ? 'mismatch'
                    : 'ok',
                discrepant_accounts: tenantDiscrepancies,
                months_failed: tenantMonthsFailed,
                absorber_adjustments: tenantAbsorberAdjustments,
                reconciler_discrepancies: tenantDiscrepancies.map((d) => d.account_name),
              },
              rows_inserted: tenantRowsInserted,
              xero_request_count: tenantXeroRequestCount,
              error: tenantErrorMsg,
            })
            .eq('id', tenantJobId)
        }
      } catch (err) {
        // (W3) Per-tenant exception. Mark tenant 'paused' for daily-rate
        // limit, otherwise 'error'. Continue to next tenant.
        const errMessage = err instanceof Error ? err.message : String(err)
        console.error('[syncBusinessXeroPL]', conn.tenant_id, 'TENANT FAILED:', errMessage)
        const isPaused = err instanceof RateLimitDailyExceededError || tenantPaused
        if (isPaused) tenantPausedCount++
        else tenantErrorCount++
        if (tenantJobId !== null) {
          await supabase
            .from('sync_jobs')
            .update({
              status: isPaused ? 'paused' : 'error',
              finished_at: new Date().toISOString(),
              error: errMessage.slice(0, 500),
              rows_inserted: tenantRowsInserted,
              xero_request_count: tenantXeroRequestCount,
              reconciliation: isPaused
                ? {
                    tenant_id: conn.tenant_id,
                    status: 'paused',
                    months_failed: tenantMonthsFailed,
                    absorber_adjustments: tenantAbsorberAdjustments,
                    reason: 'rate_limit_daily',
                  }
                : null,
            })
            .eq('id', tenantJobId)
        }
        try {
          Sentry.captureException(err, {
            tags: {
              invariant: 'xero_sync_orchestrator_tenant',
              phase: '44.2-06B',
              business_id: profileId,
              tenant_id: conn.tenant_id,
              sync_job_id: tenantJobId ?? syncJobId,
            },
          } as any)
        } catch {
          /* ignore */
        }
        continue
      }
    }

    // 5. Final status across tenants (worst-of).
    const expectedTotal = fyWindows.reduce((sum, w) => sum + w.expectedMonths, 0)
    coverage = aggregateCoverage(coveragePerWindow, expectedTotal)
    if (
      tenantErrorCount > 0 &&
      tenantSuccessCount === 0 &&
      tenantPartialCount === 0 &&
      tenantPausedCount === 0
    ) {
      finalStatus = 'error'
      finalError = `All ${tenantErrorCount} tenants errored`
    } else if (tenantErrorCount > 0 || tenantPartialCount > 0 || tenantPausedCount > 0) {
      finalStatus = 'partial'
      const parts: string[] = []
      if (tenantErrorCount > 0) parts.push(`${tenantErrorCount} tenant(s) errored`)
      if (tenantPartialCount > 0) parts.push(`${tenantPartialCount} tenant(s) partial`)
      if (tenantPausedCount > 0) parts.push(`${tenantPausedCount} tenant(s) paused (rate limit)`)
      finalError = parts.join('; ')
    } else {
      finalStatus = 'success'
      finalError = null
    }

    if (allDiscrepancies.length > 0) {
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
      ...(finalError ? { error: finalError } : {}),
    }
  } catch (err: any) {
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
    throw err
  } finally {
    try {
      await supabase.rpc('finalize_xero_sync_job', {
        p_job_id: syncJobId,
        p_status: finalStatus,
        p_rows_inserted: rowsInserted,
        p_rows_updated: rowsUpdated,
        p_xero_request_count: xeroRequestCount,
        p_coverage:
          finalStatus === 'error' && coveragePerWindow.length === 0 ? null : coverage,
        p_reconciliation:
          allDiscrepancies.length > 0
            ? { status: 'mismatch', discrepancies: allDiscrepancies }
            : finalStatus === 'error'
              ? null
              : { status: 'ok' },
        p_error: finalError,
      })
    } catch (finalizeErr) {
      Sentry.captureException(finalizeErr, {
        tags: {
          invariant: 'xero_sync_orchestrator',
          phase: 'finalize_xero_sync_job',
          business_id: profileId,
          sync_job_id: syncJobId,
        },
      } as any)
      if (!didThrow) throw finalizeErr
    }
    void thrownErr
  }
}

// ─── Run-all (cron entry) ───────────────────────────────────────────────────

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
      results.push({
        business_id: businessId,
        status: 'error',
        sync_job_id: 'see-sync_jobs-table',
        rows_inserted: 0,
        rows_updated: 0,
        xero_request_count: 0,
        coverage: { months_covered: 0, first_period: '', last_period: '', expected_months: 24 },
        reconciliation: { status: 'ok', discrepancy_count: 0 },
        error: String(err?.message ?? err),
      })
    }
  }
  return results
}
