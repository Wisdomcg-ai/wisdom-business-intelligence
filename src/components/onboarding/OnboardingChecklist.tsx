'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useBusinessContext } from '@/hooks/useBusinessContext'
import {
  CheckCircle2,
  Circle,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Building2,
  ClipboardCheck,
  Target,
  FileText,
  Award,
  Sparkles,
  X
} from 'lucide-react'

interface ChecklistItem {
  id: string
  title: string
  description: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  isComplete: boolean
  isLoading?: boolean
}

interface OnboardingChecklistProps {
  onDismiss?: () => void
  onComplete?: (isComplete: boolean) => void
  compact?: boolean
}

export default function OnboardingChecklist({ onDismiss, onComplete, compact = false }: OnboardingChecklistProps) {
  const router = useRouter()
  const supabase = createClient()

  // Get business context for coach view support
  const { activeBusiness, isLoading: contextLoading } = useBusinessContext()

  const [isLoading, setIsLoading] = useState(true)
  const [isExpanded, setIsExpanded] = useState(true)
  const [isDismissed, setIsDismissed] = useState(false)
  const [completionStatus, setCompletionStatus] = useState({
    profile: false,
    assessment: false,
    visionMission: false,
    swot: false,
    goals: false
  })

  useEffect(() => {
    // Wait for context to load before checking status
    if (!contextLoading) {
      checkCompletionStatus()
    }
  }, [contextLoading, activeBusiness?.id])

  async function checkCompletionStatus() {
    setIsLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Determine whose data to query:
      // - If coach is viewing a client (activeBusiness is set), use the client's ownerId
      // - Otherwise, use the logged-in user's ID
      let targetUserId = activeBusiness?.ownerId || user.id
      const targetBusinessId = activeBusiness?.id || null

      console.log('[Onboarding] Initial target for queries:', {
        targetUserId,
        targetBusinessId,
        activeBusinessOwnerId: activeBusiness?.ownerId,
        isCoachView: !!activeBusiness,
        loggedInUserId: user.id
      })

      // First get the user's business to find the business_id and name
      // Use limit(1) instead of maybeSingle() to handle users with multiple businesses
      let business: { id: string; name?: string; owner_id?: string } | null = null

      if (targetBusinessId) {
        // Coach view - we already have the business ID, but need to get owner_id too
        const { data: businessData } = await supabase
          .from('businesses')
          .select('id, name, owner_id')
          .eq('id', targetBusinessId)
          .single()
        business = businessData

        // CRITICAL: If activeBusiness.ownerId was not set, get it from the business lookup
        if (businessData?.owner_id && !activeBusiness?.ownerId) {
          targetUserId = businessData.owner_id
          console.log('[Onboarding] Updated targetUserId from business owner_id:', targetUserId)
        }
      } else {
        // Normal user view - look up by owner_id
        const { data: businesses, error: businessError } = await supabase
          .from('businesses')
          .select('id, name')
          .eq('owner_id', targetUserId)
          .order('created_at', { ascending: true })
          .limit(1)
        business = businesses?.[0] || null
        if (businessError) {
          console.log('[Onboarding] Business lookup error:', businessError.message)
        }
      }

      console.log('[Onboarding] Business lookup:', { businessId: business?.id, businessName: business?.name, ownerId: business?.owner_id, targetUserId })

      // Get the business_profile ID for querying related tables
      // business_profiles.id is used as the foreign key in financial_goals, initiatives, etc.
      // ALWAYS use user_id lookup for consistency (matches how client sees their own data)
      let businessProfileId: string | undefined = undefined

      // Primary lookup: by user_id (most reliable, matches direct client login)
      const { data: profileByUser } = await supabase
        .from('business_profiles')
        .select('id')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: true })
        .limit(1)

      if (profileByUser?.[0]?.id) {
        businessProfileId = profileByUser[0].id
      } else if (business?.id) {
        // Fallback: try by business_id if user_id lookup failed
        const { data: profileByBusiness } = await supabase
          .from('business_profiles')
          .select('id')
          .eq('business_id', business.id)
          .limit(1)

        if (profileByBusiness?.[0]?.id) {
          businessProfileId = profileByBusiness[0].id
        }
      }

      console.log('[Onboarding] Business profile ID for queries:', { businessProfileId, targetUserId, businessId: business?.id })

      // Check all completion statuses in parallel
      const [profileResult, assessmentResult, visionResult, swotResult, financialGoalsResult, initiativesResult] = await Promise.all([
        // 1. Business Profile - get full profile to calculate completion
        // Query by user_id for consistency with BusinessProfileService
        supabase
          .from('business_profiles')
          .select('industry, annual_revenue, employee_count, years_in_operation, owner_info')
          .eq('user_id', targetUserId)
          .order('created_at', { ascending: true })
          .limit(1),

        // 2. Assessment
        supabase
          .from('assessments')
          .select('id')
          .eq('user_id', targetUserId)
          .eq('status', 'completed')
          .limit(1),

        // 3. Vision & Mission (check if vision_mission has content)
        // NOTE: strategy_data stores user_id, not business_id
        supabase
          .from('strategy_data')
          .select('vision_mission')
          .eq('user_id', targetUserId)
          .maybeSingle(),

        // 4. SWOT Analysis - check if actual swot_items exist
        // NOTE: SWOT stores user_id as business_id (legacy pattern)
        supabase
          .from('swot_analyses')
          .select('id, swot_items(id)')
          .eq('business_id', targetUserId)
          .limit(1),

        // 5. Strategic Plan - Financial goals
        // Uses business_profiles.id as business_id
        businessProfileId
          ? supabase
              .from('business_financial_goals')
              .select('revenue_year1')
              .eq('business_id', businessProfileId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),

        // 6. Strategic initiatives - all step types
        // Uses business_profiles.id as business_id
        businessProfileId
          ? supabase
              .from('strategic_initiatives')
              .select('id, step_type')
              .eq('business_id', businessProfileId)
          : Promise.resolve({ data: [], error: null })
      ])

      // Determine completion status

      // Profile: Check if required fields are filled (simplified version of calculateCompletion)
      let profile = false
      console.log('[Onboarding] Profile query result:', {
        data: profileResult.data,
        error: profileResult.error,
        targetUserId
      })
      const profileData = profileResult.data?.[0]
      if (profileData) {
        const p = profileData
        // Name comes from businesses table, other fields from business_profiles
        const businessName = business?.name
        const requiredFields = [businessName, p.industry, p.annual_revenue, p.employee_count, p.years_in_operation]
        const filledRequired = requiredFields.filter(f => f !== null && f !== undefined && f !== '').length
        // Also check owner_info has owner name
        const ownerInfo = p.owner_info as any
        const hasOwnerName = ownerInfo?.owner_name?.trim()
        // Profile is complete if all 5 required fields + owner name are filled
        profile = filledRequired >= 5 && !!hasOwnerName

        console.log('[Onboarding] Profile check:', {
          name: businessName,
          industry: p.industry,
          annual_revenue: p.annual_revenue,
          employee_count: p.employee_count,
          years_in_operation: p.years_in_operation,
          owner_name: ownerInfo?.owner_name,
          filledRequired,
          hasOwnerName: !!hasOwnerName,
          isComplete: profile
        })
      } else {
        console.log('[Onboarding] No profile data found', profileResult.error)
      }

      const assessment = (assessmentResult.data?.length || 0) > 0

      // Vision/Mission: check if object has meaningful content
      let visionMission = false
      if (visionResult.data?.vision_mission) {
        const vm = visionResult.data.vision_mission as any
        // The page uses vision_statement and mission_statement (not vision/mission)
        const hasVision = vm.vision_statement?.trim() || vm.vision?.trim()
        const hasMission = vm.mission_statement?.trim() || vm.mission?.trim()
        const hasValues = (vm.core_values && vm.core_values.filter((v: string) => v?.trim()).length > 0) || (vm.values && vm.values.length > 0)
        visionMission = !!(hasVision || hasMission || hasValues)

        console.log('[Onboarding] Vision/Mission check:', {
          vision_statement: vm.vision_statement,
          mission_statement: vm.mission_statement,
          core_values: vm.core_values,
          hasVision: !!hasVision,
          hasMission: !!hasMission,
          hasValues: !!hasValues,
          isComplete: visionMission
        })
      } else {
        console.log('[Onboarding] No vision/mission data found', visionResult.error)
      }

      // SWOT: Check if analysis exists AND has at least one item
      let swot = false
      if (swotResult.data && swotResult.data.length > 0) {
        const analysis = swotResult.data[0] as any
        swot = analysis.swot_items && analysis.swot_items.length > 0
        console.log('[Onboarding] SWOT check:', {
          hasAnalysis: true,
          analysisId: analysis.id,
          swotItemsCount: analysis.swot_items?.length || 0,
          isComplete: swot
        })
      } else {
        console.log('[Onboarding] No SWOT data found', swotResult.error)
      }

      // Strategic Plan: Check meaningful engagement with the wizard
      let goals = false
      const initiatives = initiativesResult.data || []
      const fg = financialGoalsResult.data

      // Step 1: Financial goals - At least Year 1 revenue target set
      const hasYear1 = fg?.revenue_year1 && fg.revenue_year1 > 0
      const hasFinancialGoals = !!hasYear1

      // Step 2: At least 1 strategic idea
      const strategicIdeas = initiatives.filter((i: any) => i.step_type === 'strategic_ideas')
      const hasStrategicIdeas = strategicIdeas.length > 0

      // Step 3: Has prioritized initiatives (at least 1 twelve_month initiative)
      const twelveMonthInitiatives = initiatives.filter((i: any) => i.step_type === 'twelve_month')
      const hasPrioritizedInitiatives = twelveMonthInitiatives.length > 0

      // Step 4: Has distributed initiatives to quarters (at least one quarter has initiatives)
      const q1Initiatives = initiatives.filter((i: any) => i.step_type === 'q1')
      const q2Initiatives = initiatives.filter((i: any) => i.step_type === 'q2')
      const q3Initiatives = initiatives.filter((i: any) => i.step_type === 'q3')
      const q4Initiatives = initiatives.filter((i: any) => i.step_type === 'q4')
      const hasQuarterlyInitiatives = q1Initiatives.length > 0 || q2Initiatives.length > 0 || q3Initiatives.length > 0 || q4Initiatives.length > 0

      // Strategic Plan is complete if user has:
      // 1. Set financial goals (Year 1 minimum)
      // 2. Created strategic ideas
      // 3. Prioritized initiatives for the year
      // 4. Distributed to quarters
      goals = !!(hasFinancialGoals && hasStrategicIdeas && hasPrioritizedInitiatives && hasQuarterlyInitiatives)

      console.log('[Onboarding] Strategic Plan check:', {
        hasYear1,
        hasFinancialGoals,
        strategicIdeasCount: strategicIdeas.length,
        hasStrategicIdeas,
        twelveMonthCount: twelveMonthInitiatives.length,
        hasPrioritizedInitiatives,
        q1Count: q1Initiatives.length,
        q2Count: q2Initiatives.length,
        q3Count: q3Initiatives.length,
        q4Count: q4Initiatives.length,
        hasQuarterlyInitiatives,
        isComplete: goals
      })

      const allComplete = profile && assessment && visionMission && swot && goals

      // SUMMARY LOG - shows exactly which checks passed/failed
      console.log('[Onboarding] ===== COMPLETION SUMMARY =====')
      console.log('[Onboarding] Profile:', profile ? '✅' : '❌')
      console.log('[Onboarding] Assessment:', assessment ? '✅' : '❌')
      console.log('[Onboarding] Vision/Mission:', visionMission ? '✅' : '❌')
      console.log('[Onboarding] SWOT:', swot ? '✅' : '❌')
      console.log('[Onboarding] Goals:', goals ? '✅' : '❌')
      console.log('[Onboarding] ALL COMPLETE:', allComplete ? '✅ YES' : '❌ NO')
      console.log('[Onboarding] ==============================')

      setCompletionStatus({
        profile,
        assessment,
        visionMission,
        swot,
        goals
      })

      // Notify parent of completion status
      onComplete?.(allComplete)
    } catch (error) {
      console.error('Error checking onboarding status:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const checklist: ChecklistItem[] = [
    {
      id: 'profile',
      title: 'Complete Business Profile',
      description: 'Tell us about your business',
      href: '/business-profile',
      icon: Building2,
      isComplete: completionStatus.profile
    },
    {
      id: 'assessment',
      title: 'Complete Assessment',
      description: 'Diagnose your business health',
      href: '/assessment',
      icon: ClipboardCheck,
      isComplete: completionStatus.assessment
    },
    {
      id: 'visionMission',
      title: 'Set Vision & Mission',
      description: 'Define your north star',
      href: '/vision-mission',
      icon: Target,
      isComplete: completionStatus.visionMission
    },
    {
      id: 'swot',
      title: 'Complete SWOT Analysis',
      description: 'Know your battlefield',
      href: '/swot',
      icon: FileText,
      isComplete: completionStatus.swot
    },
    {
      id: 'goals',
      title: 'Complete Strategic Plan',
      description: 'Set 3-year goals and plan your 90-day sprint',
      href: '/goals',
      icon: Award,
      isComplete: completionStatus.goals
    }
  ]

  const completedCount = checklist.filter(item => item.isComplete).length
  const totalCount = checklist.length
  const allComplete = completedCount === totalCount
  const progressPercentage = Math.round((completedCount / totalCount) * 100)

  // Find the next incomplete item
  const nextItem = checklist.find(item => !item.isComplete)

  // Don't show if dismissed or all complete (after animation)
  if (isDismissed) return null

  // Compact version for when minimized
  if (compact && !isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="fixed bottom-4 right-4 bg-brand-orange text-white px-4 py-2 rounded-full shadow-lg hover:bg-brand-orange-600 transition-colors flex items-center gap-2 z-50"
      >
        <Sparkles className="w-4 h-4" />
        Setup: {completedCount}/{totalCount}
        <ChevronUp className="w-4 h-4" />
      </button>
    )
  }

  return (
    <div className={`bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden ${compact ? 'fixed bottom-4 right-4 w-80 z-50' : ''}`}>
      {/* Header */}
      <div className="bg-gradient-to-r from-brand-orange to-brand-orange-700 px-4 py-3 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            <span className="font-semibold">Getting Started</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-brand-orange-100">{completedCount}/{totalCount}</span>
            {compact && (
              <button
                onClick={() => setIsExpanded(false)}
                className="p-1 hover:bg-brand-orange-500 rounded"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            )}
            {onDismiss && allComplete && (
              <button
                onClick={() => {
                  setIsDismissed(true)
                  onDismiss()
                }}
                className="p-1 hover:bg-brand-orange-500 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-2 bg-brand-orange-800 rounded-full h-2 overflow-hidden">
          <div
            className="bg-white h-full rounded-full transition-all duration-500"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      {/* Checklist items */}
      <div className="divide-y divide-gray-100">
        {isLoading ? (
          <div className="p-4 text-center text-gray-500">
            <div className="animate-spin w-5 h-5 border-2 border-brand-orange border-t-transparent rounded-full mx-auto mb-2" />
            Checking progress...
          </div>
        ) : allComplete ? (
          <div className="p-6 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-1">Setup Complete!</h3>
            <p className="text-sm text-gray-600 mb-4">
              You've completed all the essential setup steps. Your business intelligence is ready.
            </p>
            <button
              onClick={() => router.push('/one-page-plan')}
              className="text-sm text-brand-orange hover:text-brand-orange-700 font-medium"
            >
              View your One-Page Plan →
            </button>
          </div>
        ) : (
          checklist.map((item) => {
            const Icon = item.icon
            const isNext = nextItem?.id === item.id

            return (
              <button
                key={item.id}
                onClick={() => router.push(item.href)}
                disabled={item.isComplete}
                className={`w-full px-4 py-3 flex items-center gap-3 text-left transition-colors ${
                  item.isComplete
                    ? 'bg-gray-50 cursor-default'
                    : isNext
                    ? 'bg-brand-orange-50 hover:bg-brand-orange-100'
                    : 'hover:bg-gray-50'
                }`}
              >
                <div className={`flex-shrink-0 ${item.isComplete ? 'text-green-600' : isNext ? 'text-brand-orange' : 'text-gray-400'}`}>
                  {item.isComplete ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <Circle className="w-5 h-5" />
                  )}
                </div>

                <div className={`flex-shrink-0 p-1.5 rounded-lg ${
                  item.isComplete
                    ? 'bg-gray-100'
                    : isNext
                    ? 'bg-brand-orange-100'
                    : 'bg-gray-100'
                }`}>
                  <Icon className={`w-4 h-4 ${
                    item.isComplete
                      ? 'text-gray-400'
                      : isNext
                      ? 'text-brand-orange'
                      : 'text-gray-500'
                  }`} />
                </div>

                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${
                    item.isComplete ? 'text-gray-400 line-through' : 'text-gray-900'
                  }`}>
                    {item.title}
                  </p>
                  <p className={`text-xs ${item.isComplete ? 'text-gray-400' : 'text-gray-500'}`}>
                    {item.description}
                  </p>
                </div>

                {!item.isComplete && (
                  <ChevronRight className={`w-4 h-4 flex-shrink-0 ${isNext ? 'text-brand-orange' : 'text-gray-400'}`} />
                )}

                {isNext && (
                  <span className="flex-shrink-0 text-xs bg-brand-orange text-white px-2 py-0.5 rounded-full">
                    Next
                  </span>
                )}
              </button>
            )
          })
        )}
      </div>

      {/* Footer with skip option (only show if not complete) */}
      {!allComplete && !isLoading && (
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
          <p className="text-xs text-gray-500 text-center">
            Complete these steps to unlock your full business intelligence
          </p>
        </div>
      )}
    </div>
  )
}
