'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ClientOverviewTable, type ClientMetrics } from '@/components/coach/ClientOverviewTable'
import { ActivityFeed, type ActivityItem } from '@/components/coach/ActivityFeed'
import { StatsCard } from '@/components/admin/StatsCard'
import { Loader2, AlertTriangle, RefreshCw, Users, Calendar, ListChecks, MessageSquare, Building2, Plus, ArrowRight } from 'lucide-react'
import Link from 'next/link'

// Stage calculation from revenue (matching stage-service.ts)
function calculateStageFromRevenue(revenue: number | null | undefined): string {
  if (!revenue || revenue < 500000) return 'Foundation'
  if (revenue < 1000000) return 'Traction'
  if (revenue < 5000000) return 'Growth'
  if (revenue < 10000000) return 'Scale'
  return 'Mastery'
}

export default function CoachDashboardPage() {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [stats, setStats] = useState({
    activeClients: 0,
    sessionsThisWeek: 0,
    pendingActions: 0,
    unreadMessages: 0
  })
  const [clientMetrics, setClientMetrics] = useState<ClientMetrics[]>([])
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [clientsNeedingAttention, setClientsNeedingAttention] = useState<{
    id: string
    name: string
    reason: string
  }[]>([])

  useEffect(() => {
    loadDashboardData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadDashboardData(isRefresh = false) {
    try {
      if (isRefresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Load businesses assigned to this coach
      const { data: businesses, error: bizError } = await supabase
        .from('businesses')
        .select('*')
        .eq('assigned_coach_id', user.id)
        .order('business_name')

      if (bizError) {
        console.error('[Dashboard] Error loading businesses:', bizError)
      }

      // Load business profiles separately to avoid join issues
      let businessProfiles: { id: string; business_id: string; annual_revenue: number | null; industry: string | null }[] = []
      if (businesses && businesses.length > 0) {
        const businessIds = businesses.map(b => b.id)
        const { data: profilesData } = await supabase
          .from('business_profiles')
          .select('id, business_id, annual_revenue, industry')
          .in('business_id', businessIds)
        businessProfiles = profilesData || []
      }

      // Attach profiles to businesses
      const businessesWithProfiles = (businesses || []).map(b => ({
        ...b,
        business_profiles: businessProfiles.filter(p => p.business_id === b.id)
      }))

      if (!businessesWithProfiles || businessesWithProfiles.length === 0) {
        setClientMetrics([])
        setStats({ activeClients: 0, sessionsThisWeek: 0, pendingActions: 0, unreadMessages: 0 })
        setLoading(false)
        setRefreshing(false)
        return
      }

      // Get all business IDs and owner IDs
      const businessIds = businessesWithProfiles.map(b => b.id)
      const ownerIds = businessesWithProfiles.map(b => b.owner_id).filter(Boolean)

      // Fetch all metrics data in parallel - guard all queries with empty array checks
      const [
        weeklyReviewsResult,
        assessmentsResult,
        openLoopsResult,
        issuesResult,
        completedActionsResult,
        assessmentActivityResult,
        userLoginsResult
      ] = await Promise.all([
        // Latest completed weekly review per business (actual client completion)
        businessIds.length > 0
          ? supabase
              .from('weekly_reviews')
              .select('business_id, completed_at')
              .in('business_id', businessIds)
              .eq('is_completed', true)
              .order('completed_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),

        // Latest completed assessment per user - include percentage
        ownerIds.length > 0
          ? supabase
              .from('assessments')
              .select('user_id, total_score, total_max, percentage, health_status, created_at')
              .in('user_id', ownerIds)
              .eq('status', 'completed')
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),

        // Open loops count per user (tables use user_id, not business_id)
        ownerIds.length > 0
          ? supabase
              .from('open_loops')
              .select('user_id')
              .in('user_id', ownerIds)
              .eq('archived', false)
          : Promise.resolve({ data: [], error: null }),

        // Open issues count per user
        ownerIds.length > 0
          ? supabase
              .from('issues_list')
              .select('user_id')
              .in('user_id', ownerIds)
              .neq('status', 'solved')
              .eq('archived', false)
          : Promise.resolve({ data: [], error: null }),

        // Latest session action COMPLETED by client (actual client activity)
        businessIds.length > 0
          ? supabase
              .from('session_actions')
              .select('business_id, completed_at')
              .in('business_id', businessIds)
              .eq('status', 'completed')
              .not('completed_at', 'is', null)
              .order('completed_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),

        // Latest assessment completed by user (client activity)
        ownerIds.length > 0
          ? supabase
              .from('assessments')
              .select('user_id, created_at')
              .in('user_id', ownerIds)
              .eq('status', 'completed')
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),

        // User last login times
        ownerIds.length > 0
          ? supabase
              .from('users')
              .select('id, last_login_at')
              .in('id', ownerIds)
          : Promise.resolve({ data: [], error: null })
      ])

      // Build lookup maps for efficient access
      const weeklyReviewsByBusiness = new Map<string, string>()
      weeklyReviewsResult.data?.forEach(wr => {
        if (!weeklyReviewsByBusiness.has(wr.business_id)) {
          weeklyReviewsByBusiness.set(wr.business_id, wr.completed_at)
        }
      })

      const assessmentsByUser = new Map<string, { score: number; percentage: number; status: string }>()
      assessmentsResult.data?.forEach(a => {
        if (!assessmentsByUser.has(a.user_id)) {
          // Calculate percentage: use stored percentage, or calculate from total_score/total_max
          const percentage = a.percentage ?? Math.round((a.total_score / (a.total_max || 300)) * 100)
          assessmentsByUser.set(a.user_id, {
            score: a.total_score,
            percentage: percentage,
            status: a.health_status
          })
        }
      })

      const openLoopsByUser = new Map<string, number>()
      openLoopsResult.data?.forEach(ol => {
        const count = openLoopsByUser.get(ol.user_id) || 0
        openLoopsByUser.set(ol.user_id, count + 1)
      })

      const issuesByUser = new Map<string, number>()
      issuesResult.data?.forEach(issue => {
        const count = issuesByUser.get(issue.user_id) || 0
        issuesByUser.set(issue.user_id, count + 1)
      })

      // Build completed actions activity map (client completing their commitments)
      const completedActionsByBusiness = new Map<string, string>()
      completedActionsResult.data?.forEach(ca => {
        if (!completedActionsByBusiness.has(ca.business_id) && ca.completed_at) {
          completedActionsByBusiness.set(ca.business_id, ca.completed_at)
        }
      })

      // Build assessment activity map by user
      const assessmentActivityByUser = new Map<string, string>()
      assessmentActivityResult.data?.forEach(aa => {
        if (!assessmentActivityByUser.has(aa.user_id)) {
          assessmentActivityByUser.set(aa.user_id, aa.created_at)
        }
      })

      // Build user login map
      const lastLoginByUser = new Map<string, string>()
      userLoginsResult.data?.forEach(u => {
        if (u.last_login_at) {
          lastLoginByUser.set(u.id, u.last_login_at)
        }
      })

      // Helper to get most recent date from CLIENT activity sources only
      const getMostRecentActivity = (businessId: string, ownerId: string | undefined): string | null => {
        const dates = [
          ownerId ? lastLoginByUser.get(ownerId) : null, // Actual dashboard login
          weeklyReviewsByBusiness.get(businessId), // Client completed weekly review
          completedActionsByBusiness.get(businessId), // Client completed an action
          ownerId ? assessmentActivityByUser.get(ownerId) : null // Client completed assessment
        ].filter(Boolean) as string[]

        if (dates.length === 0) return null
        return dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
      }

      // Build client metrics
      const metrics: ClientMetrics[] = businessesWithProfiles.map(b => {
        const profile = b.business_profiles?.[0]
        const ownerId = b.owner_id
        const revenue = profile?.annual_revenue

        const assessment = ownerId ? assessmentsByUser.get(ownerId) : undefined

        // Get last login from most recent CLIENT activity (weekly review, completed action, assessment)
        const lastActivity = getMostRecentActivity(b.id, ownerId)

        return {
          id: b.id,
          businessName: b.business_name || 'Unnamed Business',
          status: (b.status as ClientMetrics['status']) || 'active',
          lastLogin: lastActivity, // Use most recent CLIENT activity
          lastWeeklyReview: weeklyReviewsByBusiness.get(b.id) || null,
          lastDashboardUpdate: null, // Removed - was tracking coach views, not client activity
          lastAssessmentScore: assessment?.percentage ?? null,
          lastAssessmentStatus: assessment?.status ?? null,
          roadmapLevel: calculateStageFromRevenue(revenue),
          roadmapRevenue: revenue || null,
          openLoopsCount: ownerId ? openLoopsByUser.get(ownerId) || 0 : 0,
          openIssuesCount: ownerId ? issuesByUser.get(ownerId) || 0 : 0,
          industry: profile?.industry || b.industry || undefined
        }
      })

      // Identify clients needing attention
      const attention: { id: string; name: string; reason: string }[] = []
      metrics.forEach(client => {
        if (client.status === 'at-risk') {
          attention.push({
            id: client.id,
            name: client.businessName,
            reason: 'Marked as at-risk'
          })
        } else if (client.lastAssessmentScore !== null && client.lastAssessmentScore < 50) {
          attention.push({
            id: client.id,
            name: client.businessName,
            reason: `Low assessment score (${client.lastAssessmentScore})`
          })
        } else {
          // Check for inactivity
          const dates = [client.lastLogin, client.lastWeeklyReview, client.lastDashboardUpdate]
            .filter(Boolean)
            .map(d => new Date(d!).getTime())

          if (dates.length > 0) {
            const mostRecent = Math.max(...dates)
            const daysSince = Math.floor((Date.now() - mostRecent) / (1000 * 60 * 60 * 24))
            if (daysSince > 14) {
              attention.push({
                id: client.id,
                name: client.businessName,
                reason: `No activity in ${daysSince} days`
              })
            }
          }
        }
      })

      // Build activity feed from recent weekly reviews
      const recentReviews = weeklyReviewsResult.data?.slice(0, 10) || []
      const processedActivities: ActivityItem[] = recentReviews.map((r, idx) => {
        const business = businessesWithProfiles.find(b => b.id === r.business_id)
        return {
          id: `review-${idx}`,
          type: 'session_completed' as const,
          clientId: r.business_id,
          clientName: business?.business_name || 'Unknown',
          description: 'Completed weekly review',
          timestamp: r.completed_at
        }
      })

      setClientMetrics(metrics)
      setStats({
        activeClients: metrics.filter(c => c.status === 'active').length,
        sessionsThisWeek: 0,
        pendingActions: metrics.reduce((sum, c) => sum + c.openLoopsCount + c.openIssuesCount, 0),
        unreadMessages: 0
      })
      setActivities(processedActivities)
      setClientsNeedingAttention(attention)

    } catch (error) {
      console.error('Error loading dashboard:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
          <p className="text-slate-500 text-sm">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 mt-1">Overview of your coaching clients</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => loadDashboardData(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <Link
            href="/coach/clients/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white font-medium rounded-xl hover:bg-teal-700 transition-colors shadow-lg shadow-teal-500/20"
          >
            <Plus className="w-4 h-4" />
            Add Client
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Active Clients"
          value={stats.activeClients}
          icon={Building2}
          iconColor="teal"
          onClick={() => window.location.href = '/coach/clients'}
        />
        <StatsCard
          title="Pending Actions"
          value={stats.pendingActions}
          icon={ListChecks}
          iconColor="amber"
          subtitle="Open loops & issues"
          onClick={() => window.location.href = '/coach/clients'}
        />
        <StatsCard
          title="Sessions This Week"
          value={stats.sessionsThisWeek}
          icon={Calendar}
          iconColor="purple"
          onClick={() => window.location.href = '/coach/schedule'}
        />
        <StatsCard
          title="Unread Messages"
          value={stats.unreadMessages}
          icon={MessageSquare}
          iconColor="blue"
          onClick={() => window.location.href = '/coach/messages'}
        />
      </div>

      {/* Needs Attention Card */}
      {clientsNeedingAttention.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-900">Needs Attention</h2>
                <p className="text-sm text-slate-500">{clientsNeedingAttention.length} clients need your attention</p>
              </div>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {clientsNeedingAttention.slice(0, 5).map((client) => (
              <div key={client.id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-slate-500" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">{client.name}</p>
                    <p className="text-sm text-amber-600">{client.reason}</p>
                  </div>
                </div>
                <Link
                  href={`/coach/clients/${client.id}`}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-700 font-medium text-sm rounded-lg hover:bg-amber-200 transition-colors"
                >
                  View
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Client Overview Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">Client Overview</h2>
          <p className="text-sm text-slate-500 mt-1">Quick view of all your clients' status</p>
        </div>
        <ClientOverviewTable clients={clientMetrics} isLoading={refreshing} />
      </div>

      {/* Activity Feed */}
      {activities.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900">Recent Activity</h2>
            <p className="text-sm text-slate-500 mt-1">Latest updates from your clients</p>
          </div>
          <div className="p-6">
            <ActivityFeed activities={activities} />
          </div>
        </div>
      )}

      {/* Quick Actions Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="font-semibold text-slate-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            href="/coach/clients/new"
            className="group flex items-center gap-4 p-4 rounded-xl border border-slate-200 hover:border-teal-500 hover:bg-teal-50 transition-all"
          >
            <div className="w-12 h-12 bg-teal-100 rounded-xl flex items-center justify-center group-hover:bg-teal-500 transition-colors">
              <Plus className="w-6 h-6 text-teal-600 group-hover:text-white transition-colors" />
            </div>
            <div>
              <p className="font-medium text-slate-900">Add Client</p>
              <p className="text-sm text-slate-500">Onboard new business</p>
            </div>
          </Link>

          <Link
            href="/coach/schedule"
            className="group flex items-center gap-4 p-4 rounded-xl border border-slate-200 hover:border-purple-500 hover:bg-purple-50 transition-all"
          >
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center group-hover:bg-purple-500 transition-colors">
              <Calendar className="w-6 h-6 text-purple-600 group-hover:text-white transition-colors" />
            </div>
            <div>
              <p className="font-medium text-slate-900">Schedule Session</p>
              <p className="text-sm text-slate-500">Book coaching call</p>
            </div>
          </Link>

          <Link
            href="/coach/messages"
            className="group flex items-center gap-4 p-4 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50 transition-all"
          >
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center group-hover:bg-blue-500 transition-colors">
              <MessageSquare className="w-6 h-6 text-blue-600 group-hover:text-white transition-colors" />
            </div>
            <div>
              <p className="font-medium text-slate-900">Messages</p>
              <p className="text-sm text-slate-500">Client conversations</p>
            </div>
          </Link>

          <Link
            href="/coach/reports"
            className="group flex items-center gap-4 p-4 rounded-xl border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50 transition-all"
          >
            <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center group-hover:bg-indigo-500 transition-colors">
              <Users className="w-6 h-6 text-indigo-600 group-hover:text-white transition-colors" />
            </div>
            <div>
              <p className="font-medium text-slate-900">Reports</p>
              <p className="text-sm text-slate-500">Analytics & insights</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}
