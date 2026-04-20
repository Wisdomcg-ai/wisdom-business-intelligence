/**
 * DELETE /api/consolidation/fx-rates/[id]
 *
 * Plan 34-00f — deletes a single fx_rates row by id.
 *
 * Role gate: coach OR super_admin.
 *
 * We use the dynamic-segment variant rather than the query-string (?id=)
 * variant the pre-pivot plan proposed: the pivot-era objective (this prompt)
 * explicitly specifies `DELETE /api/consolidation/fx-rates/[id]`, and it is
 * the idiomatic REST shape.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const adminDb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

// UUID format guard — cheap filter before we hit the DB.
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

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let stage = 'init'
  try {
    stage = 'auth'
    const guard = await requireCoachOrSuperAdmin()
    if (!guard.allowed) {
      return NextResponse.json({ error: guard.error }, { status: guard.status })
    }

    stage = 'validate'
    const { id } = await params
    if (!id || !UUID_REGEX.test(id)) {
      return NextResponse.json(
        { error: 'id must be a valid UUID' },
        { status: 400 },
      )
    }

    stage = 'delete'
    const { error } = await adminDb.from('fx_rates').delete().eq('id', id)
    if (error) {
      return NextResponse.json(
        { error: 'Failed to delete rate', detail: error.message },
        { status: 500 },
      )
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[FX Rates] unhandled DELETE error, stage:', stage, err)
    return NextResponse.json(
      { error: 'Internal error', stage, detail: String(err) },
      { status: 500 },
    )
  }
}
