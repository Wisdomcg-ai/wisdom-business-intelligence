/**
 * REL-02 (26 Aug 2026) — the freshness check must measure the PIPELINE, not the
 * calendar.
 *
 * `mirror_freshness` asks "how many months behind is the newest P&L period
 * LABEL". A label is a property of the data's content, not of whether the pipe
 * is alive. Armstrong & Co's Xero grant was revoked on 11 Aug; every sync since
 * has 403'd; and because the last successful sync had already written August
 * rows, the newest label stayed "2026-08" and the check PASSED for 15 straight
 * days — and would have kept passing for roughly 60 more, until the label
 * finally fell 3 months behind.
 *
 * `mirror_write_freshness` asks "when did data last actually arrive", which a
 * dead pipe answers honestly.
 *
 * Threshold chosen from live production data, not guessed:
 *   every healthy active tenant  ->   5.6h since last write (6-hourly sync)
 *   Armstrong & Co (revoked)     -> 371.6h
 * 18h = three sync cadences: a skipped or slow run cannot trip it, a dead pipe
 * trips within a day.
 */
import { describe, it, expect } from 'vitest'

const MIRROR_WRITE_STALE_HOURS = 18

/** The check's decision, mirroring metric-invariants/route.ts. */
function evaluate(opts: {
  isActive: boolean
  lastWriteHoursAgo: number | null
}): { checked: boolean; passed: boolean | null } {
  if (!opts.isActive) return { checked: false, passed: null }
  const h = opts.lastWriteHoursAgo
  return { checked: true, passed: h !== null && h <= MIRROR_WRITE_STALE_HOURS }
}

describe('the real production signal separates cleanly', () => {
  it('a healthy tenant (5.6h, the observed 6-hourly cadence) passes', () => {
    expect(evaluate({ isActive: true, lastWriteHoursAgo: 5.6 })).toEqual({
      checked: true,
      passed: true,
    })
  })

  it('Armstrong & Co (371.6h, grant revoked 15 days) FAILS', () => {
    expect(evaluate({ isActive: true, lastWriteHoursAgo: 371.6 })).toEqual({
      checked: true,
      passed: false,
    })
  })

  it('tolerates a skipped sync run — 12h (two cadences) still passes', () => {
    expect(evaluate({ isActive: true, lastWriteHoursAgo: 12 }).passed).toBe(true)
  })

  it('catches a pipe dead for a single day', () => {
    expect(evaluate({ isActive: true, lastWriteHoursAgo: 24 }).passed).toBe(false)
  })
})

describe('it does not manufacture failures', () => {
  it('an intentionally disconnected tenant is not checked at all', () => {
    // Efficient Living (is_active=false) last wrote 2534h ago — retired, not broken.
    expect(evaluate({ isActive: false, lastWriteHoursAgo: 2534.5 })).toEqual({
      checked: false,
      passed: null,
    })
  })

  it('an active tenant that has never been written fails loudly rather than silently passing', () => {
    expect(evaluate({ isActive: true, lastWriteHoursAgo: null }).passed).toBe(false)
  })
})

describe('why the label-based check could not catch this', () => {
  /** mirror_freshness: months between the newest LABEL and now. */
  const monthsBehind = (newestLabel: string, now: Date) => {
    const [y, m] = newestLabel.split('-').map(Number)
    return (now.getUTCFullYear() - y) * 12 + (now.getUTCMonth() + 1 - m)
  }

  it('Armstrong passed the label check on the very day it was 15 days dead', () => {
    // 26 Aug 2026; last successful sync (11 Aug) had already written August rows.
    const behind = monthsBehind('2026-08', new Date(Date.UTC(2026, 7, 26)))
    expect(behind).toBe(0)
    expect(behind <= 2).toBe(true) // FRESHNESS_MAX_MONTHS_BEHIND — a pass
    // ...while the write-time check fails on the same tenant, same day.
    expect(evaluate({ isActive: true, lastWriteHoursAgo: 371.6 }).passed).toBe(false)
  })

  it('the label check would have kept passing for ~2 more months', () => {
    // Still within tolerance at end-October, ~80 days after the pipe died.
    expect(monthsBehind('2026-08', new Date(Date.UTC(2026, 9, 31)))).toBe(2)
  })
})
