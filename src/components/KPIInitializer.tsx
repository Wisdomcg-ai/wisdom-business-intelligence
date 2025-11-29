// src/components/KPIInitializer.tsx
'use client'

import { useEffect } from 'react'
import { initializeKPISystem } from '@/lib/kpi'

export function KPIInitializer() {
  useEffect(() => {
    const initializeKPI = async () => {
      try {
        console.log('🚀 Starting KPI System initialization...')
        await initializeKPISystem()
        console.log('✅ KPI System ready')
      } catch (error) {
        console.error('❌ KPI System initialization failed:', error)
        // Don't throw - let the app continue working
      }
    }
    
    initializeKPI()
  }, [])

  // This component doesn't render anything visible
  return null
}