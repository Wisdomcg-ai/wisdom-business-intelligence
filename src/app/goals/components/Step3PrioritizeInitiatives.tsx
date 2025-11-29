'use client'

import { StrategicInitiative, InitiativeCategory } from '../types'
import { AlertCircle, Check, GripVertical, X, ChevronDown, ChevronUp } from 'lucide-react'
import { useState, useMemo } from 'react'
import { useRoadmapProgress } from '@/app/business-roadmap/hooks/useRoadmapProgress'
import { STAGES } from '@/app/business-roadmap/data'
import { CATEGORY_ORDER, getCategoryStyle, getCardClasses, SOURCE_STYLES } from '../utils/design-tokens'

interface Step3Props {
  strategicIdeas: StrategicInitiative[]
  twelveMonthInitiatives: StrategicInitiative[]
  setTwelveMonthInitiatives: (initiatives: StrategicInitiative[]) => void
  currentRevenue?: number
}

// Map roadmap engines to our category system
const ENGINE_TO_CATEGORY: Record<string, InitiativeCategory> = {
  'attract': 'marketing',
  'convert': 'operations',
  'deliver': 'customer_experience',
  'people': 'people',
  'systems': 'systems',
  'finance': 'finance',
  'leadership': 'product',
  'time': 'other'
}

export default function Step3PrioritizeInitiatives({
  strategicIdeas,
  twelveMonthInitiatives,
  setTwelveMonthInitiatives,
  currentRevenue = 0
}: Step3Props) {
  const [draggedInitiative, setDraggedInitiative] = useState<StrategicInitiative | null>(null)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [showBalance, setShowBalance] = useState(false)

  // Roadmap progress tracking
  const { completedBuilds, isComplete } = useRoadmapProgress()

  // Determine current stage based on revenue
  const getCurrentStage = () => {
    if (currentRevenue < 500000) return 'foundation'
    if (currentRevenue < 1000000) return 'traction'
    if (currentRevenue < 5000000) return 'growth'
    if (currentRevenue < 10000000) return 'scale'
    return 'mastery'
  }

  const currentStageId = getCurrentStage()
  const currentStageIndex = STAGES.findIndex(s => s.id === currentStageId)

  // Generate roadmap suggestions dynamically from STAGES data (same as Step 2)
  const roadmapSuggestions = useMemo(() => {
    const suggestions: StrategicInitiative[] = []
    const stagesToInclude = STAGES.slice(0, currentStageIndex + 1)

    stagesToInclude.forEach((stage, stageIdx) => {
      stage.builds.forEach(build => {
        const completed = isComplete(build.name)
        if (completed && stageIdx < currentStageIndex) return

        // Skip if already in strategic ideas (user manually added it)
        const alreadyInIdeas = strategicIdeas.some(idea => idea.title === build.name)
        if (alreadyInIdeas) return

        const category = ENGINE_TO_CATEGORY[build.engine] || 'misc'
        suggestions.push({
          id: `roadmap-${build.name.replace(/\s+/g, '-').toLowerCase()}`,
          title: build.name,
          description: build.outcome,
          notes: build.toDo.join('\n'),
          source: 'roadmap',
          category,
          order: suggestions.length
        })
      })
    })

    return suggestions
  }, [currentRevenue, currentStageIndex, completedBuilds, strategicIdeas, isComplete])

  // All available initiatives from Step 2 (user ideas + roadmap suggestions)
  const allAvailableInitiatives = useMemo(() => {
    return [...strategicIdeas, ...roadmapSuggestions]
  }, [strategicIdeas, roadmapSuggestions])

  const selectedCount = twelveMonthInitiatives.length
  const isOverLimit = selectedCount > 20
  const isInRange = selectedCount >= 12 && selectedCount <= 20

  // Available initiatives (exclude already selected)
  const availableInitiatives = useMemo(() => {
    return allAvailableInitiatives.filter(
      init => !twelveMonthInitiatives.some(selected => selected.id === init.id)
    )
  }, [allAvailableInitiatives, twelveMonthInitiatives])

  // Group available initiatives by category
  const initiativesByCategory = useMemo(() => {
    const grouped: Record<InitiativeCategory, StrategicInitiative[]> = {
      marketing: [],
      operations: [],
      finance: [],
      people: [],
      systems: [],
      product: [],
      customer_experience: [],
      other: [],
      misc: []
    }

    availableInitiatives.forEach(init => {
      const category = init.category || 'misc'
      grouped[category].push(init)
    })

    return grouped
  }, [availableInitiatives])

  // Calculate balance stats
  const balanceStats = useMemo(() => {
    const categoryCount: Partial<Record<InitiativeCategory, number>> = {}
    const sourceCount: { strategic_ideas: number; roadmap: number } = { strategic_ideas: 0, roadmap: 0 }

    twelveMonthInitiatives.forEach(init => {
      if (init.category) {
        categoryCount[init.category] = (categoryCount[init.category] || 0) + 1
      }
      if (init.source) {
        sourceCount[init.source] = (sourceCount[init.source] || 0) + 1
      }
    })

    const categoryDiversity = Object.keys(categoryCount).length

    return {
      categoryCount,
      sourceCount,
      categoryDiversity
    }
  }, [twelveMonthInitiatives])

  // Drag from category list to priority list
  const handleDragStartFromList = (initiative: StrategicInitiative) => {
    setDraggedInitiative(initiative)
  }

  const handleDragStartFromPriority = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  // Drop on priority list to add
  const handleDropOnPriority = () => {
    if (draggedInitiative && !twelveMonthInitiatives.some(i => i.id === draggedInitiative.id)) {
      setTwelveMonthInitiatives([
        ...twelveMonthInitiatives,
        { ...draggedInitiative, selected: true, order: twelveMonthInitiatives.length }
      ])
    }
    setDraggedInitiative(null)
  }

  // Reorder within priority list
  const handleDragOverInPriority = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault()
    e.stopPropagation()

    if (draggedIndex === null || draggedIndex === targetIndex) return

    const reordered = [...twelveMonthInitiatives]
    const draggedItem = reordered[draggedIndex]
    reordered.splice(draggedIndex, 1)
    reordered.splice(targetIndex, 0, draggedItem)

    const updated = reordered.map((init, idx) => ({ ...init, order: idx }))
    setTwelveMonthInitiatives(updated)
    setDraggedIndex(targetIndex)
  }

  const handleDragEnd = () => {
    setDraggedInitiative(null)
    setDraggedIndex(null)
  }

  const handleRemoveInitiative = (initiativeId: string) => {
    const updated = twelveMonthInitiatives
      .filter(item => item.id !== initiativeId)
      .map((init, idx) => ({ ...init, order: idx }))
    setTwelveMonthInitiatives(updated)
  }

  const handleClearAll = () => {
    setTwelveMonthInitiatives([])
  }

  return (
    <div className="space-y-6">
      {/* Header with Selection Status */}
      <div className="bg-gradient-to-r from-teal-50 to-slate-50 border-2 border-teal-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-sm font-semibold text-gray-900">
                Selected: <span className={`text-lg ${selectedCount === 0 ? 'text-gray-500' : isInRange ? 'text-green-600' : isOverLimit ? 'text-red-600' : 'text-amber-600'}`}>{selectedCount}</span> <span className="text-gray-600">of 12-20 initiatives</span>
              </p>
              <p className="text-xs text-gray-600 mt-1">
                Aim for 12-20 strategic initiatives for Year 1
              </p>
            </div>
            {isInRange && (
              <div className="flex items-center gap-1.5 px-3 py-1 bg-green-100 border border-green-300 rounded-full">
                <Check className="w-4 h-4 text-green-700" />
                <span className="text-sm font-medium text-green-700">Good selection!</span>
              </div>
            )}
            {isOverLimit && (
              <div className="flex items-center gap-1.5 px-3 py-1 bg-red-100 border border-red-300 rounded-full">
                <AlertCircle className="w-4 h-4 text-red-700" />
                <span className="text-sm font-medium text-red-700">Remove {selectedCount - 20}</span>
              </div>
            )}
            {selectedCount > 0 && selectedCount < 12 && (
              <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-100 border border-amber-300 rounded-full">
                <AlertCircle className="w-4 h-4 text-amber-700" />
                <span className="text-sm font-medium text-amber-700">Add {12 - selectedCount} more</span>
              </div>
            )}
          </div>

          {selectedCount > 0 && (
            <button
              onClick={handleClearAll}
              className="text-xs px-3 py-1.5 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors"
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Two Column Layout: Category List (Left) | Priority List (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT: Single Column Category List */}
        <div className="bg-white border-2 border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b-2 border-gray-200 sticky top-0 z-10">
            <h3 className="text-sm font-bold text-gray-900">
              Available Initiatives ({availableInitiatives.length})
            </h3>
            <p className="text-xs text-gray-600 mt-0.5">Drag initiatives to the priority list →</p>
          </div>

          {allAvailableInitiatives.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-gray-600">
                No initiatives yet. Go back to Step 2 to add strategic ideas and roadmap suggestions.
              </p>
            </div>
          ) : (
            <div className="max-h-[700px] overflow-y-auto">
              {CATEGORY_ORDER.map(category => {
                const initiatives = initiativesByCategory[category]
                const categoryStyle = getCategoryStyle(category)
                const count = initiatives.length

                return (
                  <div key={category} className="border-b border-gray-200 last:border-b-0">
                    {/* Category Header */}
                    <div className={`px-4 py-2.5 ${count > 0 ? categoryStyle.bgColor : 'bg-gray-50/50'} border-b border-gray-200`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{categoryStyle.emoji}</span>
                          <h4 className={`text-sm font-bold ${categoryStyle.textColor}`}>{categoryStyle.shortLabel}</h4>
                        </div>
                        {count > 0 && (
                          <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 bg-teal-600 text-white text-xs font-bold rounded-full">
                            {count}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Initiatives List */}
                    <div className="px-3 py-2">
                      {count === 0 ? (
                        <p className="text-xs text-gray-400 italic py-2 text-center">No initiatives in this category</p>
                      ) : (
                        <div className="space-y-2">
                          {initiatives.map(initiative => {
                            const isUserIdea = initiative.source === 'strategic_ideas'
                            const isDragging = draggedInitiative?.id === initiative.id
                            const cardStyles = getCardClasses(initiative.source, isDragging)
                            const sourceStyle = isUserIdea ? SOURCE_STYLES.user : SOURCE_STYLES.roadmap

                            return (
                              <div
                                key={initiative.id}
                                draggable
                                onDragStart={() => handleDragStartFromList(initiative)}
                                onDragEnd={handleDragEnd}
                                className={`group flex items-start gap-2 p-3 ${cardStyles.container}`}
                              >
                                <GripVertical className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
                                  isUserIdea ? 'text-slate-400 group-hover:text-slate-600' : 'text-teal-200 group-hover:text-white'
                                }`} />

                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm font-bold leading-tight ${cardStyles.text}`}>
                                    {initiative.title}
                                  </p>
                                  {initiative.description && (
                                    <p className={`text-xs mt-1.5 leading-relaxed line-clamp-2 ${cardStyles.subtext}`}>
                                      {initiative.description}
                                    </p>
                                  )}
                                  <span className={`inline-block mt-2 px-2 py-0.5 text-[10px] rounded font-semibold ${sourceStyle.bg} ${sourceStyle.text}`}>
                                    {sourceStyle.label}
                                  </span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* RIGHT: Priority List */}
        <div className="space-y-4">
          <div
            className="bg-white border-2 border-teal-300 rounded-lg overflow-hidden"
            onDragOver={handleDragOver}
            onDrop={handleDropOnPriority}
          >
            <div className="px-4 py-3 bg-teal-50 border-b-2 border-teal-200 sticky top-0 z-10">
              <h3 className="text-sm font-bold text-gray-900">
                Your Year 1 Priorities ({selectedCount}/20)
              </h3>
              <p className="text-xs text-gray-600 mt-0.5">Drag to reorder by priority</p>
            </div>

            <div className="p-4">
              {selectedCount === 0 ? (
                <div className="flex items-center justify-center h-[400px] border-2 border-dashed border-teal-300 rounded-lg bg-teal-50/50">
                  <div className="text-center text-gray-400">
                    <GripVertical className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium">Drag initiatives here</p>
                    <p className="text-xs mt-1">from the category list on the left</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 max-h-[700px] overflow-y-auto">
                  {twelveMonthInitiatives
                    .sort((a, b) => (a.order || 0) - (b.order || 0))
                    .map((initiative, index) => {
                      const categoryInfo = getCategoryStyle(initiative.category)
                      const isUserIdea = initiative.source === 'strategic_ideas'

                      return (
                        <div
                          key={initiative.id}
                          draggable
                          onDragStart={() => handleDragStartFromPriority(index)}
                          onDragOver={(e) => handleDragOverInPriority(e, index)}
                          onDragEnd={handleDragEnd}
                          className={`flex items-start gap-3 p-3 bg-white border-2 border-slate-200 rounded-lg hover:bg-teal-50 hover:border-teal-300 transition-all cursor-move ${
                            draggedIndex === index ? 'opacity-50' : ''
                          }`}
                        >
                          {/* Drag Handle */}
                          <GripVertical className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />

                          {/* Priority Number */}
                          <div className="flex items-center justify-center w-7 h-7 bg-teal-600 text-white rounded-full text-sm font-bold flex-shrink-0">
                            {index + 1}
                          </div>

                          {/* Category Emoji */}
                          <span className="text-lg flex-shrink-0" title={categoryInfo.label}>
                            {categoryInfo.emoji}
                          </span>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 leading-tight">{initiative.title}</p>
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className={`inline-block px-2 py-0.5 text-[10px] rounded font-semibold ${
                                isUserIdea
                                  ? `${SOURCE_STYLES.user.bg} ${SOURCE_STYLES.user.text}`
                                  : `${SOURCE_STYLES.roadmap.bg} ${SOURCE_STYLES.roadmap.text}`
                              }`}>
                                {isUserIdea ? SOURCE_STYLES.user.label : SOURCE_STYLES.roadmap.label}
                              </span>
                              <span className={`text-xs ${categoryInfo.textColor} font-medium`}>
                                {categoryInfo.shortLabel}
                              </span>
                            </div>
                          </div>

                          {/* Remove Button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleRemoveInitiative(initiative.id)
                            }}
                            className="text-gray-400 hover:text-red-600 transition-colors flex-shrink-0"
                            title="Remove from priority list"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )
                    })}
                </div>
              )}
            </div>
          </div>

          {/* Balance Stats - Collapsible */}
          {selectedCount > 0 && (
            <div className="bg-white border-2 border-teal-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setShowBalance(!showBalance)}
                className="w-full px-4 py-3 bg-teal-50 border-b-2 border-teal-100 flex items-center justify-between hover:bg-teal-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-bold text-gray-900">Balance & Distribution</h3>
                  <div className="flex items-center gap-3 text-xs text-gray-700">
                    <div className="flex items-center gap-1">
                      <span className="font-semibold">{balanceStats.categoryDiversity}</span>
                      <span>categories</span>
                    </div>
                    <span className="text-gray-300">•</span>
                    <div className="flex items-center gap-1">
                      <span className="font-semibold">{balanceStats.sourceCount.strategic_ideas}</span>
                      <span>your ideas</span>
                    </div>
                    <span className="text-gray-300">•</span>
                    <div className="flex items-center gap-1">
                      <span className="font-semibold">{balanceStats.sourceCount.roadmap}</span>
                      <span>roadmap</span>
                    </div>
                  </div>
                </div>
                {showBalance ? <ChevronUp className="w-4 h-4 text-gray-600" /> : <ChevronDown className="w-4 h-4 text-gray-600" />}
              </button>

              {showBalance && (
                <div className="p-4">
                  <div className="space-y-4">
                    {/* Category Distribution */}
                    <div>
                      <p className="text-xs font-bold text-gray-700 mb-2 uppercase">Category Distribution</p>
                      <div className="space-y-1.5">
                        {Object.entries(balanceStats.categoryCount).map(([category, count]) => {
                          const catStyle = getCategoryStyle(category as InitiativeCategory)
                          return (
                            <div key={category} className="flex items-center justify-between p-2 border rounded-lg bg-gray-50">
                              <div className="flex items-center gap-2">
                                <span className="text-base">{catStyle.emoji}</span>
                                <span className="text-xs text-gray-700">{catStyle.shortLabel}</span>
                              </div>
                              <span className="text-sm font-bold text-gray-900">{count}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* Balance Assessment */}
                    <div className="pt-3 border-t border-gray-200">
                      {balanceStats.categoryDiversity >= 4 ? (
                        <p className="text-sm text-green-600 font-medium">
                          ✓ Well balanced across {balanceStats.categoryDiversity} business areas
                        </p>
                      ) : balanceStats.categoryDiversity >= 2 ? (
                        <p className="text-sm text-amber-600 font-medium">
                          ⚠ Consider adding diversity across more categories (currently {balanceStats.categoryDiversity})
                        </p>
                      ) : (
                        <p className="text-sm text-red-600 font-medium">
                          ⚠ Too concentrated - spread initiatives across multiple categories
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
