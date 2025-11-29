// Fiscal Year Utilities
// Australian fiscal year runs July 1 - June 30

/**
 * Get the current fiscal year based on today's date
 * Australian fiscal year: July 1 - June 30
 *
 * Examples:
 * - January 2026 -> FY2026 (ends June 30, 2026)
 * - July 2025 -> FY2026 (ends June 30, 2026)
 * - June 2026 -> FY2026 (ends June 30, 2026)
 * - July 2026 -> FY2027 (ends June 30, 2027)
 */
export function getCurrentFiscalYear(): number {
  const today = new Date()
  const month = today.getMonth() // 0-11 (Jan=0, Dec=11)
  const year = today.getFullYear()

  // If we're in July-December (months 6-11), we're in the fiscal year ending next year
  // If we're in January-June (months 0-5), we're in the fiscal year ending this year
  return month >= 6 ? year + 1 : year
}

/**
 * Get the fiscal year for forecasting
 * This is typically the current fiscal year, but if we're in the last quarter
 * of the fiscal year (April-June), we might want to start planning for next year
 */
export function getForecastFiscalYear(): number {
  const today = new Date()
  const month = today.getMonth()
  const currentFY = getCurrentFiscalYear()

  // If we're in April-June (Q4 of the fiscal year),
  // the user might want to forecast for next year
  // For now, we always forecast for current FY
  // This can be extended to show a selector in the UI
  return currentFY
}

/**
 * Get fiscal year label (e.g., "FY2026")
 */
export function getFiscalYearLabel(fiscalYear: number): string {
  return `FY${fiscalYear}`
}

/**
 * Get fiscal year date range as a human-readable string
 * e.g., "Jul 2025 - Jun 2026" for FY2026
 */
export function getFiscalYearDateRange(fiscalYear: number): string {
  const startYear = fiscalYear - 1
  const endYear = fiscalYear
  return `Jul ${startYear} - Jun ${endYear}`
}

/**
 * Get the start date of a fiscal year
 * FY2026 starts July 1, 2025
 */
export function getFiscalYearStartDate(fiscalYear: number): Date {
  return new Date(fiscalYear - 1, 6, 1) // July 1 of previous calendar year
}

/**
 * Get the end date of a fiscal year
 * FY2026 ends June 30, 2026
 */
export function getFiscalYearEndDate(fiscalYear: number): Date {
  return new Date(fiscalYear, 5, 30) // June 30 of fiscal year
}

/**
 * Check if a date falls within a fiscal year
 */
export function isDateInFiscalYear(date: Date, fiscalYear: number): boolean {
  const fyStart = getFiscalYearStartDate(fiscalYear)
  const fyEnd = getFiscalYearEndDate(fiscalYear)
  return date >= fyStart && date <= fyEnd
}

/**
 * Get available fiscal years for selection
 * Returns current FY and next FY
 */
export function getAvailableFiscalYears(): { year: number; label: string; isCurrent: boolean }[] {
  const currentFY = getCurrentFiscalYear()
  return [
    { year: currentFY, label: getFiscalYearLabel(currentFY), isCurrent: true },
    { year: currentFY + 1, label: getFiscalYearLabel(currentFY + 1), isCurrent: false }
  ]
}
