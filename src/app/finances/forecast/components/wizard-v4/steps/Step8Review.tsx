'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Lightbulb,
  ChevronRight, ChevronDown, Users, Building2, Receipt, Wallet,
  Target, ArrowRight, ToggleLeft, ToggleRight, Sparkles, FileCheck
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine
} from 'recharts';
import {
  ForecastWizardState, WizardActions, ForecastSummary, YearlySummary,
  formatCurrency, formatPercent, WIZARD_STEPS
} from '../types';
import { ExcelExport } from '../components/ExcelExport';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Step8ReviewProps {
  state: ForecastWizardState;
  actions: WizardActions;
  summary: ForecastSummary;
  fiscalYear: number;
  onGenerate?: () => void;
  isSaving?: boolean;
}

interface WaterfallItem {
  name: string;
  value: number;
  isSubtotal?: boolean;
  isTotal?: boolean;
}

interface WhatIfToggle {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  impact: number; // Change to net profit
  revenueAdj: number;
  cogsAdj: number;
  teamAdj: number;
  opexAdj: number;
  otherAdj: number;
}

type HealthStatus = 'good' | 'ok' | 'concern';

const emptySummary: YearlySummary = {
  revenue: 0, cogs: 0, grossProfit: 0, grossProfitPct: 0,
  teamCosts: 0, opex: 0, depreciation: 0, investments: 0, otherExpenses: 0,
  netProfit: 0, netProfitPct: 0,
};

// ─── Waterfall Chart Component ───────────────────────────────────────────────

function buildWaterfallData(items: WaterfallItem[]) {
  let running = 0;
  return items.map(item => {
    if (item.isSubtotal || item.isTotal) {
      const result = {
        name: item.name,
        invisible: item.value < 0 ? item.value : 0,
        display: Math.abs(item.value),
        value: item.value,
        isSubtotal: item.isSubtotal,
        isTotal: item.isTotal,
      };
      running = item.value;
      return result;
    }
    const startPos = item.value >= 0 ? running : running + item.value;
    const display = Math.abs(item.value);
    running += item.value;
    return {
      name: item.name,
      invisible: Math.max(0, startPos),
      display,
      value: item.value,
      isSubtotal: false,
      isTotal: false,
    };
  });
}

function getBarColor(item: { value: number; isSubtotal?: boolean; isTotal?: boolean }) {
  if (item.isTotal) return item.value >= 0 ? '#172238' : '#dc2626';
  if (item.isSubtotal) return '#3b82f6';
  return item.value >= 0 ? '#22c55e' : '#ef4444';
}

function PLWaterfallChart({ data }: { data: YearlySummary }) {
  const items: WaterfallItem[] = [
    { name: 'Revenue', value: data.revenue },
    { name: 'COGS', value: -data.cogs },
    { name: 'Gross Profit', value: data.grossProfit, isSubtotal: true },
    { name: 'Team', value: -data.teamCosts },
    { name: 'OpEx', value: -data.opex },
    ...((data.investments || 0) > 0 ? [{ name: 'Invest', value: -(data.investments || 0) }] : []),
    { name: 'Other', value: -data.otherExpenses },
    { name: 'Net Profit', value: data.netProfit, isTotal: true },
  ];

  const chartData = buildWaterfallData(items);

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.[1]) return null;
    const item = payload[1].payload;
    return (
      <div className="bg-white px-3 py-2 rounded-lg shadow-lg border border-gray-200 text-sm">
        <p className="font-medium text-gray-900">{item.name}</p>
        <p className={item.value >= 0 ? 'text-green-600' : 'text-red-600'}>
          {formatCurrency(item.value)}
        </p>
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 12, fill: '#6b7280' }}
          axisLine={{ stroke: '#e5e7eb' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={0} stroke="#d1d5db" />
        <Bar dataKey="invisible" stackId="waterfall" fill="transparent" />
        <Bar dataKey="display" stackId="waterfall" radius={[4, 4, 0, 0]}>
          {chartData.map((entry, index) => (
            <Cell key={index} fill={getBarColor(entry)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Health Indicator Component ──────────────────────────────────────────────

function HealthIndicator({
  label, value, format, thresholds, benchmark,
}: {
  label: string;
  value: number;
  format: 'percent' | 'currency' | 'ratio';
  thresholds: { good: number; ok: number };
  benchmark?: { value: number; label: string };
}) {
  const status: HealthStatus = value >= thresholds.good ? 'good'
    : value >= thresholds.ok ? 'ok' : 'concern';

  const statusConfig = {
    good: { dot: 'bg-green-500', text: 'text-green-700', bg: 'bg-green-50', label: 'Healthy' },
    ok: { dot: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50', label: 'Watch' },
    concern: { dot: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50', label: 'Attention' },
  };

  const cfg = statusConfig[status];
  const displayValue = format === 'percent' ? formatPercent(value)
    : format === 'currency' ? formatCurrency(value)
    : `${value.toFixed(1)}x`;

  return (
    <div className={`flex items-center justify-between p-3 rounded-lg border ${cfg.bg} border-gray-200`}>
      <div>
        <div className="text-xs text-gray-500 mb-0.5">{label}</div>
        <div className="text-lg font-bold text-gray-900">{displayValue}</div>
        {benchmark && (
          <div className="text-xs text-gray-400 mt-0.5">
            Industry avg: {format === 'percent' ? formatPercent(benchmark.value) : formatCurrency(benchmark.value)}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
        <span className={`text-xs font-medium ${cfg.text}`}>{cfg.label}</span>
      </div>
    </div>
  );
}

// ─── Expandable P&L Row ──────────────────────────────────────────────────────

function PLRow({
  label, amount, goal, children, indent, isBold, bgClass,
}: {
  label: string;
  amount: number;
  goal?: { value: number; format: 'currency' | 'percent'; actual?: number };
  children?: React.ReactNode;
  indent?: boolean;
  isBold?: boolean;
  bgClass?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = !!children;
  const isExpense = amount < 0 || (!isBold && label !== 'Revenue');

  const variance = goal
    ? (goal.format === 'currency'
      ? (goal.actual ?? amount) - goal.value
      : (goal.actual ?? amount) - goal.value)
    : null;

  return (
    <>
      <tr
        className={`${bgClass || 'hover:bg-gray-50'} ${hasChildren ? 'cursor-pointer' : ''} transition-colors`}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        <td className={`px-4 py-3 text-sm ${isBold ? 'font-semibold' : ''} ${indent ? 'pl-8' : ''}`}>
          <div className="flex items-center gap-1.5">
            {hasChildren && (
              expanded
                ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
            )}
            {!hasChildren && indent && <span className="w-4" />}
            <span>{label}</span>
          </div>
        </td>
        <td className={`px-4 py-3 text-sm text-right ${isBold ? 'font-semibold' : ''}`}>
          {isExpense && amount !== 0 ? formatCurrency(-Math.abs(amount)) : formatCurrency(amount)}
        </td>
        <td className="px-4 py-3 text-sm text-right text-gray-400">
          {goal ? (
            goal.format === 'currency'
              ? formatCurrency(goal.value)
              : formatPercent(goal.value)
          ) : '—'}
        </td>
        <td className="px-4 py-3 text-sm text-right">
          {variance !== null && Math.abs(variance) >= 0.5 ? (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
              variance >= 0 ? 'text-green-700 bg-green-100' : 'text-red-700 bg-red-100'
            }`}>
              {variance >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {goal?.format === 'currency'
                ? (variance >= 0 ? '+' : '') + formatCurrency(variance)
                : (variance >= 0 ? '+' : '') + formatPercent(variance)
              }
            </span>
          ) : variance !== null ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-green-700 bg-green-100">
              <CheckCircle className="w-3 h-3" /> On Track
            </span>
          ) : '—'}
        </td>
      </tr>
      {expanded && children && (
        <tr>
          <td colSpan={4} className="px-4 py-0">
            <div className="ml-6 pl-4 border-l-2 border-gray-100 py-2 space-y-1">
              {children}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Main Step 8 Component ───────────────────────────────────────────────────

export function Step8Review({ state, actions, summary, fiscalYear, onGenerate, isSaving }: Step8ReviewProps) {
  const { goals, forecastDuration } = state;
  const [activeYear, setActiveYear] = useState<1 | 2 | 3>(1);
  const [whatIfToggles, setWhatIfToggles] = useState<WhatIfToggle[]>([]);

  // Get the active year's summary
  const getYearData = (yr: 1 | 2 | 3): YearlySummary => {
    if (yr === 1) return summary.year1;
    if (yr === 2) return summary.year2 || emptySummary;
    return summary.year3 || emptySummary;
  };

  const yearData = getYearData(activeYear);
  const yearGoals = state.goals[`year${activeYear}` as 'year1' | 'year2' | 'year3'];

  // ─── What-If Toggles ──────────────────────────────────────────────────────

  const baseToggles = useMemo((): WhatIfToggle[] => {
    const y = summary.year1;
    const revDrop = Math.round(y.revenue * 0.1);
    const cogsDrop = Math.round(y.cogs * 0.05);

    // Find the most expensive new hire
    const topHire = state.newHires.length > 0
      ? state.newHires.reduce((max, h) => h.salary > max.salary ? h : max, state.newHires[0])
      : null;
    const hireSaving = topHire ? Math.round((topHire.salary * 1.12) / 2) : 0; // 6 months of salary + super

    return [
      {
        id: 'rev-drop',
        label: 'What if revenue drops 10%?',
        description: `Revenue decreases by ${formatCurrency(revDrop)}`,
        enabled: false,
        impact: -revDrop + Math.round(revDrop * (y.cogs / y.revenue)), // net of variable COGS savings
        revenueAdj: -revDrop,
        cogsAdj: Math.round(revDrop * (y.cogs / y.revenue)),
        teamAdj: 0,
        opexAdj: 0,
        otherAdj: 0,
      },
      ...(topHire ? [{
        id: 'delay-hire',
        label: `What if we delay hiring ${topHire.role || 'new role'} by 6 months?`,
        description: `Save ${formatCurrency(hireSaving)} in team costs`,
        enabled: false,
        impact: hireSaving,
        revenueAdj: 0,
        cogsAdj: 0,
        teamAdj: -hireSaving,
        opexAdj: 0,
        otherAdj: 0,
      }] : []),
      {
        id: 'cogs-up',
        label: 'What if COGS increases 5%?',
        description: `Cost of sales rises by ${formatCurrency(cogsDrop)}`,
        enabled: false,
        impact: -cogsDrop,
        revenueAdj: 0,
        cogsAdj: cogsDrop,
        teamAdj: 0,
        opexAdj: 0,
        otherAdj: 0,
      },
      {
        id: 'opex-cut',
        label: 'What if we cut OpEx by 10%?',
        description: `Save ${formatCurrency(Math.round(y.opex * 0.1))} in operating expenses`,
        enabled: false,
        impact: Math.round(y.opex * 0.1),
        revenueAdj: 0,
        cogsAdj: 0,
        teamAdj: 0,
        opexAdj: -Math.round(y.opex * 0.1),
        otherAdj: 0,
      },
      {
        id: 'price-up',
        label: 'What if we increase prices 5%?',
        description: `Revenue rises ${formatCurrency(Math.round(y.revenue * 0.05))} with no volume change`,
        enabled: false,
        impact: Math.round(y.revenue * 0.05) - Math.round(y.revenue * 0.05 * (y.cogs / y.revenue)),
        revenueAdj: Math.round(y.revenue * 0.05),
        cogsAdj: Math.round(y.revenue * 0.05 * (y.cogs / y.revenue)), // Variable COGS doesn't change on price increase
        teamAdj: 0,
        opexAdj: 0,
        otherAdj: 0,
      },
    ];
  }, [summary, state.newHires]);

  // Initialize toggles from base
  useEffect(() => { setWhatIfToggles(baseToggles); }, [baseToggles]);

  const toggleWhatIf = (id: string) => {
    setWhatIfToggles(prev => prev.map(t =>
      t.id === id ? { ...t, enabled: !t.enabled } : t
    ));
  };

  // Adjusted year data with what-if toggles applied
  const adjustedData = useMemo((): YearlySummary => {
    if (activeYear !== 1) return yearData; // What-if only applies to Y1

    const activeToggles = whatIfToggles.filter(t => t.enabled);
    if (activeToggles.length === 0) return yearData;

    const totalRevAdj = activeToggles.reduce((s, t) => s + t.revenueAdj, 0);
    const totalCogsAdj = activeToggles.reduce((s, t) => s + t.cogsAdj, 0);
    const totalTeamAdj = activeToggles.reduce((s, t) => s + t.teamAdj, 0);
    const totalOpexAdj = activeToggles.reduce((s, t) => s + t.opexAdj, 0);
    const totalOtherAdj = activeToggles.reduce((s, t) => s + t.otherAdj, 0);

    const revenue = yearData.revenue + totalRevAdj;
    const cogs = yearData.cogs - totalCogsAdj;
    const grossProfit = revenue - cogs;
    const teamCosts = yearData.teamCosts + totalTeamAdj;
    const opex = yearData.opex + totalOpexAdj;
    const otherExpenses = yearData.otherExpenses + totalOtherAdj;
    const netProfit = grossProfit - teamCosts - opex - otherExpenses;

    return {
      revenue,
      cogs,
      grossProfit,
      grossProfitPct: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
      teamCosts,
      opex,
      depreciation: yearData.depreciation,
      otherExpenses,
      netProfit,
      netProfitPct: revenue > 0 ? (netProfit / revenue) * 100 : 0,
    };
  }, [yearData, whatIfToggles, activeYear]);

  const hasWhatIfActive = whatIfToggles.some(t => t.enabled);

  // ─── Completion Checklist ──────────────────────────────────────────────────

  const completionSteps = useMemo(() => [
    { step: 1, label: 'Goals', hasData: goals.year1.revenue > 0, icon: Target },
    { step: 2, label: 'Prior Year', hasData: !!state.priorYear, icon: FileCheck },
    { step: 3, label: 'Revenue & COGS', hasData: state.revenueLines.length > 0, icon: TrendingUp },
    { step: 4, label: 'Team', hasData: state.teamMembers.length > 0 || state.newHires.length > 0, icon: Users },
    { step: 5, label: 'OpEx', hasData: state.opexLines.length > 0, icon: Receipt },
    { step: 6, label: 'Subscriptions', hasData: state.opexLines.some(l => l.isSubscription), icon: Wallet },
    { step: 7, label: 'CapEx & Other', hasData: state.capexItems.length > 0 || state.otherExpenses.length > 0, icon: Building2 },
  ], [goals, state]);

  const completedCount = completionSteps.filter(s => s.hasData).length;

  // ─── Insights ──────────────────────────────────────────────────────────────

  const insights = useMemo(() => {
    const items: { type: 'warning' | 'success' | 'info'; message: string; stepLink?: number }[] = [];
    const y1 = summary.year1;

    // Missing data warnings
    if (y1.revenue === 0) {
      items.push({
        type: 'warning',
        message: 'No revenue entered yet. Go to Step 3 to add your revenue lines.',
        stepLink: 3,
      });
    }

    if (state.teamMembers.length === 0 && state.newHires.length === 0) {
      items.push({
        type: 'warning',
        message: 'No team members added. Go to Step 4 to plan your team.',
        stepLink: 4,
      });
    }

    // Goal variance warnings
    if (y1.revenue > 0 && yearGoals && y1.netProfitPct < yearGoals.netProfitPct - 2) {
      const gap = yearGoals.netProfitPct - y1.netProfitPct;
      const costGap = Math.round((gap / 100) * y1.revenue);
      items.push({
        type: 'warning',
        message: `Net profit margin (${formatPercent(y1.netProfitPct)}) is ${formatPercent(gap)} below your ${formatPercent(yearGoals.netProfitPct)} target. You'd need to reduce costs by ${formatCurrency(costGap)} or increase revenue.`,
      });
    }

    // Team cost check
    if (y1.revenue > 0) {
      const teamPct = (y1.teamCosts / y1.revenue) * 100;
      if (teamPct > 40) {
        items.push({
          type: 'warning',
          message: `Team costs are ${formatPercent(teamPct)} of revenue. Consider if all new hires are essential for Year 1 or if some can be delayed.`,
          stepLink: 4,
        });
      }
    }

    // Gross profit check
    if (yearGoals && y1.grossProfitPct >= yearGoals.grossProfitPct && y1.revenue > 0) {
      items.push({
        type: 'success',
        message: `Gross profit margin (${formatPercent(y1.grossProfitPct)}) meets your ${formatPercent(yearGoals.grossProfitPct)} target.`,
      });
    }

    // Multi-year growth
    if (forecastDuration >= 2 && summary.year2 && y1.revenue > 0) {
      const y2 = summary.year2;
      const growth = ((y2.revenue - y1.revenue) / y1.revenue) * 100;
      if (growth > 0) {
        const profitImprovement = y2.netProfitPct - y1.netProfitPct;
        items.push({
          type: 'info',
          message: `${formatPercent(growth)} revenue growth planned Y1→Y2. Net margin ${profitImprovement >= 0 ? 'improves' : 'declines'} from ${formatPercent(y1.netProfitPct)} to ${formatPercent(y2.netProfitPct)}.`,
        });
      }
    }

    // Revenue per employee
    const totalHeadcount = state.teamMembers.length + state.newHires.length;
    if (totalHeadcount > 0 && y1.revenue > 0) {
      const revPerHead = y1.revenue / totalHeadcount;
      if (revPerHead < 100000) {
        items.push({
          type: 'info',
          message: `Revenue per team member is ${formatCurrency(revPerHead)}. Growing revenue or optimising team size could improve this.`,
        });
      }
    }

    return items;
  }, [summary, state, yearGoals, forecastDuration]);

  // ─── Drill-down data ───────────────────────────────────────────────────────

  const revenueBreakdown = state.revenueLines.map(l => ({
    name: l.name,
    amount: Object.values(l.year1Monthly).reduce((a, b) => a + b, 0),
  }));

  const teamBreakdown = [
    ...(state.teamMembers.length > 0 ? [{
      name: `${state.teamMembers.length} existing employee${state.teamMembers.length !== 1 ? 's' : ''}`,
      detail: `Incl. ${formatCurrency(Math.round(state.teamMembers.reduce((s, m) => s + (m.type !== 'contractor' ? m.newSalary * 0.12 : 0), 0)))} super`,
    }] : []),
    ...(state.newHires.length > 0 ? [{
      name: `${state.newHires.length} planned hire${state.newHires.length !== 1 ? 's' : ''}`,
      detail: state.newHires.map(h => h.role || 'New role').join(', '),
    }] : []),
    ...(state.departures.length > 0 ? [{
      name: `${state.departures.length} departure${state.departures.length !== 1 ? 's' : ''}`,
      detail: 'Planned exits',
    }] : []),
    ...(state.bonuses.reduce((s, b) => s + b.amount, 0) > 0 ? [{
      name: 'Bonuses',
      detail: formatCurrency(state.bonuses.reduce((s, b) => s + b.amount, 0)),
    }] : []),
  ];

  const opexBreakdown = [
    { name: `${state.opexLines.filter(l => l.costBehavior === 'fixed').length} fixed costs`, detail: 'Same amount each month' },
    { name: `${state.opexLines.filter(l => l.costBehavior === 'variable').length} variable costs`, detail: 'Scales with revenue' },
    ...(state.opexLines.filter(l => l.costBehavior === 'seasonal').length > 0 ? [{
      name: `${state.opexLines.filter(l => l.costBehavior === 'seasonal').length} seasonal costs`,
      detail: 'Follows prior year pattern',
    }] : []),
  ].filter(item => !item.name.startsWith('0'));

  // ─── Render ────────────────────────────────────────────────────────────────

  const durationLabel = forecastDuration === 1 ? '1-Year' : forecastDuration === 2 ? '2-Year' : '3-Year';
  const years = Array.from({ length: forecastDuration }, (_, i) => (i + 1) as 1 | 2 | 3);

  return (
    <div className="space-y-6">

      {/* ── Layer 1: Draft Status Banner ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-sm font-medium text-amber-700 uppercase tracking-wide">
              Draft Forecast
            </span>
            <span className="text-sm text-gray-400">
              FY{fiscalYear}{forecastDuration >= 2 ? `–FY${fiscalYear + forecastDuration - 1}` : ''}
            </span>
          </div>
          <span className="text-sm text-gray-500">
            {completedCount}/{completionSteps.length} steps complete
          </span>
        </div>
        {/* Progress bar */}
        <div className="w-full bg-gray-100 rounded-full h-1.5 mb-4">
          <div
            className="bg-amber-500 h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${(completedCount / completionSteps.length) * 100}%` }}
          />
        </div>
        {/* AI Verdict */}
        {summary.year1.revenue > 0 && (
          <div className="flex items-start gap-3 bg-gray-50 rounded-lg p-4">
            <Sparkles className="w-5 h-5 text-brand-navy flex-shrink-0 mt-0.5" />
            <p className="text-sm text-gray-700">
              {summary.year1.netProfitPct >= (yearGoals?.netProfitPct || 0) ? (
                <>Your plan achieves <strong>{formatPercent(summary.year1.netProfitPct)}</strong> net margin on <strong>{formatCurrency(summary.year1.revenue)}</strong> revenue{forecastDuration >= 2 && summary.year2 ? <>, growing to <strong>{formatPercent(summary.year2.netProfitPct)}</strong> by FY{fiscalYear + 1}</> : ''}. Looking strong.</>
              ) : (
                <>Your plan shows <strong>{formatPercent(summary.year1.netProfitPct)}</strong> net margin on <strong>{formatCurrency(summary.year1.revenue)}</strong> revenue — <strong>{formatPercent((yearGoals?.netProfitPct || 0) - summary.year1.netProfitPct)}</strong> below your goal. Review the insights below to close the gap.</>
              )}
            </p>
          </div>
        )}
      </div>

      {/* ── Layer 2: Waterfall Chart ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">
            Where Your Money Goes — FY{fiscalYear + activeYear - 1}
            {hasWhatIfActive && <span className="ml-2 text-xs font-normal text-amber-600">(adjusted)</span>}
          </h3>
          {/* Year tabs for multi-year */}
          {forecastDuration > 1 && (
            <div className="flex border border-gray-200 rounded-lg overflow-hidden">
              {years.map(yr => (
                <button
                  key={yr}
                  onClick={() => setActiveYear(yr)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    activeYear === yr
                      ? 'bg-brand-navy text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  FY{fiscalYear + yr - 1}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="p-4">
          <PLWaterfallChart data={adjustedData} />
        </div>
      </div>

      {/* ── Layer 3: Trajectory Cards (multi-year only) ── */}
      {forecastDuration > 1 && (
        <div className={`grid ${forecastDuration === 2 ? 'grid-cols-2' : 'grid-cols-3'} gap-4`}>
          {years.map(yr => {
            const yd = getYearData(yr);
            const yg = state.goals[`year${yr}` as 'year1' | 'year2' | 'year3'];
            const meetsGoal = yg ? yd.netProfitPct >= yg.netProfitPct - 1 : true;
            const isActive = activeYear === yr;

            return (
              <button
                key={yr}
                onClick={() => setActiveYear(yr)}
                className={`text-left p-4 rounded-xl border-2 transition-all ${
                  isActive
                    ? 'border-brand-navy bg-white shadow-sm'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-gray-900">FY{fiscalYear + yr - 1}</span>
                  <div className={`w-2.5 h-2.5 rounded-full ${meetsGoal ? 'bg-green-500' : 'bg-amber-500'}`} />
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Revenue</span>
                    <span className="font-medium text-gray-900">{formatCurrency(yd.revenue)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Gross Profit</span>
                    <span className={`font-medium ${yd.grossProfit >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                      {formatCurrency(yd.grossProfit)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Net Profit</span>
                    <span className={`font-medium ${yd.netProfit >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                      {formatCurrency(yd.netProfit)}
                    </span>
                  </div>
                  {yg && (
                    <div className="pt-1.5 mt-1.5 border-t border-gray-100 flex justify-between text-xs">
                      <span className="text-gray-400">vs Profit Goal</span>
                      <span className={yd.netProfitPct >= yg.netProfitPct ? 'text-green-600' : 'text-red-600'}>
                        {yd.netProfitPct >= yg.netProfitPct ? '+' : ''}{formatPercent(yd.netProfitPct - yg.netProfitPct)}
                      </span>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Layer 4: Detailed Draft P&L ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-base font-semibold text-gray-900">
            Draft P&L — FY{fiscalYear + activeYear - 1}
            {hasWhatIfActive && <span className="ml-2 text-xs font-normal text-amber-600">(with adjustments)</span>}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase w-56">Category</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase w-36">Forecast</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase w-28">Goal</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase w-32">Variance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {/* Revenue */}
              <PLRow
                label="Revenue"
                amount={adjustedData.revenue}
                goal={yearGoals ? { value: yearGoals.revenue, format: 'currency' } : undefined}
              >
                {revenueBreakdown.length > 0 && revenueBreakdown.map((line, i) => (
                  <div key={i} className="flex justify-between py-1 text-sm text-gray-600">
                    <span>{line.name}</span>
                    <span>{formatCurrency(line.amount)}</span>
                  </div>
                ))}
              </PLRow>

              {/* COGS */}
              <PLRow label="Cost of Sales" amount={-adjustedData.cogs} />

              {/* Gross Profit */}
              <PLRow
                label="Gross Profit"
                amount={adjustedData.grossProfit}
                goal={yearGoals ? {
                  value: yearGoals.grossProfitPct,
                  format: 'percent',
                  actual: adjustedData.grossProfitPct,
                } : undefined}
                isBold
                bgClass="bg-green-50 hover:bg-green-100"
              />

              {/* Team */}
              <PLRow label="Team Costs" amount={-adjustedData.teamCosts}>
                {teamBreakdown.map((item, i) => (
                  <div key={i} className="flex justify-between py-1 text-sm text-gray-600">
                    <span>{item.name}</span>
                    <span className="text-gray-400 text-xs">{item.detail}</span>
                  </div>
                ))}
              </PLRow>

              {/* OpEx */}
              <PLRow label="Operating Expenses" amount={-adjustedData.opex}>
                {opexBreakdown.map((item, i) => (
                  <div key={i} className="flex justify-between py-1 text-sm text-gray-600">
                    <span>{item.name}</span>
                    <span className="text-gray-400 text-xs">{item.detail}</span>
                  </div>
                ))}
              </PLRow>

              {/* Investments */}
              {(adjustedData.investments || 0) > 0 && (
                <PLRow label="Strategic Investments" amount={-(adjustedData.investments || 0)} />
              )}

              {/* Other */}
              {adjustedData.otherExpenses > 0 && (
                <PLRow label="Other Expenses" amount={-adjustedData.otherExpenses} />
              )}

              {/* Net Profit */}
              <tr className="bg-brand-navy text-white">
                <td className="px-4 py-4 text-sm font-bold">
                  <div className="flex items-center gap-1.5">
                    <span>Net Profit</span>
                  </div>
                </td>
                <td className="px-4 py-4 text-sm text-right font-bold">
                  {formatCurrency(adjustedData.netProfit)}
                  <span className="text-xs text-white/60 ml-1">
                    ({formatPercent(adjustedData.netProfitPct)})
                  </span>
                </td>
                <td className="px-4 py-4 text-sm text-right text-white/60">
                  {yearGoals ? formatPercent(yearGoals.netProfitPct) : '—'}
                </td>
                <td className="px-4 py-4 text-sm text-right">
                  {yearGoals && (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      adjustedData.netProfitPct >= yearGoals.netProfitPct
                        ? 'text-green-100 bg-green-900/30'
                        : 'text-red-100 bg-red-900/30'
                    }`}>
                      {adjustedData.netProfitPct >= yearGoals.netProfitPct
                        ? <CheckCircle className="w-3 h-3" />
                        : <TrendingDown className="w-3 h-3" />
                      }
                      {(adjustedData.netProfitPct >= yearGoals.netProfitPct ? '+' : '') +
                        formatPercent(adjustedData.netProfitPct - yearGoals.netProfitPct)}
                    </span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Layer 5: Health Indicators ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Financial Health Check</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <HealthIndicator
            label="Gross Margin"
            value={adjustedData.grossProfitPct}
            format="percent"
            thresholds={{ good: 40, ok: 25 }}
            benchmark={state.businessProfile?.industry ? { value: 55, label: 'Industry avg' } : undefined}
          />
          <HealthIndicator
            label="Net Margin"
            value={adjustedData.netProfitPct}
            format="percent"
            thresholds={{ good: 15, ok: 5 }}
          />
          <HealthIndicator
            label="Team / Revenue"
            value={adjustedData.revenue > 0 ? (adjustedData.teamCosts / adjustedData.revenue) * 100 : 0}
            format="percent"
            thresholds={{ good: 35, ok: 25 }}
          />
          <HealthIndicator
            label="Revenue per Person"
            value={adjustedData.revenue > 0 && (state.teamMembers.length + state.newHires.length) > 0
              ? adjustedData.revenue / (state.teamMembers.length + state.newHires.length) : 0}
            format="currency"
            thresholds={{ good: 150000, ok: 100000 }}
          />
        </div>
      </div>

      {/* ── Layer 6: What-If Toggles ── */}
      {whatIfToggles.length > 0 && activeYear === 1 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-1">Quick Scenarios</h3>
          <p className="text-sm text-gray-500 mb-4">Toggle to see how changes affect your bottom line</p>
          <div className="space-y-3">
            {whatIfToggles.map(toggle => (
              <button
                key={toggle.id}
                onClick={() => toggleWhatIf(toggle.id)}
                className={`w-full flex items-center justify-between p-4 rounded-lg border transition-all text-left ${
                  toggle.enabled
                    ? 'border-brand-navy bg-brand-navy/5'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  {toggle.enabled
                    ? <ToggleRight className="w-6 h-6 text-brand-navy flex-shrink-0" />
                    : <ToggleLeft className="w-6 h-6 text-gray-300 flex-shrink-0" />
                  }
                  <div>
                    <div className="text-sm font-medium text-gray-900">{toggle.label}</div>
                    <div className="text-xs text-gray-500">{toggle.description}</div>
                  </div>
                </div>
                <div className={`text-sm font-semibold ${toggle.impact >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {toggle.impact >= 0 ? '+' : ''}{formatCurrency(toggle.impact)} profit
                </div>
              </button>
            ))}
          </div>
          {hasWhatIfActive && (() => {
            const activeToggles = whatIfToggles.filter(t => t.enabled);
            const totalImpact = activeToggles.reduce((s, t) => s + t.impact, 0);
            const baseProfit = yearData.netProfit;
            const adjustedProfit = baseProfit + totalImpact;
            return (
              <>
                {/* Combined impact */}
                {activeToggles.length > 0 && (
                  <div className={`mt-4 p-4 rounded-lg border ${totalImpact >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900">
                        Net effect of {activeToggles.length} scenario{activeToggles.length > 1 ? 's' : ''}
                      </span>
                      <span className={`text-lg font-bold ${totalImpact >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {totalImpact >= 0 ? '+' : ''}{formatCurrency(totalImpact)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">
                      Net Profit goes from {formatCurrency(baseProfit)} to {formatCurrency(adjustedProfit)}
                      {yearData.revenue > 0 && (
                        <span> — that's {((adjustedProfit / yearData.revenue) * 100).toFixed(1)}% of revenue</span>
                      )}
                    </p>
                  </div>
                )}
                <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <p className="text-xs text-amber-700">
                    Scenarios are for exploration only — they won't change your saved forecast.
                  </p>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* ── Layer 7: AI Insights ── */}
      {insights.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb className="w-5 h-5 text-amber-500" />
            <h3 className="text-base font-semibold text-gray-900">Insights & Suggestions</h3>
          </div>
          <div className="space-y-3">
            {insights.map((insight, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-3 p-4 rounded-lg ${
                  insight.type === 'warning'
                    ? 'bg-amber-50 border border-amber-200'
                    : insight.type === 'success'
                    ? 'bg-green-50 border border-green-200'
                    : 'bg-blue-50 border border-blue-200'
                }`}
              >
                {insight.type === 'warning' ? (
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                ) : insight.type === 'success' ? (
                  <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <Lightbulb className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className={`text-sm ${
                    insight.type === 'warning' ? 'text-amber-800'
                    : insight.type === 'success' ? 'text-green-800'
                    : 'text-blue-800'
                  }`}>
                    {insight.message}
                  </p>
                  {insight.stepLink && (
                    <button
                      onClick={() => actions.goToStep(insight.stepLink as any)}
                      className="mt-2 text-xs font-medium text-brand-navy hover:underline flex items-center gap-1"
                    >
                      Go to Step {insight.stepLink} <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Layer 8: Completion Checklist + Generate CTA ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Steps Completed</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mb-6">
          {completionSteps.map(step => {
            const Icon = step.icon;
            return (
              <button
                key={step.step}
                onClick={() => actions.goToStep(step.step as any)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-colors ${
                  step.hasData
                    ? 'border-green-200 bg-green-50 text-green-700'
                    : 'border-gray-200 bg-gray-50 text-gray-400 hover:border-gray-300'
                }`}
              >
                {step.hasData
                  ? <CheckCircle className="w-5 h-5" />
                  : <Icon className="w-5 h-5" />
                }
                <span className="text-xs font-medium text-center">{step.label}</span>
              </button>
            );
          })}
        </div>

        {/* Generate CTA */}
        <div className="bg-gradient-to-r from-brand-navy to-brand-navy/90 rounded-xl p-6 text-white text-center">
          <h3 className="text-lg font-bold mb-2">Ready to Generate Your Forecast?</h3>
          <p className="text-white/70 text-sm mb-4">
            Create your complete {durationLabel.toLowerCase()} P&L forecast. You can always come back and adjust later.
          </p>
          <div className="flex items-center justify-center gap-3">
          {onGenerate && (
            <button
              onClick={onGenerate}
              disabled={isSaving || !(completionSteps[0].hasData && (completionSteps[2].hasData || summary.year1.revenue > 0))}
              className="inline-flex items-center gap-2 px-8 py-3 text-sm font-semibold bg-white text-brand-navy rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-brand-navy/30 border-t-brand-navy rounded-full animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate Forecast
                </>
              )}
            </button>
          )}
          <ExcelExport state={state} summary={summary} fiscalYear={fiscalYear} />
          </div>
          {!(completionSteps[0].hasData && (completionSteps[2].hasData || summary.year1.revenue > 0)) && (
            <p className="text-xs text-white/50 mt-3">
              Complete at least Goals and Revenue to generate your forecast.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
