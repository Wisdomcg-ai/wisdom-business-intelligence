import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import { withSchema, withQuerySchema } from '@/lib/api/with-schema'

// POST body: { business_id } — drives the user_logins upsert.
const PostBodySchema = z.object({ business_id: z.string() }).passthrough()

// GET searchParams: { business_id? } (string-typed query).
const GetQuerySchema = z.object({ business_id: z.string().optional() }).passthrough()

async function postHandler(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { business_id } = body

    if (!business_id) {
      return NextResponse.json(
        { error: 'business_id is required' },
        { status: 400 }
      )
    }

    const userAgent = request.headers.get('user-agent') || null
    const nowISO = new Date().toISOString()

    // Use admin client to bypass RLS — user is already authenticated above.
    // The RLS FOR ALL policy can block the UPDATE part of upserts through PostgREST,
    // causing login_at to never update after the initial INSERT.
    const adminSupabase = createServiceRoleClient()

    const { data, error } = await adminSupabase
      .from('user_logins')
      .upsert({
        user_id: user.id,
        business_id,
        login_at: nowISO,
        user_agent: userAgent
      }, {
        onConflict: 'user_id,business_id'
      })
      .select()

    if (error) {
      Sentry.captureException(error, { tags: { route: 'activity-log/login' }, extra: { context: "[Login Track] Error" } } as any)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Also update users.last_login_at to keep both tables in sync
    adminSupabase
      .from('users')
      .update({ last_login_at: nowISO })
      .eq('id', user.id)
      .then(({ error: syncError }) => {
        if (syncError) {
          Sentry.captureMessage(`[Login Track] Failed to sync users.last_login_at: ${syncError.message}`, 'warning' as any)
        }
      })

    return NextResponse.json({ success: true, data })
  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'activity-log/login' }, extra: { context: "[Login Track] Error" } } as any)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withSchema(
  'activity-log/login',
  PostBodySchema,
  postHandler as unknown as (request: Request) => Promise<Response>
)

async function getHandler(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('business_id')

    if (!businessId) {
      return NextResponse.json(
        { error: 'business_id is required' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('user_logins')
      .select('*')
      .eq('business_id', businessId)
      .order('login_at', { ascending: false })

    if (error) {
      Sentry.captureException(error, { tags: { route: 'activity-log/login' }, extra: { context: "[Login Track] Query error" } } as any)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'activity-log/login' }, extra: { context: "[Login Track] Error" } } as any)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const GET = withQuerySchema(
  'activity-log/login',
  GetQuerySchema,
  getHandler as unknown as (request: Request) => Promise<Response>
)
