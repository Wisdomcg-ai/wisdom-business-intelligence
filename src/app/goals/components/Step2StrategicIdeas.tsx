'use client'

import { StrategicInitiative, InitiativeCategory, IdeaType } from '../types'
import { Plus, X, HelpCircle, Map, Edit2, Lightbulb } from 'lucide-react'
import { useState, useMemo } from 'react'
import RoadmapSelectorModal from './RoadmapSelectorModal'

interface Step2Props {
  strategicIdeas: StrategicInitiative[]
  setStrategicIdeas: (ideas: StrategicInitiative[]) => void
  currentRevenue?: number
}

const generateId = () => `idea-${Date.now()}-${Math.random()}`

// Educational content about idea types - enhanced for SMB owners
const IDEA_TYPE_INFO = {
  strategic: {
    label: 'Strategic Ideas',
    shortLabel: 'Projects',
    description: 'One-off projects with a clear start and end. These have a defined outcome and deadline.',
    keyQuestion: 'Will this be "done" at some point?',
    examples: [
      'Launch a new website',
      'Hire a sales manager',
      'Implement a CRM system',
      'Create employee handbook',
      'Build referral program'
    ],
    color: 'bg-brand-orange text-white',
    borderColor: 'border-brand-orange'
  },
  operational: {
    label: 'Operational Ideas',
    shortLabel: 'Habits',
    description: 'Recurring activities that become ongoing routines. These happen regularly without an end date.',
    keyQuestion: 'Will this be ongoing/repeated?',
    examples: [
      'Write and publish weekly content',
      'Post regularly on social media',
      'Record and share video content',
      'Weekly sales pipeline review',
      'Daily lead follow-up routine'
    ],
    color: 'bg-white text-gray-800 border-gray-300',
    borderColor: 'border-gray-300'
  }
}

// Coaching tips for this step
const COACHING_TIPS = [
  {
    title: 'Quantity over quality (for now)',
    tip: 'Don\'t filter yourself - capture every idea. We\'ll prioritize in the next step.'
  },
  {
    title: 'Think across all business areas',
    tip: 'Review each engine category. What\'s missing? What\'s broken? What would help?'
  },
  {
    title: 'Strategic vs Operational',
    tip: 'Ask: "Is this a project I\'ll complete, or a habit I\'ll maintain?" Projects have end dates, habits don\'t.'
  },
  {
    title: 'Consider your targets',
    tip: 'Look at your Year 1 goals. What needs to happen to achieve them?'
  }
]

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
  const [newIdeaType, setNewIdeaType] = useState<IdeaType>('strategic')
  const [validationError, setValidationError] = useState('')
  const [isRoadmapModalOpen, setIsRoadmapModalOpen] = useState(false)
  const [isCoachingTipsOpen, setIsCoachingTipsOpen] = useState(false)

  // Edit modal state
  const [editingIdea, setEditingIdea] = useState<StrategicInitiative | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editEngine, setEditEngine] = useState<InitiativeCategory>('marketing')
  const [editIdeaType, setEditIdeaType] = useState<IdeaType>('strategic')
  const [editValidationError, setEditValidationError] = useState('')

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
      ideaType: newIdeaType,
      order: strategicIdeas.length
    }

    setStrategicIdeas([...strategicIdeas, newIdea])
    setNewTitle('')
    setNewNotes('')
    setNewIdeaType('strategic')
    setValidationError('')
  }

  const handleRemoveIdea = (ideaId: string) => {
    setStrategicIdeas(strategicIdeas.filter(idea => idea.id !== ideaId))
  }

  // Open edit modal
  const handleEditIdea = (idea: StrategicInitiative) => {
    setEditingIdea(idea)
    setEditTitle(idea.title)
    setEditNotes(idea.description || '')
    setEditEngine(idea.category || 'misc')
    setEditIdeaType(idea.ideaType || 'strategic')
    setEditValidationError('')
  }

  // Save edited idea
  const handleSaveEdit = () => {
    if (!editingIdea) return

    if (!editTitle.trim()) {
      setEditValidationError('Please enter a title for your idea')
      return
    }

    if (editTitle.length > 200) {
      setEditValidationError('Title must be 200 characters or less')
      return
    }

    // Check for duplicate (excluding the idea being edited)
    const isDuplicate = strategicIdeas.some(
      idea => idea.id !== editingIdea.id &&
              idea.title.toLowerCase().trim() === editTitle.toLowerCase().trim()
    )

    if (isDuplicate) {
      setEditValidationError('An idea with this title already exists')
      return
    }

    const updatedIdeas = strategicIdeas.map(idea => {
      if (idea.id === editingIdea.id) {
        return {
          ...idea,
          title: editTitle.trim(),
          description: editNotes.trim() || undefined,
          category: editEngine,
          ideaType: editIdeaType
        }
      }
      return idea
    })

    setStrategicIdeas(updatedIdeas)
    setEditingIdea(null)
  }

  // Cancel edit
  const handleCancelEdit = () => {
    setEditingIdea(null)
    setEditValidationError('')
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
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-base font-medium">
              📋 <strong>YOUR TASK:</strong> Brainstorm ALL ideas that could help achieve your targets - both strategic AND operational
            </p>
            <p className="text-sm text-brand-orange-100 mt-1">
              Capture everything that could move your business forward. We&apos;ll prioritize in the next step.
            </p>
          </div>
          <button
            onClick={() => setIsCoachingTipsOpen(true)}
            className="flex-shrink-0 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
          >
            💡 Tips
          </button>
        </div>
      </div>

      {/* Educational: Strategic vs Operational - Collapsible */}
      <details className="bg-slate-50 border border-slate-200 rounded-lg overflow-hidden">
        <summary className="p-4 cursor-pointer hover:bg-slate-100 transition-colors flex items-center gap-3">
          <Lightbulb className="w-5 h-5 text-brand-orange flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-gray-900">Strategic Ideas vs Operational Ideas</p>
            <p className="text-xs text-gray-600">Ask yourself: <strong>&quot;Is this a project I&apos;ll complete, or a habit I&apos;ll maintain?&quot;</strong></p>
          </div>
          <span className="text-xs text-gray-500">(click to expand)</span>
        </summary>
        <div className="px-4 pb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Strategic Ideas = Projects */}
              <div className="p-3 bg-brand-orange/10 border border-brand-orange/30 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 bg-brand-orange text-white text-xs font-bold rounded">STRATEGIC</span>
                  <span className="text-xs text-gray-500">= Projects</span>
                </div>
                <p className="text-xs text-gray-700 font-medium mb-2">{IDEA_TYPE_INFO.strategic.keyQuestion}</p>
                <p className="text-xs text-gray-600">{IDEA_TYPE_INFO.strategic.description}</p>
                <div className="mt-2 pt-2 border-t border-brand-orange/20">
                  <p className="text-xs text-gray-500 font-medium mb-1">Examples:</p>
                  <ul className="text-xs text-gray-600 space-y-0.5">
                    {IDEA_TYPE_INFO.strategic.examples.slice(0, 3).map((ex, i) => (
                      <li key={i}>• {ex}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Operational Ideas = Habits */}
              <div className="p-3 bg-gray-100 border border-gray-300 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 bg-gray-600 text-white text-xs font-bold rounded">OPERATIONAL</span>
                  <span className="text-xs text-gray-500">= Habits</span>
                </div>
                <p className="text-xs text-gray-700 font-medium mb-2">{IDEA_TYPE_INFO.operational.keyQuestion}</p>
                <p className="text-xs text-gray-600">{IDEA_TYPE_INFO.operational.description}</p>
                <div className="mt-2 pt-2 border-t border-gray-300">
                  <p className="text-xs text-gray-500 font-medium mb-1">Examples (Marketing, Sales, Systems):</p>
                  <ul className="text-xs text-gray-600 space-y-0.5">
                    {IDEA_TYPE_INFO.operational.examples.slice(0, 3).map((ex, i) => (
                      <li key={i}>• {ex}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Key Teaching Insight */}
            <div className="mt-3 p-3 bg-amber-50 border-2 border-amber-300 rounded-lg">
              <div className="flex items-start gap-2">
                <span className="text-lg">💡</span>
                <div>
                  <p className="text-sm font-bold text-amber-800">Pro Tip: First time = Project. After that = Habit.</p>
                  <p className="text-xs text-amber-700 mt-1">
                    The first time you do something (like creating a content system) it&apos;s a <strong>strategic project</strong>.
                    But once it&apos;s set up, doing it regularly (like posting weekly content) becomes an <strong>operational habit</strong>.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
              <strong>Where do they go?</strong> Strategic ideas (projects) flow to Steps 3-6 for detailed planning. Operational ideas (habits) go to your operational rhythm.
            </div>
        </div>
      </details>

      {/* Coaching Tips Modal */}
      {isCoachingTipsOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black/50" onClick={() => setIsCoachingTipsOpen(false)} />
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-brand-orange to-brand-orange-700 rounded-t-xl">
                <div className="flex items-center gap-2">
                  <span className="text-xl">💡</span>
                  <h2 className="text-lg font-bold text-white">Coaching Tips</h2>
                </div>
                <button
                  onClick={() => setIsCoachingTipsOpen(false)}
                  className="text-white/70 hover:text-white transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto">
                {COACHING_TIPS.map((tip, index) => (
                  <div key={index} className="p-3 bg-slate-50 border border-gray-200 rounded-lg">
                    <p className="text-sm font-semibold text-gray-800 mb-1">{tip.title}</p>
                    <p className="text-xs text-gray-600">{tip.tip}</p>
                  </div>
                ))}
              </div>
              <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
                <button
                  onClick={() => setIsCoachingTipsOpen(false)}
                  className="w-full px-4 py-2 bg-brand-orange text-white font-medium rounded-lg hover:bg-brand-orange-600 transition-colors"
                >
                  Got it!
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add New Idea Form */}
      <div className="bg-white border-2 border-brand-orange-200 rounded-lg p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Add New Idea</h3>

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
              placeholder="What initiative do you want to implement?"
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

          {/* Engine Selection + Idea Type - Side by Side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Business Engine */}
            <div>
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
                className="w-full h-[42px] px-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange text-sm"
              >
                {ENGINES.map(engine => (
                  <option key={engine.id} value={engine.id}>
                    {engine.emoji} {engine.name} - {engine.subtitle}
                  </option>
                ))}
              </select>
            </div>

            {/* Idea Type - Strategic vs Operational */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Type <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2 h-[42px]">
                <button
                  type="button"
                  onClick={() => setNewIdeaType('strategic')}
                  className={`flex-1 px-3 rounded-lg border text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                    newIdeaType === 'strategic'
                      ? 'bg-brand-orange text-white border-brand-orange'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-brand-orange-300'
                  }`}
                >
                  <span className="font-semibold">Strategic</span>
                  <span className={`text-xs ${newIdeaType === 'strategic' ? 'text-white/70' : 'text-gray-400'}`}>(project)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setNewIdeaType('operational')}
                  className={`flex-1 px-3 rounded-lg border text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                    newIdeaType === 'operational'
                      ? 'bg-gray-600 text-white border-gray-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
                  }`}
                >
                  <span className="font-semibold">Operational</span>
                  <span className={`text-xs ${newIdeaType === 'operational' ? 'text-white/70' : 'text-gray-400'}`}>(habit)</span>
                </button>
              </div>
            </div>
          </div>

          {/* Add Button */}
          <div className="flex justify-end">
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
                      const isOperational = idea.ideaType === 'operational'
                      const isStrategic = !isFromRoadmap && !isOperational

                      // Color scheme: Navy (roadmap), Orange (strategic), White (operational)
                      const getCardStyles = () => {
                        if (isFromRoadmap) {
                          return 'bg-brand-navy text-white border-brand-navy hover:bg-brand-navy-700'
                        } else if (isOperational) {
                          return 'bg-white border-gray-300 hover:border-gray-400'
                        } else {
                          // Strategic
                          return 'bg-brand-orange text-white border-brand-orange hover:bg-brand-orange-600'
                        }
                      }

                      const getBadgeStyles = () => {
                        if (isFromRoadmap) {
                          return 'bg-white/20 text-white'
                        } else if (isOperational) {
                          return 'bg-gray-200 text-gray-700'
                        } else {
                          return 'bg-white/20 text-white'
                        }
                      }

                      const getTextColor = () => {
                        return (isFromRoadmap || isStrategic) ? 'text-white' : 'text-gray-800'
                      }

                      const getSubTextColor = () => {
                        return (isFromRoadmap || isStrategic) ? 'text-white/80' : 'text-gray-600'
                      }

                      return (
                        <div
                          key={idea.id}
                          className={`p-3 border-2 rounded-lg shadow-sm hover:shadow-md transition-all min-h-[80px] ${getCardStyles()}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-bold leading-snug ${getTextColor()}`}>
                                {idea.title}
                              </p>
                              {idea.description && (
                                <p className={`text-xs mt-1.5 leading-relaxed line-clamp-2 ${getSubTextColor()}`}>
                                  {idea.description}
                                </p>
                              )}
                              <div className="flex items-center gap-2 mt-2">
                                <span className={`inline-block px-2 py-0.5 text-xs rounded font-semibold ${getBadgeStyles()}`}>
                                  {isFromRoadmap ? 'ROADMAP' : isOperational ? 'OPERATIONAL' : 'STRATEGIC'}
                                </span>
                              </div>
                            </div>
                            <div className="flex flex-col gap-0.5">
                              {/* Edit button - only for non-roadmap items */}
                              {!isFromRoadmap && (
                                <button
                                  onClick={() => handleEditIdea(idea)}
                                  className={`transition-colors flex-shrink-0 p-1 rounded ${
                                    isStrategic ? 'text-white/60 hover:text-white hover:bg-white/10' : 'text-gray-400 hover:text-brand-orange hover:bg-gray-100'
                                  }`}
                                  title="Edit idea"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                onClick={() => handleRemoveIdea(idea.id)}
                                className={`transition-colors flex-shrink-0 p-1 rounded ${
                                  (isFromRoadmap || isStrategic)
                                    ? 'text-white/60 hover:text-white hover:bg-white/10'
                                    : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                                }`}
                                title="Remove idea"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
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

      {/* Edit Idea Modal */}
      {editingIdea && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">Edit Idea</h2>
            </div>

            <div className="p-6 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => {
                    setEditTitle(e.target.value)
                    setEditValidationError('')
                  }}
                  placeholder="What initiative do you want to implement?"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange text-sm"
                  maxLength={200}
                />
                <p className="text-xs text-gray-500 mt-1">{editTitle.length}/200 characters</p>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes (Optional)
                </label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Add context, rationale, or details..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange text-sm resize-none"
                />
              </div>

              {/* Engine Selection + Idea Type - Side by Side */}
              <div className="grid grid-cols-2 gap-4">
                {/* Business Engine */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Business Engine <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={editEngine}
                    onChange={(e) => setEditEngine(e.target.value as InitiativeCategory)}
                    className="w-full h-[42px] px-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange text-sm"
                  >
                    {ENGINES.map(engine => (
                      <option key={engine.id} value={engine.id}>
                        {engine.emoji} {engine.name} - {engine.subtitle}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Idea Type - Strategic vs Operational */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Type <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2 h-[42px]">
                    <button
                      type="button"
                      onClick={() => setEditIdeaType('strategic')}
                      className={`flex-1 px-2 rounded-lg border text-sm font-medium transition-all flex items-center justify-center ${
                        editIdeaType === 'strategic'
                          ? 'bg-brand-orange text-white border-brand-orange'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-brand-orange-300'
                      }`}
                    >
                      <span className="font-semibold">Strategic</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditIdeaType('operational')}
                      className={`flex-1 px-2 rounded-lg border text-sm font-medium transition-all flex items-center justify-center ${
                        editIdeaType === 'operational'
                          ? 'bg-gray-600 text-white border-gray-600'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
                      }`}
                    >
                      <span className="font-semibold">Operational</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Validation Error */}
              {editValidationError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700">{editValidationError}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={handleCancelEdit}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 font-medium transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
