/**
 * line-distribution — Phase 51-00 (UX-S3-01 / UX-S3-02 / UX-S3-03 prerequisite)
 *
 * Lockstep helpers for revenue/COGS line monthly distribution + per-line
 * seasonality resolution. Modeled on Phase 50 Bug 4's `getPlannedSpendPLBreakdown`
 * (types.ts:331) — calculations referenced from BOTH the step UI AND the
 * rollup engine MUST be extracted to a single function so display and rollup
 * cannot drift.
 *
 * Today, the seasonality fallback `priorYear?.seasonalityPattern || Array(12).fill(8.33)`
 * is duplicated across 12+ call sites:
 *   - Step3RevenueCOGS.tsx lines 183, 210, 249, 379, 462, 603 (7 hits)
 *   - useForecastWizard.ts lines 304, 366, 890, 934, 1410 (5 hits)
 *
 * Plan 51-03 will migrate every site to `getEffectiveSeasonality` so per-line
 * overrides take effect everywhere consistently. 51-00 ships the helpers ONLY.
 *
 * NOT imported by anything in 51-00 itself — math-neutral by construction.
 */

import type { MonthlyData } from '../types';

const FALLBACK_SEASONALITY: readonly number[] = Object.freeze(Array(12).fill(8.33));

/**
 * Resolve which seasonality pattern applies to a given line.
 *
 * Priority: line-level override → business-level seasonality → 8.33% even split.
 *
 * @param line                Object with optional `seasonalityPattern` (12 percentages)
 * @param businessSeasonality Business-level fallback (typically priorYear.seasonalityPattern)
 * @returns 12-element array of percentages (sum may not be exactly 100 due to user input)
 */
export function getEffectiveSeasonality(
  line: { seasonalityPattern?: number[] },
  businessSeasonality: number[] | undefined,
): number[] {
  if (line.seasonalityPattern && line.seasonalityPattern.length === 12) {
    return line.seasonalityPattern;
  }
  if (businessSeasonality && businessSeasonality.length === 12) {
    return businessSeasonality;
  }
  return FALLBACK_SEASONALITY.slice();
}

/**
 * Distribute an annual target across the year's months, respecting:
 *  - Y1 actuals (locked months are not overwritten — they keep their existing value)
 *  - Per-line or business seasonality on the projected/remaining months
 *
 * Both Step 3 display (UX-S3-01 $ entry, UX-S3-02 Growth %, UX-S3-03 seasonality
 * override) AND `useForecastWizard.ts` summary rollup will call this single
 * function so the on-screen total and the summary cannot drift.
 *
 * Math:
 *   1. Sum locked-actual months from line.year1Monthly.
 *   2. remainingTarget = max(0, annualTarget - actualsTotal).
 *   3. For each non-actual month, distribute remainingTarget proportional to
 *      that month's seasonality weight / sum of seasonality weights for the
 *      remaining months.
 *
 * @param line                 Line with id, year1Monthly, optional seasonalityPattern
 * @param annualTarget         Target annual total for the line
 * @param businessSeasonality  Business-level fallback seasonality
 * @param monthKeys            Ordered FY month keys (e.g. ['2025-07', ..., '2026-06'])
 * @param isActualMonth        Predicate marking locked-actual months
 * @returns                    MonthlyData with one entry per monthKey
 */
export function getRevenueLineMonthlyDistribution(
  line: { id: string; year1Monthly: MonthlyData; seasonalityPattern?: number[] },
  annualTarget: number,
  businessSeasonality: number[] | undefined,
  monthKeys: string[],
  isActualMonth: (monthKey: string) => boolean,
): MonthlyData {
  const seasonality = getEffectiveSeasonality(line, businessSeasonality);

  // 1. Sum locked actuals.
  let actualsTotal = 0;
  monthKeys.forEach((key) => {
    if (isActualMonth(key)) actualsTotal += line.year1Monthly[key] || 0;
  });

  // 2. Compute remaining target and total seasonality weight on non-actual months.
  const remainingTarget = Math.max(0, annualTarget - actualsTotal);
  let remainingSeasonality = 0;
  monthKeys.forEach((key, idx) => {
    if (!isActualMonth(key)) remainingSeasonality += seasonality[idx] ?? 8.33;
  });

  // 3. Distribute.
  const out: MonthlyData = {};
  monthKeys.forEach((key, idx) => {
    if (isActualMonth(key)) {
      // Preserve locked actual exactly.
      out[key] = line.year1Monthly[key] || 0;
    } else if (remainingSeasonality > 0 && remainingTarget > 0) {
      const factor = (seasonality[idx] ?? 8.33) / remainingSeasonality;
      out[key] = Math.round(remainingTarget * factor);
    } else {
      out[key] = 0;
    }
  });

  return out;
}
