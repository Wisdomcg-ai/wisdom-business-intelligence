import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import { withSchema, withQuerySchema } from '@/lib/api/with-schema'

export const dynamic = 'force-dynamic'

// GET searchParams: { business_id?, limit? } (string-typed query).
const GetQuerySchema = z
  .object({
    business_id: z.string().optional(),
    limit: z.string().optional(),
  })
  .passthrough()

// POST body: { business_id, message } — create a chat message.
const PostBodySchema = z
  .object({
    business_id: z.string(),
    message: z.string(),
  })
  .passthrough()

async function getHandler(request: Request) {
  const supabase = await createRouteHandlerClient()
  const { searchParams } = new URL(request.url)
  const businessId = searchParams.get('business_id')
  const requestedLimit = parseInt(searchParams.get('limit') || '50')
  const limit = Math.min(Math.max(1, requestedLimit), 200) // Cap between 1-200

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
      .maybeSingle()

    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }
    if (business.assigned_coach_id !== user.id && business.owner_id !== user.id) {
      // Super-admin bypass: super_admin users aren't coaches or owners but
      // need read/write access to every business (support, ops, audits).
      // auth_is_super_admin() is SECURITY DEFINER so the auth-bound client
      // can call it; returns false for anyone without the row.
      const { data: isSuper } = await supabase.rpc('auth_is_super_admin')
      if (!isSuper) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    }

    // Get messages
    const { data: messages, error: messagesError } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (messagesError) {
      Sentry.captureException(messagesError, { tags: { route: 'chat/messages' }, extra: { context: "Error loading messages" } } as any)
      return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 })
    }

    // Reverse to show oldest first
    const sortedMessages = messages?.reverse() || []

    return NextResponse.json({
      success: true,
      messages: sortedMessages
    })

  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'chat/messages' }, extra: { context: "Get messages API error" } } as any)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}

export const GET = withQuerySchema('chat/messages', GetQuerySchema, getHandler)

async function postHandler(request: Request) {
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
      .maybeSingle()

    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }
    if (business.assigned_coach_id !== user.id && business.owner_id !== user.id) {
      // Super-admin bypass: super_admin users aren't coaches or owners but
      // need read/write access to every business (support, ops, audits).
      // auth_is_super_admin() is SECURITY DEFINER so the auth-bound client
      // can call it; returns false for anyone without the row.
      const { data: isSuper } = await supabase.rpc('auth_is_super_admin')
      if (!isSuper) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
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
      Sentry.captureException(messageError, { tags: { route: 'chat/messages' }, extra: { context: "Error creating message" } } as any)
      return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: chatMessage
    })

  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'chat/messages' }, extra: { context: "Send message API error" } } as any)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}

export const POST = withSchema('chat/messages', PostBodySchema, postHandler)
