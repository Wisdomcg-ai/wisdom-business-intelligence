import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
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
      console.error('[Activity Log] Insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('[Activity Log] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
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
    const limit = parseInt(searchParams.get('limit') || '50')
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
      console.error('[Activity Log] Query error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      data,
      count,
      hasMore: count ? offset + limit < count : false
    })
  } catch (error) {
    console.error('[Activity Log] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
