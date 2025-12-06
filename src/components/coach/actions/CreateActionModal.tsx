'use client'

import { useState, useEffect } from 'react'
import {
  X,
  Building2,
  Calendar,
  Flag,
  Search,
  Loader2,
  Check,
  FileText
} from 'lucide-react'

interface Client {
  id: string
  businessName: string
  industry?: string
}

interface ActionTemplate {
  id: string
  title: string
  description?: string
  category?: string
  defaultPriority: 'low' | 'medium' | 'high' | 'urgent'
}

interface CreateActionModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate: (data: {
    title: string
    description?: string
    businessId: string
    priority: 'low' | 'medium' | 'high' | 'urgent'
    dueDate?: string
    category?: string
  }) => Promise<void>
  clients: Client[]
  preselectedClientId?: string
  templates?: ActionTemplate[]
}

const defaultTemplates: ActionTemplate[] = [
  {
    id: 't1',
    title: 'Review financial statements',
    description: 'Review and analyze monthly financial statements',
    category: 'Finance',
    defaultPriority: 'medium'
  },
  {
    id: 't2',
    title: 'Update business plan',
    description: 'Review and update the annual business plan',
    category: 'Planning',
    defaultPriority: 'high'
  },
  {
    id: 't3',
    title: 'Complete homework exercise',
    description: 'Complete the assigned coaching homework',
    category: 'Coaching',
    defaultPriority: 'medium'
  },
  {
    id: 't4',
    title: 'Schedule team meeting',
    description: 'Schedule and prepare agenda for team meeting',
    category: 'Leadership',
    defaultPriority: 'low'
  },
  {
    id: 't5',
    title: 'Follow up with lead',
    description: 'Follow up with potential client or partner',
    category: 'Sales',
    defaultPriority: 'high'
  }
]

const categories = [
  'Finance',
  'Planning',
  'Coaching',
  'Leadership',
  'Sales',
  'Operations',
  'Marketing',
  'HR',
  'Other'
]

export function CreateActionModal({
  isOpen,
  onClose,
  onCreate,
  clients,
  preselectedClientId,
  templates = defaultTemplates
}: CreateActionModalProps) {
  const [step, setStep] = useState(preselectedClientId ? 2 : 1)
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showTemplates, setShowTemplates] = useState(false)

  // Form state
  const [selectedClientId, setSelectedClientId] = useState(preselectedClientId || '')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium')
  const [dueDate, setDueDate] = useState('')
  const [category, setCategory] = useState('')

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep(preselectedClientId ? 2 : 1)
      setSelectedClientId(preselectedClientId || '')
      setTitle('')
      setDescription('')
      setPriority('medium')
      setDueDate('')
      setCategory('')
      setSearchQuery('')
      setShowTemplates(false)
    }
  }, [isOpen, preselectedClientId])

  if (!isOpen) return null

  const filteredClients = clients.filter(client =>
    client.businessName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    client.industry?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const selectedClient = clients.find(c => c.id === selectedClientId)

  const handleCreate = async () => {
    if (!selectedClientId || !title.trim()) return

    setSaving(true)
    try {
      await onCreate({
        title: title.trim(),
        description: description.trim() || undefined,
        businessId: selectedClientId,
        priority,
        dueDate: dueDate || undefined,
        category: category || undefined
      })
      onClose()
    } catch (error) {
      console.error('Error creating action:', error)
    } finally {
      setSaving(false)
    }
  }

  const applyTemplate = (template: ActionTemplate) => {
    setTitle(template.title)
    setDescription(template.description || '')
    setPriority(template.defaultPriority)
    setCategory(template.category || '')
    setShowTemplates(false)
  }

  // Quick date options
  const setQuickDue = (days: number) => {
    const date = new Date()
    date.setDate(date.getDate() + days)
    setDueDate(date.toISOString().split('T')[0])
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/50 transition-opacity"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Create Action Item</h2>
              <p className="text-sm text-gray-500">
                Step {step} of 2: {step === 1 ? 'Select Client' : 'Action Details'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Step 1: Select Client */}
          {step === 1 && (
            <div className="p-6">
              {/* Search */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search clients..."
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-orange"
                />
              </div>

              {/* Client List */}
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {filteredClients.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No clients found
                  </div>
                ) : (
                  filteredClients.map(client => (
                    <button
                      key={client.id}
                      onClick={() => {
                        setSelectedClientId(client.id)
                        setStep(2)
                      }}
                      className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-colors ${
                        selectedClientId === client.id
                          ? 'border-brand-orange bg-brand-orange-50'
                          : 'border-gray-200 hover:border-brand-orange-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-gray-600" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="font-medium text-gray-900">{client.businessName}</p>
                        {client.industry && (
                          <p className="text-sm text-gray-500">{client.industry}</p>
                        )}
                      </div>
                      {selectedClientId === client.id && (
                        <Check className="w-5 h-5 text-brand-orange" />
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Step 2: Action Details */}
          {step === 2 && (
            <div className="p-6 space-y-5">
              {/* Selected Client */}
              {selectedClient && (
                <div className="flex items-center gap-4 p-4 bg-brand-orange-50 rounded-xl">
                  <div className="w-10 h-10 bg-brand-orange-100 rounded-lg flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-brand-orange" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{selectedClient.businessName}</p>
                  </div>
                  {!preselectedClientId && (
                    <button
                      onClick={() => setStep(1)}
                      className="text-sm text-brand-orange hover:text-brand-orange-700 font-medium"
                    >
                      Change
                    </button>
                  )}
                </div>
              )}

              {/* Templates Toggle */}
              <div>
                <button
                  onClick={() => setShowTemplates(!showTemplates)}
                  className={`flex items-center gap-2 text-sm font-medium transition-colors ${
                    showTemplates ? 'text-brand-orange' : 'text-gray-600 hover:text-brand-orange'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  {showTemplates ? 'Hide templates' : 'Use a template'}
                </button>

                {showTemplates && (
                  <div className="mt-3 grid grid-cols-1 gap-2 max-h-[150px] overflow-y-auto">
                    {templates.map(template => (
                      <button
                        key={template.id}
                        onClick={() => applyTemplate(template)}
                        className="text-left p-3 border border-gray-200 rounded-lg hover:border-brand-orange-300 hover:bg-brand-orange-50 transition-colors"
                      >
                        <p className="font-medium text-gray-900 text-sm">{template.title}</p>
                        {template.category && (
                          <span className="text-xs text-gray-500">{template.category}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Action Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What needs to be done?"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-orange"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description (optional)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Add more details..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-orange"
                />
              </div>

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Flag className="w-4 h-4 inline mr-1" />
                  Priority
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(['low', 'medium', 'high', 'urgent'] as const).map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={`py-2 rounded-lg text-sm font-medium transition-colors ${
                        priority === p
                          ? p === 'urgent' ? 'bg-red-600 text-white' :
                            p === 'high' ? 'bg-brand-orange text-white' :
                            p === 'medium' ? 'bg-yellow-500 text-white' :
                            'bg-gray-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Due Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  Due Date
                </label>
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setQuickDue(1)}
                    className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                  >
                    Tomorrow
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickDue(3)}
                    className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                  >
                    In 3 days
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickDue(7)}
                    className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                  >
                    Next week
                  </button>
                </div>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-orange"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Category (optional)
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-orange"
                >
                  <option value="">Select category</option>
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
            <div className="flex items-center justify-between">
              {step === 2 && !preselectedClientId && (
                <button
                  onClick={() => setStep(1)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium transition-colors"
                >
                  Back
                </button>
              )}
              {(step === 1 || preselectedClientId) && <div />}
              <button
                onClick={step === 1 ? () => {} : handleCreate}
                disabled={step === 1 || !title.trim() || saving}
                className="flex items-center gap-2 px-6 py-2.5 bg-brand-orange text-white rounded-lg font-medium shadow-sm hover:bg-brand-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Create Action
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CreateActionModal
