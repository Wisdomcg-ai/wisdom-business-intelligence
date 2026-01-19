'use client';

import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Check,
  Clock,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Users,
  Building2,
  Rocket,
  Target,
  DollarSign,
  Edit3,
  HelpCircle,
} from 'lucide-react';
import type { UseLiveForecastReturn } from '../../hooks/useLiveForecast';
import type { WizardContext, WizardStep } from '../../types';

interface LiveForecastPanelProps {
  forecast: UseLiveForecastReturn;
  currentStep: WizardStep;
  context: WizardContext | null;
  stepsCompleted: WizardStep[];
}

type ViewMode = 'annual' | 'monthly';

// Format currency for display
function formatCurrency(amount: number, compact = false): string {
  if (compact && Math.abs(amount) >= 1000) {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(amount);
  }
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(amount);
}

// Format percentage
function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

// Step status badge
function StepBadge({ completed, current }: { completed: boolean; current: boolean }) {
  if (completed) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-teal/10 text-brand-teal">
        <Check className="w-3 h-3" />
        Done
      </span>
    );
  }
  if (current) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-orange/10 text-brand-orange animate-pulse">
        <Edit3 className="w-3 h-3" />
        Editing
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
      <Clock className="w-3 h-3" />
      Pending
    </span>
  );
}

// Collapsible section component
function ForecastSection({
  title,
  icon: Icon,
  total,
  completed,
  current,
  children,
  defaultExpanded = false,
  accentColor = 'navy',
}: {
  title: string;
  icon: React.ElementType;
  total: number;
  completed: boolean;
  current: boolean;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  accentColor?: 'navy' | 'teal' | 'orange';
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded || current);

  const accentClasses = {
    navy: 'bg-brand-navy-50 text-brand-navy',
    teal: 'bg-brand-teal/10 text-brand-teal',
    orange: 'bg-brand-orange/10 text-brand-orange',
  };

  return (
    <div className={`bg-white border rounded-xl overflow-hidden transition-all ${
      current ? 'border-brand-orange shadow-sm ring-1 ring-brand-orange/20' : 'border-gray-200'
    }`}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${accentClasses[accentColor]}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="text-left">
            <span className="font-semibold text-gray-900">{title}</span>
            <div className="mt-0.5">
              <StepBadge completed={completed} current={current} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-lg font-bold ${
            total > 0 ? 'text-gray-900' : 'text-gray-400'
          }`}>
            {total > 0 ? formatCurrency(total) : '—'}
          </span>
          {isExpanded ? (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronRight className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </button>
      {isExpanded && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-100 bg-gray-50/50">
          {children}
        </div>
      )}
    </div>
  );
}

// Default growth rates for multi-year projections
const DEFAULT_REVENUE_GROWTH = 0.10; // 10% year-over-year
const DEFAULT_COST_GROWTH = 0.03; // 3% inflation on costs
const DEFAULT_SALARY_GROWTH = 0.03; // 3% salary increases

// Helper to apply year-over-year growth
function applyYearGrowth(baseAmount: number, year: number, growthRate: number): number {
  if (year <= 1) return baseAmount;
  return baseAmount * Math.pow(1 + growthRate, year - 1);
}

// Revenue section
function RevenueSection({ forecast, viewMode, selectedYear }: { forecast: UseLiveForecastReturn; viewMode: ViewMode; selectedYear: number }) {
  const { state } = forecast;
  const current = state.currentStep === 'setup';
  const completed = state.completedSteps.setup;
  const isMonthly = viewMode === 'monthly';
  const divisor = isMonthly ? 12 : 1;

  // Apply growth for selected year
  const revenueTarget = applyYearGrowth(state.revenueTarget, selectedYear, DEFAULT_REVENUE_GROWTH);
  const profitTarget = applyYearGrowth(state.profitTarget, selectedYear, DEFAULT_REVENUE_GROWTH);

  return (
    <ForecastSection
      title="Revenue & Targets"
      icon={Target}
      total={revenueTarget / divisor}
      completed={completed}
      current={current}
      defaultExpanded={true}
      accentColor="navy"
    >
      <div className="space-y-3">
        <div className="flex justify-between items-center py-2 border-b border-gray-200">
          <span className="text-sm text-gray-600">Revenue Target {isMonthly ? '(avg/mo)' : ''}</span>
          <span className="text-sm font-semibold text-gray-900">{formatCurrency(revenueTarget / divisor)}</span>
        </div>
        <div className="flex justify-between items-center py-2 border-b border-gray-200">
          <span className="text-sm text-gray-600">Profit Target {isMonthly ? '(avg/mo)' : ''}</span>
          <span className="text-sm font-semibold text-gray-900">{formatCurrency(profitTarget / divisor)}</span>
        </div>
        {revenueTarget > 0 && profitTarget > 0 && (
          <div className="flex justify-between items-center py-2 border-b border-gray-200">
            <span className="text-sm text-gray-600">Target Margin</span>
            <span className="text-sm font-medium text-emerald-600">
              {((profitTarget / revenueTarget) * 100).toFixed(1)}%
            </span>
          </div>
        )}
        {selectedYear > 1 && (
          <div className="flex justify-between items-center py-2 border-b border-gray-200">
            <span className="text-sm text-gray-600">Growth Assumption</span>
            <span className="text-sm font-medium text-gray-500">
              +{(DEFAULT_REVENUE_GROWTH * 100).toFixed(0)}% YoY
            </span>
          </div>
        )}
        <div className="flex justify-between items-center py-2">
          <span className="text-sm text-gray-600">Forecast Period</span>
          <span className="text-sm font-semibold text-gray-900">
            {state.yearsSelected.length === 1
              ? '1 Year'
              : `${state.yearsSelected.length} Years`}
          </span>
        </div>
      </div>
    </ForecastSection>
  );
}

// Team section
function TeamSection({ forecast, viewMode, selectedYear }: { forecast: UseLiveForecastReturn; viewMode: ViewMode; selectedYear: number }) {
  const { state, calculations } = forecast;
  const current = state.currentStep === 'team';
  const completed = state.completedSteps.team;
  const isMonthly = viewMode === 'monthly';
  const divisor = isMonthly ? 12 : 1;
  const yearMultiplier = Math.pow(1 + DEFAULT_SALARY_GROWTH, selectedYear - 1);

  const existingCount = state.existingTeam.length;
  const newHiresCount = state.plannedHires.length;

  // Apply salary growth for selected year
  const totalExistingTeamCost = calculations.totalExistingTeamCost * yearMultiplier;
  const totalNewHiresCost = calculations.totalNewHiresCost * yearMultiplier;
  const totalTeamCosts = calculations.totalTeamCosts * yearMultiplier;
  const totalTeamCostsCOGS = calculations.totalTeamCostsCOGS * yearMultiplier;
  const totalTeamCostsOpEx = calculations.totalTeamCostsOpEx * yearMultiplier;

  return (
    <ForecastSection
      title="Team Costs"
      icon={Users}
      total={totalTeamCosts / divisor}
      completed={completed}
      current={current}
      accentColor="teal"
    >
      <div className="space-y-4">
        {/* Existing Team */}
        {existingCount > 0 && (
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-700">
                Existing Team ({existingCount})
              </span>
              <span className="text-sm font-semibold text-gray-900">
                {formatCurrency(totalExistingTeamCost / divisor)}
              </span>
            </div>
            <div className="space-y-1 pl-3 border-l-2 border-gray-200">
              {state.existingTeam.slice(0, 3).map(member => (
                <div key={member.id} className="flex justify-between text-sm">
                  <span className="text-gray-600 truncate mr-2">{member.name}</span>
                  <span className="text-gray-500 flex-shrink-0">
                    {formatCurrency((member.annualSalary * yearMultiplier) / divisor, true)}
                  </span>
                </div>
              ))}
              {existingCount > 3 && (
                <div className="text-xs text-gray-400">
                  +{existingCount - 3} more team members
                </div>
              )}
            </div>
          </div>
        )}

        {/* New Hires */}
        {newHiresCount > 0 && (
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-emerald-600">
                Planned Hires ({newHiresCount})
              </span>
              <span className="text-sm font-semibold text-emerald-600">
                {formatCurrency(totalNewHiresCost / divisor)}
              </span>
            </div>
            <div className="space-y-1 pl-3 border-l-2 border-emerald-200">
              {state.plannedHires.map(hire => (
                <div key={hire.id} className="flex justify-between text-sm">
                  <span className="text-gray-700 truncate mr-2">
                    {hire.role}
                    {selectedYear === 1 && hire.startMonth && (
                      <span className="text-gray-400 ml-1 text-xs">
                        (from {new Date(hire.startMonth + '-01').toLocaleDateString('en-AU', { month: 'short', year: '2-digit' })})
                      </span>
                    )}
                  </span>
                  <span className="text-gray-600 flex-shrink-0">{formatCurrency((hire.annualSalary * yearMultiplier) / divisor, true)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Classification breakdown */}
        {(totalTeamCostsCOGS > 0 || totalTeamCostsOpEx > 0) && (
          <div className="pt-3 border-t border-gray-200 space-y-1 text-xs text-gray-500">
            <div className="flex justify-between">
              <span>Delivery (COGS)</span>
              <span>{formatCurrency(totalTeamCostsCOGS / divisor)}</span>
            </div>
            <div className="flex justify-between">
              <span>Operations (OpEx)</span>
              <span>{formatCurrency(totalTeamCostsOpEx / divisor)}</span>
            </div>
          </div>
        )}

        {existingCount === 0 && newHiresCount === 0 && (
          <div className="text-center py-4">
            <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No team data yet</p>
          </div>
        )}
      </div>
    </ForecastSection>
  );
}

// Operating Expenses section
function OpExSection({ forecast, viewMode, selectedYear }: { forecast: UseLiveForecastReturn; viewMode: ViewMode; selectedYear: number }) {
  const { state, calculations } = forecast;
  const current = state.currentStep === 'costs';
  const completed = state.completedSteps.costs;
  const isMonthly = viewMode === 'monthly';
  const divisor = isMonthly ? 12 : 1;
  const yearMultiplier = Math.pow(1 + DEFAULT_COST_GROWTH, selectedYear - 1);

  // Split into material and grouped
  const materialCategories = state.opexCategories.filter(c => c.isMaterial);
  const groupedCategories = state.opexCategories.filter(c => !c.isMaterial);
  const groupedTotal = groupedCategories.reduce((sum, c) => sum + c.forecastAmount, 0) * yearMultiplier;
  const totalOpExForecast = calculations.totalOpExForecast * yearMultiplier;

  return (
    <ForecastSection
      title="Operating Expenses"
      icon={Building2}
      total={totalOpExForecast / divisor}
      completed={completed}
      current={current}
      accentColor="orange"
    >
      <div className="space-y-2">
        {materialCategories.length > 0 ? (
          <>
            {materialCategories.slice(0, 6).map(cat => (
              <div key={cat.id} className="flex justify-between items-center py-1.5 border-b border-gray-100 last:border-0">
                <span className="text-sm text-gray-700 truncate mr-2">{cat.name}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {cat.isOverride && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                      edited
                    </span>
                  )}
                  <span className={`text-xs ${
                    cat.growthPercent > 10 ? 'text-amber-600' : 'text-gray-400'
                  }`}>
                    {formatPercent(cat.growthPercent)}
                  </span>
                  <span className="text-sm font-medium text-gray-900 w-20 text-right">
                    {formatCurrency((cat.forecastAmount * yearMultiplier) / divisor, true)}
                  </span>
                </div>
              </div>
            ))}

            {/* Grouped "Other" */}
            {groupedCategories.length > 0 && (
              <div className="flex justify-between items-center py-1.5 text-gray-500">
                <span className="text-sm">Other ({groupedCategories.length} accounts)</span>
                <span className="text-sm font-medium">{formatCurrency(groupedTotal / divisor, true)}</span>
              </div>
            )}

            {/* Totals */}
            <div className="flex justify-between items-center pt-3 mt-2 border-t border-gray-200">
              <span className="text-sm font-semibold text-gray-900">Total OpEx</span>
              <span className="text-sm font-bold text-gray-900">{formatCurrency(totalOpExForecast / divisor)}</span>
            </div>
            {selectedYear === 1 && calculations.opExGrowthAmount !== 0 && (
              <div className="flex justify-between text-xs text-gray-500">
                <span>vs Prior Year</span>
                <span className={calculations.opExGrowthAmount > 0 ? 'text-amber-600' : 'text-emerald-600'}>
                  {calculations.opExGrowthAmount > 0 ? '+' : ''}
                  {formatCurrency(calculations.opExGrowthAmount / divisor)}
                </span>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-4">
            <Building2 className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No expense data yet</p>
          </div>
        )}
      </div>
    </ForecastSection>
  );
}

// Investments section - Note: Investments are typically Year 1 only (one-time)
function InvestmentsSection({ forecast, viewMode, selectedYear }: { forecast: UseLiveForecastReturn; viewMode: ViewMode; selectedYear: number }) {
  const { state, calculations } = forecast;
  const current = state.currentStep === 'investments';
  const completed = state.completedSteps.investments;
  const isMonthly = viewMode === 'monthly';
  const divisor = isMonthly ? 12 : 1;

  // Investments are typically Year 1 only (one-time investments)
  // In Year 2+, show $0 unless there's recurring investment logic
  const isYearOne = selectedYear === 1;
  const totalInvestments = isYearOne ? calculations.totalInvestments : 0;
  const totalInvestmentsOpEx = isYearOne ? calculations.totalInvestmentsOpEx : 0;
  const totalInvestmentsCapEx = isYearOne ? calculations.totalInvestmentsCapEx : 0;

  return (
    <ForecastSection
      title="Strategic Investments"
      icon={Rocket}
      total={totalInvestments / divisor}
      completed={completed}
      current={current}
      accentColor="navy"
    >
      <div className="space-y-2">
        {isYearOne && state.investments.length > 0 ? (
          <>
            {state.investments.map(inv => (
              <div key={inv.id} className="flex justify-between items-center py-1.5 border-b border-gray-100 last:border-0">
                <span className="text-sm text-gray-700 truncate mr-2">{inv.name}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    inv.type === 'capex'
                      ? 'bg-purple-100 text-purple-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}>
                    {inv.type.toUpperCase()}
                  </span>
                  <span className="text-sm font-medium text-gray-900">{formatCurrency(inv.amount / divisor, true)}</span>
                </div>
              </div>
            ))}

            {/* Split by type */}
            <div className="pt-3 mt-2 border-t border-gray-200 space-y-1 text-xs text-gray-500">
              {totalInvestmentsOpEx > 0 && (
                <div className="flex justify-between">
                  <span>OpEx (expensed)</span>
                  <span>{formatCurrency(totalInvestmentsOpEx / divisor)}</span>
                </div>
              )}
              {totalInvestmentsCapEx > 0 && (
                <div className="flex justify-between">
                  <span>CapEx (capitalised)</span>
                  <span>{formatCurrency(totalInvestmentsCapEx / divisor)}</span>
                </div>
              )}
            </div>
          </>
        ) : !isYearOne ? (
          <div className="text-center py-4">
            <Rocket className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Year 1 investments only</p>
          </div>
        ) : (
          <div className="text-center py-4">
            <Rocket className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No investments planned yet</p>
          </div>
        )}
      </div>
    </ForecastSection>
  );
}

// P&L Summary card - clean white design matching platform
function PLSummaryCard({ forecast, viewMode, selectedYear }: { forecast: UseLiveForecastReturn; viewMode: ViewMode; selectedYear: number }) {
  const { state, calculations } = forecast;
  const hasData = state.revenueTarget > 0;
  const isMonthly = viewMode === 'monthly';
  const divisor = isMonthly ? 12 : 1;

  // Apply growth multipliers for selected year
  const revenueMultiplier = Math.pow(1 + DEFAULT_REVENUE_GROWTH, selectedYear - 1);
  const costMultiplier = Math.pow(1 + DEFAULT_COST_GROWTH, selectedYear - 1);
  const salaryMultiplier = Math.pow(1 + DEFAULT_SALARY_GROWTH, selectedYear - 1);

  // Calculate year-adjusted values
  const revenueTarget = state.revenueTarget * revenueMultiplier;
  const profitTarget = state.profitTarget * revenueMultiplier;
  const totalTeamCostsCOGS = calculations.totalTeamCostsCOGS * salaryMultiplier;
  const totalTeamCostsOpEx = calculations.totalTeamCostsOpEx * salaryMultiplier;
  const totalOpExForecast = calculations.totalOpExForecast * costMultiplier;
  // Investments are Year 1 only
  const totalInvestmentsOpEx = selectedYear === 1 ? calculations.totalInvestmentsOpEx : 0;

  // Recalculate P&L metrics for selected year
  const grossProfit = revenueTarget - totalTeamCostsCOGS;
  const netProfit = grossProfit - totalTeamCostsOpEx - totalOpExForecast - totalInvestmentsOpEx;
  const grossMargin = revenueTarget > 0 ? (grossProfit / revenueTarget) * 100 : 0;
  const netMargin = revenueTarget > 0 ? (netProfit / revenueTarget) * 100 : 0;
  const profitVariance = netProfit - profitTarget;

  // Helper to format with view mode
  const displayAmount = (amount: number) => formatCurrency(amount / divisor);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-gray-100 rounded-lg">
            <TrendingUp className="w-5 h-5 text-gray-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">P&L Summary</h3>
            <p className="text-xs text-gray-500">{isMonthly ? 'Monthly average' : 'Annual total'}</p>
          </div>
        </div>
        {hasData && (
          <span className={`text-sm px-3 py-1 rounded-full font-medium ${
            netMargin >= 10
              ? 'bg-emerald-50 text-emerald-700'
              : netMargin > 0
                ? 'bg-amber-50 text-amber-700'
                : 'bg-red-50 text-red-700'
          }`}>
            {netMargin.toFixed(1)}% margin
          </span>
        )}
      </div>

      {hasData ? (
        <div className="space-y-3">
          {/* Revenue */}
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Revenue</span>
            <span className="font-semibold text-lg text-gray-900">{displayAmount(revenueTarget)}</span>
          </div>

          {/* COGS */}
          {totalTeamCostsCOGS > 0 && (
            <div className="flex justify-between items-center text-gray-500 text-sm">
              <span>Less: Cost of Sales</span>
              <span>({displayAmount(totalTeamCostsCOGS)})</span>
            </div>
          )}

          {/* Gross Profit */}
          <div className="flex justify-between items-center py-2 border-t border-gray-200">
            <span className="text-gray-700 font-medium">Gross Profit</span>
            <span className="font-medium text-gray-900">
              {displayAmount(grossProfit)}
              <span className="text-gray-400 text-sm ml-2">
                ({grossMargin.toFixed(0)}%)
              </span>
            </span>
          </div>

          {/* Expenses */}
          {totalTeamCostsOpEx > 0 && (
            <div className="flex justify-between items-center text-gray-500 text-sm">
              <span>Less: Team (OpEx)</span>
              <span>({displayAmount(totalTeamCostsOpEx)})</span>
            </div>
          )}
          {totalOpExForecast > 0 && (
            <div className="flex justify-between items-center text-gray-500 text-sm">
              <span>Less: Operating Costs</span>
              <span>({displayAmount(totalOpExForecast)})</span>
            </div>
          )}
          {totalInvestmentsOpEx > 0 && (
            <div className="flex justify-between items-center text-gray-500 text-sm">
              <span>Less: Investments</span>
              <span>({displayAmount(totalInvestmentsOpEx)})</span>
            </div>
          )}

          {/* Net Profit */}
          <div className="flex justify-between items-center py-3 border-t border-gray-200">
            <span className="font-semibold text-gray-900">Net Profit</span>
            <span className={`font-bold text-2xl ${
              netProfit >= profitTarget
                ? 'text-emerald-600'
                : netProfit > 0
                  ? 'text-amber-600'
                  : 'text-red-600'
            }`}>
              {displayAmount(netProfit)}
            </span>
          </div>

          {/* Variance from target */}
          {profitTarget > 0 && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-400">vs Target ({displayAmount(profitTarget)})</span>
              <span className={`font-medium ${profitVariance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {profitVariance >= 0 ? '+' : ''}
                {displayAmount(profitVariance)}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-6">
          <DollarSign className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Start building your forecast to see the summary</p>
        </div>
      )}
    </div>
  );
}

// Warnings panel
function WarningsPanel({ warnings }: { warnings: UseLiveForecastReturn['calculations']['warnings'] }) {
  if (warnings.length === 0) return null;

  return (
    <div className="bg-brand-orange/5 border border-brand-orange/20 rounded-xl p-4">
      <div className="flex items-center gap-2 text-brand-orange font-medium text-sm mb-3">
        <AlertTriangle className="w-4 h-4" />
        Things to Consider
      </div>
      <ul className="space-y-2">
        {warnings.map(warning => (
          <li key={warning.id} className="flex items-start gap-2 text-sm text-gray-700">
            <span className="text-brand-orange mt-0.5">•</span>
            {warning.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Progress indicator
function ProgressIndicator({ forecast }: { forecast: UseLiveForecastReturn }) {
  const { state } = forecast;
  const steps = ['setup', 'team', 'costs', 'investments', 'projections', 'review'] as const;
  const currentIndex = steps.indexOf(state.currentStep as typeof steps[number]);
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  const progress = ((safeIndex + 1) / steps.length) * 100;

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-brand-navy transition-all duration-500 rounded-full"
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="text-sm font-medium text-gray-600 flex-shrink-0">
        Step {safeIndex + 1}/{steps.length}
      </span>
    </div>
  );
}

// Main component
export function LiveForecastPanel({
  forecast,
  currentStep,
  context,
  stepsCompleted
}: LiveForecastPanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('annual');
  const [selectedYear, setSelectedYear] = useState(1);
  const fiscalYear = forecast.state.fiscalYear;
  const yearsSelected = forecast.state.yearsSelected;
  const hasMultipleYears = yearsSelected.length > 1;

  // Reset selected year if it's no longer in the selected years
  if (!yearsSelected.includes(selectedYear)) {
    setSelectedYear(yearsSelected[0] || 1);
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 p-4 sm:p-6 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              FY{fiscalYear + selectedYear - 1} Forecast
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {hasMultipleYears
                ? `Year ${selectedYear} of ${yearsSelected.length}`
                : 'Your financial plan is building live'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Year tabs - only show if multiple years selected */}
            {hasMultipleYears && (
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 mr-2">
                {yearsSelected.map(year => (
                  <button
                    key={year}
                    onClick={() => setSelectedYear(year)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      selectedYear === year
                        ? 'bg-brand-navy text-white shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Y{year}
                  </button>
                ))}
              </div>
            )}
            {/* View mode toggle */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('annual')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  viewMode === 'annual'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Annual
              </button>
              <button
                onClick={() => setViewMode('monthly')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  viewMode === 'monthly'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Monthly
              </button>
            </div>
          </div>
        </div>
        <ProgressIndicator forecast={forecast} />
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {/* P&L Summary */}
        <PLSummaryCard forecast={forecast} viewMode={viewMode} selectedYear={selectedYear} />

        {/* Warnings */}
        <WarningsPanel warnings={forecast.calculations.warnings} />

        {/* Sections */}
        <div className="space-y-3">
          <RevenueSection forecast={forecast} viewMode={viewMode} selectedYear={selectedYear} />
          <TeamSection forecast={forecast} viewMode={viewMode} selectedYear={selectedYear} />
          <OpExSection forecast={forecast} viewMode={viewMode} selectedYear={selectedYear} />
          <InvestmentsSection forecast={forecast} viewMode={viewMode} selectedYear={selectedYear} />
        </div>

        {/* Help callout */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-start gap-3">
          <div className="p-2 bg-brand-navy-50 rounded-lg flex-shrink-0">
            <HelpCircle className="w-4 h-4 text-brand-navy" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">Need help?</p>
            <p className="text-sm text-gray-500 mt-0.5">
              Ask your CFO Copilot anything about your forecast in the chat
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LiveForecastPanel;
