/**
 * Keeps one request's calls to one Xero organisation inside Xero's limits:
 * 60 calls in any minute and 5 at once, per tenant.
 *
 * The commentary route fetched from one organisation, four fetchers at a time,
 * a page every 300ms — up to forty calls in a few seconds, and the 429 retries
 * on top. Reading EVERY organisation of a consolidation (IICT-29, DRG-19) puts
 * that burst against each of them in turn, and a request that trips a minute
 * limit costs a 60-second wait (xero-api-client) or a truncated supplier list.
 * So every call goes through a pacer: it starts at most `maxPerMinute` calls in
 * any sliding 60 seconds and holds at most `maxConcurrent` open, and a call
 * over either waits rather than being sent.
 *
 * One pacer per organisation per request. It cannot see another request's
 * calls to the same organisation (the subscription crawl an export runs beside
 * it), which is why the default leaves headroom under Xero's 60.
 *
 * The clock is injectable so the pacing can be tested without waiting a
 * minute; `systemClock` is the real one.
 */

export interface PacerClock {
  now(): number
  sleep(ms: number): Promise<void>
}

export const systemClock: PacerClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}

/** Xero's own per-tenant limits. */
export const XERO_CALLS_PER_MINUTE = 60
export const XERO_CONCURRENT_CALLS = 5

const WINDOW_MS = 60_000

export interface TenantCallPacer {
  /** Runs `call` once a slot is free under both limits. */
  run<T>(call: () => Promise<T>): Promise<T>
}

export function createTenantCallPacer(
  opts: { maxPerMinute?: number; maxConcurrent?: number; clock?: PacerClock } = {},
): TenantCallPacer {
  const maxPerMinute = Math.max(1, Math.min(opts.maxPerMinute ?? 50, XERO_CALLS_PER_MINUTE))
  const maxConcurrent = Math.max(1, Math.min(opts.maxConcurrent ?? 4, XERO_CONCURRENT_CALLS))
  const clock = opts.clock ?? systemClock
  const started: number[] = []
  let open = 0
  const queue: Array<() => void> = []

  // A finished call hands its slot straight to the next one waiting, so a call
  // arriving in between cannot take it and put a sixth call on the wire.
  const release = () => {
    const next = queue.shift()
    if (next) next()
    else open--
  }

  const acquire = async () => {
    if (open >= maxConcurrent) await new Promise<void>((resolve) => queue.push(resolve))
    else open++
    for (;;) {
      const now = clock.now()
      while (started.length > 0 && now - started[0] >= WINDOW_MS) started.shift()
      if (started.length < maxPerMinute) {
        started.push(now)
        return
      }
      await clock.sleep(WINDOW_MS - (now - started[0]))
    }
  }

  return {
    async run<T>(call: () => Promise<T>): Promise<T> {
      await acquire()
      try {
        return await call()
      } finally {
        release()
      }
    },
  }
}
