/**
 * Xero P&L Summary API Route
 *
 * Thin wrapper around getHistoricalSummary().
 * Returns prior FY and current YTD data for the forecast wizard.
 *
 * Data source: xero_pl_lines (raw 24-month Xero data, synced daily by sync-all)
 * NOT forecast_pl_lines (which is a working copy for forecasts).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { resolveXeroBusinessId } from '@/lib/utils/resolve-xero-business-id'
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'
import { getHistoricalSummary } from '@/lib/services/historical-pl-summary'
import type { HistoricalPLSummary } from '@/app/finances/forecast/types'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerClient()

    // Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Params
    const searchParams = request.nextUrl.searchParams
    const businessId = searchParams.get('business_id')
    const fiscalYearParam = searchParams.get('fiscal_year')

    if (!businessId) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 })
    }

    // Access check
    const hasAccess = await verifyBusinessAccess(user.id, businessId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const fiscalYear = fiscalYearParam ? parseInt(fiscalYearParam) : new Date().getFullYear() + 1

    // Check Xero connection exists
    const { connection } = await resolveXeroBusinessId(supabase, businessId)
    if (!connection) {
      return NextResponse.json({
        summary: { has_xero_data: false } as HistoricalPLSummary,
      })
    }

    // Get historical summary from xero_pl_lines (source of truth)
    const summary = await getHistoricalSummary(supabase, businessId, fiscalYear)

    return NextResponse.json({ summary })
  } catch (error) {
    console.error('[Xero P&L Summary] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
