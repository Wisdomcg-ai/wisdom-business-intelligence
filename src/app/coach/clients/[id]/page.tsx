'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ClientFileTabs, type TabId } from '@/components/coach/ClientFileTabs'
import { OverviewTab } from '@/components/coach/tabs/OverviewTab'
import { ProfileTab } from '@/components/coach/tabs/ProfileTab'
import { TeamTab } from '@/components/coach/tabs/TeamTab'
import { WeeklyReviewsTab } from '@/components/coach/tabs/WeeklyReviewsTab'
import {
  ArrowLeft,
  Building2,
  MoreHorizontal,
  Loader2,
  AlertTriangle,
  Edit,
  Archive,
  Trash2
} from 'lucide-react'

interface BusinessData {
  id: string
  business_name: string
  industry: string | null
  status: string
  health_score: number | null
  program_type: string | null
  session_frequency: string | null
  engagement_start_date: string | null
  last_session_date: string | null
  website: string | null
  address: string | null
  enabled_modules: {
    plan: boolean
    forecast: boolean
    goals: boolean
    chat: boolean
    documents: boolean
  }
  owner_id: string | null
  // Additional fields for editing
  legal_name: string | null
  years_in_business: number | null
  business_model: string | null
  annual_revenue: number | null
  revenue_growth_rate: number | null
  gross_margin: number | null
  net_margin: number | null
  employee_count: number | null
  total_customers: number | null
  notes: string | null
  owner_name: string | null
  owner_email: string | null
  owner_phone: string | null
}

interface BusinessProfileData {
  id: string
  business_id: string
  business_name: string | null
  company_name: string | null
  industry: string | null
  current_revenue: number | null
  annual_revenue: number | null
  employee_count: number | null
  years_in_operation: number | null
  owner_info: {
    owner_name?: string
    primary_goal?: string
    target_income?: number
    current_hours?: number
    desired_hours?: number
    exit_strategy?: string
    time_horizon?: string
  } | null
  key_roles: Array<{ name: string; title: string; status: string }> | null
  top_challenges: string[] | null
  growth_opportunities: string[] | null
  gross_profit_margin: number | null
  net_profit_margin: number | null
  business_model: string | null
}

export default function ClientFilePage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const clientId = params?.id as string

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [business, setBusiness] = useState<BusinessData | null>(null)
  const [businessProfile, setBusinessProfile] = useState<BusinessProfileData | null>(null)
  const [stats, setStats] = useState({
    pendingActions: 0,
    overdueActions: 0,
    unreadMessages: 0,
    activeGoals: 0,
    completedGoals: 0,
    goalsProgress: 0,
    healthScore: null as number | null,
    ideasStats: null as { total: number; captured: number; underReview: number; approved: number } | null
  })
  const [recentActivity, setRecentActivity] = useState<Array<{
    id: string
    type: 'session' | 'action' | 'message' | 'goal'
    title: string
    timestamp: string
  }>>([])

  const [activeTab, setActiveTab] = useState<TabId>(
    (searchParams?.get('tab') as TabId) || 'overview'
  )
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const supabase = createClient()

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    loadClientData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  useEffect(() => {
    const tab = searchParams?.get('tab') as TabId
    if (tab) setActiveTab(tab)
  }, [searchParams])

  async function loadClientData() {
    try {
      setLoading(true)
      setError(null)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('Not authenticated')
        return
      }

      // Check if user is super_admin
      const { data: roleData } = await supabase
        .from('system_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle()

      const isSuperAdmin = roleData?.role === 'super_admin'

      // Load business data - super_admins can view any client
      let businessQuery = supabase
        .from('businesses')
        .select('*')
        .eq('id', clientId)

      // Only filter by assigned_coach_id if not super_admin
      if (!isSuperAdmin) {
        businessQuery = businessQuery.eq('assigned_coach_id', user.id)
      }

      const { data: businessData, error: businessError } = await businessQuery.single()

      if (businessError || !businessData) {
        setError('Client not found or you do not have access')
        return
      }

      setBusiness(businessData as BusinessData)

      // Load business profile data (for additional details)
      const { data: profileData } = await supabase
        .from('business_profiles')
        .select('*')
        .eq('business_id', clientId)
        .single()

      if (profileData) {
        setBusinessProfile(profileData as BusinessProfileData)
      }

      // Load stats from database - wrap each query in try/catch for resilience
      const ownerId = businessData.owner_id
      let activeGoals = 0
      let completedGoals = 0
      let pendingActions = 0
      let overdueActions = 0
      let unreadMessages = 0
      let healthScore: number | null = null

      console.log('[ClientPage] Loading stats - business:', clientId, 'owner:', ownerId)

      // Store businessProfileId at higher scope for activity queries
      let businessProfileId: string | null = null

      // Ideas stats holder
      let ideasStats: { total: number; captured: number; underReview: number; approved: number } | null = null

      // Only query user-specific data if we have an owner_id
      if (ownerId) {
        // Get latest assessment score for health (use same columns as dashboard)
        try {
          const { data: assessmentData, error: assessmentError } = await supabase
            .from('assessments')
            .select('percentage, total_score, total_max')
            .eq('user_id', ownerId)
            .eq('status', 'completed')
            .order('created_at', { ascending: false })
            .limit(1)

          console.log('[ClientPage] Assessment:', { data: assessmentData, error: assessmentError?.message })
          if (!assessmentError && assessmentData?.[0]) {
            // Use percentage if available, otherwise calculate from total_score/total_max
            healthScore = assessmentData[0].percentage ??
              Math.round((assessmentData[0].total_score / (assessmentData[0].total_max || 300)) * 100)
          }
        } catch (e) {
          console.log('Could not load assessment data:', e)
        }

        // Get business_profiles.id for goals queries
        try {
          const { data: bpData, error: bpError } = await supabase
            .from('business_profiles')
            .select('id')
            .eq('user_id', ownerId)
            .limit(1)

          console.log('[ClientPage] Business profile:', { data: bpData, error: bpError?.message })

          if (!bpError && bpData?.[0]?.id) {
            businessProfileId = bpData[0].id

            // Count strategic initiatives as goals
            const { data: initiatives, error: initError } = await supabase
              .from('strategic_initiatives')
              .select('id, status')
              .eq('business_id', businessProfileId)
              .in('step_type', ['twelve_month', 'q1', 'q2', 'q3', 'q4'])

            console.log('[ClientPage] Initiatives:', { count: initiatives?.length, error: initError?.message, data: initiatives })

            if (!initError && initiatives) {
              // status can be: 'not_started', 'in_progress', 'completed', 'blocked'
              completedGoals = initiatives.filter((i: any) => i.status === 'completed').length
              activeGoals = initiatives.filter((i: any) => i.status !== 'completed').length
            }
          }
        } catch (e) {
          console.log('Could not load goals data:', e)
        }
      } else {
        console.log('[ClientPage] No owner_id, skipping user queries')
      }

      // Get pending/overdue actions (uses clientId, not ownerId)
      // Note: action_items table may not exist yet
      try {
        const { data: actionsData, error: actionsError } = await supabase
          .from('action_items')
          .select('id, status, due_date')
          .eq('business_id', clientId)
          .in('status', ['pending', 'in_progress'])

        if (!actionsError && actionsData) {
          const now = new Date()
          pendingActions = actionsData.length
          overdueActions = actionsData.filter((a: any) =>
            a.due_date && new Date(a.due_date) < now
          ).length
        }
      } catch (e) {
        // Table may not exist - ignore
      }

      // Messages table doesn't exist yet - skip query to avoid 400 errors
      // TODO: Uncomment when messages table is created
      // try {
      //   const { data: messagesData, error: messagesError } = await supabase
      //     .from('messages')
      //     .select('id')
      //     .eq('business_id', clientId)
      //     .eq('is_read', false)
      //   if (!messagesError && messagesData) {
      //     unreadMessages = messagesData.length
      //   }
      // } catch (e) { }

      const totalGoals = activeGoals + completedGoals
      const goalsProgress = totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0

      // Fetch recent activity for this client - comprehensive tracking
      const activities: Array<{ id: string; type: 'session' | 'action' | 'message' | 'goal'; title: string; timestamp: string }> = []

      if (ownerId) {
        // Get recent weekly reviews
        try {
          const { data: reviews } = await supabase
            .from('weekly_reviews')
            .select('id, completed_at, created_at')
            .eq('business_id', clientId)
            .order('created_at', { ascending: false })
            .limit(5)

          reviews?.forEach(r => {
            const timestamp = r.completed_at || r.created_at
            if (timestamp) {
              activities.push({
                id: `review-${r.id}`,
                type: 'session',
                title: r.completed_at ? 'Completed weekly review' : 'Started weekly review',
                timestamp
              })
            }
          })
        } catch (e) { /* Ignore */ }

        // Get recent assessments
        try {
          const { data: assessments } = await supabase
            .from('assessments')
            .select('id, created_at, percentage')
            .eq('user_id', ownerId)
            .eq('status', 'completed')
            .order('created_at', { ascending: false })
            .limit(3)

          assessments?.forEach(a => {
            activities.push({
              id: `assessment-${a.id}`,
              type: 'goal',
              title: `Completed assessment (${a.percentage}%)`,
              timestamp: a.created_at
            })
          })
        } catch (e) { /* Ignore */ }

        // Get recent open loops (created or updated)
        try {
          const { data: loops } = await supabase
            .from('open_loops')
            .select('id, title, created_at, updated_at, archived')
            .eq('user_id', ownerId)
            .order('updated_at', { ascending: false })
            .limit(5)

          loops?.forEach(l => {
            activities.push({
              id: `loop-${l.id}`,
              type: 'action',
              title: l.archived ? `Completed: ${l.title}` : `Open loop: ${l.title}`,
              timestamp: l.updated_at || l.created_at
            })
          })
        } catch (e) { /* Ignore */ }

        // Get recent issues
        try {
          const { data: issues } = await supabase
            .from('issues_list')
            .select('id, title, created_at, updated_at, status')
            .eq('user_id', ownerId)
            .order('updated_at', { ascending: false })
            .limit(5)

          issues?.forEach(i => {
            const issueTitle = i.title?.substring(0, 50) || 'Issue'
            activities.push({
              id: `issue-${i.id}`,
              type: 'action',
              title: i.status === 'solved' ? `Solved: ${issueTitle}` : `Issue: ${issueTitle}`,
              timestamp: i.updated_at || i.created_at
            })
          })
        } catch (e) { /* Ignore */ }

        // Get recent strategic initiatives updates
        if (businessProfileId) {
          try {
            const { data: initiatives } = await supabase
              .from('strategic_initiatives')
              .select('id, title, created_at, updated_at, status')
              .eq('business_id', businessProfileId)
              .order('updated_at', { ascending: false })
              .limit(5)

            initiatives?.forEach(i => {
              if (i.updated_at && i.updated_at !== i.created_at) {
                activities.push({
                  id: `init-${i.id}`,
                  type: 'goal',
                  title: `Updated: ${i.title?.substring(0, 40) || 'Initiative'}`,
                  timestamp: i.updated_at
                })
              }
            })
          } catch (e) { /* Ignore */ }
        }

        // stop_doing_list table doesn't exist yet - skip to avoid 404 errors
        // TODO: Uncomment when stop_doing_list table is created
        // try {
        //   const { data: stopItems } = await supabase
        //     .from('stop_doing_list')
        //     .select('id, item, created_at')
        //     .eq('user_id', ownerId)
        //     .order('created_at', { ascending: false })
        //     .limit(3)
        //   stopItems?.forEach(s => {
        //     activities.push({
        //       id: `stop-${s.id}`,
        //       type: 'action',
        //       title: `Added to stop doing: ${s.item?.substring(0, 40) || 'Item'}`,
        //       timestamp: s.created_at
        //     })
        //   })
        // } catch (e) { /* Ignore */ }

        // Get business profile updates (dashboard stats)
        if (businessProfileId) {
          try {
            const { data: profile, error: profileError } = await supabase
              .from('business_profiles')
              .select('id, updated_at, created_at')
              .eq('id', businessProfileId)
              .limit(1)

            console.log('[ClientPage] Business profile update check:', {
              profile: profile?.[0],
              error: profileError?.message,
              hasUpdate: profile?.[0]?.updated_at !== profile?.[0]?.created_at
            })

            if (profile?.[0]?.updated_at && profile[0].updated_at !== profile[0].created_at) {
              activities.push({
                id: `profile-${profile[0].id}`,
                type: 'goal',
                title: 'Updated business dashboard',
                timestamp: profile[0].updated_at
              })
            }
          } catch (e) { /* Ignore */ }
        }

        // Get SWOT analysis updates (business_id = user_id in this table)
        try {
          const { data: swot } = await supabase
            .from('swot_analyses')
            .select('id, updated_at, created_at')
            .eq('business_id', ownerId)
            .order('updated_at', { ascending: false })
            .limit(1)

          if (swot?.[0]?.updated_at && swot[0].updated_at !== swot[0].created_at) {
            activities.push({
              id: `swot-${swot[0].id}`,
              type: 'goal',
              title: 'Updated SWOT analysis',
              timestamp: swot[0].updated_at
            })
          }
        } catch (e) { /* Ignore */ }

        // Get ideas stats and activity
        try {
          const { data: ideas } = await supabase
            .from('ideas')
            .select('id, title, status, created_at, updated_at')
            .eq('user_id', ownerId)
            .eq('archived', false)

          if (ideas && ideas.length > 0) {
            // Calculate ideas stats
            ideasStats = {
              total: ideas.length,
              captured: ideas.filter((i: any) => i.status === 'captured').length,
              underReview: ideas.filter((i: any) => i.status === 'under_review').length,
              approved: ideas.filter((i: any) => i.status === 'approved').length
            }

            // Add recent ideas to activity
            ideas.slice(0, 5).forEach((idea: any) => {
              activities.push({
                id: `idea-${idea.id}`,
                type: 'goal',
                title: `Captured idea: ${idea.title?.substring(0, 40) || 'New idea'}`,
                timestamp: idea.created_at
              })
            })
          }
        } catch (e) { /* Ideas table may not exist yet */ }

        // Get Vision targets updates
        try {
          const { data: vision } = await supabase
            .from('vision_targets')
            .select('id, updated_at, created_at')
            .eq('user_id', ownerId)
            .order('updated_at', { ascending: false })
            .limit(1)

          if (vision?.[0]?.updated_at && vision[0].updated_at !== vision[0].created_at) {
            activities.push({
              id: `vision-${vision[0].id}`,
              type: 'goal',
              title: 'Updated Vision targets',
              timestamp: vision[0].updated_at
            })
          }
        } catch (e) { /* Ignore */ }

        // Financial Forecast updates - disabled until RLS policy is fixed
        // TODO: Run the RLS fix migration then uncomment this
        // if (businessProfileId) {
        //   try {
        //     const { data: forecasts } = await supabase
        //       .from('financial_forecasts')
        //       .select('id, updated_at, created_at')
        //       .eq('business_id', businessProfileId)
        //       .order('updated_at', { ascending: false })
        //       .limit(1)
        //     if (forecasts?.[0]?.updated_at && forecasts[0].updated_at !== forecasts[0].created_at) {
        //       activities.push({
        //         id: `forecast-${forecasts[0].id}`,
        //         type: 'goal',
        //         title: 'Updated financial forecast',
        //         timestamp: forecasts[0].updated_at
        //       })
        //     }
        //   } catch (e) { /* Ignore */ }
        // }

        // Get recent weekly metrics snapshots (business dashboard updates)
        if (businessProfileId) {
          try {
            const { data: snapshots, error: snapshotsError } = await supabase
              .from('weekly_metrics_snapshots')
              .select('id, week_ending_date, updated_at, created_at')
              .eq('business_id', businessProfileId)
              .order('updated_at', { ascending: false })
              .limit(5)

            console.log('[ClientPage] Weekly metrics snapshots:', { count: snapshots?.length, error: snapshotsError?.message })

            snapshots?.forEach(s => {
              // Only show if it was updated (has actual data entered)
              if (s.updated_at && s.updated_at !== s.created_at) {
                activities.push({
                  id: `metrics-${s.id}`,
                  type: 'goal',
                  title: `Updated dashboard metrics (week ${s.week_ending_date})`,
                  timestamp: s.updated_at
                })
              }
            })
          } catch (e) { /* Ignore */ }
        }
      }

      // Sort all activities by timestamp (most recent first) and take top 10
      activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      const recentActivities = activities.slice(0, 10)
      setRecentActivity(recentActivities)
      console.log('[ClientPage] Recent activity:', recentActivities.length, 'items')

      console.log('[ClientPage] Final stats:', { activeGoals, completedGoals, goalsProgress, healthScore, pendingActions, activityCount: activities.length })

      setStats({
        pendingActions,
        overdueActions,
        unreadMessages,
        activeGoals,
        completedGoals,
        goalsProgress,
        healthScore,
        ideasStats
      })

    } catch (err) {
      console.error('Error loading client:', err)
      setError('Failed to load client data')
    } finally {
      setLoading(false)
    }
  }

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab)
    router.push(`/coach/clients/${clientId}?tab=${tab}`, { scroll: false })
  }

  const handleSaveProfile = async (data: {
    businessName?: string
    industry?: string
    ownerPhone?: string
    website?: string
    address?: string
    programType?: string
    sessionFrequency?: string
    notes?: string
    legalName?: string
    yearsInBusiness?: number
    businessModel?: string
    annualRevenue?: number
    revenueGrowthRate?: number
    grossMargin?: number
    netMargin?: number
    employeeCount?: number
    totalCustomers?: number
    engagementStartDate?: string
  }) => {
    const { error } = await supabase
      .from('businesses')
      .update({
        business_name: data.businessName,
        industry: data.industry,
        website: data.website,
        address: data.address,
        program_type: data.programType,
        session_frequency: data.sessionFrequency,
        notes: data.notes,
        legal_name: data.legalName,
        years_in_business: data.yearsInBusiness,
        business_model: data.businessModel,
        annual_revenue: data.annualRevenue,
        revenue_growth_rate: data.revenueGrowthRate,
        gross_margin: data.grossMargin,
        net_margin: data.netMargin,
        employee_count: data.employeeCount,
        total_customers: data.totalCustomers,
        engagement_start_date: data.engagementStartDate,
        updated_at: new Date().toISOString()
      })
      .eq('id', clientId)

    if (error) {
      console.error('Error saving profile:', error)
      throw error
    }

    // Reload the data to reflect changes
    await loadClientData()
  }

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-gray-500">Loading client...</p>
        </div>
      </div>
    )
  }

  if (error || !business) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">Error</h3>
          <p className="text-gray-500 mb-4">{error || 'Client not found'}</p>
          <Link
            href="/coach/clients"
            className="text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Back to Clients
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-50">
      {/* Client Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/coach/clients"
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-slate-600" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">{business.business_name}</h1>
                  <div className="flex items-center gap-3 text-sm text-gray-500">
                    {(businessProfile?.industry || business.industry) && (
                      <span>{businessProfile?.industry || business.industry}</span>
                    )}
                    {businessProfile?.annual_revenue && (
                      <>
                        <span>&middot;</span>
                        <span>${(businessProfile.annual_revenue / 1000).toFixed(0)}k revenue</span>
                      </>
                    )}
                    {businessProfile?.employee_count && (
                      <>
                        <span>&middot;</span>
                        <span>{businessProfile.employee_count} employees</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                business.status === 'active'
                  ? 'bg-green-100 text-green-700'
                  : business.status === 'at-risk'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-yellow-100 text-yellow-700'
              }`}>
                {business.status}
              </span>
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <MoreHorizontal className="w-5 h-5" />
                </button>

                {showMenu && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50">
                    <button
                      onClick={() => {
                        setShowMenu(false)
                        handleTabChange('profile')
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <Edit className="w-4 h-4" />
                      Edit Client Details
                    </button>
                    <div className="border-t border-gray-100 my-2" />
                    <button
                      onClick={() => {
                        setShowMenu(false)
                        // TODO: Archive client
                        console.log('Archive client')
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-sm text-yellow-700 hover:bg-yellow-50"
                    >
                      <Archive className="w-4 h-4" />
                      Archive Client
                    </button>
                    <button
                      onClick={() => {
                        setShowMenu(false)
                        // TODO: Delete client with confirmation
                        console.log('Delete client')
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete Client
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <ClientFileTabs
          activeTab={activeTab}
          onTabChange={handleTabChange}
          badges={{
            actions: stats.pendingActions,
            messages: stats.unreadMessages
          }}
          enabledModules={business.enabled_modules}
        />
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'overview' && (
          <div className="p-6 space-y-6">
            {/* Business Summary Card - using data from businesses table */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Business Summary</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <p className="text-sm text-gray-500">Annual Revenue</p>
                  <p className="text-xl font-bold text-gray-900">
                    ${((business as any).annual_revenue || 0).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Gross Margin</p>
                  <p className="text-xl font-bold text-gray-900">
                    {(business as any).gross_margin ? `${(business as any).gross_margin}%` : '--'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Net Margin</p>
                  <p className="text-xl font-bold text-gray-900">
                    {(business as any).net_margin ? `${(business as any).net_margin}%` : '--'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Team Size</p>
                  <p className="text-xl font-bold text-gray-900">
                    {(business as any).employee_count || '--'} people
                  </p>
                </div>
              </div>
              {/* Additional business info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-6 pt-6 border-t border-gray-100">
                <div>
                  <p className="text-sm text-gray-500">Years in Business</p>
                  <p className="text-base font-medium text-gray-900">
                    {(business as any).years_in_business || '--'} years
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Business Model</p>
                  <p className="text-base font-medium text-gray-900">
                    {(business as any).business_model || '--'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Revenue Growth</p>
                  <p className="text-base font-medium text-green-600">
                    {(business as any).revenue_growth_rate ? `+${(business as any).revenue_growth_rate}%` : '--'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Total Customers</p>
                  <p className="text-base font-medium text-gray-900">
                    {(business as any).total_customers || '--'}
                  </p>
                </div>
              </div>
            </div>

            {/* Products/Services */}
            {(business as any).products_services && (business as any).products_services.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Products & Services</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {(business as any).products_services.map((item: any, idx: number) => (
                    <div key={idx} className="bg-gray-50 rounded-lg p-4">
                      <p className="font-medium text-gray-900">{item.name}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-sm text-gray-500">{item.type}</span>
                        <span className="text-sm font-medium text-indigo-600">{item.revenue_percentage}% of revenue</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Challenges & Opportunities - using data from businesses table */}
            {((business as any).top_challenges?.length > 0 || (business as any).growth_opportunities?.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {(business as any).top_challenges && (business as any).top_challenges.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Challenges</h3>
                    <ul className="space-y-2">
                      {(business as any).top_challenges.map((challenge: string, idx: number) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-red-500 mt-1">•</span>
                          <span className="text-gray-700">{challenge}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {(business as any).growth_opportunities && (business as any).growth_opportunities.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Growth Opportunities</h3>
                    <ul className="space-y-2">
                      {(business as any).growth_opportunities.map((opportunity: string, idx: number) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-green-500 mt-1">•</span>
                          <span className="text-gray-700">{opportunity}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Original Overview Stats - for health, goals, actions */}
            <OverviewTab
              clientId={clientId}
              businessName={business.business_name}
              healthScore={stats.healthScore ?? undefined}
              goalsProgress={stats.goalsProgress}
              activeGoals={stats.activeGoals}
              completedGoals={stats.completedGoals}
              pendingActions={stats.pendingActions}
              overdueActions={stats.overdueActions}
              unreadMessages={stats.unreadMessages}
              recentActivity={recentActivity}
              ideasStats={stats.ideasStats ?? undefined}
            />
          </div>
        )}

        {activeTab === 'profile' && (
          <ProfileTab
            clientId={clientId}
            businessName={business.business_name}
            industry={businessProfile?.industry || business.industry || undefined}
            ownerName={business.owner_name || businessProfile?.owner_info?.owner_name}
            ownerEmail={business.owner_email || undefined}
            ownerPhone={business.owner_phone || undefined}
            website={business.website || undefined}
            address={business.address || undefined}
            programType={business.program_type || undefined}
            sessionFrequency={business.session_frequency || undefined}
            engagementStartDate={business.engagement_start_date || undefined}
            // Additional business fields
            legalName={business.legal_name || undefined}
            yearsInBusiness={business.years_in_business || undefined}
            businessModel={business.business_model || undefined}
            annualRevenue={business.annual_revenue || undefined}
            revenueGrowthRate={business.revenue_growth_rate || undefined}
            grossMargin={business.gross_margin || undefined}
            netMargin={business.net_margin || undefined}
            employeeCount={business.employee_count || undefined}
            totalCustomers={business.total_customers || undefined}
            notes={business.notes || undefined}
            onSave={handleSaveProfile}
          />
        )}

        {activeTab === 'team' && (
          <TeamTab
            clientId={clientId}
            businessName={business.business_name}
          />
        )}

        {activeTab === 'weekly-reviews' && (
          <WeeklyReviewsTab
            businessId={clientId}
            businessName={business.business_name}
          />
        )}

        {activeTab === 'goals' && (
          <div className="p-6">
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <p className="text-gray-500">Goals & Planning tab - links to existing goals system</p>
              <Link
                href={`/coach/clients/${clientId}/goals`}
                className="mt-4 inline-block text-indigo-600 hover:text-indigo-700 font-medium"
              >
                Go to Goals & Planning
              </Link>
            </div>
          </div>
        )}

        {activeTab === 'financials' && (
          <div className="p-6">
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <p className="text-gray-500">Financials tab - links to existing forecast system</p>
              <Link
                href={`/coach/clients/${clientId}/forecast`}
                className="mt-4 inline-block text-indigo-600 hover:text-indigo-700 font-medium"
              >
                Go to Financial Forecast
              </Link>
            </div>
          </div>
        )}

        {activeTab === 'actions' && (
          <div className="p-6">
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <p className="text-gray-500">Actions tab coming soon</p>
            </div>
          </div>
        )}

        {activeTab === 'documents' && (
          <div className="p-6">
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <p className="text-gray-500">Documents tab coming soon</p>
            </div>
          </div>
        )}

        {activeTab === 'messages' && (
          <div className="p-6">
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <p className="text-gray-500">Messages tab coming soon</p>
            </div>
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="p-6">
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <p className="text-gray-500">Private notes tab coming soon</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
