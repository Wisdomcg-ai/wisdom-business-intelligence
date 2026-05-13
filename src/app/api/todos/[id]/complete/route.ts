/**
 * PATCH /api/todos/[id]/complete
 *
 * Phase 61 Plan 04 — Recipient/owner mark-complete via SECURITY DEFINER RPC.
 *
 * Body: { completed: boolean }
 *
 * This route is the carve-out for non-owner status flips. Generic UPDATE on
 * daily_tasks is owner-only by RLS; the RPC `mark_task_complete` (61-02) is
 * SECURITY DEFINER and performs its own visibility check, so any user who can
 * SEE the task (owner OR recipient) can flip its completion state through this
 * single narrow channel.
 *
 * Error mapping:
 *   - SQLSTATE 42501 (insufficient_privilege, raised by the RPC on visibility
 *     denial) → HTTP 403 (NOT logged to Sentry — expected access-denied path).
 *   - Any other RPC error → HTTP 500 + Sentry.captureException.
 */

import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import * as Sentry from '@sentry/nextjs'

export const dynamic = 'force-dynamic'

type Body = { completed?: unknown }

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const supabase = await createRouteHandlerClient()
  try {
    const { id: taskId } = await ctx.params

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json().catch(() => ({}))) as Body
    if (typeof body.completed !== 'boolean') {
      return NextResponse.json(
        { error: 'completed (boolean) is required' },
        { status: 400 },
      )
    }

    const { data, error } = await supabase.rpc('mark_task_complete', {
      p_task_id: taskId,
      p_completed: body.completed,
    })

    if (error) {
      if ((error as any).code === '42501') {
        // Expected access-denied path — not a programmer error, skip Sentry.
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
      Sentry.captureException(error, {
        tags: { route: 'todos/complete' },
        extra: { context: '[todos/complete] RPC failed', taskId },
      } as any)
      return NextResponse.json(
        { error: 'Mark complete failed', code: (error as any).code },
        { status: 500 },
      )
    }

    const row = data as { user_id?: string } | null
    return NextResponse.json({
      task: { ...(row ?? {}), is_owner: row?.user_id === user.id },
    })
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: 'todos/complete' },
      extra: { context: '[todos/complete] unexpected error' },
    } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
