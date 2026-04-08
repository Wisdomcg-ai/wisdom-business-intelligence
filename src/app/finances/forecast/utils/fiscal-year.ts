// Fiscal Year Utilities
// Delegates to central fiscal-year-utils for configurable year type support.
// This file re-exports with backward-compatible signatures (default yearStartMonth=7).

import {
  getCurrentFiscalYear as _getCurrentFY,
  getFiscalYearLabel as _getFYLabel,
  getFiscalYearDateRange as _getFYDateRange,
  getFiscalYearStartDate as _getFYStartDate,
  getFiscalYearEndDate as _getFYEndDate,
  DEFAULT_YEAR_START_MONTH,
  isNearYearEnd,
} from '@/lib/utils/fiscal-year-utils'

/**
 * Get the current fiscal year based on today's date.
 * Accepts optional yearStartMonth (1-12) — defaults to 7 (July, AU FY).
 */
export function getCurrentFiscalYear(yearStartMonth: number = DEFAULT_YEAR_START_MONTH): number {
  return _getCurrentFY(yearStartMonth)
}

/**
 * Get the fiscal year for forecasting.
 * During planning season (within 3 months of year end), defaults to next FY
 * so coaches preparing the next budget see the right forecast.
 */
export function getForecastFiscalYear(yearStartMonth: number = DEFAULT_YEAR_START_MONTH): number {
  const currentFY = getCurrentFiscalYear(yearStartMonth)
  // During planning season (within 3 months of year end), default to next FY
  if (isNearYearEnd(new Date(), yearStartMonth, 3)) {
    return currentFY + 1
  }
  return currentFY
}

/**
 * Check if we are currently in planning season (within 3 months of fiscal year end).
 * Used to show planning season banners in the UI.
 */
export function isPlanningSeasonActive(yearStartMonth: number = DEFAULT_YEAR_START_MONTH): boolean {
  return isNearYearEnd(new Date(), yearStartMonth, 3)
}

/**
 * Get fiscal year label (e.g., "FY2026" or "CY2026")
 */
export function getFiscalYearLabel(fiscalYear: number, yearStartMonth: number = DEFAULT_YEAR_START_MONTH): string {
  return _getFYLabel(fiscalYear, yearStartMonth)
}

/**
 * Get fiscal year date range as a human-readable string
 */
export function getFiscalYearDateRange(fiscalYear: number, yearStartMonth: number = DEFAULT_YEAR_START_MONTH): string {
  return _getFYDateRange(fiscalYear, yearStartMonth)
}

/**
 * Get the start date of a fiscal year
 */
export function getFiscalYearStartDate(fiscalYear: number, yearStartMonth: number = DEFAULT_YEAR_START_MONTH): Date {
  return _getFYStartDate(fiscalYear, yearStartMonth)
}

/**
 * Get the end date of a fiscal year
 */
export function getFiscalYearEndDate(fiscalYear: number, yearStartMonth: number = DEFAULT_YEAR_START_MONTH): Date {
  return _getFYEndDate(fiscalYear, yearStartMonth)
}

/**
 * Check if a date falls within a fiscal year
 */
export function isDateInFiscalYear(date: Date, fiscalYear: number, yearStartMonth: number = DEFAULT_YEAR_START_MONTH): boolean {
  const fyStart = getFiscalYearStartDate(fiscalYear, yearStartMonth)
  const fyEnd = getFiscalYearEndDate(fiscalYear, yearStartMonth)
  return date >= fyStart && date <= fyEnd
}

/**
 * Get available fiscal years for selection
 */
export function getAvailableFiscalYears(yearStartMonth: number = DEFAULT_YEAR_START_MONTH): { year: number; label: string; isCurrent: boolean }[] {
  const currentFY = getCurrentFiscalYear(yearStartMonth)
  return [
    { year: currentFY, label: getFiscalYearLabel(currentFY, yearStartMonth), isCurrent: true },
    { year: currentFY + 1, label: getFiscalYearLabel(currentFY + 1, yearStartMonth), isCurrent: false },
  ]
}
