'use client'

import { useEffect, useState } from 'react'
import AdminLayout from '@/components/admin/AdminLayout'
import PageHeader from '@/components/ui/PageHeader'
import {
  Activity,
  RefreshCw,
  Search,
  Clock,
  User,
  Building2,
  CheckCircle,
  AlertCircle,
  Calendar,
  Eye,
  ChevronDown,
  ChevronUp,
  Loader2,
  LogIn,
  FileEdit,
  FileCheck,
  TrendingUp
} from 'lucide-react'

interface ClientActivity {
  id: string
  business_name: string
  status: string
  owner_email: string | null
  coach_name: string | null
  created_at: string
  invitation_sent: boolean
  last_activity: string | null
  last_login: string | null
  activity_count: number
  recent_activities: Array<{
    type: string
    description: string
    user_name: string
    timestamp: string
    page?: string
  }>
}

interface ActivitySummary {
  total_clients: number
  active_clients: number
  clients_active_today: number
  clients_active_this_week: number
  total_activity_count: number
}

interface ActivityData {
  success: boolean
  summary: ActivitySummary
  clients: ClientActivity[]
  timeRange: number
}

export default function ActivityPage() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [data, setData] = useState<ActivityData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [timeRange, setTimeRange] = useState('7')
  const [expandedClient, setExpandedClient] = useState<string | null>(null)

  useEffect(() => {
    loadActivity()
  }, [timeRange])

  async function loadActivity() {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/admin/activity?range=${timeRange}`)
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to load activity')
      }

      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  async function handleRefresh() {
    setRefreshing(true)
    await loadActivity()
    setRefreshing(false)
  }

  function formatDate(dateString: string | null) {
    if (!dateString) return 'Never'
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
  }

  function formatFullDate(dateString: string) {
    const date = new Date(dateString)
    return date.toLocaleString('en-AU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  function getActivityIcon(type: string) {
    switch (type) {
      case 'login':
        return <LogIn className="w-4 h-4 text-blue-500" />
      case 'create':
        return <FileEdit className="w-4 h-4 text-green-500" />
      case 'update':
        return <FileEdit className="w-4 h-4 text-amber-500" />
      case 'delete':
        return <AlertCircle className="w-4 h-4 text-red-500" />
      case 'profile_update':
        return <User className="w-4 h-4 text-purple-500" />
      case 'weekly_review':
        return <FileCheck className="w-4 h-4 text-teal-500" />
      default:
        return <Activity className="w-4 h-4 text-gray-500" />
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-700'
      case 'pending':
        return 'bg-amber-100 text-amber-700'
      case 'inactive':
        return 'bg-gray-100 text-gray-600'
      default:
        return 'bg-gray-100 text-gray-600'
    }
  }

  function getActivityLevel(lastActivity: string | null, activityCount: number): { label: string; color: string } {
    if (!lastActivity) {
      return { label: 'No Activity', color: 'bg-gray-100 text-gray-500' }
    }
    const daysSinceActivity = Math.floor((Date.now() - new Date(lastActivity).getTime()) / 86400000)

    if (daysSinceActivity === 0) {
      return { label: 'Active Today', color: 'bg-green-100 text-green-700' }
    }
    if (daysSinceActivity <= 3) {
      return { label: 'Recent', color: 'bg-blue-100 text-blue-700' }
    }
    if (daysSinceActivity <= 7) {
      return { label: 'This Week', color: 'bg-amber-100 text-amber-700' }
    }
    return { label: 'Inactive', color: 'bg-red-100 text-red-700' }
  }

  // Filter clients
  const filteredClients = data?.clients.filter(client =>
    searchTerm === '' ||
    client.business_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.owner_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.coach_name?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || []

  if (loading && !data) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-brand-orange-500 animate-spin" />
            <p className="text-gray-500 text-sm">Loading activity data...</p>
          </div>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        {/* Page Header */}
        <PageHeader
          variant="banner"
          title="Client Activity Monitor"
          subtitle="Track real-time activity across all client portals"
          icon={Activity}
          actions={
            <div className="flex items-center gap-3">
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-transparent"
              >
                <option value="1">Last 24 hours</option>
                <option value="7">Last 7 days</option>
                <option value="14">Last 14 days</option>
                <option value="30">Last 30 days</option>
              </select>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-orange text-white font-medium rounded-lg hover:bg-brand-orange-600 shadow-sm transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          }
        />

        {/* Summary Cards */}
        {data && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-slate-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-brand-navy">{data.summary.total_clients}</p>
                  <p className="text-sm text-gray-500">Total Clients</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-brand-navy">{data.summary.clients_active_today}</p>
                  <p className="text-sm text-gray-500">Active Today</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-brand-navy">{data.summary.clients_active_this_week}</p>
                  <p className="text-sm text-gray-500">Active This Week</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Activity className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-brand-navy">{data.summary.total_activity_count}</p>
                  <p className="text-sm text-gray-500">Total Changes</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by business name, email, or coach..."
              className="w-full pl-12 pr-4 py-3 bg-gray-50 border-0 rounded-xl text-sm placeholder-slate-400 focus:ring-2 focus:ring-brand-orange focus:bg-white transition-all"
            />
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* Activity Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Client</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Coach</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Activity Level</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Last Activity</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Last Login</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredClients.map((client) => {
                  const activityLevel = getActivityLevel(client.last_activity, client.activity_count)
                  const isExpanded = expandedClient === client.id

                  return (
                    <>
                      <tr key={client.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                              <Building2 className="w-5 h-5 text-slate-400" />
                            </div>
                            <div>
                              <p className="font-medium text-brand-navy">{client.business_name}</p>
                              <p className="text-xs text-gray-500">{client.owner_email || 'No email'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(client.status)}`}>
                            {client.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-600">{client.coach_name || 'Unassigned'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${activityLevel.color}`}>
                            {activityLevel.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Clock className="w-4 h-4 text-gray-400" />
                            {formatDate(client.last_activity)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <LogIn className="w-4 h-4 text-gray-400" />
                            {formatDate(client.last_login)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => setExpandedClient(isExpanded ? null : client.id)}
                            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-5 h-5 text-gray-400" />
                            ) : (
                              <ChevronDown className="w-5 h-5 text-gray-400" />
                            )}
                          </button>
                        </td>
                      </tr>

                      {/* Expanded Activity Details */}
                      {isExpanded && (
                        <tr key={`${client.id}-details`}>
                          <td colSpan={7} className="px-4 py-4 bg-slate-50">
                            <div className="max-w-4xl">
                              <h4 className="font-medium text-brand-navy mb-3">Recent Activity</h4>
                              {client.recent_activities.length === 0 ? (
                                <p className="text-sm text-gray-500 italic">No recent activity recorded</p>
                              ) : (
                                <div className="space-y-2">
                                  {client.recent_activities.map((activity, idx) => (
                                    <div
                                      key={idx}
                                      className="flex items-center gap-3 p-2 bg-white rounded-lg border border-slate-200"
                                    >
                                      {getActivityIcon(activity.type)}
                                      <div className="flex-1">
                                        <p className="text-sm text-gray-700">{activity.description}</p>
                                        <p className="text-xs text-gray-500">
                                          by {activity.user_name}
                                          {activity.page && <span className="text-gray-400"> on {activity.page}</span>}
                                        </p>
                                      </div>
                                      <span className="text-xs text-gray-500">{formatFullDate(activity.timestamp)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              <div className="mt-4 flex gap-3">
                                <a
                                  href={`/coach/clients/${client.id}`}
                                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand-orange text-white text-sm font-medium rounded-lg hover:bg-brand-orange-600 transition-colors"
                                >
                                  <Eye className="w-4 h-4" />
                                  View Client
                                </a>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}

                {filteredClients.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Building2 className="w-10 h-10 text-gray-300" />
                        <p className="text-gray-500">No clients found</p>
                        {searchTerm && (
                          <button
                            onClick={() => setSearchTerm('')}
                            className="text-sm text-brand-orange hover:underline"
                          >
                            Clear search
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
