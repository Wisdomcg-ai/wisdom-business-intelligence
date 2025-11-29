'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import {
  Target, Calendar, Briefcase, Users, Plus, Trash2, Edit2, ChevronDown, ChevronUp,
  Clock, CheckCircle2, AlertCircle, Flag, TrendingUp, GripVertical, UserPlus, X
} from 'lucide-react'
import {
  StrategicInitiative,
  KPIData,
  FinancialData,
  CoreMetricsData,
  MonthlyTargets,
  InitiativeTask,
  InitiativeWithTasks,
  TeamMember,
  TaskStatus,
  YearType,
  QuarterType,
  InitiativeCategory,
  ProjectMilestone
} from '../types'
import { calculateQuarters } from '../utils/quarters'
import { formatCurrency, formatNumber, formatPercentage } from '../utils/formatting'
import { getInitials, getColorForName } from '../utils/team'
import { getCategoryStyle } from '../utils/design-tokens'

interface Step5Props {
  annualPlanByQuarter: Record<string, StrategicInitiative[]>
  setAnnualPlanByQuarter: (plan: Record<string, StrategicInitiative[]>) => void
  quarterlyTargets: Record<string, { q1: string; q2: string; q3: string; q4: string }>
  financialData: FinancialData
  coreMetrics: CoreMetricsData
  kpis: KPIData[]
  yearType: YearType
  businessId: string
  operationalActivities?: OperationalActivity[]
  setOperationalActivities?: (activities: OperationalActivity[]) => void
}

export default function Step5SprintPlanning({
  annualPlanByQuarter,
  setAnnualPlanByQuarter,
  quarterlyTargets,
  financialData,
  coreMetrics,
  kpis,
  yearType,
  businessId,
  operationalActivities,
  setOperationalActivities
}: Step5Props) {
  const [activeTab, setActiveTab] = useState<'monthly' | 'initiatives' | 'operational'>('monthly')

  // Determine current quarter
  const today = new Date()
  const currentYear = today.getFullYear()
  const planYear = yearType === 'FY' && today.getMonth() >= 3 ? currentYear + 1 :
                   yearType === 'CY' && today.getMonth() >= 9 ? currentYear + 1 : currentYear

  const QUARTERS = calculateQuarters(yearType, planYear)
  // For quarterly review: plan for NEXT quarter, not current (which is locked)
  const nextQuarter = QUARTERS.find(q => q.isNextQuarter)
  const currentQuarter = nextQuarter || QUARTERS.find(q => q.isCurrent) || QUARTERS[0]
  const currentQuarterKey = currentQuarter.id // 'q1', 'q2', 'q3', or 'q4'

  // Monthly Targets State - Initialize from quarterly targets
  const [monthlyTargets, setMonthlyTargets] = useState<MonthlyTargets>({
    month1: {
      revenue: 0,
      grossProfit: 0,
      grossMargin: 0,
      netProfit: 0,
      netMargin: 0,
      customers: 0,
      employees: 0
    },
    month2: {
      revenue: 0,
      grossProfit: 0,
      grossMargin: 0,
      netProfit: 0,
      netMargin: 0,
      customers: 0,
      employees: 0
    },
    month3: {
      revenue: 0,
      grossProfit: 0,
      grossMargin: 0,
      netProfit: 0,
      netMargin: 0,
      customers: 0,
      employees: 0
    }
  })

  // Initialize monthly targets from quarterly targets on mount
  useEffect(() => {
    const qKey = currentQuarterKey as 'q1' | 'q2' | 'q3' | 'q4'

    const quarterRevenue = parseFloat(quarterlyTargets['revenue']?.[qKey] || '0') || 0
    const quarterGrossProfit = parseFloat(quarterlyTargets['grossProfit']?.[qKey] || '0') || 0
    const quarterNetProfit = parseFloat(quarterlyTargets['netProfit']?.[qKey] || '0') || 0
    const quarterCustomers = parseFloat(quarterlyTargets['customers']?.[qKey] || '0') || 0
    const quarterEmployees = parseFloat(quarterlyTargets['teamHeadcount']?.[qKey] || '0') || 0

    // Only initialize if we have values and current state is all zeros
    if (quarterRevenue > 0 && monthlyTargets.month1.revenue === 0) {
      setMonthlyTargets({
        month1: {
          revenue: Math.round(quarterRevenue / 3),
          grossProfit: Math.round(quarterGrossProfit / 3),
          grossMargin: 0, // Will be auto-calculated
          netProfit: Math.round(quarterNetProfit / 3),
          netMargin: 0, // Will be auto-calculated
          customers: Math.round(quarterCustomers / 3),
          employees: Math.round(quarterEmployees)
        },
        month2: {
          revenue: Math.round(quarterRevenue / 3),
          grossProfit: Math.round(quarterGrossProfit / 3),
          grossMargin: 0, // Will be auto-calculated
          netProfit: Math.round(quarterNetProfit / 3),
          netMargin: 0, // Will be auto-calculated
          customers: Math.round(quarterCustomers / 3),
          employees: Math.round(quarterEmployees)
        },
        month3: {
          revenue: Math.round(quarterRevenue / 3),
          grossProfit: Math.round(quarterGrossProfit / 3),
          grossMargin: 0, // Will be auto-calculated
          netProfit: Math.round(quarterNetProfit / 3),
          netMargin: 0, // Will be auto-calculated
          customers: Math.round(quarterCustomers / 3),
          employees: Math.round(quarterEmployees)
        }
      })
    }
  }, [currentQuarterKey, quarterlyTargets])

  // Initiatives State (from current quarter + enhancements)
  const [initiatives, setInitiatives] = useState<InitiativeWithTasks[]>(() => {
    const currentQuarterInitiatives = annualPlanByQuarter[currentQuarterKey] || []
    return currentQuarterInitiatives.map(init => ({
      ...init,
      why: '',
      outcome: '',
      startDate: '',
      endDate: '',
      milestones: [],
      tasks: [],
      totalHours: 0
    }))
  })

  // Team Members State
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])

  // Tab configuration with enhanced styling (must be after initiatives state)
  const tabs = useMemo(() => [
    {
      id: 'monthly',
      label: 'Monthly Goals',
      icon: Target,
      description: 'Break down quarterly targets into monthly goals',
      color: 'from-slate-600 to-slate-700',
      bgColor: 'bg-slate-50',
      borderColor: 'border-slate-500',
      textColor: 'text-slate-700'
    },
    {
      id: 'initiatives',
      label: 'Initiatives & Projects',
      icon: Flag,
      badge: initiatives.length,
      description: 'Plan and track strategic initiatives',
      color: 'from-teal-600 to-teal-700',
      bgColor: 'bg-teal-50',
      borderColor: 'border-teal-500',
      textColor: 'text-teal-700'
    },
    {
      id: 'operational',
      label: 'Operational Plan',
      icon: Briefcase,
      description: 'Weekly execution and accountability',
      color: 'from-slate-600 to-slate-700',
      bgColor: 'bg-slate-50',
      borderColor: 'border-slate-500',
      textColor: 'text-slate-700'
    }
  ], [initiatives.length])

  // Sync FROM Annual Plan: Update local initiatives when Annual Plan changes
  // Only sync when annualPlanByQuarter changes, NOT when local initiatives change
  useEffect(() => {
    const currentQuarterInitiatives = annualPlanByQuarter[currentQuarterKey] || []

    // Only update if the initiative list from Annual Plan has actually changed
    setInitiatives(prevInitiatives => {
      // If lengths are different, something changed
      if (currentQuarterInitiatives.length !== prevInitiatives.length) {
        return currentQuarterInitiatives.map(annualInit => {
          const existingInit = prevInitiatives.find(i => i.id === annualInit.id)

          if (existingInit) {
            // Preserve all local data, only update assignedTo from Annual Plan
            return {
              ...existingInit,
              assignedTo: annualInit.assignedTo || existingInit.assignedTo
            }
          } else {
            // New initiative from Annual Plan
            return {
              ...annualInit,
              why: '',
              outcome: '',
              startDate: '',
              endDate: '',
              milestones: [],
              tasks: [],
              totalHours: 0
            }
          }
        })
      }

      // If same length, check if any IDs are different
      const annualIds = currentQuarterInitiatives.map(i => i.id).sort().join(',')
      const localIds = prevInitiatives.map(i => i.id).sort().join(',')

      if (annualIds !== localIds) {
        return currentQuarterInitiatives.map(annualInit => ({
          ...annualInit,
          why: '',
          outcome: '',
          startDate: '',
          endDate: '',
          milestones: [],
          tasks: [],
          totalHours: 0
        }))
      }

      // No changes, return previous state
      return prevInitiatives
    })
  }, [annualPlanByQuarter, currentQuarterKey])

  // Load team members on mount
  useEffect(() => {
    loadTeamMembers()
  }, [])

  const loadTeamMembers = async () => {
    try {
      console.log('[90-Day Sprint] 🔄 Loading team members for businessId:', businessId)

      // Try to import Supabase client
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      // Get current user
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        console.log('[90-Day Sprint] ⚠️ No user logged in, using localStorage')
        // Not logged in - use localStorage
        loadFromLocalStorage()
        return
      }

      // Use businessId from props
      if (!businessId) {
        console.log('[90-Day Sprint] ⚠️ No businessId, using localStorage')
        loadFromLocalStorage()
        return
      }

      // Load team members from database
      const { data: profile, error: profileError } = await supabase
        .from('business_profiles')
        .select('key_roles, owner_info')
        .eq('id', businessId)
        .single()

      if (profileError) {
        console.error('[90-Day Sprint] ❌ Error loading business profile:', profileError)
        loadFromLocalStorage()
        return
      }

      console.log('[90-Day Sprint] 📦 Profile loaded:', profile)

      if (profile) {
        const members: TeamMember[] = []

        // Add owner from owner_info
        if (profile.owner_info && typeof profile.owner_info === 'object') {
          const ownerInfo = profile.owner_info as any
          if (ownerInfo.owner_name) {
            members.push({
              id: `owner-${businessId}`,
              name: ownerInfo.owner_name,
              email: ownerInfo.owner_email || '',
              role: 'Owner',
              type: 'employee',
              initials: getInitials(ownerInfo.owner_name),
              color: getColorForName(ownerInfo.owner_name),
              businessId,
              userId: user.id,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            })
          }
        }

        // Add team members from key_roles
        if (profile.key_roles && Array.isArray(profile.key_roles)) {
          profile.key_roles.forEach((role: any, index: number) => {
            if (role.name && role.name.trim()) {
              members.push({
                id: `role-${businessId}-${index}`,
                name: role.name,
                email: role.email || '',
                role: role.role || 'Team Member',
                type: role.type || 'employee',
                initials: getInitials(role.name),
                color: getColorForName(role.name),
                businessId,
                userId: user.id,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              })
            }
          })
        }

        console.log('[90-Day Sprint] ✅ Loaded team members:', members.map(m => ({ id: m.id, name: m.name })))
        setTeamMembers(members)
        // Save to localStorage as cache
        localStorage.setItem('team_members', JSON.stringify(members))
      } else {
        console.log('[90-Day Sprint] ⚠️ No profile data, using localStorage')
        loadFromLocalStorage()
      }
    } catch (error) {
      console.error('[90-Day Sprint] ❌ Error loading team members from database:', error)
      loadFromLocalStorage()
    }
  }

  const loadFromLocalStorage = () => {
    const stored = localStorage.getItem('team_members')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          setTeamMembers(parsed)
          return
        }
      } catch (e) {
        console.error('Error parsing stored team members:', e)
      }
    }
    setTeamMembers([])
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-gradient-to-r from-slate-50 to-slate-100 rounded-lg border border-[#8E9AAF] p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-[#3E3F57] mb-2">90-Day Execution Plan</h2>
            <p className="text-gray-600">
              {currentQuarter.label} • {currentQuarter.months} • {yearType} {planYear}
            </p>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-600 mb-1">Quarter</div>
            <div className="text-3xl font-bold text-[#4C5D75]">{currentQuarter.label}</div>
          </div>
        </div>
      </div>

      {/* Tab Navigation - Enhanced Design */}
      <div className="bg-white rounded-lg shadow-md border-2 border-gray-200 overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 divide-y md:divide-y-0 md:divide-x divide-gray-200">
          {tabs.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`group relative p-6 transition-all duration-200 ${
                  isActive
                    ? `bg-gradient-to-br ${tab.color} text-white shadow-lg transform scale-[1.02]`
                    : `bg-white hover:${tab.bgColor} text-gray-700 hover:shadow-md`
                }`}
              >
                {/* Active indicator bar */}
                {isActive && (
                  <div className="absolute top-0 left-0 right-0 h-1 bg-white opacity-50"></div>
                )}

                <div className="flex flex-col items-center text-center space-y-3">
                  {/* Icon */}
                  <div className={`p-3 rounded-full transition-all ${
                    isActive
                      ? 'bg-white bg-opacity-20'
                      : `${tab.bgColor} ${tab.textColor} group-hover:scale-110`
                  }`}>
                    <Icon className="w-7 h-7" />
                  </div>

                  {/* Label */}
                  <div>
                    <div className="flex items-center justify-center gap-2">
                      <span className={`font-bold text-base ${
                        isActive ? 'text-white' : tab.textColor
                      }`}>
                        {tab.label}
                      </span>
                      {tab.badge !== undefined && tab.badge > 0 && (
                        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                          isActive
                            ? 'bg-white text-teal-700'
                            : 'bg-teal-100 text-teal-700'
                        }`}>
                          {tab.badge}
                        </span>
                      )}
                    </div>
                    <p className={`text-xs mt-1 ${
                      isActive ? 'text-white text-opacity-90' : 'text-gray-500'
                    }`}>
                      {tab.description}
                    </p>
                  </div>
                </div>

                {/* Hover effect overlay */}
                {!isActive && (
                  <div className={`absolute inset-0 opacity-0 group-hover:opacity-5 transition-opacity bg-gradient-to-br ${tab.color}`}></div>
                )}
              </button>
            )
          })}
        </div>

        {/* Tab Content */}
        <div className="p-8">
          {activeTab === 'monthly' && (
            <MonthlyGoalsTab
              monthlyTargets={monthlyTargets}
              setMonthlyTargets={setMonthlyTargets}
              quarterlyTargets={quarterlyTargets}
              financialData={financialData}
              coreMetrics={coreMetrics}
              kpis={kpis}
              currentQuarter={currentQuarter}
              currentQuarterKey={currentQuarterKey}
            />
          )}

          {activeTab === 'initiatives' && (
            <InitiativesTab
              initiatives={initiatives}
              setInitiatives={setInitiatives}
              teamMembers={teamMembers}
              setTeamMembers={setTeamMembers}
              currentQuarterKey={currentQuarterKey}
              annualPlanByQuarter={annualPlanByQuarter}
              businessId={businessId}
            />
          )}

          {activeTab === 'operational' && (
            <OperationalPlanTab
              operationalActivities={operationalActivities}
              setOperationalActivities={setOperationalActivities}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// MONTHLY GOALS TAB
// =============================================================================

interface MonthlyGoalsTabProps {
  monthlyTargets: MonthlyTargets
  setMonthlyTargets: (targets: MonthlyTargets) => void
  quarterlyTargets: Record<string, { q1: string; q2: string; q3: string; q4: string }>
  financialData: FinancialData
  coreMetrics: CoreMetricsData
  kpis: KPIData[]
  currentQuarter: any
  currentQuarterKey: string
}

function MonthlyGoalsTab({
  monthlyTargets,
  setMonthlyTargets,
  quarterlyTargets,
  financialData,
  coreMetrics,
  kpis,
  currentQuarter,
  currentQuarterKey
}: MonthlyGoalsTabProps) {
  // Collapsible section state
  const [showFinancialTargets, setShowFinancialTargets] = useState(true)
  const [showCoreMetrics, setShowCoreMetrics] = useState(true)
  const [showKPIs, setShowKPIs] = useState(true)

  const updateMonthlyTarget = (
    month: 'month1' | 'month2' | 'month3',
    metric: string,
    value: string
  ) => {
    const numValue = parseFloat(value) || 0
    setMonthlyTargets({
      ...monthlyTargets,
      [month]: {
        ...monthlyTargets[month],
        [metric]: numValue
      }
    })
  }

  // Get month names based on quarter
  const getMonthNames = () => {
    const startMonth = new Date(currentQuarter.startDate).getMonth()
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return [
      monthNames[startMonth],
      monthNames[(startMonth + 1) % 12],
      monthNames[(startMonth + 2) % 12]
    ]
  }

  const [month1Name, month2Name, month3Name] = getMonthNames()

  // Helper functions
  const formatCurrencyValue = (value: number | string): string => {
    const num = typeof value === 'string' ? parseFloat(value) : value
    if (!num || isNaN(num)) return '$0'
    return `$${Math.round(num).toLocaleString()}`
  }

  const parseCurrencyInput = (value: string): string => {
    return value.replace(/[$,]/g, '')
  }

  const getQuarterlyTarget = (metricKey: string): number => {
    const qKey = currentQuarterKey as 'q1' | 'q2' | 'q3' | 'q4'
    const value = quarterlyTargets[metricKey]?.[qKey]
    return parseFloat(value || '0') || 0
  }

  // Auto-calculate margins based on revenue and profit
  const calculateGrossMargin = (revenue: number, grossProfit: number): number => {
    if (revenue === 0) return 0
    return Math.round((grossProfit / revenue) * 100 * 10) / 10 // Round to 1 decimal
  }

  const calculateNetMargin = (revenue: number, netProfit: number): number => {
    if (revenue === 0) return 0
    return Math.round((netProfit / revenue) * 100 * 10) / 10 // Round to 1 decimal
  }

  // Get calculated margins for each month
  const month1GrossMargin = calculateGrossMargin(monthlyTargets.month1.revenue, monthlyTargets.month1.grossProfit)
  const month2GrossMargin = calculateGrossMargin(monthlyTargets.month2.revenue, monthlyTargets.month2.grossProfit)
  const month3GrossMargin = calculateGrossMargin(monthlyTargets.month3.revenue, monthlyTargets.month3.grossProfit)

  const month1NetMargin = calculateNetMargin(monthlyTargets.month1.revenue, monthlyTargets.month1.netProfit)
  const month2NetMargin = calculateNetMargin(monthlyTargets.month2.revenue, monthlyTargets.month2.netProfit)
  const month3NetMargin = calculateNetMargin(monthlyTargets.month3.revenue, monthlyTargets.month3.netProfit)

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">Monthly Targets - {currentQuarter.label}</h3>
        <p className="text-sm text-gray-600">
          Break down your {currentQuarter.label} targets into monthly goals. Adjust for seasonality as needed.
        </p>
      </div>

      {/* Financial Targets Section */}
      {financialData && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200">
          <button
            onClick={() => setShowFinancialTargets(!showFinancialTargets)}
            className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
          >
            <h4 className="text-sm font-semibold text-slate-900">Financial Targets</h4>
            {showFinancialTargets ? (
              <ChevronUp className="w-5 h-5 text-slate-600" />
            ) : (
              <ChevronDown className="w-5 h-5 text-slate-600" />
            )}
          </button>
          {showFinancialTargets && (
            <div className="px-4 pb-4">
              <table className="w-full border-collapse border border-slate-200" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '20%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '16%' }} />
            </colgroup>
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 border-b border-r border-slate-200">Metric</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-slate-900 border-b border-r border-slate-200">{currentQuarter.label} Target</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-slate-900 border-b border-r border-slate-200">
                  <div className="flex flex-col items-center">
                    <span>Month 1</span>
                    <span className="text-[10px] font-normal text-gray-500">{month1Name}</span>
                  </div>
                </th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-slate-900 border-b border-r border-slate-200">
                  <div className="flex flex-col items-center">
                    <span>Month 2</span>
                    <span className="text-[10px] font-normal text-gray-500">{month2Name}</span>
                  </div>
                </th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-slate-900 border-b border-r border-slate-200">
                  <div className="flex flex-col items-center">
                    <span>Month 3</span>
                    <span className="text-[10px] font-normal text-gray-500">{month3Name}</span>
                  </div>
                </th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-slate-900 border-b border-slate-200">Total</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {/* Revenue */}
              {(() => {
                const quarterlyTarget = getQuarterlyTarget('revenue')
                const total = monthlyTargets.month1.revenue + monthlyTargets.month2.revenue + monthlyTargets.month3.revenue
                const variance = total - quarterlyTarget
                const isValid = Math.abs(variance) < 1
                return (
                  <tr>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900 border-r border-slate-200">Revenue</td>
                    <td className="px-4 py-3 text-sm text-slate-700 font-medium border-r border-slate-200 text-center">
                      {formatCurrencyValue(quarterlyTarget)}
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        value={formatCurrencyValue(monthlyTargets.month1.revenue)}
                        onChange={(e) => updateMonthlyTarget('month1', 'revenue', parseCurrencyInput(e.target.value))}
                        placeholder="$0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent hover:border-teal-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        value={formatCurrencyValue(monthlyTargets.month2.revenue)}
                        onChange={(e) => updateMonthlyTarget('month2', 'revenue', parseCurrencyInput(e.target.value))}
                        placeholder="$0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent hover:border-teal-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        value={formatCurrencyValue(monthlyTargets.month3.revenue)}
                        onChange={(e) => updateMonthlyTarget('month3', 'revenue', parseCurrencyInput(e.target.value))}
                        placeholder="$0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent hover:border-teal-300 border-gray-300"
                      />
                    </td>
                    <td className={`px-4 py-3 text-sm font-bold text-center border-l border-slate-200 ${isValid ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}`}>
                      {formatCurrencyValue(total)}
                      {!isValid && <div className="text-[10px] font-normal">{variance > 0 ? '+' : ''}{formatCurrencyValue(variance)}</div>}
                    </td>
                  </tr>
                )
              })()}

              {/* Gross Profit */}
              {(() => {
                const quarterlyTarget = getQuarterlyTarget('grossProfit')
                const total = monthlyTargets.month1.grossProfit + monthlyTargets.month2.grossProfit + monthlyTargets.month3.grossProfit
                const variance = total - quarterlyTarget
                const isValid = Math.abs(variance) < 1
                return (
                  <tr>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900 border-r border-slate-200">Gross Profit</td>
                    <td className="px-4 py-3 text-sm text-slate-700 font-medium border-r border-slate-200 text-center">
                      {formatCurrencyValue(quarterlyTarget)}
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        value={formatCurrencyValue(monthlyTargets.month1.grossProfit)}
                        onChange={(e) => updateMonthlyTarget('month1', 'grossProfit', parseCurrencyInput(e.target.value))}
                        placeholder="$0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent hover:border-teal-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        value={formatCurrencyValue(monthlyTargets.month2.grossProfit)}
                        onChange={(e) => updateMonthlyTarget('month2', 'grossProfit', parseCurrencyInput(e.target.value))}
                        placeholder="$0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent hover:border-teal-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        value={formatCurrencyValue(monthlyTargets.month3.grossProfit)}
                        onChange={(e) => updateMonthlyTarget('month3', 'grossProfit', parseCurrencyInput(e.target.value))}
                        placeholder="$0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent hover:border-teal-300 border-gray-300"
                      />
                    </td>
                    <td className={`px-4 py-3 text-sm font-bold text-center border-l border-slate-200 ${isValid ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}`}>
                      {formatCurrencyValue(total)}
                      {!isValid && <div className="text-[10px] font-normal">{variance > 0 ? '+' : ''}{formatCurrencyValue(variance)}</div>}
                    </td>
                  </tr>
                )
              })()}

              {/* Gross Margin - Auto-Calculated */}
              {(() => {
                const quarterlyTarget = getQuarterlyTarget('grossMargin')
                const avg = (month1GrossMargin + month2GrossMargin + month3GrossMargin) / 3
                return (
                  <tr className="bg-teal-50">
                    <td className="px-4 py-3 text-sm font-medium text-slate-900 border-r border-slate-200">
                      Gross Margin
                      <div className="text-[10px] font-normal text-teal-600">Auto-calculated</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700 font-medium border-r border-slate-200 text-center">
                      {quarterlyTarget > 0 ? `${quarterlyTarget}%` : '-'}
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <div className="px-2 py-2 bg-teal-100 rounded-md text-sm text-center font-medium text-slate-700 border border-teal-200">
                        {month1GrossMargin > 0 ? `${month1GrossMargin.toFixed(1)}%` : '-'}
                      </div>
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <div className="px-2 py-2 bg-teal-100 rounded-md text-sm text-center font-medium text-slate-700 border border-teal-200">
                        {month2GrossMargin > 0 ? `${month2GrossMargin.toFixed(1)}%` : '-'}
                      </div>
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <div className="px-2 py-2 bg-teal-100 rounded-md text-sm text-center font-medium text-slate-700 border border-teal-200">
                        {month3GrossMargin > 0 ? `${month3GrossMargin.toFixed(1)}%` : '-'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-center border-l border-slate-200 bg-slate-100">
                      {avg > 0 ? `${avg.toFixed(1)}%` : '-'}
                      <div className="text-[10px] font-normal text-gray-500">Avg</div>
                    </td>
                  </tr>
                )
              })()}

              {/* Net Profit */}
              {(() => {
                const quarterlyTarget = getQuarterlyTarget('netProfit')
                const total = monthlyTargets.month1.netProfit + monthlyTargets.month2.netProfit + monthlyTargets.month3.netProfit
                const variance = total - quarterlyTarget
                const isValid = Math.abs(variance) < 1
                return (
                  <tr>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900 border-r border-slate-200">Net Profit</td>
                    <td className="px-4 py-3 text-sm text-slate-700 font-medium border-r border-slate-200 text-center">
                      {formatCurrencyValue(quarterlyTarget)}
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        value={formatCurrencyValue(monthlyTargets.month1.netProfit)}
                        onChange={(e) => updateMonthlyTarget('month1', 'netProfit', parseCurrencyInput(e.target.value))}
                        placeholder="$0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent hover:border-teal-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        value={formatCurrencyValue(monthlyTargets.month2.netProfit)}
                        onChange={(e) => updateMonthlyTarget('month2', 'netProfit', parseCurrencyInput(e.target.value))}
                        placeholder="$0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent hover:border-teal-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        value={formatCurrencyValue(monthlyTargets.month3.netProfit)}
                        onChange={(e) => updateMonthlyTarget('month3', 'netProfit', parseCurrencyInput(e.target.value))}
                        placeholder="$0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent hover:border-teal-300 border-gray-300"
                      />
                    </td>
                    <td className={`px-4 py-3 text-sm font-bold text-center border-l border-slate-200 ${isValid ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}`}>
                      {formatCurrencyValue(total)}
                      {!isValid && <div className="text-[10px] font-normal">{variance > 0 ? '+' : ''}{formatCurrencyValue(variance)}</div>}
                    </td>
                  </tr>
                )
              })()}

              {/* Net Margin - Auto-Calculated */}
              {(() => {
                const quarterlyTarget = getQuarterlyTarget('netMargin')
                const avg = (month1NetMargin + month2NetMargin + month3NetMargin) / 3
                return (
                  <tr className="bg-teal-50">
                    <td className="px-4 py-3 text-sm font-medium text-slate-900 border-r border-slate-200">
                      Net Margin
                      <div className="text-[10px] font-normal text-teal-600">Auto-calculated</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700 font-medium border-r border-slate-200 text-center">
                      {quarterlyTarget > 0 ? `${quarterlyTarget}%` : '-'}
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <div className="px-2 py-2 bg-teal-100 rounded-md text-sm text-center font-medium text-slate-700 border border-teal-200">
                        {month1NetMargin > 0 ? `${month1NetMargin.toFixed(1)}%` : '-'}
                      </div>
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <div className="px-2 py-2 bg-teal-100 rounded-md text-sm text-center font-medium text-slate-700 border border-teal-200">
                        {month2NetMargin > 0 ? `${month2NetMargin.toFixed(1)}%` : '-'}
                      </div>
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <div className="px-2 py-2 bg-teal-100 rounded-md text-sm text-center font-medium text-slate-700 border border-teal-200">
                        {month3NetMargin > 0 ? `${month3NetMargin.toFixed(1)}%` : '-'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-center border-l border-slate-200 bg-slate-100">
                      {avg > 0 ? `${avg.toFixed(1)}%` : '-'}
                      <div className="text-[10px] font-normal text-gray-500">Avg</div>
                    </td>
                  </tr>
                )
              })()}
            </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Core Business Metrics Section */}
      {coreMetrics && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200">
          <button
            onClick={() => setShowCoreMetrics(!showCoreMetrics)}
            className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
          >
            <h4 className="text-sm font-semibold text-slate-900">Core Business Metrics</h4>
            {showCoreMetrics ? (
              <ChevronUp className="w-5 h-5 text-slate-600" />
            ) : (
              <ChevronDown className="w-5 h-5 text-slate-600" />
            )}
          </button>
          {showCoreMetrics && (
            <div className="px-4 pb-4">
              <table className="w-full border-collapse border border-slate-200" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '20%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '16%' }} />
            </colgroup>
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 border-b border-r border-slate-200">Metric</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-slate-900 border-b border-r border-slate-200">{currentQuarter.label} Target</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-slate-900 border-b border-r border-slate-200">
                  <div className="flex flex-col items-center">
                    <span>Month 1</span>
                    <span className="text-[10px] font-normal text-gray-500">{month1Name}</span>
                  </div>
                </th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-slate-900 border-b border-r border-slate-200">
                  <div className="flex flex-col items-center">
                    <span>Month 2</span>
                    <span className="text-[10px] font-normal text-gray-500">{month2Name}</span>
                  </div>
                </th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-slate-900 border-b border-r border-slate-200">
                  <div className="flex flex-col items-center">
                    <span>Month 3</span>
                    <span className="text-[10px] font-normal text-gray-500">{month3Name}</span>
                  </div>
                </th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-slate-900 border-b border-slate-200">Total</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {/* Leads Per Month */}
              {coreMetrics.leadsPerMonth?.year1 > 0 && (() => {
                const quarterlyTarget = getQuarterlyTarget('leadsPerMonth')
                return (
                  <tr>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900 border-r border-slate-200">Leads Per Month</td>
                    <td className="px-4 py-3 text-sm text-slate-700 font-medium border-r border-slate-200 text-center">
                      {quarterlyTarget > 0 ? Math.round(quarterlyTarget) : '-'}
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        placeholder="0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent hover:border-teal-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        placeholder="0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent hover:border-teal-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        placeholder="0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent hover:border-teal-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-center border-l border-slate-200 bg-slate-100">
                      -
                      <div className="text-[10px] font-normal text-gray-500">Total</div>
                    </td>
                  </tr>
                )
              })()}

              {/* Conversion Rate */}
              {coreMetrics.conversionRate?.year1 > 0 && (() => {
                const quarterlyTarget = getQuarterlyTarget('conversionRate')
                return (
                  <tr className="bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-slate-900 border-r border-slate-200">Conversion Rate</td>
                    <td className="px-4 py-3 text-sm text-slate-700 font-medium border-r border-slate-200 text-center">
                      {quarterlyTarget > 0 ? `${quarterlyTarget}%` : '-'}
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        placeholder="0%"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent hover:border-teal-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        placeholder="0%"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent hover:border-teal-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        placeholder="0%"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent hover:border-teal-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-center border-l border-slate-200 bg-slate-100">
                      -
                      <div className="text-[10px] font-normal text-gray-500">Avg</div>
                    </td>
                  </tr>
                )
              })()}

              {/* Avg Transaction Value */}
              {coreMetrics.avgTransactionValue?.year1 > 0 && (() => {
                const quarterlyTarget = getQuarterlyTarget('avgTransactionValue')
                return (
                  <tr>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900 border-r border-slate-200">Avg Transaction Value</td>
                    <td className="px-4 py-3 text-sm text-slate-700 font-medium border-r border-slate-200 text-center">
                      {quarterlyTarget > 0 ? formatCurrencyValue(quarterlyTarget) : '-'}
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        placeholder="$0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent hover:border-teal-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        placeholder="$0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent hover:border-teal-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        placeholder="$0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent hover:border-teal-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-center border-l border-slate-200 bg-slate-100">
                      -
                      <div className="text-[10px] font-normal text-gray-500">Avg</div>
                    </td>
                  </tr>
                )
              })()}

              {/* Team Headcount */}
              {coreMetrics.teamHeadcount?.year1 > 0 && (() => {
                const quarterlyTarget = getQuarterlyTarget('teamHeadcount')
                const avg = (monthlyTargets.month1.employees + monthlyTargets.month2.employees + monthlyTargets.month3.employees) / 3
                return (
                  <tr>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900 border-r border-slate-200">Team Headcount</td>
                    <td className="px-4 py-3 text-sm text-slate-700 font-medium border-r border-slate-200 text-center">
                      {quarterlyTarget > 0 ? Math.round(quarterlyTarget) : '-'}
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        value={monthlyTargets.month1.employees || ''}
                        onChange={(e) => updateMonthlyTarget('month1', 'employees', e.target.value)}
                        placeholder="0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent hover:border-teal-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        value={monthlyTargets.month2.employees || ''}
                        onChange={(e) => updateMonthlyTarget('month2', 'employees', e.target.value)}
                        placeholder="0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent hover:border-teal-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        value={monthlyTargets.month3.employees || ''}
                        onChange={(e) => updateMonthlyTarget('month3', 'employees', e.target.value)}
                        placeholder="0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent hover:border-teal-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-center border-l border-slate-200 bg-slate-100">
                      {avg > 0 ? Math.round(avg) : '-'}
                      <div className="text-[10px] font-normal text-gray-500">Avg</div>
                    </td>
                  </tr>
                )
              })()}

              {/* Owner Hours Per Week */}
              {coreMetrics.ownerHoursPerWeek?.year1 > 0 && (() => {
                const quarterlyTarget = getQuarterlyTarget('ownerHoursPerWeek')
                return (
                  <tr>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900 border-r border-slate-200">Owner Hours Per Week</td>
                    <td className="px-4 py-3 text-sm text-slate-700 font-medium border-r border-slate-200 text-center">
                      {quarterlyTarget > 0 ? `${Math.round(quarterlyTarget)} hrs` : '-'}
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        placeholder="0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent hover:border-teal-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        placeholder="0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent hover:border-teal-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        placeholder="0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent hover:border-teal-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-center border-l border-slate-200 bg-slate-100">
                      -
                      <div className="text-[10px] font-normal text-gray-500">Avg</div>
                    </td>
                  </tr>
                )
              })()}

              {/* New Customers */}
              {(() => {
                const quarterlyTarget = getQuarterlyTarget('customers')
                const total = monthlyTargets.month1.customers + monthlyTargets.month2.customers + monthlyTargets.month3.customers
                const variance = total - quarterlyTarget
                const isValid = Math.abs(variance) < 1
                return (
                  <tr>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900 border-r border-slate-200">New Customers</td>
                    <td className="px-4 py-3 text-sm text-slate-700 font-medium border-r border-slate-200 text-center">
                      {quarterlyTarget > 0 ? Math.round(quarterlyTarget) : '-'}
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        value={monthlyTargets.month1.customers || ''}
                        onChange={(e) => updateMonthlyTarget('month1', 'customers', e.target.value)}
                        placeholder="0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent hover:border-teal-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        value={monthlyTargets.month2.customers || ''}
                        onChange={(e) => updateMonthlyTarget('month2', 'customers', e.target.value)}
                        placeholder="0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent hover:border-teal-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        value={monthlyTargets.month3.customers || ''}
                        onChange={(e) => updateMonthlyTarget('month3', 'customers', e.target.value)}
                        placeholder="0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent hover:border-teal-300 border-gray-300"
                      />
                    </td>
                    <td className={`px-4 py-3 text-sm font-bold text-center border-l border-slate-200 ${isValid ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}`}>
                      {total || '-'}
                      {!isValid && quarterlyTarget > 0 && <div className="text-[10px] font-normal">{variance > 0 ? '+' : ''}{Math.round(variance)}</div>}
                    </td>
                  </tr>
                )
              })()}
            </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* KPIs Section */}
      {kpis && kpis.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200">
          <button
            onClick={() => setShowKPIs(!showKPIs)}
            className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
          >
            <h4 className="text-sm font-semibold text-slate-900">Key Performance Indicators</h4>
            {showKPIs ? (
              <ChevronUp className="w-5 h-5 text-slate-600" />
            ) : (
              <ChevronDown className="w-5 h-5 text-slate-600" />
            )}
          </button>
          {showKPIs && (
            <div className="px-4 pb-4">
              <table className="w-full border-collapse border border-slate-200" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '20%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '16%' }} />
            </colgroup>
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 border-b border-r border-slate-200">KPI</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-slate-900 border-b border-r border-slate-200">{currentQuarter.label} Target</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-slate-900 border-b border-r border-slate-200">
                  <div className="flex flex-col items-center">
                    <span>Month 1</span>
                    <span className="text-[10px] font-normal text-gray-500">{month1Name}</span>
                  </div>
                </th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-slate-900 border-b border-r border-slate-200">
                  <div className="flex flex-col items-center">
                    <span>Month 2</span>
                    <span className="text-[10px] font-normal text-gray-500">{month2Name}</span>
                  </div>
                </th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-slate-900 border-b border-r border-slate-200">
                  <div className="flex flex-col items-center">
                    <span>Month 3</span>
                    <span className="text-[10px] font-normal text-gray-500">{month3Name}</span>
                  </div>
                </th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-slate-900 border-b border-slate-200">Total/Avg</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {kpis.map((kpi) => {
                const quarterlyTarget = getQuarterlyTarget(kpi.id)

                // Determine unit type
                const unit = (kpi.unit || '').toLowerCase()
                const isCurrency = unit.includes('$') || unit.includes('dollar')
                const isPercentage = unit.includes('%') || unit.includes('percent')

                // Format value based on unit type
                const formatKPIValue = (value: number | string) => {
                  const num = typeof value === 'string' ? parseFloat(value) : value
                  if (!num || isNaN(num)) return ''
                  if (isCurrency) {
                    return formatCurrencyValue(num)
                  } else if (isPercentage) {
                    return `${num}%`
                  } else {
                    return num.toString()
                  }
                }

                return (
                  <tr key={kpi.id}>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900 border-r border-slate-200">
                      {kpi.friendlyName || kpi.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700 font-medium border-r border-slate-200 text-center">
                      {quarterlyTarget > 0 ? formatKPIValue(quarterlyTarget) : '-'}
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        placeholder={isCurrency ? '$0' : isPercentage ? '0%' : '0'}
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent hover:border-teal-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        placeholder={isCurrency ? '$0' : isPercentage ? '0%' : '0'}
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent hover:border-teal-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        placeholder={isCurrency ? '$0' : isPercentage ? '0%' : '0'}
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent hover:border-teal-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-center border-l border-slate-200 bg-slate-100">
                      -
                      <div className="text-[10px] font-normal text-gray-500">-</div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Info Box */}
      <div className="p-4 bg-teal-50 border border-teal-200 rounded-lg">
        <div className="flex gap-3">
          <AlertCircle className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-teal-900">
            <p className="font-semibold mb-1">Adjust for Seasonality</p>
            <p>These targets default to an even split of your quarterly goals. Adjust each month based on your business seasonality, sales cycles, or planned initiatives. The total should match your quarterly target shown in the second column.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// INITIATIVES TAB
// =============================================================================

interface InitiativesTabProps {
  initiatives: InitiativeWithTasks[]
  setInitiatives: (initiatives: InitiativeWithTasks[]) => void
  teamMembers: TeamMember[]
  setTeamMembers: (members: TeamMember[]) => void
  currentQuarterKey: string
  annualPlanByQuarter: Record<string, StrategicInitiative[]>
  businessId: string
}

function InitiativesTab({
  initiatives,
  setInitiatives,
  teamMembers,
  setTeamMembers,
  currentQuarterKey,
  annualPlanByQuarter,
  businessId
}: InitiativesTabProps) {
  const [expandedInitiative, setExpandedInitiative] = useState<string | null>(null)
  const [showAddInitiative, setShowAddInitiative] = useState(false)
  const [showAddTeamMember, setShowAddTeamMember] = useState(false)
  const [showAssignmentFor, setShowAssignmentFor] = useState<string | null>(null)

  // Calculate initiative distribution per person
  const initiativesPerPerson = useMemo(() => {
    const counts: Record<string, number> = {}
    initiatives.forEach(init => {
      if (init.assignedTo) {
        counts[init.assignedTo] = (counts[init.assignedTo] || 0) + 1
      }
    })
    return counts
  }, [initiatives])

  const canAddMoreInitiatives = initiatives.length < 5
  // Show all team members (employees + contractors) for assignment
  const allTeamMembers = teamMembers

  // Helper to get member by ID
  const getMemberById = (id: string) => allTeamMembers.find(m => m.id === id)

  const toggleInitiative = (id: string) => {
    setExpandedInitiative(expandedInitiative === id ? null : id)
  }

  const addInitiative = (title: string) => {
    const newInitiative: InitiativeWithTasks = {
      id: `init-${Date.now()}`,
      title,
      source: 'roadmap',
      selected: true,
      why: '',
      outcome: '',
      startDate: '',
      endDate: '',
      milestones: [],
      tasks: [],
      totalHours: 0,
      status: 'not_started',
      progressPercentage: 0
    }
    setInitiatives([...initiatives, newInitiative])
    setExpandedInitiative(newInitiative.id)
  }

  const updateInitiative = (id: string, updates: Partial<InitiativeWithTasks>) => {
    setInitiatives(initiatives.map(init =>
      init.id === id ? { ...init, ...updates } : init
    ))
  }

  const deleteInitiative = (id: string) => {
    setInitiatives(initiatives.filter(init => init.id !== id))
    if (expandedInitiative === id) setExpandedInitiative(null)
  }

  const handleAssignPerson = (initiativeId: string, personId: string) => {
    updateInitiative(initiativeId, { assignedTo: personId })
    setShowAssignmentFor(null)
  }

  const addTask = (initiativeId: string) => {
    const initiative = initiatives.find(i => i.id === initiativeId)
    if (!initiative) return

    const newTask: InitiativeTask = {
      id: `task-${Date.now()}`,
      task: '',
      assignedTo: '',
      minutesAllocated: 0,
      dueDate: '',
      status: 'not_started',
      order: (initiative.tasks?.length || 0) + 1
    }

    const updatedTasks = [...(initiative.tasks || []), newTask]
    updateInitiative(initiativeId, {
      tasks: updatedTasks,
      totalHours: calculateTotalHours(updatedTasks)
    })
  }

  const updateTask = (initiativeId: string, taskId: string, updates: Partial<InitiativeTask>) => {
    const initiative = initiatives.find(i => i.id === initiativeId)
    if (!initiative) return

    const updatedTasks = (initiative.tasks || []).map(task =>
      task.id === taskId ? { ...task, ...updates } : task
    )

    updateInitiative(initiativeId, {
      tasks: updatedTasks,
      totalHours: calculateTotalHours(updatedTasks)
    })
  }

  const deleteTask = (initiativeId: string, taskId: string) => {
    const initiative = initiatives.find(i => i.id === initiativeId)
    if (!initiative) return

    const updatedTasks = (initiative.tasks || []).filter(task => task.id !== taskId)
    updateInitiative(initiativeId, {
      tasks: updatedTasks,
      totalHours: calculateTotalHours(updatedTasks)
    })
  }

  const calculateTotalHours = (tasks: InitiativeTask[]): number => {
    const totalMinutes = tasks.reduce((sum, task) => sum + (task.minutesAllocated || 0), 0)
    return Math.round((totalMinutes / 60) * 10) / 10
  }

  const addTeamMember = async (name: string, email: string, role: string, type: 'employee' | 'contractor') => {
    const newMember: TeamMember = {
      id: `member-${Date.now()}`,
      name,
      email,
      role,
      type,
      businessId: 'temp-business-id',
      userId: 'temp-user-id',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    const updatedMembers = [...teamMembers, newMember]
    setTeamMembers(updatedMembers)

    // Save to localStorage as cache
    localStorage.setItem('team_members', JSON.stringify(updatedMembers))

    // Try to save to database
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return // Not logged in, localStorage only
      if (!businessId) return // No businessId available

      // Get current key_roles
      const { data: profile, error: profileError } = await supabase
        .from('business_profiles')
        .select('key_roles')
        .eq('id', businessId)
        .single()

      if (profileError) {
        console.error('[90-Day Sprint] Error loading profile for team member save:', profileError)
        return
      }

      const currentRoles = profile?.key_roles || []

      // Add new role
      const updatedRoles = [
        ...currentRoles,
        { name, email, role, type }
      ]

      // Update database
      const { error: updateError } = await supabase
        .from('business_profiles')
        .update({ key_roles: updatedRoles })
        .eq('id', businessId)

      if (updateError) {
        console.error('[90-Day Sprint] Error updating team members:', updateError)
      }

    } catch (error) {
      console.error('Error saving team member to database:', error)
      // Already saved to localStorage, so member is still accessible
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Initiatives & Projects</h3>
          <p className="text-sm text-gray-600">
            Break down strategic initiatives and major projects into actionable tasks with clear ownership and deadlines.
          </p>
        </div>
        <button
          onClick={() => setShowAddInitiative(true)}
          disabled={!canAddMoreInitiatives}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            canAddMoreInitiatives
              ? 'bg-[#4C5D75] text-white hover:bg-[#3E3F57]'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          <Plus className="w-5 h-5" />
          Add New
        </button>
      </div>

      {/* Validation Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={`p-4 rounded-lg border-2 ${
          initiatives.length <= 5 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-center gap-2">
            {initiatives.length <= 5 ? (
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600" />
            )}
            <div>
              <div className="font-semibold text-sm text-gray-900">
                {initiatives.length} / 5 Items
              </div>
              <div className="text-xs text-gray-600">Max 5 initiatives/projects per quarter</div>
            </div>
          </div>
        </div>

        <div className="p-4 bg-slate-50 border-2 border-slate-200 rounded-lg">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-[#4C5D75]" />
            <div>
              <div className="font-semibold text-sm text-gray-900">
                {allTeamMembers.length} Team Members
              </div>
              <div className="text-xs text-gray-600">Employees & contractors available</div>
            </div>
          </div>
        </div>
      </div>

      {/* Initiatives List */}
      {initiatives.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 rounded-lg border-2 border-dashed border-slate-300">
          <Flag className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <h4 className="text-lg font-semibold text-gray-900 mb-2">No Initiatives or Projects Yet</h4>
          <p className="text-sm text-gray-600 mb-4">
            Add your first initiative or project to get started with execution planning.
          </p>
          <button
            onClick={() => setShowAddInitiative(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#4C5D75] text-white rounded-lg hover:bg-[#3E3F57] font-medium"
          >
            <Plus className="w-5 h-5" />
            Add First Item
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {initiatives.map((initiative, index) => (
            <InitiativeCard
              key={initiative.id}
              initiative={initiative}
              index={index}
              isExpanded={expandedInitiative === initiative.id}
              onToggle={() => toggleInitiative(initiative.id)}
              onUpdate={(updates) => updateInitiative(initiative.id, updates)}
              onDelete={() => deleteInitiative(initiative.id)}
              onAddTask={() => addTask(initiative.id)}
              onUpdateTask={(taskId, updates) => updateTask(initiative.id, taskId, updates)}
              onDeleteTask={(taskId) => deleteTask(initiative.id, taskId)}
              teamMembers={allTeamMembers}
              getMemberById={getMemberById}
              showAssignmentFor={showAssignmentFor}
              setShowAssignmentFor={setShowAssignmentFor}
              onAssignPerson={handleAssignPerson}
              initiativesPerPerson={initiativesPerPerson}
              onAddTeamMember={() => setShowAddTeamMember(true)}
            />
          ))}
        </div>
      )}

      {/* Add Initiative Modal */}
      {showAddInitiative && (
        <AddInitiativeModal
          onClose={() => setShowAddInitiative(false)}
          onAdd={addInitiative}
        />
      )}

      {/* Add Team Member Modal */}
      {showAddTeamMember && (
        <AddTeamMemberModal
          onClose={() => setShowAddTeamMember(false)}
          onAdd={addTeamMember}
        />
      )}
    </div>
  )
}

// =============================================================================
// INITIATIVE CARD COMPONENT
// =============================================================================

interface InitiativeCardProps {
  initiative: InitiativeWithTasks
  index: number
  isExpanded: boolean
  onToggle: () => void
  onUpdate: (updates: Partial<InitiativeWithTasks>) => void
  onDelete: () => void
  onAddTask: () => void
  onUpdateTask: (taskId: string, updates: Partial<InitiativeTask>) => void
  onDeleteTask: (taskId: string) => void
  teamMembers: TeamMember[]
  getMemberById: (id: string) => TeamMember | undefined
  showAssignmentFor: string | null
  setShowAssignmentFor: (id: string | null) => void
  onAssignPerson: (initiativeId: string, personId: string) => void
  initiativesPerPerson: Record<string, number>
  onAddTeamMember: () => void
}

function InitiativeCard({
  initiative,
  index,
  isExpanded,
  onToggle,
  onUpdate,
  onDelete,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
  teamMembers,
  getMemberById,
  showAssignmentFor,
  setShowAssignmentFor,
  onAssignPerson,
  initiativesPerPerson,
  onAddTeamMember
}: InitiativeCardProps) {
  const taskCount = initiative.tasks?.length || 0
  const completedTasks = initiative.tasks?.filter(t => t.status === 'done').length || 0
  const progress = taskCount > 0 ? Math.round((completedTasks / taskCount) * 100) : 0
  const isUserIdea = initiative.source === 'strategic_ideas'
  const categoryInfo = getCategoryStyle(initiative.category)

  const canAssignMore = (personName: string) => {
    return (initiativesPerPerson[personName] || 0) < 3
  }

  return (
    <div className="border-2 border-gray-200 rounded-lg overflow-hidden bg-white">
      {/* Card Header */}
      <div
        onClick={onToggle}
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-[#4C5D75]/5 hover:border-[#4C5D75]/40 transition-all"
      >
        <div className="flex items-center gap-3 flex-1">
          {/* Drag Handle (visual only for now) */}
          <GripVertical className="w-4 h-4 text-gray-400 flex-shrink-0" />

          {/* Priority Number */}
          <div className="flex items-center justify-center w-7 h-7 bg-[#4C5D75] text-white rounded-full text-sm font-bold flex-shrink-0">
            {index + 1}
          </div>

          {/* Category Emoji */}
          <span className="text-lg flex-shrink-0" title={categoryInfo.label}>
            {categoryInfo.emoji}
          </span>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-gray-900 leading-tight">{initiative.title}</h4>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className={`inline-block px-2 py-0.5 text-[10px] rounded font-semibold ${
                isUserIdea
                  ? 'bg-[#3E3F57] text-white'
                  : 'bg-[#4C5D75]/85 text-white'
              }`}>
                {isUserIdea ? 'YOUR IDEA' : 'ROADMAP'}
              </span>
              <span className={`text-xs ${categoryInfo.textColor} font-medium`}>
                {categoryInfo.shortLabel}
              </span>
              {taskCount > 0 && (
                <>
                  <span className="text-gray-300">•</span>
                  <span className="text-xs text-gray-600">
                    {taskCount} {taskCount === 1 ? 'task' : 'tasks'}
                  </span>
                </>
              )}
              {initiative.totalHours && initiative.totalHours > 0 && (
                <>
                  <span className="text-gray-300">•</span>
                  <span className="text-xs text-gray-600">
                    {initiative.totalHours} hours
                  </span>
                </>
              )}
              {(() => {
                if (!initiative.assignedTo) return null
                const ownerMember = getMemberById(initiative.assignedTo)
                if (!ownerMember) return null
                return (
                  <>
                    <span className="text-gray-300">•</span>
                    <span className="text-xs text-gray-600">
                      Owner: {ownerMember.name}
                    </span>
                  </>
                )
              })()}
            </div>
          </div>

          {/* Progress Bar */}
          {taskCount > 0 && (
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#7BA082] transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-sm font-medium text-gray-700">{progress}%</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 ml-4 flex-shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            className="p-1 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </div>

      {/* Card Content */}
      {isExpanded && (
        <div className="border-t border-slate-200 p-6 bg-slate-50 space-y-6">
          {/* Project Plan Header */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Why are we doing this now?
              </label>
              <textarea
                value={initiative.why || ''}
                onChange={(e) => onUpdate({ why: e.target.value })}
                placeholder="Explain the strategic reason for this initiative..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4C5D75]"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                What outcome are we looking for?
              </label>
              <textarea
                value={initiative.outcome || ''}
                onChange={(e) => onUpdate({ outcome: e.target.value })}
                placeholder="Define the expected result or success criteria..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4C5D75]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Start Date
              </label>
              <input
                type="date"
                value={initiative.startDate || ''}
                onChange={(e) => onUpdate({ startDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4C5D75]"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                End Date
              </label>
              <input
                type="date"
                value={initiative.endDate || ''}
                onChange={(e) => onUpdate({ endDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4C5D75]"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Initiative Owner
              </label>
              <div className="relative">
                {(() => {
                  const assignedMember = initiative.assignedTo ? getMemberById(initiative.assignedTo) : null
                  const isShowingAssignment = showAssignmentFor === `init-${initiative.id}`

                  return (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setShowAssignmentFor(isShowingAssignment ? null : `init-${initiative.id}`)
                        }}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        {assignedMember ? (
                          <>
                            <div className={`w-6 h-6 rounded-full ${assignedMember.color} flex items-center justify-center flex-shrink-0`}>
                              <span className="text-white text-xs font-bold">{assignedMember.initials}</span>
                            </div>
                            <span className="text-sm font-medium text-slate-900 flex-1 text-left">{assignedMember.name}</span>
                          </>
                        ) : (
                          <>
                            <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                              <UserPlus className="w-3.5 h-3.5 text-slate-400" />
                            </div>
                            <span className="text-sm text-slate-500 flex-1 text-left">Assign to...</span>
                          </>
                        )}
                        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isShowingAssignment ? 'rotate-180' : ''}`} />
                      </button>

                      {isShowingAssignment && (
                        <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-10 max-h-80 overflow-y-auto min-w-full">
                          {teamMembers.map(member => {
                            const count = initiativesPerPerson[member.id] || 0
                            const isOverLimit = count >= 3 && initiative.assignedTo !== member.id
                            const typeLabel = member.type === 'contractor' ? ' (Contractor)' : ''

                            return (
                              <button
                                key={member.id}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (!isOverLimit) {
                                    onAssignPerson(initiative.id, member.id)
                                  }
                                }}
                                disabled={isOverLimit}
                                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-b-0 ${
                                  isOverLimit ? 'opacity-50 cursor-not-allowed' : ''
                                }`}
                              >
                                <div className={`w-8 h-8 rounded-full ${member.color} flex items-center justify-center flex-shrink-0`}>
                                  <span className="text-white text-sm font-bold">{member.initials}</span>
                                </div>
                                <div className="flex-1 text-left">
                                  <div className="text-sm font-medium text-slate-900">
                                    {member.name}{typeLabel}
                                  </div>
                                  <div className="text-xs text-slate-500">{member.role}</div>
                                </div>
                                {count > 0 && (
                                  <div className="text-xs text-slate-500">
                                    {count} {isOverLimit ? '(Max reached)' : ''}
                                  </div>
                                )}
                              </button>
                            )
                          })}
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setShowAssignmentFor(null)
                              onAddTeamMember()
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-[#4C5D75] hover:bg-slate-50 transition-colors font-medium"
                          >
                            <Plus className="w-5 h-5" />
                            Add New Person...
                          </button>
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>
            </div>
          </div>

          {/* Milestones Section */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h5 className="text-lg font-bold text-gray-900">Key Milestones</h5>
              <button
                onClick={() => {
                  const newMilestone: ProjectMilestone = {
                    id: `milestone-${Date.now()}`,
                    description: '',
                    targetDate: '',
                    isCompleted: false
                  }
                  onUpdate({
                    milestones: [...(initiative.milestones || []), newMilestone]
                  })
                }}
                className="flex items-center gap-2 px-3 py-2 bg-[#7BA082] text-white rounded-lg hover:bg-[#6A8F71] text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                Add Milestone
              </button>
            </div>

            {(initiative.milestones || []).length === 0 ? (
              <div className="text-center py-6 bg-white rounded-lg border-2 border-dashed border-slate-300">
                <p className="text-sm text-gray-600 mb-3">No milestones yet. Add key checkpoints to track progress.</p>
                <button
                  onClick={() => {
                    const newMilestone: ProjectMilestone = {
                      id: `milestone-${Date.now()}`,
                      description: '',
                      targetDate: '',
                      isCompleted: false
                    }
                    onUpdate({
                      milestones: [...(initiative.milestones || []), newMilestone]
                    })
                  }}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-[#7BA082] text-white rounded-lg hover:bg-[#6A8F71] text-sm font-medium"
                >
                  <Plus className="w-4 h-4" />
                  Add First Milestone
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {(initiative.milestones || []).map((milestone, idx) => (
                  <div key={milestone.id} className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200">
                    <input
                      type="checkbox"
                      checked={milestone.isCompleted}
                      onChange={(e) => {
                        const updatedMilestones = (initiative.milestones || []).map(m =>
                          m.id === milestone.id ? { ...m, isCompleted: e.target.checked } : m
                        )
                        onUpdate({ milestones: updatedMilestones })
                      }}
                      className="w-5 h-5 text-[#7BA082] rounded focus:ring-[#7BA082]"
                    />
                    <input
                      type="text"
                      value={milestone.description}
                      onChange={(e) => {
                        const updatedMilestones = (initiative.milestones || []).map(m =>
                          m.id === milestone.id ? { ...m, description: e.target.value } : m
                        )
                        onUpdate({ milestones: updatedMilestones })
                      }}
                      placeholder="Milestone description..."
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7BA082]"
                    />
                    <input
                      type="date"
                      value={milestone.targetDate}
                      onChange={(e) => {
                        const updatedMilestones = (initiative.milestones || []).map(m =>
                          m.id === milestone.id ? { ...m, targetDate: e.target.value } : m
                        )
                        onUpdate({ milestones: updatedMilestones })
                      }}
                      className="w-40 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7BA082]"
                    />
                    <button
                      onClick={() => {
                        const updatedMilestones = (initiative.milestones || []).filter(m => m.id !== milestone.id)
                        onUpdate({ milestones: updatedMilestones })
                      }}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Task Table */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h5 className="text-lg font-bold text-gray-900">Task Breakdown</h5>
              <button
                onClick={onAddTask}
                className="flex items-center gap-2 px-3 py-2 bg-[#4C5D75] text-white rounded-lg hover:bg-[#3E3F57] text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                Add Task
              </button>
            </div>

            {taskCount === 0 ? (
              <div className="text-center py-8 bg-white rounded-lg border-2 border-dashed border-slate-300">
                <p className="text-sm text-gray-600 mb-3">No tasks yet. Break down this initiative into specific actions.</p>
                <button
                  onClick={onAddTask}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-[#4C5D75] text-white rounded-lg hover:bg-[#3E3F57] text-sm font-medium"
                >
                  <Plus className="w-4 h-4" />
                  Add First Task
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse bg-white rounded-lg overflow-hidden">
                  <thead>
                    <tr className="bg-[#4C5D75] text-white">
                      <th className="px-4 py-3 text-left text-sm font-semibold">Task</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold w-48">Assigned To</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold w-32">Minutes</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold w-40">Due Date</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold w-36">Status</th>
                      <th className="px-4 py-3 text-center text-sm font-semibold w-20">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {(initiative.tasks || []).map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        teamMembers={teamMembers}
                        onUpdate={(updates) => onUpdateTask(task.id, updates)}
                        onDelete={() => onDeleteTask(task.id)}
                        onAddTeamMember={onAddTeamMember}
                      />
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 border-t-2 border-[#4C5D75]">
                      <td colSpan={2} className="px-4 py-3 text-right font-bold text-gray-900">
                        Total Time:
                      </td>
                      <td colSpan={4} className="px-4 py-3 font-bold text-[#4C5D75]">
                        {initiative.totalHours?.toFixed(1) || '0.0'} hours
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// TASK ROW COMPONENT
// =============================================================================

interface TaskRowProps {
  task: InitiativeTask
  teamMembers: TeamMember[]
  onUpdate: (updates: Partial<InitiativeTask>) => void
  onDelete: () => void
  onAddTeamMember: () => void
}

function TaskRow({ task, teamMembers, onUpdate, onDelete, onAddTeamMember }: TaskRowProps) {
  const getStatusColor = (status: TaskStatus) => {
    switch (status) {
      case 'not_started':
        return 'bg-[#B85450]/10 text-[#B85450] border-[#B85450]/30'
      case 'in_progress':
        return 'bg-[#948687]/15 text-[#948687] border-[#948687]/40'
      case 'done':
        return 'bg-[#7BA082]/10 text-[#7BA082] border-[#7BA082]/30'
      default:
        return 'bg-gray-100 text-gray-600 border-gray-300'
    }
  }

  const getStatusLabel = (status: TaskStatus) => {
    switch (status) {
      case 'not_started': return 'Not Started'
      case 'in_progress': return 'In Progress'
      case 'done': return 'Done'
      default: return status
    }
  }

  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-3">
        <input
          type="text"
          value={task.task}
          onChange={(e) => onUpdate({ task: e.target.value })}
          placeholder="Enter task description..."
          className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#4C5D75] text-sm"
        />
      </td>
      <td className="px-4 py-3">
        <select
          value={task.assignedTo}
          onChange={(e) => {
            if (e.target.value === '__add_new__') {
              onAddTeamMember()
            } else {
              onUpdate({ assignedTo: e.target.value })
            }
          }}
          className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#4C5D75] text-sm"
        >
          <option value="">Select person...</option>
          {teamMembers.map(member => {
            const typeLabel = member.type === 'contractor' ? ' (Contractor)' : ''
            return (
              <option key={member.id} value={member.name}>{member.name}{typeLabel}</option>
            )
          })}
          <option value="__add_new__">+ Add Team Member</option>
        </select>
      </td>
      <td className="px-4 py-3">
        <input
          type="number"
          value={task.minutesAllocated || ''}
          onChange={(e) => onUpdate({ minutesAllocated: parseInt(e.target.value) || 0 })}
          placeholder="0"
          className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#4C5D75] text-sm"
        />
      </td>
      <td className="px-4 py-3">
        <input
          type="date"
          value={task.dueDate}
          onChange={(e) => onUpdate({ dueDate: e.target.value })}
          className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#4C5D75] text-sm"
        />
      </td>
      <td className="px-4 py-3">
        <select
          value={task.status}
          onChange={(e) => onUpdate({ status: e.target.value as TaskStatus })}
          className={`w-full px-2 py-1 border rounded text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#4C5D75] ${getStatusColor(task.status)}`}
        >
          <option value="not_started">Not Started</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
        </select>
      </td>
      <td className="px-4 py-3 text-center">
        <button
          onClick={onDelete}
          className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </td>
    </tr>
  )
}

// =============================================================================
// ADD INITIATIVE MODAL
// =============================================================================

interface AddInitiativeModalProps {
  onClose: () => void
  onAdd: (title: string) => void
}

function AddInitiativeModal({ onClose, onAdd }: AddInitiativeModalProps) {
  const [title, setTitle] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (title.trim()) {
      onAdd(title.trim())
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Add Initiative or Project</h3>
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Launch new website, Implement CRM system, Q1 Marketing Campaign"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4C5D75]"
                autoFocus
              />
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!title.trim()}
                className="px-4 py-2 bg-[#4C5D75] text-white rounded-lg hover:bg-[#3E3F57] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// ADD TEAM MEMBER MODAL
// =============================================================================

interface AddTeamMemberModalProps {
  onClose: () => void
  onAdd: (name: string, email: string, role: string, type: 'employee' | 'contractor') => void
}

function AddTeamMemberModal({ onClose, onAdd }: AddTeamMemberModalProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [type, setType] = useState<'employee' | 'contractor'>('employee')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim()) {
      onAdd(name.trim(), email.trim(), role.trim(), type)
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Add Team Member</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Full Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Smith"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4C5D75]"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@company.com"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4C5D75]"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Role
              </label>
              <input
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g., Marketing Manager, Developer"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4C5D75]"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Type *
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setType('employee')}
                  className={`px-4 py-3 rounded-lg border-2 transition-colors ${
                    type === 'employee'
                      ? 'border-[#4C5D75] bg-slate-50 text-[#4C5D75] font-semibold'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                  }`}
                >
                  Employee
                </button>
                <button
                  type="button"
                  onClick={() => setType('contractor')}
                  className={`px-4 py-3 rounded-lg border-2 transition-colors ${
                    type === 'contractor'
                      ? 'border-[#4C5D75] bg-slate-50 text-[#4C5D75] font-semibold'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                  }`}
                >
                  Contractor
                </button>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-4 border-t">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!name.trim()}
                className="px-4 py-2 bg-[#4C5D75] text-white rounded-lg hover:bg-[#3E3F57] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Team Member
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// OPERATIONAL PLAN TAB
// =============================================================================

interface OperationalActivity {
  id: string
  function: string
  description: string
  assignedTo?: string
}

const BUSINESS_FUNCTIONS = [
  { id: 'marketing', name: 'Marketing', icon: '📢' },
  { id: 'sales', name: 'Sales', icon: '💼' },
  { id: 'people', name: 'People/Team', icon: '👥' },
  { id: 'systems', name: 'Systems/Operations', icon: '⚙️' },
  { id: 'finance', name: 'Finance', icon: '💰' },
  { id: 'delivery', name: 'Service Delivery', icon: '🎯' }
] as const

interface OperationalPlanTabProps {
  operationalActivities?: OperationalActivity[]
  setOperationalActivities?: (activities: OperationalActivity[]) => void
}

function OperationalPlanTab({
  operationalActivities: activitiesProp,
  setOperationalActivities: setActivitiesProp
}: OperationalPlanTabProps) {
  // Use prop state if provided, otherwise fall back to local state
  const [localActivities, setLocalActivities] = useState<OperationalActivity[]>([])
  const activities = activitiesProp || localActivities
  const setActivities = setActivitiesProp || setLocalActivities

  const [editingId, setEditingId] = useState<string | null>(null)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [showAssignmentFor, setShowAssignmentFor] = useState<string | null>(null)
  const [showAddNewPerson, setShowAddNewPerson] = useState(false)
  const [newPersonName, setNewPersonName] = useState('')
  const [newPersonRole, setNewPersonRole] = useState('')
  const [newPersonType, setNewPersonType] = useState<'employee' | 'contractor'>('employee')
  const [isSavingNewPerson, setIsSavingNewPerson] = useState(false)
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null)
  const assignButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

  // Load team members from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('team_members')
    if (stored) {
      try {
        const members = JSON.parse(stored)
        setTeamMembers(members)
      } catch (e) {
        console.error('Failed to load team members')
      }
    }
  }, [])

  const addActivity = (functionId: string) => {
    const newActivity: OperationalActivity = {
      id: `activity-${Date.now()}`,
      function: functionId,
      description: '',
      assignedTo: undefined
    }
    setActivities([...activities, newActivity])
    setEditingId(newActivity.id)
  }

  const updateActivity = (id: string, updates: Partial<OperationalActivity>) => {
    setActivities(activities.map(a => a.id === id ? { ...a, ...updates } : a))
  }

  const deleteActivity = (id: string) => {
    setActivities(activities.filter(a => a.id !== id))
  }

  const getActivitiesForFunction = (functionId: string) => {
    return activities.filter(a => a.function === functionId)
  }

  const handleAddTeamMember = (activityId: string) => {
    if (!newPersonName.trim()) return

    setIsSavingNewPerson(true)

    try {
      // Use shared utilities for color and initials
      const name = newPersonName.trim()
      const color = getColorForName(name)
      const initials = getInitials(name)

      const newMember: TeamMember = {
        id: `role-${Date.now()}`,
        name,
        role: newPersonRole.trim() || undefined,
        type: newPersonType,
        initials,
        color
      }

      const updatedMembers = [...teamMembers, newMember]
      setTeamMembers(updatedMembers)

      // Save to localStorage
      localStorage.setItem('team_members', JSON.stringify(updatedMembers))

      // Assign to the activity
      updateActivity(activityId, { assignedTo: newMember.id })

      // Reset form
      setNewPersonName('')
      setNewPersonRole('')
      setNewPersonType('employee')
      setShowAddNewPerson(false)
      setShowAssignmentFor(null)
    } catch (error) {
      console.error('Failed to add team member:', error)
    } finally {
      setIsSavingNewPerson(false)
    }
  }

  const handleAssignPerson = (activityId: string, memberId: string) => {
    updateActivity(activityId, { assignedTo: memberId })
    setShowAssignmentFor(null)
  }

  const getMemberById = (id: string) => teamMembers.find(m => m.id === id)

  const deleteTeamMember = (memberId: string) => {
    const updatedMembers = teamMembers.filter(m => m.id !== memberId)
    setTeamMembers(updatedMembers)
    localStorage.setItem('team_members', JSON.stringify(updatedMembers))

    // Unassign any activities assigned to this member
    setActivities(activities.map(a =>
      a.assignedTo === memberId ? { ...a, assignedTo: undefined } : a
    ))
  }

  return (
    <div className="space-y-6 overflow-visible">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-700 to-slate-800 rounded-lg p-6 text-white">
        <div className="flex items-center gap-3 mb-2">
          <Briefcase className="w-6 h-6" />
          <h2 className="text-2xl font-bold">Operational Plan</h2>
        </div>
        <p className="text-slate-300">
          Regular business activities that keep each function moving forward (not strategic projects)
        </p>
      </div>

      {/* Business Functions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 overflow-visible">
        {BUSINESS_FUNCTIONS.map((func) => {
          const functionActivities = getActivitiesForFunction(func.id)

          return (
            <div key={func.id} className="bg-white rounded-lg border-2 border-gray-200 overflow-visible">
              {/* Function Header */}
              <div className="bg-teal-50 border-b-2 border-teal-200 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{func.icon}</span>
                    <h3 className="text-lg font-bold text-teal-900">{func.name}</h3>
                    <span className="text-sm text-gray-500">({functionActivities.length})</span>
                  </div>
                  <button
                    onClick={() => addActivity(func.id)}
                    className="px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm font-medium flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    Add
                  </button>
                </div>
              </div>

              {/* Activities List */}
              <div className="p-4 space-y-2 overflow-visible">
                {functionActivities.length === 0 ? (
                  <p className="text-center text-gray-500 py-8 text-sm">
                    No operational activities yet. Click "Add Activity" to get started.
                  </p>
                ) : (
                  functionActivities.map((activity) => (
                    <div
                      key={activity.id}
                      className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors overflow-visible"
                    >
                      {/* Description */}
                      <div className="flex-1">
                        {editingId === activity.id ? (
                          <input
                            type="text"
                            value={activity.description}
                            onChange={(e) => updateActivity(activity.id, { description: e.target.value })}
                            onBlur={() => setEditingId(null)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') setEditingId(null)
                              if (e.key === 'Escape') setEditingId(null)
                            }}
                            autoFocus
                            placeholder="Enter activity description..."
                            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                          />
                        ) : (
                          <div
                            onClick={() => setEditingId(activity.id)}
                            className="cursor-pointer"
                          >
                            {activity.description || (
                              <span className="text-gray-400 italic">Click to add description...</span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Assigned To */}
                      <div className="w-36 relative">
                        {(() => {
                          const assignedMember = activity.assignedTo ? getMemberById(activity.assignedTo) : null
                          const isShowingAssignment = showAssignmentFor === activity.id

                          return (
                            <>
                              <button
                                ref={(el) => {
                                  if (el) assignButtonRefs.current.set(activity.id, el)
                                }}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (!isShowingAssignment) {
                                    // Calculate position
                                    const button = assignButtonRefs.current.get(activity.id)
                                    if (button) {
                                      const rect = button.getBoundingClientRect()
                                      setDropdownPosition({
                                        top: rect.bottom + 4,
                                        left: rect.left
                                      })
                                    }
                                    setShowAssignmentFor(activity.id)
                                    setShowAddNewPerson(false)
                                    setNewPersonName('')
                                    setNewPersonRole('')
                                    setNewPersonType('employee')
                                  } else {
                                    setShowAssignmentFor(null)
                                    setDropdownPosition(null)
                                  }
                                }}
                                className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                                  assignedMember
                                    ? 'border-teal-200 bg-teal-50 hover:bg-teal-100'
                                    : 'border-gray-300 bg-white hover:bg-gray-50'
                                }`}
                              >
                                {assignedMember ? (
                                  <>
                                    <div className={`w-5 h-5 rounded-full ${assignedMember.color} flex items-center justify-center flex-shrink-0`}>
                                      <span className="text-white text-xs font-bold">{assignedMember.initials}</span>
                                    </div>
                                    <span className="text-xs font-medium text-gray-900 flex-1 text-left truncate">{assignedMember.name}</span>
                                  </>
                                ) : (
                                  <>
                                    <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                                      <UserPlus className="w-3 h-3 text-gray-400" />
                                    </div>
                                    <span className="text-xs text-gray-500 flex-1 text-left">Assign to...</span>
                                  </>
                                )}
                                <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${isShowingAssignment ? 'rotate-180' : ''}`} />
                              </button>

                              {/* Dropdown Menu */}
                              {isShowingAssignment && dropdownPosition && (
                                <div
                                  className="fixed bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] min-w-[280px]"
                                  style={{
                                    top: `${dropdownPosition.top}px`,
                                    left: `${dropdownPosition.left}px`
                                  }}
                                >
                                  {/* Scrollable Team Members List */}
                                  <div className="max-h-[250px] overflow-y-auto">
                                    {teamMembers.map(member => {
                                      const isCurrentlyAssigned = activity.assignedTo === member.id

                                      return (
                                        <button
                                          key={member.id}
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleAssignPerson(activity.id, member.id)
                                          }}
                                          className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors ${
                                            isCurrentlyAssigned ? 'bg-teal-50' : ''
                                          }`}
                                        >
                                          <div className={`w-8 h-8 rounded-full ${member.color} flex items-center justify-center flex-shrink-0`}>
                                            <span className="text-white text-sm font-bold">{member.initials}</span>
                                          </div>
                                          <div className="flex-1">
                                            <p className="text-sm font-medium text-gray-900">{member.name}</p>
                                            {member.role && (
                                              <p className="text-xs text-gray-500">{member.role}</p>
                                            )}
                                          </div>
                                          {isCurrentlyAssigned && (
                                            <CheckCircle2 className="w-5 h-5 text-teal-600" />
                                          )}
                                        </button>
                                      )
                                    })}
                                  </div>

                                  {/* Separator */}
                                  {teamMembers.length > 0 && (
                                    <div className="border-t border-gray-200"></div>
                                  )}

                                  {/* Add New Person Option */}
                                  {!showAddNewPerson ? (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setShowAddNewPerson(true)
                                      }}
                                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-teal-50 transition-colors text-teal-600"
                                    >
                                      <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
                                        <UserPlus className="w-4 h-4 text-teal-600" />
                                      </div>
                                      <p className="text-sm font-medium">Add New Person...</p>
                                    </button>
                                  ) : (
                                    <div className="p-4 bg-gray-50 border-t border-gray-200" onClick={(e) => e.stopPropagation()}>
                                      <p className="text-sm font-semibold text-gray-900 mb-3">Add New Team Member</p>
                                      <input
                                        type="text"
                                        value={newPersonName}
                                        onChange={(e) => setNewPersonName(e.target.value)}
                                        placeholder="Full name"
                                        className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg mb-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
                                        autoFocus
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                      <div className="mb-2">
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
                                        <div className="flex gap-2">
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              setNewPersonType('employee')
                                            }}
                                            className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                                              newPersonType === 'employee'
                                                ? 'bg-teal-600 text-white border-teal-600'
                                                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                                            }`}
                                          >
                                            Employee
                                          </button>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              setNewPersonType('contractor')
                                            }}
                                            className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                                              newPersonType === 'contractor'
                                                ? 'bg-teal-600 text-white border-teal-600'
                                                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                                            }`}
                                          >
                                            Contractor
                                          </button>
                                        </div>
                                      </div>
                                      <input
                                        type="text"
                                        value={newPersonRole}
                                        onChange={(e) => setNewPersonRole(e.target.value)}
                                        placeholder="Role/Title (optional)"
                                        className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg mb-3 focus:outline-none focus:ring-2 focus:ring-teal-500"
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                      <div className="flex items-center gap-2">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleAddTeamMember(activity.id)
                                          }}
                                          disabled={isSavingNewPerson || !newPersonName.trim()}
                                          className="flex-1 px-4 py-2.5 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                          {isSavingNewPerson ? 'Saving...' : 'Add & Assign'}
                                        </button>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            setShowAddNewPerson(false)
                                            setNewPersonName('')
                                            setNewPersonRole('')
                                            setNewPersonType('employee')
                                          }}
                                          className="px-4 py-2.5 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </>
                          )
                        })()}
                      </div>

                      {/* Delete Button */}
                      <button
                        onClick={() => deleteActivity(activity.id)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete activity"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
