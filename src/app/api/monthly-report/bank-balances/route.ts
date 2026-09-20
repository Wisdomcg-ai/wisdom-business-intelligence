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
import { loadBankBalances } from '@/lib/monthly-report/bank-balances-load'
import { isValidPeriodMonth } from '@/lib/monthly-report/external-metrics'

export const dynamic = 'force-dynamic'

/**
 * GET /api/monthly-report/bank-balances?business_id&period_month
 *
 * Bank Balances & Movement (Calxa p17): the chosen bank, cash-on-hand and
 * credit-card accounts at the end of the month and the month before, per Xero
 * organisation, foreign ones translated at each date's closing rate. Built from
 * the STORED balance-sheet mirror, so it needs no live Xero call — a pack of
 * three organisations would otherwise be six live reports against three minute
 * limits. All gating lives in the pure buildBankBalances; a page it cannot
 * produce comes back as a 422 whose `error` the pack prints after "This page
 * couldn't be produced: ".
 */
const BankBalancesGetSchema = z.object({
  business_id: z.string().optional(),
  period_month: z.string().optional(),
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey()
)

async function getHandler(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('business_id')
    const periodMonth = searchParams.get('period_month')
    // withSchema is observe-mode (VALID-05a) — the handler enforces its contract.
    if (!businessId || !isValidPeriodMonth(periodMonth)) {
      return NextResponse.json(
        { error: 'business_id and period_month (YYYY-MM) are required' },
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
      verdict, 'finances', 'api/monthly-report/bank-balances', user.id, businessId,
    )
    if (blocked) return blocked
    const hasAccess = await verifyBusinessAccess(user.id, businessId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Shared with scripts/preview-pack.ts — see bank-balances-load.
    const result = await loadBankBalances(supabase, businessId, periodMonth)
    if (!result.ok) {
      return NextResponse.json({ error: result.reason, code: 'BANK_BALANCES_REFUSED' }, { status: 422 })
    }
    return NextResponse.json({ success: true, bank: result.data })
  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'monthly-report/bank-balances' }, extra: { context: '[BankBalances] GET error' } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withQuerySchema('monthly-report/bank-balances', BankBalancesGetSchema, getHandler)
