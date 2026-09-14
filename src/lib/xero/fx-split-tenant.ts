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
 *     the fetch (reason 'fetch_skipped').
 *   - A month whose fetch failed or was skipped re-emits its stored split when
 *     that split still ties to this run's merged row — closed, rotation OR open
 *     month (reused_after_fetch_failure). Keeping the merged row instead let
 *     the sweep delete a split that was still right, and the next run restore
 *     it: the grouping flipped between syncs on a passing 503 or a minute-limit
 *     429, and the September pack reports August, an OPEN month.
 *   - A CLOSED month the previous run's Trial Balance could not split
 *     ('unreconciled' / 'no_system_accounts') against the SAME merged amount is
 *     not re-read — except the one checked longest ago (a second rotation), so
 *     a fixed ledger is picked up within ~13 runs. Nothing is stored for such a
 *     month, so without this every run re-fetched all ~15 TBs indefinitely
 *     (Urban Road, were 497 absent from its TB: +60 calls a day). A moved
 *     merged amount is a restatement and always re-reads.
 *
 * SENTRY: one warning per tenant per run, and only when a month/reason is kept
 * (or reused after a failed fetch) that the previous run did not already
 * record. The standing record lives in sync_jobs.reconciliation.pl.fx_split;
 * the warning is for news. If the previous record cannot be read, every kept
 * month counts as new (the pre-dedupe behaviour).
 *
 * ROLLOUT: leave sections.fx_account_split OFF for a business until its gate-0
 * capture proves (a) Bank Revaluations appears in its Trial Balance and ties,
 * and (b) its /Accounts response carries SystemAccount on the three FX
 * accounts (scripts/capture-trialbalance-fixture.ts
 * --label=<slug>-trialbalance-YYYY-MM-DD --accounts-label=<slug>-accounts; see
 * that script's docblock). Gate 0 has run only when
 * fx-split-gate0-captures.test.ts runs rather than skips — it skips while the
 * capture files are absent. Either
 * failing is safe — every month keeps its merged row — but it is a flag that
 * does nothing except spend requests.
 *
 * ROLLBACK: turning the flag off restores the merged row in every month the
 * sync still fetches (both FY windows — the sweep removes the coded rows).
 * Months older than the prior FY are no longer synced, so any split there
 * stays split: totals unchanged, grouping as three accounts.
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
  /** A Trial Balance verdict only: the merged amount it could not split. */
  merged?: number
  /** A Trial Balance verdict only: when a TB last said so (carried while not re-read). */
  checked_at?: string
}

/** sync_jobs.reconciliation.pl.fx_split */
export type FxSplitRecord = {
  enabled: boolean
  skipped_reason?: 'multi_org'
  /** Months whose merged row was replaced from a Trial Balance fetched this run. */
  applied: string[]
  /** Months whose stored split still ties and was re-emitted (closed, or after a failed fetch). */
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
  /** Present only when a month's fetch failed/was skipped and its stored split was re-emitted. */
  reused_after_fetch_failure?: FxSplitKeptEntry[]
  /** Present only when the previous run's record could not be read. */
  prior_read_error?: string
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

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Reasons a fetched Trial Balance gave that the next run need not re-read. */
const TB_VERDICTS = new Set(['unreconciled', 'no_system_accounts'])

/** Oldest instant first; an unparseable stamp counts as oldest. */
function instant(stamp: string | undefined): number {
  const t = Date.parse(stamp ?? '')
  return Number.isFinite(t) ? t : -Infinity
}

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
  /** ONE Sentry warning per tenant per run, only for a kept/degraded month the previous run did not record. */
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

  // The previous finished run's record, for the two things above that need
  // memory: TB verdicts not to re-read, and which kept months are news. One
  // row off the (business_id, tenant_id, started_at) index; this run's own row
  // is still 'running', so the status filter skips it.
  const priorTbVerdicts = new Map<string, FxSplitKeptEntry & { merged: number; checked_at: string }>()
  const priorKeys = new Set<string>()
  try {
    const res = (await supabase
      .from('sync_jobs')
      .select('fx_split:reconciliation->pl->fx_split')
      .eq('business_id', profileId)
      .eq('tenant_id', tenantId)
      .eq('job_type', 'xero_pl_sync')
      .in('status', ['success', 'partial'])
      .order('started_at', { ascending: false })
      .limit(1)) as any
    if (res?.error) throw new Error(res.error.message ?? res.error.code ?? 'unknown')
    const prior = (res?.data?.[0]?.fx_split ?? null) as Partial<FxSplitRecord> | null
    const entries = (x: unknown): FxSplitKeptEntry[] =>
      Array.isArray(x) ? x.filter((e) => e && typeof e.month === 'string' && typeof e.reason === 'string') : []
    for (const e of [...entries(prior?.kept), ...entries(prior?.reused_after_fetch_failure)]) {
      priorKeys.add(`${e.month}|${e.reason}`)
    }
    for (const e of entries(prior?.kept)) {
      if (TB_VERDICTS.has(e.reason) && typeof e.merged === 'number' && typeof e.checked_at === 'string') {
        priorTbVerdicts.set(e.month, e as FxSplitKeptEntry & { merged: number; checked_at: string })
      }
    }
  } catch (err) {
    // A read: the run re-reads every month and reports every kept month.
    priorTbVerdicts.clear()
    priorKeys.clear()
    record.prior_read_error = err instanceof Error ? err.message : String(err)
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
    const oldest = Math.min(...stored.map((s) => instant(s.updated_at)))
    if (rotationStamp === null || oldest < rotationStamp) {
      rotationStamp = oldest
      rotationMonth = month
    }
  }

  // Verdict rotation: the closed in-run month whose TB verdict is oldest.
  let verdictRotationMonth: string | null = null
  let verdictRotationStamp: number | null = null
  for (const month of [...opts.runMonths].sort()) {
    if (month >= openFrom) continue
    const prior = priorTbVerdicts.get(month)
    if (!prior) continue
    const t = instant(prior.checked_at)
    if (verdictRotationStamp === null || t < verdictRotationStamp) {
      verdictRotationStamp = t
      verdictRotationMonth = month
    }
  }
  const checkedAt = opts.today.toISOString()

  const substitutions = new Map<string, ParsedPLRow[]>()
  const reusedStamps = new WeakMap<ParsedPLRow, string>()
  let fetchFailed = false

  const keep = (month: string, reason: string, extra: Omit<FxSplitKeptEntry, 'month' | 'reason'> = {}) => {
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
        const mergedAmount = round2(merged[0]!.amount)

        // Re-check the stored split against THIS run's merged row with the
        // same rule a fresh Trial Balance gets. A restated month fails it.
        // 'refused' = it tied but apply() kept the merged row (recorded there).
        const tryReuse = (): 'applied' | 'refused' | 'no' => {
          if (!stored || stored.length === 0) return 'no'
          const asMovements: ParsedTBRow[] = stored.map((s) => ({
            account_id: s.account_id,
            account_name: '',
            section: null,
            debit: s.amount,
            credit: 0,
          }))
          const reuse = decide(asMovements)
          if (reuse.kind !== 'split') return 'no'
          const stamps = new Map(stored.map((s) => [s.account_id, s.updated_at]))
          return apply(periodMonth, reuse, accrualRows, stamps) ? 'applied' : 'refused'
        }

        /** No fresh Trial Balance this run: a tying stored split, else the merged row. */
        const withoutTb = (reason: 'fetch_failed' | 'fetch_skipped', error?: string): number => {
          const entry: FxSplitKeptEntry = { month: periodMonth, reason, ...(error !== undefined ? { error } : {}) }
          const reused = tryReuse()
          if (reused === 'applied') {
            record.reused.push(periodMonth)
            ;(record.reused_after_fetch_failure ??= []).push(entry)
          } else if (reused === 'no') {
            record.kept.push(entry)
          }
          return 0
        }

        if (!open && periodMonth !== rotationMonth) {
          const reused = tryReuse()
          if (reused === 'applied') record.reused.push(periodMonth)
          if (reused !== 'no') return 0
        }

        const verdict = priorTbVerdicts.get(periodMonth)
        if (!open && verdict && verdict.merged === mergedAmount && periodMonth !== verdictRotationMonth) {
          keep(periodMonth, verdict.reason, {
            ...(typeof verdict.delta === 'number' ? { delta: verdict.delta } : {}),
            merged: verdict.merged,
            checked_at: verdict.checked_at,
          })
          return 0
        }

        if (fetchFailed) return withoutTb('fetch_skipped')

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
          return withoutTb('fetch_failed', (fetchErr instanceof Error ? fetchErr.message : String(fetchErr)).slice(0, 200))
        }
        record.tb_requests++
        requested = 1

        const outcome = decide(parseTrialBalanceMovements(json))
        if (outcome.kind === 'split') {
          if (apply(periodMonth, outcome, accrualRows, null)) record.applied.push(periodMonth)
        } else if (outcome.kind === 'kept') {
          keep(periodMonth, outcome.reason, {
            ...(outcome.delta !== undefined ? { delta: outcome.delta } : {}),
            // A TB verdict carries what the next run needs to skip re-reading it.
            ...(TB_VERDICTS.has(outcome.reason) ? { merged: mergedAmount, checked_at: checkedAt } : {}),
          })
        }
        return requested
      } catch (err) {
        if (err instanceof RateLimitDailyExceededError) throw err
        // Splitter or parser threw: the merged row stays. The request, if one
        // was made before the throw, is still counted.
        substitutions.delete(periodMonth)
        record.reused = record.reused.filter((m) => m !== periodMonth)
        record.applied = record.applied.filter((m) => m !== periodMonth)
        record.zero = record.zero.filter((m) => m !== periodMonth)
        record.residuals = record.residuals.filter((x) => x.month !== periodMonth)
        if (record.reused_after_fetch_failure) {
          record.reused_after_fetch_failure = record.reused_after_fetch_failure.filter((e) => e.month !== periodMonth)
          if (record.reused_after_fetch_failure.length === 0) delete record.reused_after_fetch_failure
        }
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
      const degraded = [...record.kept, ...(record.reused_after_fetch_failure ?? [])]
      const fresh = degraded.filter((e) => !priorKeys.has(`${e.month}|${e.reason}`))
      if (fresh.length === 0) return
      try {
        Sentry.captureMessage('FX account split kept the merged FX row', {
          level: 'warning',
          tags: {
            invariant: 'xero_sync_fx_split',
            business_id: profileId,
            tenant_id: tenantId,
          },
          extra: {
            new: fresh,
            kept: record.kept,
            ...(record.reused_after_fetch_failure ? { reused_after_fetch_failure: record.reused_after_fetch_failure } : {}),
          },
        } as any)
      } catch {
        // Sentry failure must not abort.
      }
    },
  }
}
