/**
 * Phase 44 Plan 44-05 — thin shim around the canonical sync orchestrator.
 *
 * Retired: e337a42 dedup-after-fetch, 9faa902 reconciler auto-correct,
 * 8305eee coverage gate, the multi-window inline parser, the delete-then-
 * insert wide-format writes. ALL sync logic now lives in
 * src/lib/xero/sync-orchestrator.ts and writes long-format rows ON CONFLICT
 * to xero_pl_lines via the plain natural-key unique constraint added in
 * 44-05 migration 4.
 *
 * Invocations:
 *   GET — Vercel-Cron compatibility, not itself scheduled in vercel.json.
 *     Fails closed: 401 unless CRON_SECRET is set AND the bearer matches.
 *     Runs runSyncForAllBusinesses, the same orchestrator entry the scheduled
 *     /api/cron/sync-all-xero route uses.
 *
 * There is deliberately no POST (AUTHZ-A, app-authz audit 24 Aug 2026). The
 * old "manual coach trigger" checked only that a session existed, so any
 * signed-in user — a client owner of an unrelated business included — could
 * sync any business by id, or start the fleet-wide loop with { all: true },
 * and read back raw SyncResult error strings. Nothing called it, so it was
 * deleted rather than gated; Next.js answers an unexported method with 405
 * before any code here runs. The manual levers are:
 *   - one business: POST /api/Xero/refresh-pl (verifyBusinessAccess) or
 *     POST /api/monthly-report/sync-xero (owner / assigned coach / super_admin)
 *   - the fleet: the Vercel cron "Run" button on /api/cron/sync-all-xero, whose
 *     800s ceiling, heartbeats and chaining are what that loop is sized for.
 * Re-adding a POST here needs per-business authz and a super_admin-only fleet
 * form — src/__tests__/api/xero-sync-all-post-removed.test.ts pins this.
 */

import { NextRequest, NextResponse } from 'next/server'
import { runSyncForAllBusinesses } from '@/lib/xero/sync-orchestrator'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Note: per-sync observability (Sentry capture, sync_jobs audit row) lives
// inside syncBusinessXeroPL / runSyncForAllBusinesses (orchestrator from
// 44-04). These shims add only top-level try/catch so a thrown orchestrator
// error returns a structured 500 instead of bubbling up as an unhandled
// Next.js error — the orchestrator has already captured the error in Sentry
// + finalized the sync_jobs row before re-throwing.

export async function GET(request: NextRequest) {
  // SEC-02 (Phase 46): fail closed. If CRON_SECRET is unset OR the bearer
  // doesn't match, reject — including in dev/preview. The previous
  // 3-conditional guard (cronSecret && NODE_ENV === 'production' && ...)
  // short-circuited if CRON_SECRET was absent in prod, leaving the route
  // unauthenticated. Devs should set CRON_SECRET=local-dev-secret in
  // .env.local. Pattern matches cron/daily-health-report:13-15.
  const cronSecret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const results = await runSyncForAllBusinesses()
    return NextResponse.json({ success: true, results })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: String(err?.message ?? err) },
      { status: 500 },
    )
  }
}
