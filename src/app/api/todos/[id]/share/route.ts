/**
 * PATCH /api/todos/[id]/share
 *
 * Phase 61 Plan 04 — Owner-only share/unshare for daily_tasks.
 *
 * Body: { mode: 'private' | 'team' | 'specific', userIds?: string[] }
 *
 * Asymmetric policy model:
 *   - SELECT was broadened in 61-02 to include recipients.
 *   - INSERT/UPDATE/DELETE remain strictly owner-only via RLS, AND this route
 *     additionally enforces a 403 on visible-but-not-owner so the API contract
 *     is friendly (RLS alone would silently reject with 0 rows affected).
 *   - This route does NOT use any service-role bypass — RLS is the gate.
 *   - When mode='specific', userIds are validated against business_users
 *     (status='active', same business_id) so stale UUIDs never enter the array.
 */

import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import { withSchema } from '@/lib/api/with-schema'

export const dynamic = 'force-dynamic'

type ShareMode = 'private' | 'team' | 'specific'
type Body = { mode?: ShareMode; userIds?: string[] }

// PATCH body: { mode, userIds? } — share visibility mode + optional teammate ids.
const PatchBodySchema = z
  .object({
    mode: z.enum(['private', 'team', 'specific']),
    userIds: z.array(z.string()).optional(),
  })
  .passthrough()

async function patchHandler(
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
    const { mode, userIds } = body
    if (!mode || !['private', 'team', 'specific'].includes(mode)) {
      return NextResponse.json(
        { error: 'mode must be private|team|specific' },
        { status: 400 },
      )
    }

    // Pre-validate empty/missing userIds BEFORE fetching the row.
    if (mode === 'specific' && (!Array.isArray(userIds) || userIds.length === 0)) {
      return NextResponse.json(
        { error: 'specific mode requires at least one teammate' },
        { status: 400 },
      )
    }

    const { data: row } = await supabase
      .from('daily_tasks')
      .select('id, user_id, business_id')
      .eq('id', taskId)
      .maybeSingle()

    if (!row) {
      // RLS-hidden → 404 (intentionally indistinguishable from "doesn't exist")
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }
    if (row.user_id !== user.id) {
      // Visible-but-not-owner → friendlier 403
      return NextResponse.json(
        { error: 'Only the task owner can share' },
        { status: 403 },
      )
    }

    if (mode === 'specific') {
      if (!row.business_id) {
        return NextResponse.json(
          { error: 'Task has no business context; cannot share with specific teammates' },
          { status: 400 },
        )
      }
      const { data: members } = await supabase
        .from('business_users')
        .select('user_id')
        .eq('business_id', row.business_id)
        .eq('status', 'active')
        .in('user_id', userIds!)
      const valid = new Set((members ?? []).map((m: { user_id: string }) => m.user_id))
      const invalid = userIds!.filter((u) => !valid.has(u))
      if (invalid.length > 0) {
        return NextResponse.json(
          { error: 'invalid teammate user_ids', invalid },
          { status: 400 },
        )
      }
    }

    const patch =
      mode === 'private'
        ? { shared_with_all: false, shared_with: [] as string[] }
        : mode === 'team'
          ? { shared_with_all: true, shared_with: [] as string[] }
          : { shared_with_all: false, shared_with: userIds! }

    const { data: updated, error: updErr } = await supabase
      .from('daily_tasks')
      .update(patch)
      .eq('id', taskId)
      .eq('user_id', user.id)
      .select('*')
      .single()

    if (updErr) {
      Sentry.captureException(updErr, {
        tags: { route: 'todos/share' },
        extra: { context: '[todos/share] update failed', taskId },
      } as any)
      return NextResponse.json(
        { error: 'Share failed', code: (updErr as any).code },
        { status: 500 },
      )
    }

    return NextResponse.json({ task: { ...updated, is_owner: true } })
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: 'todos/share' },
      extra: { context: '[todos/share] unexpected error' },
    } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const PATCH = withSchema('todos/[id]/share', PatchBodySchema, patchHandler)
