'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import {
  Clock, SkipForward, Lightbulb, RotateCcw, Plus, X,
  ChevronLeft, ChevronRight, Calendar, Check, Loader2
} from 'lucide-react'
import type { TimeLog, TimeLogDay } from '../types'

interface Step1TimeLogProps {
  onSkipStep: () => void
  // From hook - persisted data
  currentTimeLog: TimeLog | null
  currentWeekStart: string
  timeLogs: TimeLog[]
  onWeekChange: (weekStart: string) => void
  onUpdateEntry: (day: string, slot: string, activity: string) => void
  onMarkComplete: () => void
  getMondayOfWeek: (date?: Date) => string
  saveStatus?: 'idle' | 'saving' | 'saved' | 'error'
}

interface Activity {
  id: string
  label: string
  color: string
  lightColor: string
  isCustom?: boolean
}

// Default activity categories with colors
const DEFAULT_ACTIVITIES: Activity[] = [
  { id: 'email', label: 'Email', color: 'bg-blue-500', lightColor: 'bg-blue-100' },
  { id: 'meetings', label: 'Meetings', color: 'bg-purple-500', lightColor: 'bg-purple-100' },
  { id: 'admin', label: 'Admin', color: 'bg-gray-500', lightColor: 'bg-gray-200' },
  { id: 'client', label: 'Client Work', color: 'bg-green-500', lightColor: 'bg-green-100' },
  { id: 'sales', label: 'Sales', color: 'bg-amber-500', lightColor: 'bg-amber-100' },
  { id: 'marketing', label: 'Marketing', color: 'bg-pink-500', lightColor: 'bg-pink-100' },
  { id: 'team', label: 'Team', color: 'bg-indigo-500', lightColor: 'bg-indigo-100' },
  { id: 'finance', label: 'Finance', color: 'bg-emerald-500', lightColor: 'bg-emerald-100' },
  { id: 'planning', label: 'Planning', color: 'bg-teal-500', lightColor: 'bg-teal-100' },
  { id: 'break', label: 'Break', color: 'bg-slate-400', lightColor: 'bg-slate-100' },
]

// Colors available for custom activities
const CUSTOM_COLORS = [
  { color: 'bg-red-500', lightColor: 'bg-red-100' },
  { color: 'bg-orange-500', lightColor: 'bg-orange-100' },
  { color: 'bg-yellow-500', lightColor: 'bg-yellow-100' },
  { color: 'bg-lime-500', lightColor: 'bg-lime-100' },
  { color: 'bg-cyan-500', lightColor: 'bg-cyan-100' },
  { color: 'bg-sky-500', lightColor: 'bg-sky-100' },
  { color: 'bg-violet-500', lightColor: 'bg-violet-100' },
  { color: 'bg-fuchsia-500', lightColor: 'bg-fuchsia-100' },
  { color: 'bg-rose-500', lightColor: 'bg-rose-100' },
]

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Generate 15-min slots from 6am to 8pm
const TIME_SLOTS: string[] = []
for (let hour = 6; hour <= 20; hour++) {
  for (let min = 0; min < 60; min += 15) {
    if (hour === 20 && min > 0) break // Stop at 8pm
    TIME_SLOTS.push(`${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`)
  }
}

export default function Step1TimeLog({
  onSkipStep,
  currentTimeLog,
  currentWeekStart,
  timeLogs,
  onWeekChange,
  onUpdateEntry,
  onMarkComplete,
  getMondayOfWeek,
  saveStatus = 'idle'
}: Step1TimeLogProps) {
  const [activities, setActivities] = useState<Activity[]>(DEFAULT_ACTIVITIES)
  const [draggedActivity, setDraggedActivity] = useState<string | null>(null)
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newActivityName, setNewActivityName] = useState('')
  const [newActivityColor, setNewActivityColor] = useState(CUSTOM_COLORS[0])

  // Debounce ref for saving
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Local state for grid during editing (synced from currentTimeLog)
  const [localGrid, setLocalGrid] = useState<TimeLogDay>({})
  const [pendingChanges, setPendingChanges] = useState<{day: string, slot: string, value: string}[]>([])
  const lastWeekRef = useRef<string>(currentWeekStart)

  // Only sync local grid when WEEK changes (not on every currentTimeLog update)
  useEffect(() => {
    if (currentWeekStart !== lastWeekRef.current) {
      setLocalGrid(currentTimeLog?.entries || {})
      lastWeekRef.current = currentWeekStart
      setPendingChanges([])
    }
  }, [currentWeekStart, currentTimeLog])

  // Initialize on first load
  useEffect(() => {
    if (currentTimeLog?.entries && Object.keys(localGrid).length === 0) {
      setLocalGrid(currentTimeLog.entries)
    }
  }, [currentTimeLog, localGrid])

  // Use local grid for display
  const timeGrid: TimeLogDay = localGrid

  // Add custom activity
  const addCustomActivity = () => {
    if (!newActivityName.trim()) return

    // Use the activity name as the ID (lowercase, hyphenated) so it can be recovered later
    const nameId = newActivityName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    const id = `custom-${nameId}`

    // Check if this activity already exists
    if (activities.some(a => a.id === id)) {
      setNewActivityName('')
      setShowAddForm(false)
      return
    }

    const newActivity: Activity = {
      id,
      label: newActivityName.trim(),
      color: newActivityColor.color,
      lightColor: newActivityColor.lightColor,
      isCustom: true
    }

    setActivities(prev => [...prev, newActivity])
    setNewActivityName('')
    setShowAddForm(false)
  }

  // Remove custom activity
  const removeCustomActivity = (id: string) => {
    setActivities(prev => prev.filter(a => a.id !== id))
  }

  // Handle drag start from activity button
  const handleDragStart = useCallback((e: React.DragEvent, activityId: string) => {
    setDraggedActivity(activityId)
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData('text/plain', activityId)

    // Create custom drag image
    const activity = activities.find(a => a.id === activityId)
    if (activity) {
      const dragEl = document.createElement('div')
      dragEl.className = `${activity.color} text-white px-3 py-1.5 rounded-lg text-sm font-medium shadow-lg`
      dragEl.textContent = activity.label
      dragEl.style.position = 'absolute'
      dragEl.style.top = '-1000px'
      document.body.appendChild(dragEl)
      e.dataTransfer.setDragImage(dragEl, 40, 15)
      setTimeout(() => document.body.removeChild(dragEl), 0)
    }
  }, [activities])

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    setDraggedActivity(null)
    setIsDraggingOver(false)
    setHoverCell(null)

    // Save all pending changes
    if (pendingChanges.length > 0) {
      const uniqueChanges = new Map<string, {day: string, slot: string, value: string}>()
      pendingChanges.forEach(change => {
        uniqueChanges.set(`${change.day}-${change.slot}`, change)
      })
      uniqueChanges.forEach(change => {
        onUpdateEntry(change.day, change.slot, change.value)
      })
      setPendingChanges([])
    }
  }, [pendingChanges, onUpdateEntry])

  // Handle drag over cell (allows drop)
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  // Track which cell is being hovered during drag (for preview only)
  const [hoverCell, setHoverCell] = useState<{day: string, slot: string} | null>(null)

  // Handle drag enter cell (just show preview, don't fill)
  const handleCellDragEnter = useCallback((day: string, slot: string) => {
    if (draggedActivity) {
      setIsDraggingOver(true)
      setHoverCell({ day, slot })
    }
  }, [draggedActivity])

  // Handle drop on cell - fills just this cell
  const handleDrop = useCallback((e: React.DragEvent, day: string, slot: string) => {
    e.preventDefault()
    const activityId = e.dataTransfer.getData('text/plain') || draggedActivity
    setHoverCell(null)

    if (activityId) {
      // Update local grid
      setLocalGrid(prev => ({
        ...prev,
        [day]: {
          ...prev[day],
          [slot]: activityId
        }
      }))
      // Save immediately
      onUpdateEntry(day, slot, activityId)
    }
  }, [draggedActivity, onUpdateEntry])

  // State for extending from a filled cell
  const [isExtending, setIsExtending] = useState(false)
  const [extendActivity, setExtendActivity] = useState<string | null>(null)

  // Handle mouse down on filled cell to start extending
  const handleCellMouseDown = useCallback((day: string, slot: string, activityId: string) => {
    if (activityId) {
      // Start extending from this cell
      setIsExtending(true)
      setExtendActivity(activityId)
    }
  }, [])

  // Handle mouse enter while extending
  const handleCellMouseEnter = useCallback((day: string, slot: string) => {
    if (isExtending && extendActivity) {
      // Fill this cell with the extending activity
      setLocalGrid(prev => ({
        ...prev,
        [day]: {
          ...prev[day],
          [slot]: extendActivity
        }
      }))
      setPendingChanges(prev => [...prev, { day, slot, value: extendActivity }])
    }
  }, [isExtending, extendActivity])

  // Handle mouse up to finish extending
  const handleMouseUp = useCallback(() => {
    if (isExtending) {
      setIsExtending(false)
      setExtendActivity(null)

      // Save all pending changes
      if (pendingChanges.length > 0) {
        const uniqueChanges = new Map<string, {day: string, slot: string, value: string}>()
        pendingChanges.forEach(change => {
          uniqueChanges.set(`${change.day}-${change.slot}`, change)
        })
        uniqueChanges.forEach(change => {
          onUpdateEntry(change.day, change.slot, change.value)
        })
        setPendingChanges([])
      }
    }
  }, [isExtending, pendingChanges, onUpdateEntry])

  // Handle click on cell (clear if filled)
  const handleCellClick = useCallback((day: string, slot: string, activityId: string) => {
    // If cell has activity and we're not extending, clear it
    if (activityId && !isExtending) {
      setLocalGrid(prev => ({
        ...prev,
        [day]: {
          ...prev[day],
          [slot]: ''
        }
      }))
      onUpdateEntry(day, slot, '')
    }
  }, [onUpdateEntry, isExtending])

  // Get activity for a cell
  const getCellActivity = (day: string, slot: string) => {
    return timeGrid[day]?.[slot] || ''
  }

  // Get activity style
  const getActivityStyle = (activityId: string) => {
    const activity = activities.find(a => a.id === activityId)
    return activity || null
  }

  // Calculate hours by activity (each slot = 15 mins = 0.25 hours)
  const hoursByActivity = useMemo(() => {
    const counts: Record<string, number> = {}
    Object.values(timeGrid).forEach(dayData => {
      if (dayData) {
        Object.values(dayData).forEach(activityId => {
          if (activityId) {
            counts[activityId] = (counts[activityId] || 0) + 0.25
          }
        })
      }
    })
    return activities.map(a => ({
      ...a,
      hours: Math.round((counts[a.id] || 0) * 10) / 10
    })).filter(a => a.hours > 0).sort((a, b) => b.hours - a.hours)
  }, [timeGrid, activities])

  // Total hours logged
  const totalHours = Math.round(hoursByActivity.reduce((sum, a) => sum + a.hours, 0) * 10) / 10

  // Clear all entries for current week
  const clearAll = useCallback(() => {
    if (confirm('Clear all entries for this week?')) {
      DAYS.forEach(day => {
        TIME_SLOTS.forEach(slot => {
          if (timeGrid[day]?.[slot]) {
            onUpdateEntry(day, slot, '')
          }
        })
      })
    }
  }, [timeGrid, onUpdateEntry])

  // Format slot for display (only show on hour marks)
  const formatSlot = (slot: string) => {
    const [hourStr, minStr] = slot.split(':')
    const hour = parseInt(hourStr)
    const min = parseInt(minStr)

    // Only show label on the hour
    if (min !== 0) return ''

    if (hour === 12) return '12pm'
    if (hour > 12) return `${hour - 12}pm`
    return `${hour}am`
  }

  // Check if slot is on the hour (for border styling)
  const isHourMark = (slot: string) => slot.endsWith(':00')

  // Week navigation
  const goToPreviousWeek = () => {
    const currentDate = new Date(currentWeekStart)
    currentDate.setDate(currentDate.getDate() - 7)
    onWeekChange(getMondayOfWeek(currentDate))
  }

  const goToNextWeek = () => {
    const currentDate = new Date(currentWeekStart)
    currentDate.setDate(currentDate.getDate() + 7)
    const nextMonday = getMondayOfWeek(currentDate)
    const todayMonday = getMondayOfWeek(new Date())

    // Don't go past current week
    if (nextMonday <= todayMonday) {
      onWeekChange(nextMonday)
    }
  }

  const goToCurrentWeek = () => {
    onWeekChange(getMondayOfWeek(new Date()))
  }

  // Format week display
  const formatWeekDisplay = (weekStart: string) => {
    const start = new Date(weekStart)
    const end = new Date(start)
    end.setDate(end.getDate() + 6)

    const formatDate = (d: Date) => d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    })

    return `${formatDate(start)} - ${formatDate(end)}`
  }

  // Check if viewing current week
  const isCurrentWeek = currentWeekStart === getMondayOfWeek(new Date())

  // Check if there are older logs
  const hasOlderLogs = timeLogs.some(log => log.week_start_date < currentWeekStart)

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Time Log</h2>
          <p className="text-gray-600 mt-1">
            Click or drag to log how you spend your time. This helps identify patterns.
          </p>
        </div>
        <button
          onClick={onSkipStep}
          className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <SkipForward className="w-4 h-4" />
          Skip
        </button>
      </div>

      {/* Week Navigation */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={goToPreviousWeek}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Previous week"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>

            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-teal-600" />
              <span className="font-medium text-gray-900">
                Week of {formatWeekDisplay(currentWeekStart)}
              </span>
              {!isCurrentWeek && (
                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">
                  Past Week
                </span>
              )}
            </div>

            <button
              onClick={goToNextWeek}
              disabled={isCurrentWeek}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Next week"
            >
              <ChevronRight className="w-5 h-5 text-gray-600" />
            </button>
          </div>

          <div className="flex items-center gap-3">
            {/* Save status */}
            {saveStatus === 'saving' && (
              <div className="flex items-center gap-1 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </div>
            )}
            {saveStatus === 'saved' && (
              <div className="flex items-center gap-1 text-sm text-green-600">
                <Check className="w-4 h-4" />
                Saved
              </div>
            )}

            {!isCurrentWeek && (
              <button
                onClick={goToCurrentWeek}
                className="px-3 py-1.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
              >
                Current Week
              </button>
            )}

            {currentTimeLog && !currentTimeLog.is_complete && totalHours > 0 && (
              <button
                onClick={onMarkComplete}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Check className="w-4 h-4" />
                Mark Complete
              </button>
            )}
          </div>
        </div>

        {/* Previous weeks list */}
        {timeLogs.length > 1 && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <p className="text-xs text-gray-500 mb-2">Previous logs:</p>
            <div className="flex flex-wrap gap-2">
              {timeLogs
                .filter(log => log.week_start_date !== currentWeekStart)
                .slice(0, 5)
                .map(log => (
                  <button
                    key={log.id}
                    onClick={() => onWeekChange(log.week_start_date)}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      log.is_complete
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {formatWeekDisplay(log.week_start_date)}
                    {log.is_complete && <Check className="w-3 h-3 inline ml-1" />}
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Activity Selector */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-700">Select activity, then click/drag on grid:</span>
          {totalHours > 0 && (
            <button
              onClick={clearAll}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
            >
              <RotateCcw className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {activities.map(activity => (
            <div key={activity.id} className="relative group">
              <div
                draggable
                onDragStart={(e) => handleDragStart(e, activity.id)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all cursor-grab active:cursor-grabbing ${
                  draggedActivity === activity.id
                    ? `${activity.color} text-white shadow-lg scale-110 opacity-75`
                    : `${activity.lightColor} text-gray-700 hover:scale-105 hover:shadow-md`
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${activity.color}`} />
                {activity.label}
              </div>
              {activity.isCustom && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    removeCustomActivity(activity.id)
                  }}
                  className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}

          {/* Add Custom Activity Button */}
          {!showAddForm ? (
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium border-2 border-dashed border-gray-300 text-gray-500 hover:border-teal-400 hover:text-teal-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Task
            </button>
          ) : (
            <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg p-2">
              <input
                type="text"
                value={newActivityName}
                onChange={(e) => setNewActivityName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addCustomActivity()}
                placeholder="Task name..."
                className="w-28 px-2 py-1 text-sm border-none focus:outline-none"
                autoFocus
              />
              <div className="flex gap-1">
                {CUSTOM_COLORS.slice(0, 5).map((c, i) => (
                  <button
                    key={i}
                    onClick={() => setNewActivityColor(c)}
                    className={`w-5 h-5 rounded-full ${c.color} ${newActivityColor.color === c.color ? 'ring-2 ring-offset-1 ring-gray-400' : ''}`}
                  />
                ))}
              </div>
              <button
                onClick={addCustomActivity}
                disabled={!newActivityName.trim()}
                className="p-1 bg-teal-600 text-white rounded disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setShowAddForm(false)
                  setNewActivityName('')
                }}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Time Grid */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div
          className={`overflow-x-auto transition-colors ${isDraggingOver ? 'bg-teal-50' : ''}`}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <table className="w-full text-sm select-none">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="sticky left-0 bg-gray-50 px-3 py-2 text-left font-medium text-gray-600 w-16 border-r border-gray-200">
                  <Clock className="w-4 h-4" />
                </th>
                {DAY_LABELS.map((day, i) => (
                  <th key={day} className="px-2 py-2 text-center font-medium text-gray-600 min-w-[80px]">
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TIME_SLOTS.map(slot => {
                const showLabel = isHourMark(slot)
                return (
                  <tr key={slot} className={`${isHourMark(slot) ? 'border-t border-gray-200' : ''}`}>
                    <td className={`sticky left-0 bg-white px-2 py-0 text-xs text-gray-500 border-r border-gray-200 font-medium ${showLabel ? '' : 'text-transparent'}`}>
                      {formatSlot(slot) || '·'}
                    </td>
                    {DAYS.map(day => {
                      const activityId = getCellActivity(day, slot)
                      const activityStyle = getActivityStyle(activityId)

                      return (
                        <td
                          key={`${day}-${slot}`}
                          onDragOver={handleDragOver}
                          onDragEnter={() => handleCellDragEnter(day, slot)}
                          onDrop={(e) => handleDrop(e, day, slot)}
                          onMouseDown={() => handleCellMouseDown(day, slot, activityId)}
                          onMouseEnter={() => handleCellMouseEnter(day, slot)}
                          onClick={() => handleCellClick(day, slot, activityId)}
                          className={`p-0.5 cursor-pointer transition-colors ${
                            !activityId ? 'hover:bg-gray-100' : 'hover:opacity-75'
                          } ${isExtending ? 'cursor-crosshair' : ''}`}
                        >
                          <div
                            className={`h-6 rounded-sm transition-all flex items-center justify-center overflow-hidden ${
                              activityStyle
                                ? `${activityStyle.color}`
                                : hoverCell?.day === day && hoverCell?.slot === slot && draggedActivity
                                  ? 'bg-teal-200 ring-2 ring-teal-400'
                                  : draggedActivity ? 'bg-gray-100' : 'bg-gray-50'
                            }`}
                            title={activityStyle?.label || `${slot} - Drag activity here`}
                          >
                            {activityStyle && (
                              <span className="text-[9px] font-medium text-white truncate px-0.5 leading-none">
                                {activityStyle.label.length > 6
                                  ? activityStyle.label.slice(0, 5) + '…'
                                  : activityStyle.label}
                              </span>
                            )}
                          </div>
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

      {/* Summary */}
      {totalHours > 0 ? (
        <div className="bg-gradient-to-r from-teal-600 to-teal-700 rounded-lg p-5 text-white">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-teal-100 text-sm mb-1">Total Hours Logged</p>
              <p className="text-3xl font-bold">{totalHours}h</p>
              {currentTimeLog?.is_complete && (
                <span className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 bg-white/20 rounded text-sm">
                  <Check className="w-3 h-3" />
                  Week Complete
                </span>
              )}
            </div>
            <div className="text-right">
              <p className="text-teal-100 text-sm mb-2">Breakdown</p>
              <div className="space-y-1">
                {hoursByActivity.slice(0, 5).map(activity => (
                  <div key={activity.id} className="flex items-center justify-end gap-2 text-sm">
                    <span>{activity.label}</span>
                    <span className="font-semibold">{activity.hours}h</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Lightbulb className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-amber-900 font-medium">Tip</p>
              <p className="text-amber-800 text-sm mt-1">
                Log a typical week to see where your time really goes.
                Click and drag to quickly fill in blocks of time.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
