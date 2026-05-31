/**
 * PATCH /api/ideas/[id]/status
 *
 * Phase 61 Plan 04 — Recipient/owner status flip via SECURITY DEFINER RPC.
 *
 * Body: { status: string }
 *
 * Symmetric to /api/todos/[id]/complete. The RPC `mark_idea_status` (61-02)
 * validates `p_status` against the IdeaStatus TS union ('captured' |
 * 'under_review' | 'approved' | 'rejected' | 'parked') and raises
 * SQLSTATE 22P02 on invalid input.
 *
 * Error mapping:
 *   - SQLSTATE 42501 → HTTP 403 (visibility denied, not Sentry-worthy).
 *   - SQLSTATE 22P02 → HTTP 400 (invalid status string, not Sentry-worthy).
 *   - Any other RPC error → HTTP 500 + Sentry.captureException.
 */

import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import { withSchema } from '@/lib/api/with-schema'

export const dynamic = 'force-dynamic'

type Body = { status?: unknown }

// PATCH body: { status } — validated against IdeaStatus union by the RPC; modeled as string here.
const PatchBodySchema = z.object({ status: z.string() }).passthrough()

async function patchHandler(
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
    if (typeof body.status !== 'string' || body.status.length === 0) {
      return NextResponse.json(
        { error: 'status (non-empty string) is required' },
        { status: 400 },
      )
    }

    const { data, error } = await supabase.rpc('mark_idea_status', {
      p_idea_id: ideaId,
      p_status: body.status,
    })

    if (error) {
      const code = (error as any).code
      if (code === '42501') {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
      if (code === '22P02') {
        return NextResponse.json(
          { error: 'Invalid status', code: '22P02' },
          { status: 400 },
        )
      }
      Sentry.captureException(error, {
        tags: { route: 'ideas/status' },
        extra: { context: '[ideas/status] RPC failed', ideaId },
      } as any)
      return NextResponse.json(
        { error: 'Status update failed', code },
        { status: 500 },
      )
    }

    const row = data as { user_id?: string } | null
    return NextResponse.json({
      idea: { ...(row ?? {}), is_owner: row?.user_id === user.id },
    })
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: 'ideas/status' },
      extra: { context: '[ideas/status] unexpected error' },
    } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const PATCH = withSchema('ideas/[id]/status', PatchBodySchema, patchHandler)
