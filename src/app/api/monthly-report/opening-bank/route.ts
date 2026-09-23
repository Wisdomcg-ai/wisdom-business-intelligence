import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'
import * as Sentry from '@sentry/nextjs'
import { requireSectionPermission } from '@/lib/permissions/requireSectionPermission'
import { enforceSectionPermission } from '@/lib/permissions/sectionPermissionConfig'
import { z } from 'zod'
import { withQuerySchema } from '@/lib/api/with-schema'
import { isValidPeriodMonth } from '@/lib/monthly-report/external-metrics'
import { loadPackCashflowOpening } from '@/lib/monthly-report/opening-bank-load'

export const dynamic = 'force-dynamic'

/**
 * GET /api/monthly-report/opening-bank?business_id&report_month
 *
 * Total Bank on the day before the report's fiscal year starts, read from the
 * STORED balance-sheet mirror — no live Xero call, so the pack's cashflow page
 * opens on a real balance even while Xero is down or rate-limited. Urban
 * Road's August pack opened at $0 because nothing supplied this figure.
 *
 * Always 200 with an `opening` verdict when the lookup ran: "unavailable" is an
 * answer the page prints, not an error it hides. All rules live in the pure
 * opening-bank module.
 *
 * `v1_refusal` is why the v1 cashflow must not be built on this business at
 * all — more than one Xero organisation, or one in a foreign currency — or
 * null. The page asks before it looks up a forecast, and prints the reason in
 * the cash pages' place (packCashflowV1Refusal).
 */
const OpeningBankGetSchema = z.object({
  business_id: z.string().optional(),
  report_month: z.string().optional(),
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey()
)

async function getHandler(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('business_id')
    const reportMonth = searchParams.get('report_month')
    // withSchema is observe-mode (VALID-05a) — the handler enforces its contract.
    if (!businessId || !isValidPeriodMonth(reportMonth)) {
      return NextResponse.json(
        { error: 'business_id and report_month (YYYY-MM) are required' },
        { status: 400 },
      )
    }

    const authClient = await createRouteHandlerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const verdict = await requireSectionPermission(authClient, user.id, businessId, 'finances')
    const blocked = enforceSectionPermission(
      verdict, 'finances', 'api/monthly-report/opening-bank', user.id, businessId,
    )
    if (blocked) return blocked
    // The service-role client below bypasses RLS — this check is the only gate.
    const hasAccess = await verifyBusinessAccess(user.id, businessId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Shared with scripts/preview-pack.ts — see opening-bank-load.
    const { opening, v1Refusal } = await loadPackCashflowOpening(supabase, businessId, reportMonth)

    return NextResponse.json({ success: true, opening, v1_refusal: v1Refusal })
  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'monthly-report/opening-bank' }, extra: { context: '[OpeningBank] GET error' } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withQuerySchema('monthly-report/opening-bank', OpeningBankGetSchema, getHandler)
