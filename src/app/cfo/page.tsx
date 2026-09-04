'use client'

/**
 * CFO Production Board — replaces the old financial summary dashboard.
 *
 * One job: where is every client in this month's report cycle, and what's
 * blocking me. NO financial figures by design (locked decision, Sep 2026) —
 * performance lives in the monthly report itself. Rows lead with the 5-stage
 * pipeline (Data ready → Generated → Reviewed → Sent → Discussed),
 * reconciliation-by-month, and data health.
 *
 * Fail-closed rendering rules (house):
 * - The reconciliation verdict comes from the CAPTURED Xero badge (recon
 *   round) vs the selected report month: READY / BLOCKED / STALE / NEVER.
 *   No capture or a stale capture is never shown as ready.
 * - The API's recorded-transaction count is a different population (it can't
 *   see uncoded feed lines) — demoted to one cross-check line in the
 *   expanded view (demote decision, 5 Sep 2026).
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Loader2, ChevronDown, ChevronRight, AlertTriangle, Clock, CheckCircle2,
  RefreshCw, ExternalLink, ClipboardList, EyeOff,
} from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'

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
    state: 'ready' | 'blocked' | 'stale' | 'never'
    blocking: number
    possibly_blocking: number
    by_account: { name: string; blocking: number; unsplit: boolean }[]
    ignored: { name: string; count: number }[]
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

const SECTION_META: Record<BoardSection, { title: string; dot: string }> = {
  overdue: { title: 'Overdue', dot: 'bg-red-600' },
  blocked: { title: 'Blocked — data not ready', dot: 'bg-amber-500' },
  in_progress: { title: 'In progress', dot: 'bg-brand-navy-400' },
  sent: { title: 'Sent', dot: 'bg-green-500' },
}

const STRIPE: Record<BoardSection, string> = {
  overdue: 'bg-red-600',
  blocked: 'bg-amber-500',
  in_progress: 'bg-brand-navy-400',
  sent: 'bg-green-500',
}

export default function CfoBoardPage() {
  const [month, setMonth] = useState(defaultReportMonth())
  const [data, setData] = useState<BoardResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<BoardSection | 'all'>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [showSent, setShowSent] = useState(false)
  const [checkAll, setCheckAll] = useState<{ done: number; total: number; current: string } | null>(null)
  const [checkAllResult, setCheckAllResult] = useState<string | null>(null)

  const load = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/cfo/board?month=${month}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? `Failed to load (${res.status})`)
        return
      }
      setData(await res.json())
    } catch {
      setError('Network error loading the board')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month])

  const sections = useMemo(() => {
    const clients = (data?.clients ?? []).filter(c => filter === 'all' || c.section === filter)
    return {
      overdue: clients.filter(c => c.section === 'overdue'),
      blocked: clients.filter(c => c.section === 'blocked'),
      in_progress: clients.filter(c => c.section === 'in_progress'),
      sent: clients.filter(c => c.section === 'sent'),
    }
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
        ? `All ${targets.length} clients re-checked.`
        : `${targets.length - failures.length} of ${targets.length} re-checked — failed: ${failures.join(', ')}`,
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
          <button
            onClick={runCheckAll}
            disabled={checkAll !== null || isLoading || (data?.clients.length ?? 0) === 0}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-white bg-brand-navy hover:bg-brand-navy-800 rounded-lg disabled:opacity-60"
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
          <div className="space-y-6">
            {(['overdue', 'blocked', 'in_progress'] as BoardSection[]).map(section =>
              sections[section].length > 0 ? (
                <Section
                  key={section}
                  section={section}
                  clients={sections[section]}
                  month={month}
                  expanded={expanded}
                  onToggleRow={toggleRow}
                  onChanged={load}
                />
              ) : null,
            )}

            {sections.sent.length > 0 && (
              <div>
                <button
                  onClick={() => setShowSent(v => !v)}
                  className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-gray-900 mb-2"
                >
                  {showSent ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  <span className={`w-2 h-2 rounded-full ${SECTION_META.sent.dot}`} />
                  <span>Sent</span>
                  <span className="text-xs font-normal text-gray-400">({sections.sent.length})</span>
                </button>
                {showSent && (
                  <Section
                    section="sent"
                    clients={sections.sent}
                    month={month}
                    expanded={expanded}
                    onToggleRow={toggleRow}
                    onChanged={load}
                    bare
                  />
                )}
              </div>
            )}

            {sections.overdue.length === 0 && sections.blocked.length === 0 && sections.in_progress.length === 0 && !showSent && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
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

function Section({ section, clients, month, expanded, onToggleRow, onChanged, bare }: {
  section: BoardSection
  clients: BoardClient[]
  month: string
  expanded: Set<string>
  onToggleRow: (id: string) => void
  onChanged: () => void
  bare?: boolean
}) {
  const meta = SECTION_META[section]
  return (
    <div>
      {!bare && (
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-2">
          <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
          {meta.title}
          <span className="text-xs font-normal text-gray-400">({clients.length})</span>
        </h2>
      )}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100 shadow-sm">
        {clients.map(client => (
          <ClientRow
            key={client.business_id}
            client={client}
            month={month}
            isExpanded={expanded.has(client.business_id)}
            onToggle={() => onToggleRow(client.business_id)}
            onChanged={onChanged}
          />
        ))}
      </div>
    </div>
  )
}

function pipelineSteps(client: BoardClient): { done: boolean; now: boolean; blocked: boolean }[] {
  const stage = client.stage
  const dataReady = !client.connection.needs_attention && client.readiness.state === 'ready'
  const reached = (s: PipelineStage[]) => s.includes(stage)
  return [
    {
      done: dataReady || reached(['generated', 'ready', 'approved', 'sent', 'discussed']),
      now: false,
      blocked: !dataReady && stage === 'none',
    },
    { done: reached(['generated', 'ready', 'approved', 'sent', 'discussed']), now: stage === 'none' && dataReady, blocked: false },
    { done: reached(['approved', 'sent', 'discussed']), now: stage === 'generated' || stage === 'ready', blocked: false },
    { done: reached(['sent', 'discussed']), now: stage === 'approved', blocked: false },
    { done: stage === 'discussed', now: stage === 'sent', blocked: false },
  ]
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
  if (readiness.state === 'blocked') return { text: 'Awaiting reconciliation', tone: 'warn' }
  return { text: 'Ready to generate', tone: 'ok' }
}

/**
 * The row's single reconciliation verdict, computed from the captured Xero
 * badge against the board's selected month (demote decision, 5 Sep 2026).
 */
function VerdictChip({ client }: { client: BoardClient }) {
  const r = client.readiness
  const asOf = r.captured_at
    ? `Badge captured ${new Date(r.captured_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`
    : undefined
  if (r.state === 'never') return <Chip tone="gray">No badge capture — run recon round</Chip>
  if (r.state === 'stale') {
    return <Chip tone="amber" title={asOf}>Capture {r.capture_age_days}d old — rerun round</Chip>
  }
  if (r.state === 'blocked') {
    const n = r.blocking + r.possibly_blocking
    return (
      <Chip tone="amber" title={asOf}>
        {r.possibly_blocking > 0 ? '≥' : ''}{r.blocking > 0 ? r.blocking : n} block{n === 1 ? 's' : ''} this month
      </Chip>
    )
  }
  return <Chip tone="green" title={asOf}>Ready — reconciled ✓</Chip>
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

function Chip({ tone, title, children }: { tone: 'red' | 'amber' | 'green' | 'gray'; title?: string; children: React.ReactNode }) {
  const tones = {
    red: 'bg-red-50 text-red-700 border-red-200',
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    gray: 'bg-gray-50 text-gray-600 border-gray-200',
  }
  return (
    <span title={title} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-semibold whitespace-nowrap ${tones[tone]}`}>
      {children}
    </span>
  )
}

function ClientRow({ client, month, isExpanded, onToggle, onChanged }: {
  client: BoardClient
  month: string
  isExpanded: boolean
  onToggle: () => void
  onChanged: () => void
}) {
  const label = stageLabel(client)
  const steps = pipelineSteps(client)
  const conn = client.connection

  return (
    <div>
      <button onClick={onToggle} className="w-full flex items-center gap-3 pr-4 py-2.5 hover:bg-gray-50 text-left">
        <span className={`self-stretch w-1 shrink-0 ${STRIPE[client.section]}`} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-brand-navy truncate">{client.business_name}</div>
          <div className="text-xs text-gray-400 truncate">
            {conn.tenant_count > 1 ? `${conn.tenant_count} Xero orgs · ` : ''}
            {client.due_day ? `due ${client.due_day}th of month` : 'no due date set'}
          </div>
        </div>

        <div className="w-24 shrink-0 text-xs font-semibold">
          {client.days_overdue !== null && client.days_overdue > 0 ? (
            <span className="text-red-600">
              Due {fmtDate(client.due_date)}
              <span className="block font-bold">{client.days_overdue}d overdue</span>
            </span>
          ) : client.due_date ? (
            <span className="text-gray-600">Due {fmtDate(client.due_date)}</span>
          ) : (
            <span className="text-gray-300">—</span>
          )}
        </div>

        <div className="hidden sm:flex items-center gap-1 shrink-0" aria-label={`Pipeline: ${label.text}`}>
          {steps.map((step, i) => (
            <span
              key={i}
              className={`w-5 h-1.5 rounded-full ${
                step.blocked ? 'bg-amber-400' : step.done ? 'bg-green-500' : step.now ? 'bg-brand-orange ring-2 ring-brand-orange-200' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>

        <div className={`hidden md:block w-52 shrink-0 text-xs font-medium truncate ${
          label.tone === 'bad' ? 'text-red-700' : label.tone === 'warn' ? 'text-amber-700' : 'text-gray-700'
        }`}>
          {label.text}
        </div>

        <div className="hidden lg:flex items-center gap-1.5 shrink-0">
          <VerdictChip client={client} />
          {conn.needs_attention ? (
            <Chip tone="red">{CONNECTION_LABELS[conn.status] ?? conn.status}</Chip>
          ) : (
            <Chip tone="green">Xero OK{conn.last_sync_at ? ` · synced ${relTime(conn.last_sync_at)}` : ''}</Chip>
          )}
        </div>

        {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
      </button>

      {isExpanded && <RowDetail client={client} month={month} onChanged={onChanged} />}
    </div>
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
