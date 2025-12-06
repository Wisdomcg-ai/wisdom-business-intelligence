'use client'

import React, { useState } from 'react'
import { Download, FileText, FileSpreadsheet, Loader2, ChevronDown } from 'lucide-react'

interface ExportControlsProps {
  forecastId: string
  userId: string
  className?: string
}

export default function ExportControls({ forecastId, userId, className = '' }: ExportControlsProps) {
  const [isExporting, setIsExporting] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [exportFormat, setExportFormat] = useState<'pdf' | 'excel' | null>(null)

  const handleExport = async (format: 'pdf' | 'excel') => {
    setIsExporting(true)
    setExportFormat(format)
    setIsDropdownOpen(false)

    try {
      const response = await fetch(`/api/forecasts/export?forecast_id=${forecastId}&user_id=${userId}&format=${format}`)

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Export failed')
      }

      // Get filename from Content-Disposition header or create default
      const contentDisposition = response.headers.get('Content-Disposition')
      let filename = `forecast_${new Date().getTime()}.${format === 'pdf' ? 'pdf' : 'xlsx'}`

      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/)
        if (filenameMatch) {
          filename = filenameMatch[1]
        }
      }

      // Download the file
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      // Success feedback
      console.log(`Exported successfully as ${format.toUpperCase()}`)
    } catch (error) {
      console.error('Export error:', error)
      alert(`Failed to export forecast: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsExporting(false)
      setExportFormat(null)
    }
  }

  return (
    <div className={`relative ${className}`}>
      {/* Main Export Button */}
      <button
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        disabled={isExporting}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-orange disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isExporting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Exporting {exportFormat?.toUpperCase()}...</span>
          </>
        ) : (
          <>
            <Download className="w-4 h-4" />
            <span>Export</span>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isDropdownOpen ? 'transform rotate-180' : ''}`} />
          </>
        )}
      </button>

      {/* Dropdown Menu */}
      {isDropdownOpen && !isExporting && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsDropdownOpen(false)}
          />

          {/* Menu */}
          <div className="absolute top-full right-0 mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
            <div className="p-2">
              {/* PDF Export */}
              <button
                onClick={() => handleExport('pdf')}
                className="flex items-start gap-3 w-full px-3 py-3 text-left rounded-lg hover:bg-gray-50 transition-colors group"
              >
                <FileText className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 group-hover:text-red-600">
                    Export as PDF
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Professional summary report
                  </div>
                </div>
              </button>

              {/* Divider */}
              <div className="my-2 border-t border-gray-200" />

              {/* Excel Export */}
              <button
                onClick={() => handleExport('excel')}
                className="flex items-start gap-3 w-full px-3 py-3 text-left rounded-lg hover:bg-gray-50 transition-colors group"
              >
                <FileSpreadsheet className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 group-hover:text-green-600">
                    Export as Excel
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Full data with formulas
                  </div>
                </div>
              </button>
            </div>

            {/* Info Footer */}
            <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 rounded-b-lg">
              <p className="text-xs text-gray-600">
                Exports include all P&L data, assumptions, and active scenario
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
