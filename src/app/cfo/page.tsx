'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Loader2, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, Clock, RefreshCw, Search, ExternalLink } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import { BarChart3 } from 'lucide-react'

type StatusBadge = 'on_track' | 'watch' | 'alert'
type ReportStatus = 'draft' | 'ready_for_review' | 'approved' | 'sent' | 'none'
type FilterMode = 'all' | 'alert' | 'watch' | 'on_track'

interface ClientSummary {
  business_id: string
  business_name: string
  industry: string | null
  revenue: number
  revenue_budget: number
  revenue_vs_budget_pct: number | null
  gross_profit: number
  gross_profit_pct: number | null
  net_profit: number
  net_profit_budget: number
  cash_balance: number
  unreconciled_count: number
  report_status: ReportStatus
  badge: StatusBadge
  manual_status_override: string | null
}

interface StatsCards {
  on_track: number
  watch: number
  alert: number
  pending_approval: number
  next_due: string | null
}

interface SummariesResponse {
  month: string
  summaries: ClientSummary[]
  stats: StatsCards
}

function defaultReportMonth(): string {
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
}

function formatMonthLabel(monthKey: string): string {
  const date = new Date(monthKey + '-01')
  return date.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
}

function fmtCurrency(value: number, compact = true): string {
  if (compact && Math.abs(value) >= 1000) {
    const units = ['', 'k', 'M', 'B']
    let n = value
    let u = 0
    while (Math.abs(n) >= 1000 && u < units.length - 1) {
      n /= 1000
      u++
    }
    return `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(Math.abs(n) >= 10 ? 0 : 1)}${units[u]}`
  }
  return value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })
}

function fmtPct(value: number | null): string {
  if (value === null) return '—'
  return `${value}%`
}

const BADGE_STYLES: Record<StatusBadge, string> = {
  on_track: 'bg-green-100 text-green-800',
  watch: 'bg-amber-100 text-amber-800',
  alert: 'bg-red-100 text-red-800',
}

const BADGE_LABELS: Record<StatusBadge, string> = {
  on_track: 'On Track',
  watch: 'Watch',
  alert: 'Alert',
}

const REPORT_STATUS_STYLES: Record<ReportStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  ready_for_review: 'bg-blue-100 text-blue-700',
  approved: 'bg-purple-100 text-purple-700',
  sent: 'bg-green-100 text-green-700',
  none: 'bg-gray-50 text-gray-400',
}

const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  draft: 'Draft',
  ready_for_review: 'Ready',
  approved: 'Approved',
  sent: 'Sent',
  none: 'Not Started',
}

export default function CfoDashboardPage() {
  const [month, setMonth] = useState(defaultReportMonth())
  const [data, setData] = useState<SummariesResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterMode>('all')
  const [search, setSearch] = useState('')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [showOnTrack, setShowOnTrack] = useState(false)

  const loadSummaries = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/cfo/summaries?month=${month}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? `Failed to load (${res.status})`)
        return
      }
      setData(await res.json())
    } catch (err) {
      console.error('[CFO Dashboard] load error:', err)
      setError('Network error loading dashboard')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadSummaries()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month])

  // Apply filters (filter bar + search)
  const filteredSummaries = useMemo(() => {
    if (!data) return []
    let list = data.summaries
    if (filter !== 'all') list = list.filter(s => s.badge === filter)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(s =>
        s.business_name.toLowerCase().includes(q) ||
        (s.industry ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [data, filter, search])

  // Group by priority
  const grouped = useMemo(() => {
    return {
      alert: filteredSummaries.filter(s => s.badge === 'alert'),
      watch: filteredSummaries.filter(s => s.badge === 'watch'),
      on_track: filteredSummaries.filter(s => s.badge === 'on_track'),
    }
  }, [filteredSummaries])

  const toggleRow = (bizId: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(bizId)) next.delete(bizId)
      else next.add(bizId)
      return next
    })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader
        variant="banner"
        title="CFO Dashboard"
        subtitle={`Multi-client overview · ${formatMonthLabel(month)}`}
        icon={BarChart3}
        actions={
          <button
            onClick={loadSummaries}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
      />

      <div className="max-w-[1800px] mx-auto p-4 sm:p-6 lg:p-8 space-y-4">
        {/* Month selector + filter bar */}
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange/40"
          />

          <div className="inline-flex rounded-lg border border-gray-200 bg-white overflow-hidden">
            {(['all', 'alert', 'watch', 'on_track'] as FilterMode[]).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  filter === f
                    ? 'bg-brand-navy text-white'
                    : 'text-gray-600 hover:bg-gray-50 border-l border-gray-200 first:border-l-0'
                }`}
              >
                {f === 'all' ? 'All' :
                 f === 'alert' ? 'Alert' :
                 f === 'watch' ? 'Watch' : 'On Track'}
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search clients…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-7 pr-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange/40"
            />
          </div>
        </div>

        {/* Stat cards */}
        {data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              label="On Track"
              value={data.stats.on_track}
              color="green"
              icon={<CheckCircle2 className="w-4 h-4" />}
            />
            <StatCard
              label="Pending Approval"
              value={data.stats.pending_approval}
              color="amber"
              icon={<Clock className="w-4 h-4" />}
            />
            <StatCard
              label="Alerts"
              value={data.stats.alert}
              color="red"
              icon={<AlertTriangle className="w-4 h-4" />}
            />
            <StatCard
              label="Next Report Due"
              value={data.stats.next_due ?? 'All clear'}
              color="navy"
            />
          </div>
        )}

        {/* Error / empty / loading states */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {isLoading && !data && (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-brand-orange mx-auto mb-2" />
            <p className="text-sm text-gray-600">Loading dashboard…</p>
          </div>
        )}

        {data && data.summaries.length === 0 && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm font-medium text-amber-900">No CFO clients flagged yet</p>
            <p className="text-xs text-amber-700 mt-1">
              Mark a business as a CFO client via the coach portal or via SQL:
              <code className="ml-1 px-1 py-0.5 bg-amber-100 rounded text-xs">
                UPDATE businesses SET is_cfo_client = true WHERE id = &apos;...&apos;;
              </code>
            </p>
          </div>
        )}

        {/* Priority-sorted sections */}
        {data && data.summaries.length > 0 && (
          <div className="space-y-6">
            {grouped.alert.length > 0 && (
              <PrioritySection
                title="Needs Attention"
                badge="alert"
                count={grouped.alert.length}
                clients={grouped.alert}
                expandedRows={expandedRows}
                onToggleRow={toggleRow}
              />
            )}

            {grouped.watch.length > 0 && (
              <PrioritySection
                title="Watch"
                badge="watch"
                count={grouped.watch.length}
                clients={grouped.watch}
                expandedRows={expandedRows}
                onToggleRow={toggleRow}
              />
            )}

            {grouped.on_track.length > 0 && (
              <div>
                <button
                  onClick={() => setShowOnTrack(v => !v)}
                  className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-gray-900 mb-2"
                >
                  {showOnTrack ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  <span>On Track</span>
                  <span className="text-xs font-normal text-gray-400">({grouped.on_track.length})</span>
                </button>
                {showOnTrack && (
                  <ClientList
                    clients={grouped.on_track}
                    expandedRows={expandedRows}
                    onToggleRow={toggleRow}
                  />
                )}
              </div>
            )}

            {grouped.alert.length === 0 && grouped.watch.length === 0 && !showOnTrack && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-700" />
                <p className="text-sm font-medium text-green-900">
                  All clients on track for {formatMonthLabel(month)}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
  icon,
}: {
  label: string
  value: number | string
  color: 'green' | 'amber' | 'red' | 'navy'
  icon?: React.ReactNode
}) {
  const colorClasses: Record<typeof color, string> = {
    green: 'text-green-700 bg-green-50 border-green-200',
    amber: 'text-amber-700 bg-amber-50 border-amber-200',
    red: 'text-red-700 bg-red-50 border-red-200',
    navy: 'text-brand-navy bg-gray-50 border-gray-200',
  }
  return (
    <div className={`rounded-lg border p-3 ${colorClasses[color]}`}>
      <div className="flex items-center gap-2 text-xs font-medium">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  )
}

function PrioritySection({
  title,
  badge,
  count,
  clients,
  expandedRows,
  onToggleRow,
}: {
  title: string
  badge: StatusBadge
  count: number
  clients: ClientSummary[]
  expandedRows: Set<string>
  onToggleRow: (id: string) => void
}) {
  return (
    <div>
      <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-2">
        {badge === 'alert' && <AlertTriangle className="w-4 h-4 text-red-600" />}
        {badge === 'watch' && <Clock className="w-4 h-4 text-amber-600" />}
        {title}
        <span className="text-xs font-normal text-gray-400">({count})</span>
      </h2>
      <ClientList clients={clients} expandedRows={expandedRows} onToggleRow={onToggleRow} />
    </div>
  )
}

function ClientList({
  clients,
  expandedRows,
  onToggleRow,
}: {
  clients: ClientSummary[]
  expandedRows: Set<string>
  onToggleRow: (id: string) => void
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-200">
      {clients.map(client => (
        <ClientRow
          key={client.business_id}
          client={client}
          isExpanded={expandedRows.has(client.business_id)}
          onToggle={() => onToggleRow(client.business_id)}
        />
      ))}
    </div>
  )
}

function ClientRow({
  client,
  isExpanded,
  onToggle,
}: {
  client: ClientSummary
  isExpanded: boolean
  onToggle: () => void
}) {
  return (
    <div>
      {/* Compact row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 text-left"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
        )}

        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${BADGE_STYLES[client.badge]}`}>
          {BADGE_LABELS[client.badge]}
        </span>

        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900 truncate">{client.business_name}</div>
          {client.industry && (
            <div className="text-xs text-gray-500 truncate">{client.industry}</div>
          )}
        </div>

        <div className="hidden sm:flex items-center gap-4 text-xs tabular-nums shrink-0">
          <Metric label="Rev" value={fmtPct(client.revenue_vs_budget_pct)} />
          <Metric label="GP" value={fmtPct(client.gross_profit_pct)} />
          <Metric label="Net" value={fmtCurrency(client.net_profit)} emphasise={client.net_profit < 0} />
          <Metric label="Cash" value={fmtCurrency(client.cash_balance)} />
        </div>

        {client.unreconciled_count > 0 && (
          <span className="text-xs text-amber-700 whitespace-nowrap">
            ⚠ {client.unreconciled_count}
          </span>
        )}

        <span className={`px-2 py-0.5 rounded text-xs font-medium ${REPORT_STATUS_STYLES[client.report_status]}`}>
          {REPORT_STATUS_LABELS[client.report_status]}
        </span>
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="px-10 py-3 bg-gray-50 border-t border-gray-100 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Detail label="Revenue" value={fmtCurrency(client.revenue, false)} sub={`Budget: ${fmtCurrency(client.revenue_budget, false)}`} />
            <Detail label="Gross Profit" value={fmtCurrency(client.gross_profit, false)} sub={fmtPct(client.gross_profit_pct)} />
            <Detail
              label="Net Profit"
              value={fmtCurrency(client.net_profit, false)}
              sub={`Budget: ${fmtCurrency(client.net_profit_budget, false)}`}
              emphasise={client.net_profit < 0}
            />
            <Detail label="Cash" value={fmtCurrency(client.cash_balance, false)} sub={client.unreconciled_count > 0 ? `${client.unreconciled_count} unreconciled` : 'Reconciled'} />
          </div>

          <Link
            href={`/coach/clients/${client.business_id}/view/finances/monthly-report`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-brand-orange hover:bg-brand-orange-600 rounded-lg"
          >
            Review Report <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      )}
    </div>
  )
}

function Metric({ label, value, emphasise }: { label: string; value: string; emphasise?: boolean }) {
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase text-gray-400 tracking-wide">{label}</div>
      <div className={`text-sm font-medium ${emphasise ? 'text-red-600' : 'text-gray-900'}`}>{value}</div>
    </div>
  )
}

function Detail({ label, value, sub, emphasise }: { label: string; value: string; sub?: string; emphasise?: boolean }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-sm font-semibold ${emphasise ? 'text-red-600' : 'text-gray-900'}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400">{sub}</div>}
    </div>
  )
}
