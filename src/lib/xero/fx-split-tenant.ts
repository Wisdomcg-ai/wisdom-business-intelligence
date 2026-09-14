/**
 * FX account split — one tenant's run inside syncBusinessXeroPL.
 *
 * The pure rule lives in fx-group-split.ts. This module owns what surrounds it
 * on the critical sync: which months cost a Trial Balance request, reusing a
 * closed month's stored split, the fallback for every failure, and the record
 * written to sync_jobs.reconciliation.pl.fx_split.
 *
 * THE CONTRACT WITH THE ORCHESTRATOR
 *   - Nothing here may fail a month, a tenant or a sync. The only exception
 *     that escapes is RateLimitDailyExceededError, which the orchestrator
 *     already turns into a paused tenant for every other Xero call.
 *   - Every other failure (fetch, parse, splitter throw, stored-row read) keeps
 *     Xero's merged row for that month, which is always a correct total.
 *   - The reconciler and absorber keep reading the UNSPLIT month rows: the
 *     FY-total oracle still carries the merged row, so feeding them split rows
 *     would raise a false discrepancy on every coded account.
 *
 * REQUEST BUDGET (Urban Road: 34 requests per run, payroll straight after,
 * 60 calls/min per tenant, 700s for the whole fleet)
 *   - OPEN months (the current and previous calendar month) fetch every run:
 *     that is where Xero is still moving.
 *   - A CLOSED month fetches only when it has no stored split, when its stored
 *     split no longer ties to this run's merged row (unrealised gains in closed
 *     months ARE restated — Urban Road Mar-26 Unrealised read 252 in Calxa's
 *     7 Apr pack and 292.02 today), or when it is the one closed month whose
 *     stored rows are oldest (a rotation, so a restatement that moves value
 *     between accounts without changing the sum is re-read within ~13 runs).
 *     Otherwise the stored amounts are re-emitted with their stored updated_at,
 *     so updated_at keeps meaning "last read from Xero".
 *   - The first run adds ~15 requests; steady state adds ~3.
 *   - A TB fetch gets ONE retry, not the client's default five: the merged row
 *     is a correct fallback, and a persistent 5xx at the default backoff
 *     (1+2+5+15s per month) would spend ~6 minutes of the fleet's 700s on 15
 *     months. After the first failed fetch the rest of the tenant's months skip
 *     the fetch (reason 'fetch_skipped') — reuse still applies.
 */
import * as Sentry from '@sentry/nextjs'
import type { CatalogMap } from './accounts-catalog'
import type { ParsedPLRow } from './pl-single-period-parser'
import { parseTrialBalanceMovements, type ParsedTBRow } from './trialbalance-parser'
import { fetchXeroWithRateLimit, RateLimitDailyExceededError } from './xero-api-client'
import {
  FX_SPLIT_MATERIALITY,
  fxSystemAccountIds,
  mergedFxRows,
  splitFxGroupMonth,
  type FxSplitOutcome,
} from './fx-group-split'

export type FxSplitKeptEntry = {
  month: string
  reason: string
  delta?: number
  error?: string
}

/** sync_jobs.reconciliation.pl.fx_split */
export type FxSplitRecord = {
  enabled: boolean
  skipped_reason?: 'multi_org'
  /** Months whose merged row was replaced from a Trial Balance fetched this run. */
  applied: string[]
  /** Closed months whose stored split still ties and was re-emitted. */
  reused: string[]
  /** Months whose merged row was exactly 0.00 — nothing emitted, nothing fetched. */
  zero: string[]
  /** Months that kept the merged row, and why. */
  kept: FxSplitKeptEntry[]
  /** Split months whose coded rows differ from the merged row by ≤ materiality. */
  residuals: Array<{ month: string; residual: number }>
  tb_requests: number
  /** Present only when the stored-split read failed (every month then fetched). */
  stored_read_error?: string
}

export function emptyFxSplitRecord(enabled: boolean): FxSplitRecord {
  return { enabled, applied: [], reused: [], zero: [], kept: [], residuals: [], tb_requests: 0 }
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function trialBalanceUrl(periodMonth: string): string {
  const y = parseInt(periodMonth.slice(0, 4), 10)
  const m = parseInt(periodMonth.slice(5, 7), 10)
  const d = new Date(y, m, 0)
  const monthEnd = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  return `https://api.xero.com/api.xro/2.0/Reports/TrialBalance?date=${monthEnd}&paymentsOnly=false`
}

type StoredRow = { account_id: string; amount: number; updated_at: string }

export type FxSplitTenantRun = {
  readonly record: FxSplitRecord
  /**
   * Decide one month, fetching its Trial Balance if the rules above say so.
   * Returns the number of Xero requests made (0 or 1). Throws ONLY
   * RateLimitDailyExceededError.
   */
  processMonth(periodMonth: string, accrualRows: readonly ParsedPLRow[]): Promise<number>
  /** The accruals rows to persist: each decided month's merged row replaced. */
  substitute(rows: readonly ParsedPLRow[]): ParsedPLRow[]
  /** A reused row's stored updated_at; undefined means "now". */
  storedUpdatedAt(row: ParsedPLRow): string | undefined
  /** ONE Sentry warning per tenant per run, only when a month kept its merged row. */
  report(): void
}

export async function createFxSplitTenantRun(opts: {
  supabase: any
  profileId: string
  tenantId: string
  accessToken: string
  catalog: CatalogMap
  /** Every month this run fetches, both FY windows. */
  runMonths: readonly string[]
  today: Date
}): Promise<FxSplitTenantRun> {
  const { supabase, profileId, tenantId, accessToken, catalog } = opts
  const record = emptyFxSplitRecord(true)
  const fxIds = fxSystemAccountIds(catalog)

  // OPEN = the current or the previous calendar month (local, as the month
  // windows are computed). Anything on or after the previous month's tag.
  const prev = new Date(opts.today.getFullYear(), opts.today.getMonth() - 1, 1)
  const openFrom = `${prev.getFullYear()}-${pad2(prev.getMonth() + 1)}-01`

  // Pre-read the stored split once: ≤ 3 accounts × 27 months.
  const storedByMonth = new Map<string, StoredRow[]>()
  if (fxIds.length > 0) {
    try {
      const res = (await supabase
        .from('xero_pl_lines')
        .select('account_id, period_month, amount, updated_at')
        .eq('business_id', profileId)
        .eq('tenant_id', tenantId)
        .eq('basis', 'accruals')
        .in('account_id', fxIds)) as any
      if (res?.error) throw new Error(res.error.message ?? res.error.code ?? 'unknown')
      for (const r of (res?.data ?? []) as any[]) {
        const month = String(r.period_month ?? '').slice(0, 10)
        const arr = storedByMonth.get(month) ?? []
        arr.push({ account_id: String(r.account_id), amount: Number(r.amount), updated_at: String(r.updated_at) })
        storedByMonth.set(month, arr)
      }
    } catch (err) {
      // A read, so no write is lost: the run simply fetches every month.
      storedByMonth.clear()
      record.stored_read_error = err instanceof Error ? err.message : String(err)
    }
  }

  // Rotation: the closed in-run month whose stored rows are oldest.
  // Compared as instants: PostgREST returns '+00:00' offsets, not 'Z'. An
  // unparseable stamp counts as oldest, so that month is the one re-read.
  let rotationMonth: string | null = null
  let rotationStamp: number | null = null
  for (const month of [...opts.runMonths].sort()) {
    if (month >= openFrom) continue
    const stored = storedByMonth.get(month)
    if (!stored || stored.length === 0) continue
    const oldest = Math.min(...stored.map((s) => {
      const t = Date.parse(s.updated_at)
      return Number.isFinite(t) ? t : -Infinity
    }))
    if (rotationStamp === null || oldest < rotationStamp) {
      rotationStamp = oldest
      rotationMonth = month
    }
  }

  const substitutions = new Map<string, ParsedPLRow[]>()
  const reusedStamps = new WeakMap<ParsedPLRow, string>()
  let fetchFailed = false

  const keep = (month: string, reason: string, extra: { delta?: number; error?: string } = {}) => {
    record.kept.push({ month, reason, ...extra })
  }

  /** Apply a split/zero outcome, refusing one that would leave the month empty. */
  const apply = (
    month: string,
    outcome: Extract<FxSplitOutcome, { kind: 'split' | 'zero' }>,
    accrualRows: readonly ParsedPLRow[],
    stamps: Map<string, string> | null,
  ): boolean => {
    const rows = outcome.kind === 'split' ? outcome.rows : []
    // The stale-row sweep is scoped per month by the ids written that month;
    // a month written with no rows is never swept. Keep the merged row rather
    // than leave a month the sweep cannot reach.
    if (rows.length === 0 && accrualRows.length <= 1) {
      keep(month, 'empty_month')
      return false
    }
    for (const r of rows) {
      const stamp = stamps?.get(r.account_id)
      if (stamp) reusedStamps.set(r, stamp)
    }
    substitutions.set(month, rows)
    if (outcome.kind === 'split' && outcome.residual !== 0) {
      record.residuals.push({ month, residual: outcome.residual })
    }
    return true
  }

  return {
    record,

    async processMonth(periodMonth, accrualRows) {
      let requested = 0
      try {
        const merged = mergedFxRows(accrualRows, tenantId)
        if (merged.length === 0) return 0
        if (fxIds.length === 0) {
          // Nothing a Trial Balance could split into — don't spend a request.
          keep(periodMonth, 'no_system_accounts')
          return 0
        }

        const decide = (tb: readonly ParsedTBRow[]) =>
          splitFxGroupMonth({ plRows: accrualRows, tbMovements: tb, catalog, tenantId, materiality: FX_SPLIT_MATERIALITY })

        // A zero merged row needs no Trial Balance to decide.
        const zeroCheck = decide([])
        if (zeroCheck.kind === 'zero') {
          if (apply(periodMonth, zeroCheck, accrualRows, null)) record.zero.push(periodMonth)
          return 0
        }
        if (zeroCheck.kind === 'kept' && (zeroCheck.reason === 'section' || zeroCheck.reason === 'ambiguous')) {
          keep(periodMonth, zeroCheck.reason)
          return 0
        }

        const open = periodMonth >= openFrom
        const stored = storedByMonth.get(periodMonth)
        if (!open && stored && stored.length > 0 && periodMonth !== rotationMonth) {
          // Re-check the stored split against THIS run's merged row with the
          // same rule a fresh Trial Balance gets. A restated month fails it
          // and falls through to a fetch.
          const asMovements: ParsedTBRow[] = stored.map((s) => ({
            account_id: s.account_id,
            account_name: '',
            section: null,
            debit: s.amount,
            credit: 0,
          }))
          const reuse = decide(asMovements)
          if (reuse.kind === 'split') {
            const stamps = new Map(stored.map((s) => [s.account_id, s.updated_at]))
            if (apply(periodMonth, reuse, accrualRows, stamps)) record.reused.push(periodMonth)
            return 0
          }
        }

        if (fetchFailed) {
          keep(periodMonth, 'fetch_skipped')
          return 0
        }

        let json: unknown
        try {
          const res = await fetchXeroWithRateLimit(trialBalanceUrl(periodMonth), {
            accessToken,
            tenantId,
            maxRetries: 2,
          })
          json = res.json
        } catch (fetchErr) {
          if (fetchErr instanceof RateLimitDailyExceededError) throw fetchErr
          fetchFailed = true
          keep(periodMonth, 'fetch_failed', {
            error: (fetchErr instanceof Error ? fetchErr.message : String(fetchErr)).slice(0, 200),
          })
          return 0
        }
        record.tb_requests++
        requested = 1

        const outcome = decide(parseTrialBalanceMovements(json))
        if (outcome.kind === 'split') {
          if (apply(periodMonth, outcome, accrualRows, null)) record.applied.push(periodMonth)
        } else if (outcome.kind === 'kept') {
          keep(periodMonth, outcome.reason, outcome.delta !== undefined ? { delta: outcome.delta } : {})
        }
        return requested
      } catch (err) {
        if (err instanceof RateLimitDailyExceededError) throw err
        // Splitter or parser threw: the merged row stays. The request, if one
        // was made before the throw, is still counted.
        substitutions.delete(periodMonth)
        keep(periodMonth, 'error', { error: (err instanceof Error ? err.message : String(err)).slice(0, 200) })
        return requested
      }
    },

    substitute(rows) {
      if (substitutions.size === 0) return rows as ParsedPLRow[]
      const out: ParsedPLRow[] = []
      for (const r of rows) {
        const replacement = substitutions.get(r.period_month)
        if (replacement && r.basis === 'accruals' && mergedFxRows([r], tenantId).length === 1) {
          out.push(...replacement)
        } else {
          out.push(r)
        }
      }
      return out
    },

    storedUpdatedAt(row) {
      return reusedStamps.get(row)
    },

    report() {
      if (record.kept.length === 0) return
      try {
        Sentry.captureMessage('FX account split kept the merged FX row', {
          level: 'warning',
          tags: {
            invariant: 'xero_sync_fx_split',
            business_id: profileId,
            tenant_id: tenantId,
          },
          extra: { kept: record.kept },
        } as any)
      } catch {
        // Sentry failure must not abort.
      }
    },
  }
}
