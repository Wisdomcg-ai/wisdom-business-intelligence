import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createRouteHandlerClient()
  const { searchParams } = new URL(request.url)
  const businessId = searchParams.get('business_id')
  const limit = parseInt(searchParams.get('limit') || '50')

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!businessId) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 })
    }

    // Verify user has access to this business
    const { data: business } = await supabase
      .from('businesses')
      .select('assigned_coach_id, owner_id')
      .eq('id', businessId)
      .single()

    if (!business || (business.assigned_coach_id !== user.id && business.owner_id !== user.id)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Get messages
    const { data: messages, error: messagesError } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (messagesError) {
      console.error('Error loading messages:', messagesError)
      return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 })
    }

    // Reverse to show oldest first
    const sortedMessages = messages?.reverse() || []

    return NextResponse.json({
      success: true,
      messages: sortedMessages
    })

  } catch (error) {
    console.error('Get messages API error:', error)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const supabase = await createRouteHandlerClient()

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { business_id, message } = body

    if (!business_id || !message) {
      return NextResponse.json(
        { error: 'business_id and message are required' },
        { status: 400 }
      )
    }

    // Verify user has access to this business
    const { data: business } = await supabase
      .from('businesses')
      .select('assigned_coach_id, owner_id')
      .eq('id', business_id)
      .single()

    if (!business || (business.assigned_coach_id !== user.id && business.owner_id !== user.id)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Create message
    const { data: chatMessage, error: messageError } = await supabase
      .from('chat_messages')
      .insert({
        business_id,
        sender_id: user.id,
        message
      })
      .select()
      .single()

    if (messageError) {
      console.error('Error creating message:', messageError)
      return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: chatMessage
    })

  } catch (error) {
    console.error('Send message API error:', error)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
