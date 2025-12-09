import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createRouteHandlerClient } from '@/lib/supabase/server';

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    // Authentication check - only authenticated users can use AI
    const supabase = await createRouteHandlerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { fieldType, currentValue, businessContext } = await request.json();

    // Create context-aware prompts based on field type
    const prompts: Record<string, string> = {
      target_demographics: `Based on a ${businessContext.industry || 'business'} with ${businessContext.revenue || 'current'} revenue, suggest specific target customer demographics. Be specific about age, income, location, and characteristics. Keep it under 100 words.`,
      
      target_problems: `For the target demographics "${currentValue.demographics || 'business customers'}", list 3-5 specific problems they face that a ${businessContext.industry || 'business'} could solve. Be specific and use their language.`,
      
      uvp_statement: `Create a unique value proposition for a ${businessContext.industry || 'business'} targeting "${currentValue.demographics || 'customers'}" who have these problems: "${currentValue.problems || 'business challenges'}". Use this format: ${currentValue.framework === 'option1' ? '"We help [who] achieve [what] by [how] so they can [result]"' : '"Unlike [competitors], we [unique approach] which means [benefit]"'}`,
      
      competitive_advantage: `For a ${businessContext.industry || 'business'}, list 3-4 specific competitive advantages that would matter to customers. Consider experience, methodology, speed, results, or unique approach.`,
      
      competitor_difference: `How would customers perceive the difference between you and ${currentValue.competitorName || 'a competitor'}? Give 2-3 specific differences from the customer's perspective. Be specific and realistic.`,
      
      market_size: `Estimate the market size and opportunity for a ${businessContext.industry || 'business'} in ${businessContext.location || 'your area'}. Include TAM (Total Addressable Market), growth rate, and opportunity. Keep it realistic and specific.`,
      
      market_approach: `Suggest a market capture strategy for a ${businessContext.industry || 'business'} targeting "${currentValue.demographics || 'your market'}". Include 3-4 specific tactics.`,
    };

    const prompt = prompts[fieldType] || 'Provide a helpful suggestion for this business planning field.';

    // Call OpenAI - try different models
    let completion;
    try {
      // Try GPT-4 first
      completion = await openai.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'You are a business strategy expert helping small to medium businesses create their strategic plan. Provide practical, specific suggestions without jargon. Keep responses concise and actionable.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        model: 'gpt-4',
        temperature: 0.7,
        max_tokens: 200,
      });
    } catch (error: any) {
      // Fallback to GPT-3.5-turbo if GPT-4 fails
      completion = await openai.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'You are a business strategy expert helping small to medium businesses create their strategic plan. Provide practical, specific suggestions without jargon. Keep responses concise and actionable.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        model: 'gpt-3.5-turbo',
        temperature: 0.7,
        max_tokens: 200,
      });
    }

    const suggestion = completion.choices[0]?.message?.content || '';

    return NextResponse.json({ suggestion });
  } catch (error) {
    console.error('AI assist error:', error);
    return NextResponse.json(
      { error: 'Failed to get AI suggestion' },
      { status: 500 }
    );
  }
}