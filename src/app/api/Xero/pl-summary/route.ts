/**
 * Xero P&L Summary API Route — Phase 44 D-13 thin shim.
 *
 * Returns prior FY and current YTD data for the forecast wizard.
 *
 * Response shape (preserved verbatim from pre-Phase-44 contract — wizard UI
 * components in src/app/finances/forecast/ consume specific fields):
 *   {
 *     summary: HistoricalPLSummary {
 *       has_xero_data, prior_fy?, current_ytd?, coverage?
 *     }
 *   }
 *
 * Data flow:
 *   1. Authenticate + verify business access.
 *   2. Resolve Xero connection. If absent → return has_xero_data: false.
 *   3. Delegate to getHistoricalSummary(), which itself routes through
 *      ForecastReadService.getMonthlyComposite when an active forecast
 *      exists (D-13). The D-18 freshness invariant fires inside the service;
 *      this route catches it and returns a structured 500 with the
 *      invariant-violation message so the wizard can surface a recompute
 *      banner (Plan 44-10).
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

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const businessId = searchParams.get('business_id')
    const fiscalYearParam = searchParams.get('fiscal_year')

    if (!businessId) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 })
    }

    const hasAccess = await verifyBusinessAccess(user.id, businessId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const fiscalYear = fiscalYearParam ? parseInt(fiscalYearParam) : new Date().getFullYear() + 1

    const { connection } = await resolveXeroBusinessId(supabase, businessId)
    if (!connection) {
      return NextResponse.json({
        summary: { has_xero_data: false } as HistoricalPLSummary,
      })
    }

    const summary = await getHistoricalSummary(supabase, businessId, fiscalYear)

    // D-44.2-03 quality gate — non-blocking; summary.data_quality propagates
    // from ForecastReadService via getHistoricalSummary (44.2-08 Task 1).
    return NextResponse.json({ summary })
  } catch (error: any) {
    // D-18 invariant violations from ForecastReadService surface here.
    // Return a structured 500 — never silently fall back to legacy logic.
    const message = String(error?.message ?? error)
    const isInvariant = message.includes('INVARIANT VIOLATED')
    console.error('[Xero P&L Summary] Error:', error)
    return NextResponse.json(
      {
        error: isInvariant ? message : 'Internal server error',
        invariant_violation: isInvariant || undefined,
      },
      { status: 500 },
    )
  }
}
