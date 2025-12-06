'use client'

import React, { useState, useEffect } from 'react'
import { History, User, Calendar, Filter, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react'

interface AuditLogEntry {
  id: string
  forecast_id: string
  user_id: string
  action: 'create' | 'update' | 'delete' | 'sync_xero' | 'import_annual_plan'
  table_name: string
  record_id: string
  field_name?: string
  old_value?: any
  new_value?: any
  ip_address?: string
  user_agent?: string
  created_at: string
  user_email?: string // Joined from auth.users
}

interface AuditLogViewerProps {
  forecastId: string
  className?: string
}

export default function AuditLogViewer({ forecastId, className = '' }: AuditLogViewerProps) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set())

  // Filters
  const [filterAction, setFilterAction] = useState<string>('all')
  const [filterUser, setFilterUser] = useState<string>('all')
  const [filterDateRange, setFilterDateRange] = useState<'all' | 'today' | 'week' | 'month'>('all')

  useEffect(() => {
    fetchAuditLogs()
  }, [forecastId, filterAction, filterUser, filterDateRange])

  const fetchAuditLogs = async () => {
    setLoading(true)
    setError(null)

    try {
      // Build query params
      const params = new URLSearchParams({
        forecast_id: forecastId,
        ...(filterAction !== 'all' && { action: filterAction }),
        ...(filterUser !== 'all' && { user_id: filterUser }),
        ...(filterDateRange !== 'all' && { date_range: filterDateRange })
      })

      const response = await fetch(`/api/forecasts/audit-log?${params}`)

      if (!response.ok) {
        throw new Error('Failed to fetch audit logs')
      }

      const data = await response.json()
      setLogs(data.logs || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit logs')
    } finally {
      setLoading(false)
    }
  }

  const toggleLogExpansion = (logId: string) => {
    const newExpanded = new Set(expandedLogs)
    if (newExpanded.has(logId)) {
      newExpanded.delete(logId)
    } else {
      newExpanded.add(logId)
    }
    setExpandedLogs(newExpanded)
  }

  const getActionColor = (action: string): string => {
    switch (action) {
      case 'create': return 'text-green-700 bg-green-50'
      case 'update': return 'text-brand-orange-700 bg-brand-orange-50'
      case 'delete': return 'text-red-700 bg-red-50'
      case 'sync_xero': return 'text-brand-navy-700 bg-brand-navy-50'
      case 'import_annual_plan': return 'text-amber-700 bg-amber-50'
      default: return 'text-gray-700 bg-gray-50'
    }
  }

  const getActionLabel = (action: string): string => {
    switch (action) {
      case 'create': return 'Created'
      case 'update': return 'Updated'
      case 'delete': return 'Deleted'
      case 'sync_xero': return 'Synced from Xero'
      case 'import_annual_plan': return 'Imported from Annual Plan'
      default: return action
    }
  }

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const renderValueDiff = (log: AuditLogEntry) => {
    if (!log.old_value && !log.new_value) return null

    const isExpanded = expandedLogs.has(log.id)

    return (
      <div className="mt-2 text-xs">
        {log.action === 'update' && log.old_value && log.new_value && (
          <div className="space-y-1">
            <div className="flex items-start gap-2">
              <span className="text-red-600 font-medium">−</span>
              <div className="flex-1 bg-red-50 border border-red-200 rounded px-2 py-1">
                <pre className="text-red-700 overflow-x-auto">
                  {JSON.stringify(log.old_value, null, isExpanded ? 2 : 0)}
                </pre>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-600 font-medium">+</span>
              <div className="flex-1 bg-green-50 border border-green-200 rounded px-2 py-1">
                <pre className="text-green-700 overflow-x-auto">
                  {JSON.stringify(log.new_value, null, isExpanded ? 2 : 0)}
                </pre>
              </div>
            </div>
          </div>
        )}
        {log.action === 'create' && log.new_value && (
          <div className="bg-green-50 border border-green-200 rounded px-2 py-1">
            <pre className="text-green-700 overflow-x-auto">
              {JSON.stringify(log.new_value, null, isExpanded ? 2 : 0)}
            </pre>
          </div>
        )}
        {log.action === 'delete' && log.old_value && (
          <div className="bg-red-50 border border-red-200 rounded px-2 py-1">
            <pre className="text-red-700 overflow-x-auto">
              {JSON.stringify(log.old_value, null, isExpanded ? 2 : 0)}
            </pre>
          </div>
        )}
      </div>
    )
  }

  // Get unique users for filter
  const uniqueUsers = Array.from(new Set(logs.map(log => log.user_email).filter(Boolean)))

  return (
    <div className={`bg-white rounded-lg shadow-sm ${className}`}>
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <History className="w-6 h-6 text-brand-orange" />
            <div>
              <h2 className="text-xl font-bold text-gray-900">Change History</h2>
              <p className="text-sm text-gray-500 mt-1">
                Complete audit trail of all forecast modifications
              </p>
            </div>
          </div>
          <button
            onClick={fetchAuditLogs}
            className="px-4 py-2 text-sm font-medium text-brand-orange bg-brand-orange-50 rounded-lg hover:bg-brand-orange-100 transition-colors"
          >
            Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Filters:</span>
          </div>

          {/* Action Filter */}
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-brand-orange-500"
          >
            <option value="all">All Actions</option>
            <option value="create">Created</option>
            <option value="update">Updated</option>
            <option value="delete">Deleted</option>
            <option value="sync_xero">Xero Sync</option>
            <option value="import_annual_plan">Annual Plan Import</option>
          </select>

          {/* User Filter */}
          {uniqueUsers.length > 1 && (
            <select
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-brand-orange-500"
            >
              <option value="all">All Users</option>
              {uniqueUsers.map(email => (
                <option key={email} value={email}>{email}</option>
              ))}
            </select>
          )}

          {/* Date Range Filter */}
          <select
            value={filterDateRange}
            onChange={(e) => setFilterDateRange(e.target.value as any)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-brand-orange-500"
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">Past Week</option>
            <option value="month">Past Month</option>
          </select>
        </div>
      </div>

      <div className="p-6">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-orange"></div>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-900">Failed to load audit logs</p>
              <p className="text-xs text-red-700 mt-1">{error}</p>
            </div>
          </div>
        )}

        {!loading && !error && logs.length === 0 && (
          <div className="text-center py-12">
            <History className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No changes yet</h3>
            <p className="text-sm text-gray-500">
              Changes to this forecast will appear here
            </p>
          </div>
        )}

        {!loading && !error && logs.length > 0 && (
          <div className="space-y-3">
            {logs.map((log) => {
              const isExpanded = expandedLogs.has(log.id)
              const hasDetails = !!(log.old_value || log.new_value)

              return (
                <div
                  key={log.id}
                  className="border border-gray-200 rounded-lg hover:shadow-sm transition-shadow"
                >
                  <button
                    onClick={() => hasDetails && toggleLogExpansion(log.id)}
                    className="w-full p-4 text-left flex items-start gap-3 hover:bg-gray-50 transition-colors"
                    disabled={!hasDetails}
                  >
                    {hasDetails && (
                      <div className="mt-0.5">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-gray-500" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-500" />
                        )}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded ${getActionColor(log.action)}`}>
                          {getActionLabel(log.action)}
                        </span>
                        <span className="text-sm text-gray-600">
                          {log.table_name === 'financial_forecasts' && 'Forecast'}
                          {log.table_name === 'forecast_pl_lines' && 'P&L Line'}
                          {log.field_name && ` • ${log.field_name}`}
                        </span>
                      </div>

                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        <div className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {log.user_email || 'Unknown user'}
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(log.created_at)}
                        </div>
                      </div>

                      {isExpanded && renderValueDiff(log)}
                    </div>
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
