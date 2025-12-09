'use client'

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
  const [completionChecks, setCompletionChecks] = useState<Record<string, Record<string, boolean>>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'full' | 'focus'>('full')
  const [hasSeenIntro, setHasSeenIntro] = useState(false)

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
          .maybeSingle()
        profileRevenue = profile?.annual_revenue || null
      } else if (activeBusiness?.id) {
        // Coach view: activeBusiness.id is businesses.id
        // Need to get the corresponding business_profiles.id
        // First try by business_id, then fall back to owner's user_id
        let profile = null

        const { data: profileByBiz } = await supabase
          .from('business_profiles')
          .select('id, annual_revenue')
          .eq('business_id', activeBusiness.id)
          .limit(1)

        if (profileByBiz?.[0]) {
          profile = profileByBiz[0]
        } else if (activeBusiness.ownerId) {
          // Fallback: lookup by owner's user_id
          const { data: profileByUser } = await supabase
            .from('business_profiles')
            .select('id, annual_revenue')
            .eq('user_id', activeBusiness.ownerId)
            .order('created_at', { ascending: true })
            .limit(1)
          profile = profileByUser?.[0] || null
        }

        if (profile?.id) {
          bizId = profile.id
          profileRevenue = profile.annual_revenue || null
        } else {
          console.warn('[RoadmapProgress] No business_profiles found for businesses.id:', activeBusiness.id)
          bizId = activeBusiness.id // Fallback
        }
      } else {
        // Get user's own business profile
        const { data: profiles } = await supabase
          .from('business_profiles')
          .select('id, annual_revenue')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true })
          .limit(1)
        const profile = profiles?.[0] || null
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
        .select('completed_builds, completion_checks, view_mode, has_seen_intro')
        .eq('user_id', user.id)
        .maybeSingle()

      if (error) {
        console.error('Error loading roadmap progress:', error)
      } else if (data) {
        const builds = data.completed_builds as string[]
        setCompletedBuilds(new Set(builds))

        // Load completion checks
        if (data.completion_checks) {
          setCompletionChecks(data.completion_checks as Record<string, Record<string, boolean>>)
        }

        // Load view preferences
        if (data.view_mode) {
          setViewMode(data.view_mode as 'full' | 'focus')
        }
        if (data.has_seen_intro !== null) {
          setHasSeenIntro(data.has_seen_intro)
        }

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

  // Save progress to database (builds, checks, and preferences)
  const saveProgress = async (
    builds?: Set<string>,
    checks?: Record<string, Record<string, boolean>>,
    preferences?: { viewMode?: 'full' | 'focus'; hasSeenIntro?: boolean }
  ) => {
    setIsSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        console.error('No user found, cannot save progress')
        return
      }

      const updateData: Record<string, any> = {
        user_id: user.id,
        updated_at: new Date().toISOString()
      }

      if (builds) {
        updateData.completed_builds = Array.from(builds)
      }
      if (checks) {
        updateData.completion_checks = checks
      }
      if (preferences?.viewMode) {
        updateData.view_mode = preferences.viewMode
      }
      if (preferences?.hasSeenIntro !== undefined) {
        updateData.has_seen_intro = preferences.hasSeenIntro
      }

      // Upsert (insert or update)
      const { error } = await supabase
        .from('roadmap_progress')
        .upsert(updateData, {
          onConflict: 'user_id'
        })

      if (error) {
        console.error('Error saving roadmap progress:', error)
      } else {
        console.log('✅ Saved roadmap progress')
      }
    } catch (error) {
      console.error('Error in saveProgress:', error)
    } finally {
      setIsSaving(false)
    }
  }

  // Save completion checks for a specific build
  const saveCompletionChecks = useCallback((buildName: string, answers: Record<string, boolean>) => {
    setCompletionChecks(prev => {
      const newChecks = { ...prev, [buildName]: answers }
      saveProgress(undefined, newChecks)
      return newChecks
    })
  }, [])

  // Get completion checks for a build
  const getCompletionChecks = useCallback((buildName: string): Record<string, boolean> => {
    return completionChecks[buildName] || {}
  }, [completionChecks])

  // Toggle view mode
  const toggleViewMode = useCallback(() => {
    setViewMode(prev => {
      const newMode = prev === 'full' ? 'focus' : 'full'
      saveProgress(undefined, undefined, { viewMode: newMode })
      return newMode
    })
  }, [])

  // Mark intro as seen
  const dismissIntro = useCallback(() => {
    setHasSeenIntro(true)
    saveProgress(undefined, undefined, { hasSeenIntro: true })
  }, [])

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

    // Stage-related
    businessId,
    currentStageId,
    currentStageInfo,
    stageChange,
    revenue,
    getPriorityBuilds,
    getStageStats,
    isStageRelevant,
    dismissStageChange,

    // Completion checks (saved to DB)
    completionChecks,
    saveCompletionChecks,
    getCompletionChecks,

    // View preferences
    viewMode,
    toggleViewMode,
    hasSeenIntro,
    dismissIntro,
  }
}
