'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  ChevronRight, ChevronDown, ArrowRight, AlertTriangle, CheckCircle,
  TrendingUp, TrendingDown,
} from 'lucide-react';
import {
  ForecastWizardState, WizardActions, ForecastSummary, YearlySummary,
  formatCurrency, formatPercent, getRevenueLineYearTotal, generateMonthKeys,
} from '../types';

// ─── Types ─────────────────────────────────────────────────────────────────

interface Step8GrowthPlanProps {
  state: ForecastWizardState;
  actions: WizardActions;
  summary: ForecastSummary;
  fiscalYear: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function distributeToQuarters(
  annualTotal: number,
  seasonalityPattern?: number[]
): { q1: number; q2: number; q3: number; q4: number } {
  if (!seasonalityPattern || seasonalityPattern.length !== 12) {
    const q = Math.round(annualTotal / 4);
    return { q1: q, q2: q, q3: q, q4: annualTotal - 3 * q };
  }

  const q1Pct = (seasonalityPattern[0] || 8.33) + (seasonalityPattern[1] || 8.33) + (seasonalityPattern[2] || 8.33);
  const q2Pct = (seasonalityPattern[3] || 8.33) + (seasonalityPattern[4] || 8.33) + (seasonalityPattern[5] || 8.33);
  const q3Pct = (seasonalityPattern[6] || 8.33) + (seasonalityPattern[7] || 8.33) + (seasonalityPattern[8] || 8.33);
  const q4Pct = (seasonalityPattern[9] || 8.33) + (seasonalityPattern[10] || 8.33) + (seasonalityPattern[11] || 8.33);
  const totalPct = q1Pct + q2Pct + q3Pct + q4Pct;

  const q1 = Math.round(annualTotal * (q1Pct / totalPct));
  const q2 = Math.round(annualTotal * (q2Pct / totalPct));
  const q3 = Math.round(annualTotal * (q3Pct / totalPct));
  const q4 = annualTotal - q1 - q2 - q3;

  return { q1, q2, q3, q4 };
}

function growthPct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current / previous) - 1) * 100;
}

function formatGrowth(pct: number | null): string {
  if (pct === null) return '—';
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

const emptySummary: YearlySummary = {
  revenue: 0, cogs: 0, grossProfit: 0, grossProfitPct: 0,
  teamCosts: 0, opex: 0, depreciation: 0, otherExpenses: 0,
  netProfit: 0, netProfitPct: 0,
};

// ─── Main Component ────────────────────────────────────────────────────────

export function Step8GrowthPlan({ state, actions, summary, fiscalYear }: Step8GrowthPlanProps) {
  const { forecastDuration, goals, revenueLines, opexLines } = state;
  const showY3 = forecastDuration === 3;

  const y1 = summary.year1;
  const y2 = summary.year2 || emptySummary;
  const y3 = summary.year3 || emptySummary;

  console.log('[Step8GrowthPlan] Summary:', {
    forecastDuration,
    y1: { revenue: y1.revenue, cogs: y1.cogs, grossProfit: y1.grossProfit, teamCosts: y1.teamCosts, opex: y1.opex, netProfit: y1.netProfit },
    y2: { revenue: y2.revenue, grossProfit: y2.grossProfit, netProfit: y2.netProfit },
    hasYear2: !!summary.year2,
    hasYear3: !!summary.year3,
    revenueLineCount: revenueLines.length,
    opexLineCount: opexLines.length,
    goalsYear1Revenue: goals.year1?.revenue,
    revenueLinesSample: revenueLines.slice(0, 2).map(l => ({
      name: l.name,
      y1MonthlyKeys: Object.keys(l.year1Monthly).length,
      y1Total: Object.values(l.year1Monthly).reduce((a: number, b: number) => a + b, 0),
    })),
  });

  // Expand/collapse state
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const toggleRow = (key: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ─── Revenue Growth Rates ──────────────────────────────────────────────

  const revenueData = useMemo(() => {
    return revenueLines.map((line) => {
      const y1Total = Object.values(line.year1Monthly).reduce((a, b) => a + b, 0);
      const y2Total = getRevenueLineYearTotal(line, 2);
      const y3Total = getRevenueLineYearTotal(line, 3);

      const y2GrowthPct = y1Total > 0 && y2Total > 0
        ? ((y2Total / y1Total) - 1) * 100
        : y1Total > 0 && goals.year2?.revenue && goals.year1?.revenue
          ? ((goals.year2.revenue / goals.year1.revenue) - 1) * 100
          : 10;

      const y3GrowthPct = y2Total > 0 && y3Total > 0
        ? ((y3Total / y2Total) - 1) * 100
        : y2Total > 0 && goals.year3?.revenue && goals.year2?.revenue
          ? ((goals.year3.revenue / goals.year2.revenue) - 1) * 100
          : 10;

      return {
        id: line.id,
        name: line.name,
        y1Total,
        y2Total,
        y3Total,
        y2GrowthPct: Math.round(y2GrowthPct * 10) / 10,
        y3GrowthPct: Math.round(y3GrowthPct * 10) / 10,
      };
    });
  }, [revenueLines, goals]);

  const handleRevenueGrowthChange = useCallback((lineId: string, yearNum: 2 | 3, pct: number) => {
    const line = revenueLines.find(l => l.id === lineId);
    if (!line) return;

    const baseTotal = yearNum === 2
      ? Object.values(line.year1Monthly).reduce((a, b) => a + b, 0)
      : getRevenueLineYearTotal(line, 2);

    if (baseTotal === 0) return;

    const newAnnual = Math.round(baseTotal * (1 + pct / 100));
    const seasonality = state.priorYear?.seasonalityPattern || Array(12).fill(8.33);
    const totalSeasonality = seasonality.reduce((s, v) => s + v, 0);
    const yearOffset = yearNum === 2 ? 1 : 2;
    const monthKeys = generateMonthKeys(state.fiscalYearStart + yearOffset);
    const monthly: { [key: string]: number } = {};
    monthKeys.forEach((key, idx) => {
      const factor = (seasonality[idx] || 8.33) / totalSeasonality;
      monthly[key] = Math.round(newAnnual * factor);
    });

    if (yearNum === 2) {
      actions.updateRevenueLine(lineId, { year2Monthly: monthly });
    } else {
      actions.updateRevenueLine(lineId, { year3Monthly: monthly });
    }
  }, [revenueLines, state.priorYear?.seasonalityPattern, state.fiscalYearStart, actions]);

  // ─── Team Per-Person Costs ──────────────────────────────────────────────

  const teamPerPerson = useMemo(() => {
    const fiscalYearStart = state.fiscalYearStart;
    const defaultIncrease = state.defaultOpExIncreasePct || 3;

    const getFYFromMonth = (monthKey: string): number => {
      const month = parseInt(monthKey.split('-')[1]);
      const year = parseInt(monthKey.split('-')[0]);
      return month >= 7 ? year + 1 : year;
    };

    const getMonthsInFY = (startMonth: string, fy: number): number => {
      const startFY = getFYFromMonth(startMonth);
      if (startFY > fy) return 0;
      if (startFY < fy) return 12;
      const month = parseInt(startMonth.split('-')[1]);
      const fyMonth = month >= 7 ? month - 6 : month + 6;
      return 13 - fyMonth;
    };

    const getDepartureMonthsInFY = (endMonth: string, fy: number): number => {
      const endFY = getFYFromMonth(endMonth);
      if (endFY > fy) return 12;
      if (endFY < fy) return 0;
      const month = parseInt(endMonth.split('-')[1]);
      const fyMonth = month >= 7 ? month - 6 : month + 6;
      return fyMonth;
    };

    const calcMemberCost = (salary: number, superAmt: number, months: number): number => {
      return Math.round(((salary * months) / 12) + ((superAmt * months) / 12));
    };

    // Existing team members
    const existing = state.teamMembers.map(member => {
      const departure = state.departures.find(d => d.teamMemberId === member.id);
      const costs = ([1, 2, 3] as const).map(yearNum => {
        const targetFY = fiscalYearStart + yearNum;
        const yearsOfIncrease = yearNum - 1;
        const salary = member.newSalary * Math.pow(1 + (member.increasePct || 0) / 100, yearsOfIncrease);
        const superAmount = member.type !== 'contractor' ? salary * 0.12 : 0;
        let months = 12;
        if (departure) {
          months = getDepartureMonthsInFY(departure.endMonth, targetFY);
        }
        return calcMemberCost(salary, superAmount, months);
      });
      return {
        id: member.id,
        name: member.name || member.role,
        isNewHire: false,
        y1: costs[0],
        y2: costs[1],
        y3: costs[2],
      };
    });

    // New hires
    const hires = state.newHires.map(hire => {
      const costs = ([1, 2, 3] as const).map(yearNum => {
        const targetFY = fiscalYearStart + yearNum;
        const hireFY = getFYFromMonth(hire.startMonth);
        if (hireFY > targetFY) return 0;
        const yearsAfterStart = targetFY - hireFY;
        const salary = hire.salary * Math.pow(1 + defaultIncrease / 100, yearsAfterStart);
        const superAmount = hire.type !== 'contractor' ? salary * 0.12 : 0;
        const months = getMonthsInFY(hire.startMonth, targetFY);
        return calcMemberCost(salary, superAmount, months);
      });
      return {
        id: hire.id,
        name: hire.role || 'New hire',
        isNewHire: true,
        startMonth: hire.startMonth,
        y1: costs[0],
        y2: costs[1],
        y3: costs[2],
      };
    });

    return [...existing, ...hires];
  }, [state.teamMembers, state.newHires, state.departures, state.fiscalYearStart, state.defaultOpExIncreasePct]);

  // Team note summary (headcount, hires, departures, avg increase)
  const teamNote = useMemo(() => {
    const fiscalYearStart = state.fiscalYearStart;
    const getFYFromMonth = (monthKey: string): number => {
      const month = parseInt(monthKey.split('-')[1]);
      const year = parseInt(monthKey.split('-')[0]);
      return month >= 7 ? year + 1 : year;
    };

    return ([1, 2, 3] as const).map(yearNum => {
      const targetFY = fiscalYearStart + yearNum;
      let headcount = 0;
      for (const member of state.teamMembers) {
        const departure = state.departures.find(d => d.teamMemberId === member.id);
        if (departure && getFYFromMonth(departure.endMonth) <= targetFY - 1) continue;
        headcount++;
      }
      let newHiresCount = 0;
      for (const hire of state.newHires) {
        if (getFYFromMonth(hire.startMonth) <= targetFY) {
          headcount++;
          if (getFYFromMonth(hire.startMonth) === targetFY) newHiresCount++;
        }
      }
      let departuresCount = 0;
      for (const dep of state.departures) {
        if (getFYFromMonth(dep.endMonth) === targetFY) departuresCount++;
      }
      const increases = state.teamMembers.map(m => m.increasePct).filter(p => p > 0);
      const avgIncrease = increases.length > 0
        ? Math.round((increases.reduce((a, b) => a + b, 0) / increases.length) * 10) / 10
        : 0;

      return { yearNum, fy: targetFY, headcount, newHires: newHiresCount, departures: departuresCount, avgIncrease };
    });
  }, [state.teamMembers, state.newHires, state.departures, state.fiscalYearStart]);

  // ─── OpEx Per-Line Amounts ──────────────────────────────────────────────

  const opexPerLine = useMemo(() => {
    const defaultIncrease = state.defaultOpExIncreasePct || 3;

    const calcLineAmount = (line: typeof opexLines[number], yearNum: 1 | 2 | 3, revenue: number): number => {
      if (line.isOneTime && line.oneTimeYear && line.oneTimeYear !== yearNum) return 0;
      if (line.startYear && line.startYear > yearNum) return 0;

      switch (line.costBehavior) {
        case 'fixed': {
          const baseAmount = (line.monthlyAmount || 0) * 12;
          const increaseFactor = 1 + (line.annualIncreasePct || defaultIncrease) / 100;
          return baseAmount * Math.pow(increaseFactor, yearNum - 1);
        }
        case 'variable':
          return revenue * ((line.percentOfRevenue || 0) / 100);
        case 'adhoc':
          return line.expectedAnnualAmount || 0;
        case 'seasonal': {
          const priorTotal = line.priorYearAnnual || 0;
          if (line.seasonalTargetAmount && yearNum === 1) return line.seasonalTargetAmount;
          const gPct = line.seasonalGrowthPct ?? defaultIncrease;
          return priorTotal * Math.pow(1 + gPct / 100, yearNum);
        }
        default:
          return (line.priorYearAnnual || 0) * Math.pow(1 + defaultIncrease / 100, yearNum - 1);
      }
    };

    return opexLines.map(line => ({
      id: line.id,
      name: line.name,
      isSubscription: !!line.isSubscription,
      y1: Math.round(calcLineAmount(line, 1, y1.revenue)),
      y2: Math.round(calcLineAmount(line, 2, y2.revenue)),
      y3: Math.round(calcLineAmount(line, 3, y3.revenue)),
    }));
  }, [opexLines, state.defaultOpExIncreasePct, y1.revenue, y2.revenue, y3.revenue]);

  // ─── Subscription Lines ────────────────────────────────────────────────

  const SUBSCRIPTION_KEYWORDS = [
    'subscription', 'software', 'saas', 'license', 'licence', 'app',
    'platform', 'xero', 'myob', 'quickbooks', 'microsoft', 'office 365',
    'adobe', 'google workspace', 'slack', 'zoom', 'dropbox', 'hubspot',
    'salesforce', 'mailchimp', 'canva', 'figma', 'notion', 'asana',
    'monday', 'trello', 'jira', 'github', 'aws', 'azure', 'shopify',
    'servicem8', 'deputy', 'tanda', 'employment hero', 'cin7',
    'membership', 'dues',
  ];

  const subscriptionLines = useMemo(() => {
    return opexPerLine.filter(l => {
      if (l.isSubscription) return true;
      const lower = l.name.toLowerCase();
      return SUBSCRIPTION_KEYWORDS.some(kw => lower.includes(kw));
    });
  }, [opexPerLine]);


  // ─── Goal Alignment ────────────────────────────────────────────────────

  const goalChecks = useMemo(() => {
    const checks: Array<{
      yearNum: 2 | 3;
      fy: number;
      revenue: { actual: number; target: number };
      gp: { actual: number; target: number };
      np: { actual: number; target: number };
    }> = [];

    if (goals.year2) {
      checks.push({
        yearNum: 2,
        fy: fiscalYear + 1,
        revenue: { actual: y2.revenue, target: goals.year2.revenue },
        gp: { actual: y2.grossProfitPct, target: goals.year2.grossProfitPct },
        np: { actual: y2.netProfitPct, target: goals.year2.netProfitPct },
      });
    }

    if (showY3 && goals.year3) {
      checks.push({
        yearNum: 3,
        fy: fiscalYear + 2,
        revenue: { actual: y3.revenue, target: goals.year3.revenue },
        gp: { actual: y3.grossProfitPct, target: goals.year3.grossProfitPct },
        np: { actual: y3.netProfitPct, target: goals.year3.netProfitPct },
      });
    }

    return checks;
  }, [goals, y2, y3, fiscalYear, showY3]);

  // ─── Column Headers ────────────────────────────────────────────────────

  const colCount = showY3 ? 6 : 4; // Category + Y1 + Growth% + Y2 [+ Growth% + Y3]

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Goal Alignment Banner */}
      {goalChecks.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="space-y-3">
            {goalChecks.map(check => {
              const items = [
                { label: 'Revenue', actual: check.revenue.actual, target: check.revenue.target, format: 'currency' as const },
                { label: 'Gross Profit', actual: check.gp.actual, target: check.gp.target, format: 'percent' as const },
                { label: 'Net Profit', actual: check.np.actual, target: check.np.target, format: 'percent' as const },
              ];
              return (
                <div key={check.yearNum} className="flex items-center gap-4 text-sm">
                  <span className="text-xs font-semibold text-gray-500 w-10 shrink-0">FY{check.fy}</span>
                  <div className="flex items-center gap-4 flex-wrap">
                    {items.map(item => {
                      const pctOfTarget = item.target > 0 ? (item.actual / item.target) * 100 : 100;
                      const met = pctOfTarget >= 100;
                      const close = pctOfTarget >= 95;
                      return (
                        <div key={item.label} className="flex items-center gap-1.5">
                          {met ? (
                            <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                          ) : close ? (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                          )}
                          <span className="text-gray-600">{item.label}</span>
                          <span className={`font-medium ${met ? 'text-green-700' : close ? 'text-amber-700' : 'text-red-700'}`}>
                            {item.format === 'currency'
                              ? formatCurrency(item.actual)
                              : formatPercent(item.actual)
                            }
                          </span>
                          <span className="text-gray-400">/</span>
                          <span className="text-gray-400">
                            {item.format === 'currency'
                              ? formatCurrency(item.target)
                              : formatPercent(item.target)
                            }
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Key Assumptions Summary */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
        <h4 className="text-sm font-semibold text-gray-700 mb-2">This forecast assumes:</h4>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600">
          {summary.year1.revenue > 0 && summary.year2 && summary.year2.revenue > 0 && (
            <span>Revenue grows {((summary.year2.revenue / summary.year1.revenue - 1) * 100).toFixed(0)}% in Y2{summary.year3 && summary.year3.revenue > 0 && summary.year2.revenue > 0 ? `, ${((summary.year3.revenue / summary.year2.revenue - 1) * 100).toFixed(0)}% in Y3` : ''}</span>
          )}
          <span>Team: {state.teamMembers.length} people{state.newHires.length > 0 ? ` + ${state.newHires.length} hire${state.newHires.length > 1 ? 's' : ''}` : ''}{state.departures.length > 0 ? ` − ${state.departures.length} departure${state.departures.length > 1 ? 's' : ''}` : ''}</span>
          <span>OpEx increase: {state.defaultOpExIncreasePct || 3}%/year</span>
          {state.capexItems.length > 0 && (
            <span>CapEx: {formatCurrency(state.capexItems.reduce((s, i) => s + i.cost, 0))} in Y1</span>
          )}
        </div>
      </div>

      {/* Main P&L Spreadsheet Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-base font-semibold text-gray-900">
            Multi-Year Growth Plan
          </h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Review your multi-year P&L trajectory. Expand rows for detail and adjust revenue growth rates.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-52">
                  Category
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                  FY{fiscalYear}
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                  FY{fiscalYear + 1}
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider w-20">
                  vs FY{(fiscalYear).toString().slice(-2)}
                </th>
                {showY3 && (
                  <>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                      FY{fiscalYear + 2}
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider w-20">
                      vs FY{(fiscalYear + 1).toString().slice(-2)}
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">

              {/* ── Revenue Row ─────────────────────────────────────────── */}
              <tr
                className="hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => toggleRow('revenue')}
              >
                <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                  <div className="flex items-center gap-1.5">
                    {expandedRows.has('revenue')
                      ? <ChevronDown className="w-4 h-4 text-gray-400" />
                      : <ChevronRight className="w-4 h-4 text-gray-400" />
                    }
                    Revenue
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">
                  {formatCurrency(y1.revenue)}
                </td>
                <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">
                  {formatCurrency(y2.revenue)}
                </td>
                <td className="px-4 py-3 text-sm text-center">
                  <GrowthBadge value={growthPct(y2.revenue, y1.revenue)} />
                </td>
                {showY3 && (
                  <>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">
                      {formatCurrency(y3.revenue)}
                    </td>
                    <td className="px-4 py-3 text-sm text-center">
                      <GrowthBadge value={growthPct(y3.revenue, y2.revenue)} />
                    </td>
                  </>
                )}
              </tr>

              {/* Revenue Expanded — per-line with editable growth % */}
              {expandedRows.has('revenue') && (
                <>
                  {revenueData.map(line => (
                    <tr key={line.id} className="bg-gray-50/50">
                      <td className="pl-10 pr-4 py-2.5 text-sm text-gray-600">
                        {line.name}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-right text-gray-600">
                        {formatCurrency(line.y1Total)}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-right text-gray-600">
                        {formatCurrency(line.y2Total)}
                      </td>
                      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center">
                          <input
                            type="number"
                            step="0.5"
                            value={line.y2GrowthPct}
                            onChange={(e) => {
                              const pct = parseFloat(e.target.value) || 0;
                              handleRevenueGrowthChange(line.id, 2, pct);
                            }}
                            className="w-16 text-center px-1.5 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                          <span className="ml-0.5 text-xs text-gray-400">%</span>
                        </div>
                      </td>
                      {showY3 && (
                        <>
                          <td className="px-4 py-2.5 text-sm text-right text-gray-600">
                            {formatCurrency(line.y3Total)}
                          </td>
                          <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center">
                              <input
                                type="number"
                                step="0.5"
                                value={line.y3GrowthPct}
                                onChange={(e) => {
                                  const pct = parseFloat(e.target.value) || 0;
                                  handleRevenueGrowthChange(line.id, 3, pct);
                                }}
                                className="w-16 text-center px-1.5 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              />
                              <span className="ml-0.5 text-xs text-gray-400">%</span>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                  <tr className="bg-gray-50/50">
                    <td colSpan={colCount} className="pl-10 pr-4 py-2">
                      <button
                        onClick={() => actions.goToStep(3)}
                        className="text-xs font-medium text-brand-navy hover:underline flex items-center gap-1"
                      >
                        Edit revenue lines in Step 3 <ArrowRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                </>
              )}

              {/* ── COGS Row ───────────────────────────────────────────── */}
              <tr
                className="hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => toggleRow('cogs')}
              >
                <td className="px-4 py-3 text-sm text-gray-700">
                  <div className="flex items-center gap-1.5">
                    {expandedRows.has('cogs')
                      ? <ChevronDown className="w-4 h-4 text-gray-400" />
                      : <ChevronRight className="w-4 h-4 text-gray-400" />
                    }
                    Cost of Sales
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-700">
                  ({formatCurrency(y1.cogs)})
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-700">
                  ({formatCurrency(y2.cogs)})
                </td>
                <td className="px-4 py-3 text-sm text-center">
                  <GrowthBadge value={growthPct(y2.cogs, y1.cogs)} />
                </td>
                {showY3 && (
                  <>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">
                      ({formatCurrency(y3.cogs)})
                    </td>
                    <td className="px-4 py-3 text-sm text-center">
                      <GrowthBadge value={growthPct(y3.cogs, y2.cogs)} />
                    </td>
                  </>
                )}
              </tr>

              {/* COGS Expanded */}
              {expandedRows.has('cogs') && (
                <>
                  <tr className="bg-gray-50/50">
                    <td className="pl-10 pr-4 py-2.5 text-sm text-gray-500">
                      % of Revenue
                    </td>
                    <td className="px-4 py-2.5 text-sm text-right text-gray-500">
                      {y1.revenue > 0 ? formatPercent((y1.cogs / y1.revenue) * 100) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-right text-gray-500">
                      {y2.revenue > 0 ? formatPercent((y2.cogs / y2.revenue) * 100) : '—'}
                    </td>
                    <td className="px-4 py-2.5" />
                    {showY3 && (
                      <>
                        <td className="px-4 py-2.5 text-sm text-right text-gray-500">
                          {y3.revenue > 0 ? formatPercent((y3.cogs / y3.revenue) * 100) : '—'}
                        </td>
                        <td className="px-4 py-2.5" />
                      </>
                    )}
                  </tr>
                  {state.cogsLines.map(line => (
                    <tr key={line.id} className="bg-gray-50/50">
                      <td className="pl-10 pr-4 py-2 text-sm text-gray-500">
                        {line.name}
                        <span className="ml-2 text-xs text-gray-400">
                          ({line.costBehavior === 'variable'
                            ? `${line.percentOfRevenue || 0}% of rev`
                            : `${formatCurrency(line.monthlyAmount || 0)}/mo`
                          })
                        </span>
                      </td>
                      <td colSpan={showY3 ? 5 : 3} />
                    </tr>
                  ))}
                  <tr className="bg-gray-50/50">
                    <td colSpan={colCount} className="pl-10 pr-4 py-2">
                      <button
                        onClick={() => actions.goToStep(3)}
                        className="text-xs font-medium text-brand-navy hover:underline flex items-center gap-1"
                      >
                        Adjust COGS in Step 3 <ArrowRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                </>
              )}

              {/* ── Gross Profit Row ───────────────────────────────────── */}
              <tr className="bg-green-50 border-t border-green-200">
                <td className="px-4 py-2 text-sm font-bold text-green-900">
                  <div className="flex items-center gap-1.5">
                    <span className="w-4" />
                    Gross Profit
                  </div>
                </td>
                <td className="px-4 py-2 text-sm text-right font-bold text-green-900">{formatCurrency(y1.grossProfit)}</td>
                <td className="px-4 py-2 text-sm text-right font-bold text-green-900">{formatCurrency(y2.grossProfit)}</td>
                <td className="px-4 py-2 text-sm text-center"><GrowthBadge value={growthPct(y2.grossProfit, y1.grossProfit)} /></td>
                {showY3 && (
                  <>
                    <td className="px-4 py-2 text-sm text-right font-bold text-green-900">{formatCurrency(y3.grossProfit)}</td>
                    <td className="px-4 py-2 text-sm text-center"><GrowthBadge value={growthPct(y3.grossProfit, y2.grossProfit)} /></td>
                  </>
                )}
              </tr>
              <tr className="bg-green-50 border-b border-green-200">
                <td className="px-4 pb-2 pt-0 text-xs text-green-700">
                  <div className="flex items-center gap-1.5">
                    <span className="w-4" />
                    Gross Margin %
                  </div>
                </td>
                <td className="px-4 pb-2 pt-0 text-xs text-right text-green-700">{formatPercent(y1.grossProfitPct)}</td>
                <td className="px-4 pb-2 pt-0 text-xs text-right text-green-700">{formatPercent(y2.grossProfitPct)}</td>
                <td className="px-4 pb-2 pt-0"></td>
                {showY3 && (
                  <>
                    <td className="px-4 pb-2 pt-0 text-xs text-right text-green-700">{formatPercent(y3.grossProfitPct)}</td>
                    <td className="px-4 pb-2 pt-0"></td>
                  </>
                )}
              </tr>

              {/* ── Team Costs Row ─────────────────────────────────────── */}
              <tr
                className="hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => toggleRow('team')}
              >
                <td className="px-4 py-3 text-sm text-gray-700">
                  <div className="flex items-center gap-1.5">
                    {expandedRows.has('team')
                      ? <ChevronDown className="w-4 h-4 text-gray-400" />
                      : <ChevronRight className="w-4 h-4 text-gray-400" />
                    }
                    Team Costs
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-700">
                  ({formatCurrency(y1.teamCosts)})
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-700">
                  ({formatCurrency(y2.teamCosts)})
                </td>
                <td className="px-4 py-3 text-sm text-center">
                  <GrowthBadge value={growthPct(y2.teamCosts, y1.teamCosts)} />
                </td>
                {showY3 && (
                  <>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">
                      ({formatCurrency(y3.teamCosts)})
                    </td>
                    <td className="px-4 py-3 text-sm text-center">
                      <GrowthBadge value={growthPct(y3.teamCosts, y2.teamCosts)} />
                    </td>
                  </>
                )}
              </tr>

              {/* Team Expanded — per-person table + note */}
              {expandedRows.has('team') && (
                <>
                  {teamPerPerson.map(person => (
                    <tr key={person.id} className="bg-gray-50/50">
                      <td className="pl-10 pr-4 py-2 text-sm text-gray-600">
                        {person.name}
                        {person.isNewHire && (person as any).startMonth && (
                          <span className="ml-1.5 text-xs text-blue-600 font-medium">
                            New · starts {new Date((person as any).startMonth + '-01').toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-gray-600">
                        {person.y1 > 0 ? formatCurrency(person.y1) : '—'}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-gray-600">
                        {person.y2 > 0 ? formatCurrency(person.y2) : '—'}
                      </td>
                      <td className="px-4 py-2 text-sm text-center">
                        {person.y1 > 0 && person.y2 > 0
                          ? <GrowthBadge value={growthPct(person.y2, person.y1)} />
                          : person.y2 > 0
                            ? <span className="text-xs text-blue-600">New</span>
                            : <span className="text-xs text-gray-400">—</span>
                        }
                      </td>
                      {showY3 && (
                        <>
                          <td className="px-4 py-2 text-sm text-right text-gray-600">
                            {person.y3 > 0 ? formatCurrency(person.y3) : '—'}
                          </td>
                          <td className="px-4 py-2 text-sm text-center">
                            {person.y2 > 0 && person.y3 > 0
                              ? <GrowthBadge value={growthPct(person.y3, person.y2)} />
                              : person.y3 > 0
                                ? <span className="text-xs text-blue-600">New</span>
                                : <span className="text-xs text-gray-400">—</span>
                            }
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                  {/* Bonuses row if any */}
                  {state.bonuses.length > 0 && (
                    <tr className="bg-gray-50/50">
                      <td className="pl-10 pr-4 py-2 text-sm text-gray-600">Bonuses</td>
                      <td className="px-4 py-2 text-sm text-right text-gray-600">
                        {formatCurrency(state.bonuses.reduce((s, b) => s + b.amount, 0))}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-gray-600">
                        {formatCurrency(state.bonuses.reduce((s, b) => s + b.amount, 0))}
                      </td>
                      <td className="px-4 py-2" />
                      {showY3 && (
                        <>
                          <td className="px-4 py-2 text-sm text-right text-gray-600">
                            {formatCurrency(state.bonuses.reduce((s, b) => s + b.amount, 0))}
                          </td>
                          <td className="px-4 py-2" />
                        </>
                      )}
                    </tr>
                  )}
                  {/* Note with headcount summary */}
                  <tr className="bg-gray-50/50">
                    <td colSpan={colCount} className="pl-10 pr-4 py-2">
                      <p className="text-xs text-gray-400 mb-1.5">
                        {teamNote
                          .filter((_, i) => i === 0 || i === 1 || (i === 2 && showY3))
                          .map(n =>
                            `FY${n.fy}: ${n.headcount} people${n.newHires > 0 ? `, +${n.newHires} hire${n.newHires !== 1 ? 's' : ''}` : ''}${n.departures > 0 ? `, -${n.departures} departure${n.departures !== 1 ? 's' : ''}` : ''}${n.avgIncrease > 0 && n.yearNum > 1 ? `, ${n.avgIncrease}% avg increase` : ''}`
                          ).join('  ·  ')}
                      </p>
                      <button
                        onClick={() => actions.goToStep(4)}
                        className="text-xs font-medium text-brand-navy hover:underline flex items-center gap-1"
                      >
                        Edit team plan in Step 4 <ArrowRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                </>
              )}

              {/* ── OpEx Row ───────────────────────────────────────────── */}
              <tr
                className="hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => toggleRow('opex')}
              >
                <td className="px-4 py-3 text-sm text-gray-700">
                  <div className="flex items-center gap-1.5">
                    {expandedRows.has('opex')
                      ? <ChevronDown className="w-4 h-4 text-gray-400" />
                      : <ChevronRight className="w-4 h-4 text-gray-400" />
                    }
                    Operating Expenses
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-700">
                  ({formatCurrency(y1.opex)})
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-700">
                  ({formatCurrency(y2.opex)})
                </td>
                <td className="px-4 py-3 text-sm text-center">
                  <GrowthBadge value={growthPct(y2.opex, y1.opex)} />
                </td>
                {showY3 && (
                  <>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">
                      ({formatCurrency(y3.opex)})
                    </td>
                    <td className="px-4 py-3 text-sm text-center">
                      <GrowthBadge value={growthPct(y3.opex, y2.opex)} />
                    </td>
                  </>
                )}
              </tr>

              {/* OpEx Expanded — full per-line table with subscription badges */}
              {expandedRows.has('opex') && (
                <>
                  {opexPerLine.map(line => {
                    const isSub = subscriptionLines.some(s => s.id === line.id);
                    return (
                      <tr key={line.id} className="bg-gray-50/50">
                        <td className="pl-10 pr-4 py-2 text-sm text-gray-600">
                          {line.name}
                          {isSub && (
                            <span className="ml-1.5 text-[10px] font-semibold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded">
                              Sub
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-sm text-right text-gray-600">
                          {formatCurrency(line.y1)}
                        </td>
                        <td className="px-4 py-2 text-sm text-right text-gray-600">
                          {formatCurrency(line.y2)}
                        </td>
                        <td className="px-4 py-2 text-sm text-center">
                          <GrowthBadge value={growthPct(line.y2, line.y1)} />
                        </td>
                        {showY3 && (
                          <>
                            <td className="px-4 py-2 text-sm text-right text-gray-600">
                              {formatCurrency(line.y3)}
                            </td>
                            <td className="px-4 py-2 text-sm text-center">
                              <GrowthBadge value={growthPct(line.y3, line.y2)} />
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                  <tr className="bg-gray-50/50">
                    <td colSpan={colCount} className="pl-10 pr-4 py-2 flex items-center gap-4">
                      <button
                        onClick={() => actions.goToStep(5)}
                        className="text-xs font-medium text-brand-navy hover:underline flex items-center gap-1"
                      >
                        Edit expenses in Step 5 <ArrowRight className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => actions.goToStep(6)}
                        className="text-xs font-medium text-brand-navy hover:underline flex items-center gap-1"
                      >
                        Audit subscriptions in Step 6 <ArrowRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                </>
              )}


              {/* ── Other Expenses Row (if any) ────────────────────────── */}
              {(y1.otherExpenses > 0 || y2.otherExpenses > 0 || y3.otherExpenses > 0) && (
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-700">
                    <div className="flex items-center gap-1.5">
                      <span className="w-4" />
                      Other Expenses
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700">
                    ({formatCurrency(y1.otherExpenses)})
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700">
                    ({formatCurrency(y2.otherExpenses)})
                  </td>
                  <td className="px-4 py-3 text-sm text-center">
                    <GrowthBadge value={growthPct(y2.otherExpenses, y1.otherExpenses)} />
                  </td>
                  {showY3 && (
                    <>
                      <td className="px-4 py-3 text-sm text-right text-gray-700">
                        ({formatCurrency(y3.otherExpenses)})
                      </td>
                      <td className="px-4 py-3 text-sm text-center">
                        <GrowthBadge value={growthPct(y3.otherExpenses, y2.otherExpenses)} />
                      </td>
                    </>
                  )}
                </tr>
              )}

              {/* ── Net Profit Row ─────────────────────────────────────── */}
              <tr className="bg-brand-navy text-white">
                <td className="px-4 py-3 text-sm font-bold">
                  <div className="flex items-center gap-1.5">
                    <span className="w-4" />
                    Net Profit
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-right font-bold">{formatCurrency(y1.netProfit)}</td>
                <td className="px-4 py-3 text-sm text-right font-bold">{formatCurrency(y2.netProfit)}</td>
                <td className="px-4 py-3 text-sm text-center">
                  {y1.netProfit !== 0 && y2.netProfit !== 0 ? (
                    <span className={`text-xs font-medium ${y2.netProfit >= y1.netProfit ? 'text-green-300' : 'text-red-300'}`}>
                      {formatGrowth(growthPct(y2.netProfit, y1.netProfit))}
                    </span>
                  ) : <span className="text-white/40">—</span>}
                </td>
                {showY3 && (
                  <>
                    <td className="px-4 py-3 text-sm text-right font-bold">{formatCurrency(y3.netProfit)}</td>
                    <td className="px-4 py-3 text-sm text-center">
                      {y2.netProfit !== 0 && y3.netProfit !== 0 ? (
                        <span className={`text-xs font-medium ${y3.netProfit >= y2.netProfit ? 'text-green-300' : 'text-red-300'}`}>
                          {formatGrowth(growthPct(y3.netProfit, y2.netProfit))}
                        </span>
                      ) : <span className="text-white/40">—</span>}
                    </td>
                  </>
                )}
              </tr>
              <tr className="bg-brand-navy text-white/70">
                <td className="px-4 pb-3 pt-0 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-4" />
                    Net Margin %
                  </div>
                </td>
                <td className="px-4 pb-3 pt-0 text-xs text-right">{formatPercent(y1.netProfitPct)}</td>
                <td className="px-4 pb-3 pt-0 text-xs text-right">{formatPercent(y2.netProfitPct)}</td>
                <td className="px-4 pb-3 pt-0"></td>
                {showY3 && (
                  <>
                    <td className="px-4 pb-3 pt-0 text-xs text-right">{formatPercent(y3.netProfitPct)}</td>
                    <td className="px-4 pb-3 pt-0"></td>
                  </>
                )}
              </tr>

            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Growth Badge Component ──────────────────────────────────────────────────

function GrowthBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-gray-400">—</span>;

  const isPositive = value >= 0;

  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${
      isPositive ? 'text-green-700' : 'text-red-700'
    }`}>
      {isPositive
        ? <TrendingUp className="w-3 h-3" />
        : <TrendingDown className="w-3 h-3" />
      }
      {isPositive ? '+' : ''}{value.toFixed(1)}%
    </span>
  );
}
