import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function POST(request: Request) {
  try {
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

    // Build conversation history for context
    const messages = conversationHistory.map((msg: any) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));

    // Add the new user message
    messages.push({
      role: 'user',
      content: userMessage,
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
      // Extract process name
      updatedProcessData = {
        ...processData,
        name: extractProcessName(userMessage),
        stage: 'overview',
      };
    } else if (stage === 'overview') {
      // Extract trigger and outcome
      updatedProcessData = {
        ...processData,
        trigger: userMessage.slice(0, 100),
        stage: 'swimlanes',
      };
    }

    return NextResponse.json({
      response: aiResponse,
      updatedProcessData,
    });
  } catch (error) {
    console.error('Chat API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to process your message';
    return NextResponse.json(
      { error: errorMessage },
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