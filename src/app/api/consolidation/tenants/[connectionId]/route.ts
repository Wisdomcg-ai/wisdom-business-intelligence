/**
 * PATCH /api/consolidation/tenants/[connectionId]
 *
 * Plan 34-00f — update a xero_connections row's consolidation-relevant
 * settings. The connection rows ARE the tenants in the post-pivot model.
 *
 * Updatable fields (all optional):
 *   - display_name (string)
 *   - display_order (int 0..999)
 *   - functional_currency ('AUD' | 'HKD' | 'USD' | 'NZD' | 'GBP' | 'EUR')
 *   - include_in_consolidation (bool)
 *   - is_active (bool)
 *
 * Role gate: coach OR super_admin. No business-ownership check at this layer —
 * any coach/super_admin is trusted with any connection (matches the scope of
 * /api/cfo/* which are similarly coach-global).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { validateTenantPatchPayload } from '@/lib/consolidation/admin-guards'

export const dynamic = 'force-dynamic'

const adminDb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function requireCoachOrSuperAdmin(): Promise<
  | { allowed: true }
  | { allowed: false; status: 401 | 403; error: string }
> {
  const authSupabase = await createRouteHandlerClient()
  const {
    data: { user },
    error: authError,
  } = await authSupabase.auth.getUser()
  if (authError || !user) {
    return { allowed: false, status: 401, error: 'Unauthorized' }
  }
  const { data: roleRow } = await authSupabase
    .from('system_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()
  const role = roleRow?.role
  if (role !== 'coach' && role !== 'super_admin') {
    return {
      allowed: false,
      status: 403,
      error: 'Access denied — coach or super_admin required',
    }
  }
  return { allowed: true }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  let stage = 'init'
  try {
    stage = 'auth'
    const guard = await requireCoachOrSuperAdmin()
    if (!guard.allowed) {
      return NextResponse.json({ error: guard.error }, { status: guard.status })
    }

    stage = 'params'
    const { connectionId } = await params
    if (!connectionId || !UUID_REGEX.test(connectionId)) {
      return NextResponse.json(
        { error: 'connectionId must be a valid UUID' },
        { status: 400 },
      )
    }

    stage = 'validate'
    const body = await request.json().catch(() => null)
    const validation = validateTenantPatchPayload(body)
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    stage = 'update'
    const { data, error } = await adminDb
      .from('xero_connections')
      .update(validation.value)
      .eq('id', connectionId)
      .select()
      .maybeSingle()

    if (error) {
      console.error('[Tenant PATCH] update error:', error)
      return NextResponse.json(
        { error: 'Failed to update tenant', detail: error.message },
        { status: 500 },
      )
    }
    if (!data) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 },
      )
    }

    return NextResponse.json({ success: true, tenant: data })
  } catch (err) {
    console.error('[Tenant PATCH] unhandled error, stage:', stage, err)
    return NextResponse.json(
      { error: 'Internal error', stage, detail: String(err) },
      { status: 500 },
    )
  }
}
