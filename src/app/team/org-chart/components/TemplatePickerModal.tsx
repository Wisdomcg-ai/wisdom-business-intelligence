'use client'

import { useState } from 'react'
import { X, Users, GitBranch, Merge } from 'lucide-react'
import { ORG_CHART_TEMPLATES, OrgChartTemplate } from '../utils/templates'

interface TemplatePickerModalProps {
  onApplyAsVersion: (template: OrgChartTemplate, label: string) => void
  onMergeIntoCurrent: (template: OrgChartTemplate) => void
  onClose: () => void
}

export default function TemplatePickerModal({
  onApplyAsVersion,
  onMergeIntoCurrent,
  onClose,
}: TemplatePickerModalProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<OrgChartTemplate | null>(null)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="text-base font-semibold text-gray-900">Apply Template</h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5">
          {/* Template selection */}
          {!selectedTemplate ? (
            <>
              <p className="text-sm text-gray-500 mb-4">
                Choose a template to apply to your org chart.
              </p>
              <div className="space-y-3">
                {ORG_CHART_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => setSelectedTemplate(template)}
                    className="w-full text-left p-4 bg-white border border-gray-200 rounded-lg hover:border-brand-orange hover:shadow-sm transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-brand-navy/10 rounded-lg flex items-center justify-center group-hover:bg-brand-orange/10 transition-colors flex-shrink-0">
                        <Users className="w-4 h-4 text-brand-navy group-hover:text-brand-orange transition-colors" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-gray-900">
                            {template.label}
                          </span>
                          <span className="text-xs text-brand-orange font-medium">
                            {template.roleCount} roles
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {template.description}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            /* Apply mode selection */
            <>
              <button
                onClick={() => setSelectedTemplate(null)}
                className="text-xs text-gray-500 hover:text-gray-700 mb-3 flex items-center gap-1"
              >
                &larr; Back to templates
              </button>

              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-brand-orange/10 rounded-lg flex items-center justify-center">
                  <Users className="w-4 h-4 text-brand-orange" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">
                    {selectedTemplate.label}
                  </h4>
                  <p className="text-xs text-gray-500">
                    {selectedTemplate.roleCount} roles
                  </p>
                </div>
              </div>

              <p className="text-sm text-gray-600 mb-4">
                How would you like to apply this template?
              </p>

              <div className="space-y-3">
                <button
                  onClick={() => {
                    onApplyAsVersion(selectedTemplate, `${selectedTemplate.label} Template`)
                    onClose()
                  }}
                  className="w-full text-left p-4 border border-gray-200 rounded-lg hover:border-brand-navy hover:shadow-sm transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-indigo-50 rounded-lg flex items-center justify-center group-hover:bg-brand-navy/10 transition-colors flex-shrink-0">
                      <GitBranch className="w-4 h-4 text-indigo-600 group-hover:text-brand-navy transition-colors" />
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-gray-900">
                        Apply as New Version
                      </span>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Creates a separate version with the template structure.
                        Your current chart stays untouched.
                      </p>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    onMergeIntoCurrent(selectedTemplate)
                    onClose()
                  }}
                  className="w-full text-left p-4 border border-gray-200 rounded-lg hover:border-emerald-500 hover:shadow-sm transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center group-hover:bg-emerald-100 transition-colors flex-shrink-0">
                      <Merge className="w-4 h-4 text-emerald-600 transition-colors" />
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-gray-900">
                        Merge into Current
                      </span>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Adds missing roles from the template to your current chart.
                        Existing roles are kept as-is.
                      </p>
                    </div>
                  </div>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
