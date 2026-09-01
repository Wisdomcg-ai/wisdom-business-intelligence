import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'
import * as Sentry from '@sentry/nextjs'
import { requireSectionPermission } from '@/lib/permissions/requireSectionPermission'
import { enforceSectionPermission } from '@/lib/permissions/sectionPermissionConfig'
import { z } from 'zod'
import { withSchema, withQuerySchema } from '@/lib/api/with-schema'
import { overallStatus, type PreflightResult } from '@/lib/monthly-report/preflight'
import { isValidPeriodMonth } from '@/lib/monthly-report/external-metrics'

export const dynamic = 'force-dynamic'

/**
 * WF.1 — persist a pre-flight run.
 *
 * POST { business_id, report_month, context, results } → one immutable row in
 * report_invariant_results. The overall verdict is recomputed server-side
 * from the results (never trusted from the client). GET returns the latest
 * run for a month — the proof of what was true when the pack went out.
 */
const PreflightPostSchema = z.object({
  business_id: z.string(),
  report_month: z.string(),
  context: z.enum(['export', 'approve_send', 'manual']).optional(),
  results: z.array(z.any()),
})
const PreflightGetSchema = z.object({
  business_id: z.string().optional(),
  report_month: z.string().optional(),
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey()
)

const VALID_STATUSES = new Set(['pass', 'warn', 'fail', 'skip'])

async function authorize(businessId: string): Promise<{ block: NextResponse } | { userId: string }> {
  const authClient = await createRouteHandlerClient()
  const { data: { user }, error: authError } = await authClient.auth.getUser()
  if (authError || !user) {
    return { block: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const verdict = await requireSectionPermission(authClient, user.id, businessId, 'finances')
  const blocked = enforceSectionPermission(
    verdict, 'finances', 'api/monthly-report/preflight', user.id, businessId,
  )
  if (blocked) return { block: blocked }
  const hasAccess = await verifyBusinessAccess(user.id, businessId)
  if (!hasAccess) {
    return { block: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { userId: user.id }
}

async function postHandler(request: Request) {
  try {
    const body = await request.json()
    const { business_id, report_month, context, results } = body ?? {}
    // withSchema is observe-mode (VALID-05a) — the handler enforces its contract.
    if (!business_id || !isValidPeriodMonth(report_month) || !Array.isArray(results) || results.length === 0) {
      return NextResponse.json(
        { error: 'business_id, report_month (YYYY-MM) and non-empty results are required' },
        { status: 400 },
      )
    }
    const clean: PreflightResult[] = []
    for (const r of results) {
      if (
        !r || typeof r.key !== 'string' || typeof r.label !== 'string' ||
        typeof r.detail !== 'string' || !VALID_STATUSES.has(r.status)
      ) {
        return NextResponse.json({ error: 'Each result needs key, label, detail and a valid status' }, { status: 400 })
      }
      clean.push({ key: r.key, label: r.label, status: r.status, detail: r.detail })
    }

    const auth = await authorize(business_id)
    if ('block' in auth) return auth.block

    const { data, error } = await supabase
      .from('report_invariant_results')
      .insert({
        business_id,
        report_month,
        context: context === 'approve_send' || context === 'manual' ? context : 'export',
        run_by: auth.userId,
        results: clean,
        // Recomputed server-side — the stored verdict can't be spoofed.
        overall: overallStatus(clean),
      })
      .select('id, run_at, overall')
      .single()
    if (error) throw error

    return NextResponse.json({ success: true, run: data })
  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'monthly-report/preflight', invariant: 'preflight-persist' }, extra: { context: '[Preflight] POST error' } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function getHandler(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('business_id')
    const reportMonth = searchParams.get('report_month')
    if (!businessId || !isValidPeriodMonth(reportMonth)) {
      return NextResponse.json({ error: 'business_id and report_month (YYYY-MM) are required' }, { status: 400 })
    }
    const auth = await authorize(businessId)
    if ('block' in auth) return auth.block

    const { data, error } = await supabase
      .from('report_invariant_results')
      .select('id, run_at, run_by, context, results, overall')
      .eq('business_id', businessId)
      .eq('report_month', reportMonth)
      .order('run_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error

    return NextResponse.json({ success: true, run: data ?? null })
  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'monthly-report/preflight' }, extra: { context: '[Preflight] GET error' } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withQuerySchema('monthly-report/preflight', PreflightGetSchema, getHandler)
export const POST = withSchema('monthly-report/preflight', PreflightPostSchema, postHandler)
