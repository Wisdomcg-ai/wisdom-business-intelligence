import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import OpenAI from 'openai';

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Step-specific context for the AI
const STEP_CONTEXT: Record<number, string> = {
  1: 'The user is on Step 1: Setting Goals. They are defining revenue targets, gross profit percentage, and net profit percentage goals for their forecast year(s).',
  2: 'The user is on Step 2: Prior Year Analysis. They are reviewing their historical financial data from Xero including revenue patterns, costs, and seasonality.',
  3: 'The user is on Step 3: Revenue & COGS. They are planning revenue lines, distribution patterns (seasonal vs straight-line), and cost of goods sold.',
  4: 'The user is on Step 4: Team Planning. They are forecasting team costs including salaries, superannuation (12%), bonuses, commissions, new hires, and departures.',
  5: 'The user is on Step 5: Operating Expenses. They are planning OpEx items with different cost behaviors (fixed, variable, seasonal, ad-hoc) and annual increase percentages.',
  6: 'The user is on Step 6: Subscriptions. They are reviewing and planning subscription costs and recurring software expenses.',
  7: 'The user is on Step 7: CapEx & Investments. They are planning capital expenditures, depreciation, and strategic investments.',
  8: 'The user is on Step 8: Final Review. They are reviewing their complete forecast summary and can make final adjustments.',
};

const SYSTEM_PROMPT = `You are an experienced CFO assistant helping a small-to-medium business owner build their financial forecast in Australia.

Your role:
- Provide practical, actionable financial advice
- Use Australian business context (AUD, superannuation at 12%, Australian tax considerations)
- Be concise but helpful - aim for 2-4 sentences unless more detail is needed
- Use plain language, avoiding jargon where possible
- When discussing salaries, use Australian market rates
- Reference industry benchmarks when relevant

Key Australian context:
- Financial year runs July to June (e.g., FY2026 = July 2025 - June 2026)
- Superannuation is currently 12% of salary
- GST is 10% but not typically included in P&L forecasting
- Common industries: trades, professional services, retail, hospitality, construction

When you don't have enough context, ask clarifying questions rather than making assumptions.`;

export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const supabase = await createRouteHandlerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { message, context, history } = body;

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const stepContext = context?.step ? STEP_CONTEXT[context.step] || '' : '';

    // Build messages for OpenAI
    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: SYSTEM_PROMPT },
    ];

    // Add step context as a system message
    if (stepContext) {
      messages.push({
        role: 'system',
        content: `Current context: ${stepContext}`,
      });
    }

    // Add conversation history
    if (history && Array.isArray(history)) {
      for (const msg of history.slice(-10)) { // Keep last 10 messages for context
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({
            role: msg.role,
            content: msg.content,
          });
        }
      }
    }

    // Add the current message
    messages.push({ role: 'user', content: message });

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages,
      temperature: 0.7,
      max_tokens: 500,
    });

    const response = completion.choices[0]?.message?.content ||
      "I'm here to help you build your forecast. Could you please rephrase your question?";

    return NextResponse.json({ message: response });
  } catch (error) {
    console.error('AI Forecast Assistant error:', error);
    return NextResponse.json(
      { error: 'Failed to get AI response' },
      { status: 500 }
    );
  }
}
