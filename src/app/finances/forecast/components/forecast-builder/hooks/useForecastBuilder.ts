'use client';

import { useState, useCallback, useMemo } from 'react';

// Types
export type BuilderStep = 'goals' | 'baseline' | 'team' | 'investments' | 'review';

export interface TeamMember {
  id: string;
  name: string;
  position: string;
  annualSalary: number;
  startDate?: string; // YYYY-MM format
  endDate?: string; // YYYY-MM format (optional - for departures)
  classification: 'cogs' | 'opex';
  isFromXero?: boolean;
  xeroEmployeeId?: string;
}

export interface PlannedHire {
  id: string;
  name: string;
  position: string;
  annualSalary: number;
  startDate: string; // YYYY-MM format
  endDate?: string; // YYYY-MM format (optional)
  classification: 'cogs' | 'opex';
}

export interface Investment {
  id: string;
  name: string;
  amount: number;
  type: 'capex' | 'opex';
  initiativeId?: string;
}

export interface OpExCategory {
  id: string;
  name: string;
  priorYearAmount: number;
  forecastAmount: number;
  isOneOff: boolean;
}

export interface ForecastBuilderState {
  // Step tracking
  currentStep: BuilderStep;
  completedSteps: BuilderStep[];

  // Core targets (Step 1)
  targets: {
    revenue: number;
    grossProfitPercent: number;
    netProfit: number;
  };

  // Baseline (Step 2)
  baseline: {
    priorYearRevenue: number;
    priorYearCOGS: number;
    priorYearCOGSPercent: number;
    priorYearOpEx: number;
    monthlyAvgOpEx: number;
    opExCategories: OpExCategory[];
    opExInflationPercent: number;
  };

  // Team (Step 3)
  team: {
    existingMembers: TeamMember[];
    salaryIncreasePercent: number;
    plannedHires: PlannedHire[];
  };

  // Investments (Step 4)
  investments: Investment[];

  // Year selection
  yearsSelected: number[];
  fiscalYear: number;
}

// Initial state
const createInitialState = (fiscalYear: number): ForecastBuilderState => ({
  currentStep: 'goals',
  completedSteps: [],
  targets: {
    revenue: 0,
    grossProfitPercent: 30,
    netProfit: 0,
  },
  baseline: {
    priorYearRevenue: 0,
    priorYearCOGS: 0,
    priorYearCOGSPercent: 30,
    priorYearOpEx: 0,
    monthlyAvgOpEx: 0,
    opExCategories: [],
    opExInflationPercent: 5,
  },
  team: {
    existingMembers: [],
    salaryIncreasePercent: 6,
    plannedHires: [],
  },
  investments: [],
  yearsSelected: [1],
  fiscalYear,
});

// Calculations derived from state
export interface ForecastCalculations {
  // The key constraint
  expenseBudget: number;

  // COGS
  forecastCOGS: number;
  cogsPercent: number;

  // Gross Profit
  grossProfit: number;
  grossProfitPercent: number;

  // Team costs split
  teamCostsCOGS: number;
  teamCostsOpEx: number;
  totalTeamCosts: number;

  // OpEx
  baselineOpEx: number;
  totalOpEx: number;

  // Investments
  totalInvestmentsOpEx: number;
  totalInvestmentsCapEx: number;
  totalInvestments: number;

  // Totals
  totalExpenses: number;
  projectedProfit: number;
  budgetRemaining: number;
  budgetUsedPercent: number;

  // Validation
  isOnTrack: boolean;
  profitVariance: number;
}

function calculateForecast(state: ForecastBuilderState): ForecastCalculations {
  const { targets, baseline, team, investments } = state;

  // The key constraint: Revenue - Profit = Expense Budget
  const expenseBudget = targets.revenue - targets.netProfit;

  // COGS calculation (use baseline % applied to new revenue)
  const cogsPercent = baseline.priorYearCOGSPercent || 30;
  const forecastCOGS = targets.revenue * (cogsPercent / 100);

  // Gross Profit
  const grossProfit = targets.revenue - forecastCOGS;
  const grossProfitPercent = targets.revenue > 0 ? (grossProfit / targets.revenue) * 100 : 0;

  // Team costs with salary increases
  const salaryMultiplier = 1 + (team.salaryIncreasePercent / 100);

  let teamCostsCOGS = 0;
  let teamCostsOpEx = 0;

  // Existing team with increases
  team.existingMembers.forEach(member => {
    const adjustedSalary = member.annualSalary * salaryMultiplier;
    if (member.classification === 'cogs') {
      teamCostsCOGS += adjustedSalary;
    } else {
      teamCostsOpEx += adjustedSalary;
    }
  });

  // Planned hires (pro-rated based on start month for Year 1)
  team.plannedHires.forEach(hire => {
    // For simplicity, assume full year cost (can refine later)
    if (hire.classification === 'cogs') {
      teamCostsCOGS += hire.annualSalary;
    } else {
      teamCostsOpEx += hire.annualSalary;
    }
  });

  const totalTeamCosts = teamCostsCOGS + teamCostsOpEx;

  // OpEx with inflation
  const inflationMultiplier = 1 + (baseline.opExInflationPercent / 100);
  const baselineOpEx = baseline.priorYearOpEx * inflationMultiplier;

  // Add any manual category adjustments
  const categoryTotal = baseline.opExCategories.reduce((sum, cat) => sum + cat.forecastAmount, 0);
  const totalOpEx = categoryTotal > 0 ? categoryTotal : baselineOpEx;

  // Investments
  let totalInvestmentsOpEx = 0;
  let totalInvestmentsCapEx = 0;
  investments.forEach(inv => {
    if (inv.type === 'opex') {
      totalInvestmentsOpEx += inv.amount;
    } else {
      totalInvestmentsCapEx += inv.amount;
    }
  });
  const totalInvestments = totalInvestmentsOpEx + totalInvestmentsCapEx;

  // Total expenses (for P&L purposes, only OpEx items affect profit)
  const totalExpenses = forecastCOGS + teamCostsOpEx + totalOpEx + totalInvestmentsOpEx;

  // Projected profit
  const projectedProfit = targets.revenue - totalExpenses;

  // Budget tracking
  const budgetRemaining = expenseBudget - totalExpenses;
  const budgetUsedPercent = expenseBudget > 0 ? (totalExpenses / expenseBudget) * 100 : 0;

  // Validation
  const profitVariance = projectedProfit - targets.netProfit;
  const isOnTrack = profitVariance >= 0;

  return {
    expenseBudget,
    forecastCOGS,
    cogsPercent,
    grossProfit,
    grossProfitPercent,
    teamCostsCOGS,
    teamCostsOpEx,
    totalTeamCosts,
    baselineOpEx,
    totalOpEx,
    totalInvestmentsOpEx,
    totalInvestmentsCapEx,
    totalInvestments,
    totalExpenses,
    projectedProfit,
    budgetRemaining,
    budgetUsedPercent,
    isOnTrack,
    profitVariance,
  };
}

// The hook
export function useForecastBuilder(fiscalYear: number) {
  const [state, setState] = useState<ForecastBuilderState>(() => createInitialState(fiscalYear));

  // Calculations (memoized)
  const calculations = useMemo(() => calculateForecast(state), [state]);

  // Step navigation
  const goToStep = useCallback((step: BuilderStep) => {
    setState(prev => ({ ...prev, currentStep: step }));
  }, []);

  const completeStep = useCallback((step: BuilderStep) => {
    setState(prev => {
      if (prev.completedSteps.includes(step)) return prev;
      return { ...prev, completedSteps: [...prev.completedSteps, step] };
    });
  }, []);

  const nextStep = useCallback(() => {
    const steps: BuilderStep[] = ['goals', 'baseline', 'team', 'investments', 'review'];
    const currentIndex = steps.indexOf(state.currentStep);
    if (currentIndex < steps.length - 1) {
      completeStep(state.currentStep);
      goToStep(steps[currentIndex + 1]);
    }
  }, [state.currentStep, completeStep, goToStep]);

  // Target setters
  const setTargets = useCallback((targets: Partial<ForecastBuilderState['targets']>) => {
    setState(prev => ({
      ...prev,
      targets: { ...prev.targets, ...targets },
    }));
  }, []);

  // Baseline setters
  const setBaseline = useCallback((baseline: Partial<ForecastBuilderState['baseline']>) => {
    setState(prev => ({
      ...prev,
      baseline: { ...prev.baseline, ...baseline },
    }));
  }, []);

  const setOpExInflation = useCallback((percent: number) => {
    setState(prev => ({
      ...prev,
      baseline: { ...prev.baseline, opExInflationPercent: percent },
    }));
  }, []);

  // Team setters
  const setExistingTeam = useCallback((members: TeamMember[]) => {
    setState(prev => ({
      ...prev,
      team: { ...prev.team, existingMembers: members },
    }));
  }, []);

  const setSalaryIncrease = useCallback((percent: number) => {
    setState(prev => ({
      ...prev,
      team: { ...prev.team, salaryIncreasePercent: percent },
    }));
  }, []);

  const addPlannedHire = useCallback((hire: Omit<PlannedHire, 'id'>) => {
    setState(prev => ({
      ...prev,
      team: {
        ...prev.team,
        plannedHires: [...prev.team.plannedHires, { ...hire, id: `hire-${Date.now()}` }],
      },
    }));
  }, []);

  const removePlannedHire = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      team: {
        ...prev.team,
        plannedHires: prev.team.plannedHires.filter(h => h.id !== id),
      },
    }));
  }, []);

  const updateTeamMember = useCallback((id: string, updates: Partial<TeamMember>) => {
    setState(prev => ({
      ...prev,
      team: {
        ...prev.team,
        existingMembers: prev.team.existingMembers.map(m =>
          m.id === id ? { ...m, ...updates } : m
        ),
      },
    }));
  }, []);

  const addTeamMember = useCallback((member: Omit<TeamMember, 'id'>) => {
    setState(prev => ({
      ...prev,
      team: {
        ...prev.team,
        existingMembers: [...prev.team.existingMembers, { ...member, id: `member-${Date.now()}` }],
      },
    }));
  }, []);

  const removeTeamMember = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      team: {
        ...prev.team,
        existingMembers: prev.team.existingMembers.filter(m => m.id !== id),
      },
    }));
  }, []);

  const updatePlannedHire = useCallback((id: string, updates: Partial<PlannedHire>) => {
    setState(prev => ({
      ...prev,
      team: {
        ...prev.team,
        plannedHires: prev.team.plannedHires.map(h =>
          h.id === id ? { ...h, ...updates } : h
        ),
      },
    }));
  }, []);

  // Investment setters
  const addInvestment = useCallback((investment: Omit<Investment, 'id'>) => {
    setState(prev => ({
      ...prev,
      investments: [...prev.investments, { ...investment, id: `inv-${Date.now()}` }],
    }));
  }, []);

  const removeInvestment = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      investments: prev.investments.filter(i => i.id !== id),
    }));
  }, []);

  // Years selection
  const setYearsSelected = useCallback((years: number[]) => {
    setState(prev => ({ ...prev, yearsSelected: years }));
  }, []);

  // Initialize from loaded data
  const initializeFromData = useCallback((data: {
    goals?: { revenue_target?: number; gross_profit_target?: number; profit_target?: number };
    priorYearPL?: { revenue?: number; cogs?: number; opex?: number };
    team?: Array<{
      id?: string;
      name?: string;
      position?: string;
      role?: string; // Legacy field
      annualSalary?: number;
      startDate?: string;
      endDate?: string;
      classification?: 'cogs' | 'opex';
      isFromXero?: boolean;
      xeroEmployeeId?: string;
    }>;
  }) => {
    setState(prev => {
      const newState = { ...prev };

      if (data.goals) {
        newState.targets = {
          revenue: data.goals.revenue_target || 0,
          grossProfitPercent: data.goals.gross_profit_target && data.goals.revenue_target
            ? (data.goals.gross_profit_target / data.goals.revenue_target) * 100
            : 30,
          netProfit: data.goals.profit_target || 0,
        };
      }

      if (data.priorYearPL) {
        const priorRevenue = data.priorYearPL.revenue || 0;
        const priorCOGS = data.priorYearPL.cogs || 0;
        const priorOpEx = data.priorYearPL.opex || 0;
        newState.baseline = {
          ...prev.baseline,
          priorYearRevenue: priorRevenue,
          priorYearCOGS: priorCOGS,
          priorYearCOGSPercent: priorRevenue > 0 ? (priorCOGS / priorRevenue) * 100 : 30,
          priorYearOpEx: priorOpEx,
          monthlyAvgOpEx: priorOpEx / 12,
        };
      }

      if (data.team && data.team.length > 0) {
        newState.team = {
          ...prev.team,
          existingMembers: data.team.map(t => ({
            id: t.id || t.xeroEmployeeId || `member-${Date.now()}-${Math.random()}`,
            name: t.name || 'Unknown',
            position: t.position || t.role || 'Team Member',
            annualSalary: t.annualSalary || 0,
            startDate: t.startDate,
            endDate: t.endDate,
            classification: t.classification || 'opex',
            isFromXero: t.isFromXero,
            xeroEmployeeId: t.xeroEmployeeId,
          })),
        };
      }

      return newState;
    });
  }, []);

  // Memoize actions to prevent re-renders
  const actions = useMemo(() => ({
    goToStep,
    completeStep,
    nextStep,
    setTargets,
    setBaseline,
    setOpExInflation,
    setExistingTeam,
    setSalaryIncrease,
    addTeamMember,
    updateTeamMember,
    removeTeamMember,
    addPlannedHire,
    updatePlannedHire,
    removePlannedHire,
    addInvestment,
    removeInvestment,
    setYearsSelected,
    initializeFromData,
  }), [
    goToStep, completeStep, nextStep, setTargets, setBaseline, setOpExInflation,
    setExistingTeam, setSalaryIncrease, addTeamMember, updateTeamMember, removeTeamMember,
    addPlannedHire, updatePlannedHire, removePlannedHire,
    addInvestment, removeInvestment, setYearsSelected, initializeFromData,
  ]);

  return {
    state,
    calculations,
    actions,
  };
}

export type UseForecastBuilderReturn = ReturnType<typeof useForecastBuilder>;
