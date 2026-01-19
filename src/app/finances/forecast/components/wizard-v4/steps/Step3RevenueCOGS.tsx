'use client';

import { useState, useMemo, useEffect } from 'react';
import { Plus, Trash2, DollarSign, Percent, Info, Lock } from 'lucide-react';
import { ForecastWizardState, WizardActions, formatCurrency, generateMonthKeys, CostBehavior } from '../types';

interface Step3RevenueCOGSProps {
  state: ForecastWizardState;
  actions: WizardActions;
  fiscalYear: number;
}

interface QuarterlyPcts {
  q1: number;
  q2: number;
  q3: number;
  q4: number;
}

export function Step3RevenueCOGS({ state, actions, fiscalYear }: Step3RevenueCOGSProps) {
  const { revenuePattern, revenueLines, cogsLines, activeYear, goals, priorYear, currentYTD } = state;
  const [showAddRevenue, setShowAddRevenue] = useState(false);
  const [showAddCOGS, setShowAddCOGS] = useState(false);
  const [newLineName, setNewLineName] = useState('');

  // Quarterly percentage state for Year 2 and Year 3
  const [year2Pcts, setYear2Pcts] = useState<QuarterlyPcts>({ q1: 25, q2: 25, q3: 25, q4: 25 });
  const [year3Pcts, setYear3Pcts] = useState<QuarterlyPcts>({ q1: 25, q2: 25, q3: 25, q4: 25 });

  // Initialize percentages from prior year seasonality
  useEffect(() => {
    const seasonality = priorYear?.seasonalityPattern || Array(12).fill(8.33);

    // Aggregate monthly to quarterly
    const q1Pct = (seasonality[0] || 8.33) + (seasonality[1] || 8.33) + (seasonality[2] || 8.33);
    const q2Pct = (seasonality[3] || 8.33) + (seasonality[4] || 8.33) + (seasonality[5] || 8.33);
    const q3Pct = (seasonality[6] || 8.33) + (seasonality[7] || 8.33) + (seasonality[8] || 8.33);
    const q4Pct = (seasonality[9] || 8.33) + (seasonality[10] || 8.33) + (seasonality[11] || 8.33);

    // Normalize to 100%
    const total = q1Pct + q2Pct + q3Pct + q4Pct;
    const normalized = {
      q1: Math.round((q1Pct / total) * 100),
      q2: Math.round((q2Pct / total) * 100),
      q3: Math.round((q3Pct / total) * 100),
      q4: Math.round((q4Pct / total) * 100),
    };
    // Adjust for rounding to ensure sum = 100
    const sum = normalized.q1 + normalized.q2 + normalized.q3 + normalized.q4;
    if (sum !== 100) {
      normalized.q4 += (100 - sum);
    }

    setYear2Pcts(normalized);
    setYear3Pcts(normalized);
  }, [priorYear?.seasonalityPattern]);

  const months = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
  const monthKeys = generateMonthKeys(fiscalYear - 1);

  const isMonthly = activeYear === 1;

  // Determine which months are actuals (locked) vs projected (editable)
  const actualMonthKeys = useMemo(() => {
    if (!currentYTD?.revenue_by_month) return new Set<string>();
    return new Set(Object.keys(currentYTD.revenue_by_month));
  }, [currentYTD]);

  const isActualMonth = (monthKey: string) => actualMonthKeys.has(monthKey);

  // Get current percentages based on active year
  const currentPcts = activeYear === 2 ? year2Pcts : year3Pcts;
  const setCurrentPcts = activeYear === 2 ? setYear2Pcts : setYear3Pcts;
  const pctTotal = currentPcts.q1 + currentPcts.q2 + currentPcts.q3 + currentPcts.q4;

  // Handle percentage change for a quarter
  const handlePctChange = (quarter: 'q1' | 'q2' | 'q3' | 'q4', value: string) => {
    const numValue = Math.max(0, Math.min(100, parseInt(value) || 0));
    const newPcts = { ...currentPcts, [quarter]: numValue };
    setCurrentPcts(newPcts);
  };

  // Calculate line percentages for all years
  const getLinePercentages = () => {
    const percentages: Record<string, number> = {};

    if (revenueLines.length === 0) return percentages;

    // Debug: Log Year 1 data to understand the split
    if (activeYear > 1) {
      console.log('[getLinePercentages] Debug for Year', activeYear, {
        revenueLineCount: revenueLines.length,
        lines: revenueLines.map(l => ({
          id: l.id,
          name: l.name,
          year1MonthlyKeys: Object.keys(l.year1Monthly),
          year1MonthlyValues: Object.values(l.year1Monthly),
          year1Total: Object.values(l.year1Monthly).reduce((s, v) => s + v, 0),
          year2Quarterly: l.year2Quarterly,
          year3Quarterly: l.year3Quarterly,
        })),
      });
    }

    if (activeYear === 1) {
      // For Year 1, calculate % from current values (actuals + projections)
      let year1Total = 0;
      revenueLines.forEach((line) => {
        const lineTotal = Object.values(line.year1Monthly).reduce((sum, val) => sum + val, 0);
        year1Total += lineTotal;
      });

      if (year1Total > 0) {
        revenueLines.forEach((line) => {
          const lineTotal = Object.values(line.year1Monthly).reduce((sum, val) => sum + val, 0);
          percentages[line.id] = Math.round((lineTotal / year1Total) * 100);
        });
      } else {
        // Fallback to equal split
        revenueLines.forEach((line) => {
          percentages[line.id] = Math.round(100 / revenueLines.length);
        });
      }
    } else {
      // For Year 2/3, check if values are set
      let hasYearValues = false;
      let yearTotalFromLines = 0;
      revenueLines.forEach((line) => {
        const lineTotal = activeYear === 2
          ? line.year2Quarterly.q1 + line.year2Quarterly.q2 + line.year2Quarterly.q3 + line.year2Quarterly.q4
          : line.year3Quarterly.q1 + line.year3Quarterly.q2 + line.year3Quarterly.q3 + line.year3Quarterly.q4;
        yearTotalFromLines += lineTotal;
        if (lineTotal > 0) hasYearValues = true;
      });

      if (hasYearValues && yearTotalFromLines > 0) {
        revenueLines.forEach((line) => {
          const lineTotal = activeYear === 2
            ? line.year2Quarterly.q1 + line.year2Quarterly.q2 + line.year2Quarterly.q3 + line.year2Quarterly.q4
            : line.year3Quarterly.q1 + line.year3Quarterly.q2 + line.year3Quarterly.q3 + line.year3Quarterly.q4;
          percentages[line.id] = Math.round((lineTotal / yearTotalFromLines) * 100);
        });
      } else {
        // Default to Year 1 split
        let year1Total = 0;
        revenueLines.forEach((line) => {
          const lineTotal = Object.values(line.year1Monthly).reduce((sum, val) => sum + val, 0);
          year1Total += lineTotal;
        });

        if (year1Total > 0) {
          revenueLines.forEach((line) => {
            const lineTotal = Object.values(line.year1Monthly).reduce((sum, val) => sum + val, 0);
            percentages[line.id] = Math.round((lineTotal / year1Total) * 100);
          });
        } else {
          revenueLines.forEach((line) => {
            percentages[line.id] = Math.round(100 / revenueLines.length);
          });
        }
      }
    }

    // Ensure percentages sum to 100
    const total = Object.values(percentages).reduce((a, b) => a + b, 0);
    if (total !== 100 && revenueLines.length > 0) {
      const lastLineId = revenueLines[revenueLines.length - 1].id;
      percentages[lastLineId] += (100 - total);
    }

    return percentages;
  };

  const linePercentages = getLinePercentages();
  const linePctTotal = Object.values(linePercentages).reduce((a, b) => a + b, 0);

  // Handle line percentage change
  const handleLinePctChange = (lineId: string, value: string) => {
    const newPct = Math.max(0, Math.min(100, parseInt(value) || 0));

    if (activeYear === 1) {
      // For Year 1, redistribute projected months only (keep actuals locked)
      const yearTarget = goals.year1?.revenue || 0;
      const line = revenueLines.find(l => l.id === lineId);
      if (!line || yearTarget <= 0) return;

      // Calculate total actuals for this line (locked months)
      let lineActualsTotal = 0;
      monthKeys.forEach((key) => {
        if (isActualMonth(key)) {
          lineActualsTotal += line.year1Monthly[key] || 0;
        }
      });

      // Calculate remaining target for projected months
      const lineTarget = yearTarget * (newPct / 100);
      const lineProjectedTarget = Math.max(0, lineTarget - lineActualsTotal);

      // Get seasonality for remaining months
      const seasonality = priorYear?.seasonalityPattern || Array(12).fill(8.33);
      let totalRemainingSeasonality = 0;
      monthKeys.forEach((key, idx) => {
        if (!isActualMonth(key)) {
          totalRemainingSeasonality += seasonality[idx] || 8.33;
        }
      });

      // Build new monthly values
      const newMonthly: { [key: string]: number } = {};
      monthKeys.forEach((key, idx) => {
        if (isActualMonth(key)) {
          // Keep actual values
          newMonthly[key] = line.year1Monthly[key] || 0;
        } else if (totalRemainingSeasonality > 0 && lineProjectedTarget > 0) {
          // Distribute using seasonality
          const monthSeasonality = seasonality[idx] || 8.33;
          newMonthly[key] = Math.round(lineProjectedTarget * (monthSeasonality / totalRemainingSeasonality));
        } else {
          newMonthly[key] = 0;
        }
      });

      actions.updateRevenueLine(lineId, { year1Monthly: newMonthly });
    } else {
      // Year 2/3 - distribute across quarters
      const yearTarget = activeYear === 2 ? (goals.year2?.revenue || 0) : (goals.year3?.revenue || 0);
      const qPcts = activeYear === 2 ? year2Pcts : year3Pcts;
      const qTotal = qPcts.q1 + qPcts.q2 + qPcts.q3 + qPcts.q4;

      if (yearTarget > 0 && qTotal > 0) {
        const lineTarget = yearTarget * (newPct / 100);
        const quarterly = {
          q1: Math.round(lineTarget * (qPcts.q1 / qTotal)),
          q2: Math.round(lineTarget * (qPcts.q2 / qTotal)),
          q3: Math.round(lineTarget * (qPcts.q3 / qTotal)),
          q4: Math.round(lineTarget * (qPcts.q4 / qTotal)),
        };

        if (activeYear === 2) {
          actions.updateRevenueLine(lineId, { year2Quarterly: quarterly });
        } else {
          actions.updateRevenueLine(lineId, { year3Quarterly: quarterly });
        }
      }
    }
  };

  // Apply percentages to redistribute revenue for Year 2 or 3
  const applyPercentages = () => {
    const yearTarget = activeYear === 2 ? (goals.year2?.revenue || 0) : (goals.year3?.revenue || 0);
    const pcts = activeYear === 2 ? year2Pcts : year3Pcts;
    const total = pcts.q1 + pcts.q2 + pcts.q3 + pcts.q4;

    if (total === 0) return;

    // Use current line percentages or default to equal split
    const currentLinePcts = getLinePercentages();
    const linePctSum = Object.values(currentLinePcts).reduce((a, b) => a + b, 0);

    revenueLines.forEach((line) => {
      const linePct = linePctSum > 0 ? (currentLinePcts[line.id] || 0) / linePctSum : 1 / revenueLines.length;
      const lineTarget = yearTarget * linePct;
      const quarterly = {
        q1: Math.round(lineTarget * (pcts.q1 / total)),
        q2: Math.round(lineTarget * (pcts.q2 / total)),
        q3: Math.round(lineTarget * (pcts.q3 / total)),
        q4: Math.round(lineTarget * (pcts.q4 / total)),
      };

      if (activeYear === 2) {
        actions.updateRevenueLine(line.id, { year2Quarterly: quarterly });
      } else {
        actions.updateRevenueLine(line.id, { year3Quarterly: quarterly });
      }
    });
  };

  // Calculate totals for actuals vs projections
  const ytdActualTotal = currentYTD?.total_revenue || 0;
  const completedMonthsCount = currentYTD?.months_count || 0;
  const remainingMonthsCount = 12 - completedMonthsCount;

  const handlePatternChange = (pattern: 'seasonal' | 'straight-line' | 'manual') => {
    actions.setRevenuePattern(pattern);

    // Get targets for ALL years
    const year1Target = goals.year1?.revenue || 0;
    const year2Target = goals.year2?.revenue || 0;
    const year3Target = goals.year3?.revenue || 0;

    // For Year 1, calculate remaining revenue to distribute (target - actuals)
    const year1RemainingTarget = Math.max(0, year1Target - ytdActualTotal);

    const seasonality = priorYear?.seasonalityPattern || Array(12).fill(8.33);

    // Calculate Year 1 line proportions for distributing Year 2/3
    const year1LineTotals: Record<string, number> = {};
    let year1TotalFromLines = 0;
    revenueLines.forEach((line) => {
      const lineTotal = Object.values(line.year1Monthly).reduce((sum, val) => sum + val, 0);
      year1LineTotals[line.id] = lineTotal;
      year1TotalFromLines += lineTotal;
    });

    // Recalculate revenue lines for ALL years based on pattern
    revenueLines.forEach((line) => {
      const updates: Partial<typeof line> = {};

      // === YEAR 1 (Monthly) ===
      if (pattern === 'straight-line') {
        const lineRemainingTarget = year1RemainingTarget / revenueLines.length;
        const projectedMonthlyAmount = remainingMonthsCount > 0
          ? Math.round(lineRemainingTarget / remainingMonthsCount)
          : 0;

        const monthly: { [key: string]: number } = {};
        monthKeys.forEach((key) => {
          if (isActualMonth(key)) {
            monthly[key] = line.year1Monthly[key] || 0;
          } else {
            monthly[key] = projectedMonthlyAmount;
          }
        });
        updates.year1Monthly = monthly;
      } else if (pattern === 'seasonal') {
        let totalRemainingSeasonality = 0;
        monthKeys.forEach((key, idx) => {
          if (!isActualMonth(key)) {
            totalRemainingSeasonality += seasonality[idx] || 8.33;
          }
        });

        const monthly: { [key: string]: number } = {};
        const lineRemainingTarget = year1RemainingTarget / revenueLines.length;

        monthKeys.forEach((key, idx) => {
          if (isActualMonth(key)) {
            monthly[key] = line.year1Monthly[key] || 0;
          } else if (totalRemainingSeasonality > 0 && lineRemainingTarget > 0) {
            const monthSeasonality = seasonality[idx] || 8.33;
            const monthFactor = monthSeasonality / totalRemainingSeasonality;
            monthly[key] = Math.round(lineRemainingTarget * monthFactor);
          } else {
            monthly[key] = 0;
          }
        });
        updates.year1Monthly = monthly;
      }

      // === YEAR 2 (Quarterly) ===
      if (year2Target > 0) {
        // Use Year 1 proportions, fallback to equal split
        const lineYear1Pct = year1TotalFromLines > 0
          ? (year1LineTotals[line.id] || 0) / year1TotalFromLines
          : 1 / revenueLines.length;
        const lineYear2Target = year2Target * lineYear1Pct;

        if (pattern === 'seasonal') {
          // Aggregate monthly seasonality into quarters
          // Q1: Jul(0) + Aug(1) + Sep(2), Q2: Oct(3) + Nov(4) + Dec(5)
          // Q3: Jan(6) + Feb(7) + Mar(8), Q4: Apr(9) + May(10) + Jun(11)
          const q1Pct = (seasonality[0] || 8.33) + (seasonality[1] || 8.33) + (seasonality[2] || 8.33);
          const q2Pct = (seasonality[3] || 8.33) + (seasonality[4] || 8.33) + (seasonality[5] || 8.33);
          const q3Pct = (seasonality[6] || 8.33) + (seasonality[7] || 8.33) + (seasonality[8] || 8.33);
          const q4Pct = (seasonality[9] || 8.33) + (seasonality[10] || 8.33) + (seasonality[11] || 8.33);
          const totalPct = q1Pct + q2Pct + q3Pct + q4Pct;

          updates.year2Quarterly = {
            q1: Math.round(lineYear2Target * (q1Pct / totalPct)),
            q2: Math.round(lineYear2Target * (q2Pct / totalPct)),
            q3: Math.round(lineYear2Target * (q3Pct / totalPct)),
            q4: Math.round(lineYear2Target * (q4Pct / totalPct)),
          };
        } else {
          // Straight-line: equal quarters
          const quarterlyAmount = Math.round(lineYear2Target / 4);
          updates.year2Quarterly = {
            q1: quarterlyAmount,
            q2: quarterlyAmount,
            q3: quarterlyAmount,
            q4: quarterlyAmount,
          };
        }
      }

      // === YEAR 3 (Quarterly) ===
      if (year3Target > 0) {
        // Use Year 1 proportions, fallback to equal split
        const lineYear1Pct = year1TotalFromLines > 0
          ? (year1LineTotals[line.id] || 0) / year1TotalFromLines
          : 1 / revenueLines.length;
        const lineYear3Target = year3Target * lineYear1Pct;

        if (pattern === 'seasonal') {
          // Apply same seasonality pattern to Year 3
          const q1Pct = (seasonality[0] || 8.33) + (seasonality[1] || 8.33) + (seasonality[2] || 8.33);
          const q2Pct = (seasonality[3] || 8.33) + (seasonality[4] || 8.33) + (seasonality[5] || 8.33);
          const q3Pct = (seasonality[6] || 8.33) + (seasonality[7] || 8.33) + (seasonality[8] || 8.33);
          const q4Pct = (seasonality[9] || 8.33) + (seasonality[10] || 8.33) + (seasonality[11] || 8.33);
          const totalPct = q1Pct + q2Pct + q3Pct + q4Pct;

          updates.year3Quarterly = {
            q1: Math.round(lineYear3Target * (q1Pct / totalPct)),
            q2: Math.round(lineYear3Target * (q2Pct / totalPct)),
            q3: Math.round(lineYear3Target * (q3Pct / totalPct)),
            q4: Math.round(lineYear3Target * (q4Pct / totalPct)),
          };
        } else {
          // Straight-line: equal quarters
          const quarterlyAmount = Math.round(lineYear3Target / 4);
          updates.year3Quarterly = {
            q1: quarterlyAmount,
            q2: quarterlyAmount,
            q3: quarterlyAmount,
            q4: quarterlyAmount,
          };
        }
      }

      // Apply all updates at once
      if (Object.keys(updates).length > 0) {
        actions.updateRevenueLine(line.id, updates);
      }
    });
  };

  const handleAddRevenueLine = () => {
    if (!newLineName.trim()) return;
    actions.addRevenueLine({
      name: newLineName.trim(),
      year1Monthly: {},
      year2Quarterly: { q1: 0, q2: 0, q3: 0, q4: 0 },
      year3Quarterly: { q1: 0, q2: 0, q3: 0, q4: 0 },
    });
    setNewLineName('');
    setShowAddRevenue(false);
  };

  const handleAddCOGSLine = () => {
    if (!newLineName.trim()) return;
    actions.addCOGSLine({
      name: newLineName.trim(),
      costBehavior: 'variable',
      percentOfRevenue: 0,
    });
    setNewLineName('');
    setShowAddCOGS(false);
  };

  // Calculate COGS amount for a line based on cost behavior
  const calculateCOGSAmount = (line: typeof cogsLines[0]) => {
    if (line.costBehavior === 'fixed') {
      return (line.monthlyAmount || 0) * 12;
    }
    return (totalRevenue * (line.percentOfRevenue || 0)) / 100;
  };

  const handleRevenueChange = (lineId: string, period: string, value: string) => {
    const numValue = parseFloat(value.replace(/[^0-9.]/g, '')) || 0;
    const line = revenueLines.find((l) => l.id === lineId);
    if (!line) return;

    if (activeYear === 1) {
      actions.updateRevenueLine(lineId, {
        year1Monthly: { ...line.year1Monthly, [period]: numValue },
      });
    } else if (activeYear === 2) {
      const quarterKey = period as 'q1' | 'q2' | 'q3' | 'q4';
      actions.updateRevenueLine(lineId, {
        year2Quarterly: { ...line.year2Quarterly, [quarterKey]: numValue },
      });
    } else {
      const quarterKey = period as 'q1' | 'q2' | 'q3' | 'q4';
      actions.updateRevenueLine(lineId, {
        year3Quarterly: { ...line.year3Quarterly, [quarterKey]: numValue },
      });
    }
  };

  const getLineTotal = (line: typeof revenueLines[0]) => {
    if (activeYear === 1) {
      return Object.values(line.year1Monthly).reduce((a, b) => a + b, 0);
    } else if (activeYear === 2) {
      const q = line.year2Quarterly;
      return q.q1 + q.q2 + q.q3 + q.q4;
    } else {
      const q = line.year3Quarterly;
      return q.q1 + q.q2 + q.q3 + q.q4;
    }
  };

  const totalRevenue = revenueLines.reduce((sum, line) => sum + getLineTotal(line), 0);
  const totalCOGS = cogsLines.reduce((sum, line) => sum + calculateCOGSAmount(line), 0);
  const grossProfit = totalRevenue - totalCOGS;
  const grossProfitPct = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

  // Check if lines came from Xero/CSV
  const hasImportedData = priorYear && (priorYear.revenue.byLine.length > 0 || priorYear.cogs.byLine.length > 0);

  return (
    <div className="space-y-6">
      {/* YTD Actuals Summary - Only show for Year 1 when we have actuals */}
      {activeYear === 1 && completedMonthsCount > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-blue-900">
                  Year-to-Date Actuals ({completedMonthsCount} of 12 months complete)
                </p>
                <div className="text-right">
                  <span className="text-lg font-bold text-blue-900">{formatCurrency(ytdActualTotal)}</span>
                  <span className="text-sm text-blue-700 ml-2">YTD Actual</span>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-blue-600">Target:</span>
                  <span className="ml-2 font-medium text-blue-900">{formatCurrency(goals.year1?.revenue || 0)}</span>
                </div>
                <div>
                  <span className="text-blue-600">Remaining:</span>
                  <span className="ml-2 font-medium text-blue-900">{formatCurrency(Math.max(0, (goals.year1?.revenue || 0) - ytdActualTotal))}</span>
                </div>
                <div>
                  <span className="text-blue-600">Months left:</span>
                  <span className="ml-2 font-medium text-blue-900">{remainingMonthsCount}</span>
                </div>
              </div>
              <p className="text-xs text-blue-700 mt-3">
                <Lock className="w-3 h-3 inline mr-1" />
                Blue-highlighted months are locked actuals from Xero. Use Seasonal or Straight-line to distribute the remaining target across projected months.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Data Source Notice */}
      {hasImportedData && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-start gap-3">
          <Info className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-gray-700">
              Lines imported from your chart of accounts
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Revenue and COGS lines have been pre-populated from your FY{fiscalYear - 1} data.
              You can add, edit, or remove lines as needed.
            </p>
          </div>
        </div>
      )}

      {/* Pattern Selection */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Revenue Distribution Pattern</h3>
        <div className="flex gap-3">
          {[
            { value: 'seasonal', label: 'Seasonal', desc: 'Follow prior year pattern' },
            { value: 'straight-line', label: 'Straight Line', desc: 'Equal monthly/quarterly' },
            { value: 'manual', label: 'Manual', desc: 'Enter each cell' },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => handlePatternChange(option.value as 'seasonal' | 'straight-line' | 'manual')}
              className={`flex-1 p-3 rounded-lg border-2 transition-all text-left ${
                revenuePattern === option.value
                  ? 'border-brand-navy bg-brand-navy/5'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <span className="block text-sm font-medium text-gray-900">{option.label}</span>
              <span className="block text-xs text-gray-500">{option.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Revenue Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Revenue</h3>
          <button
            onClick={() => setShowAddRevenue(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-brand-navy hover:bg-brand-navy/5 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Line
          </button>
        </div>

        {showAddRevenue && (
          <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex gap-2">
            <input
              type="text"
              value={newLineName}
              onChange={(e) => setNewLineName(e.target.value)}
              placeholder="Enter line item name..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-navy/20 focus:border-brand-navy"
              autoFocus
            />
            <button
              onClick={handleAddRevenueLine}
              className="px-4 py-2 bg-brand-navy text-white text-sm font-medium rounded-lg hover:bg-brand-navy-800 transition-colors"
            >
              Add
            </button>
            <button
              onClick={() => {
                setShowAddRevenue(false);
                setNewLineName('');
              }}
              className="px-4 py-2 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              {/* Percentage row for Year 2/3 */}
              {activeYear > 1 && (
                <tr className="bg-blue-50 border-b border-blue-100">
                  <th className="px-4 py-2 text-left sticky left-0 bg-blue-50 min-w-[200px]">
                    <div className="flex items-center gap-2">
                      <Percent className="w-3.5 h-3.5 text-blue-600" />
                      <span className="text-xs font-medium text-blue-700">Quarterly %</span>
                    </div>
                  </th>
                  {/* Empty cell for % Split column alignment */}
                  <th className="px-2 py-2 w-20"></th>
                  {(['q1', 'q2', 'q3', 'q4'] as const).map((q) => (
                    <th key={q} className="px-2 py-2 w-32">
                      <div className="relative">
                        <input
                          type="number"
                          value={currentPcts[q]}
                          onChange={(e) => handlePctChange(q, e.target.value)}
                          min="0"
                          max="100"
                          className="w-full px-2 py-1.5 pr-6 text-sm border border-blue-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-right bg-white"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-400 text-xs">%</span>
                      </div>
                    </th>
                  ))}
                  <th className="px-2 py-2 w-32">
                    <div className="flex items-center justify-end gap-2">
                      <span className={`text-xs font-bold whitespace-nowrap ${
                        pctTotal === 100 ? 'text-green-600' : pctTotal < 100 ? 'text-amber-600' : 'text-red-600'
                      }`}>
                        {pctTotal}%{pctTotal !== 100 && (pctTotal < 100 ? ' under' : ' over')}
                      </span>
                      <button
                        onClick={applyPercentages}
                        disabled={pctTotal !== 100}
                        className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                          pctTotal === 100
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        Apply
                      </button>
                    </div>
                  </th>
                  <th className="px-2 py-2 w-10"></th>
                </tr>
              )}
              <tr>
                <th className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase sticky left-0 bg-gray-50 ${!isMonthly ? 'min-w-[200px]' : ''}`}>
                  Line Item
                </th>
                {/* Show % column for all years */}
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase w-20">
                  % Split
                </th>
                {isMonthly
                  ? months.map((m, idx) => {
                      const monthKey = monthKeys[idx];
                      const isActual = isActualMonth(monthKey);
                      return (
                        <th
                          key={m}
                          className={`px-3 py-3 text-right text-xs font-medium uppercase w-20 ${
                            isActual ? 'bg-blue-50 text-blue-700' : 'text-gray-500'
                          }`}
                        >
                          <div className="flex flex-col items-end">
                            <span>{m}</span>
                            {isActual && (
                              <span className="text-[10px] font-normal text-blue-500">Actual</span>
                            )}
                          </div>
                        </th>
                      );
                    })
                  : quarters.map((q) => (
                      <th key={q} className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase w-32">
                        {q}
                      </th>
                    ))}
                <th className={`px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase ${!isMonthly ? 'w-32' : ''}`}>Total</th>
                <th className="px-2 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {revenueLines.map((line) => (
                <tr key={line.id} className="hover:bg-gray-50">
                  <td className={`px-4 py-2 text-sm font-medium text-gray-900 sticky left-0 bg-white ${!isMonthly ? 'min-w-[200px]' : ''}`}>
                    {line.name}
                  </td>
                  {/* % Split column for all years */}
                  <td className="px-2 py-2">
                    <div className="relative">
                      <input
                        type="number"
                        value={linePercentages[line.id] || 0}
                        onChange={(e) => handleLinePctChange(line.id, e.target.value)}
                        min="0"
                        max="100"
                        className="w-16 px-2 py-1.5 pr-6 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-brand-navy focus:border-brand-navy text-right"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">%</span>
                    </div>
                  </td>
                  {isMonthly
                    ? monthKeys.map((key, idx) => {
                        const isActual = isActualMonth(key);
                        return (
                          <td key={key} className={`px-1 py-1 ${isActual ? 'bg-blue-50' : ''}`}>
                            {isActual ? (
                              // Actual month - locked display
                              <div className="w-full px-2 py-1 text-sm text-right bg-blue-100 border border-blue-200 rounded text-blue-900 font-medium flex items-center justify-end gap-1">
                                <Lock className="w-3 h-3 text-blue-500" />
                                <span>{line.year1Monthly[key] ? line.year1Monthly[key].toLocaleString() : '0'}</span>
                              </div>
                            ) : (
                              // Projected month - editable
                              <input
                                type="text"
                                value={line.year1Monthly[key] ? line.year1Monthly[key].toLocaleString() : ''}
                                onChange={(e) => handleRevenueChange(line.id, key, e.target.value)}
                                placeholder="0"
                                className="w-full px-2 py-1 text-sm text-right border border-gray-200 rounded focus:ring-1 focus:ring-brand-navy focus:border-brand-navy"
                              />
                            )}
                          </td>
                        );
                      })
                    : ['q1', 'q2', 'q3', 'q4'].map((q) => {
                        const qValue = activeYear === 2
                          ? line.year2Quarterly[q as keyof typeof line.year2Quarterly]
                          : line.year3Quarterly[q as keyof typeof line.year3Quarterly];
                        return (
                          <td key={q} className="px-2 py-2 text-right">
                            <span className="text-sm text-gray-900">
                              {formatCurrency(qValue || 0)}
                            </span>
                          </td>
                        );
                      })}
                  <td className={`px-4 py-2 text-sm font-semibold text-gray-900 text-right ${!isMonthly ? 'w-32' : ''}`}>
                    {formatCurrency(getLineTotal(line))}
                  </td>
                  <td className="px-2 py-2">
                    <button
                      onClick={() => actions.removeRevenueLine(line.id)}
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {/* Total Row */}
              <tr className="bg-gray-50 font-semibold">
                <td className={`px-4 py-3 text-sm text-gray-900 sticky left-0 bg-gray-50 ${!isMonthly ? 'min-w-[200px]' : ''}`}>TOTAL REVENUE</td>
                {/* % Total for all years */}
                <td className="px-2 py-3 text-center">
                  <span className={`text-xs font-bold ${linePctTotal === 100 ? 'text-green-600' : 'text-amber-600'}`}>
                    {linePctTotal}%
                  </span>
                </td>
                {isMonthly
                  ? monthKeys.map((key) => {
                      const monthTotal = revenueLines.reduce((sum, line) => sum + (line.year1Monthly[key] || 0), 0);
                      const isActual = isActualMonth(key);
                      return (
                        <td key={key} className={`px-3 py-3 text-sm text-right ${isActual ? 'bg-blue-100 text-blue-900' : 'text-gray-900'}`}>
                          {monthTotal > 0 ? formatCurrency(monthTotal) : '-'}
                        </td>
                      );
                    })
                  : ['q1', 'q2', 'q3', 'q4'].map((q) => {
                      const qTotal = revenueLines.reduce((sum, line) => {
                        const quarterly = activeYear === 2 ? line.year2Quarterly : line.year3Quarterly;
                        return sum + (quarterly[q as keyof typeof quarterly] || 0);
                      }, 0);
                      return (
                        <td key={q} className="px-4 py-3 text-sm text-gray-900 text-right">
                          {qTotal > 0 ? formatCurrency(qTotal) : '-'}
                        </td>
                      );
                    })}
                <td className={`px-4 py-3 text-sm text-gray-900 text-right ${!isMonthly ? 'w-32' : ''}`}>{formatCurrency(totalRevenue)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* COGS Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-gray-900">Cost of Goods Sold</h3>
            <div className="group relative">
              <Info className="w-4 h-4 text-gray-400 cursor-help" />
              <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-64 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-10">
                <p className="mb-1"><strong>Variable:</strong> Costs that change with revenue (e.g., materials, commissions)</p>
                <p><strong>Fixed:</strong> Costs that stay constant regardless of revenue (rare for COGS)</p>
              </div>
            </div>
          </div>
          <button
            onClick={() => setShowAddCOGS(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-brand-navy hover:bg-brand-navy/5 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Line
          </button>
        </div>

        {showAddCOGS && (
          <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex gap-2">
            <input
              type="text"
              value={newLineName}
              onChange={(e) => setNewLineName(e.target.value)}
              placeholder="Enter COGS item name..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-navy/20 focus:border-brand-navy"
              autoFocus
            />
            <button
              onClick={handleAddCOGSLine}
              className="px-4 py-2 bg-brand-navy text-white text-sm font-medium rounded-lg hover:bg-brand-navy-800 transition-colors"
            >
              Add
            </button>
            <button
              onClick={() => {
                setShowAddCOGS(false);
                setNewLineName('');
              }}
              className="px-4 py-2 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Line Item</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase w-32">Cost Type</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase w-36">Value</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Estimated Annual</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cogsLines.map((line) => (
                <tr key={line.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900">{line.name}</div>
                    {line.priorYearTotal && (
                      <div className="text-xs text-gray-500">
                        Prior year: {formatCurrency(line.priorYearTotal)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1 justify-center">
                      <button
                        onClick={() => actions.updateCOGSLine(line.id, { costBehavior: 'variable' })}
                        className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                          line.costBehavior === 'variable'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                        title="Variable - scales with revenue"
                      >
                        Variable
                      </button>
                      <button
                        onClick={() => actions.updateCOGSLine(line.id, { costBehavior: 'fixed' })}
                        className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                          line.costBehavior === 'fixed'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                        title="Fixed - constant monthly amount"
                      >
                        Fixed
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    {line.costBehavior === 'variable' ? (
                      <div className="relative">
                        <input
                          type="number"
                          value={line.percentOfRevenue || ''}
                          onChange={(e) =>
                            actions.updateCOGSLine(line.id, {
                              percentOfRevenue: parseFloat(e.target.value) || 0,
                            })
                          }
                          placeholder="0"
                          min="0"
                          max="100"
                          step="0.1"
                          className="w-full px-3 py-1.5 pr-8 text-sm text-right border border-gray-200 rounded focus:ring-1 focus:ring-brand-navy focus:border-brand-navy"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
                      </div>
                    ) : (
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                        <input
                          type="number"
                          value={line.monthlyAmount || ''}
                          onChange={(e) =>
                            actions.updateCOGSLine(line.id, {
                              monthlyAmount: parseFloat(e.target.value) || 0,
                            })
                          }
                          placeholder="0"
                          min="0"
                          className="w-full px-3 py-1.5 pl-7 text-sm text-right border border-gray-200 rounded focus:ring-1 focus:ring-brand-navy focus:border-brand-navy"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">/mo</span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">
                    {formatCurrency(calculateCOGSAmount(line))}
                  </td>
                  <td className="px-2 py-3">
                    <button
                      onClick={() => actions.removeCOGSLine(line.id)}
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {cogsLines.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                    No COGS lines added. Click "Add Line" to add cost of goods sold items.
                  </td>
                </tr>
              )}
              {/* Total Row */}
              <tr className="bg-gray-50 font-semibold">
                <td className="px-4 py-3 text-sm text-gray-900">TOTAL COGS</td>
                <td className="px-4 py-3"></td>
                <td className="px-4 py-3 text-sm text-gray-900 text-right">
                  {totalRevenue > 0 ? `${((totalCOGS / totalRevenue) * 100).toFixed(1)}%` : '-'}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(totalCOGS)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Gross Profit Summary */}
      <div className="bg-green-50 border border-green-200 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-green-900">Gross Profit</h3>
            <p className="text-sm text-green-700">Revenue minus COGS</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-green-900">{formatCurrency(grossProfit)}</p>
            <p className="text-sm text-green-700">{grossProfitPct.toFixed(1)}% margin</p>
          </div>
        </div>
      </div>
    </div>
  );
}
