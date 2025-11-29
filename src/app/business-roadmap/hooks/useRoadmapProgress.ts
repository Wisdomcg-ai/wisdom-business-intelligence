import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBusinessContext } from '@/contexts/BusinessContext'
import { StageService, StageId, StageInfo, STAGE_DEFINITIONS } from '../services/stage-service'
import { STAGES } from '../data'

export interface StageChangeInfo {
  changed: boolean
  previousStage: StageId | null
  currentStage: StageId
  isNewUser: boolean
}

export interface PriorityBuild {
  name: string
  stageName: string
  stageId: StageId
  engine: string
}

export function useRoadmapProgress(overrideBusinessId?: string) {
  const [completedBuilds, setCompletedBuilds] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [businessId, setBusinessId] = useState<string | null>(null)

  // Stage state
  const [currentStageId, setCurrentStageId] = useState<StageId>('foundation')
  const [currentStageInfo, setCurrentStageInfo] = useState<StageInfo>(STAGE_DEFINITIONS[0])
  const [stageChange, setStageChange] = useState<StageChangeInfo | null>(null)
  const [revenue, setRevenue] = useState<number | null>(null)

  const supabase = createClient()
  const { activeBusiness } = useBusinessContext()

  // Load completed builds and stage from database
  useEffect(() => {
    loadProgress()
  }, [overrideBusinessId, activeBusiness?.id])

  const loadProgress = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        console.log('No user found')
        setIsLoading(false)
        return
      }

      // Determine which business to load:
      // 1. If overrideBusinessId is provided (explicit), use it (assumed to be business_profiles.id)
      // 2. If activeBusiness is set (coach viewing client), look up business_profiles.id
      // 3. Otherwise, load user's own business profile
      //
      // IMPORTANT: Roadmap data uses business_profiles.id
      // But activeBusiness.id is businesses.id - we must look up the correct profile ID
      let bizId: string | null = null
      let profileRevenue: number | null = null

      if (overrideBusinessId) {
        bizId = overrideBusinessId
        const { data: profile } = await supabase
          .from('business_profiles')
          .select('annual_revenue')
          .eq('id', overrideBusinessId)
          .single()
        profileRevenue = profile?.annual_revenue || null
      } else if (activeBusiness?.id) {
        // Coach view: activeBusiness.id is businesses.id
        // Need to get the corresponding business_profiles.id
        const { data: profile } = await supabase
          .from('business_profiles')
          .select('id, annual_revenue')
          .eq('business_id', activeBusiness.id)
          .single()

        if (profile?.id) {
          bizId = profile.id
          profileRevenue = profile.annual_revenue || null
        } else {
          console.warn('[RoadmapProgress] No business_profiles found for businesses.id:', activeBusiness.id)
          bizId = activeBusiness.id // Fallback
        }
      } else {
        // Get user's own business profile
        const { data: profile } = await supabase
          .from('business_profiles')
          .select('id, annual_revenue')
          .eq('user_id', user.id)
          .single()
        bizId = profile?.id || null
        profileRevenue = profile?.annual_revenue || null
      }

      if (bizId) {
        setBusinessId(bizId)
        setRevenue(profileRevenue)

        // Check for stage changes
        const stageResult = await StageService.checkAndRecordStageChange(bizId)
        setCurrentStageId(stageResult.currentStage)
        setCurrentStageInfo(StageService.getStageInfo(stageResult.currentStage)!)
        setStageChange(stageResult)

        if (stageResult.changed) {
          console.log(`🎉 Stage changed from ${stageResult.previousStage} to ${stageResult.currentStage}`)
        }
      }

      // Load roadmap progress
      const { data, error } = await supabase
        .from('roadmap_progress')
        .select('completed_builds')
        .eq('user_id', user.id)
        .maybeSingle()

      if (error) {
        console.error('Error loading roadmap progress:', error)
      } else if (data) {
        const builds = data.completed_builds as string[]
        setCompletedBuilds(new Set(builds))
        console.log('✅ Loaded roadmap progress:', builds.length, 'builds completed')
      } else {
        console.log('No existing progress found, starting fresh')
      }
    } catch (error) {
      console.error('Error in loadProgress:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Save completed builds to database
  const saveProgress = async (builds: Set<string>) => {
    setIsSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        console.error('No user found, cannot save progress')
        return
      }

      const buildsArray = Array.from(builds)

      // Upsert (insert or update)
      const { error } = await supabase
        .from('roadmap_progress')
        .upsert({
          user_id: user.id,
          completed_builds: buildsArray
        }, {
          onConflict: 'user_id'
        })

      if (error) {
        console.error('Error saving roadmap progress:', error)
      } else {
        console.log('✅ Saved roadmap progress:', buildsArray.length, 'builds')
      }
    } catch (error) {
      console.error('Error in saveProgress:', error)
    } finally {
      setIsSaving(false)
    }
  }

  // Toggle a build's completion status
  const toggleBuild = useCallback((buildName: string) => {
    setCompletedBuilds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(buildName)) {
        newSet.delete(buildName)
      } else {
        newSet.add(buildName)
      }

      // Save to database
      saveProgress(newSet)

      return newSet
    })
  }, [])

  // Check if a build is complete
  const isComplete = useCallback((buildName: string) => {
    return completedBuilds.has(buildName)
  }, [completedBuilds])

  // Get completion stats
  const getStats = useCallback((totalBuilds: number) => {
    const completedCount = completedBuilds.size
    const percentage = totalBuilds > 0 ? Math.round((completedCount / totalBuilds) * 100) : 0

    return {
      completed: completedCount,
      total: totalBuilds,
      percentage
    }
  }, [completedBuilds])

  // Get priority builds (incomplete builds in current stage and below)
  const getPriorityBuilds = useCallback((): PriorityBuild[] => {
    const priorityBuilds: PriorityBuild[] = []
    const currentStageIndex = StageService.getStageIndex(currentStageId)

    // Go through stages from foundation up to current
    STAGES.forEach((stage) => {
      const stageIndex = STAGE_DEFINITIONS.findIndex(s => s.id === stage.id)

      // Only include stages at or below current level
      if (stageIndex <= currentStageIndex) {
        stage.builds.forEach(build => {
          if (!completedBuilds.has(build.name)) {
            priorityBuilds.push({
              name: build.name,
              stageName: stage.name,
              stageId: stage.id as StageId,
              engine: build.engine
            })
          }
        })
      }
    })

    return priorityBuilds
  }, [completedBuilds, currentStageId])

  // Get stage completion stats
  const getStageStats = useCallback((stageId: string) => {
    const stage = STAGES.find(s => s.id === stageId)
    if (!stage) return { completed: 0, total: 0, percentage: 0 }

    const total = stage.builds.length
    const completed = stage.builds.filter(b => completedBuilds.has(b.name)).length
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0

    return { completed, total, percentage }
  }, [completedBuilds])

  // Check if a stage is at or below current
  const isStageRelevant = useCallback((stageId: string): boolean => {
    return StageService.isStageAtOrBelow(stageId as StageId, currentStageId)
  }, [currentStageId])

  // Dismiss stage change notification
  const dismissStageChange = useCallback(() => {
    setStageChange(prev => prev ? { ...prev, changed: false } : null)
  }, [])

  return {
    // Existing
    completedBuilds,
    isLoading,
    isSaving,
    toggleBuild,
    isComplete,
    getStats,

    // New stage-related
    businessId,
    currentStageId,
    currentStageInfo,
    stageChange,
    revenue,
    getPriorityBuilds,
    getStageStats,
    isStageRelevant,
    dismissStageChange,
  }
}
