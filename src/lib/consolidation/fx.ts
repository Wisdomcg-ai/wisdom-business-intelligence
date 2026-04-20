/**
 * Foreign Exchange Translation — Phase 34 (Dragon Multi-Entity Consolidation).
 *
 * Scope (Iteration 34.0): HKD/AUD for IICT Group Limited. Dragon consolidation
 * is pure-AUD and never invokes this module.
 *
 * Per POST-RESEARCH CORRECTIONS (2026-04-18, confirmed by user): manual-entry
 * rates only. No Vercel cron, no RBA F11.1 scraper, no external API. Users
 * enter monthly rates via the admin UI shipped in plan 34-00f. A missing
 * rate is SURFACED to the user through `fx_context.missing_rates[]` — it is
 * NEVER silently defaulted to 1.0 (that would silently mis-state the
 * consolidated numbers).
 *
 * Standard: AASB 121 / IAS 21 — monthly average for P&L, closing spot for BS.
 * Balance-sheet translation ships in plan 34-01a (Iteration 34.1); the
 * `translateBSAtClosingSpot` stub below exists so engine.ts can import the
 * symbol today without conditional branching at call sites.
 */

import type { XeroPLLineLike } from './types'

export type RateType = 'monthly_average' | 'closing_spot'

/**
 * Minimal shape of a Supabase PostgrestQueryBuilder call chain used by
 * `loadFxRates`. Accepting `any` here keeps the module independent of the
 * `@supabase/supabase-js` types (which are a heavy import and change between
 * versions) while still exercising the right query shape in the route tests.
 */
type SupabaseLike = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: unknown) => {
        eq: (col: string, val: unknown) => Promise<{
          data: Array<{ period: string; rate: number }> | null
          error: { message: string } | null
        }>
      }
    }
  }
}

/**
 * Load FX rates for a specific pair + rate_type, scoped to a list of months.
 *
 * Returns a `Map<'YYYY-MM', number>`. Months absent from the DB simply do not
 * appear in the Map — the caller detects them via `rates.get(month) === undefined`
 * and surfaces them to the user (see `translatePLAtMonthlyAverage`).
 *
 * The `period` column in `fx_rates` is a DATE. For `monthly_average` rows it
 * stores first-of-month ('YYYY-MM-01'); for `closing_spot` rows it stores the
 * month-end date. Either way, the first 7 characters of the ISO string give
 * the YYYY-MM month key used throughout the consolidation engine.
 */
export async function loadFxRates(
  supabase: SupabaseLike,
  currencyPair: string, // 'HKD/AUD' — slash separator enforced at call site
  rateType: RateType,
  months: string[], // ['2026-03', '2026-04', ...]
): Promise<Map<string, number>> {
  if (months.length === 0) return new Map()

  const { data, error } = await supabase
    .from('fx_rates')
    .select('currency_pair, rate_type, period, rate, source')
    .eq('currency_pair', currencyPair)
    .eq('rate_type', rateType)

  if (error) {
    throw new Error(
      `[FX] Failed to load rates for ${currencyPair} ${rateType}: ${error.message}`,
    )
  }

  const requested = new Set(months)
  const out = new Map<string, number>()
  for (const row of data ?? []) {
    // period is ISO 'YYYY-MM-DD' — take first 7 chars as month key
    const monthKey = row.period.slice(0, 7)
    if (requested.has(monthKey)) {
      out.set(monthKey, Number(row.rate))
    }
  }
  return out
}

/**
 * Translate P&L lines at the monthly-average rate (IAS 21 / AASB 121).
 *
 * Contract:
 * - Each `line.monthly_values[m]` is multiplied by `rates.get(m)`.
 * - If `rates.get(m)` is `undefined`, the value is preserved untranslated and
 *   the month is added to the returned `missing` list (deduped + sorted).
 *   Callers MUST surface `missing` to the user — there is no silent 1:1 fallback.
 * - Keys not present in `line.monthly_values` are never fabricated, even if
 *   rates exist for them (Pitfall 2 from RESEARCH.md).
 * - All non-monthly fields pass through unchanged.
 * - Input is not mutated.
 */
export function translatePLAtMonthlyAverage(
  lines: XeroPLLineLike[],
  rates: Map<string, number>,
): { translated: XeroPLLineLike[]; missing: string[] } {
  const missingSet = new Set<string>()

  const translated = lines.map(line => {
    const newMonthly: Record<string, number> = {}
    for (const [month, value] of Object.entries(line.monthly_values)) {
      const rate = rates.get(month)
      if (rate === undefined) {
        // Pitfall 3: never fabricate rate=1.0. Preserve the raw value and
        // flag the month so the caller can raise it in fx_context.missing_rates[].
        newMonthly[month] = value
        missingSet.add(month)
        // Keep a single console warning per call site — loud enough to show up
        // in server logs, quiet enough not to spam tests.
        console.warn(
          `[FX] Missing rate for ${month} — value preserved untranslated`,
        )
      } else {
        newMonthly[month] = value * rate
      }
    }
    return { ...line, monthly_values: newMonthly }
  })

  return {
    translated,
    missing: Array.from(missingSet).sort(),
  }
}

/**
 * Translate Balance Sheet lines at a single closing-spot rate (IAS 21 / AASB 121).
 *
 * Unlike `translatePLAtMonthlyAverage` (which accepts a per-month Map of
 * average rates), the balance sheet represents balances AS OF a single date,
 * so a single closing-spot rate is applied uniformly across every month key
 * in `monthly_values`. In practice the balance sheet engine only consults
 * the `asOfDate` key, but we translate every key for forward-compatibility
 * with multi-period BS comparatives.
 *
 * Contract:
 * - Rate must be a positive finite number; otherwise throws (no silent
 *   fallback to 1.0). A zero or negative rate is always a bug — either
 *   missing rate data or a sign-flipped import.
 * - Every value in each line's `monthly_values` is multiplied by `rate`.
 * - All non-monthly fields pass through unchanged.
 * - Input is not mutated.
 *
 * Residuals from translating assets vs. liabilities vs. equity at a single
 * closing rate are absorbed by the Translation Reserve (CTA) line computed
 * by `buildConsolidatedBalanceSheet` in balance-sheet.ts. This function is
 * deliberately kept as a pure scalar-multiply — the CTA logic lives at the
 * engine level where totals are known.
 */
export function translateBSAtClosingSpot(
  lines: XeroPLLineLike[],
  rate: number,
): XeroPLLineLike[] {
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(
      `[FX] translateBSAtClosingSpot requires a positive finite rate, got ${rate}`,
    )
  }
  return lines.map((line) => ({
    ...line,
    monthly_values: Object.fromEntries(
      Object.entries(line.monthly_values).map(([period, value]) => [
        period,
        value * rate,
      ]),
    ),
  }))
}

/**
 * Load a single closing-spot rate for a currency pair on a given month-end date.
 *
 * The `period` column in `fx_rates` stores YYYY-MM-DD. For `closing_spot` rows
 * the date is the month-end (e.g. '2026-03-31'). Callers that only know the
 * month key ('2026-03') must convert to month-end before calling.
 *
 * Returns `null` when no rate is found — the caller MUST surface this as a
 * missing rate rather than falling back to 1.0, mirroring the monthly-average
 * contract in `translatePLAtMonthlyAverage`.
 */
export async function loadClosingSpotRate(
  supabase: {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: unknown) => {
          eq: (col: string, val: unknown) => {
            eq: (col: string, val: unknown) => Promise<{
              data: Array<{ rate: number }> | null
              error: { message: string } | null
            }>
          }
        }
      }
    }
  },
  currencyPair: string,
  asOfDate: string, // 'YYYY-MM-DD' — month-end date
): Promise<number | null> {
  const { data, error } = await supabase
    .from('fx_rates')
    .select('rate')
    .eq('currency_pair', currencyPair)
    .eq('rate_type', 'closing_spot')
    .eq('period', asOfDate)

  if (error) {
    throw new Error(
      `[FX] Failed to load closing spot for ${currencyPair} ${asOfDate}: ${error.message}`,
    )
  }

  const row = (data ?? [])[0]
  return row ? Number(row.rate) : null
}

/**
 * Package FX translation context for the consolidated API response.
 *
 * Called once per `/api/monthly-report/consolidated` invocation, after all
 * per-currency translations have completed. The returned object feeds straight
 * into `ConsolidatedReport.fx_context` and is consumed by
 * `FXRateMissingBanner.tsx` (plan 34-00f) when `missing_rates` is non-empty.
 *
 * The flat `rates_used` map uses `${currencyPair}::${month}` keys so a single
 * JSON object can hold multiple currency pairs (useful once the group has >1
 * foreign-functional-currency member — e.g. a future additional pair).
 */
export function translationDiagnostics(
  translations: Array<{
    currencyPair: string
    rates: Map<string, number>
    missing: string[]
  }>,
): {
  rates_used: Record<string, number>
  missing_rates: { currency_pair: string; period: string }[]
} {
  const rates_used: Record<string, number> = {}
  const missing_rates: { currency_pair: string; period: string }[] = []
  for (const t of translations) {
    for (const [month, rate] of t.rates.entries()) {
      rates_used[`${t.currencyPair}::${month}`] = rate
    }
    for (const m of t.missing) {
      missing_rates.push({ currency_pair: t.currencyPair, period: m })
    }
  }
  return { rates_used, missing_rates }
}
