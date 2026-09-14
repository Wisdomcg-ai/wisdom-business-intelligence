/**
 * A finalised month's balance sheet, frozen at the moment it was finalised
 * (decision 19, accepted 14 Sep 2026).
 *
 * Every other page of the pack prints from the stored snapshot, so a
 * finalised August re-exported in October prints August as it was signed off.
 * The balance sheet did not: it asked Xero live at every export, so the same
 * pack printed whatever Xero said on the day of the export. Urban Road's
 * August already shows it: an $853.89 credit posted after the delivered Calxa
 * pack was run moved Trade Debtors, GST and Current Earnings (audit
 * bs-aug26-figures-moved), so a live re-export no longer matches what the
 * client was sent — and a pack that changes after it is final is not a record
 * of anything.
 *
 * So Finalise now captures both comparisons — the route's response for mom and
 * for yoy, exactly what the export would have fetched — into the snapshot's
 * report_data under FROZEN_BALANCE_SHEETS_KEY, and an export of a FINAL month
 * prints those. Drafts keep asking Xero.
 *
 * Fail-open, in both directions:
 *   - The freeze is a write that must never stand between a coach and
 *     Finalise. It runs after the finalise has saved; if Xero cannot answer or
 *     the write does not land, finalising has still happened, the failure goes
 *     to Sentry under invariant `balance-sheet-freeze`, and the export stays
 *     live.
 *   - Every finalised month before this shipped has no frozen payload. Those
 *     — and any payload that is not a whole sheet for this month in both
 *     comparisons — export live, exactly as they did, and nothing on the page
 *     claims a freeze that did not happen.
 *
 * Both comparisons or neither. The report month's own column appears on both
 * pages; a frozen prior-month page beside a live prior-year page could print
 * two different Augusts in one pack.
 *
 * The freeze runs in the browser, after the Finalise has saved, and a closed
 * tab kills it with no event anywhere. So the Finalise save itself (the POST,
 * server-side) records that a freeze is OWED — `{ report_month, finalised_at }`
 * under the same key — and an export that finds one still owed freezes the
 * sheets it is printing, and says in Sentry that it did so late. A month
 * finalised before any of this carries no marker and stays live, as above.
 *
 * ── Approve & Send (package B, accepted 15 Sep 2026) ──
 *
 * Approve & Send is offered straight from draft, so a coach can send without
 * ever pressing Finalise — and then the client's PDF printed a live sheet that
 * nothing kept. So the send keeps the two sheets its PDF was built from, under
 * the same key and in the same shape, in cfo_report_status.snapshot_data: the
 * payload written at approval, which every revert preserves (D-18) and no
 * snapshot save touches. Not in the snapshot's report_data: after a send from
 * draft nothing locks the page, the first commentary blur POSTs a draft save,
 * and a draft save strips the key (withoutFrozenBalanceSheets) — the trap a
 * Finalise freeze is meant to fall into, and a sent copy must not.
 *
 * An export prints the sent copy ahead of every rule above, while
 *   - it is a whole copy of this month,
 *   - the report on screen carries the P&L that was sent (the same reason a
 *     regenerated final month prints live — see reportMatchesSnapshot), and
 *   - the coach has not reopened it. Revert to Draft is the deliberate reopen:
 *     it marks the copy `reopened_at` and keeps it as the record of what was
 *     sent. The silent reverts (a draft save, a commentary run, a settings or
 *     layout save, a Finalise) leave it standing — the client still has it.
 *     They also take Revert to Draft off the status bar, so the bar says a
 *     copy is kept whatever the status (useReportStatus reads its stamps) and
 *     from draft offers "Reopen balance sheet", the same action. A reopen that
 *     does not land fails that action out loud, and the offer stays.
 * A new Approve & Send replaces snapshot_data and keeps what THAT PDF printed,
 * which is the sent copy again when the report is unchanged. The send never
 * writes the snapshot, so a Finalise freeze is never overwritten; when one
 * exists the send printed it, and keeps that same copy.
 *
 * The same fail-open rule: keeping the copy is a write after the approval has
 * saved, and never stands between a coach and the send. Half a sheet, or a
 * write that does not land, is captured under `balance-sheet-freeze` with
 * stage `approve_and_send`, and the email goes.
 */
import * as Sentry from '@sentry/nextjs'
import type { BalanceSheetCompare, BalanceSheetData } from '@/app/finances/monthly-report/types'
import type { BalanceSheetPdfSources } from '@/app/finances/monthly-report/utils/balance-sheet-pdf'
import { balanceSheetDates } from './balance-sheet-rows'

/**
 * Where the frozen sheets live: inside monthly_report_snapshots.report_data for
 * a Finalise, inside cfo_report_status.snapshot_data for an Approve & Send.
 */
export const FROZEN_BALANCE_SHEETS_KEY = 'frozen_balance_sheets'

export interface FrozenBalanceSheets {
  /** When the freeze was written (ISO). */
  frozen_at: string
  /** The finalise this freeze belongs to — the marker's time, set by the route. */
  finalised_at?: string
  /** A sent copy only: when Revert to Draft reopened it. Kept, never printed. */
  reopened_at?: string
  /** YYYY-MM the sheets were built for — checked on read, never assumed. */
  report_month: string
  mom: BalanceSheetData
  yoy: BalanceSheetData
}

const COMPARES: readonly BalanceSheetCompare[] = ['mom', 'yoy']

/** A whole sheet for this comparison of this month — not an error body, not an empty report. */
export function isSheetFor(value: unknown, compare: BalanceSheetCompare, reportMonth: string): value is BalanceSheetData {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<BalanceSheetData>
  return (
    v.compare === compare &&
    v.report_date === balanceSheetDates(reportMonth, compare).current &&
    Array.isArray(v.rows) &&
    v.rows.length > 0 &&
    typeof v.balances === 'boolean'
  )
}

/** The frozen sheets, if `value` is a complete freeze of `reportMonth`; otherwise null. */
export function readFrozenBalanceSheets(value: unknown, reportMonth: string): FrozenBalanceSheets | null {
  if (!value || typeof value !== 'object' || !/^\d{4}-\d{2}$/.test(reportMonth)) return null
  const v = value as Partial<FrozenBalanceSheets>
  if (v.report_month !== reportMonth || typeof v.frozen_at !== 'string') return null
  if (!COMPARES.every((c) => isSheetFor(v[c], c, reportMonth))) return null
  return {
    frozen_at: v.frozen_at,
    ...(typeof v.finalised_at === 'string' ? { finalised_at: v.finalised_at } : {}),
    ...(typeof v.reopened_at === 'string' ? { reopened_at: v.reopened_at } : {}),
    report_month: reportMonth,
    mom: v.mom!,
    yoy: v.yoy!,
  }
}

/**
 * The finalise time a report_data's freeze key records for this month — owed
 * or landed, either way — or null when it records none (a draft save, or a
 * month finalised before the marker existed).
 */
export function readFreezeFinalisedAt(reportData: unknown, reportMonth: string): string | null {
  if (!reportData || typeof reportData !== 'object') return null
  const key = (reportData as Record<string, unknown>)[FROZEN_BALANCE_SHEETS_KEY] as
    | { report_month?: unknown; finalised_at?: unknown }
    | null
    | undefined
  if (!key || typeof key !== 'object' || key.report_month !== reportMonth) return null
  return typeof key.finalised_at === 'string' ? key.finalised_at : null
}

/**
 * A snapshot save's report_data with the freeze it owes. A Finalise records
 * `{ report_month, finalised_at }` — the freeze then belongs to exactly this
 * finalise, and the freeze write is guarded on it — so a freeze that dies in a
 * closed tab is still visible, and recoverable, at the next export. A draft
 * owes nothing. Expects report_data already stripped of any stored freeze.
 */
export function markBalanceSheetFreezeDue<T>(reportData: T, status: string, reportMonth: string, finalisedAt: string): T {
  if (status !== 'final' || !reportData || typeof reportData !== 'object') return reportData
  return { ...reportData, [FROZEN_BALANCE_SHEETS_KEY]: { report_month: reportMonth, finalised_at: finalisedAt } }
}

/**
 * The finalise time of a FINAL snapshot that owes a freeze which never
 * landed; otherwise null — a draft, a whole freeze already stored, or a month
 * finalised before the marker existed (which exports live and owes nothing).
 */
export function balanceSheetFreezeDue(
  snapshot: { status?: string | null; report_data?: unknown } | null | undefined,
  reportMonth: string,
): string | null {
  if (snapshot?.status !== 'final') return null
  if (frozenBalanceSheetSources(snapshot, reportMonth)) return null
  return readFreezeFinalisedAt(snapshot.report_data, reportMonth)
}

/** JSON with sorted keys, so a page's object and jsonb's re-ordered copy compare equal. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const obj = value as Record<string, unknown>
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
    .join(',')}}`
}

/**
 * Whether the report on screen carries the stored report's P&L figures.
 *
 * A FINAL month can be regenerated view-only: the pack's P&L, full-year and
 * commentary pages then print the new in-memory report, while the stored row
 * still holds the finalised one. The frozen balance sheet belongs to the
 * finalised one — its Current Earnings is that report's profit — so printing
 * it beside a regenerated P&L can put two different profits in one pack. The
 * figures compared are the ones the sheet can disagree with: the summary and
 * the profit rows. A regenerate that moved none of them changed nothing the
 * sheet reports.
 */
export function reportMatchesSnapshot(report: unknown, storedReportData: unknown): boolean {
  const a = pnlFigures(report)
  const b = pnlFigures(storedReportData)
  return !!a && !!b && canonical(a) === canonical(b)
}

/**
 * The P&L figures a frozen sheet can disagree with — reportMatchesSnapshot's
 * comparison — and nothing else of the report. What the snapshot route hands
 * back for a sent copy, instead of the whole sent report.
 */
export function pnlFigures(report: unknown): Record<string, unknown> | null {
  if (!report || typeof report !== 'object') return null
  const r = report as Record<string, unknown>
  const figures: Record<string, unknown> = {
    report_month: r.report_month,
    budget_source: r.budget_source,
    summary: r.summary,
    gross_profit_row: r.gross_profit_row,
    operating_profit_row: r.operating_profit_row,
    net_profit_row: r.net_profit_row,
  }
  for (const k of Object.keys(figures)) if (figures[k] === undefined) delete figures[k]
  return figures
}

// ─── The sheets an Approve & Send printed ───────────────────────────────────

/** What the snapshot route returns for a month's send: its copy, and the P&L it was sent beside. */
export interface SentBalanceSheets {
  /** cfo_report_status.snapshot_data's freeze, as stored — checked here on read, never trusted. */
  frozen: unknown
  /** pnlFigures of the report that was sent. */
  report: unknown
}

/** The two sheets a PDF was built from, as the send posts them: null where the PDF printed a reason. */
export function printedBalanceSheets(
  sources: BalanceSheetPdfSources | undefined,
): { mom: BalanceSheetData | null; yoy: BalanceSheetData | null } | undefined {
  if (!sources) return undefined
  return { mom: sources.mom?.data ?? null, yoy: sources.yoy?.data ?? null }
}

/**
 * The sent copy an export prints, or null: a whole copy of this month that
 * the coach has not reopened, beside the report that was sent. See the header.
 */
export function sentBalanceSheetSources(
  sent: SentBalanceSheets | null | undefined,
  report: unknown,
  reportMonth: string,
): BalanceSheetPdfSources | null {
  const frozen = readFrozenBalanceSheets(sent?.frozen, reportMonth)
  if (!frozen || frozen.reopened_at) return null
  if (!reportMatchesSnapshot(report, sent?.report)) return null
  return { mom: { data: frozen.mom }, yoy: { data: frozen.yoy } }
}

/**
 * What the export prints for a snapshot, when that is the frozen sheet: only a
 * FINAL snapshot carrying a complete freeze of this month. Null means "ask
 * Xero", which is what a draft, and every month finalised before the freeze
 * existed, does.
 */
export function frozenBalanceSheetSources(
  snapshot: { status?: string | null; report_data?: unknown } | null | undefined,
  reportMonth: string,
): BalanceSheetPdfSources | null {
  if (snapshot?.status !== 'final') return null
  const reportData = snapshot.report_data as Record<string, unknown> | null | undefined
  const frozen = readFrozenBalanceSheets(reportData?.[FROZEN_BALANCE_SHEETS_KEY], reportMonth)
  return frozen ? { mom: { data: frozen.mom }, yoy: { data: frozen.yoy } } : null
}

/**
 * report_data without a freeze. The snapshot save replaces the whole report,
 * so it must not carry a freeze forward either: the page's in-memory report
 * holds whatever freeze it was loaded with, and an unfinalise → edit →
 * re-finalise would otherwise write August's first freeze back under the
 * re-finalised report — and if the new freeze then failed, the export would
 * print the stale one as final. Only the freeze action writes the key.
 */
export function withoutFrozenBalanceSheets<T>(reportData: T): T {
  if (!reportData || typeof reportData !== 'object' || !(FROZEN_BALANCE_SHEETS_KEY in reportData)) return reportData
  const { [FROZEN_BALANCE_SHEETS_KEY]: _dropped, ...rest } = reportData as Record<string, unknown>
  return rest as T
}

// ─── Fetching (browser) ─────────────────────────────────────────────────────

/**
 * How long one load of both balance-sheet comparisons may take, in ms — one
 * deadline shared by the two round-trips, not one each.
 *
 * Without it a read that never answered held Export and Approve & Send until
 * the platform cut the route off (maxDuration 120s), once per comparison, and
 * the bounded freeze wait bought nothing: an export behind a stuck freeze goes
 * on to read these same endpoints. 90s leaves the route room to wait out one
 * Xero minute-limit Retry-After (60s) and still answer; past it the page says
 * why it has no sheet, and the export goes on without it.
 */
export const LIVE_BALANCE_SHEET_TIMEOUT_MS = 90_000

/** Completes "This page couldn't be produced: …". */
const TIMED_OUT_REASON = "Xero didn't send the balance sheet in time — export again in a minute or two"

/**
 * Both balance-sheet comparisons from /api/Xero/balance-sheet, as the export
 * needs them. Two round-trips because the endpoint answers one comparison at a
 * time, both inside LIVE_BALANCE_SHEET_TIMEOUT_MS. A failure never throws — it
 * travels as a reason the page prints, and is captured rather than swallowed.
 */
export async function loadLiveBalanceSheets(
  businessId: string,
  reportMonth: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = LIVE_BALANCE_SHEET_TIMEOUT_MS,
): Promise<BalanceSheetPdfSources> {
  const sources: BalanceSheetPdfSources = {}
  const controller = new AbortController()
  // Raced as well as signalled: the abort cancels the request (and a stalled
  // body) in a real fetch, and the race ends the wait even for one that
  // ignores the signal.
  let timer: ReturnType<typeof setTimeout> | undefined
  const TIMED_OUT = Symbol('timed-out')
  const deadline = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => {
      controller.abort()
      resolve(TIMED_OUT)
    }, timeoutMs)
  })
  const withinDeadline = <T>(work: Promise<T>) => {
    work.catch(() => {}) // settled after the deadline: already reported as timed out
    return Promise.race([work, deadline])
  }
  const timedOut = (compare: BalanceSheetCompare) => {
    sources[compare] = { data: null, reason: TIMED_OUT_REASON }
    Sentry.captureMessage(`[PDF] balance-sheet ${compare} did not answer in time — the page will state why`, {
      level: 'warning',
      tags: { invariant: 'pdf-balance-sheet-load' },
      extra: { businessId, reportMonth, timeoutMs },
    } as any)
  }
  try {
    for (const compare of COMPARES) {
      // The deadline is shared: a comparison it has already passed is not
      // asked for, so an export that has given up adds no Xero calls.
      if (controller.signal.aborted) {
        timedOut(compare)
        continue
      }
      try {
        const res = await withinDeadline(
          fetchImpl(
            `/api/Xero/balance-sheet?business_id=${encodeURIComponent(businessId)}&month=${encodeURIComponent(reportMonth)}&compare=${compare}`,
            { signal: controller.signal },
          ),
        )
        if (res === TIMED_OUT) {
          timedOut(compare)
        } else if (res.ok) {
          const body = await withinDeadline(res.json())
          if (body === TIMED_OUT) timedOut(compare)
          else sources[compare] = { data: body }
        } else {
          const body = await withinDeadline(res.json().catch(() => ({} as any)))
          const reason = body !== TIMED_OUT && typeof body?.error === 'string' ? body.error : `Xero returned ${res.status}`
          sources[compare] = { data: null, reason }
          Sentry.captureMessage(
            `[PDF] balance-sheet ${compare} load failed (${res.status}) — the page will state why`,
            'warning' as any,
          )
        }
      } catch (err) {
        if (controller.signal.aborted) {
          timedOut(compare)
        } else {
          sources[compare] = { data: null, reason: 'the balance sheet could not be reached' }
          Sentry.captureException(err, { tags: { invariant: 'pdf-balance-sheet-load' } } as any)
        }
      }
    }
  } finally {
    clearTimeout(timer)
  }
  return sources
}

/**
 * The month's sent copy, for an export — through the snapshot route, which
 * reads cfo_report_status behind the page's own access checks, so any viewer's
 * export finds it. Null when the month was never sent (or sent before copies
 * were kept), and null when the read fails: the export then goes on by the
 * rules it always had. Never throws; a failure is captured, because it can be
 * a sent month printing a sheet other than the one the client has.
 */
export async function loadSentBalanceSheets(
  businessId: string,
  reportMonth: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SentBalanceSheets | null> {
  const tags = { invariant: 'balance-sheet-freeze', stage: 'export_read_sent' }
  try {
    const res = await fetchImpl(
      `/api/monthly-report/snapshot?business_id=${encodeURIComponent(businessId)}&report_month=${encodeURIComponent(reportMonth)}&view=sent_balance_sheets`,
    )
    const body = await res.json().catch(() => ({} as any))
    if (!res.ok) {
      Sentry.captureMessage('[BalanceSheet freeze] could not read the sent balance sheet — this export follows the other rules', {
        level: 'warning',
        tags,
        extra: { businessId, reportMonth, status: res.status, error: body?.error ?? null },
      } as any)
      return null
    }
    return body?.sent_balance_sheets ?? null
  } catch (err) {
    Sentry.captureException(err, { tags, extra: { businessId, reportMonth } } as any)
    return null
  }
}

/**
 * Write `sources` as the month's freeze. Resolves `true` only when it landed;
 * never throws. Every way it does not land is captured under invariant
 * `balance-sheet-freeze`, because each one is a finalised month exporting live.
 */
async function writeBalanceSheetFreeze(
  businessId: string,
  reportMonth: string,
  sources: BalanceSheetPdfSources,
  fetchImpl: typeof fetch,
  extra: Record<string, unknown>,
): Promise<boolean> {
  try {
    const mom = sources.mom?.data
    const yoy = sources.yoy?.data
    if (!isSheetFor(mom, 'mom', reportMonth) || !isSheetFor(yoy, 'yoy', reportMonth)) {
      Sentry.captureMessage('[BalanceSheet freeze] not frozen — no whole sheet to freeze; exports stay live', {
        level: 'warning',
        tags: { invariant: 'balance-sheet-freeze' },
        extra: { ...extra, mom: sources.mom?.reason ?? null, yoy: sources.yoy?.reason ?? null },
      } as any)
      return false
    }
    const res = await fetchImpl('/api/monthly-report/snapshot', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: businessId,
        report_month: reportMonth,
        action: 'freeze_balance_sheets',
        balance_sheets: { mom, yoy },
      }),
    })
    const body = await res.json().catch(() => ({} as any))
    if (!res.ok || body?.updated !== true) {
      // updated:false is not an error on the route's side — the month was
      // unfinalised, or re-finalised, between the finalise and the freeze —
      // but it IS a finalised month exporting live, which is what this tag
      // counts.
      Sentry.captureMessage('[BalanceSheet freeze] not frozen — the snapshot write did not land; exports stay live', {
        level: res.ok ? 'warning' : 'error',
        tags: { invariant: 'balance-sheet-freeze' },
        extra: { ...extra, status: res.status, error: body?.error ?? null, updated: body?.updated ?? null, reason: body?.reason ?? null },
      } as any)
      return false
    }
    return true
  } catch (err) {
    Sentry.captureException(err, { tags: { invariant: 'balance-sheet-freeze' }, extra } as any)
    return false
  }
}

/**
 * Freeze the month's balance sheets into its FINAL snapshot. Called after a
 * Finalise has saved; resolves `true` only when the freeze landed. Never
 * throws — see the header for why a failure here must not reach the coach as
 * a failed Finalise.
 */
export async function freezeBalanceSheetsAtFinalise(
  businessId: string,
  reportMonth: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const extra = { businessId, reportMonth }
  try {
    const live = await loadLiveBalanceSheets(businessId, reportMonth, fetchImpl)
    return await writeBalanceSheetFreeze(businessId, reportMonth, live, fetchImpl, extra)
  } catch (err) {
    Sentry.captureException(err, { tags: { invariant: 'balance-sheet-freeze' }, extra } as any)
    return false
  }
}

/**
 * How long an export waits for the freeze this tab's Finalise started, in ms.
 *
 * Finalise → Export straight away is the normal flow, and the freeze is two
 * Xero GETs and a PATCH — a few seconds on a good day, and Xero's rate-limit
 * retries can stretch one. Past this the export stops waiting: a hung request
 * must not hold Export or Approve & Send for the month (it did — the wait had
 * no limit). The freeze is not cancelled; it lands or fails on its own.
 */
export const PENDING_FREEZE_WAIT_MS = 15_000

/** How a Finalise's freeze stood when the export stopped waiting for it. */
export type PendingFreezeOutcome = 'landed' | 'not_landed' | 'still_running'

/**
 * Wait for a pending freeze, for at most `timeoutMs`. Never throws: the freeze
 * itself never rejects, and if it somehow did, that is a freeze that did not
 * land (its own capture has already said why), not a failed export.
 */
export async function waitForPendingFreeze(
  done: Promise<boolean>,
  timeoutMs: number = PENDING_FREEZE_WAIT_MS,
): Promise<PendingFreezeOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const gaveUp = new Promise<PendingFreezeOutcome>((resolve) => {
    timer = setTimeout(() => resolve('still_running'), timeoutMs)
  })
  const settled = done.then(
    (landed): PendingFreezeOutcome => (landed ? 'landed' : 'not_landed'),
    (): PendingFreezeOutcome => 'not_landed',
  )
  try {
    return await Promise.race([settled, gaveUp])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The two balance-sheet sources an export prints, and — when the month is owed
 * a freeze that never landed — that freeze, written from the same sheets.
 *
 *   - SENT (`sent`, see loadSentBalanceSheets): a whole copy of this month,
 *     not reopened, and the report on screen carries the P&L that was sent —
 *     the sent copy, ahead of everything below, whatever the snapshot's status.
 *     Xero is not asked and nothing is written. Sent then finalised, the
 *     client has the sent sheet, not the one the Finalise froze later.
 *   - FINAL, the report on screen is the stored one, and a whole freeze is
 *     stored: the freeze. Xero is not asked.
 *   - FINAL but REGENERATED on screen: live, so the sheet agrees with the P&L
 *     printed beside it (reportMatchesSnapshot has the why). The stored month
 *     keeps whatever freeze it has.
 *   - FINAL, the stored report, a freeze owed and missing: live, and those
 *     same sheets are frozen now. Late — the sheet is as Xero stands at this
 *     export, not at the finalise — so it is recorded as late, but it stops
 *     every later export of the month moving again.
 *   - FINAL, the stored report, no whole freeze yet, and this tab's own
 *     Finalise freeze still running past the export's wait
 *     (`freezeInFlight`, see waitForPendingFreeze): live, and nothing frozen
 *     by this export. That freeze owns the month; a second one written here
 *     would race it for the same row. It lands or fails under its own
 *     invariant, and the export is counted as a finalised month printed live.
 *   - Anything else (a draft, no snapshot, a month finalised before freezing
 *     existed): live, owing nothing, claiming nothing.
 *
 * Never throws: every failure travels as a page reason or a Sentry event.
 */
export async function balanceSheetsForExport(args: {
  businessId: string
  reportMonth: string
  report: unknown
  stored: { status?: string | null; report_data?: unknown } | null | undefined
  /** This tab's Finalise freeze had not settled when the export stopped waiting for it. */
  freezeInFlight?: boolean
  /** The month's send, if any — loadSentBalanceSheets. */
  sent?: SentBalanceSheets | null
  fetchImpl?: typeof fetch
}): Promise<BalanceSheetPdfSources> {
  const { businessId, reportMonth, report, stored, freezeInFlight = false, sent, fetchImpl = fetch } = args
  const sentCopy = sentBalanceSheetSources(sent, report, reportMonth)
  if (sentCopy) return sentCopy
  const isStoredFinal = stored?.status === 'final' && reportMatchesSnapshot(report, stored.report_data)
  if (isStoredFinal) {
    const frozen = frozenBalanceSheetSources(stored, reportMonth)
    if (frozen) return frozen
  }
  const live = await loadLiveBalanceSheets(businessId, reportMonth, fetchImpl)
  const finalisedAt = isStoredFinal ? balanceSheetFreezeDue(stored, reportMonth) : null
  if (finalisedAt && freezeInFlight) {
    Sentry.captureMessage('[BalanceSheet freeze] still running at export — this export printed the live sheet', {
      level: 'warning',
      tags: { invariant: 'balance-sheet-freeze' },
      extra: { businessId, reportMonth, finalisedAt, waitedMs: PENDING_FREEZE_WAIT_MS },
    } as any)
    return live
  }
  if (finalisedAt) {
    const extra = { businessId, reportMonth, finalisedAt }
    Sentry.captureMessage('[BalanceSheet freeze] missing at export — frozen now, after the finalise', {
      level: 'warning',
      tags: { invariant: 'balance-sheet-freeze' },
      extra,
    } as any)
    await writeBalanceSheetFreeze(businessId, reportMonth, live, fetchImpl, extra)
  }
  return live
}
