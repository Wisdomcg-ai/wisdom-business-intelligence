'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  ChevronUp,
  ChevronDown,
  Eye,
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  Filter,
  Search,
  Users,
  Calendar,
  BarChart3,
  Target,
  AlertCircle,
  ArrowUpRight
} from 'lucide-react'

export interface ClientMetrics {
  id: string
  businessName: string
  status: 'active' | 'at-risk' | 'pending' | 'inactive'
  lastLogin: string | null
  lastWeeklyReview: string | null
  lastDashboardUpdate: string | null
  lastAssessmentScore: number | null
  lastAssessmentStatus: string | null
  roadmapLevel: string
  roadmapRevenue: number | null
  openLoopsCount: number
  openIssuesCount: number
  industry?: string
}

interface ClientOverviewTableProps {
  clients: ClientMetrics[]
  isLoading?: boolean
}

type SortField = 'businessName' | 'status' | 'lastLogin' | 'lastWeeklyReview' | 'lastDashboardUpdate' | 'lastAssessmentScore' | 'roadmapLevel' | 'daysSinceActivity'
type SortDirection = 'asc' | 'desc'
type StatusFilter = 'all' | 'active' | 'at-risk' | 'pending' | 'inactive' | 'needs-attention'

const ROADMAP_ORDER = ['Foundation', 'Traction', 'Growth', 'Scale', 'Mastery']

export function ClientOverviewTable({ clients, isLoading = false }: ClientOverviewTableProps) {
  const [sortField, setSortField] = useState<SortField>('daysSinceActivity')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Calculate days since activity for each client
  const clientsWithActivity = useMemo(() => {
    return clients.map(client => {
      const dates = [
        client.lastLogin,
        client.lastWeeklyReview,
        client.lastDashboardUpdate
      ].filter(Boolean).map(d => new Date(d!).getTime())

      const mostRecent = dates.length > 0 ? Math.max(...dates) : null
      const daysSinceActivity = mostRecent
        ? Math.floor((Date.now() - mostRecent) / (1000 * 60 * 60 * 24))
        : 999

      const needsAttention =
        client.status === 'at-risk' ||
        daysSinceActivity > 14 ||
        (client.lastAssessmentScore !== null && client.lastAssessmentScore < 50)

      return { ...client, daysSinceActivity, needsAttention }
    })
  }, [clients])

  // Filter and sort clients
  const filteredAndSortedClients = useMemo(() => {
    let result = [...clientsWithActivity]

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(c =>
        c.businessName.toLowerCase().includes(query) ||
        c.industry?.toLowerCase().includes(query)
      )
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      if (statusFilter === 'needs-attention') {
        result = result.filter(c => c.needsAttention)
      } else {
        result = result.filter(c => c.status === statusFilter)
      }
    }

    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0

      switch (sortField) {
        case 'businessName':
          comparison = a.businessName.localeCompare(b.businessName)
          break
        case 'status':
          const statusOrder = { 'at-risk': 0, 'pending': 1, 'active': 2, 'inactive': 3 }
          comparison = statusOrder[a.status] - statusOrder[b.status]
          break
        case 'lastLogin':
          comparison = (a.lastLogin || '1970-01-01').localeCompare(b.lastLogin || '1970-01-01')
          break
        case 'lastWeeklyReview':
          comparison = (a.lastWeeklyReview || '1970-01-01').localeCompare(b.lastWeeklyReview || '1970-01-01')
          break
        case 'lastDashboardUpdate':
          comparison = (a.lastDashboardUpdate || '1970-01-01').localeCompare(b.lastDashboardUpdate || '1970-01-01')
          break
        case 'lastAssessmentScore':
          comparison = (a.lastAssessmentScore ?? -1) - (b.lastAssessmentScore ?? -1)
          break
        case 'roadmapLevel':
          comparison = ROADMAP_ORDER.indexOf(a.roadmapLevel) - ROADMAP_ORDER.indexOf(b.roadmapLevel)
          break
        case 'daysSinceActivity':
          comparison = a.daysSinceActivity - b.daysSinceActivity
          break
      }

      return sortDirection === 'asc' ? comparison : -comparison
    })

    return result
  }, [clientsWithActivity, sortField, sortDirection, statusFilter, searchQuery])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronUp className="w-4 h-4 text-gray-300" />
    return sortDirection === 'asc'
      ? <ChevronUp className="w-4 h-4 text-indigo-600" />
      : <ChevronDown className="w-4 h-4 text-indigo-600" />
  }

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays}d ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const getDateStatus = (dateString: string | null, warningDays: number = 7, criticalDays: number = 14): 'good' | 'warning' | 'critical' => {
    if (!dateString) return 'critical'
    const daysSince = Math.floor((Date.now() - new Date(dateString).getTime()) / (1000 * 60 * 60 * 24))
    if (daysSince <= warningDays) return 'good'
    if (daysSince <= criticalDays) return 'warning'
    return 'critical'
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700"><CheckCircle className="w-3 h-3" />Active</span>
      case 'at-risk':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700"><AlertTriangle className="w-3 h-3" />At Risk</span>
      case 'pending':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700"><Clock className="w-3 h-3" />Pending</span>
      default:
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700"><Minus className="w-3 h-3" />Inactive</span>
    }
  }

  const getHealthStatusBadge = (status: string | null, score: number | null) => {
    if (!status || score === null) {
      return <span className="text-gray-400 text-sm">-</span>
    }

    const colors: Record<string, string> = {
      'THRIVING': 'bg-green-100 text-green-700',
      'STRONG': 'bg-green-50 text-green-600',
      'STABLE': 'bg-yellow-100 text-yellow-700',
      'BUILDING': 'bg-orange-100 text-orange-700',
      'STRUGGLING': 'bg-red-100 text-red-700',
      'URGENT': 'bg-red-200 text-red-800'
    }

    return (
      <div className="flex flex-col items-center gap-1">
        <span className="text-lg font-bold text-gray-900">{score}%</span>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-600'}`}>
          {status}
        </span>
      </div>
    )
  }

  const getRoadmapBadge = (level: string, revenue: number | null) => {
    const colors: Record<string, string> = {
      'Foundation': 'bg-slate-100 text-slate-700 border-slate-200',
      'Traction': 'bg-blue-100 text-blue-700 border-blue-200',
      'Growth': 'bg-purple-100 text-purple-700 border-purple-200',
      'Scale': 'bg-indigo-100 text-indigo-700 border-indigo-200',
      'Mastery': 'bg-amber-100 text-amber-700 border-amber-200'
    }

    const formatRevenue = (rev: number | null) => {
      if (!rev) return ''
      if (rev >= 1000000) return `$${(rev / 1000000).toFixed(1)}M`
      if (rev >= 1000) return `$${(rev / 1000).toFixed(0)}K`
      return `$${rev}`
    }

    return (
      <div className="flex flex-col items-center gap-1">
        <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${colors[level] || 'bg-gray-100 text-gray-600'}`}>
          {level}
        </span>
        {revenue && (
          <span className="text-xs text-gray-500">{formatRevenue(revenue)}</span>
        )}
      </div>
    )
  }

  const getActivityIndicator = (daysSince: number) => {
    if (daysSince <= 3) {
      return <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /><span className="text-green-700 text-sm font-medium">{daysSince === 0 ? 'Today' : `${daysSince}d`}</span></div>
    }
    if (daysSince <= 7) {
      return <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green-400" /><span className="text-gray-600 text-sm">{daysSince}d</span></div>
    }
    if (daysSince <= 14) {
      return <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-400" /><span className="text-amber-600 text-sm font-medium">{daysSince}d</span></div>
    }
    return <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-400" /><span className="text-red-600 text-sm font-medium">{daysSince === 999 ? 'Never' : `${daysSince}d`}</span></div>
  }

  // Calculate summary stats
  const stats = useMemo(() => {
    const total = clients.length
    const active = clients.filter(c => c.status === 'active').length
    const atRisk = clients.filter(c => c.status === 'at-risk').length
    const needsAttention = clientsWithActivity.filter(c => c.needsAttention).length
    return { total, active, atRisk, needsAttention }
  }, [clients, clientsWithActivity])

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto" />
          <p className="mt-4 text-gray-500">Loading client data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Header with Stats */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-600" />
              Client Overview
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Monitor all your clients in one place
            </p>
          </div>

          {/* Quick Stats */}
          <div className="flex items-center gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Total</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{stats.active}</div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Active</div>
            </div>
            {stats.needsAttention > 0 && (
              <div className="text-center">
                <div className="text-2xl font-bold text-amber-600">{stats.needsAttention}</div>
                <div className="text-xs text-gray-500 uppercase tracking-wide">Need Attention</div>
              </div>
            )}
            {stats.atRisk > 0 && (
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{stats.atRisk}</div>
                <div className="text-xs text-gray-500 uppercase tracking-wide">At Risk</div>
              </div>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mt-4">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search clients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="all">All Clients</option>
              <option value="needs-attention">Needs Attention</option>
              <option value="active">Active</option>
              <option value="at-risk">At Risk</option>
              <option value="pending">Pending</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1200px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th
                className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => handleSort('businessName')}
              >
                <div className="flex items-center gap-2">
                  Client
                  <SortIcon field="businessName" />
                </div>
              </th>
              <th
                className="px-4 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => handleSort('status')}
              >
                <div className="flex items-center justify-center gap-2">
                  Status
                  <SortIcon field="status" />
                </div>
              </th>
              <th
                className="px-4 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => handleSort('daysSinceActivity')}
              >
                <div className="flex items-center justify-center gap-2">
                  Last Active
                  <SortIcon field="daysSinceActivity" />
                </div>
              </th>
              <th
                className="px-4 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => handleSort('lastLogin')}
              >
                <div className="flex items-center justify-center gap-2">
                  Last Login
                  <SortIcon field="lastLogin" />
                </div>
              </th>
              <th
                className="px-4 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => handleSort('lastWeeklyReview')}
              >
                <div className="flex items-center justify-center gap-2">
                  Weekly Review
                  <SortIcon field="lastWeeklyReview" />
                </div>
              </th>
              <th
                className="px-4 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => handleSort('lastDashboardUpdate')}
              >
                <div className="flex items-center justify-center gap-2">
                  Dashboard
                  <SortIcon field="lastDashboardUpdate" />
                </div>
              </th>
              <th
                className="px-4 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => handleSort('lastAssessmentScore')}
              >
                <div className="flex items-center justify-center gap-2">
                  Assessment
                  <SortIcon field="lastAssessmentScore" />
                </div>
              </th>
              <th
                className="px-4 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => handleSort('roadmapLevel')}
              >
                <div className="flex items-center justify-center gap-2">
                  Roadmap
                  <SortIcon field="roadmapLevel" />
                </div>
              </th>
              <th className="px-4 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Open Items
              </th>
              <th className="px-4 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredAndSortedClients.map((client) => (
              <tr
                key={client.id}
                className={`hover:bg-gray-50 transition-colors ${client.needsAttention ? 'bg-amber-50/50' : ''}`}
              >
                {/* Client Name */}
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    {client.needsAttention && (
                      <div className="flex-shrink-0">
                        <AlertCircle className="w-4 h-4 text-amber-500" />
                      </div>
                    )}
                    <div>
                      <Link
                        href={`/coach/clients/${client.id}/view/dashboard`}
                        className="font-medium text-gray-900 hover:text-indigo-600 transition-colors"
                      >
                        {client.businessName}
                      </Link>
                      {client.industry && (
                        <p className="text-xs text-gray-500 mt-0.5">{client.industry}</p>
                      )}
                    </div>
                  </div>
                </td>

                {/* Status */}
                <td className="px-4 py-4 text-center">
                  {getStatusBadge(client.status)}
                </td>

                {/* Last Active */}
                <td className="px-4 py-4 text-center">
                  {getActivityIndicator(client.daysSinceActivity)}
                </td>

                {/* Last Login */}
                <td className="px-4 py-4 text-center">
                  <span className={`text-sm ${
                    getDateStatus(client.lastLogin, 3, 7) === 'good' ? 'text-gray-600' :
                    getDateStatus(client.lastLogin, 3, 7) === 'warning' ? 'text-amber-600' : 'text-red-600'
                  }`}>
                    {formatDate(client.lastLogin)}
                  </span>
                </td>

                {/* Weekly Review */}
                <td className="px-4 py-4 text-center">
                  <span className={`text-sm ${
                    getDateStatus(client.lastWeeklyReview) === 'good' ? 'text-gray-600' :
                    getDateStatus(client.lastWeeklyReview) === 'warning' ? 'text-amber-600' : 'text-red-600'
                  }`}>
                    {formatDate(client.lastWeeklyReview)}
                  </span>
                </td>

                {/* Dashboard Update */}
                <td className="px-4 py-4 text-center">
                  <span className={`text-sm ${
                    getDateStatus(client.lastDashboardUpdate) === 'good' ? 'text-gray-600' :
                    getDateStatus(client.lastDashboardUpdate) === 'warning' ? 'text-amber-600' : 'text-red-600'
                  }`}>
                    {formatDate(client.lastDashboardUpdate)}
                  </span>
                </td>

                {/* Assessment */}
                <td className="px-4 py-4 text-center">
                  {getHealthStatusBadge(client.lastAssessmentStatus, client.lastAssessmentScore)}
                </td>

                {/* Roadmap Level */}
                <td className="px-4 py-4 text-center">
                  {getRoadmapBadge(client.roadmapLevel, client.roadmapRevenue)}
                </td>

                {/* Open Items */}
                <td className="px-4 py-4 text-center">
                  <div className="flex items-center justify-center gap-3">
                    {(client.openLoopsCount > 0 || client.openIssuesCount > 0) ? (
                      <>
                        {client.openLoopsCount > 0 && (
                          <span className="inline-flex items-center gap-1 text-sm text-gray-600">
                            <div className="w-4 h-4 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium text-blue-700">
                              {client.openLoopsCount}
                            </div>
                            <span className="text-xs text-gray-500">loops</span>
                          </span>
                        )}
                        {client.openIssuesCount > 0 && (
                          <span className="inline-flex items-center gap-1 text-sm text-gray-600">
                            <div className="w-4 h-4 rounded-full bg-orange-100 flex items-center justify-center text-xs font-medium text-orange-700">
                              {client.openIssuesCount}
                            </div>
                            <span className="text-xs text-gray-500">issues</span>
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-gray-400 text-sm">-</span>
                    )}
                  </div>
                </td>

                {/* Actions */}
                <td className="px-4 py-4 text-center">
                  <Link
                    href={`/coach/clients/${client.id}/view/dashboard`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                    View
                    <ArrowUpRight className="w-3 h-3" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Empty State */}
      {filteredAndSortedClients.length === 0 && (
        <div className="p-12 text-center">
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No clients found</h3>
          <p className="text-gray-500">
            {searchQuery || statusFilter !== 'all'
              ? 'Try adjusting your search or filter criteria'
              : 'Add clients to get started'}
          </p>
        </div>
      )}

      {/* Footer with Legend */}
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              Active (0-7 days)
            </span>
            <span className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-amber-400" />
              Warning (8-14 days)
            </span>
            <span className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-red-400" />
              Inactive (14+ days)
            </span>
          </div>
          <span>
            Showing {filteredAndSortedClients.length} of {clients.length} clients
          </span>
        </div>
      </div>
    </div>
  )
}

export default ClientOverviewTable
