/**
 * AI Forecast Insights API
 *
 * Generates AI-powered insights for the forecast wizard using Claude.
 * Follows Profit First philosophy with Observation/Implication/Question format.
 * NEVER provides financial advice - only observations and questions to consider.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';

// Types
interface PriorYearData {
  revenue: {
    total: number;
    byMonth: Record<string, number>;
    byLine: Array<{ id: string; name: string; total: number }>;
  };
  cogs: {
    total: number;
    percentOfRevenue: number;
    byMonth: Record<string, number>;
    byLine: Array<{ id: string; name: string; total: number; percentOfRevenue?: number }>;
  };
  grossProfit: {
    total: number;
    percent: number;
    byMonth: Record<string, number>;
  };
  opex: {
    total: number;
    byMonth: Record<string, number>;
    byLine: Array<{ id: string; name: string; total: number; monthlyAvg: number }>;
  };
  seasonalityPattern: number[];
}

interface CurrentYTD {
  revenue_by_month: Record<string, number>;
  total_revenue: number;
  gross_margin_percent: number;
  net_margin_percent: number;
  months_count: number;
}

interface InsightRequest {
  business_id: string;
  fiscal_year: number;
  prior_year: PriorYearData;
  current_ytd: CurrentYTD | null;
  save?: boolean;
  dataHash?: string;
}

interface AIInsight {
  id: string;
  headline: string;
  metricValue?: string;
  metricContext?: string;
  observation: string;
  implication: string;
  question: string;
  category: 'positive' | 'warning' | 'neutral';
}

// System prompt encoding the coach's philosophy
const SYSTEM_PROMPT = `You are a business coach assistant helping analyze financial data for forecasting. You follow the Profit First philosophy: Revenue - Profit = Expenses (profit is allocated first, not what's left over). You focus on "bankable profit" (actual cash) not just paper profit, and always consider cash flow implications.

Your communication style is direct and practical. You provide observations and raise questions - you NEVER give financial advice.

CRITICAL RULES:
1. NEVER use words like "should", "recommend", "advise", "suggest you", "I recommend"
2. NEVER tell the business what to do - only observe and ask questions
3. ALWAYS structure your response with a clear headline metric or pattern
4. Focus on bankable profit, cash flow, and practical business realities
5. Keep implication brief (1-2 sentences max)
6. Ask thought-provoking questions that help the business owner reflect

Format each insight as JSON with these fields:
- headline: A short 2-4 word label for this insight (e.g., "Gross Margin", "Seasonality Pattern", "Top Expense")
- metricValue: The key number or pattern (e.g., "42%", "Strong", "$125,000")
- metricContext: Brief context for the metric (e.g., "typical: 50-60%", "peak in December", "32% of OpEx")
- observation: A brief factual statement about what the data shows (1 sentence)
- implication: What this might mean for the business (1-2 sentences max)
- question: A thought-provoking question for the business owner to consider
- category: "positive" (good trend), "warning" (potential concern), or "neutral" (informational)

Provide exactly 4 insights, focusing on the most important patterns. Prioritize: margins, revenue trends, major expenses, and cash flow/seasonality patterns.`;

// GET - Load saved insights
export async function GET(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerClient();

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get('business_id');
    const fiscalYear = searchParams.get('fiscal_year');

    if (!businessId || !fiscalYear) {
      return NextResponse.json(
        { error: 'business_id and fiscal_year are required' },
        { status: 400 }
      );
    }

    // Load saved insights from database
    const { data: savedInsights, error } = await supabase
      .from('forecast_insights')
      .select('insights, data_hash')
      .eq('business_id', businessId)
      .eq('fiscal_year', parseInt(fiscalYear))
      .single();

    if (error || !savedInsights) {
      return NextResponse.json({ insights: [], dataHash: null });
    }

    return NextResponse.json({
      insights: savedInsights.insights || [],
      dataHash: savedInsights.data_hash,
    });

  } catch (error) {
    console.error('[ForecastInsights GET] Error:', error);
    return NextResponse.json(
      { error: 'Failed to load insights' },
      { status: 500 }
    );
  }
}

// POST - Generate and optionally save insights
export async function POST(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerClient();

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: InsightRequest = await request.json();
    const { business_id, fiscal_year, prior_year, current_ytd, save, dataHash } = body;

    if (!business_id || !prior_year) {
      return NextResponse.json(
        { error: 'business_id and prior_year are required' },
        { status: 400 }
      );
    }

    // Check if we have an API key
    if (!process.env.ANTHROPIC_API_KEY) {
      console.warn('[ForecastInsights] No ANTHROPIC_API_KEY configured, returning empty insights');
      return NextResponse.json({ insights: [] });
    }

    // Build the analysis context
    const priorFY = fiscal_year - 1;
    const gpPercent = prior_year.grossProfit.percent;
    const netProfit = prior_year.grossProfit.total - prior_year.opex.total;
    const npPercent = prior_year.revenue.total > 0
      ? (netProfit / prior_year.revenue.total) * 100
      : 0;
    const opexPercent = prior_year.revenue.total > 0
      ? (prior_year.opex.total / prior_year.revenue.total) * 100
      : 0;

    // Seasonality analysis
    const maxSeasonality = Math.max(...prior_year.seasonalityPattern);
    const minSeasonality = Math.min(...prior_year.seasonalityPattern);
    const seasonalityVariance = maxSeasonality - minSeasonality;
    const months = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    const peakMonth = months[prior_year.seasonalityPattern.indexOf(maxSeasonality)];
    const lowMonth = months[prior_year.seasonalityPattern.indexOf(minSeasonality)];

    // Top expenses
    const topExpenses = prior_year.opex.byLine
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
      .map(e => ({
        name: e.name,
        amount: e.total,
        percentOfOpex: prior_year.opex.total > 0 ? (e.total / prior_year.opex.total) * 100 : 0,
        monthlyAvg: e.monthlyAvg,
      }));

    // YTD comparison if available
    let ytdComparison = '';
    if (current_ytd && current_ytd.months_count > 0) {
      const expectedPace = prior_year.revenue.total * (current_ytd.months_count / 12);
      const paceVariance = ((current_ytd.total_revenue - expectedPace) / expectedPace) * 100;
      ytdComparison = `
Current YTD Performance (${current_ytd.months_count} months):
- YTD Revenue: $${current_ytd.total_revenue.toLocaleString()}
- Expected at this pace: $${expectedPace.toLocaleString()}
- Variance from prior year pace: ${paceVariance > 0 ? '+' : ''}${paceVariance.toFixed(1)}%
- Current GP%: ${current_ytd.gross_margin_percent.toFixed(1)}%
- Current NP%: ${current_ytd.net_margin_percent.toFixed(1)}%`;
    }

    const analysisPrompt = `Analyze this business's FY${priorFY} financial data and provide insights for their FY${fiscal_year} forecast planning:

PRIOR YEAR (FY${priorFY}) SUMMARY:
- Total Revenue: $${prior_year.revenue.total.toLocaleString()}
- Total COGS: $${prior_year.cogs.total.toLocaleString()} (${prior_year.cogs.percentOfRevenue.toFixed(1)}% of revenue)
- Gross Profit: $${prior_year.grossProfit.total.toLocaleString()} (${gpPercent.toFixed(1)}% margin)
- Total Operating Expenses: $${prior_year.opex.total.toLocaleString()} (${opexPercent.toFixed(1)}% of revenue)
- Net Profit: $${netProfit.toLocaleString()} (${npPercent.toFixed(1)}% margin)

SEASONALITY:
- Peak month: ${peakMonth} (${maxSeasonality.toFixed(1)}% of annual revenue)
- Low month: ${lowMonth} (${minSeasonality.toFixed(1)}% of annual revenue)
- Seasonality variance: ${seasonalityVariance.toFixed(1)} percentage points

TOP 5 OPERATING EXPENSES:
${topExpenses.map((e, i) => `${i + 1}. ${e.name}: $${e.amount.toLocaleString()} (${e.percentOfOpex.toFixed(1)}% of OpEx, ~$${e.monthlyAvg.toLocaleString()}/mo)`).join('\n')}
${ytdComparison}

Based on this data, provide 3-5 insights. Return ONLY a JSON array of insight objects, no other text.

Example format:
[
  {
    "headline": "Gross Margin",
    "metricValue": "45%",
    "metricContext": "typical: 50-60%",
    "implication": "Lower margins mean more revenue needed for the same profit, with less buffer for unexpected costs.",
    "question": "What opportunities exist to improve pricing or reduce direct costs?",
    "category": "warning"
  },
  {
    "headline": "Seasonality",
    "metricValue": "Strong",
    "metricContext": "Dec peak, Feb low",
    "implication": "Cash flow will vary significantly month-to-month, requiring reserves to cover slow periods.",
    "question": "How are you planning to manage cash during the slower months?",
    "category": "neutral"
  }
]`;

    // Call Claude API
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: analysisPrompt,
        },
      ],
    });

    // Extract text from the response
    const responseText = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('');

    // Parse the JSON response
    let insights: AIInsight[] = [];
    try {
      // Extract JSON array from the response (handle potential markdown code blocks)
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        insights = parsed.map((insight: any, index: number) => ({
          id: `ai-${index + 1}`,
          headline: insight.headline || 'Insight',
          metricValue: insight.metricValue || '',
          metricContext: insight.metricContext || '',
          observation: insight.observation || '',
          implication: insight.implication || '',
          question: insight.question || '',
          category: insight.category || 'neutral',
        }));
      }
    } catch (parseError) {
      console.error('[ForecastInsights] Failed to parse AI response:', parseError);
      console.error('[ForecastInsights] Raw response:', responseText);
    }

    // Log the interaction for learning/review
    try {
      await supabase.from('ai_interactions').insert({
        business_id,
        user_id: user.id,
        question: 'forecast_insights',
        question_type: 'forecast_insights',
        context: 'forecast_wizard.step2.analysis',
        context_data: {
          fiscal_year,
          prior_year_revenue: prior_year.revenue.total,
          prior_year_gp_percent: gpPercent,
          prior_year_np_percent: npPercent,
          has_ytd: !!current_ytd,
        },
        ai_response: { insights },
        confidence: 'high',
      });
    } catch (logError) {
      console.warn('[ForecastInsights] Failed to log interaction:', logError);
    }

    // Save insights if requested
    if (save && insights.length > 0) {
      try {
        await supabase
          .from('forecast_insights')
          .upsert({
            business_id,
            fiscal_year,
            insights,
            data_hash: dataHash,
            generated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'business_id,fiscal_year',
          });
        console.log('[ForecastInsights] Insights saved successfully');
      } catch (saveError) {
        console.warn('[ForecastInsights] Failed to save insights:', saveError);
      }
    }

    return NextResponse.json({ insights, dataHash });

  } catch (error) {
    console.error('[ForecastInsights API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate insights' },
      { status: 500 }
    );
  }
}
