/**
 * GET /api/consolidation/fx-rates/sync-oxr/health
 *
 * Reports whether OPENEXCHANGERATES_APP_ID is configured. Does NOT reveal
 * the key itself — just confirms presence and basic shape so you can
 * diagnose "sync returns 500" from production without server logs.
 *
 * Auth-gated (coach or super_admin) so unauthenticated traffic can't probe.
 */

import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const authSupabase = await createRouteHandlerClient()
    const {
      data: { user },
      error: authError,
    } = await authSupabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: roleRow } = await authSupabase
      .from('system_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()
    const role = roleRow?.role
    if (role !== 'coach' && role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const appId = process.env.OPENEXCHANGERATES_APP_ID ?? ''
    return NextResponse.json({
      openexchangerates_app_id_present: appId.length > 0,
      openexchangerates_app_id_length: appId.length,
      // Show first 4 chars only — enough to visually confirm the right key
      // is loaded without revealing the full secret.
      openexchangerates_app_id_prefix: appId.slice(0, 4),
      node_env: process.env.NODE_ENV,
      vercel_env: process.env.VERCEL_ENV ?? null,
      vercel_deployment: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Internal error', detail: String(err) },
      { status: 500 },
    )
  }
}
