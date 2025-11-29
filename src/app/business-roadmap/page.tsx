'use client'

import React, { useState, useEffect } from 'react'
import { Loader2, Megaphone, ShoppingCart, Heart, Users, Settings, Calculator, Crown, Target, Star, ChevronRight, X, Sparkles, Trophy, PartyPopper, RefreshCw, HelpCircle, Info } from 'lucide-react'
import { STAGES, ENGINES, getBuildsByEngine } from './data'
import { BuildModal } from './components/BuildModal'
import { BuildItem } from './components/BuildItem'
import { useRoadmapProgress } from './hooks/useRoadmapProgress'
import { getCompletionChecks, calculateCompletionPercentage } from './data/completion-checks'
import type { RoadmapBuild } from './data/types'

// Icon mapping
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Megaphone,
  ShoppingCart,
  Heart,
  Users,
  Settings,
  Calculator,
  Crown,
  Target
}

export default function WisdomRoadmapTable() {
  const {
    isLoading,
    isSaving,
    toggleBuild,
    isComplete,
    getStats,
    currentStageId,
    currentStageInfo,
    stageChange,
    getPriorityBuilds,
    getStageStats,
    isStageRelevant,
    dismissStageChange,
  } = useRoadmapProgress()

  const [selectedBuild, setSelectedBuild] = useState<{
    build: RoadmapBuild
    stageName: string
    engineName: string
  } | null>(null)

  // Completion check answers - stored in localStorage for now
  const [checkAnswers, setCheckAnswers] = useState<Record<string, Record<string, boolean>>>({})
  const [showInstructions, setShowInstructions] = useState(true)

  // Load completion check answers from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('roadmap_completion_checks')
    if (stored) {
      try {
        setCheckAnswers(JSON.parse(stored))
      } catch (e) {
        console.error('Error loading completion checks:', e)
      }
    }
    // Check if user has dismissed instructions
    const dismissed = localStorage.getItem('roadmap_instructions_dismissed')
    if (dismissed === 'true') {
      setShowInstructions(false)
    }
  }, [])

  // Save completion check answers to localStorage
  const saveCheckAnswers = (buildName: string, answers: Record<string, boolean>) => {
    const newAnswers = { ...checkAnswers, [buildName]: answers }
    setCheckAnswers(newAnswers)
    localStorage.setItem('roadmap_completion_checks', JSON.stringify(newAnswers))
  }

  // Dismiss instructions
  const dismissInstructions = () => {
    setShowInstructions(false)
    localStorage.setItem('roadmap_instructions_dismissed', 'true')
  }

  // Get completion percentage for a build
  const getBuildCompletionPercentage = (buildName: string): number | undefined => {
    const checks = getCompletionChecks(buildName)
    const answers = checkAnswers[buildName]
    if (!checks || !answers) return undefined
    return calculateCompletionPercentage(answers, checks)
  }

  const totalBuilds = STAGES.reduce((sum, stage) => sum + stage.builds.length, 0)
  const { completed: completedCount, percentage: completionPercentage } = getStats(totalBuilds)
  const priorityBuilds = getPriorityBuilds()
  const isRoadmapComplete = completionPercentage === 100

  const handleBuildClick = (build: RoadmapBuild, stageName: string, engineName: string) => {
    setSelectedBuild({ build, stageName, engineName })
  }

  const handleToggleSelectedBuild = () => {
    if (selectedBuild) {
      toggleBuild(selectedBuild.build.name)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-teal-600 mx-auto mb-3" />
          <div className="text-gray-600">Loading your roadmap...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Stage Change Celebration */}
      {stageChange?.changed && (
        <div className="bg-gradient-to-r from-teal-500 to-teal-600 text-white">
          <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Sparkles className="h-6 w-6" />
                <div>
                  <div className="font-bold">Congratulations! You've reached {currentStageInfo.name}!</div>
                  <div className="text-sm opacity-90">
                    You've grown from {stageChange.previousStage} to {currentStageInfo.name} ({currentStageInfo.range})
                  </div>
                </div>
              </div>
              <button
                onClick={dismissStageChange}
                className="p-1 hover:bg-white/20 rounded transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Instructions Banner */}
      {showInstructions && !isRoadmapComplete && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200">
          <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-amber-100 rounded-lg flex-shrink-0">
                  <Info className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <div className="font-bold text-gray-900 mb-1">How to Use the Roadmap</div>
                  <div className="text-sm text-gray-700 space-y-1">
                    <p><strong>Click any build</strong> to assess your progress. Answer quick Yes/No questions to see how complete each build really is.</p>
                    <p>Your completion percentage will show next to each build name. Focus on builds with low completion in your current stage.</p>
                  </div>
                </div>
              </div>
              <button
                onClick={dismissInstructions}
                className="text-amber-600 hover:text-amber-800 p-1 flex-shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-30">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">The Wisdom Roadmap</h1>
                {isRoadmapComplete && (
                  <span className="flex items-center gap-1 px-2.5 py-1 bg-gradient-to-r from-amber-500 to-amber-600 text-white text-xs font-bold rounded-full">
                    <Trophy className="h-3.5 w-3.5" />
                    MASTERED
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-600 mt-1">
                {isRoadmapComplete
                  ? 'Congratulations! You\'ve completed every build in the roadmap'
                  : 'Your stage-by-stage guide to business freedom'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {isSaving && (
                <span className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </span>
              )}
              {!showInstructions && !isRoadmapComplete && (
                <button
                  onClick={() => {
                    setShowInstructions(true)
                    localStorage.removeItem('roadmap_instructions_dismissed')
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                  title="Show instructions"
                >
                  <HelpCircle className="h-4 w-4" />
                  <span>Help</span>
                </button>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
              <span>{completedCount} of {totalBuilds} builds complete</span>
              <span className={isRoadmapComplete ? 'font-bold text-amber-600' : ''}>
                {completionPercentage}%{isRoadmapComplete && ' 🏆'}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-500 ${
                  isRoadmapComplete
                    ? 'bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-500'
                    : 'bg-teal-500'
                }`}
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Focus Section */}
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {isRoadmapComplete ? (
          /* Celebration Section - Shown when all builds complete */
          <div className="bg-gradient-to-r from-amber-50 via-yellow-50 to-amber-50 rounded-lg shadow-sm border border-amber-200 p-6">
            <div className="text-center">
              <div className="flex justify-center gap-2 mb-4">
                <PartyPopper className="h-8 w-8 text-amber-500" />
                <Trophy className="h-8 w-8 text-amber-600" />
                <PartyPopper className="h-8 w-8 text-amber-500 transform scale-x-[-1]" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                You've Mastered The Wisdom Roadmap!
              </h2>
              <p className="text-gray-600 mb-6 max-w-2xl mx-auto">
                Incredible achievement! You've completed all {totalBuilds} builds across every stage
                from Foundation to Mastery. Your business now has the systems and foundations for sustainable growth.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto mb-6">
                <div className="bg-white rounded-lg p-4 border border-amber-200">
                  <div className="text-3xl font-bold text-amber-600">{totalBuilds}</div>
                  <div className="text-sm text-gray-600">Builds Completed</div>
                </div>
                <div className="bg-white rounded-lg p-4 border border-amber-200">
                  <div className="text-3xl font-bold text-amber-600">5</div>
                  <div className="text-sm text-gray-600">Stages Mastered</div>
                </div>
                <div className="bg-white rounded-lg p-4 border border-amber-200">
                  <div className="text-3xl font-bold text-amber-600">8</div>
                  <div className="text-sm text-gray-600">Engines Optimized</div>
                </div>
              </div>

              <div className="bg-white rounded-lg p-4 border border-gray-200 max-w-xl mx-auto">
                <div className="flex items-center gap-2 text-gray-700 mb-2">
                  <RefreshCw className="h-5 w-5 text-teal-600" />
                  <span className="font-semibold">What's Next?</span>
                </div>
                <p className="text-sm text-gray-600">
                  The roadmap is a living document. Review your builds quarterly, refine what's working,
                  and continue optimizing each engine as your business evolves. True mastery is continuous improvement.
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* Normal Focus Section - Shown when builds remain */
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
                  <Target className="h-5 w-5 text-teal-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-gray-900">Your Focus: {currentStageInfo.name}</h2>
                    <span className="px-2 py-0.5 bg-teal-100 text-teal-700 text-xs font-medium rounded-full">
                      {currentStageInfo.range}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">
                    {priorityBuilds.length > 0
                      ? `${priorityBuilds.length} builds to complete in your stage and below`
                      : 'All builds complete in your current stage!'}
                  </p>
                </div>
              </div>
              {priorityBuilds.length === 0 && (
                <span className="flex items-center gap-1 text-amber-600 text-sm font-medium">
                  <Star className="h-4 w-4" />
                  Stage Complete
                </span>
              )}
            </div>

            {/* Priority Builds List */}
            {priorityBuilds.length > 0 && (
              <div className="border-t border-gray-100 pt-4">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Priority Builds
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {priorityBuilds.slice(0, 6).map((build) => {
                    const stage = STAGES.find(s => s.id === build.stageId)
                    const isBelowCurrent = build.stageId !== currentStageId

                    return (
                      <button
                        key={build.name}
                        onClick={() => {
                          const fullBuild = stage?.builds.find(b => b.name === build.name)
                          const engine = ENGINES.find(e => e.id === build.engine)
                          if (fullBuild && stage && engine) {
                            handleBuildClick(fullBuild, stage.name, engine.name)
                          }
                        }}
                        className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
                          isBelowCurrent
                            ? 'bg-amber-50 border-amber-200 hover:bg-amber-100'
                            : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={false}
                          onChange={() => toggleBuild(build.name)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 accent-teal-600 rounded border-gray-300 focus:ring-teal-500"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">{build.name}</div>
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <span>{build.stageName}</span>
                            {isBelowCurrent && (
                              <>
                                <span>•</span>
                                <span className="text-amber-600 font-medium">Catch-up</span>
                              </>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      </button>
                    )
                  })}
                </div>
                {priorityBuilds.length > 6 && (
                  <div className="text-sm text-gray-500 mt-3 text-center">
                    + {priorityBuilds.length - 6} more builds to complete
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="overflow-x-auto relative">
            <table className="w-full border-collapse relative">
              {/* Header Row - Engine Names */}
              <thead>
                <tr className="border-b-2 border-gray-300">
                  <th className="sticky left-0 z-20 bg-gray-100 text-left p-3 font-bold text-gray-700 min-w-[140px] border-r-2 border-gray-300 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                    STAGE
                  </th>
                  {ENGINES.map((engine) => {
                    const IconComponent = iconMap[engine.icon]
                    return (
                      <th
                        key={engine.id}
                        className="bg-gray-50 p-3 min-w-[180px] border-r border-gray-200"
                      >
                        <div className="text-center">
                          {IconComponent && (
                            <IconComponent className={`h-8 w-8 mx-auto mb-2 ${engine.color}`} />
                          )}
                          <div className="font-bold text-gray-900 text-sm uppercase tracking-wide">
                            {engine.name}
                          </div>
                          <div className="text-xs text-gray-600 mt-1 normal-case">
                            {engine.subtitle}
                          </div>
                        </div>
                      </th>
                    )
                  })}
                </tr>
              </thead>

              {/* Body - Stages (Mastery at top) */}
              <tbody>
                {[...STAGES].reverse().map((stage) => {
                  const isCurrentStage = stage.id === currentStageId
                  const isRelevant = isStageRelevant(stage.id)
                  const stageStats = getStageStats(stage.id)

                  return (
                    <tr
                      key={stage.id}
                      className={`border-b border-gray-200 ${
                        isCurrentStage
                          ? 'bg-teal-50'
                          : isRelevant
                            ? ''
                            : 'opacity-50'
                      }`}
                    >
                      {/* Stage Name Column */}
                      <td className={`sticky left-0 z-10 p-3 border-r-2 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${
                        isCurrentStage
                          ? 'bg-teal-50 border-l-4 border-l-teal-500 border-r-gray-300'
                          : isRelevant
                            ? 'bg-white border-r-gray-300'
                            : 'bg-gray-50 border-r-gray-300'
                      }`}>
                        <div>
                          <div className="flex items-center gap-2">
                            <div className="font-bold text-sm text-gray-900">{stage.name}</div>
                            {isCurrentStage && (
                              <span className="px-1.5 py-0.5 bg-teal-600 text-white text-xs font-medium rounded">
                                You
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-600 mt-1">{stage.range}</div>
                          <div className={`text-xs mt-2 font-medium ${
                            stageStats.percentage === 100 ? 'text-amber-600' : 'text-teal-600'
                          }`}>
                            {stageStats.completed}/{stageStats.total} Complete
                            {stageStats.percentage === 100 && ' ✓'}
                          </div>
                        </div>
                      </td>

                      {/* Engine Cells */}
                      {ENGINES.map((engine) => {
                        const builds = getBuildsByEngine(stage.id, engine.id)

                        return (
                          <td
                            key={engine.id}
                            className={`p-2 border-r border-gray-200 align-top ${
                              isCurrentStage ? 'bg-teal-50' : ''
                            }`}
                          >
                            {builds.length > 0 ? (
                              <div className="space-y-1">
                                {builds.map((build) => (
                                  <BuildItem
                                    key={build.name}
                                    build={build}
                                    isComplete={isComplete(build.name)}
                                    completionPercentage={getBuildCompletionPercentage(build.name)}
                                    onClick={() => handleBuildClick(build, stage.name, engine.name)}
                                    onToggleComplete={(e) => {
                                      e.stopPropagation()
                                      toggleBuild(build.name)
                                    }}
                                  />
                                ))}
                              </div>
                            ) : (
                              <div className="text-center text-gray-400 text-xs py-4">—</div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Success Criteria - Below Table */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-5 gap-4">
          {STAGES.map((stage) => {
            const isCurrentStage = stage.id === currentStageId
            const stageStats = getStageStats(stage.id)

            return (
              <div
                key={stage.id}
                className={`bg-white rounded-lg shadow p-4 border-l-4 ${
                  isCurrentStage
                    ? 'border-teal-500 ring-2 ring-teal-200'
                    : stageStats.percentage === 100
                      ? 'border-amber-500'
                      : 'border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="font-bold text-gray-900">{stage.name}</div>
                  {isCurrentStage && (
                    <span className="px-1.5 py-0.5 bg-teal-100 text-teal-700 text-xs font-medium rounded">
                      Current
                    </span>
                  )}
                  {!isCurrentStage && stageStats.percentage === 100 && (
                    <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded">
                      Complete
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-600 mb-3">{stage.range}</div>

                {/* Progress */}
                <div className="mb-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-600">Progress</span>
                    <span className="font-semibold">{stageStats.percentage}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        stageStats.percentage === 100 ? 'bg-amber-500' : 'bg-teal-500'
                      }`}
                      style={{ width: `${stageStats.percentage}%` }}
                    />
                  </div>
                </div>

                {/* Success Criteria */}
                <div>
                  <div className="text-xs font-semibold text-gray-700 mb-2">Success Criteria:</div>
                  <ul className="space-y-1">
                    {stage.successCriteria.map((criteria, idx) => (
                      <li key={idx} className="text-xs text-gray-600 flex items-start gap-1">
                        <span className="text-teal-500 mt-0.5">•</span>
                        <span>{criteria}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Build Detail Modal */}
      <BuildModal
        build={selectedBuild?.build || null}
        isOpen={!!selectedBuild}
        onClose={() => setSelectedBuild(null)}
        stageName={selectedBuild?.stageName || ''}
        engineName={selectedBuild?.engineName || ''}
        isComplete={selectedBuild ? isComplete(selectedBuild.build.name) : false}
        onToggleComplete={handleToggleSelectedBuild}
        checkAnswers={selectedBuild ? checkAnswers[selectedBuild.build.name] || {} : {}}
        onCheckAnswersChange={(answers) => {
          if (selectedBuild) {
            saveCheckAnswers(selectedBuild.build.name, answers)
          }
        }}
      />
    </div>
  )
}
