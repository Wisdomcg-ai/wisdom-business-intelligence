/**
 * "As budgeted" OpEx lines — ONE projection shared by the two consumers.
 *
 * A budgeted line carries an explicit amount per month (`budgetedMonthly`,
 * keyed "YYYY-MM"). It exists so a Xero Budget Manager budget can be imported
 * into the wizard without flattening its monthly shape (fixed) or reshaping it
 * onto last year's actual pattern (seasonal) — see
 * .planning/XERO-BUDGET-SEED-PLAN.md. Operators can also pick it by hand.
 *
 * Why this module exists at all: the wizard's on-screen summary
 * (useForecastWizard.calculateYearSummary) and the materialiser that writes
 * forecast_pl_lines (assumptions-to-pl-lines.ts) have historically each carried
 * their own copy of every cost-behaviour formula, and "the number on screen
 * isn't the number in the report" has been the most expensive recurring defect
 * in this codebase. For this behaviour there is exactly one formula, here, and
 * both sides call it. summary-parity.ts is the backstop; this is the cure.
 *
 * Projection rule, per month key requested:
 *   1. an explicit budgeted value for that month → use it;
 *   2. otherwise the same calendar month from the most recent EARLIER budgeted
 *      year, grown by `increasePct` once per year of distance (a 12-month
 *      budget therefore rolls into Y2/Y3 the way a fixed line does);
 *   3. otherwise 0 — never a guess. Filling gaps is the caller's job (the Xero
 *      seed fills uncovered months explicitly and says so in its report).
 *
 * Y2/Y3 annual overrides (`y2Override`/`y3Override`) and lifecycle flags are
 * applied by the callers AFTER projection, exactly as for every other
 * behaviour, so they are deliberately not handled here.
 */

export interface BudgetedLineLike {
  budgetedMonthly?: Record<string, number> | null
}

const MONTH_KEY = /^(\d{4})-(\d{2})$/

/** "2026-07" + 12 → "2027-07"; "2026-01" − 1 → "2025-12". Non-keys pass through. */
export function shiftMonthKey(monthKey: string, deltaMonths: number): string {
  const m = MONTH_KEY.exec(monthKey)
  if (!m) return monthKey
  const total = Number(m[1]) * 12 + (Number(m[2]) - 1) + deltaMonths
  const y = Math.floor(total / 12)
  const mo = (total % 12) + 1
  return `${y}-${String(mo).padStart(2, '0')}`
}

function isAmount(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** Two-decimal rounding, matching the materialiser's `round2`. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Project a budgeted line onto the requested month keys (see module docs). */
export function projectBudgetedMonths(
  line: BudgetedLineLike,
  monthKeys: readonly string[],
  increasePct: number,
): Record<string, number> {
  const budget = line.budgetedMonthly ?? {}
  const growth = 1 + (isAmount(increasePct) ? increasePct : 0) / 100
  const out: Record<string, number> = {}
  for (const mk of monthKeys) {
    const direct = budget[mk]
    if (isAmount(direct)) {
      out[mk] = round2(direct)
      continue
    }
    let value = 0
    for (let back = 1; back <= 3; back++) {
      const prior = budget[shiftMonthKey(mk, -12 * back)]
      if (isAmount(prior)) {
        value = prior * Math.pow(growth, back)
        break
      }
    }
    out[mk] = round2(value)
  }
  return out
}

/** Sum of the projection over the given month keys (a forecast year, typically). */
export function budgetedTotal(
  line: BudgetedLineLike,
  monthKeys: readonly string[],
  increasePct: number,
): number {
  const projected = projectBudgetedMonths(line, monthKeys, increasePct)
  let sum = 0
  for (const mk of monthKeys) sum += projected[mk] ?? 0
  return round2(sum)
}

/**
 * Re-target the months in `monthKeys` to a new total while keeping their shape.
 * Months outside `monthKeys` (other forecast years) are untouched. When the
 * current months sum to zero there is no shape to keep, so the total is spread
 * flat. The last month absorbs the rounding residue so the months add up to
 * exactly `newTotal` (the wizard's residue convention).
 */
export function scaleBudgetedMonths(
  budgetedMonthly: Record<string, number> | null | undefined,
  monthKeys: readonly string[],
  newTotal: number,
): Record<string, number> {
  const current = { ...(budgetedMonthly ?? {}) }
  if (monthKeys.length === 0) return current
  const existingSum = monthKeys.reduce((s, mk) => s + (isAmount(current[mk]) ? current[mk] : 0), 0)
  const weights = monthKeys.map((mk) =>
    existingSum !== 0 && isAmount(current[mk]) ? current[mk] / existingSum : 1 / monthKeys.length,
  )
  let running = 0
  monthKeys.forEach((mk, i) => {
    if (i === monthKeys.length - 1) {
      current[mk] = round2(newTotal - running)
    } else {
      const v = round2(newTotal * weights[i])
      current[mk] = v
      running += v
    }
  })
  return current
}

/**
 * Spread an annual total across `monthKeys` following a monthly pattern keyed
 * by any "YYYY-MM" (e.g. last year's actuals) — weights are taken by calendar
 * month so a prior-year pattern maps onto a forecast year. No usable pattern →
 * flat. Same residue convention as `scaleBudgetedMonths`.
 */
export function spreadTotalByPattern(
  total: number,
  monthKeys: readonly string[],
  pattern?: Record<string, number> | null,
): Record<string, number> {
  const byCalendarMonth = new Map<string, number>()
  for (const [key, v] of Object.entries(pattern ?? {})) {
    const m = MONTH_KEY.exec(key)
    if (!m || !isAmount(v) || v <= 0) continue
    byCalendarMonth.set(m[2], (byCalendarMonth.get(m[2]) ?? 0) + v)
  }
  const weightOf = (mk: string): number => {
    const m = MONTH_KEY.exec(mk)
    return m ? byCalendarMonth.get(m[2]) ?? 0 : 0
  }
  const weightSum = monthKeys.reduce((s, mk) => s + weightOf(mk), 0)
  const seed: Record<string, number> = {}
  for (const mk of monthKeys) seed[mk] = weightSum > 0 ? weightOf(mk) : 1
  return scaleBudgetedMonths(seed, monthKeys, total)
}
