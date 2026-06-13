/**
 * Rollover Math — Phase 73 Plan 02
 *
 * Pure functions (no I/O) for computing the shifted 3-year ladder (D3) and
 * rolled plan dates when a client moves from one plan year to the next.
 *
 * D3 Rollover Rule:
 *   new_current = prior_year1   (the year just finished → baseline)
 *   new_year1   = prior_year2
 *   new_year2   = prior_year3
 *   new_year3   = prior_year3   (extrapolate: carry Year3 forward; client adjusts in wizard)
 */

import {
  getFiscalYear,
  getFiscalYearStartDate,
  getFiscalYearEndDate,
} from '@/lib/utils/fiscal-year-utils'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The 12 metric prefixes stored in business_financial_goals */
const METRIC_PREFIXES = [
  'revenue',
  'gross_profit',
  'gross_margin',
  'net_profit',
  'net_margin',
  'customers',
  'employees',
  'leads_per_month',
  'conversion_rate',
  'avg_transaction_value',
  'team_headcount',
  'owner_hours_per_week',
] as const

type MetricPrefix = (typeof METRIC_PREFIXES)[number]
type Suffix = 'current' | 'year1' | 'year2' | 'year3'
type LadderKey = `${MetricPrefix}_${Suffix}`

/** The full set of 48 ladder column values (12 prefixes × 4 suffixes). */
export type RolledLadder = Record<LadderKey, number>

// ---------------------------------------------------------------------------
// computeRolledLadder
// ---------------------------------------------------------------------------

/**
 * Apply the D3 ladder shift to produce new column values.
 *
 * @param priorRow - The current business_financial_goals row (or a partial subset).
 *                   Any missing / null / undefined values are coerced to 0.
 * @returns A flat object with 48 keys ready to be spread into a DB update payload.
 */
export function computeRolledLadder(priorRow: Record<string, unknown>): RolledLadder {
  const safe = (val: unknown): number => {
    if (val === null || val === undefined || val === '') return 0
    const n = Number(val)
    return isNaN(n) ? 0 : n
  }

  const result = {} as Record<string, number>

  for (const prefix of METRIC_PREFIXES) {
    const priorYear1 = safe(priorRow[`${prefix}_year1`])
    const priorYear2 = safe(priorRow[`${prefix}_year2`])
    const priorYear3 = safe(priorRow[`${prefix}_year3`])

    // D3: new_current = prior_year1
    result[`${prefix}_current`] = priorYear1
    // D3: new_year1 = prior_year2
    result[`${prefix}_year1`] = priorYear2
    // D3: new_year2 = prior_year3
    result[`${prefix}_year2`] = priorYear3
    // D3: new_year3 = prior_year3 (extrapolate; client adjusts in wizard)
    result[`${prefix}_year3`] = priorYear3
  }

  return result as RolledLadder
}

// ---------------------------------------------------------------------------
// computeRolledPlanDates
// ---------------------------------------------------------------------------

export interface RolledPlanDates {
  /** First day of the new Year 1 (start of the FY immediately after priorYear1EndDate) */
  planStartDate: Date
  /** Last day of the new Year 1 (end of the same FY) */
  year1EndDate: Date
  /** Last day of Year 3 (end of newFY + 2) */
  planEndDate: Date
}

/**
 * Compute new plan dates for a rollover.
 *
 * @param priorYear1EndDate - The `year1_end_date` from the prior row (e.g. 2026-06-30 for FY26)
 * @param yearType          - 'FY' (e.g. yearStartMonth=7) or 'CY' (yearStartMonth=1)
 * @param yearStartMonth    - The fiscal year start month (1–12)
 * @returns { planStartDate, year1EndDate, planEndDate }
 *
 * FY example (ysm=7):
 *   priorYear1End 2026-06-30 → newFY=2027
 *   planStartDate = 2026-07-01
 *   year1EndDate  = 2027-06-30
 *   planEndDate   = 2029-06-30  (newFY + 2 = 2029)
 *
 * CY example (ysm=1):
 *   priorYear1End 2026-12-31 → newFY=2027
 *   planStartDate = 2027-01-01
 *   year1EndDate  = 2027-12-31
 *   planEndDate   = 2029-12-31  (newFY + 2 = 2029)
 */
export function computeRolledPlanDates(
  priorYear1EndDate: Date,
  yearType: 'FY' | 'CY',
  yearStartMonth: number,
): RolledPlanDates {
  // The day immediately after the prior year1 end belongs to the new FY.
  const dayAfter = new Date(priorYear1EndDate)
  dayAfter.setDate(dayAfter.getDate() + 1)

  // Derive the new FY number from that next day.
  const newFY = getFiscalYear(dayAfter, yearStartMonth)

  // planStartDate: canonical start of the new FY
  const planStartDate = getFiscalYearStartDate(newFY, yearStartMonth)
  // year1EndDate: canonical end of the new FY
  const year1EndDate = getFiscalYearEndDate(newFY, yearStartMonth)
  // planEndDate: end of Year 3 = end of newFY + 2 (3 years total: Y1, Y2, Y3)
  const planEndDate = getFiscalYearEndDate(newFY + 2, yearStartMonth)

  // Suppress unused parameter warning — yearType is carried in the function
  // signature so callers can document intent; the logic is already encoded in
  // yearStartMonth. We don't branch on it here.
  void yearType

  return { planStartDate, year1EndDate, planEndDate }
}
