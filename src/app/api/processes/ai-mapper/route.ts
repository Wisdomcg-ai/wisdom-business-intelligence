import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { checkRateLimit, createRateLimitKey, RATE_LIMIT_CONFIGS } from '@/lib/utils/rate-limiter'
import {
  sanitizeAIInput,
  sanitizeConversationHistory,
  detectPromptInjection,
  logSuspiciousInput,
  AI_INPUT_LIMITS,
} from '@/lib/utils/ai-sanitizer'

const SYSTEM_PROMPT = `You are a business process mapping specialist. Your job is to help the user document their business process step by step, exactly like a coach would using sticky notes on a whiteboard.

CONVERSATION APPROACH:
1. Ask structured questions one at a time
2. "What triggers this process? What happens first?"
3. "Who is responsible for that step?"
4. "What happens next? Does it stay with [person] or hand off to someone else?"
5. "Is there a decision point here? What happens if [condition]?"
6. "What systems or documents are used at this step?"
7. "What could go wrong? Is there a quality check?"

When the user describes a step, respond with:
1. Acknowledgment of what they said
2. One or more tool calls to build the diagram
3. A clear follow-up question to keep the process moving forward

Always reference earlier steps and lanes by name. Keep responses concise (under 200 words).

CURRENT PROCESS STATE is provided in each message so you know what already exists.

CRITICAL: When the user describes people/teams first, create lanes for them BEFORE adding steps.
When they describe what happens, create steps in the correct lane.
When the flow moves between people, create cross-lane flows.
For decision points, use addDecision and create flows for both yes/no paths.

Your response MUST be valid JSON with this structure:
{
  "message": "Your conversational response to the user",
  "toolCalls": [
    { "name": "addLane", "args": { "name": "Lane Name" } },
    { "name": "addStep", "args": { "name": "Step Name", "laneName": "Lane Name", "description": "...", "duration": "...", "systems": ["..."], "documents": ["..."] } },
    { "name": "addDecision", "args": { "name": "Decision Name", "laneName": "Lane Name", "yesLabel": "Yes", "noLabel": "No" } },
    { "name": "addFlow", "args": { "fromStep": "Step Name", "toStep": "Step Name", "label": "...", "color": "green|red" } }
  ]
}

toolCalls is optional — omit it or use an empty array if no diagram changes are needed (e.g. when asking clarifying questions).`

export async function POST(request: Request) {
  try {
    const supabase = await createRouteHandlerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const rateLimitKey = createRateLimitKey('/api/processes/ai-mapper', user.id)
    const rateLimit = checkRateLimit(rateLimitKey, RATE_LIMIT_CONFIGS.ai)

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before making more AI requests.', retryAfter: Math.ceil(rateLimit.resetIn / 1000) },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rateLimit.resetIn / 1000)) } }
      )
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    const { messages: rawMessages, currentProcess } = await request.json()

    if (!rawMessages || !Array.isArray(rawMessages) || rawMessages.length === 0) {
      return NextResponse.json({ error: 'Messages are required' }, { status: 400 })
    }

    // Sanitize the latest user message
    const lastMsg = rawMessages[rawMessages.length - 1]
    if (lastMsg?.role === 'user') {
      lastMsg.content = sanitizeAIInput(lastMsg.content, AI_INPUT_LIMITS.userMessage)
      const injectionCheck = detectPromptInjection(lastMsg.content)
      if (injectionCheck.isSuspicious) {
        logSuspiciousInput('/api/processes/ai-mapper', user.id, lastMsg.content, injectionCheck.pattern || 'unknown')
      }
    }

    const sanitizedHistory = sanitizeConversationHistory(rawMessages)

    // Build the process context string
    const processContext = currentProcess
      ? `\n\nCURRENT PROCESS STATE:\nLanes: ${currentProcess.swimlanes?.map((l: { name: string }) => l.name).join(', ') || 'None'}\nSteps: ${currentProcess.steps?.map((s: { name: string; laneName?: string }) => `${s.name} (${s.laneName || 'unknown'})`).join(', ') || 'None'}\nFlows: ${currentProcess.flows || 0} connections`
      : ''

    const chatMessages = [
      { role: 'system' as const, content: SYSTEM_PROMPT + processContext },
      ...sanitizedHistory.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ]

    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: chatMessages,
      temperature: 0.7,
      max_tokens: 800,
      response_format: { type: 'json_object' },
    })

    const content = completion.choices[0]?.message?.content || ''

    if (!content) {
      throw new Error('No response from OpenAI')
    }

    // Parse JSON response
    let parsed: { message: string; toolCalls?: Array<{ name: string; args: Record<string, unknown> }> }
    try {
      parsed = JSON.parse(content)
    } catch {
      // Fallback: treat entire response as message text
      parsed = { message: content }
    }

    return NextResponse.json({
      message: parsed.message || 'I had trouble understanding that. Could you rephrase?',
      toolCalls: parsed.toolCalls || [],
    })
  } catch (error) {
    console.error('[AI Mapper API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to process your message. Please try again.' },
      { status: 500 }
    )
  }
}
