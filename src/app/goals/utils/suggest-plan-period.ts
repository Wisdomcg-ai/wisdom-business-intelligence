import {
  getFiscalYear,
  getFiscalYearStartDate,
  getFiscalYearEndDate,
  isNearYearEnd,
  getMonthsUntilYearEnd,
  DEFAULT_YEAR_START_MONTH,
} from '@/lib/utils/fiscal-year-utils'

export interface PlanPeriodSuggestion {
  planStartDate: Date       // First day of the plan
  planEndDate: Date         // Last day of Year 3
  year1EndDate: Date        // Last day of Year 1 (= planEndDate - 24 months)
  year1Months: number       // 12 for standard, 13-15 for extended
  rationale: string         // Banner copy: e.g. "You're 2 months from FY end..."
}

/**
 * Phase 42: Suggest a plan period for a brand-new strategic plan.
 *
 * Pure function — no I/O, no global state. Caller passes `today` so this is
 * fully deterministic and easy to test. Called only at plan creation
 * (useStrategicPlanning load when no planStartDate is loaded) and from the
 * "Reset to suggestion" button on PlanPeriodAdjustModal.
 *
 * Behaviour:
 *   - If today is within 3 months of the fiscal year end (isNearYearEnd):
 *     Year 1 = remaining months of current FY + full next FY (13–15 months).
 *     Year 3 ends at end of currentFY+3.
 *   - Otherwise: standard 12-month plan starting at the FY containing `today`.
 */
export function suggestPlanPeriod(
  today: Date,
  yearStartMonth: number = DEFAULT_YEAR_START_MONTH,
): PlanPeriodSuggestion {
  const currentFY = getFiscalYear(today, yearStartMonth)

  if (isNearYearEnd(today, yearStartMonth)) {
    // Extended: plan starts today (snap to first-of-month) through end of currentFY+1
    const monthsLeft = getMonthsUntilYearEnd(today, yearStartMonth)
    const planStartDate = new Date(today.getFullYear(), today.getMonth(), 1)
    const year1EndDate = getFiscalYearEndDate(currentFY + 1, yearStartMonth)
    const year1Months = monthsLeft + 12
    const planEndDate = getFiscalYearEndDate(currentFY + 3, yearStartMonth)

    return {
      planStartDate,
      planEndDate,
      year1EndDate,
      year1Months,
      rationale: `You're within ${monthsLeft} month${monthsLeft === 1 ? '' : 's'} of your FY end. Year 1 spans the rest of this year plus the full next year (${year1Months} months total).`,
    }
  }

  // Standard 12-month: Year 1 = current FY
  const planStartDate = getFiscalYearStartDate(currentFY, yearStartMonth)
  const year1EndDate = getFiscalYearEndDate(currentFY, yearStartMonth)
  const planEndDate = getFiscalYearEndDate(currentFY + 2, yearStartMonth)

  return {
    planStartDate,
    planEndDate,
    year1EndDate,
    year1Months: 12,
    rationale: `Year 1 is the current fiscal year (12 months). Years 2 and 3 follow.`,
  }
}
