/**
 * Stop Doing List Service
 * =======================
 * Database operations for the Stop Doing List feature
 */

import { createClient } from '@/lib/supabase/client'
import type {
  TimeLog,
  TimeLogDay,
  HourlyRate,
  Activity,
  StopDoingItem,
  Frequency,
  Zone,
  FocusFunnelOutcome,
  Importance,
  StopDoingStatus
} from '../types'

// ============================================
// Time Log Operations
// ============================================
export class TimeLogService {
  static async getTimeLogs(businessId: string): Promise<TimeLog[]> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('stop_doing_time_logs')
      .select('*')
      .eq('business_id', businessId)
      .order('week_start_date', { ascending: false })

    if (error) {
      console.error('[TimeLogService] Error loading time logs:', error)
      return []
    }

    return data || []
  }

  static async getTimeLogByWeek(businessId: string, weekStartDate: string): Promise<TimeLog | null> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('stop_doing_time_logs')
      .select('*')
      .eq('business_id', businessId)
      .eq('week_start_date', weekStartDate)
      .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('[TimeLogService] Error loading time log:', error)
    }

    return data || null
  }

  static async saveTimeLog(
    businessId: string,
    userId: string,
    weekStartDate: string,
    entries: TimeLogDay,
    totalMinutes: number,
    isComplete: boolean
  ): Promise<{ success: boolean; error?: string; data?: TimeLog }> {
    const supabase = createClient()

    const { data, error } = await supabase
      .from('stop_doing_time_logs')
      .upsert({
        business_id: businessId,
        user_id: userId,
        week_start_date: weekStartDate,
        entries,
        total_minutes: totalMinutes,
        is_complete: isComplete
      }, {
        onConflict: 'business_id,week_start_date'
      })
      .select()
      .single()

    if (error) {
      console.error('[TimeLogService] Error saving time log:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data }
  }

  static async deleteTimeLog(id: string): Promise<{ success: boolean; error?: string }> {
    const supabase = createClient()
    const { error } = await supabase
      .from('stop_doing_time_logs')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('[TimeLogService] Error deleting time log:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  }
}

// ============================================
// Hourly Rate Operations
// ============================================
export class HourlyRateService {
  static async getHourlyRate(businessId: string): Promise<HourlyRate | null> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('stop_doing_hourly_rates')
      .select('*')
      .eq('business_id', businessId)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('[HourlyRateService] Error loading hourly rate:', error)
    }

    return data || null
  }

  static async saveHourlyRate(
    businessId: string,
    userId: string,
    targetAnnualIncome: number,
    workingWeeksPerYear: number,
    hoursPerWeek: number
  ): Promise<{ success: boolean; error?: string; data?: HourlyRate }> {
    const supabase = createClient()

    // Calculate hourly rate
    const totalAnnualHours = workingWeeksPerYear * hoursPerWeek
    const calculatedHourlyRate = totalAnnualHours > 0
      ? Math.round((targetAnnualIncome / totalAnnualHours) * 100) / 100
      : 0

    const { data, error } = await supabase
      .from('stop_doing_hourly_rates')
      .upsert({
        business_id: businessId,
        user_id: userId,
        target_annual_income: targetAnnualIncome,
        working_weeks_per_year: workingWeeksPerYear,
        hours_per_week: hoursPerWeek,
        calculated_hourly_rate: calculatedHourlyRate
      }, {
        onConflict: 'business_id'
      })
      .select()
      .single()

    if (error) {
      console.error('[HourlyRateService] Error saving hourly rate:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data }
  }
}

// ============================================
// Activity Operations
// ============================================
export class ActivityService {
  static async getActivities(businessId: string): Promise<Activity[]> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('stop_doing_activities')
      .select('*')
      .eq('business_id', businessId)
      .order('order_index', { ascending: true })

    if (error) {
      console.error('[ActivityService] Error loading activities:', error)
      return []
    }

    return data || []
  }

  static async createActivity(
    businessId: string,
    userId: string,
    activity: Partial<Activity>
  ): Promise<{ success: boolean; error?: string; data?: Activity }> {
    const supabase = createClient()

    // Get the next order index
    const { data: existingActivities } = await supabase
      .from('stop_doing_activities')
      .select('order_index')
      .eq('business_id', businessId)
      .order('order_index', { ascending: false })
      .limit(1)

    const nextOrderIndex = (existingActivities?.[0]?.order_index ?? -1) + 1

    const { data, error } = await supabase
      .from('stop_doing_activities')
      .insert({
        business_id: businessId,
        user_id: userId,
        activity_name: activity.activity_name || 'New Activity',
        frequency: activity.frequency || 'weekly',
        duration_minutes: activity.duration_minutes || 30,
        zone: activity.zone || 'competence',
        focus_funnel_outcome: activity.focus_funnel_outcome || null,
        special_skills_required: activity.special_skills_required || null,
        importance: activity.importance || 'medium',
        has_system: activity.has_system || false,
        delegation_hourly_rate: activity.delegation_hourly_rate || null,
        order_index: nextOrderIndex,
        is_selected_for_stop_doing: activity.is_selected_for_stop_doing || false
      })
      .select()
      .single()

    if (error) {
      console.error('[ActivityService] Error creating activity:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data }
  }

  static async updateActivity(
    id: string,
    updates: Partial<Activity>
  ): Promise<{ success: boolean; error?: string; data?: Activity }> {
    const supabase = createClient()

    const { data, error } = await supabase
      .from('stop_doing_activities')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('[ActivityService] Error updating activity:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data }
  }

  static async deleteActivity(id: string): Promise<{ success: boolean; error?: string }> {
    const supabase = createClient()
    const { error } = await supabase
      .from('stop_doing_activities')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('[ActivityService] Error deleting activity:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  }

  static async bulkUpdateActivities(
    activities: Activity[]
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = createClient()

    // Update each activity
    const updates = activities.map((activity, index) => ({
      id: activity.id,
      order_index: index,
      is_selected_for_stop_doing: activity.is_selected_for_stop_doing
    }))

    for (const update of updates) {
      const { error } = await supabase
        .from('stop_doing_activities')
        .update({
          order_index: update.order_index,
          is_selected_for_stop_doing: update.is_selected_for_stop_doing
        })
        .eq('id', update.id)

      if (error) {
        console.error('[ActivityService] Error bulk updating activity:', error)
        return { success: false, error: error.message }
      }
    }

    return { success: true }
  }
}

// ============================================
// Stop Doing Item Operations
// ============================================
export class StopDoingItemService {
  static async getStopDoingItems(businessId: string): Promise<StopDoingItem[]> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('stop_doing_items')
      .select('*')
      .eq('business_id', businessId)
      .order('order_index', { ascending: true })

    if (error) {
      console.error('[StopDoingItemService] Error loading items:', error)
      return []
    }

    return data || []
  }

  static async createStopDoingItem(
    businessId: string,
    userId: string,
    item: Partial<StopDoingItem>
  ): Promise<{ success: boolean; error?: string; data?: StopDoingItem }> {
    const supabase = createClient()

    // Get the next order index
    const { data: existingItems } = await supabase
      .from('stop_doing_items')
      .select('order_index')
      .eq('business_id', businessId)
      .order('order_index', { ascending: false })
      .limit(1)

    const nextOrderIndex = (existingItems?.[0]?.order_index ?? -1) + 1

    const { data, error } = await supabase
      .from('stop_doing_items')
      .insert({
        business_id: businessId,
        user_id: userId,
        activity_id: item.activity_id || null,
        item_name: item.item_name || 'New Item',
        zone: item.zone || null,
        focus_funnel_outcome: item.focus_funnel_outcome || null,
        monthly_hours: item.monthly_hours || 0,
        hourly_rate_used: item.hourly_rate_used || 0,
        delegation_rate: item.delegation_rate || 0,
        net_gain_loss: item.net_gain_loss || 0,
        opportunity_cost_monthly: item.opportunity_cost_monthly || 0,
        suggested_decision: item.suggested_decision || null,
        delegate_to: item.delegate_to || null,
        target_date: item.target_date || null,
        notes: item.notes || null,
        status: item.status || 'identified',
        order_index: nextOrderIndex
      })
      .select()
      .single()

    if (error) {
      console.error('[StopDoingItemService] Error creating item:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data }
  }

  static async updateStopDoingItem(
    id: string,
    updates: Partial<StopDoingItem>
  ): Promise<{ success: boolean; error?: string; data?: StopDoingItem }> {
    const supabase = createClient()

    // If status is changing to completed, set completed_at
    if (updates.status === 'completed' && !updates.completed_at) {
      updates.completed_at = new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('stop_doing_items')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('[StopDoingItemService] Error updating item:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data }
  }

  static async deleteStopDoingItem(id: string): Promise<{ success: boolean; error?: string }> {
    const supabase = createClient()
    const { error } = await supabase
      .from('stop_doing_items')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('[StopDoingItemService] Error deleting item:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  }

  static async createFromActivity(
    businessId: string,
    userId: string,
    activity: Activity,
    hourlyRate: number
  ): Promise<{ success: boolean; error?: string; data?: StopDoingItem }> {
    const { calculateMonthlyHours, calculateOpportunityCost, calculateNetGainLoss, getSuggestedDecision } = await import('../types')

    const monthlyHours = calculateMonthlyHours(activity.duration_minutes, activity.frequency)
    const delegationRate = activity.delegation_hourly_rate || 0
    const netGainLoss = calculateNetGainLoss(hourlyRate, delegationRate)
    const opportunityCost = calculateOpportunityCost(monthlyHours, hourlyRate)
    const suggestedDecision = getSuggestedDecision(activity.zone, activity.focus_funnel_outcome)

    return this.createStopDoingItem(businessId, userId, {
      activity_id: activity.id,
      item_name: activity.activity_name,
      zone: activity.zone,
      focus_funnel_outcome: activity.focus_funnel_outcome,
      monthly_hours: monthlyHours,
      hourly_rate_used: hourlyRate,
      delegation_rate: delegationRate,
      net_gain_loss: netGainLoss,
      opportunity_cost_monthly: opportunityCost,
      suggested_decision: suggestedDecision
    })
  }

  static async bulkUpdateOrder(
    items: { id: string; order_index: number }[]
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = createClient()

    for (const item of items) {
      const { error } = await supabase
        .from('stop_doing_items')
        .update({ order_index: item.order_index })
        .eq('id', item.id)

      if (error) {
        console.error('[StopDoingItemService] Error updating order:', error)
        return { success: false, error: error.message }
      }
    }

    return { success: true }
  }
}

// ============================================
// Combined Service for Loading All Data
// ============================================
export class StopDoingService {
  static async loadAllData(businessId: string): Promise<{
    timeLogs: TimeLog[]
    hourlyRate: HourlyRate | null
    activities: Activity[]
    stopDoingItems: StopDoingItem[]
  }> {
    const [timeLogs, hourlyRate, activities, stopDoingItems] = await Promise.all([
      TimeLogService.getTimeLogs(businessId),
      HourlyRateService.getHourlyRate(businessId),
      ActivityService.getActivities(businessId),
      StopDoingItemService.getStopDoingItems(businessId)
    ])

    return { timeLogs, hourlyRate, activities, stopDoingItems }
  }

  static async getStepCompletion(businessId: string): Promise<{
    step1Complete: boolean
    step2Complete: boolean
    step3Complete: boolean
    step4Complete: boolean
    step5Complete: boolean
    overallProgress: number
  }> {
    const { timeLogs, hourlyRate, activities, stopDoingItems } = await this.loadAllData(businessId)

    const step1Complete = timeLogs.some(log => log.is_complete)
    const step2Complete = hourlyRate !== null && hourlyRate.calculated_hourly_rate > 0
    const step3Complete = activities.length >= 5 // At least 5 activities
    const step4Complete = activities.some(a => a.is_selected_for_stop_doing)
    const step5Complete = stopDoingItems.some(item => item.status !== 'identified')

    const completedSteps = [step1Complete, step2Complete, step3Complete, step4Complete, step5Complete].filter(Boolean).length
    const overallProgress = Math.round((completedSteps / 5) * 100)

    return {
      step1Complete,
      step2Complete,
      step3Complete,
      step4Complete,
      step5Complete,
      overallProgress
    }
  }
}

export default StopDoingService
