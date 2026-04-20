/**
 * PATCH /api/consolidation/businesses/[id]
 *
 * Phase 34 Step 2 — Hybrid Budget Mode toggle.
 *
 * Lets a coach / super_admin switch a business between:
 *   - 'single'     → one business-level forecast drives the consolidated Budget
 *   - 'per_tenant' → each Xero tenant has its own forecast, summed into the
 *                    consolidated Budget (Calxa-style)
 *
 * Access control:
 *   1. Auth-gated (401 on unsigned requests)
 *   2. Role gate: coach OR super_admin (403 otherwise — matches sibling
 *      /api/consolidation routes)
 *   3. Business-access check: owner_id = user.id OR assigned_coach_id = user.id
 *      OR role = super_admin (404 / 403 otherwise). Super admins bypass the
 *      ownership check — they can administer any business.
 *
 * Dual-client pattern (mirrors fx-rates and tenants routes):
 *   - createRouteHandlerClient() reads the user's cookie session (RLS-scoped)
 *   - createClient(.., SERVICE_KEY) performs the write (bypasses RLS, same
 *     pattern used elsewhere in this codebase)
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

const VALID_MODES = ['single', 'per_tenant'] as const
type BudgetMode = (typeof VALID_MODES)[number]

/**
 * Check that:
 *   1. A session exists
 *   2. The user's system role is coach or super_admin
 *   3. The user can access this business (owner/coach/super_admin)
 *
 * Returns `{ allowed: true }` on success with the resolved userId + role, or
 * a denial with an appropriate status code.
 */
async function requireAccess(
  businessId: string,
): Promise<
  | { allowed: true; userId: string; role: 'coach' | 'super_admin' }
  | { allowed: false; status: 401 | 403 | 404; error: string }
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

  // Super admins bypass the ownership check.
  if (role === 'super_admin') {
    return { allowed: true, userId: user.id, role }
  }

  // Coach: must own the business OR be the assigned coach.
  const { data: biz } = await authSupabase
    .from('businesses')
    .select('id')
    .eq('id', businessId)
    .or(`owner_id.eq.${user.id},assigned_coach_id.eq.${user.id}`)
    .maybeSingle()
  if (!biz) {
    return {
      allowed: false,
      status: 403,
      error: 'Access denied — not owner/coach for this business',
    }
  }
  return { allowed: true, userId: user.id, role }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let stage = 'init'
  try {
    stage = 'params'
    const { id } = await params
    if (!id || !UUID_REGEX.test(id)) {
      return NextResponse.json(
        { error: 'id must be a valid UUID' },
        { status: 400 },
      )
    }

    stage = 'auth'
    const guard = await requireAccess(id)
    if (!guard.allowed) {
      return NextResponse.json({ error: guard.error }, { status: guard.status })
    }

    stage = 'validate'
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Body must be a JSON object' },
        { status: 400 },
      )
    }

    // Only consolidation_budget_mode is currently editable here. Extending
    // this endpoint later (e.g. consolidation display name) is a follow-on.
    const patch: Record<string, unknown> = {}

    if ('consolidation_budget_mode' in body) {
      const mode = (body as any).consolidation_budget_mode
      if (!VALID_MODES.includes(mode)) {
        return NextResponse.json(
          {
            error: `consolidation_budget_mode must be one of ${VALID_MODES.join(' | ')}`,
          },
          { status: 400 },
        )
      }
      patch.consolidation_budget_mode = mode as BudgetMode
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: 'No updatable fields provided' },
        { status: 400 },
      )
    }

    stage = 'update'
    const { data, error } = await adminDb
      .from('businesses')
      .update(patch)
      .eq('id', id)
      .select('id, name, consolidation_budget_mode')
      .maybeSingle()

    if (error) {
      console.error('[Business PATCH] update error:', error)
      return NextResponse.json(
        { error: 'Failed to update business', detail: error.message },
        { status: 500 },
      )
    }
    if (!data) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, business: data })
  } catch (err) {
    console.error('[Business PATCH] unhandled error, stage:', stage, err)
    return NextResponse.json(
      { error: 'Internal error', stage, detail: String(err) },
      { status: 500 },
    )
  }
}
