'use client'

import type { ProcessSnapshot } from '@/types/process-builder'
import { PROCESS_TEMPLATES, templateToSnapshot } from '../../utils/templates'

interface SVGEmptyStateProps {
  onSelectTemplate: (snapshot: ProcessSnapshot) => void
}

// Pick 3 featured templates: Sales, Client Onboarding, and Plumbing Maintenance
const FEATURED_IDS = ['sales', 'client-onboarding', 'plumbing-maintenance']
const FEATURED = FEATURED_IDS
  .map((id) => PROCESS_TEMPLATES.find((t) => t.id === id))
  .filter(Boolean)

export default function SVGEmptyState({ onSelectTemplate }: SVGEmptyStateProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="text-center space-y-6 max-w-md px-6">
        {/* Icon */}
        <div className="w-20 h-20 mx-auto bg-gradient-to-br from-orange-50 to-amber-50 rounded-2xl flex items-center justify-center border border-orange-100">
          <svg className="w-10 h-10 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
          </svg>
        </div>

        {/* Heading */}
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Start building your process</h3>
          <p className="text-sm text-gray-500 mt-1.5">
            Double-click anywhere on the diagram to add your first step,
            or choose a template to get started quickly.
          </p>
        </div>

        {/* Hint */}
        <div className="flex items-center justify-center gap-4 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] font-mono">double-click</kbd>
            Add step
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] font-mono">N</kbd>
            New step
          </span>
        </div>

        {/* Templates */}
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">Or start from a template</p>
          <div className="grid grid-cols-3 gap-3">
            {FEATURED.map((t) => t && (
              <button
                key={t.id}
                onClick={() => onSelectTemplate(templateToSnapshot(t))}
                className="flex flex-col items-center gap-2 p-4 bg-white border border-gray-200 rounded-xl hover:border-orange-300 hover:shadow-md transition-all group"
              >
                <span className="text-2xl group-hover:scale-110 transition-transform">{t.icon}</span>
                <span className="text-xs font-semibold text-gray-700">{t.name}</span>
                <span className="text-[10px] text-gray-400">{t.steps.length} steps · {t.swimlanes.length} lanes</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
