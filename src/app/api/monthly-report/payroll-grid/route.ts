import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'
import { requireSectionPermission } from '@/lib/permissions/requireSectionPermission'
import { enforceSectionPermission } from '@/lib/permissions/sectionPermissionConfig'
import { loadPayrollGrid } from '@/lib/monthly-report/payroll-grid-load'
import { withSchema } from '@/lib/api/with-schema'
import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

/**
 * The two-month payroll grid: every employee against every pay run.
 *
 * Reads no Xero API. `xero_payslip_lines` has carried a row per employee per
 * pay run since the payroll sync landed, which is the entire content of the
 * Google Sheet tab this replaces — the tab existed because Calxa cannot see a
 * payslip, not because anybody was making a judgement.
 *
 * The build lives in lib/monthly-report/payroll-grid-load, shared with
 * scripts/preview-pack.ts.
 */
const PayrollGridPostSchema = z.object({
  business_id: z.string(),
  report_month: z.string(),
  fiscal_year: z.number(),
  /** How many months to show, ending at report_month. Calxa shows two. */
  months: z.number().int().min(1).max(6).optional(),
})

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, getSupabaseSecretKey())

async function postHandler(request: Request, body: unknown) {
  try {
    const authClient = await createRouteHandlerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { business_id, report_month, fiscal_year, months } = body as {
      business_id: string
      report_month: string
      fiscal_year: number
      months?: number
    }

    const verdict = await requireSectionPermission(authClient, user.id, business_id, 'finances')
    const blocked = enforceSectionPermission(verdict, 'finances', 'api/monthly-report/payroll-grid', user.id, business_id)
    if (blocked) return blocked

    // The module client is service-role and bypasses RLS, so this is the only
    // durable tenant gate on the route.
    if (!(await verifyBusinessAccess(user.id, business_id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const result = await loadPayrollGrid(supabase, { business_id, report_month, fiscal_year, months })
    if (result.data === null) {
      return NextResponse.json({ success: true, data: null, reason: result.reason })
    }
    return NextResponse.json({ success: true, data: result.data })
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: 'monthly-report/payroll-grid' },
      extra: { context: '[PayrollGrid] Error' },
    } as never)
    return NextResponse.json({ error: 'Failed to build the payroll grid' }, { status: 500 })
  }
}

export const POST = withSchema('monthly-report/payroll-grid', PayrollGridPostSchema, postHandler)
