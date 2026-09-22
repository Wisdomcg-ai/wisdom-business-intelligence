import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'
import { loadFullYearReport } from '@/lib/monthly-report/full-year-load'
import * as Sentry from '@sentry/nextjs'
import { requireSectionPermission } from '@/lib/permissions/requireSectionPermission'
import { enforceSectionPermission } from '@/lib/permissions/sectionPermissionConfig'
import { z } from 'zod'
import { withSchema } from '@/lib/api/with-schema'

// VALID-05a (observe mode): POST builds the full-year report for a business.
const FullYearPostSchema = z.object({
  business_id: z.string(),
  fiscal_year: z.union([z.string(), z.number()]).optional(),
  /** The month the pack is FOR. See lastActualMonth. */
  report_month: z.string().optional(),
})

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey()
)

/**
 * POST /api/monthly-report/full-year
 * Generates a 12-month full year projection report
 */
async function postHandler(request: Request) {
  try {
    // Phase 65-02: introduce user auth so requireSectionPermission has a userId.
    // The module-level service-role `supabase` continues to be used for data fetching below.
    const authClient = await createRouteHandlerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { business_id, fiscal_year, report_month } = body

    if (!business_id || !fiscal_year) {
      return NextResponse.json(
        { error: 'business_id and fiscal_year are required' },
        { status: 400 }
      )
    }

    // Phase 65: section-permission gate (LOG_ONLY by default, ENFORCE via env var)
    const _sectionVerdict = await requireSectionPermission(
      authClient,          // auth-bound client; NEVER pass a service-role client here
      user.id,
      business_id,
      'finances',
    )
    const _sectionBlocked = enforceSectionPermission(
      _sectionVerdict,
      'finances',
      'api/monthly-report/full-year',
      user.id,
      business_id,
    )
    if (_sectionBlocked) return _sectionBlocked

    // R29 (SEC-N2): hard authorization gate. The section-permission check above
    // is LOG_ONLY by default, so it does not block cross-tenant access on its
    // own. The module-level Supabase client is service-role and bypasses RLS,
    // making this the only durable tenant-isolation enforcement on this route.
    const _hasAccess = await verifyBusinessAccess(user.id, business_id)
    if (!_hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // The whole build lives in lib/monthly-report/full-year-load, shared with
    // scripts/preview-pack.ts so the harness renders the page this route serves.
    const result = await loadFullYearReport(supabase, { business_id, fiscal_year, report_month })
    if (!result.ok) {
      // A refusal (a multi-org business with no active forecast) is an answer
      // the tab shows, not a server fault.
      return NextResponse.json(
        { error: result.error, detail: result.detail, refused: result.refused },
        { status: result.refused ? 422 : 500 },
      )
    }

    return NextResponse.json({
      success: true,
      report: result.report,
      data_quality: result.data_quality,
      per_tenant_quality: result.per_tenant_quality,
    })

  } catch (error: any) {
    const message = String(error?.message ?? error)
    const isInvariant = message.includes('INVARIANT VIOLATED')
    Sentry.captureException(error, { tags: { route: 'monthly-report/full-year' }, extra: { context: "[Full Year] Error" } } as any)
    return NextResponse.json(
      {
        error: isInvariant ? message : 'Failed to generate full year projection',
        invariant_violation: isInvariant || undefined,
      },
      { status: 500 },
    )
  }
}

export const POST = withSchema('monthly-report/full-year', FullYearPostSchema, postHandler)
