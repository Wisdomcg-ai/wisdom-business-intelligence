/**
 * FX rate storage shared by the coach's "Sync from OXR" button and the
 * monthly FX cron (IICT-03).
 *
 * Until Sep 2026 rates only existed when a coach clicked. Nobody clicked for
 * June–August 2026, so IICT Group Limited's HKD was summed into AUD at 1:1,
 * and the one May click happened on the 25th — a month-to-date average and a
 * closing rate dated 25 May that no 31-May balance sheet can find.
 *
 * The cron uses the SAME row shape and upsert as the button (`oxrRateRows`,
 * `upsertOxrRateRows`), so the two cannot store a month differently. On top of
 * that it is stricter than the button, because nobody is looking at what it
 * writes:
 *   - closed months only, and only when OXR answered for every day
 *     (`incompleteMonthReason`);
 *   - never a rate type a coach entered by hand for that month (April 2026's
 *     manual 0.1925 stays until someone explains it);
 *   - an OXR row written before its month closed is a partial month and is
 *     re-derived; once the month-end closing row is stored, the mid-month
 *     closing row it replaces is deleted, so readers keyed on the month
 *     (`loadFxRates(..., 'closing_spot', ...)`) see exactly one closing rate.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  deriveMonthlyRatePair,
  incompleteMonthReason,
  isClosedMonth,
  lastDayOfMonth,
  recentClosedMonths,
  type MonthlyRatePair,
} from './oxr'

/** Consolidated reports present in AUD (consolidated/route.ts, consolidated-bs/route.ts). */
export const PRESENTATION_CURRENCY = 'AUD'

/**
 * How far back the cron looks for a missing or partial month: a full fiscal
 * year, which is the widest window any consolidated report translates and the
 * same 12 months the fx_rate_coverage invariant watches. Older gaps are a
 * coach's call via the admin backfill.
 */
export const FX_LOOKBACK_MONTHS = 12

/**
 * Months fetched per run. One month is 28–31 OXR requests, so 6 is ≤186 —
 * under a fifth of the Free plan's 1,000/month even if every run backfills.
 */
export const FX_MAX_MONTHS_PER_RUN = 6

export type FxRateType = 'monthly_average' | 'closing_spot'
const RATE_TYPES: readonly FxRateType[] = ['monthly_average', 'closing_spot']

export interface OxrRateRow {
  currency_pair: string
  rate_type: FxRateType
  period: string
  rate: number
  source: 'oxr'
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

/**
 * The two fx_rates rows one OXR month produces:
 *   - monthly_average with period = YYYY-MM-01
 *   - closing_spot    with period = last day fetched (month-end for a closed month)
 */
export function oxrRateRows(derived: MonthlyRatePair): OxrRateRow[] {
  return [
    {
      currency_pair: derived.currency_pair,
      rate_type: 'monthly_average',
      period: `${monthKey(derived.year, derived.month)}-01`,
      rate: derived.monthly_average,
      source: 'oxr',
    },
    {
      currency_pair: derived.currency_pair,
      rate_type: 'closing_spot',
      period: derived.closing_spot_date,
      rate: derived.closing_spot,
      source: 'oxr',
    },
  ]
}

/** Upsert on (currency_pair, rate_type, period); returns the stored rows. */
export function upsertOxrRateRows(db: SupabaseClient, rows: OxrRateRow[]) {
  return db
    .from('fx_rates')
    .upsert(rows, { onConflict: 'currency_pair,rate_type,period' })
    .select()
}

/**
 * Every currency pair an active consolidation needs: the functional currency
 * of each active, included Xero connection that is not already AUD. fx_rates
 * is keyed by pair, not business, so no business id is involved.
 */
export async function loadConsolidationFxPairs(db: SupabaseClient): Promise<string[]> {
  const { data, error } = await db
    .from('xero_connections')
    .select('functional_currency')
    .eq('is_active', true)
    .eq('include_in_consolidation', true)
  if (error) {
    throw new Error(`[FX] xero_connections read failed: ${error.message}`)
  }
  const pairs = new Set<string>()
  for (const row of (data ?? []) as Array<{ functional_currency: string | null }>) {
    const ccy = String(row.functional_currency ?? '').trim().toUpperCase()
    if (!/^[A-Z]{3}$/.test(ccy) || ccy === PRESENTATION_CURRENCY) continue
    pairs.add(`${ccy}/${PRESENTATION_CURRENCY}`)
  }
  return Array.from(pairs).sort()
}

export interface StoredFxRate {
  id: string
  rate_type: string
  period: string
  source: string
  updated_at: string | null
}

export interface FxMonthPlan {
  year: number
  month: number
  /** Rate types the cron should (re)write from OXR for this month. */
  write: Record<FxRateType, boolean>
  /** Rate types a coach entered by hand — the cron leaves them alone. */
  keptManual: FxRateType[]
  /** OXR rows at the wrong period (e.g. a closing rate dated 25 May), deleted once the month is stored. */
  retire: StoredFxRate[]
}

/**
 * Decide, per rate type, what one month needs. Pure.
 *
 *   - any non-OXR row of that type in the month (manual, rba) → kept, never written;
 *   - an OXR row at the canonical period (YYYY-MM-01 / month-end) written
 *     after the month closed → settled, nothing to do;
 *   - otherwise (absent, or synced while the month was still open) → write;
 *   - OXR rows of that type at any other period in the month → retire.
 */
export function planFxMonth(stored: StoredFxRate[], year: number, month: number): FxMonthPlan {
  const ym = monthKey(year, month)
  const target: Record<FxRateType, string> = {
    monthly_average: `${ym}-01`,
    closing_spot: lastDayOfMonth(year, month),
  }
  const closedAtMs =
    month === 12 ? Date.UTC(year + 1, 0, 1) : Date.UTC(year, month, 1)

  const plan: FxMonthPlan = {
    year,
    month,
    write: { monthly_average: false, closing_spot: false },
    keptManual: [],
    retire: [],
  }

  for (const type of RATE_TYPES) {
    const inMonth = stored.filter(
      (r) => r.rate_type === type && String(r.period).slice(0, 7) === ym,
    )
    if (inMonth.some((r) => r.source !== 'oxr')) {
      plan.keptManual.push(type)
      continue
    }
    const canonical = inMonth.find((r) => String(r.period).slice(0, 10) === target[type])
    const writtenAtMs = canonical?.updated_at ? Date.parse(canonical.updated_at) : NaN
    const settled = canonical !== undefined && Number.isFinite(writtenAtMs) && writtenAtMs >= closedAtMs
    plan.write[type] = !settled
    plan.retire.push(...inMonth.filter((r) => r !== canonical))
  }
  return plan
}

const needsFetch = (plan: FxMonthPlan) => plan.write.monthly_average || plan.write.closing_spot

export interface FxMonthlySyncOptions {
  appId: string | undefined
  now: Date
  /** Epoch ms after which no new month is started. */
  deadlineMs: number
  lookbackMonths?: number
  maxMonthsPerRun?: number
}

export interface FxMonthlySyncResult {
  pairs: string[]
  synced: Array<{
    currency_pair: string
    month: string
    rates_written: FxRateType[]
    monthly_average: number
    closing_spot: number
    closing_spot_date: string
  }>
  retired: Array<{ currency_pair: string; rate_type: string; period: string }>
  kept_manual: Array<{ currency_pair: string; month: string; rate_types: FxRateType[] }>
  skipped: Array<{
    currency_pair: string
    month: string
    reason: 'run_cap' | 'time_budget' | 'oxr_unavailable'
  }>
  errors: Array<{ currency_pair: string; month: string | null; error: string }>
}

/**
 * Store every closed month in the lookback window that is missing or partial,
 * for every pair an active consolidation needs. Newest month first across all
 * pairs, so a cut-off (run cap, time budget, OXR outage) starves the oldest
 * backfill, never the month a pack is about to print. Nothing is left undone
 * silently: each unsynced month is in `skipped` or `errors`.
 *
 * Throws only when the run cannot start (connections unreadable, OXR key
 * missing while a month needs fetching).
 */
export async function syncClosedFxMonths(
  db: SupabaseClient,
  options: FxMonthlySyncOptions,
): Promise<FxMonthlySyncResult> {
  const lookback = options.lookbackMonths ?? FX_LOOKBACK_MONTHS
  const cap = options.maxMonthsPerRun ?? FX_MAX_MONTHS_PER_RUN
  const result: FxMonthlySyncResult = {
    pairs: [],
    synced: [],
    retired: [],
    kept_manual: [],
    skipped: [],
    errors: [],
  }

  result.pairs = await loadConsolidationFxPairs(db)
  if (result.pairs.length === 0) return result

  const months = recentClosedMonths(lookback, options.now)
  const oldest = months[months.length - 1]
  const windowStart = `${monthKey(oldest.year, oldest.month)}-01`

  const work: Array<{ pair: string; plan: FxMonthPlan }> = []
  for (const pair of result.pairs) {
    const { data, error } = await db
      .from('fx_rates')
      .select('id, rate_type, period, source, updated_at')
      .eq('currency_pair', pair)
      .gte('period', windowStart)
    if (error) {
      result.errors.push({ currency_pair: pair, month: null, error: `fx_rates read failed: ${error.message}` })
      continue
    }
    for (const { year, month } of months) {
      const plan = planFxMonth((data ?? []) as StoredFxRate[], year, month)
      if (plan.keptManual.length > 0) {
        result.kept_manual.push({ currency_pair: pair, month: monthKey(year, month), rate_types: plan.keptManual })
      }
      if (needsFetch(plan) || plan.retire.length > 0) work.push({ pair, plan })
    }
  }

  work.sort((a, b) => {
    const am = monthKey(a.plan.year, a.plan.month)
    const bm = monthKey(b.plan.year, b.plan.month)
    if (am !== bm) return am < bm ? 1 : -1
    return a.pair < b.pair ? -1 : a.pair > b.pair ? 1 : 0
  })

  if (!options.appId && work.some((w) => needsFetch(w.plan))) {
    throw new Error(
      '[FX] OPENEXCHANGERATES_APP_ID is not configured — months are due and cannot be fetched',
    )
  }

  let fetched = 0
  let oxrUnavailable = false
  for (const { pair, plan } of work) {
    const ym = monthKey(plan.year, plan.month)

    if (needsFetch(plan)) {
      if (oxrUnavailable) {
        result.skipped.push({ currency_pair: pair, month: ym, reason: 'oxr_unavailable' })
        continue
      }
      if (fetched >= cap) {
        result.skipped.push({ currency_pair: pair, month: ym, reason: 'run_cap' })
        continue
      }
      if (Date.now() > options.deadlineMs) {
        result.skipped.push({ currency_pair: pair, month: ym, reason: 'time_budget' })
        continue
      }
      // Unreachable by construction (the window is closed months only) — kept
      // so no future caller can get a month-to-date rate stored through here.
      if (!isClosedMonth(plan.year, plan.month, options.now)) {
        result.errors.push({ currency_pair: pair, month: ym, error: `refused: ${ym} has not closed yet` })
        continue
      }
      fetched++

      let derived: MonthlyRatePair
      try {
        derived = await deriveMonthlyRatePair(pair, plan.year, plan.month, options.appId as string)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        result.errors.push({ currency_pair: pair, month: ym, error: message })
        // Bad key or exhausted quota: every further month would fail the same
        // way and spend requests doing it.
        if (/\[OXR\] (401|403|429)\b/.test(message)) oxrUnavailable = true
        continue
      }

      const refusal = incompleteMonthReason(derived, options.now)
      if (refusal) {
        result.errors.push({ currency_pair: pair, month: ym, error: `refused partial month: ${refusal}` })
        continue
      }

      const rows = oxrRateRows(derived).filter((r) => plan.write[r.rate_type])
      const { error: upsertError } = await upsertOxrRateRows(db, rows)
      if (upsertError) {
        result.errors.push({ currency_pair: pair, month: ym, error: `fx_rates upsert failed: ${upsertError.message}` })
        continue
      }
      result.synced.push({
        currency_pair: pair,
        month: ym,
        rates_written: rows.map((r) => r.rate_type),
        monthly_average: derived.monthly_average,
        closing_spot: derived.closing_spot,
        closing_spot_date: derived.closing_spot_date,
      })
    }

    if (plan.retire.length > 0) {
      // source='oxr' again on the delete itself: a coach's manual rate entered
      // since the read above must never be the row that goes.
      const { error: deleteError } = await db
        .from('fx_rates')
        .delete()
        .in('id', plan.retire.map((r) => r.id))
        .eq('source', 'oxr')
      if (deleteError) {
        result.errors.push({
          currency_pair: pair,
          month: ym,
          error: `retiring superseded rows failed: ${deleteError.message}`,
        })
        continue
      }
      result.retired.push(
        ...plan.retire.map((r) => ({ currency_pair: pair, rate_type: r.rate_type, period: String(r.period).slice(0, 10) })),
      )
    }
  }

  return result
}
