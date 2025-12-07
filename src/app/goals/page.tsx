'use client'

import { useState, useEffect, Suspense, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { useStrategicPlanning, SaveStatus } from './hooks/useStrategicPlanning'
import Step1GoalsAndKPIs from './components/Step1GoalsAndKPIs'
import Step2StrategicIdeas from './components/Step2StrategicIdeas'
import Step3PrioritizeInitiatives from './components/Step3PrioritizeInitiatives'
import Step4AnnualPlan from './components/Step4AnnualPlan'
import Step5SprintPlanning from './components/Step5SprintPlanning'
import { Target, Calendar, Brain, Rocket, ChevronLeft, ChevronRight, CheckCircle, Loader2, TrendingUp, AlertCircle, HelpCircle, ChevronDown, Shield, AlertTriangle as AlertTriangleIcon, Lightbulb, Save, Cloud, CloudOff } from 'lucide-react'
// Note: Coach view is at /coach/clients/[id]/goals
import Link from 'next/link'
import { createBrowserClient } from '@supabase/ssr'
import { useBusinessContext } from '@/hooks/useBusinessContext'
import { calculateQuarters, determinePlanYear } from './utils/quarters'
import PageHeader from '@/components/ui/PageHeader'

type StepNumber = 1 | 2 | 3 | 4 | 5

interface StepInfo {
  num: StepNumber
  label: string
  title: string
  icon: React.ElementType
  description: string
}

interface SwotItem {
  id: string
  category: 'strength' | 'weakness' | 'opportunity' | 'threat'
  title: string
  description: string | null
  impact_level: number
  likelihood?: number
}

// Helper to get the NEXT (planning) quarter label
// We always plan for the NEXT quarter, not the current one
function getPlanningQuarter(yearType: 'CY' | 'FY'): { quarter: string; label: string } {
  const today = new Date()
  const month = today.getMonth() // 0-11

  let currentQuarter: string
  let nextQuarter: string

  if (yearType === 'CY') {
    // Calendar Year: Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec
    if (month < 3) { currentQuarter = 'Q1'; nextQuarter = 'Q2' }
    else if (month < 6) { currentQuarter = 'Q2'; nextQuarter = 'Q3' }
    else if (month < 9) { currentQuarter = 'Q3'; nextQuarter = 'Q4' }
    else { currentQuarter = 'Q4'; nextQuarter = 'Q1' }
  } else {
    // Fiscal Year (Jul-Jun): Q1=Jul-Sep, Q2=Oct-Dec, Q3=Jan-Mar, Q4=Apr-Jun
    if (month >= 6 && month < 9) { currentQuarter = 'Q1'; nextQuarter = 'Q2' }
    else if (month >= 9 && month < 12) { currentQuarter = 'Q2'; nextQuarter = 'Q3' }
    else if (month < 3) { currentQuarter = 'Q3'; nextQuarter = 'Q4' }
    else { currentQuarter = 'Q4'; nextQuarter = 'Q1' }
  }

  // Always show the NEXT quarter for planning purposes
  // Users should be planning ahead, not for the quarter they're already in
  return { quarter: nextQuarter, label: `${nextQuarter} Execution Plan` }
}

const getSteps = (yearType: 'CY' | 'FY' = 'CY'): StepInfo[] => {
  const planningQuarter = getPlanningQuarter(yearType)

  return [
    {
      num: 1,
      label: '3yr Goals & KPIs',
      title: 'Set Your 3-Year Goals & KPIs',
      icon: Target,
      description: 'Define financial targets and key performance indicators'
    },
    {
      num: 2,
      label: 'Strategic Ideas',
      title: 'Capture Strategic Ideas',
      icon: Brain,
      description: 'Capture ideas and review roadmap suggestions by business engine'
    },
    {
      num: 3,
      label: 'Prioritize',
      title: 'Prioritize Your Initiatives',
      icon: CheckCircle,
      description: 'Select and order your top 8-20 initiatives for the year'
    },
    {
      num: 4,
      label: 'Annual Plan',
      title: 'Distribute Across Quarters',
      icon: Calendar,
      description: 'Plan Q1, Q2, Q3, Q4 execution'
    },
    {
      num: 5,
      label: planningQuarter.label,
      title: `Define Your ${planningQuarter.quarter} Sprint`,
      icon: Rocket,
      description: `Focus on ${planningQuarter.quarter} with specific actions and accountability`
    }
  ]
}

// Coaching help content for each step
const STEP_COACHING: Record<StepNumber, { questions: string[]; tips: string[] }> = {
  1: {
    questions: [
      "What does success look like 3 years from now? (Revenue, team size, lifestyle)",
      "Which metrics truly matter to your business model? (Not just vanity metrics)",
      "Are your goals aligned with your SWOT strengths and opportunities?",
      "What growth rate is ambitious yet achievable based on your current trajectory?"
    ],
    tips: [
      "Strong Goal: '$2M revenue, 15 employees, 4-day work week' - Specific, measurable, meaningful",
      "Weak Goal: 'Grow the business and be successful' - Too vague, not actionable",
      "Your 3-year vision should stretch you but not break you - aim for 3-5x growth, not 100x"
    ]
  },
  2: {
    questions: [
      "What initiatives would leverage your biggest strengths?",
      "What ideas directly address your critical weaknesses?",
      "Which opportunities have the highest potential ROI?",
      "What quick wins can build momentum while working on bigger initiatives?"
    ],
    tips: [
      "Capture everything first - don't filter yet. Prioritization comes in Step 3.",
      "Look at your SWOT: SO strategies (Strength+Opportunity) are often the highest value",
      "Consider both revenue-generating AND operational improvement initiatives"
    ]
  },
  3: {
    questions: [
      "Which 12-20 initiatives will move you closest to your 3-year goals?",
      "Are you balancing quick wins (Q1-Q2) with strategic bets (Q3-Q4)?",
      "Do you have the resources (time, money, people) to execute these?",
      "Which initiatives are dependencies for others? (Do those first)"
    ],
    tips: [
      "Aim for 12-20 initiatives total - more than that and you'll spread too thin",
      "80/20 rule: 20% of initiatives will drive 80% of your progress - prioritize ruthlessly",
      "It's okay to defer good ideas - focus creates results, spreading thin creates burnout"
    ]
  },
  4: {
    questions: [
      "Which initiatives must happen in Q1 to enable the rest?",
      "Are you front-loading too much? (Leave room for unexpected opportunities)",
      "Does each quarter have a clear theme or focus area?",
      "Have you scheduled time for quarterly reviews and course corrections?"
    ],
    tips: [
      "Q1 should be your most concrete - you're executing this immediately",
      "Q2-Q4 can be more flexible - adjust based on Q1 learnings",
      "Balance 'foundation-building' initiatives with 'revenue-generating' ones each quarter"
    ]
  },
  5: {
    questions: [
      "What are the 3-5 most critical actions that will define Q1 success?",
      "Who specifically is responsible for each key action?",
      "What's your weekly rhythm for reviewing progress and staying on track?",
      "What will you stop doing to create space for these priorities?"
    ],
    tips: [
      "90 days goes fast - focus is everything. Less is more.",
      "Strong action: 'Launch MVP to 10 pilot customers by Mar 15 (Sarah owns)'",
      "Weak action: 'Work on product development' - no deadline, no owner, not specific",
      "Schedule weekly 15-min check-ins with yourself or team to maintain momentum"
    ]
  }
}

// Helper function to get save status display
function getSaveStatusDisplay(status: SaveStatus, isDirty: boolean, lastSaved: Date | null) {
  if (status === 'saving') {
    return { text: 'Saving...', color: 'text-amber-600', icon: 'saving' }
  }
  if (status === 'saved') {
    return { text: 'All changes saved', color: 'text-green-600', icon: 'saved' }
  }
  if (status === 'error') {
    return { text: 'Failed to save', color: 'text-red-600', icon: 'error' }
  }
  if (isDirty) {
    return { text: 'Unsaved changes', color: 'text-amber-600', icon: 'dirty' }
  }
  if (lastSaved) {
    const seconds = Math.floor((Date.now() - lastSaved.getTime()) / 1000)
    if (seconds < 60) return { text: 'All changes saved', color: 'text-gray-500', icon: 'idle' }
    if (seconds < 3600) return { text: `Saved ${Math.floor(seconds / 60)}m ago`, color: 'text-gray-500', icon: 'idle' }
    return { text: `Saved ${Math.floor(seconds / 3600)}h ago`, color: 'text-gray-500', icon: 'idle' }
  }
  return { text: '', color: 'text-gray-500', icon: 'idle' }
}

function StrategicPlanningContent() {
  const searchParams = useSearchParams()
  const { activeBusiness, viewerContext } = useBusinessContext()

  // Hydration fix: ensure state matches between server and client
  const [mounted, setMounted] = useState(false)
  const [currentStep, setCurrentStep] = useState<StepNumber>(1)

  // Only render interactive content after mounting
  useEffect(() => {
    setMounted(true)

    // Check for step parameter in URL
    const stepParam = searchParams?.get('step')
    if (stepParam) {
      const stepNum = parseInt(stepParam)
      if (stepNum >= 1 && stepNum <= 5) {
        setCurrentStep(stepNum as StepNumber)
      }
    }
  }, [searchParams])

  // Load all data using the hook - pass active business ID when viewing as coach
  const {
    isLoading,
    error,
    // Auto-save status
    isDirty,
    saveStatus,
    lastSaved,
    // Step 1
    financialData,
    updateFinancialValue,
    coreMetrics,
    updateCoreMetric,
    kpis,
    updateKPIValue,
    addKPI,
    deleteKPI,
    yearType,
    setYearType,
    businessId,
    ownerUserId,
    industry,
    // Step 2
    strategicIdeas,
    setStrategicIdeas,
    // Step 3-4
    twelveMonthInitiatives,
    setTwelveMonthInitiatives,
    annualPlanByQuarter,
    setAnnualPlanByQuarter,
    quarterlyTargets,
    setQuarterlyTargets,
    // Step 5
    sprintFocus,
    sprintKeyActions,
    operationalActivities,
    setOperationalActivities,
    // Save
    saveAllData
  } = useStrategicPlanning(viewerContext.isViewingAsCoach ? activeBusiness?.id : undefined)

  // Debug logging for coach view
  useEffect(() => {
    console.log('[Goals Page] Context state:', {
      isViewingAsCoach: viewerContext.isViewingAsCoach,
      activeBusinessId: activeBusiness?.id,
      activeBusinessName: activeBusiness?.name,
      passedToHook: viewerContext.isViewingAsCoach ? activeBusiness?.id : undefined
    })
  }, [viewerContext.isViewingAsCoach, activeBusiness?.id, activeBusiness?.name])

  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const [showKPIModal, setShowKPIModal] = useState(false)
  const [showStepHelp, setShowStepHelp] = useState(false)
  const [showSwotSummary, setShowSwotSummary] = useState(false)
  const [showValidationWarning, setShowValidationWarning] = useState(false)
  const [swotItems, setSwotItems] = useState<SwotItem[]>([])
  const [loadingSwot, setLoadingSwot] = useState(false)

  // Manual save function (still available as fallback)
  const handleSave = async () => {
    if (saveStatus === 'saving') return
    await saveAllData()
  }

  // Get current save status for display
  const statusDisplay = getSaveStatusDisplay(saveStatus, isDirty, lastSaved)

  // Load SWOT data for strategic context
  // Note: SWOT data is stored with user.id as business_id (see /swot/page.tsx)
  useEffect(() => {
    const loadSwotData = async () => {
      // Use ownerUserId for SWOT queries since that's how SWOT page saves data
      const swotBusinessId = ownerUserId || businessId
      if (!swotBusinessId || !mounted) return

      try {
        setLoadingSwot(true)
        const supabase = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        )

        console.log('[Goals] Loading SWOT data for business_id:', swotBusinessId)

        // Get the most recent SWOT analysis
        const { data: analysis, error: analysisError } = await supabase
          .from('swot_analyses')
          .select('id')
          .eq('business_id', swotBusinessId)
          .eq('type', 'quarterly')
          .order('year', { ascending: false })
          .order('quarter', { ascending: false })
          .limit(1)
          .single()

        if (analysisError || !analysis) {
          console.log('[Goals] No SWOT analysis found:', analysisError?.message)
          setSwotItems([])
          return
        }

        // Get SWOT items for this analysis
        const { data: items, error: itemsError } = await supabase
          .from('swot_items')
          .select('id, category, title, description, impact_level, likelihood')
          .eq('swot_analysis_id', analysis.id)
          .order('impact_level', { ascending: false })

        if (!itemsError && items) {
          console.log('[Goals] Loaded SWOT items:', items.length)
          setSwotItems(items)
        }
      } catch (err) {
        console.error('Error loading SWOT data:', err)
      } finally {
        setLoadingSwot(false)
      }
    }

    loadSwotData()
  }, [ownerUserId, businessId, mounted])

  // Hide validation warning when step changes (must be before early returns)
  useEffect(() => {
    setShowValidationWarning(false)
  }, [currentStep])

  const toggleSection = (section: string) => {
    const newCollapsed = new Set(collapsedSections)
    if (newCollapsed.has(section)) {
      newCollapsed.delete(section)
    } else {
      newCollapsed.add(section)
    }
    setCollapsedSections(newCollapsed)
  }

  // Get top items by category
  const getTopItemsByCategory = (category: SwotItem['category'], limit = 3): SwotItem[] => {
    return swotItems
      .filter(item => item.category === category)
      .sort((a, b) => b.impact_level - a.impact_level)
      .slice(0, limit)
  }

  const topStrengths = getTopItemsByCategory('strength')
  const topWeaknesses = getTopItemsByCategory('weakness')
  const topOpportunities = getTopItemsByCategory('opportunity')
  const topThreats = getTopItemsByCategory('threat')

  // Get dynamic steps based on year type - MUST be before any early returns (hooks rule)
  const dynamicSteps = useMemo(() => getSteps(yearType), [yearType])

  // HYDRATION FIX: Show skeleton before mounting
  if (!mounted) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/3 mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-1/4 mb-6"></div>
            <div className="w-full h-2 bg-gray-200 rounded-full"></div>
          </div>
        </div>
      </div>
    )
  }

  // Calculate progress with safe defaults
  const safeAnnualPlan = annualPlanByQuarter || { q1: [], q2: [], q3: [], q4: [] }
  // Step 1: Financial goals set for ALL 3 years (3yr, 2yr, 1yr) - KPIs are optional
  const step1Complete = (financialData?.revenue?.year3 || 0) > 0 &&
                        (financialData?.revenue?.year2 || 0) > 0 &&
                        (financialData?.revenue?.year1 || 0) > 0
  // Step 2: At least 1 strategic idea captured
  const step2Complete = (strategicIdeas?.length || 0) > 0
  // Step 3: 8-20 prioritized initiatives selected
  const step3Complete = (twelveMonthInitiatives?.length || 0) >= 8 && (twelveMonthInitiatives?.length || 0) <= 20
  // Step 4: Quarterly targets + initiatives for unlocked quarters
  // (Locked quarters = past + current, can't add initiatives to them mid-year)
  const planYear = determinePlanYear(yearType)
  const quarters = calculateQuarters(yearType, planYear)
  const unlockedQuarters = quarters.filter(q => !q.isLocked)

  // Check if at least 1 quarterly target is set for any unlocked quarter
  const hasAnyQuarterlyTarget = unlockedQuarters.some(q => {
    const qId = q.id as 'q1' | 'q2' | 'q3' | 'q4'
    return Object.values(quarterlyTargets || {}).some(metric => {
      const value = parseFloat(metric?.[qId] || '0')
      return value > 0
    })
  })

  // Check if all unlocked quarters have at least 1 initiative
  const allUnlockedHaveInitiatives = unlockedQuarters.length > 0
    ? unlockedQuarters.every(q => (safeAnnualPlan[q.id as keyof typeof safeAnnualPlan]?.length || 0) > 0)
    : false

  // Step 4 complete = quarterly targets set + all unlocked quarters have initiatives
  const step4Complete = hasAnyQuarterlyTarget && allUnlockedHaveInitiatives

  // Step 5: Planning quarter has initiatives + at least 1 operational activity
  // Find the planning quarter (next quarter)
  const planningQuarter = quarters.find(q => q.isNextQuarter) || quarters.find(q => !q.isLocked)
  const planningQuarterKey = planningQuarter?.id as 'q1' | 'q2' | 'q3' | 'q4' | undefined
  const planningQuarterInitiatives = planningQuarterKey ? (safeAnnualPlan[planningQuarterKey]?.length || 0) : 0
  const hasOperationalActivities = (operationalActivities?.length || 0) > 0

  // Step 5 complete = has initiatives for planning quarter + has operational activities
  const step5Complete = planningQuarterInitiatives > 0 && hasOperationalActivities

  const stepCompletion = [step1Complete, step2Complete, step3Complete, step4Complete, step5Complete]
  const completedCount = stepCompletion.filter(Boolean).length
  const progressPercent = Math.round((completedCount / 5) * 100)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-brand-orange mx-auto mb-4" />
          <p className="text-gray-600">Loading your strategic plan...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <p className="text-red-600 font-medium mb-2">Error loading data</p>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    )
  }

  const currentStepInfo = dynamicSteps.find(s => s.num === currentStep)!
  const canGoPrevious = currentStep > 1
  const canGoNext = currentStep < 5
  const currentStepComplete = stepCompletion[currentStep - 1]

  // Get validation message for incomplete step
  const getValidationMessage = (stepNum: number): string => {
    switch (stepNum) {
      case 1:
        const missing1 = []
        if ((financialData?.revenue?.year3 || 0) === 0) missing1.push('Year 3')
        if ((financialData?.revenue?.year2 || 0) === 0) missing1.push('Year 2')
        if ((financialData?.revenue?.year1 || 0) === 0) missing1.push('Year 1')
        return `Set revenue targets for: ${missing1.join(', ')}`
      case 2:
        return 'Add at least 1 strategic idea before continuing'
      case 3:
        const count3 = twelveMonthInitiatives?.length || 0
        if (count3 < 8) return `Select at least ${8 - count3} more initiatives (need 8-20 total)`
        if (count3 > 20) return `Remove ${count3 - 20} initiatives (max 20 allowed)`
        return 'Select 8-20 initiatives'
      case 4:
        const missing4 = []
        if (!hasAnyQuarterlyTarget) missing4.push('set at least 1 quarterly target')
        const emptyQuarters = unlockedQuarters
          .filter(q => (safeAnnualPlan[q.id as keyof typeof safeAnnualPlan]?.length || 0) === 0)
          .map(q => q.label)
        if (emptyQuarters.length > 0) missing4.push(`assign initiatives to ${emptyQuarters.join(', ')}`)
        return missing4.length > 0 ? `Need to: ${missing4.join(' and ')}` : 'Complete Step 4'
      case 5:
        const missing5 = []
        if (planningQuarterInitiatives === 0) missing5.push(`initiatives in ${planningQuarter?.label || 'planning quarter'}`)
        if (!hasOperationalActivities) missing5.push('at least 1 operational activity')
        return missing5.length > 0 ? `Add: ${missing5.join(' and ')}` : 'Complete Step 5'
      default:
        return 'Complete this step before continuing'
    }
  }

  // Handle next button click with validation
  const handleNextClick = () => {
    if (!currentStepComplete) {
      setShowValidationWarning(true)
      // Auto-hide after 5 seconds
      setTimeout(() => setShowValidationWarning(false), 5000)
      return
    }
    setShowValidationWarning(false)
    setCurrentStep((prev) => Math.min(5, prev + 1) as StepNumber)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <PageHeader
        variant="banner"
        title="Goals & Planning"
        subtitle={currentStepInfo ? `Step ${currentStep}: ${currentStepInfo.title}` : "Build your 3-year roadmap, step by step"}
        icon={Target}
        actions={
          <div className="flex items-center gap-3">
                {/* Auto-save status indicator */}
                <div className="relative group">
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${
                    saveStatus === 'saving' ? 'bg-amber-50 border-amber-200' :
                    saveStatus === 'saved' ? 'bg-green-50 border-green-200' :
                    saveStatus === 'error' ? 'bg-red-50 border-red-200' :
                    isDirty ? 'bg-amber-50 border-amber-200' :
                    'bg-gray-50 border-gray-200'
                  }`}>
                    {saveStatus === 'saving' && (
                      <Loader2 className="animate-spin h-4 w-4 text-amber-600" />
                    )}
                    {saveStatus === 'saved' && (
                      <Cloud className="h-4 w-4 text-green-600" />
                    )}
                    {saveStatus === 'error' && (
                      <CloudOff className="h-4 w-4 text-red-600" />
                    )}
                    {saveStatus === 'idle' && isDirty && (
                      <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                    )}
                    {saveStatus === 'idle' && !isDirty && lastSaved && (
                      <Cloud className="h-4 w-4 text-gray-400" />
                    )}
                    {statusDisplay.text && (
                      <span className={`text-xs sm:text-sm font-medium ${statusDisplay.color}`}>
                        {statusDisplay.text}
                      </span>
                    )}
                  </div>
                  {/* Tooltip explaining auto-save */}
                  <div className="absolute right-0 top-full mt-2 w-64 p-3 bg-slate-800 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 pointer-events-none">
                    <p className="font-semibold mb-1">Auto-Save Enabled</p>
                    <p className="text-slate-300">Your progress is automatically saved as you make changes. No need to manually save unless you want to force a sync.</p>
                  </div>
                </div>
                {/* Manual save button */}
                <button
                  onClick={handleSave}
                  disabled={saveStatus === 'saving' || (!isDirty && saveStatus !== 'error')}
                  className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                    saveStatus === 'saving' || (!isDirty && saveStatus !== 'error')
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-brand-orange text-white hover:bg-brand-orange-600 shadow-sm hover:shadow-md'
                  }`}
                >
                  {saveStatus === 'saving' ? (
                    <>
                      <Loader2 className="animate-spin h-4 w-4" />
                      <span className="hidden sm:inline">Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      <span className="hidden sm:inline">Save Now</span>
                    </>
                  )}
                </button>
              </div>
        }
      />

        {/* Progress Bar */}
        <div className="bg-white border-b">
          <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Overall Progress</span>
                <span className="text-sm font-bold text-brand-orange">{completedCount}/5 steps</span>
              </div>
              <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-orange transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>
        </div>

      {/* SWOT Integration - Expandable Inline Summary */}
      <div className="bg-gray-100 border-b border-gray-200">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8">
          <button
            onClick={() => setShowSwotSummary(!showSwotSummary)}
            className="w-full py-4 flex items-center justify-between hover:bg-gray-200/50 transition-colors rounded-lg"
          >
            <div className="flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-brand-navy" />
              <div className="text-left">
                <h3 className="text-base font-semibold text-gray-900">
                  SWOT Insights {swotItems.length > 0 && <span className="text-gray-500 font-normal">({swotItems.length} items)</span>}
                </h3>
                <p className="text-sm text-gray-600">
                  {showSwotSummary ? 'Hide' : 'View'} your strengths, weaknesses, opportunities & threats to inform your strategy
                </p>
              </div>
            </div>
            <ChevronDown
              className={`w-5 h-5 text-gray-500 transition-transform ${showSwotSummary ? 'rotate-180' : ''}`}
            />
          </button>

          {/* Expandable SWOT Summary */}
          {showSwotSummary && (
            <div className="pb-4">
              {loadingSwot ? (
                <div className="text-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-brand-orange mx-auto mb-2" />
                  <p className="text-sm text-gray-600">Loading SWOT insights...</p>
                </div>
              ) : swotItems.length === 0 ? (
                <div className="bg-white rounded-xl p-6 text-center border-2 border-dashed border-gray-300">
                  <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <h4 className="text-base font-semibold text-gray-900 mb-2">No SWOT Analysis Yet</h4>
                  <p className="text-sm text-gray-600 mb-4">
                    Complete your SWOT analysis first to see strategic insights here
                  </p>
                  <Link
                    href="/swot"
                    className="inline-flex items-center px-4 py-2 bg-brand-navy hover:bg-brand-navy-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Go to SWOT Analysis →
                  </Link>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-3">
                    {/* Top Strengths */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
                      <div className="flex items-center gap-2 mb-3">
                        <Shield className="w-4 h-4 text-green-600" />
                        <h4 className="font-semibold text-sm text-green-900">
                          Top Strengths ({topStrengths.length})
                        </h4>
                      </div>
                      {topStrengths.length === 0 ? (
                        <p className="text-sm text-gray-500 italic">No strengths identified</p>
                      ) : (
                        <ul className="space-y-2 pl-1">
                          {topStrengths.map(item => (
                            <li key={item.id} className="flex items-start text-sm text-gray-700">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-2.5 mt-1.5 flex-shrink-0"></span>
                              <span className="leading-relaxed">{item.title}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Top Weaknesses */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
                      <div className="flex items-center gap-2 mb-3">
                        <AlertTriangleIcon className="w-4 h-4 text-red-600" />
                        <h4 className="font-semibold text-sm text-red-900">
                          Top Weaknesses ({topWeaknesses.length})
                        </h4>
                      </div>
                      {topWeaknesses.length === 0 ? (
                        <p className="text-sm text-gray-500 italic">No weaknesses identified</p>
                      ) : (
                        <ul className="space-y-2 pl-1">
                          {topWeaknesses.map(item => (
                            <li key={item.id} className="flex items-start text-sm text-gray-700">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500 mr-2.5 mt-1.5 flex-shrink-0"></span>
                              <span className="leading-relaxed">{item.title}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Top Opportunities */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
                      <div className="flex items-center gap-2 mb-3">
                        <Target className="w-4 h-4 text-brand-orange" />
                        <h4 className="font-semibold text-sm text-brand-navy">
                          Top Opportunities ({topOpportunities.length})
                        </h4>
                      </div>
                      {topOpportunities.length === 0 ? (
                        <p className="text-sm text-gray-500 italic">No opportunities identified</p>
                      ) : (
                        <ul className="space-y-2 pl-1">
                          {topOpportunities.map(item => (
                            <li key={item.id} className="flex items-start text-sm text-gray-700">
                              <span className="w-1.5 h-1.5 rounded-full bg-brand-orange mr-2.5 mt-1.5 flex-shrink-0"></span>
                              <span className="leading-relaxed">{item.title}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Top Threats */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
                      <div className="flex items-center gap-2 mb-3">
                        <Lightbulb className="w-4 h-4 text-brand-orange-600" />
                        <h4 className="font-semibold text-sm text-brand-orange-900">
                          Top Threats ({topThreats.length})
                        </h4>
                      </div>
                      {topThreats.length === 0 ? (
                        <p className="text-sm text-gray-500 italic">No threats identified</p>
                      ) : (
                        <ul className="space-y-2 pl-1">
                          {topThreats.map(item => (
                            <li key={item.id} className="flex items-start text-sm text-gray-700">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-2.5 mt-1.5 flex-shrink-0"></span>
                              <span className="leading-relaxed">{item.title}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  {/* Link to full SWOT */}
                  <div className="text-center pt-2">
                    <a
                      href="/swot"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-sm text-brand-orange hover:text-brand-orange-800 font-medium"
                    >
                      View full SWOT analysis in new tab
                      <span className="ml-1">↗</span>
                    </a>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Step Navigation */}
      <div className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center py-3">
            {dynamicSteps.map((step, index) => {
              const isActive = currentStep === step.num
              const isComplete = stepCompletion[step.num - 1]
              const Icon = step.icon

              // Get requirement hint for each step
              const getRequirementHint = (stepNum: number): string => {
                switch (stepNum) {
                  case 1: return '3yr/2yr/1yr revenue'
                  case 2: return '1+ strategic idea'
                  case 3: return '8-20 initiatives'
                  case 4:
                    // Show what's still needed
                    const needs = []
                    if (!hasAnyQuarterlyTarget) needs.push('targets')
                    const needsInitiatives = unlockedQuarters.filter(
                      q => (safeAnnualPlan[q.id as keyof typeof safeAnnualPlan]?.length || 0) === 0
                    )
                    if (needsInitiatives.length > 0) needs.push(needsInitiatives.map(q => q.label).join('+'))
                    if (needs.length === 0) return '✓ Complete'
                    return `Need: ${needs.join(', ')}`
                  case 5:
                    const needs5 = []
                    if (planningQuarterInitiatives === 0) needs5.push('initiatives')
                    if (!hasOperationalActivities) needs5.push('activities')
                    return needs5.length === 0 ? '✓ Complete' : `Need: ${needs5.join(', ')}`
                  default: return ''
                }
              }

              return (
                <div key={step.num} className="flex items-center flex-1">
                  <button
                    onClick={() => setCurrentStep(step.num)}
                    className={`flex flex-col items-center gap-1.5 p-2 rounded-lg transition-all w-full group ${
                      isActive
                        ? 'bg-brand-orange-50'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all group-hover:scale-105 ${
                      isActive
                        ? 'bg-brand-orange text-white shadow-md'
                        : isComplete
                        ? 'bg-brand-orange-100 text-brand-orange'
                        : 'bg-gray-100 text-gray-400'
                    }`}>
                      {isComplete && !isActive ? (
                        <CheckCircle className="w-5 h-5" />
                      ) : (
                        <Icon className="w-5 h-5" />
                      )}
                    </div>
                    <span className={`text-xs font-medium text-center transition-colors hidden sm:block ${
                      isActive
                        ? 'text-brand-orange'
                        : isComplete
                        ? 'text-brand-navy-700'
                        : 'text-gray-400'
                    }`}>
                      {step.label}
                    </span>
                  </button>

                  {index < dynamicSteps.length - 1 && (
                    <div className={`hidden sm:block h-0.5 w-full transition-colors ${isComplete ? 'bg-brand-orange' : 'bg-gray-200'}`} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Step Header */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              {currentStepInfo && (
                <>
                  <currentStepInfo.icon className="w-5 h-5 sm:w-6 sm:h-6 text-brand-orange flex-shrink-0" />
                  <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900">
                    Step {currentStep}: {currentStepInfo.title}
                  </h2>
                </>
              )}
            </div>
            <button
              onClick={() => setShowStepHelp(!showStepHelp)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-brand-orange-700 bg-brand-orange-50 rounded-lg hover:bg-brand-orange-100 transition-colors flex-shrink-0"
            >
              <HelpCircle className="w-4 h-4" />
              <span className="hidden sm:inline">{showStepHelp ? 'Hide' : 'Show'} Coaching Tips</span>
              <span className="sm:hidden">{showStepHelp ? 'Hide' : 'Show'} Tips</span>
            </button>
          </div>
          <p className="text-sm sm:text-base text-gray-600 sm:ml-9">{currentStepInfo?.description}</p>
        </div>

        {/* Coaching Help Section */}
        {showStepHelp && STEP_COACHING[currentStep] && (
          <div className="mb-6 bg-amber-50 border-2 border-amber-200 rounded-xl p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
              <Brain className="w-5 h-5 text-amber-700" />
              <h3 className="text-lg font-semibold text-amber-900">Strategic Coaching for This Step</h3>
            </div>

            {/* Questions */}
            <div className="mb-4">
              <p className="text-base font-medium text-amber-900 mb-3">💡 Key Questions to Consider:</p>
              <ul className="space-y-2">
                {STEP_COACHING[currentStep].questions.map((question, idx) => (
                  <li key={idx} className="flex items-start text-base text-amber-800">
                    <span className="text-amber-600 mr-2 mt-1">•</span>
                    <span>{question}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Tips */}
            <div className="border-t border-amber-300 pt-4">
              <p className="text-base font-medium text-amber-900 mb-3">✓ Best Practices:</p>
              <ul className="space-y-2">
                {STEP_COACHING[currentStep].tips.map((tip, idx) => (
                  <li key={idx} className="flex items-start text-base text-amber-800">
                    <span className="text-amber-600 mr-2 mt-1">→</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Step Content */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          {currentStep === 1 && (
            <div className="p-4 sm:p-6">
              <Step1GoalsAndKPIs
                financialData={financialData}
                updateFinancialValue={updateFinancialValue}
                coreMetrics={coreMetrics}
                updateCoreMetric={updateCoreMetric}
                kpis={kpis}
                updateKPIValue={updateKPIValue}
                addKPI={addKPI}
                deleteKPI={deleteKPI}
                yearType={yearType}
                setYearType={setYearType}
                collapsedSections={collapsedSections}
                toggleSection={toggleSection}
                industry={industry}
                showKPIModal={showKPIModal}
                setShowKPIModal={setShowKPIModal}
                businessId={businessId}
              />
            </div>
          )}

          {currentStep === 2 && (
            <div className="p-4 sm:p-6">
              <Step2StrategicIdeas
                strategicIdeas={strategicIdeas}
                setStrategicIdeas={setStrategicIdeas}
                currentRevenue={financialData?.revenue?.current || 0}
              />
            </div>
          )}

          {currentStep === 3 && (
            <div className="p-4 sm:p-6">
              <Step3PrioritizeInitiatives
                strategicIdeas={strategicIdeas}
                twelveMonthInitiatives={twelveMonthInitiatives}
                setTwelveMonthInitiatives={setTwelveMonthInitiatives}
                currentRevenue={financialData?.revenue?.current || 0}
              />
            </div>
          )}

          {currentStep === 4 && (
            <div className="p-4 sm:p-6">
              <Step4AnnualPlan
                twelveMonthInitiatives={twelveMonthInitiatives}
                annualPlanByQuarter={annualPlanByQuarter}
                setAnnualPlanByQuarter={setAnnualPlanByQuarter}
                quarterlyTargets={quarterlyTargets}
                setQuarterlyTargets={setQuarterlyTargets}
                financialData={financialData}
                coreMetrics={coreMetrics}
                kpis={kpis}
                yearType={yearType}
                businessId={businessId}
              />
            </div>
          )}

          {currentStep === 5 && (
            <div className="p-4 sm:p-6">
              <Step5SprintPlanning
                annualPlanByQuarter={annualPlanByQuarter}
                setAnnualPlanByQuarter={setAnnualPlanByQuarter}
                quarterlyTargets={quarterlyTargets}
                financialData={financialData}
                coreMetrics={coreMetrics}
                kpis={kpis}
                yearType={yearType}
                businessId={businessId}
                operationalActivities={operationalActivities}
                setOperationalActivities={setOperationalActivities}
                planningQuarterLabel={planningQuarter?.label || 'Q3'}
                planningQuarterInitiatives={planningQuarterInitiatives}
                hasOperationalActivities={hasOperationalActivities}
              />
            </div>
          )}
        </div>

        {/* Validation Warning */}
        {showValidationWarning && !currentStepComplete && (
          <div className="mt-6 p-4 sm:p-6 bg-amber-50 border-2 border-amber-300 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-semibold text-amber-900">Complete this step to continue</h4>
              <p className="text-sm text-amber-800 mt-1">{getValidationMessage(currentStep)}</p>
            </div>
            <button
              onClick={() => setShowValidationWarning(false)}
              className="text-amber-600 hover:text-amber-800"
            >
              ✕
            </button>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mt-8">
          <button
            onClick={() => setCurrentStep((prev) => Math.max(1, prev - 1) as StepNumber)}
            disabled={!canGoPrevious}
            className={`flex items-center justify-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              canGoPrevious
                ? 'bg-white border border-gray-300 hover:bg-gray-50 text-gray-700'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
            }`}
          >
            <ChevronLeft className="w-5 h-5" />
            <span>Previous</span>
          </button>

          <div className="flex flex-col items-center order-last sm:order-none">
            <span className="text-sm text-gray-600">
              Step {currentStep} of {dynamicSteps.length}
            </span>
            {!currentStepComplete && canGoNext && (
              <span className="text-xs text-amber-600 mt-1">
                Complete to unlock next step
              </span>
            )}
          </div>

          <button
            onClick={handleNextClick}
            disabled={!canGoNext}
            className={`flex items-center justify-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              !canGoNext
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                : currentStepComplete
                ? 'bg-brand-orange hover:bg-brand-orange-600 text-white'
                : 'bg-amber-500 hover:bg-amber-600 text-white'
            }`}
          >
            <span className="hidden sm:inline">{currentStepComplete ? 'Next' : 'Complete to Continue'}</span>
            <span className="sm:hidden">{currentStepComplete ? 'Next' : 'Complete'}</span>
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Completion Summary - Show on Step 5 */}
        {currentStep === 5 && (
          <div className="mt-8 space-y-4">
            {/* Full Completion Message */}
            {step1Complete && step2Complete && step3Complete && step4Complete && step5Complete && (
              <div className="p-4 sm:p-6 bg-green-50 border-2 border-green-200 rounded-xl">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-lg font-semibold text-green-900 mb-2">
                      Your Strategic Plan is Complete!
                    </h3>
                    <p className="text-base text-green-800">
                      You've completed all 5 steps and have a clear roadmap for the next 90 days and beyond. Time to execute!
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Step Completion Summary */}
            <div className="p-4 sm:p-6 bg-white rounded-xl shadow-sm border border-gray-200">
              <h3 className="text-sm font-bold text-brand-navy mb-4 uppercase tracking-wide">Strategic Plan Summary</h3>
              <div className="space-y-3">
                {/* Step 1 Summary */}
                <div className={`flex items-start gap-3 p-3 rounded-lg ${step1Complete ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
                  {step1Complete ? (
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${step1Complete ? 'text-green-900' : 'text-amber-900'}`}>
                      Step 1: 3-Year Goals & KPIs
                    </p>
                    <p className={`text-xs mt-0.5 ${step1Complete ? 'text-green-700' : 'text-amber-700'}`}>
                      {step1Complete
                        ? `Revenue targets set: Year 3 (${financialData?.revenue?.year3?.toLocaleString() || 0}), Year 2 (${financialData?.revenue?.year2?.toLocaleString() || 0}), Year 1 (${financialData?.revenue?.year1?.toLocaleString() || 0})`
                        : 'Set 3-year, 2-year, and 1-year revenue targets'
                      }
                    </p>
                  </div>
                </div>

                {/* Step 2 Summary */}
                <div className={`flex items-start gap-3 p-3 rounded-lg ${step2Complete ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
                  {step2Complete ? (
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${step2Complete ? 'text-green-900' : 'text-amber-900'}`}>
                      Step 2: Strategic Ideas
                    </p>
                    <p className={`text-xs mt-0.5 ${step2Complete ? 'text-green-700' : 'text-amber-700'}`}>
                      {step2Complete
                        ? `${strategicIdeas?.length || 0} strategic ideas captured`
                        : 'Add at least 1 strategic idea'
                      }
                    </p>
                  </div>
                </div>

                {/* Step 3 Summary */}
                <div className={`flex items-start gap-3 p-3 rounded-lg ${step3Complete ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
                  {step3Complete ? (
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${step3Complete ? 'text-green-900' : 'text-amber-900'}`}>
                      Step 3: Prioritize Initiatives
                    </p>
                    <p className={`text-xs mt-0.5 ${step3Complete ? 'text-green-700' : 'text-amber-700'}`}>
                      {step3Complete
                        ? `${twelveMonthInitiatives?.length || 0} initiatives prioritized for Year 1`
                        : `Select 8-20 initiatives (currently ${twelveMonthInitiatives?.length || 0})`
                      }
                    </p>
                  </div>
                </div>

                {/* Step 4 Summary */}
                <div className={`flex items-start gap-3 p-3 rounded-lg ${step4Complete ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
                  {step4Complete ? (
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${step4Complete ? 'text-green-900' : 'text-amber-900'}`}>
                      Step 4: Annual Plan
                    </p>
                    <p className={`text-xs mt-0.5 ${step4Complete ? 'text-green-700' : 'text-amber-700'}`}>
                      {step4Complete
                        ? `Initiatives distributed across ${unlockedQuarters.length} quarters`
                        : `Assign initiatives to unlocked quarters (${unlockedQuarters.filter(q => (safeAnnualPlan[q.id as keyof typeof safeAnnualPlan]?.length || 0) > 0).length}/${unlockedQuarters.length} done)`
                      }
                    </p>
                  </div>
                </div>

                {/* Step 5 Summary */}
                <div className={`flex items-start gap-3 p-3 rounded-lg ${step5Complete ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
                  {step5Complete ? (
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${step5Complete ? 'text-green-900' : 'text-amber-900'}`}>
                      Step 5: Sprint Planning
                    </p>
                    <p className={`text-xs mt-0.5 ${step5Complete ? 'text-green-700' : 'text-amber-700'}`}>
                      {step5Complete
                        ? `${planningQuarterInitiatives} initiatives + ${operationalActivities?.length || 0} operational activities`
                        : `Add initiatives to ${planningQuarter?.label || 'planning quarter'} + operational activities`
                      }
                    </p>
                  </div>
                </div>
              </div>

              {/* Progress Stats */}
              <div className="mt-4 pt-4 border-t border-slate-200 flex items-center justify-between">
                <span className="text-sm text-gray-600">
                  Overall Progress: <span className="font-bold text-brand-navy">{completedCount}/5 steps</span>
                </span>
                <div className="w-32 h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${completedCount === 5 ? 'bg-green-500' : 'bg-brand-orange-500'}`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="bg-gray-50 border-t mt-12 py-8">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sm text-gray-600">
            Need help? Contact your coaching team or check our guidance resources
          </p>
        </div>
      </div>
    </div>
  )
}

export default function StrategicPlanningPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-brand-orange" />
      </div>
    }>
      <StrategicPlanningContent />
    </Suspense>
  )
}