/**
 * WISDOM ROADMAP DATA ADAPTER
 *
 * This file provides backward compatibility for the Goals Wizard.
 * It transforms the new stage-based roadmap data into the format
 * expected by Step3Roadmap.tsx
 */

import { STAGES } from './data/stages'
import { ENGINES } from './data/engines'
import { RoadmapBuild } from './data/types'
import { getCompletionChecks } from './data/completion-checks'

// Legacy interface expected by Goals Wizard
export interface WisdomBuild {
  name: string
  description: string
  whatYoullHave: string
  howToBuild: string[]
  successMetric: string
  resultItProduces: string
  timeInvestment: string
}

interface WisdomEngine {
  id: string
  name: string
  stages: {
    foundation?: WisdomBuild[]
    traction?: WisdomBuild[]
    growth?: WisdomBuild[]
    scale?: WisdomBuild[]
    mastery?: WisdomBuild[]
  }
}

/**
 * Transform a RoadmapBuild to the legacy WisdomBuild format
 */
function transformBuild(build: RoadmapBuild): WisdomBuild {
  const checks = getCompletionChecks(build.name)
  const checkQuestions = checks?.map(c => c.question) || []

  return {
    name: build.name,
    description: build.outcome,
    whatYoullHave: build.outcome,
    howToBuild: build.toDo.slice(0, 5), // First 5 steps
    successMetric: checkQuestions[0] || build.toDo[0] || '',
    resultItProduces: build.outcome,
    timeInvestment: estimateTimeInvestment(build.toDo.length)
  }
}

/**
 * Estimate time investment based on number of tasks
 */
function estimateTimeInvestment(taskCount: number): string {
  if (taskCount <= 5) return '1-2 weeks'
  if (taskCount <= 8) return '2-4 weeks'
  return '4-8 weeks'
}

/**
 * Build the WISDOM_ROADMAP_DATA structure from new data
 */
function buildWisdomRoadmapData(): WisdomEngine[] {
  const engines: WisdomEngine[] = ENGINES.map(engine => ({
    id: engine.id,
    name: engine.name,
    stages: {}
  }))

  // Group builds by engine and stage
  STAGES.forEach(stage => {
    stage.builds.forEach(build => {
      const engine = engines.find((e: WisdomEngine) => e.id === build.engine)
      if (engine) {
        const stageKey = stage.id as keyof WisdomEngine['stages']
        if (!engine.stages[stageKey]) {
          engine.stages[stageKey] = []
        }
        engine.stages[stageKey]!.push(transformBuild(build))
      }
    })
  })

  return engines
}

// Export the transformed data for Goals Wizard compatibility
export const WISDOM_ROADMAP_DATA: WisdomEngine[] = buildWisdomRoadmapData()

// Also export stage definitions for the Goals Wizard
export const WISDOM_STAGES = [
  { key: 'foundation', label: 'Foundation', range: '$0-500K', color: 'blue' },
  { key: 'traction', label: 'Traction', range: '$500K-1M', color: 'green' },
  { key: 'growth', label: 'Growth', range: '$1M-5M', color: 'purple' },
  { key: 'scale', label: 'Scale', range: '$5M-10M', color: 'orange' },
  { key: 'mastery', label: 'Mastery', range: '$10M+', color: 'gold' }
] as const

/**
 * Get the business stage based on annual revenue
 */
export function getBusinessStage(revenue: number): string {
  if (revenue < 500000) return 'foundation'
  if (revenue < 1000000) return 'traction'
  if (revenue < 5000000) return 'growth'
  if (revenue < 10000000) return 'scale'
  return 'mastery'
}
