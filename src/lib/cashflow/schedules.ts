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
  /**
   * PAYG withholding on a monthly activity statement, with each quarter's
   * third month paid on the tax agent's BAS date instead of the 21st: Sep and
   * Oct in November, Nov in December, Dec and Jan in February, Feb in March,
   * Mar and Apr in May, May in June, Jun and Jul in August. Read off Urban
   * Road's August 2026 Calxa pack, whose PAYG row pays Nov 21,008 (Sep + Oct),
   * Dec 13,130 (Nov), Feb 21,701 (Dec + Jan), Mar (Feb), May 25,194 (Mar +
   * Apr), Jun (May) and Aug (Jun).
   */
  monthly_ias_quarterly_bas_agent: [2, 3, 5, 5, 6, 8, 8, 9, 11, 11, 12, 2],
  /** The same monthly IAS, self-lodged: every month the 21st of the next, December's in February. */
  monthly_ias_quarterly_bas_self:  [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 2],
  /** One month in arrears: Calxa's super on Urban Road's pack (Oct 5,042 = September's super). */
  monthly_arrears:            [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1],
  /**
   * Paid in the month it accrues. Payday Super (from 1 July 2026) is paid
   * within days of each pay run, and Urban Road's ledger shows it: Super
   * Payable is cleared every week and holds only the last run's $1,260.47 at
   * a month-end.
   */
  payday:                     [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
}

/**
 * The 'YYYY-MM' an accrual in `accrualKey` is paid in, per `basePeriods`.
 *
 * The schedule says only the calendar month; the year is the first one at or
 * after the accrual — offset (due − accrual + 12) % 12 months, so 0 is the
 * same month. A September accrual on quarterly_feb_may_aug_nov is due 11 →
 * November of the same year; a December one is due 2 → February of the next.
 */
export function dueMonthKey(accrualKey: string, basePeriods: BasePeriods): string {
  const [y, m] = accrualKey.split('-').map(Number)
  const due = getPaymentMonth(m, basePeriods)
  const offset = (due - m + 12) % 12
  const total = y * 12 + (m - 1) + offset
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
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
