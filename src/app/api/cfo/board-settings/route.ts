/**
 * POST /api/cfo/board-settings — narrow write for the production board's
 * per-client settings: report due day + bookkeeper contact.
 *
 * Deliberately NOT routed through /api/monthly-report/settings: that route
 * upserts a FULL settings payload with defaults for absent fields, so a
 * partial edit from the board would silently reset a client's report section
 * toggles. This route touches only its three columns.
 *
 * Coach-only surface: service-role client bypasses RLS, so authz is app-layer
 * (role gate + assigned_coach_id ownership; mirrors flag-client/route.ts).
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import * as Sentry from '@sentry/nextjs'
import { withSchema } from '@/lib/api/with-schema'
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { createRouteHandlerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Module-level service-role client (mirrors flag-client/route.ts)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey()
)

const PostBodySchema = z
  .object({
    business_id: z.string(),
    report_due_day: z.number().nullable().optional(),
    bookkeeper_name: z.string().nullable().optional(),
    bookkeeper_email: z.string().nullable().optional(),
  })
  .passthrough()

async function postHandler(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const businessId: unknown = body?.business_id
    if (typeof businessId !== 'string' || businessId.length === 0) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 })
    }

    const patch: Record<string, unknown> = {}
    if ('report_due_day' in body) {
      const day = body.report_due_day
      if (day !== null && (typeof day !== 'number' || !Number.isInteger(day) || day < 1 || day > 28)) {
        return NextResponse.json({ error: 'report_due_day must be 1-28 or null' }, { status: 400 })
      }
      patch.report_due_day = day
    }
    if ('bookkeeper_name' in body) {
      patch.bookkeeper_name = typeof body.bookkeeper_name === 'string' ? body.bookkeeper_name.trim() || null : null
    }
    if ('bookkeeper_email' in body) {
      const email = typeof body.bookkeeper_email === 'string' ? body.bookkeeper_email.trim() : ''
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json({ error: 'bookkeeper_email is not a valid email' }, { status: 400 })
      }
      patch.bookkeeper_email = email || null
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
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

    if (!isSuperAdmin) {
      const { data: biz } = await supabase
        .from('businesses')
        .select('assigned_coach_id')
        .eq('id', businessId)
        .maybeSingle()
      if (!biz || biz.assigned_coach_id !== user.id) {
        return NextResponse.json(
          { error: 'Access denied — not your assigned client' },
          { status: 403 }
        )
      }
    }

    // Row may not exist yet (settings are create-on-first-edit). The upsert
    // inserts with DB defaults for everything else; on conflict it updates
    // ONLY the patched columns. onConflict matches the table's UNIQUE
    // (business_id).
    const { data: row, error } = await supabase
      .from('monthly_report_settings')
      .upsert(
        { business_id: businessId, ...patch, updated_at: new Date().toISOString() },
        { onConflict: 'business_id', ignoreDuplicates: false },
      )
      .select('business_id, report_due_day, bookkeeper_name, bookkeeper_email')
      .single()
    if (error) {
      Sentry.captureException(error, {
        tags: { route: 'cfo/board-settings', invariant: 'board_settings_write_failed' },
        extra: { context: '[Board Settings] upsert failed', business_id: businessId },
      } as any)
      return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
    }

    return NextResponse.json({ success: true, settings: row })
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: 'cfo/board-settings' },
      extra: { context: '[Board Settings] request failed' },
    } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withSchema('cfo/board-settings', PostBodySchema, postHandler)
