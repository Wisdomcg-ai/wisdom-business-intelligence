import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import { withSchema, withQuerySchema } from '@/lib/api/with-schema'

// POST body: audit-log entry. business_id/table_name/record_id/action required; rest optional metadata.
const PostBodySchema = z
  .object({
    business_id: z.string(),
    table_name: z.string(),
    record_id: z.string(),
    action: z.string(),
    field_name: z.string().nullish(),
    old_value: z.unknown().optional(),
    new_value: z.unknown().optional(),
    changes: z.unknown().optional(),
    description: z.string().nullish(),
    page_path: z.string().nullish(),
  })
  .passthrough()

// GET searchParams: business_id required; filters + pagination optional (all string-typed query).
const GetQuerySchema = z
  .object({
    business_id: z.string().optional(),
    table_name: z.string().optional(),
    user_id: z.string().optional(),
    limit: z.string().optional(),
    offset: z.string().optional(),
  })
  .passthrough()

async function postHandler(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      business_id,
      table_name,
      record_id,
      action,
      field_name,
      old_value,
      new_value,
      changes,
      description,
      page_path
    } = body

    // Validate required fields
    if (!business_id || !table_name || !record_id || !action) {
      return NextResponse.json(
        { error: 'Missing required fields: business_id, table_name, record_id, action' },
        { status: 400 }
      )
    }

    // Get user profile for name/email
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .single()

    const userName = profile?.full_name || user.email?.split('@')[0] || 'Unknown User'
    const userEmail = profile?.email || user.email || ''

    // Get user agent from request headers
    const userAgent = request.headers.get('user-agent') || null

    // Insert audit log entry
    const { data, error } = await supabase.from('audit_log').insert({
      business_id,
      user_id: user.id,
      user_name: userName,
      user_email: userEmail,
      table_name,
      record_id,
      action,
      field_name: field_name || null,
      old_value: old_value ? JSON.stringify(old_value) : null,
      new_value: new_value ? JSON.stringify(new_value) : null,
      changes: changes ? JSON.stringify(changes) : null,
      description: description || null,
      page_path: page_path || null,
      user_agent: userAgent
    }).select()

    if (error) {
      Sentry.captureException(error, { tags: { route: 'activity-log' }, extra: { context: "[Activity Log] Insert error" } } as any)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'activity-log' }, extra: { context: "[Activity Log] Error" } } as any)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withSchema(
  'activity-log',
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
    const tableName = searchParams.get('table_name')
    const userId = searchParams.get('user_id')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const offset = parseInt(searchParams.get('offset') || '0')

    if (!businessId) {
      return NextResponse.json(
        { error: 'business_id is required' },
        { status: 400 }
      )
    }

    let query = supabase
      .from('audit_log')
      .select('*', { count: 'exact' })
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })

    if (tableName) {
      query = query.eq('table_name', tableName)
    }

    if (userId) {
      query = query.eq('user_id', userId)
    }

    query = query.range(offset, offset + limit - 1)

    const { data, count, error } = await query

    if (error) {
      Sentry.captureException(error, { tags: { route: 'activity-log' }, extra: { context: "[Activity Log] Query error" } } as any)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      data,
      count,
      hasMore: count ? offset + limit < count : false
    })
  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'activity-log' }, extra: { context: "[Activity Log] Error" } } as any)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const GET = withQuerySchema(
  'activity-log',
  GetQuerySchema,
  getHandler as unknown as (request: Request) => Promise<Response>
)
