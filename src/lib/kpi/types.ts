// src/lib/kpi/types.ts
// STEP 2: Core KPI Types and Interfaces
// This file defines all the types used throughout the KPI system

import type { LucideIcon } from 'lucide-react'

/**
 * Business Functions - The 7 core areas of business
 */
export enum BusinessFunction {
  ESSENTIAL = 'ESSENTIAL',
  ATTRACT = 'ATTRACT',     // Marketing & Lead Generation
  CONVERT = 'CONVERT',     // Sales & Conversion
  DELIVER = 'DELIVER',     // Operations & Service Delivery
  DELIGHT = 'DELIGHT',     // Customer Success & Retention
  PEOPLE = 'PEOPLE',       // Team & Human Resources
  PROFIT = 'PROFIT',       // Financial Performance
  SYSTEMS = 'SYSTEMS'      // Technology & Operations
}

/**
 * Industries supported by the platform
 */
export enum Industry {
  CONSTRUCTION_TRADES = 'construction-trades',
  HEALTH_WELLNESS = 'health-wellness',
  PROFESSIONAL_SERVICES = 'professional-services',
  RETAIL_ECOMMERCE = 'retail-ecommerce',
  OPERATIONS_LOGISTICS = 'operations-logistics',
  ALL = 'all'
}

/**
 * Business stages based on revenue
 */
export enum BusinessStage {
  FOUNDATION = 'foundation',     // 0-250K
  TRACTION = 'traction',         // 250K-1M
  GROWTH = 'growth',             // 1M-2.5M
  SCALE = 'scale',               // 2.5M-5M
  OPTIMIZATION = 'optimization', // 5M-10M
  LEADERSHIP = 'leadership'      // 10M+
}

/**
 * KPI importance tiers
 */
export enum KPITier {
  ESSENTIAL = 'essential',       // Must-have KPIs for any business
  RECOMMENDED = 'recommended',   // Important KPIs for most businesses
  ADVANCED = 'advanced'          // Specialized KPIs for optimization
}

/**
 * Measurement frequency options
 */
export enum Frequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  ANNUALLY = 'annually'
}

/**
 * Core KPI interface - the main data structure
 */
export interface KPI {
  // Identity
  id: string                    // Unique identifier
  name: string                  // Display name (e.g., "Customer Acquisition Cost")
  plainName: string             // Simple explanation (e.g., "Cost to get one new customer")
  
  // Classification
  function: BusinessFunction    // Which business area this belongs to
  category: string              // Subcategory (e.g., "Marketing Efficiency")
  tier: KPITier                // Importance level
  industries: Industry[]        // Which industries this applies to
  stages: BusinessStage[]       // Which business stages this applies to
  
  // Measurement details
  unit: string                 // What it measures (currency, percentage, number, etc.)
  frequency: string            // How often to measure (daily, weekly, monthly, etc.)
  formula?: string             // How to calculate it (optional)
  
  // Guidance and context
  description: string          // What this KPI measures
  whyItMatters: string        // Why this KPI is important for business
  actionToTake: string        // What to do based on results
  
  // Performance benchmarks
  benchmarks: {
    poor: number | string      // Poor performance threshold
    average: number | string   // Average performance threshold
    good: number | string      // Good performance threshold
    excellent: number | string // Excellent performance threshold
  }
  
  // Metadata
  icon: LucideIcon            // Icon for display
  tags: string[]              // Tags for searching and filtering
  createdAt: string           // When this KPI was created
  updatedAt: string           // When this KPI was last updated
}

/**
 * Business profile for KPI recommendations
 */
export interface BusinessProfile {
  userId?: string
  industry: Industry
  stage: BusinessStage
  weakFunctions?: BusinessFunction[]
  preferredTiers?: KPITier[]
  maxKPIs?: number
  revenue?: number
  employees?: number
  customNiche?: string
}

/**
 * Legacy interfaces for backwards compatibility
 */
export interface WizardKPI {
  id: string
  name: string
  friendlyName: string
  category: string
  unit: string
  frequency: string
  description: string
  whyItMatters: string
  actionToTake: string
  benchmarks: KPI['benchmarks']
  
  // Wizard-specific fields
  currentValue: number
  year1Target: number
  year2Target: number
  year3Target: number
  isStandard: boolean
  isIndustry: boolean
  isCustom: boolean
}

export interface RecommendationKPI {
  id: string
  name: string
  plainName: string
  function: BusinessFunction
  tier: KPITier
  priority: 'high' | 'medium' | 'low'
  reason: string
  whyItMatters: string
  actionToTake: string
}

/**
 * Search and filter interfaces
 */
export interface KPIFilters {
  function?: BusinessFunction
  industry?: Industry
  stage?: BusinessStage
  tier?: KPITier
  searchQuery?: string
  tags?: string[]
}

export interface KPISearchResult {
  kpi: KPI
  relevanceScore: number
  matchedFields: string[]
}

/**
 * Criteria for KPI selection/filtering
 */
export interface KPICriteria {
  function?: BusinessFunction
  functions?: BusinessFunction[]
  industry?: Industry
  stage?: BusinessStage
  tier?: KPITier
  tags?: string[]
}

/**
 * Search filters for KPI queries
 */
export interface SearchFilters {
  function?: BusinessFunction
  functions?: BusinessFunction[]
  industry?: Industry
  industries?: Industry[]
  stage?: BusinessStage
  stages?: BusinessStage[]
  tier?: KPITier
  tiers?: KPITier[]
  tags?: string[]
  searchQuery?: string
}

/**
 * Service interfaces
 */
export interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number
}

export interface ValidationResult {
  isValid: boolean
  errors: string[]
  warnings?: string[]
}

/**
 * Form and UI interfaces
 */
export interface KPIFormData {
  currentValue: number
  year1Target: number
  year2Target: number
  year3Target: number
  notes: string
}

export interface KPIFormErrors {
  currentValue?: string
  year1Target?: string
  year2Target?: string
  year3Target?: string
  notes?: string
}

/**
 * Statistics and analytics interfaces
 */
export interface KPIStats {
  total: number
  essential: number
  recommended: number
  advanced: number
  byFunction: Record<BusinessFunction, number>
  byIndustry: Record<Industry, number>
  byStage: Record<BusinessStage, number>
  byTier: Record<KPITier, number>
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'error'
  totalKPIs: number
  expectedMinimum: number
  functionsComplete: boolean
  hasEssentialKPIs: boolean
  hasRecommendedKPIs: boolean
  hasAdvancedKPIs: boolean
  error?: string
}

/**
 * Type guards for runtime type checking
 */
export const isKPI = (obj: any): obj is KPI => {
  return obj &&
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.plainName === 'string' &&
    Object.values(BusinessFunction).includes(obj.function) &&
    Object.values(KPITier).includes(obj.tier) &&
    Array.isArray(obj.industries) &&
    Array.isArray(obj.stages) &&
    Array.isArray(obj.tags) &&
    obj.benchmarks &&
    typeof obj.benchmarks === 'object'
}

export const isBusinessFunction = (value: string): value is BusinessFunction => {
  return Object.values(BusinessFunction).includes(value as BusinessFunction)
}

export const isIndustry = (value: string): value is Industry => {
  return Object.values(Industry).includes(value as Industry)
}

export const isBusinessStage = (value: string): value is BusinessStage => {
  return Object.values(BusinessStage).includes(value as BusinessStage)
}

export const isKPITier = (value: string): value is KPITier => {
  return Object.values(KPITier).includes(value as KPITier)
}

export const isWizardKPI = (obj: unknown): obj is WizardKPI => {
  return obj !== null &&
    typeof obj === 'object' &&
    typeof (obj as WizardKPI).id === 'string' &&
    typeof (obj as WizardKPI).name === 'string' &&
    typeof (obj as WizardKPI).friendlyName === 'string' &&
    typeof (obj as WizardKPI).currentValue === 'number'
}

export const isBusinessProfile = (obj: unknown): obj is BusinessProfile => {
  return obj !== null &&
    typeof obj === 'object' &&
    typeof (obj as BusinessProfile).industry === 'string' &&
    typeof (obj as BusinessProfile).stage === 'string'
}

/**
 * Utility type for making certain properties optional
 */
export type PartialKPI = Partial<KPI> & Pick<KPI, 'id' | 'name' | 'function'>

/**
 * Type for KPI creation (without computed fields)
 */
export type CreateKPIInput = Omit<KPI, 'createdAt' | 'updatedAt'>

/**
 * Type for KPI updates (all fields optional except id)
 */
export type UpdateKPIInput = Partial<KPI> & Pick<KPI, 'id'>

/**
 * Union types for easier usage
 */
export type KPIUnit = 'currency' | 'percentage' | 'number' | 'ratio' | 'score' | 'rating' | 'days' | 'hours' | 'minutes' | 'months' | 'contacts_per_month'

export type Priority = 'high' | 'medium' | 'low'

export type SystemStatus = 'healthy' | 'degraded' | 'error'

/**
 * Custom error class for cache operations
 */
export class CacheError extends Error {
  constructor(message: string, public details?: Record<string, unknown>) {
    super(message)
    this.name = 'CacheError'
  }
}

/**
 * Custom error class for KPI operations
 */
export class KPIError extends Error {
  constructor(message: string, public code?: string, public details?: Record<string, unknown>) {
    super(message)
    this.name = 'KPIError'
  }
}

/**
 * Custom error class for validation operations
 */
export class ValidationError extends Error {
  public field?: string
  public details?: Record<string, unknown>

  constructor(message: string, fieldOrDetails?: string | Record<string, unknown>, details?: Record<string, unknown>) {
    super(message)
    this.name = 'ValidationError'
    if (typeof fieldOrDetails === 'string') {
      this.field = fieldOrDetails
      this.details = details
    } else if (typeof fieldOrDetails === 'object') {
      this.details = fieldOrDetails
    }
  }
}

/**
 * KPIDefinition - A looser type for defining KPIs in data files
 * Uses strings instead of enums for easier authoring of static data
 */
export interface KPIDefinition {
  id: string
  name: string
  plainName: string
  function: string              // String instead of BusinessFunction enum
  category: string
  tier: string                  // String instead of KPITier enum
  industries: string[]          // Strings instead of Industry enum
  stages: string[]              // Strings instead of BusinessStage enum
  unit: string
  frequency?: string
  formula?: string
  description: string
  whyItMatters?: string
  actionToTake?: string
  benchmarks?: {
    poor: number | string
    average: number | string
    good: number | string
    excellent: number | string
  }
  icon: unknown                 // LucideIcon component
  tags?: string[]
  createdAt?: string
  updatedAt?: string
}