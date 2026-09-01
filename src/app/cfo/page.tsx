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
 * - recon state 'unknown'/'partial' is NEVER shown as zero outstanding.
 * - The recon count is unreconciled TRANSACTIONS recorded in Xero — not the
 *   bank-feed "items to reconcile" banner (uncoded feed lines are invisible
 *   to the open API). The expanded view carries that caveat verbatim.
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
    totalValue: number
    months: { month: string; count: number; value: number }[]
    checkedAt: string | null
    checkedTenants: number
    erroredTenants: number
    tenantCount: number
  }
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

function shortMonth(monthKey: string): string {
  const date = new Date(monthKey + '-01T00:00:00')
  return date.toLocaleDateString('en-AU', { month: 'short' })
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

function fmtMoney(value: number): string {
  return value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })
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

  // One click, whole fleet: run the live re-check for every visible client,
  // SEQUENTIALLY — parallel would stack Xero calls across tenants and each
  // request stays inside its own server time budget this way.
  const runCheckAll = async () => {
    const targets = data?.clients ?? []
    if (targets.length === 0 || checkAll) return
    setCheckAllResult(null)
    const failures: string[] = []
    for (let i = 0; i < targets.length; i++) {
      const client = targets[i]
      setCheckAll({ done: i, total: targets.length, current: client.business_name })
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
    }
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
              : 'Check all reconciliation'}
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
  const dataReady = !client.connection.needs_attention && client.recon.state === 'clear'
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
  const { stage, connection, recon } = client
  if (stage === 'discussed') return { text: `Discussed ${fmtDate(client.cycle.discussed_at)}`, tone: 'ok' }
  if (stage === 'sent') return { text: `Sent ${fmtDate(client.cycle.sent_at)} — meeting pending`, tone: 'ok' }
  if (stage === 'approved') return { text: 'Approved — awaiting send', tone: 'ok' }
  if (stage === 'ready') return { text: 'In review', tone: 'ok' }
  if (stage === 'generated') return { text: `Generated ${fmtDate(client.cycle.generated_at)} — in review`, tone: 'ok' }
  if (connection.needs_attention) return { text: CONNECTION_LABELS[connection.status] ?? 'Data problem', tone: 'bad' }
  if (recon.state === 'unknown') return { text: 'Reconciliation not checked', tone: 'bad' }
  if (recon.state === 'partial') return { text: 'Some orgs unchecked', tone: 'warn' }
  if (recon.state === 'outstanding') return { text: 'Awaiting reconciliation', tone: 'warn' }
  return { text: 'Ready to generate', tone: 'ok' }
}

function ReconChip({ recon }: { recon: BoardClient['recon'] }) {
  if (recon.state === 'unknown') {
    return <Chip tone="red">Couldn&apos;t check reconciliation</Chip>
  }
  if (recon.state === 'partial') {
    return (
      <Chip tone="amber">
        {recon.checkedTenants} of {recon.tenantCount} orgs checked · {recon.totalCount}+ unreconciled
      </Chip>
    )
  }
  if (recon.state === 'outstanding') {
    return (
      <Chip tone="amber">
        {recon.totalCount} unreconciled
        {recon.months.length === 1
          ? ` · all ${shortMonth(recon.months[0].month)}`
          : recon.months.slice(-3).map(m => ` · ${shortMonth(m.month)} ${m.count}`).join('')}
      </Chip>
    )
  }
  return <Chip tone="green">No unreconciled transactions</Chip>
}

function Chip({ tone, children }: { tone: 'red' | 'amber' | 'green' | 'gray'; children: React.ReactNode }) {
  const tones = {
    red: 'bg-red-50 text-red-700 border-red-200',
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    gray: 'bg-gray-50 text-gray-600 border-gray-200',
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-semibold whitespace-nowrap ${tones[tone]}`}>
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
          <ReconChip recon={client.recon} />
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

  const recon = client.recon
  const timeline: { stage: string; note: string; done: boolean }[] = [
    {
      stage: 'Data ready',
      done: !client.connection.needs_attention && recon.state === 'clear',
      note:
        recon.state === 'outstanding' ? `${recon.totalCount} transactions unreconciled`
        : recon.state === 'unknown' ? 'reconciliation not checked'
        : recon.state === 'partial' ? `${recon.erroredTenants} org(s) could not be checked`
        : client.connection.needs_attention ? (CONNECTION_LABELS[client.connection.status] ?? 'connection problem')
        : 'synced & reconciled',
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
          Unreconciled by month
        </h4>
        {recon.state === 'unknown' ? (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            Reconciliation could not be checked
            {recon.tenantCount > 0 ? ` for ${recon.tenantCount === 1 ? 'this org' : `any of ${recon.tenantCount} orgs`}` : ''} —
            this is <strong>not</strong> the same as zero outstanding.
          </div>
        ) : recon.months.length === 0 ? (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
            No unreconciled transactions in the last 12 months
            {recon.state === 'partial' ? ` across the ${recon.checkedTenants} org(s) that could be checked` : ''}.
          </div>
        ) : (
          <table className="w-full bg-white border border-gray-200 rounded-lg overflow-hidden text-sm">
            <thead>
              <tr className="bg-gray-100 text-[11px] uppercase tracking-wide text-gray-500">
                <th className="text-left px-3 py-1.5">Month</th>
                <th className="text-right px-3 py-1.5">Items</th>
                <th className="text-right px-3 py-1.5">Value</th>
              </tr>
            </thead>
            <tbody>
              {recon.months.map(m => (
                <tr key={m.month} className="border-t border-gray-100">
                  <td className="px-3 py-1.5">{formatMonthLabel(m.month)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{m.count}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmtMoney(m.value)}</td>
                </tr>
              ))}
              <tr className="border-t border-gray-200 bg-amber-50 font-semibold text-brand-navy">
                <td className="px-3 py-1.5">Total outstanding</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{recon.totalCount}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmtMoney(recon.totalValue)}</td>
              </tr>
            </tbody>
          </table>
        )}
        <p className="mt-2 text-[11px] leading-relaxed text-gray-400">
          Counts are unreconciled <strong className="text-gray-500">transactions recorded in Xero</strong>
          {recon.tenantCount > 1 ? ` across ${recon.tenantCount} orgs` : ''}. This is not the bank-feed
          banner: statement lines nobody has coded yet don&apos;t appear here — open Xero to see feed backlog.
          {recon.checkedAt ? ` Last checked ${relTime(recon.checkedAt)}.` : ''}
        </p>
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
          Re-check reconciliation
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
