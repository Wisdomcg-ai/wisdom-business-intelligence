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
import { ACCOUNT_CODE_RE } from '@/lib/monthly-report/account-actuals'
import { loadAccountActuals, loadLedgerAccounts } from '@/lib/monthly-report/account-actuals-load'

export const dynamic = 'force-dynamic'

/**
 * GET /api/monthly-report/account-actuals?business_id&end_month=YYYY-MM&months=N&codes=55000,51150
 *
 * Monthly actuals per account code and per statement total, for the Ratio
 * Analysis page. Live from the synced ledger — not frozen at report time — and
 * never past end_month. A month an account did not post to has no key: see
 * buildAccountActuals for why zero is never filled in.
 *
 * GET /api/monthly-report/account-actuals?business_id&list=1
 *
 * The coded P&L accounts on that same ledger, `{ accounts: [{code, name,
 * bucket}], codeless_count }`, for the page's settings panel. A mode of this
 * route rather than a chart-of-accounts call so the list and the figures read
 * one ledger through one refusal: an account the panel offers is one the page
 * will find (see listLedgerAccounts).
 *
 * Multi-org and non-AUD businesses get `{ unavailable_reason }` instead of
 * figures or accounts; the page and the panel print the sentence.
 */
const AccountActualsGetSchema = z.object({
  business_id: z.string().optional(),
  end_month: z.string().optional(),
  months: z.string().optional(),
  codes: z.string().optional(),
  list: z.string().optional(),
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey()
)

async function getHandler(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('business_id')
    const listMode = searchParams.get('list') === '1'
    const endMonth = searchParams.get('end_month')
    const monthsRaw = searchParams.get('months')
    const codesRaw = searchParams.get('codes') ?? ''

    // withQuerySchema is observe-mode (VALID-05a) — the handler enforces its contract.
    if (!businessId) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 })
    }
    const months = monthsRaw !== null && /^\d{1,2}$/.test(monthsRaw) ? Number(monthsRaw) : NaN
    // Split on commas only: one client's Xero really has a code with a space
    // in it ("400 03").
    const codes = codesRaw === '' ? [] : codesRaw.split(',').map((c) => c.trim())
    if (!listMode) {
      if (!isValidPeriodMonth(endMonth) || !(months >= 1 && months <= 24)) {
        return NextResponse.json(
          { error: 'business_id, end_month (YYYY-MM) and months (1-24) are required' },
          { status: 400 },
        )
      }
      if (codes.length > 80 || codes.some((c) => !ACCOUNT_CODE_RE.test(c))) {
        return NextResponse.json({ error: 'codes must be a comma-separated list of Xero account codes' }, { status: 400 })
      }
    }

    const authClient = await createRouteHandlerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const verdict = await requireSectionPermission(authClient, user.id, businessId, 'finances')
    const blocked = enforceSectionPermission(
      verdict, 'finances', 'api/monthly-report/account-actuals', user.id, businessId,
    )
    if (blocked) return blocked
    // The module client is service-role and bypasses RLS, so this is the only
    // durable tenant gate on the route.
    const hasAccess = await verifyBusinessAccess(user.id, businessId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const result = listMode
      ? await loadLedgerAccounts(supabase, businessId)
      : await loadAccountActuals(supabase, businessId, endMonth as string, months, codes)
    if ('unavailable_reason' in result) {
      return NextResponse.json({ unavailable_reason: result.unavailable_reason })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'monthly-report/account-actuals' }, extra: { context: '[AccountActuals] GET error' } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withQuerySchema('monthly-report/account-actuals', AccountActualsGetSchema, getHandler)
