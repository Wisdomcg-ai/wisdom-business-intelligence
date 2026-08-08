import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { waitUntil } from '@vercel/functions'
import { runSyncForAllBusinesses, SYNC_SKIPPED_BUDGET } from '@/lib/xero/sync-orchestrator'
import { recordHeartbeat } from '@/lib/cron/heartbeat'
import { getAppBaseUrl } from '@/lib/config/brand'
import { z } from 'zod'
import { withQuerySchema } from '@/lib/api/with-schema'

const CRON_PATH = '/api/cron/sync-all-xero'

/**
 * Phase 44 D-11 — Xero P&L sync, fleet rotation.
 *
 * Schedule: `0 4,10,16,22 * * *` UTC (registered in vercel.json) — every 6h,
 * keeping the original 16:00 slot so reconciliation-watch at 18:00 still runs
 * two hours after a sync. PLUS self-chaining (the pattern proven on the Pulse
 * fork since 4 Aug 2026): when the wall-clock budget expires with connections
 * still budget-skipped, the run fires ONE request at its own URL (the secret
 * never leaves the server) and exits; the successor is a fresh clock resuming
 * the stalest-first rotation. Capacity therefore scales itself to fleet size —
 * the 4 daily slots are anchors, not the ceiling. Depth-capped so a
 * pathological connection can't loop forever; overlap with a scheduled slot is
 * safe because the orchestrator's single-flight sync_jobs guard rejects
 * double-syncs per business.
 *
 * Auth: Vercel sets `Authorization: Bearer ${CRON_SECRET}` automatically when
 * the CRON_SECRET env var is configured. Manual / dev invocations must pass
 * the same header.
 *
 * Body: returns `{success, totalBusinesses, successCount, partialCount,
 * erroredCount, budgetSkipped, chainDepth, willChain, results: SyncResult[]}`.
 * Status 401 on bad auth, 500 on orchestrator throw (with Sentry capture for
 * the on-call to follow).
 *
 * This is a thin shim — all sync logic lives in
 * `src/lib/xero/sync-orchestrator.ts` (Phase 44 plan 44-04). Per-business
 * iteration is sequential to respect Xero rate limits; the orchestrator's
 * 700s budget (not this maxDuration) is what bounds a single invocation.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 800 // Fluid Compute ceiling — a 300s self-cap kills runs partway through the fleet

function safeSentryCapture(err: unknown, tags: Record<string, string | undefined>) {
  try {
    Sentry.captureException(err, { tags } as any)
  } catch {
    // Sentry must never break a cron run
  }
}

async function getHandler(req: NextRequest) {
  // Fail-closed: reject when CRON_SECRET is unset so a missing secret can never
  // silently reopen this endpoint to unauthenticated callers (`Bearer undefined`).
  const cronSecret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // Chain link number (0 = scheduled run). Header, not query string, because
  // withQuerySchema strictly validates the query.
  const chainDepth = parseInt(req.headers.get('x-sync-chain-depth') ?? '0', 10) || 0
  const MAX_CHAIN_DEPTH = 6 // 6 links × ~10 businesses/link covers well past 50 clients

  // Stamp BEFORE the work: a run killed at the ceiling must leave evidence it
  // started, not silence. Both completion writes below die with a killed run,
  // and a killed run with no heartbeat reads as "not scheduled" — the exact
  // misdirection that hid the two-month CRON_SECRET outage. The completion
  // path overwrites this with the real outcome.
  await recordHeartbeat({
    cronPath: CRON_PATH,
    status: 'partial',
    errorMessage: 'run started — not yet completed',
  }).catch(() => {})

  try {
    const results = await runSyncForAllBusinesses()
    const errored = results.filter((r) => r.status === 'error').length
    const partial = results.filter((r) => r.status === 'partial').length
    const success = results.filter((r) => r.status === 'success').length

    // REAL failures (auth, API, data) — as distinct from budget-skips, which are
    // the rotation working as designed. One aggregate event per run, so a
    // genuinely broken connection can't hide inside "ran out of time" noise,
    // and a pile of skips can't spam Sentry with a pile of events.
    const realFailures = results.filter(
      (r) => r.status === 'error' && r.error !== SYNC_SKIPPED_BUDGET,
    )
    if (realFailures.length > 0) {
      try {
        Sentry.captureMessage(
          `sync-all-xero: ${realFailures.length} connection(s) failed: ` +
            realFailures.map((r) => `${r.business_id}: ${r.error ?? 'unknown'}`).join(' | ').slice(0, 900),
          { level: 'error', tags: { invariant: 'cron_sync_all_xero_connection_failed' } } as any,
        )
      } catch {
        // Sentry must never break the cron
      }
    }

    // Phase 69-04 — invocation heartbeat. Status reflects aggregate outcome
    // so a query for 'last sync-all-xero heartbeat' surfaces partial degradation
    // (some tenants failed) vs full success vs full failure.
    const budgetSkipped = results.filter(
      (r) => r.status === 'error' && r.error === SYNC_SKIPPED_BUDGET,
    ).length
    const willChain = budgetSkipped > 0 && chainDepth < MAX_CHAIN_DEPTH

    const heartbeatStatus: 'success' | 'partial' =
      errored > 0 || partial > 0 ? 'partial' : 'success'
    await recordHeartbeat({
      cronPath: CRON_PATH,
      status: heartbeatStatus,
      metadata: {
        total: results.length,
        success,
        partial,
        errored,
        budgetSkipped,
        // In the DB, not just the response body, so the chain is visible — and
        // its failures diagnosable — from cron_heartbeats alone.
        chainDepth,
        willChain,
      },
    })

    // Connections remain and we have chain budget → hand the baton to a fresh
    // invocation. waitUntil (NOT an aborted fetch) and the CANONICAL origin are
    // both hard-won lessons from the Pulse fork: an early abort cancels the
    // spawned invocation, and a cron request's own origin does not route back
    // into the app. Failure to chain is never silent, but never fatal either —
    // the 6-hourly schedule is the fallback ratchet.
    if (willChain) {
      try {
        const selfUrl = new URL(CRON_PATH, getAppBaseUrl())
        waitUntil(
          fetch(selfUrl, {
            headers: {
              authorization: `Bearer ${cronSecret}`,
              'x-sync-chain-depth': String(chainDepth + 1),
            },
          }).catch((e) => {
            safeSentryCapture(e, { invariant: 'cron_sync_all_xero_chain_handoff' })
          })
        )
      } catch (e) {
        safeSentryCapture(e, { invariant: 'cron_sync_all_xero_chain_handoff' })
      }
    }

    return NextResponse.json({
      success: true,
      totalBusinesses: results.length,
      successCount: success,
      partialCount: partial,
      erroredCount: errored,
      budgetSkipped,
      chainDepth,
      willChain,
      results,
    })
  } catch (err: any) {
    Sentry.captureException(err, {
      tags: { invariant: 'cron_sync_all_xero' },
    } as any)
    // Phase 69-04 — failure heartbeat so the cadence query still records
    // the invocation.
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

// Input-less cron GET (auth via Bearer header) — observe wrapper, permissive empty schema.
export const GET = withQuerySchema(
  'cron/sync-all-xero',
  z.object({}),
  getHandler as unknown as (request: Request) => Promise<Response>
)
