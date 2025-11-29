// src/lib/kpi/services/validation-service.ts

import { 
  KPI, 
  WizardKPI, 
  BusinessProfile, 
  ValidationError,
  BusinessFunction,
  BusinessStage,
  Industry,
  KPITier,
  isKPI,
  isWizardKPI,
  isBusinessProfile
} from '../types'
import { 
  VALIDATION_RULES, 
  BUSINESS_FUNCTION_METADATA,
  INDUSTRY_METADATA,
  BUSINESS_STAGE_METADATA,
  KPI_TIER_METADATA,
  FEATURE_FLAGS
} from '../constants'

/**
 * ValidationService - Comprehensive Data Validation
 * 
 * Provides validation for all KPI-related data structures ensuring:
 * - Data integrity across the system
 * - Proper type safety at runtime
 * - Business rule compliance
 * - Performance optimization through early validation
 * 
 * Features:
 * - Schema validation
 * - Business rule validation
 * - Performance validation
 * - Custom validation rules
 * - Detailed error reporting
 */
export class ValidationService {
  
  /**
   * Validate complete KPI object
   * 
   * @param kpi KPI object to validate
   * @param strict Whether to apply strict validation rules
   * @throws ValidationError if validation fails
   */
  validateKPI(kpi: any, strict: boolean = false): asserts kpi is KPI {
    if (!FEATURE_FLAGS.ENABLE_VALIDATION) {
      return
    }

    try {
      // Type guard check
      if (!isKPI(kpi)) {
        throw new ValidationError('Invalid KPI object structure')
      }

      // Required fields validation
      this.validateRequiredFields(kpi, VALIDATION_RULES.REQUIRED_FIELDS)

      // Field-specific validation
      this.validateKPIId(kpi.id)
      this.validateKPIName(kpi.name)
      this.validateKPIPlainName(kpi.plainName)
      this.validateBusinessFunction(kpi.function)
      this.validateCategory(kpi.category)
      this.validateTier(kpi.tier)
      this.validateIndustries(kpi.industries)
      this.validateStages(kpi.stages)
      this.validateUnit(kpi.unit)
      this.validateFrequency(kpi.frequency)
      this.validateDescription(kpi.description)
      this.validateBenchmarks(kpi.benchmarks)
      this.validateTags(kpi.tags)
      this.validateTimestamps(kpi.createdAt, kpi.updatedAt)

      // Optional field validation
      if (kpi.formula) {
        this.validateFormula(kpi.formula)
      }

      // Business rule validation in strict mode
      if (strict) {
        this.validateBusinessRules(kpi)
      }

    } catch (error) {
      throw new ValidationError(
        `KPI validation failed for ID '${kpi?.id || 'unknown'}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        { kpi, originalError: error }
      )
    }
  }

  /**
   * Validate Wizard KPI object
   * 
   * @param wizardKPI WizardKPI object to validate
   * @throws ValidationError if validation fails
   */
  validateWizardKPI(wizardKPI: any): asserts wizardKPI is WizardKPI {
    if (!FEATURE_FLAGS.ENABLE_VALIDATION) {
      return
    }

    try {
      if (!isWizardKPI(wizardKPI)) {
        throw new ValidationError('Invalid WizardKPI object structure')
      }

      // Basic field validation
      this.validateKPIId(wizardKPI.id)
      this.validateKPIName(wizardKPI.name)
      this.validateCategory(wizardKPI.category)
      this.validateUnit(wizardKPI.unit)
      this.validateFrequency(wizardKPI.frequency)

      // Numerical validation
      this.validateNumericValue(wizardKPI.currentValue, 'currentValue')
      this.validateNumericValue(wizardKPI.year1Target, 'year1Target')
      this.validateNumericValue(wizardKPI.year2Target, 'year2Target')
      this.validateNumericValue(wizardKPI.year3Target, 'year3Target')

      // Target progression validation
      this.validateTargetProgression(wizardKPI)

      // Classification validation
      this.validateBoolean(wizardKPI.isStandard, 'isStandard')
      this.validateBoolean(wizardKPI.isIndustry, 'isIndustry') 
      this.validateBoolean(wizardKPI.isCustom, 'isCustom')

      // Business logic validation
      this.validateClassificationLogic(wizardKPI)

    } catch (error) {
      throw new ValidationError(
        `WizardKPI validation failed for ID '${wizardKPI?.id || 'unknown'}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        { wizardKPI, originalError: error }
      )
    }
  }

  /**
   * Validate Business Profile
   * 
   * @param profile BusinessProfile to validate
   * @throws ValidationError if validation fails
   */
  validateBusinessProfile(profile: any): asserts profile is BusinessProfile {
    if (!FEATURE_FLAGS.ENABLE_VALIDATION) {
      return
    }

    try {
      if (!isBusinessProfile(profile)) {
        throw new ValidationError('Invalid BusinessProfile object structure')
      }

      this.validateUserId(profile.userId)
      this.validateIndustry(profile.industry)
      this.validateBusinessStage(profile.stage)

      if (profile.weakFunctions) {
        profile.weakFunctions.forEach(func => this.validateBusinessFunction(func))
      }

      if (profile.revenue !== undefined) {
        this.validateNumericValue(profile.revenue, 'revenue', 0)
      }

      if (profile.employees !== undefined) {
        this.validateNumericValue(profile.employees, 'employees', 0)
      }

      if (profile.customNiche) {
        this.validateString(profile.customNiche, 'customNiche', 1, 200)
      }

    } catch (error) {
      throw new ValidationError(
        `BusinessProfile validation failed for user '${profile?.userId || 'unknown'}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        { profile, originalError: error }
      )
    }
  }

  /**
   * Validate array of KPIs
   * 
   * @param kpis Array of KPIs to validate
   * @param strict Whether to apply strict validation
   * @returns Validation results with details
   */
  validateKPIArray(kpis: any[], strict: boolean = false): {
    valid: KPI[],
    invalid: Array<{ kpi: any, error: string }>,
    duplicates: string[],
    summary: {
      total: number,
      valid: number,
      invalid: number,
      duplicates: number
    }
  } {
    const valid: KPI[] = []
    const invalid: Array<{ kpi: any, error: string }> = []
    const seenIds = new Set<string>()
    const duplicates: string[] = []

    kpis.forEach(kpi => {
      try {
        // Check for duplicates
        if (kpi?.id && seenIds.has(kpi.id)) {
          duplicates.push(kpi.id)
          return
        }

        this.validateKPI(kpi, strict)
        valid.push(kpi)
        
        if (kpi.id) {
          seenIds.add(kpi.id)
        }
      } catch (error) {
        invalid.push({
          kpi,
          error: error instanceof Error ? error.message : 'Unknown validation error'
        })
      }
    })

    return {
      valid,
      invalid,
      duplicates,
      summary: {
        total: kpis.length,
        valid: valid.length,
        invalid: invalid.length,
        duplicates: duplicates.length
      }
    }
  }

  // Field-Specific Validation Methods

  private validateKPIId(id: string): void {
    if (!id || typeof id !== 'string') {
      throw new ValidationError('KPI ID is required and must be a string')
    }

    if (id.length < 1 || id.length > 100) {
      throw new ValidationError('KPI ID must be between 1 and 100 characters')
    }

    if (!VALIDATION_RULES.VALID_ID_PATTERN.test(id)) {
      throw new ValidationError('KPI ID must contain only lowercase letters, numbers, and hyphens')
    }
  }

  private validateKPIName(name: string): void {
    this.validateString(name, 'name', 1, VALIDATION_RULES.MAX_KPI_NAME_LENGTH)
  }

  private validateKPIPlainName(plainName: string): void {
    this.validateString(plainName, 'plainName', 1, VALIDATION_RULES.MAX_KPI_NAME_LENGTH)
  }

  private validateBusinessFunction(func: BusinessFunction): void {
    if (!Object.values(BusinessFunction).includes(func)) {
      throw new ValidationError(`Invalid business function: ${func}`)
    }
  }

  private validateCategory(category: string): void {
    this.validateString(category, 'category', 1, 100)
  }

  private validateTier(tier: KPITier): void {
    if (!Object.values(KPITier).includes(tier)) {
      throw new ValidationError(`Invalid KPI tier: ${tier}`)
    }
  }

  private validateIndustries(industries: Industry[]): void {
    if (!Array.isArray(industries) || industries.length === 0) {
      throw new ValidationError('Industries array is required and must not be empty')
    }

    industries.forEach(industry => this.validateIndustry(industry))
  }

  private validateIndustry(industry: Industry): void {
    if (!Object.values(Industry).includes(industry)) {
      throw new ValidationError(`Invalid industry: ${industry}`)
    }
  }

  private validateStages(stages: BusinessStage[]): void {
    if (!Array.isArray(stages) || stages.length === 0) {
      throw new ValidationError('Stages array is required and must not be empty')
    }

    stages.forEach(stage => this.validateBusinessStage(stage))
  }

  private validateBusinessStage(stage: BusinessStage): void {
    if (!Object.values(BusinessStage).includes(stage)) {
      throw new ValidationError(`Invalid business stage: ${stage}`)
    }
  }

  private validateUnit(unit: string): void {
    this.validateString(unit, 'unit', 1, 50)
    
    if (!VALIDATION_RULES.VALID_UNITS.includes(unit)) {
      throw new ValidationError(`Invalid unit: ${unit}. Must be one of: ${VALIDATION_RULES.VALID_UNITS.join(', ')}`)
    }
  }

  private validateFrequency(frequency: string): void {
    this.validateString(frequency, 'frequency', 1, 50)
  }

  private validateDescription(description: string): void {
    this.validateString(description, 'description', 1, VALIDATION_RULES.MAX_DESCRIPTION_LENGTH)
  }

  private validateBenchmarks(benchmarks: any): void {
    if (!benchmarks || typeof benchmarks !== 'object') {
      throw new ValidationError('Benchmarks object is required')
    }

    const requiredKeys = ['poor', 'average', 'good', 'excellent']
    requiredKeys.forEach(key => {
      if (!(key in benchmarks)) {
        throw new ValidationError(`Benchmark '${key}' is required`)
      }
    })
  }

  private validateTags(tags: string[]): void {
    if (!Array.isArray(tags)) {
      throw new ValidationError('Tags must be an array')
    }

    if (tags.length > VALIDATION_RULES.MAX_TAGS) {
      throw new ValidationError(`Too many tags. Maximum allowed: ${VALIDATION_RULES.MAX_TAGS}`)
    }

    tags.forEach((tag, index) => {
      if (typeof tag !== 'string' || tag.length === 0) {
        throw new ValidationError(`Tag at index ${index} must be a non-empty string`)
      }
    })
  }

  private validateTimestamps(createdAt: string, updatedAt: string): void {
    this.validateISO8601(createdAt, 'createdAt')
    this.validateISO8601(updatedAt, 'updatedAt')

    const created = new Date(createdAt)
    const updated = new Date(updatedAt)

    if (updated < created) {
      throw new ValidationError('updatedAt cannot be earlier than createdAt')
    }
  }

  private validateFormula(formula: string): void {
    this.validateString(formula, 'formula', 1, 500)
  }

  private validateUserId(userId: string): void {
    this.validateString(userId, 'userId', 1, 100)
  }

  private validateNumericValue(value: number, fieldName: string, min?: number, max?: number): void {
    if (typeof value !== 'number' || isNaN(value)) {
      throw new ValidationError(`${fieldName} must be a valid number`)
    }

    if (min !== undefined && value < min) {
      throw new ValidationError(`${fieldName} must be at least ${min}`)
    }

    if (max !== undefined && value > max) {
      throw new ValidationError(`${fieldName} must be at most ${max}`)
    }
  }

  private validateString(value: string, fieldName: string, minLength?: number, maxLength?: number): void {
    if (typeof value !== 'string') {
      throw new ValidationError(`${fieldName} must be a string`)
    }

    if (minLength !== undefined && value.length < minLength) {
      throw new ValidationError(`${fieldName} must be at least ${minLength} characters`)
    }

    if (maxLength !== undefined && value.length > maxLength) {
      throw new ValidationError(`${fieldName} must be at most ${maxLength} characters`)
    }
  }

  private validateBoolean(value: boolean, fieldName: string): void {
    if (typeof value !== 'boolean') {
      throw new ValidationError(`${fieldName} must be a boolean`)
    }
  }

  private validateISO8601(value: string, fieldName: string): void {
    if (typeof value !== 'string') {
      throw new ValidationError(`${fieldName} must be a string`)
    }

    const date = new Date(value)
    if (isNaN(date.getTime())) {
      throw new ValidationError(`${fieldName} must be a valid ISO8601 timestamp`)
    }
  }

  private validateRequiredFields(obj: any, requiredFields: string[]): void {
    requiredFields.forEach(field => {
      if (!(field in obj) || obj[field] === undefined || obj[field] === null) {
        throw new ValidationError(`Required field '${field}' is missing or null`)
      }
    })
  }

  // Business Logic Validation

  private validateBusinessRules(kpi: KPI): void {
    // Validate industry-stage compatibility
    this.validateIndustryStageCompatibility(kpi)
    
    // Validate function-tier compatibility
    this.validateFunctionTierCompatibility(kpi)
    
    // Validate benchmark progression
    this.validateBenchmarkProgression(kpi)
  }

  private validateTargetProgression(wizardKPI: WizardKPI): void {
    const { currentValue, year1Target, year2Target, year3Target } = wizardKPI

    // Targets should generally increase over time for growth metrics
    if (wizardKPI.unit === 'currency' || wizardKPI.unit === 'number') {
      if (year2Target < year1Target || year3Target < year2Target) {
        console.warn(`Warning: Decreasing targets detected for KPI ${wizardKPI.id}`)
      }
    }

    // Validate reasonable growth rates (not more than 1000% per year)
    const maxGrowthRate = 10 // 1000%
    
    if (currentValue > 0) {
      const year1Growth = year1Target / currentValue
      if (year1Growth > maxGrowthRate) {
        throw new ValidationError(`Year 1 target growth rate seems unrealistic (${(year1Growth * 100).toFixed(0)}%)`)
      }
    }
  }

  private validateClassificationLogic(wizardKPI: WizardKPI): void {
    const { isStandard, isIndustry, isCustom } = wizardKPI

    // Only one classification should be true
    const trueCount = [isStandard, isIndustry, isCustom].filter(Boolean).length
    if (trueCount !== 1) {
      throw new ValidationError('Exactly one of isStandard, isIndustry, or isCustom must be true')
    }
  }

  private validateIndustryStageCompatibility(kpi: KPI): void {
    // Custom validation rules for industry-stage combinations
    // Add specific business rules as needed
  }

  private validateFunctionTierCompatibility(kpi: KPI): void {
    // Validate that tier is appropriate for the business function
    // Add specific business rules as needed
  }

  private validateBenchmarkProgression(kpi: KPI): void {
    // Ensure benchmarks progress logically: poor < average < good < excellent
    // This would need to be implemented based on benchmark value types
  }
}

/**
 * Singleton instance for global use
 */
let globalValidationInstance: ValidationService | null = null

/**
 * Get global validation service instance
 */
export function getValidationService(): ValidationService {
  if (!globalValidationInstance) {
    globalValidationInstance = new ValidationService()
  }
  return globalValidationInstance
}

/**
 * Create new validation service instance
 */
export function createValidationService(): ValidationService {
  return new ValidationService()
}

/**
 * Quick validation helper functions
 */
export function validateKPI(kpi: any, strict?: boolean): asserts kpi is KPI {
  getValidationService().validateKPI(kpi, strict)
}

export function validateWizardKPI(wizardKPI: any): asserts wizardKPI is WizardKPI {
  getValidationService().validateWizardKPI(wizardKPI)
}

export function validateBusinessProfile(profile: any): asserts profile is BusinessProfile {
  getValidationService().validateBusinessProfile(profile)
}