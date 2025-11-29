// /app/goals/services/operational-activities-service.ts
'use client'

import { createClient } from '@/lib/supabase/client'

export interface OperationalActivity {
  id: string
  function: string
  description: string
  assignedTo?: string
  orderIndex?: number
}

/**
 * Operational Activities Service - Supabase Integration
 *
 * Handles saving/loading operational activities for each business function
 */
export class OperationalActivitiesService {
  private static supabase = createClient()

  /**
   * Save operational activities
   */
  static async saveActivities(
    businessId: string,
    userId: string,
    activities: OperationalActivity[]
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!businessId || !userId) {
        return { success: false, error: 'Business ID and User ID required' }
      }

      console.log(`[Operational Activities] 💾 Saving ${activities.length} activities`)

      // Delete existing activities
      const { error: deleteError } = await this.supabase
        .from('operational_activities')
        .delete()
        .eq('business_id', businessId)

      if (deleteError) {
        console.warn('[Operational Activities] ⚠️ Error deleting existing activities:', deleteError)
      }

      // Insert new activities
      if (activities.length > 0) {
        const activitiesToInsert = activities.map((activity, index) => ({
          business_id: businessId,
          user_id: userId,
          function_id: activity.function,
          description: activity.description || '',
          assigned_to: activity.assignedTo || null,
          order_index: activity.orderIndex !== undefined ? activity.orderIndex : index,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }))

        const { error: insertError } = await this.supabase
          .from('operational_activities')
          .insert(activitiesToInsert)

        if (insertError) {
          console.error('[Operational Activities] ❌ Error inserting activities:', insertError)
          return { success: false, error: insertError.message }
        }
      }

      console.log('[Operational Activities] ✅ Successfully saved activities')
      return { success: true }
    } catch (err) {
      console.error('[Operational Activities] ❌ Error saving activities:', err)
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  }

  /**
   * Load operational activities
   */
  static async loadActivities(businessId: string): Promise<OperationalActivity[]> {
    try {
      if (!businessId) {
        return []
      }

      const { data, error } = await this.supabase
        .from('operational_activities')
        .select('*')
        .eq('business_id', businessId)
        .order('order_index', { ascending: true })

      if (error) {
        console.error('[Operational Activities] ❌ Error loading activities:', error)
        return []
      }

      const activities: OperationalActivity[] = (data || []).map(row => ({
        id: row.id,
        function: row.function_id,
        description: row.description,
        assignedTo: row.assigned_to || undefined,
        orderIndex: row.order_index
      }))

      console.log(`[Operational Activities] 📥 Loaded ${activities.length} activities`)
      return activities
    } catch (err) {
      console.error('[Operational Activities] ❌ Error loading activities:', err)
      return []
    }
  }
}

export default OperationalActivitiesService
