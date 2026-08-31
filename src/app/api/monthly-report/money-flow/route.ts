import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import * as Sentry from '@sentry/nextjs'
import { requireSectionPermission } from '@/lib/permissions/requireSectionPermission'
import { enforceSectionPermission } from '@/lib/permissions/sectionPermissionConfig'
import { z } from 'zod'
import { withQuerySchema } from '@/lib/api/with-schema'
import { deriveMoneyFlow, endOfMonth, priorMonth } from '@/lib/monthly-report/money-flow'
import { isValidPeriodMonth } from '@/lib/monthly-report/external-metrics'

export const dynamic = 'force-dynamic'

/**
 * WD.4 — GET /api/monthly-report/money-flow?business_id&period_month
 *
 * Where Did Our Money Go: the month's funds-flow derived from the STORED
 * balance-sheet mirror (two month-ends + the accounting equation), so it works
 * without live Xero and self-proves — sources − uses ≡ Δbank or the page says
 * "couldn't check". All gating lives in the pure deriveMoneyFlow.
 */
const MoneyFlowGetSchema = z.object({
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
      verdict, 'finances', 'api/monthly-report/money-flow', user.id, businessId,
    )
    if (blocked) return blocked
    const hasAccess = await verifyBusinessAccess(user.id, businessId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const ids = await resolveBusinessProfileIds(supabase, businessId)

    // Only the two month-end keys are needed, but jsonb column selection is
    // all-or-nothing through PostgREST — the row count per business is small
    // (fleet max ~80 BS accounts), so read whole rows.
    const { data: rows, error } = await supabase
      .from('xero_bs_lines_wide_compat')
      .select('account_name, account_type, section, tenant_id, balances_by_date')
      .in('business_id', ids.all)
    if (error) throw error

    const flow = deriveMoneyFlow(
      (rows ?? []).map((r) => ({
        account_name: r.account_name,
        account_type: r.account_type,
        section: r.section,
        tenant_id: r.tenant_id,
        balances_by_date: r.balances_by_date ?? {},
      })),
      periodMonth,
    )

    return NextResponse.json({
      success: true,
      flow,
      // For the renderer's caption: the actual dates compared.
      dates: { start: endOfMonth(priorMonth(periodMonth)), end: endOfMonth(periodMonth) },
    })
  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'monthly-report/money-flow' }, extra: { context: '[MoneyFlow] GET error' } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withQuerySchema('monthly-report/money-flow', MoneyFlowGetSchema, getHandler)
