/**
 * Phase 44 Plan 44-05 — thin shim around syncBusinessXeroPL.
 *
 * Per-business manual refresh from XeroSyncButton (and similar coach UI).
 * All sync logic — multi-window canonical fetch, parser, reconciler, ON
 * CONFLICT upsert, sync_jobs audit, Sentry instrumentation — lives in
 * src/lib/xero/sync-orchestrator.ts.
 *
 * Auth: user session via createRouteHandlerClient + verifyBusinessAccess
 * (preserved verbatim from the legacy 339-LOC implementation).
 *
 * Body: `{ business_id }` either query string or JSON. Returns the orchestrator's
 * SyncResult on success.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'
import { syncBusinessXeroPL } from '@/lib/xero/sync-orchestrator'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const supabase = await createRouteHandlerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Resolve business_id from JSON body or ?businessId query string.
  const body = await request.json().catch(() => ({} as any))
  const { searchParams } = new URL(request.url)
  const businessId: string | undefined =
    body.business_id ?? body.businessId ?? searchParams.get('businessId') ?? undefined
  if (!businessId) {
    return NextResponse.json({ error: 'business_id required' }, { status: 400 })
  }

  const hasAccess = await verifyBusinessAccess(user.id, businessId)
  if (!hasAccess) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  try {
    const result = await syncBusinessXeroPL(businessId)
    return NextResponse.json({ success: true, result })
  } catch (err: any) {
    // Orchestrator already finalized sync_jobs.status='error' + Sentry-
    // captured before re-throwing. Surface the error cleanly to the caller.
    return NextResponse.json(
      { success: false, error: String(err?.message ?? err) },
      { status: 500 },
    )
  }
}
