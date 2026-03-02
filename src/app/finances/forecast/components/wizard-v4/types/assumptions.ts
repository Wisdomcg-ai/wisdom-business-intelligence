/**
 * Forecast Assumptions Types
 *
 * These types define the structure of assumptions stored in the financial_forecasts.assumptions JSONB column.
 * They enable scenario planning by separating inputs (assumptions) from outputs (calculations).
 */

// ============================================================
// COST BEHAVIOR
// ============================================================

export type CostBehavior = 'fixed' | 'variable' | 'adhoc' | 'seasonal';

export interface CostBehaviorConfig {
  type: CostBehavior;
  // For fixed costs:
  monthlyAmount?: number;
  annualIncreasePct?: number;
  // For variable costs:
  percentOfRevenue?: number;
  // For ad-hoc costs:
  expectedAnnualAmount?: number;
  expectedMonths?: string[]; // e.g., ['2026-03', '2026-09'] for bi-annual
  // For seasonal costs:
  seasonalGrowthPct?: number; // Annual growth % to apply to the prior year pattern
}

// ============================================================
// REVENUE ASSUMPTIONS
// ============================================================

export interface RevenueLineAssumption {
  accountId: string;
  accountName: string;
  priorYearTotal: number;
  growthType: 'percentage' | 'fixed_amount';
  growthPct?: number; // e.g., 15 = 15% growth
  fixedGrowthAmount?: number; // e.g., 50000 = $50k more than prior year
  notes?: string;
  // Actual forecasted values (stored for restoration)
  year1Monthly?: Record<string, number>; // e.g., { "2025-07": 50000, ... }
  year2Quarterly?: { q1: number; q2: number; q3: number; q4: number };
  year3Quarterly?: { q1: number; q2: number; q3: number; q4: number };
}

export interface RevenueAssumptions {
  lines: RevenueLineAssumption[];
  seasonalityPattern: number[]; // 12 values, should sum to ~100
  seasonalitySource: 'xero' | 'manual' | 'industry_default';
}

// ============================================================
// COGS ASSUMPTIONS
// ============================================================

export interface COGSLineAssumption {
  accountId: string;
  accountName: string;
  priorYearTotal: number;
  costBehavior: 'variable' | 'fixed';
  // If variable (most common for COGS):
  percentOfRevenue?: number; // e.g., 32 = 32% of revenue
  // If fixed (rare for COGS):
  monthlyAmount?: number;
  notes?: string;
  // Actual forecasted values (stored for restoration)
  year1Monthly?: Record<string, number>;
  year2Quarterly?: { q1: number; q2: number; q3: number; q4: number };
  year3Quarterly?: { q1: number; q2: number; q3: number; q4: number };
}

export interface COGSAssumptions {
  lines: COGSLineAssumption[];
  // Overall COGS as % of revenue (for quick scenario adjustments)
  overallCogsPct?: number;
}

// ============================================================
// TEAM ASSUMPTIONS
// ============================================================

export interface ExistingTeamMember {
  employeeId: string;
  name: string;
  role: string;
  employmentType: 'full-time' | 'part-time' | 'casual' | 'contractor';
  currentSalary: number;
  hoursPerWeek?: number;
  salaryIncreasePct: number; // e.g., 3 = 3% increase
  increaseMonth?: string; // e.g., '2026-07' for start of FY
  includeInForecast: boolean;
  isFromXero: boolean;
}

export interface PlannedHire {
  id: string;
  role: string;
  employmentType: 'full-time' | 'part-time' | 'casual' | 'contractor';
  salary: number;
  hoursPerWeek?: number;
  hourlyRate?: number; // For casuals
  weeksPerYear?: number; // For casuals (default 48)
  startMonth: string; // e.g., '2026-03'
  notes?: string;
}

export interface PlannedDeparture {
  id: string;
  teamMemberId: string;
  endMonth: string; // e.g., '2026-06'
  notes?: string;
}

export interface PlannedBonus {
  id: string;
  teamMemberId: string;
  amount: number;
  month: number; // 1-12 (month of fiscal year)
  notes?: string;
}

export interface PlannedCommission {
  id: string;
  teamMemberId: string;
  revenueLineId: string;
  percentOfRevenue: number; // e.g., 5 = 5% of revenue line
  timing: 'monthly' | 'quarterly' | 'annual';
  notes?: string;
}

export interface TeamAssumptions {
  existingTeam: ExistingTeamMember[];
  plannedHires: PlannedHire[];
  departures?: PlannedDeparture[];
  bonuses?: PlannedBonus[];
  commissions?: PlannedCommission[];
  // On-costs (Australian defaults)
  superannuationPct: number; // e.g., 12 (2026 rate)
  workCoverPct: number; // e.g., 1.5
  payrollTaxPct: number; // e.g., 4.85 (above threshold)
  payrollTaxThreshold?: number; // e.g., 1200000 (varies by state)
}

// ============================================================
// OPEX ASSUMPTIONS
// ============================================================

export interface OpExLineAssumption {
  accountId: string;
  accountName: string;
  priorYearTotal: number;
  costBehavior: CostBehavior;
  // For fixed:
  monthlyAmount?: number;
  annualIncreasePct?: number; // e.g., 3 = 3% annual increase
  // For variable:
  percentOfRevenue?: number;
  // For seasonal:
  seasonalGrowthPct?: number; // Annual growth % to apply to prior year pattern
  seasonalTargetAmount?: number; // Target annual amount (alternative to growth %)
  // For adhoc:
  expectedAnnualAmount?: number;
  expectedMonths?: string[]; // Which months to spread across
  // Subscription flag
  isSubscription?: boolean;
  notes?: string;
}

export interface OpExAssumptions {
  lines: OpExLineAssumption[];
}

// ============================================================
// CAPEX ASSUMPTIONS
// ============================================================

export type CapExCategory = 'equipment' | 'vehicle' | 'leasehold' | 'technology' | 'furniture' | 'other';

export interface CapExItem {
  id: string;
  name: string;
  amount: number;
  month: string; // e.g., '2026-08'
  category: CapExCategory;
  notes?: string;
}

export interface CapExAssumptions {
  items: CapExItem[];
}

// ============================================================
// SUBSCRIPTION AUDIT SUMMARY
// ============================================================

export interface SubscriptionAuditSummary {
  auditedAt: string;
  accountsIncluded: string[]; // Account IDs that were audited
  vendorCount: number;
  totalAnnual: number;
  essentialAnnual: number;
  reviewAnnual: number;
  reduceAnnual: number;
  cancelAnnual: number;
  potentialSavings: number; // reduce + cancel
  costPerEmployee?: number;
}

// ============================================================
// MASTER ASSUMPTIONS OBJECT
// ============================================================

export interface YearlyGoalsAssumption {
  revenue: number;
  grossProfitPct: number;
  netProfitPct: number;
}

export interface GoalsAssumption {
  year1: YearlyGoalsAssumption;
  year2?: YearlyGoalsAssumption;
  year3?: YearlyGoalsAssumption;
}

export interface ForecastAssumptions {
  // Schema version for future migrations
  version: number;
  createdAt: string;
  updatedAt: string;

  // Business context
  industry?: string;
  employeeCount?: number;
  fiscalYearStart: string; // e.g., '07' for July (Australian FY)

  // Goals from Step 1
  goals?: GoalsAssumption;

  // Core assumptions
  revenue: RevenueAssumptions;
  cogs: COGSAssumptions;
  team: TeamAssumptions;
  opex: OpExAssumptions;
  capex: CapExAssumptions;

  // Subscription audit (populated after Step 6)
  subscriptions?: SubscriptionAuditSummary;
}

// ============================================================
// SCENARIO OVERRIDES
// ============================================================

export interface TeamScenarioChanges {
  additionalHires?: PlannedHire[];
  removedHireIds?: string[]; // IDs of hires to remove from base
  salaryAdjustmentPct?: number; // Across-the-board adjustment
  removeExistingEmployeeIds?: string[]; // For reduction scenarios
}

export interface CapExScenarioChanges {
  additionalItems?: CapExItem[];
  removedItemIds?: string[];
  delayMonths?: number; // Push all capex back N months
}

export interface ScenarioOverrides {
  // Revenue adjustments
  revenueGrowthMultiplier?: number; // e.g., 1.5 = 50% more growth than base
  revenueGrowthAddPct?: number; // e.g., 5 = add 5% to all growth rates

  // COGS adjustments
  cogsAdjustmentPct?: number; // e.g., 2 = add 2% to COGS ratio

  // Team adjustments
  teamChanges?: TeamScenarioChanges;

  // OpEx adjustments
  opexAdjustmentPct?: number; // e.g., -5 = reduce all opex by 5%
  opexFixedAdjustmentPct?: number; // Only adjust fixed costs
  opexVariableAdjustmentPct?: number; // Only adjust variable costs

  // CapEx adjustments
  capexChanges?: CapExScenarioChanges;
}

export interface ForecastScenario {
  id: string;
  baseForcastId: string;
  name: string;
  description?: string;
  overrides: ScenarioOverrides;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

// ============================================================
// SUBSCRIPTION AUDIT TYPES
// ============================================================

export type SubscriptionFrequency = 'monthly' | 'quarterly' | 'annual' | 'irregular';
export type SubscriptionConfidence = 'high' | 'medium' | 'low';
export type SubscriptionStatus = 'essential' | 'review' | 'reduce' | 'cancel';

export interface DetectedSubscription {
  id?: string;
  vendorName: string;
  vendorNormalized: string;
  sourceAccountId: string;
  sourceAccountName: string;
  detectedFrequency: SubscriptionFrequency;
  confidence: SubscriptionConfidence;
  typicalAmount: number;
  annualTotal: number;
  costPerEmployee?: number;
  paymentCount: number;
  lastPaymentDate?: string;
  nextExpectedDate?: string;
  status: SubscriptionStatus;
  userNotes?: string;
}

export interface SubscriptionAccount {
  accountId: string;
  accountName: string;
  annualTotal: number;
  transactionCount: number;
  isSelected: boolean;
  isSuggested: boolean;
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

export function createEmptyAssumptions(fiscalYear: number): ForecastAssumptions {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    fiscalYearStart: '07', // Australian FY default
    revenue: {
      lines: [],
      seasonalityPattern: Array(12).fill(8.33), // Even distribution
      seasonalitySource: 'industry_default',
    },
    cogs: {
      lines: [],
    },
    team: {
      existingTeam: [],
      plannedHires: [],
      departures: [],
      bonuses: [],
      commissions: [],
      superannuationPct: 12,
      workCoverPct: 1.5,
      payrollTaxPct: 4.85,
      payrollTaxThreshold: 1200000,
    },
    opex: {
      lines: [],
    },
    capex: {
      items: [],
    },
  };
}

export function mergeScenarioOverrides(
  base: ForecastAssumptions,
  overrides: ScenarioOverrides
): ForecastAssumptions {
  const merged = structuredClone(base);
  merged.updatedAt = new Date().toISOString();

  // Apply revenue multiplier
  if (overrides.revenueGrowthMultiplier) {
    merged.revenue.lines.forEach(line => {
      if (line.growthPct !== undefined) {
        line.growthPct *= overrides.revenueGrowthMultiplier!;
      }
    });
  }

  // Apply revenue add percentage
  if (overrides.revenueGrowthAddPct) {
    merged.revenue.lines.forEach(line => {
      if (line.growthPct !== undefined) {
        line.growthPct += overrides.revenueGrowthAddPct!;
      }
    });
  }

  // Apply COGS adjustment
  if (overrides.cogsAdjustmentPct) {
    merged.cogs.lines.forEach(line => {
      if (line.percentOfRevenue !== undefined) {
        line.percentOfRevenue += overrides.cogsAdjustmentPct!;
      }
    });
    if (merged.cogs.overallCogsPct !== undefined) {
      merged.cogs.overallCogsPct += overrides.cogsAdjustmentPct;
    }
  }

  // Apply team changes
  if (overrides.teamChanges) {
    const tc = overrides.teamChanges;

    if (tc.additionalHires) {
      merged.team.plannedHires.push(...tc.additionalHires);
    }

    if (tc.removedHireIds) {
      merged.team.plannedHires = merged.team.plannedHires.filter(
        h => !tc.removedHireIds!.includes(h.id)
      );
    }

    if (tc.removeExistingEmployeeIds) {
      merged.team.existingTeam = merged.team.existingTeam.filter(
        e => !tc.removeExistingEmployeeIds!.includes(e.employeeId)
      );
    }

    if (tc.salaryAdjustmentPct) {
      merged.team.existingTeam.forEach(e => {
        e.currentSalary *= (1 + tc.salaryAdjustmentPct! / 100);
      });
      merged.team.plannedHires.forEach(h => {
        h.salary *= (1 + tc.salaryAdjustmentPct! / 100);
      });
    }
  }

  // Apply OpEx adjustments
  if (overrides.opexAdjustmentPct) {
    merged.opex.lines.forEach(line => {
      if (line.monthlyAmount !== undefined) {
        line.monthlyAmount *= (1 + overrides.opexAdjustmentPct! / 100);
      }
      if (line.percentOfRevenue !== undefined) {
        line.percentOfRevenue *= (1 + overrides.opexAdjustmentPct! / 100);
      }
      if (line.expectedAnnualAmount !== undefined) {
        line.expectedAnnualAmount *= (1 + overrides.opexAdjustmentPct! / 100);
      }
    });
  }

  // Apply CapEx changes
  if (overrides.capexChanges) {
    const cc = overrides.capexChanges;

    if (cc.additionalItems) {
      merged.capex.items.push(...cc.additionalItems);
    }

    if (cc.removedItemIds) {
      merged.capex.items = merged.capex.items.filter(
        i => !cc.removedItemIds!.includes(i.id)
      );
    }

    if (cc.delayMonths) {
      merged.capex.items.forEach(item => {
        const date = new Date(item.month + '-01');
        date.setMonth(date.getMonth() + cc.delayMonths!);
        item.month = date.toISOString().slice(0, 7);
      });
    }
  }

  return merged;
}
