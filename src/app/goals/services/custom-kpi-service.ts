// /app/goals/services/custom-kpi-service.ts
'use client'

import { createClient } from '@/lib/supabase/client'

export interface CustomKPI {
  id?: string
  category: string
  name: string
  friendlyName?: string
  unit: 'currency' | 'percentage' | 'number'
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual'
  description?: string
  createdBy?: string
  businessId?: string
  status?: 'pending' | 'approved' | 'rejected'
  approvedBy?: string
  approvedAt?: string
  rejectionReason?: string
  usageCount?: number
  lastUsedAt?: string
  createdAt?: string
  updatedAt?: string
}

/**
 * Custom KPI Service
 * Manages user-created custom KPIs that can be shared across the platform
 */
export class CustomKPIService {
  private static supabase = createClient()

  /**
   * Create a new custom KPI
   */
  static async createCustomKPI(
    userId: string,
    businessId: string,
    kpi: CustomKPI
  ): Promise<{ success: boolean; data?: CustomKPI; error?: string }> {
    try {
      if (!userId || !businessId) {
        return { success: false, error: 'User ID and Business ID are required' }
      }

      const { data, error } = await this.supabase
        .from('custom_kpis_library')
        .insert({
          category: kpi.category,
          name: kpi.name,
          friendly_name: kpi.friendlyName || kpi.name,
          unit: kpi.unit,
          frequency: kpi.frequency,
          description: kpi.description || '',
          created_by: userId,
          business_id: businessId,
          status: 'pending' // Default to pending, admin will approve
        })
        .select()
        .single()

      if (error) {
        console.error('[Custom KPI Service] ❌ Error creating custom KPI:', error)
        return { success: false, error: error.message }
      }

      console.log('[Custom KPI Service] ✅ Custom KPI created:', data)
      return { success: true, data: this.mapToCustomKPI(data) }
    } catch (err) {
      console.error('[Custom KPI Service] ❌ Error:', err)
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  }

  /**
   * Get all custom KPIs available to the user
   * Includes: approved KPIs + user's own pending KPIs
   */
  static async getAvailableCustomKPIs(userId: string, businessId: string): Promise<CustomKPI[]> {
    try {
      const { data, error } = await this.supabase
        .from('custom_kpis_library')
        .select('*')
        .or(`status.eq.approved,and(created_by.eq.${userId},status.eq.pending),and(business_id.eq.${businessId},status.eq.pending)`)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('[Custom KPI Service] ❌ Error fetching custom KPIs:', error)
        return []
      }

      console.log(`[Custom KPI Service] ✅ Loaded ${data.length} custom KPIs`)
      return data.map(this.mapToCustomKPI)
    } catch (err) {
      console.error('[Custom KPI Service] ❌ Error:', err)
      return []
    }
  }

  /**
   * Get all categories from custom KPIs
   */
  static async getCustomCategories(): Promise<string[]> {
    try {
      const { data, error } = await this.supabase
        .from('custom_kpis_library')
        .select('category')
        .eq('status', 'approved')

      if (error) {
        console.error('[Custom KPI Service] ❌ Error fetching categories:', error)
        return []
      }

      const categories = new Set(data.map(item => item.category))
      return Array.from(categories).sort()
    } catch (err) {
      console.error('[Custom KPI Service] ❌ Error:', err)
      return []
    }
  }

  /**
   * Search custom KPIs
   */
  static async searchCustomKPIs(
    userId: string,
    businessId: string,
    query: string
  ): Promise<CustomKPI[]> {
    try {
      const allKPIs = await this.getAvailableCustomKPIs(userId, businessId)
      const queryLower = query.toLowerCase()

      return allKPIs.filter(kpi =>
        kpi.name.toLowerCase().includes(queryLower) ||
        kpi.category.toLowerCase().includes(queryLower) ||
        kpi.friendlyName?.toLowerCase().includes(queryLower) ||
        kpi.description?.toLowerCase().includes(queryLower)
      )
    } catch (err) {
      console.error('[Custom KPI Service] ❌ Error:', err)
      return []
    }
  }

  /**
   * Increment usage count when a custom KPI is used
   */
  static async trackUsage(kpiId: string): Promise<void> {
    try {
      await this.supabase.rpc('increment_custom_kpi_usage', { kpi_id: kpiId })
    } catch (err) {
      console.error('[Custom KPI Service] ❌ Error tracking usage:', err)
    }
  }

  /**
   * Admin: Approve a custom KPI
   */
  static async approveCustomKPI(
    kpiId: string,
    adminId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await this.supabase
        .from('custom_kpis_library')
        .update({
          status: 'approved',
          approved_by: adminId,
          approved_at: new Date().toISOString()
        })
        .eq('id', kpiId)

      if (error) {
        console.error('[Custom KPI Service] ❌ Error approving KPI:', error)
        return { success: false, error: error.message }
      }

      console.log('[Custom KPI Service] ✅ KPI approved:', kpiId)
      return { success: true }
    } catch (err) {
      console.error('[Custom KPI Service] ❌ Error:', err)
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  }

  /**
   * Admin: Reject a custom KPI
   */
  static async rejectCustomKPI(
    kpiId: string,
    adminId: string,
    reason: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await this.supabase
        .from('custom_kpis_library')
        .update({
          status: 'rejected',
          approved_by: adminId,
          approved_at: new Date().toISOString(),
          rejection_reason: reason
        })
        .eq('id', kpiId)

      if (error) {
        console.error('[Custom KPI Service] ❌ Error rejecting KPI:', error)
        return { success: false, error: error.message }
      }

      console.log('[Custom KPI Service] ✅ KPI rejected:', kpiId)
      return { success: true }
    } catch (err) {
      console.error('[Custom KPI Service] ❌ Error:', err)
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  }

  /**
   * Admin: Get all pending custom KPIs for review
   */
  static async getPendingKPIs(): Promise<CustomKPI[]> {
    try {
      const { data, error } = await this.supabase
        .from('custom_kpis_library')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('[Custom KPI Service] ❌ Error fetching pending KPIs:', error)
        return []
      }

      return data.map(this.mapToCustomKPI)
    } catch (err) {
      console.error('[Custom KPI Service] ❌ Error:', err)
      return []
    }
  }

  /**
   * Map database record to CustomKPI interface
   */
  private static mapToCustomKPI(record: any): CustomKPI {
    return {
      id: record.id,
      category: record.category,
      name: record.name,
      friendlyName: record.friendly_name,
      unit: record.unit,
      frequency: record.frequency,
      description: record.description,
      createdBy: record.created_by,
      businessId: record.business_id,
      status: record.status,
      approvedBy: record.approved_by,
      approvedAt: record.approved_at,
      rejectionReason: record.rejection_reason,
      usageCount: record.usage_count,
      lastUsedAt: record.last_used_at,
      createdAt: record.created_at,
      updatedAt: record.updated_at
    }
  }
}
