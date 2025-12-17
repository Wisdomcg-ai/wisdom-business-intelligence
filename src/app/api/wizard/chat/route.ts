import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { checkRateLimit, createRateLimitKey, RATE_LIMIT_CONFIGS } from '@/lib/utils/rate-limiter';
import {
  sanitizeAIInput,
  sanitizeConversationHistory,
  detectPromptInjection,
  logSuspiciousInput,
  AI_INPUT_LIMITS
} from '@/lib/utils/ai-sanitizer';

export async function POST(request: Request) {
  try {
    // Verify user is authenticated before processing AI request
    const supabase = await createRouteHandlerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Rate limiting - prevent AI cost abuse (30 requests per hour per user)
    const rateLimitKey = createRateLimitKey('/api/wizard/chat', user.id);
    const rateLimit = checkRateLimit(rateLimitKey, RATE_LIMIT_CONFIGS.ai);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded. Please wait before making more AI requests.',
          retryAfter: Math.ceil(rateLimit.resetIn / 1000)
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil(rateLimit.resetIn / 1000))
          }
        }
      );
    }

    // Initialize OpenAI inside the handler (lazy load)
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const { userMessage, processData, conversationHistory, stage } = await request.json();

    if (!userMessage) {
      return NextResponse.json(
        { error: 'User message is required' },
        { status: 400 }
      );
    }

    // Sanitize user input to prevent prompt injection
    const sanitizedMessage = sanitizeAIInput(userMessage, AI_INPUT_LIMITS.userMessage);

    // Check for suspicious patterns (log but don't block - could be false positive)
    const injectionCheck = detectPromptInjection(userMessage);
    if (injectionCheck.isSuspicious) {
      logSuspiciousInput('/api/wizard/chat', user.id, userMessage, injectionCheck.pattern || 'unknown');
    }

    // Sanitize conversation history
    const sanitizedHistory = sanitizeConversationHistory(conversationHistory || []);

    // Build conversation history for context
    const messages = sanitizedHistory.map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));

    // Add the new user message
    messages.push({
      role: 'user',
      content: sanitizedMessage,
    });

    // Create system prompt based on current stage
    const systemPrompt = getSystemPrompt(stage, processData);

    // Call OpenAI - using gpt-4-turbo
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        ...messages,
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const aiResponse = completion.choices[0]?.message?.content || '';

    if (!aiResponse) {
      throw new Error('No response content from OpenAI');
    }

    // Extract process data from AI response if applicable
    let updatedProcessData = processData;

    if (stage === 'welcome' && processData.name === '') {
      // Extract process name (use sanitized message)
      updatedProcessData = {
        ...processData,
        name: extractProcessName(sanitizedMessage),
        stage: 'overview',
      };
    } else if (stage === 'overview') {
      // Extract trigger and outcome (use sanitized message)
      updatedProcessData = {
        ...processData,
        trigger: sanitizedMessage.slice(0, 100),
        stage: 'swimlanes',
      };
    }

    return NextResponse.json({
      response: aiResponse,
      updatedProcessData,
    });
  } catch (error) {
    console.error('[Wizard Chat API] Error:', error);
    // Return generic error message to avoid exposing internal details
    return NextResponse.json(
      { error: 'Failed to process your message. Please try again.' },
      { status: 500 }
    );
  }
}

// Helper function: Get system prompt based on stage
function getSystemPrompt(stage: string, processData: any): string {
  const basePrompt = `You are a Business Process Mapping Expert helping coaches guide their clients through process discovery and documentation.

Your job is to:
1. Ask ONE clear, focused question at a time
2. Listen carefully and extract structured process information
3. Be conversational and natural, never robotic
4. Confirm understanding before moving forward
5. Build a complete, accurate process map through conversation

Keep responses concise (under 150 words) to maintain conversation flow.`;

  const stagePrompts: Record<string, string> = {
    welcome: `${basePrompt}

CURRENT STAGE: Process Name Collection
The user told you the process name is: "${processData.name || 'unknown'}"
Next, ask them: "What triggers this process? (What event starts it?)"`,

    overview: `${basePrompt}

CURRENT STAGE: Process Overview
Ask the user: "Who are the key people/roles involved in this process?"`,

    swimlanes: `${basePrompt}

CURRENT STAGE: Swimlane Discovery
Now ask: "Let's walk through the steps. What's the first activity that happens?"`,

    activities: `${basePrompt}

CURRENT STAGE: Activity Walkthrough
Keep asking: "What happens next?" until they say done.`,

    connections: `${basePrompt}

CURRENT STAGE: Branching & Connections
Ask about decision points and alternative paths.`,

    review: `${basePrompt}

CURRENT STAGE: Review & Refinement
Review what we've discovered and ask if they want to add anything.`,
  };

  return stagePrompts[stage] || basePrompt;
}

// Helper function: Extract process name from user input
function extractProcessName(input: string): string {
  const firstSentence = input.split(/[.!?]/)[0];
  return firstSentence.slice(0, 50).trim();
}