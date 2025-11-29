// src/lib/kpi/data/registry.ts
// Central registry for all KPI definitions and stats functions

import { KPIDefinition, BusinessFunction } from '../types'

// Import essential KPIs
import essentialKPIs from './essential'

// Import business function KPIs
import { ATTRACT_KPIS } from './functions/attract'
import { CONVERT_KPIS } from './functions/convert'
import { deliverOperationsKPIs } from './functions/deliver-operations'
import { deliverQualityKPIs } from './functions/deliver-quality'
import { deliverPeopleKPIs } from './functions/deliver-people'
import { deliverSystemsKPIs } from './functions/deliver-systems'
import { delightKPIs } from './functions/delight'
import { profitKPIs } from './functions/profit'
import { peopleKPIs } from './functions/people'
import { systemsKPIs } from './functions/systems'

/**
 * Get all KPIs across all business functions
 */
export function getAllKPIs(): KPIDefinition[] {
  const kpis: KPIDefinition[] = []

  // Add essential KPIs
  if (essentialKPIs && Array.isArray(essentialKPIs)) {
    kpis.push(...essentialKPIs)
  }

  // Add attract KPIs
  if (ATTRACT_KPIS && Array.isArray(ATTRACT_KPIS)) {
    kpis.push(...ATTRACT_KPIS)
  }

  // Add convert KPIs
  if (CONVERT_KPIS && Array.isArray(CONVERT_KPIS)) {
    kpis.push(...CONVERT_KPIS)
  }

  // Add deliver KPIs
  if (deliverOperationsKPIs && Array.isArray(deliverOperationsKPIs)) {
    kpis.push(...deliverOperationsKPIs)
  }
  if (deliverQualityKPIs && Array.isArray(deliverQualityKPIs)) {
    kpis.push(...deliverQualityKPIs)
  }
  if (deliverPeopleKPIs && Array.isArray(deliverPeopleKPIs)) {
    kpis.push(...deliverPeopleKPIs)
  }
  if (deliverSystemsKPIs && Array.isArray(deliverSystemsKPIs)) {
    kpis.push(...deliverSystemsKPIs)
  }

  // Add delight KPIs
  if (delightKPIs && Array.isArray(delightKPIs)) {
    kpis.push(...delightKPIs)
  }

  // Add profit KPIs
  if (profitKPIs && Array.isArray(profitKPIs)) {
    kpis.push(...profitKPIs)
  }

  // Add people KPIs
  if (peopleKPIs && Array.isArray(peopleKPIs)) {
    kpis.push(...peopleKPIs)
  }

  // Add systems KPIs
  if (systemsKPIs && Array.isArray(systemsKPIs)) {
    kpis.push(...systemsKPIs)
  }

  return kpis
}

/**
 * Get KPIs for a specific business function
 */
export function getKPIsByFunction(businessFunction: BusinessFunction): KPIDefinition[] {
  return getAllKPIs().filter(kpi => kpi.function === businessFunction)
}

/**
 * Get a single KPI by ID
 */
export function getKPIById(id: string): KPIDefinition | undefined {
  return getAllKPIs().find(kpi => kpi.id === id)
}

/**
 * Get KPI statistics
 */
export function getKPIStats() {
  const allKPIs = getAllKPIs()

  const essentialCount = essentialKPIs?.length || 0
  const attractCount = ATTRACT_KPIS?.length || 0
  const convertCount = CONVERT_KPIS?.length || 0
  const deliverCount = (deliverOperationsKPIs?.length || 0) +
    (deliverQualityKPIs?.length || 0) +
    (deliverPeopleKPIs?.length || 0) +
    (deliverSystemsKPIs?.length || 0)
  const delightCount = delightKPIs?.length || 0
  const profitCount = profitKPIs?.length || 0
  const peopleCount = peopleKPIs?.length || 0
  const systemsCount = systemsKPIs?.length || 0

  // Helper function to safely check industries
  const hasIndustry = (kpi: KPIDefinition, industry: string): boolean => {
    if (!kpi.industries || !Array.isArray(kpi.industries)) return false
    const lowerIndustries = kpi.industries.map(i => String(i).toLowerCase())
    return lowerIndustries.includes(industry.toLowerCase()) || 
           lowerIndustries.includes('all')
  }

  return {
    total: allKPIs.length,
    byFunction: {
      [BusinessFunction.ESSENTIAL]: essentialCount,
      [BusinessFunction.ATTRACT]: attractCount,
      [BusinessFunction.CONVERT]: convertCount,
      [BusinessFunction.DELIVER]: deliverCount,
      [BusinessFunction.DELIGHT]: delightCount,
      [BusinessFunction.PROFIT]: profitCount,
      [BusinessFunction.PEOPLE]: peopleCount,
      [BusinessFunction.SYSTEMS]: systemsCount
    },
    byTier: {
      ESSENTIAL: allKPIs.filter(kpi => 
        kpi.tier && String(kpi.tier).toUpperCase() === 'ESSENTIAL'
      ).length,
      RECOMMENDED: allKPIs.filter(kpi => 
        kpi.tier && String(kpi.tier).toUpperCase() === 'RECOMMENDED'
      ).length,
      ADVANCED: allKPIs.filter(kpi => 
        kpi.tier && String(kpi.tier).toUpperCase() === 'ADVANCED'
      ).length
    },
    byCategory: allKPIs.reduce((acc, kpi) => {
      if (kpi.category) {
        acc[kpi.category] = (acc[kpi.category] || 0) + 1
      }
      return acc
    }, {} as Record<string, number>),
    byIndustry: {
      ALL: allKPIs.filter(kpi => hasIndustry(kpi, 'all')).length,
      CONSTRUCTION_TRADES: allKPIs.filter(kpi => 
        hasIndustry(kpi, 'construction-trades')
      ).length,
      HEALTH_WELLNESS: allKPIs.filter(kpi => 
        hasIndustry(kpi, 'health-wellness')
      ).length,
      PROFESSIONAL_SERVICES: allKPIs.filter(kpi => 
        hasIndustry(kpi, 'professional-services')
      ).length,
      RETAIL_ECOMMERCE: allKPIs.filter(kpi => 
        hasIndustry(kpi, 'retail-ecommerce')
      ).length,
      OPERATIONS_LOGISTICS: allKPIs.filter(kpi => 
        hasIndustry(kpi, 'operations-logistics')
      ).length
    }
  }
}

/**
 * Search KPIs by query string
 */
export function searchKPIs(query: string): KPIDefinition[] {
  if (!query || query.trim() === '') {
    return []
  }

  const searchTerm = query.toLowerCase()
  return getAllKPIs().filter(kpi => {
    // Search in name
    if (kpi.name && kpi.name.toLowerCase().includes(searchTerm)) {
      return true
    }
    // Search in plain name
    if (kpi.plainName && kpi.plainName.toLowerCase().includes(searchTerm)) {
      return true
    }
    // Search in description
    if (kpi.description && kpi.description.toLowerCase().includes(searchTerm)) {
      return true
    }
    // Search in tags
    if (kpi.tags && Array.isArray(kpi.tags)) {
      return kpi.tags.some(tag => 
        String(tag).toLowerCase().includes(searchTerm)
      )
    }
    return false
  })
}

/**
 * Validate KPI data integrity
 */
export function validateKPIs(): {
  valid: boolean
  errors: string[]
  warnings: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []
  const seenIds = new Set<string>()
  const allKPIs = getAllKPIs()

  allKPIs.forEach((kpi, index) => {
    // Check for duplicate IDs
    if (kpi.id) {
      if (seenIds.has(kpi.id)) {
        errors.push(`Duplicate KPI ID: ${kpi.id}`)
      }
      seenIds.add(kpi.id)
    } else {
      errors.push(`KPI at index ${index} missing ID`)
    }

    // Check required fields - UPDATED to use 'function' instead of 'businessFunction'
    if (!kpi.function) {
      errors.push(`KPI ${kpi.id || index} missing businessFunction`)
    }
    if (!kpi.name) {
      errors.push(`KPI ${kpi.id || index} missing name`)
    }
    if (!kpi.tier) {
      errors.push(`KPI ${kpi.id || index} missing tier`)
    }
    if (!kpi.industries || !Array.isArray(kpi.industries) || kpi.industries.length === 0) {
      errors.push(`KPI ${kpi.id || index} missing or invalid industries array`)
    }
    if (!kpi.stages || !Array.isArray(kpi.stages) || kpi.stages.length === 0) {
      errors.push(`KPI ${kpi.id || index} missing or invalid stages array`)
    }

    // Warnings for recommended fields
    if (!kpi.formula || kpi.formula.trim() === '') {
      warnings.push(`KPI ${kpi.id || index} missing formula`)
    }
    if (!kpi.tags || !Array.isArray(kpi.tags) || kpi.tags.length === 0) {
      warnings.push(`KPI ${kpi.id || index} has no tags`)
    }
    if (!kpi.benchmarks) {
      warnings.push(`KPI ${kpi.id || index} missing benchmarks`)
    }
  })

  return {
    valid: errors.length === 0,
    errors,
    warnings
  }
}

/**
 * Get KPIs by multiple IDs
 */
export function getKPIsByIds(ids: string[]): KPIDefinition[] {
  if (!ids || !Array.isArray(ids)) {
    return []
  }
  return getAllKPIs().filter(kpi => ids.includes(kpi.id))
}

/**
 * Get KPIs by tier
 */
export function getKPIsByTier(tier: string): KPIDefinition[] {
  if (!tier) {
    return []
  }
  const upperTier = tier.toUpperCase()
  return getAllKPIs().filter(kpi => 
    kpi.tier && String(kpi.tier).toUpperCase() === upperTier
  )
}

/**
 * Get KPIs by industry
 */
export function getKPIsByIndustry(industry: string): KPIDefinition[] {
  if (!industry) {
    return []
  }
  const lowerIndustry = industry.toLowerCase()
  return getAllKPIs().filter(kpi => {
    if (!kpi.industries || !Array.isArray(kpi.industries)) {
      return false
    }
    const lowerIndustries = kpi.industries.map(i => String(i).toLowerCase())
    return lowerIndustries.includes(lowerIndustry) || 
           lowerIndustries.includes('all')
  })
}

/**
 * Get KPIs by stage
 */
export function getKPIsByStage(stage: string): KPIDefinition[] {
  if (!stage) {
    return []
  }
  const upperStage = stage.toUpperCase()
  return getAllKPIs().filter(kpi => {
    if (!kpi.stages || !Array.isArray(kpi.stages)) {
      return false
    }
    return kpi.stages.some(s => String(s).toUpperCase() === upperStage)
  })
}

// Export all KPI arrays for direct access
export {
  essentialKPIs as ESSENTIAL_KPIS,
  ATTRACT_KPIS,
  CONVERT_KPIS,
  deliverOperationsKPIs,
  deliverQualityKPIs,
  deliverPeopleKPIs,
  deliverSystemsKPIs,
  delightKPIs,
  profitKPIs,
  peopleKPIs,
  systemsKPIs
}