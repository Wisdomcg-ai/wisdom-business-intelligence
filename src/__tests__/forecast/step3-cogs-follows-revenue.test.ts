/**
 * Variable COGS must follow the REVENUE shape, not prior-year seasonality.
 *
 * Reported on Dragon Roofing 18 Aug 2026: "if i set cogs to 60% why are the
 * months so different?"
 *
 * Annual COGS was a correct 60.0% of revenue ($5,418,353 / $9,030,584), but the
 * months ran 22.6% to 128.9% — February planned −28.9% gross profit and June
 * −19.0%. Cause: COGS months were weighted by `getEffectiveSeasonality` (a
 * prior-year curve) while revenue was the operator's own manual monthly entry.
 * Two independent curves, so June drew 17.6% of the year's COGS against 8.9% of
 * its revenue.
 *
 * A variable cost is defined on that very screen as one that "changes with
 * revenue", so weighting it by anything else is wrong by definition. Fixed lines
 * keep seasonality — they are precisely the costs that do NOT track revenue.
 */
import { describe, it, expect } from 'vitest'

// Dragon's grid as screenshotted. July is a Xero actual and is held.
const MONTHS = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']
const REVENUE = [1_230_584, 1_000_000, 1_000_000, 1_000_000, 1_000_000, 400_000, 400_000, 400_000, 500_000, 500_000, 800_000, 800_000]
const JULY_ACTUAL_COGS = 764_711
const TARGET_PCT = 60

/** Prior-year seasonality — the curve COGS used to follow, from the same grid. */
const OLD_COGS = [764_711, 269_050, 350_251, 226_383, 363_302, 335_962, 275_759, 515_747, 290_825, 489_814, 584_671, 951_878]

/**
 * Spread an annual target across months by `weights`, holding month 0 (July) at
 * its actual. Mirrors spreadCogsLineToTarget: actuals held, remainder weighted,
 * residue on the last open month.
 */
function spread(annualTarget: number, weights: number[], actuals: Record<number, number>): number[] {
  const open = weights.map((_, i) => i).filter((i) => !(i in actuals))
  const actualSum = Object.values(actuals).reduce((a, b) => a + b, 0)
  const remaining = Math.max(0, annualTarget - actualSum)
  const openWeight = open.reduce((s, i) => s + weights[i], 0)

  const out = weights.map((_, i) => actuals[i] ?? 0)
  let running = 0
  open.forEach((i, n) => {
    if (n === open.length - 1) {
      out[i] = Math.max(0, remaining - running)
      return
    }
    out[i] = openWeight > 0 ? Math.round(remaining * (weights[i] / openWeight)) : 0
    running += out[i]
  })
  return out
}

const TOTAL_REVENUE = REVENUE.reduce((a, b) => a + b, 0)
const COGS_TARGET = Math.round(TOTAL_REVENUE * (TARGET_PCT / 100))
const pct = (c: number, r: number) => (c / r) * 100

describe('Step 3 — variable COGS follows revenue, not seasonality', () => {
  it('reproduces the reported symptom under the OLD seasonality weighting', () => {
    const monthly = OLD_COGS.map((c, i) => pct(c, REVENUE[i]))
    // Annual total is correct...
    expect(pct(OLD_COGS.reduce((a, b) => a + b, 0), TOTAL_REVENUE)).toBeCloseTo(60.0, 1)
    // ...while individual months are wildly off, two of them above 100%.
    expect(Math.min(...monthly)).toBeLessThan(30) // Oct 22.6%
    expect(Math.max(...monthly)).toBeGreaterThan(120) // Feb 128.9%
    expect(monthly[MONTHS.indexOf('Feb')]).toBeGreaterThan(100)
    expect(monthly[MONTHS.indexOf('Jun')]).toBeGreaterThan(100)
  })

  it('no month plans negative gross profit once COGS follows revenue', () => {
    const out = spread(COGS_TARGET, REVENUE, { 0: JULY_ACTUAL_COGS })
    out.forEach((c, i) => expect(pct(c, REVENUE[i])).toBeLessThan(100))
  })

  it('every projected month lands on the same COGS %', () => {
    const out = spread(COGS_TARGET, REVENUE, { 0: JULY_ACTUAL_COGS })
    // July is an actual and is excluded — it is what happened, not a plan.
    const projected = out.slice(1).map((c, i) => pct(c, REVENUE[i + 1]))
    const first = projected[0]
    projected.forEach((p) => expect(p).toBeCloseTo(first, 1))
  })

  it('the projected rate is the target adjusted for what July actually spent', () => {
    const out = spread(COGS_TARGET, REVENUE, { 0: JULY_ACTUAL_COGS })
    // July ran hot at 62.1%, so the remaining months must run slightly under 60
    // for the YEAR to land on 60 — that is arithmetic, not drift.
    const expected = ((COGS_TARGET - JULY_ACTUAL_COGS) / (TOTAL_REVENUE - REVENUE[0])) * 100
    expect(expected).toBeGreaterThan(59)
    expect(expected).toBeLessThan(60)
    expect(pct(out[1], REVENUE[1])).toBeCloseTo(expected, 1)
  })

  it('still hits the annual target exactly', () => {
    const out = spread(COGS_TARGET, REVENUE, { 0: JULY_ACTUAL_COGS })
    expect(out.reduce((a, b) => a + b, 0)).toBe(COGS_TARGET)
    expect(out[0]).toBe(JULY_ACTUAL_COGS)
  })

  it('gives a zero-revenue month zero variable COGS', () => {
    const rev = [...REVENUE]
    rev[5] = 0
    const out = spread(COGS_TARGET, rev, { 0: JULY_ACTUAL_COGS })
    expect(out[5]).toBe(0)
  })

  it('tracks a revenue re-shape instead of ignoring it', () => {
    // Flip the busy months: COGS must move with them.
    const reshaped = [...REVENUE].reverse()
    const out = spread(Math.round(reshaped.reduce((a, b) => a + b, 0) * 0.6), reshaped, {})
    const shares = out.map((c) => c / out.reduce((a, b) => a + b, 0))
    const revShares = reshaped.map((r) => r / reshaped.reduce((a, b) => a + b, 0))
    shares.forEach((s, i) => expect(s).toBeCloseTo(revShares[i], 3))
  })
})
