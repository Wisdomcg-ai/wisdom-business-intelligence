'use client';

import React, { useState, useMemo } from 'react';
import { Plus, Trash2, Info, Lock, ChevronDown, ChevronRight } from 'lucide-react';
import { ForecastWizardState, WizardActions, formatCurrency, generateMonthKeys, getRevenueLineYearTotal, MonthlyData } from '../types';
import { getFiscalMonthLabels, DEFAULT_YEAR_START_MONTH } from '@/lib/utils/fiscal-year-utils';

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
  const [viewMode, setViewMode] = useState<'summary' | 'monthly'>('summary');
  const [expandedRevLines, setExpandedRevLines] = useState<Set<string>>(new Set());

  const months = getFiscalMonthLabels(DEFAULT_YEAR_START_MONTH);
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

  // Prior year mix percentages
  const priorYearMix = useMemo(() => {
    const mix: Record<string, number> = {};
    if (!priorYear) return mix;
    const total = priorYear.revenue.total;
    if (total <= 0) return mix;
    priorYear.revenue.byLine.forEach(line => {
      mix[line.id] = Math.round((line.total / total) * 100);
    });
    return mix;
  }, [priorYear]);

  // Handle mix % change — recalculate forecast from target × mix × seasonality
  const handleMixChange = (lineId: string, newMixPct: number) => {
    const yearTarget = activeYear === 1 ? (goals.year1?.revenue || 0)
      : activeYear === 2 ? (goals.year2?.revenue || 0)
      : (goals.year3?.revenue || 0);
    if (yearTarget <= 0) return;

    const lineTarget = Math.round(yearTarget * (newMixPct / 100));
    const yearMKeys = generateMonthKeys(fiscalYear - 1 + (activeYear - 1));
    const seasonality = priorYear?.seasonalityPattern || Array(12).fill(8.33);

    // For Y1, preserve actuals and distribute remaining across projected months
    if (activeYear === 1) {
      const line = revenueLines.find(l => l.id === lineId);
      if (!line) return;

      let actualsTotal = 0;
      yearMKeys.forEach(key => {
        if (isActualMonth(key)) actualsTotal += line.year1Monthly[key] || 0;
      });

      const remainingTarget = Math.max(0, lineTarget - actualsTotal);
      let totalRemainingSeason = 0;
      yearMKeys.forEach((key, idx) => {
        if (!isActualMonth(key)) totalRemainingSeason += seasonality[idx] || 8.33;
      });

      const newMonthly: Record<string, number> = {};
      yearMKeys.forEach((key, idx) => {
        if (isActualMonth(key)) {
          newMonthly[key] = line.year1Monthly[key] || 0;
        } else if (totalRemainingSeason > 0 && remainingTarget > 0) {
          newMonthly[key] = Math.round(remainingTarget * ((seasonality[idx] || 8.33) / totalRemainingSeason));
        } else {
          newMonthly[key] = 0;
        }
      });
      actions.updateRevenueLine(lineId, { year1Monthly: newMonthly });
    } else {
      // Y2/Y3 — distribute fully using seasonality
      const totalSeason = seasonality.reduce((s, v) => s + v, 0);
      const monthly: Record<string, number> = {};
      yearMKeys.forEach((key, idx) => {
        monthly[key] = Math.round(lineTarget * ((seasonality[idx] || 8.33) / totalSeason));
      });
      if (activeYear === 2) {
        actions.updateRevenueLine(lineId, { year2Monthly: monthly });
      } else {
        actions.updateRevenueLine(lineId, { year3Monthly: monthly });
      }
    }
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

  // Calculate COGS amount for a line — uses monthly data if available
  const calculateCOGSAmount = (line: typeof cogsLines[0]) => {
    const yearKey = activeYear === 1 ? 'year1Monthly' : activeYear === 2 ? 'year2Monthly' : 'year3Monthly';
    const monthly = line[yearKey as keyof typeof line] as Record<string, number> | undefined;
    if (monthly && Object.keys(monthly).length > 0) {
      return Object.values(monthly).reduce((a, b) => a + b, 0);
    }
    if (line.costBehavior === 'fixed') {
      return (line.monthlyAmount || 0) * 12;
    }
    return (totalRevenue * (line.percentOfRevenue || 0)) / 100;
  };

  // Prior year COGS mix
  const priorYearCogsMix = useMemo(() => {
    const mix: Record<string, number> = {};
    if (!priorYear) return mix;
    const total = priorYear.cogs.total;
    if (total <= 0) return mix;
    priorYear.cogs.byLine.forEach(line => {
      mix[line.id] = Math.round((line.total / total) * 100);
    });
    return mix;
  }, [priorYear]);

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

  // Current COGS line percentages (of total COGS)
  const cogsLinePercentages = useMemo(() => {
    const pcts: Record<string, number> = {};
    if (totalCOGS <= 0) {
      cogsLines.forEach(line => { pcts[line.id] = Math.round(100 / (cogsLines.length || 1)); });
      return pcts;
    }
    cogsLines.forEach(line => {
      pcts[line.id] = Math.round((calculateCOGSAmount(line) / totalCOGS) * 100);
    });
    return pcts;
  }, [cogsLines, totalCOGS, totalRevenue, activeYear]);

  const cogsPctTotal = Object.values(cogsLinePercentages).reduce((a, b) => a + b, 0);

  // Handle COGS mix % change — redistribute COGS total by mix using seasonality
  const handleCogsMixChange = (lineId: string, newMixPct: number) => {
    if (totalCOGS <= 0) return;
    const lineTarget = Math.round(totalCOGS * (newMixPct / 100));
    const yearMKeys = generateMonthKeys(fiscalYear - 1 + (activeYear - 1));
    const seasonality = priorYear?.seasonalityPattern || Array(12).fill(8.33);
    const totalSeason = seasonality.reduce((s, v) => s + v, 0);

    const yearKey = activeYear === 1 ? 'year1Monthly' : activeYear === 2 ? 'year2Monthly' : 'year3Monthly';
    const monthly: Record<string, number> = {};
    yearMKeys.forEach((key, idx) => {
      monthly[key] = Math.round(lineTarget * ((seasonality[idx] || 8.33) / totalSeason));
    });
    actions.updateCOGSLine(lineId, { [yearKey]: monthly });
  };

  // Check if lines came from Xero/CSV
  const hasImportedData = priorYear && (priorYear.revenue.byLine.length > 0 || priorYear.cogs.byLine.length > 0);

  return (
    <div className="space-y-4">
      {/* Compact context bar */}
      {(activeYear === 1 && completedMonthsCount > 0 || hasImportedData) && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-3 flex items-center justify-between text-sm">
          <div className="flex items-center gap-4 text-gray-600">
            {completedMonthsCount > 0 && activeYear === 1 && (
              <span>{completedMonthsCount}/12 months actual &bull; {formatCurrency(ytdActualTotal)} YTD</span>
            )}
            {hasImportedData && (
              <span className="text-gray-400">Lines from Xero</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {activeYear === 1 && completedMonthsCount > 0 && (
              <span className="text-gray-500">Remaining: {formatCurrency(Math.max(0, (goals.year1?.revenue || 0) - ytdActualTotal))}</span>
            )}
          </div>
        </div>
      )}

      {/* View Mode Toggle + Distribution Note */}
      <div className="flex items-center justify-between">
        <div className="flex border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setViewMode('summary')}
            className={`px-4 py-1.5 text-xs font-medium transition-colors ${
              viewMode === 'summary' ? 'bg-brand-navy text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            Summary
          </button>
          <button
            onClick={() => setViewMode('monthly')}
            className={`px-4 py-1.5 text-xs font-medium transition-colors ${
              viewMode === 'monthly' ? 'bg-brand-navy text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            Monthly Detail
          </button>
        </div>
        {viewMode === 'monthly' && (
          <p className="text-xs text-gray-400 italic">
            <Info className="w-3 h-3 inline mr-1" />
            {priorYear ? 'Monthly amounts distributed based on your prior year seasonal pattern' : 'Monthly amounts distributed evenly across the year'}
          </p>
        )}
      </div>

      {/* Add Revenue Line form (above the table) */}
      {showAddRevenue && (
        <div className="flex gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
          <input
            type="text"
            value={newRevenueName}
            onChange={(e) => setNewRevenueName(e.target.value)}
            placeholder="Enter revenue line item name..."
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
            onClick={() => { setShowAddRevenue(false); setNewRevenueName(''); }}
            className="px-4 py-2 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Add COGS Line form (above the table) */}
      {showAddCOGS && (
        <div className="flex gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
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
            onClick={() => { setShowAddCOGS(false); setNewCOGSName(''); }}
            className="px-4 py-2 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Unified P&L Card */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

        {/* ======== SUMMARY VIEW ======== */}
        {viewMode === 'summary' && (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide" style={{ width: '30%' }}>Line Item</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase tracking-wide" style={{ width: '18%' }}>Prior Year</th>
                <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wide" style={{ width: '14%' }}>% Split</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase tracking-wide" style={{ width: '20%' }}>Forecast {activeYear === 1 ? 'Y1' : `Y${activeYear}`}</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase tracking-wide" style={{ width: '18%' }}>vs Prior / % of Rev</th>
              </tr>
            </thead>
            <tbody>
              {/* REVENUE section header */}
              <tr className="bg-gray-50">
                <td colSpan={5} className="px-4 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Revenue</span>
                    <button
                      onClick={() => setShowAddRevenue(true)}
                      className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-brand-navy hover:bg-brand-navy/5 rounded transition-colors"
                    >
                      <Plus className="w-3 h-3" /> Add Line
                    </button>
                  </div>
                </td>
              </tr>

              {/* Revenue lines */}
              {revenueLines.map((line) => {
                const priorTotal = getLinePriorYear(line.id);
                const forecastTotal = getLineTotal(line);
                const currentMixPct = linePercentages[line.id] || 0;
                const growthPct = priorTotal > 0 ? ((forecastTotal - priorTotal) / priorTotal) * 100 : 0;
                const isExpanded = expandedRevLines.has(line.id);
                return (
                  <React.Fragment key={line.id}>
                    <tr className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <button onClick={() => toggleRevLineExpand(line.id)} className="text-gray-400 hover:text-gray-600">
                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                          <span className="text-sm font-medium text-gray-900 truncate">{line.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right text-sm text-gray-500">
                        {priorTotal > 0 ? formatCurrency(priorTotal) : '\u2014'}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <div className="inline-flex items-center gap-1 justify-center">
                          <input
                            type="number"
                            value={currentMixPct}
                            onChange={(e) => handleMixChange(line.id, Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                            min="0"
                            max="100"
                            className="w-14 px-2 py-1 text-sm text-right border border-gray-200 rounded focus:ring-1 focus:ring-brand-navy focus:border-brand-navy"
                          />
                          <span className="text-xs text-gray-400">%</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right text-sm font-semibold text-gray-900">
                        {formatCurrency(forecastTotal)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {priorTotal > 0 ? (
                            <span className={`text-sm ${growthPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {growthPct >= 0 ? '+' : ''}{Math.round(growthPct)}%
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">\u2014</span>
                          )}
                          <button
                            onClick={() => actions.removeRevenueLine(line.id)}
                            className="p-1 text-gray-300 hover:text-red-500 transition-colors opacity-0 hover:opacity-100"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {/* Expanded monthly detail row */}
                    {isExpanded && (
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <td colSpan={5} className="px-6 py-3">
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
                                    {months[idx]}{isActual ? ' \u2713' : ''}
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
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

              {/* TOTAL REVENUE */}
              <tr className="bg-gray-100 font-semibold border-t-2 border-gray-300">
                <td className="px-4 py-2.5 text-sm text-gray-900">TOTAL REVENUE</td>
                <td className="px-4 py-2.5 text-right text-sm text-gray-500">
                  {priorYear ? formatCurrency(priorYear.revenue.total) : '\u2014'}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <span className={`text-xs font-bold ${linePctTotal === 100 ? 'text-green-600' : 'text-amber-600'}`}>
                    {linePctTotal}%{linePctTotal !== 100 && (linePctTotal < 100 ? ' under' : ' over')}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right text-sm text-gray-900">{formatCurrency(totalRevenue)}</td>
                <td className="px-4 py-2.5 text-right text-sm">
                  {priorYear && priorYear.revenue.total > 0 ? (
                    <span className={totalRevenue >= priorYear.revenue.total ? 'text-green-600' : 'text-red-600'}>
                      {totalRevenue >= priorYear.revenue.total ? '+' : ''}{((totalRevenue - priorYear.revenue.total) / priorYear.revenue.total * 100).toFixed(0)}%
                    </span>
                  ) : '\u2014'}
                </td>
              </tr>

              {/* Spacer */}
              <tr><td colSpan={5} className="py-2"></td></tr>

              {/* COST OF SALES section header */}
              <tr className="bg-gray-50">
                <td colSpan={5} className="px-4 py-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Cost of Sales</span>
                      <div className="group relative">
                        <Info className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                        <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-64 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-10">
                          <p className="mb-1"><strong>Variable:</strong> Costs that change with revenue (e.g., materials, commissions)</p>
                          <p><strong>Fixed:</strong> Costs that stay constant regardless of revenue (rare for COGS)</p>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowAddCOGS(true)}
                      className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-brand-navy hover:bg-brand-navy/5 rounded transition-colors"
                    >
                      <Plus className="w-3 h-3" /> Add Line
                    </button>
                  </div>
                </td>
              </tr>

              {/* COGS lines */}
              {cogsLines.map((line) => {
                const priorPct = priorYearCogsMix[line.id] || 0;
                const currentPct = cogsLinePercentages[line.id] || 0;
                const lineAmount = calculateCOGSAmount(line);
                const pctOfRev = totalRevenue > 0 ? (lineAmount / totalRevenue * 100) : 0;
                return (
                  <tr key={line.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 truncate">{line.name}</span>
                        <span className={`text-[10px] font-medium px-1 py-0.5 rounded ${
                          line.costBehavior === 'variable' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'
                        }`}>
                          {line.costBehavior === 'variable' ? 'Var' : 'Fix'}
                        </span>
                      </div>
                      {state.forecastDuration > 1 && (
                        <select
                          value={line.y2y3Trend || 'same'}
                          onChange={(e) => actions.updateCOGSLine(line.id, { y2y3Trend: e.target.value as 'same' | 'improves' | 'increases' })}
                          className="mt-1 text-[10px] text-gray-400 bg-transparent border-0 p-0 cursor-pointer hover:text-gray-600"
                        >
                          <option value="same">Y2/Y3: Same %</option>
                          <option value="improves">Y2/Y3: Improves ~2%</option>
                          <option value="increases">Y2/Y3: Increases ~2%</option>
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm text-gray-500">
                      {line.priorYearTotal != null && line.priorYearTotal > 0 ? formatCurrency(line.priorYearTotal) : '\u2014'}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <div className="inline-flex items-center gap-1 justify-center">
                        <input
                          type="number"
                          value={currentPct}
                          onChange={(e) => handleCogsMixChange(line.id, Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                          min="0"
                          max="100"
                          className="w-14 px-2 py-1 text-sm text-right border border-gray-200 rounded focus:ring-1 focus:ring-brand-navy focus:border-brand-navy"
                        />
                        <span className="text-xs text-gray-400">%</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm font-semibold text-gray-900">
                      {formatCurrency(lineAmount)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-sm text-gray-500">{pctOfRev.toFixed(1)}%</span>
                        <button
                          onClick={() => actions.removeCOGSLine(line.id)}
                          className="p-1 text-gray-300 hover:text-red-500 transition-colors opacity-0 hover:opacity-100"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {cogsLines.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                    {priorYear && priorYear.cogs.byLine.length === 0 ? (
                      <>
                        <div className="font-medium text-gray-700 mb-1">No Cost of Sales accounts found in Xero</div>
                        <div className="text-xs">Service businesses often don&apos;t have COGS. If you have direct product or service-delivery costs, click &quot;Add Line&quot; above to enter them manually.</div>
                      </>
                    ) : (
                      <>No COGS lines added. Click &quot;Add Line&quot; above.</>
                    )}
                  </td>
                </tr>
              )}

              {/* TOTAL COST OF SALES */}
              <tr className="bg-gray-100 font-semibold border-t-2 border-gray-300">
                <td className="px-4 py-2.5 text-sm text-gray-900">TOTAL COST OF SALES</td>
                <td className="px-4 py-2.5 text-right text-sm text-gray-500">
                  {priorYear ? formatCurrency(priorYear.cogs.total) : '\u2014'}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <span className={`text-xs font-bold ${cogsPctTotal >= 99 && cogsPctTotal <= 101 ? 'text-green-600' : 'text-amber-600'}`}>
                    {cogsPctTotal}%
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right text-sm text-gray-900">{formatCurrency(totalCOGS)}</td>
                <td className="px-4 py-2.5 text-right text-sm text-gray-500">
                  {totalRevenue > 0 ? `${(totalCOGS / totalRevenue * 100).toFixed(1)}%` : '\u2014'}
                </td>
              </tr>
            </tbody>
          </table>
        )}

        {/* ======== MONTHLY VIEW ======== */}
        {viewMode === 'monthly' && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase sticky left-0 bg-gray-50 min-w-[180px]">
                    Line Item
                  </th>
                  <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase w-[60px]">
                    % Split
                  </th>
                  {months.map((m, idx) => {
                    const monthKey = monthKeys[idx];
                    const isActual = activeYear === 1 && isActualMonth(monthKey);
                    return (
                      <th
                        key={monthKey}
                        className={`px-2 py-3 text-right text-xs font-medium uppercase w-[72px] ${
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
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase w-[100px]">Total</th>
                  <th className="px-2 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {/* REVENUE header */}
                <tr className="bg-gray-50">
                  <td colSpan={16} className="px-4 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Revenue</span>
                      <button
                        onClick={() => setShowAddRevenue(true)}
                        className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-brand-navy hover:bg-brand-navy/5 rounded transition-colors"
                      >
                        <Plus className="w-3 h-3" /> Add Line
                      </button>
                    </div>
                  </td>
                </tr>

                {/* Revenue lines */}
                {revenueLines.map((line) => {
                  const yearMonthly = activeYear === 1
                    ? line.year1Monthly
                    : activeYear === 2
                      ? (line.year2Monthly || {})
                      : (line.year3Monthly || {});
                  const revMixPct = linePercentages[line.id] || 0;

                  return (
                    <tr key={line.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm font-medium text-gray-900 sticky left-0 bg-white min-w-[180px]">
                        {line.name}
                      </td>
                      <td className="px-1 py-1 text-center">
                        <div className="inline-flex items-center gap-0.5">
                          <input
                            type="number"
                            value={revMixPct}
                            onChange={(e) => handleMixChange(line.id, Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                            min="0"
                            max="100"
                            className="w-12 px-1 py-1 text-xs text-right border border-gray-200 rounded focus:ring-1 focus:ring-brand-navy focus:border-brand-navy"
                          />
                          <span className="text-[10px] text-gray-400">%</span>
                        </div>
                      </td>
                      {monthKeys.map((key) => {
                        const isActual = activeYear === 1 && isActualMonth(key);
                        const cellValue = yearMonthly[key] || 0;
                        return (
                          <td key={key} className={`px-1 py-1 ${isActual ? 'bg-blue-50' : ''}`}>
                            {isActual ? (
                              <div className="w-full px-2 py-1 text-sm text-right bg-blue-100 border border-blue-200 rounded text-blue-900 font-medium flex items-center justify-end gap-1">
                                <Lock className="w-3 h-3 text-blue-500" />
                                <span>{cellValue ? cellValue.toLocaleString() : '0'}</span>
                              </div>
                            ) : (
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

                {/* TOTAL REVENUE */}
                <tr className="bg-gray-100 font-semibold border-t-2 border-gray-300">
                  <td className="px-4 py-3 text-sm text-gray-900 sticky left-0 bg-gray-100">TOTAL REVENUE</td>
                  <td className="px-2 py-3 text-center">
                    <span className={`text-[10px] font-bold ${linePctTotal === 100 ? 'text-green-600' : 'text-amber-600'}`}>
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
                      <td key={key} className={`px-2 py-3 text-sm text-right ${isActual ? 'bg-blue-100 text-blue-900' : 'text-gray-900'}`}>
                        {monthTotal > 0 ? formatCurrency(monthTotal) : '-'}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(totalRevenue)}</td>
                  <td></td>
                </tr>

                {/* Spacer */}
                <tr><td colSpan={16} className="py-2"></td></tr>

                {/* COST OF SALES header */}
                <tr className="bg-gray-50">
                  <td colSpan={16} className="px-4 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Cost of Sales</span>
                      <button
                        onClick={() => setShowAddCOGS(true)}
                        className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-brand-navy hover:bg-brand-navy/5 rounded transition-colors"
                      >
                        <Plus className="w-3 h-3" /> Add Line
                      </button>
                    </div>
                  </td>
                </tr>

                {/* COGS lines */}
                {cogsLines.map((line) => {
                  const yearKey = activeYear === 1 ? 'year1Monthly' : activeYear === 2 ? 'year2Monthly' : 'year3Monthly';
                  const existingMonthly = line[yearKey] || {};
                  const hasMonthlyData = Object.keys(existingMonthly).length > 0;

                  const monthlyRevForLine = monthKeys.map(key =>
                    revenueLines.reduce((sum, rl) => {
                      const rm = activeYear === 1 ? rl.year1Monthly : activeYear === 2 ? (rl.year2Monthly || {}) : (rl.year3Monthly || {});
                      return sum + (rm[key] || 0);
                    }, 0)
                  );

                  const getMonthValue = (key: string, idx: number): number => {
                    if (hasMonthlyData) return existingMonthly[key] || 0;
                    if (line.costBehavior === 'variable') return Math.round(monthlyRevForLine[idx] * (line.percentOfRevenue || 0) / 100);
                    return line.monthlyAmount || 0;
                  };

                  const monthValues = monthKeys.map((key, idx) => getMonthValue(key, idx));
                  const lineTotal = monthValues.reduce((a, b) => a + b, 0);

                  const handleCOGSMonthChange = (key: string, value: string) => {
                    const numValue = parseFloat(value.replace(/[^0-9.]/g, '')) || 0;
                    const updated = { ...existingMonthly };
                    if (!hasMonthlyData) {
                      monthKeys.forEach((k, i) => { updated[k] = getMonthValue(k, i); });
                    }
                    updated[key] = numValue;
                    actions.updateCOGSLine(line.id, { [yearKey]: updated });
                  };

                  const cogsMixPct = cogsLinePercentages[line.id] || 0;

                  return (
                    <tr key={line.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2 sticky left-0 bg-white min-w-[180px]">
                        <div className="text-sm font-medium text-gray-900">{line.name}</div>
                        <div className="text-xs text-gray-400">
                          {line.costBehavior === 'variable' ? `${line.percentOfRevenue || 0}% of rev` : `$${(line.monthlyAmount || 0).toLocaleString()}/mo`}
                          {hasMonthlyData && <span className="ml-1 text-amber-500">(edited)</span>}
                        </div>
                      </td>
                      <td className="px-1 py-1 text-center">
                        <div className="inline-flex items-center gap-0.5">
                          <input
                            type="number"
                            value={cogsMixPct}
                            onChange={(e) => handleCogsMixChange(line.id, Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                            min="0"
                            max="100"
                            className="w-12 px-1 py-1 text-xs text-right border border-gray-200 rounded focus:ring-1 focus:ring-brand-navy focus:border-brand-navy"
                          />
                          <span className="text-[10px] text-gray-400">%</span>
                        </div>
                      </td>
                      {monthKeys.map((key, idx) => {
                        const isActual = activeYear === 1 && isActualMonth(key);
                        const val = monthValues[idx];
                        return (
                          <td key={key} className={`px-1 py-1 ${isActual ? 'bg-blue-50' : ''}`}>
                            <input
                              type="text"
                              value={val ? val.toLocaleString() : ''}
                              onChange={(e) => handleCOGSMonthChange(key, e.target.value)}
                              placeholder="0"
                              className={`w-full px-1 py-1 text-xs text-right border border-gray-200 rounded focus:ring-1 focus:ring-brand-navy focus:border-brand-navy ${
                                !hasMonthlyData ? 'text-gray-400' : 'text-gray-900'
                              }`}
                            />
                          </td>
                        );
                      })}
                      <td className="px-4 py-2 text-sm font-semibold text-gray-900 text-right">
                        {formatCurrency(lineTotal)}
                      </td>
                      <td className="px-2 py-2">
                        <button
                          onClick={() => actions.removeCOGSLine(line.id)}
                          className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {cogsLines.length === 0 && (
                  <tr>
                    <td colSpan={15} className="px-4 py-8 text-center text-sm text-gray-500">
                      {priorYear && priorYear.cogs.byLine.length === 0 ? (
                        <>
                          <div className="font-medium text-gray-700 mb-1">No Cost of Sales accounts found in Xero</div>
                          <div className="text-xs">Service businesses often don&apos;t have COGS. If you have direct product or service-delivery costs, click &quot;Add Line&quot; to enter them manually.</div>
                        </>
                      ) : (
                        <>No COGS lines added. Click &quot;Add Line&quot; to add cost of goods sold items.</>
                      )}
                    </td>
                  </tr>
                )}

                {/* TOTAL COST OF SALES */}
                <tr className="bg-gray-100 font-semibold border-t-2 border-gray-300">
                  <td className="px-4 py-3 text-sm text-gray-900 sticky left-0 bg-gray-100">TOTAL COST OF SALES</td>
                  <td className="px-2 py-3 text-center">
                    <span className={`text-[10px] font-bold ${cogsPctTotal >= 99 && cogsPctTotal <= 101 ? 'text-green-600' : 'text-amber-600'}`}>
                      {cogsPctTotal}%
                    </span>
                  </td>
                  {monthKeys.map((key) => {
                    const monthCogs = cogsLines.reduce((sum, line) => {
                      const ym = line[activeYear === 1 ? 'year1Monthly' : activeYear === 2 ? 'year2Monthly' : 'year3Monthly'] || {};
                      if (Object.keys(ym).length > 0) return sum + (ym[key] || 0);
                      const monthRev = revenueLines.reduce((s, rl) => {
                        const rm = activeYear === 1 ? rl.year1Monthly : activeYear === 2 ? (rl.year2Monthly || {}) : (rl.year3Monthly || {});
                        return s + (rm[key] || 0);
                      }, 0);
                      if (line.costBehavior === 'variable') return sum + Math.round(monthRev * (line.percentOfRevenue || 0) / 100);
                      return sum + (line.monthlyAmount || 0);
                    }, 0);
                    return (
                      <td key={key} className="px-2 py-3 text-sm text-gray-900 text-right">{formatCurrency(monthCogs)}</td>
                    );
                  })}
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(totalCOGS)}</td>
                  <td></td>
                </tr>

                {/* GROSS PROFIT */}
                <tr className="bg-green-50 font-semibold border-t-2 border-green-300">
                  <td className="px-4 py-3 text-sm text-green-900 sticky left-0 bg-green-50">GROSS PROFIT</td>
                  <td></td>
                  {monthKeys.map((key) => {
                    const monthRev = revenueLines.reduce((sum, line) => {
                      const yearMonthly = activeYear === 1
                        ? line.year1Monthly
                        : activeYear === 2
                          ? (line.year2Monthly || {})
                          : (line.year3Monthly || {});
                      return sum + (yearMonthly[key] || 0);
                    }, 0);
                    const monthCogs = cogsLines.reduce((sum, line) => {
                      const ym = line[activeYear === 1 ? 'year1Monthly' : activeYear === 2 ? 'year2Monthly' : 'year3Monthly'] || {};
                      if (Object.keys(ym).length > 0) return sum + (ym[key] || 0);
                      const mRev = revenueLines.reduce((s, rl) => {
                        const rm = activeYear === 1 ? rl.year1Monthly : activeYear === 2 ? (rl.year2Monthly || {}) : (rl.year3Monthly || {});
                        return s + (rm[key] || 0);
                      }, 0);
                      if (line.costBehavior === 'variable') return sum + Math.round(mRev * (line.percentOfRevenue || 0) / 100);
                      return sum + (line.monthlyAmount || 0);
                    }, 0);
                    const monthGP = monthRev - monthCogs;
                    return (
                      <td key={key} className="px-2 py-3 text-sm text-green-900 text-right">
                        {monthRev > 0 ? formatCurrency(monthGP) : '-'}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-sm text-green-900 text-right">{formatCurrency(grossProfit)}</td>
                  <td></td>
                </tr>

                {/* Gross Margin % */}
                <tr className="bg-green-50">
                  <td className="px-4 py-2 text-xs text-green-700 sticky left-0 bg-green-50">Gross Margin %</td>
                  <td></td>
                  {monthKeys.map((key) => {
                    const monthRev = revenueLines.reduce((sum, line) => {
                      const yearMonthly = activeYear === 1
                        ? line.year1Monthly
                        : activeYear === 2
                          ? (line.year2Monthly || {})
                          : (line.year3Monthly || {});
                      return sum + (yearMonthly[key] || 0);
                    }, 0);
                    const monthCogs = cogsLines.reduce((sum, line) => {
                      const ym = line[activeYear === 1 ? 'year1Monthly' : activeYear === 2 ? 'year2Monthly' : 'year3Monthly'] || {};
                      if (Object.keys(ym).length > 0) return sum + (ym[key] || 0);
                      const mRev = revenueLines.reduce((s, rl) => {
                        const rm = activeYear === 1 ? rl.year1Monthly : activeYear === 2 ? (rl.year2Monthly || {}) : (rl.year3Monthly || {});
                        return s + (rm[key] || 0);
                      }, 0);
                      if (line.costBehavior === 'variable') return sum + Math.round(mRev * (line.percentOfRevenue || 0) / 100);
                      return sum + (line.monthlyAmount || 0);
                    }, 0);
                    const monthGM = monthRev > 0 ? ((monthRev - monthCogs) / monthRev * 100) : 0;
                    return (
                      <td key={key} className="px-2 py-2 text-xs text-green-700 text-right">
                        {monthRev > 0 ? `${monthGM.toFixed(1)}%` : '-'}
                      </td>
                    );
                  })}
                  <td className="px-4 py-2 text-xs text-green-700 text-right font-semibold">
                    {grossProfitPct.toFixed(1)}%
                  </td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* GP summary callout inside the card */}
        {(() => {
          const gpTarget = activeYear === 1
            ? goals.year1?.grossProfitPct
            : activeYear === 2
              ? goals.year2?.grossProfitPct
              : goals.year3?.grossProfitPct;
          const gpMet = gpTarget ? grossProfitPct >= gpTarget : true;
          const gpGap = gpTarget ? grossProfitPct - gpTarget : 0;
          return (
            <div className={`mx-5 mb-5 mt-3 rounded-lg p-4 ${gpMet ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-semibold">Gross Profit</span>
                  <span className="text-sm text-gray-500 ml-2">Revenue minus COGS</span>
                </div>
                <div className="text-right">
                  <span className="text-lg font-bold">{formatCurrency(grossProfit)}</span>
                  <span className="text-sm ml-2">{grossProfitPct.toFixed(1)}%</span>
                </div>
              </div>
              {gpTarget && totalRevenue > 0 && (
                <div className="mt-2 pt-2 border-t flex items-center justify-between text-sm">
                  <span>Target: {gpTarget}%</span>
                  <span>{gpMet ? '\u2713 On track' : `${gpGap.toFixed(1)}% below target`}</span>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
