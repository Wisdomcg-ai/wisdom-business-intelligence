/**
 * Test double for the Open Exchange Rates historical endpoint.
 *
 * Serves `oxr-historical-hkd-aud-2026-07-08.json` (July + August 2026, shaped
 * to reproduce Calxa's IICT rates) and, for any other date, either a flat
 * synthetic snapshot at `fallbackRate` or a 404 — the answer OXR gives for a
 * date it has no data for. Every requested date is recorded so tests can
 * assert which days were (and were never) fetched.
 */

import recorded from './oxr-historical-hkd-aud-2026-07-08.json'

type Snapshot = { timestamp: number; base: string; rates: Record<string, number> }

const SNAPSHOTS = (recorded as { snapshots: Record<string, Snapshot> }).snapshots

/** Every date the fixture covers, e.g. '2026-08-31'. */
export const RECORDED_DATES = Object.keys(SNAPSHOTS).sort()

export interface OxrFetchStubOptions {
  /** HKD→AUD cross rate served for dates outside the fixture. Omit → 404. */
  fallbackRate?: number
  /** Dates that answer 404 even when the fixture has them. */
  missingDates?: string[]
  /** Answer every request with this HTTP status (e.g. 429 quota exhausted). */
  failWithStatus?: number
}

export function makeOxrFetchStub(options: OxrFetchStubOptions = {}) {
  const requestedDates: string[] = []
  const missing = new Set(options.missingDates ?? [])

  const fetchImpl = async (input: unknown) => {
    const url = new URL(String(input))
    const match = url.pathname.match(/\/historical\/(\d{4}-\d{2}-\d{2})\.json$/)
    if (!match) throw new Error(`unexpected fetch in test: ${url.toString()}`)
    const date = match[1]
    requestedDates.push(date)

    const respond = (status: number, body: unknown) => ({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      json: async () => body,
      text: async () => JSON.stringify(body),
    })

    if (options.failWithStatus) {
      return respond(options.failWithStatus, { error: true, status: options.failWithStatus })
    }
    if (missing.has(date)) return respond(404, { error: true, message: 'not_available' })

    const snap = SNAPSHOTS[date]
    if (snap) return respond(200, snap)
    if (options.fallbackRate !== undefined) {
      const hkd = 7.83
      return respond(200, {
        timestamp: Math.floor(Date.parse(`${date}T23:59:59Z`) / 1000),
        base: 'USD',
        rates: { HKD: hkd, AUD: options.fallbackRate * hkd },
      })
    }
    return respond(404, { error: true, message: 'not_available' })
  }

  return { fetchImpl, requestedDates }
}
