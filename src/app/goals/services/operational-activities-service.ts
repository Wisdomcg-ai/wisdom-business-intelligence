// /app/goals/services/operational-activities-service.ts
'use client'

import { createClient } from '@/lib/supabase/client'

export type FrequencyOption =
  | 'daily'
  | '3x_week'
  | 'weekly'
  | 'fortnightly'
  | 'monthly'
  | 'quarterly'

export interface OperationalActivity {
  id: string
  function: string // engine ID (e.g., 'attract', 'convert', etc.)
  name: string // habit name
  description: string
  frequency?: FrequencyOption // selected frequency
  recommendedFrequency?: FrequencyOption // from suggested habits
  source?: 'suggested' | 'custom' | 'step2' // where the habit came from
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
   * Uses upsert pattern to ensure atomicity - no data loss if operation fails
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

      // Get existing activity IDs
      const { data: existingData } = await this.supabase
        .from('operational_activities')
        .select('id')
        .eq('business_id', businessId)

      const existingIds = new Set((existingData || []).map(item => item.id))
      const newIds = new Set(activities.filter(a => a.id).map(a => a.id))

      // Upsert activities
      if (activities.length > 0) {
        const activitiesToUpsert = activities.map((activity, index) => ({
          id: activity.id || undefined,
          business_id: businessId,
          user_id: userId,
          function_id: activity.function,
          name: activity.name || '',
          description: activity.description || '',
          frequency: activity.frequency || null,
          recommended_frequency: activity.recommendedFrequency || null,
          source: activity.source || 'custom',
          assigned_to: activity.assignedTo || null,
          order_index: activity.orderIndex !== undefined ? activity.orderIndex : index,
          updated_at: new Date().toISOString()
        }))

        const { error: upsertError } = await this.supabase
          .from('operational_activities')
          .upsert(activitiesToUpsert, {
            onConflict: 'id',
            ignoreDuplicates: false
          })

        if (upsertError) {
          console.error('[Operational Activities] ❌ Error upserting activities:', upsertError)
          return { success: false, error: upsertError.message }
        }
      }

      // Delete removed activities
      const idsToDelete = [...existingIds].filter(id => !newIds.has(id))
      if (idsToDelete.length > 0) {
        const { error: deleteError } = await this.supabase
          .from('operational_activities')
          .delete()
          .in('id', idsToDelete)

        if (deleteError) {
          console.warn('[Operational Activities] ⚠️ Error cleaning up removed activities:', deleteError)
        }
      }

      // Handle case where all activities are removed
      if (activities.length === 0 && existingIds.size > 0) {
        const { error: deleteError } = await this.supabase
          .from('operational_activities')
          .delete()
          .eq('business_id', businessId)

        if (deleteError) {
          console.warn('[Operational Activities] ⚠️ Error clearing activities:', deleteError)
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
        name: row.name || '',
        description: row.description || '',
        frequency: row.frequency || undefined,
        recommendedFrequency: row.recommended_frequency || undefined,
        source: row.source || 'custom',
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
