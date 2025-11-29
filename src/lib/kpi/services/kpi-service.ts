// src/lib/kpi/services/kpi-service.ts

import { 
  KPI, 
  BusinessFunction, 
  Industry, 
  BusinessStage, 
  KPITier,
  BusinessProfile,
  KPICriteria,
  SearchFilters,
  KPIError
} from '../types'
import { CacheService, getCacheService } from './cache-service'
import { ValidationService, getValidationService } from './validation-service'
import { CACHE_CONFIG, PERFORMANCE_THRESHOLDS, FEATURE_FLAGS } from '../constants'

/**
 * KPIService - Core KPI Operations Engine
 * 
 * The central service for all KPI operations in the platform.
 * Provides high-performance, cached access to KPI data with
 * intelligent filtering and search capabilities.
 * 
 * Features:
 * - High-performance caching (sub-200ms response times)
 * - Intelligent filtering and search
 * - Business rule validation
 * - Lazy loading for performance
 * - Comprehensive error handling
 * - Performance monitoring
 * 
 * Architecture:
 * - Service Layer Pattern
 * - Repository Pattern for data access
 * - Caching for performance
 * - Validation for data integrity
 */
export class KPIService {
  private cacheService: CacheService
  private validationService: ValidationService
  private kpiRegistry: Map<string, KPI> = new Map()
  private initialized: boolean = false
  private initializationPromise: Promise<void> | null = null

  constructor(
    cacheService?: CacheService,
    validationService?: ValidationService
  ) {
    this.cacheService = cacheService || getCacheService()
    this.validationService = validationService || getValidationService()
  }

  /**
   * Initialize the KPI service
   * 
   * Loads all KPI definitions into memory for fast access.
   * This method is safe to call multiple times.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    if (this.initializationPromise) {
      return this.initializationPromise
    }

    this.initializationPromise = this.performInitialization()
    return this.initializationPromise
  }

  /**
   * Get all KPIs
   * 
   * @returns Array of all KPIs in the system
   */
  async getAllKPIs(): Promise<KPI[]> {
    await this.ensureInitialized()
    
    const cacheKey = 'all-kpis'
    
    return this.cacheService.getOrSet(
      cacheKey,
      () => Array.from(this.kpiRegistry.values()),
      CACHE_CONFIG.LONG_TTL
    )
  }

  /**
   * Get KPI by ID
   * 
   * @param id KPI identifier
   * @returns KPI or null if not found
   */
  async getKPIById(id: string): Promise<KPI | null> {
    await this.ensureInitialized()

    if (!id || typeof id !== 'string') {
      throw new KPIError('Invalid KPI ID provided', 'INVALID_PARAM')
    }

    const cacheKey = `kpi-by-id:${id}`
    
    return this.cacheService.getOrSet(
      cacheKey,
      () => this.kpiRegistry.get(id) || null,
      CACHE_CONFIG.DEFAULT_TTL
    )
  }

  /**
   * Get multiple KPIs by IDs
   * 
   * @param ids Array of KPI identifiers
   * @returns Array of found KPIs (may be fewer than requested)
   */
  async getKPIsByIds(ids: string[]): Promise<KPI[]> {
    await this.ensureInitialized()

    if (!Array.isArray(ids)) {
      throw new KPIError('KPI IDs must be an array', 'INVALID_PARAM')
    }

    const cacheKey = this.cacheService.generateKey('kpis-by-ids', { ids: ids.sort() })
    
    return this.cacheService.getOrSet(
      cacheKey,
      () => {
        const kpis: KPI[] = []
        ids.forEach(id => {
          const kpi = this.kpiRegistry.get(id)
          if (kpi) {
            kpis.push(kpi)
          }
        })
        return kpis
      },
      CACHE_CONFIG.DEFAULT_TTL
    )
  }

  /**
   * Get KPIs by business function
   * 
   * @param func Business function to filter by
   * @returns Array of KPIs for the specified function
   */
  async getKPIsByFunction(func: BusinessFunction): Promise<KPI[]> {
    await this.ensureInitialized()

    this.validationService.validateBusinessFunction(func)

    const cacheKey = `kpis-by-function:${func}`
    
    return this.cacheService.getOrSet(
      cacheKey,
      () => Array.from(this.kpiRegistry.values())
        .filter(kpi => kpi.function === func),
      CACHE_CONFIG.LONG_TTL
    )
  }

  /**
   * Get KPIs by industry
   * 
   * @param industry Industry to filter by
   * @returns Array of KPIs applicable to the industry
   */
  async getKPIsByIndustry(industry: Industry): Promise<KPI[]> {
    await this.ensureInitialized()

    this.validationService.validateIndustry(industry)

    const cacheKey = `kpis-by-industry:${industry}`
    
    return this.cacheService.getOrSet(
      cacheKey,
      () => Array.from(this.kpiRegistry.values())
        .filter(kpi => kpi.industries.includes(industry) || kpi.industries.includes(Industry.ALL)),
      CACHE_CONFIG.LONG_TTL
    )
  }

  /**
   * Get KPIs by business stage
   * 
   * @param stage Business stage to filter by
   * @returns Array of KPIs applicable to the stage
   */
  async getKPIsByStage(stage: BusinessStage): Promise<KPI[]> {
    await this.ensureInitialized()

    this.validationService.validateBusinessStage(stage)

    const cacheKey = `kpis-by-stage:${stage}`
    
    return this.cacheService.getOrSet(
      cacheKey,
      () => Array.from(this.kpiRegistry.values())
        .filter(kpi => kpi.stages.includes(stage)),
      CACHE_CONFIG.LONG_TTL
    )
  }

  /**
   * Get KPIs by tier
   * 
   * @param tier KPI tier to filter by
   * @returns Array of KPIs in the specified tier
   */
  async getKPIsByTier(tier: KPITier): Promise<KPI[]> {
    await this.ensureInitialized()

    this.validationService.validateTier(tier)

    const cacheKey = `kpis-by-tier:${tier}`
    
    return this.cacheService.getOrSet(
      cacheKey,
      () => Array.from(this.kpiRegistry.values())
        .filter(kpi => kpi.tier === tier),
      CACHE_CONFIG.LONG_TTL
    )
  }

  /**
   * Get KPIs for specific business profile
   * 
   * @param profile Business profile containing context
   * @returns Array of relevant KPIs for the business
   */
  async getKPIsForBusiness(profile: BusinessProfile): Promise<KPI[]> {
    await this.ensureInitialized()

    this.validationService.validateBusinessProfile(profile)

    const cacheKey = this.cacheService.generateKey('kpis-for-business', {
      industry: profile.industry,
      stage: profile.stage,
      weakFunctions: profile.weakFunctions?.sort()
    })

    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
        // Get essential KPIs for the stage
        const essentialKPIs = await this.getEssentialKPIs(profile.stage)
        
        // Get industry-specific KPIs
        const industryKPIs = profile.industry !== Industry.ALL
          ? await this.getKPIsByIndustry(profile.industry)
          : []

        // Get KPIs for weak functions if specified
        const functionKPIs = profile.weakFunctions?.length
          ? await this.getKPIsForFunctions(profile.weakFunctions)
          : []

        // Combine and deduplicate
        const allKPIs = new Map<string, KPI>()
        
        // Add essential KPIs (highest priority)
        essentialKPIs.forEach(kpi => allKPIs.set(kpi.id, kpi))
        
        // Add function KPIs (medium priority)
        functionKPIs.forEach(kpi => allKPIs.set(kpi.id, kpi))
        
        // Add industry KPIs (lower priority, won't override existing)
        industryKPIs
          .filter(kpi => kpi.tier !== KPITier.ESSENTIAL) // Don't duplicate essentials
          .forEach(kpi => {
            if (!allKPIs.has(kpi.id)) {
              allKPIs.set(kpi.id, kpi)
            }
          })

        return Array.from(allKPIs.values())
      },
      CACHE_CONFIG.DEFAULT_TTL
    )
  }

  /**
   * Get essential KPIs for a business stage
   * 
   * @param stage Business stage
   * @returns Array of essential KPIs for the stage
   */
  async getEssentialKPIs(stage: BusinessStage): Promise<KPI[]> {
    await this.ensureInitialized()

    const cacheKey = `essential-kpis:${stage}`
    
    return this.cacheService.getOrSet(
      cacheKey,
      () => Array.from(this.kpiRegistry.values())
        .filter(kpi => 
          kpi.tier === KPITier.ESSENTIAL && 
          kpi.stages.includes(stage)
        ),
      CACHE_CONFIG.LONG_TTL
    )
  }

  /**
   * Search KPIs with filters
   * 
   * @param query Search query string
   * @param filters Optional filters to apply
   * @returns Array of matching KPIs
   */
  async searchKPIs(query: string, filters?: SearchFilters): Promise<KPI[]> {
    const startTime = Date.now()
    
    await this.ensureInitialized()

    const cacheKey = this.cacheService.generateKey('search-kpis', {
      query: query.toLowerCase().trim(),
      filters
    })

    const results = await this.cacheService.getOrSet(
      cacheKey,
      () => this.performSearch(query, filters),
      CACHE_CONFIG.SHORT_TTL // Search results cache for shorter time
    )

    // Performance monitoring
    const searchTime = Date.now() - startTime
    if (searchTime > PERFORMANCE_THRESHOLDS.MAX_SEARCH_TIME) {
      console.warn(`KPI search took ${searchTime}ms, exceeding threshold of ${PERFORMANCE_THRESHOLDS.MAX_SEARCH_TIME}ms`)
    }

    return results
  }

  /**
   * Get KPIs for multiple functions
   * 
   * @param functions Array of business functions
   * @returns Array of KPIs for all specified functions
   */
  async getKPIsForFunctions(functions: BusinessFunction[]): Promise<KPI[]> {
    await this.ensureInitialized()

    const results = await Promise.all(
      functions.map(func => this.getKPIsByFunction(func))
    )

    // Flatten and deduplicate
    const kpiMap = new Map<string, KPI>()
    results.flat().forEach(kpi => kpiMap.set(kpi.id, kpi))

    return Array.from(kpiMap.values())
  }

  /**
   * Get performance statistics
   */
  getStats() {
    return {
      initialized: this.initialized,
      totalKPIs: this.kpiRegistry.size,
      cache: this.cacheService.getStats(),
      performance: {
        thresholds: PERFORMANCE_THRESHOLDS,
        features: FEATURE_FLAGS
      }
    }
  }

  /**
   * Refresh KPI registry (force reload)
   */
  async refresh(): Promise<void> {
    this.initialized = false
    this.initializationPromise = null
    this.kpiRegistry.clear()
    await this.cacheService.clear()
    await this.initialize()
  }

  // Private Methods

  /**
   * Ensure service is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }
  }

  /**
   * Perform the actual initialization
   */
  private async performInitialization(): Promise<void> {
    try {
      const startTime = Date.now()

      // This would normally load from the KPI registry
      // For now, we'll create a placeholder that can be extended
      await this.loadKPIsFromRegistry()

      const loadTime = Date.now() - startTime

      if (loadTime > PERFORMANCE_THRESHOLDS.MAX_LOAD_TIME) {
        console.warn(`KPI initialization took ${loadTime}ms, exceeding threshold of ${PERFORMANCE_THRESHOLDS.MAX_LOAD_TIME}ms`)
      }

      this.initialized = true
      console.log(`KPI Service initialized with ${this.kpiRegistry.size} KPIs in ${loadTime}ms`)
      
    } catch (error) {
      this.initializationPromise = null
      throw new KPIError(
        'Failed to initialize KPI service',
        'INITIALIZATION_ERROR',
        error instanceof Error ? error.message : 'Unknown error'
      )
    }
  }

  /**
   * Load KPIs from the registry (placeholder for future implementation)
   */
  private async loadKPIsFromRegistry(): Promise<void> {
    // This is a placeholder method that will be implemented when we create
    // the actual KPI data files in Phase 2
    
    // For now, create an empty registry that can be extended
    // In Phase 2, this will load from the actual data files:
    // - data/essential.ts
    // - data/functions/*.ts  
    // - data/industries/*.ts
    
    console.log('KPI registry loading will be implemented in Phase 2')
  }

  /**
   * Perform search against KPI registry
   */
  private performSearch(query: string, filters?: SearchFilters): KPI[] {
    const normalizedQuery = query.toLowerCase().trim()
    let results = Array.from(this.kpiRegistry.values())

    // Text search
    if (normalizedQuery) {
      results = results.filter(kpi => 
        kpi.name.toLowerCase().includes(normalizedQuery) ||
        kpi.plainName.toLowerCase().includes(normalizedQuery) ||
        kpi.description.toLowerCase().includes(normalizedQuery) ||
        kpi.category.toLowerCase().includes(normalizedQuery) ||
        kpi.tags.some(tag => tag.toLowerCase().includes(normalizedQuery))
      )
    }

    // Apply filters
    if (filters) {
      if (filters.functions?.length) {
        results = results.filter(kpi => filters.functions!.includes(kpi.function))
      }

      if (filters.industries?.length) {
        results = results.filter(kpi => 
          filters.industries!.some(industry => 
            kpi.industries.includes(industry) || kpi.industries.includes(Industry.ALL)
          )
        )
      }

      if (filters.stages?.length) {
        results = results.filter(kpi =>
          filters.stages!.some(stage => kpi.stages.includes(stage))
        )
      }

      if (filters.tiers?.length) {
        results = results.filter(kpi => filters.tiers!.includes(kpi.tier))
      }

      if (filters.tags?.length) {
        results = results.filter(kpi =>
          filters.tags!.some(tag => 
            kpi.tags.some(kpiTag => kpiTag.toLowerCase().includes(tag.toLowerCase()))
          )
        )
      }
    }

    // Sort results by relevance (tier and name)
    results.sort((a, b) => {
      // Essential KPIs first
      if (a.tier === KPITier.ESSENTIAL && b.tier !== KPITier.ESSENTIAL) return -1
      if (b.tier === KPITier.ESSENTIAL && a.tier !== KPITier.ESSENTIAL) return 1
      
      // Then by name
      return a.name.localeCompare(b.name)
    })

    return results
  }
}

/**
 * Singleton instance for global use
 */
let globalKPIServiceInstance: KPIService | null = null

/**
 * Get global KPI service instance
 */
export function getKPIService(): KPIService {
  if (!globalKPIServiceInstance) {
    globalKPIServiceInstance = new KPIService()
  }
  return globalKPIServiceInstance
}

/**
 * Create new KPI service instance
 */
export function createKPIService(
  cacheService?: CacheService,
  validationService?: ValidationService
): KPIService {
  return new KPIService(cacheService, validationService)
}

/**
 * Initialize global KPI service
 */
export async function initializeKPIService(): Promise<void> {
  const service = getKPIService()
  await service.initialize()
}

/**
 * Convenience methods for common operations
 */
export async function getKPIById(id: string): Promise<KPI | null> {
  return getKPIService().getKPIById(id)
}

export async function searchKPIs(query: string, filters?: SearchFilters): Promise<KPI[]> {
  return getKPIService().searchKPIs(query, filters)
}

export async function getKPIsForBusiness(profile: BusinessProfile): Promise<KPI[]> {
  return getKPIService().getKPIsForBusiness(profile)
}