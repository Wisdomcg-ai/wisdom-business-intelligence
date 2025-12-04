'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import {
  Loader2,
  ListChecks,
  AlertCircle,
  RefreshCw,
  Building2,
  ChevronRight,
  Filter
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
}

interface Client {
  id: string
  businessName: string
  ownerId: string | null
}

export default function ActionsPage() {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<PendingItem[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [filterClient, setFilterClient] = useState<string>('')
  const [filterType, setFilterType] = useState<'all' | 'loop' | 'issue'>('all')

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadData() {
    try {
      setLoading(true)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Load clients assigned to this coach
      const { data: clientsData } = await supabase
        .from('businesses')
        .select('id, business_name, owner_id')
        .eq('assigned_coach_id', user.id)
        .order('business_name')

      if (!clientsData) {
        setLoading(false)
        return
      }

      const clientsList: Client[] = clientsData.map(c => ({
        id: c.id,
        businessName: c.business_name || 'Unnamed',
        ownerId: c.owner_id
      }))
      setClients(clientsList)

      // Get owner IDs for querying
      const ownerIds = clientsList
        .map(c => c.ownerId)
        .filter((id): id is string => id !== null)

      if (ownerIds.length === 0) {
        setItems([])
        setLoading(false)
        return
      }

      const allItems: PendingItem[] = []

      // Load open loops (not archived)
      const { data: loops } = await supabase
        .from('open_loops')
        .select('id, title, description, user_id, created_at, updated_at, archived')
        .in('user_id', ownerIds)
        .eq('archived', false)
        .order('updated_at', { ascending: false })

      if (loops) {
        loops.forEach(loop => {
          const client = clientsList.find(c => c.ownerId === loop.user_id)
          if (client) {
            allItems.push({
              id: loop.id,
              type: 'loop',
              title: loop.title || 'Untitled Loop',
              description: loop.description || undefined,
              status: 'open',
              clientId: client.id,
              clientName: client.businessName,
              ownerId: loop.user_id,
              createdAt: loop.created_at,
              updatedAt: loop.updated_at || loop.created_at
            })
          }
        })
      }

      // Load open issues (not archived/solved)
      const { data: issues } = await supabase
        .from('issues_list')
        .select('id, title, stated_problem, user_id, status, priority, created_at, updated_at, archived')
        .in('user_id', ownerIds)
        .eq('archived', false)
        .neq('status', 'solved')
        .order('priority', { ascending: true, nullsFirst: false })
        .order('updated_at', { ascending: false })

      if (issues) {
        issues.forEach(issue => {
          const client = clientsList.find(c => c.ownerId === issue.user_id)
          if (client) {
            allItems.push({
              id: issue.id,
              type: 'issue',
              title: issue.title || 'Untitled Issue',
              description: issue.stated_problem || undefined,
              status: issue.status || 'new',
              priority: issue.priority,
              clientId: client.id,
              clientName: client.businessName,
              ownerId: issue.user_id,
              createdAt: issue.created_at,
              updatedAt: issue.updated_at || issue.created_at
            })
          }
        })
      }

      // Sort by updated_at descending
      allItems.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

      setItems(allItems)
    } catch (error) {
      console.error('Error loading actions:', error)
    } finally {
      setLoading(false)
    }
  }

  // Filter items
  const filteredItems = useMemo(() => {
    let result = [...items]

    if (filterClient) {
      result = result.filter(i => i.clientId === filterClient)
    }

    if (filterType !== 'all') {
      result = result.filter(i => i.type === filterType)
    }

    return result
  }, [items, filterClient, filterType])

  // Counts
  const counts = useMemo(() => ({
    total: items.length,
    loops: items.filter(i => i.type === 'loop').length,
    issues: items.filter(i => i.type === 'issue').length
  }), [items])

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    return date.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-gray-500">Loading open loops & issues...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pending Actions</h1>
          <p className="text-gray-500 mt-1">
            {counts.total} total &middot; {counts.loops} open loops &middot; {counts.issues} issues
          </p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div
          className={`bg-white rounded-xl border-2 p-5 cursor-pointer transition-colors ${
            filterType === 'all' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'
          }`}
          onClick={() => setFilterType('all')}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
              <ListChecks className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{counts.total}</p>
              <p className="text-sm text-gray-500">All Items</p>
            </div>
          </div>
        </div>
        <div
          className={`bg-white rounded-xl border-2 p-5 cursor-pointer transition-colors ${
            filterType === 'loop' ? 'border-amber-500 bg-amber-50' : 'border-gray-200 hover:border-gray-300'
          }`}
          onClick={() => setFilterType('loop')}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-600">{counts.loops}</p>
              <p className="text-sm text-gray-500">Open Loops</p>
            </div>
          </div>
        </div>
        <div
          className={`bg-white rounded-xl border-2 p-5 cursor-pointer transition-colors ${
            filterType === 'issue' ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:border-gray-300'
          }`}
          onClick={() => setFilterType('issue')}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">{counts.issues}</p>
              <p className="text-sm text-gray-500">Issues</p>
            </div>
          </div>
        </div>
      </div>

      {/* Client Filter */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-gray-500">
          <Filter className="w-4 h-4" />
          <span className="text-sm font-medium">Filter by client:</span>
        </div>
        <select
          value={filterClient}
          onChange={(e) => setFilterClient(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="">All Clients</option>
          {clients.map(client => (
            <option key={client.id} value={client.id}>
              {client.businessName}
            </option>
          ))}
        </select>
        {(filterClient || filterType !== 'all') && (
          <button
            onClick={() => { setFilterClient(''); setFilterType('all') }}
            className="text-sm text-indigo-600 hover:text-indigo-800"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Items List */}
      {filteredItems.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ListChecks className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">
            {items.length === 0 ? 'No pending items' : 'No items match your filters'}
          </h3>
          <p className="text-gray-500">
            {items.length === 0
              ? 'All clients are up to date with no open loops or issues'
              : 'Try adjusting your filters to see more items'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {filteredItems.map(item => (
            <Link
              key={`${item.type}-${item.id}`}
              href={`/coach/clients/${item.clientId}?tab=overview`}
              className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors"
            >
              {/* Type Icon */}
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                item.type === 'loop' ? 'bg-amber-100' : 'bg-red-100'
              }`}>
                {item.type === 'loop' ? (
                  <RefreshCw className="w-5 h-5 text-amber-600" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-600" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    item.type === 'loop'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {item.type === 'loop' ? 'Open Loop' : 'Issue'}
                  </span>
                  {item.priority && item.priority <= 3 && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                      Priority {item.priority}
                    </span>
                  )}
                </div>
                <h3 className="font-medium text-gray-900 truncate">{item.title}</h3>
                {item.description && (
                  <p className="text-sm text-gray-500 truncate mt-0.5">{item.description}</p>
                )}
              </div>

              {/* Client & Date */}
              <div className="text-right flex-shrink-0">
                <div className="flex items-center gap-1 text-sm font-medium text-gray-900">
                  <Building2 className="w-4 h-4 text-gray-400" />
                  {item.clientName}
                </div>
                <p className="text-xs text-gray-500 mt-1">{formatDate(item.updatedAt)}</p>
              </div>

              {/* Arrow */}
              <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
