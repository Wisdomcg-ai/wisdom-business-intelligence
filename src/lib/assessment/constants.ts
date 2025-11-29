/**
 * Assessment Engine Constants
 * Centralized configuration for the 8 Business Engines assessment
 */

import { Target, TrendingUp, CheckCircle, Users, Settings, DollarSign, Award, Clock } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface EngineConfig {
  id: string
  name: string
  shortName: string
  subtitle: string
  maxScore: number
  icon: LucideIcon
  colorClasses: {
    bg: string
    bgLight: string
    text: string
    border: string
  }
  description: string
}

// 8 Business Engines Configuration
export const BUSINESS_ENGINES: EngineConfig[] = [
  {
    id: 'attract',
    name: 'Attract Engine',
    shortName: 'Attract',
    subtitle: 'Marketing & Lead Generation',
    maxScore: 40,
    icon: Target,
    colorClasses: {
      bg: 'bg-blue-600',
      bgLight: 'bg-blue-100',
      text: 'text-blue-600',
      border: 'border-blue-500'
    },
    description: 'Marketing & Lead Generation'
  },
  {
    id: 'convert',
    name: 'Convert Engine',
    shortName: 'Convert',
    subtitle: 'Sales & Closing',
    maxScore: 40,
    icon: TrendingUp,
    colorClasses: {
      bg: 'bg-green-600',
      bgLight: 'bg-green-100',
      text: 'text-green-600',
      border: 'border-green-500'
    },
    description: 'Sales & Closing'
  },
  {
    id: 'deliver',
    name: 'Deliver Engine',
    shortName: 'Deliver',
    subtitle: 'Client Experience & Results',
    maxScore: 40,
    icon: CheckCircle,
    colorClasses: {
      bg: 'bg-purple-600',
      bgLight: 'bg-purple-100',
      text: 'text-purple-600',
      border: 'border-purple-500'
    },
    description: 'Client Experience & Results'
  },
  {
    id: 'people',
    name: 'People Engine',
    shortName: 'People',
    subtitle: 'Team, Culture, Hiring',
    maxScore: 40,
    icon: Users,
    colorClasses: {
      bg: 'bg-indigo-600',
      bgLight: 'bg-indigo-100',
      text: 'text-indigo-600',
      border: 'border-indigo-500'
    },
    description: 'Team, Culture, Hiring'
  },
  {
    id: 'systems',
    name: 'Systems Engine',
    shortName: 'Systems',
    subtitle: 'Operations, Process, Tech',
    maxScore: 40,
    icon: Settings,
    colorClasses: {
      bg: 'bg-slate-600',
      bgLight: 'bg-slate-100',
      text: 'text-slate-600',
      border: 'border-slate-500'
    },
    description: 'Operations, Process, Tech'
  },
  {
    id: 'finance',
    name: 'Finance Engine',
    shortName: 'Finance',
    subtitle: 'Money, Metrics, Wealth',
    maxScore: 30,
    icon: DollarSign,
    colorClasses: {
      bg: 'bg-emerald-600',
      bgLight: 'bg-emerald-100',
      text: 'text-emerald-600',
      border: 'border-emerald-500'
    },
    description: 'Money, Metrics, Wealth'
  },
  {
    id: 'leadership',
    name: 'Leadership Engine',
    shortName: 'Leadership',
    subtitle: 'Vision, Strategy, You',
    maxScore: 30,
    icon: Award,
    colorClasses: {
      bg: 'bg-amber-600',
      bgLight: 'bg-amber-100',
      text: 'text-amber-600',
      border: 'border-amber-500'
    },
    description: 'Vision, Strategy, You'
  },
  {
    id: 'time',
    name: 'Time Engine',
    shortName: 'Time',
    subtitle: 'Freedom, Productivity, Leverage',
    maxScore: 40,
    icon: Clock,
    colorClasses: {
      bg: 'bg-cyan-600',
      bgLight: 'bg-cyan-100',
      text: 'text-cyan-600',
      border: 'border-cyan-500'
    },
    description: 'Freedom, Productivity, Leverage'
  }
]

// Total assessment score
export const TOTAL_MAX_SCORE = BUSINESS_ENGINES.reduce((sum, engine) => sum + engine.maxScore, 0)

// Assessment score thresholds
export const SCORE_THRESHOLDS = {
  THRIVING: 80,
  STRONG: 70,
  STABLE: 60,
  BUILDING: 50,
  STRUGGLING: 0
} as const

// Get engine config by ID
export function getEngineConfig(engineId: string): EngineConfig | undefined {
  return BUSINESS_ENGINES.find(engine => engine.id === engineId)
}

// Get engine config by name
export function getEngineConfigByName(engineName: string): EngineConfig | undefined {
  return BUSINESS_ENGINES.find(engine =>
    engine.name === engineName ||
    engine.shortName === engineName
  )
}

// Map section name to engine ID
export function mapSectionToEngineId(sectionName: string): string {
  const mapping: Record<string, string> = {
    'Attract Engine': 'attract',
    'Convert Engine': 'convert',
    'Deliver Engine': 'deliver',
    'People Engine': 'people',
    'Systems Engine': 'systems',
    'Finance Engine': 'finance',
    'Leadership Engine': 'leadership',
    'Time Engine': 'time'
  }
  return mapping[sectionName] || ''
}

// Get health status from percentage
export function getHealthStatus(percentage: number): string {
  if (percentage >= SCORE_THRESHOLDS.THRIVING) return 'THRIVING'
  if (percentage >= SCORE_THRESHOLDS.STRONG) return 'STRONG'
  if (percentage >= SCORE_THRESHOLDS.STABLE) return 'STABLE'
  if (percentage >= SCORE_THRESHOLDS.BUILDING) return 'BUILDING'
  return 'STRUGGLING'
}

// Get color class for score percentage
export function getScoreColorClass(percentage: number): string {
  if (percentage >= 80) return 'text-green-600'
  if (percentage >= 60) return 'text-yellow-600'
  return 'text-red-600'
}

// Get background color class for score percentage
export function getScoreBgColorClass(percentage: number): string {
  if (percentage >= 80) return 'bg-green-500'
  if (percentage >= 60) return 'bg-yellow-500'
  return 'bg-red-500'
}
