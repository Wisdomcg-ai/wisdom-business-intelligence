/**
 * Phase 72-02 — Shared plan-period utility (sibling to Phase 68 B15 quarters helper).
 *
 * Problem: the forecast wizard's Step 3 conflated "current fiscal year" with
 * "plan Year 1". For standard 12-month plans these are identical, but for
 * extended-period plans (Phase 14 — see `business_financial_goals` columns
 * `is_extended_period`, `year1_months`, `plan_start_date`, `year1_end_date`)
 * plan Y1 can span 13-15 months and start mid-FY. Step 3 hardcoded a 12-month
 * window starting at `fiscalYear - 1` and locked actuals against that window.
 *
 * For Armstrong on 2026-05-31: monthKeys = `2025-07..2026-06`,
 * `remainingMonthsCount = 12 - 9 = 3` → only 3 editable cells. Plan Y1
 * actually = `2026-06..2027-06` (13 months) — 12 of which never appeared.
 *
 * This module provides two pure helpers consumed by Step 3 (and any future
 * wizard step that renders a per-plan-Y1 monthly grid). They are pure
 * functions so callers can inject `today` for deterministic testing — the
 * same pattern Phase 68 B15 used for `deriveCurrentRemainderColumn`.
 *
 * `deriveCurrentRemainderColumn` (in src/app/goals/utils/quarters.ts) is
 * NOT modified or moved. It serves a different consumer (the goals wizard's
 * "Now" pseudo-column for an annual plan). This module is a sibling, not a
 * refactor — inlining a parallel implementation in Step 3 was specifically
 * the drift hazard Phase 68 paid down.
 */

import {
  generateFiscalMonthKeys,
  DEFAULT_YEAR_START_MONTH,
} from './fiscal-year-utils';

/**
 * Plan-period slice as it appears on `business_financial_goals` (mirrored
 * onto `ForecastWizardState`). Fields are deserialised by
 * `src/app/goals/services/financial-service.ts:265-275`; raw dates are
 * `YYYY-MM-DD` strings (the date columns from PostgreSQL).
 *
 * Standard 12-month plans: `isExtendedPeriod=false`, `year1Months=12`,
 * `planStartDate=null`, `year1EndDate=null` (the wizard's pre-Phase-14
 * default — fall through to fiscal-year boundaries).
 *
 * Extended plans (Phase 14): `isExtendedPeriod=true`, `year1Months` ∈ [13, 15],
 * `planStartDate` = first day of the operator-chosen month, `year1EndDate`
 * = last day of the FY one year after.
 */
export interface PlanPeriod {
  isExtendedPeriod: boolean;
  /** Total months in plan Year 1. 12 for standard, 13-15 for extended. */
  year1Months: number;
  /** ISO `YYYY-MM-DD`. First calendar day of plan Y1. Null when not set. */
  planStartDate: string | null;
  /** ISO `YYYY-MM-DD`. Last calendar day of plan Y1. Null when not set. */
  year1EndDate: string | null;
}

/**
 * Parse a `YYYY-MM-DD` string into a year + month-of-year (1-12) pair.
 * Returns null when the input is null/missing/unparseable — never throws.
 *
 * We deliberately parse manually (not `new Date(s)`) to avoid timezone shifts
 * — a Date constructed from `'2026-06-01'` is treated as UTC, which can shift
 * by one day depending on the local timezone. Plan-period dates are wall-clock
 * dates with no time component.
 */
function parseYYYYMMDD(s: string | null | undefined): { year: number; month: number } | null {
  if (!s || typeof s !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  if (month < 1 || month > 12) return null;
  return { year, month };
}

/**
 * Compute the YYYY-MM month keys covered by plan Year 1.
 *
 * - Standard 12-month plan (planPeriod=null OR isExtendedPeriod=false):
 *     returns the active fiscal year's 12 keys via `generateFiscalMonthKeys`.
 *     This preserves pre-Phase-72 behaviour for every existing plan.
 *
 * - Extended plan (isExtendedPeriod=true AND planStartDate set AND year1Months>0):
 *     returns the `year1Months` consecutive YYYY-MM keys starting at
 *     planStartDate's month. For Armstrong (planStartDate=2026-06-01,
 *     year1Months=13): `2026-06, 2026-07, ..., 2027-06`.
 *
 * Pure function. `yearStartMonth` defaults to 7 (AU FY).
 *
 * Defensive fall-through: if isExtendedPeriod=true but planStartDate is null
 * (operator hasn't filled it in yet) OR year1Months is non-positive, falls
 * through to the standard 12-month range — the wizard remains usable rather
 * than rendering an empty grid.
 */
export function getPlanY1MonthKeys(
  fiscalYear: number,
  planPeriod: PlanPeriod | null,
  yearStartMonth: number = DEFAULT_YEAR_START_MONTH,
): string[] {
  if (
    !planPeriod ||
    !planPeriod.isExtendedPeriod ||
    !planPeriod.planStartDate ||
    planPeriod.year1Months <= 0
  ) {
    return generateFiscalMonthKeys(fiscalYear, yearStartMonth);
  }

  const start = parseYYYYMMDD(planPeriod.planStartDate);
  if (!start) {
    // Malformed planStartDate — fall through to standard 12mo so the wizard
    // remains usable. The data layer should never produce this, but defensive
    // null-handling avoids a hard crash on a typo'd manual override.
    return generateFiscalMonthKeys(fiscalYear, yearStartMonth);
  }

  // Cap at a sane upper bound so a bad year1Months value can't blow up the
  // grid. Phase 14 documents 15 as the max for AU FY (Apr planning season),
  // but we cap at 24 to leave headroom for future CY/half-year experiments
  // without making this util the limiting factor.
  const months = Math.min(Math.max(1, Math.floor(planPeriod.year1Months)), 24);

  const keys: string[] = [];
  let year = start.year;
  let monthOfYear = start.month; // 1-12

  for (let i = 0; i < months; i++) {
    keys.push(`${year}-${String(monthOfYear).padStart(2, '0')}`);
    monthOfYear += 1;
    if (monthOfYear > 12) {
      monthOfYear = 1;
      year += 1;
    }
  }

  return keys;
}

/**
 * Given the set of plan-Y1 month keys and the currentYTD actuals payload,
 * return the subset of keys that should be LOCKED as actuals (rendered
 * non-editable, fed from Xero's posted P&L). For extended plans whose
 * `planStartDate` is in the future, returns an empty Set — nothing has
 * elapsed yet.
 *
 * The membership test is simply the intersection of `planY1MonthKeys` with
 * the keys present in `currentYTDRevenueByMonth`. The currentYTD payload is
 * already keyed by `YYYY-MM` (matching our keys). This replaces the old
 * `12 - currentYTD.months_count` calculation which only worked when plan Y1
 * coincided with the current fiscal year.
 *
 * `today` is accepted to support a future short-circuit where we skip the
 * lookup entirely if `planStartDate > today` (no actuals possible). It is
 * NOT currently used because the same outcome falls out of the intersection
 * (the API won't return keys outside the current FY YTD), but the parameter
 * is reserved so consumers don't need to add it later.
 */
export function getActualMonthKeysForPlanY1(
  planY1MonthKeys: string[],
  currentYTDRevenueByMonth: Record<string, number> | null | undefined,
  today: Date = new Date(),
  planStartDate: string | null = null,
): Set<string> {
  if (!currentYTDRevenueByMonth) return new Set<string>();

  // If planStartDate is after today, no months have elapsed → no actuals.
  // We compare YYYY-MM strings directly to avoid timezone weirdness.
  if (planStartDate) {
    const start = parseYYYYMMDD(planStartDate);
    if (start) {
      const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      const startKey = `${start.year}-${String(start.month).padStart(2, '0')}`;
      if (startKey > todayKey) return new Set<string>();
    }
  }

  const ytdKeys = new Set(Object.keys(currentYTDRevenueByMonth));
  const out = new Set<string>();
  for (const key of planY1MonthKeys) {
    if (ytdKeys.has(key)) out.add(key);
  }
  return out;
}
