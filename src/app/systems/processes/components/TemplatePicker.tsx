'use client'

import { useState } from 'react'
import { PROCESS_TEMPLATES, type ProcessTemplate } from '../utils/templates'

interface TemplatePickerProps {
  onSelect: (template: ProcessTemplate) => void
  onSkip: () => void
}

const TABS = [
  { key: 'function' as const, label: 'Business Functions' },
  { key: 'industry' as const, label: 'Industry' },
]

const SUBCATEGORY_ORDER = ['Trades', 'Professional Services', 'Health & Wellness', 'Ecommerce', 'Manufacturing']

export default function TemplatePicker({ onSelect, onSkip }: TemplatePickerProps) {
  const [activeTab, setActiveTab] = useState<'function' | 'industry'>('function')

  const functionTemplates = PROCESS_TEMPLATES.filter((t) => t.category === 'function')
  const industryTemplates = PROCESS_TEMPLATES.filter((t) => t.category === 'industry')

  // Group industry templates by subcategory
  const industryGroups: { subcategory: string; templates: ProcessTemplate[] }[] = []
  const seen = new Set<string>()
  for (const sub of SUBCATEGORY_ORDER) {
    const group = industryTemplates.filter((t) => t.subcategory === sub)
    if (group.length > 0) {
      industryGroups.push({ subcategory: sub, templates: group })
      seen.add(sub)
    }
  }
  // Catch any subcategories not in the predefined order
  for (const t of industryTemplates) {
    const sub = t.subcategory || 'Other'
    if (!seen.has(sub)) {
      industryGroups.push({ subcategory: sub, templates: industryTemplates.filter((x) => (x.subcategory || 'Other') === sub) })
      seen.add(sub)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Start from a template</h3>
        <p className="text-xs text-gray-500">
          Templates create a complete connected diagram. You can edit everything after.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-brand-orange text-brand-orange'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Template list */}
      <div className="max-h-[50vh] overflow-y-auto pr-1 -mr-1">
        {activeTab === 'function' ? (
          <div className="grid grid-cols-2 gap-2">
            {functionTemplates.map((template) => (
              <TemplateCard key={template.id} template={template} onSelect={onSelect} />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {industryGroups.map((group) => (
              <div key={group.subcategory}>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  {group.subcategory}
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {group.templates.map((template) => (
                    <TemplateCard key={template.id} template={template} onSelect={onSelect} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={onSkip}
        className="w-full text-center text-sm text-gray-500 hover:text-gray-700 py-2"
      >
        Skip — start from scratch
      </button>
    </div>
  )
}

function TemplateCard({ template, onSelect }: { template: ProcessTemplate; onSelect: (t: ProcessTemplate) => void }) {
  return (
    <button
      onClick={() => onSelect(template)}
      className="text-left px-3 py-3 border border-gray-200 rounded-lg hover:border-brand-orange/50 hover:bg-brand-orange/5 transition-colors"
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{template.icon}</span>
        <span className="text-sm font-medium text-gray-900">{template.name}</span>
      </div>
      <p className="text-xs text-gray-500 line-clamp-2">{template.description}</p>
      <p className="text-[10px] text-gray-400 mt-1">
        {template.steps.length} steps · {template.swimlanes.length} lanes
      </p>
    </button>
  )
}
