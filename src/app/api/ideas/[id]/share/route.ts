/**
 * PATCH /api/ideas/[id]/share
 *
 * Phase 61 Plan 04 — Owner-only share/unshare for ideas.
 *
 * Body: { mode: 'private' | 'team' | 'specific', userIds?: string[] }
 *
 * Symmetric to /api/todos/[id]/share — table is `ideas`, response key is `idea`.
 * Same asymmetric policy model: SELECT broadened, mutations owner-only.
 */

import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import * as Sentry from '@sentry/nextjs'

export const dynamic = 'force-dynamic'

type ShareMode = 'private' | 'team' | 'specific'
type Body = { mode?: ShareMode; userIds?: string[] }

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const supabase = await createRouteHandlerClient()
  try {
    const { id: ideaId } = await ctx.params

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

    if (mode === 'specific' && (!Array.isArray(userIds) || userIds.length === 0)) {
      return NextResponse.json(
        { error: 'specific mode requires at least one teammate' },
        { status: 400 },
      )
    }

    const { data: row } = await supabase
      .from('ideas')
      .select('id, user_id, business_id')
      .eq('id', ideaId)
      .maybeSingle()

    if (!row) {
      return NextResponse.json({ error: 'Idea not found' }, { status: 404 })
    }
    if (row.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Only the idea owner can share' },
        { status: 403 },
      )
    }

    if (mode === 'specific') {
      if (!row.business_id) {
        return NextResponse.json(
          { error: 'Idea has no business context; cannot share with specific teammates' },
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
      .from('ideas')
      .update(patch)
      .eq('id', ideaId)
      .eq('user_id', user.id)
      .select('*')
      .single()

    if (updErr) {
      Sentry.captureException(updErr, {
        tags: { route: 'ideas/share' },
        extra: { context: '[ideas/share] update failed', ideaId },
      } as any)
      return NextResponse.json(
        { error: 'Share failed', code: (updErr as any).code },
        { status: 500 },
      )
    }

    return NextResponse.json({ idea: { ...updated, is_owner: true } })
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: 'ideas/share' },
      extra: { context: '[ideas/share] unexpected error' },
    } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
