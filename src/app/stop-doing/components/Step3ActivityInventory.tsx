'use client'

import { useState, useCallback, useMemo } from 'react'
import {
  Plus, Trash2, Edit2, Check, X, Lightbulb, Clock, Download, Loader2, GripVertical,
  DollarSign, AlertTriangle, CheckCircle, Circle, TrendingUp
} from 'lucide-react'
import type { Activity, Zone, FocusFunnelOutcome, Frequency, StopDoingItem } from '../types'
import {
  ZONE_OPTIONS,
  FOCUS_FUNNEL_OPTIONS,
  FREQUENCY_OPTIONS,
  ACTIVITY_PROMPT_TRIGGERS,
  calculateMonthlyHours,
  calculateOpportunityCost,
  getSuggestedDecision
} from '../types'

interface Step3ActivityInventoryProps {
  activities: Activity[]
  onAddActivity: (activity: Partial<Activity>) => Promise<Activity | null>
  onUpdateActivity: (id: string, updates: Partial<Activity>) => void
  onDeleteActivity: (id: string) => void
  hasTimeLogData?: boolean
  getTimeLogSummary?: () => Record<string, number>
  onImportFromTimeLog?: () => Promise<Activity[]>
  // Analysis props (merged from Step 4)
  stopDoingItems?: StopDoingItem[]
  calculatedHourlyRate?: number
  onSelectActivity?: (activity: Activity) => Promise<void>
}

export default function Step3ActivityInventory({
  activities,
  onAddActivity,
  onUpdateActivity,
  onDeleteActivity,
  hasTimeLogData = false,
  getTimeLogSummary,
  onImportFromTimeLog,
  // Analysis props
  stopDoingItems = [],
  calculatedHourlyRate = 0,
  onSelectActivity
}: Step3ActivityInventoryProps) {
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [importedCount, setImportedCount] = useState<number | null>(null)
  const [isSelecting, setIsSelecting] = useState<string | null>(null)

  // Drag and drop state for zones and focus funnel
  const [draggedZone, setDraggedZone] = useState<Zone | null>(null)
  const [draggedFocusFunnel, setDraggedFocusFunnel] = useState<FocusFunnelOutcome | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)

  // Check if activity is already selected for stop doing
  const isActivitySelected = (activityId: string) => {
    return stopDoingItems.some(item => item.activity_id === activityId)
  }

  // Handle adding activity to stop doing list
  const handleSelectForStopDoing = async (activity: Activity) => {
    if (!onSelectActivity || isSelecting) return
    setIsSelecting(activity.id)
    try {
      await onSelectActivity(activity)
    } finally {
      setIsSelecting(null)
    }
  }

  // Calculate summary metrics
  const summary = useMemo(() => {
    const totalMonthlyHours = activities.reduce((sum, a) =>
      sum + calculateMonthlyHours(a.duration_minutes, a.frequency), 0
    )

    const stopDoingHours = activities
      .filter(a => a.zone === 'incompetence' || a.zone === 'competence')
      .reduce((sum, a) => sum + calculateMonthlyHours(a.duration_minutes, a.frequency), 0)

    const stopDoingCost = calculateOpportunityCost(stopDoingHours, calculatedHourlyRate)

    return {
      totalMonthlyHours: Math.round(totalMonthlyHours * 10) / 10,
      stopDoingHours: Math.round(stopDoingHours * 10) / 10,
      stopDoingCost: Math.round(stopDoingCost),
      selectedCount: stopDoingItems.length
    }
  }, [activities, stopDoingItems, calculatedHourlyRate])

  // Format currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  // New activity form state
  const [newActivityName, setNewActivityName] = useState('')
  const [newFrequency, setNewFrequency] = useState<Frequency>('weekly')
  const [newDuration, setNewDuration] = useState<number>(30)
  const [newZone, setNewZone] = useState<Zone | null>(null) // Default to null - require selection
  const [newFocusFunnel, setNewFocusFunnel] = useState<FocusFunnelOutcome | ''>('')

  // Reset form
  const resetForm = () => {
    setNewActivityName('')
    setNewFrequency('weekly')
    setNewDuration(30)
    setNewZone(null)
    setNewFocusFunnel('')
    setIsAdding(false)
  }

  // Zone drag handlers
  const handleZoneDragStart = useCallback((e: React.DragEvent, zone: Zone) => {
    setDraggedZone(zone)
    e.dataTransfer.effectAllowed = 'copy'

    // Create custom drag image with title and description
    const zoneOption = ZONE_OPTIONS.find(z => z.zone === zone)
    if (zoneOption) {
      const zoneTitle = zone.charAt(0).toUpperCase() + zone.slice(1)
      const bgColors: Record<Zone, string> = {
        genius: '#dcfce7',
        excellence: '#ccfbf1',
        competence: '#fef3c7',
        incompetence: '#fee2e2'
      }
      const textColors: Record<Zone, string> = {
        genius: '#15803d',
        excellence: '#0f766e',
        competence: '#b45309',
        incompetence: '#b91c1c'
      }

      const dragEl = document.createElement('div')
      dragEl.style.cssText = `
        position: absolute;
        top: -1000px;
        padding: 10px 14px;
        border-radius: 10px;
        background: ${bgColors[zone]};
        color: ${textColors[zone]};
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        font-family: system-ui, -apple-system, sans-serif;
      `
      dragEl.innerHTML = `
        <div style="font-weight: 700; font-size: 14px;">${zoneTitle}</div>
        <div style="font-size: 11px; opacity: 0.8; margin-top: 2px;">${zoneOption.label}</div>
      `
      document.body.appendChild(dragEl)
      e.dataTransfer.setDragImage(dragEl, 60, 20)
      setTimeout(() => document.body.removeChild(dragEl), 0)
    }
  }, [])

  const handleZoneDragEnd = useCallback(() => {
    setDraggedZone(null)
    setDropTargetId(null)
  }, [])

  // Focus Funnel drag handlers
  const handleFocusFunnelDragStart = useCallback((e: React.DragEvent, outcome: FocusFunnelOutcome) => {
    setDraggedFocusFunnel(outcome)
    e.dataTransfer.effectAllowed = 'copy'

    const option = FOCUS_FUNNEL_OPTIONS.find(f => f.value === outcome)
    if (option) {
      const bgColors: Record<FocusFunnelOutcome, string> = {
        eliminate: '#fee2e2',
        automate: '#f3e8ff',
        delegate: '#dbeafe',
        concentrate: '#dcfce7'
      }
      const textColors: Record<FocusFunnelOutcome, string> = {
        eliminate: '#b91c1c',
        automate: '#7c3aed',
        delegate: '#1d4ed8',
        concentrate: '#15803d'
      }

      const dragEl = document.createElement('div')
      dragEl.style.cssText = `
        position: absolute;
        top: -1000px;
        padding: 10px 14px;
        border-radius: 10px;
        background: ${bgColors[outcome]};
        color: ${textColors[outcome]};
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        font-family: system-ui, -apple-system, sans-serif;
      `
      dragEl.innerHTML = `
        <div style="font-weight: 700; font-size: 14px;">${option.icon} ${option.label}</div>
        <div style="font-size: 11px; opacity: 0.8; margin-top: 2px;">${option.description}</div>
      `
      document.body.appendChild(dragEl)
      e.dataTransfer.setDragImage(dragEl, 60, 20)
      setTimeout(() => document.body.removeChild(dragEl), 0)
    }
  }, [])

  const handleFocusFunnelDragEnd = useCallback(() => {
    setDraggedFocusFunnel(null)
    setDropTargetId(null)
  }, [])

  const handleActivityDragOver = useCallback((e: React.DragEvent, activityId: string) => {
    if (!draggedZone && !draggedFocusFunnel) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDropTargetId(activityId)
  }, [draggedZone, draggedFocusFunnel])

  const handleActivityDragLeave = useCallback(() => {
    setDropTargetId(null)
  }, [])

  const handleActivityDrop = useCallback((e: React.DragEvent, activityId: string) => {
    e.preventDefault()
    if (draggedZone) {
      onUpdateActivity(activityId, { zone: draggedZone })
    }
    if (draggedFocusFunnel) {
      onUpdateActivity(activityId, { focus_funnel_outcome: draggedFocusFunnel })
    }
    setDraggedZone(null)
    setDraggedFocusFunnel(null)
    setDropTargetId(null)
  }, [draggedZone, draggedFocusFunnel, onUpdateActivity])

  // Add new activity
  const handleAddActivity = async () => {
    if (!newActivityName.trim()) return
    if (!newZone) return // Require zone selection

    await onAddActivity({
      activity_name: newActivityName.trim(),
      frequency: newFrequency,
      duration_minutes: newDuration,
      zone: newZone,
      focus_funnel_outcome: newFocusFunnel || null
    })

    resetForm()
  }

  // Quick add from prompt trigger - opens form instead of prompt
  const handleQuickAdd = (triggerWord: string) => {
    setNewActivityName(`${triggerWord}: `)
    setIsAdding(true)
  }

  // Import activities from time log
  const handleImportFromTimeLog = async () => {
    if (!onImportFromTimeLog) return

    setIsImporting(true)
    setImportedCount(null)
    try {
      const imported = await onImportFromTimeLog()
      setImportedCount(imported.length)
      // Clear message after 3 seconds
      setTimeout(() => setImportedCount(null), 3000)
    } finally {
      setIsImporting(false)
    }
  }

  // Get time log summary for preview
  const timeLogSummary = getTimeLogSummary ? getTimeLogSummary() : {}

  // Activity ID to label mapping (matches Step1TimeLog default activities)
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

  // Get display label for activity ID
  const getActivityLabel = (id: string): string => {
    // Check if it's a known default activity
    if (ACTIVITY_LABELS[id]) {
      return ACTIVITY_LABELS[id]
    }
    // Skip numeric-only IDs (timestamps, auto-generated IDs)
    if (/^\d+$/.test(id)) {
      return 'Custom Activity'
    }
    // For custom activities, try to parse the name
    if (id.startsWith('custom-')) {
      const cleanName = id.replace('custom-', '')
      // If what remains is just numbers, return generic label
      if (/^\d+$/.test(cleanName)) {
        return 'Custom Activity'
      }
      return cleanName.split('-').map(
        word => word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ')
    }
    // Fallback: capitalize and clean up
    return id.split(/[-_]/).map(
      word => word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ')
  }

  // Get zone style
  const getZoneStyle = (zone: Zone) => {
    const option = ZONE_OPTIONS.find(z => z.zone === zone)
    return option || ZONE_OPTIONS[2] // Default to competence
  }

  // Calculate monthly hours display
  const getMonthlyHours = (activity: Activity) => {
    const hours = calculateMonthlyHours(activity.duration_minutes, activity.frequency)
    return Math.round(hours * 10) / 10
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Activities & Analysis</h2>
        <p className="text-gray-600 mt-1">
          List your business activities, assign zones, and identify what to stop doing.
        </p>
      </div>

      {/* Summary Cards - only show when there are activities and hourly rate is set */}
      {activities.length > 0 && calculatedHourlyRate > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
              <Clock className="w-4 h-4" />
              Monthly Hours
            </div>
            <p className="text-2xl font-bold text-gray-900">{summary.totalMonthlyHours}h</p>
          </div>

          <div className="bg-red-50 rounded-lg border border-red-200 p-4">
            <div className="flex items-center gap-2 text-red-600 text-sm mb-1">
              <AlertTriangle className="w-4 h-4" />
              Hours to Reclaim
            </div>
            <p className="text-2xl font-bold text-red-700">{summary.stopDoingHours}h</p>
            <p className="text-xs text-red-600 mt-1">In low-value zones</p>
          </div>

          <div className="bg-amber-50 rounded-lg border border-amber-200 p-4">
            <div className="flex items-center gap-2 text-amber-600 text-sm mb-1">
              <DollarSign className="w-4 h-4" />
              Potential Savings
            </div>
            <p className="text-2xl font-bold text-amber-700">{formatCurrency(summary.stopDoingCost)}/mo</p>
            <p className="text-xs text-amber-600 mt-1">{formatCurrency(summary.stopDoingCost * 12)}/year</p>
          </div>

          <div className="bg-teal-50 rounded-lg border border-teal-200 p-4">
            <div className="flex items-center gap-2 text-teal-600 text-sm mb-1">
              <CheckCircle className="w-4 h-4" />
              Added to Stop List
            </div>
            <p className="text-2xl font-bold text-teal-700">{summary.selectedCount}</p>
            <p className="text-xs text-teal-600 mt-1">Ready for action plan</p>
          </div>
        </div>
      )}

      {/* Import from Time Log */}
      {hasTimeLogData && Object.keys(timeLogSummary).length > 0 && (
        <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-teal-900 font-medium">Import from Time Log</p>
              <p className="text-teal-700 text-sm mt-1">
                We found {Object.keys(timeLogSummary).filter(k => {
                  if (k === 'break') return false
                  if (/^\d+$/.test(k)) return false
                  if (k.startsWith('custom-') && /^\d+$/.test(k.replace('custom-', ''))) return false
                  return true
                }).length} activities in your time log.
                Import them to auto-populate your activity list with actual hours.
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {Object.entries(timeLogSummary)
                  .filter(([id]) => {
                    // Skip breaks and numeric-only IDs
                    if (id === 'break') return false
                    if (/^\d+$/.test(id)) return false
                    if (id.startsWith('custom-') && /^\d+$/.test(id.replace('custom-', ''))) return false
                    return true
                  })
                  .slice(0, 6)
                  .map(([id, hours]) => (
                    <span key={id} className="px-2 py-1 bg-white rounded text-xs text-teal-700 border border-teal-200">
                      {getActivityLabel(id)}: {hours}h/week
                    </span>
                  ))}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={handleImportFromTimeLog}
                  disabled={isImporting}
                  className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Import Activities
                    </>
                  )}
                </button>
                {importedCount !== null && (
                  <span className="text-sm text-green-600 flex items-center gap-1">
                    <Check className="w-4 h-4" />
                    {importedCount > 0 ? `Imported ${importedCount} activities!` : 'All activities already exist'}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Prompt Triggers */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Lightbulb className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-900 font-medium">Think about...</p>
            <div className="flex flex-wrap gap-2 mt-2">
              {ACTIVITY_PROMPT_TRIGGERS.map((trigger) => (
                <button
                  key={trigger}
                  onClick={() => handleQuickAdd(trigger)}
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
      {isAdding ? (
        <div className="bg-white border-2 border-teal-200 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-gray-900">Add New Activity</h3>
            <button onClick={resetForm} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Activity Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Activity Name *
            </label>
            <input
              type="text"
              value={newActivityName}
              onChange={(e) => setNewActivityName(e.target.value)}
              placeholder="e.g., Responding to client emails"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Frequency */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Frequency
              </label>
              <select
                value={newFrequency}
                onChange={(e) => setNewFrequency(e.target.value as Frequency)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                {FREQUENCY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Duration */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Duration (minutes)
              </label>
              <input
                type="number"
                value={newDuration}
                onChange={(e) => setNewDuration(parseInt(e.target.value) || 0)}
                min={5}
                step={5}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          {/* Zone Selection - Full width with clear buttons */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Which zone does this activity fall into? *
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {ZONE_OPTIONS.map((opt) => {
                const isSelected = newZone === opt.zone
                const zoneTitle = opt.zone.charAt(0).toUpperCase() + opt.zone.slice(1)
                return (
                  <button
                    key={opt.zone}
                    type="button"
                    onClick={() => setNewZone(opt.zone)}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                      isSelected
                        ? `${opt.bgColor} ${opt.borderColor} ${opt.color} ring-2 ring-offset-1 ring-${opt.zone === 'genius' ? 'green' : opt.zone === 'excellence' ? 'teal' : opt.zone === 'competence' ? 'amber' : 'red'}-400`
                        : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <p className={`font-bold text-sm ${isSelected ? opt.color : 'text-gray-700'}`}>
                      {zoneTitle}
                    </p>
                    <p className={`text-xs mt-0.5 ${isSelected ? opt.color : 'text-gray-500'} opacity-80`}>
                      {opt.label}
                    </p>
                  </button>
                )
              })}
            </div>
            {!newZone && (
              <p className="text-xs text-amber-600 mt-2">Please select a zone for this activity</p>
            )}
          </div>

          {/* Focus Funnel */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Focus Funnel Outcome
            </label>
            <div className="flex flex-wrap gap-2">
              {FOCUS_FUNNEL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setNewFocusFunnel(newFocusFunnel === opt.value ? '' : opt.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-1 ${
                    newFocusFunnel === opt.value
                      ? 'bg-teal-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <span>{opt.icon}</span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleAddActivity}
              disabled={!newActivityName.trim() || !newZone}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Check className="w-4 h-4" />
              Add Activity
            </button>
            <button
              onClick={resetForm}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsAdding(true)}
          className="w-full py-4 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-teal-400 hover:text-teal-600 transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Add Activity
        </button>
      )}

      {/* Activity List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-gray-900">Your Activities ({activities.length})</h3>
          {activities.length > 0 && (
            <span className="text-sm text-gray-500">
              Total: {Math.round(activities.reduce((sum, a) => sum + getMonthlyHours(a), 0))} hours/month
            </span>
          )}
        </div>

        {activities.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <p className="text-gray-500">No activities yet. Start adding your tasks above!</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {activities.map((activity) => {
              const zoneStyle = getZoneStyle(activity.zone)
              const isEditing = editingId === activity.id
              const isDropTarget = dropTargetId === activity.id

              return (
                <div
                  key={activity.id}
                  onDragOver={(e) => handleActivityDragOver(e, activity.id)}
                  onDragLeave={handleActivityDragLeave}
                  onDrop={(e) => handleActivityDrop(e, activity.id)}
                  className={`bg-white border rounded-lg p-4 transition-all ${
                    isDropTarget && draggedZone
                      ? `ring-2 ring-offset-2 ${
                          draggedZone === 'genius' ? 'ring-green-400 bg-green-50' :
                          draggedZone === 'excellence' ? 'ring-teal-400 bg-teal-50' :
                          draggedZone === 'competence' ? 'ring-amber-400 bg-amber-50' :
                          'ring-red-400 bg-red-50'
                        }`
                      : isDropTarget && draggedFocusFunnel
                      ? `ring-2 ring-offset-2 ${
                          draggedFocusFunnel === 'eliminate' ? 'ring-red-400 bg-red-50' :
                          draggedFocusFunnel === 'automate' ? 'ring-purple-400 bg-purple-50' :
                          draggedFocusFunnel === 'delegate' ? 'ring-blue-400 bg-blue-50' :
                          'ring-green-400 bg-green-50'
                        }`
                      : `${zoneStyle.borderColor} ${zoneStyle.bgColor}`
                  }`}
                >
                  {isEditing ? (
                    // Edit Mode
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={activity.activity_name}
                        onChange={(e) => onUpdateActivity(activity.id, { activity_name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                      <div className="grid grid-cols-3 gap-3">
                        <select
                          value={activity.frequency}
                          onChange={(e) => onUpdateActivity(activity.id, { frequency: e.target.value as Frequency })}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        >
                          {FREQUENCY_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          value={activity.duration_minutes}
                          onChange={(e) => onUpdateActivity(activity.id, { duration_minutes: parseInt(e.target.value) || 0 })}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                        <select
                          value={activity.zone}
                          onChange={(e) => onUpdateActivity(activity.id, { zone: e.target.value as Zone })}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        >
                          {ZONE_OPTIONS.map((opt) => (
                            <option key={opt.zone} value={opt.zone}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex justify-end">
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-3 py-1 bg-teal-600 text-white rounded text-sm"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  ) : (
                    // Display Mode
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className={`font-medium ${zoneStyle.color}`}>
                            {activity.activity_name}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-xs ${zoneStyle.bgColor} ${zoneStyle.color} border ${zoneStyle.borderColor}`}>
                            <span className="font-bold">{activity.zone.charAt(0).toUpperCase() + activity.zone.slice(1)}</span>
                            <span className="opacity-75"> · {zoneStyle.label}</span>
                          </span>
                          {activity.focus_funnel_outcome && (
                            <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600 flex items-center gap-1">
                              {FOCUS_FUNNEL_OPTIONS.find(f => f.value === activity.focus_funnel_outcome)?.icon}
                              {FOCUS_FUNNEL_OPTIONS.find(f => f.value === activity.focus_funnel_outcome)?.label}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-sm">
                          <span className="text-gray-500">{FREQUENCY_OPTIONS.find(f => f.value === activity.frequency)?.label}</span>
                          <span className="text-gray-500">{activity.duration_minutes} min</span>
                          <span className="font-medium text-gray-700">{getMonthlyHours(activity)}h/month</span>
                          {calculatedHourlyRate > 0 && (
                            <>
                              <span className="text-amber-600 font-medium">
                                {formatCurrency(calculateOpportunityCost(getMonthlyHours(activity), calculatedHourlyRate))}/mo
                              </span>
                              <span className="text-red-600 text-xs">
                                {formatCurrency(calculateOpportunityCost(getMonthlyHours(activity), calculatedHourlyRate) * 12)}/yr
                              </span>
                            </>
                          )}
                        </div>
                        {/* Suggested decision for low-value zones */}
                        {(activity.zone === 'incompetence' || activity.zone === 'competence') && (
                          <div className="mt-2 flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-teal-600" />
                            <span className="text-sm text-teal-700">
                              Suggested: <strong>{getSuggestedDecision(activity.zone, activity.focus_funnel_outcome)}</strong>
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Add to Stop Doing button */}
                        {onSelectActivity && activity.zone !== 'genius' && (
                          isActivitySelected(activity.id) ? (
                            <div className="flex items-center gap-1 text-teal-600 px-3 py-1.5">
                              <CheckCircle className="w-4 h-4" />
                              <span className="text-sm font-medium">Added</span>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleSelectForStopDoing(activity)}
                              disabled={isSelecting === activity.id}
                              className="flex items-center gap-1 px-3 py-1.5 bg-teal-600 text-white rounded-lg text-sm hover:bg-teal-700 disabled:opacity-50 transition-colors"
                              title="Add to Stop Doing list"
                            >
                              {isSelecting === activity.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Circle className="w-4 h-4" />
                              )}
                              <span className="hidden sm:inline">Stop Doing</span>
                            </button>
                          )
                        )}
                        <button
                          onClick={() => setEditingId(activity.id)}
                          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('Delete this activity?')) {
                              onDeleteActivity(activity.id)
                            }
                          }}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Zone & Focus Funnel Guides - Draggable */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Zone Guide */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-gray-700">Zone Guide</h4>
            {activities.length > 0 && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <GripVertical className="w-3 h-3" />
                Drag to assign
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {ZONE_OPTIONS.map((option) => {
              const zoneTitle = option.zone.charAt(0).toUpperCase() + option.zone.slice(1)
              const isDragging = draggedZone === option.zone
              return (
                <div
                  key={option.zone}
                  draggable
                  onDragStart={(e) => handleZoneDragStart(e, option.zone)}
                  onDragEnd={handleZoneDragEnd}
                  className={`p-2 rounded-lg ${option.bgColor} border ${option.borderColor} cursor-grab active:cursor-grabbing transition-all ${
                    isDragging ? 'opacity-50 scale-95' : 'hover:shadow-md hover:scale-[1.02]'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <GripVertical className={`w-3 h-3 ${option.color} opacity-50`} />
                    <p className={`font-bold text-xs ${option.color}`}>{zoneTitle}</p>
                  </div>
                  <p className={`text-[10px] ${option.color} opacity-80 mt-0.5`}>{option.label}</p>
                </div>
              )
            })}
          </div>
        </div>

        {/* Focus Funnel Guide */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-gray-700">Focus Funnel</h4>
            {activities.length > 0 && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <GripVertical className="w-3 h-3" />
                Drag to assign
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {FOCUS_FUNNEL_OPTIONS.map((option) => {
              const isDragging = draggedFocusFunnel === option.value
              const bgColor = option.value === 'eliminate' ? 'bg-red-50' :
                              option.value === 'automate' ? 'bg-purple-50' :
                              option.value === 'delegate' ? 'bg-blue-50' : 'bg-green-50'
              const borderColor = option.value === 'eliminate' ? 'border-red-200' :
                                  option.value === 'automate' ? 'border-purple-200' :
                                  option.value === 'delegate' ? 'border-blue-200' : 'border-green-200'
              const textColor = option.value === 'eliminate' ? 'text-red-700' :
                                option.value === 'automate' ? 'text-purple-700' :
                                option.value === 'delegate' ? 'text-blue-700' : 'text-green-700'
              return (
                <div
                  key={option.value}
                  draggable
                  onDragStart={(e) => handleFocusFunnelDragStart(e, option.value)}
                  onDragEnd={handleFocusFunnelDragEnd}
                  className={`p-2 rounded-lg ${bgColor} border ${borderColor} cursor-grab active:cursor-grabbing transition-all ${
                    isDragging ? 'opacity-50 scale-95' : 'hover:shadow-md hover:scale-[1.02]'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <GripVertical className={`w-3 h-3 ${textColor} opacity-50`} />
                    <span className="text-base">{option.icon}</span>
                    <p className={`font-bold text-xs ${textColor}`}>{option.label}</p>
                  </div>
                  <p className={`text-[10px] ${textColor} opacity-80 mt-0.5`}>{option.description}</p>
                </div>
              )
            })}
          </div>
          <p className="text-[10px] text-gray-500 mt-2 text-center italic">
            Can you Eliminate it? → Automate it? → Delegate it? → Then Concentrate on it.
          </p>
        </div>
      </div>
    </div>
  )
}
