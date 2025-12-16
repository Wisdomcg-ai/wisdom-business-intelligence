'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import {
  Target, Calendar, Briefcase, Users, Plus, Trash2, Edit2, ChevronDown, ChevronUp,
  Clock, CheckCircle2, AlertCircle, Flag, TrendingUp, GripVertical, UserPlus, X, Check,
  Settings
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
import OperationalPlanTab from './OperationalPlanTab'
import { OperationalActivity } from '../services/operational-activities-service'

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
  strategicIdeas?: StrategicInitiative[] // For pulling operational ideas from Step 2
  setStrategicIdeas?: (ideas: StrategicInitiative[]) => void // For editing ideas from Step 5
  // Completion tracking
  planningQuarterLabel?: string
  planningQuarterInitiatives?: number
  hasOperationalActivities?: boolean
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
  setOperationalActivities,
  strategicIdeas,
  setStrategicIdeas,
  planningQuarterLabel = 'Q3',
  planningQuarterInitiatives = 0,
  hasOperationalActivities = false
}: Step5Props) {
  const [activeTab, setActiveTab] = useState<'monthly' | 'initiatives' | 'operational'>('initiatives')
  const [showAdvancedMode, setShowAdvancedMode] = useState(false)

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

    // Helper to distribute a quarterly value across 3 months so the sum equals the quarterly exactly
    const distributeAcrossMonths = (quarterlyValue: number): [number, number, number] => {
      if (!quarterlyValue || quarterlyValue === 0) return [0, 0, 0]
      const month1 = Math.floor(quarterlyValue / 3)
      const month2 = Math.floor(quarterlyValue / 3)
      const month3 = quarterlyValue - month1 - month2 // Gets remainder to ensure exact sum
      return [month1, month2, month3]
    }

    // Only initialize if we have values and current state is all zeros
    if (quarterRevenue > 0 && monthlyTargets.month1.revenue === 0) {
      const [rev1, rev2, rev3] = distributeAcrossMonths(quarterRevenue)
      const [gp1, gp2, gp3] = distributeAcrossMonths(quarterGrossProfit)
      const [np1, np2, np3] = distributeAcrossMonths(quarterNetProfit)
      const [cust1, cust2, cust3] = distributeAcrossMonths(quarterCustomers)

      setMonthlyTargets({
        month1: {
          revenue: rev1,
          grossProfit: gp1,
          grossMargin: 0, // Will be auto-calculated
          netProfit: np1,
          netMargin: 0, // Will be auto-calculated
          customers: cust1,
          employees: Math.round(quarterEmployees)
        },
        month2: {
          revenue: rev2,
          grossProfit: gp2,
          grossMargin: 0, // Will be auto-calculated
          netProfit: np2,
          netMargin: 0, // Will be auto-calculated
          customers: cust2,
          employees: Math.round(quarterEmployees)
        },
        month3: {
          revenue: rev3,
          grossProfit: gp3,
          grossMargin: 0, // Will be auto-calculated
          netProfit: np3,
          netMargin: 0, // Will be auto-calculated
          customers: cust3,
          employees: Math.round(quarterEmployees)
        }
      })
    }
  }, [currentQuarterKey, quarterlyTargets])

  // Initiatives State (from current quarter + enhancements)
  // Preserve any extended data (milestones, tasks, etc.) that was loaded from database
  const [initiatives, setInitiatives] = useState<InitiativeWithTasks[]>(() => {
    const currentQuarterInitiatives = annualPlanByQuarter[currentQuarterKey] || []
    return currentQuarterInitiatives.map(init => {
      const extendedInit = init as any // TypeScript workaround
      return {
        ...init,
        // Preserve data from database, only default to empty if not present
        why: extendedInit.why || '',
        outcome: extendedInit.outcome || '',
        startDate: extendedInit.startDate || '',
        endDate: extendedInit.endDate || '',
        milestones: extendedInit.milestones || [],
        tasks: extendedInit.tasks || [],
        totalHours: extendedInit.totalHours || 0
      }
    })
  })

  // Team Members State
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])

  // Tab configuration with enhanced styling (must be after initiatives state)
  // Filter tabs based on advanced mode - monthly tab is hidden by default
  const tabs = useMemo(() => {
    const allTabs = [
      {
        id: 'monthly',
        label: 'Monthly Breakdown',
        icon: Calendar,
        description: 'Break down quarterly targets into monthly goals',
        color: 'from-slate-600 to-slate-700',
        bgColor: 'bg-gray-50',
        borderColor: 'border-slate-500',
        textColor: 'text-gray-700',
        advancedOnly: true
      },
      {
        id: 'initiatives',
        label: 'Initiatives & Projects',
        icon: Flag,
        badge: initiatives.length,
        description: 'Plan and track strategic initiatives',
        color: 'from-brand-orange to-brand-orange-700',
        bgColor: 'bg-brand-orange-50',
        borderColor: 'border-brand-orange-500',
        textColor: 'text-brand-orange-700',
        advancedOnly: false
      },
      {
        id: 'operational',
        label: 'Operational Plan',
        icon: Briefcase,
        description: 'Weekly execution and accountability',
        color: 'from-slate-600 to-slate-700',
        bgColor: 'bg-gray-50',
        borderColor: 'border-slate-500',
        textColor: 'text-gray-700',
        advancedOnly: false
      }
    ]

    // Filter out advanced-only tabs when not in advanced mode
    return showAdvancedMode ? allTabs : allTabs.filter(tab => !tab.advancedOnly)
  }, [initiatives.length, showAdvancedMode])

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
            // New initiative from Annual Plan - preserve any extended data from database
            const extendedInit = annualInit as any
            return {
              ...annualInit,
              why: extendedInit.why || '',
              outcome: extendedInit.outcome || '',
              startDate: extendedInit.startDate || '',
              endDate: extendedInit.endDate || '',
              milestones: extendedInit.milestones || [],
              tasks: extendedInit.tasks || [],
              totalHours: extendedInit.totalHours || 0
            }
          }
        })
      }

      // If same length, check if any IDs are different
      const annualIds = currentQuarterInitiatives.map(i => i.id).sort().join(',')
      const localIds = prevInitiatives.map(i => i.id).sort().join(',')

      if (annualIds !== localIds) {
        return currentQuarterInitiatives.map(annualInit => {
          const extendedInit = annualInit as any
          return {
            ...annualInit,
            why: extendedInit.why || '',
            outcome: extendedInit.outcome || '',
            startDate: extendedInit.startDate || '',
            endDate: extendedInit.endDate || '',
            milestones: extendedInit.milestones || [],
            tasks: extendedInit.tasks || [],
            totalHours: extendedInit.totalHours || 0
          }
        })
      }

      // No changes, return previous state
      return prevInitiatives
    })
  }, [annualPlanByQuarter, currentQuarterKey])

  // Sync TO Annual Plan: Update parent state when local initiatives change
  // This ensures milestones, tasks, dates, why, outcome are persisted to database
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastSyncedRef = useRef<string>('')

  useEffect(() => {
    // Create a fingerprint of the current initiatives state
    const currentFingerprint = JSON.stringify(initiatives.map(init => ({
      id: init.id,
      milestones: init.milestones,
      tasks: init.tasks,
      why: init.why,
      outcome: init.outcome,
      startDate: init.startDate,
      endDate: init.endDate,
      totalHours: init.totalHours,
      assignedTo: init.assignedTo
    })))

    // Skip if nothing changed (prevents infinite loop)
    if (currentFingerprint === lastSyncedRef.current) {
      return
    }

    // Skip if no initiatives
    if (initiatives.length === 0) {
      return
    }

    // Debounce the sync to avoid excessive updates
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current)
    }

    syncTimeoutRef.current = setTimeout(() => {
      console.log('[90-Day Sprint] 🔄 Syncing initiatives back to parent for persistence')
      lastSyncedRef.current = currentFingerprint

      // Build updated plan object (prop expects direct value, not callback)
      const updatedPlan = {
        ...annualPlanByQuarter,
        [currentQuarterKey]: initiatives.map(init => ({
          ...init,
          // Ensure all enhanced data is included
          milestones: init.milestones || [],
          tasks: init.tasks || [],
          why: init.why || '',
          outcome: init.outcome || '',
          startDate: init.startDate || '',
          endDate: init.endDate || '',
          totalHours: init.totalHours || 0
        }))
      }
      setAnnualPlanByQuarter(updatedPlan)
    }, 500) // 500ms debounce

    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current)
      }
    }
  }, [initiatives, currentQuarterKey, setAnnualPlanByQuarter, annualPlanByQuarter])

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

          // Add business partners from owner_info.partners
          if (ownerInfo.partners && Array.isArray(ownerInfo.partners)) {
            ownerInfo.partners.forEach((partner: any, index: number) => {
              if (partner.name && partner.name.trim()) {
                members.push({
                  id: `partner-${businessId}-${index}`,
                  name: partner.name,
                  email: '',
                  role: 'Partner',
                  type: 'employee',
                  initials: getInitials(partner.name),
                  color: getColorForName(partner.name),
                  businessId,
                  userId: user.id,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString()
                })
              }
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
      {/* Task Banner */}
      <div className="bg-gradient-to-r from-brand-orange to-brand-orange-700 rounded-lg p-4 text-white">
        <p className="text-base font-medium">
          📋 <strong>YOUR TASK:</strong> Plan your next 90 days - review initiatives and define operational activities
        </p>
        <p className="text-sm text-brand-orange-100 mt-1">
          {currentQuarter.label} • {currentQuarter.months} • {yearType} {planYear}
        </p>
      </div>

      {/* Requirements Checklist */}
      <div className={`rounded-lg border-2 p-4 ${
        planningQuarterInitiatives > 0 && hasOperationalActivities
          ? 'bg-green-50 border-green-300'
          : 'bg-amber-50 border-amber-200'
      }`}>
        <h4 className={`text-sm font-bold mb-3 ${
          planningQuarterInitiatives > 0 && hasOperationalActivities
            ? 'text-green-800'
            : 'text-amber-800'
        }`}>
          {planningQuarterInitiatives > 0 && hasOperationalActivities
            ? '✓ Step 5 Requirements Complete!'
            : 'Step 5 Requirements'
          }
        </h4>
        <div className="space-y-2">
          {/* Requirement 1: Initiatives for planning quarter */}
          <div className="flex items-center gap-2">
            <div className={`w-5 h-5 rounded flex items-center justify-center ${
              planningQuarterInitiatives > 0 ? 'bg-green-500' : 'bg-gray-300'
            }`}>
              {planningQuarterInitiatives > 0 ? (
                <Check className="w-3 h-3 text-white" />
              ) : (
                <span className="text-white text-xs font-bold">1</span>
              )}
            </div>
            <span className={`text-sm ${planningQuarterInitiatives > 0 ? 'text-green-700 line-through' : 'text-gray-700'}`}>
              Have initiatives for {planningQuarterLabel} {planningQuarterInitiatives > 0 && `(${planningQuarterInitiatives} assigned)`}
            </span>
          </div>

          {/* Requirement 2: Operational activities */}
          <div className="flex items-center gap-2">
            <div className={`w-5 h-5 rounded flex items-center justify-center ${
              hasOperationalActivities ? 'bg-green-500' : 'bg-gray-300'
            }`}>
              {hasOperationalActivities ? (
                <Check className="w-3 h-3 text-white" />
              ) : (
                <span className="text-white text-xs font-bold">2</span>
              )}
            </div>
            <span className={`text-sm ${hasOperationalActivities ? 'text-green-700 line-through' : 'text-gray-700'}`}>
              Add at least 1 operational activity (Operational tab)
            </span>
          </div>
        </div>
      </div>

      {/* Main Layout with Sidebar */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar - Quarterly Targets */}
        <div className="lg:w-72 flex-shrink-0">
          <QuarterlyTargetsSidebar
            quarterlyTargets={quarterlyTargets}
            currentQuarter={currentQuarter}
            currentQuarterKey={currentQuarterKey}
            kpis={kpis}
            coreMetrics={coreMetrics}
          />
        </div>

        {/* Main Content Area */}
        <div className="flex-1 min-w-0">
          {/* Advanced Mode Toggle */}
          <div className="flex justify-end mb-2">
            <button
              onClick={() => setShowAdvancedMode(!showAdvancedMode)}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                showAdvancedMode
                  ? 'bg-gray-200 text-gray-700'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              {showAdvancedMode ? 'Hide' : 'Show'} Monthly Goals
            </button>
          </div>

          {/* Tab Navigation - Enhanced Design */}
          <div className="bg-white rounded-lg shadow-md border-2 border-gray-200 overflow-hidden">
        <div className={`grid grid-cols-1 gap-0 divide-y md:divide-y-0 md:divide-x divide-gray-200 ${
          tabs.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3'
        }`}>
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
                            ? 'bg-white text-brand-orange-700'
                            : 'bg-brand-orange-100 text-brand-orange-700'
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
              operationalIdeasFromStep2={(strategicIdeas || []).filter(idea => idea.ideaType === 'operational')}
              allStrategicIdeas={strategicIdeas}
              setStrategicIdeas={setStrategicIdeas}
              businessId={businessId}
            />
          )}
        </div>
      </div>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// QUARTERLY TARGETS SIDEBAR
// =============================================================================

interface QuarterlyTargetsSidebarProps {
  quarterlyTargets: Record<string, { q1: string; q2: string; q3: string; q4: string }>
  currentQuarter: any
  currentQuarterKey: string
  kpis: KPIData[]
  coreMetrics?: CoreMetricsData
}

function QuarterlyTargetsSidebar({
  quarterlyTargets,
  currentQuarter,
  currentQuarterKey,
  kpis,
  coreMetrics
}: QuarterlyTargetsSidebarProps) {
  const qKey = currentQuarterKey as 'q1' | 'q2' | 'q3' | 'q4'

  const getTarget = (metricKey: string): number => {
    const value = quarterlyTargets[metricKey]?.[qKey]
    return value ? parseFloat(value) || 0 : 0
  }

  const formatCurrencyCompact = (value: number): string => {
    if (!value || isNaN(value)) return '$0'
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`
    return `$${Math.round(value).toLocaleString()}`
  }

  // Financial targets from Annual Plan
  const revenue = getTarget('revenue')
  const grossProfit = getTarget('grossProfit')
  const netProfit = getTarget('netProfit')
  const grossMarginTarget = getTarget('grossMargin')
  const netMarginTarget = getTarget('netMargin')

  // Core metrics from Annual Plan quarterly targets
  const teamHeadcount = getTarget('teamHeadcount')
  const leadsPerMonth = getTarget('leadsPerMonth')
  const conversionRate = getTarget('conversionRate')
  const avgTransactionValue = getTarget('avgTransactionValue')
  const ownerHoursPerWeek = getTarget('ownerHoursPerWeek')

  // Calculate margins from values if not explicitly set
  const grossMargin = grossMarginTarget > 0 ? grossMarginTarget : (revenue > 0 ? (grossProfit / revenue) * 100 : 0)
  const netMargin = netMarginTarget > 0 ? netMarginTarget : (revenue > 0 ? (netProfit / revenue) * 100 : 0)

  // Check which core metrics have quarterly targets set (from Step 4 Annual Plan)
  // Show metric if EITHER year1 target OR quarterly target is set
  const hasLeads = leadsPerMonth > 0 || (coreMetrics?.leadsPerMonth?.year1 ?? 0) > 0
  const hasConversion = conversionRate > 0 || (coreMetrics?.conversionRate?.year1 ?? 0) > 0
  const hasATV = avgTransactionValue > 0 || (coreMetrics?.avgTransactionValue?.year1 ?? 0) > 0
  const hasTeam = teamHeadcount > 0 || (coreMetrics?.teamHeadcount?.year1 ?? 0) > 0
  const hasOwnerHours = ownerHoursPerWeek > 0 || (coreMetrics?.ownerHoursPerWeek?.year1 ?? 0) > 0

  return (
    <div className="bg-white border-2 border-brand-navy-200 rounded-xl overflow-hidden sticky top-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-brand-navy to-brand-navy-700 px-4 py-3">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-white" />
          <h3 className="text-sm font-bold text-white">{currentQuarter.label} Targets</h3>
        </div>
        <p className="text-xs text-white/70 mt-0.5">From Annual Plan</p>
      </div>

      {/* Financial Goals */}
      <div className="p-4 border-b border-gray-200">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Financial</h4>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Revenue</span>
            <span className="text-sm font-bold text-gray-900">{formatCurrencyCompact(revenue)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Gross Profit</span>
            <div className="text-right">
              <span className="text-sm font-bold text-gray-900">{formatCurrencyCompact(grossProfit)}</span>
              {grossMargin > 0 && <span className="text-xs text-gray-500 ml-1">({grossMargin.toFixed(0)}%)</span>}
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Net Profit</span>
            <div className="text-right">
              <span className="text-sm font-bold text-gray-900">{formatCurrencyCompact(netProfit)}</span>
              {netMargin > 0 && <span className="text-xs text-gray-500 ml-1">({netMargin.toFixed(0)}%)</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Core Metrics - only show if any are configured */}
      {(hasLeads || hasConversion || hasATV || hasTeam || hasOwnerHours) && (
        <div className="p-4 border-b border-gray-200">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Core Metrics</h4>
          <div className="space-y-3">
            {hasLeads && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Leads/Month</span>
                <span className="text-sm font-bold text-gray-900">{Math.round(leadsPerMonth).toLocaleString()}</span>
              </div>
            )}
            {hasConversion && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Conversion Rate</span>
                <span className="text-sm font-bold text-gray-900">{conversionRate.toFixed(1)}%</span>
              </div>
            )}
            {hasATV && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Avg Transaction</span>
                <span className="text-sm font-bold text-gray-900">{formatCurrencyCompact(avgTransactionValue)}</span>
              </div>
            )}
            {hasTeam && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Team Size</span>
                <span className="text-sm font-bold text-gray-900">{Math.round(teamHeadcount)}</span>
              </div>
            )}
            {hasOwnerHours && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Owner Hours/Wk</span>
                <span className="text-sm font-bold text-gray-900">{Math.round(ownerHoursPerWeek)}h</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* KPIs */}
      {kpis && kpis.length > 0 && (
        <div className="p-4">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">KPIs</h4>
          <div className="space-y-2">
            {kpis.slice(0, 5).map((kpi, idx) => {
              // Step 4 stores KPI quarterly targets using kpi.id directly (not with kpi_ prefix)
              const kpiTarget = quarterlyTargets[kpi.id]?.[qKey]
              return (
                <div key={kpi.id || idx} className="flex justify-between items-center">
                  <span className="text-xs text-gray-600 truncate flex-1 mr-2">{kpi.name}</span>
                  <span className="text-xs font-semibold text-gray-900 flex-shrink-0">
                    {kpiTarget || kpi.year1Target || '-'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
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
      {/* Intro Text */}
      <div className="bg-gradient-to-r from-brand-orange-50 to-slate-50 border border-brand-orange-200 rounded-lg p-5">
        <p className="text-base text-gray-800 leading-relaxed">
          <strong className="text-brand-orange-700">Your {currentQuarter.label} Sprint</strong> - This is where strategy meets execution. Break down your quarterly targets into monthly goals and define the specific actions that will drive results.
        </p>
        <p className="text-sm text-gray-600 mt-2">
          The initiatives below were assigned to {currentQuarter.label} in your Annual Plan.
        </p>
      </div>

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
            className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
          >
            <h4 className="text-sm font-semibold text-brand-navy">Financial Targets</h4>
            {showFinancialTargets ? (
              <ChevronUp className="w-5 h-5 text-gray-600" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-600" />
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
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-brand-navy border-b border-r border-slate-200">Metric</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-brand-navy border-b border-r border-slate-200">{currentQuarter.label} Target</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-brand-navy border-b border-r border-slate-200">
                  <div className="flex flex-col items-center">
                    <span>Month 1</span>
                    <span className="text-[10px] font-normal text-gray-500">{month1Name}</span>
                  </div>
                </th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-brand-navy border-b border-r border-slate-200">
                  <div className="flex flex-col items-center">
                    <span>Month 2</span>
                    <span className="text-[10px] font-normal text-gray-500">{month2Name}</span>
                  </div>
                </th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-brand-navy border-b border-r border-slate-200">
                  <div className="flex flex-col items-center">
                    <span>Month 3</span>
                    <span className="text-[10px] font-normal text-gray-500">{month3Name}</span>
                  </div>
                </th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-brand-navy border-b border-slate-200">Total</th>
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
                    <td className="px-4 py-3 text-sm font-medium text-brand-navy border-r border-slate-200">Revenue</td>
                    <td className="px-4 py-3 text-sm text-gray-700 font-medium border-r border-slate-200 text-center">
                      {formatCurrencyValue(quarterlyTarget)}
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        value={formatCurrencyValue(monthlyTargets.month1.revenue)}
                        onChange={(e) => updateMonthlyTarget('month1', 'revenue', parseCurrencyInput(e.target.value))}
                        placeholder="$0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        value={formatCurrencyValue(monthlyTargets.month2.revenue)}
                        onChange={(e) => updateMonthlyTarget('month2', 'revenue', parseCurrencyInput(e.target.value))}
                        placeholder="$0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        value={formatCurrencyValue(monthlyTargets.month3.revenue)}
                        onChange={(e) => updateMonthlyTarget('month3', 'revenue', parseCurrencyInput(e.target.value))}
                        placeholder="$0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300 border-gray-300"
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
                    <td className="px-4 py-3 text-sm font-medium text-brand-navy border-r border-slate-200">Gross Profit</td>
                    <td className="px-4 py-3 text-sm text-gray-700 font-medium border-r border-slate-200 text-center">
                      {formatCurrencyValue(quarterlyTarget)}
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        value={formatCurrencyValue(monthlyTargets.month1.grossProfit)}
                        onChange={(e) => updateMonthlyTarget('month1', 'grossProfit', parseCurrencyInput(e.target.value))}
                        placeholder="$0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        value={formatCurrencyValue(monthlyTargets.month2.grossProfit)}
                        onChange={(e) => updateMonthlyTarget('month2', 'grossProfit', parseCurrencyInput(e.target.value))}
                        placeholder="$0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        value={formatCurrencyValue(monthlyTargets.month3.grossProfit)}
                        onChange={(e) => updateMonthlyTarget('month3', 'grossProfit', parseCurrencyInput(e.target.value))}
                        placeholder="$0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300 border-gray-300"
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
                  <tr className="bg-brand-orange-50">
                    <td className="px-4 py-3 text-sm font-medium text-brand-navy border-r border-slate-200">
                      Gross Margin
                      <div className="text-[10px] font-normal text-brand-orange">Auto-calculated</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 font-medium border-r border-slate-200 text-center">
                      {quarterlyTarget > 0 ? `${quarterlyTarget}%` : '-'}
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <div className="px-2 py-2 bg-brand-orange-100 rounded-md text-sm text-center font-medium text-gray-700 border border-brand-orange-200">
                        {month1GrossMargin > 0 ? `${month1GrossMargin.toFixed(1)}%` : '-'}
                      </div>
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <div className="px-2 py-2 bg-brand-orange-100 rounded-md text-sm text-center font-medium text-gray-700 border border-brand-orange-200">
                        {month2GrossMargin > 0 ? `${month2GrossMargin.toFixed(1)}%` : '-'}
                      </div>
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <div className="px-2 py-2 bg-brand-orange-100 rounded-md text-sm text-center font-medium text-gray-700 border border-brand-orange-200">
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
                    <td className="px-4 py-3 text-sm font-medium text-brand-navy border-r border-slate-200">Net Profit</td>
                    <td className="px-4 py-3 text-sm text-gray-700 font-medium border-r border-slate-200 text-center">
                      {formatCurrencyValue(quarterlyTarget)}
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        value={formatCurrencyValue(monthlyTargets.month1.netProfit)}
                        onChange={(e) => updateMonthlyTarget('month1', 'netProfit', parseCurrencyInput(e.target.value))}
                        placeholder="$0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        value={formatCurrencyValue(monthlyTargets.month2.netProfit)}
                        onChange={(e) => updateMonthlyTarget('month2', 'netProfit', parseCurrencyInput(e.target.value))}
                        placeholder="$0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        value={formatCurrencyValue(monthlyTargets.month3.netProfit)}
                        onChange={(e) => updateMonthlyTarget('month3', 'netProfit', parseCurrencyInput(e.target.value))}
                        placeholder="$0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300 border-gray-300"
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
                  <tr className="bg-brand-orange-50">
                    <td className="px-4 py-3 text-sm font-medium text-brand-navy border-r border-slate-200">
                      Net Margin
                      <div className="text-[10px] font-normal text-brand-orange">Auto-calculated</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 font-medium border-r border-slate-200 text-center">
                      {quarterlyTarget > 0 ? `${quarterlyTarget}%` : '-'}
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <div className="px-2 py-2 bg-brand-orange-100 rounded-md text-sm text-center font-medium text-gray-700 border border-brand-orange-200">
                        {month1NetMargin > 0 ? `${month1NetMargin.toFixed(1)}%` : '-'}
                      </div>
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <div className="px-2 py-2 bg-brand-orange-100 rounded-md text-sm text-center font-medium text-gray-700 border border-brand-orange-200">
                        {month2NetMargin > 0 ? `${month2NetMargin.toFixed(1)}%` : '-'}
                      </div>
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <div className="px-2 py-2 bg-brand-orange-100 rounded-md text-sm text-center font-medium text-gray-700 border border-brand-orange-200">
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
            className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
          >
            <h4 className="text-sm font-semibold text-brand-navy">Core Business Metrics</h4>
            {showCoreMetrics ? (
              <ChevronUp className="w-5 h-5 text-gray-600" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-600" />
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
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-brand-navy border-b border-r border-slate-200">Metric</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-brand-navy border-b border-r border-slate-200">{currentQuarter.label} Target</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-brand-navy border-b border-r border-slate-200">
                  <div className="flex flex-col items-center">
                    <span>Month 1</span>
                    <span className="text-[10px] font-normal text-gray-500">{month1Name}</span>
                  </div>
                </th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-brand-navy border-b border-r border-slate-200">
                  <div className="flex flex-col items-center">
                    <span>Month 2</span>
                    <span className="text-[10px] font-normal text-gray-500">{month2Name}</span>
                  </div>
                </th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-brand-navy border-b border-r border-slate-200">
                  <div className="flex flex-col items-center">
                    <span>Month 3</span>
                    <span className="text-[10px] font-normal text-gray-500">{month3Name}</span>
                  </div>
                </th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-brand-navy border-b border-slate-200">Total</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {/* Leads Per Month */}
              {coreMetrics.leadsPerMonth?.year1 > 0 && (() => {
                const quarterlyTarget = getQuarterlyTarget('leadsPerMonth')
                return (
                  <tr>
                    <td className="px-4 py-3 text-sm font-medium text-brand-navy border-r border-slate-200">Leads Per Month</td>
                    <td className="px-4 py-3 text-sm text-gray-700 font-medium border-r border-slate-200 text-center">
                      {quarterlyTarget > 0 ? Math.round(quarterlyTarget) : '-'}
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        placeholder="0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        placeholder="0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        placeholder="0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300 border-gray-300"
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
                    <td className="px-4 py-3 text-sm font-medium text-brand-navy border-r border-slate-200">Conversion Rate</td>
                    <td className="px-4 py-3 text-sm text-gray-700 font-medium border-r border-slate-200 text-center">
                      {quarterlyTarget > 0 ? `${quarterlyTarget}%` : '-'}
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        placeholder="0%"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        placeholder="0%"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        placeholder="0%"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300 border-gray-300"
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
                    <td className="px-4 py-3 text-sm font-medium text-brand-navy border-r border-slate-200">Avg Transaction Value</td>
                    <td className="px-4 py-3 text-sm text-gray-700 font-medium border-r border-slate-200 text-center">
                      {quarterlyTarget > 0 ? formatCurrencyValue(quarterlyTarget) : '-'}
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        placeholder="$0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        placeholder="$0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        placeholder="$0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300 border-gray-300"
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
                    <td className="px-4 py-3 text-sm font-medium text-brand-navy border-r border-slate-200">Team Headcount</td>
                    <td className="px-4 py-3 text-sm text-gray-700 font-medium border-r border-slate-200 text-center">
                      {quarterlyTarget > 0 ? Math.round(quarterlyTarget) : '-'}
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        value={monthlyTargets.month1.employees || ''}
                        onChange={(e) => updateMonthlyTarget('month1', 'employees', e.target.value)}
                        placeholder="0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        value={monthlyTargets.month2.employees || ''}
                        onChange={(e) => updateMonthlyTarget('month2', 'employees', e.target.value)}
                        placeholder="0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        value={monthlyTargets.month3.employees || ''}
                        onChange={(e) => updateMonthlyTarget('month3', 'employees', e.target.value)}
                        placeholder="0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300 border-gray-300"
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
                    <td className="px-4 py-3 text-sm font-medium text-brand-navy border-r border-slate-200">Owner Hours Per Week</td>
                    <td className="px-4 py-3 text-sm text-gray-700 font-medium border-r border-slate-200 text-center">
                      {quarterlyTarget > 0 ? `${Math.round(quarterlyTarget)} hrs` : '-'}
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        placeholder="0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        placeholder="0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        placeholder="0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300 border-gray-300"
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
                    <td className="px-4 py-3 text-sm font-medium text-brand-navy border-r border-slate-200">New Customers</td>
                    <td className="px-4 py-3 text-sm text-gray-700 font-medium border-r border-slate-200 text-center">
                      {quarterlyTarget > 0 ? Math.round(quarterlyTarget) : '-'}
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        value={monthlyTargets.month1.customers || ''}
                        onChange={(e) => updateMonthlyTarget('month1', 'customers', e.target.value)}
                        placeholder="0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        value={monthlyTargets.month2.customers || ''}
                        onChange={(e) => updateMonthlyTarget('month2', 'customers', e.target.value)}
                        placeholder="0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        value={monthlyTargets.month3.customers || ''}
                        onChange={(e) => updateMonthlyTarget('month3', 'customers', e.target.value)}
                        placeholder="0"
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300 border-gray-300"
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
            className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
          >
            <h4 className="text-sm font-semibold text-brand-navy">Key Performance Indicators</h4>
            {showKPIs ? (
              <ChevronUp className="w-5 h-5 text-gray-600" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-600" />
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
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-brand-navy border-b border-r border-slate-200">KPI</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-brand-navy border-b border-r border-slate-200">{currentQuarter.label} Target</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-brand-navy border-b border-r border-slate-200">
                  <div className="flex flex-col items-center">
                    <span>Month 1</span>
                    <span className="text-[10px] font-normal text-gray-500">{month1Name}</span>
                  </div>
                </th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-brand-navy border-b border-r border-slate-200">
                  <div className="flex flex-col items-center">
                    <span>Month 2</span>
                    <span className="text-[10px] font-normal text-gray-500">{month2Name}</span>
                  </div>
                </th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-brand-navy border-b border-r border-slate-200">
                  <div className="flex flex-col items-center">
                    <span>Month 3</span>
                    <span className="text-[10px] font-normal text-gray-500">{month3Name}</span>
                  </div>
                </th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-brand-navy border-b border-slate-200">Total/Avg</th>
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
                    <td className="px-4 py-3 text-sm font-medium text-brand-navy border-r border-slate-200">
                      {kpi.friendlyName || kpi.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 font-medium border-r border-slate-200 text-center">
                      {quarterlyTarget > 0 ? formatKPIValue(quarterlyTarget) : '-'}
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        placeholder={isCurrency ? '$0' : isPercentage ? '0%' : '0'}
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        placeholder={isCurrency ? '$0' : isPercentage ? '0%' : '0'}
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300 border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        placeholder={isCurrency ? '$0' : isPercentage ? '0%' : '0'}
                        className="w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300 border-gray-300"
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
      <div className="p-4 bg-brand-orange-50 border border-brand-orange-200 rounded-lg">
        <div className="flex gap-3">
          <AlertCircle className="w-5 h-5 text-brand-orange flex-shrink-0 mt-0.5" />
          <div className="text-sm text-brand-navy">
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
              ? 'bg-brand-navy text-white hover:bg-brand-navy-700'
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

        <div className="p-4 bg-gray-50 border-2 border-slate-200 rounded-lg">
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
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-slate-300">
          <Flag className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <h4 className="text-lg font-semibold text-gray-900 mb-2">No Initiatives or Projects Yet</h4>
          <p className="text-sm text-gray-600 mb-4">
            Add your first initiative or project to get started with execution planning.
          </p>
          <button
            onClick={() => setShowAddInitiative(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-navy text-white rounded-lg hover:bg-brand-navy-700 font-medium"
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
  const isRoadmap = initiative.source === 'roadmap'
  const isOperational = initiative.ideaType === 'operational'
  const categoryInfo = getCategoryStyle(initiative.category)

  // Badge styles matching Step 2: Roadmap=Navy, Strategic=Orange, Operational=Gray
  const getBadgeStyle = () => {
    if (isRoadmap) return { bg: 'bg-brand-navy', text: 'text-white', label: 'ROADMAP' }
    if (isOperational) return { bg: 'bg-gray-200', text: 'text-gray-700', label: 'OPERATIONAL' }
    return { bg: 'bg-brand-orange', text: 'text-white', label: 'STRATEGIC' }
  }
  const badgeStyle = getBadgeStyle()

  const canAssignMore = (personName: string) => {
    return (initiativesPerPerson[personName] || 0) < 3
  }

  return (
    <div className="border-2 border-gray-200 rounded-lg overflow-hidden bg-white">
      {/* Card Header */}
      <div
        onClick={onToggle}
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-brand-navy/5 hover:border-brand-navy/40 transition-all"
      >
        <div className="flex items-center gap-3 flex-1">
          {/* Drag Handle (visual only for now) */}
          <GripVertical className="w-4 h-4 text-gray-400 flex-shrink-0" />

          {/* Priority Number */}
          <div className="flex items-center justify-center w-7 h-7 bg-brand-navy text-white rounded-full text-sm font-bold flex-shrink-0">
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
              <span className={`inline-block px-2 py-0.5 text-[10px] rounded font-semibold ${badgeStyle.bg} ${badgeStyle.text}`}>
                {badgeStyle.label}
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
                  className="h-full bg-green-500 transition-all"
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
        <div className="border-t border-slate-200 p-6 bg-gray-50 space-y-6">
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
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        {assignedMember ? (
                          <>
                            <div className={`w-6 h-6 rounded-full ${assignedMember.color} flex items-center justify-center flex-shrink-0`}>
                              <span className="text-white text-xs font-bold">{assignedMember.initials}</span>
                            </div>
                            <span className="text-sm font-medium text-brand-navy flex-1 text-left">{assignedMember.name}</span>
                          </>
                        ) : (
                          <>
                            <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                              <UserPlus className="w-3.5 h-3.5 text-slate-400" />
                            </div>
                            <span className="text-sm text-gray-500 flex-1 text-left">Assign to...</span>
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
                                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-b border-slate-100 last:border-b-0 ${
                                  isOverLimit ? 'opacity-50 cursor-not-allowed' : ''
                                }`}
                              >
                                <div className={`w-8 h-8 rounded-full ${member.color} flex items-center justify-center flex-shrink-0`}>
                                  <span className="text-white text-sm font-bold">{member.initials}</span>
                                </div>
                                <div className="flex-1 text-left">
                                  <div className="text-sm font-medium text-brand-navy">
                                    {member.name}{typeLabel}
                                  </div>
                                  <div className="text-xs text-gray-500">{member.role}</div>
                                </div>
                                {count > 0 && (
                                  <div className="text-xs text-gray-500">
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
                            className="w-full flex items-center gap-3 px-4 py-3 text-[#4C5D75] hover:bg-gray-50 transition-colors font-medium"
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
                className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
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
                  className="inline-flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
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
                      className="w-5 h-5 text-green-600 rounded focus:ring-green-500"
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
                className="flex items-center gap-2 px-3 py-2 bg-brand-navy text-white rounded-lg hover:bg-brand-navy-700 text-sm font-medium"
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
                  className="inline-flex items-center gap-2 px-3 py-2 bg-brand-navy text-white rounded-lg hover:bg-brand-navy-700 text-sm font-medium"
                >
                  <Plus className="w-4 h-4" />
                  Add First Task
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse bg-white rounded-lg overflow-hidden">
                  <thead>
                    <tr className="bg-brand-navy text-white">
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
        return 'bg-red-100 text-red-700 border-red-300'
      case 'in_progress':
        return 'bg-gray-100 text-gray-600 border-gray-300'
      case 'done':
        return 'bg-green-100 text-green-700 border-green-300'
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
    <tr className="hover:bg-gray-50">
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
                className="px-4 py-2 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                      ? 'border-[#4C5D75] bg-gray-50 text-[#4C5D75] font-semibold'
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
                      ? 'border-[#4C5D75] bg-gray-50 text-[#4C5D75] font-semibold'
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
                className="px-4 py-2 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

// OperationalPlanTab is now imported from './OperationalPlanTab'

