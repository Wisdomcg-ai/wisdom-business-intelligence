'use client'

import { StrategicInitiative, FinancialData, KPIData, YearType } from '../types'
import { ChevronDown, ChevronUp, AlertCircle, GripVertical, TrendingUp, X, UserPlus, Check, HelpCircle } from 'lucide-react'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDollar, parseDollarInput } from '../utils/formatting'
import { calculateQuarters, determinePlanYear } from '../utils/quarters'
import { TeamMember, getInitials, getColorForName } from '../utils/team'

interface Step4Props {
  twelveMonthInitiatives: StrategicInitiative[]
  annualPlanByQuarter: Record<string, StrategicInitiative[]>
  setAnnualPlanByQuarter: (plan: Record<string, StrategicInitiative[]>) => void
  quarterlyTargets: Record<string, { q1: string; q2: string; q3: string; q4: string }>
  setQuarterlyTargets: (targets: Record<string, { q1: string; q2: string; q3: string; q4: string }>) => void
  financialData: FinancialData | null
  coreMetrics?: any
  kpis: KPIData[]
  yearType: YearType
  businessId: string
}

const MAX_PER_QUARTER = 5
const MAX_PER_PERSON = 3

export default function Step4AnnualPlan({
  twelveMonthInitiatives,
  annualPlanByQuarter,
  setAnnualPlanByQuarter,
  quarterlyTargets,
  setQuarterlyTargets,
  financialData,
  coreMetrics,
  kpis,
  yearType,
  businessId
}: Step4Props) {
  // Calculate dynamic quarters based on year type
  const planYear = determinePlanYear(yearType)
  const QUARTERS = useMemo(() => calculateQuarters(yearType, planYear), [yearType, planYear])
  const yearLabel = `${yearType} ${planYear}`

  const [expandedQuarters, setExpandedQuarters] = useState<Set<string>>(
    new Set(['q1', 'q2', 'q3', 'q4'])
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
      const { data: profile } = await supabase
        .from('business_profiles')
        .select('key_roles, owner_info')
        .eq('business_id', businessId)
        .single()

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

      const { data: businesses } = await supabase
        .from('businesses')
        .select('id')
        .eq('owner_id', user.id)
        .limit(1)

      if (!businesses || businesses.length === 0) {
        console.error('No business found')
        setIsSavingNewPerson(false)
        return
      }

      const businessId = businesses[0].id

      // Get current key_roles
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

  // Remove initiative from quarter
  const handleRemoveFromQuarter = (initiativeId: string, quarterId: string) => {
    setAnnualPlanByQuarter({
      ...annualPlanByQuarter,
      [quarterId]: (annualPlanByQuarter[quarterId] || []).filter(i => i.id !== initiativeId)
    })
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

  // Update quarterly target value with bidirectional margin/profit calculations
  const updateQuarterlyTarget = (metricKey: string, quarter: 'q1' | 'q2' | 'q3' | 'q4', value: string) => {
    let newTargets = {
      ...quarterlyTargets,
      [metricKey]: {
        q1: quarter === 'q1' ? value : (quarterlyTargets[metricKey]?.q1 || ''),
        q2: quarter === 'q2' ? value : (quarterlyTargets[metricKey]?.q2 || ''),
        q3: quarter === 'q3' ? value : (quarterlyTargets[metricKey]?.q3 || ''),
        q4: quarter === 'q4' ? value : (quarterlyTargets[metricKey]?.q4 || '')
      }
    }

    // Get revenue for this quarter for calculations
    const quarterRevenue = parseFloat(newTargets['revenue']?.[quarter] || '0') || 0

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
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}k`
    }
    return `$${value.toLocaleString()}`
  }

  // Calculate quarterly total and validation
  const calculateQuarterlyTotal = (metricKey: string): { total: number; annual: number; variance: number; isValid: boolean } => {
    const q1 = parseFloat(quarterlyTargets[metricKey]?.q1 || '0') || 0
    const q2 = parseFloat(quarterlyTargets[metricKey]?.q2 || '0') || 0
    const q3 = parseFloat(quarterlyTargets[metricKey]?.q3 || '0') || 0
    const q4 = parseFloat(quarterlyTargets[metricKey]?.q4 || '0') || 0
    const total = q1 + q2 + q3 + q4

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

      {/* SECTION 1: Quarterly Targets */}
      {financialData && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className={`flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm ${
              hasAnyQuarterlyTarget ? 'bg-green-500 text-white' : 'bg-brand-orange text-white'
            }`}>
              {hasAnyQuarterlyTarget ? <Check className="w-5 h-5" /> : '1'}
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-brand-navy">Quarterly Targets</h3>
              <p className="text-sm text-gray-600">Break down your Year 1 targets across quarters</p>
            </div>
            {hasAnyQuarterlyTarget && (
              <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded">
                ✓ Complete
              </span>
            )}
          </div>
        <div className="bg-white rounded-lg shadow-sm border border-slate-200">
          <div className="p-6">
            <div className="space-y-6">
              {/* Financial Targets Section */}
              <div>
                <h4 className="text-sm font-semibold text-brand-navy mb-2">Financial Targets</h4>
                <p className="text-xs text-gray-600 mb-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-green-500"></span>
                    <span><strong>Actual</strong> - Enter your actual results for completed quarters</span>
                  </span>
                  <span className="mx-2 text-gray-300">|</span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-amber-500"></span>
                    <span><strong>Current</strong> - Enter your results to date</span>
                  </span>
                  <span className="mx-2 text-gray-300">|</span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-brand-orange"></span>
                    <span><strong>Planning</strong> - Set your targets</span>
                  </span>
                </p>
                <table className="w-full border-collapse border border-slate-200" style={{ tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '21%' }} />
                    <col style={{ width: '13%' }} />
                    <col style={{ width: '13%' }} />
                    <col style={{ width: '13%' }} />
                    <col style={{ width: '13%' }} />
                    <col style={{ width: '13%' }} />
                    <col style={{ width: '14%' }} />
                  </colgroup>
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-brand-navy border-b border-r border-slate-200">Metric</th>
                      <th className="px-4 py-3 text-center text-sm font-semibold text-brand-navy border-b border-r border-slate-200">{yearLabel}</th>
                      {QUARTERS.map(q => (
                        <th key={q.id} className={`px-4 py-3 text-center text-sm font-semibold border-b border-r border-slate-200 ${q.isPast ? 'bg-green-50 text-green-800' : q.isCurrent ? 'bg-amber-50 text-amber-800' : 'text-brand-navy'}`}>
                          <div className="flex flex-col items-center gap-1">
                            <div className="flex items-center gap-1">
                              <span>{q.label}</span>
                              {q.isPast && <span className="text-[9px] px-1 py-0.5 bg-green-500 text-white rounded font-semibold">ACTUAL</span>}
                              {q.isCurrent && !q.isPast && <span className="text-[9px] px-1 py-0.5 bg-amber-500 text-white rounded font-semibold">CURRENT</span>}
                              {q.isNextQuarter && <span className="text-[9px] px-1 py-0.5 bg-brand-orange-500 text-white rounded font-semibold">PLANNING</span>}
                            </div>
                            <span className="text-[10px] font-normal text-gray-500">{q.months}</span>
                          </div>
                        </th>
                      ))}
                      <th className="px-4 py-3 text-center text-sm font-semibold text-brand-navy border-b border-slate-200">Q Total</th>
                    </tr>
                  </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                      {/* Revenue */}
                      {financialData.revenue.year1 > 0 && (() => {
                        const validation = calculateQuarterlyTotal('revenue')
                        return (
                          <tr>
                            <td className="px-4 py-3 text-sm font-medium text-brand-navy border-r border-slate-200">Revenue</td>
                            <td className="px-4 py-3 text-sm text-gray-700 font-medium border-r border-slate-200 text-center">{formatCurrency(financialData.revenue.year1)}</td>
                            {QUARTERS.map(q => (
                              <td key={q.id} className={`px-4 py-2 border-r border-slate-200 ${q.isPast ? 'bg-green-50' : q.isCurrent ? 'bg-amber-50' : ''}`}>
                                <input
                                  type="text"
                                  value={quarterlyTargets['revenue']?.[q.id as 'q1' | 'q2' | 'q3' | 'q4'] ? formatDollar(parseFloat(quarterlyTargets['revenue'][q.id as 'q1' | 'q2' | 'q3' | 'q4'])) : ''}
                                  onChange={(e) => updateQuarterlyTarget('revenue', q.id as 'q1' | 'q2' | 'q3' | 'q4', parseDollarInput(e.target.value).toString())}
                                  placeholder={q.isPast || q.isCurrent ? 'Actual' : 'Target'}
                                  className={`w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none transition-colors ${
                                    q.isPast
                                      ? 'border-green-300 bg-white focus:ring-2 focus:ring-green-500 focus:border-transparent hover:border-green-400'
                                      : q.isCurrent
                                      ? 'border-amber-300 bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent hover:border-amber-400'
                                      : 'border-gray-300 focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300'
                                  }`}
                                />
                              </td>
                            ))}
                            <td className={`px-4 py-3 text-sm text-center font-medium ${
                              validation.total === 0 ? 'text-slate-400' :
                              validation.isValid ? 'bg-green-50 text-green-700' :
                              validation.variance > 0 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'
                            }`}>
                              {validation.total > 0 ? (
                                <div>
                                  <div className="font-semibold">{formatCurrency(validation.total)}</div>
                                  <div className="text-xs mt-0.5">
                                    {validation.variance > 0 ? '+' : ''}{formatCurrency(validation.variance)}
                                    {validation.isValid && ' ✓'}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs">Not set</span>
                              )}
                            </td>
                          </tr>
                        )
                      })()}

                      {/* Gross Profit */}
                      {financialData.grossProfit.year1 > 0 && (() => {
                        const validation = calculateQuarterlyTotal('grossProfit')
                        return (
                          <tr>
                            <td className="px-4 py-3 text-sm font-medium text-brand-navy border-r border-slate-200">Gross Profit</td>
                            <td className="px-4 py-3 text-sm text-gray-700 font-medium border-r border-slate-200 text-center">{formatCurrency(financialData.grossProfit.year1)}</td>
                            {QUARTERS.map(q => (
                              <td key={q.id} className={`px-4 py-2 border-r border-slate-200 ${q.isPast ? 'bg-green-50' : q.isCurrent ? 'bg-amber-50' : ''}`}>
                                <input
                                  type="text"
                                  value={quarterlyTargets['grossProfit']?.[q.id as 'q1' | 'q2' | 'q3' | 'q4'] ? formatDollar(parseFloat(quarterlyTargets['grossProfit'][q.id as 'q1' | 'q2' | 'q3' | 'q4'])) : ''}
                                  onChange={(e) => updateQuarterlyTarget('grossProfit', q.id as 'q1' | 'q2' | 'q3' | 'q4', parseDollarInput(e.target.value).toString())}
                                  placeholder={q.isPast || q.isCurrent ? 'Actual' : 'Target'}
                                  className={`w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none transition-colors ${
                                    q.isPast
                                      ? 'border-green-300 bg-white focus:ring-2 focus:ring-green-500 focus:border-transparent hover:border-green-400'
                                      : q.isCurrent
                                      ? 'border-amber-300 bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent hover:border-amber-400'
                                      : 'border-gray-300 focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300'
                                  }`}
                                />
                              </td>
                            ))}
                            <td className={`px-4 py-3 text-sm text-center font-medium ${
                              validation.total === 0 ? 'text-slate-400' :
                              validation.isValid ? 'bg-green-50 text-green-700' :
                              validation.variance > 0 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'
                            }`}>
                              {validation.total > 0 ? (
                                <div>
                                  <div className="font-semibold">{formatCurrency(validation.total)}</div>
                                  <div className="text-xs mt-0.5">
                                    {validation.variance > 0 ? '+' : ''}{formatCurrency(validation.variance)}
                                    {validation.isValid && ' ✓'}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs">Not set</span>
                              )}
                            </td>
                          </tr>
                        )
                      })()}

                      {/* Gross Margin */}
                      {financialData.grossMargin && financialData.grossMargin.year1 > 0 && (() => {
                          const q1 = parseFloat(quarterlyTargets['grossMargin']?.q1 || '0') || 0
                          const q2 = parseFloat(quarterlyTargets['grossMargin']?.q2 || '0') || 0
                          const q3 = parseFloat(quarterlyTargets['grossMargin']?.q3 || '0') || 0
                          const q4 = parseFloat(quarterlyTargets['grossMargin']?.q4 || '0') || 0
                          const avg = (q1 + q2 + q3 + q4) / 4
                          return (
                            <tr>
                              <td className="px-4 py-3 text-sm font-medium text-brand-navy border-r border-slate-200">Gross Margin</td>
                              <td className="px-4 py-3 text-sm text-gray-700 font-medium border-r border-slate-200 text-center">{financialData.grossMargin.year1}%</td>
                              {QUARTERS.map(q => (
                                <td key={q.id} className={`px-4 py-2 border-r border-slate-200 ${q.isPast ? 'bg-green-50' : q.isCurrent ? 'bg-amber-50' : ''}`}>
                                  <input
                                    type="text"
                                    value={quarterlyTargets['grossMargin']?.[q.id as keyof typeof quarterlyTargets['grossMargin']] ? `${parseFloat(quarterlyTargets['grossMargin'][q.id as keyof typeof quarterlyTargets['grossMargin']])}%` : ''}
                                    onChange={(e) => updateQuarterlyTarget('grossMargin', q.id as 'q1' | 'q2' | 'q3' | 'q4', e.target.value.replace('%', ''))}
                                    placeholder={q.isPast || q.isCurrent ? 'Actual' : 'Target'}
                                    className={`w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none transition-colors ${
                                      q.isPast
                                        ? 'border-green-300 bg-white focus:ring-2 focus:ring-green-500 focus:border-transparent hover:border-green-400'
                                        : q.isCurrent
                                        ? 'border-amber-300 bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent hover:border-amber-400'
                                        : 'border-gray-300 focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300'
                                    }`}
                                  />
                                </td>
                              ))}
                              <td className="px-4 py-3 text-sm text-center font-medium text-gray-700">
                                {avg > 0 ? `${avg.toFixed(1)}% avg` : <span className="text-xs text-slate-400">-</span>}
                              </td>
                            </tr>
                          )
                        })()}

                      {/* Net Profit */}
                      {financialData.netProfit.year1 > 0 && (() => {
                        const validation = calculateQuarterlyTotal('netProfit')
                        return (
                          <tr>
                            <td className="px-4 py-3 text-sm font-medium text-brand-navy border-r border-slate-200">Net Profit</td>
                            <td className="px-4 py-3 text-sm text-gray-700 font-medium border-r border-slate-200 text-center">{formatCurrency(financialData.netProfit.year1)}</td>
                            {QUARTERS.map(q => (
                              <td key={q.id} className={`px-4 py-2 border-r border-slate-200 ${q.isPast ? 'bg-green-50' : q.isCurrent ? 'bg-amber-50' : ''}`}>
                                <input
                                  type="text"
                                  value={quarterlyTargets['netProfit']?.[q.id as keyof typeof quarterlyTargets['netProfit']] ? formatDollar(parseFloat(quarterlyTargets['netProfit'][q.id as keyof typeof quarterlyTargets['netProfit']])) : ''}
                                  onChange={(e) => updateQuarterlyTarget('netProfit', q.id as 'q1' | 'q2' | 'q3' | 'q4', parseDollarInput(e.target.value).toString())}
                                  placeholder={q.isPast || q.isCurrent ? 'Actual' : 'Target'}
                                  className={`w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none transition-colors ${
                                    q.isPast
                                      ? 'border-green-300 bg-white focus:ring-2 focus:ring-green-500 focus:border-transparent hover:border-green-400'
                                      : q.isCurrent
                                      ? 'border-amber-300 bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent hover:border-amber-400'
                                      : 'border-gray-300 focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300'
                                  }`}
                                />
                              </td>
                            ))}
                            <td className={`px-4 py-3 text-sm text-center font-medium ${
                              validation.total === 0 ? 'text-slate-400' :
                              validation.isValid ? 'bg-green-50 text-green-700' :
                              validation.variance > 0 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'
                            }`}>
                              {validation.total > 0 ? (
                                <div>
                                  <div className="font-semibold">{formatCurrency(validation.total)}</div>
                                  <div className="text-xs mt-0.5">
                                    {validation.variance > 0 ? '+' : ''}{formatCurrency(validation.variance)}
                                    {validation.isValid && ' ✓'}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs">Not set</span>
                              )}
                            </td>
                          </tr>
                        )
                      })()}

                      {/* Net Margin */}
                      {financialData.netMargin && financialData.netMargin.year1 > 0 && (() => {
                          const q1 = parseFloat(quarterlyTargets['netMargin']?.q1 || '0') || 0
                          const q2 = parseFloat(quarterlyTargets['netMargin']?.q2 || '0') || 0
                          const q3 = parseFloat(quarterlyTargets['netMargin']?.q3 || '0') || 0
                          const q4 = parseFloat(quarterlyTargets['netMargin']?.q4 || '0') || 0
                          const avg = (q1 + q2 + q3 + q4) / 4
                          return (
                            <tr>
                              <td className="px-4 py-3 text-sm font-medium text-brand-navy border-r border-slate-200">Net Margin</td>
                              <td className="px-4 py-3 text-sm text-gray-700 font-medium border-r border-slate-200 text-center">{financialData.netMargin.year1}%</td>
                              {QUARTERS.map(q => (
                                <td key={q.id} className={`px-4 py-2 border-r border-slate-200 ${q.isPast ? 'bg-green-50' : q.isCurrent ? 'bg-amber-50' : ''}`}>
                                  <input
                                    type="text"
                                    value={quarterlyTargets['netMargin']?.[q.id as keyof typeof quarterlyTargets['netMargin']] ? `${parseFloat(quarterlyTargets['netMargin'][q.id as keyof typeof quarterlyTargets['netMargin']])}%` : ''}
                                    onChange={(e) => updateQuarterlyTarget('netMargin', q.id as 'q1' | 'q2' | 'q3' | 'q4', e.target.value.replace('%', ''))}
                                    placeholder="0%"
                                                                        className={`w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none transition-colors ${
                                      q.isPast
                                        ? 'border-green-300 bg-white focus:ring-2 focus:ring-green-500 focus:border-transparent hover:border-green-400'
                                        : q.isCurrent
                                        ? 'border-amber-300 bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent hover:border-amber-400'
                                        : 'border-gray-300 focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300'
                                    }`}
                                  />
                                </td>
                              ))}
                              <td className="px-4 py-3 text-sm text-center font-medium text-gray-700">
                                {avg > 0 ? `${avg.toFixed(1)}% avg` : <span className="text-xs text-slate-400">-</span>}
                              </td>
                            </tr>
                          )
                        })()}
                    </tbody>
                </table>
              </div>

              {/* Core Metrics Section */}
              {coreMetrics && (
                <div>
                  <h4 className="text-sm font-semibold text-brand-navy mb-3">Core Business Metrics</h4>
                  <table className="w-full border-collapse border border-slate-200" style={{ tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: '21%' }} />
                      <col style={{ width: '13%' }} />
                      <col style={{ width: '16.5%' }} />
                      <col style={{ width: '16.5%' }} />
                      <col style={{ width: '16.5%' }} />
                      <col style={{ width: '16.5%' }} />
                    </colgroup>
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-brand-navy border-b border-r border-slate-200">Metric</th>
                        <th className="px-4 py-3 text-center text-sm font-semibold text-brand-navy border-b border-r border-slate-200">{yearLabel}</th>
                        {QUARTERS.map(q => (
                          <th key={q.id} className={`px-4 py-3 text-center text-sm font-semibold border-b border-r border-slate-200 ${q.isPast ? 'bg-green-50 text-green-800' : q.isCurrent ? 'bg-amber-50 text-amber-800' : 'text-brand-navy'}`}>
                            <div className="flex flex-col items-center gap-1">
                              <div className="flex items-center gap-1">
                                <span>{q.label}</span>
                                {q.isPast && <span className="text-[9px] px-1 py-0.5 bg-green-500 text-white rounded font-semibold">ACTUAL</span>}
                                {q.isCurrent && !q.isPast && <span className="text-[9px] px-1 py-0.5 bg-amber-500 text-white rounded font-semibold">CURRENT</span>}
                                {q.isNextQuarter && <span className="text-[9px] px-1 py-0.5 bg-brand-orange-500 text-white rounded font-semibold">PLANNING</span>}
                              </div>
                              <span className="text-[10px] font-normal text-gray-500">{q.months}</span>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                      <tbody className="bg-white divide-y divide-slate-200">
                        {coreMetrics.leadsPerMonth?.year1 > 0 && (() => {
                          const q1 = parseFloat(quarterlyTargets['leadsPerMonth']?.q1 || '0') || 0
                          const q2 = parseFloat(quarterlyTargets['leadsPerMonth']?.q2 || '0') || 0
                          const q3 = parseFloat(quarterlyTargets['leadsPerMonth']?.q3 || '0') || 0
                          const q4 = parseFloat(quarterlyTargets['leadsPerMonth']?.q4 || '0') || 0
                          const total = q1 + q2 + q3 + q4
                          return (
                            <tr>
                              <td className="px-4 py-3 text-sm font-medium text-brand-navy border-r border-slate-200">Leads Per Month</td>
                              <td className="px-4 py-3 text-sm text-gray-700 font-medium border-r border-slate-200 text-center">{coreMetrics.leadsPerMonth.year1}</td>
                              {QUARTERS.map(q => (
                                <td key={q.id} className={`px-4 py-2 border-r border-slate-200 ${q.isPast ? 'bg-green-50' : q.isCurrent ? 'bg-amber-50' : ''}`}>
                                  <input
                                    type="text"
                                    value={quarterlyTargets['leadsPerMonth']?.[q.id as keyof typeof quarterlyTargets['leadsPerMonth']] || ''}
                                    onChange={(e) => updateQuarterlyTarget('leadsPerMonth', q.id as 'q1' | 'q2' | 'q3' | 'q4', e.target.value)}
                                    placeholder="#"
                                                                        className={`w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none transition-colors ${
                                      q.isPast
                                        ? 'border-green-300 bg-white focus:ring-2 focus:ring-green-500 focus:border-transparent hover:border-green-400'
                                        : q.isCurrent
                                        ? 'border-amber-300 bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent hover:border-amber-400'
                                        : 'border-gray-300 focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300'
                                    }`}
                                  />
                                </td>
                              ))}
                            </tr>
                          )
                        })()}
                        {coreMetrics.conversionRate?.year1 > 0 && (() => {
                          const q1 = parseFloat(quarterlyTargets['conversionRate']?.q1 || '0') || 0
                          const q2 = parseFloat(quarterlyTargets['conversionRate']?.q2 || '0') || 0
                          const q3 = parseFloat(quarterlyTargets['conversionRate']?.q3 || '0') || 0
                          const q4 = parseFloat(quarterlyTargets['conversionRate']?.q4 || '0') || 0
                          const avg = (q1 + q2 + q3 + q4) / 4
                          return (
                            <tr>
                              <td className="px-4 py-3 text-sm font-medium text-brand-navy border-r border-slate-200">Conversion Rate</td>
                              <td className="px-4 py-3 text-sm text-gray-700 font-medium border-r border-slate-200 text-center">{coreMetrics.conversionRate.year1}%</td>
                              {QUARTERS.map(q => (
                                <td key={q.id} className={`px-4 py-2 border-r border-slate-200 ${q.isPast ? 'bg-green-50' : q.isCurrent ? 'bg-amber-50' : ''}`}>
                                  <input
                                    type="text"
                                    value={quarterlyTargets['conversionRate']?.[q.id as keyof typeof quarterlyTargets['conversionRate']] || ''}
                                    onChange={(e) => updateQuarterlyTarget('conversionRate', q.id as 'q1' | 'q2' | 'q3' | 'q4', e.target.value)}
                                    placeholder="%"
                                                                        className={`w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none transition-colors ${
                                      q.isPast
                                        ? 'border-green-300 bg-white focus:ring-2 focus:ring-green-500 focus:border-transparent hover:border-green-400'
                                        : q.isCurrent
                                        ? 'border-amber-300 bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent hover:border-amber-400'
                                        : 'border-gray-300 focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300'
                                    }`}
                                  />
                                </td>
                              ))}
                            </tr>
                          )
                        })()}
                        {coreMetrics.avgTransactionValue?.year1 > 0 && (() => {
                          const q1 = parseFloat(quarterlyTargets['avgTransactionValue']?.q1 || '0') || 0
                          const q2 = parseFloat(quarterlyTargets['avgTransactionValue']?.q2 || '0') || 0
                          const q3 = parseFloat(quarterlyTargets['avgTransactionValue']?.q3 || '0') || 0
                          const q4 = parseFloat(quarterlyTargets['avgTransactionValue']?.q4 || '0') || 0
                          const avg = (q1 + q2 + q3 + q4) / 4
                          return (
                            <tr>
                              <td className="px-4 py-3 text-sm font-medium text-brand-navy border-r border-slate-200">Avg Transaction Value</td>
                              <td className="px-4 py-3 text-sm text-gray-700 font-medium border-r border-slate-200 text-center">{formatCurrency(coreMetrics.avgTransactionValue.year1)}</td>
                              {QUARTERS.map(q => (
                                <td key={q.id} className={`px-4 py-2 border-r border-slate-200 ${q.isPast ? 'bg-green-50' : q.isCurrent ? 'bg-amber-50' : ''}`}>
                                  <input
                                    type="text"
                                    value={quarterlyTargets['avgTransactionValue']?.[q.id as keyof typeof quarterlyTargets['avgTransactionValue']] ? formatDollar(parseFloat(quarterlyTargets['avgTransactionValue'][q.id as keyof typeof quarterlyTargets['avgTransactionValue']])) : ''}
                                    onChange={(e) => updateQuarterlyTarget('avgTransactionValue', q.id as 'q1' | 'q2' | 'q3' | 'q4', parseDollarInput(e.target.value).toString())}
                                    placeholder="$0"
                                                                        className={`w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none transition-colors ${
                                      q.isPast
                                        ? 'border-green-300 bg-white focus:ring-2 focus:ring-green-500 focus:border-transparent hover:border-green-400'
                                        : q.isCurrent
                                        ? 'border-amber-300 bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent hover:border-amber-400'
                                        : 'border-gray-300 focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300'
                                    }`}
                                  />
                                </td>
                              ))}
                            </tr>
                          )
                        })()}
                        {coreMetrics.teamHeadcount?.year1 > 0 && (() => {
                          const q1 = parseFloat(quarterlyTargets['teamHeadcount']?.q1 || '0') || 0
                          const q2 = parseFloat(quarterlyTargets['teamHeadcount']?.q2 || '0') || 0
                          const q3 = parseFloat(quarterlyTargets['teamHeadcount']?.q3 || '0') || 0
                          const q4 = parseFloat(quarterlyTargets['teamHeadcount']?.q4 || '0') || 0
                          const avg = (q1 + q2 + q3 + q4) / 4
                          return (
                            <tr>
                              <td className="px-4 py-3 text-sm font-medium text-brand-navy border-r border-slate-200">Team Headcount</td>
                              <td className="px-4 py-3 text-sm text-gray-700 font-medium border-r border-slate-200 text-center">{coreMetrics.teamHeadcount.year1}</td>
                              {QUARTERS.map(q => (
                                <td key={q.id} className={`px-4 py-2 border-r border-slate-200 ${q.isPast ? 'bg-green-50' : q.isCurrent ? 'bg-amber-50' : ''}`}>
                                  <input
                                    type="text"
                                    value={quarterlyTargets['teamHeadcount']?.[q.id as keyof typeof quarterlyTargets['teamHeadcount']] || ''}
                                    onChange={(e) => updateQuarterlyTarget('teamHeadcount', q.id as 'q1' | 'q2' | 'q3' | 'q4', e.target.value)}
                                    placeholder="#"
                                                                        className={`w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none transition-colors ${
                                      q.isPast
                                        ? 'border-green-300 bg-white focus:ring-2 focus:ring-green-500 focus:border-transparent hover:border-green-400'
                                        : q.isCurrent
                                        ? 'border-amber-300 bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent hover:border-amber-400'
                                        : 'border-gray-300 focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300'
                                    }`}
                                  />
                                </td>
                              ))}
                            </tr>
                          )
                        })()}
                        {/* Revenue per Employee (Auto-Calculated) */}
                        {coreMetrics.teamHeadcount?.year1 > 0 && financialData && (() => {
                          // Calculate revenue per employee for each quarter
                          const revenueQ1 = parseFloat(quarterlyTargets['revenue']?.q1 || '0') || 0
                          const revenueQ2 = parseFloat(quarterlyTargets['revenue']?.q2 || '0') || 0
                          const revenueQ3 = parseFloat(quarterlyTargets['revenue']?.q3 || '0') || 0
                          const revenueQ4 = parseFloat(quarterlyTargets['revenue']?.q4 || '0') || 0

                          const headcountQ1 = parseFloat(quarterlyTargets['teamHeadcount']?.q1 || '0') || 0
                          const headcountQ2 = parseFloat(quarterlyTargets['teamHeadcount']?.q2 || '0') || 0
                          const headcountQ3 = parseFloat(quarterlyTargets['teamHeadcount']?.q3 || '0') || 0
                          const headcountQ4 = parseFloat(quarterlyTargets['teamHeadcount']?.q4 || '0') || 0

                          const rpeQ1 = headcountQ1 > 0 ? revenueQ1 / headcountQ1 : 0
                          const rpeQ2 = headcountQ2 > 0 ? revenueQ2 / headcountQ2 : 0
                          const rpeQ3 = headcountQ3 > 0 ? revenueQ3 / headcountQ3 : 0
                          const rpeQ4 = headcountQ4 > 0 ? revenueQ4 / headcountQ4 : 0

                          // Calculate year 1 baseline
                          const year1RPE = coreMetrics.teamHeadcount.year1 > 0
                            ? financialData.revenue.year1 / coreMetrics.teamHeadcount.year1
                            : 0

                          return (
                            <tr className="bg-brand-orange-50/50">
                              <td className="px-4 py-3 text-sm font-medium text-brand-navy border-r border-slate-200">
                                Revenue per Employee <span className="text-xs text-gray-500 font-normal">(Auto-Calc)</span>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700 font-medium border-r border-slate-200 text-center">
                                {formatCurrency(Math.round(year1RPE))}
                              </td>
                              <td className="px-4 py-2 border-r border-slate-200">
                                <div className="px-2 py-1.5 bg-slate-100 rounded text-sm text-center font-medium text-gray-700 border border-slate-200">
                                  {rpeQ1 > 0 ? formatCurrency(Math.round(rpeQ1)) : '-'}
                                </div>
                              </td>
                              <td className="px-4 py-2 border-r border-slate-200">
                                <div className="px-2 py-1.5 bg-slate-100 rounded text-sm text-center font-medium text-gray-700 border border-slate-200">
                                  {rpeQ2 > 0 ? formatCurrency(Math.round(rpeQ2)) : '-'}
                                </div>
                              </td>
                              <td className="px-4 py-2 border-r border-slate-200">
                                <div className="px-2 py-1.5 bg-slate-100 rounded text-sm text-center font-medium text-gray-700 border border-slate-200">
                                  {rpeQ3 > 0 ? formatCurrency(Math.round(rpeQ3)) : '-'}
                                </div>
                              </td>
                              <td className="px-4 py-2">
                                <div className="px-2 py-1.5 bg-slate-100 rounded text-sm text-center font-medium text-gray-700 border border-slate-200">
                                  {rpeQ4 > 0 ? formatCurrency(Math.round(rpeQ4)) : '-'}
                                </div>
                              </td>
                            </tr>
                          )
                        })()}
                        {coreMetrics.ownerHoursPerWeek?.year1 > 0 && (() => {
                          const q1 = parseFloat(quarterlyTargets['ownerHoursPerWeek']?.q1 || '0') || 0
                          const q2 = parseFloat(quarterlyTargets['ownerHoursPerWeek']?.q2 || '0') || 0
                          const q3 = parseFloat(quarterlyTargets['ownerHoursPerWeek']?.q3 || '0') || 0
                          const q4 = parseFloat(quarterlyTargets['ownerHoursPerWeek']?.q4 || '0') || 0
                          const avg = (q1 + q2 + q3 + q4) / 4
                          return (
                            <tr>
                              <td className="px-4 py-3 text-sm font-medium text-brand-navy border-r border-slate-200">Owner Hours Per Week</td>
                              <td className="px-4 py-3 text-sm text-gray-700 font-medium border-r border-slate-200 text-center">{coreMetrics.ownerHoursPerWeek.year1} hrs</td>
                              {QUARTERS.map(q => (
                                <td key={q.id} className={`px-4 py-2 border-r border-slate-200 ${q.isPast ? 'bg-green-50' : q.isCurrent ? 'bg-amber-50' : ''}`}>
                                  <input
                                    type="text"
                                    value={quarterlyTargets['ownerHoursPerWeek']?.[q.id as keyof typeof quarterlyTargets['ownerHoursPerWeek']] || ''}
                                    onChange={(e) => updateQuarterlyTarget('ownerHoursPerWeek', q.id as 'q1' | 'q2' | 'q3' | 'q4', e.target.value)}
                                    placeholder="#"
                                                                        className={`w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none transition-colors ${
                                      q.isPast
                                        ? 'border-green-300 bg-white focus:ring-2 focus:ring-green-500 focus:border-transparent hover:border-green-400'
                                        : q.isCurrent
                                        ? 'border-amber-300 bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent hover:border-amber-400'
                                        : 'border-gray-300 focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300'
                                    }`}
                                  />
                                </td>
                              ))}
                            </tr>
                          )
                        })()}
                      </tbody>
                  </table>
                </div>
              )}

              {/* KPIs Section */}
              {kpis && kpis.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-brand-navy mb-3">Key Performance Indicators</h4>
                  <table className="w-full border-collapse border border-slate-200" style={{ tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: '21%' }} />
                      <col style={{ width: '13%' }} />
                      <col style={{ width: '16.5%' }} />
                      <col style={{ width: '16.5%' }} />
                      <col style={{ width: '16.5%' }} />
                      <col style={{ width: '16.5%' }} />
                    </colgroup>
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-brand-navy border-b border-r border-slate-200">KPI</th>
                        <th className="px-4 py-3 text-center text-sm font-semibold text-brand-navy border-b border-r border-slate-200">{yearLabel}</th>
                        {QUARTERS.map(q => (
                          <th key={q.id} className={`px-4 py-3 text-center text-sm font-semibold border-b border-r border-slate-200 ${q.isPast ? 'bg-green-50 text-green-800' : q.isCurrent ? 'bg-amber-50 text-amber-800' : 'text-brand-navy'}`}>
                            <div className="flex flex-col items-center gap-1">
                              <div className="flex items-center gap-1">
                                <span>{q.label}</span>
                                {q.isPast && <span className="text-[9px] px-1 py-0.5 bg-green-500 text-white rounded font-semibold">ACTUAL</span>}
                                {q.isCurrent && !q.isPast && <span className="text-[9px] px-1 py-0.5 bg-amber-500 text-white rounded font-semibold">CURRENT</span>}
                                {q.isNextQuarter && <span className="text-[9px] px-1 py-0.5 bg-brand-orange-500 text-white rounded font-semibold">PLANNING</span>}
                              </div>
                              <span className="text-[10px] font-normal text-gray-500">{q.months}</span>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                      <tbody className="bg-white divide-y divide-slate-200">
                        {kpis.map((kpi) => {
                          const q1 = parseFloat(quarterlyTargets[kpi.id]?.q1 || '0') || 0
                          const q2 = parseFloat(quarterlyTargets[kpi.id]?.q2 || '0') || 0
                          const q3 = parseFloat(quarterlyTargets[kpi.id]?.q3 || '0') || 0
                          const q4 = parseFloat(quarterlyTargets[kpi.id]?.q4 || '0') || 0

                          // Determine unit type
                          const unit = (kpi.unit || '').toLowerCase()
                          const isCurrency = unit.includes('$') || unit.includes('dollar')
                          const isPercentage = unit.includes('%') || unit.includes('percent')

                          // Format value based on unit type (without showing unit text)
                          const formatKPIValue = (value: number) => {
                            if (!value) return '-'
                            if (isCurrency) {
                              return formatCurrency(value)
                            } else if (isPercentage) {
                              return `${value.toFixed(1)}%`
                            } else {
                              return value.toLocaleString()
                            }
                          }

                          // Get placeholder text based on unit type
                          const getPlaceholder = () => {
                            if (isCurrency) return '$'
                            if (isPercentage) return '%'
                            return '#'
                          }

                          return (
                            <tr key={kpi.id}>
                              <td className="px-4 py-3 text-sm font-medium text-brand-navy border-r border-slate-200">{kpi.name}</td>
                              <td className="px-4 py-3 text-sm text-gray-700 font-medium border-r border-slate-200 text-center">
                                {formatKPIValue(kpi.year1Target)}
                              </td>
                              {QUARTERS.map(q => (
                                <td key={q.id} className={`px-4 py-2 border-r border-slate-200 ${q.isPast ? 'bg-green-50' : q.isCurrent ? 'bg-amber-50' : ''}`}>
                                  <input
                                    type="text"
                                    value={quarterlyTargets[kpi.id]?.[q.id as keyof typeof quarterlyTargets[typeof kpi.id]] || ''}
                                    onChange={(e) => updateQuarterlyTarget(kpi.id, q.id as 'q1' | 'q2' | 'q3' | 'q4', e.target.value)}
                                    placeholder={getPlaceholder()}
                                                                        className={`w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none transition-colors ${
                                      q.isPast
                                        ? 'border-green-300 bg-white focus:ring-2 focus:ring-green-500 focus:border-transparent hover:border-green-400'
                                        : q.isCurrent
                                        ? 'border-amber-300 bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent hover:border-amber-400'
                                        : 'border-gray-300 focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300'
                                    }`}
                                  />
                                </td>
                              ))}
                            </tr>
                          )
                        })}
                      </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
        </div>
      )}

      {/* SECTION 2: Quarterly Execution Plan */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className={`flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm ${
            allUnlockedHaveInitiatives ? 'bg-green-500 text-white' : 'bg-slate-600 text-white'
          }`}>
            {allUnlockedHaveInitiatives ? <Check className="w-5 h-5" /> : '2'}
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-brand-navy">Quarterly Execution Plan</h3>
            <p className="text-sm text-gray-600">Assign initiatives to quarters (Max {MAX_PER_QUARTER} per quarter)</p>
          </div>
          {allUnlockedHaveInitiatives && (
            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded">
              ✓ Complete
            </span>
          )}
          <div className="relative group">
            <HelpCircle className="w-4 h-4 text-gray-400 cursor-help" />
            <span className="absolute left-6 top-0 w-64 p-3 bg-slate-800 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 pointer-events-none">
              Limiting to {MAX_PER_QUARTER} initiatives per quarter ensures your team can focus and execute effectively. Trying to do too much leads to nothing getting done well.
            </span>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-slate-200">
          <div className="p-6">
            {/* Quarter Status Summary Bar */}
            {twelveMonthInitiatives.length > 0 && (
              <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-slate-200">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Quarter Status Overview</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {QUARTERS.map((quarter) => {
                    const items = annualPlanByQuarter[quarter.id] || []
                    const assignedCount = items.filter(i => i.assignedTo).length
                    const isComplete = items.length > 0 && assignedCount === items.length
                    const isEmpty = items.length === 0
                    const isFull = items.length >= MAX_PER_QUARTER

                    return (
                      <div
                        key={quarter.id}
                        className={`p-3 rounded-lg border-2 ${
                          quarter.isLocked
                            ? 'bg-gray-100 border-gray-300 opacity-60'
                            : isEmpty
                            ? 'bg-amber-50 border-amber-200'
                            : isComplete
                            ? 'bg-green-50 border-green-300'
                            : 'bg-brand-orange-50 border-brand-orange-200'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-bold text-brand-navy">{quarter.label}</span>
                          {quarter.isLocked && (
                            <span className="text-[9px] px-1.5 py-0.5 bg-gray-400 text-white rounded font-semibold">LOCKED</span>
                          )}
                          {quarter.isNextQuarter && (
                            <span className="text-[9px] px-1.5 py-0.5 bg-brand-orange-500 text-white rounded font-semibold">PLAN NOW</span>
                          )}
                          {!quarter.isLocked && !quarter.isNextQuarter && isComplete && (
                            <Check className="w-4 h-4 text-green-600" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className={`font-medium ${
                            isEmpty ? 'text-amber-700' : isComplete ? 'text-green-700' : 'text-gray-600'
                          }`}>
                            {items.length}/{MAX_PER_QUARTER} initiatives
                          </span>
                          {items.length > 0 && (
                            <span className={`${assignedCount === items.length ? 'text-green-600' : 'text-amber-600'}`}>
                              • {assignedCount}/{items.length} assigned
                            </span>
                          )}
                        </div>
                        {isEmpty && !quarter.isLocked && (
                          <p className="text-[10px] text-amber-600 mt-1">Needs initiatives</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Batch Actions */}
            {twelveMonthInitiatives.length > 0 && (
              <div className="flex items-center justify-end gap-2 mb-4">
                <button
                  onClick={handleStaggerByPriority}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-brand-orange-50 text-brand-orange-700 rounded hover:bg-brand-orange-100 font-medium transition-colors"
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  By Priority
                </button>
              </div>
            )}

            {/* Empty State */}
            {teamMembers.length === 0 && (
              <div className="border-t border-slate-200 pt-4">
                <p className="text-sm text-gray-600 text-center py-4">
                  No team members found. Click "Assign to..." on any initiative below and select "Add New Person..." to add your team.
                </p>
              </div>
            )}

            {/* Keyboard Hints */}
            {twelveMonthInitiatives.length > 0 && (
              <p className="text-xs text-gray-500 mt-4">
                💡 Shortcuts: Press 1-4 to toggle quarters
              </p>
            )}

            {/* Warning if no initiatives */}
            {twelveMonthInitiatives.length === 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-900">No initiatives selected</p>
                    <p className="text-sm text-amber-700 mt-1">
                      Go back to Step 4 to select 5-10 initiatives first.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Kanban Board - Horizontal Columns */}
            {twelveMonthInitiatives.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {/* Unassigned Column */}
                <div className="md:col-span-2 lg:col-span-4 xl:col-span-1">
                  <div className="bg-gray-50 rounded-lg border-2 border-dashed border-slate-300 p-4 h-full">
                    <h4 className="font-semibold text-gray-700 text-sm mb-3 uppercase tracking-wider">
                      Available
                    </h4>
                    <p className="text-xs text-gray-500 mb-3">
                      {unassignedInitiatives.length} unassigned
                    </p>
                    <div className="space-y-2">
                      {unassignedInitiatives.length === 0 ? (
                        <p className="text-xs text-gray-500 text-center py-6">
                          All initiatives assigned ✓
                        </p>
                      ) : (
                        unassignedInitiatives.map((initiative) => {
                          const isRoadmap = initiative.source === 'roadmap'
                          const isOperational = initiative.ideaType === 'operational'

                          // Card styles matching Step 2: Roadmap=Navy, Strategic=Orange, Operational=White
                          const getCardStyle = () => {
                            if (isRoadmap) {
                              return 'bg-brand-navy border-brand-navy shadow-md hover:bg-brand-navy-700'
                            } else if (isOperational) {
                              return 'bg-white border-gray-300 hover:border-gray-400 hover:shadow-md'
                            } else {
                              return 'bg-brand-orange border-brand-orange shadow-md hover:bg-brand-orange-600'
                            }
                          }

                          const getTextColor = () => isOperational ? 'text-gray-900' : 'text-white'
                          const getSubTextColor = () => isOperational ? 'text-gray-700' : 'text-white/90'
                          const getGripColor = () => isOperational ? 'text-gray-500 group-hover:text-gray-700' : 'text-white/60 group-hover:text-white'

                          const getBadgeStyle = () => {
                            if (isRoadmap) return { bg: 'bg-white/20', text: 'text-white', label: 'ROADMAP' }
                            if (isOperational) return { bg: 'bg-gray-200', text: 'text-gray-700', label: 'OPERATIONAL' }
                            return { bg: 'bg-white/20', text: 'text-white', label: 'STRATEGIC' }
                          }
                          const badgeStyle = getBadgeStyle()

                          return (
                            <div
                              key={initiative.id}
                              draggable
                              onDragStart={() => handleDragStart(initiative.id, 'unassigned')}
                              className={`group flex items-start gap-2 p-3 rounded-lg border-2 cursor-move transition-all ${getCardStyle()}`}
                            >
                              <GripVertical className={`w-4 h-4 flex-shrink-0 mt-0.5 ${getGripColor()}`} />

                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-bold leading-tight ${getTextColor()}`}>
                                  {initiative.title}
                                </p>
                                {initiative.description && (
                                  <p className={`text-xs mt-1.5 leading-relaxed line-clamp-2 ${getSubTextColor()}`}>
                                    {initiative.description}
                                  </p>
                                )}
                                <span className={`inline-block mt-2 px-2 py-0.5 text-[10px] rounded font-semibold ${badgeStyle.bg} ${badgeStyle.text}`}>
                                  {badgeStyle.label}
                                </span>
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                </div>

                {/* Quarter Columns */}
                {QUARTERS.map((quarter) => {
                  const status = getQuarterStatus(quarter.id)
                  const items = annualPlanByQuarter[quarter.id] || []
                  const isExpanded = expandedQuarters.has(quarter.id)
                  const isFull = items.length >= MAX_PER_QUARTER
                  const isLockedQuarter = quarter.isLocked
                  const isCurrentQuarter = quarter.isCurrent
                  const isNextQuarter = quarter.isNextQuarter

                  return (
                    <div key={quarter.id} className="lg:col-span-1">
                      <div
                        className={`rounded-lg border-2 p-4 min-h-96 transition-all ${
                          isLockedQuarter
                            ? 'bg-gray-100 border-gray-300 opacity-60'
                            : isNextQuarter
                            ? 'bg-brand-orange-50 border-brand-orange-300 ring-2 ring-brand-orange-200'
                            : getStatusColor(status)
                        }`}
                        onDragOver={isLockedQuarter ? undefined : handleDragOver}
                        onDragLeave={isLockedQuarter ? undefined : handleDragLeave}
                        onDrop={isLockedQuarter ? undefined : (e) => handleDrop(e, quarter.id)}
                      >
                        {/* Quarter Header */}
                        <button
                          onClick={() => !isLockedQuarter && toggleQuarter(quarter.id)}
                          className="w-full text-left mb-4 pb-3 border-b border-current border-opacity-20"
                          disabled={isLockedQuarter}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h4 className={`font-bold text-sm uppercase tracking-wider ${isLockedQuarter ? 'text-gray-500' : 'text-brand-navy'}`}>
                                  {quarter.label}
                                </h4>
                                {quarter.isPast && (
                                  <span className="text-[10px] px-1.5 py-0.5 bg-gray-300 text-gray-600 rounded font-semibold">PAST</span>
                                )}
                                {isCurrentQuarter && !quarter.isPast && (
                                  <span className="text-[10px] px-1.5 py-0.5 bg-amber-500 text-white rounded font-semibold">NOW (LOCKED)</span>
                                )}
                                {isNextQuarter && (
                                  <span className="text-[10px] px-1.5 py-0.5 bg-brand-orange-500 text-white rounded font-semibold">PLANNING</span>
                                )}
                              </div>
                              <p className={`text-xs mt-1 ${isLockedQuarter ? 'text-gray-500' : 'text-gray-600'}`}>
                                {quarter.months} {quarter.startDate.getFullYear()}
                              </p>
                              <p className={`text-xs mt-0.5 ${isLockedQuarter ? 'text-gray-400' : 'text-gray-500'}`}>
                                {quarter.title}
                              </p>
                            </div>
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-gray-600" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-gray-600" />
                            )}
                          </div>
                          <p className={`text-xs font-medium mt-2 ${
                            isFull ? 'text-amber-700' : 'text-gray-700'
                          }`}>
                            {items.length} / {MAX_PER_QUARTER} initiatives
                            {isFull && ' (Full)'}
                          </p>
                        </button>

                        {/* Drop Zone */}
                        {isExpanded && (
                          <div className="min-h-20">

                            {items.length === 0 ? (
                              <p className={`text-xs text-center py-6 ${isLockedQuarter ? 'text-gray-400' : 'text-gray-500'}`}>
                                {isLockedQuarter ? 'Quarter is locked' : 'Drag initiatives here'}
                              </p>
                            ) : (
                              <div className="space-y-2">
                                {items.map((initiative, index) => {
                                  const assignedMember = initiative.assignedTo ? getMemberById(initiative.assignedTo) : null
                                  const isShowingAssignment = showAssignmentFor === initiative.id

                                  // Card styles matching Step 2: Roadmap=Navy, Strategic=Orange, Operational=White
                                  const isRoadmapItem = initiative.source === 'roadmap'
                                  const isOperationalItem = initiative.ideaType === 'operational'

                                  const getQuarterCardStyle = () => {
                                    if (isRoadmapItem) {
                                      return 'bg-brand-navy border-brand-navy-700'
                                    } else if (isOperationalItem) {
                                      return 'bg-white border-gray-300'
                                    } else {
                                      return 'bg-brand-orange border-brand-orange-600'
                                    }
                                  }

                                  const getQuarterTextColor = () => isOperationalItem ? 'text-gray-900' : 'text-white'
                                  const getQuarterSubTextColor = () => isOperationalItem ? 'text-gray-600' : 'text-white/80'
                                  const getQuarterIndexColor = () => isOperationalItem ? 'text-gray-500' : 'text-white/70'
                                  const getQuarterRemoveColor = () => isOperationalItem
                                    ? 'text-gray-300 hover:text-red-600'
                                    : 'text-white/40 hover:text-white'

                                  const getQuarterBadgeStyle = () => {
                                    if (isRoadmapItem) return { bg: 'bg-white/20', text: 'text-white', label: 'ROADMAP' }
                                    if (isOperationalItem) return { bg: 'bg-gray-200', text: 'text-gray-700', label: 'OPERATIONAL' }
                                    return { bg: 'bg-white/20', text: 'text-white', label: 'STRATEGIC' }
                                  }
                                  const quarterBadgeStyle = getQuarterBadgeStyle()

                                  return (
                                    <div
                                      key={initiative.id}
                                      draggable
                                      onDragStart={() => handleDragStart(initiative.id, quarter.id)}
                                      className={`p-3 rounded-lg border-2 cursor-move hover:shadow-md transition-all group ${getQuarterCardStyle()}`}
                                    >
                                  <div className="flex items-start justify-between gap-2 mb-2">
                                    <div className="flex items-start gap-2 flex-1">
                                      <span className={`text-xs font-bold mt-0.5 ${getQuarterIndexColor()}`}>
                                        {index + 1}
                                      </span>
                                      <div className="flex-1">
                                        <p className={`text-xs font-medium line-clamp-2 mb-1.5 ${getQuarterTextColor()}`}>
                                          {initiative.title}
                                        </p>
                                        <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded font-semibold ${quarterBadgeStyle.bg} ${quarterBadgeStyle.text}`}>
                                          {quarterBadgeStyle.label}
                                        </span>
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => handleRemoveFromQuarter(initiative.id, quarter.id)}
                                      className={`opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 ${getQuarterRemoveColor()}`}
                                      title="Remove"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
  
                                  {/* Person Assignment - Beautiful Design */}
                                  <div className="relative">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setShowAssignmentFor(isShowingAssignment ? null : initiative.id)
                                      }}
                                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded border transition-colors ${
                                        assignedMember
                                          ? peopleAtCapacityByQuarter[quarter.id]?.has(assignedMember.id)
                                            ? 'bg-red-50 border-red-200 hover:border-red-300'
                                            : 'bg-gray-50 border-slate-200 hover:border-slate-300'
                                          : 'bg-white border-dashed border-slate-300 hover:border-slate-400'
                                      }`}
                                    >
                                      {assignedMember ? (
                                        <>
                                          <div className={`w-5 h-5 rounded-full ${assignedMember.color} flex items-center justify-center flex-shrink-0`}>
                                            <span className="text-white text-xs font-bold">{assignedMember.initials}</span>
                                          </div>
                                          <span className="text-xs font-medium text-brand-navy flex-1 text-left">{assignedMember.name}</span>
                                        </>
                                      ) : (
                                        <>
                                          <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                                            <UserPlus className="w-3 h-3 text-slate-400" />
                                          </div>
                                          <span className="text-xs text-gray-500 flex-1 text-left">Assign to...</span>
                                        </>
                                      )}
                                      <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isShowingAssignment ? 'rotate-180' : ''}`} />
                                    </button>
  
                                    {/* Dropdown Menu */}
                                    {isShowingAssignment && (
                                      <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-10 max-h-80 overflow-y-auto min-w-[320px]">
                                        {/* Existing Team Members */}
                                        {teamMembers.map(member => {
                                          const count = assignmentCountsByQuarter[quarter.id]?.[member.id] || 0
                                          const isAtCapacity = count >= MAX_PER_PERSON
                                          const isCurrentlyAssigned = initiative.assignedTo === member.id
                                          const canAssign = !isAtCapacity || isCurrentlyAssigned
  
                                          return (
                                            <button
                                              key={member.id}
                                              onClick={(e) => {
                                                e.stopPropagation()
                                                if (canAssign) {
                                                  handleAssignPerson(initiative.id, quarter.id, member.id)
                                                }
                                              }}
                                              disabled={!canAssign}
                                              className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors ${
                                                isCurrentlyAssigned ? 'bg-brand-orange-50' : ''
                                              } ${!canAssign ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            >
                                              <div className={`w-8 h-8 rounded-full ${member.color} flex items-center justify-center flex-shrink-0`}>
                                                <span className="text-white text-sm font-bold">{member.initials}</span>
                                              </div>
                                              <div className="flex-1">
                                                <p className="text-sm font-medium text-brand-navy">{member.name}</p>
                                                <p className={`text-sm ${
                                                  isAtCapacity ? 'text-red-600' : 'text-gray-500'
                                                }`}>
                                                  {count}/{MAX_PER_PERSON} {isAtCapacity && '(Full)'}
                                                </p>
                                              </div>
                                              {isCurrentlyAssigned && (
                                                <Check className="w-5 h-5 text-brand-orange" />
                                              )}
                                            </button>
                                          )
                                        })}
  
                                        {/* Separator */}
                                        {teamMembers.length > 0 && (
                                          <div className="border-t border-slate-200 my-1"></div>
                                        )}
  
                                        {/* Add New Person Option */}
                                        {!showAddNewPerson ? (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              setShowAddNewPerson(true)
                                            }}
                                            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-brand-orange-50 transition-colors text-brand-orange"
                                          >
                                            <div className="w-8 h-8 rounded-full bg-brand-orange-100 flex items-center justify-center flex-shrink-0">
                                              <UserPlus className="w-4 h-4 text-brand-orange" />
                                            </div>
                                            <p className="text-sm font-medium">Add New Person...</p>
                                          </button>
                                        ) : (
                                          <div className="p-4 bg-gray-50 border-t border-slate-200" onClick={(e) => e.stopPropagation()}>
                                            <p className="text-sm font-semibold text-brand-navy mb-3">Add New Team Member</p>
                                            <input
                                              type="text"
                                              value={newPersonName}
                                              onChange={(e) => setNewPersonName(e.target.value)}
                                              placeholder="Full name"
                                              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg mb-2 focus:outline-none focus:ring-2 focus:ring-brand-orange"
                                              autoFocus
                                            />
                                            <input
                                              type="text"
                                              value={newPersonRole}
                                              onChange={(e) => setNewPersonRole(e.target.value)}
                                              placeholder="Role/Title (optional)"
                                              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg mb-3 focus:outline-none focus:ring-2 focus:ring-brand-orange"
                                            />
                                            <div className="flex items-center gap-2">
                                              <button
                                                onClick={() => handleAddTeamMember(initiative.id, quarter.id)}
                                                disabled={isSavingNewPerson || !newPersonName.trim()}
                                                className="flex-1 px-4 py-2.5 bg-brand-orange text-white text-sm rounded-lg hover:bg-brand-orange-600 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                              >
                                                {isSavingNewPerson ? 'Saving...' : 'Add & Assign'}
                                              </button>
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  setShowAddNewPerson(false)
                                                  setNewPersonName('')
                                                  setNewPersonRole('')
                                                }}
                                                className="px-4 py-2.5 bg-slate-200 text-gray-700 text-sm rounded-lg hover:bg-slate-300"
                                              >
                                                Cancel
                                              </button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                  )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Completion Messages */}
            {(() => {
              // Check if all unlocked quarters have at least 1 initiative
              const unlockedQuarters = QUARTERS.filter(q => !q.isLocked)
              const allUnlockedHaveInitiatives = unlockedQuarters.every(
                q => (annualPlanByQuarter[q.id] || []).length > 0
              )
              const allDistributed = twelveMonthInitiatives.length > 0 && unassignedInitiatives.length === 0

              if (allUnlockedHaveInitiatives && allDistributed) {
                return (
                  <div className="bg-brand-teal-50 border-2 border-brand-teal-300 rounded-lg p-4 mt-4">
                    <p className="text-base font-semibold text-brand-teal-800">
                      ✓ Step 4 Complete! All unlocked quarters have initiatives assigned.
                    </p>
                    <p className="text-sm text-brand-teal-700 mt-1">
                      You can proceed to Step 5 to define your sprint focus and key actions.
                    </p>
                  </div>
                )
              } else if (allUnlockedHaveInitiatives) {
                return (
                  <div className="bg-brand-teal-50 border border-brand-teal-200 rounded-lg p-3 mt-4">
                    <p className="text-sm text-brand-teal-800">
                      ✓ Minimum requirement met! You can proceed, or continue assigning remaining initiatives.
                    </p>
                  </div>
                )
              } else if (allDistributed) {
                return (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-4">
                    <p className="text-sm text-amber-800">
                      All initiatives distributed, but some unlocked quarters are empty. Add at least 1 initiative to each unlocked quarter.
                    </p>
                  </div>
                )
              }
              return null
            })()}
          </div>
        </div>
      </div>
    </div>
  )
}
