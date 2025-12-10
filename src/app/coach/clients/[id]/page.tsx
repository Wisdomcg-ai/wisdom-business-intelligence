'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ClientFileTabs, type TabId } from '@/components/coach/ClientFileTabs'
import { OverviewTab } from '@/components/coach/tabs/OverviewTab'
import { ProfileTab } from '@/components/coach/tabs/ProfileTab'
import { TeamTab } from '@/components/coach/tabs/TeamTab'
import { WeeklyReviewsTab } from '@/components/coach/tabs/WeeklyReviewsTab'
import { ClientActivityLog } from '@/components/coach/ClientActivityLog'
import PageHeader from '@/components/ui/PageHeader'
import {
  Building2,
  MoreHorizontal,
  Loader2,
  AlertTriangle,
  Edit,
  Archive,
  Trash2,
  RefreshCw
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
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null)

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
    const tab = searchParams?.get('tab') as TabId
    if (tab) setActiveTab(tab)
  }, [searchParams])

  // Store loadClientData in a ref so subscriptions can call it
  const loadDataRef = useRef<() => Promise<void>>()

  // Manual refresh handler
  const handleManualRefresh = useCallback(async () => {
    setIsRefreshing(true)
    if (loadDataRef.current) await loadDataRef.current()
    setLastUpdated(new Date())
    setIsRefreshing(false)
  }, [])

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
      // Try both user_id (owner) AND business_id linkages
      const ownerId = businessData.owner_id
      let profileData = null

      // First try by user_id (owner)
      if (ownerId) {
        const { data: fetchedProfile } = await supabase
          .from('business_profiles')
          .select('*')
          .eq('user_id', ownerId)
          .maybeSingle()

        profileData = fetchedProfile
      }

      // Fallback: try by business_id if no profile found by user_id
      if (!profileData) {
        const { data: fetchedByBusinessId } = await supabase
          .from('business_profiles')
          .select('*')
          .eq('business_id', clientId)
          .maybeSingle()

        if (fetchedByBusinessId) {
          profileData = fetchedByBusinessId
          console.log('[ClientPage] Found profile by business_id instead of user_id')
        }
      }

      if (profileData) {
        setBusinessProfile(profileData as BusinessProfileData)
      }

      console.log('[ClientPage] Profile lookup - ownerId:', ownerId, 'found profileData:', !!profileData, 'profileId:', profileData?.id)

      // Load stats from database - wrap each query in try/catch for resilience
      // Collect ALL possible user IDs from all sources - the assessment might be under any of them
      const possibleUserIds: string[] = []

      // Source 1: owner_id from business
      if (ownerId) {
        possibleUserIds.push(ownerId)
      }

      // Source 2: user_id from business_profiles (found by business_id)
      if ((profileData as any)?.user_id) {
        const profileUserId = (profileData as any).user_id
        if (!possibleUserIds.includes(profileUserId)) {
          possibleUserIds.push(profileUserId)
        }
      }

      // Source 3: ALL users from business_users table
      try {
        const { data: businessUsers } = await supabase
          .from('business_users')
          .select('user_id')
          .eq('business_id', clientId)

        if (businessUsers && businessUsers.length > 0) {
          businessUsers.forEach((bu: any) => {
            if (bu.user_id && !possibleUserIds.includes(bu.user_id)) {
              possibleUserIds.push(bu.user_id)
            }
          })
          console.log('[ClientPage] Found users via business_users table:', businessUsers.map((bu: any) => bu.user_id))
        }
      } catch (e) {
        console.log('[ClientPage] Could not query business_users:', e)
      }

      // Source 4: Look up user by owner_email from the users table
      if (businessData.owner_email) {
        try {
          const { data: userByEmail } = await supabase
            .from('users')
            .select('id')
            .eq('email', businessData.owner_email)
            .maybeSingle()

          if (userByEmail?.id && !possibleUserIds.includes(userByEmail.id)) {
            possibleUserIds.push(userByEmail.id)
            console.log('[ClientPage] Found user by owner_email:', businessData.owner_email, '-> user_id:', userByEmail.id)
          }
        } catch (e) {
          console.log('[ClientPage] Could not query users by email:', e)
        }
      }

      // Source 5: Look up user by business_name match in business_profiles
      // This catches cases where the client created a profile with the same business name
      if (businessData.name) {
        try {
          const { data: profilesByName } = await supabase
            .from('business_profiles')
            .select('user_id')
            .ilike('business_name', businessData.name)

          if (profilesByName && profilesByName.length > 0) {
            profilesByName.forEach((p: any) => {
              if (p.user_id && !possibleUserIds.includes(p.user_id)) {
                possibleUserIds.push(p.user_id)
                console.log('[ClientPage] Found user by business_name match:', businessData.name, '-> user_id:', p.user_id)
              }
            })
          }
        } catch (e) {
          console.log('[ClientPage] Could not query business_profiles by name:', e)
        }
      }

      console.log('[ClientPage] All possible user IDs for business:', clientId, ':', possibleUserIds)

      // Use first user ID as the "effective" one for other queries
      const effectiveUserId = possibleUserIds[0] || null

      let activeGoals = 0
      let completedGoals = 0
      let pendingActions = 0
      let overdueActions = 0
      let unreadMessages = 0
      let healthScore: number | null = null

      console.log('[ClientPage] Loading stats - business:', clientId, 'possibleUserIds:', possibleUserIds, 'effectiveUserId:', effectiveUserId)

      // Store businessProfileId at higher scope for activity queries
      let businessProfileId: string | null = null

      // Ideas stats holder
      let ideasStats: { total: number; captured: number; underReview: number; approved: number } | null = null

      // Only query user-specific data if we have users to query for
      if (possibleUserIds.length > 0) {
        // Get latest assessment score for health (use same columns as dashboard)
        // Query for ANY of the possible user IDs linked to this business
        try {
          const { data: assessmentData, error: assessmentError } = await supabase
            .from('assessments')
            .select('percentage, total_score, total_max, user_id')
            .in('user_id', possibleUserIds)
            .eq('status', 'completed')
            .order('created_at', { ascending: false })
            .limit(1)

          console.log('[ClientPage] Assessment query for users:', possibleUserIds, '- result:', { data: assessmentData, error: assessmentError?.message })
          if (!assessmentError && assessmentData?.[0]) {
            // Use percentage if available, otherwise calculate from total_score/total_max
            healthScore = assessmentData[0].percentage ??
              Math.round((assessmentData[0].total_score / (assessmentData[0].total_max || 300)) * 100)
          }
        } catch (e) {
          console.log('Could not load assessment data:', e)
        }

        // Use the business_profiles.id from our earlier query for goals/initiatives
        // profileData was already fetched above using user_id = ownerId
        if (profileData?.id) {
          businessProfileId = profileData.id
          console.log('[ClientPage] Using business profile from earlier query:', businessProfileId)

          try {
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
          } catch (e) {
            console.log('Could not load goals data:', e)
          }
        }
      } else {
        console.log('[ClientPage] No effectiveUserId, skipping user queries')
      }

      // Get pending/overdue actions (uses clientId, not effectiveUserId)
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

      if (effectiveUserId) {
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
            .eq('user_id', effectiveUserId)
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
            .eq('user_id', effectiveUserId)
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
            .eq('user_id', effectiveUserId)
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
        //     .eq('user_id', effectiveUserId)
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
            .eq('business_id', effectiveUserId)
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
            .eq('user_id', effectiveUserId)
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
            .eq('user_id', effectiveUserId)
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

  // Store loadClientData in ref for subscriptions
  loadDataRef.current = loadClientData

  // Initial data load
  useEffect(() => {
    loadClientData()
    setLastUpdated(new Date())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  // Real-time subscriptions for live updates
  useEffect(() => {
    if (!clientId) return

    console.log('[CoachPortal] Setting up real-time subscriptions for client:', clientId)

    // Function to refresh data silently
    const refreshData = async () => {
      if (loadDataRef.current) {
        await loadDataRef.current()
        setLastUpdated(new Date())
      }
    }

    // Subscribe to changes on key tables
    const channel = supabase
      .channel(`coach-client-${clientId}`)
      // Business profile changes
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'business_profiles',
          filter: `business_id=eq.${clientId}`
        },
        (payload) => {
          console.log('[CoachPortal] Business profile change detected:', payload.eventType)
          refreshData()
        }
      )
      // Strategic initiatives changes
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'strategic_initiatives'
        },
        (payload) => {
          console.log('[CoachPortal] Initiative change detected:', payload.eventType)
          refreshData()
        }
      )
      // Weekly reviews changes
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'weekly_reviews',
          filter: `business_id=eq.${clientId}`
        },
        (payload) => {
          console.log('[CoachPortal] Weekly review change detected:', payload.eventType)
          refreshData()
        }
      )
      // Audit log changes (for activity feed)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'audit_log',
          filter: `business_id=eq.${clientId}`
        },
        (payload) => {
          console.log('[CoachPortal] Audit log entry detected:', payload.eventType)
          refreshData()
        }
      )
      // Core values changes
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'core_values'
        },
        (payload) => {
          console.log('[CoachPortal] Core values change detected:', payload.eventType)
          refreshData()
        }
      )
      // SWOT analysis changes
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'swot_analyses'
        },
        (payload) => {
          console.log('[CoachPortal] SWOT change detected:', payload.eventType)
          refreshData()
        }
      )
      // Vision targets changes
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vision_targets'
        },
        (payload) => {
          console.log('[CoachPortal] Vision targets change detected:', payload.eventType)
          refreshData()
        }
      )
      .subscribe((status) => {
        console.log('[CoachPortal] Subscription status:', status)
      })

    // Auto-refresh every 30 seconds as fallback (in case subscriptions miss something)
    refreshIntervalRef.current = setInterval(() => {
      console.log('[CoachPortal] Auto-refresh triggered')
      refreshData()
    }, 30000)

    return () => {
      console.log('[CoachPortal] Cleaning up subscriptions')
      supabase.removeChannel(channel)
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
      }
    }
  }, [clientId, supabase])

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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="min-h-[400px] flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-brand-orange mx-auto mb-4" />
            <p className="text-sm sm:text-base text-gray-500">Loading client...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error || !business) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="min-h-[400px] flex items-center justify-center">
          <div className="text-center">
            <AlertTriangle className="w-10 h-10 sm:w-12 sm:h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-1">Error</h3>
            <p className="text-sm sm:text-base text-gray-500 mb-4">{error || 'Client not found'}</p>
            <Link
              href="/coach/clients"
              className="text-sm sm:text-base text-brand-orange hover:text-brand-orange-700 font-medium"
            >
              Back to Clients
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Build subtitle with business info
  const subtitleParts = []
  if (businessProfile?.industry || business.industry) {
    subtitleParts.push(businessProfile?.industry || business.industry)
  }
  if (businessProfile?.annual_revenue) {
    subtitleParts.push(`$${(businessProfile.annual_revenue / 1000).toFixed(0)}k revenue`)
  }
  if (businessProfile?.employee_count) {
    subtitleParts.push(`${businessProfile.employee_count} employees`)
  }

  // Status badge component
  const statusBadge = (
    <span className={`px-3 py-1 rounded-full text-xs sm:text-sm font-medium ${
      business.status === 'active'
        ? 'bg-green-100 text-green-700'
        : business.status === 'at-risk'
          ? 'bg-red-100 text-red-700'
          : 'bg-yellow-100 text-yellow-700'
    }`}>
      {business.status}
    </span>
  )

  // Actions menu component
  const actionsMenu = (
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
  )

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        {/* Header */}
        <PageHeader
          variant="banner"
          title={business.business_name}
          subtitle={subtitleParts.join(' • ')}
          icon={Building2}
          backLink={{ href: '/coach/clients', label: 'Back to Clients' }}
          actions={
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Live update indicator */}
              <div className="hidden sm:flex items-center gap-2 text-xs text-gray-500">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span>Live</span>
                {lastUpdated && (
                  <span className="text-gray-400">
                    Updated {lastUpdated.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
              {/* Manual refresh button */}
              <button
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                title="Refresh data"
              >
                <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
              {statusBadge}
              {actionsMenu}
            </div>
          }
        />

        {/* Tabs */}
        <div className="bg-white border-b border-gray-200 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8">
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
      </div>

      {/* Tab Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        {activeTab === 'overview' && (
          <div className="space-y-4 sm:space-y-6">
            {/* Business Summary Card - using data from businesses table */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-4">Business Summary</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                <div>
                  <p className="text-xs sm:text-sm text-gray-500">Annual Revenue</p>
                  <p className="text-lg sm:text-xl font-bold text-gray-900">
                    ${((business as any).annual_revenue || 0).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs sm:text-sm text-gray-500">Gross Margin</p>
                  <p className="text-lg sm:text-xl font-bold text-gray-900">
                    {(business as any).gross_margin ? `${(business as any).gross_margin}%` : '--'}
                  </p>
                </div>
                <div>
                  <p className="text-xs sm:text-sm text-gray-500">Net Margin</p>
                  <p className="text-lg sm:text-xl font-bold text-gray-900">
                    {(business as any).net_margin ? `${(business as any).net_margin}%` : '--'}
                  </p>
                </div>
                <div>
                  <p className="text-xs sm:text-sm text-gray-500">Team Size</p>
                  <p className="text-lg sm:text-xl font-bold text-gray-900">
                    {(business as any).employee_count || '--'} people
                  </p>
                </div>
              </div>
              {/* Additional business info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-gray-100">
                <div>
                  <p className="text-xs sm:text-sm text-gray-500">Years in Business</p>
                  <p className="text-sm sm:text-base font-medium text-gray-900">
                    {(business as any).years_in_business || '--'} years
                  </p>
                </div>
                <div>
                  <p className="text-xs sm:text-sm text-gray-500">Business Model</p>
                  <p className="text-sm sm:text-base font-medium text-gray-900">
                    {(business as any).business_model || '--'}
                  </p>
                </div>
                <div>
                  <p className="text-xs sm:text-sm text-gray-500">Revenue Growth</p>
                  <p className="text-sm sm:text-base font-medium text-green-600">
                    {(business as any).revenue_growth_rate ? `+${(business as any).revenue_growth_rate}%` : '--'}
                  </p>
                </div>
                <div>
                  <p className="text-xs sm:text-sm text-gray-500">Total Customers</p>
                  <p className="text-sm sm:text-base font-medium text-gray-900">
                    {(business as any).total_customers || '--'}
                  </p>
                </div>
              </div>
            </div>

            {/* Products/Services */}
            {(business as any).products_services && (business as any).products_services.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-4">Products & Services</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  {(business as any).products_services.map((item: any, idx: number) => (
                    <div key={idx} className="bg-gray-50 rounded-lg p-3 sm:p-4">
                      <p className="text-sm sm:text-base font-medium text-gray-900">{item.name}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs sm:text-sm text-gray-500">{item.type}</span>
                        <span className="text-xs sm:text-sm font-medium text-brand-orange">{item.revenue_percentage}% of revenue</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Challenges & Opportunities - using data from businesses table */}
            {((business as any).top_challenges?.length > 0 || (business as any).growth_opportunities?.length > 0) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                {(business as any).top_challenges && (business as any).top_challenges.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
                    <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-4">Top Challenges</h3>
                    <ul className="space-y-2">
                      {(business as any).top_challenges.map((challenge: string, idx: number) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-red-500 mt-1">•</span>
                          <span className="text-sm sm:text-base text-gray-700">{challenge}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {(business as any).growth_opportunities && (business as any).growth_opportunities.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
                    <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-4">Growth Opportunities</h3>
                    <ul className="space-y-2">
                      {(business as any).growth_opportunities.map((opportunity: string, idx: number) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-green-500 mt-1">•</span>
                          <span className="text-sm sm:text-base text-gray-700">{opportunity}</span>
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
          <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8 text-center">
            <p className="text-sm sm:text-base text-gray-500">Goals & Planning tab - links to existing goals system</p>
            <Link
              href={`/coach/clients/${clientId}/goals`}
              className="mt-4 inline-block text-sm sm:text-base text-brand-orange hover:text-brand-orange-700 font-medium"
            >
              Go to Goals & Planning
            </Link>
          </div>
        )}

        {activeTab === 'financials' && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8 text-center">
            <p className="text-sm sm:text-base text-gray-500">Financials tab - links to existing forecast system</p>
            <Link
              href={`/coach/clients/${clientId}/forecast`}
              className="mt-4 inline-block text-sm sm:text-base text-brand-orange hover:text-brand-orange-700 font-medium"
            >
              Go to Financial Forecast
            </Link>
          </div>
        )}

        {activeTab === 'actions' && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8 text-center">
            <p className="text-sm sm:text-base text-gray-500">Actions tab coming soon</p>
          </div>
        )}

        {activeTab === 'documents' && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8 text-center">
            <p className="text-sm sm:text-base text-gray-500">Documents tab coming soon</p>
          </div>
        )}

        {activeTab === 'messages' && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8 text-center">
            <p className="text-sm sm:text-base text-gray-500">Messages tab coming soon</p>
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8 text-center">
            <p className="text-sm sm:text-base text-gray-500">Private notes tab coming soon</p>
          </div>
        )}

        {activeTab === 'activity-log' && (
          <ClientActivityLog businessId={clientId} showFilters={true} limit={50} />
        )}
      </div>
    </div>
  )
}
