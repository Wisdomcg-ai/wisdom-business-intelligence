import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { checkRateLimit, createRateLimitKey, RATE_LIMIT_CONFIGS } from '@/lib/utils/rate-limiter'
import {
  sanitizeAIInput,
  sanitizeConversationHistory,
  detectPromptInjection,
  logSuspiciousInput,
  AI_INPUT_LIMITS,
} from '@/lib/utils/ai-sanitizer'

export const dynamic = 'force-dynamic'

/**
 * AI Forecast Assistant — powers the AI CFO chat panel in the V4 forecast wizard.
 *
 * Accepts a user message, optional system prompt (from the client-side context
 * builder), and conversation history, then returns an AI response via Anthropic
 * Claude (preferred) or falls back to OpenAI.
 */
export async function POST(request: Request) {
  const supabase = await createRouteHandlerClient()

  try {
    // Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limit
    const rateLimitKey = createRateLimitKey('/api/ai/forecast-assistant', user.id)
    const rateLimit = checkRateLimit(rateLimitKey, RATE_LIMIT_CONFIGS.ai)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before making more AI requests.', retryAfter: Math.ceil(rateLimit.resetIn / 1000) },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rateLimit.resetIn / 1000)) } }
      )
    }

    const body = await request.json()
    const { message, systemPrompt, context, history } = body

    if (!message) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 })
    }

    // Sanitize
    const sanitizedMessage = sanitizeAIInput(message, AI_INPUT_LIMITS.userMessage)
    const sanitizedHistory = sanitizeConversationHistory(history || [])

    // Prompt injection check (log only)
    const injectionCheck = detectPromptInjection(message)
    if (injectionCheck.isSuspicious) {
      logSuspiciousInput('/api/ai/forecast-assistant', user.id, message, injectionCheck.pattern || 'unknown')
    }

    // Build messages array
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = sanitizedHistory.map(
      (msg: { role: string; content: string }) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })
    )
    messages.push({ role: 'user', content: sanitizedMessage })

    // Default system prompt if the client didn't provide one
    const system = systemPrompt || `You are AI CFO, an expert financial advisor helping a small business owner build their financial forecast. You follow the Profit First methodology - focusing on observations and thought-provoking questions rather than direct advice.

IMPORTANT GUIDELINES:
1. Be concise and practical - these are busy business owners
2. Focus on observations and raise questions, don't give direct financial advice
3. Use Australian business context (12% superannuation, AUD currency, July-June financial year)
4. When discussing costs, think about what's reasonable for a small business
5. Reference specific numbers from their data when relevant
6. Ask clarifying questions if you need more information

Remember: Help them think through decisions, don't make decisions for them.`

    // Try Anthropic first, fall back to OpenAI
    let responseText: string | null = null

    try {
      const Anthropic = require('@anthropic-ai/sdk').default
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

      const result = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system,
        messages,
      })

      const textBlock = result.content.find((b: { type: string }) => b.type === 'text')
      responseText = textBlock?.text || null
    } catch (anthropicError) {
      console.warn('[forecast-assistant] Anthropic failed, trying OpenAI:', anthropicError)
    }

    if (!responseText) {
      try {
        const OpenAI = require('openai').default
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

        const completion = await openai.chat.completions.create({
          model: 'gpt-4',
          messages: [{ role: 'system', content: system }, ...messages],
          temperature: 0.7,
          max_tokens: 1024,
        })

        responseText = completion.choices[0]?.message?.content || null
      } catch (openaiError) {
        console.error('[forecast-assistant] OpenAI also failed:', openaiError)
      }
    }

    if (!responseText) {
      return NextResponse.json(
        { error: 'AI service unavailable. Please check your API keys.' },
        { status: 503 }
      )
    }

    return NextResponse.json({ message: responseText })
  } catch (error) {
    console.error('[forecast-assistant] Error:', error)
    return NextResponse.json(
      { error: 'Failed to process your message. Please try again.' },
      { status: 500 }
    )
  }
}
