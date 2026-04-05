'use client';

import { useState, useMemo } from 'react';
import { Plus, Trash2, Info, Lock, ChevronDown, ChevronRight, TrendingUp, TrendingDown, Settings2 } from 'lucide-react';
import { ForecastWizardState, WizardActions, formatCurrency, generateMonthKeys, getRevenueLineYearTotal, MonthlyData } from '../types';

interface Step3RevenueCOGSProps {
  state: ForecastWizardState;
  actions: WizardActions;
  fiscalYear: number;
}

export function Step3RevenueCOGS({ state, actions, fiscalYear }: Step3RevenueCOGSProps) {
  const { revenuePattern, revenueLines, cogsLines, activeYear, goals, priorYear, currentYTD } = state;
  const [showAddRevenue, setShowAddRevenue] = useState(false);
  const [showAddCOGS, setShowAddCOGS] = useState(false);
  const [newRevenueName, setNewRevenueName] = useState('');
  const [newCOGSName, setNewCOGSName] = useState('');
  const [revenueDetailMode, setRevenueDetailMode] = useState(false);
  const [expandedRevLines, setExpandedRevLines] = useState<Set<string>>(new Set());

  const months = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  // Generate month keys for the active year (Y1 starts at fiscalYear-1, Y2 at fiscalYear, Y3 at fiscalYear+1)
  const monthKeys = generateMonthKeys(fiscalYear - 1 + (activeYear - 1));

  // Determine which months are actuals (locked) vs projected (editable)
  const actualMonthKeys = useMemo(() => {
    if (!currentYTD?.revenue_by_month) return new Set<string>();
    return new Set(Object.keys(currentYTD.revenue_by_month));
  }, [currentYTD]);

  const isActualMonth = (monthKey: string) => actualMonthKeys.has(monthKey);

  // Calculate line percentages for all years
  const getLinePercentages = () => {
    const percentages: Record<string, number> = {};

    if (revenueLines.length === 0) return percentages;

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
        const lineTotal = getRevenueLineYearTotal(line, activeYear as 2 | 3);
        yearTotalFromLines += lineTotal;
        if (lineTotal > 0) hasYearValues = true;
      });

      if (hasYearValues && yearTotalFromLines > 0) {
        revenueLines.forEach((line) => {
          const lineTotal = getRevenueLineYearTotal(line, activeYear as 2 | 3);
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
      // Year 2/3 - distribute across months using seasonality
      const yearTarget = activeYear === 2 ? (goals.year2?.revenue || 0) : (goals.year3?.revenue || 0);
      const seasonality = priorYear?.seasonalityPattern || Array(12).fill(8.33);
      const totalSeasonality = seasonality.reduce((a: number, b: number) => a + b, 0);

      if (yearTarget > 0 && totalSeasonality > 0) {
        const lineTarget = yearTarget * (newPct / 100);
        const yearMonthKeys = generateMonthKeys(fiscalYear - 1 + (activeYear - 1));
        const monthly: MonthlyData = {};
        yearMonthKeys.forEach((key, idx) => {
          monthly[key] = Math.round(lineTarget * ((seasonality[idx] || 8.33) / totalSeasonality));
        });

        if (activeYear === 2) {
          actions.updateRevenueLine(lineId, { year2Monthly: monthly });
        } else {
          actions.updateRevenueLine(lineId, { year3Monthly: monthly });
        }
      }
    }
  };

  // Calculate totals for actuals vs projections
  const ytdActualTotal = currentYTD?.total_revenue || 0;
  const completedMonthsCount = currentYTD?.months_count || 0;
  const remainingMonthsCount = 12 - completedMonthsCount;

  const handlePatternChange = (pattern: 'seasonal' | 'straight-line' | 'manual') => {
    actions.setRevenuePattern(pattern);

    // Manual mode: don't auto-distribute, let user enter each cell
    if (pattern === 'manual') return;

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

      // === YEAR 2 (Monthly) ===
      if (year2Target > 0) {
        const lineYear1Pct = year1TotalFromLines > 0
          ? (year1LineTotals[line.id] || 0) / year1TotalFromLines
          : 1 / revenueLines.length;
        const lineYear2Target = year2Target * lineYear1Pct;
        const y2MonthKeys = generateMonthKeys(fiscalYear);
        const totalPct = seasonality.reduce((a: number, b: number) => a + b, 0);

        if (pattern === 'seasonal' && totalPct > 0) {
          const monthly: MonthlyData = {};
          y2MonthKeys.forEach((key, idx) => {
            monthly[key] = Math.round(lineYear2Target * ((seasonality[idx] || 8.33) / totalPct));
          });
          updates.year2Monthly = monthly;
        } else {
          // Straight-line: equal months
          const monthlyAmount = Math.round(lineYear2Target / 12);
          const monthly: MonthlyData = {};
          y2MonthKeys.forEach((key) => {
            monthly[key] = monthlyAmount;
          });
          updates.year2Monthly = monthly;
        }
      }

      // === YEAR 3 (Monthly) ===
      if (year3Target > 0) {
        const lineYear1Pct = year1TotalFromLines > 0
          ? (year1LineTotals[line.id] || 0) / year1TotalFromLines
          : 1 / revenueLines.length;
        const lineYear3Target = year3Target * lineYear1Pct;
        const y3MonthKeys = generateMonthKeys(fiscalYear + 1);
        const totalPct = seasonality.reduce((a: number, b: number) => a + b, 0);

        if (pattern === 'seasonal' && totalPct > 0) {
          const monthly: MonthlyData = {};
          y3MonthKeys.forEach((key, idx) => {
            monthly[key] = Math.round(lineYear3Target * ((seasonality[idx] || 8.33) / totalPct));
          });
          updates.year3Monthly = monthly;
        } else {
          // Straight-line: equal months
          const monthlyAmount = Math.round(lineYear3Target / 12);
          const monthly: MonthlyData = {};
          y3MonthKeys.forEach((key) => {
            monthly[key] = monthlyAmount;
          });
          updates.year3Monthly = monthly;
        }
      }

      // Apply all updates at once
      if (Object.keys(updates).length > 0) {
        actions.updateRevenueLine(line.id, updates);
      }
    });
  };

  // Get prior year total for a revenue line
  const getLinePriorYear = (lineId: string): number => {
    const priorLine = priorYear?.revenue.byLine.find(l => l.id === lineId);
    return priorLine?.total || 0;
  };

  // Handle growth % change — recalculate forecast from prior year x growth
  const handleGrowthChange = (lineId: string, growthPct: number) => {
    const priorTotal = getLinePriorYear(lineId);
    if (priorTotal <= 0) return;

    const newTarget = Math.round(priorTotal * (1 + growthPct / 100));
    const line = revenueLines.find(l => l.id === lineId);
    if (!line) return;

    const seasonality = priorYear?.seasonalityPattern || Array(12).fill(8.33);
    const totalSeasonality = seasonality.reduce((a: number, b: number) => a + b, 0);

    if (activeYear === 1) {
      // Calculate actuals total (locked months)
      let actualsTotal = 0;
      monthKeys.forEach((key) => {
        if (isActualMonth(key)) {
          actualsTotal += line.year1Monthly[key] || 0;
        }
      });

      const remainingTarget = Math.max(0, newTarget - actualsTotal);
      let totalRemainingSeasonality = 0;
      monthKeys.forEach((key, idx) => {
        if (!isActualMonth(key)) {
          totalRemainingSeasonality += seasonality[idx] || 8.33;
        }
      });

      const newMonthly: MonthlyData = {};
      monthKeys.forEach((key, idx) => {
        if (isActualMonth(key)) {
          newMonthly[key] = line.year1Monthly[key] || 0;
        } else if (totalRemainingSeasonality > 0 && remainingTarget > 0) {
          const monthSeasonality = seasonality[idx] || 8.33;
          newMonthly[key] = Math.round(remainingTarget * (monthSeasonality / totalRemainingSeasonality));
        } else {
          newMonthly[key] = 0;
        }
      });

      actions.updateRevenueLine(lineId, { year1Monthly: newMonthly });
    } else {
      // Year 2/3 - distribute full target across months using seasonality
      const yearMonthKeys = generateMonthKeys(fiscalYear - 1 + (activeYear - 1));
      const monthly: MonthlyData = {};
      yearMonthKeys.forEach((key, idx) => {
        if (totalSeasonality > 0) {
          monthly[key] = Math.round(newTarget * ((seasonality[idx] || 8.33) / totalSeasonality));
        } else {
          monthly[key] = Math.round(newTarget / 12);
        }
      });

      if (activeYear === 2) {
        actions.updateRevenueLine(lineId, { year2Monthly: monthly });
      } else {
        actions.updateRevenueLine(lineId, { year3Monthly: monthly });
      }
    }
  };

  const toggleRevLineExpand = (lineId: string) => {
    setExpandedRevLines(prev => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  };

  const handleAddRevenueLine = () => {
    if (!newRevenueName.trim()) return;
    actions.addRevenueLine({
      name: newRevenueName.trim(),
      year1Monthly: {},
      year2Monthly: {},
      year3Monthly: {},
    });
    setNewRevenueName('');
    setShowAddRevenue(false);
  };

  const handleAddCOGSLine = () => {
    if (!newCOGSName.trim()) return;
    actions.addCOGSLine({
      name: newCOGSName.trim(),
      costBehavior: 'variable',
      percentOfRevenue: 0,
    });
    setNewCOGSName('');
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
      actions.updateRevenueLine(lineId, {
        year2Monthly: { ...(line.year2Monthly || {}), [period]: numValue },
      });
    } else {
      actions.updateRevenueLine(lineId, {
        year3Monthly: { ...(line.year3Monthly || {}), [period]: numValue },
      });
    }
  };

  const getLineTotal = (line: typeof revenueLines[0]) => {
    return getRevenueLineYearTotal(line, activeYear as 1 | 2 | 3);
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

      {/* Pattern Selection — only in detail mode */}
      {revenueDetailMode && (
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
      )}

      {/* Revenue Section */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Revenue</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setRevenueDetailMode(!revenueDetailMode)}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                revenueDetailMode
                  ? 'bg-brand-navy text-white'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              <Settings2 className="w-3.5 h-3.5" />
              {revenueDetailMode ? 'Simple View' : 'Monthly Detail'}
            </button>
            <button
              onClick={() => setShowAddRevenue(true)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-brand-navy hover:bg-brand-navy/5 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Line
            </button>
          </div>
        </div>

        {showAddRevenue && (
          <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex gap-2">
            <input
              type="text"
              value={newRevenueName}
              onChange={(e) => setNewRevenueName(e.target.value)}
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
                setNewRevenueName('');
              }}
              className="px-4 py-2 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Summary View (default) */}
        {!revenueDetailMode && (
          <div className="divide-y divide-gray-100">
            {/* Summary header */}
            <div className="grid grid-cols-12 gap-2 px-6 py-2 bg-gray-50 text-xs font-medium text-gray-500 uppercase">
              <div className="col-span-4">Line Item</div>
              <div className="col-span-2 text-right">Prior Year</div>
              <div className="col-span-2 text-right">Forecast Y{activeYear}</div>
              <div className="col-span-2 text-right">Growth</div>
              <div className="col-span-2 text-right">% Split</div>
            </div>
            {revenueLines.map((line) => {
              const priorTotal = getLinePriorYear(line.id);
              const forecastTotal = getLineTotal(line);
              const growthPct = priorTotal > 0 ? ((forecastTotal - priorTotal) / priorTotal) * 100 : 0;
              const isExpanded = expandedRevLines.has(line.id);
              return (
                <div key={line.id}>
                  <div className="grid grid-cols-12 gap-2 px-6 py-3 items-center hover:bg-gray-50">
                    <div className="col-span-4 flex items-center gap-2">
                      <button onClick={() => toggleRevLineExpand(line.id)} className="text-gray-400 hover:text-gray-600">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                      <span className="text-sm font-medium text-gray-900">{line.name}</span>
                    </div>
                    <div className="col-span-2 text-right text-sm text-gray-500">
                      {priorTotal > 0 ? formatCurrency(priorTotal) : '—'}
                    </div>
                    <div className="col-span-2 text-right text-sm font-semibold text-gray-900">
                      {formatCurrency(forecastTotal)}
                    </div>
                    <div className="col-span-2 text-right">
                      {priorTotal > 0 ? (
                        <div className="inline-flex items-center gap-1">
                          <input
                            type="number"
                            value={Math.round(growthPct)}
                            onChange={(e) => handleGrowthChange(line.id, parseFloat(e.target.value) || 0)}
                            className="w-16 px-2 py-1 text-sm text-right border border-gray-200 rounded focus:ring-1 focus:ring-brand-navy focus:border-brand-navy"
                          />
                          <span className="text-xs text-gray-400">%</span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </div>
                    <div className="col-span-2 flex items-center justify-end gap-2">
                      <span className="text-sm text-gray-500">{linePercentages[line.id] || 0}%</span>
                      <button
                        onClick={() => actions.removeRevenueLine(line.id)}
                        className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {/* Expanded monthly detail for this line */}
                  {isExpanded && (
                    <div className="px-6 py-3 bg-gray-50 border-t border-gray-100">
                      <div className="grid grid-cols-12 gap-1">
                        {monthKeys.map((key, idx) => {
                          const isActual = activeYear === 1 && isActualMonth(key);
                          const yearMonthly = activeYear === 1
                            ? line.year1Monthly
                            : activeYear === 2
                              ? (line.year2Monthly || {})
                              : (line.year3Monthly || {});
                          const cellValue = yearMonthly[key] || 0;
                          return (
                            <div key={key} className="text-center">
                              <div className={`text-[10px] font-medium mb-1 ${isActual ? 'text-blue-600' : 'text-gray-400'}`}>
                                {months[idx]}{isActual ? ' ✓' : ''}
                              </div>
                              {isActual ? (
                                <div className="px-1 py-1 text-xs text-right bg-blue-100 border border-blue-200 rounded text-blue-900 font-medium">
                                  {cellValue.toLocaleString()}
                                </div>
                              ) : (
                                <input
                                  type="text"
                                  value={cellValue ? cellValue.toLocaleString() : ''}
                                  onChange={(e) => handleRevenueChange(line.id, key, e.target.value)}
                                  placeholder="0"
                                  className="w-full px-1 py-1 text-xs text-right border border-gray-200 rounded focus:ring-1 focus:ring-brand-navy focus:border-brand-navy"
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {/* Summary totals */}
            <div className="grid grid-cols-12 gap-2 px-6 py-3 bg-gray-50 font-semibold">
              <div className="col-span-4 text-sm text-gray-900">TOTAL REVENUE</div>
              <div className="col-span-2 text-right text-sm text-gray-500">
                {priorYear ? formatCurrency(priorYear.revenue.total) : '—'}
              </div>
              <div className="col-span-2 text-right text-sm text-gray-900">{formatCurrency(totalRevenue)}</div>
              <div className="col-span-2 text-right text-sm">
                {priorYear && priorYear.revenue.total > 0 ? (
                  <span className={totalRevenue >= priorYear.revenue.total ? 'text-green-600' : 'text-red-600'}>
                    {((totalRevenue - priorYear.revenue.total) / priorYear.revenue.total * 100).toFixed(0)}%
                  </span>
                ) : '—'}
              </div>
              <div className="col-span-2 text-right text-xs text-gray-500">{linePctTotal}%</div>
            </div>
          </div>
        )}

        {/* Detail View (monthly grid) */}
        {revenueDetailMode && <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase sticky left-0 bg-gray-50">
                  Line Item
                </th>
                {/* Show % column for all years */}
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase w-20">
                  % Split
                </th>
                {months.map((m, idx) => {
                  const monthKey = monthKeys[idx];
                  const isActual = activeYear === 1 && isActualMonth(monthKey);
                  return (
                    <th
                      key={monthKey}
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
                })}
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                <th className="px-2 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {revenueLines.map((line) => {
                // Get the monthly data for the active year
                const yearMonthly = activeYear === 1
                  ? line.year1Monthly
                  : activeYear === 2
                    ? (line.year2Monthly || {})
                    : (line.year3Monthly || {});

                return (
                  <tr key={line.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-sm font-medium text-gray-900 sticky left-0 bg-white">
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
                    {monthKeys.map((key) => {
                      const isActual = activeYear === 1 && isActualMonth(key);
                      const cellValue = yearMonthly[key] || 0;
                      return (
                        <td key={key} className={`px-1 py-1 ${isActual ? 'bg-blue-50' : ''}`}>
                          {isActual ? (
                            // Actual month - locked display
                            <div className="w-full px-2 py-1 text-sm text-right bg-blue-100 border border-blue-200 rounded text-blue-900 font-medium flex items-center justify-end gap-1">
                              <Lock className="w-3 h-3 text-blue-500" />
                              <span>{cellValue ? cellValue.toLocaleString() : '0'}</span>
                            </div>
                          ) : (
                            // Editable month
                            <input
                              type="text"
                              value={cellValue ? cellValue.toLocaleString() : ''}
                              onChange={(e) => handleRevenueChange(line.id, key, e.target.value)}
                              placeholder="0"
                              className="w-full px-2 py-1 text-sm text-right border border-gray-200 rounded focus:ring-1 focus:ring-brand-navy focus:border-brand-navy"
                            />
                          )}
                        </td>
                      );
                    })}
                    <td className="px-4 py-2 text-sm font-semibold text-gray-900 text-right">
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
                );
              })}
              {/* Total Row */}
              <tr className="bg-gray-50 font-semibold">
                <td className="px-4 py-3 text-sm text-gray-900 sticky left-0 bg-gray-50">TOTAL REVENUE</td>
                {/* % Total for all years */}
                <td className="px-2 py-3 text-center">
                  <span className={`text-xs font-bold ${linePctTotal === 100 ? 'text-green-600' : 'text-amber-600'}`}>
                    {linePctTotal}%
                  </span>
                </td>
                {monthKeys.map((key) => {
                  const monthTotal = revenueLines.reduce((sum, line) => {
                    const yearMonthly = activeYear === 1
                      ? line.year1Monthly
                      : activeYear === 2
                        ? (line.year2Monthly || {})
                        : (line.year3Monthly || {});
                    return sum + (yearMonthly[key] || 0);
                  }, 0);
                  const isActual = activeYear === 1 && isActualMonth(key);
                  return (
                    <td key={key} className={`px-3 py-3 text-sm text-right ${isActual ? 'bg-blue-100 text-blue-900' : 'text-gray-900'}`}>
                      {monthTotal > 0 ? formatCurrency(monthTotal) : '-'}
                    </td>
                  );
                })}
                <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(totalRevenue)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>}
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
              value={newCOGSName}
              onChange={(e) => setNewCOGSName(e.target.value)}
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
                setNewCOGSName('');
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
                              percentOfRevenue: Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)),
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
      {(() => {
        const gpTarget = activeYear === 1
          ? goals.year1?.grossProfitPct
          : activeYear === 2
            ? goals.year2?.grossProfitPct
            : goals.year3?.grossProfitPct;
        const gpMet = gpTarget ? grossProfitPct >= gpTarget : true;
        const gpGap = gpTarget ? grossProfitPct - gpTarget : 0;
        return (
          <div className={`border rounded-xl p-4 ${gpMet ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className={`text-lg font-semibold ${gpMet ? 'text-green-900' : 'text-amber-900'}`}>Gross Profit</h3>
                <p className={`text-sm ${gpMet ? 'text-green-700' : 'text-amber-700'}`}>Revenue minus COGS</p>
              </div>
              <div className="text-right">
                <p className={`text-2xl font-bold ${gpMet ? 'text-green-900' : 'text-amber-900'}`}>{formatCurrency(grossProfit)}</p>
                <p className={`text-sm ${gpMet ? 'text-green-700' : 'text-amber-700'}`}>{grossProfitPct.toFixed(1)}% margin</p>
              </div>
            </div>
            {gpTarget && totalRevenue > 0 && (
              <div className={`mt-3 pt-3 border-t ${gpMet ? 'border-green-200' : 'border-amber-200'} flex items-center justify-between`}>
                <span className={`text-sm ${gpMet ? 'text-green-700' : 'text-amber-700'}`}>
                  Target: {gpTarget}% (Step 1)
                </span>
                <span className={`text-sm font-medium ${gpMet ? 'text-green-700' : 'text-red-600'}`}>
                  {gpMet ? (
                    <span className="flex items-center gap-1"><TrendingUp className="w-4 h-4" /> On track ({gpGap > 0 ? `+${gpGap.toFixed(1)}%` : 'exact'})</span>
                  ) : (
                    <span className="flex items-center gap-1"><TrendingDown className="w-4 h-4" /> {gpGap.toFixed(1)}% below target</span>
                  )}
                </span>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
