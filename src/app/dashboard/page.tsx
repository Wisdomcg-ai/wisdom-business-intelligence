'use client'

import { useState, useEffect, useCallback } from 'react'
import { Target, TrendingUp, LayoutDashboard } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useBusinessContext } from '@/contexts/BusinessContext'
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
import OnboardingChecklist from '@/components/onboarding/OnboardingChecklist'
import PageLayout, { PageGrid } from '@/components/ui/PageLayout'

export default function DashboardPage() {
  const supabase = createClient()
  const { activeBusiness } = useBusinessContext()
  const { data, isLoading, error, userId, refresh } = useDashboardData()
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [coachId, setCoachId] = useState<string | null>(null)
  const [messagesBusinessId, setMessagesBusinessId] = useState<string | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [lastMessage, setLastMessage] = useState<{ preview: string; time: string } | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(true)
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null) // null = still checking

  // Load coach info and message data using activeBusiness from context
  const loadMessageData = useCallback(async () => {
    if (!userId || !activeBusiness?.id) return

    const actualBusinessId = activeBusiness.id
    setMessagesBusinessId(actualBusinessId)

    // Fetch coach assignment and messages in parallel
    const [businessResult, messagesResult] = await Promise.all([
      supabase
        .from('businesses')
        .select('assigned_coach_id')
        .eq('id', actualBusinessId)
        .maybeSingle(),
      supabase
        .from('messages')
        .select('*')
        .eq('business_id', actualBusinessId)
        .order('created_at', { ascending: false })
        .limit(10)
    ])

    if (businessResult.data?.assigned_coach_id) {
      setCoachId(businessResult.data.assigned_coach_id)
    }

    const messages = messagesResult.data
    if (messages && messages.length > 0) {
      const unread = messages.filter(m => !m.read && m.sender_id !== userId).length
      setUnreadCount(unread)

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
  }, [supabase, userId, activeBusiness?.id])

  // Run last login update and message data load in parallel
  useEffect(() => {
    if (!userId) return

    const updateLastLogin = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      await supabase.from('users').upsert({
        id: userId,
        email: user.email || '',
        last_login_at: new Date().toISOString()
      }, { onConflict: 'id' })
    }

    // Fire both in parallel — neither depends on the other
    updateLastLogin()
    loadMessageData()
  }, [userId, supabase, loadMessageData])

  // Refresh message data when drawer closes
  const handleChatClose = () => {
    setIsChatOpen(false)
    loadMessageData() // Refresh to update unread count
  }

  // Show skeleton while loading
  if (isLoading) {
    return (
      <PageLayout>
        <DashboardSkeleton />
      </PageLayout>
    )
  }

  // Show error state
  if (error) {
    return (
      <PageLayout>
        <DashboardError error={error} onRetry={refresh} />
      </PageLayout>
    )
  }

  // Show onboarding-only view until setup is complete
  // Only show when explicitly false (checked and incomplete), not when null (still checking)
  if (onboardingComplete === false && showOnboarding) {
    return (
      <PageLayout maxWidth="2xl">
        <div className="space-y-6">
          {/* Navy Page Header */}
          <div className="bg-brand-navy rounded-xl px-6 py-5">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 bg-white/10 rounded-lg flex items-center justify-center">
                <LayoutDashboard className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Welcome to Your Dashboard</h1>
                <p className="text-sm text-white/70 mt-0.5">Complete these steps to set up your business intelligence and unlock your personalized dashboard.</p>
              </div>
            </div>
          </div>

          {/* Onboarding Checklist */}
          <OnboardingChecklist
            onDismiss={() => setShowOnboarding(false)}
            onComplete={(complete) => setOnboardingComplete(complete)}
          />

          {/* Coach Messages - always show so they can communicate */}
          <CoachMessagesCard
            onOpenChat={() => setIsChatOpen(true)}
            unreadCount={unreadCount}
            lastMessagePreview={lastMessage?.preview}
            lastMessageTime={lastMessage?.time}
            hasCoach={!!coachId}
          />
        </div>

        {/* Chat Drawer */}
        <ChatDrawer
          isOpen={isChatOpen}
          onClose={handleChatClose}
          businessId={messagesBusinessId}
          userId={userId}
          coachId={coachId}
        />
      </PageLayout>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Smart Insight Header - Full Width Banner */}
      <InsightHeader
        insight={data.insight}
        onRefresh={refresh}
      />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="space-y-6">
          {/* Actions from Coaching Session */}
          <SessionActionsCard userId={userId} />

          {/* Top Row: Annual Goals, 90-Day Goals, Quarterly Rocks */}
          <PageGrid columns={3} gap="lg">
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
              isShowingPlanningQuarter={data.isShowingPlanningQuarter}
            />

            <RocksCard
              rocks={data.rocks}
              currentQuarter={data.currentQuarter}
              rocksNeedingAttention={data.rocksNeedingAttention}
              rocksOnTrack={data.rocksOnTrack}
              quarterDaysRemaining={data.quarterDaysRemaining}
              isShowingPlanningQuarter={data.isShowingPlanningQuarter}
            />
          </PageGrid>

          {/* Second Row: Weekly Priorities, Coach Messages */}
          <PageGrid columns={2} gap="lg">
            <WeeklyPrioritiesCard weeklyGoals={data.weeklyGoals} />
            <CoachMessagesCard
              onOpenChat={() => setIsChatOpen(true)}
              unreadCount={unreadCount}
              lastMessagePreview={lastMessage?.preview}
              lastMessageTime={lastMessage?.time}
              hasCoach={!!coachId}
            />
          </PageGrid>

          {/* Suggested Actions */}
          <SuggestedActions actions={data.suggestedActions} />
        </div>
      </div>

      {/* Chat Drawer */}
      <ChatDrawer
        isOpen={isChatOpen}
        onClose={handleChatClose}
        businessId={messagesBusinessId}
        userId={userId}
        coachId={coachId}
      />
    </div>
  )
}
