// Forecast Wizard V4 Types
// Based on the 8-step CFO methodology with scenario planning support

export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8; // 8 = Final Review
export type ForecastDuration = 1 | 2 | 3; // 1yr, 2yr, or 3yr forecast

export type EmploymentType = 'full-time' | 'part-time' | 'casual' | 'contractor';
export type ContractorType = 'onshore' | 'offshore';
export type RevenuePattern = 'seasonal' | 'straight-line' | 'manual';
export type ExpenseFrequency = 'once' | 'monthly' | 'quarterly' | 'annual';
export type CostBehavior = 'fixed' | 'variable' | 'adhoc' | 'seasonal';

// Business profile data from business_profiles table
export interface BusinessProfile {
  industry?: string;
  employeeCount?: number;
  annualRevenue?: number;
  businessModel?: string;
  profileCompleted?: boolean;
}

export interface YearlyGoals {
  revenue: number;
  grossProfitPct: number;
  netProfitPct: number;
  headcountTarget?: number; // Target headcount from business plan
}

export interface Goals {
  year1: YearlyGoals;
  year2?: YearlyGoals; // Optional for 1yr forecasts
  year3?: YearlyGoals; // Optional for 1yr and 2yr forecasts
}

export interface MonthlyData {
  [monthKey: string]: number; // e.g., "2025-07": 50000
}

export interface QuarterlyData {
  q1: number;
  q2: number;
  q3: number;
  q4: number;
}

export interface RevenueLine {
  id: string;
  name: string;
  year1Monthly: MonthlyData;
  year2Quarterly: QuarterlyData;
  year3Quarterly: QuarterlyData;
}

export interface COGSLine {
  id: string;
  name: string;
  accountId?: string;
  priorYearTotal?: number;
  costBehavior: 'variable' | 'fixed';
  // For variable (most common for COGS):
  percentOfRevenue?: number;
  // For fixed (rare for COGS):
  monthlyAmount?: number;
  linkedRevenueLineId?: string;
  notes?: string;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  type: EmploymentType;
  contractorType?: ContractorType; // For contractors - onshore or offshore
  hoursPerWeek: number; // 38 for full-time, variable for part-time/casual
  hourlyRate?: number; // For casuals and contractors
  weeksPerYear?: number; // For casuals (default 48)
  currentSalary: number; // Annual salary (calculated for casuals from hourly × hours × weeks)
  increasePct: number;
  newSalary: number;
  superAmount: number;
  isFromXero: boolean;
  includeInHeadcount?: boolean; // For contractors - whether to include in headcount calculations
}

export interface NewHire {
  id: string;
  role: string;
  type: EmploymentType;
  contractorType?: ContractorType; // For contractors - onshore or offshore
  hoursPerWeek: number; // 38 for full-time, variable for part-time/casual
  hourlyRate?: number; // For casuals and contractors
  weeksPerYear?: number; // For casuals (default 48)
  startMonth: string; // YYYY-MM
  salary: number; // Annual salary (calculated for casuals from hourly × hours × weeks)
  superAmount: number;
  includeInHeadcount?: boolean; // For contractors - whether to include in headcount calculations
}

export interface Departure {
  id: string;
  teamMemberId: string;
  endMonth: string; // YYYY-MM
}

export interface Bonus {
  id: string;
  teamMemberId: string;
  amount: number;
  month: number; // 1-12
}

export interface Commission {
  id: string;
  teamMemberId: string;
  percentOfRevenue: number;
  revenueLineId: string;
  timing: 'monthly' | 'quarterly' | 'annual';
}

export type InputMode = 'monthly' | 'annual';

export interface OpExLine {
  id: string;
  name: string;
  accountId?: string;
  priorYearAnnual: number;
  priorYearMonthly?: MonthlyData; // Monthly breakdown from prior year for seasonal pattern
  costBehavior: CostBehavior; // 'fixed' | 'variable' | 'adhoc' | 'seasonal'
  inputMode?: InputMode; // Whether user is entering monthly or annual amounts (default: monthly for fixed, annual for others)
  // For fixed costs:
  monthlyAmount?: number;
  annualIncreasePct?: number; // Annual increase percentage (e.g., 3% for inflation)
  // For variable costs:
  percentOfRevenue?: number;
  // For ad-hoc costs:
  expectedAnnualAmount?: number;
  expectedMonths?: string[]; // Which months to spread across (e.g., ['2026-03', '2026-09'])
  // For seasonal costs:
  seasonalGrowthPct?: number; // Annual growth % to apply to the seasonal pattern
  seasonalTargetAmount?: number; // Target annual amount (alternative to growth %)
  // Multi-year planning:
  startYear?: 1 | 2 | 3; // Which year this expense starts (default: 1)
  isOneTime?: boolean; // If true, only occurs in oneTimeYear
  oneTimeYear?: 1 | 2 | 3; // Which year the one-time expense occurs
  // Subscription flag (for linking to subscription audit)
  isSubscription?: boolean;
  notes?: string;
  // Year 2/3 manual overrides (when user wants to override the auto-calculated value)
  y2Override?: number; // Manual override for Year 2 annual amount
  y3Override?: number; // Manual override for Year 3 annual amount
  // Year 2/3 percent overrides (for variable costs - override the % of revenue)
  y2PercentOverride?: number; // Override % of revenue for Year 2
  y3PercentOverride?: number; // Override % of revenue for Year 3
}

export interface CapExItem {
  id: string;
  description: string;
  cost: number;
  month: number; // 1-12
  usefulLifeYears: number;
  annualDepreciation: number;
}

export interface Investment {
  id: string;
  initiativeId?: string;
  description: string;
  totalBudget: number;
  monthlyDistribution: number[]; // 12 values
}

export interface OtherExpense {
  id: string;
  description: string;
  amount: number;
  frequency: ExpenseFrequency;
  startMonth: number; // 1-12
  endMonth?: number;
  notes?: string;
}

export interface PriorYearData {
  revenue: {
    total: number;
    byMonth: MonthlyData;
    byLine: { id: string; name: string; total: number; byMonth: MonthlyData }[];
  };
  cogs: {
    total: number;
    percentOfRevenue: number;
    byMonth: MonthlyData;
    byLine: { id: string; name: string; total: number; percentOfRevenue: number }[];
  };
  grossProfit: {
    total: number;
    percent: number;
    byMonth: MonthlyData;
  };
  opex: {
    total: number;
    byMonth: MonthlyData;
    byLine: { id: string; name: string; total: number; monthlyAvg: number; isOneOff: boolean; oneOffMonth?: number }[];
  };
  seasonalityPattern: number[]; // 12 percentages that sum to 100
}

export interface ForecastWizardState {
  // Metadata
  businessId: string;
  fiscalYearStart: number;
  status: 'draft' | 'active' | 'archived';

  // Forecast duration (1yr, 2yr, or 3yr) - set in Step 1, locked after
  forecastDuration: ForecastDuration;
  durationLocked: boolean; // Becomes true after leaving Step 1

  // Current wizard state
  currentStep: WizardStep;
  activeYear: 1 | 2 | 3;

  // Business profile (from business_profiles table)
  businessProfile: BusinessProfile | null;

  // Step 1: Goals
  goals: Goals;

  // Step 2: Prior Year (from Xero/CSV)
  priorYear: PriorYearData | null;

  // Current YTD data (actuals for completed months)
  currentYTD: {
    revenue_by_month: Record<string, number>;
    total_revenue: number;
    months_count: number;
  } | null;

  // Step 3: Revenue & COGS
  revenuePattern: RevenuePattern;
  revenueLines: RevenueLine[];
  cogsLines: COGSLine[];

  // Step 4: Team
  teamMembers: TeamMember[];
  newHires: NewHire[];
  departures: Departure[];
  bonuses: Bonus[];
  commissions: Commission[];

  // Step 5: OpEx
  defaultOpExIncreasePct: number;
  opexLines: OpExLine[];

  // Step 6: CapEx & Investments
  capexItems: CapExItem[];
  investments: Investment[];

  // Step 7: Other Expenses
  otherExpenses: OtherExpense[];
}

export interface WizardActions {
  // Navigation
  goToStep: (step: WizardStep) => void;
  nextStep: () => void;
  prevStep: () => void;
  setActiveYear: (year: 1 | 2 | 3) => void;

  // Business Profile
  setBusinessProfile: (profile: BusinessProfile | null) => void;

  // Step 1: Duration & Goals
  setForecastDuration: (duration: ForecastDuration) => void;
  updateGoals: (goals: Goals) => void;

  // Step 2: Prior Year
  setPriorYear: (data: PriorYearData) => void;

  // Step 3: Revenue & COGS
  setRevenuePattern: (pattern: RevenuePattern) => void;
  setRevenueLines: (lines: RevenueLine[]) => void;
  setCOGSLines: (lines: COGSLine[]) => void;
  updateRevenueLine: (lineId: string, updates: Partial<RevenueLine>) => void;
  addRevenueLine: (line: Omit<RevenueLine, 'id'>) => void;
  removeRevenueLine: (lineId: string) => void;
  updateCOGSLine: (lineId: string, updates: Partial<COGSLine>) => void;
  addCOGSLine: (line: Omit<COGSLine, 'id'>) => void;
  removeCOGSLine: (lineId: string) => void;

  // Step 4: Team
  updateTeamMember: (memberId: string, updates: Partial<TeamMember>) => void;
  addTeamMember: (member: Omit<TeamMember, 'id' | 'newSalary' | 'superAmount'>) => void;
  removeTeamMember: (memberId: string) => void;
  addNewHire: (hire: Omit<NewHire, 'id' | 'superAmount'>) => void;
  updateNewHire: (hireId: string, updates: Partial<NewHire>) => void;
  removeNewHire: (hireId: string) => void;
  addDeparture: (departure: Omit<Departure, 'id'>) => void;
  removeDeparture: (departureId: string) => void;
  addBonus: (bonus: Omit<Bonus, 'id'>) => void;
  updateBonus: (bonusId: string, updates: Partial<Bonus>) => void;
  removeBonus: (bonusId: string) => void;
  addCommission: (commission: Omit<Commission, 'id'>) => void;
  updateCommission: (commissionId: string, updates: Partial<Commission>) => void;
  removeCommission: (commissionId: string) => void;

  // Step 5: OpEx
  setDefaultOpExIncreasePct: (pct: number) => void;
  setOpExLines: (lines: OpExLine[]) => void;
  updateOpExLine: (lineId: string, updates: Partial<OpExLine>) => void;
  addOpExLine: (line: Omit<OpExLine, 'id'>) => void;
  removeOpExLine: (lineId: string) => void;

  // Step 6: CapEx & Investments
  addCapExItem: (item: Omit<CapExItem, 'id' | 'annualDepreciation'>) => void;
  updateCapExItem: (itemId: string, updates: Partial<CapExItem>) => void;
  removeCapExItem: (itemId: string) => void;
  addInvestment: (investment: Omit<Investment, 'id'>) => void;
  updateInvestment: (investmentId: string, updates: Partial<Investment>) => void;
  removeInvestment: (investmentId: string) => void;

  // Step 7: Other Expenses
  addOtherExpense: (expense: Omit<OtherExpense, 'id'>) => void;
  updateOtherExpense: (expenseId: string, updates: Partial<OtherExpense>) => void;
  removeOtherExpense: (expenseId: string) => void;

  // Initialize from external data
  initializeFromXero: (data: {
    priorYear: PriorYearData;
    team: TeamMember[];
    goals?: Goals;
    currentYTD?: {
      revenue_by_month: Record<string, number>;
      total_revenue: number;
      months_count: number;
    };
  }) => void;

  // Save/Load
  // forecastId: optional ID of existing forecast to update
  // forecastName: optional custom name for the forecast
  // createNew: if true, always create a new forecast (for "Save As" feature)
  saveDraft: (forecastId?: string | null, forecastName?: string, createNew?: boolean) => Promise<string | null>;
  generateForecast: (forecastId?: string | null, forecastName?: string) => Promise<string>;
}

export interface YearlySummary {
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossProfitPct: number;
  teamCosts: number;
  opex: number;
  depreciation: number;
  otherExpenses: number;
  netProfit: number;
  netProfitPct: number;
}

export interface ForecastSummary {
  year1: YearlySummary;
  year2?: YearlySummary; // Optional for 1yr forecasts
  year3?: YearlySummary; // Optional for 1yr and 2yr forecasts
}

// Step configuration for the step bar
export const WIZARD_STEPS = [
  { step: 1, label: 'Goals', shortLabel: '1' },
  { step: 2, label: 'Prior Year', shortLabel: '2' },
  { step: 3, label: 'Revenue & COGS', shortLabel: '3' },
  { step: 4, label: 'Team', shortLabel: '4' },
  { step: 5, label: 'OpEx', shortLabel: '5' },
  { step: 6, label: 'Subscriptions', shortLabel: '6' },
  { step: 7, label: 'CapEx', shortLabel: '7' },
  { step: 8, label: 'Review', shortLabel: '8' },
] as const;

// Superannuation rate (12% as of 1 July 2025)
export const SUPER_RATE = 0.12;

// Helper to calculate super
export function calculateSuper(salary: number, type: EmploymentType): number {
  if (type === 'contractor') return 0;
  return Math.round(salary * SUPER_RATE);
}

// Helper to calculate new salary with increase
export function calculateNewSalary(currentSalary: number, increasePct: number): number {
  return Math.round(currentSalary * (1 + increasePct / 100));
}

// Helper to generate month keys for a fiscal year
export function generateMonthKeys(fiscalYearStart: number): string[] {
  const months: string[] = [];
  for (let i = 0; i < 12; i++) {
    const month = ((6 + i) % 12) + 1; // Start from July (7)
    const year = month >= 7 ? fiscalYearStart : fiscalYearStart + 1;
    months.push(`${year}-${String(month).padStart(2, '0')}`);
  }
  return months;
}

// Helper to format currency
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// Helper to format percentage
export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}
