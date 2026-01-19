import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { aiAdvisor } from '@/lib/ai/advisor';

export const dynamic = 'force-dynamic';

interface CFOSuggestionRequest {
  step: 'goals' | 'baseline' | 'team' | 'investments' | 'review';
  businessId: string;
  state: {
    targets?: {
      revenue: number;
      netProfit: number;
      netProfitPercent: number;
    };
    baseline?: {
      priorRevenue: number;
      cogsPercent: number;
      priorOpEx: number;
    };
    team?: {
      memberCount: number;
      totalCost: number;
      newHireCount: number;
    };
    investments?: Array<{
      name: string;
      amount: number;
    }>;
    calculations?: {
      budgetUsedPercent: number;
      budgetRemaining: number;
      isOnTrack: boolean;
      projectedProfit: number;
    };
  };
}

// Step-specific CFO tips
const CFO_TIPS: Record<string, string[]> = {
  goals: [
    "A 12-15% net profit target is healthy for most SMBs. Above 15% is excellent.",
    "Your revenue target should be challenging but achievable - typically 10-20% growth YoY.",
    "Remember: Revenue - Profit = Your total expense budget. Protect your profit first!",
  ],
  baseline: [
    "If your COGS % has been rising, now's the time to review supplier pricing.",
    "Operating expenses typically grow 3-5% annually due to inflation.",
    "Look for inefficiencies in last year's OpEx before forecasting forward.",
  ],
  team: [
    "Team costs often make up 40-60% of total expenses in service businesses.",
    "Plan new hires strategically - revenue should come before headcount.",
    "Don't forget super (12%) when budgeting salaries.",
  ],
  investments: [
    "Strategic investments should have a clear ROI timeline.",
    "Balance growth investments with maintaining healthy margins.",
    "Consider timing - spreading investments across quarters helps cash flow.",
  ],
  review: [
    "A good forecast is realistic, not optimistic. Can you defend every number?",
    "Review monthly to track variance and adjust as needed.",
    "Share this with your team - alignment drives results.",
  ],
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerClient();

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: CFOSuggestionRequest = await request.json();
    const { step, businessId, state } = body;

    // Get business context
    let industry = 'other';
    if (businessId) {
      const { data: business } = await supabase
        .from('businesses')
        .select('industry')
        .eq('id', businessId)
        .single();

      if (business?.industry) {
        industry = business.industry;
      }
    }

    // Build response based on step
    const suggestions: {
      tip: string;
      insight?: string;
      warning?: string;
    } = {
      tip: CFO_TIPS[step]?.[Math.floor(Math.random() * CFO_TIPS[step].length)] || '',
    };

    // Add contextual insights based on state
    if (step === 'goals' && state.targets) {
      const { netProfitPercent } = state.targets;
      if (netProfitPercent < 10) {
        suggestions.warning = `Your ${netProfitPercent}% profit target is below typical industry benchmarks. Consider if you can push this higher.`;
      } else if (netProfitPercent > 20) {
        suggestions.insight = `Excellent profit target! At ${netProfitPercent}%, you're aiming for above-average margins.`;
      }
    }

    if (step === 'baseline' && state.baseline) {
      const { cogsPercent } = state.baseline;
      if (cogsPercent > 50) {
        suggestions.warning = `Your COGS at ${cogsPercent}% is higher than typical. Are there opportunities to improve gross margin?`;
      }
    }

    if (step === 'team' && state.team && state.calculations) {
      const teamCostAsPercentOfBudget = state.calculations.budgetUsedPercent;
      if (teamCostAsPercentOfBudget > 70) {
        suggestions.warning = `Team costs are using ${teamCostAsPercentOfBudget.toFixed(0)}% of your expense budget. This leaves little room for other costs.`;
      }
    }

    if (step === 'review' && state.calculations) {
      const { isOnTrack, budgetRemaining, projectedProfit, budgetUsedPercent } = state.calculations;

      if (isOnTrack) {
        suggestions.insight = `Great work! You're projecting $${projectedProfit.toLocaleString()} profit with $${budgetRemaining.toLocaleString()} buffer.`;
      } else {
        suggestions.warning = `You're over budget by $${Math.abs(budgetRemaining).toLocaleString()}. Review your costs to hit your profit target.`;
      }

      // Use AI advisor for full validation
      if (state.targets && state.baseline) {
        const validation = await aiAdvisor.validateForecast(
          {
            revenue: state.targets.revenue,
            grossProfit: state.targets.revenue * (1 - (state.baseline.cogsPercent / 100)),
            netProfit: projectedProfit,
            teamCosts: state.team?.totalCost || 0,
            opexCosts: state.baseline.priorOpEx * 1.05,
          },
          {
            businessId,
            userId: user.id,
            industry,
          }
        );

        if (validation.caveats && validation.caveats.length > 0) {
          suggestions.warning = validation.caveats[0];
        }
      }
    }

    return NextResponse.json({
      success: true,
      suggestions,
    });
  } catch (error) {
    console.error('CFO Suggestions error:', error);
    return NextResponse.json(
      { error: 'Failed to get suggestions' },
      { status: 500 }
    );
  }
}
