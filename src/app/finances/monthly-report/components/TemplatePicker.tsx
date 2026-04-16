'use client'

import { ChevronDown, Star, Trash2 } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import type { ReportTemplate } from '../types'

interface TemplatePickerProps {
  templates: ReportTemplate[]
  activeTemplateId: string | null
  isLoading: boolean
  onApply: (template: ReportTemplate) => void
  onDelete: (template: ReportTemplate) => void
  onSetDefault: (template: ReportTemplate) => void
}

export default function TemplatePicker({
  templates,
  activeTemplateId,
  isLoading,
  onApply,
  onDelete,
  onSetDefault,
}: TemplatePickerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const activeTemplate = templates.find(t => t.id === activeTemplateId) ?? null

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (isLoading) {
    return (
      <div className="h-9 bg-gray-100 animate-pulse rounded-lg" />
    )
  }

  if (templates.length === 0) {
    return (
      <p className="text-xs text-gray-400 italic py-1">
        No templates saved yet — configure settings and click &quot;Save as Template&quot;.
      </p>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 hover:border-gray-400 transition-colors"
      >
        <span className="truncate">
          {activeTemplate ? (
            <span className="flex items-center gap-1.5">
              {activeTemplate.is_default && (
                <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
              )}
              {activeTemplate.name}
            </span>
          ) : (
            <span className="text-gray-400">Select a template…</span>
          )}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {templates.map(template => (
            <div
              key={template.id}
              className={`flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 group ${
                template.id === activeTemplateId ? 'bg-brand-orange/5' : ''
              }`}
            >
              {/* Main apply button */}
              <button
                type="button"
                onClick={() => { onApply(template); setOpen(false) }}
                className="flex-1 flex items-center gap-2 text-left min-w-0"
              >
                {template.is_default ? (
                  <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />
                ) : (
                  <span className="w-3.5 h-3.5 shrink-0" />
                )}
                <span className={`text-sm truncate ${template.id === activeTemplateId ? 'font-medium text-brand-orange' : 'text-gray-700'}`}>
                  {template.name}
                </span>
                {template.id === activeTemplateId && (
                  <span className="ml-auto text-xs text-brand-orange shrink-0">Active</span>
                )}
              </button>

              {/* Action icons — visible on hover */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                {!template.is_default && (
                  <button
                    type="button"
                    title="Set as default"
                    onClick={(e) => { e.stopPropagation(); onSetDefault(template) }}
                    className="p-1 rounded text-gray-400 hover:text-amber-500 hover:bg-amber-50"
                  >
                    <Star className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  title="Delete template"
                  onClick={(e) => { e.stopPropagation(); onDelete(template) }}
                  className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
