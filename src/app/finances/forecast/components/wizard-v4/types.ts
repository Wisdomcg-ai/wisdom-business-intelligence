// Forecast Wizard V4 Types
// Based on the 8-step CFO methodology with scenario planning support

import type { PLLineItem } from '@/app/finances/forecast/types';

export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9; // 8 = Growth Plan, 9 = Final Review
export type ForecastDuration = 1 | 2 | 3; // 1yr, 2yr, or 3yr forecast

export type EmploymentType = 'full-time' | 'part-time' | 'casual' | 'contractor';
export type ContractorType = 'onshore' | 'offshore';

/**
 * Phase 51 (UX-S4-02): How a part-time / casual employee enters their schedule.
 * - 'hours': user inputs hours-per-week (current behaviour)
 * - 'fte': user inputs %FTE; hoursPerWeek derives from fte/100 × STANDARD_HOURS
 * Optional. When undefined, components MUST treat the member as 'hours' mode
 * for full backward compatibility with forecasts saved before Phase 51.
 */
export type HoursMode = 'hours' | 'fte';

/**
 * Phase 51 (UX-S4-03): How often an employee is paid. Pure persistence in
 * Phase 51 — does NOT affect annual salary calculations or the Y1/Y2/Y3 P&L
 * summary. Consumed by Phase 52 (Xero PayrollCalendar auto-fill + cashflow
 * pay-period distribution). When undefined on TeamMember/NewHire, falls
 * through to ForecastWizardState.defaultPayFrequency, then to 'monthly'.
 */
export type PayFrequency = 'weekly' | 'fortnightly' | 'monthly';

/**
 * Phase 52 (XERO-S4-01..05) — snapshot of Xero-imported field values for
 * re-import reconciliation. Stored on TeamMember/NewHire as `_xeroFingerprint`
 * by enrichWizardMemberFromXeroEmployee on import. Plan 52-02 will read this
 * to detect "operator has manually edited this field since the last import"
 * by comparing the live member values against the fingerprint.
 *
 * All fields optional — only the fields actually sourced from Xero on a given
 * import get snapshotted. Strict JSON-serialisable for localStorage round-trip.
 */
export interface XeroFieldFingerprint {
  payFrequency?: PayFrequency;
  standardHours?: number;
  hourlyRate?: number;
  currentSalary?: number;
  hoursPerWeek?: number;
  type?: EmploymentType;
  name?: string;
  role?: string;
}

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

  // Phase 51 plan 03 (UX-S3-03) — per-line seasonality override.
  // When undefined: line inherits business-level seasonality (current behavior).
  // When set: array of 12 percentages, expected to sum to ~100 (validated in editor).
  // Read via getEffectiveSeasonality(line, businessSeasonality) in utils/line-distribution.ts —
  // every reader (Step 3 display + useForecastWizard rollup) funnels through that helper
  // so display + rollup cannot drift (Phase 50 Bug 4 lockstep precedent).
  seasonalityPattern?: number[];
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

export type COGSTrend = 'same' | 'improves' | 'increases';

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
  // Y2/Y3 trend — adjusts COGS % for future years
  y2y3Trend?: COGSTrend; // 'same' (default) | 'improves' (~2% better) | 'increases' (~2% worse)
  // Per-month data (overrides formula when present)
  year1Monthly?: MonthlyData;
  year2Monthly?: MonthlyData;
  year3Monthly?: MonthlyData;

  // Phase 51 plan 03 (UX-S3-03) — per-line seasonality override.
  // Only meaningful for FIXED COGS lines (variable COGS distributes by revenue,
  // so per-line seasonality is redundant). UI hides the editor button on
  // variable COGS rows (operator decision encoded in Step3RevenueCOGS.tsx).
  // Field accepted on the type for symmetry with RevenueLine.
  seasonalityPattern?: number[];
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
  // Phase 51 (UX-S4-02): PT/casual schedule input mode.
  // undefined → treat as 'hours' (current behaviour) for back-compat with
  // forecasts saved before Phase 51. See HoursMode type for semantics.
  hoursMode?: HoursMode;
  // Phase 51 (UX-S4-03): pay frequency for cashflow timing (Phase 52
  // consumer). Annual salary unchanged in Phase 51. undefined → fall
  // through to ForecastWizardState.defaultPayFrequency, then to 'monthly'.
  payFrequency?: PayFrequency;
  // Phase 52 (XERO-S4-03): hours per pay period from Xero. For salaried
  // employees this is OrdinaryHoursPerWeek (top-level Employee field).
  // For hourly, derived from PayTemplate.EarningsLines.NumberOfUnitsPerWeek
  // when present, falling back to OrdinaryHoursPerWeek.
  standardHours?: number;
  // Phase 52 — Xero provenance markers (XERO-S4-01..05).
  _xeroEmployeeId?: string;          // Xero EmployeeID for re-import matching
  _xeroImportedAt?: string;          // ISO timestamp of most recent import
  _xeroFingerprint?: XeroFieldFingerprint;  // last-imported values per field
  _overriddenFields?: string[];      // field names the operator has explicitly
                                     // edited since last import. ARRAY (not Set)
                                     // — must survive JSON localStorage round-trip.
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
  // Annual salary increase % applied for years AFTER the hire's start year.
  // Default 3 if undefined to preserve historical behavior.
  increasePct?: number;
  includeInHeadcount?: boolean; // For contractors - whether to include in headcount calculations
  // Phase 51 (UX-S4-02): PT/casual schedule input mode.
  // undefined → treat as 'hours' (current behaviour) for back-compat.
  hoursMode?: HoursMode;
  // Phase 51 (UX-S4-03): pay frequency for cashflow timing (Phase 52
  // consumer). Annual salary unchanged in Phase 51. undefined → fall
  // through to ForecastWizardState.defaultPayFrequency, then to 'monthly'.
  payFrequency?: PayFrequency;
  // Phase 52 (XERO-S4-03): hours per pay period from Xero (see TeamMember.standardHours).
  standardHours?: number;
  // Phase 52 — Xero provenance markers (XERO-S4-01..05).
  _xeroEmployeeId?: string;
  _xeroImportedAt?: string;
  _xeroFingerprint?: XeroFieldFingerprint;
  _overriddenFields?: string[];
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
  seasonalTargetAmount?: number; // Target annual amount (alternative to growth %) — Y1
  // why: pre-P1 the rollup only honored seasonalTargetAmount when yearNum===1,
  // so Y2/Y3 silently reverted to the growth-formula even when the operator
  // wanted distinct per-year targets. Mirrors the y2Override/y3Override
  // pattern (P0-1) for fixed/variable lines. UI for setting these per-year
  // targets is a future enhancement — type+rollup wired now so the data path
  // is unblocked. P1A Audit Seasonal-OpEx-Y1-Override-001.
  y2SeasonalTargetAmount?: number; // Override seasonal target for Y2
  y3SeasonalTargetAmount?: number; // Override seasonal target for Y3
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
export type PaymentMethod = 'outright' | 'finance' | 'lease'; // LEGACY — preserved for back-compat

// Phase 50 plan 50-02 (FCST-BUG-04): lease/finance taxonomy.
// Items with `lease_type` set use the new accounting model; items without
// fall through to the legacy `paymentMethod` switch (today's behavior).
export type LeaseType =
  | 'outright_purchase'
  | 'operating_lease'
  | 'finance_lease'
  | 'loan_financing';

export interface PlannedSpend {
  id: string;
  description: string;
  amount: number;
  month: number; // 1-12 fiscal month

  spendType: SpendType;
  usefulLifeYears?: number;          // LEGACY (years) — used by legacy paymentMethod branch
  annualDepreciation?: number;       // Calculated: amount / usefulLifeYears

  paymentMethod: PaymentMethod;      // LEGACY discriminator (still required for back-compat)

  // Phase 50 plan 50-02 — full taxonomy (FCST-BUG-04)
  // When `lease_type` is set, takes precedence over `paymentMethod` for
  // accounting calcs. When undefined, falls through to legacy paymentMethod
  // branches so existing forecasts render identically (no migration script).
  lease_type?: LeaseType;
  term_months?: number;              // Lease/loan term in months
  interest_rate?: number;            // Annual % APR (used by finance_lease + loan_financing)
  useful_life_months?: number;       // Depreciation period in months
                                     // (replaces usefulLifeYears for new items)
  residual_value?: number;           // Optional balloon / residual at end of lease term

  // Legacy finance fields (preserved for back-compat)
  financeTerm?: number;              // Months
  financeRate?: number;              // Annual %
  financeMonthlyPayment?: number;    // Auto-calculated
  financeTotalInterest?: number;     // Auto-calculated

  // Legacy lease fields (preserved for back-compat)
  leaseTerm?: number;                // Months
  leaseMonthlyPayment?: number;      // User input

  initiativeId?: string;
  notes?: string;
}

// Loan repayment: PMT = P × [r(1+r)^n] / [(1+r)^n - 1]
export function calculateLoanPayment(principal: number, annualRate: number, termMonths: number): number {
  // why: termMonths=0 must short-circuit to 0 BEFORE the rate guard —
  // the previous combined `if (rate<=0 || term<=0) return principal/term`
  // returned Infinity (or NaN when principal=0) for term=0 because of the
  // `principal / 0` divide. All real call sites in getBreakdownWithTaxonomy
  // already gate on `termMonths > 0` before invoking, so 0 here means an
  // unconfigured loan — surface 0 rather than poison the rollup with Infinity.
  // P1A Audit Division-By-Zero-001.
  if (termMonths <= 0) return 0;
  if (annualRate <= 0) return Math.round(principal / termMonths);
  const r = annualRate / 100 / 12;
  const n = termMonths;
  const payment = principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  return Math.round(payment);
}

export function calculateTotalInterest(principal: number, monthlyPayment: number, termMonths: number): number {
  return Math.round(monthlyPayment * termMonths - principal);
}

/**
 * Sum the interest portion of a loan's monthly payments for a given window
 * of months in the amortization schedule. Each month: interest = balance × r,
 * principal = payment − interest, balance −= principal.
 *
 * why: pre-P1 the rollup spread `totalInterest / years` evenly across years,
 * which ignored principal paydown. For a $100K loan @ 5% APR / 5yr the true
 * Y1 interest is ≈$4.7K (declining each year as balance shrinks); the old
 * code reported the same value (~$3.8K avg) every year. This helper walks
 * the real schedule so multi-year P&L tracks reality.
 *
 * @param principal     Initial loan balance.
 * @param annualRate    Annual interest rate as percent (e.g. 5 for 5%).
 * @param termMonths    Total months in loan term.
 * @param startMonthIdx 0-based month index in the schedule to start summing.
 * @param monthsInWindow Number of months to sum (clipped to remaining term).
 * @returns Rounded interest dollars accrued in the window.
 *
 * P1A Audit Lease-Interest-001.
 */
export function calculateAmortizedInterestForWindow(
  principal: number,
  annualRate: number,
  termMonths: number,
  startMonthIdx: number,
  monthsInWindow: number,
): number {
  if (principal <= 0 || termMonths <= 0 || monthsInWindow <= 0) return 0;
  if (startMonthIdx >= termMonths) return 0;
  const r = annualRate > 0 ? annualRate / 100 / 12 : 0;
  // Standard amortizing payment (PMT). When rate==0, payment is principal/n.
  const payment = r > 0
    ? (principal * (r * Math.pow(1 + r, termMonths))) / (Math.pow(1 + r, termMonths) - 1)
    : principal / termMonths;
  let balance = principal;
  let interestAccrued = 0;
  const endIdx = Math.min(termMonths, startMonthIdx + monthsInWindow);
  for (let i = 0; i < endIdx; i++) {
    const interestThisMonth = balance * r;
    const principalThisMonth = payment - interestThisMonth;
    if (i >= startMonthIdx) interestAccrued += interestThisMonth;
    balance -= principalThisMonth;
  }
  return Math.round(interestAccrued);
}

// Phase 50 plan 50-02 (FCST-BUG-04): split P&L impact into depreciation and
// expenses so the rollup at useForecastWizard.ts can preserve its two-bucket
// accumulation (depreciation feeds ForecastSummary.depreciation; expenses
// feeds ForecastSummary.investments).
export interface PlannedSpendPLBreakdown {
  depreciation: number;
  expenses: number;       // operating expenses + interest portion of payments
  total: number;
}

// Calculate P&L impact breakdown for a PlannedSpend item (annual).
// - When item.lease_type is set: dispatch on the new taxonomy (4 branches).
// - When item.lease_type is undefined: fall through to legacy paymentMethod
//   logic so existing forecasts produce identical numbers (no migration).
export function getPlannedSpendPLBreakdown(
  item: PlannedSpend,
  yearNum: 1 | 2 | 3,
): PlannedSpendPLBreakdown {
  if (item.lease_type) {
    return getBreakdownWithTaxonomy(item, yearNum);
  }
  return getBreakdownLegacy(item, yearNum);
}

function getBreakdownWithTaxonomy(
  item: PlannedSpend,
  yearNum: 1 | 2 | 3,
): PlannedSpendPLBreakdown {
  const monthsRemaining = yearNum === 1 ? Math.max(0, 13 - item.month) : 12;
  const depreciableBase = item.amount - (item.residual_value || 0);
  const usefulLifeMonths = item.useful_life_months || 0;
  const termMonths = item.term_months || 0;

  switch (item.lease_type) {
    case 'outright_purchase': {
      if (usefulLifeMonths <= 0) {
        return { depreciation: 0, expenses: 0, total: 0 };
      }
      const monthlyDep = depreciableBase / usefulLifeMonths;
      const dep = Math.round(monthlyDep * monthsRemaining);
      return { depreciation: dep, expenses: 0, total: dep };
    }
    case 'operating_lease': {
      const monthlyPayment =
        item.leaseMonthlyPayment ??
        (termMonths > 0 ? item.amount / termMonths : 0);
      const exp = Math.round(monthlyPayment * 12);
      return { depreciation: 0, expenses: exp, total: exp };
    }
    case 'finance_lease':
    case 'loan_financing': {
      let dep = 0;
      if (usefulLifeMonths > 0) {
        const monthlyDep = depreciableBase / usefulLifeMonths;
        dep = Math.round(monthlyDep * monthsRemaining);
      }
      let interestExp = 0;
      if (termMonths > 0 && item.interest_rate !== undefined) {
        // why: pre-P1 used `totalInterest / years` which ignored principal
        // paydown — every year reported the same average interest. Real
        // amortization has interest declining each year. Reproducer: $100K
        // loan @ 5% / 5yr → Y1≈$4.7K, Y2≈$3.8K, ... not flat.
        // P1A Lease-Interest-001.
        // Y1 covers the (13 - item.month) months from the spend's fiscal
        // start month through year-end. Y2/Y3 each cover 12 months
        // continuing in the schedule (clipped at termMonths).
        const monthsInY1 = Math.max(0, 13 - item.month);
        let startIdx = 0;
        let monthsInWindow = monthsInY1;
        if (yearNum === 2) {
          startIdx = monthsInY1;
          monthsInWindow = 12;
        } else if (yearNum === 3) {
          startIdx = monthsInY1 + 12;
          monthsInWindow = 12;
        }
        interestExp = calculateAmortizedInterestForWindow(
          item.amount,
          item.interest_rate,
          termMonths,
          startIdx,
          monthsInWindow,
        );
      }
      return {
        depreciation: dep,
        expenses: interestExp,
        total: dep + interestExp,
      };
    }
    default: {
      // Defensive: lease_type was set to an unknown string. Fall through to
      // legacy so we don't silently zero out a forecast.
      return getBreakdownLegacy(item, yearNum);
    }
  }
}

// Legacy implementation — preserved to match exactly the behavior of the
// pre-Phase-50 inline rollup AND the pre-Phase-50 getPlannedSpendPLImpact.
// Test 4.5 in wizard-v4-bug-fixes.test.tsx regression-locks this against the
// captured value $23,200 for the canonical legacy fixture.
function getBreakdownLegacy(
  item: PlannedSpend,
  yearNum: 1 | 2 | 3,
): PlannedSpendPLBreakdown {
  let depreciation = 0;
  let expenses = 0;

  if (item.spendType === 'asset' && item.paymentMethod !== 'lease') {
    if (item.usefulLifeYears) {
      depreciation = Math.round(
        (item.amount / item.usefulLifeYears) *
          (yearNum === 1 ? (13 - item.month) / 12 : 1),
      );
    }
  }

  if (
    item.paymentMethod === 'finance' &&
    item.financeTotalInterest &&
    item.financeTerm
  ) {
    expenses += Math.round(item.financeTotalInterest / (item.financeTerm / 12));
  }

  if (item.paymentMethod === 'lease' && item.leaseMonthlyPayment) {
    expenses += item.leaseMonthlyPayment * 12;
  }

  if (item.spendType === 'one-off' && yearNum === 1) {
    expenses += item.amount;
  }

  if (item.spendType === 'monthly') {
    expenses += item.amount * 12;
  }

  return { depreciation, expenses, total: depreciation + expenses };
}

// Calculate annual P&L impact for a PlannedSpend item.
// Delegates to getPlannedSpendPLBreakdown (which encapsulates both the new
// lease_type taxonomy and the legacy paymentMethod fallback).
export function getPlannedSpendPLImpact(item: PlannedSpend, yearNum: 1 | 2 | 3): number {
  return getPlannedSpendPLBreakdown(item, yearNum).total;
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
  otherIncome?: {
    total: number;
    byMonth: MonthlyData;
  };
  otherExpenses?: {
    total: number;
    byMonth: MonthlyData;
  };
  seasonalityPattern: number[]; // 12 percentages that sum to 100
}

export interface ForecastWizardState {
  // Version marker for localStorage invalidation
  wizardVersion?: number;

  // Phase 56 (P1 B2): when present, indicates the draft was loaded from a
  // localStorage entry written by an older WIZARD_VERSION. Carries the prior
  // version number so debug tooling can trace which fields fell through to
  // defaults. Cleared on next save (saveStateToStorage rewrites wizardVersion
  // to the current WIZARD_VERSION) but the marker on the live state is
  // intentional — it allows downstream code to surface a "restored from
  // older version" notice if needed.
  migratedFromVersion?: number;

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
    // Per-line YTD breakdown (Phase 44.3 / FCST-06) — surfaces the per-line
    // per-month actuals the API already returns so initializeFromXero can
    // lock completed-month values to the cent.
    revenue_lines?: PLLineItem[];
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

  // Phase 51 (UX-S4-03) — business-level default pay frequency.
  // When undefined: per-row dropdowns fall through to 'monthly'.
  // When set: rows with undefined payFrequency display this as inherited.
  // Per-row payFrequency override always wins over this default.
  // Pure persistence in Phase 51 — no rollup math impact. Phase 52 will
  // consume this field for Xero PayrollCalendar auto-fill + cashflow timing.
  defaultPayFrequency?: PayFrequency;

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
  // Phase 51 (UX-S4-03): set the business-level default pay frequency.
  // Pure persistence — does not mutate per-row payFrequency fields.
  setDefaultPayFrequency: (frequency: PayFrequency) => void;

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
  // Bulk replace — used by save/load restore path
  setPlannedSpends: (items: PlannedSpend[]) => void;

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
      revenue_lines?: PLLineItem[]; // Phase 44.3 — per-line YTD breakdown for target-aware init
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
  /** User-entered one-off / recurring expenses from Step 7 (NOT Xero's other_expense bucket). */
  otherExpenses: number;
  /** Xero `other_income` account_type bucket — carried over from prior FY actuals. */
  otherIncome: number;
  /** Xero `other_expense` account_type bucket — carried over from prior FY actuals. */
  xeroOtherExpense: number;
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

/**
 * Generate month keys for a fiscal year.
 * @param fiscalYearStart The calendar year the FY begins (e.g. 2025 for FY2026).
 * @param yearStartMonth 1-12 controlling which calendar month starts the year (default 7 = July).
 * @deprecated Use generateFiscalMonthKeys(fiscalYear, yearStartMonth) from '@/lib/utils/fiscal-year-utils'
 *             which takes the fiscal year number (e.g. 2026) instead of the calendar start year (2025).
 */
export function generateMonthKeys(fiscalYearStart: number, yearStartMonth: number = 7): string[] {
  // Import inline to avoid circular dependency with types file
  const months: string[] = [];
  for (let i = 0; i < 12; i++) {
    const calMonth = ((yearStartMonth - 1 + i) % 12) + 1;
    const year = calMonth >= yearStartMonth ? fiscalYearStart : fiscalYearStart + 1;
    months.push(`${year}-${String(calMonth).padStart(2, '0')}`);
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
