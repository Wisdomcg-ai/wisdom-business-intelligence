/**
 * Forecast Seed Service
 *
 * Pure transformer — no I/O, no DB, no fetch, no Sentry, no process.env.
 * Takes a prior FY's ForecastAssumptions and returns a target FY's assumptions
 * payload ready for write, plus the forecastDuration passthrough.
 *
 * Three operator-confirmed decisions (2026-05-11):
 *  1. team.plannedHires is CLEARED (not shifted) — year-specific events.
 *  2. forecastDuration is COPIED verbatim from the prior forecast row's column.
 *  3. opex.lines[].expectedMonths are SHIFTED +1 year (adhoc schedule correctness).
 */

import type { ForecastAssumptions } from '@/app/finances/forecast/components/wizard-v4/types/assumptions'

// ─── Exports ──────────────────────────────────────────────────────────────────

export interface SeedResult {
  assumptions: ForecastAssumptions
  /** Copied verbatim from the prior forecast row's forecast_duration column. */
  forecastDuration: number
}

// ─── Internal Regex ───────────────────────────────────────────────────────────

const MONTH_KEY_REGEX = /^\d{4}-\d{2}$/

// ─── shiftMonthKeys ───────────────────────────────────────────────────────────

/**
 * Shift YYYY-MM keys forward by `yearDelta` years. Malformed keys are silently
 * dropped (research pitfall 2). Returns a fresh object — does not mutate input.
 */
export function shiftMonthKeys(
  src: Record<string, number> | undefined,
  yearDelta: number = 1,
): Record<string, number> {
  if (!src) return {}
  const result: Record<string, number> = {}
  for (const [key, val] of Object.entries(src)) {
    if (!MONTH_KEY_REGEX.test(key)) continue
    const year = parseInt(key.slice(0, 4), 10) + yearDelta
    result[`${year}-${key.slice(5)}`] = val
  }
  return result
}

// ─── isForecastSeedable ───────────────────────────────────────────────────────

/**
 * Idempotency gate. Returns true if the target forecast can be safely seeded:
 *   - assumptions is null/undefined, OR
 *   - assumptions has empty revenue.lines AND no pl_lines rows exist
 *
 * The check looks ONLY at revenue.lines (the canonical "wizard save happened"
 * signal — research pitfall 4). An assumptions row with only default goals
 * does NOT block seed.
 */
export function isForecastSeedable(
  assumptions: ForecastAssumptions | null | undefined,
  plLineCount: number,
): boolean {
  if (plLineCount > 0) return false
  if (!assumptions) return true
  const revLines = assumptions?.revenue?.lines ?? []
  return revLines.length === 0
}

// ─── seedForecastFromPrior ────────────────────────────────────────────────────

/**
 * Transform a prior FY's ForecastAssumptions into a target FY assumptions
 * payload ready for write. Pure function — no I/O.
 *
 * Honors three operator-confirmed decisions (2026-05-11):
 *  1. team.plannedHires is CLEARED (not shifted) — year-specific events.
 *  2. forecastDuration is COPIED verbatim from prior — most coaches reforecast
 *     the same horizon they planned last year.
 *  3. opex.lines[].expectedMonths are SHIFTED +1 year (Open Q4 fix — adhoc
 *     schedule must reference months in the target FY, not the prior FY).
 */
export function seedForecastFromPrior(
  priorAssumptions: ForecastAssumptions,
  targetFiscalYear: number,
  priorForecastDuration: number,
): SeedResult {
  // Deep clone — no mutation of input (purity invariant, Group H)
  const next = structuredClone(priorAssumptions)
  const now = new Date().toISOString()

  // ── Strip excluded sections (research Q3) ──────────────────────────────────
  delete next.goals
  next.capex = { items: [] }
  next.plannedSpends = []
  delete next.subscriptions
  delete next.priorYearByMonth

  // ── Metadata ───────────────────────────────────────────────────────────────
  next.createdAt = now
  next.updatedAt = now

  // ── Revenue line month shifts (research Q2 + Code Examples) ───────────────
  next.revenue.lines = next.revenue.lines.map(line => ({
    ...line,
    year1Monthly: shiftMonthKeys(line.year1Monthly),
    year2Monthly: shiftMonthKeys(line.year2Monthly),
    year3Monthly: shiftMonthKeys(line.year3Monthly),
    // Legacy quarterly fields are derived; null out so wizard doesn't read stale values
    year2Quarterly: undefined,
    year3Quarterly: undefined,
  }))

  // ── COGS line month shifts ────────────────────────────────────────────────
  next.cogs.lines = next.cogs.lines.map(line => ({
    ...line,
    year1Monthly: shiftMonthKeys(line.year1Monthly),
    year2Monthly: shiftMonthKeys(line.year2Monthly),
    year3Monthly: shiftMonthKeys(line.year3Monthly),
  }))

  // ── Team — preserve existingTeam + ratios, CLEAR plannedHires (decision 1) ─
  next.team = {
    ...next.team,
    plannedHires: [],
  }

  // ── OpEx — shift adhoc expectedMonths arrays (research Open Q4, decision 3) ─
  next.opex.lines = next.opex.lines.map(line => ({
    ...line,
    expectedMonths: line.expectedMonths
      ? line.expectedMonths
          .filter((m: string) => MONTH_KEY_REGEX.test(m))
          .map((m: string) => {
            const year = parseInt(m.slice(0, 4), 10) + 1
            return `${year}-${m.slice(5)}`
          })
      : line.expectedMonths,
  }))

  // ── targetFiscalYear is accepted for API symmetry; no assumptions key stores it ─
  void targetFiscalYear

  return {
    assumptions: next,
    forecastDuration: priorForecastDuration,
  }
}
