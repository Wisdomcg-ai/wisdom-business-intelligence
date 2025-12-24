/**
 * Claude CFO API Route
 * Handles AI-powered forecast wizard conversations
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import {
  getClaudeCFOResponse,
  type ClaudeCFORequest,
} from '@/lib/services/claude-cfo-agent';
import type { WizardStep, WizardContext, CFOMessage } from '@/app/finances/forecast/types';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const {
      action,
      step,
      message,
      context,
      conversationHistory,
    } = body as {
      action: 'message' | 'validate' | 'review';
      step: WizardStep;
      message: string;
      context: WizardContext;
      conversationHistory: CFOMessage[];
    };

    if (!action) {
      return NextResponse.json({ error: 'action is required' }, { status: 400 });
    }

    if (!step) {
      return NextResponse.json({ error: 'step is required' }, { status: 400 });
    }

    if (!message && action === 'message') {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    if (!context) {
      return NextResponse.json({ error: 'context is required' }, { status: 400 });
    }

    // Handle different actions
    switch (action) {
      case 'message': {
        // Build the request for Claude CFO
        const cfoRequest: ClaudeCFORequest = {
          step,
          message,
          context,
          conversationHistory: conversationHistory || [],
          useOpus: step === 'review', // Use Opus for review step
        };

        // Get AI response
        const response = await getClaudeCFOResponse(cfoRequest);

        // Build the CFO message object
        const cfoMessage: CFOMessage = {
          id: 'cfo-' + Date.now(),
          role: 'cfo',
          content: response.message,
          timestamp: new Date().toISOString(),
          step,
        };

        // Log the interaction for analytics (optional, if ai_interactions table exists)
        try {
          await supabase.from('ai_interactions').insert({
            user_id: user.id,
            business_id: context.business_id,
            interaction_type: 'forecast_wizard',
            input_text: message,
            output_text: response.message,
            step_context: step,
            conversation_context: {
              step,
              stepComplete: response.stepComplete,
              messageCount: (conversationHistory?.length || 0) + 1,
            },
          });
        } catch (logError) {
          // Don't fail if logging fails
          console.warn('[Claude CFO] Failed to log interaction:', logError);
        }

        return NextResponse.json({
          message: cfoMessage,
          stepComplete: response.stepComplete,
          suggestions: response.suggestions || [],
          extractedData: response.extractedData,
        });
      }

      case 'validate': {
        // Validate the current forecast state
        const cfoRequest: ClaudeCFORequest = {
          step: 'review',
          message: 'Please validate this forecast and highlight any concerns.',
          context,
          conversationHistory: [],
          useOpus: true, // Always use Opus for validation
        };

        const response = await getClaudeCFOResponse(cfoRequest);

        return NextResponse.json({
          message: {
            id: 'cfo-validate-' + Date.now(),
            role: 'cfo',
            content: response.message,
            timestamp: new Date().toISOString(),
            step: 'review',
          },
          isValid: !response.message.toLowerCase().includes('concern'),
        });
      }

      case 'review': {
        // Generate comprehensive review using Opus
        const cfoRequest: ClaudeCFORequest = {
          step: 'review',
          message: message || 'Please provide a comprehensive review of this forecast.',
          context,
          conversationHistory: conversationHistory || [],
          useOpus: true,
        };

        const response = await getClaudeCFOResponse(cfoRequest);

        return NextResponse.json({
          message: {
            id: 'cfo-review-' + Date.now(),
            role: 'cfo',
            content: response.message,
            timestamp: new Date().toISOString(),
            step: 'review',
          },
          stepComplete: response.stepComplete,
        });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('[Claude CFO API] Error:', error);

    // Check if it's an Anthropic API error
    if (error instanceof Error && error.message.includes('API')) {
      return NextResponse.json(
        { error: 'AI service temporarily unavailable. Please try again.' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
