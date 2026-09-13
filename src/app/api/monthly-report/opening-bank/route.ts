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
import { isValidPeriodMonth } from '@/lib/monthly-report/external-metrics'
import { openingBalanceDate, totalBankAt, type OpeningBank } from '@/lib/monthly-report/opening-bank'

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

    const ids = await resolveBusinessProfileIds(supabase, businessId)

    // The fiscal year is the business's own, not the clock's and not an assumed
    // July: every profile is 7 today, but the day one isn't, a hard-coded July
    // would open the year on the wrong balance sheet without a sound.
    const { data: profile } = await supabase
      .from('business_profiles')
      .select('fiscal_year_start')
      .eq('id', ids.profileId)
      .maybeSingle()
    const asAt = openingBalanceDate(reportMonth, Number(profile?.fiscal_year_start ?? 7))

    // Scope by ACTIVE connection and join on tenant_id (CLAUDE.md): tenant ids
    // are shared across business ids — IICT's orgs sit under an inactive
    // business too — and xero_connections.business_id is businesses-space while
    // the mirror is written under the profile id.
    const { data: conns, error: connErr } = await supabase
      .from('xero_connections')
      .select('tenant_id, functional_currency')
      .in('business_id', ids.all)
      .eq('is_active', true)
    if (connErr) throw connErr
    const tenants = (conns ?? [])
      .filter((c: { tenant_id: string | null }) => !!c.tenant_id)
      .map((c: { tenant_id: string; functional_currency: string | null }) => ({
        tenant_id: c.tenant_id,
        currency: c.functional_currency,
      }))

    let rows: Array<Record<string, unknown>> = []
    if (tenants.length > 0) {
      const { data, error } = await supabase
        .from('xero_bs_lines')
        .select('tenant_id, account_type, section, balance_date, balance')
        .in('business_id', ids.all)
        .in('tenant_id', tenants.map((t) => t.tenant_id))
        .eq('balance_date', asAt)
      if (error) throw error
      rows = data ?? []
    }

    const opening: OpeningBank = totalBankAt(
      rows.map((r) => ({
        tenant_id: (r.tenant_id as string | null) ?? null,
        account_type: String(r.account_type ?? ''),
        section: (r.section as string | null) ?? null,
        balance_date: String(r.balance_date ?? ''),
        balance: (r.balance as number | string | null) ?? null,
      })),
      asAt,
      tenants,
    )

    return NextResponse.json({ success: true, opening })
  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'monthly-report/opening-bank' }, extra: { context: '[OpeningBank] GET error' } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withQuerySchema('monthly-report/opening-bank', OpeningBankGetSchema, getHandler)
