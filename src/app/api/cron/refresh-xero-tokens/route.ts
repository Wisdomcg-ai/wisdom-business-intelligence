import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import {
  getValidAccessToken,
  REFRESH_THRESHOLD_MINUTES,
} from '@/lib/xero/token-manager'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { recordHeartbeat } from '@/lib/cron/heartbeat'

/**
 * Phase 69-04 — Pre-expiry early-warning threshold.
 *
 * Fires a Sentry warning per tenant when `(expires_at - now()) < 24h` AND
 * the current cron tick's per-row status was NOT `refreshed` (i.e. cron
 * observed an expiring token but did not produce a new one). This is the
 * sensor that closes the diagnostic gap named in 69-DIAGNOSIS.md root
 * cause 2 — "what happens when the cron runs" telemetry was excellent in
 * Phase 53, but there was no early-warning signal for the case where the
 * cron's per-tenant call succeeded structurally but the token was about
 * to die anyway.
 *
 * 24h chosen because the cron runs every 6h: 24h = 4 cron ticks of grace
 * before expiry. A single missed tick still leaves 3 chances to warn
 * BEFORE the token dies.
 */
const PRE_EXPIRY_WARNING_HOURS = 24
const PRE_EXPIRY_WARNING_MS = PRE_EXPIRY_WARNING_HOURS * 60 * 60 * 1000
const CRON_PATH = '/api/cron/refresh-xero-tokens'

/**
 * Phase 53 Plan 53-04 — Proactive Xero token refresh cron.
 *
 * Schedule: "0 *\/6 * * *" UTC (registered in vercel.json) = 4 invocations/day
 * (00:00, 06:00, 12:00, 18:00 UTC). Allowed on Vercel Pro; Hobby tier minimum
 * is daily so this cron requires Pro (which the project already runs on for
 * the existing per-minute / multi-daily crons).
 *
 * Why SEPARATE from the daily `sync-all-xero` cron (per 53-RESEARCH §"Open
 * Questions" #1):
 *   (a) sync-all-xero does data fetch — failures can be Xero rate limits,
 *       transient API errors, or data-shape changes — none of which signal
 *       "token health". Mixing the two confuses telemetry.
 *   (b) Refresh-only is much cheaper (~200ms per call vs minutes for a sync)
 *       and can run more frequently without straining Xero or our function
 *       budget.
 *   (c) Clearer Sentry breadcrumbs: `cron_refresh_xero_tokens*` invariants
 *       fire only on real token problems, so ops can wire alerts without
 *       drowning in sync-pipeline noise.
 *
 * Purpose:
 *   - Reset Xero's 60-day idle TTL on every active refresh-token 4× per day,
 *     so even completely dormant connections (paused clients, weekend gaps)
 *     stay alive indefinitely.
 *   - Surface token-health problems via Sentry before users notice — rather
 *     than waiting for the next user-driven sync to fail.
 *   - Give the rotation race fewer windows to land between long gaps —
 *     refresh happens proactively well before the 30-min access-token TTL
 *     forces an emergency refresh under user load.
 *
 * Auth: Vercel sets `Authorization: Bearer ${CRON_SECRET}` automatically.
 * Fail-closed (returns 401 if CRON_SECRET is unset OR header mismatch) —
 * SEC-02 standard, mirrors the pattern in
 * src/app/api/Xero/sync-all/route.ts:46-50. DO NOT use the looser
 * `auth !== \`Bearer ${process.env.CRON_SECRET}\`` form: when CRON_SECRET
 * is undefined that comparison passes when the header is also undefined.
 *
 * Idempotency: each call to getValidAccessToken is idempotent — if the token
 * is still valid, it short-circuits; if past threshold, refreshes once. The
 * 30s lock + the post-lock re-fetch from 53-03 make this safe under
 * concurrent invocations (unlikely but possible if cron triggers overlap or
 * a user-driven refresh fires in parallel).
 *
 * Iteration: sequential, NOT parallel. At ~20 active connections × ~200ms
 * each = ~4s. Even at 200 connections × 600ms worst case = 120s, comfortably
 * under the 300s maxDuration budget. Parallel would hammer Xero's identity
 * endpoint and risk rate limits without meaningful speedup. Revisit
 * maxDuration / chunked iteration if portfolio crosses ~400 connections
 * (would put us at ~80% of the 300s budget).
 *
 * Snapshot semantics: the route queries `is_active=true` rows ONCE at the
 * start of the run, then iterates by row.id from that snapshot. By the time
 * the loop reaches row N, an earlier row may have been deactivated by
 * getValidAccessToken (per 53-03's policy). That is expected — the loop
 * tolerates it, reports the deactivation as `status: 'deactivated'`, and
 * continues. Do NOT re-query inside the loop or filter on is_active.
 *
 * Aggregate response shape (always 200 unless aggregate-level error):
 *   { success: true, total, refreshed, still_valid, failed, deactivated, results }
 * Per-connection failures do NOT fail the whole run — that would mask the
 * rest of the portfolio. Aggregate-level errors (e.g. supabase fetch throws)
 * return 500 and capture to Sentry with invariant `cron_refresh_xero_tokens`.
 *
 * Coordination with 53-05: that plan will enrich the per-connection Sentry
 * tags (full Xero error body, error category, route context). This plan
 * keeps tags minimal — just enough to identify the connection and the
 * invariant — and lets 53-05 expand them.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes; matches sync-all-xero/route.ts

interface PerConnectionResult {
  connection_id: string
  tenant_name: string | null
  business_id: string
  status: 'refreshed' | 'still_valid' | 'failed' | 'deactivated'
  error?: string
}

/**
 * Best-effort Sentry capture — wrapped so a Sentry failure never aborts the
 * loop. Mirrors the convention used in sync-orchestrator.ts.
 */
function safeSentryCapture(err: unknown, tags: Record<string, string | undefined>, extra?: Record<string, unknown>) {
  try {
    Sentry.captureException(err, { tags, extra } as any)
  } catch {
    // intentionally swallow — Sentry must never break a cron run
  }
}

export async function GET(req: NextRequest) {
  // Fail-closed auth gate (SEC-02). Mirrors src/app/api/Xero/sync-all/route.ts:46-50.
  // The looser form `auth !== \`Bearer ${process.env.CRON_SECRET}\`` passes
  // when both sides are undefined — see SEC-02 regression test
  // src/__tests__/api/xero-sync-all-cron-auth.test.ts.
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createServiceRoleClient()

    // Snapshot active connections. We capture the row IDs ONCE here; the loop
    // below tolerates per-row deactivation that happens during iteration.
    const { data, error } = await supabase
      .from('xero_connections')
      .select('id, business_id, tenant_id, tenant_name, expires_at')
      .eq('is_active', true)

    if (error) {
      throw new Error(error.message ?? 'Failed to fetch xero_connections')
    }

    const rows = data ?? []
    const total = rows.length

    if (total === 0) {
      // Phase 69-04: heartbeat even on zero-rows path so cadence observers
      // can see "cron fired, nothing to do" vs "cron didn't fire".
      await recordHeartbeat({
        cronPath: CRON_PATH,
        status: 'success',
        metadata: { total: 0 },
      })
      return NextResponse.json({
        success: true,
        total: 0,
        refreshed: 0,
        still_valid: 0,
        failed: 0,
        deactivated: 0,
        results: [],
      })
    }

    // Pre-compute the threshold once. Imported from token-manager (53-04 F2)
    // so still_valid vs refreshed inference automatically tracks the source
    // of truth — no silent desync if REFRESH_THRESHOLD_MINUTES ever changes.
    const REFRESH_THRESHOLD_MS = REFRESH_THRESHOLD_MINUTES * 60 * 1000
    const now = Date.now()

    let refreshed = 0
    let still_valid = 0
    let failed = 0
    let deactivated = 0
    const results: PerConnectionResult[] = []

    // Sequential per-connection loop. Each iteration is wrapped in its own
    // try/catch so one bad connection cannot abort the rest of the run.
    for (const row of rows) {
      const baseResult: Pick<PerConnectionResult, 'connection_id' | 'tenant_name' | 'business_id'> = {
        connection_id: row.id,
        tenant_name: row.tenant_name ?? null,
        business_id: row.business_id,
      }

      // Pre-call status hint — if the row's expires_at is already past the
      // threshold, a successful result means a real Xero refresh happened;
      // otherwise the token-manager short-circuited as still-fresh.
      const wasFreshBeforeCall =
        new Date(row.expires_at).getTime() > now + REFRESH_THRESHOLD_MS

      try {
        const result = await getValidAccessToken({ id: row.id }, supabase)

        if (result.success) {
          if (wasFreshBeforeCall) {
            still_valid += 1
            results.push({ ...baseResult, status: 'still_valid' })
          } else {
            refreshed += 1
            results.push({ ...baseResult, status: 'refreshed' })
          }
        } else if (result.shouldDeactivate) {
          // token-manager already wrote is_active=false internally per
          // 53-03's tightened policy AND fired the canonical Sentry event
          // (`xero_connection_deactivated`) per 53-05.
          //
          // Phase 53-05 (Issue C from PLAN-CHECK): the per-connection
          // `cron_refresh_xero_tokens_deactivated` Sentry capture that
          // previously lived here has been REMOVED. Token-manager fires the
          // canonical event with full diagnostic context (xero_status,
          // xero_error_body, retry_count, etc.). Capturing again here would
          // produce TWO Sentry events for ONE root cause — violating the
          // 53-05 "exactly ONE Sentry event per failure" invariant.
          //
          // Cron retains:
          //   - Aggregate capture (`cron_refresh_xero_tokens` on aggregate
          //     errors) below.
          //   - Per-connection FAILURE capture (`cron_refresh_xero_tokens_failed`
          //     for transient failures that did NOT deactivate — those are
          //     still cron-context-specific signal worth capturing).
          //   - Per-connection THROW capture
          //     (`cron_refresh_xero_tokens_per_connection`) for unexpected
          //     exceptions outside the normal failure path.
          deactivated += 1
          results.push({
            ...baseResult,
            status: 'deactivated',
            error: result.message,
          })
        } else {
          // Transient failure. Will be retried on the next cron tick (or by
          // a user-driven sync) — token-manager's policy already discriminated
          // between transient and terminal errors; we just record it.
          failed += 1
          results.push({
            ...baseResult,
            status: 'failed',
            error: result.message,
          })
          safeSentryCapture(
            new Error(
              `Xero token refresh failed (transient): ${result.error ?? 'unknown'}`,
            ),
            {
              invariant: 'cron_refresh_xero_tokens_failed',
              connection_id: row.id,
              business_id: row.business_id,
              tenant_id: row.tenant_id,
            },
            { error: result.error, message: result.message },
          )
        }
      } catch (err: any) {
        // getValidAccessToken threw outside its normal failure path. Treat as
        // failed (not deactivated) — we do not have a confident signal for
        // terminal token death from a thrown exception.
        const message = String(err?.message ?? err)
        failed += 1
        results.push({
          ...baseResult,
          status: 'failed',
          error: message,
        })
        safeSentryCapture(err, {
          invariant: 'cron_refresh_xero_tokens_per_connection',
          connection_id: row.id,
          business_id: row.business_id,
          tenant_id: row.tenant_id,
        })
      }

      // Phase 69-04 — Pre-expiry early-warning sensor.
      //
      // Fires when the row's expires_at is within 24h AND the current
      // tick did not produce a fresh access token (status != refreshed
      // and != deactivated). Distinct from cron_refresh_xero_tokens_failed
      // (which fires only on transient per-tick failures); xero_token_pre_expiry
      // is the OBSERVATION that the token is about to die, regardless of
      // whether the current tick succeeded structurally. Per 53-05's "exactly
      // one event per failure mode" invariant, this is a SEPARATE failure mode
      // (token-aging vs transient-refresh-failure), so emitting alongside
      // cron_refresh_xero_tokens_failed is correct, not duplicative.
      //
      // Deactivated rows are skipped — token-manager already fired
      // xero_connection_deactivated; pre-expiry observation is redundant
      // once the row is terminal.
      const lastResult = results[results.length - 1]
      if (
        lastResult &&
        lastResult.connection_id === row.id &&
        lastResult.status !== 'refreshed' &&
        lastResult.status !== 'deactivated'
      ) {
        const expiresAtMs = new Date(row.expires_at).getTime()
        const msUntilExpiry = expiresAtMs - Date.now()
        if (msUntilExpiry > 0 && msUntilExpiry < PRE_EXPIRY_WARNING_MS) {
          const hoursUntilExpiry = Math.floor(
            msUntilExpiry / (60 * 60 * 1000),
          )
          try {
            Sentry.captureMessage(
              'Xero token within 24h of expiry — cron did not refresh',
              {
                level: 'warning',
                tags: {
                  invariant: 'xero_token_pre_expiry',
                  connection_id: row.id,
                  business_id: row.business_id,
                  tenant_id: row.tenant_id,
                  hours_until_expiry: String(hoursUntilExpiry),
                  last_status: lastResult.status,
                },
                extra: {
                  expires_at: row.expires_at,
                  tenant_name: row.tenant_name,
                },
              } as any,
            )
          } catch {
            // Sentry outage must never abort a cron run.
          }
        }
      }
    }

    // Phase 69-04: heartbeat. Status='partial' if any rows failed; otherwise
    // 'success'. Aggregate failure path captures this differently below.
    const heartbeatStatus: 'success' | 'partial' =
      failed > 0 || deactivated > 0 ? 'partial' : 'success'
    await recordHeartbeat({
      cronPath: CRON_PATH,
      status: heartbeatStatus,
      metadata: { total, refreshed, still_valid, failed, deactivated },
    })

    return NextResponse.json({
      success: true,
      total,
      refreshed,
      still_valid,
      failed,
      deactivated,
      results,
    })
  } catch (err: any) {
    safeSentryCapture(err, { invariant: 'cron_refresh_xero_tokens' })
    // Phase 69-04: heartbeat on aggregate-failure path so the cadence query
    // still sees a row for this invocation (just with status='failed').
    await recordHeartbeat({
      cronPath: CRON_PATH,
      status: 'failed',
      errorMessage: String(err?.message ?? err),
    })
    return NextResponse.json(
      { success: false, error: String(err?.message ?? err) },
      { status: 500 },
    )
  }
}
