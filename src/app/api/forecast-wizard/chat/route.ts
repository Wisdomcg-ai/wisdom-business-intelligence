import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { checkRateLimit, createRateLimitKey, RATE_LIMIT_CONFIGS } from '@/lib/utils/rate-limiter';
import {
  sanitizeAIInput,
  sanitizeConversationHistory,
  detectPromptInjection,
  logSuspiciousInput,
  AI_INPUT_LIMITS
} from '@/lib/utils/ai-sanitizer';
import { getCFOResponse, getStepGreeting, CFOAgentRequest } from '@/lib/services/cfo-agent';
import { WizardStep, CFOMessage, WizardContext } from '@/app/finances/forecast/types';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    // Verify user is authenticated
    const supabase = await createRouteHandlerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Rate limiting
    const rateLimitKey = createRateLimitKey('/api/forecast-wizard/chat', user.id);
    const rateLimit = checkRateLimit(rateLimitKey, RATE_LIMIT_CONFIGS.ai);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded. Please wait before sending more messages.',
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

    const {
      message,
      step,
      context,
      conversationHistory,
      session_id
    } = await request.json();

    // Validate required fields
    if (!step || !context) {
      return NextResponse.json(
        { error: 'step and context are required' },
        { status: 400 }
      );
    }

    // If no message, return the step greeting
    if (!message) {
      const greeting = getStepGreeting(step as WizardStep, context);
      return NextResponse.json({
        response: greeting,
        suggestions: getSuggestionsForStep(step, context)
      });
    }

    // Sanitize user input
    const sanitizedMessage = sanitizeAIInput(message, AI_INPUT_LIMITS.userMessage);

    // Check for prompt injection (log but don't block)
    const injectionCheck = detectPromptInjection(message);
    if (injectionCheck.isSuspicious) {
      logSuspiciousInput('/api/forecast-wizard/chat', user.id, message, injectionCheck.pattern || 'unknown');
    }

    // Sanitize conversation history
    const sanitizedHistory = sanitizeConversationHistory(conversationHistory || []);

    // Build CFO Agent request
    const cfoRequest: CFOAgentRequest = {
      step: step as WizardStep,
      message: sanitizedMessage,
      context: context as WizardContext,
      conversationHistory: sanitizedHistory as CFOMessage[]
    };

    // Get CFO response
    const cfoResponse = await getCFOResponse(cfoRequest);

    // Log AI interaction for analytics
    if (session_id) {
      await logAIInteraction(supabase, {
        session_id,
        user_id: user.id,
        business_id: context.business_id,
        step,
        user_message: sanitizedMessage,
        ai_response: cfoResponse.message,
        suggestions: cfoResponse.suggestions,
        warnings: cfoResponse.warnings,
        data_extracted: cfoResponse.dataExtracted
      });
    }

    return NextResponse.json({
      response: {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: cfoResponse.message,
        timestamp: new Date().toISOString(),
        step
      },
      suggestions: cfoResponse.suggestions,
      warnings: cfoResponse.warnings,
      dataExtracted: cfoResponse.dataExtracted,
      stepComplete: cfoResponse.stepComplete
    });

  } catch (error) {
    console.error('[Forecast Wizard Chat] Error:', error);
    return NextResponse.json(
      { error: 'Failed to process your message. Please try again.' },
      { status: 500 }
    );
  }
}

// Helper to get step-specific quick suggestions
function getSuggestionsForStep(step: string, context: WizardContext): string[] {
  switch (step) {
    case 'setup':
      return [
        'Forecast 1 year (monthly detail)',
        'Forecast 2 years',
        'Forecast 3 years'
      ];
    case 'team':
      if (context.current_team?.length) {
        return [
          'Review current team',
          'Add a planned hire',
          'Classify team members'
        ];
      }
      return [
        'Add team members manually',
        'Skip team for now'
      ];
    case 'costs':
      if (context.xero_connected && context.historical_pl?.has_xero_data) {
        return [
          'Use prior year as baseline',
          'Apply 5% increase to all',
          'Adjust specific categories',
          'Start fresh'
        ];
      }
      return [
        'Add operating costs',
        'Review by category'
      ];
    case 'investments':
      if (context.strategic_initiatives?.length) {
        return [
          'Go through each initiative',
          'Only specific initiatives need investment',
          'No investments needed'
        ];
      }
      return [
        'Add an investment',
        'No investments planned'
      ];
    case 'projections':
      return [
        'Conservative (10% growth)',
        'Moderate (20% growth)',
        'Aggressive (30%+ growth)'
      ];
    case 'review':
      return [
        'Finalize forecast',
        'Go back to edit',
        'Flag for coach review'
      ];
    default:
      return [];
  }
}

// Log AI interaction for analytics
async function logAIInteraction(supabase: any, data: {
  session_id: string;
  user_id: string;
  business_id: string;
  step: string;
  user_message: string;
  ai_response: string;
  suggestions?: string[];
  warnings?: string[];
  data_extracted?: any;
}) {
  try {
    await supabase.from('ai_interactions').insert({
      session_id: data.session_id,
      user_id: data.user_id,
      business_id: data.business_id,
      step_context: data.step,
      prompt: data.user_message,
      response: data.ai_response,
      context_type: 'forecast_wizard',
      conversation_context: {
        suggestions: data.suggestions,
        warnings: data.warnings,
        data_extracted: data.data_extracted
      },
      created_at: new Date().toISOString()
    });
  } catch (error) {
    // Don't fail the request if logging fails
    console.error('[AI Interaction Log] Failed to log:', error);
  }
}
