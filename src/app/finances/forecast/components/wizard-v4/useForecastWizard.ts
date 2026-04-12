import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  ForecastWizardState,
  WizardActions,
  WizardStep,
  ForecastDuration,
  Goals,
  PriorYearData,
  RevenuePattern,
  RevenueLine,
  COGSLine,
  TeamMember,
  NewHire,
  Departure,
  Bonus,
  Commission,
  OpExLine,
  CapExItem,
  Investment,
  OtherExpense,
  PlannedSpend,
  ForecastSummary,
  YearlySummary,
  BusinessProfile,
  calculateSuper,
  calculateNewSalary,
  calculateLoanPayment,
  calculateTotalInterest,
  generateMonthKeys,
  getPlannedSpendPLImpact,
  SUPER_RATE,
  quarterlyToMonthly,
  monthlyToQuarterly,
  getRevenueLineYearTotal,
} from './types';
import { isTeamCost } from './utils/opex-classifier';
import { getFiscalYear, getFiscalMonthIndex, DEFAULT_YEAR_START_MONTH } from '@/lib/utils/fiscal-year-utils';
import type {
  ForecastAssumptions,
  RevenueLineAssumption,
  COGSLineAssumption,
  ExistingTeamMember,
  PlannedHire,
  OpExLineAssumption,
  CapExItem as CapExAssumptionItem,
} from './types/assumptions';

// Bump this to force all users to re-init from APIs (invalidates stale localStorage)
const WIZARD_VERSION = 9; // Bumped to force fresh load after dual-ID fix

// Remap month keys from prior year to forecast year (same position, different year)
// e.g., { "2024-07": 50000 } → { "2025-07": 50000 } when targetFYStart=2025
function remapMonthKeysToForecastYear(
  priorByMonth: Record<string, number>,
  targetFYStart: number
): Record<string, number> {
  const targetKeys = generateMonthKeys(targetFYStart);
  const priorKeys = Object.keys(priorByMonth).sort();
  const result: Record<string, number> = {};

  if (priorKeys.length === 0) return result;

  // If keys already match the target year, return as-is
  if (priorKeys[0] === targetKeys[0]) return { ...priorByMonth };

  // Map by position: prior month 0 → target month 0, etc.
  priorKeys.forEach((key, idx) => {
    if (idx < 12 && targetKeys[idx]) {
      result[targetKeys[idx]] = priorByMonth[key] || 0;
    }
  });

  return result;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

const createInitialState = (fiscalYearStart: number, businessId: string): ForecastWizardState => ({
  wizardVersion: WIZARD_VERSION,
  businessId,
  fiscalYearStart,
  status: 'draft',
  forecastDuration: 3, // Default to 3yr (recommended)
  durationLocked: false,
  currentStep: 1,
  activeYear: 1,
  businessProfile: null,
  goals: {
    year1: { revenue: 0, grossProfitPct: 50, netProfitPct: 15 },
    year2: { revenue: 0, grossProfitPct: 52, netProfitPct: 17 },
    year3: { revenue: 0, grossProfitPct: 55, netProfitPct: 20 },
  },
  priorYear: null,
  currentYTD: null,
  revenuePattern: 'seasonal',
  revenueLines: [],
  cogsLines: [],
  teamMembers: [],
  newHires: [],
  departures: [],
  bonuses: [],
  commissions: [],
  defaultOpExIncreasePct: 3,
  opexLines: [],
  capexItems: [],
  investments: [],
  plannedSpends: [],
  otherExpenses: [],
});

// LocalStorage key for wizard state persistence
const getStorageKey = (businessId: string, fiscalYear: number) =>
  `forecast-wizard-v4-${businessId}-${fiscalYear}`;

// Try to load state from localStorage
const loadStateFromStorage = (businessId: string, fiscalYear: number): ForecastWizardState | null => {
  if (typeof window === 'undefined') return null;
  try {
    const key = getStorageKey(businessId, fiscalYear);
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Validate it has the expected structure and matching version
      if (parsed && parsed.businessId === businessId && parsed.fiscalYearStart === fiscalYear) {
        if (parsed.wizardVersion !== WIZARD_VERSION) {
          return null;
        }
        // Backward compat: convert legacy capexItems/investments to plannedSpends
        if ((!parsed.plannedSpends || parsed.plannedSpends.length === 0) &&
            (parsed.capexItems?.length > 0 || parsed.investments?.length > 0)) {
          parsed.plannedSpends = [
            ...(parsed.capexItems || []).map((item: CapExItem) => ({
              id: item.id,
              description: item.description,
              amount: item.cost,
              month: item.month,
              spendType: 'asset' as const,
              usefulLifeYears: item.usefulLifeYears,
              annualDepreciation: item.annualDepreciation,
              paymentMethod: 'outright' as const,
            })),
            ...(parsed.investments || []).map((inv: Investment) => ({
              id: inv.id,
              description: inv.description,
              amount: inv.totalBudget,
              month: 1,
              spendType: 'one-off' as const,
              paymentMethod: 'outright' as const,
              initiativeId: inv.initiativeId,
            })),
          ];
        }
        return parsed as ForecastWizardState;
      }
    }
  } catch (err) {
    console.error('[ForecastWizard] Error loading from localStorage:', err);
  }
  return null;
};

// Save state to localStorage
const saveStateToStorage = (state: ForecastWizardState) => {
  if (typeof window === 'undefined') return;
  try {
    const key = getStorageKey(state.businessId, state.fiscalYearStart);
    localStorage.setItem(key, JSON.stringify({ ...state, wizardVersion: WIZARD_VERSION }));
  } catch (err) {
    console.error('[ForecastWizard] Error saving to localStorage:', err);
  }
};

export function useForecastWizard(fiscalYearStart: number, businessId: string) {
  // Track if we've initialized from storage to avoid overwriting
  const initializedRef = useRef(false);
  // Track if we restored from localStorage (has meaningful data)
  const [wasRestoredFromStorage, setWasRestoredFromStorage] = useState(false);

  const [state, setState] = useState<ForecastWizardState>(() => {
    // Try to load from localStorage first
    const stored = loadStateFromStorage(businessId, fiscalYearStart);
    if (stored) {
      initializedRef.current = true;
      // Check if the restored state has meaningful data (not just defaults)
      const hasMeaningfulData = (
        stored.opexLines?.length > 0 ||
        stored.revenueLines?.length > 0 ||
        stored.teamMembers?.length > 0 ||
        stored.priorYear !== null
      );
      if (hasMeaningfulData) {
        // Use setTimeout to set this after initial render
        setTimeout(() => setWasRestoredFromStorage(true), 0);
      }
      return stored;
    }
    return createInitialState(fiscalYearStart, businessId);
  });

  // Auto-save to localStorage whenever state changes
  useEffect(() => {
    // Don't save on first render if we just loaded from storage
    if (!initializedRef.current) {
      initializedRef.current = true;
      return;
    }
    // Debounce saves to avoid too many writes
    const timeoutId = setTimeout(() => {
      saveStateToStorage(state);
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [state]);

  // Function to clear localStorage (for starting fresh)
  const clearLocalStorage = useCallback(() => {
    if (typeof window === 'undefined') return;
    const key = getStorageKey(businessId, fiscalYearStart);
    localStorage.removeItem(key);
    setWasRestoredFromStorage(false);
  }, [businessId, fiscalYearStart]);

  // Navigation
  const goToStep = useCallback((step: WizardStep) => {
    setState((prev) => ({ ...prev, currentStep: step }));
  }, []);

  const nextStep = useCallback(() => {
    setState((prev) => {
      let next = prev.currentStep + 1;
      // Skip Growth Plan step for single-year forecasts
      if (next === 8 && prev.forecastDuration === 1) next = 9;
      if (next > 9) return prev;
      return {
        ...prev,
        currentStep: next as WizardStep,
        durationLocked: prev.currentStep === 1 ? true : prev.durationLocked,
      };
    });
  }, []);

  const prevStep = useCallback(() => {
    setState((prev) => {
      let next = prev.currentStep - 1;
      // Skip Growth Plan step for single-year forecasts
      if (next === 8 && prev.forecastDuration === 1) next = 7;
      if (next < 1) return prev;
      return { ...prev, currentStep: next as WizardStep };
    });
  }, []);

  const setActiveYear = useCallback((year: 1 | 2 | 3) => {
    setState((prev) => {
      // Don't allow setting activeYear beyond forecast duration
      if (year > prev.forecastDuration) return prev;
      return { ...prev, activeYear: year };
    });
  }, []);

  // Step 1: Duration & Goals
  const setForecastDuration = useCallback((duration: ForecastDuration) => {
    setState((prev) => {
      // Only allow changing if not locked
      if (prev.durationLocked) return prev;
      // Reset activeYear if it exceeds the new duration
      const newActiveYear = prev.activeYear > duration ? 1 : prev.activeYear;
      return { ...prev, forecastDuration: duration, activeYear: newActiveYear as 1 | 2 | 3 };
    });
  }, []);

  const updateGoals = useCallback((goals: Goals) => {
    setState((prev) => ({ ...prev, goals }));
  }, []);

  // Business Profile
  const setBusinessProfile = useCallback((profile: BusinessProfile | null) => {
    setState((prev) => ({ ...prev, businessProfile: profile }));
  }, []);

  // Step 2: Prior Year - also creates revenue/COGS/OpEx lines from the data
  const setPriorYear = useCallback((data: PriorYearData) => {
    setState((prev) => {
      // Create revenue lines from prior year data
      // If no individual lines but we have a total, create a default line
      let revenueLines: RevenueLine[] = [];
      if (data.revenue.byLine.length > 0) {
        revenueLines = data.revenue.byLine.map((line) => ({
          id: line.id,
          name: line.name,
          year1Monthly: remapMonthKeysToForecastYear(line.byMonth, prev.fiscalYearStart),
          year2Monthly: {},
          year3Monthly: {},
        }));
      } else if (data.revenue.total > 0) {
        // Create a default Sales Revenue line with monthly distribution
        const monthlyAmount = Math.round(data.revenue.total / 12);
        const monthKeys = generateMonthKeys(prev.fiscalYearStart);
        const year1Monthly: { [key: string]: number } = {};

        // Apply seasonality pattern if available
        const seasonality = data.seasonalityPattern || Array(12).fill(8.33);
        const totalSeasonality = seasonality.reduce((sum: number, val: number) => sum + val, 0);

        monthKeys.forEach((key, idx) => {
          const seasonalFactor = (seasonality[idx] || 8.33) / totalSeasonality;
          year1Monthly[key] = Math.round(data.revenue.total * seasonalFactor);
        });

        revenueLines = [{
          id: generateId(),
          name: 'Sales Revenue',
          year1Monthly,
          year2Monthly: {},
          year3Monthly: {},
        }];
      }

      // Create COGS lines from prior year data - default to variable (% of revenue)
      // If no individual lines but we have a total, create a default line
      let cogsLines: COGSLine[] = [];
      if (data.cogs.byLine.length > 0) {
        cogsLines = data.cogs.byLine.map((line) => ({
          id: line.id,
          name: line.name,
          accountId: line.id,
          priorYearTotal: line.total,
          costBehavior: 'variable' as const,
          percentOfRevenue: line.percentOfRevenue,
        }));
      } else if (data.cogs.total > 0) {
        // Create a default Cost of Sales line
        cogsLines = [{
          id: generateId(),
          name: 'Cost of Sales',
          accountId: 'default-cogs',
          priorYearTotal: data.cogs.total,
          costBehavior: 'variable' as const,
          percentOfRevenue: data.cogs.percentOfRevenue || 0,
        }];
      }

      // Create OpEx lines from prior year data - default to fixed cost behavior
      const opexLines: OpExLine[] = data.opex.byLine.map((line) => {
        const monthlyAvg = line.monthlyAvg || line.total / 12;
        return {
          id: line.id,
          name: line.name,
          accountId: line.id,
          priorYearAnnual: line.total,
          costBehavior: 'fixed' as const,
          monthlyAmount: Math.round(monthlyAvg),
          annualIncreasePct: prev.defaultOpExIncreasePct,
        };
      });

      // Auto-populate Y2/Y3 quarterly revenue from goals
      if (revenueLines.length > 0) {
        let year1Total = 0;
        revenueLines.forEach(line => {
          year1Total += Object.values(line.year1Monthly).reduce((a, b) => a + b, 0);
        });

        const seasonality = data.seasonalityPattern || Array(12).fill(8.33);
        const distributeGoalRevenueMonthly = (goalRevenue: number, yearOffset: number, yearKey: 'year2Monthly' | 'year3Monthly') => {
          if (goalRevenue <= 0) return;
          const monthKeys = generateMonthKeys(prev.fiscalYearStart + yearOffset);
          const totalSeasonality = seasonality.reduce((s: number, v: number) => s + v, 0);
          revenueLines.forEach(line => {
            const lineY1 = Object.values(line.year1Monthly).reduce((a, b) => a + b, 0);
            const share = year1Total > 0 ? lineY1 / year1Total : 1 / revenueLines.length;
            const lineTarget = goalRevenue * share;
            const monthly: { [key: string]: number } = {};
            monthKeys.forEach((key, idx) => {
              const factor = (seasonality[idx] || 8.33) / totalSeasonality;
              monthly[key] = Math.round(lineTarget * factor);
            });
            line[yearKey] = monthly;
          });
        };

        if (prev.goals.year2?.revenue) distributeGoalRevenueMonthly(prev.goals.year2.revenue, 1, 'year2Monthly');
        if (prev.goals.year3?.revenue) distributeGoalRevenueMonthly(prev.goals.year3.revenue, 2, 'year3Monthly');
      }

      return {
        ...prev,
        priorYear: data,
        revenueLines,
        cogsLines,
        opexLines,
      };
    });
  }, []);

  // Step 3: Revenue & COGS
  const setRevenuePattern = useCallback((pattern: RevenuePattern) => {
    setState((prev) => ({ ...prev, revenuePattern: pattern }));
  }, []);

  // Direct setters for restoring saved state
  const setRevenueLines = useCallback((lines: RevenueLine[]) => {
    setState((prev) => ({ ...prev, revenueLines: lines }));
  }, []);

  const setCOGSLines = useCallback((lines: COGSLine[]) => {
    setState((prev) => ({ ...prev, cogsLines: lines }));
  }, []);

  const updateRevenueLine = useCallback((lineId: string, updates: Partial<RevenueLine>) => {
    setState((prev) => ({
      ...prev,
      revenueLines: prev.revenueLines.map((line) =>
        line.id === lineId ? { ...line, ...updates } : line
      ),
    }));
  }, []);

  const addRevenueLine = useCallback((line: Omit<RevenueLine, 'id'>) => {
    setState((prev) => ({
      ...prev,
      revenueLines: [...prev.revenueLines, { ...line, id: generateId() }],
    }));
  }, []);

  const removeRevenueLine = useCallback((lineId: string) => {
    setState((prev) => ({
      ...prev,
      revenueLines: prev.revenueLines.filter((line) => line.id !== lineId),
    }));
  }, []);

  const updateCOGSLine = useCallback((lineId: string, updates: Partial<COGSLine>) => {
    setState((prev) => ({
      ...prev,
      cogsLines: prev.cogsLines.map((line) =>
        line.id === lineId ? { ...line, ...updates } : line
      ),
    }));
  }, []);

  const addCOGSLine = useCallback((line: Omit<COGSLine, 'id'>) => {
    setState((prev) => ({
      ...prev,
      cogsLines: [...prev.cogsLines, { ...line, id: generateId() }],
    }));
  }, []);

  const removeCOGSLine = useCallback((lineId: string) => {
    setState((prev) => ({
      ...prev,
      cogsLines: prev.cogsLines.filter((line) => line.id !== lineId),
    }));
  }, []);

  // Step 4: Team
  const updateTeamMember = useCallback((memberId: string, updates: Partial<TeamMember>) => {
    setState((prev) => ({
      ...prev,
      teamMembers: prev.teamMembers.map((member) => {
        if (member.id !== memberId) return member;
        const updated = { ...member, ...updates };
        // Recalculate derived fields
        if (updates.currentSalary !== undefined || updates.increasePct !== undefined) {
          updated.newSalary = calculateNewSalary(
            updated.currentSalary,
            updated.increasePct
          );
        }
        if (updates.type !== undefined || updates.currentSalary !== undefined || updates.increasePct !== undefined) {
          updated.superAmount = calculateSuper(updated.newSalary, updated.type);
        }
        return updated;
      }),
    }));
  }, []);

  const addTeamMember = useCallback(
    (member: Omit<TeamMember, 'id' | 'newSalary' | 'superAmount'>) => {
      const newSalary = calculateNewSalary(member.currentSalary, member.increasePct);
      const superAmount = calculateSuper(newSalary, member.type);
      setState((prev) => ({
        ...prev,
        teamMembers: [
          ...prev.teamMembers,
          { ...member, id: generateId(), newSalary, superAmount },
        ],
      }));
    },
    []
  );

  const removeTeamMember = useCallback((memberId: string) => {
    setState((prev) => ({
      ...prev,
      teamMembers: prev.teamMembers.filter((m) => m.id !== memberId),
      departures: prev.departures.filter((d) => d.teamMemberId !== memberId),
      bonuses: prev.bonuses.filter((b) => b.teamMemberId !== memberId),
      commissions: prev.commissions.filter((c) => c.teamMemberId !== memberId),
    }));
  }, []);

  const addNewHire = useCallback((hire: Omit<NewHire, 'id' | 'superAmount'>) => {
    const superAmount = calculateSuper(hire.salary, hire.type);
    setState((prev) => ({
      ...prev,
      newHires: [...prev.newHires, { ...hire, id: generateId(), superAmount }],
    }));
  }, []);

  const updateNewHire = useCallback((hireId: string, updates: Partial<NewHire>) => {
    setState((prev) => ({
      ...prev,
      newHires: prev.newHires.map((hire) => {
        if (hire.id !== hireId) return hire;
        const updated = { ...hire, ...updates };
        if (updates.salary !== undefined || updates.type !== undefined) {
          updated.superAmount = calculateSuper(updated.salary, updated.type);
        }
        return updated;
      }),
    }));
  }, []);

  const removeNewHire = useCallback((hireId: string) => {
    setState((prev) => ({
      ...prev,
      newHires: prev.newHires.filter((h) => h.id !== hireId),
    }));
  }, []);

  const addDeparture = useCallback((departure: Omit<Departure, 'id'>) => {
    setState((prev) => ({
      ...prev,
      departures: [...prev.departures, { ...departure, id: generateId() }],
    }));
  }, []);

  const removeDeparture = useCallback((departureId: string) => {
    setState((prev) => ({
      ...prev,
      departures: prev.departures.filter((d) => d.id !== departureId),
    }));
  }, []);

  const addBonus = useCallback((bonus: Omit<Bonus, 'id'>) => {
    setState((prev) => ({
      ...prev,
      bonuses: [...prev.bonuses, { ...bonus, id: generateId() }],
    }));
  }, []);

  const updateBonus = useCallback((bonusId: string, updates: Partial<Bonus>) => {
    setState((prev) => ({
      ...prev,
      bonuses: prev.bonuses.map((b) => (b.id === bonusId ? { ...b, ...updates } : b)),
    }));
  }, []);

  const removeBonus = useCallback((bonusId: string) => {
    setState((prev) => ({
      ...prev,
      bonuses: prev.bonuses.filter((b) => b.id !== bonusId),
    }));
  }, []);

  const addCommission = useCallback((commission: Omit<Commission, 'id'>) => {
    setState((prev) => ({
      ...prev,
      commissions: [...prev.commissions, { ...commission, id: generateId() }],
    }));
  }, []);

  const updateCommission = useCallback((commissionId: string, updates: Partial<Commission>) => {
    setState((prev) => ({
      ...prev,
      commissions: prev.commissions.map((c) =>
        c.id === commissionId ? { ...c, ...updates } : c
      ),
    }));
  }, []);

  const removeCommission = useCallback((commissionId: string) => {
    setState((prev) => ({
      ...prev,
      commissions: prev.commissions.filter((c) => c.id !== commissionId),
    }));
  }, []);

  // Step 5: OpEx
  const setDefaultOpExIncreasePct = useCallback((pct: number) => {
    setState((prev) => ({
      ...prev,
      defaultOpExIncreasePct: pct,
      // Apply to all fixed cost lines
      opexLines: prev.opexLines.map((line) =>
        line.costBehavior === 'fixed' ? { ...line, annualIncreasePct: pct } : line
      ),
    }));
  }, []);

  const setOpExLines = useCallback((lines: OpExLine[]) => {
    setState((prev) => ({
      ...prev,
      opexLines: lines,
    }));
  }, []);

  const updateOpExLine = useCallback((lineId: string, updates: Partial<OpExLine>) => {
    setState((prev) => ({
      ...prev,
      opexLines: prev.opexLines.map((line) =>
        line.id === lineId ? { ...line, ...updates } : line
      ),
    }));
  }, []);

  const addOpExLine = useCallback((line: Omit<OpExLine, 'id'>) => {
    setState((prev) => ({
      ...prev,
      opexLines: [...prev.opexLines, { ...line, id: generateId() }],
    }));
  }, []);

  const removeOpExLine = useCallback((lineId: string) => {
    setState((prev) => ({
      ...prev,
      opexLines: prev.opexLines.filter((line) => line.id !== lineId),
    }));
  }, []);

  // Step 6: CapEx & Investments
  const addCapExItem = useCallback((item: Omit<CapExItem, 'id' | 'annualDepreciation'>) => {
    const annualDepreciation = Math.round(item.cost / item.usefulLifeYears);
    setState((prev) => ({
      ...prev,
      capexItems: [...prev.capexItems, { ...item, id: generateId(), annualDepreciation }],
    }));
  }, []);

  const updateCapExItem = useCallback((itemId: string, updates: Partial<CapExItem>) => {
    setState((prev) => ({
      ...prev,
      capexItems: prev.capexItems.map((item) => {
        if (item.id !== itemId) return item;
        const updated = { ...item, ...updates };
        if (updates.cost !== undefined || updates.usefulLifeYears !== undefined) {
          updated.annualDepreciation = Math.round(updated.cost / updated.usefulLifeYears);
        }
        return updated;
      }),
    }));
  }, []);

  const removeCapExItem = useCallback((itemId: string) => {
    setState((prev) => ({
      ...prev,
      capexItems: prev.capexItems.filter((item) => item.id !== itemId),
    }));
  }, []);

  const addInvestment = useCallback((investment: Omit<Investment, 'id'>) => {
    setState((prev) => ({
      ...prev,
      investments: [...prev.investments, { ...investment, id: generateId() }],
    }));
  }, []);

  const updateInvestment = useCallback((investmentId: string, updates: Partial<Investment>) => {
    setState((prev) => ({
      ...prev,
      investments: prev.investments.map((inv) =>
        inv.id === investmentId ? { ...inv, ...updates } : inv
      ),
    }));
  }, []);

  const removeInvestment = useCallback((investmentId: string) => {
    setState((prev) => ({
      ...prev,
      investments: prev.investments.filter((inv) => inv.id !== investmentId),
    }));
  }, []);

  // Step 6: Planned Spending (new unified model)
  const addPlannedSpend = useCallback((item: Omit<PlannedSpend, 'id'>) => {
    const annualDepreciation = item.spendType === 'asset' && item.usefulLifeYears
      ? Math.round(item.amount / item.usefulLifeYears) : 0;
    setState(prev => ({
      ...prev,
      plannedSpends: [...(prev.plannedSpends || []), { ...item, id: generateId(), annualDepreciation }],
    }));
  }, []);

  const updatePlannedSpend = useCallback((id: string, updates: Partial<PlannedSpend>) => {
    setState(prev => ({
      ...prev,
      plannedSpends: (prev.plannedSpends || []).map(item => {
        if (item.id !== id) return item;
        const updated = { ...item, ...updates };
        if (updated.spendType === 'asset' && updated.usefulLifeYears) {
          updated.annualDepreciation = Math.round(updated.amount / updated.usefulLifeYears);
        }
        if (updated.paymentMethod === 'finance' && updated.financeRate && updated.financeTerm) {
          updated.financeMonthlyPayment = calculateLoanPayment(updated.amount, updated.financeRate, updated.financeTerm);
          updated.financeTotalInterest = calculateTotalInterest(updated.amount, updated.financeMonthlyPayment, updated.financeTerm);
        }
        return updated;
      }),
    }));
  }, []);

  const removePlannedSpend = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      plannedSpends: (prev.plannedSpends || []).filter(item => item.id !== id),
    }));
  }, []);

  // Step 7: Other Expenses
  const addOtherExpense = useCallback((expense: Omit<OtherExpense, 'id'>) => {
    setState((prev) => ({
      ...prev,
      otherExpenses: [...prev.otherExpenses, { ...expense, id: generateId() }],
    }));
  }, []);

  const updateOtherExpense = useCallback((expenseId: string, updates: Partial<OtherExpense>) => {
    setState((prev) => ({
      ...prev,
      otherExpenses: prev.otherExpenses.map((exp) =>
        exp.id === expenseId ? { ...exp, ...updates } : exp
      ),
    }));
  }, []);

  const removeOtherExpense = useCallback((expenseId: string) => {
    setState((prev) => ({
      ...prev,
      otherExpenses: prev.otherExpenses.filter((exp) => exp.id !== expenseId),
    }));
  }, []);

  // Initialize from Xero data
  const initializeFromXero = useCallback(
    (data: {
      priorYear: PriorYearData;
      team: TeamMember[];
      goals?: Goals;
      currentYTD?: {
        revenue_by_month: Record<string, number>;
        total_revenue: number;
        months_count: number;
      };
    }) => {
      setState((prev) => {
        const monthKeys = generateMonthKeys(prev.fiscalYearStart);
        const targetRevenue = data.goals?.year1?.revenue || 0;

        // Create revenue lines from prior year data
        // If no individual lines but we have a total, create a default line
        let revenueLines: RevenueLine[] = [];
        if (data.priorYear.revenue.byLine.length > 0) {
          revenueLines = data.priorYear.revenue.byLine.map((line) => ({
            id: line.id,
            name: line.name,
            year1Monthly: remapMonthKeysToForecastYear(line.byMonth, prev.fiscalYearStart),
            year2Monthly: {},
            year3Monthly: {},
          }));
        } else if (targetRevenue > 0 || data.priorYear.revenue.total > 0) {
          // Create a default Sales Revenue line
          const year1Monthly: { [key: string]: number } = {};

          // If we have YTD actuals, use them for completed months
          const ytdMonths = data.currentYTD?.revenue_by_month || {};
          const ytdTotal = data.currentYTD?.total_revenue || 0;
          const completedMonthsCount = data.currentYTD?.months_count || 0;

          // Calculate remaining revenue to hit target
          const remainingTarget = Math.max(0, targetRevenue - ytdTotal);
          const remainingMonths = 12 - completedMonthsCount;

          // Get seasonality pattern
          const seasonality = data.priorYear.seasonalityPattern || Array(12).fill(8.33);

          // Calculate total seasonality weight for all remaining (projected) months
          let totalRemainingSeasonality = 0;
          monthKeys.forEach((key, idx) => {
            if (ytdMonths[key] === undefined) {
              totalRemainingSeasonality += seasonality[idx] || 8.33;
            }
          });

          monthKeys.forEach((key, idx) => {
            // Check if this is a completed month (we have actual data)
            if (ytdMonths[key] !== undefined) {
              year1Monthly[key] = ytdMonths[key];
            } else if (totalRemainingSeasonality > 0 && remainingTarget > 0) {
              // Distribute remaining target proportionally using seasonality weights
              const monthSeasonality = seasonality[idx] || 8.33;
              const monthFactor = monthSeasonality / totalRemainingSeasonality;
              year1Monthly[key] = Math.round(remainingTarget * monthFactor);
            } else if (remainingMonths > 0 && remainingTarget > 0) {
              // Fallback: distribute evenly if no seasonality
              year1Monthly[key] = Math.round(remainingTarget / remainingMonths);
            } else {
              year1Monthly[key] = 0;
            }
          });

          revenueLines = [{
            id: generateId(),
            name: 'Sales Revenue',
            year1Monthly,
            year2Monthly: {},
            year3Monthly: {},
          }];
        }

        // Auto-populate Y2/Y3 monthly revenue from goals
        const goalsToUse = data.goals || prev.goals;
        if (revenueLines.length > 0) {
          let year1Total = 0;
          revenueLines.forEach(line => {
            year1Total += Object.values(line.year1Monthly).reduce((a, b) => a + b, 0);
          });

          const seasonality = data.priorYear?.seasonalityPattern || Array(12).fill(8.33);
          const totalSeasonality = seasonality.reduce((s: number, v: number) => s + v, 0);
          const distributeGoalRevenueMonthly = (goalRevenue: number, yearOffset: number, yearKey: 'year2Monthly' | 'year3Monthly') => {
            if (goalRevenue <= 0) return;
            const monthKeys = generateMonthKeys(prev.fiscalYearStart + yearOffset);
            revenueLines.forEach(line => {
              const lineY1 = Object.values(line.year1Monthly).reduce((a, b) => a + b, 0);
              const share = year1Total > 0 ? lineY1 / year1Total : 1 / revenueLines.length;
              const lineTarget = goalRevenue * share;
              const monthly: { [key: string]: number } = {};
              monthKeys.forEach((key, idx) => {
                const factor = (seasonality[idx] || 8.33) / totalSeasonality;
                monthly[key] = Math.round(lineTarget * factor);
              });
              line[yearKey] = monthly;
            });
          };

          if (goalsToUse.year2?.revenue) distributeGoalRevenueMonthly(goalsToUse.year2.revenue, 1, 'year2Monthly');
          if (goalsToUse.year3?.revenue) distributeGoalRevenueMonthly(goalsToUse.year3.revenue, 2, 'year3Monthly');
        }

        // Create COGS lines from prior year data - default to variable (% of revenue)
        let cogsLines: COGSLine[] = [];
        if (data.priorYear.cogs.byLine.length > 0) {
          cogsLines = data.priorYear.cogs.byLine.map((line) => ({
            id: line.id,
            name: line.name,
            accountId: line.id,
            priorYearTotal: line.total,
            costBehavior: 'variable' as const,
            percentOfRevenue: line.percentOfRevenue,
          }));
        } else if (data.priorYear.cogs.total > 0) {
          // Create a default Cost of Sales line
          cogsLines = [{
            id: generateId(),
            name: 'Cost of Sales',
            accountId: 'default-cogs',
            priorYearTotal: data.priorYear.cogs.total,
            costBehavior: 'variable' as const,
            percentOfRevenue: data.priorYear.cogs.percentOfRevenue || 0,
          }];
        }

        // Create OpEx lines from prior year data - default to fixed cost behavior
        const opexLines: OpExLine[] = data.priorYear.opex.byLine.map((line) => {
          const monthlyAvg = line.monthlyAvg || line.total / 12;
          return {
            id: line.id,
            name: line.name,
            accountId: line.id,
            priorYearAnnual: line.total,
            costBehavior: 'fixed' as const, // Default - user can change to variable or adhoc
            monthlyAmount: Math.round(monthlyAvg),
            annualIncreasePct: prev.defaultOpExIncreasePct,
          };
        });

        // Update team members with calculated fields
        const teamMembers = data.team.map((member) => ({
          ...member,
          newSalary: calculateNewSalary(member.currentSalary, member.increasePct || 0),
          superAmount: calculateSuper(
            calculateNewSalary(member.currentSalary, member.increasePct || 0),
            member.type
          ),
        }));

        return {
          ...prev,
          priorYear: data.priorYear,
          currentYTD: data.currentYTD || null,
          goals: data.goals || prev.goals,
          revenueLines,
          cogsLines,
          opexLines,
          teamMembers,
        };
      });
    },
    []
  );

  // Calculate summary for all 3 years (needed before buildAssumptions)
  const summary = useMemo((): ForecastSummary => {
    const calculateYearSummary = (yearNum: 1 | 2 | 3) => {
      // Revenue — uses getRevenueLineYearTotal which handles both monthly and legacy quarterly
      let revenue = state.revenueLines.reduce((sum, line) => {
        return sum + getRevenueLineYearTotal(line, yearNum);
      }, 0);

      // Goals fallback: if no revenue lines are filled in yet, use goals
      if (revenue === 0) {
        const yearGoals = yearNum === 1 ? state.goals.year1 : yearNum === 2 ? state.goals.year2 : state.goals.year3;
        if (yearGoals && yearGoals.revenue > 0) {
          revenue = yearGoals.revenue;
        }
      }

      // COGS - use per-month data if available, otherwise calculate from formula
      const cogs = state.cogsLines.reduce((sum, line) => {
        const monthly = yearNum === 1 ? line.year1Monthly
          : yearNum === 2 ? line.year2Monthly
          : line.year3Monthly;
        if (monthly && Object.keys(monthly).length > 0) {
          return sum + Object.values(monthly).reduce((a, b) => a + b, 0);
        }
        // Fallback to formula — apply Y2/Y3 trend adjustment
        const trendAdj = yearNum === 1 ? 0
          : line.y2y3Trend === 'improves' ? -2
          : line.y2y3Trend === 'increases' ? 2
          : 0;
        if (line.costBehavior === 'fixed') {
          const baseMonthly = (line.monthlyAmount || 0) * (1 + trendAdj / 100);
          return sum + baseMonthly * 12;
        }
        const adjustedPct = (line.percentOfRevenue || 0) + trendAdj;
        return sum + (revenue * adjustedPct) / 100;
      }, 0);

      // Gross Profit
      const grossProfit = revenue - cogs;
      const grossProfitPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

      // Team Costs - Properly calculated for each year
      const fiscalYearStart = state.fiscalYearStart; // e.g., 2025 for FY2026
      const targetFY = fiscalYearStart + yearNum; // FY2026, FY2027, FY2028

      const ysm = DEFAULT_YEAR_START_MONTH;

      // Helper to get fiscal year from month key (YYYY-MM)
      const getFYFromMonth = (monthKey: string): number => {
        const [yearStr, monthStr] = monthKey.split('-');
        const date = new Date(parseInt(yearStr), parseInt(monthStr) - 1, 1);
        return getFiscalYear(date, ysm);
      };

      // Helper to get months worked in a fiscal year
      const getMonthsInFY = (startMonth: string, fy: number): number => {
        const startFY = getFYFromMonth(startMonth);
        if (startFY > fy) return 0;
        if (startFY < fy) return 12;
        const month = parseInt(startMonth.split('-')[1]);
        const fyMonth = getFiscalMonthIndex(month, ysm) + 1; // 1-based fiscal month
        return 13 - fyMonth;
      };

      // Helper to check if departed before end of fiscal year
      const getDepartureMonthsInFY = (endMonth: string, fy: number): number => {
        const endFY = getFYFromMonth(endMonth);
        if (endFY > fy) return 12;
        if (endFY < fy) return 0;
        const month = parseInt(endMonth.split('-')[1]);
        const fyMonth = getFiscalMonthIndex(month, ysm) + 1;
        return fyMonth;
      };

      let teamCosts = 0;

      // Existing team members
      for (const member of state.teamMembers) {
        // Check for departure
        const departure = state.departures.find(d => d.teamMemberId === member.id);

        // Calculate salary with increases applied for this year
        // Y1: newSalary (already has Y1 increase applied)
        // Y2: newSalary * (1 + increasePct/100)
        // Y3: newSalary * (1 + increasePct/100)^2
        const yearsOfIncrease = yearNum - 1;
        const salary = member.newSalary * Math.pow(1 + (member.increasePct || 0) / 100, yearsOfIncrease);
        const superAmount = member.type !== 'contractor' ? salary * SUPER_RATE : 0;

        let monthsWorked = 12;
        if (departure) {
          monthsWorked = getDepartureMonthsInFY(departure.endMonth, targetFY);
        }

        const proRataSalary = (salary * monthsWorked) / 12;
        const proRataSuper = (superAmount * monthsWorked) / 12;
        teamCosts += proRataSalary + proRataSuper;
      }

      // New hires
      for (const hire of state.newHires) {
        const hireFY = getFYFromMonth(hire.startMonth);

        // Skip if hire starts after this year
        if (hireFY > targetFY) continue;

        // Calculate salary with increases for subsequent years
        const yearsAfterStart = targetFY - hireFY;
        const hireIncreasePct = 3 / 100; // Standard 3% annual salary increase
        const salary = hire.salary * Math.pow(1 + hireIncreasePct, yearsAfterStart);
        const superAmount = hire.type !== 'contractor' ? salary * SUPER_RATE : 0;

        const monthsWorked = getMonthsInFY(hire.startMonth, targetFY);
        const proRataSalary = (salary * monthsWorked) / 12;
        const proRataSuper = (superAmount * monthsWorked) / 12;
        teamCosts += proRataSalary + proRataSuper;
      }

      // Bonuses (assume same each year for now)
      const bonusTotal = state.bonuses.reduce((sum, b) => sum + b.amount, 0);
      teamCosts += bonusTotal;

      // Commissions - based on percentage of linked revenue line
      for (const commission of state.commissions) {
        const revLine = state.revenueLines.find(r => r.id === commission.revenueLineId);
        if (!revLine) continue;
        const lineRevenue = getRevenueLineYearTotal(revLine, yearNum);
        teamCosts += lineRevenue * (commission.percentOfRevenue / 100);
      }

      // OpEx - handle all cost behaviors including seasonal
      const defaultIncrease = state.defaultOpExIncreasePct || 3;
      const opex = state.opexLines.reduce((sum, line) => {
        // Skip one-time expenses that don't belong to this year
        if (line.isOneTime && line.oneTimeYear && line.oneTimeYear !== yearNum) return sum;
        // Skip expenses that haven't started yet
        if (line.startYear && line.startYear > yearNum) return sum;
        if (line.isTeamCostOverride !== undefined ? line.isTeamCostOverride : isTeamCost(line.name)) return sum;

        let lineAmount = 0;
        switch (line.costBehavior) {
          case 'fixed': {
            // Monthly amount × 12, with annual increase applied
            const baseAmount = (line.monthlyAmount || 0) * 12;
            const increaseFactor = 1 + (line.annualIncreasePct || defaultIncrease) / 100;
            lineAmount = baseAmount * Math.pow(increaseFactor, yearNum - 1);
            break;
          }
          case 'variable':
            // Percentage of revenue
            lineAmount = revenue * ((line.percentOfRevenue || 0) / 100);
            break;
          case 'adhoc':
            // Expected annual amount (same each year)
            lineAmount = line.expectedAnnualAmount || 0;
            break;
          case 'seasonal': {
            // Use prior year pattern with growth applied
            const priorTotal = line.priorYearAnnual || 0;
            if (line.seasonalTargetAmount && yearNum === 1) {
              lineAmount = line.seasonalTargetAmount;
            } else {
              const growthPct = line.seasonalGrowthPct ?? defaultIncrease;
              lineAmount = priorTotal * Math.pow(1 + growthPct / 100, yearNum);
            }
            break;
          }
          default:
            // Unclassified - use prior year with default increase
            lineAmount = (line.priorYearAnnual || 0) * Math.pow(1 + defaultIncrease / 100, yearNum - 1);
        }
        return sum + lineAmount;
      }, 0);

      // Depreciation - pro-rate by purchase month in Year 1
      const depreciation = state.capexItems.reduce((sum, item) => {
        if (yearNum === 1) {
          const monthsRemaining = 13 - item.month;
          return sum + (item.annualDepreciation * monthsRemaining) / 12;
        }
        return sum + item.annualDepreciation;
      }, 0);

      // Other Expenses - one-off expenses only count in Y1
      const otherExpenses = state.otherExpenses.reduce((sum, exp) => {
        if (exp.frequency === 'once') return yearNum === 1 ? sum + exp.amount : sum;
        if (exp.frequency === 'monthly') return sum + exp.amount * 12;
        if (exp.frequency === 'quarterly') return sum + exp.amount * 4;
        if (exp.frequency === 'annual') return sum + exp.amount;
        return sum + exp.amount;
      }, 0);

      // Investment costs (one-time strategic spends, Year 1 only)
      const investments = yearNum === 1
        ? state.investments.reduce((sum, inv) => sum + inv.totalBudget, 0)
        : 0;

      // Planned Spending — new unified model (overrides legacy capex/investments if present)
      let plannedSpendDepreciation = 0;
      let plannedSpendExpenses = 0;
      if (state.plannedSpends && state.plannedSpends.length > 0) {
        for (const item of state.plannedSpends) {
          if (item.spendType === 'asset' && item.paymentMethod !== 'lease') {
            plannedSpendDepreciation += item.usefulLifeYears
              ? Math.round((item.amount / item.usefulLifeYears) * (yearNum === 1 ? (13 - item.month) / 12 : 1))
              : 0;
          }
          // Interest expense for financed items
          if (item.paymentMethod === 'finance' && item.financeTotalInterest && item.financeTerm) {
            plannedSpendExpenses += Math.round(item.financeTotalInterest / (item.financeTerm / 12));
          }
          // Lease payments go to expenses
          if (item.paymentMethod === 'lease' && item.leaseMonthlyPayment) {
            plannedSpendExpenses += item.leaseMonthlyPayment * 12;
          }
          // One-off expenses only in Year 1
          if (item.spendType === 'one-off' && yearNum === 1) {
            plannedSpendExpenses += item.amount;
          }
          // Monthly recurring expenses
          if (item.spendType === 'monthly') {
            plannedSpendExpenses += item.amount * 12;
          }
        }
      }

      // Use planned spends if available, otherwise fall back to legacy
      const finalDepreciation = state.plannedSpends?.length > 0 ? plannedSpendDepreciation : depreciation;
      const finalInvestments = state.plannedSpends?.length > 0 ? plannedSpendExpenses : investments;

      // Net Profit
      const netProfit = grossProfit - teamCosts - opex - finalDepreciation - otherExpenses - finalInvestments;
      const netProfitPct = revenue > 0 ? (netProfit / revenue) * 100 : 0;

      return {
        revenue: Math.round(revenue),
        cogs: Math.round(cogs),
        grossProfit: Math.round(grossProfit),
        grossProfitPct: Math.round(grossProfitPct * 10) / 10,
        teamCosts: Math.round(teamCosts),
        opex: Math.round(opex),
        depreciation: Math.round(finalDepreciation),
        investments: Math.round(finalInvestments),
        otherExpenses: Math.round(otherExpenses),
        netProfit: Math.round(netProfit),
        netProfitPct: Math.round(netProfitPct * 10) / 10,
      };
    };

    const result: ForecastSummary = {
      year1: calculateYearSummary(1),
    };

    // Only include year2/year3 if forecast duration includes them
    if (state.forecastDuration >= 2) {
      result.year2 = calculateYearSummary(2);
    }
    if (state.forecastDuration >= 3) {
      result.year3 = calculateYearSummary(3);
    }

    return result;
  }, [state]);

  /**
   * Build assumptions from current wizard state
   */
  const buildAssumptions = useCallback((): ForecastAssumptions => {
    const now = new Date().toISOString();

    // Build revenue assumptions - include actual forecasted values for restoration
    const revenueLines: RevenueLineAssumption[] = state.revenueLines.map(line => {
      const year1Total = Object.values(line.year1Monthly).reduce((a, b) => a + b, 0);
      const priorYearTotal = state.priorYear?.revenue.byLine.find(l => l.id === line.id)?.total || year1Total;
      const growthPct = priorYearTotal > 0 ? ((year1Total - priorYearTotal) / priorYearTotal) * 100 : 0;

      return {
        accountId: line.id,
        accountName: line.name,
        priorYearTotal,
        growthType: 'percentage' as const,
        growthPct: Math.round(growthPct * 10) / 10,
        // Store actual forecasted values for restoration
        year1Monthly: line.year1Monthly,
        year2Monthly: line.year2Monthly,
        year3Monthly: line.year3Monthly,
        // Legacy compat
        year2Quarterly: monthlyToQuarterly(line.year2Monthly),
        year3Quarterly: monthlyToQuarterly(line.year3Monthly),
      };
    });

    // Build COGS assumptions
    const cogsLines: COGSLineAssumption[] = state.cogsLines.map(line => ({
      accountId: line.accountId || line.id,
      accountName: line.name,
      priorYearTotal: line.priorYearTotal || 0,
      costBehavior: line.costBehavior,
      percentOfRevenue: line.costBehavior === 'variable' ? line.percentOfRevenue : undefined,
      monthlyAmount: line.costBehavior === 'fixed' ? line.monthlyAmount : undefined,
      notes: line.notes,
    }));

    // Build team assumptions
    const existingTeam: ExistingTeamMember[] = state.teamMembers.map(member => ({
      employeeId: member.id,
      name: member.name,
      role: member.role,
      employmentType: member.type,
      currentSalary: member.currentSalary,
      hoursPerWeek: member.hoursPerWeek,
      salaryIncreasePct: member.increasePct,
      includeInForecast: true,
      isFromXero: member.isFromXero,
    }));

    const plannedHires: PlannedHire[] = state.newHires.map(hire => ({
      id: hire.id,
      role: hire.role,
      employmentType: hire.type,
      salary: hire.salary,
      hoursPerWeek: hire.hoursPerWeek,
      hourlyRate: hire.hourlyRate,
      weeksPerYear: hire.weeksPerYear,
      startMonth: hire.startMonth,
    }));

    // Build OpEx assumptions — filter out team cost lines to prevent double-counting
    // (team wages are generated separately by convertTeam())
    const opexLineAssumptions: OpExLineAssumption[] = state.opexLines
      .filter(line => !(line.isTeamCostOverride !== undefined ? line.isTeamCostOverride : isTeamCost(line.name)))
      .map(line => ({
      accountId: line.accountId || line.id,
      accountName: line.name,
      priorYearTotal: line.priorYearAnnual,
      costBehavior: line.costBehavior,
      monthlyAmount: line.costBehavior === 'fixed' ? line.monthlyAmount : undefined,
      annualIncreasePct: line.costBehavior === 'fixed' ? line.annualIncreasePct : undefined,
      percentOfRevenue: line.costBehavior === 'variable' ? line.percentOfRevenue : undefined,
      seasonalGrowthPct: line.costBehavior === 'seasonal' ? line.seasonalGrowthPct : undefined,
      seasonalTargetAmount: line.costBehavior === 'seasonal' ? line.seasonalTargetAmount : undefined,
      expectedAnnualAmount: line.costBehavior === 'adhoc' ? line.expectedAnnualAmount : undefined,
      expectedMonths: line.costBehavior === 'adhoc' ? line.expectedMonths : undefined,
      isSubscription: line.isSubscription,
      notes: line.notes,
    }));

    // Build CapEx assumptions
    const capexItems: CapExAssumptionItem[] = state.capexItems.map(item => {
      // Convert month number to month key
      const monthKeys = generateMonthKeys(state.fiscalYearStart + 1);
      const monthKey = monthKeys[item.month - 1] || monthKeys[0];

      return {
        id: item.id,
        name: item.description,
        amount: item.cost,
        month: monthKey,
        category: 'equipment' as const, // Could be enhanced with actual category
      };
    });

    return {
      version: 1,
      createdAt: now,
      updatedAt: now,
      industry: state.businessProfile?.industry,
      employeeCount: state.businessProfile?.employeeCount,
      fiscalYearStart: '07',
      // Save goals from Step 1 for restoration
      goals: {
        year1: state.goals.year1,
        year2: state.goals.year2,
        year3: state.goals.year3,
      },
      revenue: {
        lines: revenueLines,
        seasonalityPattern: state.priorYear?.seasonalityPattern || Array(12).fill(8.33),
        seasonalitySource: state.priorYear ? 'xero' : 'industry_default',
      },
      cogs: {
        lines: cogsLines,
      },
      team: {
        existingTeam,
        plannedHires,
        departures: state.departures.map(d => ({
          id: d.id,
          teamMemberId: d.teamMemberId,
          endMonth: d.endMonth,
        })),
        bonuses: state.bonuses.map(b => ({
          id: b.id,
          teamMemberId: b.teamMemberId,
          amount: b.amount,
          month: b.month,
        })),
        commissions: state.commissions.map(c => ({
          id: c.id,
          teamMemberId: c.teamMemberId,
          revenueLineId: c.revenueLineId,
          percentOfRevenue: c.percentOfRevenue,
          timing: c.timing,
        })),
        superannuationPct: SUPER_RATE * 100,
        workCoverPct: 1.5,
        payrollTaxPct: 4.85,
        payrollTaxThreshold: 1200000,
      },
      opex: {
        lines: opexLineAssumptions,
      },
      capex: {
        items: capexItems,
      },
      plannedSpends: state.plannedSpends,
    };
  }, [state]);

  // Save draft - returns forecast ID
  // Accepts optional forecastId and forecastName for updating existing forecasts
  // Set createNew=true to force creation of a new forecast (for "Save As" feature)
  const saveDraft = useCallback(async (forecastId?: string | null, forecastName?: string, createNew?: boolean): Promise<string | null> => {
    const assumptions = buildAssumptions();

    try {
      const response = await fetch('/api/forecast-wizard-v4/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: state.businessId,
          fiscalYear: state.fiscalYearStart + 1,
          forecastDuration: state.forecastDuration,
          forecastId: forecastId || undefined,
          forecastName: forecastName || undefined,
          createNew: createNew || false,
          isDraft: true, // Don't mark complete during autosave (avoids broken trigger)
          assumptions,
          summary: {
            year1: summary.year1,
            year2: summary.year2,
            year3: summary.year3,
          },
        }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        console.error('[saveDraft] Server error:', response.status, errBody);
        throw new Error(`Failed to save draft: ${errBody?.details || errBody?.error || response.status}`);
      }

      const result = await response.json();
      return result.forecastId || result.forecast_id || null;
    } catch (error) {
      console.error('Error saving draft:', error);
      throw error;
    }
  }, [state, buildAssumptions, summary]);

  // Generate forecast
  // Accepts optional forecastId and forecastName for updating existing forecasts
  const generateForecast = useCallback(async (forecastId?: string | null, forecastName?: string): Promise<string> => {
    const assumptions = buildAssumptions();

    try {
      const response = await fetch('/api/forecast-wizard-v4/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: state.businessId,
          fiscalYear: state.fiscalYearStart + 1,
          forecastDuration: state.forecastDuration,
          forecastId: forecastId || undefined,
          forecastName: forecastName || undefined,
          assumptions,
          summary: {
            year1: summary.year1,
            year2: summary.year2,
            year3: summary.year3,
          },
        }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        console.error('[generateForecast] Server error:', response.status, errBody);
        throw new Error(`Failed to generate forecast: ${errBody?.details || errBody?.error || response.status}`);
      }

      const result = await response.json();

      return result.forecastId;
    } catch (error) {
      console.error('Error generating forecast:', error);
      throw error;
    }
  }, [state, buildAssumptions, summary]);

  const actions: WizardActions = {
    goToStep,
    nextStep,
    prevStep,
    setActiveYear,
    setBusinessProfile,
    setForecastDuration,
    updateGoals,
    setPriorYear,
    setRevenuePattern,
    setRevenueLines,
    setCOGSLines,
    updateRevenueLine,
    addRevenueLine,
    removeRevenueLine,
    updateCOGSLine,
    addCOGSLine,
    removeCOGSLine,
    updateTeamMember,
    addTeamMember,
    removeTeamMember,
    addNewHire,
    updateNewHire,
    removeNewHire,
    addDeparture,
    removeDeparture,
    addBonus,
    updateBonus,
    removeBonus,
    addCommission,
    updateCommission,
    removeCommission,
    setDefaultOpExIncreasePct,
    setOpExLines,
    updateOpExLine,
    addOpExLine,
    removeOpExLine,
    addCapExItem,
    updateCapExItem,
    removeCapExItem,
    addInvestment,
    updateInvestment,
    removeInvestment,
    addPlannedSpend,
    updatePlannedSpend,
    removePlannedSpend,
    addOtherExpense,
    updateOtherExpense,
    removeOtherExpense,
    initializeFromXero,
    saveDraft,
    generateForecast,
  };

  return {
    state,
    actions,
    summary,
    wasRestoredFromStorage,
    clearLocalStorage,
  };
}

export type UseForecastWizardReturn = ReturnType<typeof useForecastWizard>;
