/**
 * Type definitions for The Wisdom Roadmap
 */

export interface RoadmapBuild {
  name: string
  outcome: string
  toDo: string[]
  engine: string
  industryVariants?: {
    // Professional Services
    bookkeeping?: string[]
    accounting?: string[]
    recruitment?: string[]
    hrConsulting?: string[]
    engineering?: string[]
    financialAdvisory?: string[]

    // Building & Trades
    construction?: string[]
    trades?: string[]

    // Health & Fitness
    alliedHealth?: string[]
    gyms?: string[]

    // E-commerce
    ecommerce?: string[]
  }
}

export interface EngineData {
  id: string
  name: string
  subtitle: string
  description: string
  icon: string
  color: string
  bgColor: string
}

export interface StageData {
  id: string
  name: string
  range: string
  description: string
  focus: string
  builds: RoadmapBuild[]
  successCriteria: string[]
}
