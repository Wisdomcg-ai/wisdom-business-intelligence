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
 *   GET — Vercel-Cron compatibility. Authenticated via Bearer ${CRON_SECRET}
 *     when CRON_SECRET is set (production guard). Falls through to
 *     runSyncForAllBusinesses, the same orchestrator entry the dedicated
 *     /api/cron/sync-all-xero route uses.
 *   POST — manual coach trigger. Body: { businessId? } single business, or
 *     { all: true } all-businesses (sequential). Authenticated via the user
 *     session (createRouteHandlerClient).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import {
  runSyncForAllBusinesses,
  syncBusinessXeroPL,
} from '@/lib/xero/sync-orchestrator'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Note: per-sync observability (Sentry capture, sync_jobs audit row) lives
// inside syncBusinessXeroPL / runSyncForAllBusinesses (orchestrator from
// 44-04). These shims add only top-level try/catch so a thrown orchestrator
// error returns a structured 500 instead of bubbling up as an unhandled
// Next.js error — the orchestrator has already captured the error in Sentry
// + finalized the sync_jobs row before re-throwing.

export async function GET(request: NextRequest) {
  // Vercel-Cron flow: optional CRON_SECRET gate. In prod we require it; in
  // dev/preview we allow the call through so a coach can hit the URL by
  // hand without juggling secrets.
  const cronSecret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (cronSecret && process.env.NODE_ENV === 'production' && auth !== `Bearer ${cronSecret}`) {
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

export async function POST(request: NextRequest) {
  const supabase = await createRouteHandlerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({} as any))
  const businessId: string | undefined = body.businessId
  const allBusinesses: boolean = body.all === true

  try {
    if (allBusinesses) {
      const results = await runSyncForAllBusinesses()
      return NextResponse.json({ success: true, results })
    }

    if (!businessId) {
      return NextResponse.json({ error: 'businessId required' }, { status: 400 })
    }
    const result = await syncBusinessXeroPL(businessId)
    return NextResponse.json({ success: true, result })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: String(err?.message ?? err) },
      { status: 500 },
    )
  }
}
