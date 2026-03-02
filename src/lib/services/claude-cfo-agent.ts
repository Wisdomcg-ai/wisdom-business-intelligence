/**
 * Claude CFO Agent Service - V2 (World-Class Redesign)
 *
 * A conversational AI CFO powered by Claude that guides users through
 * financial forecasting with an "AI proposes, user approves" pattern.
 *
 * KEY PRINCIPLES:
 * 1. USER controls the pace - only move on when they explicitly say so
 * 2. ITERATIVE data collection - allow multiple entries per step
 * 3. CONFIRMATION before advancing - always ask "anything else?"
 * 4. NATURAL conversation - like a real CFO meeting
 */

import {
  WizardStep,
  WizardContext,
  CFOMessage,
} from '@/app/finances/forecast/types';

// Dynamically import Anthropic to handle missing SDK gracefully
let anthropicClient: any = null;

async function getAnthropicClient() {
  if (anthropicClient) return anthropicClient;

  try {
    const Anthropic = require('@anthropic-ai/sdk').default;
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    return anthropicClient;
  } catch (e) {
    console.warn('[Claude CFO] Anthropic SDK not installed. Run: npm install @anthropic-ai/sdk');
    return null;
  }
}

// Model selection
const MODELS = {
  fast: 'claude-sonnet-4-20250514',
  review: 'claude-opus-4-20250514',
  parse: 'claude-haiku-3-5-20241022',
} as const;

// Get current date for AI context (called at request time)
function getCurrentDateString(): string {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Australia/Sydney'
  };
  return now.toLocaleDateString('en-AU', options);
}

// System prompt: The AI CFO personality and behavior
const CFO_PERSONALITY = `You are CFO Copilot, an AI-powered financial advisor helping business owners create their financial forecasts. You have decades of experience with Australian SMBs and genuinely care about their success. You were built by Matt Malouf, a renowned Australian business coach, to make financial planning simple and accessible.

CORE PRINCIPLES:
1. USER CONTROLS THE PACE - Never rush them. They decide when to move on.
2. ONE THING AT A TIME - Focus on one item, confirm it, then ask about the next.
3. ITERATIVE COLLECTION - After each entry, ALWAYS ask "Would you like to add another?"
4. EXPLICIT COMPLETION - Only finish a step when they clearly say they're done.

CONVERSATION STYLE:
- Warm, professional, and patient - like a trusted advisor in a face-to-face meeting
- Use their name if you know it, acknowledge their business
- Celebrate decisions: "Great, I've noted that down"
- Be specific: Reference actual numbers from their data
- Keep responses concise but warm (80-150 words typically)
- Use Australian English and AUD currency

YEAR TYPE AWARENESS:
- FY = Financial Year (July to June). FY26 = July 2025 to June 2026
- CY = Calendar Year (January to December)
- Always use the correct year type from their context

CRITICAL RULES FOR STEP COMPLETION:
- ONLY use [STEP_COMPLETE] when the user EXPLICITLY indicates they're done
- Phrases that mean "done": "that's all", "I'm done", "no more", "let's move on", "next step", "nothing else", "all good", "done"
- Phrases that mean "continue": "yes", "add another", "one more", any specific data entry
- When in doubt, ASK: "Shall we move on to the next section, or would you like to add more?"
- NEVER assume they're done just because they answered one question

SUGGESTED RESPONSES:
At the end of EVERY message, provide exactly 2-3 suggested responses.
Format each on a new line starting with [SUGGEST]:

CRITICAL RULES FOR SUGGESTIONS:
1. Each suggestion MUST lead to a DIFFERENT outcome or path
2. NEVER have two suggestions that mean the same thing
3. Cover: Yes path, No path, and optionally a "more info" path
4. Keep under 6 words - punchy and decisive
5. Sound professional, not casual

GOOD EXAMPLES (distinct paths):
- Binary choice: [SUGGEST] Yes, proceed with 1 year [SUGGEST] Include Years 2-3
- Confirming data: [SUGGEST] Confirmed [SUGGEST] I need to adjust this
- Adding items: [SUGGEST] Add another [SUGGEST] That's everything
- Numbers: [SUGGEST] Use that baseline [SUGGEST] Adjust to $X

BAD EXAMPLES (redundant - NEVER DO THIS):
- "Yes, 1 year is good" + "Just Year 1 for now" = SAME MEANING
- "That's correct" + "Yes, that's right" = SAME MEANING
- "No more" + "That's all" + "I'm done" = SAME MEANING

PATTERNS BY SITUATION:
- Yes/No question: [SUGGEST] Yes [SUGGEST] No [SUGGEST] Tell me more
- Confirm amount: [SUGGEST] Use $X [SUGGEST] Adjust the amount
- Add more items: [SUGGEST] Add another [SUGGEST] Done with this section
- Choose option: [SUGGEST] Option A [SUGGEST] Option B`;

// Step-specific prompts - completely redesigned for iterative flow
const STEP_PROMPTS: Record<WizardStep, string> = {
  setup: `SETUP STEP - Establish forecast parameters

YOUR GOAL: Confirm revenue target and how many years to forecast.

AVAILABLE DATA: Check context for goals.revenue_target, goals.profit_target

CONVERSATION FLOW:
1. GREET warmly, acknowledge their revenue target if set
2. RECOMMEND forecast duration based on their stage:
   - Growing business → 1 year (monthly detail)
   - Established → 2 years
   - Strategic planning → 3 years
3. WAIT for their confirmation or preference
4. Once they confirm the years, ask if there's anything to adjust about targets
5. When they confirm all is good → [STEP_COMPLETE]

EXAMPLE FLOW:
You: "Welcome! I see your revenue target is $1.2M for FY26. Solid goal. I'd recommend we build a 1-year forecast with monthly detail first - it gives you the most actionable plan. Does that work for you?"
User: "Yes, let's do 1 year"
You: "Perfect, 1-year forecast it is. Your profit target is showing as $120k (10% margin). Does that align with what you're aiming for?"
User: "Yes that's right"
You: "Excellent! We're all set on the foundation. Let's move on to your team. [STEP_COMPLETE]"`,

  team: `TEAM STEP - Plan your people costs

YOUR GOAL: Review existing team AND collect ALL planned hires for the forecast period.

AVAILABLE DATA: Check context for current_team (from Xero) with names, salaries, classifications

CONVERSATION FLOW:
1. SUMMARIZE existing team if data exists (headcount, total wages, COGS vs OpEx split)
2. ASK about planned hires: "Do you have any planned hires for the year?"
3. If YES - collect details ONE HIRE AT A TIME:
   - Role/title
   - Approximate salary
   - Start month
   - Classification (COGS for delivery roles, OpEx for admin/support)
4. After EACH hire, ALWAYS ask: "Would you like to add another hire, or is that all for now?"
5. ONLY when they say they're done → [STEP_COMPLETE]

CRITICAL: Do NOT complete the step after just one hire. Always ask "any more?"

EXAMPLE FLOW:
You: "I found 5 team members from Xero totalling $380k in wages. 3 in delivery (COGS), 2 in operations (OpEx). Are you planning any new hires this year?"
User: "Yes, we need a project manager"
You: "Great! A project manager. What salary are you budgeting, and when would they start?"
User: "Around $95k, starting in February"
You: "Got it - Project Manager, $95k, starting February. I'll classify them as OpEx since it's a management role. Would you like to add another hire?"
User: "Yes, we also need a site supervisor"
You: "Perfect. What's the salary and start date for the site supervisor?"
User: "$85k starting March"
You: "Noted - Site Supervisor, $85k, March start. That's a COGS role as they're in delivery. Any other planned hires?"
User: "No, that's all"
You: "Excellent! So we have 2 new hires planned: Project Manager ($95k from Feb) and Site Supervisor ($85k from March). That adds about $165k to your wage bill for the year. Ready to move on to operating costs? [STEP_COMPLETE]"`,

  costs: `COSTS STEP - Set your operating expenses baseline

YOUR GOAL: Establish the OpEx baseline and any adjustments.

AVAILABLE DATA: Check context for historical_pl with prior_fy and current_ytd data

CONVERSATION FLOW:
1. If Xero data exists:
   - Show prior year OpEx total
   - Show top 3-4 expense categories
   - Compare to current run rate if available
   - RECOMMEND a baseline (usually prior year with adjustment)
2. If no Xero data:
   - Ask for estimated monthly OpEx
3. COLLECT any adjustments:
   - "Want to adjust for inflation?"
   - "Any specific categories changing significantly?"
4. After confirming baseline, ask: "Anything else to adjust, or are we good on costs?"
5. When they confirm → [STEP_COMPLETE]

EXAMPLE FLOW:
You: "Looking at your Xero data, you spent $245k on operating costs last year. Top categories were Rent ($48k), Marketing ($35k), and Insurance ($22k). Your current run rate is $260k - about 6% higher. I'd suggest using $260k as your baseline. Does that feel right?"
User: "Yes, but I expect marketing to increase"
You: "Good thinking. How much do you want to budget for marketing this year?"
User: "About $50k"
You: "Got it - that's $15k more than last year. I'll adjust marketing to $50k, bringing your OpEx baseline to $275k. Anything else to adjust?"
User: "No, that's good"
You: "Perfect. OpEx baseline is set at $275k for the year. Let's look at strategic investments next. [STEP_COMPLETE]"`,

  investments: `INVESTMENTS STEP - Plan strategic investments

YOUR GOAL: Capture ALL planned investments that support their strategy.

AVAILABLE DATA: Check context for strategic_initiatives from their annual plan

CONVERSATION FLOW:
1. If they have strategic initiatives:
   - Reference their SPECIFIC initiatives by name
   - For each relevant one, suggest typical investment ranges
   - Ask which ones need funding
2. If no initiatives:
   - Suggest common investment categories with examples
3. COLLECT investments ONE AT A TIME:
   - Description/purpose
   - Amount
   - Type (CapEx for assets, OpEx for expenses)
   - Timing if relevant
4. After EACH investment, ask: "Any other investments planned?"
5. ONLY when they're done → [STEP_COMPLETE]

INVESTMENT CLASSIFICATIONS:
- CapEx (capitalised): Equipment, vehicles, fitout, technology hardware
- OpEx (expensed): Marketing campaigns, training, consulting, software

EXAMPLE RANGES:
- CRM implementation: $15-30k
- Website redesign: $10-25k
- New vehicle: $40-70k
- Leadership coaching: $10-20k
- Marketing campaign: $15-40k

EXAMPLE FLOW:
You: "I can see you have 3 strategic initiatives planned: 'New CRM System', 'Leadership Development', and 'Brand Refresh'. Let's allocate budgets for these. Starting with the CRM - typical implementations run $15-30k including setup and training. What are you budgeting?"
User: "About $25k"
You: "Perfect - $25k for CRM, that's an OpEx investment. What about Leadership Development?"
User: "$15k for coaching and training"
You: "Great - $15k for leadership development. And the Brand Refresh?"
User: "We're doing $30k on marketing and website"
You: "Excellent - $30k for brand refresh. So that's $70k in strategic investments total. Any other investments beyond these initiatives?"
User: "We might need a new work vehicle"
You: "Good to capture that. What are you budgeting for the vehicle?"
User: "$55k"
You: "Got it - $55k for a work vehicle. That's CapEx so it'll be depreciated. Any other investments?"
User: "No, that's everything"
You: "Perfect! Total investments: $70k in strategic initiatives plus $55k for a vehicle. Let's review your projections. [STEP_COMPLETE]"`,

  projections: `PROJECTIONS STEP - Confirm multi-year growth targets

YOUR GOAL: Confirm or set Year 2-3 targets if doing multi-year forecast.

AVAILABLE DATA: Check context for:
- goals.revenue_year2, revenue_year3
- goals.net_profit_year2, net_profit_year3
- session.years_selected

CONVERSATION FLOW:
1. If only Year 1 selected in setup → Skip this step quickly
2. If multi-year AND they have existing Year 2/3 goals:
   - Show their targets from Goals & Targets wizard
   - Calculate implied growth rates
   - Ask for confirmation
3. If multi-year but NO Year 2/3 goals:
   - Suggest typical growth rates (10-20% for established, 20-40% for growth phase)
   - Ask what they're targeting
4. Confirm and → [STEP_COMPLETE]

KEEP THIS STEP BRIEF - Don't make them redo work from Goals & Targets.`,

  review: `REVIEW STEP - Final validation and approval

YOUR GOAL: Present a clear summary and get sign-off.

THIS STEP USES OPUS FOR DEEPER ANALYSIS.

CONVERSATION FLOW:
1. Present a scannable summary:
   - Revenue target
   - Team costs (existing + new hires)
   - Operating costs
   - Strategic investments
   - Projected profit & margin
2. HIGHLIGHT any concerns:
   - Margin too low (<10% for most SMBs is concerning)
   - Costs seem high relative to revenue
   - Missing components
3. ASK: "Does this look right? Ready to finalize?"
4. Address any concerns they raise
5. On final approval → [STEP_COMPLETE]

FORMAT SUMMARY CLEARLY:
📊 FORECAST SUMMARY - FY26
Revenue Target: $X
├─ Team Costs: $X (existing) + $X (new hires)
├─ Operating Costs: $X
├─ Strategic Investments: $X
└─ Projected Net Profit: $X (X% margin)`,
};

export interface ClaudeCFORequest {
  step: WizardStep;
  message: string;
  context: WizardContext;
  conversationHistory: CFOMessage[];
  useOpus?: boolean;
}

export interface ClaudeCFOResponse {
  message: string;
  stepComplete: boolean;
  suggestions: string[];
  extractedData?: {
    type: 'hire' | 'investment' | 'cost_adjustment' | 'confirmation';
    data: Record<string, unknown>;
  };
}

/**
 * Build rich context string for Claude from wizard state
 */
function buildContextString(context: WizardContext): string {
  const parts: string[] = [];

  // Business basics
  parts.push(`=== BUSINESS CONTEXT ===`);
  parts.push(`Business: ${context.business_name || 'Unknown'}`);
  if (context.industry) parts.push(`Industry: ${context.industry}`);

  // Year type
  const yearType = context.goals?.year_type || 'FY';
  const yearLabel = yearType === 'CY' ? `CY${context.fiscal_year}` : `FY${context.fiscal_year}`;
  const yearPeriod = yearType === 'CY'
    ? `January to December ${context.fiscal_year}`
    : `July ${context.fiscal_year - 1} to June ${context.fiscal_year}`;
  parts.push(`Year Type: ${yearType} (${yearPeriod})`);
  parts.push(`Planning Period: ${yearLabel}`);

  // Goals
  if (context.goals) {
    parts.push(`\n=== TARGETS ===`);
    if (context.goals.revenue_target) {
      parts.push(`Revenue Target: $${context.goals.revenue_target.toLocaleString()}`);
    }
    if (context.goals.profit_target) {
      parts.push(`Net Profit Target: $${context.goals.profit_target.toLocaleString()}`);
    }
    if (context.goals.gross_margin_percent) {
      parts.push(`Target Gross Margin: ${context.goals.gross_margin_percent}%`);
    }
    // Multi-year goals
    if (context.goals.revenue_year2) {
      parts.push(`Year 2 Revenue Target: $${context.goals.revenue_year2.toLocaleString()}`);
    }
    if (context.goals.revenue_year3) {
      parts.push(`Year 3 Revenue Target: $${context.goals.revenue_year3.toLocaleString()}`);
    }
  }

  // Xero Historical Data
  if (context.xero_connected && context.historical_pl?.has_xero_data) {
    parts.push(`\n=== XERO HISTORICAL DATA ===`);
    const pl = context.historical_pl;

    if (pl.prior_fy) {
      const fy = pl.prior_fy;
      parts.push(`\nPRIOR YEAR (${fy.period_label}):`);
      parts.push(`  Revenue: $${fy.total_revenue.toLocaleString()}`);
      parts.push(`  COGS: $${fy.total_cogs.toLocaleString()}`);
      parts.push(`  Gross Profit: $${fy.gross_profit.toLocaleString()} (${fy.gross_margin_percent.toFixed(1)}%)`);
      parts.push(`  OpEx: $${fy.operating_expenses.toLocaleString()}`);
      parts.push(`  Net Profit: $${fy.net_profit.toLocaleString()} (${fy.net_margin_percent.toFixed(1)}%)`);

      if (fy.operating_expenses_by_category?.length) {
        parts.push(`\n  Top OpEx Categories:`);
        fy.operating_expenses_by_category.slice(0, 5).forEach(cat => {
          parts.push(`    - ${cat.account_name}: $${cat.total.toLocaleString()}/yr`);
        });
      }
    }

    if (pl.current_ytd && pl.current_ytd.months_count > 0) {
      const ytd = pl.current_ytd;
      parts.push(`\nCURRENT YTD (${ytd.period_label}, ${ytd.months_count} months):`);
      parts.push(`  Revenue YTD: $${ytd.total_revenue.toLocaleString()}`);
      parts.push(`  OpEx YTD: $${ytd.operating_expenses.toLocaleString()}`);
      parts.push(`  Run Rate Revenue: $${ytd.run_rate_revenue.toLocaleString()}/yr`);
      parts.push(`  Run Rate OpEx: $${ytd.run_rate_opex.toLocaleString()}/yr`);
    }
  } else {
    parts.push(`\n=== NO XERO DATA ===`);
    parts.push(`Xero not connected. Will need manual input.`);
  }

  // Team
  if (context.current_team?.length) {
    const totalWages = context.current_team.reduce((sum, emp) => sum + (emp.annual_salary || 0), 0);
    const cogsTeam = context.current_team.filter(e => e.classification === 'cogs');
    const opexTeam = context.current_team.filter(e => e.classification === 'opex');

    parts.push(`\n=== CURRENT TEAM ===`);
    parts.push(`Total: ${context.current_team.length} people, $${totalWages.toLocaleString()}/yr`);
    parts.push(`  COGS (delivery): ${cogsTeam.length} people`);
    parts.push(`  OpEx (operations): ${opexTeam.length} people`);

    parts.push(`\n  Team Members:`);
    context.current_team.forEach(emp => {
      const salary = emp.annual_salary ? `$${emp.annual_salary.toLocaleString()}` : 'TBD';
      parts.push(`    - ${emp.full_name}: ${emp.job_title || 'No title'} (${salary}, ${emp.classification || 'unclassified'})`);
    });
  }

  // Strategic Initiatives
  if (context.strategic_initiatives?.length) {
    parts.push(`\n=== STRATEGIC INITIATIVES ===`);
    context.strategic_initiatives.forEach((init, i) => {
      parts.push(`${i + 1}. ${init.title}${init.quarter_assigned ? ` (${init.quarter_assigned})` : ''}`);
      if (init.description) {
        parts.push(`   ${init.description.slice(0, 100)}`);
      }
    });
  }

  // Session Progress
  if (context.session) {
    parts.push(`\n=== SESSION ===`);
    parts.push(`Years Selected: ${context.session.years_selected?.join(', ') || '1'}`);
    const completed = Object.entries(context.session.steps_completed || {})
      .filter(([, data]) => data.completed)
      .map(([step]) => step);
    if (completed.length) {
      parts.push(`Completed Steps: ${completed.join(', ')}`);
    }
  }

  // Decisions Made This Session
  if (context.decisions_made?.length) {
    parts.push(`\n=== DECISIONS MADE THIS SESSION ===`);
    context.decisions_made.slice(-10).forEach(dec => {
      parts.push(`- ${dec.decision_type}: ${JSON.stringify(dec.decision_data).slice(0, 100)}`);
    });
  }

  return parts.join('\n');
}

/**
 * Main Claude CFO function - generates AI response
 */
export async function getClaudeCFOResponse(request: ClaudeCFORequest): Promise<ClaudeCFOResponse> {
  const { step, message, context, conversationHistory, useOpus } = request;

  const model = useOpus || step === 'review' ? MODELS.review : MODELS.fast;

  const systemPrompt = `${CFO_PERSONALITY}

TODAY'S DATE: ${getCurrentDateString()}
Use this date for all time-based references. We are currently in FY${new Date().getMonth() >= 6 ? new Date().getFullYear() + 1 : new Date().getFullYear()} (Australian financial year runs July-June).

=== CURRENT STEP: ${step.toUpperCase()} ===
${STEP_PROMPTS[step]}

=== CONTEXT ===
${buildContextString(context)}`;

  // Build messages array
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  // Add conversation history (last 20 messages)
  const recentHistory = conversationHistory.slice(-20);
  for (const msg of recentHistory) {
    messages.push({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content,
    });
  }

  // Add current message
  messages.push({ role: 'user', content: message });

  try {
    const client = await getAnthropicClient();
    if (!client) {
      return {
        message: "I'm not fully configured yet. Please install the Anthropic SDK by running: npm install @anthropic-ai/sdk",
        stepComplete: false,
        suggestions: [],
      };
    }

    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    const textBlock = response.content.find((block: { type: string }) => block.type === 'text');
    const aiResponse = textBlock?.type === 'text' ? (textBlock as { type: 'text'; text: string }).text : '';

    if (!aiResponse) {
      throw new Error('No response from Claude');
    }

    // Check for step completion marker
    const stepComplete = aiResponse.includes('[STEP_COMPLETE]');

    // Extract suggestions from [SUGGEST] markers
    const suggestionRegex = /\[SUGGEST\]\s*(.+?)(?=\[SUGGEST\]|$|\n)/g;
    const suggestions: string[] = [];
    let match;
    while ((match = suggestionRegex.exec(aiResponse)) !== null) {
      const suggestion = match[1].trim();
      if (suggestion && suggestion.length < 50) {
        suggestions.push(suggestion);
      }
    }

    // Clean the response - remove markers
    const cleanedResponse = aiResponse
      .replace(/\s*\[STEP_COMPLETE\]\s*/g, '')
      .replace(/\[SUGGEST\]\s*.+?(?=\[SUGGEST\]|$|\n)/g, '')
      .trim();

    return {
      message: cleanedResponse,
      stepComplete,
      suggestions: suggestions.slice(0, 3), // Max 3 suggestions
    };
  } catch (error) {
    console.error('[Claude CFO] Error:', error);
    throw error;
  }
}

/**
 * Get initial greeting for a step with contextual suggestions
 */
export function getStepGreeting(step: WizardStep, context: WizardContext): CFOMessage & { suggestions: string[] } {
  const yearType = context.goals?.year_type || 'FY';
  const yearLabel = yearType === 'CY' ? `CY${context.fiscal_year}` : `FY${context.fiscal_year}`;
  const yearPeriod = yearType === 'CY'
    ? `January to December ${context.fiscal_year}`
    : `July ${context.fiscal_year - 1} to June ${context.fiscal_year}`;

  const greetings: Record<WizardStep, { message: () => string; suggestions: string[] }> = {
    setup: {
      message: () => {
        const revenue = context.goals?.revenue_target;
        const profit = context.goals?.profit_target;
        if (revenue) {
          let msg = `Welcome! I can see your revenue target is $${revenue.toLocaleString()} for ${yearLabel}.`;
          if (profit) {
            const margin = ((profit / revenue) * 100).toFixed(0);
            msg += ` With a profit target of $${profit.toLocaleString()} (${margin}% margin).`;
          }
          msg += `\n\nI'd recommend we build a detailed 1-year forecast first - it gives you the most actionable plan. Would you like to add Year 2-3 projections as well?`;
          return msg;
        }
        return `Welcome! Let's build your forecast for ${yearLabel} (${yearPeriod}). First, what's your revenue target for the year?`;
      },
      suggestions: context.goals?.revenue_target
        ? ['1 year is perfect', 'Include Years 2-3']
        : ['Enter revenue target']
    },

    team: {
      message: () => {
        const team = context.current_team || [];
        if (team.length > 0) {
          const totalWages = team.reduce((sum, e) => sum + (e.annual_salary || 0), 0);
          const cogsCount = team.filter(e => e.classification === 'cogs').length;
          const opexCount = team.filter(e => e.classification === 'opex').length;
          return `Great, let's look at your team. I found ${team.length} team members from Xero with $${totalWages.toLocaleString()} in annual wages.\n\nCurrent split: ${cogsCount} in delivery (COGS), ${opexCount} in operations (OpEx).\n\nDo you have any new hires planned for the forecast period?`;
        }
        return `Now let's plan your team costs. I don't see team data from Xero connected.\n\nWould you like to add team members manually, or skip this step for now?`;
      },
      suggestions: context.current_team?.length
        ? ['Yes, I have planned hires', 'No new hires this year']
        : ['Add team members', 'Skip for now']
    },

    costs: {
      message: () => {
        if (context.xero_connected && context.historical_pl?.has_xero_data) {
          const pl = context.historical_pl;
          if (pl.prior_fy) {
            const priorOpex = pl.prior_fy.operating_expenses;
            const topCats = pl.prior_fy.operating_expenses_by_category?.slice(0, 3) || [];
            const catList = topCats.map(c => `${c.account_name} ($${Math.round(c.total / 1000)}k)`).join(', ');

            let msg = `Let's set your operating costs baseline. Looking at your Xero data:\n\n`;
            msg += `**Prior Year OpEx:** $${priorOpex.toLocaleString()}\n`;
            msg += `**Top categories:** ${catList}\n`;

            if (pl.current_ytd && pl.current_ytd.months_count > 0) {
              const runRate = pl.current_ytd.run_rate_opex;
              const change = pl.current_ytd.opex_vs_prior_percent;
              msg += `**Current run rate:** $${runRate.toLocaleString()}/year (${change >= 0 ? '+' : ''}${change.toFixed(0)}% vs last year)\n`;
            }

            msg += `\nI'd recommend using the prior year as your baseline. Would you like to apply any adjustments?`;
            return msg;
          }
        }
        return `Let's set your operating costs baseline. What's your estimated monthly OpEx (excluding wages)?`;
      },
      suggestions: context.xero_connected
        ? ['Use prior year baseline', 'I need to adjust some categories']
        : ['Enter monthly estimate']
    },

    investments: {
      message: () => {
        const initiatives = context.strategic_initiatives || [];
        if (initiatives.length > 0) {
          const list = initiatives.slice(0, 5).map((init, i) => `${i + 1}. ${init.title}`).join('\n');
          return `Now let's plan investments for your strategic initiatives:\n\n${list}\n\nWould you like to allocate budgets for any of these? We can go through them one at a time.`;
        }
        return `Let's plan any strategic investments for the year. Common areas include:\n\n• **Technology**: CRM, automation, systems ($10-50k)\n• **Marketing**: Website, campaigns, brand ($10-40k)\n• **Team Development**: Training, coaching ($5-20k)\n• **Equipment**: Vehicles, tools, fitout ($10-100k)\n\nDo you have any major investments planned?`;
      },
      suggestions: context.strategic_initiatives?.length
        ? ['Yes, let\'s allocate budgets', 'No investments planned']
        : ['Yes, I have investments', 'No major investments']
    },

    projections: {
      message: () => {
        const yearsSelected = context.session?.years_selected || [1];
        if (yearsSelected.length === 1) {
          return `Since we're focusing on Year 1, we can skip the multi-year projections. Ready to review your forecast? [STEP_COMPLETE]`;
        }

        const goals = context.goals;
        const rev1 = goals?.revenue_target || 0;
        const rev2 = goals?.revenue_year2 || 0;
        const rev3 = goals?.revenue_year3 || 0;

        if (rev2 > 0 || rev3 > 0) {
          let msg = `I see you've already set multi-year goals:\n\n`;
          msg += `**Year 1**: $${rev1.toLocaleString()}\n`;
          if (rev2 > 0) {
            const growth = rev1 > 0 ? Math.round(((rev2 - rev1) / rev1) * 100) : 0;
            msg += `**Year 2**: $${rev2.toLocaleString()} (+${growth}%)\n`;
          }
          if (rev3 > 0) {
            const growth = rev2 > 0 ? Math.round(((rev3 - rev2) / rev2) * 100) : 0;
            msg += `**Year 3**: $${rev3.toLocaleString()} (+${growth}%)\n`;
          }
          msg += `\nShall we use these targets?`;
          return msg;
        }

        return `For your multi-year forecast, what growth rate are you targeting? Typical ranges are 10-20% for established businesses, 20-40% for growth phase.`;
      },
      suggestions: ['Use these targets', 'Adjust growth rates']
    },

    review: {
      message: () => {
        return `Excellent! Let me pull together everything we've discussed and give you a summary to review...`;
      },
      suggestions: ['Generate summary']
    },
  };

  const greeting = greetings[step];
  return {
    id: `greeting-${step}-${Date.now()}`,
    role: 'cfo',
    content: greeting.message(),
    timestamp: new Date().toISOString(),
    step,
    suggestions: greeting.suggestions,
  };
}

/**
 * Parse user response to extract structured data (using Haiku for speed)
 */
export async function parseUserResponse(
  userMessage: string,
  expectedType: 'number' | 'percentage' | 'yes_no' | 'selection',
  options?: string[]
): Promise<{ value: unknown; confidence: 'high' | 'medium' | 'low' }> {
  const systemPrompt = `You are a response parser. Extract structured data from user messages.

Expected type: ${expectedType}
${options ? `Valid options: ${options.join(', ')}` : ''}

Respond with JSON only:
{ "value": <extracted value>, "confidence": "high" | "medium" | "low" }`;

  try {
    const client = await getAnthropicClient();
    if (!client) throw new Error('SDK not available');

    const response = await client.messages.create({
      model: MODELS.parse,
      max_tokens: 100,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const textBlock = response.content.find((block: { type: string }) => block.type === 'text');
    const text = textBlock?.type === 'text' ? (textBlock as { type: 'text'; text: string }).text : '';
    return JSON.parse(text);
  } catch {
    // Fallback extraction
    if (expectedType === 'number') {
      const match = userMessage.match(/[\d,]+\.?\d*/);
      if (match) return { value: parseFloat(match[0].replace(/,/g, '')), confidence: 'medium' };
    }
    if (expectedType === 'yes_no') {
      const lower = userMessage.toLowerCase();
      if (/yes|sure|ok|yep|yeah|correct|right/.test(lower)) return { value: true, confidence: 'medium' };
      if (/no|nope|skip|not/.test(lower)) return { value: false, confidence: 'medium' };
    }
    return { value: null, confidence: 'low' };
  }
}

/**
 * Generate forecast review summary using Opus
 */
export async function generateForecastReview(context: WizardContext): Promise<{
  summary: string;
  concerns: { severity: 'error' | 'warning' | 'info'; message: string }[];
  recommendation: string;
}> {
  const systemPrompt = `You are an experienced CFO reviewing a financial forecast. Provide:
1. A clear summary with key numbers
2. Any concerns (margins, costs, missing items)
3. Your recommendation

Be specific and direct. Australian market context.`;

  const client = await getAnthropicClient();
  if (!client) {
    return {
      summary: "AI review unavailable. Please check your configuration.",
      concerns: [],
      recommendation: 'Manual review required',
    };
  }

  const response = await client.messages.create({
    model: MODELS.review,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: `Review this forecast:\n\n${buildContextString(context)}` }],
  });

  const textBlock = response.content.find((block: { type: string }) => block.type === 'text');
  const text = textBlock?.type === 'text' ? (textBlock as { type: 'text'; text: string }).text : '';

  return {
    summary: text,
    concerns: [],
    recommendation: 'Proceed with forecast',
  };
}
