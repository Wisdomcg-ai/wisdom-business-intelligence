// src/lib/kpi/index.ts
// Main entry point for the Phase 2 KPI system

// ==========================================
// CORE EXPORTS
// ==========================================

// Export all type definitions
export * from './types'

// Export data layer (registry and essential KPIs)
export * from './data/registry'

// Export React hooks for KPI functionality
export * from './hooks'

// Export utility functions (formatters and validators)
export * from './utils'

// ==========================================
// FUTURE EXPORTS (commented until ready)
// ==========================================

// Adapters - uncomment when ready
// export * from './adapters'

// Services - uncomment when ready  
// export * from './services'

// ==========================================
// INITIALIZATION FUNCTION
// ==========================================

/**
 * Initialize the KPI system
 * Call this on app startup if needed
 */
export const initializeKPISystem = () => {
  try {
    const { getKPIStats } = require('./data/registry')
    const stats = getKPIStats()
    
    // Defensive check - make sure stats exists
    if (!stats) {
      console.warn('⚠️ KPI Stats returned undefined')
      return { success: false, error: 'Stats undefined' }
    }
    
    console.log('✅ KPI System Ready', {
      totalKPIs: stats.total || 0,
      essential: stats.byTier?.ESSENTIAL || 0,
      byFunction: stats.byFunction ? Object.keys(stats.byFunction).length : 0,
      byIndustry: stats.byIndustry ? Object.keys(stats.byIndustry).length : 0
    })
    
    return { success: true, stats }
  } catch (error) {
    console.error('❌ KPI System initialization failed:', error)
    return { success: false, error }
  }
}