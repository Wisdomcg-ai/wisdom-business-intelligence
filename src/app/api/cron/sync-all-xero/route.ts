import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { runSyncForAllBusinesses } from '@/lib/xero/sync-orchestrator'

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

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const results = await runSyncForAllBusinesses()
    const errored = results.filter((r) => r.status === 'error').length
    const partial = results.filter((r) => r.status === 'partial').length
    const success = results.filter((r) => r.status === 'success').length
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
    return NextResponse.json(
      { success: false, error: String(err?.message ?? err) },
      { status: 500 },
    )
  }
}
