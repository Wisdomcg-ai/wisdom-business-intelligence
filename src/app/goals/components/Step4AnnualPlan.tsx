'use client'

import { StrategicInitiative, FinancialData, KPIData, YearType } from '../types'
import { ChevronDown, ChevronUp, AlertCircle, GripVertical, TrendingUp, X, UserPlus, Check, HelpCircle, DollarSign, Target, Activity } from 'lucide-react'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDollar, parseDollarInput } from '../utils/formatting'
import { calculateQuarters, deriveCurrentRemainderColumn, determinePlanYear, QuarterInfo } from '../utils/quarters'
import { TeamMember, getInitials, getColorForName } from '../utils/team'
import type { OnePagePlanData } from '@/app/one-page-plan/types'

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
   * Phase 14 extended-period support — when true, the wizard is planning a
   * 13-15 month first plan whose Year 1 begins mid-FY. Combined with
   * `planStartDate`, this trims the "Now" remainder column to end before
   * Y1 begins (B15) AND distributes auto-split across 5 periods instead of 4
   * (B16). When false, no behaviour change.
   */
  isExtendedPeriod?: boolean
  currentYearRemainingMonths?: number
  fiscalYearStart?: number
  /**
   * Plan Y1 start date. Required when `isExtendedPeriod=true` for B15's
   * boundary trim. ISO string from Supabase or a Date object both accepted.
   */
  planStartDate?: Date | string | null
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

// B4 (Phase 68) — category + priority badge palettes for initiative cards.
// MODULE-SCOPED (pure, no props/state) so they initialise at module load and
// can never sit in a temporal-dead-zone. Previously these were component-local
// `const`s declared ~130 lines BELOW the `categoryChips` useMemo that calls
// getCategoryStyle; when the card mounted with initiatives already loaded (the
// coach business-switch path), the memo factory ran before the const
// initialised → "Cannot access 'getCategoryStyle' before initialization".
const CATEGORY_PALETTE: Record<string, { bg: string; text: string; label: string }> = {
  marketing:             { bg: 'bg-pink-100',    text: 'text-pink-700',    label: 'MKTG' },
  finance:               { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'FIN'  },
  people:                { bg: 'bg-violet-100',  text: 'text-violet-700',  label: 'PPL'  },
  systems:               { bg: 'bg-sky-100',     text: 'text-sky-700',     label: 'SYS'  },
  'customer experience': { bg: 'bg-amber-100',   text: 'text-amber-700',   label: 'CX'   },
  customer_experience:   { bg: 'bg-amber-100',   text: 'text-amber-700',   label: 'CX'   },
  cx:                    { bg: 'bg-amber-100',   text: 'text-amber-700',   label: 'CX'   },
  leadership:            { bg: 'bg-indigo-100',  text: 'text-indigo-700',  label: 'LEAD' },
  time:                  { bg: 'bg-orange-100',  text: 'text-orange-700',  label: 'TIME' },
  diversification:       { bg: 'bg-rose-100',    text: 'text-rose-700',    label: 'DIV'  },
  growth:                { bg: 'bg-rose-100',    text: 'text-rose-700',    label: 'GROW' },
  operations:            { bg: 'bg-cyan-100',    text: 'text-cyan-700',    label: 'OPS'  },
  product:               { bg: 'bg-fuchsia-100', text: 'text-fuchsia-700', label: 'PROD' },
  sales:                 { bg: 'bg-lime-100',    text: 'text-lime-700',    label: 'SALE' },
  other:                 { bg: 'bg-gray-200',    text: 'text-gray-700',    label: 'OTHR' },
}

const PRIORITY_PALETTE: Record<string, { bg: string; text: string; label: string }> = {
  high:   { bg: 'bg-red-100',   text: 'text-red-700',   label: 'HIGH' },
  medium: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'MED'  },
  low:    { bg: 'bg-slate-100', text: 'text-slate-700', label: 'LOW'  },
}

const getCategoryStyle = (category?: string | null) => {
  if (!category) return null
  const key = category.trim().toLowerCase()
  if (CATEGORY_PALETTE[key]) return CATEGORY_PALETTE[key]
  return { bg: 'bg-gray-200', text: 'text-gray-700', label: category.toUpperCase().slice(0, 4) }
}

const getPriorityStyle = (priority?: string | null) => {
  if (!priority) return null
  return PRIORITY_PALETTE[priority.toLowerCase()] ?? null
}

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
  isExtendedPeriod, // Phase 14 extended-period — un-deprecated by B15/B16
  currentYearRemainingMonths: _currentYearRemainingMonths,
  fiscalYearStart,
  planStartDate: planStartDateProp,
  planYear: planYearProp,
}: Step4Props) {
  // Calculate dynamic quarters. planYearProp (derived from saved year1EndDate)
  // takes precedence; fallback is determinePlanYear(yearType) for the case
  // where the plan period hasn't been persisted yet (brand-new plan).
  const planYear = planYearProp ?? determinePlanYear(yearType)
  const QUARTERS = useMemo(() => calculateQuarters(yearType, planYear), [yearType, planYear])
  const yearLabel = `${yearType} ${planYear}`

  // Normalize the planStartDate prop into a Date | null. Accepts both Date
  // and ISO string (Supabase returns date columns as strings).
  const planStartDate = useMemo<Date | null>(() => {
    if (!planStartDateProp) return null
    if (planStartDateProp instanceof Date) return planStartDateProp
    const d = new Date(planStartDateProp)
    return isNaN(d.getTime()) ? null : d
  }, [planStartDateProp])

  // "Current FY remainder" pseudo-column — purely date-driven, with B15
  // extended-period boundary trim applied when isExtendedPeriod=true.
  // See deriveCurrentRemainderColumn for the visibility rules.
  const currentRemainderInfo = useMemo(
    () => deriveCurrentRemainderColumn(new Date(), planYear, fiscalYearStart ?? 7, 3, !!isExtendedPeriod, planStartDate),
    [planYear, fiscalYearStart, isExtendedPeriod, planStartDate],
  )

  // Combined column list for initiative sections: [current_remainder] + Q1-Q4
  const allPeriods = useMemo(() => {
    if (!currentRemainderInfo) return QUARTERS
    return [currentRemainderInfo, ...QUARTERS]
  }, [currentRemainderInfo, QUARTERS])

  const [expandedQuarters, setExpandedQuarters] = useState<Set<string>>(
    new Set(['current_remainder', 'q1', 'q2', 'q3', 'q4'])
  )

  // Step-1-style collapsible section toggles. All three sections start expanded
  // so users see everything by default; collapsing is for screen-real-estate
  // management once the user has filled them in.
  const [financialCollapsed, setFinancialCollapsed] = useState(false)
  const [coreMetricsCollapsed, setCoreMetricsCollapsed] = useState(false)
  const [kpisCollapsed, setKpisCollapsed] = useState(false)
  const [executionCollapsed, setExecutionCollapsed] = useState(false)
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
  // B6 (Phase 68): Available-pool category filter. 'all' = no filter.
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  // B7: per-quarter note in-progress draft (avoids firing setQuarterlyTargets
  // on every keystroke; commits on blur).
  const [draftQuarterNotes, setDraftQuarterNotes] = useState<Record<string, string>>({})
  // B8 (Phase 68): "Save plan version" snapshot trigger state.
  const [savingSnapshot, setSavingSnapshot] = useState(false)
  const [lastSavedVersion, setLastSavedVersion] = useState<number | null>(null)


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

  // Get unassigned initiatives.
  //
  // Match by TITLE rather than by id because each step_type ('twelve_month',
  // 'q1'..'q4', 'current_remainder') is persisted as separate DB rows in
  // strategic_initiatives — they share no foreign key linking the q1 copy back
  // to its twelve_month parent. So the same conceptual initiative ends up with
  // a different UUID in each step_type. Filtering by id therefore always
  // failed to dedupe and the initiative appeared in BOTH the assigned quarter
  // AND the Available pool. (Also dedupes against the same-title quarter copy
  // produced by a re-save round-trip.)
  //
  // Long-term fix would be a `parent_initiative_id` column on
  // strategic_initiatives so quarter assignments reference the twelve_month
  // source row. Tracked in the data-model debt but out of scope for this
  // hotfix — we want fit2shine unblocked today.
  const assignedTitles = new Set(
    Object.values(annualPlanByQuarter)
      .flat()
      .map(i => (i.title || '').trim().toLowerCase())
      .filter(t => t.length > 0)
  )
  const unassignedInitiatives = twelveMonthInitiatives.filter(
    i => !assignedTitles.has((i.title || '').trim().toLowerCase())
  )

  // B6: chip-filtered subset of the unassigned pool — used only by the
  // Available pool grid render. The quarter card `+ Add` dropdown and the
  // drop handler keep using the unfiltered `unassignedInitiatives` so the
  // chip filter only affects display, not assignment mechanics.
  const filteredUnassignedInitiatives = selectedCategory === 'all'
    ? unassignedInitiatives
    : unassignedInitiatives.filter(i => (i.category || 'uncategorised').trim().toLowerCase() === selectedCategory)

  // B6: derived chips for the Available pool category filter row.
  const categoryChips = useMemo(() => {
    const counts = new Map<string, number>()
    for (const i of twelveMonthInitiatives) {
      const key = (i.category || 'uncategorised').trim().toLowerCase()
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    const knownOrder = ['marketing', 'finance', 'people', 'systems', 'customer_experience', 'customer experience', 'cx', 'leadership', 'time', 'diversification', 'growth', 'operations', 'product', 'sales', 'other']
    const known = knownOrder.filter(k => counts.has(k))
    const unknown = Array.from(counts.keys()).filter(k => !knownOrder.includes(k)).sort()
    return [...known, ...unknown].map(key => {
      const style = getCategoryStyle(key) ?? { bg: 'bg-gray-200', text: 'text-gray-700', label: key.toUpperCase().slice(0, 8) }
      return { key, label: style.label, bg: style.bg, text: style.text, count: counts.get(key) || 0 }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getCategoryStyle is component-local with stable refs in palette objects
  }, [twelveMonthInitiatives])

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

  // getCategoryStyle / getPriorityStyle + their palettes are now MODULE-SCOPED
  // (top of file) so they can never sit in a temporal-dead-zone when the
  // earlier `categoryChips` useMemo factory calls them on a data-loaded mount.

  // B5 (Phase 68) — per-quarter engine balance: small stacked bar under each
  // quarter card header showing the mix of initiative categories. Recomputed
  // per render (≤5 items per quarter, negligible cost). Returns an empty
  // array when the quarter has no items so the placeholder strip shows.
  const computeCategoryBreakdown = (items: StrategicInitiative[]): Array<{ key: string; bg: string; label: string; count: number; widthPct: number }> => {
    if (!items || items.length === 0) return []
    const counts = new Map<string, number>()
    for (const it of items) {
      const raw = (it.category || 'uncategorised').trim().toLowerCase()
      counts.set(raw, (counts.get(raw) || 0) + 1)
    }
    const total = items.length
    // Stable order: known palette keys first (PALETTE-defined sequence),
    // then unknowns alphabetical. Keeps the bar visually stable as the
    // operator drags items between quarters.
    const knownOrder = ['marketing', 'finance', 'people', 'systems', 'customer_experience', 'customer experience', 'cx', 'leadership', 'time', 'diversification', 'growth', 'operations', 'product', 'sales', 'other']
    const known = knownOrder.filter(k => counts.has(k))
    const unknown = Array.from(counts.keys()).filter(k => !knownOrder.includes(k)).sort()
    const ordered = [...known, ...unknown]
    return ordered.map(key => {
      const style = getCategoryStyle(key) ?? { bg: 'bg-gray-300', text: 'text-gray-700', label: 'OTHER' }
      const count = counts.get(key) ?? 0
      return {
        key,
        bg: style.bg,
        label: style.label,
        count,
        widthPct: (count / total) * 100,
      }
    })
  }

  // Coloured cards (brand-navy / brand-orange) need white-on-translucent
  // badges, otherwise the contextual `bg-{color}-100` palette is unreadable.
  const overrideBadgeForColoredCard = (isColored: boolean, style: { bg: string; text: string; label: string }) => {
    if (!isColored) return style
    return { ...style, bg: 'bg-white/20', text: 'text-white' }
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

  // B7 (Phase 68) — per-quarter notes ("why this quarter?") persisted via
  // the existing quarterlyTargets JSONB shape. Uses a magic metricKey
  // 'period_notes' whose inner record shape matches the existing
  // {q1,q2,q3,q4,current_remainder?} pattern — no Step4Props type change
  // required. Tolerant read: missing notes default to empty string.
  const getQuarterNote = (quarterId: string): string => {
    const notesByQuarter = quarterlyTargets['period_notes'] as Record<string, string> | undefined
    return notesByQuarter?.[quarterId] ?? ''
  }

  const setQuarterNote = (quarterId: string, value: string) => {
    const existing = (quarterlyTargets['period_notes'] || { q1: '', q2: '', q3: '', q4: '' }) as Record<string, string>
    setQuarterlyTargets({
      ...quarterlyTargets,
      // 'period_notes' is an additive metricKey — same shape as q1/q2/q3/q4
      // metric records, just stored as string text instead of numeric values.
      period_notes: {
        ...existing,
        [quarterId]: value,
      } as { q1: string; q2: string; q3: string; q4: string; current_remainder?: string },
    })
  }

  // While the textarea is focused, render the local draft; once the field
  // blurs we drop the draft entry so future reads come from quarterlyTargets.
  const getQuarterNoteDraft = (quarterId: string) =>
    draftQuarterNotes[quarterId] !== undefined ? draftQuarterNotes[quarterId] : getQuarterNote(quarterId)

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
  // Splits the annual target evenly across the planned periods.
  //
  // B16 (Phase 68): for extended-period plans (isExtendedPeriod=true) where
  // Y1 includes the remainder column, distribute across 5 periods instead of
  // 4 — the remainder IS part of Y1 in that case. For non-extended plans,
  // distribution stays across q1..q4 only (remainder excluded, behaviour
  // unchanged).
  const autoSplitEvenly = () => {
    if (!financialData) return
    const includeRemainder = !!(isExtendedPeriod && currentRemainderInfo)
    const periodCount = includeRemainder ? 5 : 4
    const newTargets = { ...quarterlyTargets }
    const updateMetric = (metricKey: string, annual: number) => {
      if (annual <= 0) return
      const each = Math.round(annual / periodCount)
      const distributed: { q1: string; q2: string; q3: string; q4: string; current_remainder?: string } = {
        ...(newTargets[metricKey] || { q1: '', q2: '', q3: '', q4: '' }),
        q1: each.toString(),
        q2: each.toString(),
        q3: each.toString(),
        // Q4 absorbs rounding remainder so the sum equals annual exactly.
        q4: (annual - each * (periodCount - 1)).toString(),
      }
      if (includeRemainder) {
        distributed.current_remainder = each.toString()
      }
      // Preserve the explicit cast — the strict `quarterlyTargets` index
      // signature at Step4Props:21-22 means tsc can't prove the spread
      // matches the shape without it. Relaxing the index signature is out
      // of scope for B16.
      newTargets[metricKey] = {
        ...(newTargets[metricKey] || {}),
        ...distributed,
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

  // B8 (Phase 68): build the Step-4-owned slice of OnePagePlanData.
  // vision/mission/coreValues/SWOT/companyName/ownerGoals are NOT computed
  // here — the API route at /api/plan-snapshots reads them server-side from
  // strategy_data + swot_items + business_profiles + businesses and merges
  // them in before insert. Keeps the wizard component lean and matches the
  // 68-08 baseline composition exactly.
  type Step4PartialPlanData = Pick<OnePagePlanData,
    'financialGoals' | 'coreMetrics' | 'kpis' | 'strategicInitiatives'
    | 'quarterlyRocks' | 'currentQuarter' | 'currentQuarterLabel' | 'yearType' | 'planYear'>

  const composePlanData = (): Step4PartialPlanData => {
    const fg = financialData
    const cm = coreMetrics
    return {
      financialGoals: {
        year3:   { revenue: fg?.revenue?.year3 ?? 0, grossProfit: fg?.grossProfit?.year3 ?? 0, netProfit: fg?.netProfit?.year3 ?? 0 },
        year2:   { revenue: fg?.revenue?.year2 ?? 0, grossProfit: fg?.grossProfit?.year2 ?? 0, netProfit: fg?.netProfit?.year2 ?? 0 },
        year1:   { revenue: fg?.revenue?.year1 ?? 0, grossProfit: fg?.grossProfit?.year1 ?? 0, netProfit: fg?.netProfit?.year1 ?? 0 },
        quarter: { revenue: 0, grossProfit: 0, netProfit: 0 },
      },
      coreMetrics: {
        year3:   cm ?? {},
        year2:   cm ?? {},
        year1:   cm ?? {},
        quarter: {},
      },
      kpis: kpis.map(k => ({
        name: k.friendlyName || k.name,
        category: ((k as unknown as { category?: string }).category) || 'General',
        year3Target: Number(k.year3Target) || 0,
        year1Target: Number(k.year1Target) || 0,
        quarterTarget: 0,
      })),
      strategicInitiatives: twelveMonthInitiatives.map(i => {
        const inQuarters: string[] = []
        for (const [q, items] of Object.entries(annualPlanByQuarter)) {
          if ((items || []).some(x => x.id === i.id || (x.title || '').trim().toLowerCase() === (i.title || '').trim().toLowerCase())) {
            inQuarters.push(q.toUpperCase())
          }
        }
        return { title: i.title, quarters: inQuarters, owner: i.assignedTo || undefined }
      }),
      quarterlyRocks: [],
      currentQuarter: 'q1',
      currentQuarterLabel: yearLabel,
      yearType,
      planYear,
    }
  }

  const handleSaveSnapshot = async () => {
    if (savingSnapshot) return
    setSavingSnapshot(true)
    try {
      const step4_plan_data = composePlanData()
      const res = await fetch('/api/plan-snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId, step4_plan_data }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        const msg = json?.error || `Save failed (${res.status})`
        alert(`Could not save plan version: ${msg}`)
        return
      }
      setLastSavedVersion(json.version_number as number)
      alert(`Plan version ${json.version_number} saved.`)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'network error'
      alert(`Could not save plan version: ${message}`)
    } finally {
      setSavingSnapshot(false)
    }
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

      {/* ── FINANCIAL TARGETS — Step-1-style card with quarterly columns ── */}
      {financialData && (() => {
        type MetricRow = { key: string; label: string; isPercentage: boolean }
        const FINANCIAL_ROWS: MetricRow[] = [
          { key: 'revenue', label: 'Revenue', isPercentage: false },
          { key: 'grossProfit', label: 'Gross Profit', isPercentage: false },
          { key: 'grossMargin', label: 'Gross Margin', isPercentage: true },
          { key: 'netProfit', label: 'Net Profit', isPercentage: false },
          { key: 'netMargin', label: 'Net Margin', isPercentage: true },
        ]
        const annualValueFor = (key: string): number => {
          if (!financialData) return 0
          if (key === 'revenue') return financialData.revenue.year1
          if (key === 'grossProfit') return financialData.grossProfit.year1
          if (key === 'grossMargin') return (financialData.grossMargin?.year1 ?? 0) as number
          if (key === 'netProfit') return financialData.netProfit.year1
          if (key === 'netMargin') return (financialData.netMargin?.year1 ?? 0) as number
          return 0
        }
        return (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-5 flex items-center justify-between">
              <div
                onClick={() => setFinancialCollapsed(!financialCollapsed)}
                className="cursor-pointer flex items-center gap-3 flex-1 hover:opacity-80 transition-opacity"
              >
                <div className="p-2 bg-brand-orange-100 rounded-lg">
                  <DollarSign className="w-5 h-5 text-brand-orange" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Financial Targets</h3>
                  <p className="text-sm text-gray-600">Break Year 1 financial goals down by quarter for {yearLabel}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); autoSplitEvenly() }}
                  disabled={
                    !(financialData.revenue.year1 > 0 ||
                      financialData.grossProfit.year1 > 0 ||
                      financialData.netProfit.year1 > 0)
                  }
                  className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded border border-brand-orange text-brand-orange hover:bg-brand-orange hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Split annual goals evenly across the 4 FY quarters"
                >
                  Auto-split evenly
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); clearTargets() }}
                  className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Clear
                </button>
                <button
                  onClick={() => setFinancialCollapsed(!financialCollapsed)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  {financialCollapsed ? (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                  )}
                </button>
              </div>
            </div>
            {!financialCollapsed && (
              <div className="border-t border-gray-200 p-4 sm:p-6 bg-gradient-to-b from-white to-gray-50">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gradient-to-r from-brand-orange-50 to-brand-orange-100 border-b-2 border-brand-orange-200">
                        <th className="text-left p-3 text-sm font-bold text-gray-700 sticky left-0 bg-brand-orange-50 z-10 w-[200px]">Metric</th>
                        <th className="text-center p-3 text-sm font-bold text-gray-700 w-[110px]">Annual</th>
                        {allPeriods.map((q) => (
                          <th key={q.id} className="text-center p-3 text-sm font-bold text-gray-700 w-[110px]">
                            <div>{q.label}</div>
                            <div className="text-xs font-normal text-gray-500 mt-1">{q.months}</div>
                          </th>
                        ))}
                        <th className="text-center p-3 text-sm font-bold text-gray-700 w-[120px]">Q Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {FINANCIAL_ROWS.map((m, idx) => {
                        const annual = annualValueFor(m.key)
                        const validation = calculateQuarterlyTotal(m.key)
                        const metric = quarterlyTargets[m.key] as Record<string, string> | undefined
                        return (
                          <tr key={m.key} className={`border-b border-gray-200 hover:bg-brand-orange-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                            <td className="p-3 sticky left-0 z-10 bg-inherit">
                              <span className="font-semibold text-gray-900 text-sm">{m.label}</span>
                            </td>
                            <td className="p-3 text-center text-sm font-medium text-gray-700">
                              {annual > 0
                                ? (m.isPercentage ? `${annual}%` : formatCurrency(annual))
                                : <span className="text-xs text-gray-400">Set in Step 1</span>}
                            </td>
                            {allPeriods.map((q) => {
                              const raw = metric?.[q.id] || ''
                              const display = raw && !m.isPercentage ? formatDollar(parseFloat(raw)) : raw ? `${raw}%` : ''
                              return (
                                <td key={q.id} className="p-2 text-center">
                                  <input
                                    type="text"
                                    value={display}
                                    onChange={(e) => updateQuarterlyTarget(
                                      m.key,
                                      q.id,
                                      m.isPercentage ? e.target.value.replace('%', '') : parseDollarInput(e.target.value).toString(),
                                    )}
                                    placeholder={m.isPercentage ? '0%' : '$0'}
                                    className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300 transition-colors"
                                  />
                                </td>
                              )
                            })}
                            <td className={`p-3 text-center text-sm font-medium ${
                              validation.total === 0 ? 'text-gray-400' :
                              !m.isPercentage && annual > 0 && validation.isValid ? 'bg-green-50 text-green-700' :
                              !m.isPercentage && annual > 0 ? 'bg-amber-50 text-amber-700' : 'text-gray-700'
                            }`}>
                              {validation.total > 0 ? (
                                <div>
                                  <div className="font-semibold">{m.isPercentage ? `${validation.total.toFixed(1)}%` : formatCurrency(validation.total)}</div>
                                  {!m.isPercentage && annual > 0 && (
                                    <div className="text-xs mt-0.5">
                                      {validation.variance >= 0 ? '+' : ''}{formatCurrency(validation.variance)}{validation.isValid && ' ✓'}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs">—</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {/* Mobile-only: show auto-split button below the (horizontally scrolled) table */}
                <div className="sm:hidden mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={autoSplitEvenly}
                    disabled={!(financialData.revenue.year1 > 0)}
                    className="flex-1 px-3 py-2 text-xs font-semibold rounded border border-brand-orange text-brand-orange hover:bg-brand-orange hover:text-white disabled:opacity-40"
                  >
                    Auto-split evenly
                  </button>
                  <button
                    type="button"
                    onClick={clearTargets}
                    className="flex-1 px-3 py-2 text-xs font-medium rounded border border-slate-300 text-slate-600"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* ── CORE BUSINESS METRICS — Step-1-style ── */}
      {financialData && coreMetrics && (() => {
        type CoreRow = { key: string; label: string; isPercentage?: boolean; isCurrency?: boolean; year1?: number }
        const CORE_ROWS: CoreRow[] = [
          { key: 'leadsPerMonth', label: 'Leads / Month', year1: coreMetrics.leadsPerMonth?.year1 },
          { key: 'conversionRate', label: 'Conversion Rate', isPercentage: true, year1: coreMetrics.conversionRate?.year1 },
          { key: 'avgTransactionValue', label: 'Avg Transaction Value', isCurrency: true, year1: coreMetrics.avgTransactionValue?.year1 },
          { key: 'teamHeadcount', label: 'Team Headcount', year1: coreMetrics.teamHeadcount?.year1 },
          { key: 'ownerHoursPerWeek', label: 'Owner Hours / Week', year1: coreMetrics.ownerHoursPerWeek?.year1 },
        ]
        // B2 (Phase 68): Owner Hours always visible — even when year1 isn't set.
        // Coach can't drop it silently because Luke's "off the tools" trajectory
        // is the whole point. When year1 is 0/unset for ownerHoursPerWeek, the
        // Annual cell renders a "Set in Step 1 →" CTA (see render block below).
        const visibleRows = CORE_ROWS.filter(r => (r.year1 ?? 0) > 0 || r.key === 'ownerHoursPerWeek')
        if (visibleRows.length === 0) return null
        return (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-5 flex items-center justify-between">
              <div
                onClick={() => setCoreMetricsCollapsed(!coreMetricsCollapsed)}
                className="cursor-pointer flex items-center gap-3 flex-1 hover:opacity-80 transition-opacity"
              >
                <div className="p-2 bg-brand-orange-100 rounded-lg">
                  <Target className="w-5 h-5 text-brand-orange" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Core Business Metrics</h3>
                  <p className="text-sm text-gray-600">Operational targets by quarter</p>
                </div>
              </div>
              <button
                onClick={() => setCoreMetricsCollapsed(!coreMetricsCollapsed)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                {coreMetricsCollapsed ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronUp className="w-5 h-5 text-gray-400" />}
              </button>
            </div>
            {!coreMetricsCollapsed && (
              <div className="border-t border-gray-200 p-4 sm:p-6 bg-gradient-to-b from-white to-gray-50">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gradient-to-r from-brand-orange-50 to-brand-orange-100 border-b-2 border-brand-orange-200">
                        <th className="text-left p-3 text-sm font-bold text-gray-700 sticky left-0 bg-brand-orange-50 z-10 w-[200px]">Metric</th>
                        <th className="text-center p-3 text-sm font-bold text-gray-700 w-[110px]">Annual</th>
                        {allPeriods.map((q) => (
                          <th key={q.id} className="text-center p-3 text-sm font-bold text-gray-700 w-[110px]">
                            <div>{q.label}</div>
                            <div className="text-xs font-normal text-gray-500 mt-1">{q.months}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((m, idx) => {
                        const metric = quarterlyTargets[m.key] as Record<string, string> | undefined
                        return (
                          <tr key={m.key} className={`border-b border-gray-200 hover:bg-brand-orange-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                            <td className="p-3 sticky left-0 z-10 bg-inherit">
                              <span className="font-semibold text-gray-900 text-sm">{m.label}</span>
                            </td>
                            <td className="p-3 text-center text-sm font-medium text-gray-700">
                              {m.key === 'ownerHoursPerWeek' && (m.year1 ?? 0) <= 0 ? (
                                <button
                                  type="button"
                                  onClick={() => { document.querySelector('[data-step="1"]')?.scrollIntoView({ behavior: 'smooth' }) }}
                                  className="text-brand-orange underline hover:text-brand-orange-700 text-sm"
                                  title="Set Owner Hours / Week in Step 1"
                                >
                                  Set in Step 1 →
                                </button>
                              ) : (
                                m.isPercentage ? `${m.year1}%` : m.isCurrency ? formatCurrency(m.year1 ?? 0) : (m.year1 ?? 0)
                              )}
                            </td>
                            {allPeriods.map((q) => {
                              const raw = metric?.[q.id] || ''
                              return (
                                <td key={q.id} className="p-2 text-center">
                                  <input
                                    type="text"
                                    value={raw}
                                    onChange={(e) => updateQuarterlyTarget(m.key, q.id, e.target.value)}
                                    placeholder={m.isPercentage ? '0%' : m.isCurrency ? '$0' : '0'}
                                    className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                                  />
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* ── KEY PERFORMANCE INDICATORS — Step-1-style ── */}
      {kpis.length > 0 && (() => {
        return (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-5 flex items-center justify-between">
              <div
                onClick={() => setKpisCollapsed(!kpisCollapsed)}
                className="cursor-pointer flex items-center gap-3 flex-1 hover:opacity-80 transition-opacity"
              >
                <div className="p-2 bg-brand-orange-100 rounded-lg">
                  <Activity className="w-5 h-5 text-brand-orange" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Key Performance Indicators</h3>
                  <p className="text-sm text-gray-600">{kpis.length} KPI{kpis.length === 1 ? '' : 's'} from Step 1, broken down by quarter</p>
                </div>
              </div>
              <button
                onClick={() => setKpisCollapsed(!kpisCollapsed)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                {kpisCollapsed ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronUp className="w-5 h-5 text-gray-400" />}
              </button>
            </div>
            {!kpisCollapsed && (
              <div className="border-t border-gray-200 p-4 sm:p-6 bg-gradient-to-b from-white to-gray-50">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gradient-to-r from-brand-orange-50 to-brand-orange-100 border-b-2 border-brand-orange-200">
                        <th className="text-left p-3 text-sm font-bold text-gray-700 sticky left-0 bg-brand-orange-50 z-10 w-[200px]">KPI</th>
                        <th className="text-center p-3 text-sm font-bold text-gray-700 w-[110px]">Annual</th>
                        {allPeriods.map((q) => (
                          <th key={q.id} className="text-center p-3 text-sm font-bold text-gray-700 w-[110px]">
                            <div>{q.label}</div>
                            <div className="text-xs font-normal text-gray-500 mt-1">{q.months}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {kpis.map((kpi, idx) => {
                        const metricKey = `kpi_${kpi.id}`
                        const metric = quarterlyTargets[metricKey] as Record<string, string> | undefined
                        return (
                          <tr key={kpi.id} className={`border-b border-gray-200 hover:bg-brand-orange-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                            <td className="p-3 sticky left-0 z-10 bg-inherit">
                              <span className="font-semibold text-gray-900 text-sm">{kpi.friendlyName || kpi.name}</span>
                            </td>
                            <td className="p-3 text-center text-sm font-medium text-gray-700">
                              {kpi.year1Target || <span className="text-xs text-gray-400">—</span>}
                            </td>
                            {allPeriods.map((q) => {
                              const raw = metric?.[q.id] || ''
                              return (
                                <td key={q.id} className="p-2 text-center">
                                  <input
                                    type="text"
                                    value={raw}
                                    onChange={(e) => updateQuarterlyTarget(metricKey, q.id, e.target.value)}
                                    placeholder="0"
                                    className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                                  />
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* ── QUARTERLY EXECUTION PLAN — kanban for initiative assignment ── */}
      {financialData && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-5 flex items-center justify-between">
            <div
              onClick={() => setExecutionCollapsed(!executionCollapsed)}
              className="cursor-pointer flex items-center gap-3 flex-1 hover:opacity-80 transition-opacity"
            >
              <div className="p-2 bg-brand-orange-100 rounded-lg">
                <TrendingUp className="w-5 h-5 text-brand-orange" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Quarterly Execution Plan</h3>
                <p className="text-sm text-gray-600">Drag initiatives into quarters or use the + Add dropdown — max {MAX_PER_QUARTER} per quarter</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* B3 (Phase 68): surface the existing handleStaggerByPriority — function existed but no UI called it. */}
              {!executionCollapsed && twelveMonthInitiatives.length > 0 && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleStaggerByPriority() }}
                  className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded border border-brand-orange text-brand-orange hover:bg-brand-orange hover:text-white transition-colors"
                  title="Distribute initiatives across Q1-Q4 by priority (HIGH first, LOW last)"
                >
                  Stagger by priority
                </button>
              )}
              <button
                onClick={() => setExecutionCollapsed(!executionCollapsed)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                {executionCollapsed ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronUp className="w-5 h-5 text-gray-400" />}
              </button>
            </div>
          </div>
          {!executionCollapsed && (
            <div className="border-t border-gray-200 p-4 sm:p-6 bg-gradient-to-b from-white to-gray-50">
              {twelveMonthInitiatives.length === 0 ? (
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
              ) : (
                <>
                  {/* Quarter columns — drop zones with optional + Add dropdown */}
                  <div className={`grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 ${allPeriods.length === 5 ? 'xl:grid-cols-5' : 'xl:grid-cols-4'}`}>
                    {allPeriods.map((quarter) => {
                      const items = annualPlanByQuarter[quarter.id] || []
                      const isFull = items.length >= MAX_PER_QUARTER
                      const isLockedQuarter = quarter.isLocked
                      const isCurrentRemainder = quarter.id === 'current_remainder'
                      return (
                        <div
                          key={quarter.id}
                          onDragOver={!isLockedQuarter ? handleDragOver : undefined}
                          onDrop={!isLockedQuarter ? (e) => handleDrop(e, quarter.id) : undefined}
                          className={`rounded-lg border-2 p-3 flex flex-col min-h-[180px] ${
                            isCurrentRemainder ? 'border-amber-300 bg-amber-50/50'
                            : quarter.isCurrent ? 'border-amber-300 bg-amber-50/30'
                            : quarter.isNextQuarter ? 'border-brand-orange bg-orange-50/30'
                            : 'border-slate-200 bg-white'
                          }`}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
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
                          {/* B5: per-quarter engine balance bar — category mix of assigned initiatives. */}
                          {(() => {
                            const segments = computeCategoryBreakdown(items)
                            const titleText = segments.length === 0
                              ? 'No initiatives assigned to this quarter yet'
                              : segments.map(s => `${s.label}: ${s.count}`).join(' · ')
                            return (
                              <div
                                className="engine-balance-bar h-1.5 w-full flex rounded-sm overflow-hidden mb-2 bg-gray-100"
                                title={titleText}
                                role="img"
                                aria-label={`Engine balance: ${titleText}`}
                              >
                                {segments.map(s => (
                                  <div key={s.key} className={s.bg} style={{ width: `${s.widthPct}%` }} />
                                ))}
                              </div>
                            )
                          })()}
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
                                  handleDrop({ preventDefault: () => {} } as React.DragEvent, quarter.id)
                                }}
                                className="text-[10px] border border-slate-200 rounded px-1 py-0.5 text-brand-orange font-semibold hover:border-brand-orange focus:outline-none focus:ring-1 focus:ring-brand-orange max-w-[110px]"
                              >
                                <option value="">+ Add</option>
                                {unassignedInitiatives.map((ui) => (
                                  <option key={ui.id} value={ui.id}>{ui.title}</option>
                                ))}
                              </select>
                            )}
                          </div>
                          <div className="space-y-1.5 flex-1 min-h-[60px]">
                            {items.length === 0 ? (
                              <p className="text-[11px] text-center py-3 text-gray-400 italic">
                                {isLockedQuarter ? 'Quarter is locked' : 'Drag here or use + Add'}
                              </p>
                            ) : (
                              items.map((initiative) => {
                                const isRoadmap = initiative.source === 'roadmap'
                                const isOperational = initiative.ideaType === 'operational'
                                const cardBg = isRoadmap ? 'bg-brand-navy text-white border-brand-navy'
                                  : isOperational ? 'bg-white text-gray-900 border-gray-300'
                                  : 'bg-brand-orange text-white border-brand-orange'
                                const subTextColor = isOperational ? 'text-gray-500' : 'text-white/70'
                                const isColored = isRoadmap || !isOperational
                                const cat = getCategoryStyle(initiative.category)
                                const pri = getPriorityStyle(initiative.priority)
                                return (
                                  <div
                                    key={initiative.id}
                                    draggable
                                    onDragStart={() => handleDragStart(initiative.id, quarter.id)}
                                    className={`group flex items-start gap-1.5 p-2 rounded border-2 cursor-move transition-all ${cardBg}`}
                                  >
                                    <GripVertical className={`w-3 h-3 flex-shrink-0 mt-0.5 ${subTextColor}`} />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-medium leading-snug line-clamp-2">{initiative.title}</p>
                                      {(cat || pri) && (
                                        <div className="flex flex-wrap gap-1 mt-1">
                                          {cat && (() => {
                                            const s = overrideBadgeForColoredCard(isColored, cat)
                                            return <span className={`px-1 py-0.5 text-[9px] rounded font-semibold ${s.bg} ${s.text}`}>{s.label}</span>
                                          })()}
                                          {pri && (() => {
                                            const s = overrideBadgeForColoredCard(isColored, pri)
                                            return <span className={`px-1 py-0.5 text-[9px] rounded font-semibold ${s.bg} ${s.text}`}>{s.label}</span>
                                          })()}
                                        </div>
                                      )}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveFromQuarter(initiative.id, quarter.id)}
                                      className={`opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ${subTextColor} hover:text-red-300`}
                                      title="Remove from quarter"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                )
                              })
                            )}
                          </div>
                          {/* B7: per-quarter notes. Commits on blur to avoid setQuarterlyTargets on every keystroke. */}
                          <div className="mt-2 pt-2 border-t border-gray-200">
                            <label
                              htmlFor={`quarter-notes-${quarter.id}`}
                              className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 block mb-1"
                            >
                              Why this quarter?
                            </label>
                            <textarea
                              id={`quarter-notes-${quarter.id}`}
                              value={getQuarterNoteDraft(quarter.id)}
                              onChange={(e) => setDraftQuarterNotes(prev => ({ ...prev, [quarter.id]: e.target.value }))}
                              onBlur={(e) => {
                                const value = e.target.value
                                const current = getQuarterNote(quarter.id)
                                if (value !== current) setQuarterNote(quarter.id, value)
                                setDraftQuarterNotes(prev => {
                                  const next = { ...prev }
                                  delete next[quarter.id]
                                  return next
                                })
                              }}
                              placeholder="Optional — capture why these initiatives belong here"
                              rows={2}
                              className="w-full text-xs px-2 py-1 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-orange focus:border-brand-orange resize-none"
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Available pool */}
                  <div
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, 'unassigned')}
                    className="mt-4 bg-gray-50 rounded-lg border-2 border-dashed border-slate-300 p-4"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-brand-navy text-sm">
                        Available initiatives <span className="text-gray-500 font-normal">({filteredUnassignedInitiatives.length}{selectedCategory !== 'all' && unassignedInitiatives.length !== filteredUnassignedInitiatives.length ? ` of ${unassignedInitiatives.length}` : ''})</span>
                      </h4>
                      <p className="text-xs text-gray-500">Drag into a quarter or use + Add</p>
                    </div>
                    {/* B6: category chip filter row */}
                    {categoryChips.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3" role="tablist" aria-label="Filter Available initiatives by category">
                        <button
                          type="button"
                          role="tab"
                          aria-selected={selectedCategory === 'all'}
                          onClick={() => setSelectedCategory('all')}
                          className={`px-2 py-1 text-[10px] font-semibold rounded-full border transition-colors ${
                            selectedCategory === 'all'
                              ? 'bg-brand-navy text-white border-brand-navy'
                              : 'bg-white text-gray-700 border-gray-300 hover:border-brand-navy'
                          }`}
                        >
                          All ({twelveMonthInitiatives.length})
                        </button>
                        {categoryChips.map(chip => (
                          <button
                            key={chip.key}
                            type="button"
                            role="tab"
                            aria-selected={selectedCategory === chip.key}
                            onClick={() => setSelectedCategory(chip.key)}
                            className={`px-2 py-1 text-[10px] font-semibold rounded-full border transition-colors ${
                              selectedCategory === chip.key
                                ? `${chip.bg} ${chip.text} border-transparent`
                                : 'bg-white text-gray-700 border-gray-300 hover:border-gray-500'
                            }`}
                          >
                            {chip.label} ({chip.count})
                          </button>
                        ))}
                      </div>
                    )}
                    {filteredUnassignedInitiatives.length === 0 ? (
                      <p className="text-xs text-center py-4 text-gray-500">
                        {selectedCategory === 'all' ? 'All initiatives assigned ✓' : 'No initiatives in this category — try All'}
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-[40vh] overflow-y-auto pr-1">
                        {filteredUnassignedInitiatives.map((initiative) => {
                          const isRoadmap = initiative.source === 'roadmap'
                          const isOperational = initiative.ideaType === 'operational'
                          const cardBg = isRoadmap ? 'bg-brand-navy text-white border-brand-navy'
                            : isOperational ? 'bg-white text-gray-900 border-gray-300'
                            : 'bg-brand-orange text-white border-brand-orange'
                          const subTextColor = isOperational ? 'text-gray-500' : 'text-white/70'
                          const badgeStyle = isRoadmap ? { bg: 'bg-white/20', text: 'text-white', label: 'ROADMAP' }
                            : isOperational ? { bg: 'bg-gray-200', text: 'text-gray-700', label: 'OPERATIONAL' }
                            : { bg: 'bg-white/20', text: 'text-white', label: 'STRATEGIC' }
                          // B4: category + priority badges sit alongside the source badge.
                          const isColored = isRoadmap || !isOperational
                          const cat = getCategoryStyle(initiative.category)
                          const pri = getPriorityStyle(initiative.priority)
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
                                <div className="flex flex-wrap gap-1 mt-1">
                                  <span className={`px-1 py-0.5 text-[9px] rounded font-semibold ${badgeStyle.bg} ${badgeStyle.text}`}>
                                    {badgeStyle.label}
                                  </span>
                                  {cat && (() => {
                                    const s = overrideBadgeForColoredCard(isColored, cat)
                                    return <span className={`px-1 py-0.5 text-[9px] rounded font-semibold ${s.bg} ${s.text}`}>{s.label}</span>
                                  })()}
                                  {pri && (() => {
                                    const s = overrideBadgeForColoredCard(isColored, pri)
                                    return <span className={`px-1 py-0.5 text-[9px] rounded font-semibold ${s.bg} ${s.text}`}>{s.label}</span>
                                  })()}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* B8 (Phase 68): Save plan version snapshot trigger */}
      <div className="flex items-center justify-between bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Save plan version</h3>
          <p className="text-xs text-gray-600 mt-0.5">
            Capture current Step 4 state as a snapshot you can refer back to.
            {lastSavedVersion !== null && (
              <span className="ml-2 text-brand-orange font-semibold">Last saved: v{lastSavedVersion}</span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={handleSaveSnapshot}
          disabled={savingSnapshot}
          className="px-4 py-2 text-sm font-semibold rounded bg-brand-orange text-white hover:bg-brand-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {savingSnapshot ? 'Saving…' : 'Save plan version'}
        </button>
      </div>

    </div>
  )
}
