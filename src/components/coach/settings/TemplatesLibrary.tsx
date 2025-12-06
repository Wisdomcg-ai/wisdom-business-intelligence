'use client'

import { useState } from 'react'
import {
  FileText,
  Calendar,
  ListChecks,
  Mail,
  ClipboardList,
  Plus,
  Edit,
  Trash2,
  Copy,
  Search,
  ChevronRight,
  X
} from 'lucide-react'

export interface Template {
  id: string
  type: 'session' | 'action' | 'email' | 'intake'
  name: string
  description?: string
  content: string | Record<string, unknown>
  isDefault?: boolean
  createdAt: string
}

interface TemplatesLibraryProps {
  templates: Template[]
  onCreateTemplate: (template: Omit<Template, 'id' | 'createdAt'>) => Promise<void>
  onUpdateTemplate: (id: string, template: Partial<Template>) => Promise<void>
  onDeleteTemplate: (id: string) => Promise<void>
  onDuplicateTemplate: (id: string) => Promise<void>
}

export function TemplatesLibrary({
  templates,
  onCreateTemplate,
  onUpdateTemplate,
  onDeleteTemplate,
  onDuplicateTemplate
}: TemplatesLibraryProps) {
  const [activeTab, setActiveTab] = useState<Template['type']>('session')
  const [searchQuery, setSearchQuery] = useState('')
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)

  const tabs = [
    { id: 'session' as const, label: 'Session Agendas', icon: Calendar },
    { id: 'action' as const, label: 'Action Items', icon: ListChecks },
    { id: 'email' as const, label: 'Emails', icon: Mail },
    { id: 'intake' as const, label: 'Intake Forms', icon: ClipboardList }
  ]

  const filteredTemplates = templates.filter(t =>
    t.type === activeTab &&
    (t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description?.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  const getTemplateIcon = (type: Template['type']) => {
    switch (type) {
      case 'session': return Calendar
      case 'action': return ListChecks
      case 'email': return Mail
      case 'intake': return ClipboardList
      default: return FileText
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-AU', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  return (
    <div className="rounded-xl shadow-sm border border-gray-200 bg-white overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Templates Library</h3>
            <p className="text-sm text-gray-500 mt-1">Create and manage reusable templates</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-brand-orange hover:bg-brand-orange-600 text-white rounded-lg shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Template
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex">
          {tabs.map(tab => {
            const Icon = tab.icon
            const count = templates.filter(t => t.type === tab.id).length
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-brand-orange text-brand-orange'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  activeTab === tab.id ? 'bg-brand-orange-100 text-brand-orange' : 'bg-gray-100 text-gray-500'
                }`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Search */}
      <div className="p-4 border-b border-gray-100">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search templates..."
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange"
          />
        </div>
      </div>

      {/* Templates List */}
      <div className="divide-y divide-gray-100">
        {filteredTemplates.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="font-medium text-gray-900 mb-1">No templates found</h3>
            <p className="text-sm text-gray-500 mb-4">
              {searchQuery
                ? 'Try a different search term'
                : `Create your first ${activeTab} template to get started`}
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-orange hover:bg-brand-orange-600 text-white rounded-lg shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Template
            </button>
          </div>
        ) : (
          filteredTemplates.map(template => {
            const Icon = getTemplateIcon(template.type)
            return (
              <div
                key={template.id}
                className="p-4 hover:bg-gray-50 transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-brand-orange-100 rounded-lg flex items-center justify-center">
                      <Icon className="w-5 h-5 text-brand-orange" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-gray-900">{template.name}</h4>
                        {template.isDefault && (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                            Default
                          </span>
                        )}
                      </div>
                      {template.description && (
                        <p className="text-sm text-gray-500 mt-0.5">{template.description}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        Created {formatDate(template.createdAt)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setEditingTemplate(template)}
                      className="p-2 text-gray-400 hover:text-brand-orange hover:bg-brand-orange-50 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onDuplicateTemplate(template.id)}
                      className="p-2 text-gray-400 hover:text-brand-orange hover:bg-brand-orange-50 rounded-lg transition-colors"
                      title="Duplicate"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    {!template.isDefault && (
                      <button
                        onClick={() => onDeleteTemplate(template.id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    <ChevronRight className="w-5 h-5 text-gray-300 ml-2" />
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Create/Edit Modal */}
      {(showCreateModal || editingTemplate) && (
        <TemplateModal
          template={editingTemplate}
          type={activeTab}
          onClose={() => {
            setShowCreateModal(false)
            setEditingTemplate(null)
          }}
          onSave={async (data) => {
            if (editingTemplate) {
              await onUpdateTemplate(editingTemplate.id, data)
            } else {
              await onCreateTemplate({ ...data, type: activeTab })
            }
            setShowCreateModal(false)
            setEditingTemplate(null)
          }}
        />
      )}
    </div>
  )
}

// Template Modal Component
function TemplateModal({
  template,
  type,
  onClose,
  onSave
}: {
  template: Template | null
  type: Template['type']
  onClose: () => void
  onSave: (data: Omit<Template, 'id' | 'createdAt'>) => Promise<void>
}) {
  const [name, setName] = useState(template?.name || '')
  const [description, setDescription] = useState(template?.description || '')
  const [content, setContent] = useState(
    typeof template?.content === 'string' ? template.content : ''
  )
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await onSave({
        type,
        name,
        description,
        content,
        isDefault: template?.isDefault
      })
    } finally {
      setSaving(false)
    }
  }

  const getPlaceholder = () => {
    switch (type) {
      case 'session':
        return '1. Opening check-in (5 min)\n2. Review previous actions\n3. Main discussion topic\n4. Action planning\n5. Wrap up and next steps'
      case 'action':
        return 'Action item description...'
      case 'email':
        return 'Hi {client_name},\n\nThank you for...'
      case 'intake':
        return 'Question 1: What are your main goals?\nQuestion 2: What challenges are you facing?'
      default:
        return 'Template content...'
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">
            {template ? 'Edit Template' : 'Create Template'}
          </h3>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto max-h-[calc(90vh-140px)]">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Template Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Weekly Check-in Agenda"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this template"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Content
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={getPlaceholder()}
              rows={10}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange font-mono text-sm resize-none"
            />
          </div>

          {type === 'email' && (
            <div className="p-4 bg-brand-orange-50 rounded-lg border border-brand-orange-100">
              <h4 className="font-medium text-brand-navy mb-2">Available Variables</h4>
              <div className="grid grid-cols-2 gap-2 text-sm text-brand-orange-700">
                <code>{'{client_name}'}</code>
                <code>{'{business_name}'}</code>
                <code>{'{coach_name}'}</code>
                <code>{'{next_session_date}'}</code>
              </div>
            </div>
          )}
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
            disabled={!name.trim() || saving}
            className="px-6 py-2 bg-brand-orange hover:bg-brand-orange-600 text-white rounded-lg shadow-sm transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : template ? 'Save Changes' : 'Create Template'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default TemplatesLibrary
