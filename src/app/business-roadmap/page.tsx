'use client'

import React, { useState } from 'react'
import { Loader2, Megaphone, ShoppingCart, Heart, Users, Settings, Calculator, Crown, Target, Star, ChevronRight, X, Sparkles, Trophy, PartyPopper, RefreshCw, HelpCircle, Eye, Grid3X3, ExternalLink, Lightbulb, TrendingUp, CheckCircle2, Map } from 'lucide-react'
import { STAGES, ENGINES, getBuildsByEngine } from './data'
import { BuildModal } from './components/BuildModal'
import { BuildItem } from './components/BuildItem'
import { EngineTooltip } from './components/EngineTooltip'
import { useRoadmapProgress } from './hooks/useRoadmapProgress'
import { getCompletionChecks as getChecksForBuild, calculateCompletionPercentage } from './data/completion-checks'
import type { RoadmapBuild } from './data/types'
import PageHeader from '@/components/ui/PageHeader'

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

// Build to platform feature linking
const BUILD_LINKS: Record<string, { href: string; label: string }> = {
  "Money in the Bank": { href: "/finances/forecast", label: "Financial Forecast" },
  "Zone of Genius": { href: "/stop-doing", label: "Stop Doing List" },
  "Strategic Time": { href: "/stop-doing", label: "Stop Doing List" },
  "Getting to Yes": { href: "/goals", label: "Goals & KPIs" },
  "Niche & Offer": { href: "/marketing/value-prop", label: "Value Proposition" },
  "The Hero's Quest": { href: "/vision-mission", label: "Vision & Mission" },
  "Open Loops Closed": { href: "/open-loops", label: "Open Loops" },
  "Issues Resolved": { href: "/issues-list", label: "Issues List" },
  "SWOT Analysis": { href: "/swot", label: "SWOT Analysis" },
  "90 Day Planning": { href: "/quarterly-review", label: "Quarterly Review" },
  "Team Accountability": { href: "/team/accountability", label: "Accountability Chart" },
  "Hiring Plan": { href: "/team/hiring-roadmap", label: "Hiring Roadmap" },
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
    // New from hook
    completionChecks,
    saveCompletionChecks,
    viewMode,
    toggleViewMode,
    hasSeenIntro,
    dismissIntro,
  } = useRoadmapProgress()

  const [selectedBuild, setSelectedBuild] = useState<{
    build: RoadmapBuild
    stageName: string
    engineName: string
  } | null>(null)

  // Get completion percentage for a build
  const getBuildCompletionPercentage = (buildName: string): number | undefined => {
    const checks = getChecksForBuild(buildName)
    const answers = completionChecks[buildName]
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-orange mx-auto mb-3" />
          <div className="text-gray-600">Loading your roadmap...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Main Page Header Banner */}
      <PageHeader
        variant="banner"
        title="The Wisdom Roadmap"
        subtitle={isRoadmapComplete
          ? 'Congratulations! You\'ve completed every build in the roadmap'
          : `Your stage-by-stage guide to business freedom`}
        icon={Map}
        badge={isRoadmapComplete ? "MASTERED" : undefined}
        badgeColor={isRoadmapComplete ? "orange" : undefined}
        actions={
          !isRoadmapComplete && hasSeenIntro ? (
            <div className="text-right hidden sm:block">
              <div className="text-xs text-white/70 mb-1">{currentStageInfo.name} Stage</div>
              <div className="text-2xl font-bold text-brand-orange">{getStageStats(currentStageId).percentage}%</div>
              <div className="text-xs text-white/70">Complete</div>
            </div>
          ) : undefined
        }
      />

      {/* Stage Change Celebration */}
      {stageChange?.changed && (
        <div className="bg-gradient-to-r from-brand-orange-500 to-brand-orange text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
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

      {/* First-Time User Intro */}
      {!hasSeenIntro && !isRoadmapComplete && (
        <div className="bg-gradient-to-br from-brand-orange-50 via-white to-brand-orange-50 border-b-2 border-brand-orange-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-8">
            <div className="max-w-5xl mx-auto">
              {/* Hero Section */}
              <div className="text-center mb-6 sm:mb-8">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand-orange-100 text-brand-orange-700 rounded-full text-xs font-medium mb-3">
                  <Lightbulb className="h-3.5 w-3.5" />
                  THE WISDOM ROADMAP
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2 sm:mb-3">
                  The Right Strategy at the Right Time
                </h2>
                <p className="text-gray-600 text-sm sm:text-lg max-w-2xl mx-auto">
                  Most business owners fail not from lack of effort, but from implementing the wrong strategies for their stage.
                </p>
              </div>

              {/* The Core Insight */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-6 mb-5 sm:mb-6">
                <div className="flex flex-col md:flex-row gap-4 sm:gap-6">
                  {/* Left: The Problem */}
                  <div className="flex-1 p-4 bg-red-50 rounded-xl border border-red-100">
                    <div className="flex items-center gap-2 text-red-700 font-semibold mb-2 text-sm">
                      <X className="h-4 w-4" />
                      The Trap
                    </div>
                    <p className="text-sm text-red-800 leading-relaxed">
                      A $300K business trying to implement $5M strategies — hiring executives, complex systems, enterprise sales processes — burns cash and creates chaos.
                      <span className="font-medium"> The strategy isn't wrong. The timing is.</span>
                    </p>
                  </div>

                  {/* Right: The Solution */}
                  <div className="flex-1 p-4 bg-green-50 rounded-xl border border-green-100">
                    <div className="flex items-center gap-2 text-green-700 font-semibold mb-2 text-sm">
                      <CheckCircle2 className="h-4 w-4" />
                      The Path
                    </div>
                    <p className="text-sm text-green-800 leading-relaxed">
                      This roadmap sequences the exact "builds" proven to work at each revenue stage.
                      <span className="font-medium"> Complete your current stage before reaching for the next.</span> Each build creates the foundation for what comes after.
                    </p>
                  </div>
                </div>
              </div>

              {/* How It Works */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-5 sm:mb-6">
                <div className="bg-white rounded-xl p-4 sm:p-5 border border-gray-200 shadow-sm">
                  <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-brand-orange-500 to-brand-orange rounded-lg flex items-center justify-center text-white font-bold text-sm">1</div>
                    <h3 className="font-semibold text-gray-900 text-sm sm:text-base">Know Your Stage</h3>
                  </div>
                  <p className="text-xs sm:text-sm text-gray-600">
                    Five stages from <strong>Foundation</strong> ($0-500K) to <strong>Mastery</strong> ($10M+). Your revenue determines which strategies will actually work right now.
                  </p>
                </div>

                <div className="bg-white rounded-xl p-4 sm:p-5 border border-gray-200 shadow-sm">
                  <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-brand-orange-500 to-brand-orange rounded-lg flex items-center justify-center text-white font-bold text-sm">2</div>
                    <h3 className="font-semibold text-gray-900 text-sm sm:text-base">Build All 8 Engines</h3>
                  </div>
                  <p className="text-xs sm:text-sm text-gray-600">
                    Attract, Convert, Deliver, People, Systems, Finance, Leadership, Time. <strong>Neglect one, and growth stalls.</strong> Balance creates momentum.
                  </p>
                </div>

                <div className="bg-white rounded-xl p-4 sm:p-5 border border-gray-200 shadow-sm">
                  <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-brand-orange-500 to-brand-orange rounded-lg flex items-center justify-center text-white font-bold text-sm">3</div>
                    <h3 className="font-semibold text-gray-900 text-sm sm:text-base">Complete Before Advancing</h3>
                  </div>
                  <p className="text-xs sm:text-sm text-gray-600">
                    Each "build" is a specific outcome with clear to-dos. <strong>Finish your stage</strong> before implementing strategies from the next level.
                  </p>
                </div>
              </div>

              {/* Current Stage CTA */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-gradient-to-r from-brand-orange to-brand-orange-700 rounded-xl p-4 sm:p-5 text-white">
                <div className="flex items-start sm:items-center gap-3">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Target className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                  </div>
                  <div>
                    <p className="text-brand-orange-100 text-xs sm:text-sm">You're currently at</p>
                    <p className="font-bold text-lg sm:text-xl">{currentStageInfo.name} Stage <span className="font-normal text-brand-orange-200">({currentStageInfo.range})</span></p>
                  </div>
                </div>
                <button
                  onClick={dismissIntro}
                  className="w-full sm:w-auto px-5 py-2.5 bg-brand-orange hover:bg-brand-orange-600 text-white rounded-lg transition-colors font-semibold text-sm shadow-lg"
                >
                  See My Roadmap
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Progress Bar & Controls */}
      <div className="bg-white border-b sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-4 mb-3">
            <div className="flex items-center gap-2 sm:gap-3">
              {isSaving && (
                <span className="flex items-center gap-1.5 text-xs sm:text-sm text-gray-500">
                  <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
                  <span className="hidden sm:inline">Saving...</span>
                </span>
              )}

              {/* View Mode Toggle */}
              <div className="flex items-center bg-gray-100 rounded-lg p-0.5 sm:p-1">
                <button
                  onClick={() => viewMode !== 'focus' && toggleViewMode()}
                  className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm rounded-md transition-colors ${
                    viewMode === 'focus'
                      ? 'bg-white text-brand-orange-700 shadow-sm font-medium'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span className="hidden xs:inline">Focus</span>
                </button>
                <button
                  onClick={() => viewMode !== 'full' && toggleViewMode()}
                  className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm rounded-md transition-colors ${
                    viewMode === 'full'
                      ? 'bg-white text-brand-orange-700 shadow-sm font-medium'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Grid3X3 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span className="hidden xs:inline">Full</span>
                </button>
              </div>

              {hasSeenIntro && !isRoadmapComplete && (
                <button
                  onClick={() => {/* Could reset intro */}}
                  className="flex items-center gap-1.5 p-1.5 sm:px-3 sm:py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Show help"
                >
                  <HelpCircle className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="text-sm text-gray-600">
              <span className={isRoadmapComplete ? 'font-bold text-amber-600' : ''}>
                {completedCount}/{totalBuilds} builds {isRoadmapComplete && '🏆'}
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${
                isRoadmapComplete
                  ? 'bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-500'
                  : 'bg-brand-orange-500'
              }`}
              style={{ width: `${completionPercentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* FOCUS MODE VIEW */}
      {viewMode === 'focus' && !isRoadmapComplete && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          {/* Current Stage Card */}
          <div className="bg-gradient-to-r from-brand-navy to-brand-navy-700 rounded-xl shadow-sm border-l-4 border-brand-orange p-4 sm:p-6 mb-4 sm:mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-brand-orange rounded-xl flex items-center justify-center flex-shrink-0">
                  <Target className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
                </div>
                <div>
                  <div className="text-xs sm:text-sm font-medium text-white/80 uppercase tracking-wide">Your Current Stage</div>
                  <h2 className="text-xl sm:text-2xl font-bold text-white">{currentStageInfo.name}</h2>
                  <p className="text-sm sm:text-base text-white/70">{currentStageInfo.range}</p>
                </div>
              </div>
              <div className="text-left sm:text-right pl-14 sm:pl-0">
                <div className="text-2xl sm:text-3xl font-bold text-brand-orange">{getStageStats(currentStageId).percentage}%</div>
                <div className="text-xs sm:text-sm text-white/70">Stage Complete</div>
              </div>
            </div>

            {/* Stage Progress */}
            <div className="mb-4">
              <div className="w-full bg-white/20 rounded-full h-3">
                <div
                  className="bg-brand-orange h-3 rounded-full transition-all"
                  style={{ width: `${getStageStats(currentStageId).percentage}%` }}
                />
              </div>
            </div>

            {/* Stage Explanation */}
            {(() => {
              const fullStage = STAGES.find(s => s.id === currentStageId)
              if (!fullStage) return null
              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div className="bg-white/10 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-white/90 mb-2 flex items-center gap-2">
                      <Lightbulb className="w-4 h-4 text-brand-orange" />
                      About This Stage
                    </h4>
                    <p className="text-sm text-white/80 leading-relaxed">{fullStage.description}</p>
                    <p className="text-xs text-white/60 mt-2 italic">Focus: {fullStage.focus}</p>
                  </div>
                  <div className="bg-white/10 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-white/90 mb-2 flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-brand-orange" />
                      Success Criteria
                    </h4>
                    <ul className="space-y-1">
                      {fullStage.successCriteria.slice(0, 4).map((criteria, i) => (
                        <li key={i} className="flex items-center gap-2 text-xs text-white/80">
                          <div className="w-1.5 h-1.5 bg-brand-orange rounded-full flex-shrink-0" />
                          {criteria}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )
            })()}

            {/* Priority Builds */}
            <div className="bg-white rounded-xl p-4 sm:p-6 -mx-4 sm:-mx-6 -mb-4 sm:-mb-6 mt-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Star className="h-5 w-5 text-amber-500" />
                Priority Builds ({priorityBuilds.length} remaining)
              </h3>

              {priorityBuilds.length === 0 ? (
                <div className="text-center py-6 sm:py-8 bg-green-50 rounded-xl border border-green-200">
                  <CheckCircle2 className="h-10 w-10 sm:h-12 sm:w-12 text-green-500 mx-auto mb-2 sm:mb-3" />
                  <p className="text-green-800 font-medium text-sm sm:text-base">All builds complete in your current stage!</p>
                  <p className="text-green-600 text-xs sm:text-sm mt-1">You're ready to grow to the next level.</p>
                </div>
              ) : (
                <div className="grid gap-2 sm:gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                  {priorityBuilds.slice(0, 9).map((build) => {
                    const stage = STAGES.find(s => s.id === build.stageId)
                    const isBelowCurrent = build.stageId !== currentStageId
                    const link = BUILD_LINKS[build.name]
                    const completion = getBuildCompletionPercentage(build.name)

                    return (
                      <div
                        key={build.name}
                        className={`p-4 sm:p-6 rounded-xl border-2 transition-all hover:shadow-md cursor-pointer ${
                          isBelowCurrent
                            ? 'bg-amber-50 border-amber-300 hover:border-amber-400'
                            : 'bg-white border-gray-200 hover:border-brand-orange-300'
                        }`}
                        onClick={() => {
                          const fullBuild = stage?.builds.find(b => b.name === build.name)
                          const engine = ENGINES.find(e => e.id === build.engine)
                          if (fullBuild && stage && engine) {
                            handleBuildClick(fullBuild, stage.name, engine.name)
                          }
                        }}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <h4 className="font-semibold text-sm sm:text-base text-gray-900">{build.name}</h4>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs sm:text-sm text-gray-500">{build.stageName}</span>
                              {isBelowCurrent && (
                                <span className="px-1.5 py-0.5 bg-amber-200 text-amber-800 text-xs font-medium rounded">
                                  Catch-up
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="h-5 w-5 text-gray-400" />
                        </div>

                        {/* Completion indicator */}
                        {completion !== undefined && (
                          <div className="mt-2">
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="text-gray-500">Progress</span>
                              <span className="font-medium">{completion}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-1.5">
                              <div
                                className={`h-1.5 rounded-full ${
                                  completion === 100 ? 'bg-green-500' : 'bg-brand-orange-500'
                                }`}
                                style={{ width: `${completion}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Link to feature */}
                        {link && (
                          <a
                            href={link.href}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-3 flex items-center gap-1 text-xs text-brand-orange hover:text-brand-orange-700"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Open {link.label}
                          </a>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {priorityBuilds.length > 9 && (
                <p className="text-center text-gray-500 text-sm mt-4">
                  + {priorityBuilds.length - 9} more builds • Switch to Full View to see all
                </p>
              )}
            </div>
          </div>

          {/* Quick Stage Overview */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 sm:gap-6">
            {STAGES.map((stage) => {
              const stats = getStageStats(stage.id)
              const isCurrent = stage.id === currentStageId

              return (
                <div
                  key={stage.id}
                  className={`p-3 sm:p-4 rounded-xl shadow-sm border border-gray-200 text-center ${
                    isCurrent
                      ? 'bg-brand-orange-50 border-brand-orange-300'
                      : stats.percentage === 100
                        ? 'bg-green-50 border-green-200'
                        : 'bg-white'
                  }`}
                >
                  <div className="font-semibold text-xs sm:text-sm text-gray-900">{stage.name}</div>
                  <div className="text-xs text-gray-500 mb-1 sm:mb-2 hidden sm:block">{stage.range}</div>
                  <div className={`text-base sm:text-lg font-bold ${
                    stats.percentage === 100 ? 'text-green-600' : 'text-brand-orange'
                  }`}>
                    {stats.percentage}%
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* FULL VIEW - Original Table */}
      {(viewMode === 'full' || isRoadmapComplete) && (
        <>
          {/* Focus Section */}
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
            {isRoadmapComplete ? (
              /* Celebration Section */
              <div className="bg-gradient-to-r from-amber-50 via-yellow-50 to-amber-50 rounded-xl shadow-sm border border-amber-200 p-4 sm:p-6">
                <div className="text-center">
                  <div className="flex justify-center gap-2 mb-4">
                    <PartyPopper className="h-6 w-6 sm:h-8 sm:w-8 text-amber-500" />
                    <Trophy className="h-6 w-6 sm:h-8 sm:w-8 text-amber-600" />
                    <PartyPopper className="h-6 w-6 sm:h-8 sm:w-8 text-amber-500 transform scale-x-[-1]" />
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
                    You've Mastered The Wisdom Roadmap!
                  </h2>
                  <p className="text-sm sm:text-base text-gray-600 mb-6 max-w-2xl mx-auto">
                    Incredible achievement! You've completed all {totalBuilds} builds across every stage.
                    Your business now has the systems and foundations for sustainable growth.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto mb-6">
                    <div className="bg-white rounded-xl p-4 sm:p-6 border border-amber-200">
                      <div className="text-2xl sm:text-3xl font-bold text-amber-600">{totalBuilds}</div>
                      <div className="text-xs sm:text-sm text-gray-600">Builds Completed</div>
                    </div>
                    <div className="bg-white rounded-xl p-4 sm:p-6 border border-amber-200">
                      <div className="text-2xl sm:text-3xl font-bold text-amber-600">5</div>
                      <div className="text-xs sm:text-sm text-gray-600">Stages Mastered</div>
                    </div>
                    <div className="bg-white rounded-xl p-4 sm:p-6 border border-amber-200">
                      <div className="text-2xl sm:text-3xl font-bold text-amber-600">8</div>
                      <div className="text-xs sm:text-sm text-gray-600">Engines Optimized</div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl p-4 sm:p-6 border border-gray-200 max-w-xl mx-auto">
                    <div className="flex items-center gap-2 text-gray-700 mb-2">
                      <RefreshCw className="h-5 w-5 text-brand-orange" />
                      <span className="font-semibold">What's Next?</span>
                    </div>
                    <p className="text-sm text-gray-600">
                      Review your builds quarterly, refine what's working, and continue optimizing.
                      True mastery is continuous improvement.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              /* Normal Focus Section */
              <div className="bg-gradient-to-r from-brand-navy to-brand-navy-700 rounded-xl shadow-sm border-l-4 border-brand-orange p-4 sm:p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-brand-orange rounded-xl flex items-center justify-center">
                      <Target className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base sm:text-lg font-bold text-white">Your Focus: {currentStageInfo.name}</h2>
                        <span className="px-2 py-0.5 bg-white/20 text-white text-xs font-medium rounded-full">
                          {currentStageInfo.range}
                        </span>
                      </div>
                      <p className="text-sm text-white/70">
                        {priorityBuilds.length > 0
                          ? `${priorityBuilds.length} builds to complete in your stage and below`
                          : 'All builds complete in your current stage!'}
                      </p>
                    </div>
                  </div>
                  {priorityBuilds.length === 0 && (
                    <span className="flex items-center gap-1 text-brand-orange text-sm font-medium">
                      <Star className="h-4 w-4" />
                      Stage Complete
                    </span>
                  )}
                </div>

                {/* Priority Builds List */}
                {priorityBuilds.length > 0 && (
                  <div className="bg-white rounded-xl p-4 -mx-4 sm:-mx-6 -mb-4 sm:-mb-6">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                      Priority Builds
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-3">
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
                            className={`flex items-center gap-3 p-3 sm:p-4 rounded-xl border text-left transition-colors ${
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
                              className="w-4 h-4 accent-brand-orange rounded border-gray-300 focus:ring-brand-orange"
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
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
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
                            <EngineTooltip engine={engine}>
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
                            </EngineTooltip>
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
                              ? 'bg-brand-orange-50'
                              : isRelevant
                                ? ''
                                : 'opacity-50'
                          }`}
                        >
                          {/* Stage Name Column */}
                          <td className={`sticky left-0 z-10 p-3 border-r-2 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${
                            isCurrentStage
                              ? 'bg-brand-orange-50 border-l-4 border-l-brand-orange border-r-gray-300'
                              : isRelevant
                                ? 'bg-white border-r-gray-300'
                                : 'bg-gray-50 border-r-gray-300'
                          }`}>
                            <div>
                              <div className="flex items-center gap-2">
                                <div className="font-bold text-sm text-gray-900">{stage.name}</div>
                                {isCurrentStage && (
                                  <span className="px-1.5 py-0.5 bg-brand-navy text-white text-xs font-medium rounded">
                                    You
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-gray-600 mt-1">{stage.range}</div>
                              <div className={`text-xs mt-2 font-medium ${
                                stageStats.percentage === 100 ? 'text-amber-600' : 'text-brand-orange'
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
                                  isCurrentStage ? 'bg-brand-orange-50' : ''
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
            <div className="mt-6 sm:mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-6">
              {STAGES.map((stage) => {
                const isCurrentStage = stage.id === currentStageId
                const stageStats = getStageStats(stage.id)

                return (
                  <div
                    key={stage.id}
                    className={`bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 border-l-4 ${
                      isCurrentStage
                        ? 'border-l-brand-orange-500 ring-2 ring-brand-orange-200'
                        : stageStats.percentage === 100
                          ? 'border-l-amber-500'
                          : 'border-l-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-bold text-sm sm:text-base text-gray-900">{stage.name}</div>
                      {isCurrentStage && (
                        <span className="px-1.5 py-0.5 bg-brand-navy-50 text-brand-navy text-xs font-medium rounded">
                          Current
                        </span>
                      )}
                      {!isCurrentStage && stageStats.percentage === 100 && (
                        <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded">
                          Complete
                        </span>
                      )}
                    </div>
                    <div className="text-xs sm:text-sm text-gray-600 mb-3">{stage.range}</div>

                    {/* Progress */}
                    <div className="mb-3">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-600">Progress</span>
                        <span className="font-semibold">{stageStats.percentage}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${
                            stageStats.percentage === 100 ? 'bg-amber-500' : 'bg-brand-orange-500'
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
                            <span className="text-brand-orange-500 mt-0.5">•</span>
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
        </>
      )}

      {/* Build Detail Modal */}
      <BuildModal
        build={selectedBuild?.build || null}
        isOpen={!!selectedBuild}
        onClose={() => setSelectedBuild(null)}
        stageName={selectedBuild?.stageName || ''}
        engineName={selectedBuild?.engineName || ''}
        isComplete={selectedBuild ? isComplete(selectedBuild.build.name) : false}
        onToggleComplete={handleToggleSelectedBuild}
        checkAnswers={selectedBuild ? completionChecks[selectedBuild.build.name] || {} : {}}
        onCheckAnswersChange={(answers) => {
          if (selectedBuild) {
            saveCompletionChecks(selectedBuild.build.name, answers)
          }
        }}
        linkedFeature={selectedBuild ? BUILD_LINKS[selectedBuild.build.name] : undefined}
      />
    </div>
  )
}
