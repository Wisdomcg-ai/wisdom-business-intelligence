import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { notifyCoachActionCompleted } from '@/lib/notifications'
import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import { withSchema, withQuerySchema } from '@/lib/api/with-schema'

export const dynamic = 'force-dynamic'

const GetQuerySchema = z
  .object({
    business_id: z.string().optional(),
    status: z.string().optional(),
  })
  .passthrough()

const PutBodySchema = z
  .object({
    action_id: z.string(),
    status: z.string(),
  })
  .passthrough()

async function getHandler(request: Request) {
  const supabase = await createRouteHandlerClient()
  const { searchParams } = new URL(request.url)
  const businessId = searchParams.get('business_id')
  const status = searchParams.get('status')

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let query = supabase
      .from('session_actions')
      .select(`
        *,
        coaching_sessions!inner (
          id,
          title,
          scheduled_at
        )
      `)
      .order('created_at', { ascending: false })

    // Filter by business if specified
    if (businessId) {
      query = query.eq('business_id', businessId)
    } else {
      // No business specified — check role first to decide scope.
      // Previously this tried owner_id before assigned_coach_id, which
      // produced the wrong scope for a coach who also owned a business.
      const { data: roleRow } = await supabase
        .from('system_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle()
      const role = roleRow?.role

      if (role === 'coach' || role === 'super_admin') {
        // Coach/admin — all actions across assigned clients
        const { data: businesses } = await supabase
          .from('businesses')
          .select('id')
          .eq('assigned_coach_id', user.id)

        const businessIds = businesses?.map(b => b.id) || []
        if (businessIds.length === 0) {
          return NextResponse.json({ success: true, actions: [] })
        }
        query = query.in('business_id', businessIds)
      } else {
        // Client — their own business
        const { data: businessData } = await supabase
          .from('businesses')
          .select('id')
          .eq('owner_id', user.id)
          .maybeSingle()

        if (!businessData) {
          return NextResponse.json({ success: true, actions: [] })
        }
        query = query.eq('business_id', businessData.id)
      }
    }

    // Filter by status if specified
    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    const { data: actions, error: actionsError } = await query

    if (actionsError) {
      Sentry.captureException(actionsError, { tags: { route: 'actions' }, extra: { context: "Error loading actions" } } as any)
      return NextResponse.json({ error: 'Failed to load actions' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      actions: actions || []
    })

  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'actions' }, extra: { context: "Actions API error" } } as any)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}

async function putHandler(request: Request) {
  const supabase = await createRouteHandlerClient()

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action_id, status } = body

    if (!action_id || !status) {
      return NextResponse.json({ error: 'action_id and status required' }, { status: 400 })
    }

    // Update action status
    const { data: action, error: updateError } = await supabase
      .from('session_actions')
      .update({ status })
      .eq('id', action_id)
      .select('*, coaching_sessions!inner(business_id, businesses!inner(business_name, assigned_coach_id))')
      .single()

    if (updateError) {
      Sentry.captureException(updateError, { tags: { route: 'actions' }, extra: { context: "Error updating action" } } as any)
      return NextResponse.json({ error: 'Failed to update action' }, { status: 500 })
    }

    // If action was just completed, notify the coach
    if (status === 'completed' && action) {
      const session = (action as any).coaching_sessions
      const business = session?.businesses
      const coachId = business?.assigned_coach_id
      const businessName = business?.business_name

      if (coachId && businessName) {
        // Get client name
        const { data: clientData } = await supabase
          .from('businesses')
          .select('owner_id')
          .eq('id', session.business_id)
          .single()

        if (clientData) {
          const { data: userData } = await supabase.auth.admin.getUserById(clientData.owner_id)
          const clientName = userData.user?.user_metadata?.full_name || userData.user?.email || 'Client'

          // Send notification to coach
          await notifyCoachActionCompleted(
            coachId,
            session.business_id,
            action.action_text,
            clientName
          )
        }
      }
    }

    return NextResponse.json({
      success: true,
      action
    })

  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'actions' }, extra: { context: "Update action API error" } } as any)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}

export const GET = withQuerySchema('actions', GetQuerySchema, getHandler)
export const PUT = withSchema('actions', PutBodySchema, putHandler)
