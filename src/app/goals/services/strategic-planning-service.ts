// /app/goals/services/strategic-planning-service.ts
'use client'

import { createClient } from '@/lib/supabase/client'
import { StrategicInitiative } from '../types'

interface KeyAction {
  id: string
  action: string
  owner?: string
  dueDate?: string
}

/**
 * Strategic Planning Service - Supabase Integration
 *
 * Handles saving/loading for Steps 2-6:
 * - Strategic Ideas (step_type: 'strategic_ideas')
 * - Roadmap Suggestions (step_type: 'roadmap')
 * - 12-Month Initiatives (step_type: 'twelve_month')
 * - Quarterly Plans (step_type: 'q1', 'q2', 'q3', 'q4')
 * - 90-Day Sprint (step_type: 'sprint')
 */
export class StrategicPlanningService {
  private static supabase = createClient()

  /**
   * Save strategic initiatives (all steps except sprint actions)
   * Uses upsert pattern to ensure atomicity - no data loss if operation fails
   */
  static async saveInitiatives(
    businessId: string,
    userId: string,
    initiatives: StrategicInitiative[],
    stepType: 'strategic_ideas' | 'roadmap' | 'twelve_month' | 'q1' | 'q2' | 'q3' | 'q4' | 'sprint'
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!businessId || !userId) {
        return { success: false, error: 'Business ID and User ID required' }
      }

      console.log(`[Strategic Planning] 💾 Saving ${initiatives.length} initiatives for step: ${stepType}`)

      // Get existing initiative IDs for this step
      const { data: existingData } = await this.supabase
        .from('strategic_initiatives')
        .select('id')
        .eq('business_id', businessId)
        .eq('step_type', stepType)

      const existingIds = new Set((existingData || []).map(item => item.id))
      const newIds = new Set(initiatives.filter(init => init.id).map(init => init.id))

      // Prepare initiatives for upsert
      if (initiatives.length > 0) {
        const initiativesToUpsert = initiatives.map((init, index) => {
          const initWithTasks = init as any
          return {
            id: init.id || undefined, // Use existing ID if present
            business_id: businessId,
            user_id: userId,
            title: init.title || 'Untitled',
            description: init.description || null,
            notes: init.notes || null,
            category: init.category || null,
            priority: init.priority || null,
            estimated_effort: init.estimatedEffort || null,
            step_type: stepType,
            source: init.source || stepType,
            timeline: init.timeline || null,
            selected: init.selected || false,
            order_index: init.order !== undefined ? init.order : index,
            linked_kpis: init.linkedKPIs ? JSON.stringify(init.linkedKPIs) : null,
            assigned_to: init.assignedTo || null,
            tasks: initWithTasks.tasks || [],
            updated_at: new Date().toISOString()
          }
        })

        const { error: upsertError } = await this.supabase
          .from('strategic_initiatives')
          .upsert(initiativesToUpsert, {
            onConflict: 'id',
            ignoreDuplicates: false
          })

        if (upsertError) {
          console.error('[Strategic Planning] ❌ Error upserting initiatives:', upsertError)
          return { success: false, error: upsertError.message }
        }
      }

      // Only delete initiatives that were removed (not in the new set)
      const idsToDelete = [...existingIds].filter(id => !newIds.has(id))
      if (idsToDelete.length > 0) {
        const { error: deleteError } = await this.supabase
          .from('strategic_initiatives')
          .delete()
          .in('id', idsToDelete)

        if (deleteError) {
          console.error('[Strategic Planning] ❌ Error cleaning up removed initiatives:', deleteError)
          return { success: false, error: `Failed to remove initiatives: ${deleteError.message}` }
        }
      }

      // Handle case where all initiatives are removed
      if (initiatives.length === 0 && existingIds.size > 0) {
        const { error: deleteError } = await this.supabase
          .from('strategic_initiatives')
          .delete()
          .eq('business_id', businessId)
          .eq('step_type', stepType)

        if (deleteError) {
          console.error('[Strategic Planning] ❌ Error clearing initiatives:', deleteError)
          return { success: false, error: `Failed to clear initiatives: ${deleteError.message}` }
        }
      }

      console.log(`[Strategic Planning] ✅ Successfully saved initiatives for ${stepType}`)
      return { success: true }
    } catch (err) {
      console.error('[Strategic Planning] ❌ Error saving initiatives:', err)
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  }

  /**
   * Load strategic initiatives for a specific step
   */
  static async loadInitiatives(
    businessId: string,
    stepType: 'strategic_ideas' | 'roadmap' | 'twelve_month' | 'q1' | 'q2' | 'q3' | 'q4' | 'sprint'
  ): Promise<StrategicInitiative[]> {
    try {
      if (!businessId) {
        return []
      }

      const { data, error } = await this.supabase
        .from('strategic_initiatives')
        .select('*')
        .eq('business_id', businessId)
        .eq('step_type', stepType)
        .order('created_at', { ascending: true })

      if (error) {
        console.error(`[Strategic Planning] ❌ Error loading initiatives for ${stepType}:`, error)
        return []
      }

      const initiatives: StrategicInitiative[] = (data || []).map(row => ({
        id: row.id,
        title: row.title,
        description: row.description || undefined,
        notes: row.notes || undefined,
        category: row.category || undefined,
        priority: row.priority || undefined,
        estimatedEffort: row.estimated_effort || undefined,
        source: (row.source || stepType) as 'strategic_ideas' | 'roadmap',
        timeline: row.timeline || undefined,
        selected: row.selected || false,
        order: row.order_index !== undefined ? row.order_index : 0,
        linkedKPIs: row.linked_kpis ? JSON.parse(row.linked_kpis) : undefined,
        assignedTo: row.assigned_to || undefined,
        // V3: Task breakdown (JSONB column - already parsed by Supabase)
        tasks: row.tasks || []
      }))

      console.log(`[Strategic Planning] 📥 Loaded ${initiatives.length} initiatives for ${stepType}`)
      return initiatives
    } catch (err) {
      console.error(`[Strategic Planning] ❌ Error loading initiatives for ${stepType}:`, err)
      return []
    }
  }

  /**
   * Save sprint key actions
   * Uses upsert pattern to ensure atomicity - no data loss if operation fails
   */
  static async saveSprintActions(
    businessId: string,
    userId: string,
    actions: KeyAction[]
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!businessId || !userId) {
        return { success: false, error: 'Business ID and User ID required' }
      }

      console.log(`[Strategic Planning] 💾 Saving ${actions.length} sprint actions`)

      // Get existing action IDs
      const { data: existingData } = await this.supabase
        .from('sprint_key_actions')
        .select('id')
        .eq('business_id', businessId)

      const existingIds = new Set((existingData || []).map(item => item.id))
      const newIds = new Set(actions.filter(action => action.id).map(action => action.id))

      // Upsert actions
      if (actions.length > 0) {
        const actionsToUpsert = actions.map(action => ({
          id: action.id || undefined,
          business_id: businessId,
          user_id: userId,
          action: action.action,
          owner: action.owner || null,
          due_date: action.dueDate || null,
          status: 'pending',
          updated_at: new Date().toISOString()
        }))

        const { error: upsertError } = await this.supabase
          .from('sprint_key_actions')
          .upsert(actionsToUpsert, {
            onConflict: 'id',
            ignoreDuplicates: false
          })

        if (upsertError) {
          console.error('[Strategic Planning] ❌ Error upserting actions:', upsertError)
          return { success: false, error: upsertError.message }
        }
      }

      // Delete removed actions
      const idsToDelete = [...existingIds].filter(id => !newIds.has(id))
      if (idsToDelete.length > 0) {
        const { error: deleteError } = await this.supabase
          .from('sprint_key_actions')
          .delete()
          .in('id', idsToDelete)

        if (deleteError) {
          console.error('[Strategic Planning] ❌ Error cleaning up removed actions:', deleteError)
          return { success: false, error: `Failed to remove actions: ${deleteError.message}` }
        }
      }

      // Handle case where all actions are removed
      if (actions.length === 0 && existingIds.size > 0) {
        const { error: deleteError } = await this.supabase
          .from('sprint_key_actions')
          .delete()
          .eq('business_id', businessId)

        if (deleteError) {
          console.error('[Strategic Planning] ❌ Error clearing actions:', deleteError)
          return { success: false, error: `Failed to clear actions: ${deleteError.message}` }
        }
      }

      console.log('[Strategic Planning] ✅ Successfully saved sprint actions')
      return { success: true }
    } catch (err) {
      console.error('[Strategic Planning] ❌ Error saving sprint actions:', err)
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  }

  /**
   * Load sprint key actions
   */
  static async loadSprintActions(businessId: string): Promise<KeyAction[]> {
    try {
      if (!businessId) {
        return []
      }

      const { data, error } = await this.supabase
        .from('sprint_key_actions')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('[Strategic Planning] ❌ Error loading sprint actions:', error)
        return []
      }

      const actions: KeyAction[] = (data || []).map(row => ({
        id: row.id,
        action: row.action,
        owner: row.owner,
        dueDate: row.due_date
      }))

      console.log(`[Strategic Planning] 📥 Loaded ${actions.length} sprint actions`)
      return actions
    } catch (err) {
      console.error('[Strategic Planning] ❌ Error loading sprint actions:', err)
      return []
    }
  }
}

export default StrategicPlanningService
