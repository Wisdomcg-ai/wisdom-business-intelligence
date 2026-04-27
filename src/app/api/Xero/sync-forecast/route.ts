/**
 * Phase 44 — sync-forecast (RETIRED to thin shim).
 *
 * Pre-44: copied xero_pl_lines into forecast_pl_lines.actual_months via the
 * e337a42 dedup-then-insert dance with silent-failure swallowing.
 * Post-44: materialization is owned by the wizard generate route + the
 * save_assumptions_and_materialize RPC. Xero actuals live in xero_pl_lines.
 *
 * This shim delegates to the canonical orchestrator (refreshes xero_pl_lines
 * for the business). It does NOT write to forecast_pl_lines. After Plan 44-08
 * ships ForecastReadService, callers should call /api/Xero/refresh-pl directly
 * and read actuals via the read service.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'
import { syncBusinessXeroPL } from '@/lib/xero/sync-orchestrator'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  try {
    const authClient = await createRouteHandlerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const id = (body as { business_id?: string; businessId?: string }).business_id
      || (body as { business_id?: string; businessId?: string }).businessId
    if (!id) return NextResponse.json({ error: 'business_id is required' }, { status: 400 })

    if (!(await verifyBusinessAccess(user.id, id))) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const result = await syncBusinessXeroPL(id)
    return NextResponse.json({ success: result.status !== 'error', sync: result })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[sync-forecast/shim] Error:', message)
    return NextResponse.json({ error: 'Failed to sync Xero data', detail: message }, { status: 500 })
  }
}
