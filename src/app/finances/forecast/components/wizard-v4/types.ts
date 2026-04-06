// Forecast Wizard V4 Types
// Based on the 8-step CFO methodology with scenario planning support

export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9; // 8 = Growth Plan, 9 = Final Review
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
  year2Monthly?: MonthlyData;     // Monthly data for Y2 (new — replaces quarterly)
  year3Monthly?: MonthlyData;     // Monthly data for Y3 (new — replaces quarterly)
  year2Quarterly?: QuarterlyData; // Legacy — kept for backward compat with old forecasts
  year3Quarterly?: QuarterlyData; // Legacy — kept for backward compat with old forecasts
}

// Convert quarterly data to monthly using seasonality weights
export function quarterlyToMonthly(
  quarterly: QuarterlyData,
  fiscalYearStart: number,
  seasonality?: number[]
): MonthlyData {
  const monthKeys = generateMonthKeys(fiscalYearStart);
  const pattern = seasonality || Array(12).fill(8.33);
  const result: MonthlyData = {};

  // Q1 = months 0-2 (Jul-Sep), Q2 = months 3-5 (Oct-Dec), Q3 = months 6-8 (Jan-Mar), Q4 = months 9-11 (Apr-Jun)
  const quarters = [
    { total: quarterly.q1, months: [0, 1, 2] },
    { total: quarterly.q2, months: [3, 4, 5] },
    { total: quarterly.q3, months: [6, 7, 8] },
    { total: quarterly.q4, months: [9, 10, 11] },
  ];

  for (const q of quarters) {
    const qSeasonality = q.months.reduce((s, i) => s + (pattern[i] || 8.33), 0);
    for (const monthIdx of q.months) {
      const weight = qSeasonality > 0 ? (pattern[monthIdx] || 8.33) / qSeasonality : 1 / 3;
      result[monthKeys[monthIdx]] = Math.round(q.total * weight);
    }
  }

  return result;
}

// Convert monthly data to quarterly (for legacy compatibility)
export function monthlyToQuarterly(monthly?: MonthlyData): QuarterlyData {
  if (!monthly) return { q1: 0, q2: 0, q3: 0, q4: 0 };
  const values = Object.values(monthly);
  if (values.length < 12) return { q1: 0, q2: 0, q3: 0, q4: 0 };
  return {
    q1: (values[0] || 0) + (values[1] || 0) + (values[2] || 0),
    q2: (values[3] || 0) + (values[4] || 0) + (values[5] || 0),
    q3: (values[6] || 0) + (values[7] || 0) + (values[8] || 0),
    q4: (values[9] || 0) + (values[10] || 0) + (values[11] || 0),
  };
}

// Get total from a RevenueLine for a given year (handles both monthly and legacy quarterly)
export function getRevenueLineYearTotal(line: RevenueLine, year: 1 | 2 | 3): number {
  if (year === 1) {
    return Object.values(line.year1Monthly).reduce((a, b) => a + b, 0);
  }
  const monthly = year === 2 ? line.year2Monthly : line.year3Monthly;
  if (monthly && Object.keys(monthly).length > 0) {
    return Object.values(monthly).reduce((a, b) => a + b, 0);
  }
  // Fallback to quarterly for old data
  const q = year === 2 ? line.year2Quarterly : line.year3Quarterly;
  if (q) return q.q1 + q.q2 + q.q3 + q.q4;
  return 0;
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
  // Per-month data (overrides formula when present)
  year1Monthly?: MonthlyData;
  year2Monthly?: MonthlyData;
  year3Monthly?: MonthlyData;
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
  // Team cost override — user-controlled toggle (overrides isTeamCost() auto-detection)
  isTeamCostOverride?: boolean; // true = excluded from OpEx totals, undefined = auto-detect
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

// Unified planned spending — replaces CapExItem + Investment
export type SpendType = 'asset' | 'one-off' | 'monthly';
export type PaymentMethod = 'outright' | 'finance' | 'lease';

export interface PlannedSpend {
  id: string;
  description: string;
  amount: number;
  month: number; // 1-12 fiscal month

  spendType: SpendType;
  usefulLifeYears?: number;          // For assets
  annualDepreciation?: number;       // Calculated: amount / usefulLifeYears

  paymentMethod: PaymentMethod;

  // Finance (loan)
  financeTerm?: number;              // Months
  financeRate?: number;              // Annual %
  financeMonthlyPayment?: number;    // Auto-calculated
  financeTotalInterest?: number;     // Auto-calculated

  // Lease
  leaseTerm?: number;                // Months
  leaseMonthlyPayment?: number;      // User input

  initiativeId?: string;
  notes?: string;
}

// Loan repayment: PMT = P × [r(1+r)^n] / [(1+r)^n - 1]
export function calculateLoanPayment(principal: number, annualRate: number, termMonths: number): number {
  if (annualRate <= 0 || termMonths <= 0) return Math.round(principal / termMonths);
  const r = annualRate / 100 / 12;
  const n = termMonths;
  const payment = principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  return Math.round(payment);
}

export function calculateTotalInterest(principal: number, monthlyPayment: number, termMonths: number): number {
  return Math.round(monthlyPayment * termMonths - principal);
}

// Calculate P&L impact for a PlannedSpend item (annual)
export function getPlannedSpendPLImpact(item: PlannedSpend, yearNum: 1 | 2 | 3): number {
  let impact = 0;

  if (item.spendType === 'asset' && item.usefulLifeYears) {
    const annualDep = item.amount / item.usefulLifeYears;
    impact += yearNum === 1 ? annualDep * (13 - item.month) / 12 : annualDep;
  } else if (item.spendType === 'one-off') {
    impact += yearNum === 1 ? item.amount : 0;
  } else if (item.spendType === 'monthly') {
    impact += item.amount * 12;
  }

  // Interest expense for financed items
  if (item.paymentMethod === 'finance' && item.financeTotalInterest && item.financeTerm) {
    const yearsOfTerm = item.financeTerm / 12;
    impact += item.financeTotalInterest / yearsOfTerm;
  }

  // Lease payments (instead of depreciation)
  if (item.paymentMethod === 'lease' && item.leaseMonthlyPayment) {
    // Lease replaces asset depreciation — clear the asset impact and use lease cost
    if (item.spendType === 'asset') {
      const annualDep = item.usefulLifeYears ? item.amount / item.usefulLifeYears : 0;
      impact -= yearNum === 1 ? annualDep * (13 - item.month) / 12 : annualDep;
    }
    impact += item.leaseMonthlyPayment * 12;
  }

  return Math.round(impact);
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
    byLine: { id: string; name: string; total: number; percentOfRevenue: number; byMonth?: MonthlyData }[];
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
  // Version marker for localStorage invalidation
  wizardVersion?: number;

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

  // Step 6: CapEx & Investments (legacy)
  capexItems: CapExItem[];
  investments: Investment[];

  // Step 6: Planned Spending (new — replaces CapEx + Investments)
  plannedSpends: PlannedSpend[];

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

  // Step 6: CapEx & Investments (legacy)
  addCapExItem: (item: Omit<CapExItem, 'id' | 'annualDepreciation'>) => void;
  updateCapExItem: (itemId: string, updates: Partial<CapExItem>) => void;
  removeCapExItem: (itemId: string) => void;
  addInvestment: (investment: Omit<Investment, 'id'>) => void;
  updateInvestment: (investmentId: string, updates: Partial<Investment>) => void;
  removeInvestment: (investmentId: string) => void;

  // Step 6: Planned Spending (new — replaces CapEx + Investments)
  addPlannedSpend: (item: Omit<PlannedSpend, 'id'>) => void;
  updatePlannedSpend: (id: string, updates: Partial<PlannedSpend>) => void;
  removePlannedSpend: (id: string) => void;

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
  investments?: number;
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
  { step: 8, label: 'Growth Plan', shortLabel: '8' },
  { step: 9, label: 'Review', shortLabel: '9' },
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
  const formatted = new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(amount));
  return amount < 0 ? `(${formatted})` : formatted;
}

// Helper to format percentage
export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}
