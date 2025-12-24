'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  Sparkles,
  TrendingUp,
  MessageSquare,
  BookOpen,
  CheckCircle,
  AlertTriangle,
  Plus,
  Eye,
  ThumbsUp,
  ThumbsDown,
  Clock,
  Users,
  DollarSign,
  Search,
  Filter,
  ChevronRight,
  X,
  Save,
  Lightbulb
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface AIInteraction {
  id: string
  business_id: string
  question: string
  question_type: string
  context: string
  context_data: Record<string, any>
  ai_response: {
    suggestion: string
    reasoning: string
    confidence: string
    source: string
    minValue?: number
    maxValue?: number
    typicalValue?: number
    caveats?: string[]
  }
  confidence: string
  action_taken: string | null
  user_value: number | null
  coach_reviewed: boolean
  created_at: string
  businesses: {
    name: string
  } | null
}

interface CoachBenchmark {
  id: string
  benchmark_type: string
  category: string
  min_value: number | null
  max_value: number | null
  typical_value: number | null
  notes: string | null
  industry_filter: string | null
  times_used: number
  last_used_at: string | null
}

export default function AIInsightsPage() {
  const [interactions, setInteractions] = useState<AIInteraction[]>([])
  const [benchmarks, setBenchmarks] = useState<CoachBenchmark[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'interactions' | 'benchmarks' | 'trending'>('interactions')
  const [filterType, setFilterType] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedInteraction, setSelectedInteraction] = useState<AIInteraction | null>(null)
  const [showAddBenchmark, setShowAddBenchmark] = useState(false)
  const [newBenchmark, setNewBenchmark] = useState({
    benchmark_type: 'salary',
    category: '',
    min_value: '',
    max_value: '',
    typical_value: '',
    notes: '',
    industry_filter: ''
  })

  const supabase = createClient()

  // Load data
  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      // Load interactions
      const { data: interactionData, error: intError } = await supabase
        .from('ai_interactions')
        .select(`
          *,
          businesses (name)
        `)
        .order('created_at', { ascending: false })
        .limit(100)

      if (!intError && interactionData) {
        setInteractions(interactionData)
      }

      // Load benchmarks
      const { data: benchmarkData, error: bmError } = await supabase
        .from('coach_benchmarks')
        .select('*')
        .order('times_used', { ascending: false })

      if (!bmError && benchmarkData) {
        setBenchmarks(benchmarkData)
      }
    } catch (error) {
      console.error('Error loading data:', error)
    }
    setIsLoading(false)
  }, [supabase])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Mark interaction as reviewed
  const handleMarkReviewed = async (id: string) => {
    const { error } = await supabase
      .from('ai_interactions')
      .update({ coach_reviewed: true })
      .eq('id', id)

    if (!error) {
      setInteractions(prev =>
        prev.map(int => int.id === id ? { ...int, coach_reviewed: true } : int)
      )
    }
  }

  // Add interaction to benchmark library
  const handleAddToBenchmarks = async (interaction: AIInteraction) => {
    if (!interaction.ai_response.typicalValue) return

    const benchmark = {
      benchmark_type: interaction.question_type === 'salary_estimate' ? 'salary' : 'project_cost',
      category: interaction.question.toLowerCase().replace(/\s+/g, '_'),
      min_value: interaction.ai_response.minValue,
      max_value: interaction.ai_response.maxValue,
      typical_value: interaction.ai_response.typicalValue,
      notes: `From client question: "${interaction.question}"`,
      industry_filter: interaction.context_data?.industry || null
    }

    const { error } = await supabase
      .from('coach_benchmarks')
      .insert(benchmark)

    if (!error) {
      await supabase
        .from('ai_interactions')
        .update({ added_to_library: true })
        .eq('id', interaction.id)

      loadData()
    }
  }

  // Add new benchmark
  const handleAddBenchmark = async () => {
    if (!newBenchmark.category || !newBenchmark.typical_value) return

    const { error } = await supabase
      .from('coach_benchmarks')
      .insert({
        benchmark_type: newBenchmark.benchmark_type,
        category: newBenchmark.category.toLowerCase().replace(/\s+/g, '_'),
        min_value: newBenchmark.min_value ? Number(newBenchmark.min_value) : null,
        max_value: newBenchmark.max_value ? Number(newBenchmark.max_value) : null,
        typical_value: Number(newBenchmark.typical_value),
        notes: newBenchmark.notes || null,
        industry_filter: newBenchmark.industry_filter || null
      })

    if (!error) {
      setShowAddBenchmark(false)
      setNewBenchmark({
        benchmark_type: 'salary',
        category: '',
        min_value: '',
        max_value: '',
        typical_value: '',
        notes: '',
        industry_filter: ''
      })
      loadData()
    }
  }

  // Delete benchmark
  const handleDeleteBenchmark = async (id: string) => {
    const { error } = await supabase
      .from('coach_benchmarks')
      .delete()
      .eq('id', id)

    if (!error) {
      setBenchmarks(prev => prev.filter(bm => bm.id !== id))
    }
  }

  // Filter interactions
  const filteredInteractions = interactions.filter(int => {
    if (filterType !== 'all' && int.question_type !== filterType) return false
    if (searchQuery && !int.question.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  // Get trending topics
  const trendingTopics = React.useMemo(() => {
    const topics: Record<string, { count: number; examples: string[] }> = {}

    interactions.forEach(int => {
      const key = int.question_type
      if (!topics[key]) {
        topics[key] = { count: 0, examples: [] }
      }
      topics[key].count++
      if (topics[key].examples.length < 3) {
        topics[key].examples.push(int.question)
      }
    })

    return Object.entries(topics)
      .map(([type, data]) => ({ type, ...data }))
      .sort((a, b) => b.count - a.count)
  }, [interactions])

  // Stats
  const stats = React.useMemo(() => {
    const total = interactions.length
    const reviewed = interactions.filter(i => i.coach_reviewed).length
    const used = interactions.filter(i => i.action_taken === 'used').length
    const adjusted = interactions.filter(i => i.action_taken === 'adjusted').length

    return {
      total,
      reviewed,
      unreviewed: total - reviewed,
      usedRate: total > 0 ? Math.round((used / total) * 100) : 0,
      adjustedRate: total > 0 ? Math.round((adjusted / total) * 100) : 0
    }
  }, [interactions])

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getQuestionTypeLabel = (type: string) => {
    switch (type) {
      case 'salary_estimate': return 'Salary'
      case 'cost_estimate': return 'Project Cost'
      case 'forecast_validation': return 'Forecast Check'
      default: return type
    }
  }

  const getConfidenceBadge = (confidence: string) => {
    switch (confidence) {
      case 'high':
        return <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">High</span>
      case 'medium':
        return <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">Medium</span>
      case 'low':
        return <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">Low</span>
      default:
        return null
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Sparkles className="w-8 h-8 text-brand-orange animate-pulse mx-auto mb-2" />
          <p className="text-gray-600">Loading AI Insights...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-brand-orange rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">AI Insights</h1>
          </div>
          <p className="text-gray-600">
            Review AI suggestions, see what clients are asking, and build your benchmark library.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
                <div className="text-xs text-gray-500">Total Questions</div>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{stats.unreviewed}</div>
                <div className="text-xs text-gray-500">Needs Review</div>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <ThumbsUp className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{stats.usedRate}%</div>
                <div className="text-xs text-gray-500">Used As-Is</div>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{benchmarks.length}</div>
                <div className="text-xs text-gray-500">Your Benchmarks</div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('interactions')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'interactions'
                  ? 'text-brand-orange border-b-2 border-brand-orange bg-brand-orange-50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <MessageSquare className="w-4 h-4 inline-block mr-2" />
              Client Questions ({stats.total})
            </button>
            <button
              onClick={() => setActiveTab('benchmarks')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'benchmarks'
                  ? 'text-brand-orange border-b-2 border-brand-orange bg-brand-orange-50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <BookOpen className="w-4 h-4 inline-block mr-2" />
              Your Benchmarks ({benchmarks.length})
            </button>
            <button
              onClick={() => setActiveTab('trending')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'trending'
                  ? 'text-brand-orange border-b-2 border-brand-orange bg-brand-orange-50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <TrendingUp className="w-4 h-4 inline-block mr-2" />
              Trending Topics
            </button>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {/* Interactions Tab */}
            {activeTab === 'interactions' && (
              <div>
                {/* Filters */}
                <div className="flex items-center gap-4 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search questions..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                    />
                  </div>
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="px-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange"
                  >
                    <option value="all">All Types</option>
                    <option value="salary_estimate">Salary</option>
                    <option value="cost_estimate">Project Cost</option>
                    <option value="forecast_validation">Forecast Check</option>
                  </select>
                </div>

                {/* Interaction List */}
                <div className="space-y-3">
                  {filteredInteractions.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <MessageSquare className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p>No questions yet</p>
                      <p className="text-sm text-gray-400">Client AI questions will appear here</p>
                    </div>
                  ) : (
                    filteredInteractions.map((interaction) => (
                      <div
                        key={interaction.id}
                        className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                          interaction.coach_reviewed
                            ? 'bg-white border-gray-200 hover:border-gray-300'
                            : 'bg-amber-50 border-amber-200 hover:border-amber-300'
                        }`}
                        onClick={() => setSelectedInteraction(interaction)}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 rounded">
                                {getQuestionTypeLabel(interaction.question_type)}
                              </span>
                              {getConfidenceBadge(interaction.confidence)}
                              {!interaction.coach_reviewed && (
                                <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded">
                                  Needs Review
                                </span>
                              )}
                            </div>
                            <p className="font-medium text-gray-900 truncate">
                              "{interaction.question}"
                            </p>
                            <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                              <span className="flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                {interaction.businesses?.name || 'Unknown'}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatDate(interaction.created_at)}
                              </span>
                              {interaction.action_taken && (
                                <span className="flex items-center gap-1">
                                  {interaction.action_taken === 'used' ? (
                                    <ThumbsUp className="w-3 h-3 text-green-500" />
                                  ) : interaction.action_taken === 'adjusted' ? (
                                    <DollarSign className="w-3 h-3 text-blue-500" />
                                  ) : (
                                    <ThumbsDown className="w-3 h-3 text-gray-400" />
                                  )}
                                  {interaction.action_taken}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="text-lg font-bold text-gray-900">
                              {interaction.ai_response.suggestion}
                            </div>
                            <ChevronRight className="w-4 h-4 text-gray-400 ml-auto" />
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Benchmarks Tab */}
            {activeTab === 'benchmarks' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-gray-600">
                    Your custom benchmarks are used first when clients ask AI for suggestions.
                  </p>
                  <button
                    onClick={() => setShowAddBenchmark(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-brand-orange text-white text-sm font-medium rounded-lg hover:bg-brand-orange-600 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add Benchmark
                  </button>
                </div>

                {benchmarks.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <BookOpen className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p>No benchmarks yet</p>
                    <p className="text-sm text-gray-400">Add your own benchmarks for better AI suggestions</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    {benchmarks.map((bm) => (
                      <div key={bm.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <span className="px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 rounded">
                              {bm.benchmark_type}
                            </span>
                            <h4 className="font-medium text-gray-900 mt-1 capitalize">
                              {bm.category.replace(/_/g, ' ')}
                            </h4>
                          </div>
                          <button
                            onClick={() => handleDeleteBenchmark(bm.id)}
                            className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-sm">
                          <div>
                            <div className="text-xs text-gray-500">Min</div>
                            <div className="font-medium">${bm.min_value?.toLocaleString() || '-'}</div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-500">Typical</div>
                            <div className="font-medium text-brand-orange">${bm.typical_value?.toLocaleString() || '-'}</div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-500">Max</div>
                            <div className="font-medium">${bm.max_value?.toLocaleString() || '-'}</div>
                          </div>
                        </div>
                        {bm.notes && (
                          <p className="text-xs text-gray-500 mt-2 truncate">{bm.notes}</p>
                        )}
                        <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                          <span>Used {bm.times_used}x</span>
                          {bm.industry_filter && (
                            <span className="px-1.5 py-0.5 bg-gray-200 rounded text-gray-600">
                              {bm.industry_filter}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Trending Tab */}
            {activeTab === 'trending' && (
              <div>
                <p className="text-sm text-gray-600 mb-4">
                  See what types of questions your clients are asking most often.
                </p>

                {trendingTopics.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <TrendingUp className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p>No trends yet</p>
                    <p className="text-sm text-gray-400">Trends will appear as clients use AI suggestions</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {trendingTopics.map((topic) => (
                      <div key={topic.type} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-1 text-sm font-medium bg-brand-orange-100 text-brand-orange-700 rounded">
                              {getQuestionTypeLabel(topic.type)}
                            </span>
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-bold text-gray-900">{topic.count}</div>
                            <div className="text-xs text-gray-500">questions</div>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-gray-500 uppercase tracking-wide">Recent examples:</div>
                          {topic.examples.map((example, i) => (
                            <div key={i} className="text-sm text-gray-700 flex items-start gap-2">
                              <span className="text-gray-400">•</span>
                              <span className="truncate">"{example}"</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Interaction Detail Modal */}
      {selectedInteraction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-lg text-gray-900">Question Details</h3>
              <button
                onClick={() => setSelectedInteraction(null)}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Question */}
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Question</div>
                <p className="font-medium text-gray-900">"{selectedInteraction.question}"</p>
              </div>

              {/* Context */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Type</div>
                  <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 rounded">
                    {getQuestionTypeLabel(selectedInteraction.question_type)}
                  </span>
                </div>
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Business</div>
                  <p className="text-sm text-gray-900">{selectedInteraction.businesses?.name || 'Unknown'}</p>
                </div>
              </div>

              {/* AI Response */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-brand-orange" />
                  <span className="text-xs font-medium text-gray-600">AI Response</span>
                  {getConfidenceBadge(selectedInteraction.confidence)}
                </div>
                <div className="text-xl font-bold text-gray-900 mb-2">
                  {selectedInteraction.ai_response.suggestion}
                </div>
                <p className="text-sm text-gray-600 mb-2">
                  {selectedInteraction.ai_response.reasoning}
                </p>
                {selectedInteraction.ai_response.caveats && (
                  <div className="text-xs text-gray-500 space-y-1">
                    {selectedInteraction.ai_response.caveats.map((caveat, i) => (
                      <div key={i} className="flex items-start gap-1">
                        <span className="text-gray-400">•</span>
                        <span>{caveat}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Client Action */}
              {selectedInteraction.action_taken && (
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Client Action</div>
                  <div className="flex items-center gap-2">
                    {selectedInteraction.action_taken === 'used' ? (
                      <>
                        <ThumbsUp className="w-4 h-4 text-green-500" />
                        <span className="text-sm text-green-700">Used suggestion as-is</span>
                      </>
                    ) : selectedInteraction.action_taken === 'adjusted' ? (
                      <>
                        <DollarSign className="w-4 h-4 text-blue-500" />
                        <span className="text-sm text-blue-700">
                          Adjusted to ${selectedInteraction.user_value?.toLocaleString()}
                        </span>
                      </>
                    ) : selectedInteraction.action_taken === 'asked_coach' ? (
                      <>
                        <MessageSquare className="w-4 h-4 text-purple-500" />
                        <span className="text-sm text-purple-700">Asked coach for help</span>
                      </>
                    ) : (
                      <>
                        <ThumbsDown className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-600">Ignored suggestion</span>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
              <button
                onClick={() => {
                  handleMarkReviewed(selectedInteraction.id)
                  setSelectedInteraction(null)
                }}
                disabled={selectedInteraction.coach_reviewed}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <CheckCircle className="w-4 h-4" />
                {selectedInteraction.coach_reviewed ? 'Reviewed' : 'Mark Reviewed'}
              </button>
              <button
                onClick={() => {
                  handleAddToBenchmarks(selectedInteraction)
                  setSelectedInteraction(null)
                }}
                disabled={!selectedInteraction.ai_response.typicalValue}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-orange rounded-lg hover:bg-brand-orange-600 transition-colors disabled:opacity-50"
              >
                <BookOpen className="w-4 h-4" />
                Add to My Benchmarks
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Benchmark Modal */}
      {showAddBenchmark && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-lg text-gray-900 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-brand-orange" />
                Add Benchmark
              </h3>
              <button
                onClick={() => setShowAddBenchmark(false)}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={newBenchmark.benchmark_type}
                  onChange={(e) => setNewBenchmark({ ...newBenchmark, benchmark_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange"
                >
                  <option value="salary">Salary</option>
                  <option value="project_cost">Project Cost</option>
                  <option value="margin">Margin</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category (e.g., "Project Manager", "Website Redesign") *
                </label>
                <input
                  type="text"
                  value={newBenchmark.category}
                  onChange={(e) => setNewBenchmark({ ...newBenchmark, category: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange"
                  placeholder="Enter category name"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Min</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input
                      type="number"
                      value={newBenchmark.min_value}
                      onChange={(e) => setNewBenchmark({ ...newBenchmark, min_value: e.target.value })}
                      className="w-full pl-7 pr-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Typical *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input
                      type="number"
                      value={newBenchmark.typical_value}
                      onChange={(e) => setNewBenchmark({ ...newBenchmark, typical_value: e.target.value })}
                      className="w-full pl-7 pr-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input
                      type="number"
                      value={newBenchmark.max_value}
                      onChange={(e) => setNewBenchmark({ ...newBenchmark, max_value: e.target.value })}
                      className="w-full pl-7 pr-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Industry Filter (optional)</label>
                <input
                  type="text"
                  value={newBenchmark.industry_filter}
                  onChange={(e) => setNewBenchmark({ ...newBenchmark, industry_filter: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange"
                  placeholder="e.g., construction, retail"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <textarea
                  value={newBenchmark.notes}
                  onChange={(e) => setNewBenchmark({ ...newBenchmark, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange"
                  rows={2}
                  placeholder="Any context or notes about this benchmark"
                />
              </div>

              <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                <div className="flex items-start gap-2">
                  <Lightbulb className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-blue-700">
                    Your benchmarks are used first when clients ask for AI suggestions.
                    They'll see "Your coach's benchmark" as the source.
                  </p>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowAddBenchmark(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddBenchmark}
                disabled={!newBenchmark.category || !newBenchmark.typical_value}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-orange rounded-lg hover:bg-brand-orange-600 transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                Save Benchmark
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
