'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  History,
  User,
  Clock,
  FileText,
  ChevronDown,
  ChevronUp,
  Filter,
  RefreshCw,
  Loader2
} from 'lucide-react'

interface AuditLogEntry {
  id: string
  user_id: string
  user_name: string
  user_email: string
  table_name: string
  record_id: string
  action: 'create' | 'update' | 'delete'
  field_name: string | null
  old_value: string | null
  new_value: string | null
  changes: string | null
  description: string
  page_path: string | null
  created_at: string
}

interface ClientActivityLogProps {
  businessId: string
  limit?: number
  showFilters?: boolean
}

const TABLE_LABELS: Record<string, string> = {
  businesses: 'Business Profile',
  business_profiles: 'Business Dashboard',
  goals: 'Goal',
  rocks: 'Rock',
  kpis: 'KPI',
  issues_list: 'Issue',
  ideas: 'Idea',
  open_loops: 'Open Loop',
  stop_doing_items: 'Stop Doing',
  weekly_reviews: 'Weekly Review',
  quarterly_review_sessions: 'Quarterly Review',
  swot_analyses: 'SWOT Analysis',
  financial_forecasts: 'Financial Forecast',
  core_values: 'Core Values',
  vision_targets: 'Vision Targets',
  strategic_initiatives: 'Initiative',
  assessments: 'Assessment',
  assessment_responses: 'Assessment Response',
  action_items: 'Action Item'
}

const ACTION_COLORS = {
  create: 'bg-green-100 text-green-700',
  update: 'bg-blue-100 text-blue-700',
  delete: 'bg-red-100 text-red-700'
}

export function ClientActivityLog({
  businessId,
  limit = 20,
  showFilters = false
}: ClientActivityLogProps) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [tableFilter, setTableFilter] = useState<string>('all')
  const [hasMore, setHasMore] = useState(false)
  const [offset, setOffset] = useState(0)

  const loadLogs = useCallback(async (reset = false) => {
    try {
      setLoading(true)
      setError(null)

      const currentOffset = reset ? 0 : offset
      const params = new URLSearchParams({
        business_id: businessId,
        limit: String(limit),
        offset: String(currentOffset)
      })

      if (tableFilter !== 'all') {
        params.set('table_name', tableFilter)
      }

      const response = await fetch(`/api/activity-log?${params}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load activity log')
      }

      if (reset) {
        setLogs(data.data || [])
        setOffset(0)
      } else {
        setLogs(prev => [...prev, ...(data.data || [])])
      }
      setHasMore(data.hasMore)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load activity log')
    } finally {
      setLoading(false)
    }
  }, [businessId, limit, offset, tableFilter])

  useEffect(() => {
    loadLogs(true)
  }, [businessId, tableFilter])

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays}d ago`

    return date.toLocaleDateString('en-AU', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatFullDate = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleString('en-AU', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  const parseChanges = (changesStr: string | null): Record<string, { old: unknown; new: unknown }> | null => {
    if (!changesStr) return null
    try {
      return JSON.parse(changesStr)
    } catch {
      return null
    }
  }

  const getPageLabel = (pagePath: string | null): string => {
    if (!pagePath) return 'Unknown page'

    // Extract the meaningful part of the path
    const parts = pagePath.split('/').filter(Boolean)

    // Map common paths to readable labels
    const pathMap: Record<string, string> = {
      'dashboard': 'Command Centre',
      'assessment': 'Assessment',
      'business-profile': 'Business Profile',
      'goals': 'Goals',
      'reviews': 'Weekly Reviews',
      'quarterly-review': 'Quarterly Review',
      'finances': 'Financial Forecast',
      'one-page-plan': 'One Page Plan',
      'stop-doing': 'Stop Doing List',
      'business-roadmap': 'Business Roadmap',
      'business-dashboard': 'Business Dashboard',
      'settings': 'Settings'
    }

    for (const [key, label] of Object.entries(pathMap)) {
      if (pagePath.includes(key)) return label
    }

    return parts[parts.length - 1] || 'Dashboard'
  }

  // Get unique tables for filter
  const uniqueTables = Array.from(new Set(logs.map(l => l.table_name)))

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-brand-navy p-2 rounded-lg">
            <History className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Activity Log</h3>
            <p className="text-sm text-gray-500">Track all changes made to client data</p>
          </div>
        </div>
        <button
          onClick={() => loadLogs(true)}
          disabled={loading}
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={tableFilter}
              onChange={(e) => setTableFilter(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-orange"
            >
              <option value="all">All Tables</option>
              {uniqueTables.map(table => (
                <option key={table} value={table}>
                  {TABLE_LABELS[table] || table}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Activity List */}
      <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
        {loading && logs.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-brand-orange mx-auto mb-3" />
            <p className="text-gray-500">Loading activity...</p>
          </div>
        ) : error ? (
          <div className="px-5 py-8 text-center">
            <p className="text-red-500">{error}</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <History className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No activity recorded yet</p>
            <p className="text-sm text-gray-400 mt-1">Changes will appear here as they happen</p>
          </div>
        ) : (
          logs.map((log) => {
            const isExpanded = expandedId === log.id
            const changes = parseChanges(log.changes)

            return (
              <div key={log.id} className="px-5 py-3 hover:bg-gray-50 transition-colors">
                <div
                  className="flex items-start gap-3 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : log.id)}
                >
                  {/* Icon */}
                  <div className="bg-gray-100 p-2 rounded-lg flex-shrink-0">
                    <FileText className="w-4 h-4 text-gray-600" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${ACTION_COLORS[log.action]}`}>
                            {log.action}
                          </span>
                          <span className="text-sm font-medium text-gray-900">
                            {TABLE_LABELS[log.table_name] || log.table_name}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          {log.description}
                        </p>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {log.user_name}
                          </span>
                          {log.page_path && (
                            <span className="flex items-center gap-1">
                              <FileText className="w-3 h-3" />
                              {getPageLabel(log.page_path)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-gray-400 whitespace-nowrap flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatTime(log.created_at)}
                        </span>
                        {changes && (
                          isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-gray-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                          )
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && changes && (
                  <div className="mt-3 ml-11 bg-gray-50 rounded-lg p-3 text-sm">
                    <p className="text-xs text-gray-500 mb-2">{formatFullDate(log.created_at)}</p>
                    <div className="space-y-2">
                      {Object.entries(changes).map(([field, { old: oldVal, new: newVal }]) => (
                        <div key={field} className="flex items-start gap-2">
                          <span className="font-medium text-gray-700 min-w-[100px]">{field}:</span>
                          <div className="flex-1">
                            {oldVal !== null && oldVal !== undefined && (
                              <span className="line-through text-red-600 mr-2">
                                {typeof oldVal === 'object' ? JSON.stringify(oldVal) : String(oldVal)}
                              </span>
                            )}
                            <span className="text-green-600">
                              {typeof newVal === 'object' ? JSON.stringify(newVal) : String(newVal)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Load More */}
      {hasMore && !loading && (
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
          <button
            onClick={() => {
              setOffset(prev => prev + limit)
              loadLogs(false)
            }}
            className="w-full text-sm text-brand-orange hover:text-brand-orange-700 font-medium"
          >
            Load more activity
          </button>
        </div>
      )}
    </div>
  )
}

export default ClientActivityLog
