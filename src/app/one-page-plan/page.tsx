'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useBusinessContext } from '@/hooks/useBusinessContext'
import { Printer, Loader2, ExternalLink, CheckCircle2, Circle, Lightbulb, FileText, ChevronDown, History, ArrowLeft } from 'lucide-react'
import type { QuarterInfo } from '@/app/goals/utils/quarters'
import { calculateQuarters } from '@/app/goals/utils/quarters'
import PageHeader from '@/components/ui/PageHeader'
import type { OnePagePlanData, PlanSnapshot } from './types'
import { assemblePlanData } from './services/plan-data-assembler'
import { planSnapshotService } from './services/plan-snapshot-service'

// Only log in development
const isDev = process.env.NODE_ENV === 'development'
const devLog = (message: string, ...args: any[]) => {
  if (isDev) {
    console.log(message, ...args)
  }
}

export default function OnePagePlan() {
  const router = useRouter()
  const supabase = createClient()
  const { activeBusiness, isLoading: contextLoading } = useBusinessContext()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<OnePagePlanData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [allQuarters, setAllQuarters] = useState<QuarterInfo[]>([])
  const [selectedQuarterId, setSelectedQuarterId] = useState<string | null>(null)
  const [showQuarterPicker, setShowQuarterPicker] = useState(false)

  // Version history state
  const [snapshots, setSnapshots] = useState<PlanSnapshot[]>([])
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null)
  const [isViewingSnapshot, setIsViewingSnapshot] = useState(false)
  const [showVersionPicker, setShowVersionPicker] = useState(false)
  const [livePlanData, setLivePlanData] = useState<OnePagePlanData | null>(null)

  // Calculate strategic health metrics
  const calculatePlanHealth = (planData: OnePagePlanData) => {
    const sections = [
      { name: 'Vision', complete: !!planData.vision, link: '/vision-mission' },
      { name: 'Mission', complete: !!planData.mission, link: '/vision-mission' },
      { name: 'Core Values', complete: planData.coreValues.length >= 3, link: '/vision-mission' },
      { name: 'SWOT Analysis', complete: planData.strengths.length > 0 && planData.weaknesses.length > 0, link: '/swot' },
      { name: 'Financial Goals', complete: planData.financialGoals.year1.revenue > 0, link: '/goals' },
      { name: '12-Month Initiatives', complete: planData.strategicInitiatives.length >= 3, link: '/goals' },
      { name: 'Quarterly Rocks', complete: planData.quarterlyRocks.length >= 1, link: '/goals' },
    ]

    const completedCount = sections.filter(s => s.complete).length
    const totalCount = sections.length
    const percentage = Math.round((completedCount / totalCount) * 100)

    return { sections, completedCount, totalCount, percentage }
  }

  // Generate coaching insights based on plan data
  const generateCoachingInsights = (planData: OnePagePlanData) => {
    const insights: string[] = []

    // Vision/Mission insights
    if (!planData.vision) {
      insights.push('Define your 3-year vision to give your team a clear destination to work towards.')
    }
    if (!planData.mission) {
      insights.push('Your mission statement helps everyone understand WHY your business exists.')
    }
    if (planData.coreValues.length < 3) {
      insights.push('Add at least 3 core values to guide decision-making across your organization.')
    }

    // SWOT insights
    if (planData.strengths.length === 0) {
      insights.push('Identify your key strengths - these are your competitive advantages to leverage.')
    }
    if (planData.opportunities.length > 0 && planData.strategicInitiatives.length === 0) {
      insights.push('You\'ve identified opportunities but no initiatives. Consider creating action plans.')
    }
    if (planData.threats.length > 0 && planData.quarterlyRocks.length === 0) {
      insights.push('You\'ve identified threats. Add quarterly rocks to address your most urgent risks.')
    }

    // Goals insights
    if (planData.financialGoals.year1.revenue > 0 && planData.financialGoals.quarter.revenue === 0) {
      insights.push('Set quarterly revenue targets to track progress toward your annual goal.')
    }
    if (planData.strategicInitiatives.length > 10) {
      insights.push('You have many initiatives. Consider prioritizing the top 5-7 for better focus.')
    }
    if (planData.quarterlyRocks.length > 5) {
      insights.push('More than 5 quarterly rocks can dilute focus. Prioritize your top 3-5.')
    }
    if (planData.quarterlyRocks.length > 0 && planData.quarterlyRocks.every(r => !r.owner)) {
      insights.push('Assign owners to your quarterly rocks to ensure accountability.')
    }

    // Positive insights when things are good
    if (insights.length === 0) {
      if (planData.strategicInitiatives.length >= 3 && planData.quarterlyRocks.length >= 3) {
        insights.push('Your strategic plan is well-structured. Review quarterly to stay on track.')
      }
      if (planData.vision && planData.mission && planData.coreValues.length >= 3) {
        insights.push('Strong foundation! Your vision, mission, and values create clear direction.')
      }
    }

    return insights.slice(0, 3) // Return top 3 insights
  }

  useEffect(() => {
    if (!contextLoading) {
      loadAllData()
    }
  }, [contextLoading, activeBusiness?.id])

  // Auto-reload data when page becomes visible (user navigates back)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadAllData()
      }
    }

    const handleFocus = () => {
      loadAllData()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [])

  const loadAllData = async (overrideQuarterId?: string) => {
    try {
      setLoading(true)

      const result = await assemblePlanData({
        supabase,
        activeBusiness: activeBusiness ? { id: activeBusiness.id, ownerId: activeBusiness.ownerId } : null,
        selectedQuarterId: overrideQuarterId || selectedQuarterId || undefined,
      })

      if (!result) {
        router.push('/auth/login')
        return
      }

      setData(result.planData)
      setLivePlanData(result.planData)
      setAllQuarters(result.allQuarters)
      if (!overrideQuarterId && !selectedQuarterId) {
        setSelectedQuarterId(result.selectedQuarterId)
      }
      setLastUpdated(new Date())

      // Load snapshots for version history (use businessId from profile)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          let snapshotBusinessId: string | undefined
          if (activeBusiness?.id) {
            const { data: profileData } = await supabase
              .from('business_profiles')
              .select('id')
              .eq('business_id', activeBusiness.id)
              .single()
            snapshotBusinessId = profileData?.id || activeBusiness.id
          } else {
            const targetUserId = activeBusiness?.ownerId || user.id
            const { data: profileData } = await supabase
              .from('business_profiles')
              .select('id')
              .eq('user_id', targetUserId)
              .single()
            snapshotBusinessId = profileData?.id || user.id
          }
          if (snapshotBusinessId) {
            const snapshotsList = await planSnapshotService.getSnapshots(snapshotBusinessId)
            setSnapshots(snapshotsList)
          }
        }
      } catch (snapshotErr) {
        console.warn('[One Page Plan] Could not load snapshots:', snapshotErr)
      }
    } catch (err) {
      console.error('[One Page Plan] Error loading data:', err)
      setError(`Failed to load plan data: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectSnapshot = async (snapshotId: string) => {
    if (snapshotId === 'live') {
      setIsViewingSnapshot(false)
      setSelectedSnapshotId(null)
      setData(livePlanData)
      setShowVersionPicker(false)
      return
    }

    const snapshot = snapshots.find(s => s.id === snapshotId)
    if (snapshot) {
      setIsViewingSnapshot(true)
      setSelectedSnapshotId(snapshotId)
      setData(snapshot.plan_data)
      setShowVersionPicker(false)
    }
  }

  const handleReturnToLive = () => {
    setIsViewingSnapshot(false)
    setSelectedSnapshotId(null)
    setData(livePlanData)
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  // Calculate margin percentage (profit / revenue * 100)
  const calculateMargin = (profit: number, revenue: number): string => {
    if (!revenue || revenue === 0) return '-'
    const margin = (profit / revenue) * 100
    return `${margin.toFixed(1)}%`
  }

  const handlePrint = () => {
    window.print()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-brand-orange mx-auto mb-4" />
          <p className="text-gray-600">Loading your One Page Plan...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 font-medium mb-2">Error loading plan</p>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page Header - Hidden when printing */}
      <div className="print:hidden">
        <PageHeader
          variant="banner"
          title="One Page Strategic Plan"
          subtitle={`${data.companyName} • Year ${data.planYear} • ${data.yearType === 'FY' ? 'Financial Year' : 'Calendar Year'}`}
          icon={FileText}
          backLink={{ href: '/dashboard', label: 'Back to Dashboard' }}
          actions={
            <>
              {!isViewingSnapshot && (
                <button
                  onClick={() => router.push('/goals')}
                  className="flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2 bg-brand-orange hover:bg-brand-orange-600 text-white rounded-lg font-medium text-sm"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span className="hidden sm:inline">Edit Strategic Plan</span>
                  <span className="sm:hidden">Edit</span>
                </button>
              )}
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg font-medium text-sm"
              >
                <Printer className="w-4 h-4" />
                <span className="hidden sm:inline">Print</span>
              </button>
            </>
          }
        />
      </div>

      {/* Quarter Selector - Hidden when printing and when viewing snapshot */}
      {allQuarters.length > 0 && !isViewingSnapshot && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4 mb-2 print:hidden">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-600">Viewing quarter:</span>
            <div className="relative">
              <button
                onClick={() => setShowQuarterPicker(!showQuarterPicker)}
                className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg text-sm font-medium text-gray-800 shadow-sm"
              >
                {allQuarters.find(q => q.id === selectedQuarterId)?.label || 'Select'}{' '}
                ({allQuarters.find(q => q.id === selectedQuarterId)?.months})
                {allQuarters.find(q => q.id === selectedQuarterId)?.isCurrent && (
                  <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">Current</span>
                )}
                <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
              </button>
              {showQuarterPicker && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowQuarterPicker(false)} />
                  <div className="absolute left-0 mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 z-50 py-1">
                    {allQuarters.map((q) => (
                      <button
                        key={q.id}
                        onClick={() => {
                          setSelectedQuarterId(q.id)
                          setShowQuarterPicker(false)
                          loadAllData(q.id)
                        }}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center justify-between ${
                          q.id === selectedQuarterId ? 'bg-brand-orange-50 text-brand-orange font-medium' : 'text-gray-700'
                        }`}
                      >
                        <span>{q.label} ({q.months})</span>
                        <div className="flex items-center gap-1.5">
                          {q.isCurrent && (
                            <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">Current</span>
                          )}
                          {q.isPast && (
                            <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">Past</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Version History + Snapshot Banner - Hidden when printing */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-2 mb-2 print:hidden">
        <div className="flex items-center justify-between gap-3">
          {/* Version Picker */}
          <div className="flex items-center gap-3">
            <History className="w-4 h-4 text-gray-400" />
            <div className="relative">
              <button
                onClick={() => setShowVersionPicker(!showVersionPicker)}
                className={`flex items-center gap-2 px-3 py-1.5 border rounded-lg text-sm font-medium shadow-sm ${
                  isViewingSnapshot
                    ? 'bg-amber-50 border-amber-300 text-amber-800'
                    : 'bg-white border-gray-300 hover:bg-gray-50 text-gray-800'
                }`}
              >
                {isViewingSnapshot
                  ? snapshots.find(s => s.id === selectedSnapshotId)?.label || 'Snapshot'
                  : 'Live (Current)'}
                <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
              </button>
              {showVersionPicker && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowVersionPicker(false)} />
                  <div className="absolute left-0 mt-1 w-72 bg-white rounded-lg shadow-lg border border-gray-200 z-50 py-1 max-h-64 overflow-y-auto">
                    <button
                      onClick={() => handleSelectSnapshot('live')}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center justify-between ${
                        !isViewingSnapshot ? 'bg-brand-orange-50 text-brand-orange font-medium' : 'text-gray-700'
                      }`}
                    >
                      <span>Live (Current)</span>
                      <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">Live</span>
                    </button>
                    {snapshots.length > 0 && (
                      <div className="border-t border-gray-100 my-1" />
                    )}
                    {snapshots.map((snapshot) => (
                      <button
                        key={snapshot.id}
                        onClick={() => handleSelectSnapshot(snapshot.id)}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${
                          selectedSnapshotId === snapshot.id ? 'bg-brand-orange-50 text-brand-orange font-medium' : 'text-gray-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="truncate">{snapshot.label}</span>
                          <span className="text-[10px] text-gray-400 ml-2 flex-shrink-0">v{snapshot.version_number}</span>
                        </div>
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          {new Date(snapshot.created_at).toLocaleDateString()} {new Date(snapshot.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </button>
                    ))}
                    {snapshots.length === 0 && (
                      <div className="px-4 py-3 text-xs text-gray-500 text-center">
                        No snapshots yet. Complete the Goals Wizard or a Quarterly Review to create one.
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Snapshot active banner */}
          {isViewingSnapshot && (
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-1 bg-amber-100 text-amber-800 rounded-full font-medium">
                Historical Snapshot
              </span>
              <button
                onClick={handleReturnToLive}
                className="flex items-center gap-1 text-xs text-brand-orange hover:text-brand-orange-700 font-medium"
              >
                <ArrowLeft className="w-3 h-3" />
                Return to live plan
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Strategic Health Dashboard - Hidden when printing */}
      {data && (() => {
        const health = calculatePlanHealth(data)
        const insights = generateCoachingInsights(data)
        return (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-6 print:hidden">
            <div className="rounded-xl shadow-sm border border-gray-200 bg-white p-4 sm:p-6">
              <div className="flex flex-col lg:flex-row items-start gap-4 sm:gap-6">
                {/* Health Score */}
                <div className="flex-shrink-0">
                  <div className="relative">
                    <svg className="w-24 h-24 sm:w-28 sm:h-28" viewBox="0 0 100 100">
                      <circle
                        cx="50"
                        cy="50"
                        r="42"
                        stroke="#e5e7eb"
                        strokeWidth="8"
                        fill="none"
                        transform="rotate(-90 50 50)"
                      />
                      <circle
                        cx="50"
                        cy="50"
                        r="42"
                        stroke={health.percentage >= 70 ? '#22c55e' : health.percentage >= 40 ? '#f59e0b' : '#ef4444'}
                        strokeWidth="8"
                        fill="none"
                        strokeDasharray={`${(health.percentage / 100) * 264} 264`}
                        strokeLinecap="round"
                        transform="rotate(-90 50 50)"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-2xl sm:text-3xl font-bold text-gray-900">{health.percentage}%</span>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 text-center mt-2 font-medium">Plan Health</p>
                </div>

                {/* Section Checklist */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">Strategic Plan Completeness</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    {health.sections.map((section, idx) => (
                      <Link
                        key={idx}
                        href={section.link}
                        className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded ${
                          section.complete
                            ? 'text-green-700 bg-green-50 hover:bg-green-100'
                            : 'text-gray-600 bg-gray-50 hover:bg-gray-100'
                        }`}
                      >
                        {section.complete ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                        ) : (
                          <Circle className="w-3.5 h-3.5 text-gray-400" />
                        )}
                        <span className="truncate">{section.name}</span>
                      </Link>
                    ))}
                  </div>
                </div>

                {/* Quarter Focus Visualization */}
                <div className="flex-shrink-0 w-full sm:w-auto">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-sm font-semibold text-gray-900">Quarter Focus</h3>
                    <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                      {data.yearType === 'FY' ? 'Financial Year' : 'Calendar Year'}
                    </span>
                  </div>
                  <div className="flex gap-1 overflow-x-auto">
                    {(() => {
                      const quarters = calculateQuarters(data.yearType, data.planYear)
                      return quarters.map((q) => {
                        const isSelected = q.id === selectedQuarterId
                        return (
                          <div
                            key={q.id}
                            className={`flex flex-col items-center justify-center rounded px-2 py-1.5 ${
                              isSelected
                                ? 'bg-brand-orange text-white ring-2 ring-brand-orange-300'
                                : q.isCurrent
                                  ? 'bg-brand-orange-100 text-brand-orange ring-1 ring-brand-orange-200'
                                  : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            <span className="text-xs font-semibold">{q.label}</span>
                            <span className={`text-[9px] ${isSelected ? 'text-brand-orange-100' : q.isCurrent ? 'text-brand-orange-400' : 'text-gray-400'}`}>{q.months}</span>
                          </div>
                        )
                      })
                    })()}
                  </div>
                  <div className="mt-2 text-xs text-gray-600 space-y-0.5">
                    <p><span className="font-medium">{data.strategicInitiatives.length}</span> annual initiatives</p>
                    <p><span className="font-medium">{data.quarterlyRocks.length}</span> {data.currentQuarterLabel} rocks</p>
                  </div>
                </div>

                {/* Coaching Insights */}
                {insights.length > 0 && (
                  <div className="flex-shrink-0 w-full lg:max-w-xs">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Lightbulb className="w-4 h-4 text-amber-500" />
                      <h3 className="text-sm font-semibold text-gray-900">Coaching Insights</h3>
                    </div>
                    <ul className="space-y-1.5">
                      {insights.map((insight, idx) => (
                        <li key={idx} className="text-xs text-gray-600 leading-relaxed">
                          {insight}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* One Page Plan - Printable */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow-lg rounded-xl print:shadow-none print:rounded-none">
          {/* Header */}
          <div className="border-b-4 border-gray-900 p-4 sm:p-6 print:p-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 print:text-2xl">{data.companyName}</h1>
                <p className="text-sm sm:text-base text-gray-600 mt-1">One Page Strategic Plan</p>
              </div>
              <div className="sm:text-right">
                <p className="text-sm sm:text-base font-semibold text-gray-900">Year {data.planYear}</p>
                <p className="text-xs sm:text-sm text-gray-600">{new Date().toLocaleDateString()}</p>
                {lastUpdated && (
                  <p className="text-xs text-gray-500">Updated {lastUpdated.toLocaleTimeString()}</p>
                )}
                <p className="text-xs sm:text-sm text-red-600 mt-1 font-medium">CONFIDENTIAL</p>
              </div>
            </div>
          </div>

          {/* Vision, Mission & Core Values Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 border-b border-gray-300">
            <div className="md:border-r border-gray-300 flex flex-col border-b md:border-b-0">
              <div className="bg-brand-orange-50 px-3 py-2 border-b border-gray-300">
                <h3 className="text-xs sm:text-sm font-bold text-brand-navy uppercase text-center print:text-xs">Vision (Where We're Going)</h3>
              </div>
              <div className="flex-1 flex items-center justify-center p-3 sm:p-4">
                {data.vision ? (
                  <p className="text-xs sm:text-sm text-gray-900 leading-relaxed text-center print:text-xs">{data.vision}</p>
                ) : (
                  <div className="text-center">
                    <p className="text-xs sm:text-sm text-gray-500 mb-2">Vision not set</p>
                    <Link href="/vision-mission" className="text-xs text-brand-orange hover:text-brand-orange-800 underline print:hidden">
                      Set your vision →
                    </Link>
                  </div>
                )}
              </div>
            </div>
            <div className="md:border-r border-gray-300 flex flex-col border-b md:border-b-0">
              <div className="bg-brand-orange-50 px-3 py-2 border-b border-gray-300">
                <h3 className="text-xs sm:text-sm font-bold text-brand-navy uppercase text-center print:text-xs">Mission (Why We Exist)</h3>
              </div>
              <div className="flex-1 flex items-center justify-center p-3 sm:p-4">
                {data.mission ? (
                  <p className="text-xs sm:text-sm text-gray-900 leading-relaxed text-center print:text-xs">{data.mission}</p>
                ) : (
                  <div className="text-center">
                    <p className="text-xs sm:text-sm text-gray-500 mb-2">Mission not set</p>
                    <Link href="/vision-mission" className="text-xs text-brand-orange hover:text-brand-orange-800 underline print:hidden">
                      Set your mission →
                    </Link>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col">
              <div className="bg-brand-orange-50 px-3 py-2 border-b border-gray-300">
                <h3 className="text-xs sm:text-sm font-bold text-brand-navy uppercase text-center print:text-xs">Core Values</h3>
              </div>
              <div className="flex-1 flex items-center justify-center p-3 sm:p-4">
                {data.coreValues.length > 0 ? (
                  <ul className="space-y-1 text-center">
                    {data.coreValues.slice(0, 8).map((value, idx) => (
                      <li key={idx} className="text-xs sm:text-sm text-gray-900 print:text-xs">
                        {value}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-center">
                    <p className="text-xs sm:text-sm text-gray-500 mb-2">Core values not set</p>
                    <Link href="/vision-mission" className="text-xs text-brand-orange hover:text-brand-orange-800 underline">
                      Add core values →
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* SWOT Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border-b border-gray-300">
            <div className="p-3 sm:p-4 lg:border-r border-gray-300 border-b sm:border-b lg:border-b-0">
              <h3 className="text-xs sm:text-sm font-bold text-green-700 uppercase mb-2 print:text-xs">Strengths</h3>
              {data.strengths.length > 0 ? (
                <ol className="space-y-1">
                  {data.strengths.slice(0, 5).map((item, idx) => (
                    <li key={idx} className="text-xs sm:text-sm text-gray-800 print:text-xs">{idx + 1}. {item}</li>
                  ))}
                </ol>
              ) : (
                <div className="text-center py-4">
                  <p className="text-xs text-gray-500 mb-2">No strengths identified</p>
                  <Link href="/swot" className="text-xs text-brand-orange hover:text-brand-orange-800 underline print:hidden">
                    Complete SWOT →
                  </Link>
                </div>
              )}
            </div>

            <div className="p-3 sm:p-4 sm:border-r lg:border-r border-gray-300 border-b sm:border-b-0 lg:border-b-0">
              <h3 className="text-xs sm:text-sm font-bold text-brand-orange-700 uppercase mb-2 print:text-xs">Weaknesses</h3>
              {data.weaknesses.length > 0 ? (
                <ol className="space-y-1">
                  {data.weaknesses.slice(0, 5).map((item, idx) => (
                    <li key={idx} className="text-xs sm:text-sm text-gray-800 print:text-xs">{idx + 1}. {item}</li>
                  ))}
                </ol>
              ) : (
                <div className="text-center py-4">
                  <p className="text-xs text-gray-500 mb-2">No weaknesses identified</p>
                  <Link href="/swot" className="text-xs text-brand-orange hover:text-brand-orange-800 underline print:hidden">
                    Complete SWOT →
                  </Link>
                </div>
              )}
            </div>

            <div className="p-3 sm:p-4 lg:border-r border-gray-300 border-b sm:border-b lg:border-b-0">
              <h3 className="text-xs sm:text-sm font-bold text-brand-orange-700 uppercase mb-2 print:text-xs">Opportunities</h3>
              {data.opportunities.length > 0 ? (
                <ol className="space-y-1">
                  {data.opportunities.slice(0, 5).map((item, idx) => (
                    <li key={idx} className="text-xs sm:text-sm text-gray-800 print:text-xs">{idx + 1}. {item}</li>
                  ))}
                </ol>
              ) : (
                <div className="text-center py-4">
                  <p className="text-xs text-gray-500 mb-2">No opportunities identified</p>
                  <Link href="/swot" className="text-xs text-brand-orange hover:text-brand-orange-800 underline print:hidden">
                    Complete SWOT →
                  </Link>
                </div>
              )}
            </div>

            <div className="p-3 sm:p-4">
              <h3 className="text-xs sm:text-sm font-bold text-red-700 uppercase mb-2 print:text-xs">Threats</h3>
              {data.threats.length > 0 ? (
                <ol className="space-y-1">
                  {data.threats.slice(0, 5).map((item, idx) => (
                    <li key={idx} className="text-xs sm:text-sm text-gray-800 print:text-xs">{idx + 1}. {item}</li>
                  ))}
                </ol>
              ) : (
                <div className="text-center py-4">
                  <p className="text-xs text-gray-500 mb-2">No threats identified</p>
                  <Link href="/swot" className="text-xs text-brand-orange hover:text-brand-orange-800 underline print:hidden">
                    Complete SWOT →
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Goals & Metrics Table */}
          <div className="border-b border-gray-300 overflow-x-auto">
            <div className="bg-brand-orange-50 px-3 py-2 border-b border-gray-300">
              <h3 className="text-xs sm:text-sm font-bold text-brand-navy uppercase print:text-xs">Goals & Key Metrics</h3>
            </div>
            <table className="w-full text-xs sm:text-sm print:text-xs">
              <colgroup>
                <col className="w-[30%]" />
                <col className="w-[20%]" />
                <col className="w-[25%]" />
                <col className="w-[25%]" />
              </colgroup>
              <thead>
                <tr className="bg-gray-100 border-b border-gray-300">
                  <th className="text-left p-2 font-semibold text-gray-700">Metric</th>
                  <th className="text-center p-2 font-semibold text-gray-700">3-Year Goal</th>
                  <th className="text-center p-2 font-semibold text-brand-orange-700">1-Year Goal</th>
                  <th className="text-center p-2 font-semibold text-green-700">{data.currentQuarterLabel} Target</th>
                </tr>
              </thead>
              <tbody>
                {/* Financial Goals Section */}
                <tr className="bg-gray-100">
                  <td colSpan={4} className="p-2 font-bold text-gray-700 text-xs uppercase">Financial Goals</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="p-2 font-semibold pl-4">Revenue</td>
                  <td className="p-2 text-center">{formatCurrency(data.financialGoals.year3.revenue)}</td>
                  <td className="p-2 text-center font-semibold text-brand-navy">{formatCurrency(data.financialGoals.year1.revenue)}</td>
                  <td className="p-2 text-center font-semibold text-green-700">{formatCurrency(data.financialGoals.quarter.revenue)}</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="p-2 font-semibold pl-4">Gross Profit</td>
                  <td className="p-2 text-center">
                    <div>{formatCurrency(data.financialGoals.year3.grossProfit)}</div>
                    <div className="text-xs text-gray-500">({calculateMargin(data.financialGoals.year3.grossProfit, data.financialGoals.year3.revenue)})</div>
                  </td>
                  <td className="p-2 text-center font-semibold text-brand-navy">
                    <div>{formatCurrency(data.financialGoals.year1.grossProfit)}</div>
                    <div className="text-xs text-brand-orange font-normal">({calculateMargin(data.financialGoals.year1.grossProfit, data.financialGoals.year1.revenue)})</div>
                  </td>
                  <td className="p-2 text-center font-semibold text-green-700">
                    <div>{formatCurrency(data.financialGoals.quarter.grossProfit)}</div>
                    <div className="text-xs text-green-600 font-normal">({calculateMargin(data.financialGoals.quarter.grossProfit, data.financialGoals.quarter.revenue)})</div>
                  </td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="p-2 font-semibold pl-4">Net Profit</td>
                  <td className="p-2 text-center">
                    <div>{formatCurrency(data.financialGoals.year3.netProfit)}</div>
                    <div className="text-xs text-gray-500">({calculateMargin(data.financialGoals.year3.netProfit, data.financialGoals.year3.revenue)})</div>
                  </td>
                  <td className="p-2 text-center font-semibold text-brand-navy">
                    <div>{formatCurrency(data.financialGoals.year1.netProfit)}</div>
                    <div className="text-xs text-brand-orange font-normal">({calculateMargin(data.financialGoals.year1.netProfit, data.financialGoals.year1.revenue)})</div>
                  </td>
                  <td className="p-2 text-center font-semibold text-green-700">
                    <div>{formatCurrency(data.financialGoals.quarter.netProfit)}</div>
                    <div className="text-xs text-green-600 font-normal">({calculateMargin(data.financialGoals.quarter.netProfit, data.financialGoals.quarter.revenue)})</div>
                  </td>
                </tr>

                {/* Core Business Metrics Section */}
                <tr className="bg-gray-100">
                  <td colSpan={4} className="p-2 font-bold text-gray-700 text-xs uppercase">Core Business Metrics</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="p-2 font-semibold pl-4">Leads per Month</td>
                  <td className="p-2 text-center">{data.coreMetrics.year3.leadsPerMonth || 0}</td>
                  <td className="p-2 text-center font-semibold text-brand-navy">{data.coreMetrics.year1.leadsPerMonth || 0}</td>
                  <td className="p-2 text-center font-semibold text-green-700">{data.coreMetrics.quarter.leadsPerMonth || 0}</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="p-2 font-semibold pl-4">Conversion Rate (%)</td>
                  <td className="p-2 text-center">{data.coreMetrics.year3.conversionRate || 0}%</td>
                  <td className="p-2 text-center font-semibold text-brand-navy">{data.coreMetrics.year1.conversionRate || 0}%</td>
                  <td className="p-2 text-center font-semibold text-green-700">{data.coreMetrics.quarter.conversionRate || 0}%</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="p-2 font-semibold pl-4">Avg Transaction Value</td>
                  <td className="p-2 text-center">{formatCurrency(data.coreMetrics.year3.avgTransactionValue || 0)}</td>
                  <td className="p-2 text-center font-semibold text-brand-navy">{formatCurrency(data.coreMetrics.year1.avgTransactionValue || 0)}</td>
                  <td className="p-2 text-center font-semibold text-green-700">{formatCurrency(data.coreMetrics.quarter.avgTransactionValue || 0)}</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="p-2 font-semibold pl-4">Team Headcount (FTE)</td>
                  <td className="p-2 text-center">{data.coreMetrics.year3.teamHeadcount || 0}</td>
                  <td className="p-2 text-center font-semibold text-brand-navy">{data.coreMetrics.year1.teamHeadcount || 0}</td>
                  <td className="p-2 text-center font-semibold text-green-700">{data.coreMetrics.quarter.teamHeadcount || 0}</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="p-2 font-semibold pl-4">Owner Hours per Week</td>
                  <td className="p-2 text-center">{data.coreMetrics.year3.ownerHoursPerWeek || 0}</td>
                  <td className="p-2 text-center font-semibold text-brand-navy">{data.coreMetrics.year1.ownerHoursPerWeek || 0}</td>
                  <td className="p-2 text-center font-semibold text-green-700">{data.coreMetrics.quarter.ownerHoursPerWeek || 0}</td>
                </tr>

                {/* Top KPIs Section */}
                <tr className="bg-gray-100">
                  <td colSpan={4} className="p-2 font-bold text-gray-700 text-xs uppercase">Key Performance Indicators</td>
                </tr>
                {data.kpis.slice(0, 5).map((kpi, idx) => (
                  <tr key={idx} className="border-b border-gray-200">
                    <td className="p-2 font-semibold pl-4">{kpi.name}</td>
                    <td className="p-2 text-center">{kpi.year3Target}</td>
                    <td className="p-2 text-center font-semibold text-brand-navy">{kpi.year1Target}</td>
                    <td className="p-2 text-center font-semibold text-green-700">{kpi.quarterTarget}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Strategic Initiatives & Quarterly Rocks - Aligned with columns */}
          <div className="grid grid-cols-1 lg:grid-cols-[30%_20%_25%_25%] border-t border-gray-300">
            {/* Owner Personal Goals - Left columns (only show if data exists) */}
            {(data.ownerGoals.primaryGoal || data.ownerGoals.desiredHoursPerWeek || data.ownerGoals.timeHorizon || data.ownerGoals.exitStrategy) ? (
              <div className="lg:col-span-2 lg:border-r border-gray-300 border-b lg:border-b-0">
                <div className="bg-brand-orange-50 px-3 py-2 border-b border-gray-300">
                  <h3 className="text-xs sm:text-sm font-bold text-brand-navy uppercase print:text-xs">What I Want From This Business</h3>
                </div>
                <div className="p-3 sm:p-4 space-y-2">
                  {data.ownerGoals.primaryGoal && (
                    <div>
                      <p className="text-[10px] font-semibold text-gray-700 uppercase mb-0.5 print:text-[8px]">Primary Goal</p>
                      <p className="text-xs sm:text-sm font-bold text-gray-900 print:text-xs">{data.ownerGoals.primaryGoal}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {data.ownerGoals.timeHorizon && (
                      <div>
                        <p className="text-[10px] font-semibold text-gray-700 uppercase mb-0.5 print:text-[8px]">Time Horizon</p>
                        <p className="text-xs sm:text-sm text-gray-900 print:text-xs">{data.ownerGoals.timeHorizon}</p>
                      </div>
                    )}
                    {data.ownerGoals.exitStrategy && (
                      <div>
                        <p className="text-[10px] font-semibold text-gray-700 uppercase mb-0.5 print:text-[8px]">Exit Strategy</p>
                        <p className="text-xs sm:text-sm text-gray-900 print:text-xs">{data.ownerGoals.exitStrategy}</p>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {data.ownerGoals.currentHoursPerWeek && (
                      <div>
                        <p className="text-[10px] font-semibold text-gray-700 uppercase mb-0.5 print:text-[8px]">Current Hours/Week</p>
                        <p className="text-xs sm:text-sm font-bold text-gray-900 print:text-xs">{data.ownerGoals.currentHoursPerWeek} hrs</p>
                      </div>
                    )}
                    {data.ownerGoals.desiredHoursPerWeek && (
                      <div>
                        <p className="text-[10px] font-semibold text-gray-700 uppercase mb-0.5 print:text-[8px]">Desired Hours/Week</p>
                        <p className="text-xs sm:text-sm font-bold text-gray-900 print:text-xs">{data.ownerGoals.desiredHoursPerWeek} hrs</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              // Empty placeholder when no owner goals data
              <div className="lg:col-span-2 lg:border-r border-gray-300 bg-gray-50 hidden lg:block"></div>
            )}

            {/* Strategic Initiatives - Under 1-Year Goal */}
            <div className="lg:border-r border-gray-300 border-b lg:border-b-0">
              <div className="bg-brand-orange-50 px-3 py-2 border-b border-gray-300">
                <h3 className="text-xs sm:text-sm font-bold text-brand-navy uppercase print:text-xs">12-Month Initiatives</h3>
              </div>
              <div className="p-3 sm:p-4">
                <ol className="space-y-1">
                  {data.strategicInitiatives.slice(0, 12).map((initiative, idx) => (
                    <li key={idx} className="text-xs sm:text-sm print:text-xs">
                      <span className="font-medium text-gray-900">{idx + 1}. {initiative.title}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            {/* Current Quarter Rocks - Under Quarter Target */}
            <div>
              <div className="bg-brand-orange-50 px-3 py-2 border-b border-gray-300">
                <h3 className="text-xs sm:text-sm font-bold text-brand-navy uppercase print:text-xs">{data.currentQuarterLabel} Rocks</h3>
              </div>
              <div className="p-3 sm:p-4">
                <ol className="space-y-1">
                  {data.quarterlyRocks.slice(0, 5).map((rock, idx) => (
                    <li key={idx} className="text-xs sm:text-sm print:text-xs">
                      <div className="font-medium text-gray-900">{idx + 1}. {rock.action}</div>
                      {(rock.owner || rock.dueDate) && (
                        <div className="text-[10px] text-gray-600 mt-0.5 print:text-[8px]">
                          {rock.owner && <span>Owner: {rock.owner}</span>}
                          {rock.owner && rock.dueDate && <span> • </span>}
                          {rock.dueDate && <span>Due: {new Date(rock.dueDate).toLocaleDateString()}</span>}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-gray-300 p-4 bg-gray-50 text-center print:hidden">
            <p className="text-xs text-gray-600">
              Generated with Business Coaching Platform • {new Date().toLocaleDateString()} •
              <button onClick={() => router.push('/goals')} className="text-brand-orange hover:underline ml-1">
                Edit Strategic Plan →
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
