'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { SnapshotService } from '@/app/goals/services/snapshot-service'
import { useBusinessContext } from '@/hooks/useBusinessContext'
import { StrategicInitiative, KPIData, QuarterType, InitiativeStatus } from '@/app/goals/types'
import {
  CheckCircle,
  Circle,
  Calendar,
  Target,
  TrendingUp,
  Award,
  AlertTriangle,
  Lightbulb,
  ArrowRight,
  Save,
  Loader2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck
} from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'

export default function QuarterlyReviewPage() {
  const router = useRouter()
  const supabase = createClient()
  const { activeBusiness, isLoading: contextLoading } = useBusinessContext()

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  // Current quarter info
  const [currentQuarter, setCurrentQuarter] = useState<{ year: number; quarter: QuarterType } | null>(null)

  // Initiatives
  const [initiatives, setInitiatives] = useState<StrategicInitiative[]>([])
  const [expandedInitiatives, setExpandedInitiatives] = useState<Set<string>>(new Set())

  // KPIs
  const [kpis, setKpis] = useState<KPIData[]>([])
  const [kpiActuals, setKpiActuals] = useState<Record<string, number>>({})

  // Reflections
  const [wins, setWins] = useState('')
  const [challenges, setChallenges] = useState('')
  const [learnings, setLearnings] = useState('')
  const [adjustments, setAdjustments] = useState('')
  const [overallReflection, setOverallReflection] = useState('')

  // UI state
  const [activeSection, setActiveSection] = useState<'initiatives' | 'kpis' | 'reflections'>('initiatives')

  useEffect(() => {
    if (!contextLoading) {
      loadData()
    }
  }, [contextLoading, activeBusiness?.id])

  const loadData = async () => {
    try {
      // Get user and business
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }

      // Use activeBusiness ownerId if viewing as coach, otherwise current user
      const targetUserId = activeBusiness?.ownerId || user.id
      setUserId(targetUserId)

      // Determine the correct business_profiles.id for data queries
      // Strategic initiatives and KPIs use business_profiles.id
      let bizId: string | null = null
      if (activeBusiness?.id) {
        // Coach view: activeBusiness.id is businesses.id
        // Need to look up the corresponding business_profiles.id
        const { data: profile } = await supabase
          .from('business_profiles')
          .select('id')
          .eq('business_id', activeBusiness.id)
          .single()

        if (profile?.id) {
          bizId = profile.id
        } else {
          console.warn('[Quarterly Review] No business_profiles found for businesses.id:', activeBusiness.id)
          bizId = activeBusiness.id // Fallback
        }
      } else {
        // Get user's own business profile
        const { data: profile } = await supabase
          .from('business_profiles')
          .select('id')
          .eq('user_id', targetUserId)
          .single()

        if (!profile?.id) {
          setIsLoading(false)
          return
        }
        bizId = profile.id
      }

      setBusinessId(bizId)

      // Get current quarter
      const quarter = SnapshotService.getCurrentQuarter()
      setCurrentQuarter(quarter)

      // Load initiatives for current quarter
      const { data: initiativesData } = await supabase
        .from('strategic_initiatives')
        .select('*')
        .eq('business_id', bizId!)
        .eq('year_assigned', quarter.year)
        .eq('quarter_assigned', quarter.quarter)

      if (initiativesData) {
        const mappedInitiatives = initiativesData.map((init: any) => ({
          id: init.id,
          title: init.title,
          description: init.description,
          category: init.category,
          priority: init.priority,
          assignedTo: init.assigned_to,
          status: init.status || 'not_started',
          progressPercentage: init.progress_percentage || 0,
          actualStartDate: init.actual_start_date,
          actualCompletionDate: init.actual_completion_date,
          reflectionNotes: init.reflection_notes,
          source: init.source || 'strategic_ideas'
        }))
        setInitiatives(mappedInitiatives)
      }

      // Load KPIs
      const { data: kpisData } = await supabase
        .from('business_kpis')
        .select('*')
        .eq('business_id', bizId)
        .eq('is_active', true)

      if (kpisData) {
        const mappedKpis = kpisData.map((kpi: any) => ({
          id: kpi.kpi_id,
          name: kpi.name,
          friendlyName: kpi.friendly_name,
          category: kpi.category,
          frequency: kpi.frequency,
          unit: kpi.unit,
          currentValue: kpi.current_value || 0,
          year1Target: kpi.year1_target || 0,
          year2Target: kpi.year2_target || 0,
          year3Target: kpi.year3_target || 0
        }))
        setKpis(mappedKpis)

        // Load existing actuals for this quarter
        const actuals = await SnapshotService.getKPIActuals(bizId!, {
          year: quarter.year,
          quarter: quarter.quarter
        })

        const actualsMap: Record<string, number> = {}
        actuals.forEach(actual => {
          actualsMap[actual.kpiId] = actual.actualValue
        })
        setKpiActuals(actualsMap)
      }

    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const updateInitiativeStatus = async (initiativeId: string, status: InitiativeStatus) => {
    if (!businessId) return

    try {
      const { error } = await supabase
        .from('strategic_initiatives')
        .update({ status })
        .eq('id', initiativeId)
        .eq('business_id', businessId)

      if (error) throw error

      setInitiatives(prev =>
        prev.map(init =>
          init.id === initiativeId ? { ...init, status } : init
        )
      )
    } catch (error) {
      console.error('Error updating initiative status:', error)
    }
  }

  const updateInitiativeProgress = async (initiativeId: string, progress: number) => {
    if (!businessId) return

    try {
      const { error } = await supabase
        .from('strategic_initiatives')
        .update({ progress_percentage: progress })
        .eq('id', initiativeId)
        .eq('business_id', businessId)

      if (error) throw error

      setInitiatives(prev =>
        prev.map(init =>
          init.id === initiativeId ? { ...init, progressPercentage: progress } : init
        )
      )
    } catch (error) {
      console.error('Error updating initiative progress:', error)
    }
  }

  const updateKPIActual = async (kpiId: string, value: number) => {
    if (!businessId || !userId || !currentQuarter) return

    setKpiActuals(prev => ({ ...prev, [kpiId]: value }))

    try {
      const kpi = kpis.find(k => k.id === kpiId)
      await SnapshotService.saveKPIActual(businessId, userId, kpiId, {
        year: currentQuarter.year,
        quarter: currentQuarter.quarter,
        type: 'quarterly',
        actualValue: value,
        targetValue: kpi?.year1Target
      })
    } catch (error) {
      console.error('Error saving KPI actual:', error)
    }
  }

  const handleCompleteQuarter = async () => {
    if (!businessId || !userId || !currentQuarter) return

    setIsSaving(true)

    try {
      const result = await SnapshotService.createQuarterlySnapshot(
        businessId,
        userId,
        currentQuarter.year,
        currentQuarter.quarter,
        {
          initiatives,
          kpis: kpis.map(kpi => ({
            ...kpi,
            actual: kpiActuals[kpi.id] || 0
          })),
          financials: {}, // Could load from financials table
          reflections: {
            wins,
            challenges,
            learnings,
            adjustments,
            overallReflection
          }
        }
      )

      if (result.success) {
        alert('Quarter completed successfully! Snapshot saved.')
        // Optionally redirect to next quarter planning
        router.push('/goals?step=5')
      } else {
        alert(`Error: ${result.error}`)
      }
    } catch (error) {
      console.error('Error completing quarter:', error)
      alert('Failed to complete quarter. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const toggleInitiative = (id: string) => {
    const newExpanded = new Set(expandedInitiatives)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedInitiatives(newExpanded)
  }

  const completedCount = initiatives.filter(i => i.status === 'completed').length
  const completionRate = initiatives.length > 0 ? (completedCount / initiatives.length) * 100 : 0

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-brand-orange mx-auto mb-4" />
          <p className="text-gray-600">Loading quarterly review...</p>
        </div>
      </div>
    )
  }

  if (!currentQuarter) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Unable to determine current quarter</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader
        variant="banner"
        title="Quarterly Review"
        subtitle={`${currentQuarter.quarter} ${currentQuarter.year} • Review progress and plan ahead`}
        icon={ClipboardCheck}
        actions={
          <button
            onClick={handleCompleteQuarter}
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-3 bg-white/10 border border-white/30 text-white rounded-lg hover:bg-white/20 font-medium disabled:opacity-50 transition-colors"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Complete Quarter
              </>
            )}
          </button>
        }
      />

      {/* Progress Summary */}
      <div className="bg-white border-b">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-brand-orange-50 border border-brand-orange-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <Target className="w-8 h-8 text-brand-orange" />
                <div>
                  <p className="text-sm text-brand-orange-700 font-medium">Total Initiatives</p>
                  <p className="text-2xl font-bold text-brand-navy">{initiatives.length}</p>
                </div>
              </div>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-8 h-8 text-green-600" />
                <div>
                  <p className="text-sm text-green-700 font-medium">Completed</p>
                  <p className="text-2xl font-bold text-green-900">{completedCount}</p>
                </div>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-8 h-8 text-amber-600" />
                <div>
                  <p className="text-sm text-amber-700 font-medium">Completion Rate</p>
                  <p className="text-2xl font-bold text-amber-900">{Math.round(completionRate)}%</p>
                </div>
              </div>
            </div>

            <div className="bg-brand-navy-50 border border-brand-navy-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <Award className="w-8 h-8 text-brand-navy" />
                <div>
                  <p className="text-sm text-brand-navy-700 font-medium">KPIs Tracked</p>
                  <p className="text-2xl font-bold text-brand-navy">{kpis.length}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section Navigation */}
      <div className="bg-white border-b">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4 overflow-x-auto py-3">
            {[
              { id: 'initiatives' as const, label: 'Initiatives Progress', icon: Target },
              { id: 'kpis' as const, label: 'KPI Actuals', icon: TrendingUp },
              { id: 'reflections' as const, label: 'Reflections', icon: Lightbulb }
            ].map((section) => {
              const Icon = section.icon
              const isActive = activeSection === section.id

              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-brand-orange-100 text-brand-orange-800 font-medium'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-sm">{section.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeSection === 'initiatives' && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <h2 className="text-xl font-semibold text-brand-navy mb-4">Initiative Progress</h2>
              <p className="text-sm text-gray-600 mb-6">
                Update the status and progress of each initiative for this quarter
              </p>

              {initiatives.length === 0 ? (
                <div className="text-center py-12">
                  <Target className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-gray-600">No initiatives assigned to this quarter</p>
                  <button
                    onClick={() => router.push('/goals?step=5')}
                    className="mt-4 text-brand-orange hover:text-brand-orange-700 font-medium"
                  >
                    Assign initiatives →
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {initiatives.map((initiative) => {
                    const isExpanded = expandedInitiatives.has(initiative.id)
                    const statusColors = {
                      not_started: 'bg-slate-100 text-gray-700 border-slate-300',
                      in_progress: 'bg-brand-orange-100 text-brand-orange-700 border-brand-orange-300',
                      completed: 'bg-green-100 text-green-700 border-green-300',
                      cancelled: 'bg-red-100 text-red-700 border-red-300',
                      on_hold: 'bg-amber-100 text-amber-700 border-amber-300'
                    }

                    return (
                      <div
                        key={initiative.id}
                        className="border border-slate-200 rounded-lg overflow-hidden"
                      >
                        <div
                          className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                          onClick={() => toggleInitiative(initiative.id)}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <h3 className="font-medium text-brand-navy mb-2">{initiative.title}</h3>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`inline-block px-2 py-1 text-xs rounded border font-medium ${statusColors[initiative.status || 'not_started']}`}>
                                  {(initiative.status || 'not_started').replace('_', ' ').toUpperCase()}
                                </span>
                                {initiative.priority && (
                                  <span className={`inline-block px-2 py-1 text-xs rounded ${
                                    initiative.priority === 'high'
                                      ? 'bg-brand-orange-100 text-brand-orange-700'
                                      : initiative.priority === 'medium'
                                      ? 'bg-brand-orange-100 text-brand-orange-700'
                                      : 'bg-slate-100 text-gray-600'
                                  }`}>
                                    {initiative.priority.toUpperCase()} PRIORITY
                                  </span>
                                )}
                              </div>
                            </div>
                            <button className="text-slate-400 hover:text-gray-600">
                              {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                            </button>
                          </div>

                          {/* Progress Bar */}
                          <div className="mt-3">
                            <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                              <span>Progress</span>
                              <span>{initiative.progressPercentage || 0}%</span>
                            </div>
                            <div className="w-full bg-slate-200 rounded-full h-2">
                              <div
                                className="bg-brand-orange h-2 rounded-full transition-all"
                                style={{ width: `${initiative.progressPercentage || 0}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="p-4 border-t border-slate-200 bg-gray-50 space-y-4">
                            {initiative.description && (
                              <div>
                                <p className="text-sm text-gray-700">{initiative.description}</p>
                              </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                  Status
                                </label>
                                <select
                                  value={initiative.status || 'not_started'}
                                  onChange={(e) => updateInitiativeStatus(initiative.id, e.target.value as InitiativeStatus)}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange"
                                >
                                  <option value="not_started">Not Started</option>
                                  <option value="in_progress">In Progress</option>
                                  <option value="completed">Completed</option>
                                  <option value="on_hold">On Hold</option>
                                  <option value="cancelled">Cancelled</option>
                                </select>
                              </div>

                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                  Progress (%)
                                </label>
                                <input
                                  type="range"
                                  min="0"
                                  max="100"
                                  value={initiative.progressPercentage || 0}
                                  onChange={(e) => updateInitiativeProgress(initiative.id, parseInt(e.target.value))}
                                  className="w-full"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {activeSection === 'kpis' && (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <h2 className="text-xl font-semibold text-brand-navy mb-4">KPI Actuals</h2>
            <p className="text-sm text-gray-600 mb-6">
              Enter the actual values achieved for each KPI this quarter
            </p>

            {kpis.length === 0 ? (
              <div className="text-center py-12">
                <TrendingUp className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-gray-600">No KPIs configured</p>
                <button
                  onClick={() => router.push('/goals?step=1')}
                  className="mt-4 text-brand-orange hover:text-brand-orange-700 font-medium"
                >
                  Add KPIs →
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {kpis.map((kpi) => (
                  <div key={kpi.id} className="border border-slate-200 rounded-lg p-4">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="flex-1">
                        <h3 className="font-medium text-brand-navy">{kpi.friendlyName || kpi.name}</h3>
                        <p className="text-sm text-gray-600 mt-1">Target: {kpi.year1Target} {kpi.unit}</p>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Actual Value Achieved
                      </label>
                      <input
                        type="number"
                        value={kpiActuals[kpi.id] || ''}
                        onChange={(e) => updateKPIActual(kpi.id, parseFloat(e.target.value) || 0)}
                        placeholder={`Enter actual ${kpi.unit}`}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeSection === 'reflections' && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <h2 className="text-xl font-semibold text-brand-navy mb-4">Quarterly Reflections</h2>
              <p className="text-sm text-gray-600 mb-6">
                Capture key learnings, wins, and adjustments for the quarter
              </p>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-brand-navy mb-2">
                    🎉 Wins - What went well?
                  </label>
                  <textarea
                    value={wins}
                    onChange={(e) => setWins(e.target.value)}
                    rows={4}
                    placeholder="What are you proud of this quarter? What successes did you achieve?"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-brand-navy mb-2">
                    🚧 Challenges - What didn't go well?
                  </label>
                  <textarea
                    value={challenges}
                    onChange={(e) => setChallenges(e.target.value)}
                    rows={4}
                    placeholder="What obstacles did you face? What slowed you down?"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-brand-navy mb-2">
                    💡 Learnings - What did you learn?
                  </label>
                  <textarea
                    value={learnings}
                    onChange={(e) => setLearnings(e.target.value)}
                    rows={4}
                    placeholder="What insights did you gain? What would you do differently?"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-brand-navy mb-2">
                    🔧 Adjustments - What will you change?
                  </label>
                  <textarea
                    value={adjustments}
                    onChange={(e) => setAdjustments(e.target.value)}
                    rows={4}
                    placeholder="Based on this quarter, what adjustments will you make going forward?"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-brand-navy mb-2">
                    📝 Overall Reflection
                  </label>
                  <textarea
                    value={overallReflection}
                    onChange={(e) => setOverallReflection(e.target.value)}
                    rows={4}
                    placeholder="Any other thoughts, observations, or notes about this quarter?"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Next Steps */}
        <div className="mt-8 bg-brand-orange-50 border border-brand-orange-200 rounded-lg p-6">
          <div className="flex items-start gap-4">
            <ArrowRight className="w-6 h-6 text-brand-orange flex-shrink-0 mt-1" />
            <div>
              <h3 className="font-semibold text-brand-navy mb-2">Next Steps</h3>
              <p className="text-sm text-brand-orange-800 mb-4">
                After completing this review, you'll create a snapshot and can plan the next quarter.
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleCompleteQuarter}
                  disabled={isSaving}
                  className="px-4 py-2 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 font-medium disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Complete Quarter & Save Snapshot'}
                </button>
                <button
                  onClick={() => router.push('/goals?step=5')}
                  className="px-4 py-2 bg-white text-brand-orange border border-brand-orange-300 rounded-lg hover:bg-brand-orange-50 font-medium"
                >
                  Plan Next Quarter
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
