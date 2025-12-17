import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { checkRateLimit, createRateLimitKey, RATE_LIMIT_CONFIGS } from '@/lib/utils/rate-limiter';
import {
  sanitizeObjectForAI,
  detectPromptInjection,
  logSuspiciousInput,
  AI_INPUT_LIMITS
} from '@/lib/utils/ai-sanitizer';

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

    // Rate limiting - prevent AI cost abuse (30 requests per hour per user)
    const rateLimitKey = createRateLimitKey('/api/ai-assist', user.id);
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

    const { fieldType, currentValue, businessContext } = await request.json();

    // Sanitize all user-provided values to prevent prompt injection
    const sanitizedCurrentValue = sanitizeObjectForAI(currentValue || {}, AI_INPUT_LIMITS.fieldValue);
    const sanitizedBusinessContext = sanitizeObjectForAI(businessContext || {}, AI_INPUT_LIMITS.fieldValue);

    // Check for suspicious patterns in values that will be used in prompts
    const valuesToCheck = [
      sanitizedCurrentValue.demographics,
      sanitizedCurrentValue.problems,
      sanitizedCurrentValue.competitorName,
      sanitizedBusinessContext.industry,
      sanitizedBusinessContext.location
    ].filter(Boolean).join(' ');

    const injectionCheck = detectPromptInjection(valuesToCheck);
    if (injectionCheck.isSuspicious) {
      logSuspiciousInput('/api/ai-assist', user.id, valuesToCheck, injectionCheck.pattern || 'unknown');
    }

    // Create context-aware prompts based on field type (using sanitized values)
    const prompts: Record<string, string> = {
      target_demographics: `Based on a ${sanitizedBusinessContext.industry || 'business'} with ${sanitizedBusinessContext.revenue || 'current'} revenue, suggest specific target customer demographics. Be specific about age, income, location, and characteristics. Keep it under 100 words.`,

      target_problems: `For the target demographics "${sanitizedCurrentValue.demographics || 'business customers'}", list 3-5 specific problems they face that a ${sanitizedBusinessContext.industry || 'business'} could solve. Be specific and use their language.`,

      uvp_statement: `Create a unique value proposition for a ${sanitizedBusinessContext.industry || 'business'} targeting "${sanitizedCurrentValue.demographics || 'customers'}" who have these problems: "${sanitizedCurrentValue.problems || 'business challenges'}". Use this format: ${sanitizedCurrentValue.framework === 'option1' ? '"We help [who] achieve [what] by [how] so they can [result]"' : '"Unlike [competitors], we [unique approach] which means [benefit]"'}`,

      competitive_advantage: `For a ${sanitizedBusinessContext.industry || 'business'}, list 3-4 specific competitive advantages that would matter to customers. Consider experience, methodology, speed, results, or unique approach.`,

      competitor_difference: `How would customers perceive the difference between you and ${sanitizedCurrentValue.competitorName || 'a competitor'}? Give 2-3 specific differences from the customer's perspective. Be specific and realistic.`,

      market_size: `Estimate the market size and opportunity for a ${sanitizedBusinessContext.industry || 'business'} in ${sanitizedBusinessContext.location || 'your area'}. Include TAM (Total Addressable Market), growth rate, and opportunity. Keep it realistic and specific.`,

      market_approach: `Suggest a market capture strategy for a ${sanitizedBusinessContext.industry || 'business'} targeting "${sanitizedCurrentValue.demographics || 'your market'}". Include 3-4 specific tactics.`,
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