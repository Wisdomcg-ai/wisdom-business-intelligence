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
import { resolveXeroBusinessId } from '@/lib/business/resolveXeroBusinessId'
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'
import { getHistoricalSummary } from '@/lib/services/historical-pl-summary'
import type { HistoricalPLSummary } from '@/app/finances/forecast/types'
import * as Sentry from '@sentry/nextjs'
import { requireSectionPermission } from '@/lib/permissions/requireSectionPermission'
import { enforceSectionPermission } from '@/lib/permissions/sectionPermissionConfig'
import { withQuerySchema } from '@/lib/api/with-schema'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const GetQuerySchema = z
  .object({
    business_id: z.string().optional(),
    fiscal_year: z.string().optional(),
  })
  .passthrough()

async function getHandler(request: NextRequest) {
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

    // Phase 65: section-permission gate (LOG_ONLY by default, ENFORCE via env var)
    const _sectionVerdict = await requireSectionPermission(
      supabase,            // auth-bound client (assigned from createRouteHandlerClient() above)
      user.id,
      businessId,
      'finances',
    )
    const _sectionBlocked = enforceSectionPermission(
      _sectionVerdict,
      'finances',
      'api/Xero/pl-summary',
      user.id,
      businessId,
    )
    if (_sectionBlocked) return _sectionBlocked

    const fiscalYear = fiscalYearParam ? parseInt(fiscalYearParam) : new Date().getFullYear() + 1

    const { connection, connectionBusinessId } = await resolveXeroBusinessId(supabase, businessId)
    if (!connection) {
      // Issue B (hotfix step2-secondaries) — distinguish "no Xero connection"
      // from "lookup failure due to dual-business-id mismatch".
      //
      // resolveXeroBusinessId tries up to 3 lookup paths (direct,
      // businesses.id → business_profiles.id, business_profiles.id →
      // businesses.id). It returns `connection: null` in two cases:
      //   1) The business has no ACTIVE Xero connection (never connected, OR
      //      the token expired/was disconnected).
      //   2) The lookups found a profile/business mapping (so
      //      connectionBusinessId !== queried businessId) but the
      //      corresponding xero_connections row is missing, suggesting a
      //      dual-id desync (memory note `project_dual_id`).
      //
      // We surface case (2) via a `lookup_error` field so the wizard can
      // show "Couldn't load Xero data — please refresh or reconnect" instead
      // of pretending the tenant has no Xero at all.
      //
      // Phase A (CFO-only clients): in BOTH cases we still read the synced
      // DB mirror. A disconnected tenant (Efficient Living: token expired
      // 2026-05, 23 months of xero_pl_lines on disk) previously got a hard
      // `has_xero_data: false` here, so the forecast wizard seeded EMPTY and
      // generated 0-line forecasts. getHistoricalSummary only reads local
      // tables — no live-Xero dependency — and its data_quality field
      // (typically 'no_sync') already tells the wizard the data is stale.
      // A tenant with no mirror rows still comes back has_xero_data: false,
      // preserving the "connect Xero" prompt for genuinely-new businesses.
      const lookup_error =
        connectionBusinessId !== businessId
          ? 'xero_connection_lookup_failed: resolver found a business/profile mapping for the queried id but no xero_connections row. Likely dual-id desync (businesses.id vs business_profiles.id).'
          : null
      const mirrorSummary = await getHistoricalSummary(supabase, businessId, fiscalYear)
      return NextResponse.json({
        summary: {
          ...mirrorSummary,
          xero_disconnected: true,
          lookup_error,
        } as HistoricalPLSummary,
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
    Sentry.captureException(error, { tags: { route: 'Xero/pl-summary' }, extra: { context: "[Xero P&L Summary] Error" } } as any)
    return NextResponse.json(
      {
        error: isInvariant ? message : 'Internal server error',
        invariant_violation: isInvariant || undefined,
      },
      { status: 500 },
    )
  }
}

export const GET = withQuerySchema(
  'Xero/pl-summary',
  GetQuerySchema,
  getHandler as unknown as (request: Request) => Promise<Response>
)
