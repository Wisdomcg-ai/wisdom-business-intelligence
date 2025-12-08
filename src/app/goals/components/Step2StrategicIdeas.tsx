'use client'

import { StrategicInitiative, InitiativeCategory } from '../types'
import { Plus, X, HelpCircle, Map } from 'lucide-react'
import { useState, useMemo } from 'react'
import RoadmapSelectorModal from './RoadmapSelectorModal'

interface Step2Props {
  strategicIdeas: StrategicInitiative[]
  setStrategicIdeas: (ideas: StrategicInitiative[]) => void
  currentRevenue?: number
}

const generateId = () => `idea-${Date.now()}-${Math.random()}`

// Map roadmap engines to our category system - professional slate/teal palette
const ENGINES = [
  {
    id: 'marketing' as InitiativeCategory,
    name: 'Attract',
    subtitle: 'Marketing & Lead Generation',
    emoji: '📢',
    color: 'border-slate-200 bg-gray-50'
  },
  {
    id: 'operations' as InitiativeCategory,
    name: 'Convert',
    subtitle: 'Sales & Closing',
    emoji: '🛒',
    color: 'border-slate-200 bg-gray-50'
  },
  {
    id: 'customer_experience' as InitiativeCategory,
    name: 'Deliver',
    subtitle: 'Client Experience & Results',
    emoji: '❤️',
    color: 'border-slate-200 bg-gray-50'
  },
  {
    id: 'people' as InitiativeCategory,
    name: 'People',
    subtitle: 'Team, Culture, Hiring',
    emoji: '👥',
    color: 'border-slate-200 bg-gray-50'
  },
  {
    id: 'systems' as InitiativeCategory,
    name: 'Systems',
    subtitle: 'Operations, Process, Tech',
    emoji: '💻',
    color: 'border-slate-200 bg-gray-50'
  },
  {
    id: 'finance' as InitiativeCategory,
    name: 'Finance',
    subtitle: 'Money, Metrics, Wealth',
    emoji: '💰',
    color: 'border-slate-200 bg-gray-50'
  },
  {
    id: 'product' as InitiativeCategory,
    name: 'Leadership',
    subtitle: 'Vision, Strategy, You',
    emoji: '👑',
    color: 'border-slate-200 bg-gray-50'
  },
  {
    id: 'other' as InitiativeCategory,
    name: 'Time',
    subtitle: 'Freedom, Productivity, Leverage',
    emoji: '⏱️',
    color: 'border-slate-200 bg-gray-50'
  },
  {
    id: 'misc' as InitiativeCategory,
    name: 'Other',
    subtitle: 'Miscellaneous & Uncategorized',
    emoji: '📋',
    color: 'border-slate-200 bg-gray-50'
  }
]

export default function Step2StrategicIdeas({
  strategicIdeas = [],
  setStrategicIdeas,
  currentRevenue = 0
}: Step2Props) {
  const [newTitle, setNewTitle] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [newEngine, setNewEngine] = useState<InitiativeCategory>('marketing')
  const [validationError, setValidationError] = useState('')
  const [isRoadmapModalOpen, setIsRoadmapModalOpen] = useState(false)

  // Group ideas by engine (user ideas only, no auto-populated roadmap suggestions)
  const ideasByEngine = useMemo(() => {
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

    // Group user ideas
    strategicIdeas.forEach(idea => {
      const category = idea.category || 'misc'
      grouped[category].push(idea)
    })

    return grouped
  }, [strategicIdeas])

  // Count items from roadmap vs user-created
  const roadmapCount = strategicIdeas.filter(i => i.source === 'roadmap').length
  const userCount = strategicIdeas.filter(i => i.source !== 'roadmap').length

  const handleAddIdea = () => {
    if (!newTitle.trim()) {
      setValidationError('Please enter a title for your idea')
      return
    }

    if (newTitle.length > 200) {
      setValidationError('Title must be 200 characters or less')
      return
    }

    const isDuplicate = strategicIdeas.some(
      idea => idea.title.toLowerCase().trim() === newTitle.toLowerCase().trim()
    )

    if (isDuplicate) {
      setValidationError('This idea already exists')
      return
    }

    const newIdea: StrategicInitiative = {
      id: generateId(),
      title: newTitle.trim(),
      description: newNotes.trim() || undefined,
      category: newEngine,
      source: 'strategic_ideas',
      order: strategicIdeas.length
    }

    setStrategicIdeas([...strategicIdeas, newIdea])
    setNewTitle('')
    setNewNotes('')
    setValidationError('')
  }

  const handleRemoveIdea = (ideaId: string) => {
    setStrategicIdeas(strategicIdeas.filter(idea => idea.id !== ideaId))
  }

  const handleAddFromRoadmap = (items: StrategicInitiative[]) => {
    // Add roadmap items with proper ordering
    const newItems = items.map((item, idx) => ({
      ...item,
      order: strategicIdeas.length + idx
    }))
    setStrategicIdeas([...strategicIdeas, ...newItems])
  }

  return (
    <div className="space-y-6">
      {/* Task Banner */}
      <div className="bg-gradient-to-r from-brand-orange to-brand-orange-700 rounded-lg p-4 text-white">
        <p className="text-base font-medium">
          📋 <strong>YOUR TASK:</strong> Brainstorm ALL ideas that could help achieve your targets - don't filter yet
        </p>
        <p className="text-sm text-brand-orange-100 mt-1">
          Capture everything that could move your business forward. We'll prioritize in the next step.
        </p>
      </div>

      {/* Add New Idea Form */}
      <div className="bg-white border-2 border-brand-orange-200 rounded-lg p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Add Strategic Idea</h3>

        <div className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => {
                setNewTitle(e.target.value)
                setValidationError('')
              }}
              placeholder="What strategic initiative do you want to implement?"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange text-sm"
              maxLength={200}
            />
            <p className="text-xs text-gray-500 mt-1">{newTitle.length}/200 characters</p>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes (Optional)
            </label>
            <textarea
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="Add context, rationale, or details..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange text-sm resize-none"
            />
          </div>

          {/* Engine Selection + Add Button */}
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                Business Engine <span className="text-red-500">*</span>
                <div className="relative group">
                  <HelpCircle className="w-4 h-4 text-gray-400 cursor-help" />
                  <div className="absolute left-6 bottom-0 w-72 p-3 bg-slate-800 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                    <strong className="block mb-1">Business Engines</strong>
                    Your business runs on 8 key engines: Attract (marketing), Convert (sales), Deliver (service), People, Systems, Finance, Leadership, and Time. Categorizing ideas helps you see which areas need the most attention.
                  </div>
                </div>
              </label>
              <select
                value={newEngine}
                onChange={(e) => setNewEngine(e.target.value as InitiativeCategory)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange text-sm"
              >
                {ENGINES.map(engine => (
                  <option key={engine.id} value={engine.id}>
                    {engine.emoji} {engine.name} - {engine.subtitle}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleAddIdea}
              className="px-6 py-2 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 font-medium transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Idea
            </button>
          </div>

          {/* Validation Error */}
          {validationError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{validationError}</p>
            </div>
          )}
        </div>
      </div>

      {/* Summary + Add from Roadmap Button */}
      <div className="bg-gradient-to-r from-brand-orange-50 to-brand-orange-50 border border-brand-orange-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900">
              Total Ideas: <span className="text-lg text-brand-orange">{strategicIdeas.length}</span>
              {strategicIdeas.length > 0 && (
                <span className="text-gray-500 ml-2 font-normal">
                  ({userCount} your ideas, {roadmapCount} from roadmap)
                </span>
              )}
            </p>
            <p className="text-xs text-gray-600 mt-1">
              Organize your strategic initiatives by business engine
            </p>
          </div>
          <button
            onClick={() => setIsRoadmapModalOpen(true)}
            className="px-4 py-2 bg-brand-navy text-white rounded-lg hover:bg-brand-navy-700 font-medium transition-colors flex items-center gap-2 text-sm"
          >
            <Map className="w-4 h-4" />
            Add from Roadmap
          </button>
        </div>
      </div>

      {/* 9-Grid Layout by Engine */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {ENGINES.map(engine => {
          const userIdeas = ideasByEngine[engine.id]
          const totalCount = userIdeas.length

          return (
            <div
              key={engine.id}
              className={`border-2 rounded-lg overflow-hidden min-h-[300px] flex flex-col ${engine.color}`}
            >
              {/* Engine Header */}
              <div className="p-4 bg-white border-b-2 border-gray-200">
                <div className="flex items-start gap-3">
                  <span className="text-3xl">{engine.emoji}</span>
                  <div className="flex-1">
                    <h4 className="font-bold text-gray-900">{engine.name}</h4>
                    <p className="text-xs text-gray-600">{engine.subtitle}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {totalCount} idea{totalCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
              </div>

              {/* Ideas List */}
              <div className="p-3 space-y-2 max-h-[400px] overflow-y-auto bg-white flex-1">
                {totalCount === 0 ? (
                  <div className="p-6 text-center h-full flex items-center justify-center">
                    <div>
                      <p className="text-sm text-gray-400">No ideas yet</p>
                      <p className="text-xs text-gray-400 mt-1">Add ideas above or select from roadmap</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* User Ideas */}
                    {userIdeas.map(idea => {
                      const isFromRoadmap = idea.source === 'roadmap'

                      return (
                        <div
                          key={idea.id}
                          className={`p-4 border-2 rounded-lg shadow-sm hover:shadow-md transition-all ${
                            isFromRoadmap
                              ? 'bg-brand-navy text-white border-brand-navy hover:bg-brand-navy-700'
                              : 'bg-white border-slate-200 hover:border-brand-orange-300'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className={`text-base font-bold leading-snug ${
                                isFromRoadmap ? 'text-white' : 'text-brand-navy'
                              }`}>
                                {idea.title}
                              </p>
                              {idea.description && (
                                <p className={`text-sm mt-2 leading-relaxed ${
                                  isFromRoadmap ? 'text-white/80' : 'text-gray-600'
                                }`}>
                                  {idea.description}
                                </p>
                              )}
                              <span className={`inline-block mt-3 px-2.5 py-1 text-xs rounded-md font-semibold shadow-sm ${
                                isFromRoadmap
                                  ? 'bg-white/20 text-white'
                                  : 'bg-slate-800 text-white'
                              }`}>
                                {isFromRoadmap ? 'FROM ROADMAP' : 'YOUR IDEA'}
                              </span>
                            </div>
                            <button
                              onClick={() => handleRemoveIdea(idea.id)}
                              className={`transition-colors flex-shrink-0 ${
                                isFromRoadmap
                                  ? 'text-white/60 hover:text-white'
                                  : 'text-slate-400 hover:text-red-600'
                              }`}
                              title="Remove idea"
                            >
                              <X className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Roadmap Selector Modal */}
      <RoadmapSelectorModal
        isOpen={isRoadmapModalOpen}
        onClose={() => setIsRoadmapModalOpen(false)}
        onAddItems={handleAddFromRoadmap}
        existingIdeas={strategicIdeas}
        currentRevenue={currentRevenue}
      />
    </div>
  )
}
