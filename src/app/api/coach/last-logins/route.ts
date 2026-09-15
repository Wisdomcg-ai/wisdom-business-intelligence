/**
 * GET last_sign_in_at for a list of user_ids — the single source of truth for
 * "last login". Reads auth.users.last_sign_in_at via Supabase Admin, which
 * Supabase maintains automatically on every successful auth (password, magic
 * link, OAuth, etc.). Replaces the prior split-source design that read from
 * two custom mirrors (public.users.last_login_at and user_logins.login_at),
 * both of which drifted from reality.
 *
 * Auth: coach or super_admin only.
 *
 * Request body: { user_ids: string[] }
 * Response: { data: Record<user_id, ISO timestamp | null> }
 */
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'

export async function POST(request: Request) {
  const supabase = await createRouteHandlerClient()

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: roleData } = await supabase
      .from('system_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!roleData || (roleData.role !== 'coach' && roleData.role !== 'super_admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const userIds: string[] = Array.isArray(body?.user_ids) ? body.user_ids : []
    if (userIds.length === 0) {
      return NextResponse.json({ data: {} })
    }

    const admin = createServiceRoleClient()

    // Per-user fetch in parallel. For an 18-client coach this is ~18 calls,
    // sub-second. If this becomes hot, switch to listUsers() pagination + filter.
    const entries = await Promise.all(
      userIds.map(async (id) => {
        try {
          const { data, error } = await admin.auth.admin.getUserById(id)
          if (error) return [id, null] as const
          return [id, data.user?.last_sign_in_at ?? null] as const
        } catch {
          return [id, null] as const
        }
      }),
    )

    const map: Record<string, string | null> = {}
    for (const [id, ts] of entries) map[id] = ts

    return NextResponse.json({ data: map })
  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'coach/last-logins' } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
