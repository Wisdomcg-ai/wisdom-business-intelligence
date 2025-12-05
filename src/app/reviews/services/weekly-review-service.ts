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

// Rock progress for Align section
export interface RockProgress {
  rockId: string
  rockTitle: string
  status: 'on_track' | 'at_risk' | 'behind' | 'completed'
  progressNotes?: string
  pivotNeeded?: boolean
  pivotNotes?: string
}

// Weekly priority linked to rocks
export interface WeeklyPriority {
  id: string
  priority: string
  linkedRockId?: string // Optional link to a rock
  completed: boolean
  carriedForward?: boolean // True if this priority was carried over from the previous week
}

export interface TeamMemberReviewStatus {
  userId: string
  userName: string
  role: string
  hasReview: boolean
  isComplete: boolean
  reviewId?: string
  weekRating?: number
  energyRating?: number
  completedAt?: string
}

export interface WeeklyReview {
  id?: string
  business_id: string
  user_id: string
  submitter_name?: string
  week_start_date: string
  week_end_date: string

  // ============================================================================
  // SECTION 1: LOOK BACK
  // ============================================================================

  // Energy & Rating (at the start for gut-check)
  energy_rating: number | null // 1-10
  week_rating: number | null // 1-10
  rating_reason: string

  // Wins & Highlights
  wins: string[]

  // Challenges & Frustrations
  challenges: string[]

  // Key Learning
  key_learning: string

  // Weekly Checklist (disciplines)
  disciplines_completed: DisciplineCompleted[]

  // ============================================================================
  // SECTION 2: ALIGN (with 90-day plan)
  // ============================================================================

  // Financial targets from plan (read-only display, stored for historical record)
  quarterly_revenue_target: number | null
  quarterly_gp_target: number | null
  quarterly_np_target: number | null

  // Rock progress check
  rock_progress: RockProgress[]

  // Overall alignment notes
  alignment_notes: string

  // ============================================================================
  // SECTION 3: PLAN FORWARD
  // ============================================================================

  // Top 3 Priorities (connected to rocks)
  top_priorities: WeeklyPriority[]

  // Other weekly goals
  other_priorities: string[]

  // Important Dates & Deadlines
  important_dates: ImportantDate[]

  // Start/Stop Doing
  stop_doing: string[]
  start_doing: string[]

  // Questions for Coach
  coach_questions: CoachQuestion[]

  // ============================================================================
  // LEGACY FIELDS (for backward compatibility)
  // ============================================================================
  last_week_goals: LastWeekGoal[]
  completion_rate: number
  next_week_goals: string[]

  // ============================================================================
  // STATUS
  // ============================================================================
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

      // Try to get previous week's review to carry forward incomplete items
      const prevWeekStart = new Date(weekStartDate)
      prevWeekStart.setDate(prevWeekStart.getDate() - 7)
      const prevWeekStartStr = prevWeekStart.toISOString().split('T')[0]

      const { data: prevWeekReview } = await this.supabase
        .from('weekly_reviews')
        .select('top_priorities, other_priorities')
        .eq('business_id', businessId)
        .eq('user_id', userId)
        .eq('week_start_date', prevWeekStartStr)
        .single()

      // Carry forward incomplete priorities from last week
      let carriedTopPriorities: WeeklyPriority[] = []
      let carriedOtherPriorities: string[] = []

      if (prevWeekReview) {
        // Carry forward incomplete top priorities (mark as carried forward)
        const prevTopPriorities = (prevWeekReview.top_priorities || []) as WeeklyPriority[]
        carriedTopPriorities = prevTopPriorities
          .filter(p => !p.completed)
          .map(p => ({
            ...p,
            id: `priority-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            completed: false,
            carriedForward: true
          }))

        // Carry forward other priorities (all of them since they don't have completed status)
        carriedOtherPriorities = (prevWeekReview.other_priorities || []) as string[]

        if (carriedTopPriorities.length > 0 || carriedOtherPriorities.length > 0) {
          console.log(`[Weekly Review] 📋 Carried forward ${carriedTopPriorities.length} priorities and ${carriedOtherPriorities.length} other goals from previous week`)
        }
      }

      const newReview: Partial<WeeklyReview> = {
        business_id: businessId,
        user_id: userId,
        week_start_date: weekStartDate,
        week_end_date: weekEndDate,

        // Section 1: Look Back
        energy_rating: null,
        week_rating: null,
        rating_reason: '',
        wins: [],
        challenges: [],
        key_learning: '',
        disciplines_completed: [
          { discipline: 'Dashboard updated', completed: false },
          { discipline: '90 day plan reviewed', completed: false },
          { discipline: 'Reviewed Financials', completed: false },
          { discipline: 'Team check-in', completed: false },
        ],

        // Section 2: Align
        quarterly_revenue_target: null,
        quarterly_gp_target: null,
        quarterly_np_target: null,
        rock_progress: [],
        alignment_notes: '',

        // Section 3: Plan Forward - carry forward incomplete priorities
        top_priorities: carriedTopPriorities,
        other_priorities: carriedOtherPriorities,
        important_dates: [],
        stop_doing: [],
        start_doing: [],
        coach_questions: [],

        // Legacy - store last week's priorities for "Did you achieve?" section
        last_week_goals: prevWeekReview ? [
          ...(prevWeekReview.top_priorities || []).map((p: any) => ({
            goal: p.priority,
            achieved: p.completed || false
          })),
          ...(prevWeekReview.other_priorities || []).map((p: string) => ({
            goal: p,
            achieved: false
          }))
        ] : [],
        completion_rate: 0,
        next_week_goals: [],

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

        // Section 1: Look Back
        energy_rating: review.energy_rating,
        week_rating: review.week_rating,
        rating_reason: review.rating_reason,
        wins: review.wins,
        challenges: review.challenges,
        key_learning: review.key_learning,
        disciplines_completed: review.disciplines_completed,

        // Section 2: Align
        quarterly_revenue_target: review.quarterly_revenue_target,
        quarterly_gp_target: review.quarterly_gp_target,
        quarterly_np_target: review.quarterly_np_target,
        rock_progress: review.rock_progress,
        alignment_notes: review.alignment_notes,

        // Section 3: Plan Forward
        top_priorities: review.top_priorities,
        other_priorities: review.other_priorities,
        important_dates: review.important_dates,
        stop_doing: review.stop_doing,
        start_doing: review.start_doing,
        coach_questions: review.coach_questions,

        // Legacy
        last_week_goals: review.last_week_goals,
        completion_rate: review.completion_rate,
        next_week_goals: review.next_week_goals,

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
   * Get incomplete reviews for current week (for coach dashboard)
   */
  static async getIncompleteReviewsForWeek(
    businessIds: string[],
    weekStartDate: string
  ): Promise<{ businessId: string; hasReview: boolean; isComplete: boolean }[]> {
    try {
      if (!businessIds.length) return []

      const { data, error } = await this.supabase
        .from('weekly_reviews')
        .select('business_id, is_completed')
        .in('business_id', businessIds)
        .eq('week_start_date', weekStartDate)

      if (error) {
        console.error('[Weekly Review] ❌ Error checking incomplete reviews:', error)
        return []
      }

      // Map results
      const reviewMap = new Map(data?.map(r => [r.business_id, r.is_completed]) || [])

      return businessIds.map(bizId => ({
        businessId: bizId,
        hasReview: reviewMap.has(bizId),
        isComplete: reviewMap.get(bizId) === true
      }))
    } catch (err) {
      console.error('[Weekly Review] ❌ Error checking incomplete reviews:', err)
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
   * Get all team member reviews for a specific week
   * Used by business owners and coaches to see all team submissions
   */
  static async getTeamReviewsForWeek(
    businessId: string,
    weekStartDate: string
  ): Promise<WeeklyReview[]> {
    try {
      if (!businessId) return []

      const { data, error } = await this.supabase
        .from('weekly_reviews')
        .select('*')
        .eq('business_id', businessId)
        .eq('week_start_date', weekStartDate)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('[Weekly Review] ❌ Error loading team reviews:', error)
        return []
      }

      console.log(`[Weekly Review] 📥 Loaded ${data?.length || 0} team reviews for week ${weekStartDate}`)
      return (data || []).map(this.mapFromDatabase)
    } catch (err) {
      console.error('[Weekly Review] ❌ Error loading team reviews:', err)
      return []
    }
  }

  /**
   * Get team members and their review status for a specific week
   * Shows who has/hasn't completed their review
   */
  static async getTeamReviewStatus(
    businessId: string,
    weekStartDate: string
  ): Promise<TeamMemberReviewStatus[]> {
    try {
      if (!businessId) return []

      // Get all team members with weekly review enabled
      const { data: teamMembers, error: teamError } = await this.supabase
        .from('business_users')
        .select(`
          user_id,
          role,
          weekly_review_enabled,
          users:user_id (
            first_name,
            last_name,
            email
          )
        `)
        .eq('business_id', businessId)
        .eq('status', 'active')
        .eq('weekly_review_enabled', true)

      if (teamError) {
        console.error('[Weekly Review] ❌ Error loading team members:', teamError)
        return []
      }

      // Get reviews for this week
      const { data: reviews, error: reviewError } = await this.supabase
        .from('weekly_reviews')
        .select('id, user_id, is_completed, week_rating, energy_rating, completed_at, submitter_name')
        .eq('business_id', businessId)
        .eq('week_start_date', weekStartDate)

      if (reviewError) {
        console.error('[Weekly Review] ❌ Error loading reviews:', reviewError)
      }

      // Map review data by user_id
      const reviewMap = new Map(
        (reviews || []).map(r => [r.user_id, r])
      )

      // Build status for each team member
      const statuses: TeamMemberReviewStatus[] = (teamMembers || []).map(member => {
        const user = member.users as any
        const review = reviewMap.get(member.user_id)
        const userName = user?.first_name && user?.last_name
          ? `${user.first_name} ${user.last_name}`
          : review?.submitter_name || user?.email || 'Unknown'

        return {
          userId: member.user_id,
          userName,
          role: member.role,
          hasReview: !!review,
          isComplete: review?.is_completed || false,
          reviewId: review?.id,
          weekRating: review?.week_rating,
          energyRating: review?.energy_rating,
          completedAt: review?.completed_at
        }
      })

      console.log(`[Weekly Review] 📊 Team status: ${statuses.filter(s => s.isComplete).length}/${statuses.length} complete`)
      return statuses
    } catch (err) {
      console.error('[Weekly Review] ❌ Error getting team status:', err)
      return []
    }
  }

  /**
   * Get team members who have weekly review enabled
   */
  static async getTeamMembersWithReviewEnabled(
    businessId: string
  ): Promise<{ userId: string; userName: string; role: string; enabled: boolean }[]> {
    try {
      if (!businessId) return []

      const { data, error } = await this.supabase
        .from('business_users')
        .select(`
          user_id,
          role,
          weekly_review_enabled,
          users:user_id (
            first_name,
            last_name,
            email
          )
        `)
        .eq('business_id', businessId)
        .eq('status', 'active')

      if (error) {
        console.error('[Weekly Review] ❌ Error loading team members:', error)
        return []
      }

      return (data || []).map(member => {
        const user = member.users as any
        return {
          userId: member.user_id,
          userName: user?.first_name && user?.last_name
            ? `${user.first_name} ${user.last_name}`
            : user?.email || 'Unknown',
          role: member.role,
          enabled: member.weekly_review_enabled ?? true
        }
      })
    } catch (err) {
      console.error('[Weekly Review] ❌ Error loading team members:', err)
      return []
    }
  }

  /**
   * Toggle weekly review enabled for a team member
   */
  static async setTeamMemberReviewEnabled(
    businessId: string,
    userId: string,
    enabled: boolean
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await this.supabase
        .from('business_users')
        .update({ weekly_review_enabled: enabled })
        .eq('business_id', businessId)
        .eq('user_id', userId)

      if (error) {
        console.error('[Weekly Review] ❌ Error updating team member:', error)
        return { success: false, error: error.message }
      }

      console.log(`[Weekly Review] ✅ Set weekly_review_enabled=${enabled} for user ${userId}`)
      return { success: true }
    } catch (err) {
      console.error('[Weekly Review] ❌ Error updating team member:', err)
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
      submitter_name: row.submitter_name,
      week_start_date: row.week_start_date,
      week_end_date: row.week_end_date,

      // Section 1: Look Back
      energy_rating: row.energy_rating ?? null,
      week_rating: row.week_rating ?? null,
      rating_reason: row.rating_reason || '',
      wins: row.wins || [],
      challenges: row.challenges || [],
      key_learning: row.key_learning || '',
      disciplines_completed: row.disciplines_completed || [],

      // Section 2: Align
      quarterly_revenue_target: row.quarterly_revenue_target ?? null,
      quarterly_gp_target: row.quarterly_gp_target ?? null,
      quarterly_np_target: row.quarterly_np_target ?? null,
      rock_progress: row.rock_progress || [],
      alignment_notes: row.alignment_notes || '',

      // Section 3: Plan Forward
      top_priorities: row.top_priorities || [],
      other_priorities: row.other_priorities || [],
      important_dates: row.important_dates || [],
      stop_doing: row.stop_doing || [],
      start_doing: row.start_doing || [],
      coach_questions: row.coach_questions || [],

      // Legacy
      last_week_goals: row.last_week_goals || [],
      completion_rate: row.completion_rate || 0,
      next_week_goals: row.next_week_goals || [],

      is_completed: row.is_completed || false,
      completed_at: row.completed_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  }
}

export default WeeklyReviewService
