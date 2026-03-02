'use client'

import React, { useState, useMemo, useCallback } from 'react'
import {
  Users,
  Plus,
  Trash2,
  DollarSign,
  Calendar,
  ArrowRight,
  AlertTriangle,
  UserPlus,
  Briefcase,
  HardHat,
  MessageSquare,
  CheckCircle,
  Info,
  TrendingUp,
  ThumbsUp,
  Lightbulb,
  Sparkles,
  Loader2,
  Pencil,
  X
} from 'lucide-react'
import type { SetupWizardData, TeamMemberPlan } from '../types'

// Salary guide data for Australian market
const SALARY_EXAMPLES = [
  { role: 'Admin/Receptionist', range: '$50,000 - $65,000', typical: 55000 },
  { role: 'Office Manager', range: '$65,000 - $85,000', typical: 75000 },
  { role: 'Sales Rep', range: '$60,000 - $90,000', typical: 75000 },
  { role: 'Project Manager', range: '$80,000 - $120,000', typical: 95000 },
  { role: 'Senior Manager', range: '$100,000 - $150,000', typical: 120000 },
  { role: 'Tradesperson', range: '$65,000 - $95,000', typical: 80000 },
  { role: 'Consultant/Specialist', range: '$90,000 - $140,000', typical: 110000 },
]

// Generate rolling 12 months from today
const getNext12Months = () => {
  const months = []
  const today = new Date()

  for (let i = 0; i < 12; i++) {
    const date = new Date(today.getFullYear(), today.getMonth() + i, 1)
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const label = date.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
    months.push({ value, label })
  }

  return months
}

// AI Suggestion type
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

interface Step3Props {
  data: SetupWizardData
  onUpdate: (updates: Partial<SetupWizardData>) => void
  fiscalYear: number
  businessId?: string
}

export default function Step3TeamPlanning({
  data,
  onUpdate,
  fiscalYear,
  businessId
}: Step3Props) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null)
  const [newMember, setNewMember] = useState<Partial<TeamMemberPlan>>({
    classification: 'opex',
    isNew: false
  })

  // Get rolling 12 months
  const next12Months = useMemo(() => getNext12Months(), [])

  // AI suggestion state
  const [aiSuggestion, setAiSuggestion] = useState<AISuggestion | null>(null)
  const [isLoadingAI, setIsLoadingAI] = useState(false)
  const [lastAIPosition, setLastAIPosition] = useState<string>('')

  // Fetch AI salary suggestion
  const fetchAISuggestion = useCallback(async () => {
    if (!newMember.position) return

    setIsLoadingAI(true)
    setLastAIPosition(newMember.position)
    setAiSuggestion(null)

    try {
      const response = await fetch('/api/ai/advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'salary_estimate',
          position: newMember.position,
          businessId,
          industry: data.industryId,
        }),
      })

      if (response.ok) {
        const suggestion = await response.json()
        setAiSuggestion(suggestion)
      }
    } catch (error) {
      console.error('Failed to fetch AI suggestion:', error)
    } finally {
      setIsLoadingAI(false)
    }
  }, [newMember.position, businessId, data.industryId])

  // Check if position has changed since last AI request
  const positionChanged = newMember.position !== lastAIPosition

  // Record AI action
  const recordAIAction = useCallback(async (
    interactionId: string,
    action: 'used' | 'adjusted' | 'ignored',
    value?: number
  ) => {
    try {
      await fetch('/api/ai/advisor', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interactionId, action, userValue: value }),
      })
    } catch (error) {
      console.error('Failed to record AI action:', error)
    }
  }, [])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  // Calculate totals with cashflow timing
  const totals = useMemo(() => {
    const superRate = 0.12 // 12% super (2025-2026 rate)
    const fyStartMonth = `${fiscalYear - 1}-07` // July of previous year

    let opexWages = 0
    let cogsWages = 0
    let opexWagesProRated = 0
    let cogsWagesProRated = 0

    data.teamMembers.forEach(member => {
      const annualCost = member.annualSalary * (1 + superRate)

      // Calculate months active in the fiscal year
      let monthsActive = 12
      if (member.startMonth && member.startMonth > fyStartMonth) {
        const startDate = new Date(member.startMonth + '-01')
        const fyEnd = new Date(`${fiscalYear}-06-30`)
        const fyStart = new Date(`${fiscalYear - 1}-07-01`)

        if (startDate > fyStart) {
          const monthsDiff = (fyEnd.getFullYear() - startDate.getFullYear()) * 12 +
            (fyEnd.getMonth() - startDate.getMonth()) + 1
          monthsActive = Math.max(0, Math.min(12, monthsDiff))
        }
      }

      const proRatedCost = (annualCost / 12) * monthsActive

      if (member.classification === 'opex') {
        opexWages += member.annualSalary
        opexWagesProRated += proRatedCost
      } else {
        cogsWages += member.annualSalary
        cogsWagesProRated += proRatedCost
      }
    })

    const opexWithSuper = opexWages * (1 + superRate)
    const cogsWithSuper = cogsWages * (1 + superRate)

    return {
      opexWages,
      cogsWages,
      opexWithSuper,
      cogsWithSuper,
      opexWagesProRated,
      cogsWagesProRated,
      totalWages: opexWages + cogsWages,
      totalWithSuper: opexWithSuper + cogsWithSuper,
      totalProRated: opexWagesProRated + cogsWagesProRated
    }
  }, [data.teamMembers, fiscalYear])

  // Update parent when totals change
  React.useEffect(() => {
    onUpdate({
      totalWagesCOGS: totals.cogsWagesProRated,
      totalWagesOpEx: totals.opexWagesProRated
    })
  }, [totals.cogsWagesProRated, totals.opexWagesProRated, onUpdate])

  const handleAddMember = () => {
    if (!newMember.position || !newMember.annualSalary) return

    // Use name if provided, otherwise use position as the display name
    const displayName = newMember.name?.trim() || `New ${newMember.position}`

    if (editingMemberId) {
      // Update existing member
      onUpdate({
        teamMembers: data.teamMembers.map(m =>
          m.id === editingMemberId
            ? {
                ...m,
                name: displayName,
                position: newMember.position!,
                classification: newMember.classification || 'opex',
                annualSalary: newMember.annualSalary!,
                startMonth: newMember.startMonth,
                isNew: newMember.isNew || false,
                notes: newMember.notes
              }
            : m
        )
      })
      setEditingMemberId(null)
    } else {
      // Add new member
      const member: TeamMemberPlan = {
        id: `team-${Date.now()}`,
        name: displayName,
        position: newMember.position,
        classification: newMember.classification || 'opex',
        annualSalary: newMember.annualSalary,
        startMonth: newMember.startMonth,
        isNew: newMember.isNew || false,
        notes: newMember.notes
      }

      onUpdate({
        teamMembers: [...data.teamMembers, member]
      })
    }

    setNewMember({ classification: 'opex', isNew: false })
    setShowAddForm(false)
    setAiSuggestion(null)
    setLastAIPosition('')
  }

  const handleRemoveMember = (id: string) => {
    onUpdate({
      teamMembers: data.teamMembers.filter(m => m.id !== id)
    })
  }

  const handleEditMember = (member: TeamMemberPlan) => {
    setNewMember({
      name: member.name,
      position: member.position,
      classification: member.classification,
      annualSalary: member.annualSalary,
      startMonth: member.startMonth,
      isNew: member.isNew,
      notes: member.notes
    })
    setEditingMemberId(member.id)
    setShowAddForm(true)
  }

  // Available budget from goals
  const availableOpExBudget = data.grossProfitGoal - data.netProfitGoal
  const wagesAsPercentOfOpEx = availableOpExBudget > 0
    ? (totals.opexWagesProRated / availableOpExBudget) * 100
    : 0

  // Team cost health indicator
  const teamCostHealth = useMemo(() => {
    const wagesAsPercentOfRevenue = data.revenueGoal > 0
      ? ((totals.totalProRated) / data.revenueGoal) * 100
      : 0

    if (data.teamMembers.length === 0) {
      return { status: 'neutral' as const, label: 'Add your team', color: 'gray' }
    }
    if (wagesAsPercentOfRevenue <= 30) {
      return { status: 'good' as const, label: 'Healthy', color: 'green' }
    }
    if (wagesAsPercentOfRevenue <= 45) {
      return { status: 'ok' as const, label: 'Moderate', color: 'amber' }
    }
    return { status: 'high' as const, label: 'High', color: 'red' }
  }, [data.teamMembers.length, data.revenueGoal, totals.totalProRated])

  // Monthly wage bill before and after new hires
  const currentMonthlyWages = totals.totalWithSuper / 12
  const newHires = data.teamMembers.filter(m => m.isNew)
  const newHiresAnnualCost = newHires.reduce((sum, m) => sum + m.annualSalary * 1.115, 0)

  // CFO Insight
  const getCFOInsight = () => {
    if (data.teamMembers.length === 0) {
      return {
        type: 'info' as const,
        message: "Add your team members so I can factor their costs into your forecast. Include anyone on payroll - even yourself if you draw a salary."
      }
    }

    if (wagesAsPercentOfOpEx > 80) {
      return {
        type: 'warning' as const,
        message: `Team wages are ${wagesAsPercentOfOpEx.toFixed(0)}% of your operating budget. This leaves only ${formatCurrency(availableOpExBudget - totals.opexWagesProRated)} for rent, marketing, and other costs. Consider reviewing headcount or increasing revenue.`
      }
    }

    if (newHires.length > 0) {
      const firstHireMonth = newHires.reduce((earliest, m) =>
        !earliest || (m.startMonth && m.startMonth < earliest) ? m.startMonth : earliest
        , newHires[0].startMonth)

      const monthName = firstHireMonth
        ? new Date(firstHireMonth + '-01').toLocaleString('en-AU', { month: 'long' })
        : 'this year'

      return {
        type: 'info' as const,
        message: `With ${newHires.length} new hire${newHires.length > 1 ? 's' : ''} starting ${monthName}, your monthly wage bill increases from ${formatCurrency(currentMonthlyWages - newHiresAnnualCost / 12)} to ${formatCurrency(currentMonthlyWages)}. I'll factor the timing into your cashflow.`
      }
    }

    return {
      type: 'success' as const,
      message: `Your team costs ${formatCurrency(totals.totalProRated)} for FY${fiscalYear} (${wagesAsPercentOfOpEx.toFixed(0)}% of your operating budget). This is healthy for delivering on your revenue targets.`
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
            <h3 className="font-bold text-xl mb-2">Your Team Investment</h3>
            <p className="text-white/80">
              Your team is typically your biggest expense. Let's map out who you have
              and any planned hires, so I can factor the costs - and timing - into your forecast.
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

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Briefcase className="w-4 h-4 text-brand-navy" />
            <span className="text-xs font-medium text-gray-500 uppercase">Back Office Team</span>
          </div>
          <div className="text-xl font-bold text-gray-900">
            {formatCurrency(totals.opexWagesProRated)}
          </div>
          <div className="text-xs text-gray-500">
            Admin, sales, management
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <HardHat className="w-4 h-4 text-brand-orange" />
            <span className="text-xs font-medium text-gray-500 uppercase">Delivery Team</span>
          </div>
          <div className="text-xl font-bold text-gray-900">
            {formatCurrency(totals.cogsWagesProRated)}
          </div>
          <div className="text-xs text-gray-500">
            Staff who do the client work
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-4 h-4 text-gray-500" />
            <span className="text-xs font-medium text-gray-500 uppercase">Monthly Bill</span>
          </div>
          <div className="text-xl font-bold text-gray-900">
            {formatCurrency(currentMonthlyWages)}
          </div>
          <div className="text-xs text-gray-500">
            Inc. 12% super
          </div>
        </div>

        {/* Health Status Badge */}
        <div className={`rounded-xl p-4 ${
          teamCostHealth.color === 'green' ? 'bg-green-50 border border-green-200' :
          teamCostHealth.color === 'amber' ? 'bg-amber-50 border border-amber-200' :
          teamCostHealth.color === 'red' ? 'bg-red-50 border border-red-200' :
          'bg-gray-50 border border-gray-200'
        }`}>
          <div className="flex items-center gap-2 mb-2">
            {teamCostHealth.status === 'good' ? (
              <ThumbsUp className="w-4 h-4 text-green-600" />
            ) : teamCostHealth.status === 'high' ? (
              <AlertTriangle className="w-4 h-4 text-red-600" />
            ) : (
              <TrendingUp className="w-4 h-4 text-gray-500" />
            )}
            <span className="text-xs font-medium text-gray-500 uppercase">Status</span>
          </div>
          <div className={`text-xl font-bold ${
            teamCostHealth.color === 'green' ? 'text-green-700' :
            teamCostHealth.color === 'amber' ? 'text-amber-700' :
            teamCostHealth.color === 'red' ? 'text-red-700' :
            'text-gray-700'
          }`}>
            {teamCostHealth.label}
          </div>
          <div className="text-xs text-gray-500">
            {data.revenueGoal > 0 && data.teamMembers.length > 0
              ? `${((totals.totalProRated / data.revenueGoal) * 100).toFixed(0)}% of revenue`
              : 'Team cost ratio'
            }
          </div>
        </div>
      </div>

      {/* Team List */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h4 className="font-semibold text-gray-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-gray-500" />
            Team Members ({data.teamMembers.length})
          </h4>
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-orange rounded-lg hover:bg-brand-orange-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Person
          </button>
        </div>

        {data.teamMembers.length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Users className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm text-gray-600 mb-1">
              No team members added yet
            </p>
            <p className="text-xs text-gray-500">
              Add your current team and any planned hires for FY{fiscalYear}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {data.teamMembers.map((member) => (
              <div key={member.id} className="px-5 py-4 flex items-center gap-4 hover:bg-gray-50">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  member.classification === 'cogs' ? 'bg-brand-orange-100' : 'bg-brand-navy/10'
                }`}>
                  {member.classification === 'cogs' ? (
                    <HardHat className="w-5 h-5 text-brand-orange" />
                  ) : (
                    <Briefcase className="w-5 h-5 text-brand-navy" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{member.name}</span>
                    {member.isNew && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded">
                        New Hire
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500 flex items-center gap-2">
                    <span>{member.position}</span>
                    <span className="text-gray-300">•</span>
                    <span className={member.classification === 'cogs' ? 'text-brand-orange' : 'text-brand-navy'}>
                      {member.classification === 'cogs' ? 'Delivery' : 'Back Office'}
                    </span>
                    {member.startMonth && (
                      <>
                        <span className="text-gray-300">•</span>
                        <span className="flex items-center gap-1 text-gray-500">
                          <Calendar className="w-3 h-3" />
                          Starts {new Date(member.startMonth + '-01').toLocaleString('en-AU', { month: 'short', year: 'numeric' })}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-semibold text-gray-900">
                    {formatCurrency(member.annualSalary)}
                  </div>
                  <div className="text-xs text-gray-500">
                    + {formatCurrency(member.annualSalary * 0.12)} super
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleEditMember(member)}
                    className="p-2 text-gray-400 hover:text-brand-orange hover:bg-brand-orange-50 rounded-lg transition-colors"
                    title="Edit"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleRemoveMember(member.id)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Form Modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-lg text-gray-900 flex items-center gap-2">
                {editingMemberId ? (
                  <>
                    <Pencil className="w-5 h-5 text-brand-orange" />
                    Edit Team Member
                  </>
                ) : (
                  <>
                    <UserPlus className="w-5 h-5 text-brand-orange" />
                    Add Team Member
                  </>
                )}
              </h3>
              <button
                onClick={() => {
                  setShowAddForm(false)
                  setEditingMemberId(null)
                  setNewMember({ classification: 'opex', isNew: false })
                  setAiSuggestion(null)
                  setLastAIPosition('')
                }}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Position/Role *
                  </label>
                  <input
                    type="text"
                    value={newMember.position || ''}
                    onChange={(e) => setNewMember({ ...newMember, position: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                    placeholder="e.g., Project Manager"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={newMember.name || ''}
                    onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                    placeholder="Leave blank for planned hires"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Annual Salary *
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="number"
                      value={newMember.annualSalary || ''}
                      onChange={(e) => setNewMember({ ...newMember, annualSalary: parseFloat(e.target.value) || 0 })}
                      className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                      placeholder="85000"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Super (12%) calculated automatically
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Do they work with clients? *
                  </label>
                  <select
                    value={newMember.classification || 'opex'}
                    onChange={(e) => setNewMember({ ...newMember, classification: e.target.value as 'opex' | 'cogs' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                  >
                    <option value="opex">No - Back Office (admin, sales, management)</option>
                    <option value="cogs">Yes - Delivery Team (does the client work)</option>
                  </select>
                </div>
              </div>

              {/* AI Salary Suggestion */}
              {newMember.position && (
                <div className="bg-gradient-to-r from-brand-orange-50 to-amber-50 rounded-lg p-3 border border-brand-orange-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-brand-orange" />
                      <span className="text-xs font-semibold text-brand-orange-900">AI Salary Suggestion</span>
                    </div>
                    {(positionChanged || !aiSuggestion) && !isLoadingAI && (
                      <button
                        type="button"
                        onClick={fetchAISuggestion}
                        className="text-xs text-brand-orange hover:text-brand-orange-700 font-medium"
                      >
                        {aiSuggestion ? `Get suggestion for "${newMember.position}"` : `Get suggestion for "${newMember.position}"`}
                      </button>
                    )}
                  </div>

                  {isLoadingAI && (
                    <div className="flex items-center gap-2 py-2">
                      <Loader2 className="w-4 h-4 text-brand-orange animate-spin" />
                      <span className="text-sm text-gray-600">Getting suggestion for "{newMember.position}"...</span>
                    </div>
                  )}

                  {aiSuggestion && !isLoadingAI && !positionChanged && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-lg font-bold text-gray-900">{aiSuggestion.suggestion}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          aiSuggestion.confidence === 'high' ? 'bg-green-100 text-green-700' :
                          aiSuggestion.confidence === 'medium' ? 'bg-blue-100 text-blue-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {aiSuggestion.confidence === 'high' ? 'High confidence' :
                           aiSuggestion.confidence === 'medium' ? 'Moderate' : 'Ask coach'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600">{aiSuggestion.reasoning}</p>
                      {aiSuggestion.typicalValue && (
                        <div className="flex gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setNewMember({ ...newMember, annualSalary: aiSuggestion.typicalValue })
                              if (aiSuggestion.interactionId) {
                                recordAIAction(aiSuggestion.interactionId, 'used', aiSuggestion.typicalValue)
                              }
                            }}
                            className="flex-1 text-xs py-1.5 bg-brand-orange text-white rounded font-medium hover:bg-brand-orange-600"
                          >
                            Use ${aiSuggestion.typicalValue.toLocaleString()}
                          </button>
                          {aiSuggestion.minValue && (
                            <button
                              type="button"
                              onClick={() => {
                                setNewMember({ ...newMember, annualSalary: aiSuggestion.minValue })
                                if (aiSuggestion.interactionId) {
                                  recordAIAction(aiSuggestion.interactionId, 'adjusted', aiSuggestion.minValue)
                                }
                              }}
                              className="text-xs py-1.5 px-3 bg-white border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
                            >
                              ${aiSuggestion.minValue.toLocaleString()}
                            </button>
                          )}
                          {aiSuggestion.maxValue && (
                            <button
                              type="button"
                              onClick={() => {
                                setNewMember({ ...newMember, annualSalary: aiSuggestion.maxValue })
                                if (aiSuggestion.interactionId) {
                                  recordAIAction(aiSuggestion.interactionId, 'adjusted', aiSuggestion.maxValue)
                                }
                              }}
                              className="text-xs py-1.5 px-3 bg-white border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
                            >
                              ${aiSuggestion.maxValue.toLocaleString()}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <p className="text-xs text-gray-500 mt-2 italic">
                    AI suggestions are guides only. Confirm with your coach.
                  </p>
                </div>
              )}

              {/* Salary Guide - fallback */}
              {!newMember.position && (
                <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                  <div className="flex items-center gap-2 mb-2">
                    <Lightbulb className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-semibold text-blue-900">Typical Australian salaries</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    {SALARY_EXAMPLES.map((example) => (
                      <button
                        key={example.role}
                        type="button"
                        onClick={() => setNewMember({
                          ...newMember,
                          position: newMember.position || example.role,
                          annualSalary: example.typical
                        })}
                        className="text-left text-xs py-1 px-2 rounded hover:bg-blue-100 transition-colors"
                      >
                        <span className="text-gray-700">{example.role}:</span>
                        <span className="text-blue-700 ml-1">{example.range}</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-blue-600 mt-2 italic">
                    Enter a position above for personalized AI suggestions
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Month <span className="text-gray-400 font-normal">(for new hires)</span>
                  </label>
                  <select
                    value={newMember.startMonth || ''}
                    onChange={(e) => setNewMember({ ...newMember, startMonth: e.target.value, isNew: !!e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                  >
                    <option value="">Already employed</option>
                    {next12Months.map((month) => (
                      <option key={month.value} value={month.value}>
                        {month.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Salary will be pro-rated from start month
                  </p>
                </div>

                <div className="flex items-end pb-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newMember.isNew || false}
                      onChange={(e) => setNewMember({ ...newMember, isNew: e.target.checked })}
                      className="w-4 h-4 text-brand-orange border-gray-300 rounded focus:ring-brand-orange"
                    />
                    <span className="text-sm text-gray-700">Planned new hire</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setShowAddForm(false)
                  setEditingMemberId(null)
                  setNewMember({ classification: 'opex', isNew: false })
                  setAiSuggestion(null)
                  setLastAIPosition('')
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddMember}
                disabled={!newMember.position || !newMember.annualSalary}
                className="px-4 py-2 text-sm font-medium text-white bg-brand-orange rounded-lg hover:bg-brand-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editingMemberId ? 'Save Changes' : 'Add Team Member'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* How Costs Flow */}
      <div className="bg-gray-50 rounded-xl p-5">
        <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <ArrowRight className="w-4 h-4 text-brand-orange" />
          Why This Matters
        </h4>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-start gap-2">
            <div className="w-5 h-5 rounded bg-brand-navy/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Briefcase className="w-3 h-3 text-brand-navy" />
            </div>
            <div>
              <span className="font-medium text-gray-900">Back Office wages</span>
              <span className="text-gray-600"> → Running costs (reduces what you keep)</span>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-5 h-5 rounded bg-brand-orange-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <HardHat className="w-3 h-3 text-brand-orange" />
            </div>
            <div>
              <span className="font-medium text-gray-900">Delivery Team wages</span>
              <span className="text-gray-600"> → Cost of work (reduces what you make)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
