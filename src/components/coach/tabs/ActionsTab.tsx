'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  ListChecks,
  CheckCircle,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  AlertTriangle,
  CircleDot,
  XCircle
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────

interface SessionAction {
  id: string
  description: string
  due_date: string | null
  status: 'pending' | 'completed' | 'missed' | 'carried_over'
  completed_at: string | null
  created_at: string
  action_number: number
}

interface OpenLoop {
  id: string
  title: string
  description: string | null
  status: 'open' | 'in_progress' | 'closed'
  priority: string | null
  due_date: string | null
  closed_at: string | null
  created_at: string
}

interface Issue {
  id: string
  title: string
  stated_problem: string | null
  status: 'open' | 'in_progress' | 'solved' | 'wont_fix'
  priority: string | null
  due_date: string | null
  archived: boolean
  created_at: string
}

type FilterStatus = 'all' | 'open' | 'completed'

interface ActionsTabProps {
  businessId: string
  ownerId: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────

function isOverdue(dueDate: string | null, isComplete: boolean): boolean {
  if (!dueDate || isComplete) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(dueDate) < today
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '--'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function priorityBadge(priority: string | null) {
  if (!priority) return null
  const config: Record<string, string> = {
    critical: 'bg-red-100 text-red-700',
    high: 'bg-brand-orange-100 text-brand-orange-700',
    medium: 'bg-yellow-100 text-yellow-700',
    low: 'bg-gray-100 text-gray-600',
  }
  const cls = config[priority] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${cls}`}>
      {priority.charAt(0).toUpperCase() + priority.slice(1)}
    </span>
  )
}

// ─── Component ───────────────────────────────────────────────────

export function ActionsTab({ businessId, ownerId }: ActionsTabProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [actions, setActions] = useState<SessionAction[]>([])
  const [loops, setLoops] = useState<OpenLoop[]>([])
  const [issues, setIssues] = useState<Issue[]>([])

  const [filter, setFilter] = useState<FilterStatus>('all')
  const [expandedSection, setExpandedSection] = useState<Record<string, boolean>>({
    actions: true,
    loops: true,
    issues: true,
  })

  const [updatingId, setUpdatingId] = useState<string | null>(null)

  // ── Fetch data ──────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Session actions are keyed by business_id directly
      const actionsPromise = supabase
        .from('session_actions')
        .select('id, description, due_date, status, completed_at, created_at, action_number')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })

      // Open loops and issues use user_id (the business owner)
      const loopsPromise = ownerId
        ? supabase
            .from('open_loops')
            .select('id, title, description, status, priority, due_date, closed_at, created_at')
            .eq('user_id', ownerId)
            .eq('archived', false)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [] as OpenLoop[], error: null })

      const issuesPromise = ownerId
        ? supabase
            .from('issues_list')
            .select('id, title, stated_problem, status, priority, due_date, archived, created_at')
            .eq('user_id', ownerId)
            .eq('archived', false)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [] as Issue[], error: null })

      const [actionsRes, loopsRes, issuesRes] = await Promise.all([
        actionsPromise,
        loopsPromise,
        issuesPromise,
      ])

      if (actionsRes.error) throw new Error(`Session actions: ${actionsRes.error.message}`)
      if (loopsRes.error) throw new Error(`Open loops: ${loopsRes.error.message}`)
      if (issuesRes.error) throw new Error(`Issues: ${issuesRes.error.message}`)

      setActions((actionsRes.data ?? []) as SessionAction[])
      setLoops((loopsRes.data ?? []) as OpenLoop[])
      setIssues((issuesRes.data ?? []) as Issue[])
    } catch (err) {
      console.error('[ActionsTab] Load error:', err)
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, ownerId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ── Mutations ───────────────────────────────────────────────

  async function markActionCompleted(id: string) {
    try {
      setUpdatingId(id)
      const { error: updateError } = await supabase
        .from('session_actions')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', id)

      if (updateError) throw updateError
      setActions(prev =>
        prev.map(a => (a.id === id ? { ...a, status: 'completed' as const, completed_at: new Date().toISOString() } : a))
      )
    } catch (err) {
      console.error('[ActionsTab] Failed to complete action:', err)
    } finally {
      setUpdatingId(null)
    }
  }

  async function markLoopClosed(id: string) {
    try {
      setUpdatingId(id)
      const { error: updateError } = await supabase
        .from('open_loops')
        .update({ status: 'closed', closed_at: new Date().toISOString() })
        .eq('id', id)

      if (updateError) throw updateError
      setLoops(prev =>
        prev.map(l => (l.id === id ? { ...l, status: 'closed' as const, closed_at: new Date().toISOString() } : l))
      )
    } catch (err) {
      console.error('[ActionsTab] Failed to close loop:', err)
    } finally {
      setUpdatingId(null)
    }
  }

  // ── Filtered data ───────────────────────────────────────────

  const filteredActions = useMemo(() => {
    if (filter === 'all') return actions
    if (filter === 'completed') return actions.filter(a => a.status === 'completed')
    // "open" means not completed
    return actions.filter(a => a.status !== 'completed')
  }, [actions, filter])

  const filteredLoops = useMemo(() => {
    if (filter === 'all') return loops
    if (filter === 'completed') return loops.filter(l => l.status === 'closed')
    return loops.filter(l => l.status !== 'closed')
  }, [loops, filter])

  const filteredIssues = useMemo(() => {
    if (filter === 'all') return issues
    if (filter === 'completed') return issues.filter(i => i.status === 'solved' || i.status === 'wont_fix')
    return issues.filter(i => i.status !== 'solved' && i.status !== 'wont_fix')
  }, [issues, filter])

  // ── Counts ──────────────────────────────────────────────────

  const counts = useMemo(() => ({
    actions: filteredActions.length,
    loops: filteredLoops.length,
    issues: filteredIssues.length,
  }), [filteredActions, filteredLoops, filteredIssues])

  // ── Toggle section ──────────────────────────────────────────

  function toggleSection(key: string) {
    setExpandedSection(prev => ({ ...prev, [key]: !prev[key] }))
  }

  // ── Loading state ───────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[300px]">
        <Loader2 className="w-8 h-8 text-brand-orange animate-spin mb-3" />
        <p className="text-sm text-gray-500">Loading actions...</p>
      </div>
    )
  }

  // ── Error state ─────────────────────────────────────────────

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800">Failed to load actions</p>
            <p className="text-sm text-red-600 mt-1">{error}</p>
          </div>
          <button
            onClick={loadData}
            className="px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-brand-navy">Actions & Issues</h2>
          <p className="text-sm text-gray-500">
            {actions.length + loops.length + issues.length} total items across all categories
          </p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-brand-navy bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-200">
        {(['all', 'open', 'completed'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              filter === f
                ? 'border-brand-orange text-brand-orange'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Section: Session Actions ──────────────────────────── */}
      <SectionHeader
        title="Session Actions"
        count={counts.actions}
        icon={<ListChecks className="w-5 h-5 text-brand-orange" />}
        expanded={expandedSection.actions}
        onToggle={() => toggleSection('actions')}
      />
      {expandedSection.actions && (
        <div className="space-y-3">
          {filteredActions.length === 0 ? (
            <EmptyState message="No session actions to show" />
          ) : (
            filteredActions.map(action => {
              const completed = action.status === 'completed'
              const overdue = isOverdue(action.due_date, completed)

              return (
                <div
                  key={action.id}
                  className={`bg-white rounded-xl border p-4 transition-colors ${
                    overdue
                      ? 'border-red-300 bg-red-50/50'
                      : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Completion toggle */}
                    <button
                      onClick={() => !completed && markActionCompleted(action.id)}
                      disabled={completed || updatingId === action.id}
                      className={`mt-0.5 flex-shrink-0 transition-colors ${
                        completed
                          ? 'text-brand-teal cursor-default'
                          : 'text-gray-300 hover:text-brand-teal'
                      }`}
                      title={completed ? 'Completed' : 'Mark as completed'}
                    >
                      {updatingId === action.id ? (
                        <Loader2 className="w-5 h-5 animate-spin text-brand-orange" />
                      ) : (
                        <CheckCircle className="w-5 h-5" />
                      )}
                    </button>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${
                        completed ? 'text-gray-400 line-through' : 'text-brand-navy'
                      }`}>
                        {action.description}
                      </p>
                      <div className="flex flex-wrap items-center gap-3 mt-1.5">
                        {/* Status */}
                        <StatusBadge status={action.status} type="action" />

                        {/* Due date */}
                        {action.due_date && (
                          <span className={`flex items-center gap-1 text-xs ${
                            overdue ? 'text-red-600 font-medium' : 'text-gray-500'
                          }`}>
                            <Clock className="w-3 h-3" />
                            {overdue && 'Overdue: '}
                            {formatDate(action.due_date)}
                          </span>
                        )}

                        {/* Completed at */}
                        {action.completed_at && (
                          <span className="flex items-center gap-1 text-xs text-brand-teal">
                            <CheckCircle className="w-3 h-3" />
                            Done {formatDate(action.completed_at)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ── Section: Open Loops ───────────────────────────────── */}
      <SectionHeader
        title="Open Loops"
        count={counts.loops}
        icon={<RefreshCw className="w-5 h-5 text-amber-500" />}
        expanded={expandedSection.loops}
        onToggle={() => toggleSection('loops')}
      />
      {expandedSection.loops && (
        <div className="space-y-3">
          {filteredLoops.length === 0 ? (
            <EmptyState message="No open loops to show" />
          ) : (
            filteredLoops.map(loop => {
              const closed = loop.status === 'closed'
              const overdue = isOverdue(loop.due_date, closed)

              return (
                <div
                  key={loop.id}
                  className={`bg-white rounded-xl border p-4 transition-colors ${
                    overdue
                      ? 'border-red-300 bg-red-50/50'
                      : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Close toggle */}
                    <button
                      onClick={() => !closed && markLoopClosed(loop.id)}
                      disabled={closed || updatingId === loop.id}
                      className={`mt-0.5 flex-shrink-0 transition-colors ${
                        closed
                          ? 'text-brand-teal cursor-default'
                          : 'text-gray-300 hover:text-brand-teal'
                      }`}
                      title={closed ? 'Closed' : 'Mark as closed'}
                    >
                      {updatingId === loop.id ? (
                        <Loader2 className="w-5 h-5 animate-spin text-brand-orange" />
                      ) : (
                        <CheckCircle className="w-5 h-5" />
                      )}
                    </button>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${
                        closed ? 'text-gray-400 line-through' : 'text-brand-navy'
                      }`}>
                        {loop.title}
                      </p>
                      {loop.description && (
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                          {loop.description}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-3 mt-1.5">
                        <StatusBadge status={loop.status} type="loop" />
                        {priorityBadge(loop.priority)}

                        {loop.due_date && (
                          <span className={`flex items-center gap-1 text-xs ${
                            overdue ? 'text-red-600 font-medium' : 'text-gray-500'
                          }`}>
                            <Clock className="w-3 h-3" />
                            {overdue && 'Overdue: '}
                            {formatDate(loop.due_date)}
                          </span>
                        )}

                        {loop.closed_at && (
                          <span className="flex items-center gap-1 text-xs text-brand-teal">
                            <CheckCircle className="w-3 h-3" />
                            Closed {formatDate(loop.closed_at)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ── Section: Issues ───────────────────────────────────── */}
      <SectionHeader
        title="Issues"
        count={counts.issues}
        icon={<AlertCircle className="w-5 h-5 text-red-500" />}
        expanded={expandedSection.issues}
        onToggle={() => toggleSection('issues')}
      />
      {expandedSection.issues && (
        <div className="space-y-3">
          {filteredIssues.length === 0 ? (
            <EmptyState message="No issues to show" />
          ) : (
            filteredIssues.map(issue => {
              const resolved = issue.status === 'solved' || issue.status === 'wont_fix'
              const overdue = isOverdue(issue.due_date, resolved)

              return (
                <div
                  key={issue.id}
                  className={`bg-white rounded-xl border p-4 transition-colors ${
                    overdue
                      ? 'border-red-300 bg-red-50/50'
                      : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Status icon */}
                    <div className={`mt-0.5 flex-shrink-0 ${
                      resolved ? 'text-brand-teal' : 'text-red-400'
                    }`}>
                      {resolved ? (
                        <CheckCircle className="w-5 h-5" />
                      ) : (
                        <AlertCircle className="w-5 h-5" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${
                        resolved ? 'text-gray-400 line-through' : 'text-brand-navy'
                      }`}>
                        {issue.title}
                      </p>
                      {issue.stated_problem && (
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                          {issue.stated_problem}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-3 mt-1.5">
                        <StatusBadge status={issue.status} type="issue" />
                        {priorityBadge(issue.priority)}

                        {issue.due_date && (
                          <span className={`flex items-center gap-1 text-xs ${
                            overdue ? 'text-red-600 font-medium' : 'text-gray-500'
                          }`}>
                            <Clock className="w-3 h-3" />
                            {overdue && 'Overdue: '}
                            {formatDate(issue.due_date)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────

function SectionHeader({
  title,
  count,
  icon,
  expanded,
  onToggle,
}: {
  title: string
  count: number
  icon: React.ReactNode
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
    >
      <div className="flex items-center gap-3">
        {icon}
        <h3 className="text-sm font-semibold text-brand-navy">{title}</h3>
        <span className="inline-flex items-center justify-center w-6 h-6 text-xs font-bold text-brand-orange bg-brand-orange-100 rounded-full">
          {count}
        </span>
      </div>
      {expanded ? (
        <ChevronUp className="w-4 h-4 text-gray-400" />
      ) : (
        <ChevronDown className="w-4 h-4 text-gray-400" />
      )}
    </button>
  )
}

function StatusBadge({ status, type }: { status: string; type: 'action' | 'loop' | 'issue' }) {
  const configs: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    // Session action statuses
    'action:pending': {
      label: 'Pending',
      className: 'bg-amber-100 text-amber-700',
      icon: <Clock className="w-3 h-3" />,
    },
    'action:completed': {
      label: 'Completed',
      className: 'bg-brand-teal-100 text-brand-teal-700',
      icon: <CheckCircle className="w-3 h-3" />,
    },
    'action:missed': {
      label: 'Missed',
      className: 'bg-red-100 text-red-700',
      icon: <XCircle className="w-3 h-3" />,
    },
    'action:carried_over': {
      label: 'Carried Over',
      className: 'bg-blue-100 text-blue-700',
      icon: <RefreshCw className="w-3 h-3" />,
    },
    // Open loop statuses
    'loop:open': {
      label: 'Open',
      className: 'bg-amber-100 text-amber-700',
      icon: <CircleDot className="w-3 h-3" />,
    },
    'loop:in_progress': {
      label: 'In Progress',
      className: 'bg-blue-100 text-blue-700',
      icon: <Clock className="w-3 h-3" />,
    },
    'loop:closed': {
      label: 'Closed',
      className: 'bg-brand-teal-100 text-brand-teal-700',
      icon: <CheckCircle className="w-3 h-3" />,
    },
    // Issue statuses
    'issue:open': {
      label: 'Open',
      className: 'bg-red-100 text-red-700',
      icon: <AlertCircle className="w-3 h-3" />,
    },
    'issue:in_progress': {
      label: 'In Progress',
      className: 'bg-blue-100 text-blue-700',
      icon: <Clock className="w-3 h-3" />,
    },
    'issue:solved': {
      label: 'Solved',
      className: 'bg-brand-teal-100 text-brand-teal-700',
      icon: <CheckCircle className="w-3 h-3" />,
    },
    'issue:wont_fix': {
      label: "Won't Fix",
      className: 'bg-gray-100 text-gray-600',
      icon: <XCircle className="w-3 h-3" />,
    },
  }

  const key = `${type}:${status}`
  const config = configs[key]
  if (!config) return null

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${config.className}`}>
      {config.icon}
      {config.label}
    </span>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-8 bg-white rounded-xl border border-gray-200">
      <ListChecks className="w-10 h-10 text-gray-300 mx-auto mb-3" />
      <p className="text-sm text-gray-500">{message}</p>
    </div>
  )
}

export default ActionsTab
