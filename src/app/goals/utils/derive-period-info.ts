import { ExtendedPeriodInfo } from '../types'

export interface PlanPeriodDates {
  planStartDate: Date
  planEndDate: Date
  year1EndDate: Date
}

/**
 * Derive Phase 14 ExtendedPeriodInfo from Phase 42 persisted dates.
 * Single source of truth for the relationship "Year 1 length -> isExtendedPeriod boolean".
 *
 * Threshold: days > 366 is "extended". 365/366 day Year 1s (standard FY +/- leap)
 * are NOT classified as extended. year1Months uses an inclusive calendar-month diff
 * (because year1EndDate is the LAST day of Year 1).
 */
export function derivePeriodInfo(period: PlanPeriodDates): ExtendedPeriodInfo {
  const ms = period.year1EndDate.getTime() - period.planStartDate.getTime()
  const days = Math.round(ms / (1000 * 60 * 60 * 24))
  // 365-day standard year; anything materially longer is "extended"
  // (covers leap year noise: 366 days is still standard)
  const isExtendedPeriod = days > 366

  // Calendar-month diff between planStartDate and year1EndDate (inclusive end)
  const months =
    (period.year1EndDate.getFullYear() - period.planStartDate.getFullYear()) * 12 +
    (period.year1EndDate.getMonth() - period.planStartDate.getMonth()) + 1

  const year1Months = months
  const currentYearRemainingMonths = isExtendedPeriod ? Math.max(0, year1Months - 12) : 0

  return { isExtendedPeriod, year1Months, currentYearRemainingMonths }
}
