// src/lib/kpi/hooks/index.ts
// Simple hooks for KPI system
import { useState, useEffect } from 'react'
import { getAllKPIs, getKPIStats } from '../data/registry'

export const useKPIs = () => {
  const [kpis, setKpis] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    try {
      setKpis(getAllKPIs() as any)
      setLoading(false)
    } catch (err) {
      setError(err as any)
      setLoading(false)
    }
  }, [])

  return { kpis, loading, error }
}

// Simple placeholder hooks
export const useKPI = (id: string) => ({ kpi: null, loading: false, error: null })
export const useKPIsByIds = (ids: string[]) => ({ kpis: [], loading: false, error: null })
export const useFilteredKPIs = (filters: any) => ({ kpis: [], loading: false, error: null })
export const useBusinessKPIs = (profile: any) => ({ kpis: [], loading: false, error: null })

export const useKPISearch = () => ({
  search: () => {},
  results: [],
  loading: false,
  error: null,
  query: '',
  clearSearch: () => {}
})

export const useGoalsWizardKPIs = () => ({
  kpis: [],
  industryKPIs: {},
  loading: false,
  error: null,
  searchKPIs: () => []
})

export const useAssessmentRecommendations = () => ({
  recommendations: [],
  loading: false,
  error: null
})

export const useKPIStats = () => {
  const stats = getKPIStats()
  return stats
}

export const useSelectedKPIs = () => ({
  selectedKPIs: [],
  addKPI: () => {},
  removeKPI: () => {},
  toggleKPI: () => {},
  clearAll: () => {},
  isSelected: () => false,
  count: 0
})

export const useKPIForm = (id: string) => ({
  kpi: null,
  formData: {},
  errors: {},
  loading: false,
  error: null,
  updateField: () => {},
  validate: () => true,
  isValid: true
})