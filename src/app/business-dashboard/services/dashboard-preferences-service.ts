'use client'

import { createClient } from '@/lib/supabase/client'

export interface DashboardPreferences {
  id?: string
  business_id: string
  user_id: string
  visible_core_metrics: string[]
  hidden_custom_kpis: string[]
  created_at?: string
  updated_at?: string
}

// Default core metrics (all visible by default)
export const DEFAULT_CORE_METRICS = [
  'leads',
  'conversion_rate',
  'avg_transaction',
  'team_headcount',
  'owner_hours'
]

/**
 * Dashboard Preferences Service
 * Manages which metrics are visible/hidden on the business dashboard
 */
export class DashboardPreferencesService {
  private static supabase = createClient()

  /**
   * Load user's dashboard preferences
   * Returns default preferences if none exist
   */
  static async loadPreferences(
    businessId: string,
    userId: string
  ): Promise<{
    preferences: DashboardPreferences | null
    error?: string
  }> {
    try {
      if (!businessId || !userId) {
        return {
          preferences: null,
          error: 'Business ID and User ID required'
        }
      }

      console.log('[Dashboard Preferences] Loading preferences for business:', businessId)

      const { data, error } = await this.supabase
        .from('dashboard_preferences')
        .select('*')
        .eq('business_id', businessId)
        .single()

      if (error) {
        // If no preferences found, return defaults (not an error)
        if (error.code === 'PGRST116') {
          console.log('[Dashboard Preferences] No preferences found, using defaults')
          return {
            preferences: {
              business_id: businessId,
              user_id: userId,
              visible_core_metrics: DEFAULT_CORE_METRICS,
              hidden_custom_kpis: []
            }
          }
        }

        console.error('[Dashboard Preferences] Error loading:', error)
        return { preferences: null, error: error.message }
      }

      console.log('[Dashboard Preferences] Loaded successfully')
      return { preferences: data }
    } catch (err) {
      console.error('[Dashboard Preferences] Error loading:', err)
      return {
        preferences: null,
        error: err instanceof Error ? err.message : 'Unknown error'
      }
    }
  }

  /**
   * Save user's dashboard preferences
   * Upserts (creates or updates) preferences
   */
  static async savePreferences(
    preferences: DashboardPreferences
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!preferences.business_id || !preferences.user_id) {
        return { success: false, error: 'Business ID and User ID required' }
      }

      console.log('[Dashboard Preferences] Saving preferences for business:', preferences.business_id)

      const dataToSave = {
        business_id: preferences.business_id,
        user_id: preferences.user_id,
        visible_core_metrics: preferences.visible_core_metrics || DEFAULT_CORE_METRICS,
        hidden_custom_kpis: preferences.hidden_custom_kpis || [],
        updated_at: new Date().toISOString()
      }

      // Upsert (insert or update)
      const { error } = await this.supabase
        .from('dashboard_preferences')
        .upsert(dataToSave, {
          onConflict: 'business_id'
        })

      if (error) {
        console.error('[Dashboard Preferences] Error saving:', error)
        return { success: false, error: error.message }
      }

      console.log('[Dashboard Preferences] Saved successfully')
      return { success: true }
    } catch (err) {
      console.error('[Dashboard Preferences] Error saving:', err)
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error'
      }
    }
  }

  /**
   * Check if a core metric is visible
   */
  static isMetricVisible(
    metricId: string,
    preferences: DashboardPreferences | null
  ): boolean {
    if (!preferences) {
      // If no preferences, show all by default
      return DEFAULT_CORE_METRICS.includes(metricId)
    }

    return preferences.visible_core_metrics.includes(metricId)
  }

  /**
   * Check if a custom KPI is visible (not hidden)
   */
  static isKpiVisible(
    kpiId: string,
    preferences: DashboardPreferences | null
  ): boolean {
    if (!preferences) {
      // If no preferences, show all KPIs by default
      return true
    }

    return !preferences.hidden_custom_kpis.includes(kpiId)
  }

  /**
   * Toggle a core metric's visibility
   */
  static toggleCoreMetric(
    metricId: string,
    preferences: DashboardPreferences
  ): DashboardPreferences {
    const isVisible = preferences.visible_core_metrics.includes(metricId)

    return {
      ...preferences,
      visible_core_metrics: isVisible
        ? preferences.visible_core_metrics.filter(id => id !== metricId)
        : [...preferences.visible_core_metrics, metricId]
    }
  }

  /**
   * Toggle a custom KPI's visibility
   */
  static toggleCustomKpi(
    kpiId: string,
    preferences: DashboardPreferences
  ): DashboardPreferences {
    const isHidden = preferences.hidden_custom_kpis.includes(kpiId)

    return {
      ...preferences,
      hidden_custom_kpis: isHidden
        ? preferences.hidden_custom_kpis.filter(id => id !== kpiId)
        : [...preferences.hidden_custom_kpis, kpiId]
    }
  }
}

export default DashboardPreferencesService
