// src/lib/kpi/data/index.ts

/**
 * KPI Registry - Central hub for all KPI definitions
 * UPDATED: Added PEOPLE and SYSTEMS functions
 */

import { KPIDefinition, BusinessFunction, Industry, BusinessStage, KPITier } from '../types'

// Import KPIs from all function files
import { essentialKPIs, ESSENTIAL_KPIS } from './essential'
import { ATTRACT_KPIS } from './functions/attract'
import { CONVERT_KPIS } from './functions/convert'
import { deliverOperationsKPIs } from './functions/deliver-operations'
import { deliverPeopleKPIs } from './functions/deliver-people'
import { deliverQualityKPIs } from './functions/deliver-quality'
import { deliverSystemsKPIs } from './functions/deliver-systems'
import { delightKPIs } from './functions/delight'
import { profitKPIs } from './functions/profit'
import { peopleKPIs } from './functions/people'        // ← NEW
import { systemsKPIs } from './functions/systems'      // ← NEW

// Export individual function arrays (with backwards compatibility alias)
export {
  essentialKPIs,
  essentialKPIs as ESSENTIAL_KPIS,  // Alias for backwards compatibility
  ATTRACT_KPIS,
  CONVERT_KPIS,
  deliverOperationsKPIs,
  deliverPeopleKPIs,
  deliverQualityKPIs,
  deliverSystemsKPIs,
  delightKPIs,
  profitKPIs,
  peopleKPIs,        // ← NEW
  systemsKPIs        // ← NEW
}

// ==================== MASTER KPI LIBRARY ====================

/**
 * ALL_KPIS - Complete library of all KPI definitions
 * Total: 291 KPIs (231 existing + 30 PEOPLE + 30 SYSTEMS)
 */
export const ALL_KPIS: KPIDefinition[] = [
  ...essentialKPIs,
  ...ATTRACT_KPIS,
  ...CONVERT_KPIS,
  ...deliverOperationsKPIs,
  ...deliverPeopleKPIs,
  ...deliverQualityKPIs,
  ...deliverSystemsKPIs,
  ...delightKPIs,
  ...profitKPIs,
  ...peopleKPIs,        // ← NEW
  ...systemsKPIs        // ← NEW
]

// ==================== HELPER FUNCTIONS ====================

/**
 * Get all KPIs for a specific business function
 */
export function getKPIsByFunction(businessFunction: BusinessFunction): KPIDefinition[] {
  return ALL_KPIS.filter(kpi => kpi.function === businessFunction)
}

/**
 * Get all KPIs for a specific industry
 */
export function getKPIsByIndustry(industry: Industry): KPIDefinition[] {
  return ALL_KPIS.filter(kpi => 
    kpi.industries.includes(Industry.ALL) || kpi.industries.includes(industry)
  )
}

/**
 * Get all KPIs for a specific business stage
 */
export function getKPIsByStage(stage: BusinessStage): KPIDefinition[] {
  return ALL_KPIS.filter(kpi => kpi.stages.includes(stage))
}

/**
 * Get all KPIs for a specific tier
 */
export function getKPIsByTier(tier: KPITier): KPIDefinition[] {
  return ALL_KPIS.filter(kpi => kpi.tier === tier)
}

/**
 * Get a specific KPI by ID
 */
export function getKPIById(id: string): KPIDefinition | undefined {
  return ALL_KPIS.find(kpi => kpi.id === id)
}

/**
 * Get multiple KPIs by IDs
 */
export function getKPIsByIds(ids: string[]): KPIDefinition[] {
  return ALL_KPIS.filter(kpi => ids.includes(kpi.id))
}

/**
 * Search KPIs by name or description
 */
export function searchKPIs(query: string): KPIDefinition[] {
  const lowerQuery = query.toLowerCase()
  return ALL_KPIS.filter(kpi => 
    kpi.name.toLowerCase().includes(lowerQuery) ||
    kpi.plainName.toLowerCase().includes(lowerQuery) ||
    kpi.description.toLowerCase().includes(lowerQuery) ||
    kpi.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
  )
}

/**
 * Get KPI statistics for the test page
 */
export function getKPIStats() {
  return {
    total: ALL_KPIS.length,
    byFunction: {
      ATTRACT: getKPIsByFunction(BusinessFunction.ATTRACT).length,
      CONVERT: getKPIsByFunction(BusinessFunction.CONVERT).length,
      DELIVER: getKPIsByFunction(BusinessFunction.DELIVER).length,
      DELIGHT: getKPIsByFunction(BusinessFunction.DELIGHT).length,
      PEOPLE: getKPIsByFunction(BusinessFunction.PEOPLE).length,
      PROFIT: getKPIsByFunction(BusinessFunction.PROFIT).length,
      SYSTEMS: getKPIsByFunction(BusinessFunction.SYSTEMS).length
    },
    byTier: {
      essential: getKPIsByTier(KPITier.ESSENTIAL).length,
      recommended: getKPIsByTier(KPITier.RECOMMENDED).length,
      advanced: getKPIsByTier(KPITier.ADVANCED).length
    }
  }
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

  ALL_KPIS.forEach((kpi, index) => {
    // Check for duplicate IDs
    if (seenIds.has(kpi.id)) {
      errors.push(`Duplicate KPI ID: ${kpi.id}`)
    }
    seenIds.add(kpi.id)

    // Check required fields
    if (!kpi.function) {
      errors.push(`KPI ${kpi.id} missing function`)
    }
    if (!kpi.name) {
      errors.push(`KPI at index ${index} missing name`)
    }
    if (!kpi.tier) {
      errors.push(`KPI ${kpi.id} missing tier`)
    }

    // Warnings
    if (!kpi.formula) {
      warnings.push(`KPI ${kpi.id} missing formula`)
    }
  })

  return {
    valid: errors.length === 0,
    errors,
    warnings
  }
}

// Export everything
export default {
  ALL_KPIS,
  getKPIsByFunction,
  getKPIsByIndustry,
  getKPIsByStage,
  getKPIsByTier,
  getKPIById,
  getKPIsByIds,
  searchKPIs,
  getKPIStats,
  validateKPIs
}