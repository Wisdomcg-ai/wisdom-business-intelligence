'use client'

import { useState } from 'react'
import {
  HelpCircle,
  Plus,
  Edit,
  Trash2,
  Search,
  Filter,
  Tag,
  ChevronDown,
  ChevronUp,
  GripVertical,
  X,
  Copy
} from 'lucide-react'

export interface CoachingQuestion {
  id: string
  question: string
  category: string
  subcategory?: string
  isTemplate: boolean
  useCount?: number
  createdAt: string
}

interface QuestionBankProps {
  questions: CoachingQuestion[]
  onCreateQuestion: (question: Omit<CoachingQuestion, 'id' | 'createdAt' | 'useCount'>) => Promise<void>
  onUpdateQuestion: (id: string, question: Partial<CoachingQuestion>) => Promise<void>
  onDeleteQuestion: (id: string) => Promise<void>
}

const DEFAULT_CATEGORIES = [
  { id: 'discovery', name: 'Discovery & Assessment', color: 'bg-brand-orange-100 text-brand-orange-700' },
  { id: 'goals', name: 'Goals & Vision', color: 'bg-brand-teal-100 text-brand-teal-700' },
  { id: 'challenges', name: 'Challenges & Obstacles', color: 'bg-red-100 text-red-700' },
  { id: 'leadership', name: 'Leadership & Team', color: 'bg-brand-navy-100 text-brand-navy-700' },
  { id: 'finances', name: 'Financial & Growth', color: 'bg-brand-orange-100 text-brand-orange-700' },
  { id: 'operations', name: 'Operations & Systems', color: 'bg-gray-100 text-gray-700' },
  { id: 'mindset', name: 'Mindset & Personal', color: 'bg-brand-navy-100 text-brand-navy-700' },
  { id: 'accountability', name: 'Accountability & Actions', color: 'bg-brand-orange-100 text-brand-orange-700' }
]

export function QuestionBank({
  questions,
  onCreateQuestion,
  onUpdateQuestion,
  onDeleteQuestion
}: QuestionBankProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [expandedCategories, setExpandedCategories] = useState<string[]>(DEFAULT_CATEGORIES.map(c => c.id))
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingQuestion, setEditingQuestion] = useState<CoachingQuestion | null>(null)

  const getCategoryColor = (categoryId: string) => {
    return DEFAULT_CATEGORIES.find(c => c.id === categoryId)?.color || 'bg-gray-100 text-gray-700'
  }

  const getCategoryName = (categoryId: string) => {
    return DEFAULT_CATEGORIES.find(c => c.id === categoryId)?.name || categoryId
  }

  const filteredQuestions = questions.filter(q => {
    const matchesSearch = q.question.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = !selectedCategory || q.category === selectedCategory
    return matchesSearch && matchesCategory
  })

  const questionsByCategory = DEFAULT_CATEGORIES.reduce((acc, category) => {
    acc[category.id] = filteredQuestions.filter(q => q.category === category.id)
    return acc
  }, {} as Record<string, CoachingQuestion[]>)

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev =>
      prev.includes(categoryId)
        ? prev.filter(c => c !== categoryId)
        : [...prev, categoryId]
    )
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  return (
    <div className="rounded-xl shadow-sm border border-gray-200 bg-white overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Question Bank</h3>
            <p className="text-sm text-gray-500 mt-1">
              Powerful coaching questions organized by category
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-brand-orange hover:bg-brand-orange-600 text-white rounded-lg shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Question
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="p-4 border-b border-gray-100 flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search questions..."
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange"
          />
        </div>
        <div className="relative">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="appearance-none pl-10 pr-10 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange bg-white"
          >
            <option value="">All Categories</option>
            {DEFAULT_CATEGORIES.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        </div>
      </div>

      {/* Questions by Category */}
      <div className="divide-y divide-gray-100">
        {DEFAULT_CATEGORIES.map(category => {
          const categoryQuestions = questionsByCategory[category.id] || []
          const isExpanded = expandedCategories.includes(category.id)

          if (categoryQuestions.length === 0 && selectedCategory && selectedCategory !== category.id) {
            return null
          }

          return (
            <div key={category.id}>
              {/* Category Header */}
              <button
                onClick={() => toggleCategory(category.id)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${category.color}`}>
                    {category.name}
                  </span>
                  <span className="text-sm text-gray-500">
                    {categoryQuestions.length} question{categoryQuestions.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {isExpanded ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </button>

              {/* Questions List */}
              {isExpanded && (
                <div className="bg-gray-50 px-6 py-2">
                  {categoryQuestions.length === 0 ? (
                    <p className="py-4 text-center text-sm text-gray-500">
                      No questions in this category yet
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {categoryQuestions.map(question => (
                        <div
                          key={question.id}
                          className="bg-white p-4 rounded-lg border border-gray-200 group hover:border-brand-orange-200 transition-colors"
                        >
                          <div className="flex items-start gap-3">
                            <HelpCircle className="w-5 h-5 text-brand-orange flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <p className="text-gray-900">{question.question}</p>
                              {question.subcategory && (
                                <span className="inline-block mt-2 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                                  {question.subcategory}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => copyToClipboard(question.question)}
                                className="p-1.5 text-gray-400 hover:text-brand-orange hover:bg-brand-orange-50 rounded transition-colors"
                                title="Copy to clipboard"
                              >
                                <Copy className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setEditingQuestion(question)}
                                className="p-1.5 text-gray-400 hover:text-brand-orange hover:bg-brand-orange-50 rounded transition-colors"
                                title="Edit"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              {!question.isTemplate && (
                                <button
                                  onClick={() => onDeleteQuestion(question.id)}
                                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Empty State */}
      {filteredQuestions.length === 0 && (
        <div className="p-12 text-center">
          <HelpCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="font-medium text-gray-900 mb-1">No questions found</h3>
          <p className="text-sm text-gray-500 mb-4">
            {searchQuery ? 'Try a different search term' : 'Start building your question bank'}
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-orange hover:bg-brand-orange-600 text-white rounded-lg shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Question
          </button>
        </div>
      )}

      {/* Add/Edit Modal */}
      {(showAddModal || editingQuestion) && (
        <QuestionModal
          question={editingQuestion}
          categories={DEFAULT_CATEGORIES}
          onClose={() => {
            setShowAddModal(false)
            setEditingQuestion(null)
          }}
          onSave={async (data) => {
            if (editingQuestion) {
              await onUpdateQuestion(editingQuestion.id, data)
            } else {
              await onCreateQuestion(data)
            }
            setShowAddModal(false)
            setEditingQuestion(null)
          }}
        />
      )}
    </div>
  )
}

// Question Modal Component
function QuestionModal({
  question,
  categories,
  onClose,
  onSave
}: {
  question: CoachingQuestion | null
  categories: typeof DEFAULT_CATEGORIES
  onClose: () => void
  onSave: (data: Omit<CoachingQuestion, 'id' | 'createdAt' | 'useCount'>) => Promise<void>
}) {
  const [questionText, setQuestionText] = useState(question?.question || '')
  const [category, setCategory] = useState(question?.category || 'discovery')
  const [subcategory, setSubcategory] = useState(question?.subcategory || '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!questionText.trim()) return
    setSaving(true)
    try {
      await onSave({
        question: questionText,
        category,
        subcategory: subcategory || undefined,
        isTemplate: question?.isTemplate || false
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">
            {question ? 'Edit Question' : 'Add New Question'}
          </h3>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Question *
            </label>
            <textarea
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder="What would success look like for you in 12 months?"
              rows={3}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange"
            >
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Subcategory (optional)
            </label>
            <input
              type="text"
              value={subcategory}
              onChange={(e) => setSubcategory(e.target.value)}
              placeholder="e.g., First Session, Follow-up"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!questionText.trim() || saving}
            className="px-6 py-2 bg-brand-orange hover:bg-brand-orange-600 text-white rounded-lg shadow-sm transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : question ? 'Save Changes' : 'Add Question'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default QuestionBank
