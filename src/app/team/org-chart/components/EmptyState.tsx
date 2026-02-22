'use client'

import { Network, UserPlus, ArrowRight, Users } from 'lucide-react'
import { ORG_CHART_TEMPLATES, OrgChartTemplate } from '../utils/templates'

interface EmptyStateProps {
  onQuickStart: () => void
  onApplyTemplate: (template: OrgChartTemplate) => void
}

export default function EmptyState({ onQuickStart, onApplyTemplate }: EmptyStateProps) {
  return (
    <div className="flex items-center justify-center min-h-[500px]">
      <div className="text-center max-w-2xl">
        {/* Illustration */}
        <div className="mb-6 flex justify-center">
          <div className="relative">
            <div className="w-20 h-20 bg-brand-navy/10 rounded-2xl flex items-center justify-center">
              <Network className="w-10 h-10 text-brand-navy" />
            </div>
            <div className="absolute -right-3 -bottom-2 w-8 h-8 bg-brand-orange/20 rounded-lg flex items-center justify-center">
              <UserPlus className="w-4 h-4 text-brand-orange" />
            </div>
          </div>
        </div>

        <h2 className="text-xl font-bold text-gray-900 mb-2">
          Build Your Org Chart
        </h2>
        <p className="text-gray-500 mb-6">
          Visualise your team structure and plan future growth.
        </p>

        {/* Steps */}
        <div className="flex items-center justify-center gap-3 mb-6 text-sm text-gray-600">
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-5 bg-brand-navy text-white rounded-full text-xs flex items-center justify-center font-medium">1</span>
            <span>Add yourself</span>
          </div>
          <ArrowRight className="w-3 h-3 text-gray-300" />
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-5 bg-brand-navy/70 text-white rounded-full text-xs flex items-center justify-center font-medium">2</span>
            <span>Add reports</span>
          </div>
          <ArrowRight className="w-3 h-3 text-gray-300" />
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-5 bg-brand-navy/50 text-white rounded-full text-xs flex items-center justify-center font-medium">3</span>
            <span>Build teams</span>
          </div>
        </div>

        <button
          onClick={onQuickStart}
          className="inline-flex items-center gap-2 px-6 py-3 bg-brand-orange text-white rounded-lg font-medium hover:bg-brand-orange-600 transition-colors shadow-sm"
        >
          <Users className="w-4 h-4" />
          Start Blank (Owner / CEO)
        </button>

        {/* Templates */}
        <div className="mt-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400 uppercase tracking-wider">
              or start from a template
            </span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            {ORG_CHART_TEMPLATES.map((template) => (
              <button
                key={template.id}
                onClick={() => onApplyTemplate(template)}
                className="text-left p-4 bg-white border border-gray-200 rounded-lg hover:border-brand-orange hover:shadow-sm transition-all group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-7 h-7 bg-brand-navy/10 rounded-lg flex items-center justify-center group-hover:bg-brand-orange/10 transition-colors">
                    <Users className="w-3.5 h-3.5 text-brand-navy group-hover:text-brand-orange transition-colors" />
                  </div>
                  <span className="text-sm font-semibold text-gray-900">{template.label}</span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">{template.description}</p>
                <p className="text-[11px] text-brand-orange font-medium mt-2">
                  {template.roleCount} roles
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
