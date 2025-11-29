import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// POST /api/notifications/create - Create a notification (internal use)
export async function POST(request: Request) {
  const supabase = await createRouteHandlerClient()

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      target_user_id,
      business_id,
      type,
      title,
      message,
      link,
      metadata
    } = body

    // Validate required fields
    if (!target_user_id || !type || !title || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Insert notification
    const { data: notification, error } = await supabase
      .from('notifications')
      .insert({
        user_id: target_user_id,
        business_id,
        type,
        title,
        message,
        link,
        metadata
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating notification:', error)
      return NextResponse.json({ error: 'Failed to create notification' }, { status: 500 })
    }

    return NextResponse.json({ success: true, notification })

  } catch (error) {
    console.error('Create notification API error:', error)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
