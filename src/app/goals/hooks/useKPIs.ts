// /app/goals/hooks/useKPIs.ts
'use client'

import { useState, useCallback, useEffect } from 'react'
import { KPIData } from '../types'
import KPIService from '../services/kpi-service'
import { createClient } from '@/lib/supabase/client'

interface UseKPIsOptions {
  businessId?: string
  autoLoad?: boolean
  autoSync?: boolean
}

/**
 * Complete KPI Hook - Production ready
 * Handles:
 * - Loading available KPIs from library
 * - Searching/filtering KPIs
 * - Managing selected KPIs
 * - Saving to Supabase
 * - Local storage sync
 */
export function useKPIs(options: UseKPIsOptions = {}) {
  const { businessId, autoLoad = true, autoSync = true } = options

  // State
  const [availableKPIs, setAvailableKPIs] = useState<KPIData[]>([])
  const [selectedKPIs, setSelectedKPIs] = useState<KPIData[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  // Load available KPIs on mount
  useEffect(() => {
    if (!autoLoad) return

    const loadKPIs = async () => {
      try {
        setLoading(true)
        setError(null)

        const kpis = await KPIService.getAvailableKPIs()
        setAvailableKPIs(kpis)

        const cats = await KPIService.getCategories()
        setCategories(cats)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load KPIs')
      } finally {
        setLoading(false)
      }
    }

    loadKPIs()
  }, [autoLoad])

  // Load user's saved KPIs if businessId provided
  useEffect(() => {
    if (!businessId || !autoLoad) return

    const loadUserKPIs = async () => {
      try {
        const userKPIs = await KPIService.getUserKPIs(businessId)
        setSelectedKPIs(userKPIs)
      } catch (err) {
        console.error('Error loading user KPIs:', err)
      }
    }

    loadUserKPIs()
  }, [businessId, autoLoad])

  // Search KPIs
  const searchKPIs = useCallback(async (query: string, category?: string): Promise<KPIData[]> => {
    try {
      return await KPIService.searchKPIs(query, category)
    } catch (err) {
      console.error('Error searching KPIs:', err)
      return []
    }
  }, [])

  // Get KPIs by category
  const getByCategory = useCallback(async (category: string): Promise<KPIData[]> => {
    try {
      return await KPIService.getKPIsByCategory(category)
    } catch (err) {
      console.error('Error getting KPIs by category:', err)
      return []
    }
  }, [])

  // Add KPI to selected
  const addKPI = useCallback((kpi: KPIData) => {
    setSelectedKPIs(prev => {
      // Check if already selected
      if (prev.some(k => k.id === kpi.id)) {
        return prev
      }
      return [...prev, { ...kpi, currentValue: 0, year1Target: 0, year2Target: 0, year3Target: 0 }]
    })
  }, [])

  // Remove KPI from selected
  const removeKPI = useCallback((kpiId: string) => {
    setSelectedKPIs(prev => prev.filter(k => k.id !== kpiId))
  }, [])

  // Update KPI value
  const updateKPIValue = useCallback(
    (kpiId: string, field: 'currentValue' | 'year1Target' | 'year2Target' | 'year3Target', value: number) => {
      setSelectedKPIs(prev =>
        prev.map(kpi =>
          kpi.id === kpiId
            ? { ...kpi, [field]: value }
            : kpi
        )
      )
    },
    []
  )

  // Save to Supabase
  const saveToDatabase = useCallback(async (): Promise<boolean> => {
    if (!businessId) {
      setError('Business ID required to save')
      return false
    }

    try {
      setSaving(true)
      setError(null)

      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('User not authenticated')
        return false
      }

      const result = await KPIService.saveUserKPIs(businessId, user.id, selectedKPIs)

      if (!result.success) {
        setError(result.error || 'Failed to save KPIs')
        return false
      }

      setLastSaved(new Date())
      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save KPIs'
      setError(msg)
      return false
    } finally {
      setSaving(false)
    }
  }, [businessId, selectedKPIs])

  // Save to local storage
  const saveToLocalStorage = useCallback(() => {
    try {
      const data = {
        selectedKPIs,
        timestamp: new Date().toISOString()
      }
      return KPIService.saveToLocalStorage(data)
    } catch (err) {
      console.error('Error saving to localStorage:', err)
      return false
    }
  }, [selectedKPIs])

  // Load from local storage
  const loadFromLocalStorage = useCallback(() => {
    try {
      const data = KPIService.loadFromLocalStorage()
      if (data?.selectedKPIs) {
        setSelectedKPIs(data.selectedKPIs)
        return true
      }
      return false
    } catch (err) {
      console.error('Error loading from localStorage:', err)
      return false
    }
  }, [])

  // Auto-save to localStorage when selected KPIs change
  useEffect(() => {
    if (!autoSync) return

    const timer = setTimeout(() => {
      saveToLocalStorage()
    }, 1000)

    return () => clearTimeout(timer)
  }, [selectedKPIs, autoSync, saveToLocalStorage])

  // Get unselected KPIs (for modal)
  const unselectedKPIs = availableKPIs.filter(
    kpi => !selectedKPIs.some(selected => selected.id === kpi.id)
  )

  return {
    // State
    availableKPIs,
    selectedKPIs,
    unselectedKPIs,
    categories,
    loading,
    saving,
    error,
    lastSaved,

    // Search/filter
    searchKPIs,
    getByCategory,

    // Modify selection
    addKPI,
    removeKPI,
    updateKPIValue,

    // Persistence
    saveToDatabase,
    saveToLocalStorage,
    loadFromLocalStorage,

    // Utilities
    totalSelected: selectedKPIs.length,
    totalAvailable: availableKPIs.length,
    categoryList: categories
  }
}

export default useKPIs