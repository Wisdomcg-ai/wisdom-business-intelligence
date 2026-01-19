'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, Sparkles, Loader2, TrendingUp, Users, DollarSign, Target, BarChart3, Settings, PiggyBank, CheckCircle } from 'lucide-react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { WizardStep, ForecastWizardState, formatCurrency } from '../types';

// Generate a unique session ID for grouping conversation messages
const generateSessionId = () => crypto.randomUUID();

// Quick action configuration - these trigger rich, context-aware analysis
interface QuickAction {
  label: string;
  icon: string; // emoji for simplicity
  promptBuilder: (state: ForecastWizardState, fiscalYear: number, activeYear: 1 | 2 | 3) => string;
}

// Step configuration with icons and context
const STEP_CONFIG: Record<WizardStep, {
  title: string;
  icon: React.ReactNode;
  quickActions: QuickAction[];
  quickQuestions: string[];
  contextBuilder: (state: ForecastWizardState, fiscalYear: number, activeYear: 1 | 2 | 3) => string;
}> = {
  1: {
    title: 'Goals',
    icon: <Target className="w-4 h-4" />,
    quickActions: [
      {
        label: 'Validate Goals',
        icon: '🎯',
        promptBuilder: (state, fiscalYear, activeYear) => {
          const goals = state.goals;
          const prior = state.priorYear;
          const revenueGrowth = prior && goals.year1?.revenue
            ? ((goals.year1.revenue - prior.revenue.total) / prior.revenue.total * 100).toFixed(1)
            : 'N/A';

          return `Please analyze my financial goals and tell me if they're realistic:

**My Goals for FY${(fiscalYear + activeYear - 1).toString().slice(-2)}:**
- Revenue Target: ${formatCurrency(goals.year1?.revenue || 0)}
- Gross Profit Target: ${goals.year1?.grossProfitPct || 0}%
- Net Profit Target: ${goals.year1?.netProfitPct || 0}%

**Prior Year Performance (FY${(fiscalYear - 1).toString().slice(-2)}):**
${prior ? `- Revenue: ${formatCurrency(prior.revenue.total)}
- Gross Profit: ${prior.grossProfit.percent.toFixed(1)}%
- Implied revenue growth: ${revenueGrowth}%` : '- No prior year data loaded'}

What observations do you have about these targets? Are there any red flags or questions I should consider?`;
        },
      },
      {
        label: 'Industry Comparison',
        icon: '📊',
        promptBuilder: (state, fiscalYear) => {
          const goals = state.goals;
          return `How do my financial targets compare to typical small business benchmarks?

**My Targets:**
- Gross Profit: ${goals.year1?.grossProfitPct || 0}%
- Net Profit: ${goals.year1?.netProfitPct || 0}%

What gross profit and net profit margins are typical for small businesses? What factors affect these benchmarks?`;
        },
      },
    ],
    quickQuestions: [
      'Is my revenue target realistic?',
      'What profit margin should I aim for?',
      'How does this compare to industry benchmarks?',
    ],
    contextBuilder: (state, fiscalYear, activeYear) => {
      const goals = state.goals;
      return `
**Step 1: Goals**
User is setting financial targets for the forecast.

Current Goals:
- Revenue Target: ${formatCurrency(goals.year1?.revenue || 0)}
- Gross Profit Target: ${goals.year1?.grossProfitPct || 0}%
- Net Profit Target: ${goals.year1?.netProfitPct || 0}%

Prior Year Data:
${state.priorYear ? `- Revenue: ${formatCurrency(state.priorYear.revenue.total)}
- Gross Profit: ${state.priorYear.grossProfit.percent.toFixed(1)}%` : '- No prior year data loaded yet'}
`;
    },
  },
  2: {
    title: 'Prior Year',
    icon: <BarChart3 className="w-4 h-4" />,
    quickActions: [
      {
        label: 'Analyze Trends',
        icon: '📈',
        promptBuilder: (state, fiscalYear) => {
          const prior = state.priorYear;
          if (!prior) return 'No prior year data loaded yet. Please load your data from Xero or CSV first.';

          const topRevenue = prior.revenue.byLine
            .sort((a, b) => b.total - a.total)
            .slice(0, 5)
            .map(l => `- ${l.name}: ${formatCurrency(l.total)}`)
            .join('\n');

          return `Please analyze my prior year financial data and identify key trends:

**FY${(fiscalYear - 1).toString().slice(-2)} Summary:**
- Total Revenue: ${formatCurrency(prior.revenue.total)}
- COGS: ${formatCurrency(prior.cogs.total)} (${prior.cogs.percentOfRevenue.toFixed(1)}%)
- Gross Profit: ${formatCurrency(prior.grossProfit.total)} (${prior.grossProfit.percent.toFixed(1)}%)
- Total OpEx: ${formatCurrency(prior.opex.total)}

**Top Revenue Streams:**
${topRevenue}

**Seasonality Pattern:** ${prior.seasonalityPattern ? 'Detected' : 'Not detected'}

What trends or patterns do you observe? What questions should I be asking about this data?`;
        },
      },
      {
        label: 'Seasonality Check',
        icon: '🗓️',
        promptBuilder: (state, fiscalYear) => {
          const prior = state.priorYear;
          if (!prior) return 'No prior year data loaded yet.';

          const monthlyRevenue = Object.entries(prior.revenue.byMonth)
            .map(([month, amount]) => `${month}: ${formatCurrency(amount)}`)
            .join('\n');

          return `Please analyze my revenue seasonality pattern:

**Monthly Revenue (FY${(fiscalYear - 1).toString().slice(-2)}):**
${monthlyRevenue}

Do you see any seasonality in this data? Which months are strongest/weakest? How should I factor this into my forecast?`;
        },
      },
    ],
    quickQuestions: [
      'What trends do you see in my data?',
      'Why might my margins have changed?',
      'What seasonality patterns exist?',
    ],
    contextBuilder: (state, fiscalYear) => {
      const prior = state.priorYear;
      if (!prior) return '**Step 2: Prior Year**\nNo prior year data loaded yet.';

      return `
**Step 2: Prior Year Analysis**
Reviewing historical financial data from FY${(fiscalYear - 1).toString().slice(-2)}.

Prior Year Summary:
- Total Revenue: ${formatCurrency(prior.revenue.total)}
- Total COGS: ${formatCurrency(prior.cogs.total)} (${prior.cogs.percentOfRevenue.toFixed(1)}% of revenue)
- Gross Profit: ${formatCurrency(prior.grossProfit.total)} (${prior.grossProfit.percent.toFixed(1)}%)
- Total OpEx: ${formatCurrency(prior.opex.total)}

Revenue Lines: ${prior.revenue.byLine.length} categories
OpEx Lines: ${prior.opex.byLine.length} expense categories
`;
    },
  },
  3: {
    title: 'Revenue & COGS',
    icon: <TrendingUp className="w-4 h-4" />,
    quickActions: [
      {
        label: 'Check Projections',
        icon: '🔍',
        promptBuilder: (state, fiscalYear, activeYear) => {
          const revenueTotal = state.revenueLines.reduce((sum, line) => {
            const monthlySum = Object.values(line.year1Monthly || {}).reduce((s, v) => s + (v || 0), 0);
            return sum + monthlySum;
          }, 0);

          const cogsTotal = state.cogsLines.reduce((sum, line) => {
            if (line.costBehavior === 'variable' && line.percentOfRevenue) {
              return sum + (revenueTotal * line.percentOfRevenue / 100);
            }
            return sum + (line.monthlyAmount || 0) * 12;
          }, 0);

          const grossProfit = revenueTotal - cogsTotal;
          const grossProfitPct = revenueTotal > 0 ? (grossProfit / revenueTotal * 100).toFixed(1) : '0';

          const revenueBreakdown = state.revenueLines
            .map(line => {
              const total = Object.values(line.year1Monthly || {}).reduce((s, v) => s + (v || 0), 0);
              return `- ${line.name}: ${formatCurrency(total)}`;
            })
            .join('\n');

          return `Please review my revenue and COGS projections for FY${(fiscalYear + activeYear - 1).toString().slice(-2)}:

**Revenue Projection:**
${revenueBreakdown}
**Total: ${formatCurrency(revenueTotal)}**

**COGS Projection:**
${state.cogsLines.map(line => `- ${line.name}: ${line.costBehavior === 'variable' ? `${line.percentOfRevenue}% of revenue` : `${formatCurrency((line.monthlyAmount || 0) * 12)}/yr`}`).join('\n')}
**Total COGS: ${formatCurrency(cogsTotal)}**

**Resulting Gross Profit: ${formatCurrency(grossProfit)} (${grossProfitPct}%)**

Does this gross margin look healthy? What questions should I be asking about these projections?`;
        },
      },
      {
        label: 'Margin Analysis',
        icon: '💰',
        promptBuilder: (state, fiscalYear, activeYear) => {
          const revenueTotal = state.revenueLines.reduce((sum, line) => {
            const monthlySum = Object.values(line.year1Monthly || {}).reduce((s, v) => s + (v || 0), 0);
            return sum + monthlySum;
          }, 0);

          const cogsTotal = state.cogsLines.reduce((sum, line) => {
            if (line.costBehavior === 'variable' && line.percentOfRevenue) {
              return sum + (revenueTotal * line.percentOfRevenue / 100);
            }
            return sum + (line.monthlyAmount || 0) * 12;
          }, 0);

          const currentGrossMargin = revenueTotal > 0 ? (1 - cogsTotal / revenueTotal) * 100 : 0;
          const targetGrossMargin = state.goals.year1?.grossProfitPct || 0;

          return `I want to understand my gross margin better:

**Current Projection:**
- Revenue: ${formatCurrency(revenueTotal)}
- COGS: ${formatCurrency(cogsTotal)}
- Gross Margin: ${currentGrossMargin.toFixed(1)}%

**Target Gross Margin:** ${targetGrossMargin}%
**Gap:** ${(targetGrossMargin - currentGrossMargin).toFixed(1)}%

${currentGrossMargin < targetGrossMargin
  ? `I need to improve my margin by ${(targetGrossMargin - currentGrossMargin).toFixed(1)} percentage points. What are the typical levers for improving gross margin?`
  : `My margin exceeds target. Is there anything I should watch out for?`}`;
        },
      },
    ],
    quickQuestions: [
      'Is my gross margin healthy?',
      'Should I use seasonal or straight-line?',
      'How can I improve my COGS %?',
    ],
    contextBuilder: (state, fiscalYear, activeYear) => {
      const revenueTotal = state.revenueLines.reduce((sum, line) => {
        const monthlySum = Object.values(line.year1Monthly || {}).reduce((s, v) => s + (v || 0), 0);
        return sum + monthlySum;
      }, 0);

      return `
**Step 3: Revenue & COGS Planning**
Planning Year: FY${(fiscalYear + activeYear - 1).toString().slice(-2)}

Revenue:
- Pattern: ${state.revenuePattern}
- Revenue Lines: ${state.revenueLines.length}
- Y1 Total Revenue: ${formatCurrency(revenueTotal)}

COGS:
- COGS Lines: ${state.cogsLines.length}
${state.cogsLines.map(line => `- ${line.name}: ${line.costBehavior === 'variable' ? `${line.percentOfRevenue}% of revenue` : formatCurrency((line.monthlyAmount || 0) * 12)}`).join('\n')}
`;
    },
  },
  4: {
    title: 'Team',
    icon: <Users className="w-4 h-4" />,
    quickActions: [
      {
        label: 'Review Team Costs',
        icon: '👥',
        promptBuilder: (state, fiscalYear, activeYear) => {
          const teamCosts = state.teamMembers.map(m => {
            const newSalary = m.currentSalary * (1 + m.increasePct / 100);
            const superAmt = m.type !== 'contractor' ? newSalary * 0.12 : 0;
            return { name: m.name, role: m.role, type: m.type, total: newSalary + superAmt };
          }).sort((a, b) => b.total - a.total);

          const totalTeamCost = teamCosts.reduce((sum, t) => sum + t.total, 0);
          const revenueTotal = state.revenueLines.reduce((sum, line) => {
            const monthlySum = Object.values(line.year1Monthly || {}).reduce((s, v) => s + (v || 0), 0);
            return sum + monthlySum;
          }, 0);

          const teamAsPercentOfRevenue = revenueTotal > 0 ? (totalTeamCost / revenueTotal * 100).toFixed(1) : '0';

          const teamBreakdown = teamCosts
            .slice(0, 10)
            .map(t => `- ${t.role} (${t.type}): ${formatCurrency(t.total)}`)
            .join('\n');

          return `Please review my team cost structure for FY${(fiscalYear + activeYear - 1).toString().slice(-2)}:

**Team Cost Summary:**
- Total Team Members: ${state.teamMembers.length}
- Total Team Cost (inc super): ${formatCurrency(totalTeamCost)}
- As % of Revenue: ${teamAsPercentOfRevenue}%

**By Employment Type:**
- Full-time: ${state.teamMembers.filter(m => m.type === 'full-time').length}
- Part-time: ${state.teamMembers.filter(m => m.type === 'part-time').length}
- Casual: ${state.teamMembers.filter(m => m.type === 'casual').length}
- Contractors: ${state.teamMembers.filter(m => m.type === 'contractor').length}

**Team Breakdown (highest cost first):**
${teamBreakdown}

**Planned Changes:**
- New Hires: ${state.newHires.length}
- Departures: ${state.departures.length}

Is my team cost as a percentage of revenue healthy? What observations do you have?`;
        },
      },
      {
        label: 'Hiring Plan',
        icon: '📋',
        promptBuilder: (state, fiscalYear, activeYear) => {
          const currentHeadcount = state.teamMembers.length;
          const plannedHires = state.newHires.length;
          const plannedDepartures = state.departures.length;
          const endHeadcount = currentHeadcount + plannedHires - plannedDepartures;

          const revenueTotal = state.revenueLines.reduce((sum, line) => {
            const monthlySum = Object.values(line.year1Monthly || {}).reduce((s, v) => s + (v || 0), 0);
            return sum + monthlySum;
          }, 0);

          const revenuePerHead = endHeadcount > 0 ? revenueTotal / endHeadcount : 0;

          const newHiresList = state.newHires
            .map(h => `- ${h.role} (${h.type}): ${formatCurrency(h.salary)}, starting ${h.startMonth}`)
            .join('\n') || '- No new hires planned';

          return `Please review my hiring plan for FY${(fiscalYear + activeYear - 1).toString().slice(-2)}:

**Headcount Changes:**
- Current Team: ${currentHeadcount}
- Planned Hires: +${plannedHires}
- Planned Departures: -${plannedDepartures}
- End of Year Headcount: ${endHeadcount}

**Planned New Hires:**
${newHiresList}

**Revenue Context:**
- Projected Revenue: ${formatCurrency(revenueTotal)}
- Revenue per Employee: ${formatCurrency(revenuePerHead)}

When should I be thinking about my next hire? What questions should I consider before hiring?`;
        },
      },
    ],
    quickQuestions: [
      'Is my team sized right for this revenue?',
      'What salary increase is reasonable?',
      'When should I hire next?',
    ],
    contextBuilder: (state, fiscalYear, activeYear) => {
      const totalTeamCost = state.teamMembers.reduce((sum, m) => {
        const newSalary = m.currentSalary * (1 + m.increasePct / 100);
        const superAmt = m.type !== 'contractor' ? newSalary * 0.12 : 0;
        return sum + newSalary + superAmt;
      }, 0);

      return `
**Step 4: Team Planning**
Planning Year: FY${(fiscalYear + activeYear - 1).toString().slice(-2)}

Current Team:
- Team Members: ${state.teamMembers.length}
- Total Team Cost (with super): ${formatCurrency(totalTeamCost)}

Breakdown by Type:
- Full-time: ${state.teamMembers.filter(m => m.type === 'full-time').length}
- Part-time: ${state.teamMembers.filter(m => m.type === 'part-time').length}
- Casual: ${state.teamMembers.filter(m => m.type === 'casual').length}
- Contractors: ${state.teamMembers.filter(m => m.type === 'contractor').length}

Planned Changes:
- New Hires: ${state.newHires.length}
- Departures: ${state.departures.length}
`;
    },
  },
  5: {
    title: 'Operating Expenses',
    icon: <DollarSign className="w-4 h-4" />,
    quickActions: [
      {
        label: 'Analyze Expenses',
        icon: '🔍',
        promptBuilder: (state, fiscalYear, activeYear) => {
          // Calculate year-specific totals
          const calculateLineAmount = (line: typeof state.opexLines[0], year: 1 | 2 | 3): number => {
            const revenueTotal = state.revenueLines.reduce((sum, l) => {
              const monthlySum = Object.values(l.year1Monthly || {}).reduce((s, v) => s + (v || 0), 0);
              return sum + monthlySum;
            }, 0);

            const y1Amount = (() => {
              switch (line.costBehavior) {
                case 'fixed': return (line.monthlyAmount || 0) * 12;
                case 'variable': return (revenueTotal * (line.percentOfRevenue || 0)) / 100;
                case 'seasonal': return line.seasonalTargetAmount || line.priorYearAnnual * (1 + (line.seasonalGrowthPct || 0) / 100);
                case 'adhoc': return line.expectedAnnualAmount || 0;
                default: return line.priorYearAnnual;
              }
            })();

            if (year === 1) return y1Amount;

            const defaultGrowth = state.defaultOpExIncreasePct || 3;
            const growthRate = line.annualIncreasePct ?? line.seasonalGrowthPct ?? defaultGrowth;

            if (year === 2) {
              const override = (line as any).y2Override;
              return override !== undefined ? override : y1Amount * (1 + growthRate / 100);
            }

            // Year 3 - use Y2 as base
            const y2Override = (line as any).y2Override;
            const y2Amount = y2Override !== undefined ? y2Override : y1Amount * (1 + growthRate / 100);
            const y3Override = (line as any).y3Override;
            return y3Override !== undefined ? y3Override : y2Amount * (1 + growthRate / 100);
          };

          const currentYearTotal = state.opexLines.reduce((sum, line) => sum + calculateLineAmount(line, activeYear), 0);
          const priorYearTotal = activeYear === 1
            ? state.opexLines.reduce((sum, line) => sum + line.priorYearAnnual, 0)
            : state.opexLines.reduce((sum, line) => sum + calculateLineAmount(line, (activeYear - 1) as 1 | 2), 0);

          // Get revenue for budget calculation
          const revenueTotal = state.revenueLines.reduce((sum, line) => {
            const monthlySum = Object.values(line.year1Monthly || {}).reduce((s, v) => s + (v || 0), 0);
            return sum + monthlySum;
          }, 0);

          // Calculate budget position
          const cogsTotal = state.cogsLines.reduce((sum, line) => {
            if (line.costBehavior === 'variable' && line.percentOfRevenue) {
              return sum + (revenueTotal * line.percentOfRevenue / 100);
            }
            return sum + (line.monthlyAmount || 0) * 12;
          }, 0);

          const teamCost = state.teamMembers.reduce((sum, m) => {
            const newSalary = m.currentSalary * (1 + m.increasePct / 100);
            const superAmt = m.type !== 'contractor' ? newSalary * 0.12 : 0;
            return sum + newSalary + superAmt;
          }, 0);

          const grossProfit = revenueTotal - cogsTotal;
          const targetNetProfit = state.goals.year1?.netProfitPct || 15;
          const targetProfitAmount = revenueTotal * (targetNetProfit / 100);
          const availableOpEx = grossProfit - teamCost - targetProfitAmount;
          const budgetVariance = availableOpEx - currentYearTotal;
          const isOverBudget = budgetVariance < 0;

          // Top expenses sorted by amount
          const topExpenses = state.opexLines
            .map(line => ({
              name: line.name,
              type: line.costBehavior,
              currentYear: calculateLineAmount(line, activeYear),
              priorYear: activeYear === 1 ? line.priorYearAnnual : calculateLineAmount(line, (activeYear - 1) as 1 | 2),
            }))
            .sort((a, b) => b.currentYear - a.currentYear)
            .slice(0, 10);

          const expenseList = topExpenses
            .map(e => {
              const change = e.priorYear > 0 ? ((e.currentYear - e.priorYear) / e.priorYear * 100).toFixed(1) : 'new';
              return `- ${e.name}: ${formatCurrency(e.currentYear)} (${e.type}, ${change}% vs prior)`;
            })
            .join('\n');

          const fyLabel = `FY${(fiscalYear + activeYear - 1).toString().slice(-2)}`;
          const priorFyLabel = activeYear === 1
            ? `FY${(fiscalYear - 1).toString().slice(-2)} Actual`
            : `FY${(fiscalYear + activeYear - 2).toString().slice(-2)}`;

          return `Please analyze my ${fyLabel} operating expenses:

**Year Context:**
- Planning Year: ${fyLabel} (Year ${activeYear} of forecast)
- Prior Year (${priorFyLabel}): ${formatCurrency(priorYearTotal)} total OpEx
- Current Year (${fyLabel}): ${formatCurrency(currentYearTotal)} total OpEx
- Year-over-year change: ${priorYearTotal > 0 ? ((currentYearTotal - priorYearTotal) / priorYearTotal * 100).toFixed(1) : 0}%

**Budget Position:**
- Revenue: ${formatCurrency(revenueTotal)}
- Target net profit: ${targetNetProfit}%
- Available OpEx budget: ${formatCurrency(availableOpEx)}
- Current OpEx total: ${formatCurrency(currentYearTotal)}
- ${isOverBudget ? `⚠️ OVER BUDGET by ${formatCurrency(Math.abs(budgetVariance))}` : `✓ Under budget by ${formatCurrency(budgetVariance)}`}

**Top Expenses:**
${expenseList}

${isOverBudget
  ? `I need to reduce costs by ${formatCurrency(Math.abs(budgetVariance))} to hit my ${targetNetProfit}% profit target. Which expenses should I prioritize reviewing?`
  : `I'm within budget. Are there any optimization opportunities or expenses that seem unusual?`}`;
        },
      },
      {
        label: 'Find Savings',
        icon: '💡',
        promptBuilder: (state, fiscalYear, activeYear) => {
          // Find expenses with high growth rates or large amounts
          const defaultGrowth = state.defaultOpExIncreasePct || 3;

          const expensesWithGrowth = state.opexLines
            .filter(l => l.costBehavior !== 'variable')
            .map(line => {
              const y1Amount = line.costBehavior === 'fixed'
                ? (line.monthlyAmount || 0) * 12
                : line.costBehavior === 'adhoc'
                  ? line.expectedAnnualAmount || 0
                  : line.priorYearAnnual * (1 + (line.seasonalGrowthPct || 0) / 100);

              const growthRate = line.annualIncreasePct ?? line.seasonalGrowthPct ?? defaultGrowth;
              const priorYear = line.priorYearAnnual;
              const changeFromPrior = priorYear > 0 ? ((y1Amount - priorYear) / priorYear * 100) : 0;

              return {
                name: line.name,
                type: line.costBehavior,
                amount: y1Amount,
                priorYear,
                changeFromPrior,
                growthRate,
              };
            })
            .filter(e => e.amount > 0)
            .sort((a, b) => b.amount - a.amount);

          const totalOpEx = expensesWithGrowth.reduce((sum, e) => sum + e.amount, 0);

          const largeExpenses = expensesWithGrowth
            .slice(0, 8)
            .map(e => `- ${e.name}: ${formatCurrency(e.amount)} (${e.changeFromPrior > 0 ? '+' : ''}${e.changeFromPrior.toFixed(1)}% vs prior)`)
            .join('\n');

          return `I'm looking for ways to reduce my operating expenses. Here are my largest costs:

**Total OpEx:** ${formatCurrency(totalOpEx)}

**Largest Expenses:**
${largeExpenses}

What questions should I be asking about these expenses? Are there common areas where small businesses find savings?`;
        },
      },
    ],
    quickQuestions: [
      'Which costs should I cut first?',
      'How can I reduce fixed costs?',
      'Are my expenses reasonable for my size?',
    ],
    contextBuilder: (state, fiscalYear, activeYear) => {
      const opexTotal = state.opexLines.reduce((sum, line) => {
        if (line.costBehavior === 'fixed') return sum + (line.monthlyAmount || 0) * 12;
        if (line.costBehavior === 'adhoc') return sum + (line.expectedAnnualAmount || 0);
        return sum + line.priorYearAnnual;
      }, 0);

      const byBehavior = {
        fixed: state.opexLines.filter(l => l.costBehavior === 'fixed').length,
        variable: state.opexLines.filter(l => l.costBehavior === 'variable').length,
        seasonal: state.opexLines.filter(l => l.costBehavior === 'seasonal').length,
        adhoc: state.opexLines.filter(l => l.costBehavior === 'adhoc').length,
      };

      return `
**Step 5: Operating Expenses**
Planning Year: FY${(fiscalYear + activeYear - 1).toString().slice(-2)}
Active Year: Year ${activeYear} of forecast

OpEx Summary:
- Total Expense Lines: ${state.opexLines.length}
- Estimated Annual Total: ${formatCurrency(opexTotal)}
- Default Annual Increase: ${state.defaultOpExIncreasePct || 3}%

By Cost Behavior:
- Fixed: ${byBehavior.fixed} lines
- Variable: ${byBehavior.variable} lines
- Seasonal: ${byBehavior.seasonal} lines
- Ad-hoc: ${byBehavior.adhoc} lines

Top 5 Expenses:
${state.opexLines
  .sort((a, b) => b.priorYearAnnual - a.priorYearAnnual)
  .slice(0, 5)
  .map(l => `- ${l.name}: ${formatCurrency(l.priorYearAnnual)} (${l.costBehavior})`)
  .join('\n')}
`;
    },
  },
  6: {
    title: 'Subscriptions',
    icon: <Settings className="w-4 h-4" />,
    quickActions: [
      {
        label: 'Audit Subscriptions',
        icon: '🔎',
        promptBuilder: (state, fiscalYear, activeYear) => {
          const subscriptions = state.opexLines.filter(l => l.isSubscription);
          const totalSubs = subscriptions.reduce((sum, l) => sum + (l.monthlyAmount || 0) * 12, 0);

          const subList = subscriptions
            .sort((a, b) => (b.monthlyAmount || 0) - (a.monthlyAmount || 0))
            .map(l => `- ${l.name}: ${formatCurrency((l.monthlyAmount || 0) * 12)}/yr (${formatCurrency(l.monthlyAmount || 0)}/mo)`)
            .join('\n') || '- No subscriptions tagged yet';

          return `Please help me audit my software subscriptions:

**Total Annual Subscription Spend:** ${formatCurrency(totalSubs)}

**Current Subscriptions:**
${subList}

Are there any potential duplicates or overlapping tools? What questions should I be asking about each subscription? Are there any categories of tools that small businesses often overspend on?`;
        },
      },
      {
        label: 'Find Alternatives',
        icon: '💡',
        promptBuilder: (state) => {
          const subscriptions = state.opexLines.filter(l => l.isSubscription);
          const totalSubs = subscriptions.reduce((sum, l) => sum + (l.monthlyAmount || 0) * 12, 0);

          const topSubs = subscriptions
            .sort((a, b) => (b.monthlyAmount || 0) - (a.monthlyAmount || 0))
            .slice(0, 5)
            .map(l => `- ${l.name}: ${formatCurrency((l.monthlyAmount || 0) * 12)}/yr`)
            .join('\n');

          return `I'm spending ${formatCurrency(totalSubs)}/year on subscriptions. Here are my largest:

${topSubs}

What questions should I ask myself when evaluating whether each subscription is worth it? What are some signs that a subscription might be redundant or underutilized?`;
        },
      },
    ],
    quickQuestions: [
      'Do I have any duplicate tools?',
      'Which subscriptions can I consolidate?',
      'Are there cheaper alternatives?',
    ],
    contextBuilder: (state, fiscalYear, activeYear) => {
      const subscriptions = state.opexLines.filter(l => l.isSubscription);
      const totalSubs = subscriptions.reduce((sum, l) => sum + (l.monthlyAmount || 0) * 12, 0);

      return `
**Step 6: Subscriptions Audit**
Planning Year: FY${(fiscalYear + activeYear - 1).toString().slice(-2)}

Subscription Summary:
- Total Subscriptions: ${subscriptions.length}
- Annual Subscription Spend: ${formatCurrency(totalSubs)}

Subscriptions:
${subscriptions.length > 0
  ? subscriptions.map(l => `- ${l.name}: ${formatCurrency((l.monthlyAmount || 0) * 12)}/yr`).join('\n')
  : '- No subscriptions tagged yet'}
`;
    },
  },
  7: {
    title: 'CapEx',
    icon: <PiggyBank className="w-4 h-4" />,
    quickActions: [
      {
        label: 'Review Investments',
        icon: '💼',
        promptBuilder: (state, fiscalYear, activeYear) => {
          const totalCapEx = state.capexItems.reduce((sum, item) => sum + item.cost, 0);
          const totalDepreciation = state.capexItems.reduce((sum, item) => sum + item.annualDepreciation, 0);

          const itemList = state.capexItems
            .sort((a, b) => b.cost - a.cost)
            .map(i => `- ${i.description}: ${formatCurrency(i.cost)} (${i.usefulLifeYears}yr life, ${formatCurrency(i.annualDepreciation)}/yr depreciation)`)
            .join('\n') || '- No items planned';

          const revenueTotal = state.revenueLines.reduce((sum, line) => {
            const monthlySum = Object.values(line.year1Monthly || {}).reduce((s, v) => s + (v || 0), 0);
            return sum + monthlySum;
          }, 0);

          const capexAsPercent = revenueTotal > 0 ? (totalCapEx / revenueTotal * 100).toFixed(1) : '0';

          return `Please review my capital expenditure plan:

**CapEx Summary:**
- Total Investment: ${formatCurrency(totalCapEx)}
- As % of Revenue: ${capexAsPercent}%
- Annual Depreciation Impact: ${formatCurrency(totalDepreciation)}

**Planned Items:**
${itemList}

Are there any questions I should be asking about these investments? How do I evaluate whether each investment is worthwhile?`;
        },
      },
      {
        label: 'ROI Questions',
        icon: '📈',
        promptBuilder: (state) => {
          const topItems = state.capexItems
            .sort((a, b) => b.cost - a.cost)
            .slice(0, 3)
            .map(i => `- ${i.description}: ${formatCurrency(i.cost)}`)
            .join('\n') || '- No items planned';

          return `I'm planning some capital investments. Help me think through the ROI:

**Largest Planned Investments:**
${topItems}

What questions should I ask to evaluate the return on these investments? What's a reasonable payback period for capital equipment in a small business?`;
        },
      },
    ],
    quickQuestions: [
      'Should I lease or buy?',
      'Is this investment worth the ROI?',
      'How do I prioritize these investments?',
    ],
    contextBuilder: (state, fiscalYear, activeYear) => {
      const totalCapEx = state.capexItems.reduce((sum, item) => sum + item.cost, 0);
      const totalDepreciation = state.capexItems.reduce((sum, item) => sum + item.annualDepreciation, 0);

      return `
**Step 7: Capital Expenditure**
Planning Year: FY${(fiscalYear + activeYear - 1).toString().slice(-2)}

CapEx Summary:
- Total Items: ${state.capexItems.length}
- Total Investment: ${formatCurrency(totalCapEx)}
- Annual Depreciation: ${formatCurrency(totalDepreciation)}

Items:
${state.capexItems.length > 0
  ? state.capexItems.map(i => `- ${i.description}: ${formatCurrency(i.cost)} (${i.usefulLifeYears}yr useful life)`).join('\n')
  : '- No capital expenditure items added yet'}

Strategic Investments: ${state.investments.length}
`;
    },
  },
  8: {
    title: 'Final Review',
    icon: <CheckCircle className="w-4 h-4" />,
    quickActions: [
      {
        label: 'Full Review',
        icon: '📋',
        promptBuilder: (state, fiscalYear, activeYear) => {
          // Calculate key metrics
          const revenueTotal = state.revenueLines.reduce((sum, line) => {
            const monthlySum = Object.values(line.year1Monthly || {}).reduce((s, v) => s + (v || 0), 0);
            return sum + monthlySum;
          }, 0);

          const cogsTotal = state.cogsLines.reduce((sum, line) => {
            if (line.costBehavior === 'variable' && line.percentOfRevenue) {
              return sum + (revenueTotal * line.percentOfRevenue / 100);
            }
            return sum + (line.monthlyAmount || 0) * 12;
          }, 0);

          const teamCost = state.teamMembers.reduce((sum, m) => {
            const newSalary = m.currentSalary * (1 + m.increasePct / 100);
            const superAmt = m.type !== 'contractor' ? newSalary * 0.12 : 0;
            return sum + newSalary + superAmt;
          }, 0);

          const opexTotal = state.opexLines.reduce((sum, line) => {
            if (line.costBehavior === 'fixed') return sum + (line.monthlyAmount || 0) * 12;
            if (line.costBehavior === 'adhoc') return sum + (line.expectedAnnualAmount || 0);
            if (line.costBehavior === 'variable') return sum + (revenueTotal * (line.percentOfRevenue || 0) / 100);
            return sum + line.priorYearAnnual * (1 + (line.seasonalGrowthPct || 0) / 100);
          }, 0);

          const grossProfit = revenueTotal - cogsTotal;
          const netProfit = grossProfit - teamCost - opexTotal;
          const netProfitPct = revenueTotal > 0 ? (netProfit / revenueTotal * 100).toFixed(1) : '0';

          const targetNetProfit = state.goals.year1?.netProfitPct || 15;
          const profitGap = parseFloat(netProfitPct) - targetNetProfit;

          return `Please provide a comprehensive review of my FY${(fiscalYear + activeYear - 1).toString().slice(-2)} forecast:

**Summary:**
- Revenue: ${formatCurrency(revenueTotal)}
- COGS: ${formatCurrency(cogsTotal)} (${(cogsTotal / revenueTotal * 100).toFixed(1)}%)
- Gross Profit: ${formatCurrency(grossProfit)} (${(grossProfit / revenueTotal * 100).toFixed(1)}%)
- Team Costs: ${formatCurrency(teamCost)} (${(teamCost / revenueTotal * 100).toFixed(1)}%)
- OpEx: ${formatCurrency(opexTotal)} (${(opexTotal / revenueTotal * 100).toFixed(1)}%)
- **Net Profit: ${formatCurrency(netProfit)} (${netProfitPct}%)**

**Target Net Profit:** ${targetNetProfit}%
**Gap:** ${profitGap >= 0 ? `✓ Exceeds target by ${profitGap.toFixed(1)}pp` : `⚠️ Below target by ${Math.abs(profitGap).toFixed(1)}pp`}

**Data Coverage:**
- Revenue Lines: ${state.revenueLines.length}
- COGS Lines: ${state.cogsLines.length}
- Team Members: ${state.teamMembers.length}
- OpEx Lines: ${state.opexLines.length}
- CapEx Items: ${state.capexItems.length}

What observations do you have about this forecast? What are the key risks or assumptions I should be monitoring?`;
        },
      },
      {
        label: 'Risk Check',
        icon: '⚠️',
        promptBuilder: (state, fiscalYear, activeYear) => {
          const revenueTotal = state.revenueLines.reduce((sum, line) => {
            const monthlySum = Object.values(line.year1Monthly || {}).reduce((s, v) => s + (v || 0), 0);
            return sum + monthlySum;
          }, 0);

          const priorRevenue = state.priorYear?.revenue.total || 0;
          const revenueGrowth = priorRevenue > 0 ? ((revenueTotal - priorRevenue) / priorRevenue * 100).toFixed(1) : 'N/A';

          const teamCost = state.teamMembers.reduce((sum, m) => {
            const newSalary = m.currentSalary * (1 + m.increasePct / 100);
            const superAmt = m.type !== 'contractor' ? newSalary * 0.12 : 0;
            return sum + newSalary + superAmt;
          }, 0);

          const teamAsPercent = revenueTotal > 0 ? (teamCost / revenueTotal * 100).toFixed(1) : '0';

          return `Help me identify risks in my forecast:

**Key Assumptions:**
- Revenue Growth: ${revenueGrowth}%
- Team Cost as % of Revenue: ${teamAsPercent}%
- New Hires Planned: ${state.newHires.length}
- Revenue Lines: ${state.revenueLines.length}

**Concentration Risks:**
- Single largest revenue stream: ${state.revenueLines[0]?.name || 'N/A'}

What are the biggest risks in this forecast? What assumptions should I stress test? What could go wrong that would significantly impact my profit?`;
        },
      },
    ],
    quickQuestions: [
      'What are the biggest risks?',
      'Am I on track for my profit target?',
      'What should I monitor closely?',
    ],
    contextBuilder: (state, fiscalYear, activeYear) => {
      return `
**Step 8: Final Review**
Forecast Duration: ${state.forecastDuration} year(s)

Goals Summary:
- Y1 Revenue Target: ${formatCurrency(state.goals.year1?.revenue || 0)}
- Y1 Net Profit Target: ${state.goals.year1?.netProfitPct || 0}%

Data Completeness:
- Prior Year Data: ${state.priorYear ? '✓ Loaded' : '✗ Missing'}
- Revenue Lines: ${state.revenueLines.length}
- COGS Lines: ${state.cogsLines.length}
- Team Members: ${state.teamMembers.length}
- OpEx Lines: ${state.opexLines.length}
- CapEx Items: ${state.capexItems.length}
`;
    },
  },
};

interface AICFOPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  currentStep: WizardStep;
  activeYear: 1 | 2 | 3;
  fiscalYear: number;
  state: ForecastWizardState;
  businessId: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  quickActionUsed?: string;
}

// Storage key for session persistence
const getStorageKey = (businessId: string) => `ai-cfo-session-${businessId}`;

export function AICFOPanel({
  isOpen,
  onToggle,
  currentStep,
  activeYear,
  fiscalYear,
  state,
  businessId,
}: AICFOPanelProps) {
  const supabase = createClientComponentClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string>('');
  const [currentQuickAction, setCurrentQuickAction] = useState<string | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const stepConfig = STEP_CONFIG[currentStep];
  const fyLabel = `FY${(fiscalYear + activeYear - 1).toString().slice(-2)}`;

  // Initialize or restore session on mount
  useEffect(() => {
    const storageKey = getStorageKey(businessId);
    const stored = localStorage.getItem(storageKey);

    if (stored) {
      try {
        const { sessionId: storedSessionId, messages: storedMessages } = JSON.parse(stored);
        setSessionId(storedSessionId);
        setMessages(storedMessages.map((m: Message) => ({
          ...m,
          timestamp: new Date(m.timestamp)
        })));
        if (storedMessages.length > 0) {
          setHasInteracted(true);
        }
      } catch {
        // Invalid stored data, start fresh
        const newSessionId = generateSessionId();
        setSessionId(newSessionId);
      }
    } else {
      const newSessionId = generateSessionId();
      setSessionId(newSessionId);
    }
  }, [businessId]);

  // Persist messages to localStorage when they change
  useEffect(() => {
    if (sessionId && messages.length > 0) {
      const storageKey = getStorageKey(businessId);
      localStorage.setItem(storageKey, JSON.stringify({ sessionId, messages }));
    }
  }, [sessionId, messages, businessId]);

  // Save conversation to Supabase for analytics
  const saveConversation = useCallback(async (
    userMessage: string,
    aiResponse: string,
    quickActionUsed: string | null,
    responseTimeMs: number
  ) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from('ai_cfo_conversations').insert({
        business_id: businessId,
        user_id: user.id,
        session_id: sessionId,
        wizard_step: currentStep,
        active_year: activeYear,
        fiscal_year: fiscalYear,
        user_message: userMessage,
        ai_response: aiResponse,
        quick_action_used: quickActionUsed,
        response_time_ms: responseTimeMs,
      });
    } catch (error) {
      console.error('Failed to save conversation:', error);
      // Don't block the UI if saving fails
    }
  }, [supabase, businessId, sessionId, currentStep, activeYear, fiscalYear]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  // Build context for AI
  const buildContext = useCallback(() => {
    return stepConfig.contextBuilder(state, fiscalYear, activeYear);
  }, [stepConfig, state, fiscalYear, activeYear]);

  // Handle quick action click
  const handleQuickAction = async (action: QuickAction) => {
    setCurrentQuickAction(action.label);
    const prompt = action.promptBuilder(state, fiscalYear, activeYear);
    await handleSend(prompt, action.label);
    setCurrentQuickAction(null);
  };

  // Send message to AI
  const handleSend = async (messageText?: string, quickActionLabel?: string) => {
    const text = messageText || input.trim();
    if (!text || isLoading) return;

    setHasInteracted(true);
    const startTime = Date.now();

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date(),
      quickActionUsed: quickActionLabel,
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const context = buildContext();

      const systemPrompt = `You are AI CFO, an expert financial advisor helping a small business owner build their financial forecast. You follow the Profit First methodology - focusing on observations and thought-provoking questions rather than direct advice.

IMPORTANT GUIDELINES:
1. Be concise and practical - these are busy business owners
2. Focus on observations and raise questions, don't give direct financial advice
3. Use Australian business context (12% superannuation, AUD currency, July-June financial year)
4. When discussing costs, think about what's reasonable for a small business
5. Reference specific numbers from their data when relevant
6. Ask clarifying questions if you need more information

CURRENT CONTEXT:
${context}

Remember: Help them think through decisions, don't make decisions for them.`;

      const response = await fetch('/api/ai/forecast-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          systemPrompt,
          context: {
            step: currentStep,
            activeYear,
            fiscalYear: fyLabel,
            businessId,
          },
          history: messages.slice(-10).map(m => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) throw new Error('Failed to get response');

      const data = await response.json();
      const responseTimeMs = Date.now() - startTime;

      const assistantMessage: Message = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: data.message || "I'm here to help you with your forecast. What would you like to explore?",
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Save to Supabase for analytics (async, don't block UI)
      saveConversation(text, assistantMessage.content, quickActionLabel || null, responseTimeMs);
    } catch (error) {
      console.error('AI CFO error:', error);
      const errorMessage: Message = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: "I'm having trouble connecting right now. Please try again in a moment.",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Clear conversation and start fresh
  const handleClearConversation = () => {
    const newSessionId = generateSessionId();
    setSessionId(newSessionId);
    setMessages([]);
    localStorage.removeItem(getStorageKey(businessId));
  };

  return (
    <>
      {/* Backdrop for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 lg:hidden"
          onClick={onToggle}
        />
      )}

      {/* Side Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-out flex flex-col ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header - Purple theme */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-purple-100 bg-gradient-to-r from-purple-50 to-white">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg" style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)' }}>
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">AI CFO</h3>
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                {stepConfig.icon}
                <span>{stepConfig.title}</span>
                <span className="text-gray-300">•</span>
                <span className="font-medium text-purple-600">{fyLabel}</span>
                {state.forecastDuration > 1 && (
                  <span className="text-gray-400">(Year {activeYear})</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={handleClearConversation}
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors text-xs"
                title="Clear conversation"
              >
                Clear
              </button>
            )}
            <button
              onClick={onToggle}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="space-y-4">
              {/* Welcome message */}
              <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="p-1.5 rounded-lg mt-0.5" style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)' }}>
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <div className="text-sm text-gray-700">
                    <p className="font-medium text-gray-900 mb-1">
                      Hi! I'm your AI CFO.
                    </p>
                    <p>
                      I can see you're working on <strong>{stepConfig.title}</strong> for {fyLabel}.
                      Get instant insights or ask me anything.
                    </p>
                  </div>
                </div>
              </div>

              {/* Quick Action Chips - Prominent at the top */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide px-1">
                  Get insights
                </p>
                <div className="flex flex-wrap gap-2">
                  {stepConfig.quickActions.map((action, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleQuickAction(action)}
                      disabled={isLoading}
                      className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
                      style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)' }}
                    >
                      <span>{action.icon}</span>
                      <span>{action.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick questions - secondary */}
              <div className="space-y-2 pt-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide px-1">
                  Or ask a question
                </p>
                <div className="space-y-2">
                  {stepConfig.quickQuestions.map((question, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSend(question)}
                      disabled={isLoading}
                      className="w-full text-left px-4 py-3 text-sm bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl transition-colors border border-gray-100 disabled:opacity-50"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Context banner showing current step and year */}
              <div className="bg-purple-50 border border-purple-100 rounded-lg px-3 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-purple-600">{stepConfig.icon}</span>
                  <span className="font-medium text-gray-700">{stepConfig.title}</span>
                  <span className="text-gray-400">•</span>
                  <span className="font-semibold text-purple-700">{fyLabel}</span>
                  {state.forecastDuration > 1 && (
                    <span className="text-xs text-gray-500">(Year {activeYear} of {state.forecastDuration})</span>
                  )}
                </div>
              </div>

              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {message.role === 'assistant' && (
                    <div className="flex-shrink-0 mr-2">
                      <div className="p-1.5 rounded-lg" style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)' }}>
                        <Sparkles className="w-3 h-3 text-white" />
                      </div>
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                      message.role === 'user'
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg" style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)' }}>
                      <Sparkles className="w-3 h-3 text-white" />
                    </div>
                    <div className="bg-gray-100 rounded-2xl px-4 py-3">
                      <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Quick actions/questions when in conversation */}
        {messages.length > 0 && !isLoading && (
          <div className="px-4 pb-2 border-t border-gray-100 pt-2">
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {/* Show quick actions as chips */}
              {stepConfig.quickActions.slice(0, 2).map((action, idx) => (
                <button
                  key={`action-${idx}`}
                  onClick={() => handleQuickAction(action)}
                  className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-purple-100 hover:bg-purple-200 text-purple-700 font-medium rounded-full transition-colors whitespace-nowrap"
                >
                  <span>{action.icon}</span>
                  <span>{action.label}</span>
                </button>
              ))}
              {/* Show one quick question */}
              {stepConfig.quickQuestions.slice(0, 1).map((question, idx) => (
                <button
                  key={`question-${idx}`}
                  onClick={() => handleSend(question)}
                  className="flex-shrink-0 px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full transition-colors whitespace-nowrap"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="border-t border-gray-200 p-4 bg-gray-50">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask me anything..."
              className="flex-1 px-4 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-navy/20 focus:border-brand-navy bg-white"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="p-2.5 bg-brand-navy text-white rounded-xl hover:bg-brand-navy-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      {/* Floating button when panel is closed - Purple theme for AI */}
      {!isOpen && (
        <div className="fixed bottom-6 right-6 z-40">
          {/* Message count badge if there's conversation history */}
          {messages.length > 0 && (
            <div className="absolute -top-1 -left-1 w-5 h-5 bg-white text-purple-600 text-xs font-bold rounded-full flex items-center justify-center shadow-md border border-purple-200">
              {Math.min(messages.length, 9)}{messages.length > 9 ? '+' : ''}
            </div>
          )}

          {/* Main floating button */}
          <button
            onClick={onToggle}
            className={`relative group w-14 h-14 rounded-full shadow-xl transition-all duration-300 hover:scale-110 hover:shadow-2xl ${
              !hasInteracted ? 'animate-bounce-subtle' : ''
            }`}
            style={{
              background: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 50%, #6D28D9 100%)',
            }}
            title="Open AI CFO"
          >
            {/* Pulse rings for attention (only if not interacted) */}
            {!hasInteracted && (
              <>
                <span className="absolute inset-0 rounded-full bg-purple-500 animate-ping opacity-25" />
                <span className="absolute inset-0 rounded-full bg-purple-400 animate-pulse opacity-20" />
              </>
            )}

            {/* Icon */}
            <div className="flex items-center justify-center w-full h-full">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
          </button>

          {/* Label tooltip on hover */}
          <div className="absolute bottom-full right-0 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <div className="bg-gray-900 text-white text-xs font-medium px-3 py-1.5 rounded-lg whitespace-nowrap shadow-lg">
              AI CFO Assistant
              <div className="absolute top-full right-4 w-2 h-2 bg-gray-900 transform rotate-45 -translate-y-1" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
