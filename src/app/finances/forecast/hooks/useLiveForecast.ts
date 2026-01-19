'use client';

import { useState, useCallback, useMemo, useRef } from 'react';

// Types for the live forecast state
export interface TeamMember {
  id: string;
  name: string;
  role: string;
  annualSalary: number;
  classification: 'cogs' | 'opex';
  startMonth?: string; // For new hires: 'YYYY-MM'
  isNewHire: boolean;
  fromXero: boolean;
}

export interface OpExCategory {
  id: string;
  name: string;
  priorYearAmount: number;
  forecastAmount: number;
  growthPercent: number;
  isOverride: boolean;
  trend: 'stable' | 'growing' | 'declining' | 'seasonal' | 'irregular';
  isMaterial: boolean; // > 5% of total
  isGrouped: boolean; // Part of "Other" group
}

export interface Investment {
  id: string;
  name: string;
  amount: number;
  type: 'capex' | 'opex';
  timing?: string;
  initiativeId?: string; // Link to strategic initiative
}

export interface ForecastWarning {
  id: string;
  type: 'error' | 'warning' | 'info';
  category: 'margin' | 'expense' | 'missing' | 'target';
  message: string;
  field?: string;
}

export interface LiveForecastState {
  // Targets
  revenueTarget: number;
  profitTarget: number;
  fiscalYear: number;
  yearsSelected: number[];

  // Team
  existingTeam: TeamMember[];
  plannedHires: TeamMember[];

  // Operating Expenses
  opexCategories: OpExCategory[];
  opexGrowthRate: number; // Default growth rate (e.g., 0.05 for 5%)

  // Investments
  investments: Investment[];

  // Step completion tracking
  completedSteps: {
    setup: boolean;
    team: boolean;
    costs: boolean;
    investments: boolean;
    review: boolean;
  };

  // Current step for highlighting
  currentStep: 'setup' | 'team' | 'costs' | 'investments' | 'projections' | 'review';
}

export interface LiveForecastCalculations {
  // Team calculations
  totalExistingTeamCost: number;
  totalNewHiresCost: number;
  totalTeamCostsCOGS: number;
  totalTeamCostsOpEx: number;
  totalTeamCosts: number;

  // OpEx calculations
  totalOpExPriorYear: number;
  totalOpExForecast: number;
  opExGrowthAmount: number;

  // Investment calculations
  totalInvestmentsCapEx: number;
  totalInvestmentsOpEx: number;
  totalInvestments: number;

  // P&L calculations
  grossProfit: number;
  grossMargin: number;
  totalExpenses: number;
  netProfit: number;
  netMargin: number;

  // Variance from target
  profitVariance: number;
  profitVariancePercent: number;

  // Warnings
  warnings: ForecastWarning[];
}

const initialState: LiveForecastState = {
  revenueTarget: 0,
  profitTarget: 0,
  fiscalYear: new Date().getFullYear() + (new Date().getMonth() >= 6 ? 1 : 0),
  yearsSelected: [1],

  existingTeam: [],
  plannedHires: [],

  opexCategories: [],
  opexGrowthRate: 0.05,

  investments: [],

  completedSteps: {
    setup: false,
    team: false,
    costs: false,
    investments: false,
    review: false,
  },

  currentStep: 'setup',
};

export function useLiveForecast(initialData?: Partial<LiveForecastState>) {
  const [state, setState] = useState<LiveForecastState>({
    ...initialState,
    ...initialData,
  });

  // Calculate all derived values
  const calculations = useMemo((): LiveForecastCalculations => {
    // Team calculations
    const totalExistingTeamCost = state.existingTeam.reduce(
      (sum, member) => sum + member.annualSalary,
      0
    );

    const totalNewHiresCost = state.plannedHires.reduce((sum, hire) => {
      // Prorate based on start month if provided
      if (hire.startMonth) {
        const startDate = new Date(hire.startMonth + '-01');
        const fyStart = new Date(state.fiscalYear - 1, 6, 1); // July 1
        const fyEnd = new Date(state.fiscalYear, 5, 30); // June 30

        if (startDate > fyEnd) return sum; // Starts after FY ends
        if (startDate <= fyStart) return sum + hire.annualSalary; // Full year

        // Prorate
        const monthsRemaining = Math.max(0,
          (fyEnd.getFullYear() - startDate.getFullYear()) * 12 +
          (fyEnd.getMonth() - startDate.getMonth()) + 1
        );
        return sum + (hire.annualSalary * monthsRemaining / 12);
      }
      return sum + hire.annualSalary;
    }, 0);

    const allTeam = [...state.existingTeam, ...state.plannedHires];
    const totalTeamCostsCOGS = allTeam
      .filter(m => m.classification === 'cogs')
      .reduce((sum, m) => sum + m.annualSalary, 0);
    const totalTeamCostsOpEx = allTeam
      .filter(m => m.classification === 'opex')
      .reduce((sum, m) => sum + m.annualSalary, 0);
    const totalTeamCosts = totalExistingTeamCost + totalNewHiresCost;

    // OpEx calculations
    const totalOpExPriorYear = state.opexCategories.reduce(
      (sum, cat) => sum + cat.priorYearAmount,
      0
    );
    const totalOpExForecast = state.opexCategories.reduce(
      (sum, cat) => sum + cat.forecastAmount,
      0
    );
    const opExGrowthAmount = totalOpExForecast - totalOpExPriorYear;

    // Investment calculations
    const totalInvestmentsCapEx = state.investments
      .filter(inv => inv.type === 'capex')
      .reduce((sum, inv) => sum + inv.amount, 0);
    const totalInvestmentsOpEx = state.investments
      .filter(inv => inv.type === 'opex')
      .reduce((sum, inv) => sum + inv.amount, 0);
    const totalInvestments = totalInvestmentsCapEx + totalInvestmentsOpEx;

    // P&L calculations
    const grossProfit = state.revenueTarget - totalTeamCostsCOGS;
    const grossMargin = state.revenueTarget > 0 ? (grossProfit / state.revenueTarget) * 100 : 0;

    const totalExpenses = totalTeamCostsOpEx + totalOpExForecast + totalInvestmentsOpEx;
    const netProfit = grossProfit - totalExpenses;
    const netMargin = state.revenueTarget > 0 ? (netProfit / state.revenueTarget) * 100 : 0;

    // Variance from target
    const profitVariance = netProfit - state.profitTarget;
    const profitVariancePercent = state.profitTarget > 0
      ? (profitVariance / state.profitTarget) * 100
      : 0;

    // Generate warnings
    const warnings: ForecastWarning[] = [];

    // Margin warnings
    if (netMargin < 10 && state.revenueTarget > 0) {
      warnings.push({
        id: 'low-margin',
        type: 'warning',
        category: 'margin',
        message: `Net margin (${netMargin.toFixed(1)}%) is below typical SMB range (10-15%)`,
      });
    }
    if (netMargin > 40 && state.revenueTarget > 0) {
      warnings.push({
        id: 'high-margin',
        type: 'info',
        category: 'margin',
        message: `Net margin (${netMargin.toFixed(1)}%) is unusually high - verify assumptions`,
      });
    }

    // Target variance warning
    if (state.profitTarget > 0 && Math.abs(profitVariancePercent) > 20) {
      const direction = profitVariance > 0 ? 'above' : 'below';
      warnings.push({
        id: 'target-variance',
        type: profitVariance < 0 ? 'warning' : 'info',
        category: 'target',
        message: `Projected profit is ${Math.abs(profitVariancePercent).toFixed(0)}% ${direction} target`,
      });
    }

    // Expense spike warnings
    state.opexCategories.forEach(cat => {
      if (cat.priorYearAmount > 0 && cat.growthPercent > 50) {
        warnings.push({
          id: `spike-${cat.id}`,
          type: 'warning',
          category: 'expense',
          message: `${cat.name} up ${cat.growthPercent.toFixed(0)}% vs prior year`,
          field: cat.name,
        });
      }
    });

    return {
      totalExistingTeamCost,
      totalNewHiresCost,
      totalTeamCostsCOGS,
      totalTeamCostsOpEx,
      totalTeamCosts,
      totalOpExPriorYear,
      totalOpExForecast,
      opExGrowthAmount,
      totalInvestmentsCapEx,
      totalInvestmentsOpEx,
      totalInvestments,
      grossProfit,
      grossMargin,
      totalExpenses,
      netProfit,
      netMargin,
      profitVariance,
      profitVariancePercent,
      warnings,
    };
  }, [state]);

  // Actions
  const setTargets = useCallback((revenue: number, profit: number) => {
    setState(prev => ({
      ...prev,
      revenueTarget: revenue,
      profitTarget: profit,
    }));
  }, []);

  const setYearsSelected = useCallback((years: number[]) => {
    setState(prev => ({
      ...prev,
      yearsSelected: years,
    }));
  }, []);

  const setExistingTeam = useCallback((team: TeamMember[]) => {
    setState(prev => ({
      ...prev,
      existingTeam: team,
    }));
  }, []);

  const addPlannedHire = useCallback((hire: Omit<TeamMember, 'id' | 'isNewHire' | 'fromXero'>) => {
    const newHire: TeamMember = {
      ...hire,
      id: `hire-${Date.now()}`,
      isNewHire: true,
      fromXero: false,
    };
    setState(prev => ({
      ...prev,
      plannedHires: [...prev.plannedHires, newHire],
    }));
    return newHire;
  }, []);

  const removePlannedHire = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      plannedHires: prev.plannedHires.filter(h => h.id !== id),
    }));
  }, []);

  const updatePlannedHire = useCallback((id: string, updates: Partial<TeamMember>) => {
    setState(prev => ({
      ...prev,
      plannedHires: prev.plannedHires.map(h =>
        h.id === id ? { ...h, ...updates } : h
      ),
    }));
  }, []);

  const setOpExCategories = useCallback((categories: OpExCategory[]) => {
    setState(prev => ({
      ...prev,
      opexCategories: categories,
    }));
  }, []);

  const updateOpExCategory = useCallback((id: string, updates: Partial<OpExCategory>) => {
    setState(prev => ({
      ...prev,
      opexCategories: prev.opexCategories.map(cat =>
        cat.id === id ? { ...cat, ...updates, isOverride: true } : cat
      ),
    }));
  }, []);

  const setOpExGrowthRate = useCallback((rate: number) => {
    setState(prev => {
      // Apply new growth rate to non-overridden categories
      const updatedCategories = prev.opexCategories.map(cat => {
        if (cat.isOverride) return cat;
        const newAmount = cat.priorYearAmount * (1 + rate);
        return {
          ...cat,
          forecastAmount: newAmount,
          growthPercent: rate * 100,
        };
      });
      return {
        ...prev,
        opexGrowthRate: rate,
        opexCategories: updatedCategories,
      };
    });
  }, []);

  const addInvestment = useCallback((investment: Omit<Investment, 'id'>) => {
    const newInvestment: Investment = {
      ...investment,
      id: `inv-${Date.now()}`,
    };
    setState(prev => ({
      ...prev,
      investments: [...prev.investments, newInvestment],
    }));
    return newInvestment;
  }, []);

  const removeInvestment = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      investments: prev.investments.filter(inv => inv.id !== id),
    }));
  }, []);

  const updateInvestment = useCallback((id: string, updates: Partial<Investment>) => {
    setState(prev => ({
      ...prev,
      investments: prev.investments.map(inv =>
        inv.id === id ? { ...inv, ...updates } : inv
      ),
    }));
  }, []);

  const setCurrentStep = useCallback((step: LiveForecastState['currentStep']) => {
    setState(prev => ({
      ...prev,
      currentStep: step,
    }));
  }, []);

  const completeStep = useCallback((step: keyof LiveForecastState['completedSteps']) => {
    setState(prev => {
      // Skip update if already completed (prevent unnecessary re-renders)
      if (prev.completedSteps[step]) return prev;
      return {
        ...prev,
        completedSteps: {
          ...prev.completedSteps,
          [step]: true,
        },
      };
    });
  }, []);

  // Initialize from context data
  const initializeFromContext = useCallback((context: {
    goals?: { revenue_target?: number; profit_target?: number };
    current_team?: Array<{
      employee_id?: string;
      full_name: string;
      job_title?: string;
      annual_salary?: number;
      classification?: 'cogs' | 'opex';
    }>;
    historical_pl?: {
      prior_fy?: {
        operating_expenses_by_category?: Array<{
          account_name: string;
          total: number;
        }>;
      };
    };
    strategic_initiatives?: Array<{
      id: string;
      title: string;
    }>;
    fiscal_year?: number;
  }) => {
    console.log('[LiveForecast] Initializing from context:', {
      hasGoals: !!context.goals,
      revenueTarget: context.goals?.revenue_target,
      profitTarget: context.goals?.profit_target,
      teamCount: context.current_team?.length || 0,
      hasHistoricalPL: !!context.historical_pl,
      hasPriorFY: !!context.historical_pl?.prior_fy,
      opexCategoryCount: context.historical_pl?.prior_fy?.operating_expenses_by_category?.length || 0,
      fiscalYear: context.fiscal_year,
    });

    setState(prev => {
      const updates: Partial<LiveForecastState> = {};

      // Set targets from goals
      if (context.goals?.revenue_target) {
        updates.revenueTarget = context.goals.revenue_target;
      }
      if (context.goals?.profit_target) {
        updates.profitTarget = context.goals.profit_target;
      }
      if (context.fiscal_year) {
        updates.fiscalYear = context.fiscal_year;
      }

      // Set existing team
      if (context.current_team?.length) {
        updates.existingTeam = context.current_team.map((member, idx) => ({
          id: member.employee_id || `team-${idx}`,
          name: member.full_name,
          role: member.job_title || 'Team Member',
          annualSalary: member.annual_salary || 0,
          classification: member.classification || 'opex',
          isNewHire: false,
          fromXero: true,
        }));
      }

      // Set OpEx categories from prior year
      if (context.historical_pl?.prior_fy?.operating_expenses_by_category) {
        const categories = context.historical_pl.prior_fy.operating_expenses_by_category;
        const total = categories.reduce((sum, cat) => sum + cat.total, 0);
        const materialityThreshold = 0.05;

        updates.opexCategories = categories.map((cat, idx) => {
          const isMaterial = total > 0 ? (cat.total / total) >= materialityThreshold : true;
          return {
            id: `opex-${idx}`,
            name: cat.account_name,
            priorYearAmount: cat.total,
            forecastAmount: cat.total * 1.05, // Default 5% growth
            growthPercent: 5,
            isOverride: false,
            trend: 'stable' as const,
            isMaterial,
            isGrouped: !isMaterial,
          };
        });
      }

      console.log('[LiveForecast] Updates to apply:', {
        revenueTarget: updates.revenueTarget,
        profitTarget: updates.profitTarget,
        teamCount: updates.existingTeam?.length,
        opexCount: updates.opexCategories?.length,
      });
      return { ...prev, ...updates };
    });
  }, []);

  // Memoize the actions object to prevent infinite loops in useEffect dependencies
  const actions = useMemo(() => ({
    setTargets,
    setYearsSelected,
    setExistingTeam,
    addPlannedHire,
    removePlannedHire,
    updatePlannedHire,
    setOpExCategories,
    updateOpExCategory,
    setOpExGrowthRate,
    addInvestment,
    removeInvestment,
    updateInvestment,
    setCurrentStep,
    completeStep,
    initializeFromContext,
  }), [
    setTargets,
    setYearsSelected,
    setExistingTeam,
    addPlannedHire,
    removePlannedHire,
    updatePlannedHire,
    setOpExCategories,
    updateOpExCategory,
    setOpExGrowthRate,
    addInvestment,
    removeInvestment,
    updateInvestment,
    setCurrentStep,
    completeStep,
    initializeFromContext,
  ]);

  return {
    state,
    calculations,
    actions,
  };
}

export type UseLiveForecastReturn = ReturnType<typeof useLiveForecast>;
