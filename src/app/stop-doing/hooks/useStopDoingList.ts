/**
 * useStopDoingList Hook
 * =====================
 * State management for the Stop Doing List wizard
 *
 * Supports coach view: Pass overrideBusinessId when viewing as a coach
 */

'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBusinessContext } from '@/contexts/BusinessContext'
import {
  TimeLogService,
  HourlyRateService,
  ActivityService,
  StopDoingItemService,
  StopDoingService
} from '../services/stop-doing-service'
import type {
  TimeLog,
  TimeLogDay,
  HourlyRate,
  Activity,
  StopDoingItem,
  Zone,
  FocusFunnelOutcome,
  Frequency,
  Importance,
  StopDoingStatus
} from '../types'
import { calculateMonthlyHours, calculateOpportunityCost, calculateNetGainLoss, getSuggestedDecision } from '../types'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export function useStopDoingList(overrideBusinessId?: string) {
  const supabase = createClient()
  const { activeBusiness } = useBusinessContext()

  // Loading & Error States
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [businessId, setBusinessId] = useState<string>('')
  const [userId, setUserId] = useState<string>('')

  // Auto-save states
  const [isDirty, setIsDirty] = useState(false)
  const [isLoadComplete, setIsLoadComplete] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  // Auto-save refs
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isSavingRef = useRef(false)
  const saveHourlyRateRef = useRef<() => Promise<void>>(() => Promise.resolve())

  // Step 1: Time Logs
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([])
  const [currentTimeLog, setCurrentTimeLog] = useState<TimeLog | null>(null)
  const [currentWeekStart, setCurrentWeekStart] = useState<string>('')

  // Step 2: Hourly Rate
  const [hourlyRate, setHourlyRate] = useState<HourlyRate | null>(null)
  const [targetAnnualIncome, setTargetAnnualIncome] = useState<number>(0)
  const [workingWeeksPerYear, setWorkingWeeksPerYear] = useState<number>(48)
  const [hoursPerWeek, setHoursPerWeek] = useState<number>(40)
  const [calculatedHourlyRate, setCalculatedHourlyRate] = useState<number>(0)

  // Step 3: Activities
  const [activities, setActivities] = useState<Activity[]>([])

  // Step 4 & 5: Stop Doing Items
  const [stopDoingItems, setStopDoingItems] = useState<StopDoingItem[]>([])

  // Step Completion
  const [stepCompletion, setStepCompletion] = useState({
    step1Complete: false,
    step2Complete: false,
    step3Complete: false,
    step4Complete: false,
    step5Complete: false,
    overallProgress: 0
  })

  // ============================================
  // Mark Dirty Helper
  // ============================================
  const markDirty = useCallback(() => {
    if (!isLoadComplete) return
    setIsDirty(true)
  }, [isLoadComplete])

  // ============================================
  // Get Monday of current week
  // ============================================
  const getMondayOfWeek = useCallback((date: Date = new Date()): string => {
    const d = new Date(date)
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Adjust for Sunday
    d.setDate(diff)
    return d.toISOString().split('T')[0]
  }, [])

  // ============================================
  // Load Data
  // ============================================
  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true)

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setError('Not authenticated')
          setIsLoading(false)
          return
        }

        setUserId(user.id)

        // Determine which business_profile to load:
        // Stop doing tables use business_profiles.id as their business_id
        // So we need to get the business_profiles.id, not businesses.id
        let bizId: string

        if (overrideBusinessId) {
          bizId = overrideBusinessId
        } else if (activeBusiness?.id) {
          // Coach viewing client: activeBusiness.id is businesses.id
          // We need to get the corresponding business_profiles.id
          const { data: profile } = await supabase
            .from('business_profiles')
            .select('id')
            .eq('business_id', activeBusiness.id)
            .single()

          if (!profile) {
            setError('No business profile found for this client')
            setIsLoading(false)
            return
          }
          bizId = profile.id
        } else {
          // Get user's own business profile
          const { data: profile } = await supabase
            .from('business_profiles')
            .select('id')
            .eq('user_id', user.id)
            .single()

          if (!profile) {
            setError('No business profile found')
            setIsLoading(false)
            return
          }
          bizId = profile.id
        }

        setBusinessId(bizId)

        // Load all data
        const data = await StopDoingService.loadAllData(bizId)

        // Set time logs
        setTimeLogs(data.timeLogs)
        const mondayDate = getMondayOfWeek()
        setCurrentWeekStart(mondayDate)
        const existingLog = data.timeLogs.find(log => log.week_start_date === mondayDate)
        setCurrentTimeLog(existingLog || null)

        // Set hourly rate
        if (data.hourlyRate) {
          setHourlyRate(data.hourlyRate)
          setTargetAnnualIncome(data.hourlyRate.target_annual_income)
          setWorkingWeeksPerYear(data.hourlyRate.working_weeks_per_year)
          setHoursPerWeek(data.hourlyRate.hours_per_week)
          setCalculatedHourlyRate(data.hourlyRate.calculated_hourly_rate)
        }

        // Set activities and stop doing items
        setActivities(data.activities)
        setStopDoingItems(data.stopDoingItems)

        // Calculate step completion
        const completion = await StopDoingService.getStepCompletion(bizId)
        setStepCompletion(completion)

        setIsLoading(false)
        setTimeout(() => setIsLoadComplete(true), 500)
      } catch (err) {
        console.error('[useStopDoingList] Error loading data:', err)
        setError('Failed to load data')
        setIsLoading(false)
      }
    }

    loadData()
  }, [supabase, getMondayOfWeek, overrideBusinessId, activeBusiness?.id])

  // ============================================
  // Hourly Rate Calculation
  // ============================================
  useEffect(() => {
    if (workingWeeksPerYear > 0 && hoursPerWeek > 0) {
      const totalHours = workingWeeksPerYear * hoursPerWeek
      const rate = totalHours > 0 ? Math.round((targetAnnualIncome / totalHours) * 100) / 100 : 0
      setCalculatedHourlyRate(rate)
    }
  }, [targetAnnualIncome, workingWeeksPerYear, hoursPerWeek])

  // ============================================
  // Time Log Operations
  // ============================================
  const updateTimeLogEntry = useCallback(async (
    day: string,
    timeSlot: string,
    activity: string
  ) => {
    if (!businessId || !userId) return

    const updatedEntries: TimeLogDay = {
      ...(currentTimeLog?.entries || {}),
      [day]: {
        ...(currentTimeLog?.entries?.[day] || {}),
        [timeSlot]: activity
      }
    }

    // Calculate total minutes
    let totalMinutes = 0
    Object.values(updatedEntries).forEach(dayEntries => {
      totalMinutes += Object.keys(dayEntries).filter(slot => dayEntries[slot]).length * 15
    })

    const result = await TimeLogService.saveTimeLog(
      businessId,
      userId,
      currentWeekStart,
      updatedEntries,
      totalMinutes,
      false
    )

    if (result.success && result.data) {
      setCurrentTimeLog(result.data)
      setTimeLogs(prev => {
        const index = prev.findIndex(log => log.week_start_date === currentWeekStart)
        if (index >= 0) {
          return [...prev.slice(0, index), result.data!, ...prev.slice(index + 1)]
        }
        return [result.data!, ...prev]
      })
    }

    markDirty()
  }, [businessId, userId, currentTimeLog, currentWeekStart, markDirty])

  const markTimeLogComplete = useCallback(async () => {
    if (!currentTimeLog || !businessId || !userId) return

    const result = await TimeLogService.saveTimeLog(
      businessId,
      userId,
      currentWeekStart,
      currentTimeLog.entries,
      currentTimeLog.total_minutes,
      true
    )

    if (result.success && result.data) {
      setCurrentTimeLog(result.data)
      setTimeLogs(prev =>
        prev.map(log =>
          log.week_start_date === currentWeekStart ? result.data! : log
        )
      )
    }
  }, [businessId, userId, currentTimeLog, currentWeekStart])

  // Change week and load appropriate time log
  const changeWeek = useCallback((weekStart: string) => {
    setCurrentWeekStart(weekStart)
    const existingLog = timeLogs.find(log => log.week_start_date === weekStart)
    setCurrentTimeLog(existingLog || null)
  }, [timeLogs])

  // ============================================
  // Hourly Rate Operations
  // ============================================
  const saveHourlyRate = useCallback(async () => {
    if (!businessId || !userId) return

    setSaveStatus('saving')

    const result = await HourlyRateService.saveHourlyRate(
      businessId,
      userId,
      targetAnnualIncome,
      workingWeeksPerYear,
      hoursPerWeek
    )

    if (result.success && result.data) {
      setHourlyRate(result.data)
      setCalculatedHourlyRate(result.data.calculated_hourly_rate)
      setSaveStatus('saved')
      setLastSaved(new Date())
      setIsDirty(false)
    } else {
      setSaveStatus('error')
    }
  }, [businessId, userId, targetAnnualIncome, workingWeeksPerYear, hoursPerWeek])

  // ============================================
  // Activity Operations
  // ============================================
  const addActivity = useCallback(async (activity: Partial<Activity>) => {
    if (!businessId || !userId) return null

    const result = await ActivityService.createActivity(businessId, userId, activity)

    if (result.success && result.data) {
      setActivities(prev => [...prev, result.data!])
      markDirty()
      return result.data
    }

    return null
  }, [businessId, userId, markDirty])

  const updateActivity = useCallback(async (id: string, updates: Partial<Activity>) => {
    const result = await ActivityService.updateActivity(id, updates)

    if (result.success && result.data) {
      setActivities(prev =>
        prev.map(a => a.id === id ? result.data! : a)
      )
      markDirty()
    }
  }, [markDirty])

  const deleteActivity = useCallback(async (id: string) => {
    const result = await ActivityService.deleteActivity(id)

    if (result.success) {
      setActivities(prev => prev.filter(a => a.id !== id))
      markDirty()
    }
  }, [markDirty])

  const selectActivityForStopDoing = useCallback(async (id: string, selected: boolean) => {
    await updateActivity(id, { is_selected_for_stop_doing: selected })
  }, [updateActivity])

  // ============================================
  // Import Activities from Time Log
  // ============================================
  const getTimeLogSummary = useCallback(() => {
    // Aggregate all time logs to get hours per activity
    const activityHours: Record<string, number> = {}

    timeLogs.forEach(log => {
      if (log.entries) {
        Object.values(log.entries).forEach(dayEntries => {
          if (dayEntries) {
            Object.values(dayEntries).forEach(activityId => {
              if (activityId) {
                // Each slot is 15 minutes = 0.25 hours
                activityHours[activityId] = (activityHours[activityId] || 0) + 0.25
              }
            })
          }
        })
      }
    })

    // Convert to weekly average (assuming time logs cover different weeks)
    const weekCount = timeLogs.length || 1
    const weeklyHours: Record<string, number> = {}
    Object.entries(activityHours).forEach(([id, hours]) => {
      weeklyHours[id] = Math.round((hours / weekCount) * 10) / 10
    })

    return weeklyHours
  }, [timeLogs])

  const importActivitiesFromTimeLog = useCallback(async () => {
    if (!businessId || !userId) return []

    const weeklyHours = getTimeLogSummary()
    const importedActivities: Activity[] = []

    // Activity labels map
    const activityLabels: Record<string, string> = {
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

    for (const [activityId, hoursPerWeek] of Object.entries(weeklyHours)) {
      // Skip breaks - not really a work activity
      if (activityId === 'break') continue

      // Skip numeric-only IDs (timestamps, auto-generated IDs)
      if (/^\d+$/.test(activityId)) continue

      // Get proper activity name with capitalization
      let activityName = activityLabels[activityId]
      if (!activityName) {
        // For custom activities, parse and capitalize
        const cleanId = activityId.replace('custom-', '')
        // Skip if it's just numbers
        if (/^\d+$/.test(cleanId)) continue
        activityName = cleanId.split(/[-_]/).map(
          word => word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ')
      }

      // Skip if activity already exists
      const existingActivity = activities.find(
        a => a.activity_name.toLowerCase() === activityName.toLowerCase()
      )
      if (existingActivity) continue

      // Calculate duration and frequency
      // Assume they do this activity every day they logged it
      const durationMinutes = Math.round((hoursPerWeek / 5) * 60) // Assume 5 days/week

      const result = await ActivityService.createActivity(businessId, userId, {
        activity_name: activityName,
        frequency: 'daily',
        duration_minutes: Math.max(15, durationMinutes), // Minimum 15 min
        zone: 'competence', // Default zone, user can adjust
        focus_funnel_outcome: null
      })

      if (result.success && result.data) {
        importedActivities.push(result.data)
        setActivities(prev => [...prev, result.data!])
      }
    }

    return importedActivities
  }, [businessId, userId, activities, getTimeLogSummary])

  // ============================================
  // Stop Doing Item Operations
  // ============================================
  const createStopDoingItemFromActivity = useCallback(async (activity: Activity) => {
    if (!businessId || !userId) return null

    const result = await StopDoingItemService.createFromActivity(
      businessId,
      userId,
      activity,
      calculatedHourlyRate
    )

    if (result.success && result.data) {
      setStopDoingItems(prev => [...prev, result.data!])
      // Also mark the activity as selected
      await selectActivityForStopDoing(activity.id, true)
      markDirty()
      return result.data
    }

    return null
  }, [businessId, userId, calculatedHourlyRate, selectActivityForStopDoing, markDirty])

  const updateStopDoingItem = useCallback(async (id: string, updates: Partial<StopDoingItem>) => {
    const result = await StopDoingItemService.updateStopDoingItem(id, updates)

    if (result.success && result.data) {
      setStopDoingItems(prev =>
        prev.map(item => item.id === id ? result.data! : item)
      )
      markDirty()
    }
  }, [markDirty])

  const deleteStopDoingItem = useCallback(async (id: string) => {
    const result = await StopDoingItemService.deleteStopDoingItem(id)

    if (result.success) {
      setStopDoingItems(prev => prev.filter(item => item.id !== id))
      markDirty()
    }
  }, [markDirty])

  const updateStopDoingItemStatus = useCallback(async (id: string, status: StopDoingStatus) => {
    await updateStopDoingItem(id, { status })
  }, [updateStopDoingItem])

  // ============================================
  // Generate Stop Doing Items from Selected Activities
  // ============================================
  const generateStopDoingItems = useCallback(async () => {
    if (!businessId || !userId) return

    const selectedActivities = activities.filter(a =>
      a.is_selected_for_stop_doing &&
      !stopDoingItems.some(item => item.activity_id === a.id)
    )

    for (const activity of selectedActivities) {
      await createStopDoingItemFromActivity(activity)
    }
  }, [activities, stopDoingItems, businessId, userId, createStopDoingItemFromActivity])

  // ============================================
  // Keep saveHourlyRateRef updated
  // ============================================
  useEffect(() => {
    saveHourlyRateRef.current = saveHourlyRate
  }, [saveHourlyRate])

  // ============================================
  // Auto-save Effect
  // ============================================
  useEffect(() => {
    if (!isLoadComplete || !isDirty || !businessId || !userId) return

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    // Use ref to get latest saveHourlyRate function
    // This prevents the effect from re-running when saveHourlyRate changes
    saveTimeoutRef.current = setTimeout(async () => {
      // Auto-save hourly rate if it has changed
      if (hourlyRate?.calculated_hourly_rate !== calculatedHourlyRate) {
        await saveHourlyRateRef.current()
      }
    }, 2000)

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [isLoadComplete, isDirty, businessId, userId, calculatedHourlyRate, hourlyRate])

  // Reset saved status after 3 seconds
  useEffect(() => {
    if (saveStatus === 'saved') {
      const timer = setTimeout(() => setSaveStatus('idle'), 3000)
      return () => clearTimeout(timer)
    }
  }, [saveStatus])

  // ============================================
  // Summary Calculations
  // ============================================
  const getTotalMonthlyHoursFreed = useCallback(() => {
    return stopDoingItems
      .filter(item => item.status !== 'identified')
      .reduce((sum, item) => sum + (item.monthly_hours || 0), 0)
  }, [stopDoingItems])

  const getTotalMonthlySavings = useCallback(() => {
    return stopDoingItems
      .filter(item => item.status !== 'identified')
      .reduce((sum, item) => sum + (item.opportunity_cost_monthly || 0), 0)
  }, [stopDoingItems])

  const getCompletedCount = useCallback(() => {
    return stopDoingItems.filter(item => item.status === 'completed').length
  }, [stopDoingItems])

  const getInProgressCount = useCallback(() => {
    return stopDoingItems.filter(item => item.status === 'in_progress').length
  }, [stopDoingItems])

  // ============================================
  // Return
  // ============================================
  return {
    // Loading & Error
    isLoading,
    error,
    businessId,
    userId,

    // Auto-save
    isDirty,
    saveStatus,
    lastSaved,
    markDirty,

    // Step 1: Time Logs
    timeLogs,
    currentTimeLog,
    currentWeekStart,
    changeWeek,
    updateTimeLogEntry,
    markTimeLogComplete,
    getMondayOfWeek,

    // Step 2: Hourly Rate
    hourlyRate,
    targetAnnualIncome,
    setTargetAnnualIncome: (value: number) => { setTargetAnnualIncome(value); markDirty() },
    workingWeeksPerYear,
    setWorkingWeeksPerYear: (value: number) => { setWorkingWeeksPerYear(value); markDirty() },
    hoursPerWeek,
    setHoursPerWeek: (value: number) => { setHoursPerWeek(value); markDirty() },
    calculatedHourlyRate,
    saveHourlyRate,

    // Step 3: Activities
    activities,
    addActivity,
    updateActivity,
    deleteActivity,
    selectActivityForStopDoing,
    getTimeLogSummary,
    importActivitiesFromTimeLog,
    hasTimeLogData: timeLogs.length > 0 && timeLogs.some(log => log.entries && Object.keys(log.entries).length > 0),

    // Step 4 & 5: Stop Doing Items
    stopDoingItems,
    createStopDoingItemFromActivity,
    updateStopDoingItem,
    deleteStopDoingItem,
    updateStopDoingItemStatus,
    generateStopDoingItems,

    // Step Completion
    stepCompletion,

    // Summary
    getTotalMonthlyHoursFreed,
    getTotalMonthlySavings,
    getCompletedCount,
    getInProgressCount
  }
}

export default useStopDoingList
