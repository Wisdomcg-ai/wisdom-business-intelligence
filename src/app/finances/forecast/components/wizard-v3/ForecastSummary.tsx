/**
 * ForecastSummary - Right panel of the 3-panel wizard layout
 *
 * Features:
 * - Live updating forecast numbers as decisions are made
 * - Visual progress bars for key metrics
 * - Target vs forecast comparison
 * - Confidence indicator
 */

'use client';

import { useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Target,
  DollarSign,
  Users,
  Briefcase,
  AlertTriangle,
  CheckCircle,
  MinusCircle,
} from 'lucide-react';
import { WizardContext, WizardStep, ForecastDecision } from '@/app/finances/forecast/types';

interface ForecastSummaryProps {
  context: WizardContext | null;
  currentStep: WizardStep;
  decisions: ForecastDecision[];
  stepsCompleted: WizardStep[];
}

interface MetricBarProps {
  label: string;
  value: number;
  target?: number;
  format?: 'currency' | 'percent' | 'number';
  color?: 'blue' | 'green' | 'orange' | 'purple' | 'red';
  showBar?: boolean;
}

function formatValue(value: number, format: 'currency' | 'percent' | 'number'): string {
  switch (format) {
    case 'currency':
      if (value >= 1000000) {
        return `$${(value / 1000000).toFixed(2)}M`;
      }
      if (value >= 1000) {
        return `$${(value / 1000).toFixed(0)}K`;
      }
      return `$${value.toLocaleString()}`;
    case 'percent':
      return `${value.toFixed(1)}%`;
    case 'number':
    default:
      return value.toLocaleString();
  }
}

function MetricBar({
  label,
  value,
  target,
  format = 'currency',
  color = 'blue',
  showBar = true,
}: MetricBarProps) {
  const percentage = target ? Math.min((value / target) * 100, 100) : 0;
  const isOverTarget = target && value > target;

  const colorClasses = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    orange: 'bg-orange-500',
    purple: 'bg-purple-500',
    red: 'bg-red-500',
  };

  const bgColorClasses = {
    blue: 'bg-blue-100',
    green: 'bg-green-100',
    orange: 'bg-orange-100',
    purple: 'bg-purple-100',
    red: 'bg-red-100',
  };

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-baseline">
        <span className="text-sm text-gray-600">{label}</span>
        <span className="font-medium text-gray-900">{formatValue(value, format)}</span>
      </div>

      {showBar && target && (
        <div className="relative">
          <div className={`h-2 rounded-full ${bgColorClasses[color]}`}>
            <div
              className={`h-2 rounded-full transition-all duration-500 ${colorClasses[color]}`}
              style={{ width: `${percentage}%` }}
            />
          </div>
          {target && (
            <div className="flex justify-between mt-1">
              <span className="text-xs text-gray-400">
                {percentage.toFixed(0)}% of target
              </span>
              <span className="text-xs text-gray-400">
                Target: {formatValue(target, format)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ComparisonRowProps {
  label: string;
  forecast: number;
  target: number;
  format?: 'currency' | 'percent';
}

function ComparisonRow({ label, forecast, target, format = 'currency' }: ComparisonRowProps) {
  const variance = forecast - target;
  const variancePercent = target !== 0 ? (variance / target) * 100 : 0;
  const isPositive = variance >= 0;

  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0">
      <span className="text-sm text-gray-600">{label}</span>
      <div className="flex items-center gap-3">
        <span className="font-medium">{formatValue(forecast, format)}</span>
        <span
          className={`text-xs flex items-center gap-0.5 ${
            isPositive ? 'text-green-600' : 'text-red-600'
          }`}
        >
          {isPositive ? (
            <TrendingUp className="w-3 h-3" />
          ) : (
            <TrendingDown className="w-3 h-3" />
          )}
          {isPositive ? '+' : ''}
          {variancePercent.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

function ConfidenceIndicator({ stepsCompleted }: { stepsCompleted: WizardStep[] }) {
  const totalSteps = 6;
  const completedCount = stepsCompleted.length;
  const percentage = (completedCount / totalSteps) * 100;

  let status: 'low' | 'medium' | 'high' = 'low';
  let color = 'red';
  let label = 'Draft';

  if (percentage >= 80) {
    status = 'high';
    color = 'green';
    label = 'Ready';
  } else if (percentage >= 50) {
    status = 'medium';
    color = 'orange';
    label = 'In Progress';
  }

  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full bg-${color}-500`} />
      <span className="text-sm text-gray-600">
        Forecast Confidence: <span className="font-medium">{label}</span>
      </span>
      <span className="text-xs text-gray-400">({completedCount}/{totalSteps} steps)</span>
    </div>
  );
}

function StepProgress({ stepsCompleted, currentStep }: { stepsCompleted: WizardStep[]; currentStep: WizardStep }) {
  const steps: WizardStep[] = ['setup', 'team', 'costs', 'investments', 'projections', 'review'];

  return (
    <div className="flex gap-1">
      {steps.map((step, i) => {
        const isComplete = stepsCompleted.includes(step);
        const isCurrent = step === currentStep;

        return (
          <div
            key={step}
            className={`flex-1 h-1.5 rounded-full transition-colors ${
              isComplete
                ? 'bg-green-500'
                : isCurrent
                ? 'bg-blue-500'
                : 'bg-gray-200'
            }`}
          />
        );
      })}
    </div>
  );
}

export function ForecastSummary({
  context,
  currentStep,
  decisions,
  stepsCompleted,
}: ForecastSummaryProps) {
  // Calculate live forecast values from context and decisions
  const forecast = useMemo(() => {
    if (!context) {
      return {
        revenue: 0,
        cogs: 0,
        grossProfit: 0,
        grossMargin: 0,
        teamCosts: 0,
        opex: 0,
        totalCosts: 0,
        netProfit: 0,
        netMargin: 0,
        headcount: 0,
        plannedHires: 0,
      };
    }

    // Start with targets
    const revenueTarget = context.goals?.revenue_target || 0;

    // Calculate team costs from current team
    const currentTeam = context.current_team || [];
    const teamCosts = currentTeam.reduce((sum, emp) => {
      const salary = emp.annual_salary || 0;
      return sum + salary * 1.12; // Include 12% super
    }, 0);

    // Calculate planned hire costs from decisions
    const hireDecisions = decisions.filter(d => d.decision_type === 'new_hire');
    const plannedHireCosts = hireDecisions.reduce((sum, d) => {
      const salary = (d.decision_data?.annual_salary as number) || 0;
      return sum + salary * 1.12;
    }, 0);

    // Calculate total team costs
    const totalTeamCosts = teamCosts + plannedHireCosts;

    // Get OpEx from historical data or decisions
    let opex = 0;
    if (context.historical_pl?.prior_fy) {
      opex = context.historical_pl.prior_fy.operating_expenses;

      // Apply any cost adjustments from decisions
      const costDecisions = decisions.filter(d => d.decision_type === 'cost_changed');
      costDecisions.forEach(d => {
        const adjustment = (d.decision_data?.adjustment_percent as number) || 0;
        opex = opex * (1 + adjustment / 100);
      });
    }

    // Calculate investments from decisions
    const investmentDecisions = decisions.filter(d => d.decision_type === 'investment');
    const investments = investmentDecisions.reduce((sum, d) => {
      const amount = (d.decision_data?.amount as number) || 0;
      return sum + amount;
    }, 0);

    // Use historical COGS ratio or estimate
    let cogsRatio = 0.35; // Default 35%
    if (context.historical_pl?.prior_fy) {
      const priorRev = context.historical_pl.prior_fy.total_revenue;
      const priorCogs = context.historical_pl.prior_fy.total_cogs;
      if (priorRev > 0) {
        cogsRatio = priorCogs / priorRev;
      }
    }

    // Calculate P&L
    const cogs = revenueTarget * cogsRatio;
    const grossProfit = revenueTarget - cogs;
    const grossMargin = revenueTarget > 0 ? (grossProfit / revenueTarget) * 100 : 0;

    // OpEx includes team costs that are classified as OpEx
    const opexTeamCosts = currentTeam
      .filter(e => e.classification === 'opex')
      .reduce((sum, e) => sum + (e.annual_salary || 0) * 1.12, 0);

    const totalOpex = opex + opexTeamCosts + investments;
    const totalCosts = cogs + totalOpex;

    const netProfit = grossProfit - totalOpex;
    const netMargin = revenueTarget > 0 ? (netProfit / revenueTarget) * 100 : 0;

    return {
      revenue: revenueTarget,
      cogs,
      grossProfit,
      grossMargin,
      teamCosts: totalTeamCosts,
      opex: totalOpex,
      totalCosts,
      netProfit,
      netMargin,
      headcount: currentTeam.length,
      plannedHires: hireDecisions.length,
    };
  }, [context, decisions]);

  // Get targets for comparison
  const targets = {
    revenue: context?.goals?.revenue_target || 0,
    grossMargin: context?.goals?.gross_margin_percent || 40,
    netProfit: context?.goals?.profit_target || forecast.netProfit,
  };

  if (!context) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-gray-400 text-sm">Loading forecast...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-gray-50 to-white">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-gray-900">Live Forecast</h3>
          <span className="text-xs text-gray-500">FY{context.fiscal_year}</span>
        </div>
        <StepProgress stepsCompleted={stepsCompleted} currentStep={currentStep} />
      </div>

      {/* Main forecast view */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Revenue */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-green-600" />
            </div>
            <span className="font-medium text-gray-900">Revenue</span>
          </div>
          <MetricBar
            label="Forecast"
            value={forecast.revenue}
            target={targets.revenue}
            format="currency"
            color="green"
          />
        </div>

        {/* Margins */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-blue-600" />
            </div>
            <span className="font-medium text-gray-900">Profitability</span>
          </div>
          <div className="space-y-4">
            <MetricBar
              label="Gross Profit"
              value={forecast.grossProfit}
              format="currency"
              color="blue"
              showBar={false}
            />
            <MetricBar
              label="Gross Margin"
              value={forecast.grossMargin}
              target={targets.grossMargin}
              format="percent"
              color="blue"
            />
            <div className="pt-2 border-t border-gray-100">
              <MetricBar
                label="Net Profit"
                value={forecast.netProfit}
                target={targets.netProfit}
                format="currency"
                color={forecast.netProfit >= 0 ? 'green' : 'red'}
              />
            </div>
            <MetricBar
              label="Net Margin"
              value={forecast.netMargin}
              format="percent"
              color={forecast.netMargin >= 10 ? 'green' : forecast.netMargin >= 0 ? 'orange' : 'red'}
              showBar={false}
            />
          </div>
        </div>

        {/* Costs breakdown */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
              <Briefcase className="w-4 h-4 text-orange-600" />
            </div>
            <span className="font-medium text-gray-900">Costs</span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">COGS</span>
              <span className="font-medium">{formatValue(forecast.cogs, 'currency')}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Operating Expenses</span>
              <span className="font-medium">{formatValue(forecast.opex, 'currency')}</span>
            </div>
            <div className="pt-2 border-t border-gray-100 flex justify-between text-sm">
              <span className="text-gray-900 font-medium">Total Costs</span>
              <span className="font-bold">{formatValue(forecast.totalCosts, 'currency')}</span>
            </div>
          </div>
        </div>

        {/* Team */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
              <Users className="w-4 h-4 text-purple-600" />
            </div>
            <span className="font-medium text-gray-900">Team</span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Current Headcount</span>
              <span className="font-medium">{forecast.headcount}</span>
            </div>
            {forecast.plannedHires > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Planned Hires</span>
                <span className="font-medium text-green-600">+{forecast.plannedHires}</span>
              </div>
            )}
            <div className="pt-2 border-t border-gray-100 flex justify-between text-sm">
              <span className="text-gray-600">Team Costs (inc. super)</span>
              <span className="font-medium">{formatValue(forecast.teamCosts, 'currency')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer with confidence */}
      <div className="px-4 py-3 border-t border-gray-200 flex-shrink-0 bg-white">
        <ConfidenceIndicator stepsCompleted={stepsCompleted} />
      </div>
    </div>
  );
}
