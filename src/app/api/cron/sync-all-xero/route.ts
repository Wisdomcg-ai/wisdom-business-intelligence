import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { runSyncForAllBusinesses } from '@/lib/xero/sync-orchestrator'
import { recordHeartbeat } from '@/lib/cron/heartbeat'
import { z } from 'zod'
import { withQuerySchema } from '@/lib/api/with-schema'

const CRON_PATH = '/api/cron/sync-all-xero'

/**
 * Phase 44 D-11 — Nightly Xero P&L sync.
 *
 * Schedule: `0 16 * * *` UTC (registered in vercel.json).
 *   - 02:00 AEDT during Australian summer (eastern-AU daylight saving).
 *   - 03:00 AEST during winter — acceptable since the sync is not
 *     time-critical and the DST drift is one hour.
 *
 * Auth: Vercel sets `Authorization: Bearer ${CRON_SECRET}` automatically when
 * the CRON_SECRET env var is configured. Manual / dev invocations must pass
 * the same header.
 *
 * Body: returns `{success, totalBusinesses, successCount, partialCount,
 * erroredCount, results: SyncResult[]}`. Status 401 on bad auth, 500 on
 * orchestrator throw (with Sentry capture for the on-call to follow).
 *
 * This is a thin shim — all sync logic lives in
 * `src/lib/xero/sync-orchestrator.ts` (Phase 44 plan 44-04). Per-business
 * iteration is sequential to stay within the Vercel function maxDuration
 * (300s) and Xero rate limits.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes; matches sync-all/route.ts

async function getHandler(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const results = await runSyncForAllBusinesses()
    const errored = results.filter((r) => r.status === 'error').length
    const partial = results.filter((r) => r.status === 'partial').length
    const success = results.filter((r) => r.status === 'success').length

    // Phase 69-04 — invocation heartbeat. Status reflects aggregate outcome
    // so a query for 'last sync-all-xero heartbeat' surfaces partial degradation
    // (some tenants failed) vs full success vs full failure.
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
      },
    })

    return NextResponse.json({
      success: true,
      totalBusinesses: results.length,
      successCount: success,
      partialCount: partial,
      erroredCount: errored,
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
