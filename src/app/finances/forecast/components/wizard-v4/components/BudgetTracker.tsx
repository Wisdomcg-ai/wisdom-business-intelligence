'use client';

import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, TrendingDown, TrendingUp, Wallet, Target, DollarSign, PieChart, ArrowRight, Sparkles } from 'lucide-react';
import { ForecastWizardState, formatCurrency, SUPER_RATE } from '../types';

interface BudgetTrackerProps {
  state: ForecastWizardState;
  currentStep: 'opex' | 'subscriptions' | 'capex';
  subscriptionSavings?: number;
}

export function BudgetTracker({ state, currentStep, subscriptionSavings = 0 }: BudgetTrackerProps) {
  const { goals, teamMembers, newHires, departures, cogsLines, opexLines, capexItems } = state;
  const fiscalYearStart = state.fiscalYearStart;
  const duration = state.forecastDuration;

  // Calculate budget for each year
  const yearBudgets = useMemo(() => {
    const budgets: {
      year: number;
      revenue: number;
      cogs: number;
      teamCosts: number;
      targetProfit: number;
      targetProfitPct: number;
      availableForExpenses: number;
      opexAllocated: number;
      capexDepreciation: number;
      totalAllocated: number;
      remaining: number;
      utilizationPct: number;
      isOverBudget: boolean;
    }[] = [];

    for (let yearNum = 1; yearNum <= duration; yearNum++) {
      const yearKey = `year${yearNum}` as 'year1' | 'year2' | 'year3';
      const yearGoals = goals[yearKey];
      const revenue = yearGoals?.revenue || 0;
      const targetProfitPct = yearGoals?.netProfitPct || 15;

      // Calculate COGS
      const cogs = cogsLines.reduce((sum, line) => {
        if (line.costBehavior === 'fixed') {
          return sum + (line.monthlyAmount || 0) * 12;
        }
        return sum + (revenue * (line.percentOfRevenue || 0) / 100);
      }, 0);

      // Calculate Team Costs
      const targetFY = fiscalYearStart + yearNum;
      let teamCosts = 0;

      const getFYFromMonth = (monthKey: string): number => {
        const [yearStr, monthStr] = monthKey.split('-');
        const year = parseInt(yearStr);
        const month = parseInt(monthStr);
        return month >= 7 ? year + 1 : year;
      };

      const getMonthsInFY = (startMonth: string, fy: number): number => {
        const startFY = getFYFromMonth(startMonth);
        if (startFY > fy) return 0;
        if (startFY < fy) return 12;
        const [, monthStr] = startMonth.split('-');
        const month = parseInt(monthStr);
        const fyMonth = month >= 7 ? month - 6 : month + 6;
        return 13 - fyMonth;
      };

      const getDepartureMonthsInFY = (endMonth: string, fy: number): number => {
        const endFY = getFYFromMonth(endMonth);
        if (endFY > fy) return 12;
        if (endFY < fy) return 0;
        const [, monthStr] = endMonth.split('-');
        const month = parseInt(monthStr);
        const fyMonth = month >= 7 ? month - 6 : month + 6;
        return fyMonth;
      };

      for (const member of teamMembers) {
        const departure = departures.find(d => d.teamMemberId === member.id);
        const yearsOfIncrease = yearNum - 1;
        const salary = member.newSalary * Math.pow(1 + (member.increasePct || 0) / 100, yearsOfIncrease);
        const superAmount = member.type !== 'contractor' ? salary * SUPER_RATE : 0;
        let monthsWorked = 12;
        if (departure) {
          monthsWorked = getDepartureMonthsInFY(departure.endMonth, targetFY);
        }
        teamCosts += ((salary + superAmount) * monthsWorked) / 12;
      }

      for (const hire of newHires) {
        const hireFY = getFYFromMonth(hire.startMonth);
        if (hireFY > targetFY) continue;
        const yearsAfterStart = targetFY - hireFY;
        const salary = hire.salary * Math.pow(1.03, yearsAfterStart);
        const superAmount = hire.type !== 'contractor' ? salary * SUPER_RATE : 0;
        const monthsWorked = getMonthsInFY(hire.startMonth, targetFY);
        teamCosts += ((salary + superAmount) * monthsWorked) / 12;
      }

      const targetProfit = Math.round(revenue * (targetProfitPct / 100));
      const availableForExpenses = revenue - cogs - teamCosts - targetProfit;

      // Calculate OpEx allocated
      const opexAllocated = opexLines.reduce((sum, line) => {
        if (line.startYear && line.startYear > yearNum) return sum;
        if (line.isOneTime && line.oneTimeYear && line.oneTimeYear !== yearNum) return sum;

        let lineAmount = 0;
        switch (line.costBehavior) {
          case 'fixed':
            const baseAmount = (line.monthlyAmount || 0) * 12;
            const increaseFactor = 1 + (line.annualIncreasePct || 0) / 100;
            const yearsFromStart = line.startYear ? yearNum - line.startYear : yearNum - 1;
            lineAmount = baseAmount * Math.pow(increaseFactor, Math.max(0, yearsFromStart));
            break;
          case 'variable':
            lineAmount = revenue * ((line.percentOfRevenue || 0) / 100);
            break;
          case 'adhoc':
            lineAmount = line.expectedAnnualAmount || 0;
            break;
          case 'seasonal':
            const growth = line.seasonalGrowthPct || 3;
            lineAmount = (line.priorYearAnnual || 0) * Math.pow(1 + growth / 100, yearNum);
            break;
          default:
            lineAmount = line.priorYearAnnual || 0;
        }
        return sum + lineAmount;
      }, 0);

      const capexDepreciation = capexItems.reduce((sum, item) => sum + (item.annualDepreciation || 0), 0);
      const totalAllocated = opexAllocated + capexDepreciation - (yearNum > 1 ? subscriptionSavings : 0);
      const remaining = availableForExpenses - totalAllocated;
      const utilizationPct = availableForExpenses > 0 ? Math.round((totalAllocated / availableForExpenses) * 100) : 100;

      budgets.push({
        year: yearNum,
        revenue: Math.round(revenue),
        cogs: Math.round(cogs),
        teamCosts: Math.round(teamCosts),
        targetProfit,
        targetProfitPct,
        availableForExpenses: Math.round(availableForExpenses),
        opexAllocated: Math.round(opexAllocated),
        capexDepreciation: Math.round(capexDepreciation),
        totalAllocated: Math.round(totalAllocated),
        remaining: Math.round(remaining),
        utilizationPct,
        isOverBudget: remaining < 0,
      });
    }

    return budgets;
  }, [goals, teamMembers, newHires, departures, cogsLines, opexLines, capexItems, fiscalYearStart, duration, subscriptionSavings]);

  const y1Budget = yearBudgets[0];
  if (!y1Budget || y1Budget.revenue === 0) return null;

  const isOverBudget = y1Budget.isOverBudget;
  const utilizationPct = y1Budget.utilizationPct;
  const isNearLimit = utilizationPct > 85 && !isOverBudget;

  // Calculate the ring progress
  const ringProgress = Math.min(utilizationPct, 100);
  const ringRadius = 40;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference - (ringProgress / 100) * ringCircumference;

  return (
    <div className={`rounded-2xl shadow-lg overflow-hidden ${
      isOverBudget
        ? 'bg-gradient-to-br from-red-900 via-red-800 to-red-900'
        : 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900'
    }`}>
      {/* Header */}
      <div className="relative px-5 py-4 border-b border-white/10">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-600/10 to-cyan-600/10" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg ${
              isOverBudget
                ? 'bg-gradient-to-br from-red-500 to-red-600'
                : 'bg-gradient-to-br from-emerald-500 to-cyan-600'
            }`}>
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Expense Budget</h3>
              <p className="text-xs text-slate-400">Profit-first allocation</p>
            </div>
          </div>

          {/* Status Badge */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold ${
            isOverBudget
              ? 'bg-red-500/20 text-red-300 border border-red-500/30'
              : isNearLimit
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
          }`}>
            {isOverBudget ? (
              <>
                <AlertTriangle className="w-4 h-4" />
                Over Budget
              </>
            ) : isNearLimit ? (
              <>
                <AlertTriangle className="w-4 h-4" />
                Near Limit
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                On Track
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-5">
        <div className="flex items-start gap-6">
          {/* Circular Progress Gauge */}
          <div className="relative flex-shrink-0">
            <svg width="100" height="100" className="-rotate-90">
              {/* Background ring */}
              <circle
                cx="50"
                cy="50"
                r={ringRadius}
                fill="none"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="8"
              />
              {/* Progress ring */}
              <circle
                cx="50"
                cy="50"
                r={ringRadius}
                fill="none"
                stroke={isOverBudget ? '#ef4444' : isNearLimit ? '#f59e0b' : '#10b981'}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={ringCircumference}
                strokeDashoffset={ringOffset}
                className="transition-all duration-700 ease-out"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-2xl font-bold tabular-nums ${
                isOverBudget ? 'text-red-400' : isNearLimit ? 'text-amber-400' : 'text-white'
              }`}>
                {utilizationPct}%
              </span>
              <span className="text-[10px] text-slate-400 uppercase tracking-wide">used</span>
            </div>
          </div>

          {/* Key Metrics */}
          <div className="flex-1 space-y-3">
            {/* Available Budget */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-sm text-slate-400">Available Budget</span>
              </div>
              <span className="text-lg font-bold text-white tabular-nums">
                {formatCurrency(y1Budget.availableForExpenses)}
              </span>
            </div>

            {/* Allocated */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isOverBudget ? 'bg-red-500' : 'bg-cyan-500'}`} />
                <span className="text-sm text-slate-400">Allocated</span>
              </div>
              <span className={`text-lg font-bold tabular-nums ${isOverBudget ? 'text-red-400' : 'text-white'}`}>
                {formatCurrency(y1Budget.totalAllocated)}
              </span>
            </div>

            {/* Remaining */}
            <div className={`flex items-center justify-between p-2 rounded-lg ${
              isOverBudget ? 'bg-red-500/20' : 'bg-emerald-500/10'
            }`}>
              <div className="flex items-center gap-2">
                {isOverBudget ? (
                  <TrendingDown className="w-4 h-4 text-red-400" />
                ) : (
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                )}
                <span className={`text-sm font-medium ${isOverBudget ? 'text-red-300' : 'text-emerald-300'}`}>
                  {isOverBudget ? 'Over by' : 'Remaining'}
                </span>
              </div>
              <span className={`text-lg font-bold tabular-nums ${isOverBudget ? 'text-red-400' : 'text-emerald-400'}`}>
                {formatCurrency(Math.abs(y1Budget.remaining))}
              </span>
            </div>
          </div>
        </div>

        {/* Breakdown Bar */}
        <div className="mt-5 pt-5 border-t border-white/10">
          <div className="flex items-center gap-1 mb-3">
            <PieChart className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Budget Breakdown</span>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div className="text-center p-2 rounded-lg bg-white/5">
              <div className="text-[10px] text-slate-500 uppercase mb-1">Revenue</div>
              <div className="text-sm font-bold text-white tabular-nums">{formatCurrency(y1Budget.revenue)}</div>
            </div>
            <div className="text-center p-2 rounded-lg bg-white/5">
              <div className="text-[10px] text-slate-500 uppercase mb-1">COGS + Team</div>
              <div className="text-sm font-bold text-white tabular-nums">{formatCurrency(y1Budget.cogs + y1Budget.teamCosts)}</div>
            </div>
            <div className="text-center p-2 rounded-lg bg-white/5">
              <div className="text-[10px] text-slate-500 uppercase mb-1">Target Profit</div>
              <div className="text-sm font-bold text-emerald-400 tabular-nums">
                {formatCurrency(y1Budget.targetProfit)}
                <span className="text-[10px] text-slate-500 ml-1">({y1Budget.targetProfitPct}%)</span>
              </div>
            </div>
            <div className="text-center p-2 rounded-lg bg-white/5">
              <div className="text-[10px] text-slate-500 uppercase mb-1">OpEx Budget</div>
              <div className="text-sm font-bold text-cyan-400 tabular-nums">{formatCurrency(y1Budget.availableForExpenses)}</div>
            </div>
          </div>
        </div>

        {/* Multi-year Summary */}
        {duration > 1 && (
          <div className="mt-4 p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Multi-Year View</span>
              <div className="flex items-center gap-2">
                {yearBudgets.map((b) => (
                  <div
                    key={b.year}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${
                      b.isOverBudget
                        ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    }`}
                  >
                    <span>Y{b.year}</span>
                    <span className="tabular-nums">
                      {b.isOverBudget ? '-' : '+'}{formatCurrency(Math.abs(b.remaining))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Over Budget Action Prompt */}
        {isOverBudget && (
          <div className="mt-4 p-3 rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span className="text-sm text-amber-200">
                  AI can help identify cost savings to get back on track
                </span>
              </div>
              <ArrowRight className="w-4 h-4 text-amber-400" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
