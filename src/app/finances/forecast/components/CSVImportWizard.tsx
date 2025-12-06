'use client'

import React, { useState, useCallback } from 'react'
import { X, Upload, FileText, CheckCircle, AlertTriangle, Download } from 'lucide-react'
import { parseXeroCSV, convertToPLLines, type ParsedCSVData } from '../utils/csv-parser'
import type { FinancialForecast, PLLine } from '../types'

interface CSVImportWizardProps {
  isOpen: boolean
  onClose: () => void
  forecast: FinancialForecast
  onImportComplete: () => void
}

interface ImportStep {
  label: string
  period: string
  description: string
  isBaseline: boolean
  required: boolean
}

export default function CSVImportWizard({
  isOpen,
  onClose,
  forecast,
  onImportComplete
}: CSVImportWizardProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [baselineData, setBaselineData] = useState<ParsedCSVData | null>(null)
  const [ytdData, setYtdData] = useState<ParsedCSVData | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Determine what imports are needed based on forecast state
  const today = new Date()
  const fyStart = new Date(forecast.actual_start_month + '-01')
  const fyEnd = new Date(forecast.forecast_end_month + '-01')
  const isRolling = today >= fyStart && today <= fyEnd

  const importSteps: ImportStep[] = [
    {
      label: 'Baseline Year',
      period: `${forecast.baseline_start_month} to ${forecast.baseline_end_month}`,
      description: 'Historical data for forecasting patterns',
      isBaseline: true,
      required: true
    }
  ]

  if (isRolling) {
    importSteps.push({
      label: 'Current Year YTD',
      period: `${forecast.actual_start_month} to ${forecast.actual_end_month}`,
      description: 'Year-to-date actuals for current fiscal year',
      isBaseline: false,
      required: true
    })
  }

  const currentImportStep = importSteps[currentStep]
  const isLastStep = currentStep === importSteps.length - 1

  const handleFileSelect = useCallback(async (file: File) => {
    setError(null)
    setIsUploading(true)

    try {
      const text = await file.text()
      const result = parseXeroCSV(text)

      if (!result.success) {
        setError(result.error || 'Failed to parse CSV')
        setIsUploading(false)
        return
      }

      if (!result.data) {
        setError('No data found in CSV')
        setIsUploading(false)
        return
      }

      // Store the parsed data
      if (currentImportStep.isBaseline) {
        setBaselineData(result.data)
      } else {
        setYtdData(result.data)
      }

      setIsUploading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read file')
      setIsUploading(false)
    }
  }, [currentImportStep])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const file = e.dataTransfer.files[0]
    if (file && file.name.endsWith('.csv')) {
      handleFileSelect(file)
    } else {
      setError('Please upload a CSV file')
    }
  }, [handleFileSelect])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }, [handleFileSelect])

  const handleNext = async () => {
    if (isLastStep) {
      // Import the data
      await importData()
    } else {
      setCurrentStep(currentStep + 1)
      setError(null)
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
      setError(null)
    }
  }

  const importData = async () => {
    setIsUploading(true)
    setError(null)

    try {
      const linesToImport: PLLine[] = []

      // Convert baseline data to PL lines
      if (baselineData) {
        const baselineLines = convertToPLLines(baselineData, forecast.id!, true)
        linesToImport.push(...baselineLines)
      }

      // Merge YTD data into the same lines
      if (ytdData) {
        ytdData.accounts.forEach(ytdAccount => {
          const existingLine = linesToImport.find(l => l.account_name === ytdAccount.accountName)
          if (existingLine) {
            // Merge YTD months into existing line's actual_months
            Object.assign(existingLine.actual_months, ytdAccount.months)
          } else {
            // Create new line for this account
            linesToImport.push({
              forecast_id: forecast.id!,
              account_name: ytdAccount.accountName,
              category: ytdAccount.category as any,
              sort_order: linesToImport.length,
              actual_months: ytdAccount.months,
              forecast_months: {},
              is_manual: false,
              is_from_xero: false
            })
          }
        })
      }

      // Call API to save the data
      const response = await fetch('/api/forecasts/import-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          forecastId: forecast.id,
          lines: linesToImport
        })
      })

      if (!response.ok) {
        throw new Error('Failed to import data')
      }

      setIsUploading(false)
      onImportComplete()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import data')
      setIsUploading(false)
    }
  }

  const currentData = currentImportStep.isBaseline ? baselineData : ytdData
  const canProceed = currentData !== null

  // Early return after all hooks are called
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Import Historical Data from Xero
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Step {currentStep + 1} of {importSteps.length}: {currentImportStep.label}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Step Progress */}
          <div className="mb-6">
            <div className="flex items-center">
              {importSteps.map((step, index) => (
                <React.Fragment key={index}>
                  <div className={`flex items-center ${index === currentStep ? 'text-brand-orange' : index < currentStep ? 'text-green-600' : 'text-gray-400'}`}>
                    <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${
                      index === currentStep ? 'border-brand-orange bg-brand-orange-50' :
                      index < currentStep ? 'border-green-600 bg-green-50' :
                      'border-gray-300'
                    }`}>
                      {index < currentStep ? (
                        <CheckCircle className="w-5 h-5" />
                      ) : (
                        <span className="text-sm font-medium">{index + 1}</span>
                      )}
                    </div>
                    <span className="ml-2 text-sm font-medium">{step.label}</span>
                  </div>
                  {index < importSteps.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-4 ${index < currentStep ? 'bg-green-600' : 'bg-gray-300'}`} />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Instructions */}
          <div className="mb-6 p-4 bg-brand-orange-50 border border-brand-orange-200 rounded-lg">
            <h3 className="text-sm font-medium text-brand-navy mb-2">
              Export from Xero: {currentImportStep.period}
            </h3>
            <ol className="text-sm text-brand-orange-800 space-y-1 list-decimal list-inside">
              <li>Log in to Xero</li>
              <li>Go to <strong>Accounting → Reports → Profit and Loss</strong></li>
              <li>Set date range to the last month only: <strong>1 {new Date(currentImportStep.period.split(' to ')[1] + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</strong> to <strong>{new Date(new Date(currentImportStep.period.split(' to ')[1] + '-01').getFullYear(), new Date(currentImportStep.period.split(' to ')[1] + '-01').getMonth() + 1, 0).getDate()} {new Date(currentImportStep.period.split(' to ')[1] + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</strong></li>
              <li>Select <strong>"Compare: Prior 11 months"</strong></li>
              <li>Click <strong>Update</strong></li>
              <li>Click <strong>Export → Excel</strong> and download the file</li>
              <li>Open in Excel and <strong>Save As → CSV</strong></li>
              <li>Upload the CSV file below</li>
            </ol>
            <p className="mt-2 text-xs text-brand-orange-700">
              {currentImportStep.description}
            </p>
          </div>

          {/* Upload Area */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging
                ? 'border-brand-orange-500 bg-brand-orange-50'
                : currentData
                ? 'border-green-500 bg-green-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            {currentData ? (
              <div className="space-y-2">
                <CheckCircle className="mx-auto h-12 w-12 text-green-600" />
                <div className="text-sm font-medium text-green-900">
                  File uploaded successfully!
                </div>
                <div className="text-xs text-green-700">
                  {currentData.totalAccounts} accounts, {currentData.monthKeys.length} months
                  <br />
                  Period: {currentData.startMonth} to {currentData.endMonth}
                </div>
                <button
                  onClick={() => {
                    if (currentImportStep.isBaseline) {
                      setBaselineData(null)
                    } else {
                      setYtdData(null)
                    }
                  }}
                  className="text-sm text-brand-orange hover:text-brand-orange-700 underline"
                >
                  Upload a different file
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <Upload className="mx-auto h-12 w-12 text-gray-400" />
                <div className="text-sm font-medium text-gray-900">
                  Drag and drop your CSV file here
                </div>
                <div className="text-xs text-gray-500">or</div>
                <label className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 cursor-pointer">
                  <FileText className="w-4 h-4 mr-2" />
                  Browse files
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileInputChange}
                    className="hidden"
                  />
                </label>
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
              <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5 mr-3 flex-shrink-0" />
              <div className="text-sm text-red-800">{error}</div>
            </div>
          )}

          {/* Download Template */}
          <div className="mt-6 text-center">
            <a
              href="#"
              className="inline-flex items-center text-sm text-gray-600 hover:text-gray-700"
            >
              <Download className="w-4 h-4 mr-1" />
              Download CSV template
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-t border-gray-200">
          <button
            onClick={handleBack}
            disabled={currentStep === 0}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Back
          </button>
          <button
            onClick={handleNext}
            disabled={!canProceed || isUploading}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-orange rounded-md hover:bg-brand-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUploading ? 'Importing...' : isLastStep ? 'Import Data' : 'Next Step'}
          </button>
        </div>
      </div>
    </div>
  )
}
