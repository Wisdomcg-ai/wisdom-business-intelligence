/**
 * Open Exchange Rates (OXR) client — replicates Calxa's FX rate derivation.
 *
 * Calxa uses OXR as its sole external FX source and derives two rates per
 * (currency_pair, month):
 *   - monthly_average (P&L translation, IAS 21) = mean of daily EOD rates
 *   - closing_spot    (BS translation,  IAS 21) = EOD rate of the last day
 *
 * OXR Free plan quirk: base currency is always USD. To get HKD/AUD we pull
 * the daily USD snapshot (`symbols=HKD,AUD`) and cross:
 *   AUD per HKD = rates.AUD / rates.HKD
 *
 * Rate limiting: 1,000 req/month free. One currency pair backfill for one
 * month costs 28–31 requests (one per calendar day). Callers should throttle.
 */

const OXR_BASE = 'https://openexchangerates.org/api'

export interface OxrHistoricalResponse {
  /** ISO UTC timestamp of the EOD snapshot. */
  timestamp: number
  /** Always 'USD' on Free plan. */
  base: string
  rates: Record<string, number>
}

export interface MonthlyRatePair {
  currency_pair: string // e.g. 'HKD/AUD'
  year: number
  month: number // 1-12
  monthly_average: number
  closing_spot: number
  /** ISO date of the last calendar day fetched (used as closing_spot period). */
  closing_spot_date: string
  /** ISO dates of every day OXR returned data for (diagnostic). */
  days_fetched: string[]
  /** Dates OXR returned no data for (e.g. future dates, weekends on some plans). */
  days_missing: string[]
}

/** Format a Date as 'YYYY-MM-DD' in UTC. */
function iso(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Last day of the given year/month (1-12) as 'YYYY-MM-DD'. */
export function lastDayOfMonth(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month, 0))
  return iso(d)
}

/** Enumerate every calendar day of (year, month) up to today — never future. */
export function enumerateMonthDays(year: number, month: number): string[] {
  const today = iso(new Date())
  const lastDom = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const days: string[] = []
  for (let d = 1; d <= lastDom; d++) {
    const date = iso(new Date(Date.UTC(year, month - 1, d)))
    if (date > today) break
    days.push(date)
  }
  return days
}

/**
 * Fetch a single day's OXR snapshot. Returns null for 404 (date out of range,
 * pre-1999, etc). Any other error throws — Free plan surfaces 429 for quota
 * exhaustion; callers should surface that to the user.
 */
export async function fetchOxrDay(
  date: string,
  symbols: string[],
  appId: string,
): Promise<OxrHistoricalResponse | null> {
  const url = new URL(`${OXR_BASE}/historical/${date}.json`)
  url.searchParams.set('app_id', appId)
  if (symbols.length) url.searchParams.set('symbols', symbols.join(','))

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })

  if (res.status === 404) return null
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(
      `[OXR] ${res.status} ${res.statusText} for ${date}: ${text.slice(0, 240)}`,
    )
  }
  return (await res.json()) as OxrHistoricalResponse
}

/**
 * Compute the cross-rate base→quote from a USD-based OXR snapshot.
 * Returns NaN if either leg is missing / non-finite / non-positive.
 */
export function crossRate(
  snapshot: OxrHistoricalResponse,
  base: string,
  quote: string,
): number {
  // On Free plan, snapshot.base is always 'USD' — all rates.X are "X per USD".
  const usdToBase = snapshot.rates[base]
  const usdToQuote = snapshot.rates[quote]
  if (
    !Number.isFinite(usdToBase) ||
    !Number.isFinite(usdToQuote) ||
    usdToBase <= 0 ||
    usdToQuote <= 0
  ) {
    return NaN
  }
  return usdToQuote / usdToBase
}

/**
 * Derive monthly_average + closing_spot for a currency pair using OXR.
 *
 * Process:
 *   1. Enumerate calendar days of (year, month), cap at today.
 *   2. Fetch each day's snapshot; cross-rate to base/quote.
 *   3. monthly_average = arithmetic mean of all successful daily rates.
 *   4. closing_spot    = last successful daily rate (usually month-end).
 *
 * Throws if fewer than 5 days fetched (month too incomplete to be meaningful).
 * Caller decides whether to write partial results.
 */
export async function deriveMonthlyRatePair(
  currencyPair: string, // 'HKD/AUD'
  year: number,
  month: number, // 1-12
  appId: string,
): Promise<MonthlyRatePair> {
  const [base, quote] = currencyPair.split('/')
  if (!base || !quote || base.length !== 3 || quote.length !== 3) {
    throw new Error(`[OXR] Invalid currency_pair: ${currencyPair}`)
  }

  const days = enumerateMonthDays(year, month)
  if (days.length === 0) {
    throw new Error(
      `[OXR] No days to fetch for ${year}-${String(month).padStart(2, '0')} — month is entirely in the future`,
    )
  }

  const symbols = Array.from(new Set([base, quote]))

  // Fetch all days in parallel with a concurrency cap. OXR has no documented
  // per-second rate limit (only a monthly quota) but we cap to be polite and
  // to avoid slamming 31 connections at once on serverless cold-starts.
  const CONCURRENCY = 8
  const fetched: Array<{ date: string; snap: OxrHistoricalResponse | null }> = []
  for (let i = 0; i < days.length; i += CONCURRENCY) {
    const batch = days.slice(i, i + CONCURRENCY)
    const results = await Promise.all(
      batch.map(async (date) => ({
        date,
        snap: await fetchOxrDay(date, symbols, appId),
      })),
    )
    fetched.push(...results)
  }

  const dailyRates: Array<{ date: string; rate: number }> = []
  const missing: string[] = []
  for (const { date, snap } of fetched) {
    if (!snap) {
      missing.push(date)
      continue
    }
    const rate = crossRate(snap, base, quote)
    if (!Number.isFinite(rate)) {
      missing.push(date)
      continue
    }
    dailyRates.push({ date, rate })
  }
  // Preserve chronological order (important: closing_spot = last day).
  dailyRates.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  if (dailyRates.length < 5) {
    throw new Error(
      `[OXR] Only ${dailyRates.length} day(s) of data for ${currencyPair} ${year}-${String(month).padStart(2, '0')} — refusing to compute monthly average`,
    )
  }

  const sum = dailyRates.reduce((acc, r) => acc + r.rate, 0)
  const monthly_average = sum / dailyRates.length

  // Closing spot = the latest day we successfully fetched. For months that
  // have fully passed this equals the last day of the month; for the current
  // month it's the most recent EOD we have.
  const last = dailyRates[dailyRates.length - 1]
  const closing_spot = last.rate
  const closing_spot_date = last.date

  return {
    currency_pair: currencyPair,
    year,
    month,
    monthly_average,
    closing_spot,
    closing_spot_date,
    days_fetched: dailyRates.map((d) => d.date),
    days_missing: missing,
  }
}
