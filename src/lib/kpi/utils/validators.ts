// src/lib/kpi/utils/validators.ts
// Production-ready validation utilities for KPI data

import type { KPI } from '../types'

/**
 * Validation result interface
 */
export interface ValidationResult {
  isValid: boolean
  errors: string[]
  warnings?: string[]
}

/**
 * Validate a KPI value
 * @param value - The value to validate
 * @param unit - The unit type
 * @param allowNull - Whether null values are allowed
 * @returns Validation result
 */
export function validateKPIValue(
  value: number | null | undefined,
  unit: string,
  allowNull: boolean = false
): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Check for null/undefined
  if (value === null || value === undefined) {
    if (!allowNull) {
      errors.push('Value is required')
    }
    return { isValid: errors.length === 0, errors, warnings }
  }

  // Check if it's a valid number
  if (isNaN(value)) {
    errors.push('Value must be a valid number')
    return { isValid: false, errors, warnings }
  }

  // Unit-specific validation
  switch (unit) {
    case 'percentage':
      if (value < 0 || value > 100) {
        errors.push('Percentage must be between 0 and 100')
      }
      break

    case 'currency':
      if (value < 0) {
        warnings.push('Negative currency values may indicate losses')
      }
      break

    case 'days':
      if (value < 0) {
        errors.push('Days cannot be negative')
      }
      if (!Number.isInteger(value)) {
        warnings.push('Days value has decimal places')
      }
      break

    case 'number':
      if (value < 0) {
        warnings.push('Negative values detected')
      }
      break
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings: warnings.length > 0 ? warnings : undefined
  }
}

/**
 * Validate a complete KPI object
 * @param kpi - The KPI to validate
 * @returns Validation result
 */
export function validateKPI(kpi: Partial<KPI>): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Required fields
  if (!kpi.id) errors.push('KPI ID is required')
  if (!kpi.name) errors.push('KPI name is required')
  if (!kpi.businessFunction) errors.push('Business function is required')
  if (!kpi.tier) errors.push('KPI tier is required')

  // Field format validation
  if (kpi.id && !/^[a-z0-9-]+$/.test(kpi.id)) {
    errors.push('KPI ID must be lowercase alphanumeric with hyphens only')
  }

  if (kpi.name && kpi.name.length < 3) {
    errors.push('KPI name must be at least 3 characters')
  }

  if (kpi.description && kpi.description.length < 10) {
    warnings.push('KPI description is very short')
  }

  // Arrays validation
  if (kpi.applicableIndustries && kpi.applicableIndustries.length === 0) {
    errors.push('At least one industry must be specified')
  }

  if (kpi.applicableStages && kpi.applicableStages.length === 0) {
    errors.push('At least one business stage must be specified')
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings: warnings.length > 0 ? warnings : undefined
  }
}

/**
 * Validate a KPI target/benchmark value
 * @param current - Current value
 * @param target - Target value
 * @param unit - Unit type
 * @returns Validation result
 */
export function validateKPITarget(
  current: number,
  target: number,
  unit: string
): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Both values must be valid
  const currentValidation = validateKPIValue(current, unit, false)
  const targetValidation = validateKPIValue(target, unit, false)

  if (!currentValidation.isValid) {
    errors.push('Current value is invalid')
  }
  if (!targetValidation.isValid) {
    errors.push('Target value is invalid')
  }

  if (errors.length > 0) {
    return { isValid: false, errors, warnings }
  }

  // Target should typically be higher than current (for most KPIs)
  const percentChange = ((target - current) / current) * 100

  if (Math.abs(percentChange) < 1) {
    warnings.push('Target is very close to current value (less than 1% change)')
  }

  if (percentChange > 300) {
    warnings.push('Target is more than 300% higher than current value - very ambitious!')
  }

  if (percentChange < -50) {
    warnings.push('Target is significantly lower than current value')
  }

  return {
    isValid: true,
    errors,
    warnings: warnings.length > 0 ? warnings : undefined
  }
}

/**
 * Check if a value is within acceptable range based on benchmarks
 * @param value - The value to check
 * @param benchmarks - Benchmark values
 * @returns Performance level
 */
export function getPerformanceLevel(
  value: number,
  benchmarks: {
    poor?: number
    average?: number
    good?: number
    excellent?: number
  }
): 'poor' | 'average' | 'good' | 'excellent' | 'unknown' {
  if (!benchmarks.poor && !benchmarks.average && !benchmarks.good && !benchmarks.excellent) {
    return 'unknown'
  }

  if (benchmarks.excellent && value >= benchmarks.excellent) return 'excellent'
  if (benchmarks.good && value >= benchmarks.good) return 'good'
  if (benchmarks.average && value >= benchmarks.average) return 'average'
  
  return 'poor'
}