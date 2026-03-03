'use client'

import { useState } from 'react'
import { X, Download, FileText } from 'lucide-react'
import type { ProcessSnapshot } from '@/types/process-builder'

interface ExportDialogProps {
  snapshot: ProcessSnapshot
  processName: string
  onClose: () => void
}

export default function ExportDialog({ snapshot, processName, onClose }: ExportDialogProps) {
  const [paperSize, setPaperSize] = useState<'a3' | 'a4'>('a3')
  const [showAnnotations, setShowAnnotations] = useState(true)
  const [showLegend, setShowLegend] = useState(true)
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    try {
      const { generateProcessPDF } = await import(/* webpackChunkName: "pdf-gen-v8" */ '../utils/pdf-generator')
      const doc = generateProcessPDF(snapshot, processName, {
        paperSize,
        showAnnotations,
        showLegend,
      })
      doc.save(`${processName.replace(/\s+/g, '-').toLowerCase()}-workflow.pdf`)
    } catch (error) {
      console.error('Error generating PDF:', error)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-brand-navy" />
            <h2 className="text-lg font-semibold text-gray-900">Export PDF</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Paper size */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Paper Size</label>
            <div className="flex gap-3">
              <button
                onClick={() => setPaperSize('a3')}
                className={`flex-1 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                  paperSize === 'a3'
                    ? 'border-brand-orange bg-brand-orange/5 text-brand-orange'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                A3 Landscape
                <p className="text-xs text-gray-400 mt-0.5 font-normal">Recommended</p>
              </button>
              <button
                onClick={() => setPaperSize('a4')}
                className={`flex-1 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                  paperSize === 'a4'
                    ? 'border-brand-orange bg-brand-orange/5 text-brand-orange'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                A4 Landscape
                <p className="text-xs text-gray-400 mt-0.5 font-normal">Compact</p>
              </button>
            </div>
          </div>

          {/* Options */}
          <div className="space-y-3">
            <label className="flex items-center justify-between">
              <span className="text-sm text-gray-700">Show annotations (duration, systems)</span>
              <button
                onClick={() => setShowAnnotations(!showAnnotations)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  showAnnotations ? 'bg-brand-orange' : 'bg-gray-200'
                }`}
              >
                <span
                  className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform"
                  style={{ transform: showAnnotations ? 'translateX(18px)' : 'translateX(2px)' }}
                />
              </button>
            </label>

            <label className="flex items-center justify-between">
              <span className="text-sm text-gray-700">Show legend</span>
              <button
                onClick={() => setShowLegend(!showLegend)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  showLegend ? 'bg-brand-orange' : 'bg-gray-200'
                }`}
              >
                <span
                  className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform"
                  style={{ transform: showLegend ? 'translateX(18px)' : 'translateX(2px)' }}
                />
              </button>
            </label>
          </div>

          {/* Summary */}
          <div className="bg-gray-50 rounded-lg px-4 py-3 text-xs text-gray-500">
            <p>{snapshot.steps.length} steps across {snapshot.swimlanes.length} swimlanes</p>
            <p>{snapshot.flows.length} connections</p>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || snapshot.steps.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm text-white bg-brand-orange rounded-lg hover:bg-brand-orange/90 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {exporting ? 'Generating...' : 'Download PDF'}
          </button>
        </div>
      </div>
    </div>
  )
}
