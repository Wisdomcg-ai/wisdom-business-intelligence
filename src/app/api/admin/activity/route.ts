import { createRouteHandlerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Use service role client for unrestricted access
const getServiceClient = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: Request) {
  const authClient = await createRouteHandlerClient()

  try {
    // Verify super admin
    const { data: { user }, error: userError } = await authClient.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is super admin
    const { data: roleData } = await authClient
      .from('system_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (!roleData || roleData.role !== 'super_admin') {
      return NextResponse.json({ error: 'Access denied. Super admin privileges required.' }, { status: 403 })
    }

    // Use service role for unrestricted data access
    const supabase = getServiceClient()

    // Get URL params for filtering
    const { searchParams } = new URL(request.url)
    const timeRange = searchParams.get('range') || '7' // days
    const limit = parseInt(searchParams.get('limit') || '100')

    const daysAgo = new Date()
    daysAgo.setDate(daysAgo.getDate() - parseInt(timeRange))

    // 1. Get all businesses with basic info
    const { data: businesses, error: businessError } = await supabase
      .from('businesses')
      .select(`
        id,
        business_name,
        status,
        owner_id,
        owner_email,
        assigned_coach_id,
        created_at,
        invitation_sent
      `)
      .order('business_name', { ascending: true })

    if (businessError) {
      console.error('Error fetching businesses:', businessError)
      return NextResponse.json({ error: 'Failed to fetch businesses' }, { status: 500 })
    }

    // 2. Get recent audit log entries for all businesses
    const { data: auditLogs, error: auditError } = await supabase
      .from('audit_log')
      .select('*')
      .gte('created_at', daysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(limit)

    if (auditError) {
      console.error('Error fetching audit logs:', auditError)
      // Don't fail - audit log might not have data yet
    }

    // 3. Get user login activity
    const { data: loginActivity, error: loginError } = await supabase
      .from('user_logins')
      .select('*')
      .order('login_at', { ascending: false })

    if (loginError) {
      console.error('Error fetching login activity:', loginError)
      // Don't fail - login tracking might not have data yet
    }

    // 4. Get recent business_profiles updates (shows profile completion activity)
    const { data: profileActivity, error: profileError } = await supabase
      .from('business_profiles')
      .select('id, business_id, user_id, updated_at, profile_completed')
      .gte('updated_at', daysAgo.toISOString())
      .order('updated_at', { ascending: false })

    if (profileError) {
      console.error('Error fetching profile activity:', profileError)
    }

    // 5. Get recent assessments (completions)
    const { data: assessmentActivity, error: assessmentError } = await supabase
      .from('assessments')
      .select('id, user_id, status, created_at, completed_at')
      .gte('created_at', daysAgo.toISOString())
      .order('created_at', { ascending: false })

    if (assessmentError) {
      console.error('Error fetching assessment activity:', assessmentError)
    }

    // 6. Get recent weekly reviews
    const { data: weeklyReviews, error: weeklyError } = await supabase
      .from('weekly_reviews')
      .select('id, business_id, user_id, created_at, status')
      .gte('created_at', daysAgo.toISOString())
      .order('created_at', { ascending: false })

    if (weeklyError) {
      console.error('Error fetching weekly reviews:', weeklyError)
    }

    // 7. Get coaches info for mapping
    const { data: coaches } = await supabase
      .from('users')
      .select('id, email, first_name, last_name')
      .in('system_role', ['coach', 'super_admin'])

    // 8. Get user info for email/name mapping
    const { data: users } = await supabase
      .from('users')
      .select('id, email, first_name, last_name')

    // Create user lookup map
    const userMap = new Map<string, { email: string; name: string }>()
    users?.forEach(u => {
      const name = u.first_name ? `${u.first_name} ${u.last_name || ''}`.trim() : u.email?.split('@')[0] || 'Unknown'
      userMap.set(u.id, { email: u.email || '', name })
    })

    // Create coach lookup map
    const coachMap = new Map<string, { email: string; name: string }>()
    coaches?.forEach(c => {
      const name = c.first_name ? `${c.first_name} ${c.last_name || ''}`.trim() : c.email?.split('@')[0] || 'Unknown'
      coachMap.set(c.id, { email: c.email || '', name })
    })

    // Process and aggregate activity data per business
    const businessActivityMap = new Map<string, {
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
    }>()

    // Initialize with all businesses
    businesses?.forEach(b => {
      const coach = b.assigned_coach_id ? coachMap.get(b.assigned_coach_id) : null
      businessActivityMap.set(b.id, {
        id: b.id,
        business_name: b.business_name,
        status: b.status,
        owner_email: b.owner_email,
        coach_name: coach?.name || null,
        created_at: b.created_at,
        invitation_sent: b.invitation_sent,
        last_activity: null,
        last_login: null,
        activity_count: 0,
        recent_activities: []
      })
    })

    // Add login activity
    loginActivity?.forEach(login => {
      const business = businessActivityMap.get(login.business_id)
      if (business) {
        if (!business.last_login || new Date(login.login_at) > new Date(business.last_login)) {
          business.last_login = login.login_at
        }
        const user = userMap.get(login.user_id)
        business.recent_activities.push({
          type: 'login',
          description: 'User logged in',
          user_name: user?.name || 'Unknown',
          timestamp: login.login_at
        })
      }
    })

    // Add audit log activity
    auditLogs?.forEach(log => {
      const business = businessActivityMap.get(log.business_id)
      if (business) {
        business.activity_count++
        if (!business.last_activity || new Date(log.created_at) > new Date(business.last_activity)) {
          business.last_activity = log.created_at
        }
        business.recent_activities.push({
          type: log.action,
          description: `${log.action} on ${log.table_name}${log.field_name ? ` (${log.field_name})` : ''}`,
          user_name: log.user_name || userMap.get(log.user_id)?.name || 'Unknown',
          timestamp: log.created_at,
          page: log.page_path
        })
      }
    })

    // Add profile activity
    profileActivity?.forEach(profile => {
      const business = businessActivityMap.get(profile.business_id)
      if (business && profile.updated_at) {
        const user = userMap.get(profile.user_id)
        business.recent_activities.push({
          type: 'profile_update',
          description: profile.profile_completed ? 'Completed business profile' : 'Updated business profile',
          user_name: user?.name || 'Unknown',
          timestamp: profile.updated_at
        })
        if (!business.last_activity || new Date(profile.updated_at) > new Date(business.last_activity)) {
          business.last_activity = profile.updated_at
        }
      }
    })

    // Add weekly review activity - need to map by user to business
    weeklyReviews?.forEach(review => {
      const business = businessActivityMap.get(review.business_id)
      if (business) {
        const user = userMap.get(review.user_id)
        business.recent_activities.push({
          type: 'weekly_review',
          description: review.status === 'completed' ? 'Completed weekly review' : 'Started weekly review',
          user_name: user?.name || 'Unknown',
          timestamp: review.created_at
        })
        if (!business.last_activity || new Date(review.created_at) > new Date(business.last_activity)) {
          business.last_activity = review.created_at
        }
      }
    })

    // Sort activities by timestamp for each business
    businessActivityMap.forEach(business => {
      business.recent_activities.sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )
      // Limit to last 10 activities per business
      business.recent_activities = business.recent_activities.slice(0, 10)
    })

    // Convert to array and sort by last activity
    const activityData = Array.from(businessActivityMap.values())
      .sort((a, b) => {
        // Sort by last activity, null values last
        if (!a.last_activity && !b.last_activity) return 0
        if (!a.last_activity) return 1
        if (!b.last_activity) return -1
        return new Date(b.last_activity).getTime() - new Date(a.last_activity).getTime()
      })

    // Summary stats
    const summary = {
      total_clients: businesses?.length || 0,
      active_clients: businesses?.filter(b => b.status === 'active').length || 0,
      clients_active_today: activityData.filter(b => {
        if (!b.last_activity) return false
        const today = new Date()
        const activityDate = new Date(b.last_activity)
        return activityDate.toDateString() === today.toDateString()
      }).length,
      clients_active_this_week: activityData.filter(b => {
        if (!b.last_activity) return false
        const weekAgo = new Date()
        weekAgo.setDate(weekAgo.getDate() - 7)
        return new Date(b.last_activity) > weekAgo
      }).length,
      total_activity_count: auditLogs?.length || 0
    }

    return NextResponse.json({
      success: true,
      summary,
      clients: activityData,
      timeRange: parseInt(timeRange)
    })

  } catch (error) {
    console.error('Activity monitoring error:', error)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
