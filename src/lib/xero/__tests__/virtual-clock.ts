/**
 * A clock for pacing tests: time moves only when every piece of work in flight
 * is waiting on a sleep, and then straight to the earliest wake-up. So a call
 * is stamped with the time it really went out at, a minute's wait costs no
 * real time, and the order of events is the order a real clock would give.
 */
import type { PacerClock } from '../tenant-call-pacer'

export function virtualClock(): PacerClock & { elapsed(): number } {
  let t = 0
  let seq = 0
  let pumping = false
  const timers: { at: number; seq: number; resolve: () => void }[] = []
  // setImmediate runs after the microtask queue drains: only once everything
  // that can run without time passing has run does the clock move.
  const pump = () => {
    pumping = false
    if (timers.length === 0) return
    timers.sort((a, b) => a.at - b.at || a.seq - b.seq)
    const next = timers.shift()!
    t = Math.max(t, next.at)
    next.resolve()
    schedule()
  }
  const schedule = () => {
    if (pumping) return
    pumping = true
    setImmediate(pump)
  }
  return {
    now: () => t,
    sleep: (ms: number) => new Promise<void>((resolve) => {
      timers.push({ at: t + Math.max(0, ms), seq: seq++, resolve })
      schedule()
    }),
    elapsed: () => t,
  }
}

/** The most start times inside any window of `windowMs`. */
export function busiestWindow(times: readonly number[], windowMs = 60_000): number {
  const sorted = [...times].sort((a, b) => a - b)
  let best = 0
  let lo = 0
  for (let hi = 0; hi < sorted.length; hi++) {
    while (sorted[hi] - sorted[lo] >= windowMs) lo++
    best = Math.max(best, hi - lo + 1)
  }
  return best
}
