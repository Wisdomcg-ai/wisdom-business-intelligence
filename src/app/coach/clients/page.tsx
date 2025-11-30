'use client'

import { useEffect, useState, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ClientCard, type ClientCardData } from '@/components/coach/ClientCard'
import { ClientTable, type ClientTableData } from '@/components/coach/ClientTable'
import {
  Search,
  LayoutGrid,
  List,
  Filter,
  UserPlus,
  Download,
  Loader2,
  X,
  UserCheck,
  AlertCircle
} from 'lucide-react'

type ViewMode = 'grid' | 'list'
type StatusFilter = 'all' | 'active' | 'pending' | 'at-risk' | 'inactive'

interface UnassignedClient {
  id: string
  business_name: string
  industry: string | null
  created_at: string
}

function ClientsListContent() {
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [clients, setClients] = useState<ClientCardData[]>([])
  const [unassignedClients, setUnassignedClients] = useState<UnassignedClient[]>([])
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    (searchParams?.get('filter') as StatusFilter) || 'all'
  )
  const [industryFilter, setIndustryFilter] = useState<string>('all')
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    loadClients()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadClients() {
    try {
      setLoading(true)
      console.log('[ClientsPage] Loading clients...')

      const { data: { user } } = await supabase.auth.getUser()
      console.log('[ClientsPage] User:', user?.id || 'none')
      if (!user) return

      setUserId(user.id)

      // Load businesses assigned to this coach
      const { data: businesses, error } = await supabase
        .from('businesses')
        .select('*')
        .eq('assigned_coach_id', user.id)
        .order('business_name')

      console.log('[ClientsPage] Businesses result:', { count: businesses?.length, error: error?.message })

      // Process clients
      const processedClients: ClientCardData[] = (businesses || []).map(b => ({
        id: b.id,
        businessName: b.name || b.business_name || 'Unnamed Business',
        industry: b.industry || undefined,
        status: (b.status as ClientCardData['status']) || 'active',
        lastSessionDate: b.last_session_date || undefined,
        programType: b.program_type || undefined,
        unreadMessages: 0,
        pendingActions: 0
      }))

      setClients(processedClients)

      // Load unassigned clients
      const { data: unassigned } = await supabase
        .from('businesses')
        .select('id, business_name, industry, created_at')
        .is('assigned_coach_id', null)
        .order('created_at', { ascending: false })

      setUnassignedClients(unassigned || [])
    } catch (error) {
      console.error('Error loading clients:', error)
    } finally {
      setLoading(false)
    }
  }

  async function claimClient(businessId: string) {
    if (!userId) return

    setClaimingId(businessId)
    const { error } = await supabase
      .from('businesses')
      .update({ assigned_coach_id: userId })
      .eq('id', businessId)

    if (error) {
      console.error('Error claiming client:', error)
    } else {
      // Reload to refresh both lists
      await loadClients()
    }

    setClaimingId(null)
  }

  // Get unique industries for filter
  const industries = useMemo(() => {
    const uniqueIndustries = new Set(clients.map(c => c.industry).filter(Boolean))
    return Array.from(uniqueIndustries) as string[]
  }, [clients])

  // Filter clients
  const filteredClients = useMemo(() => {
    return clients.filter(client => {
      // Search filter
      const matchesSearch = !searchQuery ||
        client.businessName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        client.industry?.toLowerCase().includes(searchQuery.toLowerCase())

      // Status filter
      const matchesStatus = statusFilter === 'all' || client.status === statusFilter

      // Industry filter
      const matchesIndustry = industryFilter === 'all' || client.industry === industryFilter

      return matchesSearch && matchesStatus && matchesIndustry
    })
  }, [clients, searchQuery, statusFilter, industryFilter])

  // Stats
  const stats = useMemo(() => ({
    total: clients.length,
    active: clients.filter(c => c.status === 'active').length,
    pending: clients.filter(c => c.status === 'pending').length,
    atRisk: clients.filter(c => c.status === 'at-risk').length
  }), [clients])

  const clearFilters = () => {
    setSearchQuery('')
    setStatusFilter('all')
    setIndustryFilter('all')
  }

  const hasActiveFilters = searchQuery || statusFilter !== 'all' || industryFilter !== 'all'

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-gray-500">Loading clients...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Unassigned Clients Alert */}
      {unassignedClients.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="font-semibold text-orange-800">
                {unassignedClients.length} Unassigned Client{unassignedClients.length > 1 ? 's' : ''}
              </h3>
              <p className="text-sm text-orange-700 mt-1">
                These clients don&apos;t have a coach assigned. Claim them to add to your roster.
              </p>
              <div className="mt-3 space-y-2">
                {unassignedClients.map(client => (
                  <div
                    key={client.id}
                    className="flex items-center justify-between bg-white rounded-lg px-4 py-3 border border-orange-200"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{client.business_name || 'Unnamed Business'}</p>
                      <p className="text-sm text-gray-500">
                        {client.industry || 'No industry'} &middot; Added {new Date(client.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => claimClient(client.id)}
                      disabled={claimingId === client.id}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                    >
                      {claimingId === client.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <UserCheck className="w-4 h-4" />
                      )}
                      Claim
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
          <p className="text-gray-500 mt-1">
            {stats.total} total &middot; {stats.active} active &middot; {stats.atRisk} at-risk
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            <Download className="w-4 h-4" />
            Export
          </button>
          <Link
            href="/coach/clients/new"
            className="flex items-center gap-2 px-4 py-2 text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Add Client
          </Link>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search clients by name or industry..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* View Toggle */}
          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-md transition-colors ${
                viewMode === 'grid' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <LayoutGrid className="w-5 h-5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-md transition-colors ${
                viewMode === 'list' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <List className="w-5 h-5" />
            </button>
          </div>

          {/* Filter Button */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2.5 border rounded-lg transition-colors ${
              hasActiveFilters
                ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters
            {hasActiveFilters && (
              <span className="w-5 h-5 bg-indigo-600 text-white text-xs rounded-full flex items-center justify-center">
                {[statusFilter !== 'all', industryFilter !== 'all'].filter(Boolean).length}
              </span>
            )}
          </button>
        </div>

        {/* Expanded Filters */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex items-center gap-4 flex-wrap">
              {/* Status Filter */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all">All</option>
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                  <option value="at-risk">At Risk</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              {/* Industry Filter */}
              {industries.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Industry:</span>
                  <select
                    value={industryFilter}
                    onChange={(e) => setIndustryFilter(e.target.value)}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="all">All Industries</option>
                    {industries.map(industry => (
                      <option key={industry} value={industry}>{industry}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Clear Filters */}
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
                >
                  <X className="w-4 h-4" />
                  Clear filters
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Status Quick Filters */}
      <div className="flex items-center gap-2">
        {(['all', 'active', 'at-risk', 'pending'] as const).map(status => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === status
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            {status === 'all' ? 'All' : status === 'at-risk' ? 'At Risk' : status.charAt(0).toUpperCase() + status.slice(1)}
            <span className="ml-1.5 opacity-70">
              ({status === 'all' ? stats.total : status === 'at-risk' ? stats.atRisk : status === 'active' ? stats.active : stats.pending})
            </span>
          </button>
        ))}
      </div>

      {/* Results Count */}
      {filteredClients.length !== clients.length && (
        <p className="text-sm text-gray-500">
          Showing {filteredClients.length} of {clients.length} clients
        </p>
      )}

      {/* Client Grid/List */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredClients.map(client => (
            <ClientCard
              key={client.id}
              client={client}
              onMessage={(id) => console.log('Message client:', id)}
              onSchedule={(id) => console.log('Schedule session:', id)}
            />
          ))}
        </div>
      ) : (
        <ClientTable
          clients={filteredClients as ClientTableData[]}
          onMessage={(id) => console.log('Message client:', id)}
          onSchedule={(id) => console.log('Schedule session:', id)}
        />
      )}

      {/* Empty State */}
      {filteredClients.length === 0 && !loading && (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">No clients found</h3>
          <p className="text-gray-500 mb-4">
            {hasActiveFilters
              ? 'Try adjusting your filters to find what you\'re looking for.'
              : 'Get started by adding your first client.'}
          </p>
          {hasActiveFilters ? (
            <button
              onClick={clearFilters}
              className="text-indigo-600 hover:text-indigo-700 font-medium"
            >
              Clear all filters
            </button>
          ) : (
            <Link
              href="/coach/clients/new"
              className="inline-flex items-center gap-2 px-4 py-2 text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
            >
              <UserPlus className="w-4 h-4" />
              Add your first client
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

export default function ClientsListPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    }>
      <ClientsListContent />
    </Suspense>
  )
}
