/**
 * PATCH /api/consolidation/forecasts/[forecastId]
 *
 * Phase 34.3 — assign (or clear) the Xero tenant a financial_forecasts row
 * applies to. Minimal-adaptation alternative to threading a tenant-picker
 * step through the forecast wizard V2/V4 state machine (which is deeply
 * nested). The admin consolidation page shows a dropdown of tenants per
 * forecast and posts here on change.
 *
 * Accepted payload:
 *   { tenant_id: string }          → scope forecast to that Xero tenant
 *   { tenant_id: null }            → clear → legacy business-level forecast
 *
 * Role gate: coach OR super_admin (matches the sibling tenants PATCH route).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClient } from '@/lib/supabase/server'

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
  { params }: { params: Promise<{ forecastId: string }> },
) {
  let stage = 'init'
  try {
    stage = 'auth'
    const guard = await requireCoachOrSuperAdmin()
    if (!guard.allowed) {
      return NextResponse.json({ error: guard.error }, { status: guard.status })
    }

    stage = 'params'
    const { forecastId } = await params
    if (!forecastId || !UUID_REGEX.test(forecastId)) {
      return NextResponse.json(
        { error: 'forecastId must be a valid UUID' },
        { status: 400 },
      )
    }

    stage = 'validate'
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Body must be a JSON object with a tenant_id field' },
        { status: 400 },
      )
    }
    if (!('tenant_id' in body)) {
      return NextResponse.json(
        { error: 'tenant_id field is required (string or null)' },
        { status: 400 },
      )
    }
    const tenant_id = (body as any).tenant_id
    if (tenant_id !== null && typeof tenant_id !== 'string') {
      return NextResponse.json(
        { error: 'tenant_id must be a string or null' },
        { status: 400 },
      )
    }
    // Empty string → coerce to null (treat as "legacy / whole business").
    const normalized = tenant_id === '' ? null : tenant_id

    // Sanity-check: when setting a tenant_id, confirm the tenant exists on a
    // xero_connections row (prevents typos creating orphaned budgets).
    if (normalized !== null) {
      const { data: conn, error: connErr } = await adminDb
        .from('xero_connections')
        .select('id')
        .eq('tenant_id', normalized)
        .limit(1)
        .maybeSingle()
      if (connErr) {
        console.error('[Forecast PATCH] connection lookup error:', connErr)
        return NextResponse.json(
          {
            error: 'Failed to validate tenant_id',
            detail: connErr.message,
          },
          { status: 500 },
        )
      }
      if (!conn) {
        return NextResponse.json(
          {
            error:
              'tenant_id does not correspond to any xero_connections row',
          },
          { status: 400 },
        )
      }
    }

    stage = 'update'
    const { data, error } = await adminDb
      .from('financial_forecasts')
      .update({ tenant_id: normalized, updated_at: new Date().toISOString() })
      .eq('id', forecastId)
      .select('id, business_id, tenant_id, fiscal_year, name')
      .maybeSingle()

    if (error) {
      console.error('[Forecast PATCH] update error:', error)
      return NextResponse.json(
        { error: 'Failed to update forecast', detail: error.message },
        { status: 500 },
      )
    }
    if (!data) {
      return NextResponse.json(
        { error: 'Forecast not found' },
        { status: 404 },
      )
    }

    return NextResponse.json({ success: true, forecast: data })
  } catch (err) {
    console.error('[Forecast PATCH] unhandled error, stage:', stage, err)
    return NextResponse.json(
      { error: 'Internal error', stage, detail: String(err) },
      { status: 500 },
    )
  }
}
