'use client'

import { StrategicInitiative, InitiativeCategory } from '../types'
import { X, ChevronDown, ChevronUp, Plus, Check, Map } from 'lucide-react'
import { useState, useMemo } from 'react'
import { useRoadmapProgress } from '@/app/business-roadmap/hooks/useRoadmapProgress'
import { STAGES } from '@/app/business-roadmap/data'

interface RoadmapSelectorModalProps {
  isOpen: boolean
  onClose: () => void
  onAddItems: (items: StrategicInitiative[]) => void
  existingIdeas: StrategicInitiative[]
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

const ENGINE_LABELS: Record<string, { name: string; emoji: string }> = {
  'attract': { name: 'Attract', emoji: '📢' },
  'convert': { name: 'Convert', emoji: '🛒' },
  'deliver': { name: 'Deliver', emoji: '❤️' },
  'people': { name: 'People', emoji: '👥' },
  'systems': { name: 'Systems', emoji: '💻' },
  'finance': { name: 'Finance', emoji: '💰' },
  'leadership': { name: 'Leadership', emoji: '👑' },
  'time': { name: 'Time', emoji: '⏱️' }
}

const STAGE_COLORS: Record<string, string> = {
  'foundation': 'bg-blue-50 border-blue-200 text-blue-800',
  'traction': 'bg-green-50 border-green-200 text-green-800',
  'growth': 'bg-amber-50 border-amber-200 text-amber-800',
  'scale': 'bg-purple-50 border-purple-200 text-purple-800',
  'mastery': 'bg-rose-50 border-rose-200 text-rose-800'
}

export default function RoadmapSelectorModal({
  isOpen,
  onClose,
  onAddItems,
  existingIdeas,
  currentRevenue = 0
}: RoadmapSelectorModalProps) {
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set())
  const [filterEngine, setFilterEngine] = useState<string>('all')

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

  // Generate roadmap items organized by stage
  const roadmapByStage = useMemo(() => {
    const stageMap: Record<string, {
      stageId: string
      stageName: string
      stageRange: string
      items: Array<{
        id: string
        name: string
        outcome: string
        toDo: string[]
        engine: string
        category: InitiativeCategory
        isComplete: boolean
        isAlreadyAdded: boolean
        isCurrent: boolean
      }>
    }> = {}

    // Get stages up to and including current stage
    const stagesToShow = STAGES.slice(0, currentStageIndex + 1)

    stagesToShow.forEach((stage, stageIdx) => {
      const stageItems: typeof stageMap[string]['items'] = []

      stage.builds.forEach(build => {
        const completed = isComplete(build.name)
        const alreadyAdded = existingIdeas.some(idea => idea.title === build.name)
        const category = ENGINE_TO_CATEGORY[build.engine] || 'misc'

        // Filter by engine if selected
        if (filterEngine !== 'all' && build.engine !== filterEngine) return

        stageItems.push({
          id: `roadmap-${build.name.replace(/\s+/g, '-').toLowerCase()}`,
          name: build.name,
          outcome: build.outcome,
          toDo: build.toDo,
          engine: build.engine,
          category,
          isComplete: completed,
          isAlreadyAdded: alreadyAdded,
          isCurrent: stageIdx === currentStageIndex
        })
      })

      if (stageItems.length > 0) {
        stageMap[stage.id] = {
          stageId: stage.id,
          stageName: stage.name,
          stageRange: stage.range,
          items: stageItems
        }
      }
    })

    return stageMap
  }, [currentRevenue, currentStageIndex, completedBuilds, existingIdeas, isComplete, filterEngine])

  // Auto-expand current stage
  useMemo(() => {
    if (isOpen) {
      setExpandedStages(new Set([currentStageId]))
    }
  }, [isOpen, currentStageId])

  const toggleStage = (stageId: string) => {
    const newExpanded = new Set(expandedStages)
    if (newExpanded.has(stageId)) {
      newExpanded.delete(stageId)
    } else {
      newExpanded.add(stageId)
    }
    setExpandedStages(newExpanded)
  }

  const toggleItem = (itemId: string) => {
    const newSelected = new Set(selectedItems)
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId)
    } else {
      newSelected.add(itemId)
    }
    setSelectedItems(newSelected)
  }

  const handleAddSelected = () => {
    const itemsToAdd: StrategicInitiative[] = []

    Object.values(roadmapByStage).forEach(stage => {
      stage.items.forEach(item => {
        if (selectedItems.has(item.id) && !item.isAlreadyAdded) {
          itemsToAdd.push({
            id: item.id,
            title: item.name,
            description: item.outcome,
            notes: item.toDo.join('\n'),
            source: 'roadmap',
            category: item.category,
            order: 0
          })
        }
      })
    })

    onAddItems(itemsToAdd)
    setSelectedItems(new Set())
    onClose()
  }

  const availableEngines = useMemo(() => {
    const engines = new Set<string>()
    Object.values(roadmapByStage).forEach(stage => {
      stage.items.forEach(item => engines.add(item.engine))
    })
    return Array.from(engines)
  }, [roadmapByStage])

  if (!isOpen) return null

  const totalAvailable = Object.values(roadmapByStage).reduce(
    (acc, stage) => acc + stage.items.filter(i => !i.isAlreadyAdded).length,
    0
  )

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-3xl bg-white rounded-xl shadow-2xl max-h-[85vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-brand-navy to-brand-navy-700 rounded-t-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center">
                <Map className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Add from Business Roadmap</h2>
                <p className="text-sm text-white/70">
                  Select items to add to your strategic ideas ({totalAvailable} available)
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/70 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Filter Bar */}
          <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-700">Filter by engine:</span>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setFilterEngine('all')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                    filterEngine === 'all'
                      ? 'bg-brand-orange text-white'
                      : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  All
                </button>
                {availableEngines.map(engine => {
                  const label = ENGINE_LABELS[engine] || { name: engine, emoji: '📋' }
                  return (
                    <button
                      key={engine}
                      onClick={() => setFilterEngine(engine)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                        filterEngine === engine
                          ? 'bg-brand-orange text-white'
                          : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {label.emoji} {label.name}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-4">
              {Object.values(roadmapByStage).reverse().map(stage => {
                const isExpanded = expandedStages.has(stage.stageId)
                const availableInStage = stage.items.filter(i => !i.isAlreadyAdded).length
                const selectedInStage = stage.items.filter(i => selectedItems.has(i.id) && !i.isAlreadyAdded).length
                const isCurrent = stage.stageId === currentStageId

                return (
                  <div
                    key={stage.stageId}
                    className={`border-2 rounded-lg overflow-hidden ${
                      isCurrent ? 'border-brand-orange' : 'border-gray-200'
                    }`}
                  >
                    {/* Stage Header */}
                    <button
                      onClick={() => toggleStage(stage.stageId)}
                      className={`w-full px-4 py-3 flex items-center justify-between ${
                        isCurrent ? 'bg-brand-orange-50' : 'bg-gray-50'
                      } hover:bg-gray-100 transition-colors`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`px-2.5 py-1 text-xs font-bold rounded ${STAGE_COLORS[stage.stageId]}`}>
                          {stage.stageName}
                        </span>
                        <span className="text-sm text-gray-600">{stage.stageRange}</span>
                        {isCurrent && (
                          <span className="px-2 py-0.5 text-xs font-semibold bg-brand-orange text-white rounded-full">
                            Your Stage
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-600">
                          {availableInStage} available
                          {selectedInStage > 0 && (
                            <span className="ml-2 text-brand-orange font-semibold">
                              ({selectedInStage} selected)
                            </span>
                          )}
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-gray-500" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-gray-500" />
                        )}
                      </div>
                    </button>

                    {/* Stage Items */}
                    {isExpanded && (
                      <div className="p-4 space-y-2 bg-white">
                        {stage.items.length === 0 ? (
                          <p className="text-sm text-gray-500 text-center py-4">
                            No items match the current filter
                          </p>
                        ) : (
                          stage.items.map(item => {
                            const isSelected = selectedItems.has(item.id)
                            const engineLabel = ENGINE_LABELS[item.engine] || { name: item.engine, emoji: '📋' }

                            return (
                              <div
                                key={item.id}
                                className={`p-4 border-2 rounded-lg transition-all ${
                                  item.isAlreadyAdded
                                    ? 'bg-gray-50 border-gray-200 opacity-60'
                                    : isSelected
                                    ? 'bg-brand-orange-50 border-brand-orange'
                                    : 'bg-white border-gray-200 hover:border-brand-orange-300 cursor-pointer'
                                }`}
                                onClick={() => !item.isAlreadyAdded && toggleItem(item.id)}
                              >
                                <div className="flex items-start gap-3">
                                  {/* Checkbox */}
                                  <div className="flex-shrink-0 mt-0.5">
                                    {item.isAlreadyAdded ? (
                                      <div className="w-5 h-5 rounded bg-green-100 flex items-center justify-center">
                                        <Check className="w-3.5 h-3.5 text-green-600" />
                                      </div>
                                    ) : isSelected ? (
                                      <div className="w-5 h-5 rounded bg-brand-orange flex items-center justify-center">
                                        <Check className="w-3.5 h-3.5 text-white" />
                                      </div>
                                    ) : (
                                      <div className="w-5 h-5 rounded border-2 border-gray-300" />
                                    )}
                                  </div>

                                  {/* Content */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className={`font-semibold ${item.isAlreadyAdded ? 'text-gray-500' : 'text-gray-900'}`}>
                                        {item.name}
                                      </p>
                                      <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                                        {engineLabel.emoji} {engineLabel.name}
                                      </span>
                                      {item.isComplete && (
                                        <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded font-medium">
                                          Completed
                                        </span>
                                      )}
                                      {item.isAlreadyAdded && (
                                        <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded font-medium">
                                          Already Added
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-sm text-gray-600 mt-1">{item.outcome}</p>
                                  </div>
                                </div>
                              </div>
                            )
                          })
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">
                {selectedItems.size} item{selectedItems.size !== 1 ? 's' : ''} selected
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddSelected}
                  disabled={selectedItems.size === 0}
                  className={`px-4 py-2 text-sm font-medium rounded-lg flex items-center gap-2 transition-colors ${
                    selectedItems.size > 0
                      ? 'bg-brand-orange text-white hover:bg-brand-orange-600'
                      : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  <Plus className="w-4 h-4" />
                  Add {selectedItems.size > 0 ? selectedItems.size : ''} to Ideas
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
