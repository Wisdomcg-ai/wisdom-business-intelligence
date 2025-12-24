'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Lightbulb,
  Plus,
  DollarSign,
  Calendar,
  MessageSquare,
  CheckCircle,
  Info,
  AlertTriangle,
  Trash2,
  RefreshCw,
  ExternalLink,
  Sparkles,
  X,
  Loader2,
  ThumbsUp
} from 'lucide-react'
import type { SetupWizardData, StrategicInvestment } from '../types'
import { createClient } from '@/lib/supabase/client'

interface AISuggestion {
  suggestion: string
  reasoning: string
  confidence: 'high' | 'medium' | 'low'
  source: 'coach_benchmark' | 'market_data' | 'ai_estimate'
  minValue?: number
  maxValue?: number
  typicalValue?: number
  caveats?: string[]
  interactionId?: string
}

interface Step5Props {
  data: SetupWizardData
  onUpdate: (updates: Partial<SetupWizardData>) => void
  fiscalYear: number
  businessId?: string
}

const INVESTMENT_CATEGORIES = [
  { value: 'marketing', label: 'Marketing & Sales' },
  { value: 'technology', label: 'Technology & Systems' },
  { value: 'training', label: 'Training & Development' },
  { value: 'equipment', label: 'Equipment & Tools' },
  { value: 'consulting', label: 'Professional Services' },
  { value: 'other', label: 'Other' }
]

const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4']

// Project cost examples for guidance
const PROJECT_COST_EXAMPLES = [
  { name: 'Website redesign', range: '$5,000 - $30,000', typical: 15000, category: 'technology' },
  { name: 'CRM implementation', range: '$10,000 - $50,000', typical: 25000, category: 'technology' },
  { name: 'Marketing campaign', range: '$5,000 - $25,000', typical: 12000, category: 'marketing' },
  { name: 'Brand refresh', range: '$8,000 - $40,000', typical: 20000, category: 'marketing' },
  { name: 'Staff training program', range: '$3,000 - $15,000', typical: 8000, category: 'training' },
  { name: 'Office fitout/upgrade', range: '$10,000 - $100,000', typical: 35000, category: 'equipment' },
  { name: 'Business coaching/consulting', range: '$10,000 - $30,000', typical: 18000, category: 'consulting' },
  { name: 'New equipment purchase', range: '$5,000 - $50,000', typical: 20000, category: 'equipment' },
]

export default function Step5StrategicInvestments({
  data,
  onUpdate,
  fiscalYear,
  businessId
}: Step5Props) {
  const [isLoading, setIsLoading] = useState(false)
  const [planInitiatives, setPlanInitiatives] = useState<Array<{ title: string; quarters: string[] }>>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [newInvestment, setNewInvestment] = useState<Partial<StrategicInvestment>>({
    category: 'other',
    costType: 'one-off',
    primaryQuarter: 'Q1'
  })

  // AI suggestion state
  const [aiSuggestion, setAiSuggestion] = useState<AISuggestion | null>(null)
  const [isLoadingAI, setIsLoadingAI] = useState(false)
  const [showAISuggestion, setShowAISuggestion] = useState(false)
  const [aiForInvestmentId, setAiForInvestmentId] = useState<string | null>(null)

  const supabase = createClient()

  // Fetch AI project cost suggestion
  const fetchAISuggestion = useCallback(async (projectName: string, category: string) => {
    if (!projectName.trim()) return

    setIsLoadingAI(true)
    setShowAISuggestion(true)
    setAiSuggestion(null)

    try {
      const response = await fetch('/api/ai/advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'project_cost',
          projectType: projectName,
          businessId,
          industry: data.industryId,
          scope: category,
          complexity: 'medium'
        }),
      })

      if (!response.ok) throw new Error('Failed to fetch suggestion')

      const suggestion = await response.json()
      setAiSuggestion(suggestion)
    } catch (error) {
      console.error('Error fetching AI suggestion:', error)
      setAiSuggestion(null)
    } finally {
      setIsLoadingAI(false)
    }
  }, [businessId, data.industryId])

  // Record AI feedback
  const recordAIFeedback = useCallback(async (
    interactionId: string,
    action: 'used' | 'adjusted' | 'ignored' | 'asked_coach',
    userValue?: number
  ) => {
    try {
      await fetch('/api/ai/advisor', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interactionId, action, userValue }),
      })
    } catch (error) {
      console.error('Error recording AI feedback:', error)
    }
  }, [])

  // Apply AI suggestion to new investment
  const handleUseAISuggestion = useCallback((value: number) => {
    if (aiForInvestmentId) {
      // Update existing investment
      handleUpdateInvestment(aiForInvestmentId, { cost: value })
    } else {
      // Update new investment form
      setNewInvestment(prev => ({ ...prev, cost: value }))
    }

    if (aiSuggestion?.interactionId) {
      recordAIFeedback(aiSuggestion.interactionId, 'used', value)
    }
    setShowAISuggestion(false)
    setAiForInvestmentId(null)
  }, [aiForInvestmentId, aiSuggestion, recordAIFeedback])

  // Get confidence styling
  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'high': return 'text-green-600 bg-green-50 border-green-200'
      case 'medium': return 'text-blue-600 bg-blue-50 border-blue-200'
      case 'low': return 'text-amber-600 bg-amber-50 border-amber-200'
      default: return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'coach_benchmark': return 'Your coach\'s benchmark'
      case 'market_data': return 'Australian market data'
      case 'ai_estimate': return 'AI estimate'
      default: return 'Estimate'
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  // Load initiatives from One Page Plan
  const loadInitiativesFromPlan = async () => {
    if (!businessId) return

    setIsLoading(true)
    try {
      // Load annual plan data which contains strategic initiatives
      const { data: goalData, error } = await supabase
        .from('goals')
        .select('annual_plan')
        .eq('business_id', businessId)
        .single()

      if (error || !goalData?.annual_plan) {
        console.log('No annual plan found')
        setIsLoading(false)
        return
      }

      const plan = goalData.annual_plan as any
      if (plan.strategicInitiatives && Array.isArray(plan.strategicInitiatives)) {
        setPlanInitiatives(plan.strategicInitiatives)

        // Auto-create investment entries for initiatives not yet added
        const existingTitles = data.strategicInvestments.map(i => i.title.toLowerCase())
        const newInvestments: StrategicInvestment[] = []

        plan.strategicInitiatives.forEach((initiative: { title: string; quarters: string[] }) => {
          if (!existingTitles.includes(initiative.title.toLowerCase())) {
            newInvestments.push({
              id: `inv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              title: initiative.title,
              quarters: initiative.quarters || ['Q1'],
              cost: 0,
              costType: 'one-off',
              category: 'other',
              primaryQuarter: initiative.quarters?.[0] || 'Q1',
              fromPlan: true
            })
          }
        })

        if (newInvestments.length > 0) {
          const allInvestments = [...data.strategicInvestments, ...newInvestments]
          onUpdate({
            strategicInvestments: allInvestments,
            totalInvestmentCost: allInvestments.reduce((sum, i) => sum + (i.cost || 0), 0)
          })
        }
      }
    } catch (err) {
      console.error('Error loading initiatives:', err)
    }
    setIsLoading(false)
  }

  // Load on mount
  useEffect(() => {
    if (businessId && data.strategicInvestments.length === 0) {
      loadInitiativesFromPlan()
    }
  }, [businessId])

  // Calculate totals
  const totals = useMemo(() => {
    const byQuarter: Record<string, number> = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 }
    let total = 0

    data.strategicInvestments.forEach(inv => {
      if (inv.cost > 0) {
        if (inv.costType === 'one-off') {
          byQuarter[inv.primaryQuarter] += inv.cost
        } else {
          // Spread ongoing costs across the year
          QUARTERS.forEach(q => {
            byQuarter[q] += inv.cost / 4
          })
        }
        total += inv.cost
      }
    })

    return { byQuarter, total }
  }, [data.strategicInvestments])

  // Update parent with totals
  useEffect(() => {
    onUpdate({ totalInvestmentCost: totals.total })
  }, [totals.total])

  // Budget calculations
  const availableOpExBudget = data.grossProfitGoal - data.netProfitGoal
  const remainingBudget = availableOpExBudget - data.totalWagesOpEx - data.totalOpExForecast - totals.total
  const investmentAsPercentOfGP = data.grossProfitGoal > 0
    ? (totals.total / data.grossProfitGoal) * 100
    : 0

  const handleUpdateInvestment = (id: string, updates: Partial<StrategicInvestment>) => {
    const updatedInvestments = data.strategicInvestments.map(inv =>
      inv.id === id ? { ...inv, ...updates } : inv
    )
    onUpdate({
      strategicInvestments: updatedInvestments,
      totalInvestmentCost: updatedInvestments.reduce((sum, i) => sum + (i.cost || 0), 0)
    })
  }

  const handleRemoveInvestment = (id: string) => {
    const updatedInvestments = data.strategicInvestments.filter(inv => inv.id !== id)
    onUpdate({
      strategicInvestments: updatedInvestments,
      totalInvestmentCost: updatedInvestments.reduce((sum, i) => sum + (i.cost || 0), 0)
    })
  }

  const handleAddInvestment = () => {
    if (!newInvestment.title || !newInvestment.cost) return

    const investment: StrategicInvestment = {
      id: `inv-${Date.now()}`,
      title: newInvestment.title,
      quarters: [newInvestment.primaryQuarter || 'Q1'],
      cost: newInvestment.cost,
      costType: newInvestment.costType || 'one-off',
      category: newInvestment.category || 'other',
      primaryQuarter: newInvestment.primaryQuarter || 'Q1',
      notes: newInvestment.notes,
      fromPlan: false
    }

    const updatedInvestments = [...data.strategicInvestments, investment]
    onUpdate({
      strategicInvestments: updatedInvestments,
      totalInvestmentCost: updatedInvestments.reduce((sum, i) => sum + (i.cost || 0), 0)
    })

    setNewInvestment({ category: 'other', costType: 'one-off', primaryQuarter: 'Q1' })
    setShowAddForm(false)
  }

  // CFO Insight
  const getCFOInsight = () => {
    if (data.strategicInvestments.length === 0) {
      return {
        type: 'info' as const,
        message: "I've pulled your projects from your One Page Plan. Add cost estimates so I can factor them into your forecast."
      }
    }

    const uncostedCount = data.strategicInvestments.filter(i => i.cost === 0).length
    if (uncostedCount > 0) {
      return {
        type: 'info' as const,
        message: `${uncostedCount} project${uncostedCount > 1 ? 's' : ''} ${uncostedCount > 1 ? 'have' : 'has'} no cost estimate. Add estimates to budget for them properly.`
      }
    }

    if (remainingBudget < 0) {
      return {
        type: 'warning' as const,
        message: `Your big projects put you ${formatCurrency(Math.abs(remainingBudget))} over budget. Consider spreading some projects across quarters or adjusting your targets.`
      }
    }

    // Check for quarter concentration
    const maxQuarterSpend = Math.max(...Object.values(totals.byQuarter))
    const heavyQuarter = Object.entries(totals.byQuarter).find(([_, v]) => v === maxQuarterSpend)?.[0]
    if (heavyQuarter && maxQuarterSpend > totals.total * 0.5) {
      return {
        type: 'info' as const,
        message: `${heavyQuarter} has ${formatCurrency(maxQuarterSpend)} in project spend (${((maxQuarterSpend / totals.total) * 100).toFixed(0)}% of total). Watch your cash that quarter.`
      }
    }

    return {
      type: 'success' as const,
      message: `You've budgeted ${formatCurrency(totals.total)} for big projects (${investmentAsPercentOfGP.toFixed(1)}% of what you make). This looks manageable across the year.`
    }
  }

  const cfoInsight = getCFOInsight()

  return (
    <div className="space-y-6">
      {/* CFO Header */}
      <div className="bg-gradient-to-r from-brand-navy to-brand-navy-800 rounded-xl p-6 text-white">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center flex-shrink-0">
            <MessageSquare className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-xl mb-2">Your Big Projects</h3>
            <p className="text-white/80">
              Your One Page Plan has key projects. Let's add cost estimates
              so they're properly budgeted in your forecast.
            </p>
          </div>
        </div>
      </div>

      {/* CFO Insight */}
      <div className={`rounded-xl p-5 flex items-start gap-4 ${
        cfoInsight.type === 'success' ? 'bg-green-50 border border-green-200' :
        cfoInsight.type === 'warning' ? 'bg-amber-50 border border-amber-200' :
        'bg-blue-50 border border-blue-200'
      }`}>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
          cfoInsight.type === 'success' ? 'bg-green-100' :
          cfoInsight.type === 'warning' ? 'bg-amber-100' :
          'bg-blue-100'
        }`}>
          {cfoInsight.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-green-600" />
          ) : cfoInsight.type === 'warning' ? (
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          ) : (
            <Info className="w-5 h-5 text-blue-600" />
          )}
        </div>
        <div>
          <h4 className={`font-semibold mb-1 ${
            cfoInsight.type === 'success' ? 'text-green-900' :
            cfoInsight.type === 'warning' ? 'text-amber-900' :
            'text-blue-900'
          }`}>
            CFO Insight
          </h4>
          <p className={`text-sm ${
            cfoInsight.type === 'success' ? 'text-green-800' :
            cfoInsight.type === 'warning' ? 'text-amber-800' :
            'text-blue-800'
          }`}>
            {cfoInsight.message}
          </p>
        </div>
      </div>

      {/* Quarterly Breakdown */}
      <div className="grid grid-cols-5 gap-3">
        {QUARTERS.map(quarter => (
          <div key={quarter} className="bg-white border border-gray-200 rounded-lg p-3 text-center">
            <div className="text-xs text-gray-500 uppercase mb-1">{quarter}</div>
            <div className="text-lg font-bold text-gray-900">
              {formatCurrency(totals.byQuarter[quarter])}
            </div>
          </div>
        ))}
        <div className={`rounded-lg p-3 text-center ${
          remainingBudget >= 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
        }`}>
          <div className="text-xs text-gray-500 uppercase mb-1">Total</div>
          <div className={`text-lg font-bold ${remainingBudget >= 0 ? 'text-green-700' : 'text-red-700'}`}>
            {formatCurrency(totals.total)}
          </div>
        </div>
      </div>

      {/* Initiatives List */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h4 className="font-semibold text-gray-900 flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-brand-orange" />
              Key Projects ({data.strategicInvestments.length})
            </h4>
            {businessId && (
              <button
                onClick={loadInitiativesFromPlan}
                disabled={isLoading}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-brand-orange transition-colors"
              >
                <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh from Plan
              </button>
            )}
          </div>
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-orange rounded-lg hover:bg-brand-orange-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Project
          </button>
        </div>

        {data.strategicInvestments.length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Lightbulb className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm text-gray-600 mb-2">
              No projects loaded yet
            </p>
            <p className="text-xs text-gray-500 mb-4">
              Add projects from your One Page Plan or create new ones
            </p>
            <a
              href="/one-page-plan"
              target="_blank"
              className="inline-flex items-center gap-1 text-sm text-brand-orange hover:underline"
            >
              <ExternalLink className="w-3 h-3" />
              View One Page Plan
            </a>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {data.strategicInvestments.map((inv) => (
              <div key={inv.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium text-gray-900">{inv.title}</span>
                      {inv.fromPlan && (
                        <span className="px-2 py-0.5 text-xs bg-brand-navy/10 text-brand-navy rounded">
                          From Plan
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Cost</label>
                        <div className="relative flex items-center gap-1">
                          <div className="relative flex-1">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                            <input
                              type="number"
                              value={inv.cost || ''}
                              onChange={(e) => handleUpdateInvestment(inv.id, { cost: Number(e.target.value) })}
                              className="w-full pl-6 pr-2 py-1.5 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-brand-orange focus:border-brand-orange"
                              placeholder="0"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setAiForInvestmentId(inv.id)
                              fetchAISuggestion(inv.title, inv.category)
                            }}
                            className="p-1.5 text-brand-orange hover:bg-brand-orange-50 rounded transition-colors"
                            title="Get AI cost estimate"
                          >
                            <Sparkles className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Type</label>
                        <select
                          value={inv.costType}
                          onChange={(e) => handleUpdateInvestment(inv.id, { costType: e.target.value as 'one-off' | 'ongoing' })}
                          className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-brand-orange"
                        >
                          <option value="one-off">One-off</option>
                          <option value="ongoing">Ongoing</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Quarter</label>
                        <select
                          value={inv.primaryQuarter}
                          onChange={(e) => handleUpdateInvestment(inv.id, { primaryQuarter: e.target.value })}
                          className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-brand-orange"
                          disabled={inv.costType === 'ongoing'}
                        >
                          {QUARTERS.map(q => (
                            <option key={q} value={q}>{q}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Category</label>
                        <select
                          value={inv.category}
                          onChange={(e) => handleUpdateInvestment(inv.id, { category: e.target.value as any })}
                          className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-brand-orange"
                        >
                          {INVESTMENT_CATEGORIES.map(cat => (
                            <option key={cat.value} value={cat.value}>{cat.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveInvestment(inv.id)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors mt-6"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Form Modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-lg text-gray-900 flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-brand-orange" />
                Add Project
              </h3>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Project Name *
                </label>
                <input
                  type="text"
                  value={newInvestment.title || ''}
                  onChange={(e) => setNewInvestment({ ...newInvestment, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                  placeholder="e.g., Website redesign"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Estimated Cost *
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="number"
                        value={newInvestment.cost || ''}
                        onChange={(e) => setNewInvestment({ ...newInvestment, cost: Number(e.target.value) })}
                        className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                        placeholder="15000"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (newInvestment.title) {
                          setAiForInvestmentId(null)
                          fetchAISuggestion(newInvestment.title, newInvestment.category || 'other')
                        }
                      }}
                      disabled={!newInvestment.title}
                      className="p-2 text-brand-orange hover:bg-brand-orange-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title={newInvestment.title ? "Get AI cost estimate" : "Enter project name first"}
                    >
                      <Sparkles className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cost Type
                  </label>
                  <select
                    value={newInvestment.costType || 'one-off'}
                    onChange={(e) => setNewInvestment({ ...newInvestment, costType: e.target.value as 'one-off' | 'ongoing' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                  >
                    <option value="one-off">One-off</option>
                    <option value="ongoing">Ongoing (annual)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Primary Quarter
                  </label>
                  <select
                    value={newInvestment.primaryQuarter || 'Q1'}
                    onChange={(e) => setNewInvestment({ ...newInvestment, primaryQuarter: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                  >
                    {QUARTERS.map(q => (
                      <option key={q} value={q}>{q}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category
                  </label>
                  <select
                    value={newInvestment.category || 'other'}
                    onChange={(e) => setNewInvestment({ ...newInvestment, category: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                  >
                    {INVESTMENT_CATEGORIES.map(cat => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Project Cost Guide */}
              <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                <div className="flex items-center gap-2 mb-2">
                  <Lightbulb className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-semibold text-blue-900">Typical project costs</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {PROJECT_COST_EXAMPLES.map((example) => (
                    <button
                      key={example.name}
                      type="button"
                      onClick={() => setNewInvestment({
                        ...newInvestment,
                        title: newInvestment.title || example.name,
                        cost: example.typical,
                        category: example.category as any
                      })}
                      className="text-left text-xs py-1 px-2 rounded hover:bg-blue-100 transition-colors"
                    >
                      <span className="text-gray-700">{example.name}:</span>
                      <span className="text-blue-700 ml-1">{example.range}</span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-blue-600 mt-2 italic">
                  Click to auto-fill project and cost
                </p>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setShowAddForm(false)
                  setNewInvestment({ category: 'other', costType: 'one-off', primaryQuarter: 'Q1' })
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddInvestment}
                disabled={!newInvestment.title || !newInvestment.cost}
                className="px-4 py-2 text-sm font-medium text-white bg-brand-orange rounded-lg hover:bg-brand-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Project
              </button>
            </div>
          </div>
        </div>
      )}

      {/* How This Flows */}
      <div className="bg-gray-50 rounded-xl p-5">
        <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-brand-orange" />
          How Project Costs Work
        </h4>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-start gap-2">
            <DollarSign className="w-4 h-4 text-brand-orange mt-0.5 flex-shrink-0" />
            <span className="text-gray-700">
              <strong>One-off costs</strong> hit the quarter you specify
            </span>
          </div>
          <div className="flex items-start gap-2">
            <Calendar className="w-4 h-4 text-brand-navy mt-0.5 flex-shrink-0" />
            <span className="text-gray-700">
              <strong>Ongoing costs</strong> spread evenly across quarters
            </span>
          </div>
        </div>
      </div>

      {/* AI Suggestion Modal */}
      {showAISuggestion && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full mx-4 overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 bg-gradient-to-r from-brand-orange to-brand-orange-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                <span className="font-medium text-sm">AI Cost Estimate</span>
              </div>
              <button
                onClick={() => {
                  if (aiSuggestion?.interactionId) {
                    recordAIFeedback(aiSuggestion.interactionId, 'ignored')
                  }
                  setShowAISuggestion(false)
                  setAiForInvestmentId(null)
                }}
                className="p-1 hover:bg-white/20 rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4">
              {isLoadingAI ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-brand-orange animate-spin" />
                  <span className="ml-2 text-sm text-gray-600">Estimating cost...</span>
                </div>
              ) : aiSuggestion ? (
                <div className="space-y-4">
                  {/* Main Suggestion */}
                  <div className="text-center py-3">
                    <div className="text-2xl font-bold text-gray-900 mb-2">
                      {aiSuggestion.suggestion}
                    </div>
                    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getConfidenceColor(aiSuggestion.confidence)}`}>
                      {aiSuggestion.confidence === 'high' ? (
                        <CheckCircle className="w-3 h-3" />
                      ) : aiSuggestion.confidence === 'medium' ? (
                        <Info className="w-3 h-3" />
                      ) : (
                        <AlertTriangle className="w-3 h-3" />
                      )}
                      {aiSuggestion.confidence === 'high' ? 'High confidence' :
                       aiSuggestion.confidence === 'medium' ? 'Moderate confidence' :
                       'Low confidence'}
                    </div>
                  </div>

                  {/* Source */}
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Lightbulb className="w-3 h-3" />
                    {getSourceLabel(aiSuggestion.source)}
                  </div>

                  {/* Reasoning */}
                  <p className="text-sm text-gray-600">
                    {aiSuggestion.reasoning}
                  </p>

                  {/* Caveats */}
                  {aiSuggestion.caveats && aiSuggestion.caveats.length > 0 && (
                    <div className="text-xs text-gray-500 space-y-1">
                      {aiSuggestion.caveats.map((caveat, i) => (
                        <div key={i} className="flex items-start gap-1">
                          <span className="text-gray-400">•</span>
                          <span>{caveat}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="space-y-2 pt-2">
                    {aiSuggestion.typicalValue && (
                      <button
                        onClick={() => handleUseAISuggestion(aiSuggestion.typicalValue!)}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-brand-orange text-white text-sm font-medium rounded-lg hover:bg-brand-orange-600 transition-colors"
                      >
                        <ThumbsUp className="w-4 h-4" />
                        Use ${aiSuggestion.typicalValue.toLocaleString()}
                      </button>
                    )}

                    {/* Min/Max quick picks */}
                    {aiSuggestion.minValue && aiSuggestion.maxValue && (
                      <div className="flex items-center justify-center gap-3 text-xs">
                        <span className="text-gray-400">Or use:</span>
                        <button
                          onClick={() => handleUseAISuggestion(aiSuggestion.minValue!)}
                          className="text-brand-orange hover:underline font-medium"
                        >
                          ${aiSuggestion.minValue.toLocaleString()} (low)
                        </button>
                        <span className="text-gray-300">|</span>
                        <button
                          onClick={() => handleUseAISuggestion(aiSuggestion.maxValue!)}
                          className="text-brand-orange hover:underline font-medium"
                        >
                          ${aiSuggestion.maxValue.toLocaleString()} (high)
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 text-gray-500">
                  <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm">Couldn't get a cost estimate</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Try entering a more specific project name
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
              <p className="text-xs text-gray-400 text-center">
                AI estimates are guides only. Confirm with your coach.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
