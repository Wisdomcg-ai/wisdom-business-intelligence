import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { checkRateLimit, createRateLimitKey, RATE_LIMIT_CONFIGS } from '@/lib/utils/rate-limiter'
import {
  sanitizeAIInput,
  detectPromptInjection,
  logSuspiciousInput,
  AI_INPUT_LIMITS,
} from '@/lib/utils/ai-sanitizer'
import { getFiscalMonthLabels, DEFAULT_YEAR_START_MONTH } from '@/lib/utils/fiscal-year-utils'

export const dynamic = 'force-dynamic'

/**
 * AI Forecast Insights — structured AI responses for the forecast wizard.
 *
 * Supports three insight types:
 *   - prior-year-insights: Analyzes prior year P&L → returns AIInsight[]
 *   - review-narrative:    Summarizes full forecast → returns narrative string
 *   - scenario-suggestion: Suggests a data-driven what-if → returns scenario object
 */
export async function POST(request: Request) {
  const supabase = await createRouteHandlerClient()

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimitKey = createRateLimitKey('/api/ai/forecast-insights', user.id)
    const rateLimit = checkRateLimit(rateLimitKey, RATE_LIMIT_CONFIGS.ai)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', retryAfter: Math.ceil(rateLimit.resetIn / 1000) },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rateLimit.resetIn / 1000)) } }
      )
    }

    const body = await request.json()
    const { type, data } = body

    if (!type || !data) {
      return NextResponse.json({ error: 'type and data are required' }, { status: 400 })
    }

    // Sanitize and check for prompt injection
    const dataStr = JSON.stringify(data)
    const sanitizedDataStr = sanitizeAIInput(dataStr, AI_INPUT_LIMITS.transcript)
    const injectionCheck = detectPromptInjection(sanitizedDataStr)
    if (injectionCheck.isSuspicious) {
      logSuspiciousInput('/api/ai/forecast-insights', user.id, sanitizedDataStr.slice(0, 500), injectionCheck.pattern || 'unknown')
      return NextResponse.json({ error: 'Request blocked by content filter' }, { status: 400 })
    }

    // Re-parse sanitized data
    let sanitizedData: any
    try {
      sanitizedData = JSON.parse(sanitizedDataStr)
    } catch {
      sanitizedData = data // Fallback to original if sanitization broke JSON
    }

    const validTypes = ['prior-year-insights', 'review-narrative', 'scenario-suggestion']
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: 'Invalid request type' }, { status: 400 })
    }

    let system: string
    let userMessage: string

    switch (type) {
      case 'prior-year-insights':
        ({ system, userMessage } = buildPriorYearInsightsPrompt(sanitizedData))
        break
      case 'review-narrative':
        ({ system, userMessage } = buildReviewNarrativePrompt(sanitizedData))
        break
      case 'scenario-suggestion':
        ({ system, userMessage } = buildScenarioSuggestionPrompt(sanitizedData))
        break
      default:
        return NextResponse.json({ error: 'Invalid request type' }, { status: 400 })
    }

    // Call Claude (preferred) → OpenAI fallback
    let responseText: string | null = null

    try {
      const Anthropic = require('@anthropic-ai/sdk').default
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

      const result = await anthropic.messages.create({
        model: 'claude-haiku-3-5-20241022', // Fast + cheap for structured output
        max_tokens: 1024,
        system,
        messages: [{ role: 'user', content: userMessage }],
      })

      const textBlock = result.content.find((b: { type: string }) => b.type === 'text')
      responseText = textBlock?.text || null
    } catch (anthropicError) {
      console.warn('[forecast-insights] Anthropic failed, trying OpenAI:', anthropicError)
    }

    if (!responseText) {
      try {
        const OpenAI = require('openai').default
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

        const result = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          max_tokens: 1024,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: userMessage },
          ],
        })

        responseText = result.choices[0]?.message?.content || null
      } catch (openaiError) {
        console.error('[forecast-insights] OpenAI also failed:', openaiError)
        return NextResponse.json({ error: 'AI service unavailable' }, { status: 503 })
      }
    }

    if (!responseText) {
      return NextResponse.json({ error: 'No response from AI' }, { status: 503 })
    }

    // Parse JSON response
    try {
      // Extract JSON from possible markdown fences
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/)
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : responseText.trim()
      const parsed = JSON.parse(jsonStr)
      return NextResponse.json({ result: parsed })
    } catch {
      console.error('[forecast-insights] Failed to parse AI response as JSON:', responseText.slice(0, 300))
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 502 })
    }
  } catch (error) {
    console.error('[forecast-insights] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── Prompt Builders ────────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n)
}

function pct(n: number): string {
  return `${n.toFixed(1)}%`
}

function buildPriorYearInsightsPrompt(data: any): { system: string; userMessage: string } {
  const system = `You are an experienced Australian business coach analysing a client's prior year financial data. Your role is to surface 4 key insights that spark productive coaching conversations.

RULES:
- Use Australian English, AUD currency
- Be specific — reference their actual numbers
- Each insight should make the business owner THINK, not just inform
- Focus on: what's strong, what's risky, what's unusual, and what question to explore
- Keep observations to 1 sentence, implications to 1 sentence, questions punchy and thought-provoking
- DO NOT give direct financial advice

Return ONLY valid JSON (no markdown fences) in this exact format:
{
  "insights": [
    {
      "id": "1",
      "headline": "Short label (1-3 words)",
      "metricValue": "Formatted number or keyword",
      "metricContext": "Brief context (5-8 words)",
      "observation": "What the data shows (1 sentence)",
      "implication": "Why this matters for their business (1 sentence)",
      "question": "Thought-provoking coaching question",
      "category": "positive | warning | neutral"
    }
  ]
}`

  const py = data.priorYear
  const ytd = data.currentYTD
  const fiscalYear = data.fiscalYear

  let userMessage = `Analyse this business's prior year (FY${fiscalYear - 1}) financials:\n\n`
  userMessage += `Revenue: ${fmt(py.revenue.total)}\n`
  userMessage += `COGS: ${fmt(py.cogs.total)} (${pct(py.cogs.percentOfRevenue)} of revenue)\n`
  userMessage += `Gross Profit: ${fmt(py.grossProfit.total)} (${pct(py.grossProfit.percent)})\n`
  userMessage += `Operating Expenses: ${fmt(py.opex.total)}\n`
  userMessage += `Net Profit: ${fmt(py.grossProfit.total - py.opex.total)} (${pct(py.revenue.total > 0 ? ((py.grossProfit.total - py.opex.total) / py.revenue.total) * 100 : 0)})\n`

  if (py.opex.byLine?.length > 0) {
    const top3 = py.opex.byLine.slice(0, 3)
    userMessage += `\nTop expenses: ${top3.map((l: any) => `${l.name} ${fmt(l.total)}`).join(', ')}\n`
  }

  if (py.seasonalityPattern?.length === 12) {
    const max = Math.max(...py.seasonalityPattern)
    const min = Math.min(...py.seasonalityPattern)
    const months = getFiscalMonthLabels(DEFAULT_YEAR_START_MONTH)
    userMessage += `\nSeasonality: Peak ${months[py.seasonalityPattern.indexOf(max)]} (${pct(max)}), Low ${months[py.seasonalityPattern.indexOf(min)]} (${pct(min)})\n`
  }

  if (ytd) {
    userMessage += `\nCurrent YTD (${ytd.months_count} months):\n`
    userMessage += `Revenue: ${fmt(ytd.total_revenue)} (run rate: ${fmt(ytd.run_rate_revenue || 0)})\n`
    userMessage += `GM: ${pct(ytd.gross_margin_percent)}, NM: ${pct(ytd.net_margin_percent)}\n`
  }

  if (data.industry) {
    userMessage += `\nIndustry: ${data.industry}\n`
  }

  userMessage += `\nReturn exactly 4 insights covering: revenue/growth, margins, cost structure, and seasonality or a standout observation.`

  return { system, userMessage }
}

function buildReviewNarrativePrompt(data: any): { system: string; userMessage: string } {
  const system = `You are an experienced Australian business coach reviewing a client's financial forecast. Write a brief, conversational narrative summary (3-5 sentences) that helps the business owner understand what their forecast means.

RULES:
- Use Australian English, AUD currency
- Be warm but direct — like a trusted advisor
- Reference specific numbers
- Highlight the headline story, then 1-2 risks or opportunities
- End with a forward-looking observation or question
- DO NOT give direct financial advice

Return ONLY valid JSON (no markdown fences):
{
  "narrative": "Your 3-5 sentence summary here.",
  "sentiment": "strong | solid | cautious | concerning"
}`

  const s = data.summary
  const g = data.goals
  const fy = data.fiscalYear
  const duration = data.forecastDuration

  let userMessage = `Summarise this ${duration}-year forecast for FY${fy}:\n\n`
  userMessage += `Year 1 (FY${fy}):\n`
  userMessage += `  Revenue: ${fmt(s.year1.revenue)}\n`
  userMessage += `  Gross Profit: ${fmt(s.year1.grossProfit)} (${pct(s.year1.grossProfitPct)})\n`
  userMessage += `  Team Costs: ${fmt(s.year1.teamCosts)}\n`
  userMessage += `  OpEx: ${fmt(s.year1.opex)}\n`
  userMessage += `  Net Profit: ${fmt(s.year1.netProfit)} (${pct(s.year1.netProfitPct)})\n`

  if (g?.year1) {
    userMessage += `\nGoals — Revenue: ${fmt(g.year1.revenue)}, GP%: ${pct(g.year1.grossProfitPct)}, NP%: ${pct(g.year1.netProfitPct)}\n`
  }

  if (duration >= 2 && s.year2) {
    userMessage += `\nYear 2 (FY${fy + 1}):\n`
    userMessage += `  Revenue: ${fmt(s.year2.revenue)}, NP: ${fmt(s.year2.netProfit)} (${pct(s.year2.netProfitPct)})\n`
  }
  if (duration >= 3 && s.year3) {
    userMessage += `\nYear 3 (FY${fy + 2}):\n`
    userMessage += `  Revenue: ${fmt(s.year3.revenue)}, NP: ${fmt(s.year3.netProfit)} (${pct(s.year3.netProfitPct)})\n`
  }

  if (data.teamCount > 0) {
    userMessage += `\nTeam: ${data.teamCount} people (${data.newHireCount} new hires planned)\n`
  }

  return { system, userMessage }
}

function buildScenarioSuggestionPrompt(data: any): { system: string; userMessage: string } {
  const system = `You are an experienced Australian business coach. Based on a client's forecast data, suggest ONE specific, data-driven what-if scenario that would be most valuable for them to explore.

RULES:
- Pick the scenario that exposes the biggest risk or opportunity in their specific forecast
- Be specific to their data (e.g., "What if your biggest revenue line drops 20%?" not generic "what if revenue drops")
- The scenario must be expressible as adjustments to: revenue, COGS, team costs, OpEx
- Keep the label under 60 characters
- Keep the description under 80 characters

Return ONLY valid JSON (no markdown fences):
{
  "scenario": {
    "id": "ai-suggested",
    "label": "What if [specific scenario]?",
    "description": "Brief explanation of why this matters",
    "revenueAdj": 0,
    "cogsAdj": 0,
    "teamAdj": 0,
    "opexAdj": 0
  },
  "reasoning": "One sentence explaining why you picked this scenario"
}`

  const s = data.summary
  const fy = data.fiscalYear

  let userMessage = `Suggest a what-if scenario for this FY${fy} forecast:\n\n`
  userMessage += `Revenue: ${fmt(s.year1.revenue)}\n`
  userMessage += `COGS: ${fmt(s.year1.cogs)} (${pct(s.year1.grossProfitPct)} GP%)\n`
  userMessage += `Team: ${fmt(s.year1.teamCosts)} (${pct(s.year1.revenue > 0 ? (s.year1.teamCosts / s.year1.revenue) * 100 : 0)} of revenue)\n`
  userMessage += `OpEx: ${fmt(s.year1.opex)}\n`
  userMessage += `Net Profit: ${fmt(s.year1.netProfit)} (${pct(s.year1.netProfitPct)})\n`

  if (data.revenueLines?.length > 0) {
    userMessage += `\nRevenue lines:\n`
    data.revenueLines.forEach((l: any) => {
      userMessage += `  ${l.name}: ${fmt(l.total)} (${pct(l.pctOfTotal)}%)\n`
    })
  }

  if (data.topExpenses?.length > 0) {
    userMessage += `\nTop OpEx:\n`
    data.topExpenses.forEach((e: any) => {
      userMessage += `  ${e.name}: ${fmt(e.total)}\n`
    })
  }

  if (data.newHireCount > 0) {
    userMessage += `\nPlanned new hires: ${data.newHireCount}\n`
  }

  userMessage += `\nSuggest the single most impactful what-if for this business. Adjustments should be in AUD (negative = decrease).`

  return { system, userMessage }
}
