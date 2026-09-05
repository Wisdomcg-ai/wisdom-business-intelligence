/**
 * POST /api/cfo/recon-round-request — queue a Xero badge recon round.
 *
 * The round itself runs on Matt's Mac (Claude driving his logged-in Chrome —
 * no API exposes the badge). This route only writes a request row; the
 * Mac-side watcher (scripts/recon-round-watcher.mjs) picks it up within a
 * minute. Deduped: an already-pending/running request inside the pickup
 * window is returned instead of inserting a duplicate.
 *
 * Coach-only surface: service-role client bypasses RLS, so authz is
 * app-layer (role gate; mirrors board-settings/route.ts).
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import * as Sentry from '@sentry/nextjs'
import { withSchema } from '@/lib/api/with-schema'
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { createRouteHandlerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Next.js route files may only export route handlers/config, so these are
// module-local. Keep in step with the page's PICKUP_WINDOW_MINUTES and the
// watcher's RUN_TIMEOUT_MINUTES.
/** A pending request older than this was never picked up — the watcher (or
 *  the next reader) treats it as expired rather than silently eternal. */
const PICKUP_WINDOW_MINUTES = 30

/** A 'running' row this old is a corpse (the watcher kills real runs at 40
 *  min) — retired server-side so a dead Mac can never wedge the queue
 *  against the one-live unique index. */
const SERVER_RUNNING_TIMEOUT_MINUTES = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey()
)

const PostBodySchema = z.object({}).passthrough()

async function postHandler(_request: Request) {
  try {
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
    if (roleRow?.role !== 'super_admin' && roleRow?.role !== 'coach') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Server-side janitor: without this, a dead Mac's zombie pending/running
    // row would hold the one-live unique index forever and no request could
    // ever be queued again. The watcher normally retires these first; this
    // path only fires when the watcher itself is gone.
    const nowIso = new Date().toISOString()
    await supabase
      .from('recon_round_requests')
      .update({ status: 'expired', finished_at: nowIso, result_note: `Not picked up within ${PICKUP_WINDOW_MINUTES} min (Mac asleep or watcher not running)` })
      .eq('status', 'pending')
      .lt('requested_at', new Date(Date.now() - PICKUP_WINDOW_MINUTES * 60_000).toISOString())
    await supabase
      .from('recon_round_requests')
      .update({ status: 'failed', finished_at: nowIso, result_note: `Run never finished within ${SERVER_RUNNING_TIMEOUT_MINUTES} min — retired by the server (Mac likely slept mid-run)` })
      .eq('status', 'running')
      .lt('started_at', new Date(Date.now() - SERVER_RUNNING_TIMEOUT_MINUTES * 60_000).toISOString())

    // Dedupe: one live request at a time. 'running' matches at ANY age (the
    // watcher's timeout is what retires it, not this window); 'pending' only
    // inside the pickup window — an older pending was never collected and
    // shouldn't block a retry. Backstopped by the partial unique index
    // recon_round_requests_one_live.
    const windowStart = new Date(Date.now() - PICKUP_WINDOW_MINUTES * 60_000).toISOString()
    const liveFilter = `status.eq.running,and(status.eq.pending,requested_at.gte.${windowStart})`
    const { data: existing } = await supabase
      .from('recon_round_requests')
      .select('id, status, requested_at, started_at')
      .or(liveFilter)
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (existing) {
      return NextResponse.json({ success: true, request: existing, existing: true })
    }

    const { data: row, error } = await supabase
      .from('recon_round_requests')
      .insert({ requested_by: user.id, source: 'button' })
      .select('id, status, requested_at')
      .single()
    if (error) {
      // 23505 = the one-live unique index caught a concurrent queue/claim —
      // that's a dedupe hit, not a failure.
      if ((error as { code?: string }).code === '23505') {
        const { data: winner } = await supabase
          .from('recon_round_requests')
          .select('id, status, requested_at, started_at')
          .in('status', ['pending', 'running'])
          .order('requested_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (winner) return NextResponse.json({ success: true, request: winner, existing: true })
      }
      Sentry.captureException(error, {
        tags: { route: 'cfo/recon-round-request', invariant: 'recon_round_request_write_failed' },
        extra: { context: '[Recon Round] request insert failed' },
      } as any)
      return NextResponse.json({ error: 'Failed to queue the recon round' }, { status: 500 })
    }
    return NextResponse.json({ success: true, request: row, existing: false })
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: 'cfo/recon-round-request' },
      extra: { context: '[Recon Round] request failed' },
    } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withSchema('cfo/recon-round-request', PostBodySchema, postHandler)
