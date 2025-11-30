'use client'

import { useState, useEffect, useCallback } from 'react'
import { Target, TrendingUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useDashboardData } from './hooks/useDashboardData'
import {
  InsightHeader,
  GoalsCard,
  RocksCard,
  WeeklyPrioritiesCard,
  SuggestedActions,
  CoachMessagesCard,
  ChatDrawer,
  DashboardSkeleton,
  DashboardError,
  SessionActionsCard
} from './components'
import { getQuarterDisplayName } from './utils/formatters'

export default function DashboardPage() {
  const supabase = createClient()
  const { data, isLoading, error, userId, refresh } = useDashboardData()
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [coachId, setCoachId] = useState<string | null>(null)
  const [messagesBusinessId, setMessagesBusinessId] = useState<string | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [lastMessage, setLastMessage] = useState<{ preview: string; time: string } | null>(null)

  // Update last login timestamp when dashboard loads
  useEffect(() => {
    async function updateLastLogin() {
      if (!userId) return

      // Get user email for upsert
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Upsert to users table - creates row if doesn't exist, updates if it does
      const { error } = await supabase
        .from('users')
        .upsert({
          id: userId,
          email: user.email || '',
          last_login_at: new Date().toISOString()
        }, {
          onConflict: 'id'
        })

      if (error) {
        console.log('[Dashboard] Could not update last_login_at:', error.message)
      } else {
        console.log('[Dashboard] Updated last_login_at for user:', userId)
      }
    }

    updateLastLogin()
  }, [userId, supabase])

  // Load coach info and message data
  const loadMessageData = useCallback(async () => {
    if (!userId) return

    // Get the user's actual business (businesses table) to find coach assignment
    // First try via business_users join table
    const { data: businessUser } = await supabase
      .from('business_users')
      .select('business_id')
      .eq('user_id', userId)
      .maybeSingle()

    let actualBusinessId: string | null = null

    if (businessUser?.business_id) {
      actualBusinessId = businessUser.business_id
    } else {
      // Fallback: try direct owner_id lookup on businesses table
      const { data: ownedBusiness } = await supabase
        .from('businesses')
        .select('id')
        .eq('owner_id', userId)
        .maybeSingle()

      if (ownedBusiness?.id) {
        actualBusinessId = ownedBusiness.id
      }
    }

    if (!actualBusinessId) {
      console.log('[Dashboard] No business found for user')
      return
    }

    // Store the actual business ID for messaging
    setMessagesBusinessId(actualBusinessId)

    // Get coach ID from the actual business
    const { data: business } = await supabase
      .from('businesses')
      .select('assigned_coach_id')
      .eq('id', actualBusinessId)
      .maybeSingle()

    console.log('[Dashboard] Business for coach lookup:', business)
    if (business?.assigned_coach_id) {
      console.log('[Dashboard] Setting coachId:', business.assigned_coach_id)
      setCoachId(business.assigned_coach_id)
    } else {
      console.log('[Dashboard] No assigned_coach_id found')
    }

    // Get unread count and last message
    const { data: messages } = await supabase
      .from('messages')
      .select('*')
      .eq('business_id', actualBusinessId)
      .order('created_at', { ascending: false })
      .limit(10)

    if (messages && messages.length > 0) {
      // Count unread from coach
      const unread = messages.filter(m => !m.read && m.sender_id !== userId).length
      setUnreadCount(unread)

      // Get last message
      const last = messages[0]
      const time = new Date(last.created_at)
      const now = new Date()
      const isToday = time.toDateString() === now.toDateString()
      const timeStr = isToday
        ? time.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
        : time.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })

      setLastMessage({
        preview: last.content.length > 50 ? last.content.substring(0, 50) + '...' : last.content,
        time: timeStr
      })
    }
  }, [supabase, userId])

  useEffect(() => {
    loadMessageData()
  }, [loadMessageData])

  // Refresh message data when drawer closes
  const handleChatClose = () => {
    setIsChatOpen(false)
    loadMessageData() // Refresh to update unread count
  }

  // Show skeleton while loading
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <DashboardSkeleton />
      </div>
    )
  }

  // Show error state
  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <DashboardError error={error} onRetry={refresh} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-[1600px] mx-auto p-6 space-y-6">
        {/* Smart Insight Header */}
        <InsightHeader
          insight={data.insight}
          onRefresh={refresh}
        />

        {/* Actions from Coaching Session */}
        <SessionActionsCard userId={userId} />

        {/* Top Row: Annual Goals, 90-Day Goals, Quarterly Rocks */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <GoalsCard
            title="Annual Goals"
            goals={data.annualGoals}
            icon={Target}
            emptyStateText="No annual goals set"
            emptyStateCta="Set Your Goals"
            emptyStateHref="/goals?step=1"
            daysRemaining={data.yearDaysRemaining}
            timeProgress={data.annualProgress}
          />

          <GoalsCard
            title="90-Day Goals"
            subtitle={getQuarterDisplayName(data.currentQuarter)}
            goals={data.quarterlyGoals}
            icon={TrendingUp}
            emptyStateText="No quarterly targets set"
            emptyStateCta="Create 90-Day Sprint"
            emptyStateHref="/goals?step=4"
            daysRemaining={data.quarterDaysRemaining}
            timeProgress={data.quarterlyProgress}
          />

          <RocksCard
            rocks={data.rocks}
            currentQuarter={data.currentQuarter}
            rocksNeedingAttention={data.rocksNeedingAttention}
            rocksOnTrack={data.rocksOnTrack}
            quarterDaysRemaining={data.quarterDaysRemaining}
          />
        </div>

        {/* Second Row: Weekly Priorities, Coach Messages */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <WeeklyPrioritiesCard weeklyGoals={data.weeklyGoals} />
          <CoachMessagesCard
            onOpenChat={() => setIsChatOpen(true)}
            unreadCount={unreadCount}
            lastMessagePreview={lastMessage?.preview}
            lastMessageTime={lastMessage?.time}
          />
        </div>

        {/* Suggested Actions */}
        <SuggestedActions actions={data.suggestedActions} />

        {/* Chat Drawer */}
        <ChatDrawer
          isOpen={isChatOpen}
          onClose={handleChatClose}
          businessId={messagesBusinessId}
          userId={userId}
          coachId={coachId}
        />
      </div>
    </div>
  )
}
