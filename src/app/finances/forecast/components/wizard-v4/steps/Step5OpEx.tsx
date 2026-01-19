'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Plus, Trash2, HelpCircle, ChevronDown, X, Info } from 'lucide-react';
import { ForecastWizardState, WizardActions, formatCurrency, CostBehavior, OpExLine, SUPER_RATE, calculateNewSalary, InputMode } from '../types';
import { classifyExpense, getSuggestedValue } from '../utils/opex-classifier';

interface Step5OpExProps {
  state: ForecastWizardState;
  actions: WizardActions;
  fiscalYear: number;
  industry?: string;
}

// Cost behavior options with colors
const COST_BEHAVIORS: { value: CostBehavior; label: string; hint: string; color: string; bgColor: string; borderColor: string }[] = [
  { value: 'fixed', label: 'Fixed', hint: '$/month', color: 'text-blue-700', bgColor: 'bg-blue-50', borderColor: 'border-blue-300' },
  { value: 'variable', label: 'Variable', hint: '% of revenue', color: 'text-emerald-700', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-300' },
  { value: 'seasonal', label: 'Seasonal', hint: 'prior year pattern', color: 'text-amber-700', bgColor: 'bg-amber-50', borderColor: 'border-amber-300' },
  { value: 'adhoc', label: 'Ad-hoc', hint: '$/year', color: 'text-purple-700', bgColor: 'bg-purple-50', borderColor: 'border-purple-300' },
];

// Helper to get behavior styling
const getBehaviorStyle = (behavior: CostBehavior) => {
  const config = COST_BEHAVIORS.find(b => b.value === behavior);
  return config || COST_BEHAVIORS[0];
};

// ============================================
// BUDGET FRAMEWORK COMPONENT
// ============================================
function BudgetFramework({
  state,
  year1TeamCosts,
  opexByYear,
  fiscalYear,
  actualRevenue,
  actualCOGS,
}: {
  state: ForecastWizardState;
  year1TeamCosts: number;
  opexByYear: { y1: number; y2: number; y3: number };
  fiscalYear: number;
  actualRevenue: { y1: number; y2: number; y3: number };
  actualCOGS: { y1: number; y2: number; y3: number };
}) {
  const { goals, forecastDuration } = state;

  // Calculate available OpEx for each year using ACTUAL revenue/COGS from Step 3
  const calculateYearBudget = (year: 1 | 2 | 3) => {
    const yearGoals = year === 1 ? goals.year1 : year === 2 ? goals.year2 : goals.year3;
    const netProfitPct = yearGoals?.netProfitPct || 15;

    // Use actual revenue and COGS from Step 3 data
    const revenue = year === 1 ? actualRevenue.y1 : year === 2 ? actualRevenue.y2 : actualRevenue.y3;
    const cogs = year === 1 ? actualCOGS.y1 : year === 2 ? actualCOGS.y2 : actualCOGS.y3;
    const grossProfit = revenue - cogs;
    const grossProfitPct = revenue > 0 ? Math.round((grossProfit / revenue) * 100) : 0;

    // Team costs grow ~3% per year for Y2/Y3
    const teamCosts = year === 1
      ? year1TeamCosts
      : year === 2
        ? Math.round(year1TeamCosts * 1.03)
        : Math.round(year1TeamCosts * 1.03 * 1.03);

    const targetProfit = revenue * (netProfitPct / 100);
    const availableOpEx = grossProfit - teamCosts - targetProfit;

    return { revenue, cogs, grossProfit, grossProfitPct, teamCosts, targetProfit, netProfitPct, availableOpEx };
  };

  const y1Budget = calculateYearBudget(1);
  const y2Budget = forecastDuration >= 2 ? calculateYearBudget(2) : null;
  const y3Budget = forecastDuration >= 3 ? calculateYearBudget(3) : null;

  // Format fiscal year labels (e.g., FY26, FY27, FY28)
  const getFYLabel = (yearOffset: number) => `FY${(fiscalYear + yearOffset).toString().slice(-2)}`;

  const years = [
    { label: getFYLabel(0), budget: y1Budget, opex: opexByYear.y1, yearNum: 1 },
    ...(y2Budget ? [{ label: getFYLabel(1), budget: y2Budget, opex: opexByYear.y2, yearNum: 2 }] : []),
    ...(y3Budget ? [{ label: getFYLabel(2), budget: y3Budget, opex: opexByYear.y3, yearNum: 3 }] : []),
  ];

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-3 mb-2">
          <h3 className="text-sm font-semibold text-gray-900">OpEx Budget</h3>
          <span className="text-xs text-gray-400">|</span>
          <p className="text-xs text-gray-500">Revenue − COGS − Team − <strong className="text-gray-700">Profit</strong> = Available for OpEx</p>
        </div>
        <p className="text-xs text-gray-500 leading-relaxed">
          Most businesses budget expenses and hope there's profit left. Smart businesses flip this—set your profit target first, then spend only what remains. Your margin becomes a decision, not an afterthought.
        </p>
      </div>

      <div className="p-5">
        <div className={`grid gap-6 ${years.length === 1 ? 'grid-cols-1 max-w-md' : years.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
          {years.map(({ label, budget, opex, yearNum }) => {
            const isOverBudget = opex > budget.availableOpEx;
            const utilizationPct = budget.availableOpEx > 0 ? Math.min((opex / budget.availableOpEx) * 100, 100) : 0;
            const overAmount = opex - budget.availableOpEx;

            return (
              <div key={label} className="space-y-3">
                <div className="text-center">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
                </div>

                {/* Budget breakdown */}
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Revenue</span>
                    <span className="tabular-nums">{formatCurrency(budget.revenue)}</span>
                  </div>
                  <div className="flex justify-between text-gray-500">
                    <span>− COGS</span>
                    <span className="tabular-nums">{formatCurrency(budget.cogs)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600 font-medium">
                    <span>= Gross Profit ({budget.grossProfitPct}%)</span>
                    <span className="tabular-nums">{formatCurrency(budget.grossProfit)}</span>
                  </div>
                  <div className="flex justify-between text-gray-500">
                    <span>− Team Costs</span>
                    <span className="tabular-nums">{formatCurrency(budget.teamCosts)}</span>
                  </div>
                  <div className="flex justify-between text-gray-700 font-medium">
                    <span>− Target Profit ({budget.netProfitPct}%)</span>
                    <span className="tabular-nums">{formatCurrency(budget.targetProfit)}</span>
                  </div>
                  <div className="border-t border-gray-200 pt-1.5 flex justify-between font-medium text-gray-900">
                    <span>= Available OpEx</span>
                    <span className="tabular-nums">{formatCurrency(budget.availableOpEx)}</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-1.5">
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${isOverBudget ? 'bg-red-500' : 'bg-green-500'}`}
                      style={{ width: `${Math.min(utilizationPct, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className={isOverBudget ? 'text-red-600 font-medium' : 'text-gray-600'}>
                      Your OpEx: {formatCurrency(opex)}
                    </span>
                    {isOverBudget ? (
                      <span className="text-red-600 font-medium">+{formatCurrency(overAmount)} over</span>
                    ) : (
                      <span className="text-green-600">{formatCurrency(budget.availableOpEx - opex)} remaining</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================
// GUIDANCE PANEL (Dismissible)
// ============================================
function GuidancePanel({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-gray-500" />
          <p className="text-sm font-medium text-gray-900">How to classify your expenses</p>
        </div>
        <button onClick={onDismiss} className="text-gray-400 hover:text-gray-600 p-1">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">Fixed</span>
          <span className="text-xs text-gray-600">Same each month</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">Variable</span>
          <span className="text-xs text-gray-600">Scales with revenue</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">Seasonal</span>
          <span className="text-xs text-gray-600">Follows prior year pattern</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">Ad-hoc</span>
          <span className="text-xs text-gray-600">Irregular or one-time</span>
        </div>
      </div>
    </div>
  );
}

// ============================================
// VALUE INPUT COMPONENT (handles Y1 edit + Y2/Y3 override)
// ============================================
function ValueInput({
  line,
  activeYear,
  forecastAmount,
  onUpdate,
}: {
  line: OpExLine;
  activeYear: 1 | 2 | 3;
  forecastAmount: number;
  onUpdate: (updates: Partial<OpExLine>) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  // Check if there's an override for Y2/Y3
  const overrideKey = activeYear === 2 ? 'y2Override' : 'y3Override';
  const hasOverride = activeYear > 1 && (line as any)[overrideKey] !== undefined;

  // Get default input mode based on behavior type
  const getDefaultInputMode = (behavior: CostBehavior): InputMode => {
    return behavior === 'fixed' ? 'monthly' : 'annual';
  };

  const inputMode = line.inputMode || getDefaultInputMode(line.costBehavior);
  const isMonthly = inputMode === 'monthly';

  // Common input styles
  const inputStyles = "w-20 px-2 py-1 text-right border border-gray-200 rounded focus:border-brand-navy focus:ring-1 focus:ring-brand-navy tabular-nums text-sm";

  // Toggle button styles
  const toggleStyles = "px-1.5 py-0.5 text-xs rounded border cursor-pointer transition-colors";
  const activeToggle = "bg-brand-navy text-white border-brand-navy";
  const inactiveToggle = "bg-white text-gray-500 border-gray-300 hover:border-gray-400";

  // Format compact currency
  const formatCompact = (val: number) => {
    if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `$${(val / 1000).toFixed(0)}K`;
    return `$${Math.round(val)}`;
  };

  // Get the current value and calculate the alternate display
  const getCurrentValue = (): { inputValue: number; altValue: number; altLabel: string } => {
    switch (line.costBehavior) {
      case 'fixed': {
        const monthly = line.monthlyAmount || 0;
        const annual = monthly * 12;
        return isMonthly
          ? { inputValue: monthly, altValue: annual, altLabel: '/yr' }
          : { inputValue: annual, altValue: monthly, altLabel: '/mo' };
      }
      case 'seasonal': {
        const annual = line.seasonalTargetAmount || (line.priorYearAnnual * (1 + (line.seasonalGrowthPct || 0) / 100));
        const monthly = annual / 12;
        return isMonthly
          ? { inputValue: monthly, altValue: annual, altLabel: '/yr' }
          : { inputValue: annual, altValue: monthly, altLabel: '/mo' };
      }
      case 'adhoc': {
        const annual = line.expectedAnnualAmount || 0;
        const monthly = annual / 12;
        return isMonthly
          ? { inputValue: monthly, altValue: annual, altLabel: '/yr' }
          : { inputValue: annual, altValue: monthly, altLabel: '/mo' };
      }
      default:
        return { inputValue: 0, altValue: 0, altLabel: '' };
    }
  };

  // Handle value change based on input mode
  const handleValueChange = (value: number) => {
    switch (line.costBehavior) {
      case 'fixed':
        // Always store as monthly
        const monthlyAmount = isMonthly ? value : value / 12;
        onUpdate({ monthlyAmount });
        break;
      case 'seasonal':
        // Store as annual target
        const seasonalTarget = isMonthly ? value * 12 : value;
        onUpdate({ seasonalTargetAmount: seasonalTarget, seasonalGrowthPct: undefined });
        break;
      case 'adhoc':
        // Store as annual
        const annualAmount = isMonthly ? value * 12 : value;
        onUpdate({ expectedAnnualAmount: annualAmount });
        break;
    }
  };

  // Handle input mode toggle
  const handleModeToggle = (newMode: InputMode) => {
    onUpdate({ inputMode: newMode });
  };

  if (activeYear === 1) {
    // Variable: stays as % of revenue (no toggle)
    if (line.costBehavior === 'variable') {
      return (
        <div className="flex items-center justify-end gap-1">
          <input
            type="number"
            value={line.percentOfRevenue || ''}
            onChange={(e) => onUpdate({ percentOfRevenue: parseFloat(e.target.value) || 0 })}
            placeholder="0"
            step="0.1"
            className={inputStyles}
          />
          <span className="text-gray-400 text-xs">%</span>
        </div>
      );
    }

    // Fixed, Seasonal, Ad-hoc: show toggle + input + alt value
    const { inputValue, altValue, altLabel } = getCurrentValue();

    return (
      <div className="flex items-center justify-end gap-1.5">
        {/* Monthly/Annual Toggle */}
        <div className="flex rounded overflow-hidden border border-gray-300">
          <button
            type="button"
            onClick={() => handleModeToggle('monthly')}
            className={`${toggleStyles} rounded-none border-0 border-r ${isMonthly ? activeToggle : inactiveToggle}`}
          >
            /mo
          </button>
          <button
            type="button"
            onClick={() => handleModeToggle('annual')}
            className={`${toggleStyles} rounded-none border-0 ${!isMonthly ? activeToggle : inactiveToggle}`}
          >
            /yr
          </button>
        </div>

        {/* Value Input */}
        <div className="flex items-center gap-0.5">
          <span className="text-gray-400 text-xs">$</span>
          <input
            type="number"
            value={inputValue || ''}
            onChange={(e) => handleValueChange(parseFloat(e.target.value) || 0)}
            placeholder="0"
            className={inputStyles}
          />
        </div>

        {/* Alt Value Display */}
        <span className="text-gray-400 text-xs whitespace-nowrap">
          = {formatCompact(altValue)}{altLabel}
        </span>
      </div>
    );
  }

  // Y2/Y3: Show auto or override
  if (isEditing) {
    return (
      <div className="flex items-center justify-end gap-1">
        <span className="text-gray-400 text-xs">$</span>
        <input
          type="number"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => {
            const val = parseFloat(editValue);
            if (!isNaN(val) && val >= 0) {
              onUpdate({ [overrideKey]: val } as any);
            }
            setIsEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const val = parseFloat(editValue);
              if (!isNaN(val) && val >= 0) {
                onUpdate({ [overrideKey]: val } as any);
              }
              setIsEditing(false);
            } else if (e.key === 'Escape') {
              setIsEditing(false);
            }
          }}
          placeholder="0"
          autoFocus
          className="w-24 px-2 py-1 text-right border border-amber-300 rounded focus:border-amber-500 focus:ring-1 focus:ring-amber-500 tabular-nums text-sm bg-amber-50"
        />
        <span className="text-gray-400 text-xs">/yr</span>
      </div>
    );
  }

  const displayValue = hasOverride ? (line as any)[overrideKey] : Math.round(forecastAmount);

  return (
    <div className="flex justify-end">
      <button
        onClick={() => {
          setEditValue(String(displayValue));
          setIsEditing(true);
        }}
        className="inline-flex items-center gap-1 py-1 rounded hover:bg-gray-100 transition-colors group text-right"
        title="Click to override"
      >
        <span className="tabular-nums text-gray-700 text-sm">{formatCompact(displayValue)}</span>
        <span className={`text-xs ${hasOverride ? 'text-amber-600' : 'text-gray-400 group-hover:text-blue-500'}`}>
          {hasOverride ? '(edited)' : '(auto)'}
        </span>
      </button>
    </div>
  );
}

// ============================================
// Y2/Y3 WORKING INPUT (editable monthly/annual with override)
// ============================================
function Y2Y3WorkingInput({
  line,
  activeYear,
  autoValue,
  mode,
  onOverride,
}: {
  line: OpExLine;
  activeYear: 2 | 3;
  autoValue: number; // Auto-calculated value (annual)
  mode: 'monthly' | 'annual';
  onOverride: (annualValue: number | undefined) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const overrideKey = activeYear === 2 ? 'y2Override' : 'y3Override';
  const hasOverride = (line as any)[overrideKey] !== undefined;

  // Ensure we have valid numbers - default to 0 if undefined/NaN
  const safeAutoValue = (autoValue && !isNaN(autoValue)) ? Math.max(0, autoValue) : 0;
  const overrideValue = (line as any)[overrideKey];
  const safeOverride = (overrideValue !== undefined && !isNaN(overrideValue)) ? Math.max(0, overrideValue) : null;

  const currentAnnual = safeOverride !== null ? safeOverride : safeAutoValue;
  const displayValue = mode === 'monthly' ? currentAnnual / 12 : currentAnnual;

  const handleStartEdit = () => {
    const roundedValue = Math.max(0, Math.round(displayValue));
    setEditValue(String(roundedValue));
    setIsEditing(true);
  };

  const handleSave = () => {
    const val = parseFloat(editValue);
    if (!isNaN(val) && val >= 0) {
      const annualVal = mode === 'monthly' ? val * 12 : val;
      onOverride(Math.round(annualVal));
    }
    setIsEditing(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onOverride(undefined);
  };

  if (isEditing) {
    return (
      <div className="flex items-center justify-end gap-0.5">
        <span className="text-gray-400 text-xs">$</span>
        <input
          type="number"
          min="0"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') setIsEditing(false);
          }}
          placeholder="0"
          autoFocus
          className="w-24 px-2 py-1 text-right border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none tabular-nums text-sm bg-white"
        />
      </div>
    );
  }

  return (
    <button
      onClick={handleStartEdit}
      className={`inline-flex items-center gap-1 py-0.5 px-1 -mx-1 rounded transition-colors group text-right w-full justify-end ${
        hasOverride ? 'hover:bg-amber-50' : 'hover:bg-blue-50'
      }`}
      title={hasOverride ? 'Click to edit (overridden)' : 'Click to override auto value'}
    >
      <span className={`tabular-nums text-sm ${hasOverride ? 'text-amber-700 font-medium' : 'text-gray-600'}`}>
        ${Math.round(displayValue).toLocaleString()}
      </span>
      {hasOverride && (
        <button
          onClick={handleClear}
          className="text-amber-400 hover:text-red-500 text-xs ml-0.5"
          title="Reset to auto"
        >
          ×
        </button>
      )}
    </button>
  );
}

// ============================================
// VARIABLE PERCENT INPUT (for Y2/Y3 with override support)
// ============================================
function VariablePercentInput({
  line,
  activeYear,
  onUpdate,
}: {
  line: OpExLine;
  activeYear: 1 | 2 | 3;
  onUpdate: (updates: Partial<OpExLine>) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const isY2Y3 = activeYear > 1;
  const percentOverrideKey = activeYear === 2 ? 'y2PercentOverride' : 'y3PercentOverride';
  const hasOverride = isY2Y3 && (line as any)[percentOverrideKey] !== undefined;

  // Get the effective percent to display
  const basePercent = line.percentOfRevenue ?? 0;
  const effectivePercent = isY2Y3
    ? ((line as any)[percentOverrideKey] ?? basePercent)
    : basePercent;

  const handleStartEdit = () => {
    setEditValue(String(effectivePercent));
    setIsEditing(true);
  };

  const handleSave = () => {
    const val = parseFloat(editValue);
    if (isY2Y3) {
      // For Y2/Y3, set override if different from base, clear if same
      if (!isNaN(val) && val !== basePercent) {
        onUpdate({ [percentOverrideKey]: val } as any);
      } else if (isNaN(val) || val === basePercent) {
        onUpdate({ [percentOverrideKey]: undefined } as any);
      }
    } else {
      // For Y1, set base percent
      onUpdate({ percentOfRevenue: isNaN(val) ? 0 : val });
    }
    setIsEditing(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdate({ [percentOverrideKey]: undefined } as any);
  };

  if (isEditing) {
    return (
      <div className="flex items-center justify-end gap-1">
        <input
          type="number"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') setIsEditing(false);
          }}
          step="0.1"
          autoFocus
          className={`w-16 px-2 py-1 text-right border rounded focus:outline-none tabular-nums text-sm ${
            isY2Y3
              ? 'border-amber-300 bg-amber-50 focus:border-amber-500 focus:ring-1 focus:ring-amber-500'
              : 'border-gray-300 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
          }`}
        />
        <span className="text-gray-400 text-xs">%</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <button
        onClick={handleStartEdit}
        className={`py-0.5 px-1 -mx-1 rounded transition-colors text-right ${
          hasOverride
            ? 'hover:bg-amber-50 text-amber-700 font-medium'
            : 'hover:bg-blue-50 text-gray-600'
        }`}
        title={isY2Y3 ? (hasOverride ? 'Click to edit (overridden)' : `Click to override (inherited: ${basePercent}%)`) : 'Click to edit'}
      >
        <span className="tabular-nums text-sm">{effectivePercent}</span>
      </button>
      <span className="text-gray-400 text-xs">%</span>
      {hasOverride && (
        <button
          onClick={handleClear}
          className="text-amber-400 hover:text-red-500 text-xs"
          title="Reset to Y1 %"
        >
          ×
        </button>
      )}
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================
export function Step5OpEx({ state, actions, fiscalYear, industry }: Step5OpExProps) {
  const { opexLines, priorYear, goals, teamMembers, newHires, departures, forecastDuration, revenueLines, cogsLines, defaultOpExIncreasePct, activeYear } = state;

  // Use wizard's activeYear via actions.setActiveYear
  const setActiveYear = actions.setActiveYear;
  const [showGuidance, setShowGuidance] = useState(true);
  const [showAddLine, setShowAddLine] = useState(false);
  const [newLineName, setNewLineName] = useState('');

  // Default growth % (from state, defaults to 3%)
  const effectiveDefaultGrowth = defaultOpExIncreasePct ?? 3;

  // Track which lines have been auto-classified to avoid re-classifying
  const classifiedLinesRef = useRef<Set<string>>(new Set());

  // Auto-classify expenses on initial load
  useEffect(() => {
    if (opexLines.length === 0) return;

    // Find lines that haven't been classified yet
    const linesToClassify = opexLines.filter(line => !classifiedLinesRef.current.has(line.id));
    if (linesToClassify.length === 0) return;

    // Classify each line based on its name and prior year data
    for (const line of linesToClassify) {
      const result = classifyExpense(line.name, line.priorYearMonthly, industry);

      // Skip team costs - they shouldn't be in OpEx
      if (result.isTeamCost) {
        classifiedLinesRef.current.add(line.id);
        continue;
      }

      // Get suggested value based on the classified behavior
      const suggested = getSuggestedValue(
        result.behavior,
        line.priorYearAnnual,
        line.priorYearMonthly,
        goals.year1?.revenue
      );

      // Only update if behavior is different from current (avoid unnecessary updates)
      if (line.costBehavior !== result.behavior) {
        const updates: Partial<OpExLine> = {
          costBehavior: result.behavior,
        };

        // Set the appropriate value based on behavior
        switch (result.behavior) {
          case 'fixed':
            updates.monthlyAmount = suggested.value;
            break;
          case 'variable':
            updates.percentOfRevenue = suggested.value;
            break;
          case 'seasonal':
            // Leave seasonalGrowthPct undefined to use default growth rate
            break;
          case 'adhoc':
            updates.expectedAnnualAmount = suggested.value;
            break;
        }

        actions.updateOpExLine(line.id, updates);
      }

      classifiedLinesRef.current.add(line.id);
    }
  }, [opexLines, industry, goals.year1?.revenue, actions]);

  // Calculate ACTUAL revenue from Step 3 revenue lines
  const actualRevenue = useMemo(() => {
    // Y1: Sum of monthly values
    const y1 = revenueLines.reduce((total, line) => {
      const monthlySum = Object.values(line.year1Monthly || {}).reduce((sum, val) => sum + (val || 0), 0);
      return total + monthlySum;
    }, 0);

    // Y2: Sum of quarterly values
    const y2 = revenueLines.reduce((total, line) => {
      const q = line.year2Quarterly || { q1: 0, q2: 0, q3: 0, q4: 0 };
      return total + q.q1 + q.q2 + q.q3 + q.q4;
    }, 0);

    // Y3: Sum of quarterly values
    const y3 = revenueLines.reduce((total, line) => {
      const q = line.year3Quarterly || { q1: 0, q2: 0, q3: 0, q4: 0 };
      return total + q.q1 + q.q2 + q.q3 + q.q4;
    }, 0);

    return { y1, y2: y2 || y1, y3: y3 || y2 || y1 };
  }, [revenueLines]);

  // Calculate ACTUAL COGS from Step 3 COGS lines
  const actualCOGS = useMemo(() => {
    const calculateCOGSForYear = (yearRevenue: number) => {
      return cogsLines.reduce((total, line) => {
        if (line.costBehavior === 'variable' && line.percentOfRevenue) {
          return total + (yearRevenue * line.percentOfRevenue / 100);
        } else if (line.costBehavior === 'fixed' && line.monthlyAmount) {
          return total + (line.monthlyAmount * 12);
        }
        return total + (line.priorYearTotal || 0);
      }, 0);
    };

    return {
      y1: calculateCOGSForYear(actualRevenue.y1),
      y2: calculateCOGSForYear(actualRevenue.y2),
      y3: calculateCOGSForYear(actualRevenue.y3),
    };
  }, [cogsLines, actualRevenue]);

  // Revenue for each year (for OpEx variable cost calculations)
  const revenueByYear = useMemo(() => ({
    y1: actualRevenue.y1 || goals.year1?.revenue || 0,
    y2: actualRevenue.y2 || goals.year2?.revenue || 0,
    y3: actualRevenue.y3 || goals.year3?.revenue || 0,
  }), [actualRevenue, goals]);

  // Calculate Year 1 Team Costs
  const year1TeamCosts = useMemo(() => {
    let total = 0;

    for (const member of teamMembers) {
      const departure = departures.find(d => d.teamMemberId === member.id);
      const newSalary = calculateNewSalary(member.currentSalary, member.increasePct);

      if (departure) {
        const [, month] = departure.endMonth.split('-').map(Number);
        const fyMonth = month >= 7 ? month - 6 : month + 6;
        const monthsWorked = fyMonth;
        const proRataSalary = (newSalary * monthsWorked) / 12;
        const super_ = member.type !== 'contractor' ? proRataSalary * SUPER_RATE : 0;
        total += proRataSalary + super_;
      } else {
        const super_ = member.type !== 'contractor' ? newSalary * SUPER_RATE : 0;
        total += newSalary + super_;
      }
    }

    for (const hire of newHires) {
      const [, month] = hire.startMonth.split('-').map(Number);
      const fyMonth = month >= 7 ? month - 6 : month + 6;
      const monthsWorked = 13 - fyMonth;
      const proRataSalary = (hire.salary * monthsWorked) / 12;
      const super_ = hire.type !== 'contractor' ? proRataSalary * SUPER_RATE : 0;
      total += proRataSalary + super_;
    }

    return Math.round(total);
  }, [teamMembers, newHires, departures]);

  // Calculate annual amount for Y1
  const calculateY1Amount = useCallback((line: OpExLine): number => {
    switch (line.costBehavior) {
      case 'fixed':
        return (line.monthlyAmount || 0) * 12;
      case 'variable':
        return (revenueByYear.y1 * (line.percentOfRevenue || 0)) / 100;
      case 'seasonal':
        // Use target amount if set, otherwise apply growth % to prior year
        if (line.seasonalTargetAmount !== undefined) {
          return line.seasonalTargetAmount;
        }
        const growthFactor = 1 + ((line.seasonalGrowthPct || 0) / 100);
        return line.priorYearAnnual * growthFactor;
      case 'adhoc':
        return line.expectedAnnualAmount || 0;
      default:
        return line.priorYearAnnual;
    }
  }, [revenueByYear.y1]);

  // Calculate amount for Y2 or Y3 with auto-projection
  // Y3 uses Y2 as its base (whether Y2 is overridden or calculated)
  const calculateYearAmount = useCallback((line: OpExLine, year: 2 | 3, defaultGrowth: number = 3): number => {
    // Check for manual override (we'll store these in the line)
    const overrideKey = year === 2 ? 'y2Override' : 'y3Override';
    const override = (line as any)[overrideKey];
    if (override !== undefined) return override;

    const y1Amount = calculateY1Amount(line);
    const yearRevenue = year === 2 ? revenueByYear.y2 : revenueByYear.y3;

    // Check if expense starts in a future year
    const startYear = line.startYear || 1;
    if (startYear > year) return 0;

    // Check if one-time expense in a different year
    if (line.isOneTime && line.oneTimeYear && line.oneTimeYear !== year) return 0;

    // Get the effective increase rate: use line-specific if set, otherwise use default
    const getIncreaseRate = () => {
      if (line.costBehavior === 'seasonal') {
        return line.seasonalGrowthPct ?? defaultGrowth;
      }
      return line.annualIncreasePct ?? defaultGrowth;
    };

    // For Y3, use Y2 as the base (whether overridden or calculated)
    const getBaseAmount = (): number => {
      if (year === 2) {
        return y1Amount;
      }
      // Y3: use Y2 (overridden or calculated) as base
      const y2Override = (line as any).y2Override;
      if (y2Override !== undefined) {
        return y2Override;
      }
      // Calculate Y2 to use as base for Y3
      return calculateYearAmount(line, 2, defaultGrowth);
    };

    switch (line.costBehavior) {
      case 'fixed':
        // Apply increase rate to base (Y1 for Y2, Y2 for Y3)
        return getBaseAmount() * (1 + getIncreaseRate() / 100);
      case 'variable':
        // Scale with revenue - use year-specific % override if set
        const percentOverrideKey = year === 2 ? 'y2PercentOverride' : 'y3PercentOverride';
        const effectivePercent = (line as any)[percentOverrideKey] ?? line.percentOfRevenue ?? 0;
        return (yearRevenue * effectivePercent) / 100;
      case 'seasonal':
        // Apply increase % to base
        return getBaseAmount() * (1 + getIncreaseRate() / 100);
      case 'adhoc':
        // Apply increase rate to base
        return getBaseAmount() * (1 + getIncreaseRate() / 100);
      default:
        return y1Amount;
    }
  }, [calculateY1Amount, revenueByYear]);

  // Get amount for current active year
  const getActiveYearAmount = useCallback((line: OpExLine): number => {
    if (activeYear === 1) return calculateY1Amount(line);
    return calculateYearAmount(line, activeYear as 2 | 3, effectiveDefaultGrowth);
  }, [activeYear, calculateY1Amount, calculateYearAmount, effectiveDefaultGrowth]);

  // Calculate auto value (without override) for Y2/Y3 working inputs
  // Y3 uses Y2 as base (same logic as calculateYearAmount but ignores overrides)
  const getAutoYearAmount = useCallback((line: OpExLine, year: 2 | 3): number => {
    const y1Amount = calculateY1Amount(line);
    const yearRevenue = year === 2 ? revenueByYear.y2 : revenueByYear.y3;

    // Check if expense starts in a future year
    const startYear = line.startYear || 1;
    if (startYear > year) return 0;

    // Check if one-time expense in a different year
    if (line.isOneTime && line.oneTimeYear && line.oneTimeYear !== year) return 0;

    // Get the effective increase rate
    const getIncreaseRate = () => {
      if (line.costBehavior === 'seasonal') {
        return line.seasonalGrowthPct ?? effectiveDefaultGrowth;
      }
      return line.annualIncreasePct ?? effectiveDefaultGrowth;
    };

    // For Y3, use Y2 as base (check for Y2 override first)
    const getBaseAmount = (): number => {
      if (year === 2) {
        return y1Amount;
      }
      // Y3: use Y2 (overridden or calculated) as base
      const y2Override = (line as any).y2Override;
      if (y2Override !== undefined) {
        return y2Override;
      }
      // Calculate Y2 to use as base
      return y1Amount * (1 + getIncreaseRate() / 100);
    };

    switch (line.costBehavior) {
      case 'variable':
        return (yearRevenue * (line.percentOfRevenue || 0)) / 100;
      default:
        return getBaseAmount() * (1 + getIncreaseRate() / 100);
    }
  }, [calculateY1Amount, revenueByYear, effectiveDefaultGrowth]);

  // Total OpEx by year
  const opexByYear = useMemo(() => ({
    y1: opexLines.reduce((sum, line) => sum + calculateY1Amount(line), 0),
    y2: opexLines.reduce((sum, line) => sum + calculateYearAmount(line, 2, effectiveDefaultGrowth), 0),
    y3: opexLines.reduce((sum, line) => sum + calculateYearAmount(line, 3, effectiveDefaultGrowth), 0),
  }), [opexLines, calculateY1Amount, calculateYearAmount, effectiveDefaultGrowth]);

  // Prior year total for comparison
  const totalPriorYear = opexLines.reduce((sum, line) => sum + line.priorYearAnnual, 0);
  const activeYearTotal = activeYear === 1 ? opexByYear.y1 : activeYear === 2 ? opexByYear.y2 : opexByYear.y3;

  // Handle adding a new line
  const handleAddLine = () => {
    if (!newLineName.trim()) return;

    // Auto-classify based on the expense name
    const result = classifyExpense(newLineName.trim(), undefined, industry);
    const behavior = result.isTeamCost ? 'fixed' : result.behavior;

    // Set up initial values based on the classified behavior
    const newLine: Omit<OpExLine, 'id'> = {
      name: newLineName.trim(),
      priorYearAnnual: 0,
      costBehavior: behavior,
    };

    // Set appropriate defaults based on behavior
    // Note: Don't set annualIncreasePct/seasonalGrowthPct - leave undefined to use default
    switch (behavior) {
      case 'fixed':
        newLine.monthlyAmount = 0;
        break;
      case 'variable':
        newLine.percentOfRevenue = 0;
        break;
      case 'seasonal':
        // Leave seasonalGrowthPct undefined to use default
        break;
      case 'adhoc':
        newLine.expectedAnnualAmount = 0;
        break;
    }

    actions.addOpExLine(newLine);
    setNewLineName('');
    setShowAddLine(false);
  };

  // Handle behavior change - sets sensible defaults
  const handleBehaviorChange = (lineId: string, newBehavior: CostBehavior) => {
    const line = opexLines.find(l => l.id === lineId);
    if (!line) return;

    const updates: Partial<OpExLine> = {
      costBehavior: newBehavior,
      // Clear other behavior-specific values
      monthlyAmount: undefined,
      percentOfRevenue: undefined,
      seasonalGrowthPct: undefined,
      expectedAnnualAmount: undefined,
    };

    // Set sensible defaults based on prior year data
    // Note: Don't set explicit growth rates - leave undefined to use default
    switch (newBehavior) {
      case 'fixed':
        updates.monthlyAmount = Math.round(line.priorYearAnnual / 12);
        break;
      case 'variable':
        if (revenueByYear.y1 > 0 && line.priorYearAnnual > 0) {
          updates.percentOfRevenue = Math.round((line.priorYearAnnual / revenueByYear.y1) * 1000) / 10;
        } else {
          updates.percentOfRevenue = 0;
        }
        break;
      case 'seasonal':
        // Leave seasonalGrowthPct undefined to use default
        break;
      case 'adhoc':
        updates.expectedAnnualAmount = line.priorYearAnnual;
        break;
    }

    actions.updateOpExLine(lineId, updates);
  };

  return (
    <div className="space-y-6">
      {/* Budget Framework */}
      <BudgetFramework
        state={state}
        year1TeamCosts={year1TeamCosts}
        opexByYear={opexByYear}
        fiscalYear={fiscalYear}
        actualRevenue={actualRevenue}
        actualCOGS={actualCOGS}
      />

      {/* Guidance Panel */}
      {showGuidance && (
        <GuidancePanel onDismiss={() => setShowGuidance(false)} />
      )}

      {/* Year Tabs + Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Header with tabs */}
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-semibold text-gray-900">Operating Expenses</h3>

            {/* Year Tabs */}
            {forecastDuration > 1 && (
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                {[1, 2, 3].slice(0, forecastDuration).map((year) => (
                  <button
                    key={year}
                    onClick={() => setActiveYear(year as 1 | 2 | 3)}
                    className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                      activeYear === year
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    FY{(fiscalYear + year - 1).toString().slice(-2)}
                  </button>
                ))}
              </div>
            )}

            {/* Default Increase % - only show when viewing Y2/Y3 */}
            {activeYear > 1 && (
              <div className="flex items-center gap-2 ml-4 pl-4 border-l border-gray-200">
                <label className="text-sm text-gray-600 whitespace-nowrap">Default Increase:</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={effectiveDefaultGrowth}
                    onChange={(e) => actions.setDefaultOpExIncreasePct(parseFloat(e.target.value) || 0)}
                    step="0.5"
                    className="w-14 px-2 py-1 text-center text-sm border border-gray-300 rounded focus:border-brand-navy focus:ring-1 focus:ring-brand-navy"
                  />
                  <span className="text-gray-500 text-sm">%</span>
                </div>
                <button
                  onClick={() => {
                    // Clear all explicit increase rates and overrides
                    opexLines.forEach(line => {
                      actions.updateOpExLine(line.id, {
                        seasonalGrowthPct: undefined,
                        annualIncreasePct: undefined,
                        // Clear Y2/Y3 amount overrides
                        y2Override: undefined,
                        y3Override: undefined,
                        // Clear Y2/Y3 percent overrides (for variable costs)
                        y2PercentOverride: undefined,
                        y3PercentOverride: undefined,
                      });
                    });
                  }}
                  className="px-2 py-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                  title="Clear all row-level overrides and use defaults for all"
                >
                  Apply to All
                </button>
                <span className="relative group">
                  <HelpCircle className="w-4 h-4 text-gray-400 cursor-help" />
                  <span className="absolute left-1/2 -translate-x-1/2 top-6 w-52 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    Set default annual increase for all rows. Override individual rows in the Increase column.
                  </span>
                </span>
              </div>
            )}
          </div>

          <button
            onClick={() => setShowAddLine(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-brand-navy hover:bg-brand-navy-800 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Expense
          </button>
        </div>

        {/* Add Line Form */}
        {showAddLine && (
          <div className="px-5 py-4 bg-gray-50 border-b border-gray-200 flex gap-3">
            <input
              type="text"
              value={newLineName}
              onChange={(e) => setNewLineName(e.target.value)}
              placeholder="Expense name..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-navy/20 focus:border-brand-navy"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleAddLine()}
            />
            <button
              onClick={handleAddLine}
              className="px-4 py-2 bg-brand-navy text-white text-sm font-medium rounded-lg hover:bg-brand-navy-800"
            >
              Add
            </button>
            <button
              onClick={() => { setShowAddLine(false); setNewLineName(''); }}
              className="px-4 py-2 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-200"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              {/* Primary header row */}
              <tr className="bg-gray-50 border-b border-gray-200">
                <th rowSpan={2} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide align-bottom" style={{ width: '25%' }}>Expense</th>
                <th rowSpan={2} className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap align-bottom" style={{ width: '90px' }}>
                  {activeYear === 1
                    ? `FY${(fiscalYear - 1).toString().slice(-2)} Actual`
                    : `FY${(fiscalYear + activeYear - 2).toString().slice(-2)} (Y${activeYear - 1})`
                  }
                </th>
                <th rowSpan={2} className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wide align-bottom" style={{ width: '100px' }}>Type</th>
                <th colSpan={activeYear > 1 ? 3 : 2} className="px-3 py-2 text-center text-xs font-medium text-blue-700 uppercase tracking-wide border-b border-blue-200 bg-blue-50">
                  <div className="flex items-center justify-center gap-1">
                    <span>Workings</span>
                    <span className="relative group">
                      <HelpCircle className="w-3.5 h-3.5 text-blue-400 cursor-help" />
                      <span className="absolute left-1/2 -translate-x-1/2 top-5 w-52 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 font-normal normal-case text-left">
                        {activeYear > 1
                          ? 'Adjust increase %, monthly, or annual values to change your forecast.'
                          : 'Enter either monthly or annual — the other will calculate automatically.'}
                      </span>
                    </span>
                  </div>
                </th>
                <th rowSpan={2} className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap align-bottom bg-white" style={{ width: '120px' }}>
                  FY{(fiscalYear + activeYear - 1).toString().slice(-2)} Forecast
                </th>
                <th rowSpan={2} className="w-10 py-2 align-bottom"></th>
              </tr>
              {/* Sub-header row for Workings columns */}
              <tr className="bg-gray-50 border-b border-gray-200">
                {/* Increase % sub-header - only show for Y2/Y3 */}
                {activeYear > 1 && (
                  <th className="px-2 py-1.5 text-center text-xs font-medium text-blue-600 tracking-wide bg-blue-50" style={{ width: '70px' }}>
                    <div className="flex items-center justify-center gap-1">
                      <span>Increase</span>
                      <span className="relative group">
                        <HelpCircle className="w-3 h-3 text-blue-400 cursor-help" />
                        <span className="absolute left-1/2 -translate-x-1/2 top-5 w-44 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 font-normal normal-case text-left">
                          Annual increase % from prior year
                        </span>
                      </span>
                    </div>
                  </th>
                )}
                <th className="px-3 py-1.5 text-right text-xs font-medium text-blue-600 tracking-wide bg-blue-50" style={{ width: '120px' }}>Monthly</th>
                <th className="px-3 py-1.5 text-right text-xs font-medium text-blue-600 tracking-wide bg-blue-50" style={{ width: '120px' }}>Annual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {opexLines.map((line) => {
                const forecastAmount = getActiveYearAmount(line);
                const isY2Y3 = activeYear > 1;
                const style = getBehaviorStyle(line.costBehavior);

                // Calculate monthly and annual values based on behavior type
                const getWorkingValues = () => {
                  switch (line.costBehavior) {
                    case 'fixed': {
                      const monthly = line.monthlyAmount || 0;
                      return { monthly, annual: monthly * 12, isEditable: true };
                    }
                    case 'variable': {
                      const annual = forecastAmount;
                      return {
                        monthly: null,
                        annual,
                        isEditable: false,
                        display: `${line.percentOfRevenue || 0}%`
                      };
                    }
                    case 'seasonal': {
                      const annual = line.seasonalTargetAmount || (line.priorYearAnnual * (1 + (line.seasonalGrowthPct || 0) / 100));
                      return { monthly: annual / 12, annual, isEditable: true, isAverage: true };
                    }
                    case 'adhoc': {
                      const annual = line.expectedAnnualAmount || 0;
                      return { monthly: annual / 12, annual, isEditable: true, isAverage: true };
                    }
                    default:
                      return { monthly: 0, annual: 0, isEditable: false };
                  }
                };

                const workings = getWorkingValues();
                const inputStyles = "w-full px-2 py-1 text-right border border-gray-200 rounded focus:border-brand-navy focus:ring-1 focus:ring-brand-navy tabular-nums text-sm";

                // Handle monthly value change
                const handleMonthlyChange = (value: number) => {
                  switch (line.costBehavior) {
                    case 'fixed':
                      actions.updateOpExLine(line.id, { monthlyAmount: value });
                      break;
                    case 'seasonal':
                      actions.updateOpExLine(line.id, { seasonalTargetAmount: value * 12, seasonalGrowthPct: undefined });
                      break;
                    case 'adhoc':
                      actions.updateOpExLine(line.id, { expectedAnnualAmount: value * 12 });
                      break;
                  }
                };

                // Handle annual value change
                const handleAnnualChange = (value: number) => {
                  switch (line.costBehavior) {
                    case 'fixed':
                      actions.updateOpExLine(line.id, { monthlyAmount: value / 12 });
                      break;
                    case 'seasonal':
                      actions.updateOpExLine(line.id, { seasonalTargetAmount: value, seasonalGrowthPct: undefined });
                      break;
                    case 'adhoc':
                      actions.updateOpExLine(line.id, { expectedAnnualAmount: value });
                      break;
                  }
                };

                return (
                  <tr key={line.id} className="hover:bg-gray-50/50 group">
                    {/* Expense Name */}
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={line.name}
                        onChange={(e) => actions.updateOpExLine(line.id, { name: e.target.value })}
                        className="w-full px-2 py-1 text-sm bg-transparent border border-transparent hover:border-gray-200 rounded focus:border-brand-navy focus:ring-1 focus:ring-brand-navy"
                      />
                    </td>

                    {/* Prior Year (dynamic based on active year) */}
                    <td className="px-3 py-2 text-right text-gray-500 tabular-nums text-sm whitespace-nowrap">
                      {(() => {
                        // Y1: show historical prior year
                        // Y2: show Y1 forecast
                        // Y3: show Y2 forecast
                        const priorValue = activeYear === 1
                          ? line.priorYearAnnual
                          : activeYear === 2
                            ? calculateY1Amount(line)
                            : calculateYearAmount(line, 2, effectiveDefaultGrowth);
                        return priorValue > 0 ? formatCurrency(priorValue) : '—';
                      })()}
                    </td>

                    {/* Type Dropdown */}
                    <td className="px-3 py-2">
                      <select
                        value={line.costBehavior}
                        onChange={(e) => handleBehaviorChange(line.id, e.target.value as CostBehavior)}
                        disabled={isY2Y3}
                        className={`w-full px-2 py-1 text-xs font-medium border rounded text-center ${
                          isY2Y3
                            ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
                            : `${style.bgColor} ${style.color} ${style.borderColor} cursor-pointer`
                        }`}
                      >
                        {COST_BEHAVIORS.map((b) => (
                          <option key={b.value} value={b.value}>{b.label}</option>
                        ))}
                      </select>
                    </td>

                    {/* Increase % Column - only show for Y2/Y3, part of Workings (blue) */}
                    {isY2Y3 && (
                      <td className="px-2 py-2 text-center bg-blue-50">
                        {line.costBehavior === 'variable' ? (
                          <span className="text-gray-400 text-xs">—</span>
                        ) : (() => {
                          const hasExplicitIncrease = line.costBehavior === 'seasonal'
                            ? line.seasonalGrowthPct !== undefined
                            : line.annualIncreasePct !== undefined;
                          const currentValue = line.costBehavior === 'seasonal'
                            ? line.seasonalGrowthPct
                            : line.annualIncreasePct;
                          return (
                            <div className="flex items-center justify-center gap-0.5">
                              <input
                                type="number"
                                value={currentValue ?? ''}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  if (line.costBehavior === 'seasonal') {
                                    actions.updateOpExLine(line.id, { seasonalGrowthPct: isNaN(val) ? undefined : val });
                                  } else {
                                    actions.updateOpExLine(line.id, { annualIncreasePct: isNaN(val) ? undefined : val });
                                  }
                                }}
                                placeholder={String(effectiveDefaultGrowth)}
                                step="1"
                                className={`w-12 px-1 py-1 text-center border rounded tabular-nums text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400 ${
                                  hasExplicitIncrease
                                    ? 'border-blue-300 bg-white text-blue-700'
                                    : 'border-gray-200 bg-white text-gray-400'
                                }`}
                                title={hasExplicitIncrease ? 'Custom increase rate' : `Using default (${effectiveDefaultGrowth}%)`}
                              />
                              <span className="text-gray-400 text-xs">%</span>
                            </div>
                          );
                        })()}
                      </td>
                    )}

                    {/* Monthly Column (Workings) */}
                    <td className="px-3 py-2 bg-blue-50">
                      {line.costBehavior === 'variable' ? (
                        <VariablePercentInput
                          line={line}
                          activeYear={activeYear}
                          onUpdate={(updates) => actions.updateOpExLine(line.id, updates)}
                        />
                      ) : isY2Y3 ? (
                        <Y2Y3WorkingInput
                          line={line}
                          activeYear={activeYear as 2 | 3}
                          autoValue={getAutoYearAmount(line, activeYear as 2 | 3)}
                          mode="monthly"
                          onOverride={(val) => {
                            const overrideKey = activeYear === 2 ? 'y2Override' : 'y3Override';
                            actions.updateOpExLine(line.id, { [overrideKey]: val } as any);
                          }}
                                                  />
                      ) : workings.isEditable ? (
                        <div className="flex items-center justify-end gap-0.5">
                          <span className="text-gray-400 text-xs">$</span>
                          <input
                            type="number"
                            value={Math.round(workings.monthly || 0) || ''}
                            onChange={(e) => handleMonthlyChange(parseFloat(e.target.value) || 0)}
                            placeholder="0"
                            className={inputStyles}
                            style={{ width: '90px' }}
                          />
                        </div>
                      ) : (
                        <div className="text-right text-gray-400 text-sm tabular-nums">
                          ${Math.round(workings.monthly || 0).toLocaleString()}
                        </div>
                      )}
                    </td>

                    {/* Annual Column (Workings) */}
                    <td className="px-3 py-2 bg-blue-50">
                      {line.costBehavior === 'variable' ? (
                        // For variable costs, show calculated amount (% × revenue)
                        <div className="text-right text-gray-500 text-sm tabular-nums">
                          → {formatCurrency(forecastAmount)}
                        </div>
                      ) : isY2Y3 ? (
                        <Y2Y3WorkingInput
                          line={line}
                          activeYear={activeYear as 2 | 3}
                          autoValue={getAutoYearAmount(line, activeYear as 2 | 3)}
                          mode="annual"
                          onOverride={(val) => {
                            const overrideKey = activeYear === 2 ? 'y2Override' : 'y3Override';
                            actions.updateOpExLine(line.id, { [overrideKey]: val } as any);
                          }}
                                                  />
                      ) : workings.isEditable ? (
                        <div className="flex items-center justify-end gap-0.5">
                          <span className="text-gray-400 text-xs">$</span>
                          <input
                            type="number"
                            value={Math.round(workings.annual) || ''}
                            onChange={(e) => handleAnnualChange(parseFloat(e.target.value) || 0)}
                            placeholder="0"
                            className={inputStyles}
                            style={{ width: '90px' }}
                          />
                        </div>
                      ) : (
                        <div className="text-right text-gray-400 text-sm tabular-nums">
                          ${Math.round(workings.annual).toLocaleString()}
                        </div>
                      )}
                    </td>

                    {/* Forecast Total */}
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-sm whitespace-nowrap bg-white">
                      {(() => {
                        const overrideKey = activeYear === 2 ? 'y2Override' : 'y3Override';
                        const hasOverride = isY2Y3 && (line as any)[overrideKey] !== undefined;
                        return (
                          <span className={hasOverride ? 'text-amber-700' : 'text-gray-900'}>
                            {formatCurrency(forecastAmount)}
                            {hasOverride && <span className="text-xs text-amber-500 ml-1">*</span>}
                          </span>
                        );
                      })()}
                    </td>

                    {/* Delete */}
                    <td className="w-10 py-2 text-center">
                      <button
                        onClick={() => actions.removeOpExLine(line.id)}
                        className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}

              {opexLines.length === 0 && (
                <tr>
                  <td colSpan={activeYear > 1 ? 8 : 7} className="px-4 py-12 text-center text-gray-400">
                    No expenses yet. Click &quot;Add Expense&quot; to get started.
                  </td>
                </tr>
              )}
            </tbody>

            {/* Footer */}
            {opexLines.length > 0 && (
              <tfoot className="bg-gray-100 border-t-2 border-gray-300">
                <tr>
                  <td className="px-4 py-3 font-semibold text-sm text-gray-900">Total Operating Expenses</td>
                  <td className="px-3 py-3 text-right tabular-nums text-sm text-gray-500">
                    {formatCurrency(
                      activeYear === 1
                        ? totalPriorYear
                        : activeYear === 2
                          ? opexByYear.y1
                          : opexByYear.y2
                    )}
                  </td>
                  <td className="px-3 py-3"></td>
                  {activeYear > 1 && <td className="px-2 py-3 bg-blue-100"></td>}
                  <td className="px-3 py-3 text-right tabular-nums text-sm text-gray-600 bg-blue-100">{formatCurrency(activeYearTotal / 12)}/mo</td>
                  <td className="px-3 py-3 text-right tabular-nums text-sm text-gray-600 bg-blue-100">{formatCurrency(activeYearTotal)}</td>
                  <td className="px-3 py-3 text-right font-bold tabular-nums text-sm text-gray-900 bg-white">{formatCurrency(activeYearTotal)}</td>
                  <td className="w-10 py-3"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

    </div>
  );
}
