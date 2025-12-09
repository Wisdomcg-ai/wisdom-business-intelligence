'use client'

// src/lib/kpi/hooks/use-kpis.ts

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { 
  KPI, 
  WizardKPI, 
  BusinessProfile, 
  KPICriteria, 
  SearchFilters,
  BusinessFunction,
  Industry,
  BusinessStage
} from '../types'
import { KPIService, getKPIService } from '../services/kpi-service'
import { WizardKPIAdapter } from '../adapters/wizard-adapter'

/**
 * Core KPI Hook - General Purpose KPI Operations
 * 
 * This hook provides access to the KPI system with intelligent caching,
 * error handling, and performance optimization. It serves as the foundation
 * for all KPI-related React components.
 * 
 * Features:
 * - Automatic initialization
 * - Intelligent caching
 * - Error handling with retry
 * - Loading states
 * - Performance monitoring
 * - Search and filtering
 */

export interface UseKPIsOptions {
  criteria?: KPICriteria
  autoInitialize?: boolean
  enableCache?: boolean
  retryOnError?: boolean
  maxRetries?: number
}

export interface UseKPIsReturn {
  // Data
  kpis: KPI[]
  loading: boolean
  error: string | null
  initialized: boolean
  
  // Operations
  refresh: () => Promise<void>
  search: (query: string, filters?: SearchFilters) => Promise<KPI[]>
  getKPIById: (id: string) => Promise<KPI | null>
  getKPIsByFunction: (func: BusinessFunction) => Promise<KPI[]>
  getKPIsByIndustry: (industry: Industry) => Promise<KPI[]>
  getKPIsByStage: (stage: BusinessStage) => Promise<KPI[]>
  
  // Stats
  stats: {
    total: number
    loadTime: number | null
    cacheHitRate: string
  }
}

/**
 * Main KPI Hook
 * 
 * @param options Configuration options
 * @returns KPI state and operations
 */
export function useKPIs(options: UseKPIsOptions = {}): UseKPIsReturn {
  const {
    criteria,
    autoInitialize = true,
    enableCache = true,
    retryOnError = true,
    maxRetries = 3
  } = options

  // State
  const [kpis, setKPIs] = useState<KPI[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)
  const [loadTime, setLoadTime] = useState<number | null>(null)

  // Refs
  const kpiService = useRef<KPIService | null>(null)
  const retryCount = useRef(0)
  const abortController = useRef<AbortController | null>(null)

  // Initialize service
  if (!kpiService.current) {
    kpiService.current = getKPIService()
  }

  // Load KPIs function
  const loadKPIs = useCallback(async (forceFresh: boolean = false) => {
    if (!kpiService.current) return

    try {
      setLoading(true)
      setError(null)
      
      // Cancel any ongoing requests
      if (abortController.current) {
        abortController.current.abort()
      }
      abortController.current = new AbortController()

      const startTime = Date.now()

      // Initialize service if needed
      if (!initialized) {
        await kpiService.current.initialize()
        setInitialized(true)
      }

      // Load KPIs based on criteria
      let result: KPI[]
      
      if (criteria) {
        if (criteria.industry && criteria.stage) {
          const profile: BusinessProfile = {
            userId: 'current-user', // This would come from auth context
            industry: criteria.industry,
            stage: criteria.stage,
            weakFunctions: criteria.functions
          }
          result = await kpiService.current.getKPIsForBusiness(profile)
        } else if (criteria.functions?.length) {
          result = await kpiService.current.getKPIsForFunctions(criteria.functions)
        } else {
          result = await kpiService.current.getAllKPIs()
        }
      } else {
        result = await kpiService.current.getAllKPIs()
      }

      const endTime = Date.now()
      const duration = endTime - startTime

      setKPIs(result)
      setLoadTime(duration)
      retryCount.current = 0

      console.log(`✅ Loaded ${result.length} KPIs in ${duration}ms`)

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load KPIs'
      console.error('❌ KPI loading error:', errorMessage)

      if (retryOnError && retryCount.current < maxRetries) {
        retryCount.current++
        console.log(`🔄 Retrying KPI load (attempt ${retryCount.current}/${maxRetries})`)
        
        // Exponential backoff
        setTimeout(() => {
          loadKPIs(forceFresh)
        }, Math.pow(2, retryCount.current) * 1000)
      } else {
        setError(errorMessage)
        setKPIs([]) // Clear stale data
      }
    } finally {
      setLoading(false)
    }
  }, [criteria, initialized, retryOnError, maxRetries])

  // Auto-initialize effect
  useEffect(() => {
    if (autoInitialize) {
      loadKPIs()
    }

    // Cleanup
    return () => {
      if (abortController.current) {
        abortController.current.abort()
      }
    }
  }, [autoInitialize, loadKPIs])

  // Operations
  const refresh = useCallback(async () => {
    await loadKPIs(true)
  }, [loadKPIs])

  const search = useCallback(async (query: string, filters?: SearchFilters): Promise<KPI[]> => {
    if (!kpiService.current) return []

    try {
      return await kpiService.current.searchKPIs(query, filters)
    } catch (err) {
      console.error('Search error:', err)
      return []
    }
  }, [])

  const getKPIById = useCallback(async (id: string): Promise<KPI | null> => {
    if (!kpiService.current) return null

    try {
      return await kpiService.current.getKPIById(id)
    } catch (err) {
      console.error('Get KPI by ID error:', err)
      return null
    }
  }, [])

  const getKPIsByFunction = useCallback(async (func: BusinessFunction): Promise<KPI[]> => {
    if (!kpiService.current) return []

    try {
      return await kpiService.current.getKPIsByFunction(func)
    } catch (err) {
      console.error('Get KPIs by function error:', err)
      return []
    }
  }, [])

  const getKPIsByIndustry = useCallback(async (industry: Industry): Promise<KPI[]> => {
    if (!kpiService.current) return []

    try {
      return await kpiService.current.getKPIsByIndustry(industry)
    } catch (err) {
      console.error('Get KPIs by industry error:', err)
      return []
    }
  }, [])

  const getKPIsByStage = useCallback(async (stage: BusinessStage): Promise<KPI[]> => {
    if (!kpiService.current) return []

    try {
      return await kpiService.current.getKPIsByStage(stage)
    } catch (err) {
      console.error('Get KPIs by stage error:', err)
      return []
    }
  }, [])

  // Stats
  const stats = useMemo(() => {
    const serviceStats = kpiService.current?.getStats()
    
    return {
      total: kpis.length,
      loadTime,
      cacheHitRate: serviceStats?.cache?.hitRate || '0%'
    }
  }, [kpis.length, loadTime])

  return {
    // Data
    kpis,
    loading,
    error,
    initialized,
    
    // Operations
    refresh,
    search,
    getKPIById,
    getKPIsByFunction,
    getKPIsByIndustry,
    getKPIsByStage,
    
    // Stats
    stats
  }
}

/**
 * Wizard KPI Hook - Specialized for Goals Wizard
 * 
 * This hook provides KPIs in the format expected by the Goals Wizard,
 * including intelligent defaults, auto-save functionality, and
 * backwards compatibility with the existing wizard interface.
 */

export interface UseWizardKPIsOptions {
  businessProfile: BusinessProfile
  autoSave?: boolean
  autoSaveDelay?: number
  loadSavedKPIs?: boolean
}

export interface UseWizardKPIsReturn {
  // Data
  kpis: WizardKPI[]
  loading: boolean
  saving: boolean
  error: string | null
  lastSaved: Date | null
  
  // Operations
  updateKPI: (id: string, updates: Partial<WizardKPI>) => void
  deleteKPI: (id: string) => void
  addCustomKPI: (customKPI: WizardKPI) => void
  resetToDefaults: () => Promise<void>
  saveKPIs: () => Promise<void>
  
  // Validation
  validateKPI: (id: string) => { isValid: boolean; warnings: string[]; suggestions: string[] }
  validateAllKPIs: () => { valid: number; invalid: number; warnings: string[] }
}

/**
 * Wizard-specific KPI Hook
 * 
 * @param options Configuration options including business profile
 * @returns Wizard KPI state and operations
 */
export function useWizardKPIs(options: UseWizardKPIsOptions): UseWizardKPIsReturn {
  const {
    businessProfile,
    autoSave = true,
    autoSaveDelay = 2000,
    loadSavedKPIs = true
  } = options

  // State
  const [wizardKPIs, setWizardKPIs] = useState<WizardKPI[]>([])
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  // Get core KPIs
  const {
    kpis: rawKPIs,
    loading,
    error,
    initialized
  } = useKPIs({
    criteria: {
      industry: businessProfile.industry,
      stage: businessProfile.stage,
      functions: businessProfile.weakFunctions
    }
  })

  // Auto-save timer
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null)
  const pendingChanges = useRef(false)

  // Transform KPIs to wizard format when raw KPIs change
  useEffect(() => {
    if (initialized && rawKPIs.length > 0 && wizardKPIs.length === 0) {
      console.log(`🔄 Transforming ${rawKPIs.length} KPIs to wizard format`)
      
      const transformed = WizardKPIAdapter.toWizardFormatArray(rawKPIs, businessProfile)
      setWizardKPIs(transformed)
      
      console.log(`✅ Transformed to ${transformed.length} wizard KPIs`)
    }
  }, [rawKPIs, initialized, businessProfile, wizardKPIs.length])

  // Auto-save functionality
  const scheduleAutoSave = useCallback(() => {
    if (!autoSave) return

    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current)
    }

    pendingChanges.current = true

    autoSaveTimer.current = setTimeout(async () => {
      if (pendingChanges.current) {
        await saveKPIs()
        pendingChanges.current = false
      }
    }, autoSaveDelay)
  }, [autoSave, autoSaveDelay])

  // Operations
  const updateKPI = useCallback((id: string, updates: Partial<WizardKPI>) => {
    setWizardKPIs(prev => prev.map(kpi => 
      kpi.id === id ? { ...kpi, ...updates } : kpi
    ))
    scheduleAutoSave()
  }, [scheduleAutoSave])

  const deleteKPI = useCallback((id: string) => {
    setWizardKPIs(prev => prev.filter(kpi => kpi.id !== id))
    scheduleAutoSave()
  }, [scheduleAutoSave])

  const addCustomKPI = useCallback((customKPI: WizardKPI) => {
    setWizardKPIs(prev => [...prev, customKPI])
    scheduleAutoSave()
  }, [scheduleAutoSave])

  const resetToDefaults = useCallback(async () => {
    if (rawKPIs.length > 0) {
      const transformed = WizardKPIAdapter.toWizardFormatArray(rawKPIs, businessProfile)
      setWizardKPIs(transformed)
      await saveKPIs()
    }
  }, [rawKPIs, businessProfile])

  const saveKPIs = useCallback(async () => {
    try {
      setSaving(true)
      
      // Here you would integrate with your Supabase adapter
      // For now, we'll simulate a save operation
      console.log(`💾 Saving ${wizardKPIs.length} wizard KPIs...`)
      
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 500))
      
      setLastSaved(new Date())
      console.log('✅ Wizard KPIs saved successfully')
      
    } catch (err) {
      console.error('❌ Failed to save wizard KPIs:', err)
    } finally {
      setSaving(false)
    }
  }, [wizardKPIs])

  // Validation
  const validateKPI = useCallback((id: string) => {
    const kpi = wizardKPIs.find(k => k.id === id)
    if (!kpi) {
      return { isValid: false, warnings: ['KPI not found'], suggestions: [] }
    }
    
    return WizardKPIAdapter.validateTargetProgression(kpi)
  }, [wizardKPIs])

  const validateAllKPIs = useCallback(() => {
    let valid = 0
    let invalid = 0
    const warnings: string[] = []

    wizardKPIs.forEach(kpi => {
      const validation = WizardKPIAdapter.validateTargetProgression(kpi)
      if (validation.isValid) {
        valid++
      } else {
        invalid++
        warnings.push(...validation.warnings.map(w => `${kpi.name}: ${w}`))
      }
    })

    return { valid, invalid, warnings }
  }, [wizardKPIs])

  // Cleanup auto-save timer
  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current)
      }
    }
  }, [])

  return {
    // Data
    kpis: wizardKPIs,
    loading,
    saving,
    error,
    lastSaved,
    
    // Operations
    updateKPI,
    deleteKPI,
    addCustomKPI,
    resetToDefaults,
    saveKPIs,
    
    // Validation
    validateKPI,
    validateAllKPIs
  }
}

/**
 * Search KPI Hook - Specialized for KPI Search
 */
export interface UseKPISearchReturn {
  results: KPI[]
  loading: boolean
  error: string | null
  search: (query: string, filters?: SearchFilters) => Promise<void>
  clearResults: () => void
}

export function useKPISearch(): UseKPISearchReturn {
  const [results, setResults] = useState<KPI[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { search: performSearch } = useKPIs({ autoInitialize: true })

  const search = useCallback(async (query: string, filters?: SearchFilters) => {
    try {
      setLoading(true)
      setError(null)
      
      const searchResults = await performSearch(query, filters)
      setResults(searchResults)
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [performSearch])

  const clearResults = useCallback(() => {
    setResults([])
    setError(null)
  }, [])

  return {
    results,
    loading,
    error,
    search,
    clearResults
  }
}

/**
 * KPI Stats Hook - Performance and Usage Statistics
 */
export interface UseKPIStatsReturn {
  stats: {
    totalKPIs: number
    loadTime: number | null
    cacheHitRate: string
    initialized: boolean
  }
  performance: {
    averageLoadTime: number
    searchCount: number
    errorRate: number
  }
  refresh: () => void
}

export function useKPIStats(): UseKPIStatsReturn {
  const { stats, initialized } = useKPIs()
  const [performance, setPerformance] = useState({
    averageLoadTime: 0,
    searchCount: 0,
    errorRate: 0
  })

  const refresh = useCallback(() => {
    // Refresh performance stats
    const kpiService = getKPIService()
    const serviceStats = kpiService.getStats()
    
    // Update performance metrics (this would be more sophisticated in practice)
    setPerformance(prev => ({
      ...prev,
      averageLoadTime: stats.loadTime || 0
    }))
  }, [stats.loadTime])

  return {
    stats: {
      totalKPIs: stats.total,
      loadTime: stats.loadTime,
      cacheHitRate: stats.cacheHitRate,
      initialized
    },
    performance,
    refresh
  }
}