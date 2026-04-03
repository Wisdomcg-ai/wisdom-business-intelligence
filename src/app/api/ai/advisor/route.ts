import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { checkRateLimit, createRateLimitKey, RATE_LIMIT_CONFIGS } from '@/lib/utils/rate-limiter'

export const dynamic = 'force-dynamic'

/**
 * AI Advisor — provides salary estimates and role-specific advice
 * for the Team Planning step (Step4Team) of the V4 forecast wizard.
 *
 * POST: Get a salary suggestion for a given role
 * PATCH: Record whether the user used/adjusted/ignored the suggestion (analytics)
 */
export async function POST(request: Request) {
  const supabase = await createRouteHandlerClient()

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimitKey = createRateLimitKey('/api/ai/advisor', user.id)
    const rateLimit = checkRateLimit(rateLimitKey, RATE_LIMIT_CONFIGS.ai)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded.', retryAfter: Math.ceil(rateLimit.resetIn / 1000) },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rateLimit.resetIn / 1000)) } }
      )
    }

    const body = await request.json()
    const { type } = body

    let prompt: string

    if (type === 'salary_estimate') {
      const { position, employmentType } = body
      if (!position) {
        return NextResponse.json({ error: 'position is required' }, { status: 400 })
      }

      const employmentLabel = employmentType === 'contractor'
        ? 'contractor/freelancer'
        : employmentType === 'casual'
          ? 'casual employee'
          : employmentType === 'part_time'
            ? 'part-time employee'
            : 'full-time employee'

      prompt = `You are a compensation advisor for Australian small businesses.

Given the role "${position}" (${employmentLabel}), provide a salary estimate in AUD.

Return ONLY valid JSON in this exact format (no markdown, no code fences):
{
  "suggestion": "Brief one-sentence summary of the estimate",
  "reasoning": "2-3 sentences explaining the range and what factors affect it",
  "confidence": "medium",
  "source": "ai_estimate",
  "minValue": <number - bottom of realistic range>,
  "maxValue": <number - top of realistic range>,
  "typicalValue": <number - most common salary for this role>,
  "caveats": ["caveat 1", "caveat 2"]
}

For contractors, give annual equivalent values (daily rate × 220 working days).
Use current Australian market rates. Include super in employee figures only if the role is an employee.`

    } else if (type === 'project_cost') {
      const { projectType, scope, complexity } = body

      if (!projectType) {
        return NextResponse.json({ error: 'projectType is required' }, { status: 400 })
      }

      prompt = `You are a business investment advisor for Australian small businesses.

Estimate the cost for a "${projectType}" project (category: ${scope || 'general'}, complexity: ${complexity || 'medium'}) in AUD.

Return ONLY valid JSON in this exact format (no markdown, no code fences):
{
  "suggestion": "Brief one-sentence summary of the estimate",
  "reasoning": "2-3 sentences explaining the range and what factors affect it",
  "confidence": "medium",
  "source": "ai_estimate",
  "minValue": <number - bottom of realistic range>,
  "maxValue": <number - top of realistic range>,
  "typicalValue": <number - most common cost for this type of project>,
  "caveats": ["caveat 1", "caveat 2"]
}

Use current Australian market rates for small businesses.`

    } else {
      return NextResponse.json({ error: 'Invalid request type' }, { status: 400 })
    }

    let responseText: string | null = null

    // Try Anthropic
    try {
      const Anthropic = require('@anthropic-ai/sdk').default
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

      const result = await anthropic.messages.create({
        model: 'claude-haiku-3-5-20241022',
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      })

      const textBlock = result.content.find((b: { type: string }) => b.type === 'text')
      responseText = textBlock?.text || null
    } catch {
      // Fall back to OpenAI
    }

    if (!responseText) {
      try {
        const OpenAI = require('openai').default
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

        const completion = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          response_format: { type: 'json_object' },
        })

        responseText = completion.choices[0]?.message?.content || null
      } catch (err) {
        console.error('[ai/advisor] OpenAI failed:', err)
      }
    }

    if (!responseText) {
      return NextResponse.json({ error: 'AI service unavailable' }, { status: 503 })
    }

    // Parse JSON response
    try {
      // Strip markdown code fences if present
      const cleaned = responseText.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim()
      const suggestion = JSON.parse(cleaned)
      suggestion.interactionId = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      return NextResponse.json(suggestion)
    } catch {
      console.error('[ai/advisor] Failed to parse AI response:', responseText)
      return NextResponse.json({
        suggestion: 'Estimate unavailable — please try again',
        reasoning: 'Unable to parse detailed estimate. Please check market rates manually.',
        confidence: 'low' as const,
        source: 'ai_estimate' as const,
        interactionId: `ai-${Date.now()}`,
      })
    }
  } catch (error) {
    console.error('[ai/advisor] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH: Record user action on a suggestion (for analytics/feedback loop)
 */
export async function PATCH(request: Request) {
  const supabase = await createRouteHandlerClient()

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { interactionId, action, userValue } = await request.json()

    // Log for analytics (could be stored in a table later)
    console.log('[ai/advisor] Feedback:', { interactionId, action, userValue, userId: user.id })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[ai/advisor] PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
