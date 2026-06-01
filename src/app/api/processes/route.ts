import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import { withSchema, withQuerySchema } from '@/lib/api/with-schema'

// GET searchParams: { user_id? } (string-typed query).
const GetQuerySchema = z.object({ user_id: z.string().optional() }).passthrough()

// POST body: { name, description?, process_data?, user_id? } — create a process diagram.
const PostBodySchema = z
  .object({
    name: z.string(),
    description: z.string().nullish(),
    process_data: z.unknown().optional(),
    user_id: z.string().optional(),
  })
  .passthrough()

// GET /api/processes — list all processes for the user
async function getHandler(request: Request) {
  try {
    const supabase = await createRouteHandlerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const requestedUserId = searchParams.get('user_id')
    const userId = requestedUserId || user.id

    // If requesting another user's processes, verify access
    if (requestedUserId && requestedUserId !== user.id) {
      // Check if the requesting user is a team member or coach of a business owned by the target user
      const { data: accessCheck } = await supabase
        .from('business_users')
        .select('business_id, businesses!inner(owner_id)')
        .eq('user_id', user.id)

      const { data: coachCheck } = await supabase
        .from('businesses')
        .select('id')
        .eq('assigned_coach_id', user.id)
        .eq('owner_id', requestedUserId)

      const hasTeamAccess = accessCheck?.some(
        (bu: any) => (bu.businesses as any)?.owner_id === requestedUserId
      )
      const hasCoachAccess = coachCheck && coachCheck.length > 0

      if (!hasTeamAccess && !hasCoachAccess) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    }

    const { data, error } = await supabase
      .from('process_diagrams')
      .select('id, name, description, status, step_count, swimlane_count, created_at, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })

    if (error) {
      Sentry.captureException(error, { tags: { route: 'processes' }, extra: { context: "[Processes API] List error" } } as any)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ processes: data || [] })
  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'processes' }, extra: { context: "[Processes API] Unexpected error" } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withQuerySchema('processes', GetQuerySchema, getHandler)

// POST /api/processes — create a new process
async function postHandler(request: Request) {
  try {
    const supabase = await createRouteHandlerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const { name, description, process_data, user_id } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Process name is required' }, { status: 400 })
    }

    const targetUserId = user_id || user.id

    // If creating for another user, verify access
    if (user_id && user_id !== user.id) {
      const { data: accessCheck } = await supabase
        .from('business_users')
        .select('business_id, businesses!inner(owner_id)')
        .eq('user_id', user.id)

      const { data: coachCheck } = await supabase
        .from('businesses')
        .select('id')
        .eq('assigned_coach_id', user.id)
        .eq('owner_id', user_id)

      const hasTeamAccess = accessCheck?.some(
        (bu: any) => (bu.businesses as any)?.owner_id === user_id
      )
      const hasCoachAccess = coachCheck && coachCheck.length > 0

      if (!hasTeamAccess && !hasCoachAccess) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    }

    const { data, error } = await supabase
      .from('process_diagrams')
      .insert({
        user_id: targetUserId,
        name: name.trim(),
        description: description || null,
        status: 'draft',
        process_data: process_data || { notes: [], swimlanes: [], phases: [], steps: [], flows: [] },
        step_count: 0,
        decision_count: 0,
        swimlane_count: 0,
      })
      .select()
      .single()

    if (error) {
      Sentry.captureException(error, { tags: { route: 'processes' }, extra: { context: "[Processes API] Create error" } } as any)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ process: data }, { status: 201 })
  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'processes' }, extra: { context: "[Processes API] Unexpected error" } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withSchema('processes', PostBodySchema, postHandler)
