/**
 * Schedule helpers — Phase 28.3
 *
 * BasePeriods[12] is Calxa's data structure for payment timing.
 * Index = accrual month - 1 (0 = Jan, 11 = Dec)
 * Value = calendar month when payment is due (1-12)
 *
 * Example "quarterly_bas_au" = [4,4,4,7,7,7,10,10,10,2,2,2]
 * Means: Jan accruals pay in Apr; Feb accruals pay in Apr; ...; Dec accruals pay in Feb.
 *
 * This module provides schedule lookup + payment-month calculation.
 * Schedules are stored in the cashflow_schedules table (seeded in migration).
 * System schedules have business_id = NULL and is_system = true.
 */

export type BasePeriods = number[]  // length 12

/** Built-in schedules (mirror of seeded DB rows, used as fallback) */
export const SYSTEM_SCHEDULES: Record<string, BasePeriods> = {
  monthly:                    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  quarterly_bas_au:           [4, 4, 4, 7, 7, 7, 10, 10, 10, 2, 2, 2],
  quarterly_super_au:         [4, 4, 4, 7, 7, 7, 10, 10, 10, 1, 1, 1],
  quarterly_payg_instalment:  [4, 4, 4, 7, 7, 7, 10, 10, 10, 2, 2, 2],
  quarterly_feb_may_aug_nov:  [5, 5, 5, 8, 8, 8, 11, 11, 11, 2, 2, 2],
  annual_aug:                 [8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8],
}

/**
 * Given an accrual calendar month (1-12), return the calendar month (1-12)
 * when the payment is due per this schedule.
 */
export function getPaymentMonth(accrualCalendarMonth: number, basePeriods: BasePeriods): number {
  if (accrualCalendarMonth < 1 || accrualCalendarMonth > 12) {
    throw new Error(`accrualCalendarMonth must be 1-12, got ${accrualCalendarMonth}`)
  }
  return basePeriods[accrualCalendarMonth - 1]
}

/**
 * Given the current calendar month, return true if a payment on this schedule
 * is due this month (i.e. some earlier accrual month's payment lands here).
 */
export function isPaymentMonth(currentCalendarMonth: number, basePeriods: BasePeriods): boolean {
  return basePeriods.includes(currentCalendarMonth)
}

/**
 * Resolve a schedule by name. Checks the system schedules first; caller
 * can extend with business-specific schedules loaded from DB.
 */
export function resolveSystemSchedule(name: string): BasePeriods | null {
  return SYSTEM_SCHEDULES[name] ?? null
}

/**
 * Validate that an array is a well-formed BasePeriods[12].
 */
export function isValidBasePeriods(arr: unknown): arr is BasePeriods {
  if (!Array.isArray(arr) || arr.length !== 12) return false
  for (const v of arr) {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 12) return false
  }
  return true
}
