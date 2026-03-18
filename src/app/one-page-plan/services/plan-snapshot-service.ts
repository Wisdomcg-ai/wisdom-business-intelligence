'use client'

import { createClient } from '@/lib/supabase/client'
import type { OnePagePlanData, PlanSnapshot } from '../types'

class PlanSnapshotService {
  private getSupabase() {
    return createClient()
  }

  /**
   * Auto-generate a human-readable label for the snapshot
   */
  private generateLabel(
    snapshotType: PlanSnapshot['snapshot_type'],
    quarter?: string,
    year?: number
  ): string {
    const yearStr = year ? ` - Year ${year}` : ''
    const quarterStr = quarter ? ` ${quarter}` : ''

    switch (snapshotType) {
      case 'goals_wizard_complete':
        return `Goals Wizard Complete${yearStr}`
      case 'quarterly_review_pre_sync':
        return `Before${quarterStr} Quarterly Review${yearStr}`
      case 'quarterly_review_post_sync':
        return `After${quarterStr} Quarterly Review${yearStr}`
      default:
        return `Snapshot${yearStr}`
    }
  }

  /**
   * Create a new plan snapshot
   */
  async createSnapshot(params: {
    businessId: string
    userId: string
    snapshotType: PlanSnapshot['snapshot_type']
    planData: OnePagePlanData
    quarter?: string
    year?: number
    quarterlyReviewId?: string
    label?: string
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const supabase = this.getSupabase()

      // Get next version number
      const { data: maxRow } = await supabase
        .from('plan_snapshots')
        .select('version_number')
        .eq('business_id', params.businessId)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle()

      const nextVersion = (maxRow?.version_number || 0) + 1

      const label = params.label || this.generateLabel(
        params.snapshotType,
        params.quarter,
        params.year
      )

      const { error } = await supabase
        .from('plan_snapshots')
        .insert({
          business_id: params.businessId,
          user_id: params.userId,
          version_number: nextVersion,
          snapshot_type: params.snapshotType,
          quarter: params.quarter || null,
          year: params.year || null,
          quarterly_review_id: params.quarterlyReviewId || null,
          plan_data: params.planData,
          label,
        })

      if (error) {
        console.error('[PlanSnapshot] Insert error:', error)
        return { success: false, error: error.message }
      }

      console.log(`[PlanSnapshot] Created snapshot v${nextVersion}: ${label}`)
      return { success: true }
    } catch (err) {
      console.error('[PlanSnapshot] Error creating snapshot:', err)
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  }

  /**
   * Get all snapshots for a business, newest first
   */
  async getSnapshots(businessId: string, limit?: number): Promise<PlanSnapshot[]> {
    try {
      const supabase = this.getSupabase()

      let query = supabase
        .from('plan_snapshots')
        .select('*')
        .eq('business_id', businessId)
        .order('version_number', { ascending: false })

      if (limit) {
        query = query.limit(limit)
      }

      const { data, error } = await query

      if (error) {
        console.error('[PlanSnapshot] Error fetching snapshots:', error)
        return []
      }

      return (data || []) as PlanSnapshot[]
    } catch (err) {
      console.error('[PlanSnapshot] Error fetching snapshots:', err)
      return []
    }
  }

  /**
   * Get a single snapshot by ID
   */
  async getSnapshotById(id: string): Promise<PlanSnapshot | null> {
    try {
      const supabase = this.getSupabase()

      const { data, error } = await supabase
        .from('plan_snapshots')
        .select('*')
        .eq('id', id)
        .single()

      if (error) {
        console.error('[PlanSnapshot] Error fetching snapshot:', error)
        return null
      }

      return data as PlanSnapshot
    } catch (err) {
      console.error('[PlanSnapshot] Error fetching snapshot:', err)
      return null
    }
  }
}

export const planSnapshotService = new PlanSnapshotService()
