// src/lib/kpi/constants.ts

import { BusinessFunction, Industry, BusinessStage, KPITier } from './types'
import { 
  DollarSign, 
  Users, 
  Target, 
  TrendingUp, 
  Clock, 
  Heart,
  Package,
  ShoppingCart,
  Megaphone,
  Settings,
  PieChart
} from 'lucide-react'

/**
 * Business Function Metadata
 * 
 * Provides display information and icons for each business function.
 * Used throughout the UI for consistent presentation.
 */
export const BUSINESS_FUNCTION_METADATA = {
  [BusinessFunction.ATTRACT]: {
    id: BusinessFunction.ATTRACT,
    name: 'Attract',
    shortName: 'Attract',
    description: 'Marketing & Lead Generation',
    longDescription: 'Generate awareness and attract potential customers to your business',
    icon: Megaphone,
    color: 'purple',
    colorCode: '#8B5CF6',
    order: 1
  },
  [BusinessFunction.CONVERT]: {
    id: BusinessFunction.CONVERT,
    name: 'Convert',
    shortName: 'Convert', 
    description: 'Sales & Conversion',
    longDescription: 'Turn leads into paying customers through effective sales processes',
    icon: ShoppingCart,
    color: 'blue',
    colorCode: '#3B82F6',
    order: 2
  },
  [BusinessFunction.DELIVER]: {
    id: BusinessFunction.DELIVER,
    name: 'Deliver',
    shortName: 'Deliver',
    description: 'Operations & Delivery', 
    longDescription: 'Efficiently deliver products or services that meet customer expectations',
    icon: Package,
    color: 'green',
    colorCode: '#10B981',
    order: 3
  },
  [BusinessFunction.DELIGHT]: {
    id: BusinessFunction.DELIGHT,
    name: 'Delight',
    shortName: 'Delight',
    description: 'Customer Service & Retention',
    longDescription: 'Create exceptional experiences that build loyalty and drive referrals', 
    icon: Heart,
    color: 'red',
    colorCode: '#EF4444',
    order: 4
  },
  [BusinessFunction.PEOPLE]: {
    id: BusinessFunction.PEOPLE,
    name: 'People',
    shortName: 'People',
    description: 'Team & Culture',
    longDescription: 'Build and develop a high-performing team with strong culture',
    icon: Users,
    color: 'orange', 
    colorCode: '#F97316',
    order: 5
  },
  [BusinessFunction.PROFIT]: {
    id: BusinessFunction.PROFIT,
    name: 'Profit',
    shortName: 'Profit',
    description: 'Financial Management',
    longDescription: 'Optimize profitability and maintain healthy financial operations',
    icon: DollarSign,
    color: 'emerald',
    colorCode: '#059669',
    order: 6
  },
  [BusinessFunction.SYSTEMS]: {
    id: BusinessFunction.SYSTEMS,
    name: 'Systems',
    shortName: 'Systems', 
    description: 'Efficiency & Productivity',
    longDescription: 'Create systems and processes that scale and improve efficiency',
    icon: Settings,
    color: 'gray',
    colorCode: '#6B7280',
    order: 7
  }
} as const

/**
 * Industry Metadata
 * 
 * Display information for supported industries.
 */
export const INDUSTRY_METADATA = {
  [Industry.CONSTRUCTION_TRADES]: {
    id: Industry.CONSTRUCTION_TRADES,
    name: 'Construction & Trades',
    shortName: 'Construction',
    description: 'Building, construction, trades, and related services',
    keywords: ['construction', 'building', 'trade', 'contractor', 'electrical', 'plumbing', 'hvac'],
    icon: Settings,
    color: 'orange'
  },
  [Industry.HEALTH_WELLNESS]: {
    id: Industry.HEALTH_WELLNESS,
    name: 'Health & Wellness',
    shortName: 'Health',
    description: 'Healthcare, fitness, wellness, and related services',
    keywords: ['health', 'wellness', 'fitness', 'medical', 'therapy', 'clinic', 'gym'],
    icon: Heart,
    color: 'red'
  },
  [Industry.PROFESSIONAL_SERVICES]: {
    id: Industry.PROFESSIONAL_SERVICES,
    name: 'Professional Services',
    shortName: 'Professional',
    description: 'Consulting, legal, accounting, coaching, and professional services',
    keywords: ['consulting', 'legal', 'accounting', 'professional', 'coach', 'advisor'],
    icon: Users,
    color: 'blue'
  },
  [Industry.RETAIL_ECOMMERCE]: {
    id: Industry.RETAIL_ECOMMERCE,
    name: 'Retail & E-commerce',
    shortName: 'Retail',
    description: 'Physical and online retail, e-commerce, and product sales',
    keywords: ['retail', 'ecommerce', 'store', 'shop', 'product', 'online'],
    icon: ShoppingCart,
    color: 'green'
  },
  [Industry.OPERATIONS_LOGISTICS]: {
    id: Industry.OPERATIONS_LOGISTICS,
    name: 'Operations & Logistics', 
    shortName: 'Operations',
    description: 'Transportation, logistics, warehousing, and operational services',
    keywords: ['logistics', 'transport', 'freight', 'warehouse', 'delivery', 'operations'],
    icon: Package,
    color: 'purple'
  },
  [Industry.ALL]: {
    id: Industry.ALL,
    name: 'All Industries',
    shortName: 'Universal',
    description: 'Universal KPIs applicable to all business types',
    keywords: ['universal', 'general', 'all', 'common'],
    icon: Target,
    color: 'gray'
  }
} as const

/**
 * Business Stage Metadata
 * 
 * Revenue ranges and characteristics for each business stage.
 */
export const BUSINESS_STAGE_METADATA = {
  [BusinessStage.FOUNDATION]: {
    id: BusinessStage.FOUNDATION,
    name: 'Foundation',
    shortName: 'Foundation',
    description: 'Building the foundation (0-250K revenue)',
    revenueRange: '0-250K',
    minRevenue: 0,
    maxRevenue: 250000,
    characteristics: ['Establishing processes', 'Building initial team', 'Proving concept'],
    focus: ['Cash flow', 'Customer acquisition', 'Product-market fit'],
    icon: Target,
    color: 'slate',
    order: 1
  },
  [BusinessStage.TRACTION]: {
    id: BusinessStage.TRACTION,
    name: 'Traction',
    shortName: 'Traction',
    description: 'Gaining traction (250K-1M revenue)',
    revenueRange: '250K-1M',
    minRevenue: 250000,
    maxRevenue: 1000000,
    characteristics: ['Proven demand', 'Growing team', 'Scaling operations'],
    focus: ['Growth', 'Efficiency', 'Team building'],
    icon: TrendingUp,
    color: 'blue',
    order: 2
  },
  [BusinessStage.GROWTH]: {
    id: BusinessStage.GROWTH,
    name: 'Growth',
    shortName: 'Growth',
    description: 'Rapid growth phase (1M-2.5M revenue)',
    revenueRange: '1M-2.5M',
    minRevenue: 1000000,
    maxRevenue: 2500000,
    characteristics: ['Rapid expansion', 'Systems development', 'Market leadership'],
    focus: ['Scalability', 'Systems', 'Management'],
    icon: TrendingUp,
    color: 'green',
    order: 3
  },
  [BusinessStage.SCALE]: {
    id: BusinessStage.SCALE,
    name: 'Scale',
    shortName: 'Scale',
    description: 'Scaling operations (2.5M-5M revenue)',
    revenueRange: '2.5M-5M',
    minRevenue: 2500000,
    maxRevenue: 5000000,
    characteristics: ['Mature operations', 'Advanced systems', 'Market expansion'],
    focus: ['Optimization', 'Innovation', 'Expansion'],
    icon: Settings,
    color: 'purple',
    order: 4
  },
  [BusinessStage.OPTIMIZATION]: {
    id: BusinessStage.OPTIMIZATION,
    name: 'Optimization',
    shortName: 'Optimization',
    description: 'Optimizing performance (5M-10M revenue)',
    revenueRange: '5M-10M',
    minRevenue: 5000000,
    maxRevenue: 10000000,
    characteristics: ['Peak efficiency', 'Strategic positioning', 'Advanced metrics'],
    focus: ['Margins', 'Innovation', 'Strategic planning'],
    icon: PieChart,
    color: 'orange',
    order: 5
  },
  [BusinessStage.LEADERSHIP]: {
    id: BusinessStage.LEADERSHIP,
    name: 'Leadership',
    shortName: 'Leadership', 
    description: 'Market leadership (10M+ revenue)',
    revenueRange: '10M+',
    minRevenue: 10000000,
    maxRevenue: Infinity,
    characteristics: ['Market leadership', 'Industry influence', 'Advanced capabilities'],
    focus: ['Innovation', 'Market expansion', 'Strategic partnerships'],
    icon: Target,
    color: 'yellow',
    order: 6
  }
} as const

/**
 * KPI Tier Metadata
 */
export const KPI_TIER_METADATA = {
  [KPITier.ESSENTIAL]: {
    id: KPITier.ESSENTIAL,
    name: 'Essential',
    shortName: 'Essential',
    description: 'Critical KPIs every business must track',
    priority: 1,
    color: 'red',
    badge: '🔴'
  },
  [KPITier.RECOMMENDED]: {
    id: KPITier.RECOMMENDED,
    name: 'Recommended',
    shortName: 'Recommended', 
    description: 'Important KPIs for most businesses',
    priority: 2,
    color: 'orange',
    badge: '🟡'
  },
  [KPITier.ADVANCED]: {
    id: KPITier.ADVANCED,
    name: 'Advanced',
    shortName: 'Advanced',
    description: 'Advanced KPIs for sophisticated operations',
    priority: 3,
    color: 'blue',
    badge: '🔵'
  }
} as const

/**
 * Cache Configuration
 */
export const CACHE_CONFIG = {
  DEFAULT_TTL: 1000 * 60 * 30,        // 30 minutes
  LONG_TTL: 1000 * 60 * 60 * 4,       // 4 hours
  SHORT_TTL: 1000 * 60 * 5,           // 5 minutes
  MAX_CACHE_SIZE: 1000,                // Maximum cache entries
  CLEANUP_INTERVAL: 1000 * 60 * 10     // Cleanup every 10 minutes
} as const

/**
 * Performance Thresholds
 */
export const PERFORMANCE_THRESHOLDS = {
  MAX_LOAD_TIME: 200,                  // Max KPI load time in ms
  MAX_SEARCH_TIME: 100,                // Max search time in ms
  MAX_CACHE_SIZE_MB: 50,              // Max cache size in MB
  WARNING_THRESHOLD: 150,              // Performance warning threshold
  BATCH_SIZE: 50                       // Batch processing size
} as const

/**
 * Validation Rules
 */
export const VALIDATION_RULES = {
  MAX_KPI_NAME_LENGTH: 100,
  MAX_DESCRIPTION_LENGTH: 500,
  MAX_TAGS: 10,
  MIN_BENCHMARK_VALUE: -999999999,
  MAX_BENCHMARK_VALUE: 999999999,
  REQUIRED_FIELDS: ['id', 'name', 'plainName', 'function', 'category', 'tier'],
  VALID_ID_PATTERN: /^[a-z0-9-]+$/,    // Only lowercase, numbers, hyphens
  VALID_UNITS: [
    'currency', 'percentage', 'number', 'days', 'hours', 'minutes',
    'count', 'ratio', 'score', 'rating', 'index'
  ]
} as const

/**
 * Default Values
 */
export const DEFAULTS = {
  KPI_FREQUENCY: 'monthly',
  CACHE_TTL: CACHE_CONFIG.DEFAULT_TTL,
  BENCHMARK_POOR: 0,
  BENCHMARK_AVERAGE: 50,
  BENCHMARK_GOOD: 75,
  BENCHMARK_EXCELLENT: 100,
  WIZARD_CURRENT_VALUE: 0,
  TARGET_GROWTH_RATE: 1.2,             // 20% annual growth
  INDUSTRY_FALLBACK: Industry.ALL
} as const

/**
 * API Endpoints (for future API integration)
 */
export const API_ENDPOINTS = {
  KPIS: '/api/kpis',
  KPI_BY_ID: '/api/kpis/:id',
  SEARCH: '/api/kpis/search',
  RECOMMENDATIONS: '/api/kpis/recommendations',
  VALUES: '/api/kpis/values',
  BENCHMARKS: '/api/kpis/benchmarks'
} as const

/**
 * Local Storage Keys
 */
export const STORAGE_KEYS = {
  KPI_CACHE: 'kpi_cache',
  USER_PREFERENCES: 'kpi_user_prefs',
  WIZARD_STATE: 'kpi_wizard_state',
  LAST_SYNC: 'kpi_last_sync'
} as const

/**
 * Error Messages
 */
export const ERROR_MESSAGES = {
  KPI_NOT_FOUND: 'KPI not found',
  INVALID_KPI_DATA: 'Invalid KPI data provided',
  CACHE_ERROR: 'Cache operation failed', 
  VALIDATION_ERROR: 'Validation failed',
  NETWORK_ERROR: 'Network request failed',
  INITIALIZATION_ERROR: 'Failed to initialize KPI system',
  DUPLICATE_KPI: 'KPI with this ID already exists'
} as const

/**
 * Success Messages
 */
export const SUCCESS_MESSAGES = {
  KPI_LOADED: 'KPIs loaded successfully',
  KPI_SAVED: 'KPI saved successfully',
  KPI_DELETED: 'KPI deleted successfully',
  CACHE_CLEARED: 'Cache cleared successfully',
  INITIALIZATION_COMPLETE: 'KPI system initialized successfully'
} as const

/**
 * Feature Flags (for progressive rollout)
 */
export const FEATURE_FLAGS = {
  ENABLE_CACHING: true,
  ENABLE_VALIDATION: true,
  ENABLE_PERFORMANCE_MONITORING: true,
  ENABLE_LAZY_LOADING: true,
  ENABLE_BATCH_OPERATIONS: true,
  ENABLE_AUTO_SAVE: true
} as const

/**
 * Helper function to get metadata by key
 */
export function getBusinessFunctionMetadata(func: BusinessFunction) {
  return BUSINESS_FUNCTION_METADATA[func as keyof typeof BUSINESS_FUNCTION_METADATA] || null
}

export function getIndustryMetadata(industry: Industry) {
  return INDUSTRY_METADATA[industry]
}

export function getBusinessStageMetadata(stage: BusinessStage) {
  return BUSINESS_STAGE_METADATA[stage]
}

export function getKPITierMetadata(tier: KPITier) {
  return KPI_TIER_METADATA[tier]
}

/**
 * Validation helpers
 */
export function isValidKPIId(id: string): boolean {
  return VALIDATION_RULES.VALID_ID_PATTERN.test(id)
}

export function isValidUnit(unit: string): boolean {
  return (VALIDATION_RULES.VALID_UNITS as readonly string[]).includes(unit)
}