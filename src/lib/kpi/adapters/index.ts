// src/lib/kpi/adapters/index.ts
// Simple adapters for backwards compatibility

import { getAllKPIs, getKPIsByFunction } from '../data/registry'
import { BusinessFunction, Industry, BusinessStage } from '../types'

// Simple adapter implementations
export const KPIAdapter = {}
export const GoalsWizardAdapter = {}
export const AssessmentResultsAdapter = {}
export const LegacyConstantsAdapter = {}

export const getIndustryKPIs = () => {
  const allKPIs = getAllKPIs()
  return {
    'all': allKPIs.map(kpi => ({
      id: kpi.id,
      name: kpi.name,
      friendlyName: kpi.plainName,
      category: kpi.category,
      unit: kpi.unit,
      description: kpi.description,
      whyItMatters: kpi.whyItMatters,
      actionToTake: kpi.actionToTake,
      benchmarks: kpi.benchmarks,
      currentValue: 0,
      year1Target: 0,
      year2Target: 0,
      year3Target: 0,
      isStandard: true,
      isIndustry: false,
      isCustom: false
    }))
  }
}

export const getKPIsForProfile = (industry: string, stage: string, maxCount?: number) => {
  const allKPIs = getAllKPIs()
  return allKPIs.slice(0, maxCount || 10).map(kpi => ({
    id: kpi.id,
    name: kpi.name,
    friendlyName: kpi.plainName,
    category: kpi.category,
    unit: kpi.unit,
    description: kpi.description,
    whyItMatters: kpi.whyItMatters,
    actionToTake: kpi.actionToTake,
    benchmarks: kpi.benchmarks,
    currentValue: 0,
    year1Target: 0,
    year2Target: 0,
    year3Target: 0,
    isStandard: true,
    isIndustry: true,
    isCustom: false
  }))
}

export const searchWizardKPIs = (query: string) => []

export const getAssessmentRecommendations = (weakFunctions: any[], industry: string, stage: string) => {
  const allKPIs = getAllKPIs()
  return allKPIs.slice(0, 5).map(kpi => ({
    id: kpi.id,
    name: kpi.name,
    plainName: kpi.plainName,
    function: kpi.function,
    tier: kpi.tier,
    priority: 'medium' as const,
    reason: 'Recommended for your business',
    whyItMatters: kpi.whyItMatters,
    actionToTake: kpi.actionToTake
  }))
}

export const getFunctionRecommendations = (func: BusinessFunction, industry: string, stage: string, maxCount?: number) => []

export const mapLegacyIndustry = (legacyIndustry: string) => Industry.ALL
export const mapLegacyStage = (legacyStage: string) => BusinessStage.GROWTH

export type LegacyKPI = any
export type LegacyIndustryKPIs = any
export type LegacyRecommendationKPI = any