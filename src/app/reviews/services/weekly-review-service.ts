'use client'

import { createClient } from '@/lib/supabase/client'

export interface LastWeekGoal {
  goal: string
  achieved: boolean
  comment: string
}

export interface DisciplineCompleted {
  discipline: string
  completed: boolean
}

export interface ImportantDate {
  date: string
  description: string
}

export interface CoachQuestion {
  question: string
  priority: 'low' | 'medium' | 'high'
  category?: string
}

export interface WeeklyReview {
  id?: string
  business_id: string
  user_id: string
  week_start_date: string
  week_end_date: string

  // Reflection
  wins: string[]
  challenges: string[]
  key_learning: string

  // Accountability
  last_week_goals: LastWeekGoal[]
  completion_rate: number

  // Disciplines Checklist
  disciplines_completed: DisciplineCompleted[]

  // This Week Planning
  next_week_goals: string[]
  important_dates: ImportantDate[]

  // Summary
  stop_doing: string[]
  start_doing: string[]
  week_rating: number | null
  rating_reason: string

  // Questions for Coach
  coach_questions: CoachQuestion[]

  // Status
  is_completed: boolean
  completed_at?: string

  created_at?: string
  updated_at?: string
}

/**
 * Weekly Review Service - Supabase Integration
 */
export class WeeklyReviewService {
  private static supabase = createClient()

  /**
   * Get the start of the week (Monday) for a given date
   */
  static getWeekStart(date: Date = new Date()): string {
    const d = new Date(date)
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Adjust for Sunday
    d.setDate(diff)
    return d.toISOString().split('T')[0]
  }

  /**
   * Get the end of the week (Sunday) for a given date
   */
  static getWeekEnd(date: Date = new Date()): string {
    const d = new Date(date)
    const day = d.getDay()
    // Calculate days to add to get to Sunday
    // If Sunday (0), add 0 days
    // If Monday (1), add 6 days
    // If Tuesday (2), add 5 days, etc.
    const daysToAdd = day === 0 ? 0 : 7 - day
    d.setDate(d.getDate() + daysToAdd)
    return d.toISOString().split('T')[0]
  }

  /**
   * Get or create a weekly review for a specific week
   */
  static async getOrCreateReview(
    businessId: string,
    userId: string,
    weekStartDate: string
  ): Promise<{ review: WeeklyReview | null; error?: string }> {
    try {
      if (!businessId || !userId) {
        return { review: null, error: 'Business ID and User ID required' }
      }

      // Try to fetch existing review
      const { data: existingReview, error: fetchError } = await this.supabase
        .from('weekly_reviews')
        .select('*')
        .eq('business_id', businessId)
        .eq('week_start_date', weekStartDate)
        .single()

      if (existingReview) {
        console.log('[Weekly Review] ✅ Found existing review for week:', weekStartDate)
        return { review: this.mapFromDatabase(existingReview) }
      }

      // Create new review if it doesn't exist
      const weekEndDate = this.getWeekEnd(new Date(weekStartDate))
      const newReview: Partial<WeeklyReview> = {
        business_id: businessId,
        user_id: userId,
        week_start_date: weekStartDate,
        week_end_date: weekEndDate,
        wins: [],
        challenges: [],
        key_learning: '',
        last_week_goals: [],
        completion_rate: 0,
        disciplines_completed: [
          { discipline: 'Dashboard updated', completed: false },
          { discipline: '90 day plan reviewed', completed: false },
          { discipline: 'Reviewed Financials', completed: false },
          { discipline: 'Team check-in', completed: false },
        ],
        next_week_goals: [],
        important_dates: [],
        stop_doing: [],
        start_doing: [],
        week_rating: null,
        rating_reason: '',
        coach_questions: [],
        is_completed: false,
      }

      const { data: createdReview, error: createError } = await this.supabase
        .from('weekly_reviews')
        .insert([newReview])
        .select()
        .single()

      if (createError) {
        console.error('[Weekly Review] ❌ Error creating review:', createError)
        return { review: null, error: createError.message }
      }

      console.log('[Weekly Review] ✅ Created new review for week:', weekStartDate)
      return { review: this.mapFromDatabase(createdReview) }
    } catch (err) {
      console.error('[Weekly Review] ❌ Error getting/creating review:', err)
      return { review: null, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  }

  /**
   * Save a weekly review
   */
  static async saveReview(review: WeeklyReview): Promise<{ success: boolean; error?: string }> {
    try {
      if (!review.business_id || !review.user_id) {
        return { success: false, error: 'Business ID and User ID required' }
      }

      const dataToSave = {
        business_id: review.business_id,
        user_id: review.user_id,
        week_start_date: review.week_start_date,
        week_end_date: review.week_end_date,
        wins: review.wins,
        challenges: review.challenges,
        key_learning: review.key_learning,
        last_week_goals: review.last_week_goals,
        completion_rate: review.completion_rate,
        disciplines_completed: review.disciplines_completed,
        next_week_goals: review.next_week_goals,
        important_dates: review.important_dates,
        stop_doing: review.stop_doing,
        start_doing: review.start_doing,
        week_rating: review.week_rating,
        rating_reason: review.rating_reason,
        coach_questions: review.coach_questions,
        is_completed: review.is_completed,
        completed_at: review.is_completed ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }

      if (review.id) {
        // Update existing review
        const { error: updateError } = await this.supabase
          .from('weekly_reviews')
          .update(dataToSave)
          .eq('id', review.id)

        if (updateError) {
          console.error('[Weekly Review] ❌ Error updating review:', updateError)
          return { success: false, error: updateError.message }
        }

        console.log('[Weekly Review] ✅ Updated review:', review.id)
      } else {
        // Insert new review
        const { error: insertError } = await this.supabase
          .from('weekly_reviews')
          .insert([dataToSave])

        if (insertError) {
          console.error('[Weekly Review] ❌ Error inserting review:', insertError)
          return { success: false, error: insertError.message }
        }

        console.log('[Weekly Review] ✅ Inserted new review')
      }

      return { success: true }
    } catch (err) {
      console.error('[Weekly Review] ❌ Error saving review:', err)
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  }

  /**
   * Get all weekly reviews for a business (for history view)
   */
  static async getAllReviews(businessId: string): Promise<WeeklyReview[]> {
    try {
      if (!businessId) {
        return []
      }

      const { data, error } = await this.supabase
        .from('weekly_reviews')
        .select('*')
        .eq('business_id', businessId)
        .order('week_start_date', { ascending: false })

      if (error) {
        console.error('[Weekly Review] ❌ Error loading reviews:', error)
        return []
      }

      console.log(`[Weekly Review] 📥 Loaded ${data?.length || 0} reviews`)
      return (data || []).map(this.mapFromDatabase)
    } catch (err) {
      console.error('[Weekly Review] ❌ Error loading reviews:', err)
      return []
    }
  }

  /**
   * Delete a weekly review
   */
  static async deleteReview(reviewId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await this.supabase
        .from('weekly_reviews')
        .delete()
        .eq('id', reviewId)

      if (error) {
        console.error('[Weekly Review] ❌ Error deleting review:', error)
        return { success: false, error: error.message }
      }

      console.log('[Weekly Review] ✅ Deleted review:', reviewId)
      return { success: true }
    } catch (err) {
      console.error('[Weekly Review] ❌ Error deleting review:', err)
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  }

  /**
   * Map database row to WeeklyReview interface
   */
  private static mapFromDatabase(row: any): WeeklyReview {
    return {
      id: row.id,
      business_id: row.business_id,
      user_id: row.user_id,
      week_start_date: row.week_start_date,
      week_end_date: row.week_end_date,
      wins: row.wins || [],
      challenges: row.challenges || [],
      key_learning: row.key_learning || '',
      last_week_goals: row.last_week_goals || [],
      completion_rate: row.completion_rate || 0,
      disciplines_completed: row.disciplines_completed || [],
      next_week_goals: row.next_week_goals || [],
      important_dates: row.important_dates || [],
      stop_doing: row.stop_doing || [],
      start_doing: row.start_doing || [],
      week_rating: row.week_rating,
      rating_reason: row.rating_reason || '',
      coach_questions: row.coach_questions || [],
      is_completed: row.is_completed || false,
      completed_at: row.completed_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  }
}

export default WeeklyReviewService
