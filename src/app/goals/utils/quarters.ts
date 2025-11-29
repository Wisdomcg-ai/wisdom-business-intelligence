// /app/goals/utils/quarters.ts
// Helper functions for calculating fiscal/calendar quarters

import { YearType } from '../types'

export interface QuarterInfo {
  id: string
  label: string
  months: string
  title: string
  startMonth: number // 1-12
  endMonth: number // 1-12
  startDate: Date
  endDate: Date
  isPast: boolean
  isCurrent: boolean
  isNextQuarter: boolean // The next quarter after current (planning target)
  isLocked: boolean // Past OR current quarters are locked for planning
}

/**
 * Calculate quarter boundaries based on year type
 * FY = Fiscal Year ending June 30
 * CY = Calendar Year ending December 31
 */
export function calculateQuarters(yearType: YearType, planYear: number): QuarterInfo[] {
  let quarters: Omit<QuarterInfo, 'isNextQuarter' | 'isLocked'>[]

  if (yearType === 'FY') {
    // Fiscal Year ending June 30
    // Q1: Jul-Sep, Q2: Oct-Dec, Q3: Jan-Mar, Q4: Apr-Jun
    const fyStartYear = planYear - 1 // FY2026 starts in July 2025

    quarters = [
      {
        id: 'q1',
        label: 'Q1',
        months: 'Jul-Sep',
        title: 'Foundation',
        startMonth: 7,
        endMonth: 9,
        startDate: new Date(fyStartYear, 6, 1), // July 1
        endDate: new Date(fyStartYear, 8, 30), // Sep 30
        isPast: isQuarterPast(fyStartYear, 8, 30),
        isCurrent: isQuarterCurrent(fyStartYear, 6, 1, fyStartYear, 8, 30)
      },
      {
        id: 'q2',
        label: 'Q2',
        months: 'Oct-Dec',
        title: 'Execution',
        startMonth: 10,
        endMonth: 12,
        startDate: new Date(fyStartYear, 9, 1), // Oct 1
        endDate: new Date(fyStartYear, 11, 31), // Dec 31
        isPast: isQuarterPast(fyStartYear, 11, 31),
        isCurrent: isQuarterCurrent(fyStartYear, 9, 1, fyStartYear, 11, 31)
      },
      {
        id: 'q3',
        label: 'Q3',
        months: 'Jan-Mar',
        title: 'Scaling',
        startMonth: 1,
        endMonth: 3,
        startDate: new Date(planYear, 0, 1), // Jan 1
        endDate: new Date(planYear, 2, 31), // Mar 31
        isPast: isQuarterPast(planYear, 2, 31),
        isCurrent: isQuarterCurrent(planYear, 0, 1, planYear, 2, 31)
      },
      {
        id: 'q4',
        label: 'Q4',
        months: 'Apr-Jun',
        title: 'Planning',
        startMonth: 4,
        endMonth: 6,
        startDate: new Date(planYear, 3, 1), // Apr 1
        endDate: new Date(planYear, 5, 30), // Jun 30
        isPast: isQuarterPast(planYear, 5, 30),
        isCurrent: isQuarterCurrent(planYear, 3, 1, planYear, 5, 30)
      }
    ]
  } else {
    // Calendar Year ending December 31
    // Q1: Jan-Mar, Q2: Apr-Jun, Q3: Jul-Sep, Q4: Oct-Dec
    quarters = [
      {
        id: 'q1',
        label: 'Q1',
        months: 'Jan-Mar',
        title: 'Foundation',
        startMonth: 1,
        endMonth: 3,
        startDate: new Date(planYear, 0, 1), // Jan 1
        endDate: new Date(planYear, 2, 31), // Mar 31
        isPast: isQuarterPast(planYear, 2, 31),
        isCurrent: isQuarterCurrent(planYear, 0, 1, planYear, 2, 31)
      },
      {
        id: 'q2',
        label: 'Q2',
        months: 'Apr-Jun',
        title: 'Execution',
        startMonth: 4,
        endMonth: 6,
        startDate: new Date(planYear, 3, 1), // Apr 1
        endDate: new Date(planYear, 5, 30), // Jun 30
        isPast: isQuarterPast(planYear, 5, 30),
        isCurrent: isQuarterCurrent(planYear, 3, 1, planYear, 5, 30)
      },
      {
        id: 'q3',
        label: 'Q3',
        months: 'Jul-Sep',
        title: 'Scaling',
        startMonth: 7,
        endMonth: 9,
        startDate: new Date(planYear, 6, 1), // July 1
        endDate: new Date(planYear, 8, 30), // Sep 30
        isPast: isQuarterPast(planYear, 8, 30),
        isCurrent: isQuarterCurrent(planYear, 6, 1, planYear, 8, 30)
      },
      {
        id: 'q4',
        label: 'Q4',
        months: 'Oct-Dec',
        title: 'Planning',
        startMonth: 10,
        endMonth: 12,
        startDate: new Date(planYear, 9, 1), // Oct 1
        endDate: new Date(planYear, 11, 31), // Dec 31
        isPast: isQuarterPast(planYear, 11, 31),
        isCurrent: isQuarterCurrent(planYear, 9, 1, planYear, 11, 31)
      }
    ]
  }

  // Find the current quarter index
  const currentQuarterIndex = quarters.findIndex(q => q.isCurrent)

  // Add isNextQuarter and isLocked properties
  return quarters.map((q, index) => ({
    ...q,
    // isLocked: Past quarters AND current quarter are locked (already in execution)
    isLocked: q.isPast || q.isCurrent,
    // isNextQuarter: The quarter immediately after current is the planning target
    isNextQuarter: currentQuarterIndex !== -1 && index === currentQuarterIndex + 1
  }))
}

/**
 * Check if a quarter has already passed
 */
function isQuarterPast(year: number, month: number, day: number): boolean {
  const today = new Date()
  const quarterEnd = new Date(year, month, day)
  quarterEnd.setHours(23, 59, 59, 999) // End of day
  return today > quarterEnd
}

/**
 * Check if we're currently in this quarter
 */
function isQuarterCurrent(
  startYear: number,
  startMonth: number,
  startDay: number,
  endYear: number,
  endMonth: number,
  endDay: number
): boolean {
  const today = new Date()
  const quarterStart = new Date(startYear, startMonth, startDay)
  const quarterEnd = new Date(endYear, endMonth, endDay)
  quarterEnd.setHours(23, 59, 59, 999)
  return today >= quarterStart && today <= quarterEnd
}

/**
 * Determine the plan year based on year type and current date
 * If user is planning mid-year, we need to figure out which fiscal/calendar year they're planning for
 */
export function determinePlanYear(yearType: YearType): number {
  const today = new Date()
  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth() + 1 // 1-12

  if (yearType === 'FY') {
    // Fiscal year ending June 30
    // If we're in Jul-Dec, we're in the first half of FY (planning for next June)
    // If we're in Jan-Jun, we're in the second half of FY (planning for this June)
    if (currentMonth >= 7) {
      // Jul-Dec: Planning for FY ending June next year
      return currentYear + 1
    } else {
      // Jan-Jun: Planning for FY ending June this year
      return currentYear
    }
  } else {
    // Calendar year - always plan for current or next year
    // If we're past October, probably planning for next year
    if (currentMonth >= 11) {
      return currentYear + 1
    } else {
      return currentYear
    }
  }
}

/**
 * Get available (future) quarters for planning
 */
export function getAvailableQuarters(yearType: YearType, planYear: number): QuarterInfo[] {
  const allQuarters = calculateQuarters(yearType, planYear)
  return allQuarters.filter(q => !q.isPast)
}
