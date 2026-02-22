'use client'

import { useState } from 'react'
import { X, Download } from 'lucide-react'

interface PDFExportDialogProps {
  defaultShowSalaries: boolean
  onExport: (options: {
    showHeadcount: boolean
    showSalaries: boolean
    showDepartment: boolean
    showEmploymentType: boolean
    showVacant: boolean
    showAssistant: boolean
  }) => void
  onClose: () => void
}

export default function PDFExportDialog({
  defaultShowSalaries,
  onExport,
  onClose,
}: PDFExportDialogProps) {
  const [showHeadcount, setShowHeadcount] = useState(true)
  const [showSalaries, setShowSalaries] = useState(defaultShowSalaries)
  const [showDepartment, setShowDepartment] = useState(true)
  const [showEmploymentType, setShowEmploymentType] = useState(false)
  const [showVacant, setShowVacant] = useState(true)
  const [showAssistant, setShowAssistant] = useState(true)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="text-base font-semibold text-gray-900">Export PDF</h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Analytics section */}
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
              Analytics
            </p>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showHeadcount}
                  onChange={(e) => setShowHeadcount(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-brand-navy focus:ring-brand-navy"
                />
                <span className="text-sm text-gray-700">Headcount</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showSalaries}
                  onChange={(e) => setShowSalaries(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-brand-navy focus:ring-brand-navy"
                />
                <span className="text-sm text-gray-700">Costs &amp; salaries</span>
              </label>
            </div>
          </div>

          {/* Node tags section */}
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
              Node Tags
            </p>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showDepartment}
                  onChange={(e) => setShowDepartment(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-brand-navy focus:ring-brand-navy"
                />
                <span className="text-sm text-gray-700">Department</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showEmploymentType}
                  onChange={(e) => setShowEmploymentType(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-brand-navy focus:ring-brand-navy"
                />
                <span className="text-sm text-gray-700">Employment type</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showVacant}
                  onChange={(e) => setShowVacant(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-brand-navy focus:ring-brand-navy"
                />
                <span className="text-sm text-gray-700">Planned / vacant</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showAssistant}
                  onChange={(e) => setShowAssistant(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-brand-navy focus:ring-brand-navy"
                />
                <span className="text-sm text-gray-700">Assistant</span>
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onExport({
              showHeadcount,
              showSalaries,
              showDepartment,
              showEmploymentType,
              showVacant,
              showAssistant,
            })}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-brand-navy rounded-lg hover:bg-brand-navy-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
        </div>
      </div>
    </div>
  )
}
