/**
 * POST/GET /api/consolidation/fx-rates
 *
 * Plan 34-00f — admin FX rate entry for the multi-tenant consolidation.
 *
 * Dual-client pattern:
 *   - `createRouteHandlerClient()` reads the user's cookie session → auth check
 *     + role lookup happen against the SAME DB row the session owner can see.
 *   - `createClient(..SUPABASE_SERVICE_KEY..)` performs the actual write — bypasses
 *     RLS, consistent with every other fx/consolidation route in this repo.
 *
 * Role gate: coach OR super_admin. Clients receive 403.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { validateFxRatePayload } from '@/lib/consolidation/admin-guards'

export const dynamic = 'force-dynamic'

const adminDb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

type Guard =
  | { allowed: true; userId: string; role: 'coach' | 'super_admin' }
  | { allowed: false; status: 401 | 403; error: string }

async function requireCoachOrSuperAdmin(): Promise<Guard> {
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
  return { allowed: true, userId: user.id, role }
}

export async function POST(request: NextRequest) {
  let stage = 'init'
  try {
    stage = 'auth'
    const guard = await requireCoachOrSuperAdmin()
    if (!guard.allowed) {
      return NextResponse.json({ error: guard.error }, { status: guard.status })
    }

    stage = 'validate'
    const body = await request.json().catch(() => null)
    const validation = validateFxRatePayload(body)
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }
    const { currency_pair, rate_type, period, rate } = validation.value

    stage = 'upsert'
    const { data, error } = await adminDb
      .from('fx_rates')
      .upsert(
        { currency_pair, rate_type, period, rate, source: 'manual' },
        { onConflict: 'currency_pair,rate_type,period' },
      )
      .select()
      .single()

    if (error) {
      console.error('[FX Rates] upsert error:', error)
      return NextResponse.json(
        { error: 'Failed to save rate', detail: error.message },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true, rate: data })
  } catch (err) {
    console.error('[FX Rates] unhandled POST error, stage:', stage, err)
    return NextResponse.json(
      { error: 'Internal error', stage, detail: String(err) },
      { status: 500 },
    )
  }
}

export async function GET(request: NextRequest) {
  let stage = 'init'
  try {
    stage = 'auth'
    const guard = await requireCoachOrSuperAdmin()
    if (!guard.allowed) {
      return NextResponse.json({ error: guard.error }, { status: guard.status })
    }

    stage = 'query'
    const url = new URL(request.url)
    const currencyPair = url.searchParams.get('currency_pair')

    let query = adminDb
      .from('fx_rates')
      .select('*')
      .order('currency_pair', { ascending: true })
      .order('period', { ascending: false })
    if (currencyPair) query = query.eq('currency_pair', currencyPair)

    const { data, error } = await query
    if (error) {
      return NextResponse.json(
        { error: 'Failed to list rates', detail: error.message },
        { status: 500 },
      )
    }
    return NextResponse.json({ success: true, rates: data ?? [] })
  } catch (err) {
    console.error('[FX Rates] unhandled GET error, stage:', stage, err)
    return NextResponse.json(
      { error: 'Internal error', stage, detail: String(err) },
      { status: 500 },
    )
  }
}
