/**
 * THE WISDOM ROADMAP - Main Data Export
 * Centralized export for all roadmap data
 */

export * from './types'
export * from './engines'
export * from './stages'

// Helper functions to get data
import { STAGES } from './stages'
import { ENGINES } from './engines'
import { StageData, EngineData, RoadmapBuild } from './types'

export const getStageById = (stageId: string): StageData | undefined => {
  return STAGES.find(stage => stage.id === stageId)
}

export const getEngineById = (engineId: string): EngineData | undefined => {
  return ENGINES.find(engine => engine.id === engineId)
}

export const getBuildsByEngine = (stageId: string, engineId: string): RoadmapBuild[] => {
  const stage = getStageById(stageId)
  if (!stage) return []
  return stage.builds.filter(build => build.engine === engineId)
}

export const getAllBuildsByEngine = (engineId: string): RoadmapBuild[] => {
  return STAGES.flatMap(stage =>
    stage.builds.filter(build => build.engine === engineId)
  )
}

export const getTotalBuildsCount = (): number => {
  return STAGES.reduce((total, stage) => total + stage.builds.length, 0)
}

export const getBuildsByStage = (stageId: string): RoadmapBuild[] => {
  const stage = getStageById(stageId)
  return stage?.builds || []
}
