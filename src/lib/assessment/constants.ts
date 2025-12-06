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
  longDescription: string
}

// 8 Business Engines Configuration
// Using consistent brand colors: Navy (#172238) as base, Orange (#F5821F) as accent
export const BUSINESS_ENGINES: EngineConfig[] = [
  {
    id: 'attract',
    name: 'Attract Engine',
    shortName: 'Attract',
    subtitle: 'Marketing & Lead Generation',
    maxScore: 40,
    icon: Target,
    colorClasses: {
      bg: 'bg-brand-navy',
      bgLight: 'bg-brand-navy-50',
      text: 'text-brand-navy',
      border: 'border-brand-navy'
    },
    description: 'Marketing & Lead Generation',
    longDescription: 'How effectively you generate awareness and attract qualified leads to your business. This includes your marketing strategy, brand positioning, lead generation systems, and your ability to consistently fill your pipeline with potential customers.'
  },
  {
    id: 'convert',
    name: 'Convert Engine',
    shortName: 'Convert',
    subtitle: 'Sales & Closing',
    maxScore: 40,
    icon: TrendingUp,
    colorClasses: {
      bg: 'bg-brand-navy',
      bgLight: 'bg-brand-navy-50',
      text: 'text-brand-navy',
      border: 'border-brand-navy'
    },
    description: 'Sales & Closing',
    longDescription: 'Your ability to turn leads into paying customers. This covers your sales process, conversion rates, pricing strategy, proposal systems, and the overall effectiveness of moving prospects through your sales funnel to closed deals.'
  },
  {
    id: 'deliver',
    name: 'Deliver Engine',
    shortName: 'Deliver',
    subtitle: 'Client Experience & Results',
    maxScore: 40,
    icon: CheckCircle,
    colorClasses: {
      bg: 'bg-brand-navy',
      bgLight: 'bg-brand-navy-50',
      text: 'text-brand-navy',
      border: 'border-brand-navy'
    },
    description: 'Client Experience & Results',
    longDescription: 'How well you deliver on your promises and create exceptional client experiences. This includes service quality, client communication, results delivery, retention rates, and your ability to generate referrals and repeat business.'
  },
  {
    id: 'people',
    name: 'People Engine',
    shortName: 'People',
    subtitle: 'Team, Culture, Hiring',
    maxScore: 40,
    icon: Users,
    colorClasses: {
      bg: 'bg-brand-navy',
      bgLight: 'bg-brand-navy-50',
      text: 'text-brand-navy',
      border: 'border-brand-navy'
    },
    description: 'Team, Culture, Hiring',
    longDescription: 'The strength of your team and organizational culture. This measures your hiring practices, team development, performance management, employee engagement, and how well your people are aligned with your business vision and values.'
  },
  {
    id: 'systems',
    name: 'Systems Engine',
    shortName: 'Systems',
    subtitle: 'Operations, Process, Tech',
    maxScore: 40,
    icon: Settings,
    colorClasses: {
      bg: 'bg-brand-navy',
      bgLight: 'bg-brand-navy-50',
      text: 'text-brand-navy',
      border: 'border-brand-navy'
    },
    description: 'Operations, Process, Tech',
    longDescription: 'How well-documented and efficient your business operations are. This covers standard operating procedures, technology stack, automation, workflow efficiency, and the overall scalability of your business processes.'
  },
  {
    id: 'finance',
    name: 'Finance Engine',
    shortName: 'Finance',
    subtitle: 'Money, Metrics, Wealth',
    maxScore: 30,
    icon: DollarSign,
    colorClasses: {
      bg: 'bg-brand-navy',
      bgLight: 'bg-brand-navy-50',
      text: 'text-brand-navy',
      border: 'border-brand-navy'
    },
    description: 'Money, Metrics, Wealth',
    longDescription: 'Your financial health and management capabilities. This includes profitability, cash flow management, financial forecasting, pricing optimization, and your understanding of key financial metrics that drive business success.'
  },
  {
    id: 'leadership',
    name: 'Leadership Engine',
    shortName: 'Leadership',
    subtitle: 'Vision, Strategy, You',
    maxScore: 30,
    icon: Award,
    colorClasses: {
      bg: 'bg-brand-navy',
      bgLight: 'bg-brand-navy-50',
      text: 'text-brand-navy',
      border: 'border-brand-navy'
    },
    description: 'Vision, Strategy, You',
    longDescription: 'Your effectiveness as a business leader. This measures strategic thinking, decision-making ability, vision clarity, personal development, and how well you inspire and guide your business toward its long-term goals.'
  },
  {
    id: 'time',
    name: 'Time Engine',
    shortName: 'Time',
    subtitle: 'Freedom, Productivity, Leverage',
    maxScore: 40,
    icon: Clock,
    colorClasses: {
      bg: 'bg-brand-navy',
      bgLight: 'bg-brand-navy-50',
      text: 'text-brand-navy',
      border: 'border-brand-navy'
    },
    description: 'Freedom, Productivity, Leverage',
    longDescription: 'How effectively you manage and leverage your time. This covers personal productivity, delegation, work-life balance, time blocking, and your ability to work ON the business rather than just IN the business.'
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
// Uses green for success (80%+), orange for moderate (60-79%), red for needs attention (<60%)
export function getScoreColorClass(percentage: number): string {
  if (percentage >= 80) return 'text-brand-teal'
  if (percentage >= 60) return 'text-brand-orange'
  return 'text-red-600'
}

// Get background color class for score percentage
export function getScoreBgColorClass(percentage: number): string {
  if (percentage >= 80) return 'bg-brand-teal'
  if (percentage >= 60) return 'bg-brand-orange'
  return 'bg-red-500'
}
