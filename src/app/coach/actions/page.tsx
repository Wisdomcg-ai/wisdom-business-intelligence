'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import PageHeader from '@/components/ui/PageHeader'
import {
  ListChecks,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Building2,
  ChevronRight,
  Search,
  Clock,
  Play,
  Pause,
  Target,
  MessageCircle,
  Wrench,
  CheckCircle2,
  X
} from 'lucide-react'

interface PendingItem {
  id: string
  type: 'loop' | 'issue'
  title: string
  description?: string
  status: string
  priority?: number
  clientId: string
  clientName: string
  ownerId: string
  createdAt: string
  updatedAt: string
  rootCause?: string
}

interface Client {
  id: string
  businessName: string
  ownerId: string | null
}

type FilterType = 'all' | 'loop' | 'issue'

// Status configs for loops
const LOOP_STATUS_CONFIG = {
  'in-progress': { label: 'In Progress', color: 'bg-brand-teal-100 text-brand-teal-700 border-brand-teal-200', icon: Play },
  'stuck': { label: 'Stuck', color: 'bg-red-100 text-red-700 border-red-200', icon: AlertTriangle },
  'on-hold': { label: 'On Hold', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: Pause }
}

// Status configs for issues
const ISSUE_STATUS_CONFIG = {
  'new': { label: 'New', color: 'bg-slate-100 text-gray-700 border-slate-200', icon: AlertCircle },
  'identified': { label: 'Identified', color: 'bg-brand-orange-100 text-brand-orange-700 border-brand-orange-200', icon: Target },
  'in-discussion': { label: 'In Discussion', color: 'bg-brand-navy-100 text-brand-navy-700 border-brand-navy-200', icon: MessageCircle },
  'solving': { label: 'Solving', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: Wrench },
  'solved': { label: 'Solved', color: 'bg-brand-teal-100 text-brand-teal-700 border-brand-teal-200', icon: CheckCircle2 }
}

// Skeleton loader
function CardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 bg-gray-200 rounded-lg flex-shrink-0"></div>
        <div className="flex-1 space-y-3">
          <div className="h-5 bg-gray-200 rounded w-3/4"></div>
          <div className="h-4 bg-gray-100 rounded w-1/2"></div>
          <div className="flex gap-2">
            <div className="h-6 bg-gray-100 rounded-full w-20"></div>
            <div className="h-6 bg-gray-100 rounded-full w-24"></div>
          </div>
        </div>
        <div className="h-5 w-5 bg-gray-100 rounded"></div>
      </div>
    </div>
  )
}

// Days badge for loops
function DaysOpenBadge({ createdAt }: { createdAt: string }) {
  const days = Math.floor((new Date().getTime() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24))

  let colorClass = 'bg-gray-100 text-gray-600'
  let urgencyIcon = null

  if (days >= 30) {
    colorClass = 'bg-red-100 text-red-700'
    urgencyIcon = <AlertTriangle className="w-3 h-3" />
  } else if (days >= 14) {
    colorClass = 'bg-amber-100 text-amber-700'
  } else if (days >= 7) {
    colorClass = 'bg-brand-orange-100 text-brand-orange-700'
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${colorClass}`}>
      <Clock className="w-3 h-3" />
      {days}d
      {urgencyIcon}
    </span>
  )
}

// Priority badge
function PriorityBadge({ priority }: { priority: number }) {
  const colors = {
    1: 'bg-red-100 text-red-700 ring-1 ring-red-200',
    2: 'bg-brand-orange-100 text-brand-orange-700',
    3: 'bg-yellow-100 text-yellow-700'
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded-full ${colors[priority as keyof typeof colors]}`}>
      P{priority}
      {priority === 1 && <AlertTriangle className="w-3 h-3" />}
    </span>
  )
}

// Action card component
function ActionCard({ item }: { item: PendingItem }) {
  const isLoop = item.type === 'loop'

  // Get the right status config
  const statusConfig = isLoop
    ? LOOP_STATUS_CONFIG[item.status as keyof typeof LOOP_STATUS_CONFIG]
    : ISSUE_STATUS_CONFIG[item.status as keyof typeof ISSUE_STATUS_CONFIG]

  const StatusIcon = statusConfig?.icon || AlertCircle

  // Determine if item is urgent
  const days = Math.floor((new Date().getTime() - new Date(item.createdAt).getTime()) / (1000 * 60 * 60 * 24))
  const isUrgent = days >= 30 || item.status === 'stuck' || (item.priority && item.priority <= 2)

  return (
    <Link
      href={`/coach/clients/${item.clientId}?tab=overview`}
      className={`
        block bg-white rounded-xl border-l-4 border border-gray-200
        ${isLoop
          ? (item.status === 'stuck' ? 'border-l-red-500' : item.status === 'on-hold' ? 'border-l-amber-500' : 'border-l-brand-teal')
          : (item.priority && item.priority <= 2 ? 'border-l-red-500' : 'border-l-brand-orange')
        }
        ${isUrgent ? 'ring-1 ring-red-100' : ''}
        transition-all duration-200 hover:shadow-md
      `}
    >
      <div className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row items-start gap-4">
          {/* Type Icon */}
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
            isLoop ? 'bg-amber-100' : 'bg-brand-orange-100'
          }`}>
            {isLoop ? (
              <RefreshCw className="w-5 h-5 text-amber-600" />
            ) : (
              <AlertCircle className="w-5 h-5 text-brand-orange" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 w-full sm:w-auto">
            {/* Title row */}
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h3 className="font-semibold text-gray-900 truncate">{item.title}</h3>
              {item.priority && item.priority <= 3 && (
                <PriorityBadge priority={item.priority} />
              )}
            </div>

            {/* Description if exists */}
            {item.description && (
              <p className="text-sm text-gray-500 truncate mb-2">{item.description}</p>
            )}

            {/* Root cause highlight for issues */}
            {item.rootCause && (
              <div className="flex items-center gap-1 text-xs text-brand-orange mb-2">
                <Target className="w-3 h-3" />
                <span className="truncate">Root: {item.rootCause}</span>
              </div>
            )}

            {/* Meta badges */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Type badge */}
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${
                isLoop ? 'bg-amber-100 text-amber-700' : 'bg-brand-orange-100 text-brand-orange-700'
              }`}>
                {isLoop ? 'Open Loop' : 'Issue'}
              </span>

              {/* Status badge */}
              {statusConfig && (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border ${statusConfig.color}`}>
                  <StatusIcon className="w-3 h-3" />
                  {statusConfig.label}
                </span>
              )}

              {/* Days open for loops */}
              {isLoop && <DaysOpenBadge createdAt={item.createdAt} />}
            </div>
          </div>

          {/* Client & Arrow */}
          <div className="flex items-center gap-3 flex-shrink-0 w-full sm:w-auto justify-between sm:justify-start">
            <div className="text-left sm:text-right">
              <div className="flex items-center gap-1 text-sm font-medium text-gray-900">
                <Building2 className="w-4 h-4 text-gray-400" />
                <span className="max-w-[120px] sm:max-w-[150px] truncate">{item.clientName}</span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{formatDate(item.updatedAt)}</p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </div>
        </div>
      </div>
    </Link>
  )
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })
}

export default function ActionsPage() {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<PendingItem[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [error, setError] = useState<string | null>(null)

  // Filter state
  const [filterClient, setFilterClient] = useState<string>('')
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'priority'>('newest')

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      setError(null)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Load clients assigned to this coach
      const { data: clientsData, error: clientsError } = await supabase
        .from('businesses')
        .select('id, business_name, owner_id')
        .eq('assigned_coach_id', user.id)
        .order('business_name')

      if (clientsError) {
        console.error('[Actions] Error loading clients:', clientsError)
        setError('Failed to load clients')
        return
      }

      if (!clientsData || clientsData.length === 0) {
        setLoading(false)
        return
      }

      const clientsList: Client[] = clientsData.map(c => ({
        id: c.id,
        businessName: c.business_name || 'Unnamed',
        ownerId: c.owner_id
      }))
      setClients(clientsList)

      const allItems: PendingItem[] = []

      // Load open loops for each client individually (avoids RLS issues with .in())
      for (const client of clientsList) {
        if (!client.ownerId) continue

        const { data: loops, error: loopsError } = await supabase
          .from('open_loops')
          .select('id, title, status, user_id, created_at, updated_at, archived')
          .eq('user_id', client.ownerId)
          .eq('archived', false)
          .order('updated_at', { ascending: false })

        if (loopsError) {
          console.error('[Actions] Error loading loops for', client.businessName, loopsError)
          continue
        }

        if (loops) {
          loops.forEach(loop => {
            allItems.push({
              id: loop.id,
              type: 'loop',
              title: loop.title || 'Untitled Loop',
              status: loop.status || 'in-progress',
              clientId: client.id,
              clientName: client.businessName,
              ownerId: loop.user_id,
              createdAt: loop.created_at,
              updatedAt: loop.updated_at || loop.created_at
            })
          })
        }
      }

      // Load open issues for each client individually
      for (const client of clientsList) {
        if (!client.ownerId) continue

        const { data: issues, error: issuesError } = await supabase
          .from('issues_list')
          .select('id, title, stated_problem, root_cause, user_id, status, priority, created_at, updated_at, archived')
          .eq('user_id', client.ownerId)
          .eq('archived', false)
          .neq('status', 'solved')
          .order('priority', { ascending: true, nullsFirst: false })
          .order('updated_at', { ascending: false })

        if (issuesError) {
          console.error('[Actions] Error loading issues for', client.businessName, issuesError)
          continue
        }

        if (issues) {
          issues.forEach(issue => {
            allItems.push({
              id: issue.id,
              type: 'issue',
              title: issue.title || 'Untitled Issue',
              description: issue.stated_problem || undefined,
              rootCause: issue.root_cause || undefined,
              status: issue.status || 'new',
              priority: issue.priority,
              clientId: client.id,
              clientName: client.businessName,
              ownerId: issue.user_id,
              createdAt: issue.created_at,
              updatedAt: issue.updated_at || issue.created_at
            })
          })
        }
      }

      // Sort by updated_at descending
      allItems.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

      setItems(allItems)
    } catch (error) {
      console.error('Error loading actions:', error)
      setError('Failed to load actions')
    } finally {
      setLoading(false)
    }
  }

  // Filter items
  const filteredItems = useMemo(() => {
    let result = [...items]

    // Client filter
    if (filterClient) {
      result = result.filter(i => i.clientId === filterClient)
    }

    // Type filter
    if (filterType !== 'all') {
      result = result.filter(i => i.type === filterType)
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(i =>
        i.title.toLowerCase().includes(query) ||
        i.description?.toLowerCase().includes(query) ||
        i.clientName.toLowerCase().includes(query)
      )
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'priority') {
        // Priority 1 first for issues, stuck first for loops
        const getPriorityScore = (item: PendingItem) => {
          if (item.type === 'issue' && item.priority) return item.priority
          if (item.type === 'loop' && item.status === 'stuck') return 0
          return 999
        }
        const scoreA = getPriorityScore(a)
        const scoreB = getPriorityScore(b)
        if (scoreA !== scoreB) return scoreA - scoreB
      }
      const dateA = new Date(a.updatedAt).getTime()
      const dateB = new Date(b.updatedAt).getTime()
      return sortBy === 'oldest' ? dateA - dateB : dateB - dateA
    })

    return result
  }, [items, filterClient, filterType, searchQuery, sortBy])

  // Counts
  const counts = useMemo(() => ({
    total: items.length,
    loops: items.filter(i => i.type === 'loop').length,
    issues: items.filter(i => i.type === 'issue').length,
    stuckLoops: items.filter(i => i.type === 'loop' && i.status === 'stuck').length,
    topPriorityIssues: items.filter(i => i.type === 'issue' && i.priority && i.priority <= 3).length
  }), [items])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="mb-6">
            <div className="h-8 w-48 bg-gray-200 rounded animate-pulse mb-2"></div>
            <div className="h-5 w-64 bg-gray-100 rounded animate-pulse"></div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-20 bg-white rounded-xl border border-gray-200 animate-pulse"></div>
            ))}
          </div>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <CardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <PageHeader
          variant="banner"
          title="Pending Actions"
          subtitle="Open loops and issues across all your clients"
          icon={ListChecks}
          actions={
            <button
              onClick={loadData}
              className="flex items-center justify-center gap-2 px-4 py-2.5 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          }
        />

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          <button
            onClick={() => setFilterType('all')}
            className={`p-3 sm:p-4 rounded-xl border-2 transition-all ${
              filterType === 'all'
                ? 'border-brand-orange bg-brand-orange-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <p className="text-xl sm:text-2xl font-bold text-gray-900">{counts.total}</p>
            <p className="text-xs font-medium text-gray-600">Total Items</p>
          </button>
          <button
            onClick={() => setFilterType('loop')}
            className={`p-3 sm:p-4 rounded-xl border-2 transition-all ${
              filterType === 'loop'
                ? 'border-amber-500 bg-amber-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <p className="text-xl sm:text-2xl font-bold text-amber-600">{counts.loops}</p>
            <p className="text-xs font-medium text-gray-600">Open Loops</p>
          </button>
          <button
            onClick={() => setFilterType('issue')}
            className={`p-3 sm:p-4 rounded-xl border-2 transition-all ${
              filterType === 'issue'
                ? 'border-brand-orange-500 bg-brand-orange-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <p className="text-xl sm:text-2xl font-bold text-brand-orange">{counts.issues}</p>
            <p className="text-xs font-medium text-gray-600">Issues</p>
          </button>
          <div className="p-3 sm:p-4 rounded-xl border-2 border-gray-200 bg-white">
            <p className="text-xl sm:text-2xl font-bold text-red-600">{counts.stuckLoops}</p>
            <p className="text-xs font-medium text-gray-600">Stuck Loops</p>
          </div>
          <div className="p-3 sm:p-4 rounded-xl border-2 border-gray-200 bg-white">
            <p className="text-xl sm:text-2xl font-bold text-red-600">{counts.topPriorityIssues}</p>
            <p className="text-xs font-medium text-gray-600">Priority Issues</p>
          </div>
        </div>
        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <p className="text-sm sm:text-base text-red-700">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="p-1 hover:bg-red-100 rounded"
            >
              <X className="w-5 h-5 text-red-600" />
            </button>
          </div>
        )}

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
            />
          </div>
          <select
            value={filterClient}
            onChange={(e) => setFilterClient(e.target.value)}
            className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent bg-white"
          >
            <option value="">All Clients</option>
            {clients.map(client => (
              <option key={client.id} value={client.id}>
                {client.businessName}
              </option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent bg-white"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="priority">By Priority</option>
          </select>
          {(filterClient || filterType !== 'all' || searchQuery) && (
            <button
              onClick={() => {
                setFilterClient('')
                setFilterType('all')
                setSearchQuery('')
              }}
              className="px-4 py-2.5 text-brand-orange hover:text-brand-orange-700 font-medium whitespace-nowrap"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Items List */}
        {filteredItems.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 sm:p-12 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <ListChecks className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">
              {items.length === 0 ? 'No pending items' : 'No items match your filters'}
            </h3>
            <p className="text-sm sm:text-base text-gray-600 max-w-md mx-auto">
              {items.length === 0
                ? 'All clients are up to date with no open loops or issues'
                : 'Try adjusting your filters to see more items'}
            </p>
            {items.length > 0 && (
              <button
                onClick={() => {
                  setFilterClient('')
                  setFilterType('all')
                  setSearchQuery('')
                }}
                className="mt-4 text-brand-orange hover:text-brand-orange-700 font-medium"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredItems.map(item => (
              <ActionCard key={`${item.type}-${item.id}`} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
