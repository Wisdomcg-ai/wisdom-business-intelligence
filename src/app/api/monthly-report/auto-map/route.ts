import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'
import { autoMapAccounts } from '@/lib/monthly-report/auto-map'
import * as Sentry from '@sentry/nextjs'
import { requireSectionPermission } from '@/lib/permissions/requireSectionPermission'
import { enforceSectionPermission } from '@/lib/permissions/sectionPermissionConfig'
import { z } from 'zod'
import { withSchema } from '@/lib/api/with-schema'

export const dynamic = 'force-dynamic'

// VALID-05a (observe mode): POST auto-maps Xero accounts for a business.
const AutoMapPostSchema = z.object({
  business_id: z.string(),
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey()
)

/**
 * POST /api/monthly-report/auto-map
 *
 * Auto-generates account mappings from synced Xero P&L accounts.
 *
 * WA.5a: non-destructive. The mapping logic lives in
 * `src/lib/monthly-report/auto-map.ts` (shared with the sync path) and only
 * ever fills gaps: new accounts get rows, unconfirmed unlinked rows can gain a
 * forecast link, and confirmed rows are never touched. The previous
 * implementation blanket-upserted every account — one click of the Auto-Map
 * button reset every confirmed mapping (is_confirmed=false), recomputed
 * hand-corrected categories, and rewired forecast links by fuzzy match. See the
 * module header there for the full account.
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
    const { business_id } = body

    if (!business_id) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 })
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
      'api/monthly-report/auto-map',
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

    const result = await autoMapAccounts(supabase, business_id)

    if (result.xeroAccounts === 0) {
      return NextResponse.json({
        success: true,
        mapped_count: 0,
        matched_to_forecast_count: 0,
        message: 'No Xero accounts found for this business',
      })
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log(
        `[Auto-Map] ${result.created} created, ${result.forecastLinksAdded} forecast links added, ` +
        `${result.preserved} existing rows preserved (${result.confirmedPreserved} confirmed), ` +
        `${result.matchedToForecast} matched to forecast (${result.matchedByCode} by code, ${result.matchedByName} by name)`,
      )
    }

    // Response shape kept compatible with the mapping editor's toast:
    // mapped_count is the number of rows auto-map actually created this run.
    return NextResponse.json({
      success: true,
      mapped_count: result.created,
      matched_to_forecast_count: result.matchedToForecast,
      matched_by_code: result.matchedByCode,
      matched_by_name: result.matchedByName,
      forecast_links_added: result.forecastLinksAdded,
      preserved_count: result.preserved,
      confirmed_preserved_count: result.confirmedPreserved,
      // The editor treats mapped_count === 0 as "nothing synced yet". When rows
      // exist but nothing was created, that read is wrong — everything was
      // already mapped. Give it the signal to say so.
      already_mapped: result.created === 0 && result.preserved > 0,
    })

  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'monthly-report/auto-map' }, extra: { context: "Error in POST /api/monthly-report/auto-map" } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withSchema('monthly-report/auto-map', AutoMapPostSchema, postHandler)
