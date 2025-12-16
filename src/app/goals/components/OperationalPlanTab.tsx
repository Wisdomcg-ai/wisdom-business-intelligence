'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { Plus, X, ChevronDown, ChevronUp, Briefcase, Sparkles, Clock, CheckCircle2, Pencil, Save, User, UserPlus, Lightbulb } from 'lucide-react'
import {
  BUSINESS_ENGINES,
  FREQUENCY_LABELS,
  getHabitsByEngine,
  type FrequencyOption,
  type SuggestedHabit
} from '../data/operational-habits'
import { OperationalActivity } from '../services/operational-activities-service'
import { StrategicInitiative, TeamMember } from '../types'
import { getInitials, getColorForName } from '../utils/team'
import { createClient } from '@/lib/supabase/client'

// Frequency options for selector
const FREQUENCY_OPTIONS: { value: FrequencyOption; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: '3x_week', label: '3x/week' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
]

interface OperationalPlanTabProps {
  operationalActivities?: OperationalActivity[]
  setOperationalActivities?: (activities: OperationalActivity[]) => void
  operationalIdeasFromStep2?: StrategicInitiative[]
  allStrategicIdeas?: StrategicInitiative[]
  setStrategicIdeas?: (ideas: StrategicInitiative[]) => void
  businessId?: string
}

export default function OperationalPlanTab({
  operationalActivities: activitiesProp,
  setOperationalActivities: setActivitiesProp,
  operationalIdeasFromStep2 = [],
  allStrategicIdeas = [],
  setStrategicIdeas,
  businessId
}: OperationalPlanTabProps) {
  // Use prop state if provided, otherwise fall back to local state
  const [localActivities, setLocalActivities] = useState<OperationalActivity[]>([])
  const activities = activitiesProp || localActivities
  const setActivities = setActivitiesProp || setLocalActivities

  // State for expanded engines
  const [expandedEngines, setExpandedEngines] = useState<Set<string>>(new Set(['time', 'leadership']))
  const [showSuggestionsFor, setShowSuggestionsFor] = useState<string | null>(null)

  // State for suggestions panel
  const [showSuggestionsPanel, setShowSuggestionsPanel] = useState(false)
  const [selectedEngineTab, setSelectedEngineTab] = useState<string>(BUSINESS_ENGINES[0].id)
  const [selectedHabits, setSelectedHabits] = useState<Set<string>>(new Set())

  // Team members state
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [isLoadingTeamMembers, setIsLoadingTeamMembers] = useState(true)
  const [showAssignmentFor, setShowAssignmentFor] = useState<string | null>(null)
  const [showAddNewPerson, setShowAddNewPerson] = useState(false)
  const [newPersonName, setNewPersonName] = useState('')
  const [newPersonRole, setNewPersonRole] = useState('')
  const [isSavingNewPerson, setIsSavingNewPerson] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Load team members from Supabase on mount
  useEffect(() => {
    const loadTeamMembers = async () => {
      setIsLoadingTeamMembers(true)

      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          console.log('[OperationalPlanTab] No user logged in, using localStorage fallback')
          loadFromLocalStorage()
          return
        }

        const targetBusinessId = businessId || user.id
        if (!targetBusinessId) {
          console.log('[OperationalPlanTab] No businessId, using localStorage fallback')
          loadFromLocalStorage()
          return
        }

        // Load from business_profiles (key_roles + owner_info)
        const { data: profile, error: profileError } = await supabase
          .from('business_profiles')
          .select('key_roles, owner_info')
          .eq('id', targetBusinessId)
          .single()

        if (profileError) {
          console.error('[OperationalPlanTab] Error loading business profile:', profileError)
          loadFromLocalStorage()
          return
        }

        if (profile) {
          const members: TeamMember[] = []

          // Add owner from owner_info
          if (profile.owner_info && typeof profile.owner_info === 'object') {
            const ownerInfo = profile.owner_info as Record<string, unknown>
            if (ownerInfo.owner_name) {
              members.push({
                id: `owner-${targetBusinessId}`,
                name: ownerInfo.owner_name as string,
                email: (ownerInfo.owner_email as string) || '',
                role: 'Owner',
                type: 'employee',
                initials: getInitials(ownerInfo.owner_name as string),
                color: getColorForName(ownerInfo.owner_name as string),
                businessId: targetBusinessId,
                userId: user.id,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              })
            }

            // Add business partners from owner_info.partners
            if (ownerInfo.partners && Array.isArray(ownerInfo.partners)) {
              (ownerInfo.partners as Array<{ name?: string }>).forEach((partner, index) => {
                if (partner.name && partner.name.trim()) {
                  members.push({
                    id: `partner-${targetBusinessId}-${index}`,
                    name: partner.name,
                    email: '',
                    role: 'Partner',
                    type: 'employee',
                    initials: getInitials(partner.name),
                    color: getColorForName(partner.name),
                    businessId: targetBusinessId,
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
            (profile.key_roles as Array<{ name?: string; email?: string; role?: string; type?: string }>).forEach((role, index) => {
              if (role.name && role.name.trim()) {
                members.push({
                  id: `role-${targetBusinessId}-${index}`,
                  name: role.name,
                  email: role.email || '',
                  role: role.role || 'Team Member',
                  type: (role.type as 'employee' | 'contractor') || 'employee',
                  initials: getInitials(role.name),
                  color: getColorForName(role.name),
                  businessId: targetBusinessId,
                  userId: user.id,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString()
                })
              }
            })
          }

          console.log(`[OperationalPlanTab] Loaded ${members.length} team members from Supabase`)
          setTeamMembers(members)
          // Cache to localStorage as backup
          localStorage.setItem('team_members', JSON.stringify(members))
        } else {
          loadFromLocalStorage()
        }
      } catch (error) {
        console.error('[OperationalPlanTab] Error loading team members:', error)
        loadFromLocalStorage()
      } finally {
        setIsLoadingTeamMembers(false)
      }
    }

    const loadFromLocalStorage = () => {
      const stored = localStorage.getItem('team_members')
      if (stored) {
        try {
          const members = JSON.parse(stored)
          setTeamMembers(members)
          console.log(`[OperationalPlanTab] Loaded ${members.length} team members from localStorage`)
        } catch (e) {
          console.error('[OperationalPlanTab] Failed to parse localStorage team members')
          setTeamMembers([])
        }
      } else {
        setTeamMembers([])
      }
      setIsLoadingTeamMembers(false)
    }

    loadTeamMembers()
  }, [businessId])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showAssignmentFor && dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowAssignmentFor(null)
        setShowAddNewPerson(false)
        setNewPersonName('')
        setNewPersonRole('')
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showAssignmentFor])

  // Close dropdown on Escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && showAssignmentFor) {
        setShowAssignmentFor(null)
        setShowAddNewPerson(false)
        setNewPersonName('')
        setNewPersonRole('')
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [showAssignmentFor])

  // Get team member by ID
  const getMemberById = (id: string) => teamMembers.find(m => m.id === id)

  // Assign team member to activity
  const assignToActivity = (activityId: string, memberId: string | null) => {
    updateActivity(activityId, { assignedTo: memberId || undefined })
    setShowAssignmentFor(null)
  }

  // Add new team member and assign to activity (saves to Supabase)
  const addNewTeamMember = async (activityId: string) => {
    if (!newPersonName.trim()) return

    setIsSavingNewPerson(true)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      const name = newPersonName.trim()
      const role = newPersonRole.trim() || 'Team Member'
      const now = new Date().toISOString()
      const targetBusinessId = businessId || user?.id || 'local'

      // Create new member object
      const newMember: TeamMember = {
        id: `role-${targetBusinessId}-${Date.now()}`,
        name,
        role,
        type: 'employee',
        initials: getInitials(name),
        color: getColorForName(name),
        businessId: targetBusinessId,
        userId: user?.id || 'local',
        createdAt: now,
        updatedAt: now
      }

      // Update local state immediately for responsive UI
      const updatedMembers = [...teamMembers, newMember]
      setTeamMembers(updatedMembers)
      localStorage.setItem('team_members', JSON.stringify(updatedMembers))

      // Assign new member to the activity
      updateActivity(activityId, { assignedTo: newMember.id })

      // Save to Supabase if we have a valid businessId and user
      if (user && targetBusinessId && targetBusinessId !== 'local') {
        // Get current key_roles from database
        const { data: profile, error: profileError } = await supabase
          .from('business_profiles')
          .select('key_roles')
          .eq('id', targetBusinessId)
          .single()

        if (profileError) {
          console.error('[OperationalPlanTab] Error fetching profile for team member save:', profileError)
        } else {
          const currentRoles = (profile?.key_roles as Array<{ name: string; role?: string; type?: string }>) || []

          // Add new role
          const newRole = {
            name,
            role,
            type: 'employee',
            email: ''
          }

          const updatedRoles = [...currentRoles, newRole]

          // Save back to database
          const { error: updateError } = await supabase
            .from('business_profiles')
            .update({ key_roles: updatedRoles })
            .eq('id', targetBusinessId)

          if (updateError) {
            console.error('[OperationalPlanTab] Error saving team member to Supabase:', updateError)
          } else {
            console.log('[OperationalPlanTab] Successfully saved new team member to Supabase')
          }
        }
      }

      // Reset form
      setNewPersonName('')
      setNewPersonRole('')
      setShowAddNewPerson(false)
      setShowAssignmentFor(null)
    } catch (error) {
      console.error('[OperationalPlanTab] Error adding team member:', error)
    } finally {
      setIsSavingNewPerson(false)
    }
  }

  // Add suggested habit to activities
  const addSuggestedHabit = (habit: SuggestedHabit) => {
    // Check if already added
    const alreadyAdded = activities.some(
      a => a.function === habit.engine && a.name === habit.name
    )
    if (alreadyAdded) return

    const newActivity: OperationalActivity = {
      id: crypto.randomUUID(),
      function: habit.engine,
      name: habit.name,
      description: habit.description,
      frequency: habit.recommendedFrequency,
      recommendedFrequency: habit.recommendedFrequency,
      source: 'suggested'
    }
    setActivities([...activities, newActivity])
  }

  // Add custom habit
  const addCustomHabit = (engineId: string) => {
    const newActivity: OperationalActivity = {
      id: crypto.randomUUID(),
      function: engineId,
      name: '',
      description: '',
      frequency: 'weekly',
      source: 'custom'
    }
    setActivities([...activities, newActivity])
  }

  // Update activity
  const updateActivity = (id: string, updates: Partial<OperationalActivity>) => {
    setActivities(activities.map(a => a.id === id ? { ...a, ...updates } : a))
  }

  // Delete activity
  const deleteActivity = (id: string) => {
    setActivities(activities.filter(a => a.id !== id))
  }

  // Get activities for an engine
  const getActivitiesForEngine = (engineId: string) => {
    return activities.filter(a => a.function === engineId)
  }

  // Toggle engine expansion
  const toggleEngine = (engineId: string) => {
    const newExpanded = new Set(expandedEngines)
    if (newExpanded.has(engineId)) {
      newExpanded.delete(engineId)
    } else {
      newExpanded.add(engineId)
    }
    setExpandedEngines(newExpanded)
  }

  // Check if a suggested habit is already added
  const isHabitAdded = (habit: SuggestedHabit) => {
    return activities.some(
      a => a.function === habit.engine && a.name === habit.name
    )
  }

  // Toggle habit selection in panel
  const toggleHabitSelection = (habitId: string) => {
    const newSelected = new Set(selectedHabits)
    if (newSelected.has(habitId)) {
      newSelected.delete(habitId)
    } else {
      newSelected.add(habitId)
    }
    setSelectedHabits(newSelected)
  }

  // Add all selected habits from the panel
  const addSelectedHabits = () => {
    const allHabits = BUSINESS_ENGINES.flatMap(engine => getHabitsByEngine(engine.id))
    const habitsToAdd = allHabits.filter(h => selectedHabits.has(h.id) && !isHabitAdded(h))

    const newActivities: OperationalActivity[] = habitsToAdd.map(habit => ({
      id: crypto.randomUUID(),
      function: habit.engine,
      name: habit.name,
      description: habit.description,
      frequency: habit.recommendedFrequency,
      recommendedFrequency: habit.recommendedFrequency,
      source: 'suggested'
    }))

    setActivities([...activities, ...newActivities])
    setSelectedHabits(new Set())
    setShowSuggestionsPanel(false)
  }

  // Get count of selected habits for an engine
  const getSelectedCountForEngine = (engineId: string) => {
    const engineHabits = getHabitsByEngine(engineId)
    return engineHabits.filter(h => selectedHabits.has(h.id)).length
  }

  // Get total selected count
  const totalSelectedCount = selectedHabits.size

  // Check if a Step 2 idea is already added
  const isIdeaAlreadyAdded = (idea: StrategicInitiative) => {
    return activities.some(
      a => a.source === 'step2' && a.name === idea.title
    )
  }

  // Track selected engine for each Step 2 idea
  const [ideaEngineSelections, setIdeaEngineSelections] = useState<Record<string, string>>({})

  // Edit state for Step 2 ideas
  const [editingIdeaId, setEditingIdeaId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')

  // Edit state for added activities (in engine cards)
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null)
  const [editActivityName, setEditActivityName] = useState('')
  const [editActivityDescription, setEditActivityDescription] = useState('')

  // Start editing an activity
  const startEditingActivity = (activity: OperationalActivity) => {
    setEditingActivityId(activity.id)
    setEditActivityName(activity.name)
    setEditActivityDescription(activity.description || '')
  }

  // Save edited activity
  const saveEditedActivity = () => {
    if (!editingActivityId || !editActivityName.trim()) return

    updateActivity(editingActivityId, {
      name: editActivityName.trim(),
      description: editActivityDescription.trim() || undefined
    })
    setEditingActivityId(null)
    setEditActivityName('')
    setEditActivityDescription('')
  }

  // Cancel editing activity
  const cancelEditingActivity = () => {
    setEditingActivityId(null)
    setEditActivityName('')
    setEditActivityDescription('')
  }

  // Start editing an idea
  const startEditingIdea = (idea: StrategicInitiative) => {
    setEditingIdeaId(idea.id)
    setEditTitle(idea.title)
    setEditDescription(idea.description || '')
  }

  // Save edited idea
  const saveEditedIdea = (ideaId: string) => {
    if (!setStrategicIdeas || !allStrategicIdeas) return

    const updatedIdeas = allStrategicIdeas.map(idea =>
      idea.id === ideaId
        ? { ...idea, title: editTitle, description: editDescription }
        : idea
    )
    setStrategicIdeas(updatedIdeas)
    setEditingIdeaId(null)
  }

  // Cancel editing
  const cancelEditing = () => {
    setEditingIdeaId(null)
    setEditTitle('')
    setEditDescription('')
  }

  // Add operational idea from Step 2
  const addIdeaFromStep2 = (idea: StrategicInitiative, engineId: string) => {
    if (isIdeaAlreadyAdded(idea)) return

    const newActivity: OperationalActivity = {
      id: crypto.randomUUID(),
      function: engineId,
      name: idea.title,
      description: idea.description || '',
      frequency: 'weekly', // Default to weekly
      source: 'step2'
    }
    setActivities([...activities, newActivity])
  }

  // Map Step 2 category to Step 5 engine ID
  const categoryToEngineMap: Record<string, string> = {
    'marketing': 'attract',
    'operations': 'convert',
    'customer_experience': 'deliver',
    'people': 'people',
    'systems': 'systems',
    'finance': 'finance',
    'product': 'leadership',
    'other': 'time',
    'misc': 'time'
  }

  // Get selected engine for an idea (default to mapped category or first engine)
  const getSelectedEngineForIdea = (ideaId: string, category?: string) => {
    // If user has manually selected, use that
    if (ideaEngineSelections[ideaId]) {
      return ideaEngineSelections[ideaId]
    }
    // Otherwise map from category
    if (category && categoryToEngineMap[category]) {
      return categoryToEngineMap[category]
    }
    return BUSINESS_ENGINES[0].id
  }

  // Set selected engine for an idea
  const setSelectedEngineForIdea = (ideaId: string, engineId: string) => {
    setIdeaEngineSelections(prev => ({ ...prev, [ideaId]: engineId }))
  }

  // Calculate total habits per frequency
  const habitsByFrequency = useMemo(() => {
    const counts: Record<string, number> = {}
    activities.forEach(a => {
      if (a.frequency) {
        counts[a.frequency] = (counts[a.frequency] || 0) + 1
      }
    })
    return counts
  }, [activities])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-700 to-slate-800 rounded-lg p-6 text-white">
        <div className="flex items-center gap-3 mb-2">
          <Briefcase className="w-6 h-6" />
          <h2 className="text-2xl font-bold">Operational Rhythm</h2>
        </div>
        <p className="text-slate-300 mb-4">
          Build consistent habits that keep your business running smoothly. Select from suggested habits or add your own.
        </p>

        {/* Quick Stats */}
        {activities.length > 0 && (
          <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-white/20">
            <div className="bg-white/10 rounded-lg px-3 py-2">
              <span className="text-white/70 text-sm">Total Habits:</span>
              <span className="ml-2 font-bold">{activities.length}</span>
            </div>
            {Object.entries(habitsByFrequency).map(([freq, count]) => (
              <div key={freq} className="bg-white/10 rounded-lg px-3 py-2">
                <span className="text-white/70 text-sm">{FREQUENCY_LABELS[freq as FrequencyOption]}:</span>
                <span className="ml-2 font-bold">{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Suggestions Panel Modal */}
      {showSuggestionsPanel && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">
            {/* Panel Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Suggested Habits</h3>
                <p className="text-sm text-gray-500 mt-1">Select habits to add to your operational rhythm</p>
              </div>
              <button
                onClick={() => {
                  setShowSuggestionsPanel(false)
                  setSelectedHabits(new Set())
                }}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Engine Tabs */}
            <div className="flex overflow-x-auto border-b border-gray-200 px-2">
              {BUSINESS_ENGINES.map((engine) => {
                const isActive = selectedEngineTab === engine.id
                const selectedCount = getSelectedCountForEngine(engine.id)
                const addedCount = getHabitsByEngine(engine.id).filter(h => isHabitAdded(h)).length

                return (
                  <button
                    key={engine.id}
                    onClick={() => setSelectedEngineTab(engine.id)}
                    className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                      isActive
                        ? 'border-brand-orange text-brand-orange'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <span>{engine.emoji}</span>
                    <span>{engine.name}</span>
                    {selectedCount > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 text-xs bg-brand-orange text-white rounded-full">
                        {selectedCount}
                      </span>
                    )}
                    {addedCount > 0 && selectedCount === 0 && (
                      <span className="ml-1 px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">
                        {addedCount}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Habits List */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-3">
                {getHabitsByEngine(selectedEngineTab).map((habit) => {
                  const isAdded = isHabitAdded(habit)
                  const isSelected = selectedHabits.has(habit.id)

                  return (
                    <button
                      key={habit.id}
                      onClick={() => !isAdded && toggleHabitSelection(habit.id)}
                      disabled={isAdded}
                      className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                        isAdded
                          ? 'bg-green-50 border-green-200 cursor-default'
                          : isSelected
                          ? 'bg-brand-orange-50 border-brand-orange'
                          : 'bg-white border-gray-200 hover:border-gray-300 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Checkbox */}
                        <div className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5 ${
                          isAdded
                            ? 'bg-green-500 border-green-500'
                            : isSelected
                            ? 'bg-brand-orange border-brand-orange'
                            : 'border-gray-300'
                        }`}>
                          {(isAdded || isSelected) && (
                            <CheckCircle2 className="w-4 h-4 text-white" />
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className={`font-medium ${
                              isAdded ? 'text-green-700' : isSelected ? 'text-brand-orange-700' : 'text-gray-900'
                            }`}>
                              {habit.name}
                            </p>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              isAdded
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}>
                              {isAdded ? 'Already added' : FREQUENCY_LABELS[habit.recommendedFrequency]}
                            </span>
                          </div>
                          <p className="text-sm text-gray-500 mt-1">
                            {habit.description}
                          </p>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Panel Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
              <p className="text-sm text-gray-600">
                {totalSelectedCount > 0 ? (
                  <span className="font-medium">{totalSelectedCount} habit{totalSelectedCount !== 1 ? 's' : ''} selected</span>
                ) : (
                  <span>Select habits to add</span>
                )}
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setShowSuggestionsPanel(false)
                    setSelectedHabits(new Set())
                  }}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={addSelectedHabits}
                  disabled={totalSelectedCount === 0}
                  className="px-6 py-2 bg-brand-orange text-white font-semibold rounded-lg hover:bg-brand-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add {totalSelectedCount > 0 ? `(${totalSelectedCount})` : 'Selected'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Build Your Operational Rhythm Section */}
      <div className="bg-slate-50 border-2 border-slate-200 rounded-lg p-5">
        <div className="flex items-center gap-2 mb-2">
          <Lightbulb className="w-5 h-5 text-slate-600" />
          <h3 className="font-semibold text-slate-800">Build Your Operational Rhythm</h3>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          Add the recurring habits that will keep your business running smoothly. Browse our curated suggestions or add your own ideas from Step 2.
        </p>

        {/* Suggestions Button */}
        <button
          onClick={() => setShowSuggestionsPanel(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-brand-orange text-white font-semibold rounded-lg hover:bg-brand-orange-600 transition-colors shadow-sm hover:shadow-md"
        >
          <Sparkles className="w-4 h-4" />
          Browse Suggested Habits
        </button>

        {/* Step 2 Ideas (if any) */}
        {operationalIdeasFromStep2.length > 0 && (
          <div className="mt-5 pt-5 border-t border-slate-200">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-amber-600" />
              <h4 className="font-medium text-slate-700">Your Ideas from Step 2</h4>
              <span className="text-sm text-slate-500">({operationalIdeasFromStep2.length} idea{operationalIdeasFromStep2.length !== 1 ? 's' : ''})</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {operationalIdeasFromStep2.map((idea) => {
              const isAdded = isIdeaAlreadyAdded(idea)
              const selectedEngine = getSelectedEngineForIdea(idea.id, idea.category)
              const isEditing = editingIdeaId === idea.id

              // Edit mode
              if (isEditing) {
                return (
                  <div
                    key={idea.id}
                    className="text-left p-3 rounded-lg border-2 bg-amber-50 border-amber-400"
                  >
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        placeholder="Idea title"
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                        autoFocus
                      />
                      <textarea
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        placeholder="Description (optional)"
                        rows={2}
                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-amber-400 focus:border-transparent resize-none"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => saveEditedIdea(idea.id)}
                          disabled={!editTitle.trim()}
                          className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-white bg-green-500 hover:bg-green-600 rounded transition-colors disabled:opacity-50"
                        >
                          <Save className="w-3 h-3" />
                          Save
                        </button>
                        <button
                          onClick={cancelEditing}
                          className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 bg-gray-200 hover:bg-gray-300 rounded transition-colors"
                        >
                          <X className="w-3 h-3" />
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )
              }

              // View mode
              return (
                <div
                  key={idea.id}
                  className={`text-left p-3 rounded-lg border-2 transition-all ${
                    isAdded
                      ? 'bg-green-50 border-green-200'
                      : 'bg-white border-amber-200'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {isAdded ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                    ) : (
                      <Clock className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-1">
                        <p className={`font-medium text-sm ${isAdded ? 'text-green-700' : 'text-gray-900'}`}>
                          {idea.title}
                        </p>
                        {!isAdded && setStrategicIdeas && (
                          <button
                            onClick={() => startEditingIdea(idea)}
                            className="flex-shrink-0 p-1 text-gray-400 hover:text-amber-600 rounded transition-colors"
                            title="Edit idea"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      {idea.description && (
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                          {idea.description}
                        </p>
                      )}
                      {isAdded ? (
                        <p className="text-xs mt-1 text-green-600">Added to habits</p>
                      ) : (
                        <div className="flex items-center gap-2 mt-2">
                          <select
                            value={selectedEngine}
                            onChange={(e) => setSelectedEngineForIdea(idea.id, e.target.value)}
                            className="text-xs px-2 py-1 border border-gray-300 rounded bg-white focus:ring-1 focus:ring-amber-400"
                          >
                            {BUSINESS_ENGINES.map(engine => (
                              <option key={engine.id} value={engine.id}>
                                {engine.emoji} {engine.name}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => addIdeaFromStep2(idea, selectedEngine)}
                            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-white bg-amber-500 hover:bg-amber-600 rounded transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                            Add
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
            </div>
          </div>
        )}
      </div>

      {/* Engine Cards */}
      <div className="space-y-4">
        {BUSINESS_ENGINES.map((engine) => {
          const engineActivities = getActivitiesForEngine(engine.id)
          const suggestedHabits = getHabitsByEngine(engine.id)
          const isExpanded = expandedEngines.has(engine.id)
          const showingSuggestions = showSuggestionsFor === engine.id

          return (
            <div
              key={engine.id}
              className={`border-2 rounded-lg overflow-hidden transition-colors ${
                isExpanded ? engine.borderColor : 'border-gray-200'
              }`}
            >
              {/* Engine Header */}
              <button
                onClick={() => toggleEngine(engine.id)}
                className={`w-full px-4 py-3 flex items-center justify-between ${engine.bgColor} hover:opacity-90 transition-colors`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{engine.emoji}</span>
                  <h3 className={`text-lg font-bold ${engine.color}`}>{engine.name}</h3>
                  <span className="text-sm text-gray-500">
                    ({engineActivities.length} habit{engineActivities.length !== 1 ? 's' : ''})
                  </span>
                </div>
                {isExpanded ? (
                  <ChevronUp className="w-5 h-5 text-gray-500" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-500" />
                )}
              </button>

              {/* Engine Content */}
              {isExpanded && (
                <div className="bg-white p-4 space-y-4">
                  {/* Selected Habits */}
                  {engineActivities.length > 0 ? (
                    <div className="space-y-2">
                      {engineActivities.map((activity) => {
                        const isEditingThis = editingActivityId === activity.id

                        // Edit mode
                        if (isEditingThis) {
                          return (
                            <div
                              key={activity.id}
                              className="p-3 bg-amber-50 rounded-lg border-2 border-amber-400"
                            >
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <Pencil className="w-4 h-4 text-amber-600" />
                                  <span className="text-sm font-medium text-amber-800">Editing Activity</span>
                                </div>
                                <input
                                  type="text"
                                  value={editActivityName}
                                  onChange={(e) => setEditActivityName(e.target.value)}
                                  placeholder="Activity name"
                                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                                  autoFocus
                                />
                                <textarea
                                  value={editActivityDescription}
                                  onChange={(e) => setEditActivityDescription(e.target.value)}
                                  placeholder="Description (optional)"
                                  rows={2}
                                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-400 focus:border-transparent resize-none"
                                />
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={saveEditedActivity}
                                    disabled={!editActivityName.trim()}
                                    className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-green-500 hover:bg-green-600 rounded-lg transition-colors disabled:opacity-50"
                                  >
                                    <Save className="w-4 h-4" />
                                    Save
                                  </button>
                                  <button
                                    onClick={cancelEditingActivity}
                                    className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors"
                                  >
                                    <X className="w-4 h-4" />
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            </div>
                          )
                        }

                        // View mode
                        return (
                          <div
                            key={activity.id}
                            className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200"
                          >
                            {/* Habit Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                {activity.source === 'suggested' ? (
                                  <Sparkles className="w-4 h-4 text-amber-500" />
                                ) : activity.source === 'step2' ? (
                                  <Clock className="w-4 h-4 text-amber-600" />
                                ) : (
                                  <Clock className="w-4 h-4 text-gray-400" />
                                )}
                                {activity.name ? (
                                  <span className="font-medium text-gray-900">{activity.name}</span>
                                ) : (
                                  <input
                                    type="text"
                                    value={activity.name}
                                    onChange={(e) => updateActivity(activity.id, { name: e.target.value })}
                                    placeholder="Enter habit name..."
                                    className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                                    autoFocus
                                  />
                                )}
                                {activity.source === 'step2' && (
                                  <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">From Step 2</span>
                                )}
                              </div>
                              {activity.description && (
                                <p className="text-sm text-gray-500 ml-6">{activity.description}</p>
                              )}
                            </div>

                            {/* Frequency Selector */}
                            <div className="flex-shrink-0 w-32">
                              <select
                                value={activity.frequency || 'weekly'}
                                onChange={(e) => updateActivity(activity.id, { frequency: e.target.value as FrequencyOption })}
                                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent bg-white"
                              >
                                {FREQUENCY_OPTIONS.map(opt => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                    {activity.recommendedFrequency === opt.value ? ' ★' : ''}
                                  </option>
                                ))}
                              </select>
                              {activity.recommendedFrequency && activity.frequency !== activity.recommendedFrequency && (
                                <p className="text-xs text-amber-600 mt-1">
                                  Recommended: {FREQUENCY_LABELS[activity.recommendedFrequency]}
                                </p>
                              )}
                            </div>

                            {/* Assignment */}
                            <div className="flex-shrink-0 relative">
                              {activity.assignedTo ? (
                                // Show assigned member
                                <button
                                  onClick={() => setShowAssignmentFor(showAssignmentFor === activity.id ? null : activity.id)}
                                  className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-gray-200 hover:border-brand-orange transition-colors"
                                  title="Change assignment"
                                >
                                  {(() => {
                                    const member = getMemberById(activity.assignedTo)
                                    if (member) {
                                      return (
                                        <>
                                          <div
                                            className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-medium"
                                            style={{ backgroundColor: member.color || '#6B7280' }}
                                          >
                                            {member.initials || member.name.charAt(0)}
                                          </div>
                                          <span className="text-sm text-gray-700 max-w-[80px] truncate">{member.name}</span>
                                        </>
                                      )
                                    }
                                    return <span className="text-sm text-gray-500">Unknown</span>
                                  })()}
                                </button>
                              ) : (
                                // Show assign button
                                <button
                                  onClick={() => setShowAssignmentFor(showAssignmentFor === activity.id ? null : activity.id)}
                                  className="flex items-center gap-1 px-2 py-1.5 text-gray-400 hover:text-brand-orange hover:bg-brand-orange-50 rounded-lg transition-colors"
                                  title="Assign to team member"
                                >
                                  <User className="w-4 h-4" />
                                  <span className="text-xs">Assign</span>
                                </button>
                              )}

                              {/* Assignment Dropdown */}
                              {showAssignmentFor === activity.id && (
                                <div
                                  ref={dropdownRef}
                                  className="absolute right-0 top-full mt-1 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-50"
                                >
                                  <div className="p-2 border-b border-gray-100">
                                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Assign to</p>
                                  </div>

                                  {/* Team Members List */}
                                  <div className="max-h-48 overflow-y-auto">
                                    {teamMembers.length > 0 ? (
                                      teamMembers.map(member => (
                                        <button
                                          key={member.id}
                                          onClick={() => assignToActivity(activity.id, member.id)}
                                          className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 transition-colors ${
                                            activity.assignedTo === member.id ? 'bg-brand-orange-50' : ''
                                          }`}
                                        >
                                          <div
                                            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0"
                                            style={{ backgroundColor: member.color || '#6B7280' }}
                                          >
                                            {member.initials || member.name.charAt(0)}
                                          </div>
                                          <div className="text-left min-w-0">
                                            <p className="text-sm font-medium text-gray-900 truncate">{member.name}</p>
                                            {member.role && (
                                              <p className="text-xs text-gray-500 truncate">{member.role}</p>
                                            )}
                                          </div>
                                          {activity.assignedTo === member.id && (
                                            <CheckCircle2 className="w-4 h-4 text-brand-orange ml-auto flex-shrink-0" />
                                          )}
                                        </button>
                                      ))
                                    ) : isLoadingTeamMembers ? (
                                      <p className="px-3 py-2 text-sm text-gray-500">Loading team members...</p>
                                    ) : (
                                      <p className="px-3 py-2 text-sm text-gray-500">No team members yet</p>
                                    )}
                                  </div>

                                  {/* Unassign Option */}
                                  {activity.assignedTo && (
                                    <button
                                      onClick={() => assignToActivity(activity.id, null)}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 border-t border-gray-100"
                                    >
                                      <X className="w-4 h-4" />
                                      <span className="text-sm">Unassign</span>
                                    </button>
                                  )}

                                  {/* Add New Person */}
                                  <div className="border-t border-gray-100">
                                    {showAddNewPerson ? (
                                      <div className="p-3 space-y-2">
                                        <input
                                          type="text"
                                          value={newPersonName}
                                          onChange={(e) => setNewPersonName(e.target.value)}
                                          placeholder="Name"
                                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                                          autoFocus
                                        />
                                        <input
                                          type="text"
                                          value={newPersonRole}
                                          onChange={(e) => setNewPersonRole(e.target.value)}
                                          placeholder="Role (optional)"
                                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                                        />
                                        <div className="flex gap-2">
                                          <button
                                            onClick={() => addNewTeamMember(activity.id)}
                                            disabled={!newPersonName.trim() || isSavingNewPerson}
                                            className="flex-1 px-2 py-1.5 text-sm font-medium text-white bg-brand-orange hover:bg-brand-orange-600 rounded transition-colors disabled:opacity-50"
                                          >
                                            {isSavingNewPerson ? 'Saving...' : 'Add & Assign'}
                                          </button>
                                          <button
                                            onClick={() => {
                                              setShowAddNewPerson(false)
                                              setNewPersonName('')
                                              setNewPersonRole('')
                                            }}
                                            className="px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded transition-colors"
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => setShowAddNewPerson(true)}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-brand-orange hover:bg-brand-orange-50 transition-colors"
                                      >
                                        <UserPlus className="w-4 h-4" />
                                        <span className="text-sm">Add new person</span>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Edit Button */}
                            <button
                              onClick={() => startEditingActivity(activity)}
                              className="flex-shrink-0 p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                              title="Edit habit"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>

                            {/* Delete Button */}
                            <button
                              onClick={() => deleteActivity(activity.id)}
                              className="flex-shrink-0 p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              title="Remove habit"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-center text-gray-500 py-4 text-sm">
                      No habits selected yet. Add from suggestions below or create your own.
                    </p>
                  )}

                  {/* Suggested Habits Section */}
                  <div className="border-t border-gray-200 pt-4">
                    <button
                      onClick={() => setShowSuggestionsFor(showingSuggestions ? null : engine.id)}
                      className="flex items-center gap-2 text-sm font-medium text-brand-orange hover:text-brand-orange-600"
                    >
                      <Sparkles className="w-4 h-4" />
                      {showingSuggestions ? 'Hide Suggestions' : 'Show Suggested Habits'}
                      <ChevronDown className={`w-4 h-4 transition-transform ${showingSuggestions ? 'rotate-180' : ''}`} />
                    </button>

                    {showingSuggestions && (
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {suggestedHabits.map((habit) => {
                          const isAdded = isHabitAdded(habit)

                          return (
                            <button
                              key={habit.id}
                              onClick={() => !isAdded && addSuggestedHabit(habit)}
                              disabled={isAdded}
                              className={`text-left p-3 rounded-lg border-2 transition-all ${
                                isAdded
                                  ? 'bg-green-50 border-green-200 cursor-default'
                                  : 'bg-white border-gray-200 hover:border-brand-orange hover:bg-brand-orange-50 cursor-pointer'
                              }`}
                            >
                              <div className="flex items-start gap-2">
                                {isAdded ? (
                                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                                ) : (
                                  <Plus className="w-4 h-4 text-brand-orange mt-0.5 flex-shrink-0" />
                                )}
                                <div className="min-w-0">
                                  <p className={`font-medium text-sm ${isAdded ? 'text-green-700' : 'text-gray-900'}`}>
                                    {habit.name}
                                  </p>
                                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                                    {habit.description}
                                  </p>
                                  <p className={`text-xs mt-1 ${isAdded ? 'text-green-600' : 'text-brand-orange'}`}>
                                    {isAdded ? 'Added' : `Recommended: ${FREQUENCY_LABELS[habit.recommendedFrequency]}`}
                                  </p>
                                </div>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Add Custom Habit Button */}
                  <button
                    onClick={() => addCustomHabit(engine.id)}
                    className="w-full py-2 px-4 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-brand-orange hover:text-brand-orange transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Add Custom Habit
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
