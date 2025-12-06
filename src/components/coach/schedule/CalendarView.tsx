'use client'

import { useState, useMemo } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Clock,
  Video,
  Phone,
  MapPin,
  User
} from 'lucide-react'

export interface CalendarSession {
  id: string
  businessId: string
  businessName: string
  scheduledAt: string
  durationMinutes: number
  type: 'video' | 'phone' | 'in-person'
  status: 'scheduled' | 'completed' | 'cancelled'
  prepCompleted?: boolean
  notes?: string
}

type ViewMode = 'month' | 'week' | 'day'

interface CalendarViewProps {
  sessions: CalendarSession[]
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  selectedDate: Date
  onDateChange: (date: Date) => void
  onSessionClick: (session: CalendarSession) => void
  onTimeSlotClick?: (date: Date, hour: number) => void
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 7) // 7 AM to 6 PM

export function CalendarView({
  sessions,
  viewMode,
  onViewModeChange,
  selectedDate,
  onDateChange,
  onSessionClick,
  onTimeSlotClick
}: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(selectedDate)

  // Navigation
  const navigatePrev = () => {
    const newDate = new Date(currentDate)
    if (viewMode === 'month') {
      newDate.setMonth(newDate.getMonth() - 1)
    } else if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() - 7)
    } else {
      newDate.setDate(newDate.getDate() - 1)
    }
    setCurrentDate(newDate)
    onDateChange(newDate)
  }

  const navigateNext = () => {
    const newDate = new Date(currentDate)
    if (viewMode === 'month') {
      newDate.setMonth(newDate.getMonth() + 1)
    } else if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() + 7)
    } else {
      newDate.setDate(newDate.getDate() + 1)
    }
    setCurrentDate(newDate)
    onDateChange(newDate)
  }

  const goToToday = () => {
    const today = new Date()
    setCurrentDate(today)
    onDateChange(today)
  }

  // Get calendar data based on view mode
  const calendarData = useMemo(() => {
    if (viewMode === 'month') {
      return getMonthData(currentDate)
    } else if (viewMode === 'week') {
      return getWeekData(currentDate)
    } else {
      return getDayData(currentDate)
    }
  }, [currentDate, viewMode])

  // Get sessions for a specific date
  const getSessionsForDate = (date: Date) => {
    return sessions.filter(session => {
      const sessionDate = new Date(session.scheduledAt)
      return sessionDate.toDateString() === date.toDateString()
    })
  }

  // Get sessions for a specific hour on a date
  const getSessionsForHour = (date: Date, hour: number) => {
    return sessions.filter(session => {
      const sessionDate = new Date(session.scheduledAt)
      return sessionDate.toDateString() === date.toDateString() &&
        sessionDate.getHours() === hour
    })
  }

  const formatHeaderDate = () => {
    if (viewMode === 'month') {
      return currentDate.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
    } else if (viewMode === 'week') {
      const weekStart = getWeekStart(currentDate)
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekEnd.getDate() + 6)
      return `${weekStart.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-AU', { month: 'short', day: 'numeric', year: 'numeric' })}`
    } else {
      return currentDate.toLocaleDateString('en-AU', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    }
  }

  const isToday = (date: Date) => {
    const today = new Date()
    return date.toDateString() === today.toDateString()
  }

  const isSelected = (date: Date) => {
    return date.toDateString() === selectedDate.toDateString()
  }

  const getTypeIcon = (type: CalendarSession['type']) => {
    switch (type) {
      case 'video': return Video
      case 'phone': return Phone
      case 'in-person': return MapPin
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold text-gray-900">{formatHeaderDate()}</h2>
            <button
              onClick={goToToday}
              className="px-3 py-1.5 text-sm font-medium text-brand-orange hover:bg-brand-orange-50 rounded-lg transition-colors"
            >
              Today
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Navigation */}
            <div className="flex items-center gap-1 mr-4">
              <button
                onClick={navigatePrev}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={navigateNext}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* View Toggle */}
            <div className="flex items-center bg-gray-100 rounded-lg p-1">
              {(['month', 'week', 'day'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => onViewModeChange(mode)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    viewMode === mode
                      ? 'bg-white shadow text-brand-orange'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      {viewMode === 'month' && (
        <MonthView
          data={calendarData as Date[][]}
          currentDate={currentDate}
          sessions={sessions}
          getSessionsForDate={getSessionsForDate}
          isToday={isToday}
          isSelected={isSelected}
          onDateClick={(date) => onDateChange(date)}
          onSessionClick={onSessionClick}
          getTypeIcon={getTypeIcon}
        />
      )}

      {viewMode === 'week' && (
        <WeekView
          data={calendarData as Date[]}
          sessions={sessions}
          getSessionsForHour={getSessionsForHour}
          isToday={isToday}
          onSessionClick={onSessionClick}
          onTimeSlotClick={onTimeSlotClick}
          getTypeIcon={getTypeIcon}
        />
      )}

      {viewMode === 'day' && (
        <DayView
          date={currentDate}
          sessions={sessions}
          getSessionsForHour={getSessionsForHour}
          onSessionClick={onSessionClick}
          onTimeSlotClick={onTimeSlotClick}
          getTypeIcon={getTypeIcon}
        />
      )}
    </div>
  )
}

// Month View Component
function MonthView({
  data,
  currentDate,
  sessions,
  getSessionsForDate,
  isToday,
  isSelected,
  onDateClick,
  onSessionClick,
  getTypeIcon
}: {
  data: Date[][]
  currentDate: Date
  sessions: CalendarSession[]
  getSessionsForDate: (date: Date) => CalendarSession[]
  isToday: (date: Date) => boolean
  isSelected: (date: Date) => boolean
  onDateClick: (date: Date) => void
  onSessionClick: (session: CalendarSession) => void
  getTypeIcon: (type: CalendarSession['type']) => typeof Video
}) {
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div className="p-4">
      {/* Weekday Headers */}
      <div className="grid grid-cols-7 mb-2">
        {weekDays.map(day => (
          <div key={day} className="text-center text-sm font-medium text-gray-500 py-2">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1">
        {data.flat().map((date, idx) => {
          const isCurrentMonth = date.getMonth() === currentDate.getMonth()
          const daySessions = getSessionsForDate(date)

          return (
            <div
              key={idx}
              onClick={() => onDateClick(date)}
              className={`min-h-[100px] p-2 border rounded-lg cursor-pointer transition-colors ${
                isCurrentMonth ? 'bg-white' : 'bg-gray-50'
              } ${
                isToday(date) ? 'border-brand-orange ring-1 ring-brand-orange' : 'border-gray-200'
              } ${
                isSelected(date) ? 'bg-brand-orange-50' : 'hover:bg-gray-50'
              }`}
            >
              <div className={`text-sm font-medium mb-1 ${
                isCurrentMonth ? 'text-gray-900' : 'text-gray-400'
              } ${isToday(date) ? 'text-brand-orange' : ''}`}>
                {date.getDate()}
              </div>

              {/* Sessions */}
              <div className="space-y-1">
                {daySessions.slice(0, 3).map(session => {
                  const Icon = getTypeIcon(session.type)
                  return (
                    <div
                      key={session.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        onSessionClick(session)
                      }}
                      className={`px-2 py-1 rounded text-xs truncate cursor-pointer ${
                        session.status === 'completed'
                          ? 'bg-green-100 text-green-700'
                          : session.status === 'cancelled'
                            ? 'bg-gray-100 text-gray-500 line-through'
                            : 'bg-brand-orange-100 text-brand-orange-700'
                      }`}
                    >
                      <div className="flex items-center gap-1">
                        <Icon className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{session.businessName}</span>
                      </div>
                    </div>
                  )
                })}
                {daySessions.length > 3 && (
                  <div className="text-xs text-gray-500 pl-2">
                    +{daySessions.length - 3} more
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Week View Component
function WeekView({
  data,
  sessions,
  getSessionsForHour,
  isToday,
  onSessionClick,
  onTimeSlotClick,
  getTypeIcon
}: {
  data: Date[]
  sessions: CalendarSession[]
  getSessionsForHour: (date: Date, hour: number) => CalendarSession[]
  isToday: (date: Date) => boolean
  onSessionClick: (session: CalendarSession) => void
  onTimeSlotClick?: (date: Date, hour: number) => void
  getTypeIcon: (type: CalendarSession['type']) => typeof Video
}) {
  return (
    <div className="overflow-auto max-h-[600px]">
      <div className="min-w-[800px]">
        {/* Header */}
        <div className="grid grid-cols-8 border-b border-gray-200 sticky top-0 bg-white z-10">
          <div className="p-3 text-sm font-medium text-gray-500"></div>
          {data.map((date, idx) => (
            <div
              key={idx}
              className={`p-3 text-center ${isToday(date) ? 'bg-brand-orange-50' : ''}`}
            >
              <div className="text-sm text-gray-500">
                {date.toLocaleDateString('en-AU', { weekday: 'short' })}
              </div>
              <div className={`text-lg font-semibold ${isToday(date) ? 'text-brand-orange' : 'text-gray-900'}`}>
                {date.getDate()}
              </div>
            </div>
          ))}
        </div>

        {/* Time Grid */}
        {HOURS.map(hour => (
          <div key={hour} className="grid grid-cols-8 border-b border-gray-100">
            <div className="p-2 text-right text-sm text-gray-500 border-r border-gray-200">
              {formatHour(hour)}
            </div>
            {data.map((date, idx) => {
              const hourSessions = getSessionsForHour(date, hour)
              return (
                <div
                  key={idx}
                  onClick={() => onTimeSlotClick?.(date, hour)}
                  className={`p-1 min-h-[60px] border-r border-gray-100 cursor-pointer hover:bg-gray-50 ${
                    isToday(date) ? 'bg-brand-orange-50/30' : ''
                  }`}
                >
                  {hourSessions.map(session => {
                    const Icon = getTypeIcon(session.type)
                    return (
                      <div
                        key={session.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          onSessionClick(session)
                        }}
                        className={`p-2 rounded text-xs mb-1 cursor-pointer ${
                          session.status === 'completed'
                            ? 'bg-green-100 text-green-700'
                            : session.status === 'cancelled'
                              ? 'bg-gray-100 text-gray-500'
                              : 'bg-brand-orange-100 text-brand-orange-700'
                        }`}
                      >
                        <div className="flex items-center gap-1 font-medium">
                          <Icon className="w-3 h-3" />
                          {new Date(session.scheduledAt).toLocaleTimeString('en-AU', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                        <div className="truncate">{session.businessName}</div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// Day View Component
function DayView({
  date,
  sessions,
  getSessionsForHour,
  onSessionClick,
  onTimeSlotClick,
  getTypeIcon
}: {
  date: Date
  sessions: CalendarSession[]
  getSessionsForHour: (date: Date, hour: number) => CalendarSession[]
  onSessionClick: (session: CalendarSession) => void
  onTimeSlotClick?: (date: Date, hour: number) => void
  getTypeIcon: (type: CalendarSession['type']) => typeof Video
}) {
  return (
    <div className="overflow-auto max-h-[600px]">
      {HOURS.map(hour => {
        const hourSessions = getSessionsForHour(date, hour)
        return (
          <div key={hour} className="flex border-b border-gray-100">
            <div className="w-20 p-3 text-right text-sm text-gray-500 border-r border-gray-200 flex-shrink-0">
              {formatHour(hour)}
            </div>
            <div
              onClick={() => onTimeSlotClick?.(date, hour)}
              className="flex-1 p-2 min-h-[80px] cursor-pointer hover:bg-gray-50"
            >
              {hourSessions.map(session => {
                const Icon = getTypeIcon(session.type)
                return (
                  <div
                    key={session.id}
                    onClick={(e) => {
                      e.stopPropagation()
                      onSessionClick(session)
                    }}
                    className={`p-3 rounded-lg mb-2 cursor-pointer ${
                      session.status === 'completed'
                        ? 'bg-green-50 border border-green-200'
                        : session.status === 'cancelled'
                          ? 'bg-gray-50 border border-gray-200'
                          : 'bg-brand-orange-50 border border-brand-orange-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className={`w-4 h-4 ${
                          session.status === 'completed' ? 'text-green-600' : 'text-brand-orange'
                        }`} />
                        <span className="font-medium text-gray-900">{session.businessName}</span>
                      </div>
                      <span className="text-sm text-gray-500">
                        {new Date(session.scheduledAt).toLocaleTimeString('en-AU', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })} - {session.durationMinutes} min
                      </span>
                    </div>
                    {session.notes && (
                      <p className="text-sm text-gray-600 mt-1 line-clamp-2">{session.notes}</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Helper functions
function getMonthData(date: Date): Date[][] {
  const year = date.getFullYear()
  const month = date.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)

  const weeks: Date[][] = []
  let currentWeek: Date[] = []

  // Fill in days from previous month
  const startDayOfWeek = firstDay.getDay()
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const prevDate = new Date(year, month, -i)
    currentWeek.push(prevDate)
  }

  // Fill in days of current month
  for (let day = 1; day <= lastDay.getDate(); day++) {
    currentWeek.push(new Date(year, month, day))
    if (currentWeek.length === 7) {
      weeks.push(currentWeek)
      currentWeek = []
    }
  }

  // Fill in days from next month
  if (currentWeek.length > 0) {
    let nextDay = 1
    while (currentWeek.length < 7) {
      currentWeek.push(new Date(year, month + 1, nextDay++))
    }
    weeks.push(currentWeek)
  }

  return weeks
}

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - day)
  return d
}

function getWeekData(date: Date): Date[] {
  const weekStart = getWeekStart(date)
  const days: Date[] = []
  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart)
    day.setDate(day.getDate() + i)
    days.push(day)
  }
  return days
}

function getDayData(date: Date): Date[] {
  return [date]
}

function formatHour(hour: number): string {
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const h = hour % 12 || 12
  return `${h}:00 ${ampm}`
}

export default CalendarView
