// src/lib/kpi/utils/mappers.ts

import { 
  KPI, 
  WizardKPI, 
  BusinessProfile, 
  BusinessFunction, 
  BusinessStage, 
  Industry 
} from '../types'
import { WizardKPIAdapter } from '../adapters/wizard-adapter'

/**
 * Mapping Utilities for KPI System
 * 
 * These utilities handle data transformation and mapping between different
 * formats used throughout the application. They maintain backwards
 * compatibility while enabling the new unified architecture.
 */

/**
 * Map business industry from various formats to KPI Industry enum
 * 
 * This function handles the complexity of mapping user-entered business
 * descriptions to our standardized industry classifications.
 * 
 * @param businessIndustry Industry string from business profile
 * @returns Standardized Industry enum value
 */
export function mapBusinessIndustryToKPIIndustry(businessIndustry: string): Industry {
  if (!businessIndustry || typeof businessIndustry !== 'string') {
    return Industry.ALL
  }

  const normalized = businessIndustry.toLowerCase().trim()

  // Construction & Trades mapping
  if (
    normalized.includes('construction') ||
    normalized.includes('building') ||
    normalized.includes('contractor') ||
    normalized.includes('electrical') ||
    normalized.includes('plumbing') ||
    normalized.includes('hvac') ||
    normalized.includes('carpentry') ||
    normalized.includes('roofing') ||
    normalized.includes('flooring') ||
    normalized.includes('landscaping') ||
    normalized.includes('painting') ||
    normalized.includes('demolition') ||
    normalized.includes('excavation') ||
    normalized.includes('masonry') ||
    normalized.includes('concrete') ||
    normalized.includes('trade')
  ) {
    return Industry.CONSTRUCTION_TRADES
  }

  // Health & Wellness mapping  
  if (
    normalized.includes('health') ||
    normalized.includes('medical') ||
    normalized.includes('wellness') ||
    normalized.includes('fitness') ||
    normalized.includes('therapy') ||
    normalized.includes('clinic') ||
    normalized.includes('hospital') ||
    normalized.includes('dental') ||
    normalized.includes('chiropractic') ||
    normalized.includes('physiotherapy') ||
    normalized.includes('psychology') ||
    normalized.includes('counseling') ||
    normalized.includes('nutrition') ||
    normalized.includes('pharmacy') ||
    normalized.includes('veterinary') ||
    normalized.includes('massage') ||
    normalized.includes('spa') ||
    normalized.includes('gym')
  ) {
    return Industry.HEALTH_WELLNESS
  }

  // Professional Services mapping
  if (
    normalized.includes('consulting') ||
    normalized.includes('accounting') ||
    normalized.includes('legal') ||
    normalized.includes('law') ||
    normalized.includes('financial') ||
    normalized.includes('advisory') ||
    normalized.includes('professional') ||
    normalized.includes('coaching') ||
    normalized.includes('training') ||
    normalized.includes('education') ||
    normalized.includes('marketing') ||
    normalized.includes('advertising') ||
    normalized.includes('design') ||
    normalized.includes('architecture') ||
    normalized.includes('engineering') ||
    normalized.includes('real estate') ||
    normalized.includes('insurance') ||
    normalized.includes('recruitment') ||
    normalized.includes('hr ') ||
    normalized.includes('human resources') ||
    normalized.includes('it services') ||
    normalized.includes('software') ||
    normalized.includes('technology')
  ) {
    return Industry.PROFESSIONAL_SERVICES
  }

  // Retail & E-commerce mapping
  if (
    normalized.includes('retail') ||
    normalized.includes('ecommerce') ||
    normalized.includes('e-commerce') ||
    normalized.includes('store') ||
    normalized.includes('shop') ||
    normalized.includes('boutique') ||
    normalized.includes('market') ||
    normalized.includes('sales') ||
    normalized.includes('merchandise') ||
    normalized.includes('apparel') ||
    normalized.includes('clothing') ||
    normalized.includes('fashion') ||
    normalized.includes('jewelry') ||
    normalized.includes('electronics') ||
    normalized.includes('furniture') ||
    normalized.includes('home goods') ||
    normalized.includes('grocery') ||
    normalized.includes('restaurant') ||
    normalized.includes('food') ||
    normalized.includes('beverage') ||
    normalized.includes('coffee') ||
    normalized.includes('bakery') ||
    normalized.includes('catering')
  ) {
    return Industry.RETAIL_ECOMMERCE
  }

  // Operations & Logistics mapping
  if (
    normalized.includes('logistics') ||
    normalized.includes('transportation') ||
    normalized.includes('shipping') ||
    normalized.includes('freight') ||
    normalized.includes('delivery') ||
    normalized.includes('warehouse') ||
    normalized.includes('distribution') ||
    normalized.includes('supply chain') ||
    normalized.includes('manufacturing') ||
    normalized.includes('production') ||
    normalized.includes('assembly') ||
    normalized.includes('packaging') ||
    normalized.includes('inventory') ||
    normalized.includes('fulfillment') ||
    normalized.includes('operations')
  ) {
    return Industry.OPERATIONS_LOGISTICS
  }

  // Default to ALL if no specific match found
  return Industry.ALL
}

/**
 * Map revenue string to business stage
 * 
 * @param revenue Revenue range string (e.g., "1M-2.5M", "500K-1M")
 * @returns Business stage enum
 */
export function mapRevenueToStage(revenue: string): BusinessStage {
  if (!revenue || typeof revenue !== 'string') {
    return BusinessStage.FOUNDATION
  }

  const normalized = revenue.toLowerCase().trim()

  // Handle various revenue format patterns
  const revenueStageMap: Record<string, BusinessStage> = {
    // Exact matches
    '0-250k': BusinessStage.FOUNDATION,
    '250k-1m': BusinessStage.TRACTION,
    '1m-2.5m': BusinessStage.GROWTH,
    '2.5m-5m': BusinessStage.SCALE,
    '5m-10m': BusinessStage.OPTIMIZATION,
    '10m+': BusinessStage.LEADERSHIP,
    
    // Alternative formats
    '0-250000': BusinessStage.FOUNDATION,
    '250000-1000000': BusinessStage.TRACTION,
    '1000000-2500000': BusinessStage.GROWTH,
    '2500000-5000000': BusinessStage.SCALE,
    '5000000-10000000': BusinessStage.OPTIMIZATION,
    
    // Descriptive formats
    'foundation': BusinessStage.FOUNDATION,
    'traction': BusinessStage.TRACTION,
    'growth': BusinessStage.GROWTH,
    'scale': BusinessStage.SCALE,
    'optimization': BusinessStage.OPTIMIZATION,
    'leadership': BusinessStage.LEADERSHIP
  }

  // Direct lookup first
  if (revenueStageMap[normalized]) {
    return revenueStageMap[normalized]
  }

  // Extract numeric values for range matching
  const numbers = normalized.match(/[\d.]+/g)?.map(n => parseFloat(n)) || []
  
  if (numbers.length > 0) {
    const value = numbers[0]
    
    // Convert K and M suffixes
    let multiplier = 1
    if (normalized.includes('k')) multiplier = 1000
    if (normalized.includes('m')) multiplier = 1000000
    
    const actualValue = value * multiplier
    
    if (actualValue < 250000) return BusinessStage.FOUNDATION
    if (actualValue < 1000000) return BusinessStage.TRACTION
    if (actualValue < 2500000) return BusinessStage.GROWTH
    if (actualValue < 5000000) return BusinessStage.SCALE
    if (actualValue < 10000000) return BusinessStage.OPTIMIZATION
    return BusinessStage.LEADERSHIP
  }

  return BusinessStage.FOUNDATION
}

/**
 * Map assessment results to weak business functions
 * 
 * This function analyzes assessment scores to identify areas needing improvement.
 * 
 * @param assessmentResults Assessment results object
 * @param threshold Score threshold below which a function is considered weak
 * @returns Array of weak business functions
 */
export function mapAssessmentToFunctions(
  assessmentResults: Record<string, number>,
  threshold: number = 6
): BusinessFunction[] {
  if (!assessmentResults || typeof assessmentResults !== 'object') {
    return []
  }

  const functionMappings: Record<string, BusinessFunction> = {
    // Marketing & Lead Generation
    'marketing': BusinessFunction.ATTRACT,
    'leads': BusinessFunction.ATTRACT,
    'advertising': BusinessFunction.ATTRACT,
    'branding': BusinessFunction.ATTRACT,
    'awareness': BusinessFunction.ATTRACT,
    
    // Sales & Conversion
    'sales': BusinessFunction.CONVERT,
    'conversion': BusinessFunction.CONVERT,
    'closing': BusinessFunction.CONVERT,
    'proposals': BusinessFunction.CONVERT,
    'negotiation': BusinessFunction.CONVERT,
    
    // Operations & Delivery
    'operations': BusinessFunction.DELIVER,
    'delivery': BusinessFunction.DELIVER,
    'production': BusinessFunction.DELIVER,
    'quality': BusinessFunction.DELIVER,
    'processes': BusinessFunction.DELIVER,
    'fulfillment': BusinessFunction.DELIVER,
    
    // Customer Service & Retention
    'customer service': BusinessFunction.DELIGHT,
    'retention': BusinessFunction.DELIGHT,
    'satisfaction': BusinessFunction.DELIGHT,
    'support': BusinessFunction.DELIGHT,
    'loyalty': BusinessFunction.DELIGHT,
    
    // Team & Culture
    'team': BusinessFunction.PEOPLE,
    'culture': BusinessFunction.PEOPLE,
    'leadership': BusinessFunction.PEOPLE,
    'hr': BusinessFunction.PEOPLE,
    'training': BusinessFunction.PEOPLE,
    'performance': BusinessFunction.PEOPLE,
    
    // Financial Management
    'finance': BusinessFunction.PROFIT,
    'financial': BusinessFunction.PROFIT,
    'profit': BusinessFunction.PROFIT,
    'cash flow': BusinessFunction.PROFIT,
    'budgeting': BusinessFunction.PROFIT,
    
    // Systems & Productivity
    'systems': BusinessFunction.SYSTEMS,
    'productivity': BusinessFunction.SYSTEMS,
    'efficiency': BusinessFunction.SYSTEMS,
    'automation': BusinessFunction.SYSTEMS,
    'technology': BusinessFunction.SYSTEMS
  }

  const weakFunctions = new Set<BusinessFunction>()

  // Analyze each assessment result
  Object.entries(assessmentResults).forEach(([key, score]) => {
    if (score < threshold) {
      const normalizedKey = key.toLowerCase().trim()
      
      // Find matching function
      for (const [mappingKey, businessFunction] of Object.entries(functionMappings)) {
        if (normalizedKey.includes(mappingKey)) {
          weakFunctions.add(businessFunction)
          break
        }
      }
    }
  })

  return Array.from(weakFunctions)
}

/**
 * Map KPI to wizard format with business context
 * 
 * @param kpi Source KPI
 * @param businessProfile Business context
 * @returns WizardKPI object
 */
export function mapKPIToWizardFormat(kpi: KPI, businessProfile?: BusinessProfile): WizardKPI {
  return WizardKPIAdapter.toWizardFormat(kpi, businessProfile)
}

/**
 * Map legacy KPI format to new KPI format
 * 
 * This function helps migrate existing KPI data to the new unified format.
 * 
 * @param legacyKPI Legacy KPI object
 * @returns New KPI format
 */
export function mapLegacyKPIToNewFormat(legacyKPI: any): Partial<KPI> {
  if (!legacyKPI || typeof legacyKPI !== 'object') {
    return {}
  }

  const mapped: Partial<KPI> = {}

  // Direct field mappings
  if (legacyKPI.id) mapped.id = String(legacyKPI.id)
  if (legacyKPI.name) mapped.name = String(legacyKPI.name)
  
  // Handle different plain name variations
  if (legacyKPI.plainName) {
    mapped.plainName = String(legacyKPI.plainName)
  } else if (legacyKPI.friendlyName) {
    mapped.plainName = String(legacyKPI.friendlyName)
  } else if (legacyKPI.displayName) {
    mapped.plainName = String(legacyKPI.displayName)
  }

  if (legacyKPI.category) mapped.category = String(legacyKPI.category)
  if (legacyKPI.unit) mapped.unit = String(legacyKPI.unit)
  if (legacyKPI.frequency) mapped.frequency = String(legacyKPI.frequency)
  if (legacyKPI.description) mapped.description = String(legacyKPI.description)

  // Handle guidance fields
  if (legacyKPI.whyItMatters) {
    mapped.whyItMatters = String(legacyKPI.whyItMatters)
  } else if (legacyKPI.importance) {
    mapped.whyItMatters = String(legacyKPI.importance)
  }

  if (legacyKPI.actionToTake) {
    mapped.actionToTake = String(legacyKPI.actionToTake)
  } else if (legacyKPI.action) {
    mapped.actionToTake = String(legacyKPI.action)
  }

  // Map business function
  if (legacyKPI.function) {
    mapped.function = mapLegacyFunctionToNew(legacyKPI.function)
  }

  // Map tier
  if (legacyKPI.tier) {
    mapped.tier = mapLegacyTierToNew(legacyKPI.tier)
  }

  // Handle industries array
  if (legacyKPI.industries) {
    if (Array.isArray(legacyKPI.industries)) {
      mapped.industries = legacyKPI.industries.map((industry: any) => 
        mapBusinessIndustryToKPIIndustry(String(industry))
      )
    } else {
      mapped.industries = [mapBusinessIndustryToKPIIndustry(String(legacyKPI.industries))]
    }
  }

  // Handle stages array
  if (legacyKPI.stages || legacyKPI.stage) {
    const stageData = legacyKPI.stages || legacyKPI.stage
    if (Array.isArray(stageData)) {
      mapped.stages = stageData.map((stage: any) => mapLegacyStageToNew(String(stage)))
    } else {
      mapped.stages = [mapLegacyStageToNew(String(stageData))]
    }
  }

  // Handle benchmarks
  if (legacyKPI.benchmarks) {
    mapped.benchmarks = legacyKPI.benchmarks
  }

  // Handle tags
  if (legacyKPI.tags) {
    if (Array.isArray(legacyKPI.tags)) {
      mapped.tags = legacyKPI.tags.map((tag: any) => String(tag))
    } else {
      mapped.tags = [String(legacyKPI.tags)]
    }
  }

  return mapped
}

/**
 * Map legacy function names to new BusinessFunction enum
 */
function mapLegacyFunctionToNew(legacyFunction: string): BusinessFunction {
  const functionMap: Record<string, BusinessFunction> = {
    'attract': BusinessFunction.ATTRACT,
    'marketing': BusinessFunction.ATTRACT,
    'lead generation': BusinessFunction.ATTRACT,
    
    'convert': BusinessFunction.CONVERT,
    'sales': BusinessFunction.CONVERT,
    'conversion': BusinessFunction.CONVERT,
    
    'deliver': BusinessFunction.DELIVER,
    'operations': BusinessFunction.DELIVER,
    'delivery': BusinessFunction.DELIVER,
    
    'delight': BusinessFunction.DELIGHT,
    'customer service': BusinessFunction.DELIGHT,
    'retention': BusinessFunction.DELIGHT,
    
    'people': BusinessFunction.PEOPLE,
    'team': BusinessFunction.PEOPLE,
    'hr': BusinessFunction.PEOPLE,
    
    'profit': BusinessFunction.PROFIT,
    'finance': BusinessFunction.PROFIT,
    'financial': BusinessFunction.PROFIT,
    
    'systems': BusinessFunction.SYSTEMS,
    'productivity': BusinessFunction.SYSTEMS,
    'efficiency': BusinessFunction.SYSTEMS
  }

  const normalized = legacyFunction.toLowerCase().trim()
  return functionMap[normalized] || BusinessFunction.PROFIT
}

/**
 * Map legacy tier names to new KPITier enum
 */
function mapLegacyTierToNew(legacyTier: string): any {
  const tierMap: Record<string, string> = {
    'essential': 'essential',
    'core': 'essential',
    'critical': 'essential',
    'must have': 'essential',
    
    'recommended': 'recommended',
    'important': 'recommended',
    'should have': 'recommended',
    
    'advanced': 'advanced',
    'optional': 'advanced',
    'nice to have': 'advanced'
  }

  const normalized = legacyTier.toLowerCase().trim()
  return tierMap[normalized] || 'recommended'
}

/**
 * Map legacy stage names to new BusinessStage enum
 */
function mapLegacyStageToNew(legacyStage: string): BusinessStage {
  const stageMap: Record<string, BusinessStage> = {
    'foundation': BusinessStage.FOUNDATION,
    'startup': BusinessStage.FOUNDATION,
    'early': BusinessStage.FOUNDATION,
    
    'traction': BusinessStage.TRACTION,
    'growing': BusinessStage.TRACTION,
    
    'growth': BusinessStage.GROWTH,
    'expanding': BusinessStage.GROWTH,
    
    'scale': BusinessStage.SCALE,
    'scaling': BusinessStage.SCALE,
    
    'optimization': BusinessStage.OPTIMIZATION,
    'optimizing': BusinessStage.OPTIMIZATION,
    'mature': BusinessStage.OPTIMIZATION,
    
    'leadership': BusinessStage.LEADERSHIP,
    'enterprise': BusinessStage.LEADERSHIP,
    'large': BusinessStage.LEADERSHIP
  }

  const normalized = legacyStage.toLowerCase().trim()
  return stageMap[normalized] || BusinessStage.FOUNDATION
}

/**
 * Convert wizard KPI array to save format for database
 * 
 * @param wizardKPIs Array of wizard KPIs
 * @param userId User ID for the save operation
 * @returns Database save format
 */
export function mapWizardKPIsToSaveFormat(
  wizardKPIs: WizardKPI[],
  userId: string
): any[] {
  return wizardKPIs.map(kpi => ({
    user_id: userId,
    kpi_id: kpi.id,
    name: kpi.name,
    friendly_name: kpi.friendlyName,
    category: kpi.category,
    unit: kpi.unit,
    frequency: kpi.frequency,
    description: kpi.description,
    current_value: kpi.currentValue,
    year1_target: kpi.year1Target,
    year2_target: kpi.year2Target,
    year3_target: kpi.year3Target,
    is_standard: kpi.isStandard,
    is_industry: kpi.isIndustry,
    is_custom: kpi.isCustom,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }))
}

/**
 * Convert database format back to wizard KPI format
 * 
 * @param databaseRecords Array of database records
 * @returns Array of wizard KPIs
 */
export function mapDatabaseToWizardKPIs(databaseRecords: any[]): WizardKPI[] {
  return databaseRecords.map(record => ({
    id: record.kpi_id,
    name: record.name,
    friendlyName: record.friendly_name,
    category: record.category,
    unit: record.unit,
    frequency: record.frequency,
    description: record.description,
    whyItMatters: record.why_it_matters || 'Important metric for your business',
    actionToTake: record.action_to_take || 'Monitor and adjust strategy as needed',
    benchmarks: record.benchmarks || {
      poor: 'Below target',
      average: 'At target', 
      good: 'Above target',
      excellent: 'Exceptional'
    },
    currentValue: Number(record.current_value) || 0,
    year1Target: Number(record.year1_target) || 0,
    year2Target: Number(record.year2_target) || 0,
    year3Target: Number(record.year3_target) || 0,
    isStandard: record.is_standard || false,
    isIndustry: record.is_industry || false,
    isCustom: record.is_custom || false
  }))
}

/**
 * Create business profile from various data sources
 * 
 * @param userData User data from various sources
 * @returns Standardized business profile
 */
export function createBusinessProfileFromUserData(userData: any): BusinessProfile {
  return {
    userId: userData.user_id || userData.id || 'unknown',
    industry: mapBusinessIndustryToKPIIndustry(userData.industry || userData.business_type || ''),
    stage: mapRevenueToStage(userData.revenue || userData.revenue_stage || ''),
    weakFunctions: userData.weak_functions || 
      mapAssessmentToFunctions(userData.assessment_results || {}),
    revenue: userData.annual_revenue || userData.revenue_amount,
    employees: userData.employee_count || userData.team_size,
    customNiche: userData.niche || userData.specialty
  }
}