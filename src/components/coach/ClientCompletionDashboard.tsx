'use client'

import { useState, useMemo, Fragment } from 'react'
import {
  ChevronUp,
  ChevronDown,
  ChevronRight,
  Search,
  Filter,
  Users,
  AlertCircle,
  Eye,
  MessageSquare,
  Calendar,
  Clock,
  Flame,
  CheckCircle2,
  BarChart3,
  ArrowUpRight,
  Activity,
  HelpCircle,
} from 'lucide-react'
import Tooltip from '@/components/ui/Tooltip'
import { Skeleton } from '@/components/ui/Skeleton'
import type { EngagementSignal, ModuleStatus } from '@/lib/coach/client-completion'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ClientCompletion {
  businessId: string
  businessName: string
  ownerId: string | null
  /** 'unknown' = the lookup failed. Never draw it as done or as not started. */
  modules: Record<string, ModuleStatus>
  engagement: {
    lastLogin: string | null
    weeklyReviewStreak: number
    daysSinceSession: number | null
    openActions: number
    unreadMessages: number
    /** null = couldn't be scored, because a lookup it reads failed */
    engagementScore: number | null
    /** Signals whose lookup failed — their values above are not answers. */
    unknown: EngagementSignal[]
  }
  alerts: string[]
  /** false = some alert rules couldn't run, so no alerts is not "all clear" */
  alertsComplete: boolean
}

export interface ClientCompletionDashboardProps {
  clients: ClientCompletion[]
  isLoading?: boolean
}

// ─── Module configuration ─────────────────────────────────────────────────────

interface ModuleGroup {
  label: string
  keys: string[]
  color: string // tailwind bg class for group header
}

const MODULE_GROUPS: ModuleGroup[] = [
  {
    label: 'Setup',
    keys: ['businessProfile', 'assessment', 'xeroConnected'],
    color: 'bg-slate-100 text-slate-700',
  },
  {
    label: 'Plan',
    keys: ['visionMission', 'swot', 'goals', 'onePagePlan', 'strategicInitiatives'],
    color: 'bg-brand-navy-50 text-brand-navy',
  },
  {
    label: 'Finance',
    keys: ['forecast', 'monthlyReport', 'cashflow', 'kpiDashboard'],
    color: 'bg-brand-teal-50 text-brand-teal',
  },
  {
    label: 'Execute',
    keys: ['weeklyReviews', 'quarterlyReview', 'issuesList', 'ideas', 'openLoops', 'stopDoing'],
    color: 'bg-brand-orange-50 text-brand-orange-700',
  },
  {
    label: 'Team',
    keys: ['orgChart', 'accountability'],
    color: 'bg-purple-50 text-purple-700',
  },
  {
    label: 'Marketing',
    keys: ['valueProposition'],
    color: 'bg-pink-50 text-pink-700',
  },
  {
    label: 'Systems',
    keys: ['processes'],
    color: 'bg-cyan-50 text-cyan-700',
  },
  {
    label: 'Coaching',
    keys: ['sessionNotes', 'messages'],
    color: 'bg-amber-50 text-amber-700',
  },
]

const MODULE_LABELS: Record<string, string> = {
  businessProfile: 'Business Profile',
  assessment: 'Assessment',
  xeroConnected: 'Xero Connected',
  visionMission: 'Vision & Mission',
  swot: 'SWOT',
  goals: 'Goals',
  onePagePlan: 'One-Page Plan',
  strategicInitiatives: 'Strategic Initiatives',
  forecast: 'Forecast',
  monthlyReport: 'Monthly Report',
  cashflow: 'Cashflow',
  kpiDashboard: 'KPI Dashboard',
  weeklyReviews: 'Weekly Reviews',
  quarterlyReview: 'Quarterly Review',
  issuesList: 'Issues List',
  ideas: 'Ideas',
  openLoops: 'Open Loops',
  stopDoing: 'Stop Doing',
  orgChart: 'Org Chart',
  accountability: 'Accountability',
  valueProposition: 'Value Proposition',
  processes: 'Processes',
  sessionNotes: 'Session Notes',
  messages: 'Messages',
}

const STATUS_LABELS: Record<ModuleStatus, string> = {
  completed: 'Completed',
  in_progress: 'In Progress',
  not_started: 'Not Started',
  unknown: "Couldn't check",
}

/** The engagement signals this dashboard shows, in the order it shows them. */
const SIGNAL_LABELS: Partial<Record<EngagementSignal, string>> = {
  lastLogin: 'Last Login',
  weeklyReviewStreak: 'Weekly Streak',
  daysSinceSession: 'Days Since Session',
  openActions: 'Open Actions',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type SortField = 'name' | 'completion' | 'engagement' | 'alerts'
type SortDirection = 'asc' | 'desc'
type AlertFilter = 'all' | 'needs-attention' | 'on-track'

function getAllModuleKeys(): string[] {
  return MODULE_GROUPS.flatMap((g) => g.keys)
}

/** A module the response didn't mention is a missing answer, not "not started". */
function moduleStatus(modules: Record<string, ModuleStatus>, key: string): ModuleStatus {
  return modules[key] ?? 'unknown'
}

/**
 * Completion % over every module. A module that couldn't be checked counts as
 * not completed, so with any unchecked the % is a floor ("at least"), and the
 * caller must say so rather than grade it.
 */
function getCompletion(modules: Record<string, ModuleStatus>): {
  completionPercent: number
  uncheckedModules: number
} {
  const keys = getAllModuleKeys()
  const completed = keys.filter((k) => moduleStatus(modules, k) === 'completed').length
  const uncheckedModules = keys.filter((k) => moduleStatus(modules, k) === 'unknown').length
  return { completionPercent: Math.round((completed / keys.length) * 100), uncheckedModules }
}

function getEngagementColor(score: number): string {
  if (score >= 70) return 'bg-green-500 text-white'
  if (score >= 30) return 'bg-amber-400 text-gray-900'
  return 'bg-red-500 text-white'
}

function getEngagementTextColor(score: number): string {
  if (score >= 70) return 'text-green-600'
  if (score >= 30) return 'text-amber-600'
  return 'text-red-600'
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  const date = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  return date.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusDot({ status, moduleKey }: { status: ModuleStatus; moduleKey: string }) {
  const label = MODULE_LABELS[moduleKey] || moduleKey
  const statusText = STATUS_LABELS[status] || status

  // A failed lookup gets a question mark, not a dot, so it can't be read as
  // done (green), started (amber) or not started (grey).
  if (status === 'unknown') {
    return (
      <Tooltip content={`${label}: couldn't check just now, so this is not "Not Started". Refresh to try again.`}>
        <HelpCircle
          role="img"
          className="w-3.5 h-3.5 text-amber-600 transition-transform hover:scale-125"
          aria-label={`${label} - ${statusText}`}
        />
      </Tooltip>
    )
  }

  const dotClass =
    status === 'completed'
      ? 'bg-green-500'
      : status === 'in_progress'
        ? 'bg-amber-400'
        : 'bg-gray-300'

  return (
    <Tooltip content={`${label}: ${statusText}`}>
      <span
        className={`inline-block w-3 h-3 rounded-full ${dotClass} transition-transform hover:scale-125`}
        aria-label={`${label} - ${statusText}`}
      />
    </Tooltip>
  )
}

function CouldNotCheck() {
  return <span className="text-amber-600">Couldn&apos;t check</span>
}

function EngagementBadge({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <Tooltip content="Engagement couldn't be scored: one of the lookups it needs failed. Refresh to try again.">
        <span
          className="inline-flex items-center justify-center min-w-[2rem] px-1.5 py-0.5 rounded-full text-xs font-bold border border-amber-300 bg-amber-50 text-amber-700"
          aria-label="Engagement score - Couldn't check"
        >
          ?
        </span>
      </Tooltip>
    )
  }
  return (
    <span
      className={`inline-flex items-center justify-center min-w-[2rem] px-1.5 py-0.5 rounded-full text-xs font-bold ${getEngagementColor(score)}`}
    >
      {score}
    </span>
  )
}

function AlertBadge({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
      {text}
    </span>
  )
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Header skeleton */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-4 w-72" />
          </div>
          <div className="flex items-center gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="text-center space-y-1">
                <Skeleton className="h-8 w-12 mx-auto" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-3 mt-4">
          <Skeleton className="h-10 flex-1 max-w-md" />
          <Skeleton className="h-10 w-40" />
        </div>
      </div>
      {/* Table skeleton */}
      <div className="p-6 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-5 w-40 flex-shrink-0" />
            {Array.from({ length: 12 }).map((_, j) => (
              <Skeleton key={j} className="h-3 w-3 rounded-full flex-shrink-0" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ClientCompletionDashboard({ clients, isLoading = false }: ClientCompletionDashboardProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [alertFilter, setAlertFilter] = useState<AlertFilter>('all')
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  // Compute completion % for each client
  const clientsWithCompletion = useMemo(() => {
    return clients.map((c) => ({
      ...c,
      ...getCompletion(c.modules),
    }))
  }, [clients])

  // Everything that couldn't be checked for at least one client, for the notice
  const uncheckedLabels = useMemo(() => {
    const labels = getAllModuleKeys()
      .filter((key) => clients.some((c) => moduleStatus(c.modules, key) === 'unknown'))
      .map((key) => MODULE_LABELS[key] || key)
    for (const [signal, label] of Object.entries(SIGNAL_LABELS)) {
      if (clients.some((c) => c.engagement.unknown.includes(signal as EngagementSignal))) {
        labels.push(label)
      }
    }
    return labels
  }, [clients])

  // Filter
  const filteredClients = useMemo(() => {
    let result = [...clientsWithCompletion]

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter((c) => c.businessName.toLowerCase().includes(q))
    }

    if (alertFilter === 'needs-attention') {
      result = result.filter((c) => c.alerts.length > 0)
    } else if (alertFilter === 'on-track') {
      // "On track" is a verdict: a client whose alert checks didn't all run can't be given it.
      result = result.filter((c) => c.alerts.length === 0 && c.alertsComplete)
    }

    return result
  }, [clientsWithCompletion, searchQuery, alertFilter])

  // Sort
  const sortedClients = useMemo(() => {
    const result = [...filteredClients]
    result.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'name':
          cmp = a.businessName.localeCompare(b.businessName)
          break
        case 'completion':
          cmp = a.completionPercent - b.completionPercent
          break
        case 'engagement': {
          const scoreA = a.engagement.engagementScore
          const scoreB = b.engagement.engagementScore
          // An unscored client has no place on the scale: after the scored ones, either direction.
          if (scoreA === null || scoreB === null) {
            return scoreA === scoreB ? 0 : scoreA === null ? 1 : -1
          }
          cmp = scoreA - scoreB
          break
        }
        case 'alerts':
          cmp = a.alerts.length - b.alerts.length
          break
      }
      return sortDirection === 'asc' ? cmp : -cmp
    })
    return result
  }, [filteredClients, sortField, sortDirection])

  // Summary stats
  const stats = useMemo(() => {
    const total = clients.length
    const avgCompletion =
      clientsWithCompletion.length > 0
        ? Math.round(
            clientsWithCompletion.reduce((sum, c) => sum + c.completionPercent, 0) /
              clientsWithCompletion.length
          )
        : 0
    // With any module unchecked the average is a floor, like each client's %.
    const avgCompletionIsFloor = clientsWithCompletion.some((c) => c.uncheckedModules > 0)
    const needingAttention = clients.filter((c) => c.alerts.length > 0).length
    // One unscored client makes the fleet average a number the data doesn't support.
    const scores = clients
      .map((c) => c.engagement.engagementScore)
      .filter((s): s is number => s !== null)
    const avgEngagement =
      clients.length === 0
        ? 0
        : scores.length < clients.length
          ? null
          : Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length)
    return { total, avgCompletion, avgCompletionIsFloor, needingAttention, avgEngagement }
  }, [clients, clientsWithCompletion])

  // Visible module keys (accounting for collapsed groups)
  const visibleGroups = useMemo(() => {
    return MODULE_GROUPS.map((group) => ({
      ...group,
      collapsed: collapsedGroups.has(group.label),
      visibleKeys: collapsedGroups.has(group.label) ? [] : group.keys,
    }))
  }, [collapsedGroups])

  const totalVisibleColumns = useMemo(() => {
    return visibleGroups.reduce((sum, g) => sum + (g.collapsed ? 1 : g.keys.length), 0)
  }, [visibleGroups])

  // Handlers
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDirection(field === 'name' ? 'asc' : 'desc')
    }
  }

  const toggleRow = (businessId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(businessId)) {
        next.delete(businessId)
      } else {
        next.add(businessId)
      }
      return next
    })
  }

  const toggleGroup = (label: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(label)) {
        next.delete(label)
      } else {
        next.add(label)
      }
      return next
    })
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronUp className="w-3.5 h-3.5 text-gray-300" />
    return sortDirection === 'asc' ? (
      <ChevronUp className="w-3.5 h-3.5 text-brand-orange" />
    ) : (
      <ChevronDown className="w-3.5 h-3.5 text-brand-orange" />
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  if (isLoading) {
    return <DashboardSkeleton />
  }

  if (clients.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-12 text-center">
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No clients yet</h3>
          <p className="text-gray-500">Client completion data will appear here once clients are added.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* ── Summary stats header ─────────────────────────────────────────────── */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-brand-orange" />
              Module Completion
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Track client progress across all modules
            </p>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Clients</div>
            </div>
            <div className="text-center">
              {stats.avgCompletionIsFloor ? (
                <Tooltip content="At least this much: some modules couldn't be checked, so the real average may be higher.">
                  <span className="text-2xl font-bold text-amber-600">&ge;{stats.avgCompletion}%</span>
                </Tooltip>
              ) : (
                <div className="text-2xl font-bold text-brand-teal">{stats.avgCompletion}%</div>
              )}
              <div className="text-xs text-gray-500 uppercase tracking-wide">Avg Completion</div>
            </div>
            {stats.needingAttention > 0 && (
              <div className="text-center">
                <div className="text-2xl font-bold text-amber-600">{stats.needingAttention}</div>
                <div className="text-xs text-gray-500 uppercase tracking-wide">Need Attention</div>
              </div>
            )}
            <div className="text-center">
              {stats.avgEngagement === null ? (
                <Tooltip content="Some clients' engagement couldn't be scored, so there is no average to show. Refresh to try again.">
                  <span className="text-2xl font-bold text-amber-600" aria-label="Avg engagement - Couldn't check">
                    &mdash;
                  </span>
                </Tooltip>
              ) : (
                <div className={`text-2xl font-bold ${getEngagementTextColor(stats.avgEngagement)}`}>
                  {stats.avgEngagement}
                </div>
              )}
              <div className="text-xs text-gray-500 uppercase tracking-wide">Avg Engagement</div>
            </div>
          </div>
        </div>

        {/* ── Could-not-check notice ───────────────────────────────────────────── */}
        {uncheckedLabels.length > 0 && (
          <div role="status" className="mt-4 px-4 py-3 bg-amber-50 rounded-lg border border-amber-200 flex items-start gap-3">
            <HelpCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              Couldn&apos;t check {uncheckedLabels.join(', ')} just now. Those are marked
              &quot;couldn&apos;t check&quot; below rather than Not Started, and they raise no
              alerts. Refresh to try again.
            </p>
          </div>
        )}

        {/* ── Filter bar ───────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-3 mt-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search clients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-brand-orange"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={alertFilter}
              onChange={(e) => setAlertFilter(e.target.value as AlertFilter)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-brand-orange"
            >
              <option value="all">All Clients</option>
              <option value="needs-attention">Needs Attention</option>
              <option value="on-track">On Track</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Matrix table ─────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: `${300 + totalVisibleColumns * 44}px` }}>
          {/* Group header row */}
          <thead>
            <tr className="border-b border-gray-200">
              {/* Sticky client column header — spans two header rows */}
              <th
                rowSpan={2}
                className="sticky left-0 z-20 bg-gray-50 px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-r border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors"
                style={{ minWidth: '200px' }}
                onClick={() => handleSort('name')}
              >
                <div className="flex items-center gap-1.5">
                  Client
                  <SortIcon field="name" />
                </div>
              </th>
              {/* Group header cells */}
              {visibleGroups.map((group) => (
                <th
                  key={group.label}
                  colSpan={group.collapsed ? 1 : group.keys.length}
                  className={`px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider cursor-pointer select-none border-r border-gray-200 last:border-r-0 transition-colors hover:opacity-80 ${group.color}`}
                  onClick={() => toggleGroup(group.label)}
                >
                  <div className="flex items-center justify-center gap-1">
                    <ChevronRight
                      className={`w-3 h-3 transition-transform ${group.collapsed ? '' : 'rotate-90'}`}
                    />
                    {group.label}
                    <span className="text-[10px] font-normal opacity-70">({group.keys.length})</span>
                  </div>
                </th>
              ))}
              {/* Sort columns */}
              <th
                rowSpan={2}
                className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => handleSort('completion')}
              >
                <div className="flex items-center justify-center gap-1">
                  %
                  <SortIcon field="completion" />
                </div>
              </th>
              <th
                rowSpan={2}
                className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => handleSort('alerts')}
              >
                <div className="flex items-center justify-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <SortIcon field="alerts" />
                </div>
              </th>
            </tr>

            {/* Module column headers */}
            <tr className="border-b border-gray-200 bg-gray-50">
              {visibleGroups.map((group) =>
                group.collapsed ? (
                  <th key={`${group.label}-collapsed`} className="px-1 py-1.5 border-r border-gray-200 last:border-r-0">
                    <span className="text-[10px] text-gray-400">...</span>
                  </th>
                ) : (
                  group.keys.map((key) => (
                    <th
                      key={key}
                      className="px-1 py-1.5 text-center border-r border-gray-200 last:border-r-0"
                    >
                      <Tooltip content={MODULE_LABELS[key] || key}>
                        <span className="text-[10px] text-gray-500 truncate block max-w-[40px] mx-auto">
                          {(MODULE_LABELS[key] || key).slice(0, 4)}
                        </span>
                      </Tooltip>
                    </th>
                  ))
                )
              )}
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {sortedClients.map((client) => {
              const isExpanded = expandedRows.has(client.businessId)
              return (
                <Fragment key={client.businessId}>
                  {/* Main row */}
                  <tr
                    className={`hover:bg-gray-50 transition-colors cursor-pointer ${
                      client.alerts.length > 0 ? 'bg-amber-50/40' : ''
                    }`}
                    onClick={() => toggleRow(client.businessId)}
                  >
                    {/* Sticky client name cell */}
                    <td
                      className="sticky left-0 z-10 bg-inherit px-4 py-3 border-r border-gray-200"
                      style={{ minWidth: '200px' }}
                    >
                      <div className="flex items-center gap-2.5">
                        <ChevronRight
                          className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${
                            isExpanded ? 'rotate-90' : ''
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-gray-900 truncate text-sm">
                            {client.businessName}
                          </div>
                        </div>
                        <EngagementBadge score={client.engagement.engagementScore} />
                      </div>
                    </td>

                    {/* Module status dots */}
                    {visibleGroups.map((group) =>
                      group.collapsed ? (
                        <td key={`${group.label}-collapsed`} className="px-1 py-3 text-center border-r border-gray-200 last:border-r-0">
                          <span className="text-gray-300 text-xs">--</span>
                        </td>
                      ) : (
                        group.keys.map((key) => (
                          <td key={key} className="px-1 py-3 text-center border-r border-gray-200 last:border-r-0">
                            <StatusDot
                              status={moduleStatus(client.modules, key)}
                              moduleKey={key}
                            />
                          </td>
                        ))
                      )
                    )}

                    {/* Completion % — a floor, not a grade, while any module is unchecked */}
                    <td className="px-3 py-3 text-center">
                      {client.uncheckedModules > 0 ? (
                        <Tooltip
                          content={`At least ${client.completionPercent}%: ${client.uncheckedModules} module${
                            client.uncheckedModules === 1 ? '' : 's'
                          } couldn't be checked, so the real figure may be higher.`}
                        >
                          <span className="text-sm font-semibold text-amber-600">
                            &ge;{client.completionPercent}%
                          </span>
                        </Tooltip>
                      ) : (
                        <span
                          className={`text-sm font-semibold ${
                            client.completionPercent >= 70
                              ? 'text-green-600'
                              : client.completionPercent >= 40
                                ? 'text-amber-600'
                                : 'text-red-600'
                          }`}
                        >
                          {client.completionPercent}%
                        </span>
                      )}
                    </td>

                    {/* Alerts count */}
                    <td className="px-3 py-3 text-center">
                      {client.alerts.length > 0 ? (
                        <span className="inline-flex items-center justify-center min-w-[1.25rem] px-1.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">
                          {client.alerts.length}
                        </span>
                      ) : client.alertsComplete ? (
                        <CheckCircle2 role="img" className="w-4 h-4 text-green-400 mx-auto" aria-label="No alerts" />
                      ) : (
                        <Tooltip content="No alerts from the checks that ran, but some couldn't run, so this client isn't confirmed on track. Refresh to try again.">
                          <HelpCircle
                            role="img"
                            className="w-4 h-4 text-amber-600 mx-auto"
                            aria-label="Alerts - Couldn't check"
                          />
                        </Tooltip>
                      )}
                    </td>
                  </tr>

                  {/* Expanded detail row */}
                  {isExpanded && (
                    <tr className="bg-gray-50/70">
                      <td
                        colSpan={totalVisibleColumns + 3}
                        className="px-6 py-4"
                      >
                        <div className="flex flex-col lg:flex-row gap-6">
                          {/* Engagement details */}
                          <div className="flex-1">
                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                              Engagement Details
                            </h4>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                              <div className="flex items-center gap-2 text-sm">
                                <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                <div>
                                  <div className="text-gray-500 text-xs">Last Login</div>
                                  <div className="font-medium text-gray-900">
                                    {client.engagement.unknown.includes('lastLogin') ? (
                                      <CouldNotCheck />
                                    ) : (
                                      formatDate(client.engagement.lastLogin)
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 text-sm">
                                <Flame className="w-4 h-4 text-brand-orange flex-shrink-0" />
                                <div>
                                  <div className="text-gray-500 text-xs">Weekly Streak</div>
                                  <div className="font-medium text-gray-900">
                                    {client.engagement.unknown.includes('weeklyReviewStreak') ? (
                                      <CouldNotCheck />
                                    ) : (
                                      `${client.engagement.weeklyReviewStreak} weeks`
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 text-sm">
                                <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                <div>
                                  <div className="text-gray-500 text-xs">Days Since Session</div>
                                  <div className="font-medium text-gray-900">
                                    {client.engagement.unknown.includes('daysSinceSession') ? (
                                      <CouldNotCheck />
                                    ) : client.engagement.daysSinceSession !== null ? (
                                      `${client.engagement.daysSinceSession}d`
                                    ) : (
                                      'No sessions'
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 text-sm">
                                <Activity className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                <div>
                                  <div className="text-gray-500 text-xs">Open Actions</div>
                                  <div className="font-medium text-gray-900">
                                    {client.engagement.unknown.includes('openActions') ? (
                                      <CouldNotCheck />
                                    ) : (
                                      client.engagement.openActions
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 text-sm">
                                <Activity className="w-4 h-4 text-brand-teal flex-shrink-0" />
                                <div>
                                  <div className="text-gray-500 text-xs">Engagement Score</div>
                                  {client.engagement.engagementScore === null ? (
                                    <div className="font-bold">
                                      <CouldNotCheck />
                                    </div>
                                  ) : (
                                    <div className={`font-bold ${getEngagementTextColor(client.engagement.engagementScore)}`}>
                                      {client.engagement.engagementScore}/100
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Alerts */}
                          {client.alerts.length > 0 && (
                            <div className="lg:w-64">
                              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                                Alerts
                              </h4>
                              <div className="flex flex-wrap gap-1.5">
                                {client.alerts.map((alert, i) => (
                                  <AlertBadge key={i} text={alert} />
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Quick actions */}
                          <div className="lg:w-auto flex-shrink-0">
                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                              Quick Actions
                            </h4>
                            <div className="flex flex-col gap-2">
                              <a
                                href={`/coach/clients/${client.businessId}/view/dashboard`}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-brand-orange hover:text-brand-orange-700 hover:bg-brand-orange-50 rounded-lg transition-colors"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Eye className="w-4 h-4" />
                                View Client
                                <ArrowUpRight className="w-3 h-3" />
                              </a>
                              <a
                                href={`/coach/messages?client=${client.businessId}`}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-brand-navy hover:text-brand-navy-700 hover:bg-brand-navy-50 rounded-lg transition-colors"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MessageSquare className="w-4 h-4" />
                                Send Message
                              </a>
                              <a
                                href={`/coach/schedule?client=${client.businessId}`}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-brand-teal hover:text-brand-teal-700 hover:bg-brand-teal-50 rounded-lg transition-colors"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Calendar className="w-4 h-4" />
                                Schedule Session
                              </a>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Empty filtered state */}
      {sortedClients.length === 0 && (
        <div className="p-12 text-center">
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No clients found</h3>
          <p className="text-gray-500">
            Try adjusting your search or filter criteria.
          </p>
        </div>
      )}

      {/* Footer with legend */}
      <div className="px-6 py-3 bg-gray-50 border-t border-gray-200">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-gray-500">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" />
              Completed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400" />
              In Progress
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-gray-300" />
              Not Started
            </span>
            <span className="flex items-center gap-1.5">
              <HelpCircle className="w-3 h-3 text-amber-600" />
              Couldn&apos;t check
            </span>
          </div>
          <span>
            Showing {sortedClients.length} of {clients.length} clients
            {collapsedGroups.size > 0 && (
              <> &middot; {collapsedGroups.size} group{collapsedGroups.size > 1 ? 's' : ''} collapsed</>
            )}
          </span>
        </div>
      </div>
    </div>
  )
}

export default ClientCompletionDashboard
