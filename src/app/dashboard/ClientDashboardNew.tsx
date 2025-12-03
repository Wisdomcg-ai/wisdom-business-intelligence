'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  WelcomeBanner,
  SessionCountdown,
  YourCoachCard,
  QuickActions,
  PendingActions,
  RecentMessages
} from '@/components/client/dashboard'
import { Loader2 } from 'lucide-react'

interface Coach {
  id: string
  name: string
  email?: string
  phone?: string
  title?: string
  bio?: string
  avatarUrl?: string
  specialties?: string[]
}

interface NextSession {
  id: string
  title: string
  scheduledAt: string
  duration: number
  type: 'video' | 'in-person' | 'phone'
  location?: string
  coachName: string
  agenda?: string[]
}

interface Action {
  id: string
  title: string
  dueDate?: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  category?: string
}

interface Message {
  id: string
  content: string
  senderName: string
  senderType: 'coach' | 'client'
  timestamp: string
  isRead: boolean
}

export default function ClientDashboardNew() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [coach, setCoach] = useState<Coach | null>(null)
  const [nextSession, setNextSession] = useState<NextSession | null>(null)
  const [pendingActions, setPendingActions] = useState<Action[]>([])
  const [recentMessages, setRecentMessages] = useState<Message[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    loadDashboardData()
  }, [])

  async function loadDashboardData() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // Set user name
      const name = user.user_metadata?.first_name
        ? `${user.user_metadata.first_name} ${user.user_metadata.last_name || ''}`
        : user.email?.split('@')[0] || 'User'
      setUserName(name)

      // Get business info - use maybeSingle to avoid 406 errors for users without businesses
      const { data: businessUser } = await supabase
        .from('business_users')
        .select('business_id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!businessUser) {
        setLoading(false)
        return
      }

      const businessId = businessUser.business_id

      // Get business details
      const { data: business } = await supabase
        .from('businesses')
        .select('business_name, assigned_coach_id')
        .eq('id', businessId)
        .maybeSingle()

      if (business) {
        setBusinessName(business.business_name || 'My Business')

        // Load coach info from users table
        if (business.assigned_coach_id) {
          const { data: coachData } = await supabase
            .from('users')
            .select('*')
            .eq('id', business.assigned_coach_id)
            .maybeSingle()

          if (coachData) {
            setCoach({
              id: business.assigned_coach_id,
              name: coachData.first_name
                ? `${coachData.first_name} ${coachData.last_name || ''}`
                : 'Your Coach',
              email: coachData.email,
              phone: coachData.phone,
              title: 'Business Coach',
              specialties: ['Business Strategy', 'Leadership', 'Growth']
            })
          }
        }
      }

      // Load next session
      const { data: sessions } = await supabase
        .from('sessions')
        .select('*')
        .eq('business_id', businessId)
        .gte('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(1)

      if (sessions && sessions.length > 0) {
        const session = sessions[0]
        setNextSession({
          id: session.id,
          title: session.title || 'Coaching Session',
          scheduledAt: session.scheduled_at,
          duration: session.duration_minutes || 60,
          type: session.type || 'video',
          location: session.location,
          coachName: coach?.name || 'Your Coach',
          agenda: session.agenda
        })
      }

      // Load pending actions
      const { data: actions } = await supabase
        .from('action_items')
        .select('*')
        .eq('business_id', businessId)
        .neq('status', 'completed')
        .neq('status', 'cancelled')
        .order('due_date', { ascending: true })
        .limit(10)

      if (actions) {
        setPendingActions(actions.map(a => ({
          id: a.id,
          title: a.title,
          dueDate: a.due_date,
          priority: a.priority || 'medium',
          category: a.category
        })))
      }

      // Load recent messages
      const { data: messages } = await supabase
        .from('messages')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(5)

      if (messages) {
        setRecentMessages(messages.map(m => ({
          id: m.id,
          content: m.content,
          senderName: m.sender_type === 'coach' ? (coach?.name || 'Your Coach') : userName,
          senderType: m.sender_type,
          timestamp: m.created_at,
          isRead: m.is_read || false
        })))

        setUnreadCount(messages.filter(m => !m.is_read && m.sender_type === 'coach').length)
      }

    } catch (error) {
      console.error('Error loading dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleAction = async (actionId: string) => {
    const { error } = await supabase
      .from('action_items')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', actionId)

    if (!error) {
      setPendingActions(prev => prev.filter(a => a.id !== actionId))
    }
  }

  const handleRequestSession = () => {
    router.push('/schedule-session')
  }

  const handleMessageCoach = () => {
    router.push('/messages')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-teal-600 mx-auto mb-4" />
          <p className="text-gray-500">Loading your dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Welcome Banner */}
        <WelcomeBanner
          userName={userName}
          businessName={businessName}
        />

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Quick Actions */}
            <QuickActions
              pendingActionsCount={pendingActions.length}
              unreadMessagesCount={unreadCount}
            />

            {/* Pending Actions */}
            <PendingActions
              actions={pendingActions}
              onToggleComplete={handleToggleAction}
            />

            {/* Recent Messages */}
            <RecentMessages messages={recentMessages} />
          </div>

          {/* Right Column - Sidebar */}
          <div className="space-y-6">
            {/* Next Session Countdown */}
            <SessionCountdown
              session={nextSession || undefined}
              onRequestSession={handleRequestSession}
            />

            {/* Your Coach Card */}
            {coach && (
              <YourCoachCard
                coach={coach}
                onMessageCoach={handleMessageCoach}
                onRequestSession={handleRequestSession}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
