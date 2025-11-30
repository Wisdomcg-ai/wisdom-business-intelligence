import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const supabase = await createRouteHandlerClient()

  try {
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const { question, priority, businessId } = await request.json()

    if (!question || !priority) {
      return NextResponse.json(
        { error: 'Question and priority are required' },
        { status: 400 }
      )
    }

    if (!businessId) {
      return NextResponse.json(
        { error: 'Business ID is required' },
        { status: 400 }
      )
    }

    // Validate priority
    if (priority !== 'normal' && priority !== 'urgent') {
      return NextResponse.json(
        { error: 'Priority must be normal or urgent' },
        { status: 400 }
      )
    }

    // Insert question
    const { data, error } = await supabase
      .from('coach_questions')
      .insert({
        business_id: businessId,
        user_id: user.id,
        question,
        priority,
        status: 'pending'
      })
      .select()
      .single()

    if (error) {
      console.error('[Coach Questions API] Error inserting question:', error)
      return NextResponse.json(
        { error: 'Failed to submit question', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('[Coach Questions API] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
  const supabase = await createRouteHandlerClient()

  try {
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('businessId')
    const status = searchParams.get('status')

    if (!businessId) {
      return NextResponse.json(
        { error: 'Business ID is required' },
        { status: 400 }
      )
    }

    // Build query
    let query = supabase
      .from('coach_questions')
      .select('*')
      .eq('business_id', businessId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    // Filter by status if provided
    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) {
      console.error('[Coach Questions API] Error fetching questions:', error)
      return NextResponse.json(
        { error: 'Failed to fetch questions', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ questions: data || [] })
  } catch (error) {
    console.error('[Coach Questions API] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
