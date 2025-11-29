import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createRouteHandlerClient()

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sessionId = params.id

    // Verify user has access to this session
    const { data: session, error: sessionError } = await supabase
      .from('coaching_sessions')
      .select('*, businesses!inner(assigned_coach_id, owner_id)')
      .eq('id', sessionId)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const business = (session as any).businesses
    const isCoach = business.assigned_coach_id === user.id
    const isClient = business.owner_id === user.id

    if (!isCoach && !isClient) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Only coaches can analyze transcripts
    if (!isCoach) {
      return NextResponse.json({ error: 'Only coaches can analyze transcripts' }, { status: 403 })
    }

    const body = await request.json()
    const { transcript_text } = body

    if (!transcript_text || transcript_text.trim().length < 50) {
      return NextResponse.json(
        { error: 'Transcript text is required (minimum 50 characters)' },
        { status: 400 }
      )
    }

    // Use OpenAI to analyze the transcript
    const prompt = `You are an expert business coach assistant. Analyze this coaching session transcript and extract the following information in JSON format:

1. A concise summary (3-5 sentences) of the key discussion points
2. A list of action items mentioned (each with: action text, priority (high/medium/low), suggested due date in days from now)
3. Key topics discussed (array of strings)
4. Overall sentiment/tone (positive/neutral/concerned/urgent)
5. Any goals or metrics mentioned

Transcript:
${transcript_text}

Return ONLY valid JSON in this exact format:
{
  "summary": "Brief summary here...",
  "action_items": [
    {
      "action_text": "Action description",
      "priority": "high|medium|low",
      "due_in_days": 7
    }
  ],
  "topics": ["Topic 1", "Topic 2"],
  "sentiment": "positive|neutral|concerned|urgent",
  "goals": ["Goal 1", "Goal 2"]
}`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a business coaching assistant that analyzes session transcripts. Always return valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    })

    const responseText = completion.choices[0].message.content
    if (!responseText) {
      return NextResponse.json({ error: 'No response from AI' }, { status: 500 })
    }

    // Parse the AI response
    let analysis
    try {
      analysis = JSON.parse(responseText)
    } catch (parseError) {
      console.error('Failed to parse AI response:', responseText)
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 })
    }

    // Update the session with the analysis
    const { error: updateError } = await supabase
      .from('coaching_sessions')
      .update({
        notes: analysis.summary,
        session_metadata: {
          ...(session.session_metadata || {}),
          ai_analysis: {
            topics: analysis.topics,
            sentiment: analysis.sentiment,
            goals: analysis.goals,
            analyzed_at: new Date().toISOString()
          }
        }
      })
      .eq('id', sessionId)

    if (updateError) {
      console.error('Error updating session:', updateError)
      return NextResponse.json({ error: 'Failed to save analysis' }, { status: 500 })
    }

    // Create action items if any were extracted
    const createdActions = []
    if (analysis.action_items && analysis.action_items.length > 0) {
      for (const item of analysis.action_items) {
        const dueDate = new Date()
        dueDate.setDate(dueDate.getDate() + (item.due_in_days || 7))

        const { data: action, error: actionError } = await supabase
          .from('session_actions')
          .insert({
            coaching_session_id: sessionId,
            business_id: session.business_id,
            action_text: item.action_text,
            status: 'open',
            priority: item.priority || 'medium',
            due_date: dueDate.toISOString()
          })
          .select()
          .single()

        if (!actionError && action) {
          createdActions.push(action)
        }
      }
    }

    return NextResponse.json({
      success: true,
      analysis: {
        summary: analysis.summary,
        topics: analysis.topics,
        sentiment: analysis.sentiment,
        goals: analysis.goals,
        action_items_created: createdActions.length
      },
      actions: createdActions
    })

  } catch (error: any) {
    console.error('Analyze transcript API error:', error)

    // Handle OpenAI-specific errors
    if (error.message?.includes('API key')) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
