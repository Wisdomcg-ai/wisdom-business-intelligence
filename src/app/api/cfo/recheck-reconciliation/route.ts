/**
 * POST /api/cfo/recheck-reconciliation — "Re-check now" on the CFO production
 * board. Re-queries Xero live for one business's unreconciled items (every
 * active tenant — multi-org businesses like Dragon/IICT must sweep all orgs or
 * the board silently reports a fraction), refreshes reconciliation_checks /
 * reconciliation_snapshots, and returns the fresh per-month buckets.
 *
 * Coach-only surface: service-role client bypasses RLS, so authz is app-layer —
 * role gate + assigned_coach_id ownership check (mirrors flag-client/route.ts).
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import * as Sentry from '@sentry/nextjs'
import { withSchema } from '@/lib/api/with-schema'
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { resolveXeroConnections } from '@/lib/business/resolveXeroBusinessId'
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import { sweepTenant, persistTenantSweep, type TenantSweepResult } from '@/lib/reconciliation/sweep'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Live Xero calls: token refresh + 1 call per bank account per tenant; a
// 3-org business with a 429 retry in the mix needs headroom over the default.
export const maxDuration = 120

// Module-level service-role client (mirrors flag-client/route.ts)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey()
)

const PostBodySchema = z
  .object({
    business_id: z.string(),
  })
  .passthrough()

async function postHandler(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const businessId: unknown = body?.business_id
    if (typeof businessId !== 'string' || businessId.length === 0) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 })
    }

    // Caller identity from the cookie-bound client; all data via service role.
    const authClient = await createRouteHandlerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: roleRow } = await supabase
      .from('system_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()
    const isSuperAdmin = roleRow?.role === 'super_admin'
    const isCoach = roleRow?.role === 'coach'
    if (!isSuperAdmin && !isCoach) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Resolve to canonical businesses-space id first so the ownership check
    // works whichever id-space the caller sent (the #1 recurring incident class).
    const ids = await resolveBusinessProfileIds(supabase, businessId)

    if (!isSuperAdmin) {
      const { data: biz } = await supabase
        .from('businesses')
        .select('assigned_coach_id')
        .eq('id', ids.businessId)
        .maybeSingle()
      if (!biz || biz.assigned_coach_id !== user.id) {
        return NextResponse.json(
          { error: 'Access denied — not your assigned client' },
          { status: 403 }
        )
      }
    }

    const { connections } = await resolveXeroConnections(supabase, businessId)
    if (connections.length === 0) {
      return NextResponse.json({
        success: true,
        tenants: [],
        message: 'No active Xero connections for this business',
      })
    }

    const results: TenantSweepResult[] = []
    for (const conn of connections) {
      const result = await sweepTenant(supabase, conn, ids.businessId)
      const persistError = await persistTenantSweep(supabase, result)
      if (persistError) {
        // Write failure is non-fatal for the response (the live result is
        // still returned) but never silent (invariant rule).
        Sentry.captureMessage(persistError, {
          level: 'error',
          tags: { route: 'cfo/recheck-reconciliation', invariant: 'reconciliation_persist_failed' },
          extra: {
            context: '[Recheck Reconciliation] persist failed',
            business_id: ids.businessId,
            tenant_id: conn.tenant_id,
          },
        } as any)
      }
      results.push(result)
    }

    return NextResponse.json({
      success: true,
      checked_at: new Date().toISOString(),
      tenants: results.map(r => ({
        tenant_id: r.tenantId,
        status: r.status,
        error: r.error,
        source: r.source,
        total_count: r.totalCount,
        total_value: r.totalValue,
        accounts: r.accounts.map(a => ({
          bank_account_id: a.bankAccountId,
          bank_account_name: a.bankAccountName,
          buckets: a.buckets,
        })),
      })),
    })
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: 'cfo/recheck-reconciliation' },
      extra: { context: '[Recheck Reconciliation] request failed' },
    } as any)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Re-check failed' },
      { status: 500 }
    )
  }
}

export const POST = withSchema('cfo/recheck-reconciliation', PostBodySchema, postHandler)
