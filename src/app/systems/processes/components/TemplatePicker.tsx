'use client'

import { PROCESS_TEMPLATES, type ProcessTemplate } from '../utils/templates'

interface TemplatePickerProps {
  onSelect: (template: ProcessTemplate) => void
  onSkip: () => void
}

export default function TemplatePicker({ onSelect, onSkip }: TemplatePickerProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Start from a template</h3>
        <p className="text-xs text-gray-500">
          Templates create a complete connected diagram. You can edit everything after.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {PROCESS_TEMPLATES.map((template) => (
          <button
            key={template.id}
            onClick={() => onSelect(template)}
            className="text-left px-3 py-3 border border-gray-200 rounded-lg hover:border-brand-orange/50 hover:bg-brand-orange/5 transition-colors"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{template.icon}</span>
              <span className="text-sm font-medium text-gray-900">{template.name}</span>
            </div>
            <p className="text-xs text-gray-500">{template.description}</p>
            <p className="text-[10px] text-gray-400 mt-1">
              {template.steps.length} steps, {template.swimlanes.length} lanes
            </p>
          </button>
        ))}
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
