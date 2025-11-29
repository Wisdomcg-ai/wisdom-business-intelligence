'use client'

import { createClient } from '@/lib/supabase/client'

export interface WeeklyMetricsSnapshot {
  id?: string
  business_id: string
  user_id: string
  week_ending_date: string

  // Financial Metrics
  revenue_actual?: number
  gross_profit_actual?: number
  net_profit_actual?: number

  // Core Metrics
  leads_actual?: number
  conversion_rate_actual?: number
  avg_transaction_value_actual?: number
  team_headcount_actual?: number
  owner_hours_actual?: number

  // KPI Values
  kpi_actuals?: Record<string, number>

  notes?: string

  created_at?: string
  updated_at?: string
}

export class WeeklyMetricsService {
  private static supabase = createClient()

  /**
   * Get the upcoming Friday date (week ending)
   * Returns the Friday at the end of the current week
   */
  static getWeekEnding(date: Date = new Date()): string {
    const d = new Date(date)
    const day = d.getDay() // 0 = Sunday, 5 = Friday

    // Calculate days to ADD to get to next Friday (or today if Friday)
    // If today is Friday (5), use 0
    // If today is Saturday (6), go forward 6 days to next Friday
    // If today is Sunday (0), go forward 5 days
    // If today is Monday (1), go forward 4 days
    // If today is Tuesday (2), go forward 3 days
    // If today is Wednesday (3), go forward 2 days
    // If today is Thursday (4), go forward 1 day
    const daysToFriday = day === 5 ? 0 : (5 - day + 7) % 7
    d.setDate(d.getDate() + daysToFriday)

    // Format in local timezone to avoid UTC conversion issues
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const dayOfMonth = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${dayOfMonth}`
  }

  /**
   * Get the most recent Monday date (week beginning)
   */
  static getWeekBeginning(date: Date = new Date()): string {
    const d = new Date(date)
    const day = d.getDay() // 0 = Sunday, 1 = Monday

    // Calculate days to subtract to get to last Monday
    // If today is Monday (1), use 0
    // If today is Tuesday-Sunday, go back to previous Monday
    const daysToMonday = day === 0 ? 6 : day - 1
    d.setDate(d.getDate() - daysToMonday)

    // Format in local timezone to avoid UTC conversion issues
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const dayOfMonth = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${dayOfMonth}`
  }

  /**
   * Get current quarter and year
   */
  static getCurrentQuarter(): { quarter: number; year: number } {
    const now = new Date()
    const month = now.getMonth() // 0-11
    const quarter = Math.floor(month / 3) + 1 // 1-4
    return { quarter, year: now.getFullYear() }
  }

  /**
   * Get all weeks in a specific quarter
   */
  static getQuarterWeeks(year: number, quarter: number, weekPreference: 'ending' | 'beginning' = 'ending'): string[] {
    // Quarter start months: Q1=0, Q2=3, Q3=6, Q4=9
    const startMonth = (quarter - 1) * 3
    const quarterStart = new Date(year, startMonth, 1)
    const quarterEnd = new Date(year, startMonth + 3, 0) // Last day of quarter

    return this.getWeeksInRange(quarterStart, quarterEnd, weekPreference)
  }

  /**
   * Get all week dates (Fridays or Mondays) within a date range
   */
  static getWeeksInRange(startDate: Date, endDate: Date, weekPreference: 'ending' | 'beginning' = 'ending'): string[] {
    const weeks: string[] = []
    const targetDay = weekPreference === 'ending' ? 5 : 1 // 5 = Friday, 1 = Monday

    // Work with date strings to avoid timezone issues
    // Create a date at noon to avoid DST/timezone boundary issues
    let current = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 12, 0, 0)
    const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 12, 0, 0)

    const currentDay = current.getDay()

    // Find the first occurrence of target day (Friday or Monday) on or after startDate
    let daysUntilTarget: number
    if (currentDay === targetDay) {
      daysUntilTarget = 0
    } else if (currentDay < targetDay) {
      daysUntilTarget = targetDay - currentDay
    } else {
      daysUntilTarget = 7 - currentDay + targetDay
    }

    current.setDate(current.getDate() + daysUntilTarget)

    // Generate all occurrences of target day within the range
    while (current <= end) {
      const year = current.getFullYear()
      const month = String(current.getMonth() + 1).padStart(2, '0')
      const day = String(current.getDate()).padStart(2, '0')
      weeks.push(`${year}-${month}-${day}`)
      current.setDate(current.getDate() + 7)
    }

    return weeks
  }

  /**
   * Get quarter label (e.g., "Q4 2024")
   */
  static getQuarterLabel(year: number, quarter: number): string {
    return `Q${quarter} ${year}`
  }

  /**
   * Get quarter date range (e.g., "Oct-Dec")
   */
  static getQuarterDateRange(year: number, quarter: number): string {
    const startMonth = (quarter - 1) * 3
    const endMonth = startMonth + 2
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${monthNames[startMonth]}-${monthNames[endMonth]}`
  }

  /**
   * Get or create a weekly snapshot for a specific week
   */
  static async getOrCreateSnapshot(
    businessId: string,
    userId: string,
    weekEndingDate: string
  ): Promise<{ snapshot: WeeklyMetricsSnapshot | null; error?: string }> {
    try {
      if (!businessId || !userId) {
        return { snapshot: null, error: 'Business ID and User ID required' }
      }

      // Try to fetch existing snapshot
      const { data: existingSnapshot, error: fetchError } = await this.supabase
        .from('weekly_metrics_snapshots')
        .select('*')
        .eq('business_id', businessId)
        .eq('week_ending_date', weekEndingDate)
        .single()

      if (existingSnapshot) {
        return { snapshot: this.mapFromDatabase(existingSnapshot) }
      }

      // Create new snapshot
      const newSnapshot: Partial<WeeklyMetricsSnapshot> = {
        business_id: businessId,
        user_id: userId,
        week_ending_date: weekEndingDate,
        kpi_actuals: {},
      }

      const { data: createdSnapshot, error: createError } = await this.supabase
        .from('weekly_metrics_snapshots')
        .insert([newSnapshot])
        .select()
        .single()

      if (createError) {
        console.error('[Weekly Metrics] Error creating snapshot:', createError)
        return { snapshot: null, error: createError.message }
      }

      return { snapshot: this.mapFromDatabase(createdSnapshot) }
    } catch (err) {
      console.error('[Weekly Metrics] Error getting/creating snapshot:', err)
      return { snapshot: null, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  }

  /**
   * Save a weekly snapshot
   */
  static async saveSnapshot(snapshot: WeeklyMetricsSnapshot): Promise<{ success: boolean; error?: string }> {
    try {
      if (!snapshot.business_id || !snapshot.user_id) {
        return { success: false, error: 'Business ID and User ID required' }
      }

      const dataToSave = {
        business_id: snapshot.business_id,
        user_id: snapshot.user_id,
        week_ending_date: snapshot.week_ending_date,
        revenue_actual: snapshot.revenue_actual || null,
        gross_profit_actual: snapshot.gross_profit_actual || null,
        net_profit_actual: snapshot.net_profit_actual || null,
        leads_actual: snapshot.leads_actual || null,
        conversion_rate_actual: snapshot.conversion_rate_actual || null,
        avg_transaction_value_actual: snapshot.avg_transaction_value_actual || null,
        team_headcount_actual: snapshot.team_headcount_actual || null,
        owner_hours_actual: snapshot.owner_hours_actual || null,
        kpi_actuals: snapshot.kpi_actuals || {},
        notes: snapshot.notes || null,
        updated_at: new Date().toISOString(),
      }

      if (snapshot.id) {
        // Update existing
        const { error } = await this.supabase
          .from('weekly_metrics_snapshots')
          .update(dataToSave)
          .eq('id', snapshot.id)

        if (error) {
          console.error('[Weekly Metrics] Error updating:', error)
          return { success: false, error: error.message }
        }
      } else {
        // Insert new
        const { error } = await this.supabase
          .from('weekly_metrics_snapshots')
          .insert([dataToSave])

        if (error) {
          console.error('[Weekly Metrics] Error inserting:', error)
          return { success: false, error: error.message }
        }
      }

      return { success: true }
    } catch (err) {
      console.error('[Weekly Metrics] Error saving:', err)
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  }

  /**
   * Get recent snapshots for trend analysis
   */
  static async getRecentSnapshots(
    businessId: string,
    limit: number = 12
  ): Promise<WeeklyMetricsSnapshot[]> {
    try {
      if (!businessId) return []

      const { data, error } = await this.supabase
        .from('weekly_metrics_snapshots')
        .select('*')
        .eq('business_id', businessId)
        .order('week_ending_date', { ascending: false })
        .limit(limit)

      if (error) {
        console.error('[Weekly Metrics] Error loading snapshots:', error)
        return []
      }

      return (data || []).map(this.mapFromDatabase)
    } catch (err) {
      console.error('[Weekly Metrics] Error loading snapshots:', err)
      return []
    }
  }

  /**
   * Map database row to WeeklyMetricsSnapshot
   */
  private static mapFromDatabase(row: any): WeeklyMetricsSnapshot {
    return {
      id: row.id,
      business_id: row.business_id,
      user_id: row.user_id,
      week_ending_date: row.week_ending_date,
      revenue_actual: row.revenue_actual,
      gross_profit_actual: row.gross_profit_actual,
      net_profit_actual: row.net_profit_actual,
      leads_actual: row.leads_actual,
      conversion_rate_actual: row.conversion_rate_actual,
      avg_transaction_value_actual: row.avg_transaction_value_actual,
      team_headcount_actual: row.team_headcount_actual,
      owner_hours_actual: row.owner_hours_actual,
      kpi_actuals: row.kpi_actuals || {},
      notes: row.notes,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  }
}

export default WeeklyMetricsService
