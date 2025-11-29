import { StageData } from '../types'
import { FOUNDATION_BUILDS } from './foundation'
import { TRACTION_BUILDS } from './traction'
import { GROWTH_BUILDS } from './growth'
import { SCALE_BUILDS } from './scale'
import { MASTERY_BUILDS } from './mastery'

/**
 * THE WISDOM ROADMAP - 5 Stages
 * Assembled from individual stage files
 */

export const STAGES: StageData[] = [
  {
    id: 'foundation',
    name: 'Foundation',
    range: '$0-$500K',
    description: 'Finding product-market fit and proving the model works',
    focus: 'Get your first clients, validate your offer, establish basic systems',
    builds: FOUNDATION_BUILDS,
    successCriteria: [
      '$500K annual revenue',
      'Positive cash flow',
      '5-10 happy clients',
      'Clear offer and niche',
      'Basic systems in place'
    ]
  },
  {
    id: 'traction',
    name: 'Traction',
    range: '$500K-$1M',
    description: 'Proven model, now building infrastructure for growth',
    focus: 'Systemize delivery, build team, create consistent lead flow',
    builds: TRACTION_BUILDS,
    successCriteria: [
      '$1M annual revenue',
      '10-15% net profit margin',
      'Owner taking market salary',
      'First team member hired',
      'Documented processes'
    ]
  },
  {
    id: 'growth',
    name: 'Growth',
    range: '$1M-$5M',
    description: 'Building the team, systems, and processes to scale',
    focus: 'Hire key roles, install scalable systems, build marketing and sales engines',
    builds: GROWTH_BUILDS,
    successCriteria: [
      '$5M annual revenue',
      '15-20% net profit margin',
      '5-10 person team',
      'Sales team launched',
      'Predictable lead flow'
    ]
  },
  {
    id: 'scale',
    name: 'Scale',
    range: '$5M-$10M',
    description: 'Building leadership team and preparing for exit or next level',
    focus: 'Hire executive team, build brand authority, create systems to run without you',
    builds: SCALE_BUILDS,
    successCriteria: [
      '$10M annual revenue',
      '20%+ net profit margin',
      'Leadership team in place',
      'Business runs without owner',
      'Exit-ready systems'
    ]
  },
  {
    id: 'mastery',
    name: 'Mastery',
    range: '$10M+',
    description: 'Exit-ready business running without you, ultimate freedom achieved',
    focus: 'Transition to board chair, build generational wealth, design your legacy',
    builds: MASTERY_BUILDS,
    successCriteria: [
      '$10M+ annual revenue',
      'Maximum profitability',
      'Board chair role',
      'Generational wealth built',
      'Ultimate time freedom'
    ]
  }
]

// Export individual stage arrays for direct access if needed
export { FOUNDATION_BUILDS, TRACTION_BUILDS, GROWTH_BUILDS, SCALE_BUILDS, MASTERY_BUILDS }
