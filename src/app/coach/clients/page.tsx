'use client'

import { useEffect, useState, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ClientCard, type ClientCardData } from '@/components/coach/ClientCard'
import { ClientTable, type ClientTableData } from '@/components/coach/ClientTable'
import PageHeader from '@/components/ui/PageHeader'
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
  AlertCircle,
  Mail,
  Send,
  CheckCircle,
  Users
} from 'lucide-react'

type ViewMode = 'grid' | 'list'
type StatusFilter = 'all' | 'active' | 'pending' | 'at-risk' | 'inactive'

interface UnassignedClient {
  id: string
  business_name: string
  industry: string | null
  created_at: string
}

interface PendingInvitationClient {
  id: string
  business_name: string
  invitation_sent: boolean
  created_at: string
}

function ClientsListContent() {
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [clients, setClients] = useState<(ClientCardData & { healthScore?: number })[]>([])
  const [unassignedClients, setUnassignedClients] = useState<UnassignedClient[]>([])
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitationClient[]>([])
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [sendingInvitationId, setSendingInvitationId] = useState<string | null>(null)
  const [invitationSuccess, setInvitationSuccess] = useState<string | null>(null)
  const [invitationError, setInvitationError] = useState<string | null>(null)
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
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      setUserId(user.id)

      // Check if user is super_admin
      const { data: roleData } = await supabase
        .from('system_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle()

      const isSuperAdmin = roleData?.role === 'super_admin'

      // Load businesses - super_admins see all, coaches see only assigned
      let businessQuery = supabase
        .from('businesses')
        .select('*')
        .order('business_name')

      if (!isSuperAdmin) {
        businessQuery = businessQuery.eq('assigned_coach_id', user.id)
      }

      const { data: businesses, error } = await businessQuery

      const businessList = businesses || []
      const businessIds = businessList.map(b => b.id)
      const ownerIds = businessList.map(b => b.owner_id).filter(Boolean) as string[]

      // Fetch all supplementary data in parallel
      const [
        userLoginsResult,
        openLoopsResult,
        issuesResult,
        messagesResult,
        assessmentsResult,
        weeklyReviewsResult,
        completedActionsResult,
        activitySummaryResult,
        sessionsResult
      ] = await Promise.all([
        // 1. Login data - last login per owner
        ownerIds.length > 0
          ? supabase
              .from('user_logins')
              .select('user_id, login_at')
              .in('user_id', ownerIds)
          : Promise.resolve({ data: [], error: null }),

        // 2a. Open loops (pending actions) per owner
        ownerIds.length > 0
          ? supabase
              .from('open_loops')
              .select('user_id')
              .in('user_id', ownerIds)
              .eq('archived', false)
          : Promise.resolve({ data: [], error: null }),

        // 2b. Open issues (pending actions) per owner
        ownerIds.length > 0
          ? supabase
              .from('issues_list')
              .select('user_id')
              .in('user_id', ownerIds)
              .neq('status', 'solved')
              .eq('archived', false)
          : Promise.resolve({ data: [], error: null }),

        // 3. Unread messages per business (not sent by coach)
        businessIds.length > 0
          ? supabase
              .from('messages')
              .select('business_id')
              .in('business_id', businessIds)
              .eq('read', false)
              .neq('sender_id', user.id)
          : Promise.resolve({ data: [], error: null }),

        // 4. Latest assessment per owner (for health score)
        ownerIds.length > 0
          ? supabase
              .from('assessments')
              .select('user_id, percentage, total_score, total_max')
              .in('user_id', ownerIds)
              .eq('status', 'completed')
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),

        // 5a. Latest completed weekly review per business
        businessIds.length > 0
          ? supabase
              .from('weekly_reviews')
              .select('business_id, completed_at')
              .in('business_id', businessIds)
              .eq('is_completed', true)
              .order('completed_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),

        // 5b. Latest completed session action per business
        businessIds.length > 0
          ? supabase
              .from('session_actions')
              .select('business_id, completed_at')
              .in('business_id', businessIds)
              .eq('status', 'completed')
              .not('completed_at', 'is', null)
              .order('completed_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),

        // 6. Activity summary (last change + page) from the view
        businessIds.length > 0
          ? supabase
              .from('client_activity_summary')
              .select('business_id, last_change_at, last_change_page')
              .in('business_id', businessIds)
          : Promise.resolve({ data: [], error: null }),

        // 7. Coaching sessions per business (for last/next session + frequency)
        businessIds.length > 0
          ? supabase
              .from('coaching_sessions')
              .select('business_id, scheduled_at, status')
              .in('business_id', businessIds)
              .order('scheduled_at', { ascending: false })
          : Promise.resolve({ data: [], error: null })
      ])

      // Build lookup maps

      // Last login per user
      const lastLoginByUser = new Map<string, string>()
      userLoginsResult.data?.forEach((u: { user_id: string; login_at: string }) => {
        if (u.login_at) {
          const existing = lastLoginByUser.get(u.user_id)
          if (!existing || new Date(u.login_at) > new Date(existing)) {
            lastLoginByUser.set(u.user_id, u.login_at)
          }
        }
      })

      // Open loops count per user
      const openLoopsByUser = new Map<string, number>()
      openLoopsResult.data?.forEach((ol: { user_id: string }) => {
        openLoopsByUser.set(ol.user_id, (openLoopsByUser.get(ol.user_id) || 0) + 1)
      })

      // Issues count per user
      const issuesByUser = new Map<string, number>()
      issuesResult.data?.forEach((issue: { user_id: string }) => {
        issuesByUser.set(issue.user_id, (issuesByUser.get(issue.user_id) || 0) + 1)
      })

      // Unread messages count per business
      const unreadByBusiness = new Map<string, number>()
      messagesResult.data?.forEach((m: { business_id: string }) => {
        unreadByBusiness.set(m.business_id, (unreadByBusiness.get(m.business_id) || 0) + 1)
      })

      // Latest assessment percentage per user (first entry is most recent due to order)
      const assessmentByUser = new Map<string, number>()
      assessmentsResult.data?.forEach((a: { user_id: string; percentage: number; total_score: number; total_max: number }) => {
        if (!assessmentByUser.has(a.user_id)) {
          const pct = a.percentage ?? Math.round((a.total_score / (a.total_max || 300)) * 100)
          assessmentByUser.set(a.user_id, pct)
        }
      })

      // Latest completed weekly review per business
      const weeklyReviewByBusiness = new Map<string, string>()
      weeklyReviewsResult.data?.forEach((wr: { business_id: string; completed_at: string }) => {
        if (!weeklyReviewByBusiness.has(wr.business_id)) {
          weeklyReviewByBusiness.set(wr.business_id, wr.completed_at)
        }
      })

      // Latest completed session action per business
      const completedActionByBusiness = new Map<string, string>()
      completedActionsResult.data?.forEach((ca: { business_id: string; completed_at: string }) => {
        if (!completedActionByBusiness.has(ca.business_id) && ca.completed_at) {
          completedActionByBusiness.set(ca.business_id, ca.completed_at)
        }
      })

      // Activity summary (last change + page) per business
      const activityByBusiness = new Map<string, { lastChangeAt: string | null; lastChangePage: string | null }>()
      activitySummaryResult.data?.forEach((a: { business_id: string; last_change_at: string | null; last_change_page: string | null }) => {
        activityByBusiness.set(a.business_id, {
          lastChangeAt: a.last_change_at,
          lastChangePage: a.last_change_page
        })
      })

      // Last and next coaching session per business
      const lastSessionByBusiness = new Map<string, string>()
      const nextSessionByBusiness = new Map<string, string>()
      const now = new Date()
      sessionsResult.data?.forEach((s: { business_id: string; scheduled_at: string; status: string }) => {
        const sessionDate = new Date(s.scheduled_at)
        if ((s.status === 'completed' || sessionDate < now) && !lastSessionByBusiness.has(s.business_id)) {
          lastSessionByBusiness.set(s.business_id, s.scheduled_at)
        }
        if (s.status === 'scheduled' && sessionDate > now) {
          const existing = nextSessionByBusiness.get(s.business_id)
          if (!existing || sessionDate < new Date(existing)) {
            nextSessionByBusiness.set(s.business_id, s.scheduled_at)
          }
        }
      })

      // Auto-calculate status based on activity
      const calculateStatus = (businessId: string, ownerId: string | undefined, manualStatus: string | null): ClientCardData['status'] => {
        // Respect manual 'inactive' status
        if (manualStatus === 'inactive') return 'inactive'

        const lastLogin = ownerId ? lastLoginByUser.get(ownerId) : null
        const lastWeeklyReview = weeklyReviewByBusiness.get(businessId)
        const lastAction = completedActionByBusiness.get(businessId)

        // If never logged in, they're pending
        if (!lastLogin) return 'pending'

        // Find most recent activity
        const activityDates = [lastLogin, lastWeeklyReview, lastAction].filter(Boolean) as string[]
        const mostRecent = activityDates.length > 0
          ? new Date(activityDates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0])
          : null

        if (!mostRecent) return 'pending'

        const daysSince = Math.floor((now.getTime() - mostRecent.getTime()) / (1000 * 60 * 60 * 24))
        if (daysSince > 14) return 'at-risk'
        return 'active'
      }

      // Helper: get most recent activity date for a business/owner
      const getMostRecentActivity = (businessId: string, ownerId: string | undefined): string | null => {
        const dates = [
          ownerId ? lastLoginByUser.get(ownerId) : null,
          weeklyReviewByBusiness.get(businessId),
          completedActionByBusiness.get(businessId)
        ].filter(Boolean) as string[]

        if (dates.length === 0) return null
        return dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
      }

      // Process clients with all data populated
      // Use intersection type so healthScore flows through to ClientTableData in table view
      const processedClients = businessList.map(b => {
        const ownerId = b.owner_id as string | undefined
        const loops = ownerId ? (openLoopsByUser.get(ownerId) || 0) : 0
        const issues = ownerId ? (issuesByUser.get(ownerId) || 0) : 0
        const activity = activityByBusiness.get(b.id)

        return {
          id: b.id,
          businessName: b.name || b.business_name || 'Unnamed Business',
          industry: b.industry || undefined,
          status: calculateStatus(b.id, ownerId, b.status),
          lastSessionDate: lastSessionByBusiness.get(b.id) || b.last_session_date || undefined,
          nextSessionDate: nextSessionByBusiness.get(b.id) || undefined,
          programType: b.program_type || undefined,
          unreadMessages: unreadByBusiness.get(b.id) || 0,
          pendingActions: loops + issues,
          lastLogin: ownerId ? lastLoginByUser.get(ownerId) || undefined : undefined,
          lastChange: activity?.lastChangeAt || undefined,
          lastChangePage: activity?.lastChangePage || undefined,
          healthScore: ownerId ? assessmentByUser.get(ownerId) : undefined
        }
      }) as (ClientCardData & { healthScore?: number })[]

      setClients(processedClients)

      // Load unassigned clients
      const { data: unassigned } = await supabase
        .from('businesses')
        .select('id, business_name, industry, created_at')
        .is('assigned_coach_id', null)
        .order('created_at', { ascending: false })

      setUnassignedClients(unassigned || [])

      // Load clients with pending invitations (super_admins see all, coaches see only assigned)
      let pendingQuery = supabase
        .from('businesses')
        .select('id, business_name, invitation_sent, created_at')
        .eq('invitation_sent', false)
        .not('temp_password', 'is', null)
        .order('created_at', { ascending: false })

      if (!isSuperAdmin) {
        pendingQuery = pendingQuery.eq('assigned_coach_id', user.id)
      }

      const { data: pendingInvites } = await pendingQuery

      setPendingInvitations(pendingInvites || [])
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

  async function sendInvitation(businessId: string, businessName: string) {
    setSendingInvitationId(businessId)
    setInvitationError(null)
    setInvitationSuccess(null)

    try {
      const response = await fetch('/api/clients/send-invitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send invitation')
      }

      setInvitationSuccess(businessName)
      // Reload to refresh the pending invitations list
      await loadClients()

      // Clear success message after 5 seconds
      setTimeout(() => setInvitationSuccess(null), 5000)
    } catch (error) {
      console.error('Error sending invitation:', error)
      setInvitationError(error instanceof Error ? error.message : 'Failed to send invitation')
      // Clear error message after 5 seconds
      setTimeout(() => setInvitationError(null), 5000)
    } finally {
      setSendingInvitationId(null)
    }
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
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-brand-orange mx-auto mb-4" />
          <p className="text-gray-500">Loading clients...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Page Header */}
      <PageHeader
        variant="banner"
        title="Clients"
        subtitle={`${stats.total} total • ${stats.active} active • ${stats.atRisk} at-risk`}
        icon={Users}
        actions={
          <>
            <button className="flex items-center gap-2 px-4 py-2 text-sm sm:text-base bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors">
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export</span>
            </button>
            <Link
              href="/coach/clients/new"
              className="flex items-center gap-2 px-4 py-2 text-sm sm:text-base bg-brand-orange hover:bg-brand-orange-600 text-white rounded-lg shadow-sm transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              <span className="hidden sm:inline">Add Client</span>
              <span className="sm:hidden">Add</span>
            </Link>
          </>
        }
      />

      {/* Unassigned Clients Alert */}
      {unassignedClients.length > 0 && (
        <div className="bg-brand-orange-50 border border-brand-orange-200 rounded-xl p-4 sm:p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-brand-orange mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="font-semibold text-brand-orange-800 text-base sm:text-lg">
                {unassignedClients.length} Unassigned Client{unassignedClients.length > 1 ? 's' : ''}
              </h3>
              <p className="text-sm text-brand-orange-700 mt-1">
                These clients don&apos;t have a coach assigned. Claim them to add to your roster.
              </p>
              <div className="mt-3 space-y-2">
                {unassignedClients.map(client => (
                  <div
                    key={client.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white rounded-lg px-4 py-3 border border-brand-orange-200"
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
                      className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-brand-orange hover:bg-brand-orange-600 text-white rounded-lg shadow-sm transition-colors disabled:opacity-50"
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

      {/* Pending Invitations Alert */}
      {pendingInvitations.length > 0 && (
        <div className="bg-brand-orange-50 border border-brand-orange-200 rounded-xl p-4 sm:p-6">
          <div className="flex items-start gap-3">
            <Mail className="w-5 h-5 text-brand-orange mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="font-semibold text-brand-navy text-base sm:text-lg">
                {pendingInvitations.length} Pending Invitation{pendingInvitations.length > 1 ? 's' : ''}
              </h3>
              <p className="text-sm text-brand-orange-700 mt-1">
                These clients have accounts but haven&apos;t received their login credentials yet.
              </p>
              <div className="mt-3 space-y-2">
                {pendingInvitations.map(client => (
                  <div
                    key={client.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white rounded-lg px-4 py-3 border border-brand-orange-200"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{client.business_name || 'Unnamed Business'}</p>
                      <p className="text-sm text-gray-500">
                        Added {new Date(client.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => sendInvitation(client.id, client.business_name)}
                      disabled={sendingInvitationId === client.id}
                      className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-brand-orange hover:bg-brand-orange-600 text-white rounded-lg shadow-sm transition-colors disabled:opacity-50"
                    >
                      {sendingInvitationId === client.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      Send Invitation
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invitation Success/Error Messages */}
      {invitationSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 sm:p-6">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
            <p className="text-sm sm:text-base text-green-800">
              Invitation email sent successfully to <strong>{invitationSuccess}</strong>
            </p>
          </div>
        </div>
      )}

      {invitationError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 sm:p-6">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <p className="text-sm sm:text-base text-red-800">{invitationError}</p>
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className="rounded-xl shadow-sm border border-gray-200 bg-white p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search clients by name or industry..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent"
            />
          </div>

          {/* View Toggle */}
          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-md transition-colors ${
                viewMode === 'grid' ? 'bg-white shadow text-brand-orange' : 'text-gray-500 hover:text-gray-700'
              }`}
              aria-label="Grid view"
            >
              <LayoutGrid className="w-5 h-5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-md transition-colors ${
                viewMode === 'list' ? 'bg-white shadow text-brand-orange' : 'text-gray-500 hover:text-gray-700'
              }`}
              aria-label="List view"
            >
              <List className="w-5 h-5" />
            </button>
          </div>

          {/* Filter Button */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center justify-center gap-2 px-4 py-2.5 border rounded-lg transition-colors text-sm sm:text-base ${
              hasActiveFilters
                ? 'bg-brand-orange-50 border-brand-orange-300 text-brand-orange-700'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Filter className="w-4 h-4" />
            <span className="hidden sm:inline">Filters</span>
            {hasActiveFilters && (
              <span className="w-5 h-5 bg-brand-orange text-white text-xs rounded-full flex items-center justify-center">
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
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange"
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
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange"
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
      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'active', 'at-risk', 'pending'] as const).map(status => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === status
                ? 'bg-brand-orange hover:bg-brand-orange-600 text-white shadow-sm'
                : 'bg-white border border-gray-300 hover:bg-gray-50 text-gray-700'
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {filteredClients.map(client => (
            <ClientCard
              key={client.id}
              client={client}
              onMessage={() => {}}
              onSchedule={() => {}}
            />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <ClientTable
            clients={filteredClients as ClientTableData[]}
            onMessage={() => {}}
            onSchedule={() => {}}
          />
        </div>
      )}

      {/* Empty State */}
      {filteredClients.length === 0 && !loading && (
        <div className="text-center py-12 px-4">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-1">No clients found</h3>
          <p className="text-sm sm:text-base text-gray-500 mb-4">
            {hasActiveFilters
              ? 'Try adjusting your filters to find what you\'re looking for.'
              : 'Get started by adding your first client.'}
          </p>
          {hasActiveFilters ? (
            <button
              onClick={clearFilters}
              className="text-brand-orange hover:text-brand-orange-600 font-medium text-sm sm:text-base"
            >
              Clear all filters
            </button>
          ) : (
            <Link
              href="/coach/clients/new"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm sm:text-base bg-brand-orange hover:bg-brand-orange-600 text-white rounded-lg shadow-sm"
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
        <Loader2 className="w-8 h-8 animate-spin text-brand-orange" />
      </div>
    }>
      <ClientsListContent />
    </Suspense>
  )
}
