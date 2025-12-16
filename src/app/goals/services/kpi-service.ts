// /app/goals/services/kpi-service.ts
'use client'

import { createClient } from '@/lib/supabase/client'
import { KPIData } from '../types'

const supabase = createClient()

/**
 * KPI Service - Production Ready Integration
 * 
 * Connects to your enterprise KPI library at /src/lib/kpi/
 * Access 291 KPIs organized by business function
 * 
 * Handles:
 * - Loading 291 KPIs from your KPI library
 * - Persisting user selections to Supabase
 * - localStorage sync for offline support
 * - Search and filtering
 */
export class KPIService {
  private static readonly STORAGE_KEY = 'strategicPlan'
  private static readonly KPI_CACHE_KEY = 'kpi_library_cache'
  private static readonly CACHE_DURATION = 3600000 // 1 hour

  /**
   * Fetch all available KPIs from library
   * Direct import of all KPI arrays to ensure all 291 are loaded
   */
  static async getAvailableKPIs(): Promise<KPIData[]> {
    try {
      // IMPORTANT: Check if we're forcing a fresh load (bypass cache if only 18 cached)
      const cached = this.getCachedKPIs()
      if (cached && cached.length > 20) {  // Only use cache if it has meaningful data
        console.log(`[KPI Service] ✅ Loaded ${cached.length} KPIs from cache`)
        return cached
      } else if (cached && cached.length <= 20) {
        console.log(`[KPI Service] ⚠️ Stale cache detected (only ${cached.length} KPIs), clearing...`)
        localStorage.removeItem(this.KPI_CACHE_KEY)
      }

      console.log('[KPI Service] 📚 Direct importing all KPI arrays...')

      // Import all KPI arrays directly from index.ts
      const kpiModule = await import('@/lib/kpi/data/index')
      
      console.log('[KPI Service] 📋 Available exports:', Object.keys(kpiModule))

      // Get all the individual arrays
      const {
        ESSENTIAL_KPIS = [],
        ATTRACT_KPIS = [],
        CONVERT_KPIS = [],
        deliverOperationsKPIs = [],
        deliverQualityKPIs = [],
        deliverPeopleKPIs = [],
        deliverSystemsKPIs = [],
        delightKPIs = [],
        profitKPIs = [],
        peopleKPIs = [],
        systemsKPIs = [],
        ALL_KPIS = []
      } = kpiModule

      console.log('[KPI Service] 📊 Individual array counts:', {
        ESSENTIAL: ESSENTIAL_KPIS.length,
        ATTRACT: ATTRACT_KPIS.length,
        CONVERT: CONVERT_KPIS.length,
        DELIVER_OPS: deliverOperationsKPIs.length,
        DELIVER_QUALITY: deliverQualityKPIs.length,
        DELIVER_PEOPLE: deliverPeopleKPIs.length,
        DELIVER_SYSTEMS: deliverSystemsKPIs.length,
        DELIGHT: delightKPIs.length,
        PROFIT: profitKPIs.length,
        PEOPLE: peopleKPIs.length,
        SYSTEMS: systemsKPIs.length,
        ALL: ALL_KPIS.length
      })

      // Use ALL_KPIS if available, otherwise combine all arrays
      let allKpisRaw = []
      
      if (ALL_KPIS && Array.isArray(ALL_KPIS) && ALL_KPIS.length > 0) {
        console.log('[KPI Service] ✅ Using ALL_KPIS constant')
        allKpisRaw = ALL_KPIS
      } else {
        console.log('[KPI Service] ✅ Combining all individual arrays')
        allKpisRaw = [
          ...ESSENTIAL_KPIS,
          ...ATTRACT_KPIS,
          ...CONVERT_KPIS,
          ...deliverOperationsKPIs,
          ...deliverQualityKPIs,
          ...deliverPeopleKPIs,
          ...deliverSystemsKPIs,
          ...delightKPIs,
          ...profitKPIs,
          ...peopleKPIs,
          ...systemsKPIs
        ]
      }

      console.log(`[KPI Service] ✅ Total KPIs loaded: ${allKpisRaw.length}`)

      if (allKpisRaw.length === 0) {
        console.warn('[KPI Service] ⚠️ No KPIs found after combining all arrays')
        return []
      }

      // Transform to wizard format
      const allKpis = this.transformKPIs(allKpisRaw)

      console.log(`[KPI Service] ✅ Transformed to ${allKpis.length} wizard-format KPIs`)

      // Sort by category then name
      allKpis.sort((a, b) => {
        const catCompare = (a.category || 'Uncategorized').localeCompare(b.category || 'Uncategorized')
        if (catCompare !== 0) return catCompare
        return (a.name || '').localeCompare(b.name || '')
      })

      // Cache the results
      this.cacheKPIs(allKpis)
      
      return allKpis
    } catch (err) {
      console.error('[KPI Service] ❌ Error getting available KPIs:', err)
      return []
    }
  }

  /**
   * Transform KPIs from library format to wizard format
   */
  private static transformKPIs(libraryKPIs: any[]): KPIData[] {
    return libraryKPIs.map(kpi => {
      // Handle both 'function' and 'businessFunction' property names
      let functionName = kpi.function || kpi.businessFunction || 'Other'

      // Normalize - convert to string and uppercase
      functionName = String(functionName).toUpperCase().trim()

      return {
        id: kpi.id || `kpi-${Math.random()}`,
        name: kpi.name || 'Unknown KPI',
        friendlyName: kpi.plainName || kpi.name || 'Unknown',
        category: functionName, // Use normalized function as category
        frequency: kpi.frequency || 'monthly',
        unit: kpi.unit || 'number',
        description: kpi.description || '',
        whyItMatters: kpi.whyItMatters || '',
        actionToTake: kpi.actionToTake || '',
        benchmarks: kpi.benchmarks || undefined,
        currentValue: 0,
        year1Target: 0,
        year2Target: 0,
        year3Target: 0
      }
    }).filter(kpi => kpi.id && kpi.name) // Remove invalid KPIs
  }

  /**
   * Search available KPIs by query
   */
  static async searchKPIs(query: string, category?: string): Promise<KPIData[]> {
    try {
      const allKpis = await this.getAvailableKPIs()
      const queryLower = query.toLowerCase()

      let results = allKpis.filter(kpi =>
        kpi.name.toLowerCase().includes(queryLower) ||
        kpi.friendlyName?.toLowerCase().includes(queryLower) ||
        kpi.category?.toLowerCase().includes(queryLower) ||
        (kpi.description && kpi.description.toLowerCase().includes(queryLower))
      )

      if (category) {
        results = results.filter(kpi => kpi.category === category)
      }

      console.log(`[KPI Service] 🔍 Search for "${query}": found ${results.length} KPIs`)

      return results
    } catch (err) {
      console.error('[KPI Service] ❌ Error searching KPIs:', err)
      return []
    }
  }

  /**
   * Get KPIs by category
   */
  static async getKPIsByCategory(category: string): Promise<KPIData[]> {
    try {
      const allKpis = await this.getAvailableKPIs()
      const result = allKpis.filter(kpi => kpi.category === category)
      console.log(`[KPI Service] 📂 Category "${category}": ${result.length} KPIs`)
      return result
    } catch (err) {
      console.error('[KPI Service] ❌ Error getting KPIs by category:', err)
      return []
    }
  }

  /**
   * Get all categories
   */
  static async getCategories(): Promise<string[]> {
    try {
      const allKpis = await this.getAvailableKPIs()
      const categories = new Set(allKpis.map(kpi => kpi.category).filter(Boolean))
      const result = Array.from(categories).sort()
      console.log(`[KPI Service] 📋 Found ${result.length} categories`)
      return result
    } catch (err) {
      console.error('[KPI Service] ❌ Error getting categories:', err)
      return []
    }
  }

  /**
   * Save user's selected KPIs to Supabase
   */
  static async saveUserKPIs(businessId: string, userId: string, kpis: KPIData[]): Promise<{ success: boolean; error?: string }> {
    try {
      if (!businessId) {
        return { success: false, error: 'Business ID required' }
      }

      if (!userId) {
        return { success: false, error: 'User ID required' }
      }

      if (!Array.isArray(kpis)) {
        return { success: false, error: 'KPIs must be an array' }
      }

      console.log(`[KPI Service] 💾 Saving ${kpis.length} KPIs to Supabase for business ${businessId}`)

      // DEBUG: Log actual KPI values being saved
      kpis.forEach((kpi, idx) => {
        console.log(`[KPI Service] 📊 KPI ${idx + 1}: "${kpi.name}" (id: ${kpi.id})`)
        console.log(`  - currentValue: ${kpi.currentValue} (type: ${typeof kpi.currentValue})`)
        console.log(`  - year1Target: ${kpi.year1Target} (type: ${typeof kpi.year1Target})`)
        console.log(`  - year2Target: ${kpi.year2Target}`)
        console.log(`  - year3Target: ${kpi.year3Target}`)
      })

      // First, get existing KPI IDs for this business
      const { data: existingKPIs } = await supabase
        .from('business_kpis')
        .select('kpi_id')
        .eq('business_id', businessId)

      const existingKPIIds = new Set(existingKPIs?.map(k => k.kpi_id) || [])
      const newKPIIds = new Set(kpis.map(k => k.id))

      // Delete KPIs that are no longer selected
      const kpisToDelete = Array.from(existingKPIIds).filter(id => !newKPIIds.has(id))
      if (kpisToDelete.length > 0) {
        await supabase
          .from('business_kpis')
          .delete()
          .eq('business_id', businessId)
          .in('kpi_id', kpisToDelete)
      }

      // Upsert (insert or update) all KPIs
      const kpisToUpsert = kpis.map(kpi => ({
        business_id: businessId,
        user_id: userId,
        kpi_id: kpi.id,
        name: kpi.name,
        friendly_name: kpi.friendlyName || kpi.name,
        description: kpi.description || null,
        category: kpi.category || null,
        frequency: kpi.frequency || null,
        unit: kpi.unit || null,
        current_value: kpi.currentValue || 0,
        year1_target: kpi.year1Target || 0,
        year2_target: kpi.year2Target || 0,
        year3_target: kpi.year3Target || 0,
        is_active: true,
        updated_at: new Date().toISOString()
      }))

      const { error: upsertError } = await supabase
        .from('business_kpis')
        .upsert(kpisToUpsert, {
          onConflict: 'business_id,kpi_id',
          ignoreDuplicates: false
        })

      if (upsertError) {
        console.error('[KPI Service] ❌ Error upserting KPIs:', upsertError)
        return { success: false, error: upsertError.message }
      }

      console.log(`[KPI Service] ✅ Successfully saved ${kpis.length} KPIs`)

      // Log activity
      await supabase.from('activity_log').insert({
        business_id: businessId,
        action: 'kpis_updated',
        description: `Selected ${kpis.length} KPIs for tracking`,
        created_at: new Date().toISOString()
      })

      return { success: true }
    } catch (err) {
      console.error('[KPI Service] ❌ Error saving user KPIs:', err)
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  }

  /**
   * Get user's saved KPIs from Supabase
   */
  static async getUserKPIs(businessId: string): Promise<KPIData[]> {
    try {
      if (!businessId) {
        return []
      }

      const { data, error } = await supabase
        .from('business_kpis')
        .select('*')
        .eq('business_id', businessId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('[KPI Service] ❌ Error fetching user KPIs:', error)
        return []
      }

      const result = data?.map(row => ({
        id: row.kpi_id,
        name: row.name,
        friendlyName: row.friendly_name,
        category: row.category,
        frequency: row.frequency,
        unit: row.unit,
        description: row.description,
        currentValue: row.current_value || 0,
        year1Target: row.year1_target || 0,
        year2Target: row.year2_target || 0,
        year3Target: row.year3_target || 0
      })) || []

      console.log(`[KPI Service] 📥 Loaded ${result.length} user KPIs`)
      return result
    } catch (err) {
      console.error('[KPI Service] ❌ Error getting user KPIs:', err)
      return []
    }
  }

  /**
   * Update KPI values
   */
  static async updateKPIValue(
    businessId: string,
    kpiId: string,
    updates: { currentValue?: number; year1Target?: number; year2Target?: number; year3Target?: number }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!businessId || !kpiId) {
        return { success: false, error: 'Business ID and KPI ID required' }
      }

      const updateData: any = {
        updated_at: new Date().toISOString()
      }

      if (updates.currentValue !== undefined) updateData.current_value = updates.currentValue
      if (updates.year1Target !== undefined) updateData.year1_target = updates.year1Target
      if (updates.year2Target !== undefined) updateData.year2_target = updates.year2Target
      if (updates.year3Target !== undefined) updateData.year3_target = updates.year3Target

      const { error } = await supabase
        .from('business_kpis')
        .update(updateData)
        .eq('business_id', businessId)
        .eq('kpi_id', kpiId)

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true }
    } catch (err) {
      console.error('[KPI Service] ❌ Error updating KPI value:', err)
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  }

  /**
   * Delete KPI
   */
  static async deleteKPI(businessId: string, kpiId: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!businessId || !kpiId) {
        return { success: false, error: 'Business ID and KPI ID required' }
      }

      const { error } = await supabase
        .from('business_kpis')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('business_id', businessId)
        .eq('kpi_id', kpiId)

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true }
    } catch (err) {
      console.error('[KPI Service] ❌ Error deleting KPI:', err)
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  }

  /**
   * Local storage operations for temporary data
   */
  static saveToLocalStorage(data: any): boolean {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data))
        return true
      }
      return false
    } catch (err) {
      console.error('[KPI Service] ❌ Error saving to localStorage:', err)
      return false
    }
  }

  static loadFromLocalStorage(): any {
    try {
      if (typeof window !== 'undefined') {
        const data = localStorage.getItem(this.STORAGE_KEY)
        return data ? JSON.parse(data) : null
      }
      return null
    } catch (err) {
      console.error('[KPI Service] ❌ Error loading from localStorage:', err)
      return null
    }
  }

  static clearLocalStorage(): boolean {
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(this.STORAGE_KEY)
        return true
      }
      return false
    } catch (err) {
      console.error('[KPI Service] ❌ Error clearing localStorage:', err)
      return false
    }
  }

  // Private helper methods

  private static getCachedKPIs(): KPIData[] | null {
    try {
      if (typeof window === 'undefined') return null

      const cached = localStorage.getItem(this.KPI_CACHE_KEY)
      if (!cached) return null

      const { data, timestamp } = JSON.parse(cached)

      // Check if cache is still valid
      if (Date.now() - timestamp > this.CACHE_DURATION) {
        localStorage.removeItem(this.KPI_CACHE_KEY)
        return null
      }

      return data
    } catch (err) {
      return null
    }
  }

  private static cacheKPIs(kpis: KPIData[]): void {
    try {
      if (typeof window === 'undefined') return

      const cacheData = {
        data: kpis,
        timestamp: Date.now()
      }

      localStorage.setItem(this.KPI_CACHE_KEY, JSON.stringify(cacheData))
      console.log(`[KPI Service] 💾 Cached ${kpis.length} KPIs for 1 hour`)
    } catch (err) {
      console.error('[KPI Service] ❌ Error caching KPIs:', err)
    }
  }
}

export default KPIService