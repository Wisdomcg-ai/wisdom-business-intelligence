'use client'

/**
 * CFO Production Board — replaces the old financial summary dashboard.
 *
 * One job: where is every client in this month's report cycle, and what's
 * blocking me. NO financial figures by design (locked decision, Sep 2026) —
 * performance lives in the monthly report itself. The main view is a simple
 * spreadsheet-style table (Matt's own tracking sheet, 5 Sep 2026): one row
 * per client, unreconciled counts split "before report month" / "report
 * month", green = 0. Detail and actions live in the expandable row.
 *
 * Fail-closed rendering rules (house):
 * - The reconciliation verdict comes from the CAPTURED Xero badge (recon
 *   round) vs the selected report month: READY / BLOCKED / STALE / NEVER.
 *   No capture or a stale capture is never shown as ready.
 * - The API's recorded-transaction count is a different population (it can't
 *   see uncoded feed lines) — demoted to one cross-check line in the
 *   expanded view (demote decision, 5 Sep 2026).
 */

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Loader2, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2,
  RefreshCw, ExternalLink, ClipboardList, EyeOff,
} from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import { STALE_CAPTURE_DAYS } from '@/lib/cfo/dashboard-capture'

type PipelineStage = 'none' | 'generated' | 'ready' | 'approved' | 'sent' | 'discussed'
type BoardSection = 'overdue' | 'blocked' | 'in_progress' | 'sent'
type ReconState = 'clear' | 'outstanding' | 'partial' | 'unknown'

interface BoardClient {
  business_id: string
  business_name: string
  section: BoardSection
  stage: PipelineStage
  cycle: {
    generated_at: string | null
    approved_at: string | null
    sent_at: string | null
    discussed_at: string | null
    status: string | null
  }
  due_day: number | null
  due_date: string | null
  days_overdue: number | null
  connection: {
    status: string
    needs_attention: boolean
    last_sync_at: string | null
    tenant_count: number
    tenant_names: (string | null)[]
  }
  recon: {
    state: ReconState
    totalCount: number
    totalValue: number | null
    currency: string | null
    mixedCurrencies: boolean
    source: 'statement_lines' | 'account_transactions' | 'mixed' | null
    months: { month: string; count: number; value: number | null }[]
    byAccount: { name: string; count: number }[]
    checkedAt: string | null
    checkedTenants: number
    erroredTenants: number
    tenantCount: number
  }
  /** The Xero dashboard "Reconcile N items" badge, captured by an operator —
   *  the banner-exact number the API cannot provide. Null = never captured. */
  dashboard_capture: {
    total_count: number
    captured_at: string
    captured_tenants: number
    tenant_count: number
    accounts: { name: string; count: number; months: Record<string, number> | null }[]
    notes: string[]
  } | null
  /** The board's ONE reconciliation question, from the captured badge. */
  readiness: {
    state: 'ready' | 'blocked' | 'stale' | 'never' | 'partial'
    blocking: number
    blocking_prior: number
    blocking_current: number
    possibly_blocking: number
    by_account: { name: string; blocking: number; unsplit: boolean }[]
    ignored: { name: string; count: number }[]
    uncaptured_tenants: number
    captured_at: string | null
    capture_age_days: number | null
  }
  recon_ignored_accounts: string[]
  bookkeeper: { name: string | null; email: string | null }
}

interface BoardStats {
  overdue: number
  blocked: number
  in_progress: number
  sent: number
  discussed: number
}

interface BoardResponse {
  month: string
  clients: BoardClient[]
  hidden: { business_id: string; business_name: string }[]
  stats: BoardStats
  /** Latest recon-round request — the "Update from Xero" button's state.
   *  Null until the first request (or if the read degraded). */
  recon_round: {
    id: string
    status: 'pending' | 'running' | 'done' | 'failed' | 'expired'
    source: string
    requested_at: string
    started_at: string | null
    finished_at: string | null
    result_note: string | null
  } | null
}

/** Matches PICKUP_WINDOW_MINUTES on the request route: a pending request
 *  older than this was never collected by the Mac-side watcher. */
const PICKUP_WINDOW_MINUTES = 30

/** Client-side bound on how long a 'running' row counts as live — must stay
 *  above the watcher's RUN_TIMEOUT_MINUTES (60, recon-round-watcher.mjs) so
 *  a healthy run never renders as dead; if it elapses, the watcher/Mac died
 *  mid-run and the UI must say so instead of spinning forever. */
const RUNNING_TIMEOUT_MINUTES = 65

/** Is the latest request still genuinely in flight? Shared by the button and
 *  the poll so the two can never disagree. Both states are age-bounded —
 *  fail-closed: a row nothing will ever finish must not render as live. */
function reconRoundIsLive(rr: BoardResponse['recon_round']): boolean {
  if (!rr) return false
  if (rr.status === 'pending') {
    return Date.now() - new Date(rr.requested_at).getTime() < PICKUP_WINDOW_MINUTES * 60_000
  }
  if (rr.status === 'running') {
    return Date.now() - new Date(rr.started_at ?? rr.requested_at).getTime() < RUNNING_TIMEOUT_MINUTES * 60_000
  }
  return false
}

function defaultReportMonth(): string {
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
}

function formatMonthLabel(monthKey: string): string {
  const date = new Date(monthKey + '-01T00:00:00')
  return date.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
}

function shortMonthYear(monthKey: string): string {
  const date = new Date(monthKey + '-01T00:00:00')
  return date.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

function relTime(iso: string | null): string {
  if (!iso) return ''
  const hours = Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000)
  if (hours < 1) return 'just now'
  if (hours < 48) return `${hours} h ago`
  return `${Math.round(hours / 24)} d ago`
}

const CONNECTION_LABELS: Record<string, string> = {
  connected: 'Xero OK',
  data_stale: 'No fresh data',
  auth_stale: 'Auth stale',
  pending_first_sync: 'First sync pending',
  dead: 'Xero disconnected',
  none: 'No connection',
  unknown: 'Health unknown',
}

/** Left-edge stripe on each table row — the urgency colour without sections. */
const ROW_BORDER: Record<BoardSection, string> = {
  overdue: 'border-l-red-600',
  blocked: 'border-l-amber-500',
  in_progress: 'border-l-brand-navy-400',
  sent: 'border-l-green-500',
}

const SECTION_RANK: Record<BoardSection, number> = { overdue: 0, blocked: 1, in_progress: 2, sent: 3 }

export default function CfoBoardPage() {
  const [month, setMonth] = useState(defaultReportMonth())
  const [data, setData] = useState<BoardResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<BoardSection | 'all'>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [checkAll, setCheckAll] = useState<{ done: number; total: number; current: string } | null>(null)
  const [checkAllResult, setCheckAllResult] = useState<string | null>(null)

  // The 20s recon-round poll makes overlapping loads routine — always fetch
  // the CURRENT month and drop any response for a month the user has since
  // navigated away from, so old-month rows never render under new headers.
  const monthRef = useRef(month)
  monthRef.current = month
  const load = async () => {
    const requestedMonth = monthRef.current
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/cfo/board?month=${requestedMonth}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        if (requestedMonth === monthRef.current) setError(body.error ?? `Failed to load (${res.status})`)
        return
      }
      const body = await res.json()
      if (body.month === monthRef.current) setData(body)
    } catch {
      if (requestedMonth === monthRef.current) setError('Network error loading the board')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month])

  // While a recon round is genuinely in flight, poll so the button state and
  // (on completion) the fresh counts appear without a manual refresh. Uses
  // the age-bounded liveness check, so a row nothing will ever finish stops
  // the poll on its own: each poll re-renders, liveness recomputes, and the
  // first tick past the window clears the interval.
  const reconRoundLive = reconRoundIsLive(data?.recon_round ?? null)
  useEffect(() => {
    if (!reconRoundLive) return
    const t = setInterval(() => { load() }, 20_000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reconRoundLive, month])

  const [requesting, setRequesting] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)
  const requestReconRound = async () => {
    setRequesting(true)
    setRequestError(null)
    try {
      const res = await fetch('/api/cfo/recon-round-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setRequestError(body.error ?? `Could not queue the round (${res.status})`)
        return
      }
      await load()
    } catch {
      setRequestError('Network error — the round was NOT queued. Try again.')
    } finally {
      setRequesting(false)
    }
  }

  // One flat table (Matt, 5 Sep: "simple and informative"), urgent first.
  const ordered = useMemo(() => {
    const clients = (data?.clients ?? []).filter(c => filter === 'all' || c.section === filter)
    return [...clients].sort(
      (a, b) => SECTION_RANK[a.section] - SECTION_RANK[b.section] || a.business_name.localeCompare(b.business_name),
    )
  }, [data, filter])

  const toggleRow = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // One click, whole fleet. Three clients in flight at once — Xero's rate
  // limits are PER TENANT, so cross-tenant concurrency is safe, and each
  // request still fits its own server time budget.
  const runCheckAll = async () => {
    const targets = data?.clients ?? []
    if (targets.length === 0 || checkAll) return
    setCheckAllResult(null)
    const failures: string[] = []
    let done = 0
    let next = 0
    setCheckAll({ done: 0, total: targets.length, current: targets[0].business_name })
    const worker = async () => {
      while (next < targets.length) {
        const client = targets[next++]
        setCheckAll(prev => ({ done: prev?.done ?? done, total: targets.length, current: client.business_name }))
        try {
          const res = await fetch('/api/cfo/recheck-reconciliation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ business_id: client.business_id }),
          })
          if (!res.ok) failures.push(client.business_name)
        } catch {
          failures.push(client.business_name)
        }
        done++
        setCheckAll(prev => (prev ? { ...prev, done } : prev))
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, targets.length) }, worker))
    setCheckAll(null)
    setCheckAllResult(
      failures.length === 0
        ? `Background API cross-check updated for all ${targets.length} clients — the table's counts only change when the recon round runs.`
        : `Cross-check updated for ${targets.length - failures.length} of ${targets.length} — failed: ${failures.join(', ')}`,
    )
    await load()
  }

  const restoreClient = async (businessId: string) => {
    await fetch('/api/cfo/board-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: businessId, hide_from_board: false }),
    }).catch(() => {})
    await load()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader
        variant="banner"
        title="Report Production"
        subtitle={`${formatMonthLabel(month)} cycle · every Xero-connected client`}
        icon={ClipboardList}
        actions={
          <button
            onClick={load}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
      />

      <div className="max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-8 space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange/40"
          />
          <ReconRoundButton
            request={data?.recon_round ?? null}
            busy={requesting}
            requestError={requestError}
            onRequest={requestReconRound}
          />
          <button
            onClick={runCheckAll}
            disabled={checkAll !== null || isLoading || (data?.clients.length ?? 0) === 0}
            title="Refreshes the background API cross-check only — the table's counts come from the Xero badge capture (recon round)"
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg disabled:opacity-60"
          >
            {checkAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {checkAll
              ? `Checking ${checkAll.current} · ${checkAll.done + 1} of ${checkAll.total}…`
              : 'Re-run API cross-check'}
          </button>
          {checkAllResult && !checkAll && (
            <span className="text-xs font-medium text-gray-500">{checkAllResult}</span>
          )}
          {filter !== 'all' && (
            <button
              onClick={() => setFilter('all')}
              className="text-xs font-medium text-brand-navy underline"
            >
              Clear filter
            </button>
          )}
        </div>

        {data && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard label="Overdue" value={data.stats.overdue} tone="red" active={filter === 'overdue'} onClick={() => setFilter(f => (f === 'overdue' ? 'all' : 'overdue'))} />
            <StatCard label="Blocked — data not ready" value={data.stats.blocked} tone="amber" active={filter === 'blocked'} onClick={() => setFilter(f => (f === 'blocked' ? 'all' : 'blocked'))} />
            <StatCard label="In progress" value={data.stats.in_progress} tone="blue" active={filter === 'in_progress'} onClick={() => setFilter(f => (f === 'in_progress' ? 'all' : 'in_progress'))} />
            <StatCard label="Sent" value={data.stats.sent} tone="green" active={filter === 'sent'} onClick={() => setFilter(f => (f === 'sent' ? 'all' : 'sent'))} />
            <StatCard label="Discussed with client" value={`${data.stats.discussed} / ${data.stats.sent}`} tone="navy" />
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}

        {isLoading && !data && (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-brand-orange mx-auto mb-2" />
            <p className="text-sm text-gray-600">Loading the board…</p>
          </div>
        )}

        {data && data.clients.length === 0 && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            No Xero-connected clients found for your account.
          </div>
        )}

        {data && data.clients.length > 0 && (
          <div>
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead>
                  <tr className="bg-gray-100 text-[11px] uppercase tracking-wide text-gray-500">
                    <th className="text-left px-4 py-2.5 font-semibold">Client</th>
                    <th className="text-center px-3 py-2.5 font-semibold w-36">
                      Before {shortMonthYear(month)}
                      <span className="block normal-case font-normal text-[10px] text-gray-400">unreconciled</span>
                    </th>
                    <th className="text-center px-3 py-2.5 font-semibold w-36">
                      {shortMonthYear(month)}
                      <span className="block normal-case font-normal text-[10px] text-gray-400">unreconciled</span>
                    </th>
                    <th className="text-left px-3 py-2.5 font-semibold">Report</th>
                    <th className="text-left px-3 py-2.5 font-semibold w-28">Due</th>
                    <th className="text-right px-3 py-2.5 font-semibold w-28">
                      Updated
                      <span className="block normal-case font-normal text-[10px] text-gray-400">recon round</span>
                    </th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {ordered.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">
                        No clients match this filter for {formatMonthLabel(month)}.{' '}
                        <button onClick={() => setFilter('all')} className="font-semibold text-brand-navy underline">
                          Show all clients
                        </button>
                      </td>
                    </tr>
                  )}
                  {ordered.map(client => (
                    <Fragment key={client.business_id}>
                      <ClientTableRow
                        client={client}
                        isExpanded={expanded.has(client.business_id)}
                        onToggle={() => toggleRow(client.business_id)}
                      />
                      {expanded.has(client.business_id) && (
                        <tr>
                          <td colSpan={7} className="p-0">
                            <RowDetail client={client} month={month} onChanged={load} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-gray-400">
              Counts are Xero&apos;s &ldquo;items to reconcile&rdquo; badge, dated up to the end of{' '}
              {formatMonthLabel(month)} — items dated later don&apos;t affect this report and aren&apos;t
              shown. <span className="font-medium">+N?</span> = items whose month couldn&apos;t be read
              (could be any period). Grey = not confirmed: no capture, an incomplete one, or{' '}
              <span className="font-medium">*</span> a capture older than {STALE_CAPTURE_DAYS} days — run the recon round.
              Row edge: red = overdue, amber = blocked, blue = in progress, green = sent. Click a row
              for the breakdown and actions.
            </p>

            {ordered.length > 0 && ordered.every(c => c.section === 'sent') && filter === 'all' && (
              <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-700" />
                <p className="text-sm font-medium text-green-900">
                  Every report for {formatMonthLabel(month)} is sent.
                </p>
              </div>
            )}
          </div>
        )}

        {data && data.hidden.length > 0 && (
          <HiddenList hidden={data.hidden} onRestore={restoreClient} />
        )}
      </div>
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function HiddenList({ hidden, onRestore }: {
  hidden: { business_id: string; business_name: string }[]
  onRestore: (businessId: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="pt-2 border-t border-gray-200">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-600"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        <EyeOff className="w-3.5 h-3.5" />
        Hidden clients ({hidden.length})
      </button>
      {open && (
        <ul className="mt-2 space-y-1">
          {hidden.map(h => (
            <li key={h.business_id} className="flex items-center gap-3 text-sm text-gray-500">
              <span>{h.business_name}</span>
              <button
                onClick={() => onRestore(h.business_id)}
                className="text-xs font-semibold text-brand-navy underline"
              >
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function StatCard({ label, value, tone, active, onClick }: {
  label: string
  value: number | string
  tone: 'red' | 'amber' | 'blue' | 'green' | 'navy'
  active?: boolean
  onClick?: () => void
}) {
  const tones: Record<typeof tone, string> = {
    red: 'border-t-red-600 text-red-700',
    amber: 'border-t-amber-500 text-amber-700',
    blue: 'border-t-brand-navy-400 text-brand-navy-600',
    green: 'border-t-green-500 text-green-700',
    navy: 'border-t-brand-navy text-brand-navy',
  }
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`text-left bg-white rounded-lg border border-gray-200 border-t-[3px] p-3 shadow-sm ${tones[tone]} ${
        active ? 'ring-2 ring-brand-orange/50' : onClick ? 'hover:border-gray-300' : ''
      }`}
    >
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs font-semibold text-gray-500 mt-0.5">{label}</div>
    </button>
  )
}

function stageLabel(client: BoardClient): { text: string; tone: 'ok' | 'warn' | 'bad' } {
  const { stage, connection, readiness } = client
  if (stage === 'discussed') return { text: `Discussed ${fmtDate(client.cycle.discussed_at)}`, tone: 'ok' }
  if (stage === 'sent') return { text: `Sent ${fmtDate(client.cycle.sent_at)} — meeting pending`, tone: 'ok' }
  if (stage === 'approved') return { text: 'Approved — awaiting send', tone: 'ok' }
  if (stage === 'ready') return { text: 'In review', tone: 'ok' }
  if (stage === 'generated') return { text: `Generated ${fmtDate(client.cycle.generated_at)} — in review`, tone: 'ok' }
  if (connection.needs_attention) return { text: CONNECTION_LABELS[connection.status] ?? 'Data problem', tone: 'bad' }
  if (readiness.state === 'never') return { text: 'No badge capture — run the recon round', tone: 'bad' }
  if (readiness.state === 'stale') return { text: `Capture ${readiness.capture_age_days}d old — rerun the round`, tone: 'warn' }
  if (readiness.state === 'partial') {
    const total = connection.tenant_count
    return { text: `Only ${total - readiness.uncaptured_tenants} of ${total} orgs captured — rerun the round`, tone: 'warn' }
  }
  if (readiness.state === 'blocked') return { text: 'Awaiting reconciliation', tone: 'warn' }
  return { text: 'Ready to generate', tone: 'ok' }
}

function sourceCaveat(client: BoardClient): string {
  const recon = client.recon
  const orgs = recon.tenantCount > 1 ? ` across ${recon.tenantCount} orgs` : ''
  if (recon.source === 'statement_lines') {
    return `Counts are bank-feed statement lines awaiting reconciliation${orgs} — the same items Xero's "Reconcile" banner counts. Looking back 24 months.`
  }
  return (
    `Counts are unreconciled transactions recorded in Xero${orgs} — not the bank-feed banner: ` +
    `statement lines nobody has coded yet don't appear here (open Xero for feed backlog). Looking back 12 months.`
  )
}

/**
 * "Update from Xero" — queues a recon round for the Mac-side watcher. The
 * round runs in Matt's logged-in Chrome (no API can read the badge), so the
 * button's job is honest state, not execution: queued → running → done, and
 * "not picked up" when nothing collected the request in the pickup window.
 */
function ReconRoundButton({ request, busy, requestError, onRequest }: {
  request: BoardResponse['recon_round']
  busy: boolean
  requestError: string | null
  onRequest: () => void
}) {
  // Both live states are age-bounded (reconRoundIsLive): a row nothing will
  // ever finish must re-enable the button and say so, never spin forever.
  const live = reconRoundIsLive(request)
  const pendingLive = live && request?.status === 'pending'
  const runningLive = live && request?.status === 'running'
  const inFlight = pendingLive || runningLive

  let note: { text: string; tone: 'gray' | 'red' } | null = null
  if (requestError) {
    note = { text: requestError, tone: 'red' }
  } else if (runningLive) {
    note = { text: `Running — started ${relTime(request!.started_at ?? request!.requested_at)} · counts land org by org, full round up to ~45 min`, tone: 'gray' }
  } else if (pendingLive) {
    note = { text: 'Queued — your Mac picks it up within a minute', tone: 'gray' }
  } else if (request?.status === 'running') {
    note = { text: `Run started ${relTime(request.started_at ?? request.requested_at)} and never finished — is your Mac awake with Chrome running?`, tone: 'red' }
  } else if (request?.status === 'pending') {
    note = { text: 'Last request was never picked up — is your Mac awake with Chrome running?', tone: 'red' }
  } else if (request?.status === 'expired') {
    note = { text: 'Last request expired unclaimed — is your Mac awake with Chrome running?', tone: 'red' }
  } else if (request?.status === 'failed') {
    note = { text: `Last run failed${request.result_note ? ` — ${request.result_note}` : ''}`, tone: 'red' }
  } else if (request?.status === 'done' && request.finished_at) {
    note = { text: `Last run ${relTime(request.finished_at)}`, tone: 'gray' }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={onRequest}
        disabled={busy || inFlight}
        title="Runs the Xero recon round on your Mac (Claude reading the badges in your logged-in Chrome) — refreshes every count on this table"
        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-white bg-brand-navy hover:bg-brand-navy-800 rounded-lg disabled:opacity-60"
      >
        {busy || inFlight ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        {runningLive ? 'Updating from Xero…' : pendingLive ? 'Queued…' : 'Update from Xero'}
      </button>
      {note && (
        <span className={`text-xs font-medium max-w-md ${note.tone === 'red' ? 'text-red-600' : 'text-gray-500'}`}>
          {note.text}
        </span>
      )}
    </span>
  )
}

/**
 * One reconciliation count cell — the heart of the simple table (Matt's
 * spreadsheet, 5 Sep 2026). Green = 0, coloured = attention. Fail-closed:
 * no capture / stale capture NEVER renders as a clean green zero.
 */
function CountCell({ kind, client }: { kind: 'prior' | 'current'; client: BoardClient }) {
  const r = client.readiness
  if (r.state === 'never') {
    return (
      <td
        className="px-3 py-2.5 text-center text-xs font-medium bg-gray-50 text-gray-400"
        title="No Xero badge capture yet — run the recon round to get real counts"
      >
        no data
      </td>
    )
  }
  const n = kind === 'prior' ? r.blocking_prior : r.blocking_current
  // Items with no month split could belong to ANY period — surfaced on the
  // worst-case (prior) column, marked with ?, never hidden.
  const unknown = kind === 'prior' ? r.possibly_blocking : 0
  const stale = r.state === 'stale'
  const partialFleet = r.uncaptured_tenants > 0
  // Green = a CONFIRMED zero: month-split accounts across every captured org,
  // no unsplit items anywhere, every org captured, capture fresh. Anything
  // less renders neutral, never green (fail-closed).
  const clean = n === 0 && r.possibly_blocking === 0 && !partialFleet && !stale
  const tone = stale
    ? 'bg-gray-100 text-gray-500'
    : clean
      ? 'bg-green-50 text-green-800'
      : n > 0
        ? kind === 'prior' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'
        : 'bg-gray-50 text-gray-600'
  const title = [
    r.captured_at ? `From the Xero badge, captured ${relTime(r.captured_at)}` : null,
    stale ? `Capture is ${r.capture_age_days} days old — rerun the recon round before trusting this` : null,
    r.possibly_blocking > 0 ? `${r.possibly_blocking} item${r.possibly_blocking === 1 ? '' : 's'} with no month split — could be any period, including this one` : null,
    partialFleet ? `${r.uncaptured_tenants} org${r.uncaptured_tenants === 1 ? '' : 's'} never captured — counts are a floor` : null,
  ].filter(Boolean).join('. ')
  return (
    <td className={`px-3 py-2.5 text-center tabular-nums text-sm font-semibold ${tone}`} title={title}>
      {n}
      {unknown > 0 && <span className="font-normal text-amber-700"> +{unknown}?</span>}
      {kind === 'current' && n === 0 && !clean && !stale && <span className="font-normal">?</span>}
      {partialFleet && (
        <span className="block text-[10px] font-normal">
          {client.connection.tenant_count - r.uncaptured_tenants}/{client.connection.tenant_count} orgs
        </span>
      )}
      {stale && <span className="font-normal"> *</span>}
    </td>
  )
}

function ClientTableRow({ client, isExpanded, onToggle }: {
  client: BoardClient
  isExpanded: boolean
  onToggle: () => void
}) {
  const label = stageLabel(client)
  const conn = client.connection
  const r = client.readiness
  return (
    <tr
      onClick={onToggle}
      className={`border-t border-gray-100 border-l-4 ${ROW_BORDER[client.section]} cursor-pointer hover:bg-gray-50`}
    >
      <td className="px-4 py-2.5">
        <div className="text-sm font-semibold text-brand-navy">{client.business_name}</div>
        <div className="text-xs text-gray-400">
          {conn.tenant_count > 1 ? `${conn.tenant_count} Xero orgs` : ''}
          {conn.needs_attention && (
            <span className="inline-flex items-center gap-1 text-red-600 font-semibold">
              {conn.tenant_count > 1 ? ' · ' : ''}
              <AlertTriangle className="w-3 h-3" />
              {CONNECTION_LABELS[conn.status] ?? 'Data problem'}
            </span>
          )}
        </div>
      </td>
      <CountCell kind="prior" client={client} />
      <CountCell kind="current" client={client} />
      <td className={`px-3 py-2.5 text-xs font-medium ${
        label.tone === 'bad' ? 'text-red-700' : label.tone === 'warn' ? 'text-amber-700' : 'text-gray-700'
      }`}>
        {label.text}
      </td>
      <td className="px-3 py-2.5 text-xs">
        {client.days_overdue !== null && client.days_overdue > 0 ? (
          <span className="font-bold text-red-600">{fmtDate(client.due_date)} · {client.days_overdue}d late</span>
        ) : client.due_date ? (
          <span className="text-gray-600">{fmtDate(client.due_date)}</span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>
      <td
        className={`px-3 py-2.5 text-right text-xs ${r.state === 'stale' ? 'text-red-600 font-semibold' : 'text-gray-400'}`}
        title={r.captured_at ? `Recon round capture ${new Date(r.captured_at).toLocaleString('en-AU')}` : 'Never captured'}
      >
        {r.captured_at ? relTime(r.captured_at) : '—'}
      </td>
      <td className="pr-3 text-right">
        <button
          type="button"
          aria-expanded={isExpanded}
          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${client.business_name}`}
          onClick={e => { e.stopPropagation(); onToggle() }}
          className="p-1 rounded focus-visible:ring-2 focus-visible:ring-brand-orange"
        >
          {isExpanded
            ? <ChevronDown className="w-4 h-4 text-gray-400" />
            : <ChevronRight className="w-4 h-4 text-gray-400" />}
        </button>
      </td>
    </tr>
  )
}

function RowDetail({ client, month, onChanged }: { client: BoardClient; month: string; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const post = async (label: string, url: string, body: Record<string, unknown>) => {
    setBusy(label)
    setActionError(null)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        setActionError(payload.error ?? `${label} failed (${res.status})`)
        return
      }
      onChanged()
    } catch {
      setActionError(`${label} failed — network error`)
    } finally {
      setBusy(null)
    }
  }

  const recheck = () => post('Re-check', '/api/cfo/recheck-reconciliation', { business_id: client.business_id })
  const markDiscussed = () =>
    post('Mark discussed', '/api/cfo/report-status', {
      action: 'mark_discussed', business_id: client.business_id, period_month: `${month}-01`,
    })
  const unmarkDiscussed = () =>
    post('Unmark discussed', '/api/cfo/report-status', {
      action: 'unmark_discussed', business_id: client.business_id, period_month: `${month}-01`,
    })

  const readiness = client.readiness
  const timeline: { stage: string; note: string; done: boolean }[] = [
    {
      stage: 'Data ready',
      done: !client.connection.needs_attention && readiness.state === 'ready',
      note:
        client.connection.needs_attention ? (CONNECTION_LABELS[client.connection.status] ?? 'connection problem')
        : readiness.state === 'never' ? 'no badge capture — run the recon round'
        : readiness.state === 'stale' ? `capture ${readiness.capture_age_days}d old — rerun the round`
        : readiness.state === 'partial' ? `${readiness.uncaptured_tenants} org(s) never captured — rerun the round`
        : readiness.state === 'blocked' ? `${readiness.blocking + readiness.possibly_blocking} item(s) block ${formatMonthLabel(month)}`
        : 'reconciled & synced',
    },
    { stage: 'Generated', done: !!client.cycle.generated_at, note: fmtDate(client.cycle.generated_at) },
    { stage: 'Reviewed', done: ['approved', 'sent', 'discussed'].includes(client.stage), note: client.stage === 'ready' ? 'in review' : client.cycle.approved_at ? `approved ${fmtDate(client.cycle.approved_at)}` : '—' },
    { stage: 'Sent', done: ['sent', 'discussed'].includes(client.stage), note: fmtDate(client.cycle.sent_at) },
    { stage: 'Discussed', done: client.stage === 'discussed', note: fmtDate(client.cycle.discussed_at) },
  ]

  return (
    <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 grid gap-5 md:grid-cols-2">
      <div>
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">
          Report readiness — {formatMonthLabel(month)}
        </h4>
        {readiness.state === 'never' ? (
          <div className="p-3 bg-gray-100 border border-gray-200 rounded-lg text-sm text-gray-700">
            No Xero badge capture yet — run the recon round to get a verdict. This is
            <strong> not</strong> the same as everything reconciled.
          </div>
        ) : readiness.state === 'stale' ? (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            Last capture is {readiness.capture_age_days} days old — too old to trust for this
            report. Rerun the recon round. Historical figures below are as at{' '}
            {readiness.captured_at ? fmtDate(readiness.captured_at) : 'unknown'}.
          </div>
        ) : readiness.state === 'blocked' ? (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            <p className="font-semibold">
              {readiness.blocking > 0
                ? `${readiness.blocking} item${readiness.blocking === 1 ? '' : 's'} dated ${formatMonthLabel(month)} or earlier block${readiness.blocking === 1 ? 's' : ''} this report`
                : `${readiness.possibly_blocking} item${readiness.possibly_blocking === 1 ? '' : 's'} with no month split — could block this report`}
              {readiness.blocking > 0 && readiness.possibly_blocking > 0
                ? ` (+${readiness.possibly_blocking} more with no month split)`
                : ''}
              .
            </p>
            <ul className="mt-1.5 space-y-0.5 text-xs">
              {readiness.by_account.map(a => (
                <li key={a.name} className="tabular-nums">
                  {a.name}: {a.blocking}
                  {a.unsplit ? ' (month unknown — dates not captured)' : ''}
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-xs">Nudge the client or bookkeeper to reconcile these before generating.</p>
          </div>
        ) : readiness.state === 'partial' ? (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            Only {client.connection.tenant_count - readiness.uncaptured_tenants} of{' '}
            {client.connection.tenant_count} Xero orgs were captured — the missing org&apos;s backlog is
            unknown, so this is <strong>not</strong> confirmed clean. Rerun the recon round to cover
            every org.
          </div>
        ) : (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
            Nothing unreconciled dated {formatMonthLabel(month)} or earlier — ready to produce this report.
            {client.dashboard_capture && client.dashboard_capture.total_count > readiness.ignored.reduce((s, a) => s + a.count, 0)
              ? ' Later-month items exist but don’t affect this report.'
              : ''}
          </div>
        )}
        {readiness.ignored.length > 0 && (
          <p className="mt-2 text-[11px] text-gray-400">
            Ignored (excluded from verdict): {readiness.ignored.map(a => `${a.name} — ${a.count.toLocaleString('en-AU')}`).join(' · ')}
          </p>
        )}

        {client.dashboard_capture && (
          <div className="mt-3 p-3 bg-white border border-gray-200 rounded-lg">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
              Xero reconcile badge — captured {relTime(client.dashboard_capture.captured_at)}
            </h4>
            <p className="text-sm font-semibold text-brand-navy">
              {client.dashboard_capture.total_count.toLocaleString('en-AU')} item{client.dashboard_capture.total_count === 1 ? '' : 's'} to reconcile
              {client.dashboard_capture.tenant_count > 1
                ? ` across ${client.dashboard_capture.captured_tenants} of ${client.dashboard_capture.tenant_count} orgs`
                : ''}
            </p>
            {client.dashboard_capture.accounts.length > 0 && (
              <p className="mt-1 text-xs text-gray-600">
                {client.dashboard_capture.accounts.map(a => `${a.name} ${a.count.toLocaleString('en-AU')}`).join(' · ')}
              </p>
            )}
            {client.dashboard_capture.notes.map((note, i) => (
              <p key={i} className="mt-1.5 text-[11px] leading-relaxed text-gray-500 italic">
                {note}
              </p>
            ))}
            <p className="mt-1.5 text-[11px] text-gray-400">
              This IS the number Xero shows (bank-feed statement lines) — captured by the
              recon round, since no API exposes it.
            </p>
          </div>
        )}

        {client.recon.state !== 'unknown' && (
          <p className="mt-2 text-[11px] text-gray-400" title={sourceCaveat(client)}>
            API cross-check: {client.recon.totalCount} unreconciled recorded transaction{client.recon.totalCount === 1 ? '' : 's'}
            {client.recon.checkedAt ? `, checked ${relTime(client.recon.checkedAt)}` : ''} — a different
            population to the badge; kept as an automatic freshness signal only.
          </p>
        )}
      </div>

      <div>
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">
          {formatMonthLabel(month)} cycle
        </h4>
        <ul className="space-y-1.5">
          {timeline.map(item => (
            <li key={item.stage} className="flex items-baseline gap-2.5 text-sm">
              <span className={`w-2 h-2 rounded-full self-center shrink-0 ${item.done ? 'bg-green-500' : 'bg-gray-300'}`} />
              <span className={`w-24 shrink-0 font-semibold ${item.done ? 'text-brand-navy' : 'text-gray-400'}`}>{item.stage}</span>
              <span className="text-xs text-gray-500">{item.note}</span>
            </li>
          ))}
        </ul>

        <SettingsEditor client={client} onSaved={onChanged} />
      </div>

      <div className="md:col-span-2 flex flex-wrap items-center gap-2">
        <Link
          href={`/coach/clients/${client.business_id}/view/finances/monthly-report`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-brand-orange hover:bg-brand-orange-600 rounded-lg"
        >
          Open report <ExternalLink className="w-3 h-3" />
        </Link>
        <button
          onClick={recheck}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand-navy bg-white border border-gray-300 hover:bg-gray-50 rounded-lg disabled:opacity-50"
        >
          {busy === 'Re-check' ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          Re-run API cross-check
        </button>
        {client.stage === 'sent' && (
          <button
            onClick={markDiscussed}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand-navy bg-white border border-gray-300 hover:bg-gray-50 rounded-lg disabled:opacity-50"
          >
            {busy === 'Mark discussed' ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
            Mark discussed with client
          </button>
        )}
        {client.stage === 'discussed' && (
          <button
            onClick={unmarkDiscussed}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg disabled:opacity-50"
          >
            Undo discussed
          </button>
        )}
        <button
          onClick={() => post('Hide', '/api/cfo/board-settings', { business_id: client.business_id, hide_from_board: true })}
          disabled={busy !== null}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-600 disabled:opacity-50"
          title="Remove this client from the board — restore any time from the Hidden clients list below"
        >
          <EyeOff className="w-3 h-3" /> Hide from board
        </button>
        {actionError && <span className="text-xs font-medium text-red-600">{actionError}</span>}
      </div>
    </div>
  )
}

function SettingsEditor({ client, onSaved }: { client: BoardClient; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [dueDay, setDueDay] = useState<string>(client.due_day ? String(client.due_day) : '')
  const [bkName, setBkName] = useState(client.bookkeeper.name ?? '')
  const [bkEmail, setBkEmail] = useState(client.bookkeeper.email ?? '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  if (!editing) {
    return (
      <div className="mt-4 text-xs text-gray-500">
        {client.bookkeeper.name || client.bookkeeper.email ? (
          <span>Bookkeeper: {client.bookkeeper.name ?? client.bookkeeper.email}</span>
        ) : (
          <span className="text-gray-400">No bookkeeper contact set</span>
        )}
        {' · '}
        <button onClick={() => setEditing(true)} className="font-semibold text-brand-navy underline">
          Edit due day &amp; bookkeeper
        </button>
      </div>
    )
  }

  const save = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/cfo/board-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: client.business_id,
          report_due_day: dueDay ? Number(dueDay) : null,
          bookkeeper_name: bkName || null,
          bookkeeper_email: bkEmail || null,
        }),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        setSaveError(payload.error ?? `Save failed (${res.status})`)
        return
      }
      setEditing(false)
      onSaved()
    } catch {
      setSaveError('Save failed — network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-4 p-3 bg-white border border-gray-200 rounded-lg space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="font-semibold text-gray-600">Report due day</label>
        <select
          value={dueDay}
          onChange={e => setDueDay(e.target.value)}
          className="px-2 py-1 border border-gray-300 rounded-md text-xs"
        >
          <option value="">No due date</option>
          {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
            <option key={d} value={d}>{d}th of following month</option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Bookkeeper name"
          value={bkName}
          onChange={e => setBkName(e.target.value)}
          className="flex-1 min-w-[140px] px-2 py-1 text-xs border border-gray-300 rounded-md"
        />
        <input
          type="email"
          placeholder="Bookkeeper email"
          value={bkEmail}
          onChange={e => setBkEmail(e.target.value)}
          className="flex-1 min-w-[180px] px-2 py-1 text-xs border border-gray-300 rounded-md"
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="px-3 py-1 text-xs font-semibold text-white bg-brand-navy hover:bg-brand-navy-800 rounded-md disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={() => setEditing(false)} className="px-3 py-1 text-xs font-medium text-gray-500">
          Cancel
        </button>
        {saveError && <span className="text-xs font-medium text-red-600">{saveError}</span>}
      </div>
    </div>
  )
}
