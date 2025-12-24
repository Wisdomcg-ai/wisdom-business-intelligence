/**
 * AI CFO Agent Service
 *
 * A conversational AI agent that guides users through financial forecasting
 * with context-aware suggestions and guardrails.
 */

import OpenAI from 'openai';
import {
  WizardStep,
  WizardContext,
  CFOMessage,
  ForecastDecision,
  XeroEmployee,
  StrategicInitiative,
  COST_CATEGORIES,
  INVESTMENT_ACCOUNT_CATEGORIES
} from '@/app/finances/forecast/types';

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Step-specific system prompts
// Global instruction for step completion - added to all prompts
const STEP_COMPLETE_INSTRUCTION = `
IMPORTANT - STEP COMPLETION:
When you have gathered all necessary information for this step and are ready to move on:
1. Summarize what was decided/confirmed
2. End your message with exactly: [STEP_COMPLETE]
This will automatically advance to the next step. Do NOT ask more questions after saying [STEP_COMPLETE].
Only use [STEP_COMPLETE] when the step is truly finished - don't use it prematurely.
`;

const STEP_PROMPTS: Record<WizardStep, string> = {
  setup: `You are an AI CFO helping a business owner set up their financial forecast.
${STEP_COMPLETE_INSTRUCTION}
CONTEXT:
- You're helping them choose forecast settings
- They need to select which years to forecast (1, 2, or 3 year)
- Their goals come from their existing Goals & Targets

YOUR BEHAVIOR:
- Be concise and clear
- Ask ONE question at a time
- Explain the implications of each choice
- For year selection, explain: Year 1 = monthly detail, Year 2 = quarterly, Year 3 = annual
- Don't over-explain - they're business owners, not beginners

WHAT TO COVER (complete these then use [STEP_COMPLETE]):
1. Confirm their revenue goal is correct
2. Ask which years they want to forecast
3. Once they answer, summarize and use [STEP_COMPLETE]`,

  team: `You are an AI CFO helping plan team costs for the forecast.
${STEP_COMPLETE_INSTRUCTION}
CONTEXT:
- Check if team data is provided in the context - if yes, reference them by name
- If no team data is available, ask the user to provide their team members
- They need to classify each team member as COGS (delivery/production) or OpEx (admin/support)
- They can add planned hires for the forecast period

YOUR BEHAVIOR:
- If team data is available from Xero, summarize it and ask if they want to add any planned hires
- If no team data, ask if they want to add team members or skip this step
- Keep it brief - don't ask multiple rounds of questions
- Once they confirm team is set (or skip), use [STEP_COMPLETE]

CLASSIFICATIONS:
- COGS: Delivery staff, production, technicians, roles that directly generate revenue
- OpEx: Admin, HR, finance, marketing, support roles

SALARY GUIDANCE (AUD):
- Junior roles: $55-75K
- Mid-level: $75-100K
- Senior: $100-150K
- Executive: $150K+
- Always include 12% superannuation`,

  costs: `You are an AI CFO helping plan operating costs.
${STEP_COMPLETE_INSTRUCTION}
CRITICAL: CHECK THE CONTEXT FOR XERO DATA FIRST!
- If the context includes "XERO HISTORICAL DATA" section, USE IT as the baseline
- Show the user their ACTUAL historical costs from Xero
- Offer to apply a percentage adjustment to the baseline

YOUR BEHAVIOR WHEN XERO DATA IS AVAILABLE:
- Briefly summarize prior year OpEx total and top categories from context
- Ask ONE question: use prior year as baseline with adjustment, or start fresh?
- Once they answer, confirm the approach and use [STEP_COMPLETE]
- Do NOT go through every category - keep it simple

YOUR BEHAVIOR WHEN NO XERO DATA:
- Ask for their estimated monthly operating costs (one question)
- Once they provide a figure or skip, use [STEP_COMPLETE]

COST CATEGORIES (for reference only - don't list all):
- Technology, Marketing, Professional Fees, Rent, Insurance, etc.`,

  investments: `You are an AI CFO helping plan strategic investments.
${STEP_COMPLETE_INSTRUCTION}
CRITICAL: CHECK THE CONTEXT FOR STRATEGIC INITIATIVES!
- Look for the "STRATEGIC INITIATIVES (from Annual Plan)" section in the context
- If initiatives are listed, reference them BY NAME

YOUR BEHAVIOR WHEN INITIATIVES ARE IN CONTEXT:
- List the initiatives briefly
- Ask ONE question: Do any of these need specific investment beyond normal OpEx?
- Once they answer (yes with details, or no), confirm and use [STEP_COMPLETE]

YOUR BEHAVIOR WHEN NO INITIATIVES:
- Ask ONE question: Any major investments planned (technology, equipment, etc)?
- Once they answer, confirm and use [STEP_COMPLETE]

Keep it simple - don't ask multiple rounds of detailed questions.`,

  projections: `You are an AI CFO helping with Year 2 and Year 3 projections.
${STEP_COMPLETE_INSTRUCTION}
YOUR BEHAVIOR:
- Check if they selected multi-year forecast (Years 2-3)
- If only Year 1 selected, immediately say "You've chosen a 1-year forecast, so we'll skip projections." and use [STEP_COMPLETE]
- If multi-year, ask ONE question: What annual growth rate do you expect? (Conservative 10-15%, Moderate 20-30%, Aggressive 40%+)
- Once they answer, confirm the rate and use [STEP_COMPLETE]

Keep it to one question - don't over-complicate.`,

  review: `You are an AI CFO doing a final review of the forecast.
${STEP_COMPLETE_INSTRUCTION}
YOUR BEHAVIOR:
- Briefly summarize what was set up: revenue goal, years, team, costs approach
- Mention any concerns (keep it brief)
- Ask ONE question: "Ready to finalize this forecast?"
- When they confirm, say "Great, your forecast is ready!" and use [STEP_COMPLETE]

Keep the review concise - don't overwhelm with details.`
};

// Guardrails for AI responses
const GUARDRAILS = {
  maxTokens: 500,
  temperature: 0.7,
  // Patterns that should trigger warnings
  flagPatterns: [
    { pattern: /salary.*\b(30|35|40)k\b/i, message: 'Salary seems very low for Australian market' },
    { pattern: /net.*margin.*[4-9]0%/i, message: 'Net margin seems unusually high' },
    { pattern: /revenue.*growth.*[6-9]0%/i, message: 'Revenue growth seems very aggressive' },
  ],
  // Topics the AI should NOT provide advice on
  restrictedTopics: [
    'tax advice',
    'legal advice',
    'specific investment recommendations',
    'personal financial advice',
  ],
};

export interface CFOAgentRequest {
  step: WizardStep;
  message: string;
  context: WizardContext;
  conversationHistory: CFOMessage[];
}

export interface CFOAgentResponse {
  message: string;
  suggestions?: string[];
  actions?: CFOAction[];
  warnings?: string[];
  dataExtracted?: Partial<Record<string, any>>;
  stepComplete?: boolean;  // Signal to auto-advance to next step
}

export interface CFOAction {
  type: 'add_team_member' | 'update_classification' | 'add_cost' | 'add_investment' | 'set_growth_rate' | 'flag_for_review';
  data: Record<string, any>;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Build context string for the AI based on current wizard state
 */
function buildContextString(context: WizardContext): string {
  const parts: string[] = [];

  // Business info
  parts.push(`Business: ${context.business_name || 'Unknown'}`);
  if (context.industry) parts.push(`Industry: ${context.industry}`);
  parts.push(`Fiscal Year: ${context.fiscal_year}`);

  // Goals
  if (context.goals) {
    if (context.goals.revenue_target) {
      parts.push(`Revenue Target: $${context.goals.revenue_target.toLocaleString()}`);
    }
    if (context.goals.profit_target) {
      parts.push(`Profit Target: $${context.goals.profit_target.toLocaleString()}`);
    }
    if (context.goals.key_objectives?.length) {
      parts.push(`Key Objectives:\n${context.goals.key_objectives.map(o => `  - ${o}`).join('\n')}`);
    }
  }

  // Xero Connection & Historical Data
  console.log('[CFO Agent] Context check:', {
    xero_connected: context.xero_connected,
    has_xero_data: context.historical_pl?.has_xero_data,
    has_prior_fy: !!context.historical_pl?.prior_fy,
    has_current_ytd: !!context.historical_pl?.current_ytd
  });

  if (context.xero_connected && context.historical_pl?.has_xero_data) {
    const pl = context.historical_pl;
    parts.push(`\n=== XERO HISTORICAL DATA ===`);

    // Prior FY (baseline year)
    if (pl.prior_fy) {
      const fy = pl.prior_fy;
      parts.push(`\n📊 PRIOR YEAR BASELINE (${fy.period_label})`);
      parts.push(`  Period: ${fy.start_month} to ${fy.end_month} (${fy.months_count} months)`);
      parts.push(`  Revenue: $${fy.total_revenue.toLocaleString()}`);
      parts.push(`  COGS: $${fy.total_cogs.toLocaleString()}`);
      parts.push(`  Gross Profit: $${fy.gross_profit.toLocaleString()} (${fy.gross_margin_percent.toFixed(1)}% margin)`);
      parts.push(`  Operating Expenses: $${fy.operating_expenses.toLocaleString()}`);
      parts.push(`  Net Profit: $${fy.net_profit.toLocaleString()} (${fy.net_margin_percent.toFixed(1)}% margin)`);

      if (fy.operating_expenses_by_category?.length) {
        parts.push(`\n  OpEx Breakdown:`);
        fy.operating_expenses_by_category.slice(0, 10).forEach(cat => {
          parts.push(`    - ${cat.account_name}: $${cat.total.toLocaleString()} ($${Math.round(cat.monthly_average).toLocaleString()}/mo)`);
        });
      }
    }

    // Current FY YTD with run rates
    if (pl.current_ytd) {
      const ytd = pl.current_ytd;
      parts.push(`\n📈 CURRENT YEAR TO DATE (${ytd.period_label})`);
      parts.push(`  Period: ${ytd.start_month} to ${ytd.end_month} (${ytd.months_count} months)`);
      parts.push(`  YTD Revenue: $${ytd.total_revenue.toLocaleString()}`);
      parts.push(`  YTD Operating Expenses: $${ytd.operating_expenses.toLocaleString()}`);
      parts.push(`  YTD Net Profit: $${ytd.net_profit.toLocaleString()}`);

      // Run rate projections
      parts.push(`\n  RUN RATE (annualized from YTD):`);
      parts.push(`    Projected Revenue: $${ytd.run_rate_revenue.toLocaleString()}`);
      parts.push(`    Projected OpEx: $${ytd.run_rate_opex.toLocaleString()}`);
      parts.push(`    Projected Net Profit: $${ytd.run_rate_net_profit.toLocaleString()}`);

      // Gap analysis vs prior year
      if (pl.prior_fy) {
        parts.push(`\n  GAP ANALYSIS (Run Rate vs Prior Year):`);
        const revGap = ytd.revenue_vs_prior_percent;
        const opexGap = ytd.opex_vs_prior_percent;
        parts.push(`    Revenue: ${revGap >= 0 ? '+' : ''}${revGap.toFixed(1)}% vs prior year`);
        parts.push(`    OpEx: ${opexGap >= 0 ? '+' : ''}${opexGap.toFixed(1)}% vs prior year`);
      }
    }

    // Forecast period info
    if (pl.forecast_period) {
      parts.push(`\n📅 FORECAST PERIOD:`);
      parts.push(`  ${pl.forecast_period.start_month} to ${pl.forecast_period.end_month} (${pl.forecast_period.months_remaining} months)`);
    }

    parts.push(`\n=== END XERO DATA ===\n`);
  } else if (context.xero_connected === false) {
    parts.push(`\nNote: Xero is not connected. Using manual input for financial data.`);
  }

  // Current team
  if (context.current_team?.length) {
    parts.push(`\nCurrent Team (${context.current_team.length} people):`);
    context.current_team.forEach(emp => {
      const salary = emp.annual_salary ? `$${emp.annual_salary.toLocaleString()}` : 'salary unknown';
      const role = emp.job_title || 'role unknown';
      parts.push(`  - ${emp.full_name}: ${role} (${salary})`);
    });
  }

  // Strategic initiatives
  console.log('[CFO Agent] Strategic initiatives:', context.strategic_initiatives?.length || 0);
  if (context.strategic_initiatives?.length) {
    parts.push(`\n=== STRATEGIC INITIATIVES (from Annual Plan) ===`);
    context.strategic_initiatives.forEach((init, index) => {
      parts.push(`\n${index + 1}. ${init.title}`);
      parts.push(`   Status: ${init.status || 'not_started'}`);
      if (init.description) parts.push(`   Description: ${init.description}`);
      if (init.category) parts.push(`   Category: ${init.category}`);
      if (init.priority) parts.push(`   Priority: ${init.priority}`);
      if (init.quarter_assigned) parts.push(`   Target Quarter: ${init.quarter_assigned}`);
    });
    parts.push(`\n=== END STRATEGIC INITIATIVES ===`);
  } else {
    parts.push(`\nNote: No strategic initiatives found in the annual plan.`);
  }

  // Session progress
  if (context.session) {
    const completedSteps = Object.entries(context.session.steps_completed || {})
      .filter(([_, data]) => data.completed)
      .map(([step]) => step);
    if (completedSteps.length) {
      parts.push(`\nCompleted Steps: ${completedSteps.join(', ')}`);
    }
    parts.push(`Years Selected: ${context.session.years_selected.join(', ')}`);
  }

  // Decisions made
  if (context.decisions_made?.length) {
    parts.push(`\nDecisions Made This Session: ${context.decisions_made.length}`);
    // Show last 3 decisions
    context.decisions_made.slice(-3).forEach(dec => {
      parts.push(`  - ${dec.decision_type}: ${JSON.stringify(dec.decision_data).substring(0, 100)}`);
    });
  }

  return parts.join('\n');
}

/**
 * Check response for any guardrail violations
 */
function checkGuardrails(response: string, context: WizardContext): string[] {
  const warnings: string[] = [];

  // Check for flag patterns
  GUARDRAILS.flagPatterns.forEach(({ pattern, message }) => {
    if (pattern.test(response)) {
      warnings.push(message);
    }
  });

  // Check for restricted topics
  GUARDRAILS.restrictedTopics.forEach(topic => {
    if (response.toLowerCase().includes(topic)) {
      warnings.push(`Response mentions restricted topic: ${topic}. Please consult a professional.`);
    }
  });

  return warnings;
}

/**
 * Extract structured data from AI response if applicable
 */
function extractData(response: string, step: WizardStep): Record<string, any> | undefined {
  // Try to find JSON in the response
  const jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]);
    } catch {
      // Ignore parse errors
    }
  }

  // Extract specific patterns based on step
  switch (step) {
    case 'team':
      // Try to extract salary amounts mentioned
      const salaryMatch = response.match(/\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g);
      if (salaryMatch) {
        return { mentioned_salaries: salaryMatch.map(s => parseFloat(s.replace(/[$,]/g, ''))) };
      }
      break;
    case 'costs':
      // Try to extract cost amounts
      const costMatch = response.match(/\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g);
      if (costMatch) {
        return { mentioned_costs: costMatch.map(c => parseFloat(c.replace(/[$,]/g, ''))) };
      }
      break;
    case 'projections':
      // Try to extract growth percentages
      const growthMatch = response.match(/(\d+(?:\.\d+)?)\s*%/g);
      if (growthMatch) {
        return { mentioned_growth_rates: growthMatch.map(g => parseFloat(g.replace('%', ''))) };
      }
      break;
  }

  return undefined;
}

/**
 * Generate suggested quick actions based on context
 */
function generateSuggestions(step: WizardStep, context: WizardContext): string[] {
  const suggestions: string[] = [];

  switch (step) {
    case 'setup':
      suggestions.push('Forecast Year 1 only (monthly detail)');
      suggestions.push('Forecast Years 1-2 (monthly + quarterly)');
      suggestions.push('Forecast all 3 years');
      break;
    case 'team':
      if (context.current_team?.length) {
        suggestions.push('Import all from Xero');
        suggestions.push('Classify as Revenue-generating');
        suggestions.push('Classify as Operations');
        suggestions.push('Add a planned hire');
      }
      break;
    case 'costs':
      suggestions.push('Add Technology costs');
      suggestions.push('Add Marketing costs');
      suggestions.push('Add Professional Services');
      suggestions.push('Keep same as last year');
      break;
    case 'investments':
      if (context.strategic_initiatives?.length) {
        suggestions.push(`Add investment for ${context.strategic_initiatives[0].title}`);
      }
      suggestions.push('Add CapEx investment');
      suggestions.push('Add OpEx investment');
      suggestions.push('No investments planned');
      break;
    case 'projections':
      suggestions.push('Conservative growth (10-15%)');
      suggestions.push('Moderate growth (20-30%)');
      suggestions.push('Aggressive growth (40%+)');
      break;
    case 'review':
      suggestions.push('Looks good, finalize');
      suggestions.push('Go back to Team');
      suggestions.push('Flag for coach review');
      break;
  }

  return suggestions;
}

/**
 * Main CFO Agent function
 */
export async function getCFOResponse(request: CFOAgentRequest): Promise<CFOAgentResponse> {
  const { step, message, context, conversationHistory } = request;

  // Build the system prompt
  const systemPrompt = STEP_PROMPTS[step];
  const contextString = buildContextString(context);

  // Format conversation history
  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    {
      role: 'system',
      content: `${systemPrompt}\n\n--- CURRENT CONTEXT ---\n${contextString}`,
    },
  ];

  // Add conversation history (limited to last 10 messages)
  const recentHistory = conversationHistory.slice(-10);
  recentHistory.forEach((msg) => {
    messages.push({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    });
  });

  // Add the new user message
  messages.push({
    role: 'user',
    content: message,
  });

  try {
    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages,
      temperature: GUARDRAILS.temperature,
      max_tokens: GUARDRAILS.maxTokens,
    });

    const aiResponse = completion.choices[0]?.message?.content || '';

    if (!aiResponse) {
      throw new Error('No response from AI');
    }

    // Check for step completion marker
    const stepComplete = aiResponse.includes('[STEP_COMPLETE]');
    const cleanedResponse = aiResponse.replace(/\s*\[STEP_COMPLETE\]\s*/g, '').trim();

    // Check guardrails
    const warnings = checkGuardrails(cleanedResponse, context);

    // Extract any structured data
    const dataExtracted = extractData(cleanedResponse, step);

    // Generate suggestions (empty if step is complete)
    const suggestions = stepComplete ? [] : generateSuggestions(step, context);

    return {
      message: cleanedResponse,
      suggestions,
      warnings: warnings.length > 0 ? warnings : undefined,
      dataExtracted,
      stepComplete,
    };
  } catch (error) {
    console.error('[CFO Agent] Error:', error);
    throw error;
  }
}

/**
 * Get initial greeting for a step
 */
export function getStepGreeting(step: WizardStep, context: WizardContext): CFOMessage {
  const greetings: Record<WizardStep, () => string> = {
    setup: () => {
      const revenueTarget = context.goals?.revenue_target;
      return revenueTarget
        ? `Let's set up your ${context.fiscal_year} forecast. I can see your revenue target is $${revenueTarget.toLocaleString()}. How many years would you like to forecast - 1, 2, or 3?`
        : `Let's set up your ${context.fiscal_year} forecast. How many years would you like to forecast?`;
    },
    team: () => {
      const teamCount = context.current_team?.length || 0;
      return teamCount > 0
        ? `I found ${teamCount} team members from Xero. Let's classify them and plan any new hires. First, I'll need to understand each person's role.`
        : `Let's plan your team for the forecast period. Who's currently on your team?`;
    },
    costs: () => {
      if (context.xero_connected && context.historical_pl?.has_xero_data) {
        const pl = context.historical_pl;
        const priorFy = pl.prior_fy;
        const currentYtd = pl.current_ytd;

        // Build a comprehensive costs greeting with gap analysis
        let greeting = '';

        if (priorFy) {
          const priorOpex = `$${priorFy.operating_expenses.toLocaleString()}`;
          const topCategories = priorFy.operating_expenses_by_category?.slice(0, 3).map(c => c.account_name).join(', ') || '';
          greeting = `I can see from your Xero data that in ${priorFy.period_label}, you spent ${priorOpex} on operating costs. Your biggest categories were: ${topCategories}.`;
        }

        if (currentYtd && currentYtd.months_count > 0) {
          const ytdOpex = `$${currentYtd.operating_expenses.toLocaleString()}`;
          const runRateOpex = `$${currentYtd.run_rate_opex.toLocaleString()}`;
          greeting += `\n\nCurrent FY: You've spent ${ytdOpex} over ${currentYtd.months_count} months. At this run rate, you're tracking to ${runRateOpex} for the full year.`;

          if (priorFy) {
            const opexChange = currentYtd.opex_vs_prior_percent;
            const trend = opexChange >= 0 ? 'up' : 'down';
            greeting += ` That's ${Math.abs(opexChange).toFixed(1)}% ${trend} from prior year.`;
          }
        }

        greeting += `\n\nWould you like to use the prior year as a baseline and apply a percentage adjustment, or adjust specific categories?`;

        return greeting || `Now let's look at your operating costs based on your Xero data.`;
      }
      return `Now let's look at your operating costs. We'll go through each category - technology, marketing, professional services, and so on. What's your biggest cost category?`;
    },
    investments: () => {
      const initiatives = context.strategic_initiatives || [];
      if (initiatives.length > 0) {
        const initList = initiatives.map((init, i) => `${i + 1}. ${init.title}`).join('\n');
        return `I can see ${initiatives.length} strategic initiatives from your annual plan:\n\n${initList}\n\nLet's plan any investments needed to achieve these. Should we go through each one, or are there specific initiatives that require investment?`;
      }
      return `Are there any major investments planned for the forecast period? This could include technology upgrades, marketing campaigns, equipment, or training programs.`;
    },
    projections: () => {
      const years = context.session?.years_selected || [1];
      const yearCount = Math.max(...years);
      return yearCount > 1
        ? `Now let's project Years 2${yearCount > 2 ? ' and 3' : ''}. What growth rate do you expect for revenue?`
        : `You've chosen a 1-year forecast, so we'll skip multi-year projections. Let's move to review.`;
    },
    review: () => `Let's review your forecast. I'll check for any concerns and summarize the key numbers. Give me a moment to analyze everything.`,
  };

  return {
    id: `greeting-${step}`,
    role: 'cfo',
    content: greetings[step](),
    timestamp: new Date().toISOString(),
    step,
  };
}

/**
 * Validate forecast data and return concerns
 */
export interface ValidationConcern {
  severity: 'error' | 'warning' | 'info';
  category: string;
  message: string;
  suggestion?: string;
}

export async function validateForecast(context: WizardContext): Promise<ValidationConcern[]> {
  const concerns: ValidationConcern[] = [];

  // Check revenue target
  if (!context.goals?.revenue_target) {
    concerns.push({
      severity: 'error',
      category: 'Goals',
      message: 'No revenue target set',
      suggestion: 'Set a revenue target in Goals & Targets',
    });
  }

  // Check team costs vs revenue
  const teamTotal = context.current_team?.reduce((sum, emp) => sum + (emp.annual_salary || 0), 0) || 0;
  const revenueTarget = context.goals?.revenue_target || 0;
  const teamCostRatio = revenueTarget > 0 ? (teamTotal / revenueTarget) * 100 : 0;

  if (teamCostRatio > 60) {
    concerns.push({
      severity: 'warning',
      category: 'Team Costs',
      message: `Team costs are ${teamCostRatio.toFixed(1)}% of revenue target`,
      suggestion: 'Consider if revenue target is achievable with current team investment',
    });
  }

  // Check for missing classifications
  const unclassified = context.current_team?.filter(emp => !emp.classification) || [];
  if (unclassified.length > 0) {
    concerns.push({
      severity: 'warning',
      category: 'Team',
      message: `${unclassified.length} team member(s) without classification`,
      suggestion: 'Classify all team members for accurate cost categorization',
    });
  }

  // Check strategic initiatives without investments
  const initiativesWithoutInvestments = context.strategic_initiatives?.filter(init => {
    const hasInvestment = context.decisions_made?.some(
      d => d.decision_type === 'investment' && d.linked_initiative_id === init.id
    );
    return !hasInvestment;
  }) || [];

  if (initiativesWithoutInvestments.length > 0) {
    concerns.push({
      severity: 'info',
      category: 'Investments',
      message: `${initiativesWithoutInvestments.length} strategic initiative(s) have no planned investments`,
      suggestion: 'Consider if investments are needed to achieve these initiatives',
    });
  }

  return concerns;
}

/**
 * Generate a forecast summary
 */
export interface ForecastSummary {
  revenue: {
    year1: number;
    year2?: number;
    year3?: number;
  };
  costs: {
    team: number;
    operations: number;
    investments: number;
    total: number;
  };
  profit: {
    gross: number;
    net: number;
    margin: number;
  };
  headcount: {
    current: number;
    planned: number;
    endOfYear: number;
  };
  keyDecisions: string[];
}

export function generateForecastSummary(context: WizardContext): ForecastSummary {
  const revenueTarget = context.goals?.revenue_target || 0;
  const teamCosts = context.current_team?.reduce((sum, emp) => sum + (emp.annual_salary || 0) * 1.12, 0) || 0; // Include super

  // Calculate from decisions
  const investmentDecisions = context.decisions_made?.filter(d => d.decision_type === 'investment') || [];
  const investmentTotal = investmentDecisions.reduce((sum, d) => {
    const amount = d.decision_data?.amount;
    return sum + (typeof amount === 'number' ? amount : 0);
  }, 0);

  const hireDecisions = context.decisions_made?.filter(d => d.decision_type === 'new_hire') || [];
  const plannedHires = hireDecisions.length;

  // Estimate operations costs (simplified - would come from actual cost data)
  const operationsCosts = revenueTarget * 0.15; // Estimate 15% of revenue

  const totalCosts = teamCosts + operationsCosts + investmentTotal;
  const grossProfit = revenueTarget - (revenueTarget * 0.3); // Estimate 30% COGS
  const netProfit = grossProfit - totalCosts;
  const netMargin = revenueTarget > 0 ? (netProfit / revenueTarget) * 100 : 0;

  return {
    revenue: {
      year1: revenueTarget,
    },
    costs: {
      team: teamCosts,
      operations: operationsCosts,
      investments: investmentTotal,
      total: totalCosts,
    },
    profit: {
      gross: grossProfit,
      net: netProfit,
      margin: netMargin,
    },
    headcount: {
      current: context.current_team?.length || 0,
      planned: plannedHires,
      endOfYear: (context.current_team?.length || 0) + plannedHires,
    },
    keyDecisions: context.decisions_made?.slice(-5).map(d =>
      `${d.decision_type}: ${JSON.stringify(d.decision_data).substring(0, 50)}`
    ) || [],
  };
}
