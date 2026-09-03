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
import { validateCapture, summariseDashboardCaptures, type CaptureRow } from '@/lib/cfo/dashboard-capture'

export const dynamic = 'force-dynamic'

/**
 * Xero dashboard "Reconcile N items" badge captures.
 *
 * POST { business_id, captures: [{ tenant_id, total_count, accounts?, notes?, method? }] }
 *   → one append-only row per capture. Every tenant_id must be an active
 *   connection of the business (a badge for someone else's org is refused).
 * GET  ?business_id → latest capture per tenant + the business rollup.
 *
 * Coach/admin only — clients don't operate reconciliation. withSchema is
 * observe-mode (VALID-05a); the handler enforces its own contract.
 */
const PostSchema = z.object({
  business_id: z.string(),
  captures: z.array(z.any()),
})
const GetSchema = z.object({ business_id: z.string().optional() })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey()
)

async function authorize(businessId: string): Promise<{ block: NextResponse } | { userId: string }> {
  const authClient = await createRouteHandlerClient()
  const { data: { user }, error: authError } = await authClient.auth.getUser()
  if (authError || !user) {
    return { block: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const verdict = await requireSectionPermission(authClient, user.id, businessId, 'finances')
  const blocked = enforceSectionPermission(
    verdict, 'finances', 'api/cfo/reconciliation/dashboard-capture', user.id, businessId,
  )
  if (blocked) return { block: blocked }
  const hasAccess = await verifyBusinessAccess(user.id, businessId)
  if (!hasAccess) {
    return { block: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { userId: user.id }
}

async function activeTenantIds(businessId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('xero_connections')
    .select('tenant_id')
    .eq('business_id', businessId)
    .eq('is_active', true)
  if (error) throw error
  return (data ?? []).map(r => r.tenant_id).filter((t): t is string => !!t)
}

async function postHandler(request: Request) {
  try {
    const body = await request.json()
    const { business_id, captures } = body ?? {}
    if (!business_id || !Array.isArray(captures) || captures.length === 0) {
      return NextResponse.json({ error: 'business_id and a non-empty captures array are required' }, { status: 400 })
    }
    const validated = captures.map(validateCapture)
    const bad = validated.find(v => !v.ok)
    if (bad) return NextResponse.json({ error: bad.error }, { status: 400 })

    const auth = await authorize(business_id)
    if ('block' in auth) return auth.block

    const tenants = new Set(await activeTenantIds(business_id))
    const rows = validated.map(v => v.value!)
    const foreign = rows.filter(r => !tenants.has(r.tenant_id)).map(r => r.tenant_id)
    if (foreign.length > 0) {
      return NextResponse.json(
        { error: `tenant(s) not an active connection of this business: ${foreign.join(', ')}` },
        { status: 400 },
      )
    }

    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('reconciliation_dashboard_captures')
      .insert(rows.map(r => ({
        tenant_id: r.tenant_id,
        business_id,
        captured_at: now,
        captured_by: auth.userId,
        method: r.method,
        total_count: r.total_count,
        accounts: r.accounts,
        notes: r.notes,
      })))
      .select('id, tenant_id, total_count, captured_at')
    if (error) throw error

    return NextResponse.json({ success: true, recorded: data ?? [] })
  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'cfo/reconciliation/dashboard-capture', invariant: 'dashboard-capture-write' }, extra: { context: '[DashboardCapture] POST error' } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function getHandler(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('business_id')
    if (!businessId) return NextResponse.json({ error: 'business_id is required' }, { status: 400 })

    const auth = await authorize(businessId)
    if ('block' in auth) return auth.block

    const tenants = await activeTenantIds(businessId)
    const { data, error } = await supabase
      .from('reconciliation_dashboard_captures')
      .select('tenant_id, business_id, captured_at, total_count, accounts, method')
      .eq('business_id', businessId)
      .order('captured_at', { ascending: false })
      .limit(200)
    if (error) throw error

    const rows = (data ?? []) as CaptureRow[]
    return NextResponse.json({
      success: true,
      summary: summariseDashboardCaptures(rows, tenants),
      recent: rows.slice(0, 50),
    })
  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'cfo/reconciliation/dashboard-capture' }, extra: { context: '[DashboardCapture] GET error' } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withQuerySchema('cfo/reconciliation/dashboard-capture', GetSchema, getHandler)
export const POST = withSchema('cfo/reconciliation/dashboard-capture', PostSchema, postHandler)
