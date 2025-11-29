// src/lib/kpi/adapters/wizard-adapter.ts

import { KPI, WizardKPI, BusinessProfile, BusinessStage, Industry } from '../types'
import { BUSINESS_STAGE_METADATA, DEFAULTS } from '../constants'

/**
 * WizardKPIAdapter - Transform KPIs for Goals Wizard UI
 * 
 * This adapter implements the Adapter Pattern to transform core KPI objects
 * into the format expected by the Goals Wizard interface. It handles:
 * 
 * - Data structure transformation
 * - Intelligent default value generation
 * - Business logic for target setting
 * - Backwards compatibility with existing wizard
 * 
 * Features:
 * - Smart defaults based on business context
 * - Growth trajectory calculations
 * - Industry benchmark integration
 * - Stage-appropriate target setting
 */
export class WizardKPIAdapter {

  /**
   * Transform KPI to Wizard format
   * 
   * @param kpi Source KPI object
   * @param businessProfile Optional business context for intelligent defaults
   * @returns WizardKPI formatted for the goals wizard
   */
  static toWizardFormat(kpi: KPI, businessProfile?: BusinessProfile): WizardKPI {
    return {
      // Core identification
      id: kpi.id,
      name: kpi.name,
      friendlyName: kpi.plainName,
      category: kpi.category,
      unit: kpi.unit,
      frequency: kpi.frequency,
      description: kpi.description,
      whyItMatters: kpi.whyItMatters,
      actionToTake: kpi.actionToTake,
      benchmarks: kpi.benchmarks,
      
      // Wizard-specific fields with intelligent defaults
      currentValue: this.getDefaultCurrentValue(kpi, businessProfile),
      year1Target: this.getDefaultTarget(kpi, businessProfile, 1),
      year2Target: this.getDefaultTarget(kpi, businessProfile, 2),
      year3Target: this.getDefaultTarget(kpi, businessProfile, 3),
      
      // Classification flags
      isStandard: this.isStandardKPI(kpi),
      isIndustry: this.isIndustrySpecific(kpi, businessProfile?.industry),
      isCustom: false // Core KPIs are never custom
    }
  }

  /**
   * Transform WizardKPI back to partial KPI format
   * 
   * @param wizardKPI Source WizardKPI object
   * @returns Partial KPI object for storage/processing
   */
  static fromWizardFormat(wizardKPI: WizardKPI): Partial<KPI> {
    return {
      id: wizardKPI.id,
      name: wizardKPI.name,
      plainName: wizardKPI.friendlyName,
      category: wizardKPI.category,
      unit: wizardKPI.unit,
      frequency: wizardKPI.frequency,
      description: wizardKPI.description,
      whyItMatters: wizardKPI.whyItMatters,
      actionToTake: wizardKPI.actionToTake,
      benchmarks: wizardKPI.benchmarks
    }
  }

  /**
   * Transform array of KPIs to WizardKPI format
   * 
   * @param kpis Array of source KPIs
   * @param businessProfile Business context for all KPIs
   * @returns Array of WizardKPIs
   */
  static toWizardFormatArray(kpis: KPI[], businessProfile?: BusinessProfile): WizardKPI[] {
    return kpis.map(kpi => this.toWizardFormat(kpi, businessProfile))
  }

  /**
   * Create custom WizardKPI
   * 
   * @param customData Custom KPI data
   * @returns WizardKPI object for custom KPI
   */
  static createCustomWizardKPI(customData: {
    id: string
    name: string
    category: string
    unit: string
    frequency: string
    description: string
    currentValue?: number
    year1Target?: number
    year2Target?: number
    year3Target?: number
  }): WizardKPI {
    return {
      id: customData.id,
      name: customData.name,
      friendlyName: customData.name,
      category: customData.category,
      unit: customData.unit,
      frequency: customData.frequency,
      description: customData.description,
      whyItMatters: 'Custom metric important to your business',
      actionToTake: 'Monitor regularly and adjust strategy as needed',
      benchmarks: {
        poor: 'Below target',
        average: 'At target',
        good: 'Above target',
        excellent: 'Exceptional performance'
      },
      currentValue: customData.currentValue || 0,
      year1Target: customData.year1Target || 0,
      year2Target: customData.year2Target || 0,
      year3Target: customData.year3Target || 0,
      isStandard: false,
      isIndustry: false,
      isCustom: true
    }
  }

  /**
   * Update WizardKPI with new values
   * 
   * @param existingKPI Current WizardKPI
   * @param updates Partial updates to apply
   * @returns Updated WizardKPI
   */
  static updateWizardKPI(existingKPI: WizardKPI, updates: Partial<WizardKPI>): WizardKPI {
    return {
      ...existingKPI,
      ...updates
    }
  }

  /**
   * Validate WizardKPI target progression
   * 
   * @param wizardKPI WizardKPI to validate
   * @returns Validation result with suggestions
   */
  static validateTargetProgression(wizardKPI: WizardKPI): {
    isValid: boolean
    warnings: string[]
    suggestions: string[]
  } {
    const warnings: string[] = []
    const suggestions: string[] = []
    const { currentValue, year1Target, year2Target, year3Target, unit } = wizardKPI

    // Check for negative values where inappropriate
    if (unit === 'currency' || unit === 'number') {
      if (currentValue < 0) warnings.push('Current value is negative')
      if (year1Target < 0) warnings.push('Year 1 target is negative')
      if (year2Target < 0) warnings.push('Year 2 target is negative')
      if (year3Target < 0) warnings.push('Year 3 target is negative')
    }

    // Check growth progression
    if (unit === 'currency' || unit === 'number') {
      if (year1Target < currentValue) {
        warnings.push('Year 1 target is lower than current value')
        suggestions.push('Consider setting growth targets above current performance')
      }
      
      if (year2Target < year1Target) {
        warnings.push('Year 2 target is lower than Year 1 target')
      }
      
      if (year3Target < year2Target) {
        warnings.push('Year 3 target is lower than Year 2 target')
      }
    }

    // Check for unrealistic growth
    if (currentValue > 0 && year1Target > currentValue * 5) {
      warnings.push('Year 1 target may be too ambitious (>500% growth)')
      suggestions.push('Consider more gradual growth targets for better achievability')
    }

    return {
      isValid: warnings.length === 0,
      warnings,
      suggestions
    }
  }

  // Private Helper Methods

  /**
   * Generate intelligent default current value
   */
  private static getDefaultCurrentValue(kpi: KPI, businessProfile?: BusinessProfile): number {
    if (!businessProfile) {
      return DEFAULTS.WIZARD_CURRENT_VALUE
    }

    // Use business stage and industry to generate realistic defaults
    const stageMetadata = BUSINESS_STAGE_METADATA[businessProfile.stage]
    const baseRevenue = (stageMetadata.minRevenue + stageMetadata.maxRevenue) / 2

    switch (kpi.unit) {
      case 'currency':
        return this.getDefaultCurrencyValue(kpi, baseRevenue, businessProfile)
      
      case 'percentage':
        return this.getDefaultPercentageValue(kpi, businessProfile)
      
      case 'number':
        return this.getDefaultNumberValue(kpi, businessProfile)
      
      case 'days':
        return this.getDefaultDaysValue(kpi, businessProfile)
        
      default:
        return DEFAULTS.WIZARD_CURRENT_VALUE
    }
  }

  /**
   * Generate intelligent default targets
   */
  private static getDefaultTarget(kpi: KPI, businessProfile?: BusinessProfile, year: number): number {
    const currentValue = this.getDefaultCurrentValue(kpi, businessProfile)
    const growthRate = this.getGrowthRateForKPI(kpi, businessProfile, year)
    
    return Math.round(currentValue * growthRate)
  }

  /**
   * Generate default currency values based on KPI type and business context
   */
  private static getDefaultCurrencyValue(kpi: KPI, baseRevenue: number, profile: BusinessProfile): number {
    const kpiId = kpi.id.toLowerCase()
    
    if (kpiId.includes('revenue') || kpiId.includes('sales')) {
      return Math.round(baseRevenue / 12) // Monthly revenue estimate
    }
    
    if (kpiId.includes('profit')) {
      return Math.round((baseRevenue / 12) * 0.1) // 10% profit margin estimate
    }
    
    if (kpiId.includes('cost') || kpiId.includes('expense')) {
      return Math.round((baseRevenue / 12) * 0.05) // 5% of revenue estimate
    }
    
    if (kpiId.includes('cash')) {
      return Math.round((baseRevenue / 12) * 2) // 2 months of revenue
    }
    
    return Math.round(baseRevenue / 100) // Default fallback
  }

  /**
   * Generate default percentage values
   */
  private static getDefaultPercentageValue(kpi: KPI, profile: BusinessProfile): number {
    const kpiId = kpi.id.toLowerCase()
    
    if (kpiId.includes('margin') || kpiId.includes('profit')) {
      return 10 // 10% default margin
    }
    
    if (kpiId.includes('conversion') || kpiId.includes('close')) {
      return 20 // 20% conversion rate
    }
    
    if (kpiId.includes('retention') || kpiId.includes('repeat')) {
      return 75 // 75% retention rate
    }
    
    if (kpiId.includes('satisfaction') || kpiId.includes('nps')) {
      return 80 // 80% satisfaction
    }
    
    return 50 // Default percentage
  }

  /**
   * Generate default number values
   */
  private static getDefaultNumberValue(kpi: KPI, profile: BusinessProfile): number {
    const kpiId = kpi.id.toLowerCase()
    const stageMetadata = BUSINESS_STAGE_METADATA[profile.stage]
    const baseRevenue = (stageMetadata.minRevenue + stageMetadata.maxRevenue) / 2
    
    if (kpiId.includes('customer') || kpiId.includes('client')) {
      return Math.round(baseRevenue / 50000) // Assume $50k per customer
    }
    
    if (kpiId.includes('employee') || kpiId.includes('staff') || kpiId.includes('team')) {
      return Math.round(baseRevenue / 100000) // Assume $100k revenue per employee
    }
    
    if (kpiId.includes('lead')) {
      return Math.round(baseRevenue / 10000) // Assume $10k revenue per lead
    }
    
    if (kpiId.includes('order') || kpiId.includes('transaction')) {
      return Math.round(baseRevenue / 1000) // Assume $1k per order
    }
    
    return 100 // Default number
  }

  /**
   * Generate default days values
   */
  private static getDefaultDaysValue(kpi: KPI, profile: BusinessProfile): number {
    const kpiId = kpi.id.toLowerCase()
    
    if (kpiId.includes('cycle') || kpiId.includes('sales')) {
      return 30 // 30-day sales cycle
    }
    
    if (kpiId.includes('delivery') || kpiId.includes('fulfillment')) {
      return 7 // 7-day delivery
    }
    
    if (kpiId.includes('payment') || kpiId.includes('collection')) {
      return 30 // 30-day payment terms
    }
    
    return 14 // Default 2 weeks
  }

  /**
   * Calculate growth rate based on KPI type and business stage
   */
  private static getGrowthRateForKPI(kpi: KPI, profile?: BusinessProfile, year: number = 1): number {
    const baseGrowthRate = DEFAULTS.TARGET_GROWTH_RATE
    const yearMultiplier = Math.pow(baseGrowthRate, year)
    
    if (!profile) {
      return yearMultiplier
    }

    // Adjust growth rate based on business stage
    const stageMultipliers = {
      [BusinessStage.FOUNDATION]: 1.5, // Higher growth potential
      [BusinessStage.TRACTION]: 1.3,
      [BusinessStage.GROWTH]: 1.2,
      [BusinessStage.SCALE]: 1.15,
      [BusinessStage.OPTIMIZATION]: 1.1,
      [BusinessStage.LEADERSHIP]: 1.05 // More conservative growth
    }

    const stageMultiplier = stageMultipliers[profile.stage] || 1.2

    // Adjust based on KPI type
    let kpiMultiplier = 1.0
    const kpiId = kpi.id.toLowerCase()
    
    if (kpiId.includes('efficiency') || kpiId.includes('productivity')) {
      kpiMultiplier = 1.1 // Moderate improvement
    } else if (kpiId.includes('revenue') || kpiId.includes('sales')) {
      kpiMultiplier = 1.2 // Aggressive revenue growth
    } else if (kpiId.includes('profit') || kpiId.includes('margin')) {
      kpiMultiplier = 1.15 // Moderate profit improvement
    }

    return yearMultiplier * stageMultiplier * kpiMultiplier
  }

  /**
   * Check if KPI is a standard/universal KPI
   */
  private static isStandardKPI(kpi: KPI): boolean {
    return kpi.tier === 'essential' && kpi.industries.includes(Industry.ALL)
  }

  /**
   * Check if KPI is industry-specific
   */
  private static isIndustrySpecific(kpi: KPI, industry?: Industry): boolean {
    if (!industry) return false
    
    return kpi.industries.includes(industry) && 
           !kpi.industries.includes(Industry.ALL) &&
           kpi.industries.length === 1
  }
}

/**
 * Convenience functions for common operations
 */

/**
 * Transform single KPI to wizard format
 */
export function toWizardFormat(kpi: KPI, businessProfile?: BusinessProfile): WizardKPI {
  return WizardKPIAdapter.toWizardFormat(kpi, businessProfile)
}

/**
 * Transform array of KPIs to wizard format
 */
export function toWizardFormatArray(kpis: KPI[], businessProfile?: BusinessProfile): WizardKPI[] {
  return WizardKPIAdapter.toWizardFormatArray(kpis, businessProfile)
}

/**
 * Create custom wizard KPI
 */
export function createCustomWizardKPI(customData: Parameters<typeof WizardKPIAdapter.createCustomWizardKPI>[0]): WizardKPI {
  return WizardKPIAdapter.createCustomWizardKPI(customData)
}

/**
 * Validate wizard KPI targets
 */
export function validateTargetProgression(wizardKPI: WizardKPI): ReturnType<typeof WizardKPIAdapter.validateTargetProgression> {
  return WizardKPIAdapter.validateTargetProgression(wizardKPI)
}

/**
 * Batch convert KPIs with progress tracking
 */
export async function batchConvertToWizardFormat(
  kpis: KPI[], 
  businessProfile?: BusinessProfile,
  onProgress?: (completed: number, total: number) => void
): Promise<WizardKPI[]> {
  const results: WizardKPI[] = []
  const batchSize = 10 // Process in batches to avoid blocking
  
  for (let i = 0; i < kpis.length; i += batchSize) {
    const batch = kpis.slice(i, i + batchSize)
    const batchResults = batch.map(kpi => 
      WizardKPIAdapter.toWizardFormat(kpi, businessProfile)
    )
    
    results.push(...batchResults)
    
    if (onProgress) {
      onProgress(Math.min(i + batchSize, kpis.length), kpis.length)
    }
    
    // Small delay to keep UI responsive
    if (i + batchSize < kpis.length) {
      await new Promise(resolve => setTimeout(resolve, 1))
    }
  }
  
  return results
}

// Export the main adapter class as default
export default WizardKPIAdapter