'use client'

import { StrategicInitiative, FinancialData, KPIData, YearType } from '../types'
import { ChevronDown, ChevronUp, AlertCircle, GripVertical, TrendingUp, X, UserPlus, Check, HelpCircle } from 'lucide-react'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDollar, parseDollarInput } from '../utils/formatting'
import { calculateQuarters, deriveCurrentRemainderColumn, determinePlanYear, QuarterInfo } from '../utils/quarters'
import { TeamMember, getInitials, getColorForName } from '../utils/team'

interface Step4Props {
  twelveMonthInitiatives: StrategicInitiative[]
  setTwelveMonthInitiatives: (initiatives: StrategicInitiative[] | ((prev: StrategicInitiative[]) => StrategicInitiative[])) => void
  annualPlanByQuarter: Record<string, StrategicInitiative[]>
  setAnnualPlanByQuarter: (plan: Record<string, StrategicInitiative[]>) => void
  // Period values keyed by quarter id. q1-q4 are required for backwards-compat
  // with consumers (page.tsx, Step5SprintPlanning) that index `.q1`/`.q2`/etc
  // directly. `current_remainder` is optional — only present when the wizard
  // is in planning season (last 3 months of current FY) AND planning the next
  // FY, mirroring the pseudo-column added by deriveCurrentRemainderColumn.
  quarterlyTargets: Record<string, { q1: string; q2: string; q3: string; q4: string; current_remainder?: string }>
  setQuarterlyTargets: (targets: Record<string, { q1: string; q2: string; q3: string; q4: string; current_remainder?: string }>) => void
  financialData: FinancialData | null
  coreMetrics?: any
  kpis: KPIData[]
  yearType: YearType
  businessId: string
  /**
   * Phase 14 legacy props — retained on the interface so existing callers don't
   * break, but the column-display logic below no longer reads them. Column
   * visibility is driven entirely by today's date relative to `planYear` and
   * `fiscalYearStart`. See `currentRemainderInfo` below.
   */
  isExtendedPeriod?: boolean
  currentYearRemainingMonths?: number
  fiscalYearStart?: number
  /**
   * The fiscal year being planned (e.g. 2027 = FY27). When provided, overrides
   * `determinePlanYear(yearType)`. Callers should derive this from the saved
   * `year1EndDate` so the displayed plan year is anchored to the persisted
   * plan, not to today's calendar position.
   */
  planYear?: number
}

const MAX_PER_QUARTER = 5
const MAX_PER_PERSON = 3

export default function Step4AnnualPlan({
  twelveMonthInitiatives,
  setTwelveMonthInitiatives,
  annualPlanByQuarter,
  setAnnualPlanByQuarter,
  quarterlyTargets,
  setQuarterlyTargets,
  financialData,
  coreMetrics,
  kpis,
  yearType,
  businessId,
  isExtendedPeriod: _isExtendedPeriod, // Phase 14 legacy — see interface comment
  currentYearRemainingMonths: _currentYearRemainingMonths,
  fiscalYearStart,
  planYear: planYearProp,
}: Step4Props) {
  // Calculate dynamic quarters. planYearProp (derived from saved year1EndDate)
  // takes precedence; fallback is determinePlanYear(yearType) for the case
  // where the plan period hasn't been persisted yet (brand-new plan).
  const planYear = planYearProp ?? determinePlanYear(yearType)
  const QUARTERS = useMemo(() => calculateQuarters(yearType, planYear), [yearType, planYear])
  const yearLabel = `${yearType} ${planYear}`

  // "Current FY remainder" pseudo-column — purely date-driven.
  // See deriveCurrentRemainderColumn for the visibility rules.
  const currentRemainderInfo = useMemo(
    () => deriveCurrentRemainderColumn(new Date(), planYear, fiscalYearStart ?? 7),
    [planYear, fiscalYearStart],
  )

  // Combined column list for initiative sections: [current_remainder] + Q1-Q4
  const allPeriods = useMemo(() => {
    if (!currentRemainderInfo) return QUARTERS
    return [currentRemainderInfo, ...QUARTERS]
  }, [currentRemainderInfo, QUARTERS])

  const [expandedQuarters, setExpandedQuarters] = useState<Set<string>>(
    new Set(['current_remainder', 'q1', 'q2', 'q3', 'q4'])
  )
  const [draggedItem, setDraggedItem] = useState<{
    initiativeId: string
    sourceQuarter: string | 'unassigned'
  } | null>(null)

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [showAssignmentFor, setShowAssignmentFor] = useState<string | null>(null)
  const [showAddNewPerson, setShowAddNewPerson] = useState(false)
  const [newPersonName, setNewPersonName] = useState('')
  const [newPersonRole, setNewPersonRole] = useState('')
  const [isSavingNewPerson, setIsSavingNewPerson] = useState(false)


  // Load team members from Supabase or localStorage
  useEffect(() => {
    loadTeamMembers()
  }, [])

  const loadTeamMembers = async () => {
    try {
      console.log('[Annual Plan] 🔄 Loading team members with businessId:', businessId)
      const supabase = createClient()

      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        loadFromLocalStorage()
        return
      }

      // Use the businessId prop instead of querying
      if (!businessId) {
        console.log('[Annual Plan] ⚠️ No businessId prop, falling back to localStorage')
        loadFromLocalStorage()
        return
      }

      // Load from business_profiles table where key_roles is stored
      const { data: profile, error: profileError } = await supabase
        .from('business_profiles')
        .select('key_roles, owner_info')
        .eq('business_id', businessId)
        .maybeSingle()

        if (profileError) {
          console.error('[Annual Plan] Error loading business profile:', profileError)
          loadFromLocalStorage()
          return
        }

        if (profile) {
          const members: TeamMember[] = []

          // Add owner from owner_info
          if (profile.owner_info && typeof profile.owner_info === 'object') {
            const ownerInfo = profile.owner_info as any
            if (ownerInfo.owner_name) {
              members.push({
                id: `owner-${businessId}`,
                name: ownerInfo.owner_name,
                initials: getInitials(ownerInfo.owner_name),
                color: getColorForName(ownerInfo.owner_name)
              })
            }

            // Add business partners from owner_info.partners
            if (ownerInfo.partners && Array.isArray(ownerInfo.partners)) {
              ownerInfo.partners.forEach((partner: any, index: number) => {
                if (partner.name && partner.name.trim()) {
                  members.push({
                    id: `partner-${businessId}-${index}`,
                    name: partner.name,
                    initials: getInitials(partner.name),
                    color: getColorForName(partner.name)
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
                  initials: getInitials(role.name),
                  color: getColorForName(role.name)
                })
              }
            })
          }

          console.log('[Annual Plan] ✅ Loaded team members:', members.map(m => ({ id: m.id, name: m.name })))
          if (members.length > 0) {
            setTeamMembers(members)
            return
          }
        }

      // Fallback to localStorage
      loadFromLocalStorage()
    } catch (error) {
      console.error('[Annual Plan] ❌ Error loading team members:', error)
      loadFromLocalStorage()
    }
  }

  const loadFromLocalStorage = () => {
    const stored = localStorage.getItem('team_members')
    if (stored) {
      setTeamMembers(JSON.parse(stored))
    } else {
      // Default team member (Owner)
      const defaultMembers: TeamMember[] = [
        { id: '1', name: 'Owner', initials: 'OW', color: 'bg-brand-orange-500' }
      ]
      setTeamMembers(defaultMembers)
      saveToLocalStorage(defaultMembers)
    }
  }

  const saveToLocalStorage = (members: TeamMember[]) => {
    localStorage.setItem('team_members', JSON.stringify(members))
  }

  const handleAddTeamMember = async (initiativeId: string, quarterId: string) => {
    if (!newPersonName.trim()) return

    setIsSavingNewPerson(true)

    try {
      const supabase = createClient()

      // Get current user and business
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        console.error('No user found')
        setIsSavingNewPerson(false)
        return
      }

      // Use the businessId prop passed in from the parent — it already reflects
      // the coach's active client (or the client's own business) correctly.
      // The previous owner_id lookup was wrong whenever the current user was a
      // coach: it would add a team member to the coach's own business.
      if (!businessId) {
        console.error('No business ID provided')
        setIsSavingNewPerson(false)
        return
      }

      // Match the lookup convention used elsewhere in this file (see
      // loadTeamMembers above) — business_profiles is queried by its
      // `business_id` column from this component.
      const { data: profile } = await supabase
        .from('business_profiles')
        .select('key_roles')
        .eq('business_id', businessId)
        .single()

      const currentRoles = (profile?.key_roles as any[]) || []

      // Add new person to key_roles
      const newRole = {
        name: newPersonName.trim(),
        title: newPersonRole.trim() || 'Team Member',
        status: 'Full Time'
      }

      const updatedRoles = [...currentRoles, newRole]

      // Update in Supabase
      const { error } = await supabase
        .from('business_profiles')
        .update({ key_roles: updatedRoles })
        .eq('business_id', businessId)

      if (error) {
        console.error('Error saving to Supabase:', error)
        setIsSavingNewPerson(false)
        return
      }

      // Add to local state
      const newMember: TeamMember = {
        id: `role-${businessId}-${currentRoles.length}`,
        name: newPersonName.trim(),
        initials: getInitials(newPersonName.trim()),
        color: getColorForName(newPersonName.trim())
      }

      setTeamMembers([...teamMembers, newMember])

      // Automatically assign to the initiative
      handleAssignPerson(initiativeId, quarterId, newMember.id)

      // Reset form
      setNewPersonName('')
      setNewPersonRole('')
      setShowAddNewPerson(false)

    } catch (error) {
      console.error('Error adding team member:', error)
    } finally {
      setIsSavingNewPerson(false)
    }
  }

  // Calculate assignments per person per quarter
  const assignmentCountsByQuarter = useMemo(() => {
    const counts: Record<string, Record<string, number>> = {}
    Object.entries(annualPlanByQuarter).forEach(([quarter, initiatives]) => {
      if (!counts[quarter]) counts[quarter] = {}
      initiatives.forEach(initiative => {
        if (initiative.assignedTo) {
          counts[quarter][initiative.assignedTo] = (counts[quarter][initiative.assignedTo] || 0) + 1
        }
      })
    })
    return counts
  }, [annualPlanByQuarter])

  // Get people who are at capacity for each quarter
  const peopleAtCapacityByQuarter = useMemo(() => {
    const capacityByQuarter: Record<string, Set<string>> = {}
    Object.entries(assignmentCountsByQuarter).forEach(([quarter, personCounts]) => {
      capacityByQuarter[quarter] = new Set(
        Object.entries(personCounts)
          .filter(([_, count]) => count >= MAX_PER_PERSON)
          .map(([personId, _]) => personId)
      )
    })
    return capacityByQuarter
  }, [assignmentCountsByQuarter])

  // Toggle quarter expansion
  const toggleQuarter = (quarterId: string) => {
    const newExpanded = new Set(expandedQuarters)
    if (newExpanded.has(quarterId)) {
      newExpanded.delete(quarterId)
    } else {
      newExpanded.add(quarterId)
    }
    setExpandedQuarters(newExpanded)
  }

  // Get unassigned initiatives
  const assignedInitiativeIds = new Set(
    Object.values(annualPlanByQuarter).flat().map(i => i.id)
  )
  const unassignedInitiatives = twelveMonthInitiatives.filter(
    i => !assignedInitiativeIds.has(i.id)
  )

  // Add initiative to quarter
  const handleAddToQuarter = (initiative: StrategicInitiative, quarterId: string) => {
    setAnnualPlanByQuarter({
      ...annualPlanByQuarter,
      [quarterId]: [...(annualPlanByQuarter[quarterId] || []), initiative]
    })
  }

  // Remove initiative from quarter - ensures it goes back to the Available pool
  const handleRemoveFromQuarter = (initiativeId: string, quarterId: string) => {
    // Find the initiative being removed
    const initiative = (annualPlanByQuarter[quarterId] || []).find(i => i.id === initiativeId)

    // Remove from the quarter
    setAnnualPlanByQuarter({
      ...annualPlanByQuarter,
      [quarterId]: (annualPlanByQuarter[quarterId] || []).filter(i => i.id !== initiativeId)
    })

    // Ensure the initiative is in twelveMonthInitiatives so it appears in Available
    // This handles cases where DB data got out of sync
    if (initiative && !twelveMonthInitiatives.some(i => i.id === initiativeId)) {
      console.log('[Step4] Adding removed initiative back to twelveMonthInitiatives:', initiative.title)
      setTwelveMonthInitiatives(prev => [...prev, initiative])
    }
  }

  // Assign person to initiative
  const handleAssignPerson = (initiativeId: string, quarterId: string, personId: string) => {
    console.log(`[Annual Plan] 👤 Assigning person ${personId} to initiative ${initiativeId} in ${quarterId}`)
    const updatedQuarter = (annualPlanByQuarter[quarterId] || []).map(init =>
      init.id === initiativeId ? { ...init, assignedTo: personId } : init
    )
    console.log('[Annual Plan] ✅ Updated initiatives:', updatedQuarter.map(i => ({ id: i.id, title: i.title, assignedTo: i.assignedTo })))
    setAnnualPlanByQuarter({
      ...annualPlanByQuarter,
      [quarterId]: updatedQuarter
    })
    setShowAssignmentFor(null)
  }

  // Batch Actions
  const handleStaggerByPriority = () => {
    const distribution: Record<string, StrategicInitiative[]> = {
      q1: [],
      q2: [],
      q3: [],
      q4: []
    }

    const priorityOrder = { high: 0, medium: 1, low: 2 }
    const sorted = [...twelveMonthInitiatives].sort((a, b) => {
      const aPriority = priorityOrder[a.priority || 'low']
      const bPriority = priorityOrder[b.priority || 'low']
      return aPriority - bPriority
    })

    sorted.forEach((initiative) => {
      if (initiative.priority === 'high') {
        if (distribution.q1.length < MAX_PER_QUARTER) {
          distribution.q1.push(initiative)
        } else if (distribution.q2.length < MAX_PER_QUARTER) {
          distribution.q2.push(initiative)
        } else if (distribution.q3.length < MAX_PER_QUARTER) {
          distribution.q3.push(initiative)
        } else if (distribution.q4.length < MAX_PER_QUARTER) {
          distribution.q4.push(initiative)
        }
      } else if (initiative.priority === 'medium') {
        if (distribution.q2.length < MAX_PER_QUARTER) {
          distribution.q2.push(initiative)
        } else if (distribution.q3.length < MAX_PER_QUARTER) {
          distribution.q3.push(initiative)
        } else if (distribution.q4.length < MAX_PER_QUARTER) {
          distribution.q4.push(initiative)
        } else if (distribution.q1.length < MAX_PER_QUARTER) {
          distribution.q1.push(initiative)
        }
      } else {
        if (distribution.q3.length < MAX_PER_QUARTER) {
          distribution.q3.push(initiative)
        } else if (distribution.q4.length < MAX_PER_QUARTER) {
          distribution.q4.push(initiative)
        } else if (distribution.q2.length < MAX_PER_QUARTER) {
          distribution.q2.push(initiative)
        } else if (distribution.q1.length < MAX_PER_QUARTER) {
          distribution.q1.push(initiative)
        }
      }
    })

    setAnnualPlanByQuarter(distribution)
  }

  // Drag handlers
  const handleDragStart = (initiativeId: string, sourceQuarter: string | 'unassigned') => {
    setDraggedItem({ initiativeId, sourceQuarter })
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.currentTarget.classList.add('bg-brand-orange-50')
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('bg-brand-orange-50')
  }

  const handleDrop = (e: React.DragEvent, targetQuarter: string) => {
    e.preventDefault()
    e.currentTarget.classList.remove('bg-brand-orange-50')

    if (!draggedItem) return

    const { initiativeId, sourceQuarter } = draggedItem

    const targetCount = annualPlanByQuarter[targetQuarter]?.length || 0
    if (targetCount >= MAX_PER_QUARTER) {
      alert(`Quarter is at capacity (max ${MAX_PER_QUARTER} initiatives)`)
      return
    }

    if (sourceQuarter === 'unassigned') {
      const initiative = unassignedInitiatives.find(i => i.id === initiativeId)
      if (initiative) {
        handleAddToQuarter(initiative, targetQuarter)
      }
    } else if (sourceQuarter === targetQuarter) {
      return
    } else {
      const initiative = annualPlanByQuarter[sourceQuarter]?.find(i => i.id === initiativeId)
      if (initiative) {
        handleRemoveFromQuarter(initiativeId, sourceQuarter)
        handleAddToQuarter(initiative, targetQuarter)
      }
    }

    setDraggedItem(null)
  }

  // Calculate quarter status
  const getQuarterStatus = (quarterId: string) => {
    const count = annualPlanByQuarter[quarterId]?.length || 0
    if (count === 0) return 'empty'
    if (count >= MAX_PER_QUARTER) return 'full'
    return 'active'
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'full':
        return 'bg-amber-50 border-amber-300'
      case 'active':
        return 'bg-brand-orange-50 border-brand-orange-300'
      default:
        return 'bg-gray-50 border-slate-200'
    }
  }

  // Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' ||
          document.activeElement?.tagName === 'TEXTAREA' ||
          document.activeElement?.tagName === 'SELECT') {
        return
      }

      switch (e.key) {
        case '1':
        case '2':
        case '3':
        case '4':
          toggleQuarter(`q${e.key}`)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const getMemberById = (id: string) => teamMembers.find(m => m.id === id)

  // Update quarterly target value with bidirectional margin/profit calculations.
  // `quarter` is a string period id ('q1'..'q4' or 'current_remainder') — typed
  // as string to allow the new card layout to also write the remainder period.
  const updateQuarterlyTarget = (metricKey: string, quarter: string, value: string) => {
    const existing = quarterlyTargets[metricKey] || { q1: '', q2: '', q3: '', q4: '' }
    let newTargets = {
      ...quarterlyTargets,
      [metricKey]: {
        ...existing,
        [quarter]: value,
      },
    }

    // Get revenue for this quarter for calculations (works for any period key).
    const quarterRevenue = parseFloat((newTargets['revenue'] as Record<string, string> | undefined)?.[quarter] || '0') || 0

    // Bidirectional: Gross Margin % <-> Gross Profit $
    if (metricKey === 'grossMargin' && quarterRevenue > 0) {
      // User entered margin %, calculate profit $
      const marginPercent = parseFloat(value) || 0
      const calculatedProfit = Math.round(quarterRevenue * (marginPercent / 100))
      newTargets = {
        ...newTargets,
        grossProfit: {
          ...newTargets['grossProfit'],
          [quarter]: calculatedProfit.toString()
        }
      }
    } else if (metricKey === 'grossProfit' && quarterRevenue > 0) {
      // User entered profit $, calculate margin %
      const profitValue = parseFloat(value) || 0
      const calculatedMargin = ((profitValue / quarterRevenue) * 100).toFixed(1)
      newTargets = {
        ...newTargets,
        grossMargin: {
          ...newTargets['grossMargin'],
          [quarter]: calculatedMargin
        }
      }
    }

    // Bidirectional: Net Margin % <-> Net Profit $
    if (metricKey === 'netMargin' && quarterRevenue > 0) {
      // User entered margin %, calculate profit $
      const marginPercent = parseFloat(value) || 0
      const calculatedProfit = Math.round(quarterRevenue * (marginPercent / 100))
      newTargets = {
        ...newTargets,
        netProfit: {
          ...newTargets['netProfit'],
          [quarter]: calculatedProfit.toString()
        }
      }
    } else if (metricKey === 'netProfit' && quarterRevenue > 0) {
      // User entered profit $, calculate margin %
      const profitValue = parseFloat(value) || 0
      const calculatedMargin = ((profitValue / quarterRevenue) * 100).toFixed(1)
      newTargets = {
        ...newTargets,
        netMargin: {
          ...newTargets['netMargin'],
          [quarter]: calculatedMargin
        }
      }
    }

    setQuarterlyTargets(newTargets)
  }

  // Format currency for display
  const formatCurrency = (value: number) => {
    const abs = Math.abs(value)
    let formatted: string
    if (abs >= 1000000) {
      formatted = `$${(abs / 1000000).toFixed(1)}M`
    } else if (abs >= 1000) {
      formatted = `$${(abs / 1000).toFixed(0)}k`
    } else {
      formatted = `$${abs.toLocaleString()}`
    }
    return value < 0 ? `(${formatted})` : formatted
  }

  // Calculate quarterly total and validation. Sums across ALL visible periods
  // (q1-q4 plus current_remainder when the planning-season pseudo-column exists).
  const calculateQuarterlyTotal = (metricKey: string): { total: number; annual: number; variance: number; isValid: boolean } => {
    const metric = quarterlyTargets[metricKey] as Record<string, string> | undefined
    const periodIds = allPeriods.map(p => p.id) // ['current_remainder'?, 'q1', 'q2', 'q3', 'q4']
    const total = periodIds.reduce((sum, pid) => sum + (parseFloat(metric?.[pid] || '0') || 0), 0)

    // Get annual target based on metric key
    let annual = 0
    if (financialData) {
      if (metricKey === 'revenue') annual = financialData.revenue.year1
      else if (metricKey === 'grossProfit') annual = financialData.grossProfit.year1
      else if (metricKey === 'netProfit') annual = financialData.netProfit.year1
    }

    const variance = total - annual
    const percentDiff = annual > 0 ? Math.abs(variance / annual) * 100 : 0
    const isValid = percentDiff < 5 // Within 5% is considered valid

    return { total, annual, variance, isValid }
  }

  // ── Auto-distribute helpers (card layout's smart-defaults bar) ──
  // Splits the annual target evenly across the 4 quarters of the planned FY.
  // The current_remainder period stays at 0 by design (it's outside Year 1).
  const autoSplitEvenly = () => {
    if (!financialData) return
    const newTargets = { ...quarterlyTargets }
    const updateMetric = (metricKey: string, annual: number) => {
      if (annual <= 0) return
      const each = Math.round(annual / 4)
      newTargets[metricKey] = {
        ...(newTargets[metricKey] || {}),
        q1: each.toString(),
        q2: each.toString(),
        q3: each.toString(),
        // Q4 absorbs rounding remainder so the sum equals annual exactly.
        q4: (annual - each * 3).toString(),
      } as { q1: string; q2: string; q3: string; q4: string; current_remainder?: string }
    }
    updateMetric('revenue', financialData.revenue.year1)
    updateMetric('grossProfit', financialData.grossProfit.year1)
    updateMetric('netProfit', financialData.netProfit.year1)
    setQuarterlyTargets(newTargets)
  }

  const clearTargets = () => {
    if (!confirm('Clear all quarterly target values? Initiative assignments are not affected.')) return
    setQuarterlyTargets({})
  }

  // Calculate section completion status
  const unlockedQuarters = QUARTERS.filter(q => !q.isLocked)

  // Section 1: At least 1 quarterly target set for any unlocked quarter
  const hasAnyQuarterlyTarget = unlockedQuarters.some(q => {
    const qId = q.id as 'q1' | 'q2' | 'q3' | 'q4'
    return Object.values(quarterlyTargets).some(metric => {
      const value = parseFloat(metric?.[qId] || '0')
      return value > 0
    })
  })

  // Section 2: All unlocked quarters have at least 1 initiative
  const allUnlockedHaveInitiatives = unlockedQuarters.every(
    q => (annualPlanByQuarter[q.id] || []).length > 0
  )

  // Count initiatives per unlocked quarter for checklist
  const quarterInitiativeCounts = unlockedQuarters.map(q => ({
    label: q.label,
    count: (annualPlanByQuarter[q.id] || []).length,
    hasInitiatives: (annualPlanByQuarter[q.id] || []).length > 0
  }))

  return (
    <div className="space-y-6">
      {/* Task Banner */}
      <div className="bg-gradient-to-r from-brand-orange to-brand-orange-700 rounded-lg p-4 text-white">
        <p className="text-base font-medium">
          📋 <strong>YOUR TASK:</strong> Complete both sections below to finish Step 4
        </p>
        <p className="text-sm text-brand-orange-100 mt-1">
          Set your quarterly targets, then assign initiatives to each planning quarter.
        </p>
      </div>

      {/* Requirements Checklist */}
      <div className={`rounded-lg border-2 p-4 ${
        hasAnyQuarterlyTarget && allUnlockedHaveInitiatives
          ? 'bg-green-50 border-green-300'
          : 'bg-amber-50 border-amber-200'
      }`}>
        <h4 className={`text-sm font-bold mb-3 ${
          hasAnyQuarterlyTarget && allUnlockedHaveInitiatives
            ? 'text-green-800'
            : 'text-amber-800'
        }`}>
          {hasAnyQuarterlyTarget && allUnlockedHaveInitiatives
            ? '✓ Step 4 Requirements Complete!'
            : 'Step 4 Requirements'
          }
        </h4>
        <div className="space-y-2">
          {/* Section 1 Requirement */}
          <div className="flex items-center gap-2">
            <div className={`w-5 h-5 rounded flex items-center justify-center ${
              hasAnyQuarterlyTarget ? 'bg-green-500' : 'bg-gray-300'
            }`}>
              {hasAnyQuarterlyTarget ? (
                <Check className="w-3 h-3 text-white" />
              ) : (
                <span className="text-white text-xs font-bold">1</span>
              )}
            </div>
            <span className={`text-sm ${hasAnyQuarterlyTarget ? 'text-green-700 line-through' : 'text-gray-700'}`}>
              Set at least 1 quarterly target (Section 1)
            </span>
          </div>

          {/* Section 2 Requirements - one per unlocked quarter */}
          {quarterInitiativeCounts.map((q, idx) => (
            <div key={q.label} className="flex items-center gap-2">
              <div className={`w-5 h-5 rounded flex items-center justify-center ${
                q.hasInitiatives ? 'bg-green-500' : 'bg-gray-300'
              }`}>
                {q.hasInitiatives ? (
                  <Check className="w-3 h-3 text-white" />
                ) : (
                  <span className="text-white text-xs font-bold">{idx + 2}</span>
                )}
              </div>
              <span className={`text-sm ${q.hasInitiatives ? 'text-green-700 line-through' : 'text-gray-700'}`}>
                Assign initiatives to {q.label} {q.count > 0 && `(${q.count} assigned)`}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ANNUAL PLAN CARDS — combined targets + initiatives per quarter */}
      {financialData && (
        <div className="space-y-4">
          {/* Annual goals + auto-distribute bar */}
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <span className="text-gray-600">
                  <span className="font-semibold text-brand-navy">{yearLabel} Annual Goals:</span>
                </span>
                <span>
                  <span className="text-gray-500">Revenue</span>{' '}
                  <span className="font-semibold text-brand-navy">
                    {financialData.revenue.year1 > 0 ? formatCurrency(financialData.revenue.year1) : '—'}
                  </span>
                </span>
                <span>
                  <span className="text-gray-500">Gross Profit</span>{' '}
                  <span className="font-semibold text-brand-navy">
                    {financialData.grossProfit.year1 > 0 ? formatCurrency(financialData.grossProfit.year1) : '—'}
                  </span>
                </span>
                <span>
                  <span className="text-gray-500">Net Profit</span>{' '}
                  <span className="font-semibold text-brand-navy">
                    {financialData.netProfit.year1 > 0 ? formatCurrency(financialData.netProfit.year1) : '—'}
                  </span>
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={autoSplitEvenly}
                  disabled={
                    !(financialData.revenue.year1 > 0 ||
                      financialData.grossProfit.year1 > 0 ||
                      financialData.netProfit.year1 > 0)
                  }
                  className="px-3 py-1.5 text-xs font-semibold rounded border border-brand-orange text-brand-orange hover:bg-brand-orange hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Split annual goals evenly across the 4 FY quarters"
                >
                  Auto-split evenly
                </button>
                <button
                  type="button"
                  onClick={clearTargets}
                  className="px-3 py-1.5 text-xs font-medium rounded border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Clear targets
                </button>
              </div>
            </div>
            {financialData.revenue.year1 === 0 && (
              <p className="mt-2 text-xs text-gray-500">
                Set your Year 1 revenue / GP / NP goals in Step 1 to enable auto-split and variance checking.
              </p>
            )}
          </div>

          {/* Quarter cards */}
          <div
            className={`grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 ${
              allPeriods.length === 5 ? 'xl:grid-cols-5' : 'xl:grid-cols-4'
            }`}
          >
            {allPeriods.map((quarter) => {
              const items = annualPlanByQuarter[quarter.id] || []
              const isFull = items.length >= MAX_PER_QUARTER
              const isLockedQuarter = quarter.isLocked
              const isCurrentRemainder = quarter.id === 'current_remainder'
              const targetsMetricRow = (key: string, label: string, suffix?: string) => {
                const metric = quarterlyTargets[key] as Record<string, string> | undefined
                const raw = metric?.[quarter.id] || ''
                const display = raw && !suffix ? formatDollar(parseFloat(raw)) : raw
                return (
                  <div key={key} className="flex items-center gap-2">
                    <label className="text-[11px] uppercase tracking-wide font-semibold text-gray-500 w-8">
                      {label}
                    </label>
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        value={display}
                        onChange={(e) =>
                          updateQuarterlyTarget(
                            key,
                            quarter.id,
                            suffix === '%' ? e.target.value.replace('%', '') : parseDollarInput(e.target.value).toString(),
                          )
                        }
                        placeholder={suffix === '%' ? '0' : '$0'}
                        className="w-full px-2 py-1 border border-gray-200 rounded text-sm text-right font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                      />
                      {suffix && (
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                          {suffix}
                        </span>
                      )}
                    </div>
                  </div>
                )
              }

              return (
                <div
                  key={quarter.id}
                  onDragOver={!isLockedQuarter ? handleDragOver : undefined}
                  onDrop={!isLockedQuarter ? (e) => handleDrop(e, quarter.id) : undefined}
                  className={`rounded-lg border-2 p-3 flex flex-col ${
                    isCurrentRemainder
                      ? 'border-amber-300 bg-amber-50/30'
                      : quarter.isCurrent
                      ? 'border-amber-300 bg-amber-50/30'
                      : quarter.isNextQuarter
                      ? 'border-brand-orange bg-orange-50/30'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-brand-navy">{quarter.label}</span>
                        {isCurrentRemainder && (
                          <span className="text-[9px] px-1 py-0.5 bg-amber-500 text-white rounded font-semibold">NOW</span>
                        )}
                        {quarter.isNextQuarter && !isCurrentRemainder && (
                          <span className="text-[9px] px-1 py-0.5 bg-brand-orange text-white rounded font-semibold">PLANNING</span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500 mt-0.5">{quarter.months}</p>
                    </div>
                  </div>

                  {/* Targets section */}
                  <div className="border-t border-slate-100 pt-2 pb-2 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Targets</p>
                    </div>
                    {targetsMetricRow('revenue', 'Rev')}
                    {targetsMetricRow('grossProfit', 'GP')}
                    {targetsMetricRow('netProfit', 'NP')}
                  </div>

                  {/* Initiatives section */}
                  <div className="border-t border-slate-100 pt-2 flex-1 flex flex-col">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                        Initiatives <span className="text-gray-400">({items.length}/{MAX_PER_QUARTER})</span>
                      </p>
                      {!isLockedQuarter && !isFull && unassignedInitiatives.length > 0 && (
                        <select
                          value=""
                          onChange={(e) => {
                            const id = e.target.value
                            if (!id) return
                            handleDragStart(id, 'unassigned')
                            // Reuse drop handler with synthetic event (preventDefault is no-op).
                            handleDrop({ preventDefault: () => {} } as React.DragEvent, quarter.id)
                          }}
                          className="text-[10px] border border-slate-200 rounded px-1 py-0.5 text-brand-orange font-semibold hover:border-brand-orange focus:outline-none focus:ring-1 focus:ring-brand-orange max-w-[110px]"
                        >
                          <option value="">+ Add initiative</option>
                          {unassignedInitiatives.map((ui) => (
                            <option key={ui.id} value={ui.id}>{ui.title}</option>
                          ))}
                        </select>
                      )}
                    </div>

                    <div className="space-y-1.5 min-h-[60px]">
                      {items.length === 0 ? (
                        <p className="text-[11px] text-center py-3 text-gray-400 italic">
                          {isLockedQuarter ? 'Quarter is locked' : 'Drag here or use + Add'}
                        </p>
                      ) : (
                        items.map((initiative) => {
                          const isRoadmap = initiative.source === 'roadmap'
                          const isOperational = initiative.ideaType === 'operational'
                          const cardBg = isRoadmap
                            ? 'bg-brand-navy text-white border-brand-navy'
                            : isOperational
                            ? 'bg-white text-gray-900 border-gray-300'
                            : 'bg-brand-orange text-white border-brand-orange'
                          const subTextColor = isOperational ? 'text-gray-500' : 'text-white/70'
                          return (
                            <div
                              key={initiative.id}
                              draggable
                              onDragStart={() => handleDragStart(initiative.id, quarter.id)}
                              className={`group flex items-start gap-1.5 p-2 rounded border-2 cursor-move transition-all ${cardBg}`}
                            >
                              <GripVertical className={`w-3 h-3 flex-shrink-0 mt-0.5 ${subTextColor}`} />
                              <p className="text-xs font-medium leading-snug flex-1 line-clamp-2">
                                {initiative.title}
                              </p>
                              <button
                                type="button"
                                onClick={() => handleRemoveFromQuarter(initiative.id, quarter.id)}
                                className={`opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ${subTextColor} hover:text-red-400`}
                                title="Remove from quarter"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Variance row — sum of quarter targets vs annual */}
          {(financialData.revenue.year1 > 0 ||
            financialData.grossProfit.year1 > 0 ||
            financialData.netProfit.year1 > 0) && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
                <span className="font-semibold text-gray-600">Sum of quarter targets:</span>
                {(['revenue', 'grossProfit', 'netProfit'] as const).map((key) => {
                  const v = calculateQuarterlyTotal(key)
                  if (v.annual === 0) return null
                  const labels = { revenue: 'Rev', grossProfit: 'GP', netProfit: 'NP' } as const
                  return (
                    <span key={key} className="flex items-center gap-1">
                      <span className="text-gray-500">{labels[key]}:</span>
                      <span className="font-semibold">{formatCurrency(v.total)}</span>
                      <span
                        className={
                          v.total === 0
                            ? 'text-gray-400'
                            : v.isValid
                            ? 'text-green-600'
                            : Math.abs(v.variance / v.annual) > 0.05
                            ? 'text-red-600'
                            : 'text-amber-600'
                        }
                      >
                        ({v.variance >= 0 ? '+' : ''}{formatCurrency(v.variance)})
                      </span>
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          {/* Available pool — drop here to unassign */}
          {twelveMonthInitiatives.length > 0 && (
            <div
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, 'unassigned')}
              className="bg-gray-50 rounded-lg border-2 border-dashed border-slate-300 p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-brand-navy text-sm">
                  Available initiatives <span className="text-gray-500 font-normal">({unassignedInitiatives.length})</span>
                </h4>
                <p className="text-xs text-gray-500">Drag into a quarter or use + Add inside the quarter</p>
              </div>
              {unassignedInitiatives.length === 0 ? (
                <p className="text-xs text-center py-4 text-gray-500">
                  All initiatives assigned ✓
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-[40vh] overflow-y-auto pr-1">
                  {unassignedInitiatives.map((initiative) => {
                    const isRoadmap = initiative.source === 'roadmap'
                    const isOperational = initiative.ideaType === 'operational'
                    const cardBg = isRoadmap
                      ? 'bg-brand-navy text-white border-brand-navy'
                      : isOperational
                      ? 'bg-white text-gray-900 border-gray-300'
                      : 'bg-brand-orange text-white border-brand-orange'
                    const subTextColor = isOperational ? 'text-gray-500' : 'text-white/70'
                    const badgeStyle = isRoadmap
                      ? { bg: 'bg-white/20', text: 'text-white', label: 'ROADMAP' }
                      : isOperational
                      ? { bg: 'bg-gray-200', text: 'text-gray-700', label: 'OPERATIONAL' }
                      : { bg: 'bg-white/20', text: 'text-white', label: 'STRATEGIC' }
                    return (
                      <div
                        key={initiative.id}
                        draggable
                        onDragStart={() => handleDragStart(initiative.id, 'unassigned')}
                        className={`flex items-start gap-1.5 p-2 rounded border-2 cursor-move ${cardBg}`}
                      >
                        <GripVertical className={`w-3 h-3 flex-shrink-0 mt-0.5 ${subTextColor}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium leading-snug">{initiative.title}</p>
                          <span className={`inline-block mt-1 px-1 py-0.5 text-[9px] rounded font-semibold ${badgeStyle.bg} ${badgeStyle.text}`}>
                            {badgeStyle.label}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* No-initiatives empty state */}
          {twelveMonthInitiatives.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-900">No initiatives selected</p>
                  <p className="text-sm text-amber-700 mt-1">
                    Go back to Step 3 to select 5-20 initiatives first.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  )
}
