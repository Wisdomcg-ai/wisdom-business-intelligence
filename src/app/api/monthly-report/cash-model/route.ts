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
import { loadPackCashModel } from '@/lib/monthly-report/pack-cash-model-load'

export const dynamic = 'force-dynamic'

/**
 * GET /api/monthly-report/cash-model?business_id&report_month
 *
 * The pack's cashflow model v2 inputs, read from the STORED mirrors — no live
 * Xero call. `status: 'off'` for every business that has not turned the model
 * on (the page then builds the v1 cashflow exactly as before); 'refused' with
 * the reason the page prints; 'ready' with the ledger the page composes with
 * the Full Year report it already holds (buildPackCashModel).
 *
 * Read-only: no write happens here, so there is no invariant tag to raise.
 */
const CashModelGetSchema = z.object({
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
      verdict, 'finances', 'api/monthly-report/cash-model', user.id, businessId,
    )
    if (blocked) return blocked
    // The service-role client below bypasses RLS — this check is the only gate.
    const hasAccess = await verifyBusinessAccess(user.id, businessId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Shared with scripts/preview-pack.ts — see pack-cash-model-load.
    const cashModel = await loadPackCashModel(supabase, businessId, reportMonth)

    return NextResponse.json({ success: true, cash_model: cashModel })
  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'monthly-report/cash-model' }, extra: { context: '[CashModel] GET error' } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withQuerySchema('monthly-report/cash-model', CashModelGetSchema, getHandler)
