'use client'

import { useState, useCallback, useMemo } from 'react'
import {
  Plus, Trash2, Check, X, Clock, Download, Loader2, GripVertical,
  ChevronRight, ChevronLeft, ArrowRight, DollarSign, AlertTriangle,
  Lightbulb, CheckCircle
} from 'lucide-react'
import type { Activity, Zone, FocusFunnelOutcome, Frequency, StopDoingItem } from '../types'
import {
  ZONE_OPTIONS,
  FOCUS_FUNNEL_OPTIONS,
  FREQUENCY_OPTIONS,
  ACTIVITY_PROMPT_TRIGGERS,
  calculateMonthlyHours,
  calculateOpportunityCost
} from '../types'

interface Step3WizardProps {
  activities: Activity[]
  onAddActivity: (activity: Partial<Activity>) => Promise<Activity | null>
  onUpdateActivity: (id: string, updates: Partial<Activity>) => void
  onDeleteActivity: (id: string) => void
  hasTimeLogData?: boolean
  getTimeLogSummary?: () => Record<string, number>
  onImportFromTimeLog?: () => Promise<Activity[]>
  stopDoingItems?: StopDoingItem[]
  calculatedHourlyRate?: number
  onSelectActivity?: (activity: Activity) => Promise<StopDoingItem | null | void>
}

type Phase = 'list' | 'categorize' | 'decide'

// Activity ID to label mapping
const ACTIVITY_LABELS: Record<string, string> = {
  'email': 'Email',
  'meetings': 'Meetings',
  'admin': 'Admin',
  'client': 'Client Work',
  'sales': 'Sales',
  'marketing': 'Marketing',
  'team': 'Team',
  'finance': 'Finance',
  'planning': 'Planning',
  'break': 'Break'
}

export default function Step3Wizard({
  activities,
  onAddActivity,
  onUpdateActivity,
  onDeleteActivity,
  hasTimeLogData = false,
  getTimeLogSummary,
  onImportFromTimeLog,
  stopDoingItems = [],
  calculatedHourlyRate = 0,
  onSelectActivity
}: Step3WizardProps) {
  const [phase, setPhase] = useState<Phase>('list')
  const [isImporting, setIsImporting] = useState(false)
  const [importedCount, setImportedCount] = useState<number | null>(null)

  // New activity form state
  const [showAddForm, setShowAddForm] = useState(false)
  const [newActivityName, setNewActivityName] = useState('')
  const [newFrequency, setNewFrequency] = useState<Frequency>('weekly')
  const [newDuration, setNewDuration] = useState<number>(60)

  // Drag state for Kanban
  const [draggedActivity, setDraggedActivity] = useState<string | null>(null)
  const [dropZone, setDropZone] = useState<Zone | null>(null)

  // Focus Funnel selection state
  const [selectingFunnel, setSelectingFunnel] = useState<string | null>(null)
  const [addingToList, setAddingToList] = useState<string | null>(null)

  // Get time log summary
  const timeLogSummary = getTimeLogSummary ? getTimeLogSummary() : {}

  // Filter valid time log entries
  const validTimeLogEntries = useMemo(() => {
    return Object.entries(timeLogSummary).filter(([id]) => {
      if (id === 'break') return false
      if (/^\d+$/.test(id)) return false
      if (id.startsWith('custom-') && /^\d+$/.test(id.replace('custom-', ''))) return false
      return true
    })
  }, [timeLogSummary])

  // Get activity label from ID
  const getActivityLabel = (id: string): string => {
    if (ACTIVITY_LABELS[id]) return ACTIVITY_LABELS[id]
    if (id.startsWith('custom-')) {
      const cleanName = id.replace('custom-', '')
      if (/^\d+$/.test(cleanName)) return 'Custom Activity'
      return cleanName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    }
    return id.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  }

  // Count activities by zone
  const activityCounts = useMemo(() => {
    const counts = { genius: 0, excellence: 0, competence: 0, incompetence: 0, uncategorized: 0 }
    activities.forEach(a => {
      if (a.zone) counts[a.zone]++
      else counts.uncategorized++
    })
    return counts
  }, [activities])

  // Get uncategorized activities (zone not set or default)
  const uncategorizedActivities = useMemo(() => {
    return activities.filter(a => !a.zone)
  }, [activities])

  // Get activities by zone
  const activitiesByZone = useMemo(() => {
    return {
      genius: activities.filter(a => a.zone === 'genius'),
      excellence: activities.filter(a => a.zone === 'excellence'),
      competence: activities.filter(a => a.zone === 'competence'),
      incompetence: activities.filter(a => a.zone === 'incompetence')
    }
  }, [activities])

  // Get problem activities (Competence + Incompetence)
  const problemActivities = useMemo(() => {
    return activities.filter(a => a.zone === 'competence' || a.zone === 'incompetence')
  }, [activities])

  // Calculate total problem cost
  const problemCost = useMemo(() => {
    return problemActivities.reduce((sum, a) => {
      const hours = calculateMonthlyHours(a.duration_minutes, a.frequency)
      return sum + calculateOpportunityCost(hours, calculatedHourlyRate)
    }, 0)
  }, [problemActivities, calculatedHourlyRate])

  // Check if activity is already in stop doing list
  const isInStopList = (activityId: string) => {
    return stopDoingItems.some(item => item.activity_id === activityId)
  }

  // Format currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  // Add new activity
  const handleAddActivity = async () => {
    if (!newActivityName.trim()) return

    await onAddActivity({
      activity_name: newActivityName.trim(),
      frequency: newFrequency,
      duration_minutes: newDuration,
      zone: undefined // No zone initially
    })

    setNewActivityName('')
    setNewFrequency('weekly')
    setNewDuration(60)
    setShowAddForm(false)
  }

  // Import from time log
  const handleImportFromTimeLog = async () => {
    if (!onImportFromTimeLog) return
    setIsImporting(true)
    setImportedCount(null)
    try {
      const imported = await onImportFromTimeLog()
      setImportedCount(imported.length)
      setTimeout(() => setImportedCount(null), 3000)
    } finally {
      setIsImporting(false)
    }
  }

  // Drag handlers for Kanban
  const handleDragStart = useCallback((e: React.DragEvent, activityId: string) => {
    setDraggedActivity(activityId)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, zone: Zone) => {
    if (!draggedActivity) return
    e.preventDefault()
    setDropZone(zone)
  }, [draggedActivity])

  const handleDragLeave = useCallback(() => {
    setDropZone(null)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, zone: Zone) => {
    e.preventDefault()
    if (draggedActivity) {
      onUpdateActivity(draggedActivity, { zone })
    }
    setDraggedActivity(null)
    setDropZone(null)
  }, [draggedActivity, onUpdateActivity])

  const handleDragEnd = useCallback(() => {
    setDraggedActivity(null)
    setDropZone(null)
  }, [])

  // Apply focus funnel outcome
  const handleApplyFocusFunnel = async (activity: Activity, outcome: FocusFunnelOutcome) => {
    setSelectingFunnel(activity.id)
    try {
      onUpdateActivity(activity.id, { focus_funnel_outcome: outcome })
      // Automatically add to stop doing list if not already there
      if (onSelectActivity && !isInStopList(activity.id)) {
        setAddingToList(activity.id)
        await onSelectActivity(activity)
        setAddingToList(null)
      }
    } finally {
      setSelectingFunnel(null)
    }
  }

  // Can proceed to next phase?
  const canProceedToCategories = activities.length > 0
  const canProceedToDecide = uncategorizedActivities.length === 0 && activities.length > 0
  const allDecided = problemActivities.every(a => a.focus_funnel_outcome)

  // Navigate to phase (with validation)
  const goToPhase = (targetPhase: Phase) => {
    // Can always go back
    if (targetPhase === 'list') {
      setPhase('list')
      return
    }

    // Can go to categorize if we have activities
    if (targetPhase === 'categorize' && canProceedToCategories) {
      setPhase('categorize')
      return
    }

    // Can go to decide if all categorized
    if (targetPhase === 'decide' && canProceedToDecide) {
      setPhase('decide')
      return
    }
  }

  // Check if phase is accessible
  const isPhaseAccessible = (targetPhase: Phase) => {
    if (targetPhase === 'list') return true
    if (targetPhase === 'categorize') return canProceedToCategories
    if (targetPhase === 'decide') return canProceedToDecide
    return false
  }

  // Render progress indicator
  const renderProgress = () => (
    <div className="flex items-center justify-center gap-2 mb-6">
      <button
        onClick={() => goToPhase('list')}
        className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all cursor-pointer hover:scale-105 ${
          phase === 'list' ? 'bg-teal-600 text-white' : 'bg-teal-100 text-teal-700 hover:bg-teal-200'
        }`}
      >
        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
          phase === 'list' ? 'bg-white/20' : 'bg-teal-200'
        }`}>1</span>
        List
      </button>
      <ChevronRight className="w-4 h-4 text-gray-400" />
      <button
        onClick={() => goToPhase('categorize')}
        disabled={!isPhaseAccessible('categorize')}
        className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
          phase === 'categorize' ? 'bg-teal-600 text-white cursor-pointer hover:scale-105' :
          phase === 'decide' ? 'bg-teal-100 text-teal-700 cursor-pointer hover:bg-teal-200 hover:scale-105' :
          isPhaseAccessible('categorize') ? 'bg-gray-100 text-gray-600 cursor-pointer hover:bg-gray-200 hover:scale-105' :
          'bg-gray-100 text-gray-400 cursor-not-allowed'
        }`}
      >
        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
          phase === 'categorize' ? 'bg-white/20' :
          phase === 'decide' ? 'bg-teal-200' : 'bg-gray-200'
        }`}>2</span>
        Categorize
      </button>
      <ChevronRight className="w-4 h-4 text-gray-400" />
      <button
        onClick={() => goToPhase('decide')}
        disabled={!isPhaseAccessible('decide')}
        className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
          phase === 'decide' ? 'bg-teal-600 text-white cursor-pointer hover:scale-105' :
          isPhaseAccessible('decide') ? 'bg-gray-100 text-gray-600 cursor-pointer hover:bg-gray-200 hover:scale-105' :
          'bg-gray-100 text-gray-400 cursor-not-allowed'
        }`}
      >
        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
          phase === 'decide' ? 'bg-white/20' : 'bg-gray-200'
        }`}>3</span>
        Decide
      </button>
    </div>
  )

  // ========================================
  // PHASE 1: LIST (BRAIN DUMP)
  // ========================================
  const renderListPhase = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">What do you spend your time on?</h2>
        <p className="text-gray-600 mt-2">
          Don't judge, just list. We'll categorize next.
        </p>
      </div>

      {/* Import from Time Log */}
      {hasTimeLogData && validTimeLogEntries.length > 0 && (
        <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-teal-900 font-medium">Import from your Time Log</p>
              <p className="text-teal-700 text-sm mt-1">
                We found {validTimeLogEntries.length} activities. Import them to save time.
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {validTimeLogEntries.slice(0, 5).map(([id, hours]) => (
                  <span key={id} className="px-2 py-1 bg-white rounded text-xs text-teal-700 border border-teal-200">
                    {getActivityLabel(id)}: {hours}h/week
                  </span>
                ))}
                {validTimeLogEntries.length > 5 && (
                  <span className="px-2 py-1 text-xs text-teal-600">
                    +{validTimeLogEntries.length - 5} more
                  </span>
                )}
              </div>
              <button
                onClick={handleImportFromTimeLog}
                disabled={isImporting}
                className="mt-3 flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
              >
                {isImporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Import All Activities
                  </>
                )}
              </button>
              {importedCount !== null && (
                <p className="mt-2 text-sm text-green-600 flex items-center gap-1">
                  <Check className="w-4 h-4" />
                  {importedCount > 0 ? `Imported ${importedCount} activities!` : 'All activities already exist'}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick Add Triggers */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Lightbulb className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-900 font-medium">Think about what you did...</p>
            <div className="flex flex-wrap gap-2 mt-2">
              {ACTIVITY_PROMPT_TRIGGERS.map((trigger) => (
                <button
                  key={trigger}
                  onClick={() => {
                    setNewActivityName(`${trigger}: `)
                    setShowAddForm(true)
                  }}
                  className="px-3 py-1 bg-white border border-amber-300 rounded-full text-sm text-amber-800 hover:bg-amber-100 transition-colors"
                >
                  {trigger}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Add Activity Form */}
      {showAddForm ? (
        <div className="bg-white border-2 border-teal-200 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-gray-900">Add Activity</h3>
            <button onClick={() => setShowAddForm(false)} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          <input
            type="text"
            value={newActivityName}
            onChange={(e) => setNewActivityName(e.target.value)}
            placeholder="What do you spend time on?"
            className="w-full px-4 py-3 text-lg border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            autoFocus
          />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">How often?</label>
              <select
                value={newFrequency}
                onChange={(e) => setNewFrequency(e.target.value as Frequency)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                {FREQUENCY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">How long? (minutes)</label>
              <input
                type="number"
                value={newDuration}
                onChange={(e) => setNewDuration(parseInt(e.target.value) || 0)}
                min={5}
                step={5}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleAddActivity}
              disabled={!newActivityName.trim()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              Add Activity
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full py-4 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-teal-400 hover:text-teal-600 transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Add Activity
        </button>
      )}

      {/* Activity List */}
      {activities.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-medium text-gray-900">Your Activities ({activities.length})</h3>
          <div className="space-y-2">
            {activities.map((activity) => (
              <div
                key={activity.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
              >
                <div>
                  <p className="font-medium text-gray-900">{activity.activity_name}</p>
                  <p className="text-sm text-gray-500">
                    {FREQUENCY_OPTIONS.find(f => f.value === activity.frequency)?.label} · {activity.duration_minutes} min
                  </p>
                </div>
                <button
                  onClick={() => onDeleteActivity(activity.id)}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Continue Button */}
      <div className="flex justify-end pt-4">
        <button
          onClick={() => setPhase('categorize')}
          disabled={!canProceedToCategories}
          className="flex items-center gap-2 px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Continue to Categorize
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )

  // ========================================
  // PHASE 2: CATEGORIZE (KANBAN)
  // ========================================
  const renderCategorizePhase = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">How do you FEEL about each activity?</h2>
        <p className="text-gray-600 mt-2">
          Drag each activity to the zone that best describes how you feel about it.
        </p>
      </div>

      {/* Kanban Columns */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {ZONE_OPTIONS.map((zoneOption) => {
          const zoneActivities = activitiesByZone[zoneOption.zone]
          const isDropTarget = dropZone === zoneOption.zone
          const zoneTitle = zoneOption.zone.charAt(0).toUpperCase() + zoneOption.zone.slice(1)

          return (
            <div
              key={zoneOption.zone}
              onDragOver={(e) => handleDragOver(e, zoneOption.zone)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, zoneOption.zone)}
              className={`min-h-[200px] p-3 rounded-lg border-2 transition-all ${
                isDropTarget
                  ? `${zoneOption.bgColor} ${zoneOption.borderColor} scale-[1.02] shadow-lg`
                  : `bg-gray-50 border-gray-200`
              }`}
            >
              <div className={`text-center mb-3 pb-2 border-b ${zoneOption.borderColor}`}>
                <p className={`font-bold ${zoneOption.color}`}>{zoneTitle}</p>
                <p className={`text-xs ${zoneOption.color} opacity-75`}>{zoneOption.label}</p>
              </div>

              <div className="space-y-2">
                {zoneActivities.map((activity) => (
                  <div
                    key={activity.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, activity.id)}
                    onDragEnd={handleDragEnd}
                    className={`p-2 bg-white rounded border ${zoneOption.borderColor} cursor-grab active:cursor-grabbing hover:shadow-md transition-all ${
                      draggedActivity === activity.id ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <GripVertical className="w-3 h-3 text-gray-400" />
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {activity.activity_name}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 ml-5">
                      {Math.round(calculateMonthlyHours(activity.duration_minutes, activity.frequency) * 10) / 10}h/mo
                    </p>
                  </div>
                ))}

                {zoneActivities.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-4">
                    Drop activities here
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Uncategorized Activities */}
      {uncategorizedActivities.length > 0 && (
        <div className="bg-gray-100 rounded-lg p-4">
          <p className="font-medium text-gray-700 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Uncategorized ({uncategorizedActivities.length}) - Drag to a zone above
          </p>
          <div className="flex flex-wrap gap-2">
            {uncategorizedActivities.map((activity) => (
              <div
                key={activity.id}
                draggable
                onDragStart={(e) => handleDragStart(e, activity.id)}
                onDragEnd={handleDragEnd}
                className={`px-3 py-2 bg-white rounded-lg border border-gray-300 cursor-grab active:cursor-grabbing hover:shadow-md transition-all ${
                  draggedActivity === activity.id ? 'opacity-50' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <GripVertical className="w-3 h-3 text-gray-400" />
                  <span className="text-sm font-medium">{activity.activity_name}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Progress Bar */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Categorization Progress</span>
          <span className="text-sm text-gray-500">
            {activities.length - uncategorizedActivities.length} / {activities.length}
          </span>
        </div>
        <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-teal-600 transition-all duration-300"
            style={{ width: `${activities.length > 0 ? ((activities.length - uncategorizedActivities.length) / activities.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <button
          onClick={() => setPhase('list')}
          className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
        <button
          onClick={() => setPhase('decide')}
          disabled={!canProceedToDecide}
          className="flex items-center gap-2 px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {canProceedToDecide ? 'Continue to Decide Actions' : `Categorize all activities first (${uncategorizedActivities.length} left)`}
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )

  // ========================================
  // PHASE 3: DECIDE (FOCUS FUNNEL)
  // ========================================
  const renderDecidePhase = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">What will you DO about these?</h2>
        <p className="text-gray-600 mt-2">
          For each low-value activity, decide: Can you Eliminate it? Automate it? Delegate it?
        </p>
      </div>

      {/* Cost Summary */}
      {calculatedHourlyRate > 0 && problemActivities.length > 0 && (
        <div className="bg-gradient-to-r from-red-500 to-amber-500 rounded-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-red-100 text-sm flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Low-value activities are costing you
              </p>
              <p className="text-4xl font-bold mt-1">{formatCurrency(problemCost)}/month</p>
              <p className="text-red-100 text-sm mt-1">{formatCurrency(problemCost * 12)}/year</p>
            </div>
            <div className="text-right">
              <p className="text-5xl font-bold">{problemActivities.length}</p>
              <p className="text-red-100 text-sm">activities to address</p>
            </div>
          </div>
        </div>
      )}

      {/* Problem Activities with Focus Funnel */}
      {problemActivities.length === 0 ? (
        <div className="text-center py-12 bg-green-50 rounded-lg border border-green-200">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <p className="text-green-700 font-medium">No low-value activities found!</p>
          <p className="text-green-600 text-sm mt-1">
            All your activities are in Genius or Excellence zones. Great job!
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {problemActivities.map((activity) => {
            const hours = calculateMonthlyHours(activity.duration_minutes, activity.frequency)
            const cost = calculateOpportunityCost(hours, calculatedHourlyRate)
            const zoneStyle = ZONE_OPTIONS.find(z => z.zone === activity.zone)
            const isAdded = isInStopList(activity.id)

            return (
              <div
                key={activity.id}
                className={`bg-white rounded-lg border-2 p-4 transition-all ${
                  isAdded ? 'border-green-300 bg-green-50/30' : zoneStyle?.borderColor || 'border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="font-semibold text-gray-900">{activity.activity_name}</h3>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${zoneStyle?.bgColor} ${zoneStyle?.color}`}>
                        {activity.zone?.charAt(0).toUpperCase()}{activity.zone?.slice(1)}
                      </span>
                      {isAdded && (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          Added to Stop List
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 mt-2 text-sm">
                      <span className="text-gray-500">{Math.round(hours * 10) / 10}h/month</span>
                      {calculatedHourlyRate > 0 && (
                        <>
                          <span className="text-amber-600 font-medium">{formatCurrency(cost)}/month</span>
                          <span className="text-red-600 text-xs">{formatCurrency(cost * 12)}/year</span>
                        </>
                      )}
                    </div>

                    {/* Current Focus Funnel Selection */}
                    {activity.focus_funnel_outcome && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-sm text-gray-600">Decision:</span>
                        <span className="px-2 py-1 bg-gray-100 rounded text-sm font-medium">
                          {FOCUS_FUNNEL_OPTIONS.find(f => f.value === activity.focus_funnel_outcome)?.icon}{' '}
                          {FOCUS_FUNNEL_OPTIONS.find(f => f.value === activity.focus_funnel_outcome)?.label}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Focus Funnel Buttons */}
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-xs text-gray-500 mb-2">What will you do about this?</p>
                  <div className="flex flex-wrap gap-2">
                    {FOCUS_FUNNEL_OPTIONS.map((option) => {
                      const isSelected = activity.focus_funnel_outcome === option.value
                      const bgColor = option.value === 'eliminate' ? 'bg-red-100 hover:bg-red-200 border-red-300' :
                                      option.value === 'automate' ? 'bg-purple-100 hover:bg-purple-200 border-purple-300' :
                                      option.value === 'delegate' ? 'bg-blue-100 hover:bg-blue-200 border-blue-300' :
                                      'bg-green-100 hover:bg-green-200 border-green-300'
                      const textColor = option.value === 'eliminate' ? 'text-red-700' :
                                        option.value === 'automate' ? 'text-purple-700' :
                                        option.value === 'delegate' ? 'text-blue-700' : 'text-green-700'
                      const selectedBg = option.value === 'eliminate' ? 'bg-red-600' :
                                         option.value === 'automate' ? 'bg-purple-600' :
                                         option.value === 'delegate' ? 'bg-blue-600' : 'bg-green-600'

                      return (
                        <button
                          key={option.value}
                          onClick={() => handleApplyFocusFunnel(activity, option.value)}
                          disabled={selectingFunnel === activity.id || addingToList === activity.id}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                            isSelected
                              ? `${selectedBg} text-white border-transparent`
                              : `${bgColor} ${textColor}`
                          } disabled:opacity-50`}
                        >
                          <span className="text-lg">{option.icon}</span>
                          <span>{option.label}</span>
                          {(selectingFunnel === activity.id || addingToList === activity.id) && isSelected && (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Focus Funnel Explanation */}
      <div className="bg-gray-50 rounded-lg p-4">
        <p className="text-sm font-medium text-gray-700 mb-2">The Focus Funnel Framework:</p>
        <p className="text-sm text-gray-600">
          Ask yourself in order: <strong>Can I eliminate it entirely?</strong> If not, <strong>can I automate it?</strong> If not, <strong>can I delegate it?</strong> If you must do it yourself, <strong>concentrate</strong> and do it efficiently.
        </p>
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <button
          onClick={() => setPhase('categorize')}
          className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Categorize
        </button>

        <div className="text-sm text-gray-500">
          {stopDoingItems.length} items in your Stop Doing List
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      {renderProgress()}

      {phase === 'list' && renderListPhase()}
      {phase === 'categorize' && renderCategorizePhase()}
      {phase === 'decide' && renderDecidePhase()}
    </div>
  )
}
