/**
 * Central Fiscal Year Utilities
 *
 * All date-boundary logic for configurable year types.
 * yearStartMonth: 1-12 (1=Jan for CY, 7=Jul for AU FY)
 * Default: 7 (Australian Financial Year)
 */

export type YearType = 'FY' | 'CY'

/** Default for Australian businesses */
export const DEFAULT_YEAR_START_MONTH = 7

const MONTH_ABBREVS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// ─── Core Calculations ──────────────────────────────────────────────────────

/**
 * Get the fiscal year number for a given date.
 * The fiscal year is named after the calendar year in which it ENDS.
 *
 * yearStartMonth=7 (AU FY): Jul 2025 → FY2026, Jun 2026 → FY2026
 * yearStartMonth=1 (CY):    Jan 2026 → CY2026, Dec 2026 → CY2026
 */
export function getFiscalYear(date: Date, yearStartMonth: number = DEFAULT_YEAR_START_MONTH): number {
  const month = date.getMonth() + 1 // 1-12
  const year = date.getFullYear()

  if (yearStartMonth === 1) return year // CY: fiscal year = calendar year

  // FY: if we're in or past the start month, we're in the year ending next CY
  return month >= yearStartMonth ? year + 1 : year
}

/**
 * Get the current fiscal year.
 */
export function getCurrentFiscalYear(yearStartMonth: number = DEFAULT_YEAR_START_MONTH): number {
  return getFiscalYear(new Date(), yearStartMonth)
}

/**
 * Convert a calendar month (1-12) to a 0-based fiscal month index.
 * yearStartMonth=7: Jul=0, Aug=1, ..., Jun=11
 * yearStartMonth=1: Jan=0, Feb=1, ..., Dec=11
 */
export function getFiscalMonthIndex(calendarMonth: number, yearStartMonth: number = DEFAULT_YEAR_START_MONTH): number {
  return ((calendarMonth - yearStartMonth) + 12) % 12
}

/**
 * Convert a 0-based fiscal month index back to calendar month (1-12).
 * yearStartMonth=7: index 0 → Jul(7), index 11 → Jun(6)
 * yearStartMonth=1: index 0 → Jan(1), index 11 → Dec(12)
 */
export function calendarMonthFromFiscalIndex(fiscalIndex: number, yearStartMonth: number = DEFAULT_YEAR_START_MONTH): number {
  return ((yearStartMonth - 1 + fiscalIndex) % 12) + 1
}

// ─── Month Labels & Keys ────────────────────────────────────────────────────

/**
 * Get ordered month abbreviations for the fiscal year.
 * yearStartMonth=7: ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']
 * yearStartMonth=1: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
 */
export function getFiscalMonthLabels(yearStartMonth: number = DEFAULT_YEAR_START_MONTH): string[] {
  const labels: string[] = []
  for (let i = 0; i < 12; i++) {
    const calMonth = calendarMonthFromFiscalIndex(i, yearStartMonth)
    labels.push(MONTH_ABBREVS[calMonth - 1])
  }
  return labels
}

/**
 * Generate YYYY-MM month keys for a fiscal year.
 * yearStartMonth=7, fiscalYear=2026: ['2025-07', '2025-08', ..., '2026-06']
 * yearStartMonth=1, fiscalYear=2026: ['2026-01', '2026-02', ..., '2026-12']
 */
export function generateFiscalMonthKeys(fiscalYear: number, yearStartMonth: number = DEFAULT_YEAR_START_MONTH): string[] {
  const keys: string[] = []
  for (let i = 0; i < 12; i++) {
    const calMonth = calendarMonthFromFiscalIndex(i, yearStartMonth)
    // Determine the calendar year for this month
    const calYear = calMonth >= yearStartMonth
      ? fiscalYear - 1  // First half: e.g., Jul 2025 for FY2026
      : fiscalYear       // Second half: e.g., Jan 2026 for FY2026
    // Special case: CY where start=1, all months are in the same year
    const year = yearStartMonth === 1 ? fiscalYear : calYear
    keys.push(`${year}-${String(calMonth).padStart(2, '0')}`)
  }
  return keys
}

// ─── Fiscal Year Boundaries ─────────────────────────────────────────────────

/**
 * Get the start date of a fiscal year.
 * yearStartMonth=7, fiscalYear=2026: July 1, 2025
 * yearStartMonth=1, fiscalYear=2026: January 1, 2026
 */
export function getFiscalYearStartDate(fiscalYear: number, yearStartMonth: number = DEFAULT_YEAR_START_MONTH): Date {
  const calYear = yearStartMonth === 1 ? fiscalYear : fiscalYear - 1
  return new Date(calYear, yearStartMonth - 1, 1)
}

/**
 * Get the end date of a fiscal year.
 * yearStartMonth=7, fiscalYear=2026: June 30, 2026
 * yearStartMonth=1, fiscalYear=2026: December 31, 2026
 */
export function getFiscalYearEndDate(fiscalYear: number, yearStartMonth: number = DEFAULT_YEAR_START_MONTH): Date {
  // End month is the month before yearStartMonth
  const endMonth = ((yearStartMonth - 2) + 12) % 12 // 0-indexed
  const endYear = yearStartMonth === 1 ? fiscalYear : fiscalYear
  // Last day of end month
  const lastDay = new Date(endYear, endMonth + 1, 0).getDate()
  return new Date(endYear, endMonth, lastDay)
}

/**
 * Get fiscal year date range as a human-readable string.
 * yearStartMonth=7, fiscalYear=2026: "Jul 2025 - Jun 2026"
 * yearStartMonth=1, fiscalYear=2026: "Jan 2026 - Dec 2026"
 */
export function getFiscalYearDateRange(fiscalYear: number, yearStartMonth: number = DEFAULT_YEAR_START_MONTH): string {
  const start = getFiscalYearStartDate(fiscalYear, yearStartMonth)
  const end = getFiscalYearEndDate(fiscalYear, yearStartMonth)
  const startLabel = MONTH_ABBREVS[start.getMonth()]
  const endLabel = MONTH_ABBREVS[end.getMonth()]
  return `${startLabel} ${start.getFullYear()} - ${endLabel} ${end.getFullYear()}`
}

/**
 * Get fiscal year label.
 * yearStartMonth=7: "FY2026"
 * yearStartMonth=1: "CY2026"
 */
export function getFiscalYearLabel(fiscalYear: number, yearStartMonth: number = DEFAULT_YEAR_START_MONTH): string {
  const prefix = yearStartMonth === 1 ? 'CY' : 'FY'
  return `${prefix}${fiscalYear}`
}

// ─── Quarter Logic ──────────────────────────────────────────────────────────

export interface QuarterDef {
  quarter: number     // 1-4
  label: string       // "Q1"
  months: string      // "Jul-Sep"
  startMonth: number  // calendar month 1-12
  endMonth: number    // calendar month 1-12
}

/**
 * Get quarter definitions for a given year start month.
 * Quarters are always 3 months each, starting from yearStartMonth.
 */
export function getQuarterDefs(yearStartMonth: number = DEFAULT_YEAR_START_MONTH): QuarterDef[] {
  const defs: QuarterDef[] = []
  for (let q = 0; q < 4; q++) {
    const startIdx = q * 3
    const startMonth = calendarMonthFromFiscalIndex(startIdx, yearStartMonth)
    const endMonth = calendarMonthFromFiscalIndex(startIdx + 2, yearStartMonth)
    const startAbbrev = MONTH_ABBREVS[startMonth - 1]
    const endAbbrev = MONTH_ABBREVS[endMonth - 1]
    defs.push({
      quarter: q + 1,
      label: `Q${q + 1}`,
      months: `${startAbbrev}-${endAbbrev}`,
      startMonth,
      endMonth,
    })
  }
  return defs
}

/**
 * Get which quarter (1-4) a calendar month belongs to.
 * yearStartMonth=7: Jul=Q1, Oct=Q2, Jan=Q3, Apr=Q4
 * yearStartMonth=1: Jan=Q1, Apr=Q2, Jul=Q3, Oct=Q4
 */
export function getQuarterForMonth(calendarMonth: number, yearStartMonth: number = DEFAULT_YEAR_START_MONTH): number {
  const fiscalIndex = getFiscalMonthIndex(calendarMonth, yearStartMonth)
  return Math.floor(fiscalIndex / 3) + 1
}

// ─── Forecast Period Helpers ────────────────────────────────────────────────

/**
 * Calculate forecast periods for a fiscal year.
 * Replaces the hardcoded calculateForecastPeriods in forecast-service.ts.
 */
export function calculateForecastPeriods(fiscalYear: number, yearStartMonth: number = DEFAULT_YEAR_START_MONTH) {
  const today = new Date()
  const fyStart = getFiscalYearStartDate(fiscalYear, yearStartMonth)
  const fyEnd = getFiscalYearEndDate(fiscalYear, yearStartMonth)

  // Baseline is always the prior fiscal year
  const priorFYKeys = generateFiscalMonthKeys(fiscalYear - 1, yearStartMonth)
  const baselineStart = priorFYKeys[0]
  const baselineEnd = priorFYKeys[priorFYKeys.length - 1]

  const currentFYKeys = generateFiscalMonthKeys(fiscalYear, yearStartMonth)
  const fyStartStr = currentFYKeys[0]
  const fyEndStr = currentFYKeys[currentFYKeys.length - 1]

  if (today >= fyStart && today <= fyEnd) {
    // Rolling forecast — split into actuals + remaining
    const lastCompleteMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const lastCompleteStr = `${lastCompleteMonth.getFullYear()}-${String(lastCompleteMonth.getMonth() + 1).padStart(2, '0')}`
    const forecastStart = new Date(today.getFullYear(), today.getMonth(), 1)
    const forecastStartStr = `${forecastStart.getFullYear()}-${String(forecastStart.getMonth() + 1).padStart(2, '0')}`

    return {
      baseline_start_month: baselineStart,
      baseline_end_month: baselineEnd,
      actual_start_month: fyStartStr,
      actual_end_month: lastCompleteStr,
      forecast_start_month: forecastStartStr,
      forecast_end_month: fyEndStr,
      is_rolling: true,
    }
  }

  // Not in FY yet — entire period is forecast
  return {
    baseline_start_month: baselineStart,
    baseline_end_month: baselineEnd,
    actual_start_month: fyStartStr,
    actual_end_month: priorFYKeys[priorFYKeys.length - 1], // placeholder
    forecast_start_month: fyStartStr,
    forecast_end_month: fyEndStr,
    is_rolling: false,
  }
}

/**
 * Convert yearStartMonth to YearType shorthand.
 */
export function yearTypeFromStartMonth(yearStartMonth: number): YearType {
  return yearStartMonth === 1 ? 'CY' : 'FY'
}

/**
 * Convert YearType to yearStartMonth.
 */
export function startMonthFromYearType(yearType: YearType): number {
  return yearType === 'CY' ? 1 : 7
}
