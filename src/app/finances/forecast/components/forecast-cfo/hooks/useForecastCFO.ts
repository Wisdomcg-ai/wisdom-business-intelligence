'use client';

import { useState, useCallback, useMemo } from 'react';

// Types
export type CFOStep = 'goals' | 'baseline' | 'team' | 'investments' | 'review';

export interface TeamMember {
  id: string;
  name: string;
  position: string;
  salary: number;
  type: 'opex' | 'cogs';
  startDate?: string;
  endDate?: string;
  isFromXero?: boolean;
}

export interface PlannedHire {
  id: string;
  name: string;
  position: string;
  salary: number;
  type: 'opex' | 'cogs';
  startMonth: string;
}

export interface Investment {
  id: string;
  name: string;
  amount: number;
  category: 'marketing' | 'equipment' | 'technology' | 'training' | 'other';
  type: 'opex' | 'capex';
  quarter: string;
}

export interface CFOMessage {
  id: string;
  role: 'cfo' | 'user' | 'system';
  content: string;
  timestamp: Date;
  component?: 'team-table' | 'investment-cards' | 'salary-slider' | 'confirmation';
  data?: unknown;
}

export interface ForecastCFOState {
  step: CFOStep;
  fiscalYear: number;

  // Goals (Step 1)
  targets: {
    revenue: number;
    netProfit: number;
    netProfitPercent: number;
  };

  // Baseline (Step 2)
  baseline: {
    priorRevenue: number;
    cogsPercent: number;
    priorOpEx: number;
    opExInflation: number;
  };

  // Team (Step 3)
  team: {
    members: TeamMember[];
    salaryIncreasePercent: number;
    newHires: PlannedHire[];
  };

  // Investments (Step 4)
  investments: Investment[];

  // Conversation
  messages: CFOMessage[];

  // UI State
  isLoading: boolean;
  error: string | null;
}

export interface ForecastCalculations {
  expenseBudget: number;
  forecastCOGS: number;
  grossProfit: number;
  grossProfitPercent: number;
  existingTeamCost: number;
  newHiresCost: number;
  totalTeamCost: number;
  opExCost: number;
  investmentCost: number;
  totalExpenses: number;
  projectedProfit: number;
  budgetUsed: number;
  budgetRemaining: number;
  budgetUsedPercent: number;
  isOnTrack: boolean;
  profitVariance: number;
}

const SUPER_RATE = 0.12; // 12% superannuation

function createInitialState(fiscalYear: number): ForecastCFOState {
  return {
    step: 'goals',
    fiscalYear,
    targets: {
      revenue: 0,
      netProfit: 0,
      netProfitPercent: 12,
    },
    baseline: {
      priorRevenue: 0,
      cogsPercent: 35,
      priorOpEx: 0,
      opExInflation: 5,
    },
    team: {
      members: [],
      salaryIncreasePercent: 6,
      newHires: [],
    },
    investments: [],
    messages: [],
    isLoading: false,
    error: null,
  };
}

function calculateForecast(state: ForecastCFOState): ForecastCalculations {
  const { targets, baseline, team, investments } = state;

  // The key formula: Revenue - Profit = Expense Budget
  const expenseBudget = targets.revenue - targets.netProfit;

  // COGS
  const forecastCOGS = targets.revenue * (baseline.cogsPercent / 100);
  const grossProfit = targets.revenue - forecastCOGS;
  const grossProfitPercent = targets.revenue > 0 ? (grossProfit / targets.revenue) * 100 : 0;

  // Team costs with salary increases and super
  const salaryMultiplier = 1 + (team.salaryIncreasePercent / 100);
  const existingTeamCost = team.members.reduce(
    (sum, m) => sum + (m.salary * salaryMultiplier * (1 + SUPER_RATE)),
    0
  );
  const newHiresCost = team.newHires.reduce(
    (sum, h) => sum + (h.salary * (1 + SUPER_RATE)),
    0
  );
  const totalTeamCost = existingTeamCost + newHiresCost;

  // OpEx with inflation
  const opExCost = baseline.priorOpEx * (1 + baseline.opExInflation / 100);

  // Investments (only OpEx affects P&L immediately)
  const investmentCost = investments
    .filter(i => i.type === 'opex')
    .reduce((sum, i) => sum + i.amount, 0);

  // Total expenses (COGS + Team OpEx + OpEx + Investments)
  const teamOpExCost = team.members
    .filter(m => m.type === 'opex')
    .reduce((sum, m) => sum + (m.salary * salaryMultiplier * (1 + SUPER_RATE)), 0) +
    team.newHires
      .filter(h => h.type === 'opex')
      .reduce((sum, h) => sum + (h.salary * (1 + SUPER_RATE)), 0);

  const totalExpenses = forecastCOGS + teamOpExCost + opExCost + investmentCost;

  // Projected profit
  const projectedProfit = targets.revenue - totalExpenses;

  // Budget tracking
  const budgetUsed = totalExpenses;
  const budgetRemaining = expenseBudget - budgetUsed;
  const budgetUsedPercent = expenseBudget > 0 ? (budgetUsed / expenseBudget) * 100 : 0;

  // Validation
  const profitVariance = projectedProfit - targets.netProfit;
  const isOnTrack = profitVariance >= 0;

  return {
    expenseBudget,
    forecastCOGS,
    grossProfit,
    grossProfitPercent,
    existingTeamCost,
    newHiresCost,
    totalTeamCost,
    opExCost,
    investmentCost,
    totalExpenses,
    projectedProfit,
    budgetUsed,
    budgetRemaining,
    budgetUsedPercent,
    isOnTrack,
    profitVariance,
  };
}

export function useForecastCFO(fiscalYear: number) {
  const [state, setState] = useState<ForecastCFOState>(() => createInitialState(fiscalYear));

  const calculations = useMemo(() => calculateForecast(state), [state]);

  // Navigation
  const goToStep = useCallback((step: CFOStep) => {
    setState(prev => ({ ...prev, step }));
  }, []);

  const nextStep = useCallback(() => {
    const steps: CFOStep[] = ['goals', 'baseline', 'team', 'investments', 'review'];
    const currentIndex = steps.indexOf(state.step);
    if (currentIndex < steps.length - 1) {
      setState(prev => ({ ...prev, step: steps[currentIndex + 1] }));
    }
  }, [state.step]);

  const prevStep = useCallback(() => {
    const steps: CFOStep[] = ['goals', 'baseline', 'team', 'investments', 'review'];
    const currentIndex = steps.indexOf(state.step);
    if (currentIndex > 0) {
      setState(prev => ({ ...prev, step: steps[currentIndex - 1] }));
    }
  }, [state.step]);

  // Messages
  const addMessage = useCallback((message: Omit<CFOMessage, 'id' | 'timestamp'>) => {
    setState(prev => ({
      ...prev,
      messages: [...prev.messages, {
        ...message,
        id: `msg-${Date.now()}`,
        timestamp: new Date(),
      }],
    }));
  }, []);

  // Targets
  const setTargets = useCallback((targets: Partial<ForecastCFOState['targets']>) => {
    setState(prev => ({
      ...prev,
      targets: { ...prev.targets, ...targets },
    }));
  }, []);

  // Baseline
  const setBaseline = useCallback((baseline: Partial<ForecastCFOState['baseline']>) => {
    setState(prev => ({
      ...prev,
      baseline: { ...prev.baseline, ...baseline },
    }));
  }, []);

  // Team
  const setTeamMembers = useCallback((members: TeamMember[]) => {
    setState(prev => ({
      ...prev,
      team: { ...prev.team, members },
    }));
  }, []);

  const updateTeamMember = useCallback((id: string, updates: Partial<TeamMember>) => {
    setState(prev => ({
      ...prev,
      team: {
        ...prev.team,
        members: prev.team.members.map(m => m.id === id ? { ...m, ...updates } : m),
      },
    }));
  }, []);

  const addTeamMember = useCallback((member: Omit<TeamMember, 'id'>) => {
    setState(prev => ({
      ...prev,
      team: {
        ...prev.team,
        members: [...prev.team.members, { ...member, id: `member-${Date.now()}` }],
      },
    }));
  }, []);

  const removeTeamMember = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      team: {
        ...prev.team,
        members: prev.team.members.filter(m => m.id !== id),
      },
    }));
  }, []);

  const setSalaryIncrease = useCallback((percent: number) => {
    setState(prev => ({
      ...prev,
      team: { ...prev.team, salaryIncreasePercent: percent },
    }));
  }, []);

  const addNewHire = useCallback((hire: Omit<PlannedHire, 'id'>) => {
    setState(prev => ({
      ...prev,
      team: {
        ...prev.team,
        newHires: [...prev.team.newHires, { ...hire, id: `hire-${Date.now()}` }],
      },
    }));
  }, []);

  const updateNewHire = useCallback((id: string, updates: Partial<PlannedHire>) => {
    setState(prev => ({
      ...prev,
      team: {
        ...prev.team,
        newHires: prev.team.newHires.map(h => h.id === id ? { ...h, ...updates } : h),
      },
    }));
  }, []);

  const removeNewHire = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      team: {
        ...prev.team,
        newHires: prev.team.newHires.filter(h => h.id !== id),
      },
    }));
  }, []);

  // Investments
  const addInvestment = useCallback((investment: Omit<Investment, 'id'>) => {
    setState(prev => ({
      ...prev,
      investments: [...prev.investments, { ...investment, id: `inv-${Date.now()}` }],
    }));
  }, []);

  const updateInvestment = useCallback((id: string, updates: Partial<Investment>) => {
    setState(prev => ({
      ...prev,
      investments: prev.investments.map(i => i.id === id ? { ...i, ...updates } : i),
    }));
  }, []);

  const removeInvestment = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      investments: prev.investments.filter(i => i.id !== id),
    }));
  }, []);

  // Initialize from data
  const initializeFromData = useCallback((data: {
    goals?: { revenue_target?: number; profit_target?: number; net_profit_percent?: number };
    priorYear?: { revenue?: number; cogs?: number; opex?: number };
    team?: Array<{
      id?: string;
      name: string;
      position?: string;
      salary?: number;
      type?: 'opex' | 'cogs';
      startDate?: string;
      isFromXero?: boolean;
    }>;
  }) => {
    setState(prev => {
      const newState = { ...prev };

      if (data.goals) {
        const revenue = data.goals.revenue_target || 0;
        const netProfit = data.goals.profit_target || 0;
        const netProfitPercent = data.goals.net_profit_percent || (revenue > 0 ? (netProfit / revenue) * 100 : 12);

        newState.targets = {
          revenue,
          netProfit,
          netProfitPercent,
        };
      }

      if (data.priorYear) {
        const revenue = data.priorYear.revenue || 0;
        const cogs = data.priorYear.cogs || 0;
        const opex = data.priorYear.opex || 0;

        newState.baseline = {
          priorRevenue: revenue,
          cogsPercent: revenue > 0 ? (cogs / revenue) * 100 : 35,
          priorOpEx: opex,
          opExInflation: 5,
        };
      }

      if (data.team && data.team.length > 0) {
        newState.team = {
          ...prev.team,
          members: data.team.map(t => ({
            id: t.id || `member-${Date.now()}-${Math.random()}`,
            name: t.name,
            position: t.position || 'Team Member',
            salary: t.salary || 0,
            type: t.type || 'opex',
            startDate: t.startDate,
            isFromXero: t.isFromXero,
          })),
        };
      }

      return newState;
    });
  }, []);

  const setLoading = useCallback((isLoading: boolean) => {
    setState(prev => ({ ...prev, isLoading }));
  }, []);

  const setError = useCallback((error: string | null) => {
    setState(prev => ({ ...prev, error }));
  }, []);

  const actions = useMemo(() => ({
    goToStep,
    nextStep,
    prevStep,
    addMessage,
    setTargets,
    setBaseline,
    setTeamMembers,
    updateTeamMember,
    addTeamMember,
    removeTeamMember,
    setSalaryIncrease,
    addNewHire,
    updateNewHire,
    removeNewHire,
    addInvestment,
    updateInvestment,
    removeInvestment,
    initializeFromData,
    setLoading,
    setError,
  }), [
    goToStep, nextStep, prevStep, addMessage, setTargets, setBaseline,
    setTeamMembers, updateTeamMember, addTeamMember, removeTeamMember,
    setSalaryIncrease, addNewHire, updateNewHire, removeNewHire,
    addInvestment, updateInvestment, removeInvestment, initializeFromData,
    setLoading, setError,
  ]);

  return {
    state,
    calculations,
    actions,
  };
}

export type UseForecastCFOReturn = ReturnType<typeof useForecastCFO>;
