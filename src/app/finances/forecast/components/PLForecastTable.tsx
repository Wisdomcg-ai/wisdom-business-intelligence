'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Plus, X, ChevronDown, ChevronRight, Calculator, TrendingUp, Lock, Unlock, Eye, Settings, FunctionSquare, Undo2, Redo2 } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { FinancialForecast, PLLine, ForecastMethod } from '../types'
import ForecastService from '../services/forecast-service'
import { ForecastingEngine } from '../services/forecasting-engine'
import OpExBulkControls from './OpExBulkControls'
import OpExLineControls from './OpExLineControls'

// History state for undo/redo
interface HistoryState {
  lines: PLLine[]
  timestamp: number
}

const MAX_HISTORY = 50 // Keep last 50 states

interface PLForecastTableProps {
  forecast: FinancialForecast
  plLines: PLLine[]
  onSave: (lines: PLLine[]) => void
  onChange?: () => void // Optional callback when data changes
}

export default function PLForecastTable({ forecast, plLines, onSave, onChange }: PLForecastTableProps) {
  const [lines, setLines] = useState<PLLine[]>(plLines)
  const [monthColumns, setMonthColumns] = useState<Array<{
    key: string
    label: string
    isActual: boolean
    isForecast: boolean
    isBaseline?: boolean
  }>>([])
  const [lastActualIndex, setLastActualIndex] = useState<number>(-1) // Track index of last BASELINE month (where we insert FY25 summary cols)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['Revenue']))
  const [editingCell, setEditingCell] = useState<string | null>(null)
  const [inputValue, setInputValue] = useState<string>('')
  const [historicalDataLocked, setHistoricalDataLocked] = useState<boolean>(true)
  const [viewMode, setViewMode] = useState<'view' | 'setup'>('setup') // Toggle between view and setup modes
  const [showFormulas, setShowFormulas] = useState<boolean>(false) // Toggle to show formulas instead of values
  const [cellFormulas, setCellFormulas] = useState<Map<string, string>>(new Map()) // Track formulas by cell ID

  // Undo/Redo state
  const [history, setHistory] = useState<HistoryState[]>([])
  const [historyIndex, setHistoryIndex] = useState<number>(-1)
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const historyInitialized = useRef<boolean>(false)
  const needsSave = useRef<boolean>(false)

  // Virtualization ref
  const tableContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Calculate analysis for lines that don't already have it
    // IMPORTANT: Use only BASELINE months (FY25) for analysis, not current year actuals (FY26 YTD)
    const baselineMonthKeys = monthColumns.filter(c => c.isBaseline === true).map(c => c.key)
    if (baselineMonthKeys.length > 0) {
      const linesWithAnalysis = plLines.map(line => ({
        ...line,
        // Only recalculate analysis if it doesn't exist - preserve existing forecast_method and analysis
        analysis: line.analysis || ForecastingEngine.calculateAnalysis(line, plLines, baselineMonthKeys)
      }))
      setLines(linesWithAnalysis)
    } else {
      setLines(plLines)
    }
  }, [plLines, monthColumns])

  useEffect(() => {
    const columns = ForecastService.generateMonthColumns(
      forecast.actual_start_month,
      forecast.actual_end_month,
      forecast.forecast_start_month,
      forecast.forecast_end_month,
      forecast.baseline_start_month,
      forecast.baseline_end_month
    )

    // Find the index of the last BASELINE month (for visual separator after FY25)
    // This is where we'll insert the FY25 Total, % Revenue, Avg/Mo, and Method columns
    const lastBaselineIdx = columns.reduce((lastIdx, col, idx) => col.isBaseline === true ? idx : lastIdx, -1)

    console.log('[PLForecastTable] Generated columns:', {
      count: columns.length,
      columnKeys: columns.map(c => c.key),
      baselineColumns: columns.filter(c => c.isBaseline === true).map(c => c.key),
      currentYearActuals: columns.filter(c => c.isActual && c.isBaseline === false).map(c => c.key),
      forecastColumns: columns.filter(c => c.isForecast).map(c => c.key),
      lastBaselineIndex: lastBaselineIdx
    })
    if (lines.length > 0) {
      console.log('[PLForecastTable] First line data keys:', Object.keys(lines[0].actual_months || {}))
    }
    setMonthColumns(columns)
    setLastActualIndex(lastBaselineIdx)
  }, [forecast.actual_start_month, forecast.actual_end_month, forecast.forecast_start_month, forecast.forecast_end_month, forecast.baseline_start_month, forecast.baseline_end_month])

  // Initialize history with first state
  useEffect(() => {
    if (plLines.length > 0 && !historyInitialized.current) {
      setHistory([{ lines: plLines, timestamp: Date.now() }])
      setHistoryIndex(0)
      historyInitialized.current = true
    }
  }, [plLines])

  // Save to history when lines change (for undo/redo)
  const saveToHistory = (newLines: PLLine[]) => {
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push({ lines: newLines, timestamp: Date.now() })

    // Keep only last MAX_HISTORY states
    if (newHistory.length > MAX_HISTORY) {
      newHistory.shift()
    }

    setHistory(newHistory)
    setHistoryIndex(newHistory.length - 1)
    needsSave.current = true // Mark that we need to save
  }

  // Undo/Redo functions
  const undo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1
      setHistoryIndex(newIndex)
      setLines(history[newIndex].lines)
    }
  }

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1
      setHistoryIndex(newIndex)
      setLines(history[newIndex].lines)
    }
  }

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        redo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [historyIndex, history])

  // Optimistic save with debouncing
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (needsSave.current && lines.length > 0) {
        setIsSaving(true)
        try {
          await onSave(lines)
          needsSave.current = false // Reset flag after successful save
        } catch (error) {
          console.error('Failed to save:', error)
        } finally {
          setIsSaving(false)
        }
      }
    }, 1000)

    return () => clearTimeout(timer)
  }, [lines, onSave])

  const categories = ['Revenue', 'Cost of Sales', 'Operating Expenses', 'Other Income', 'Other Expenses']

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories)
    if (newExpanded.has(category)) {
      newExpanded.delete(category)
    } else {
      newExpanded.add(category)
    }
    setExpandedCategories(newExpanded)
  }

  const addLine = (category: string) => {
    const newLine: PLLine = {
      account_name: 'New Account',
      category,
      sort_order: lines.filter(l => l.category === category).length,
      actual_months: {},
      forecast_months: {},
      is_manual: true
    }

    const updatedLines = [...lines, newLine]
    saveToHistory(updatedLines)
    setLines(updatedLines)
  }

  const removeLine = (index: number) => {
    const updatedLines = lines.filter((_, i) => i !== index)
    saveToHistory(updatedLines)
    setLines(updatedLines)
  }

  const updateLineName = (index: number, name: string) => {
    const updatedLines = [...lines]
    updatedLines[index].account_name = name
    saveToHistory(updatedLines)
    setLines(updatedLines)
  }

  const evaluateFormula = (formula: string): number => {
    // Remove = sign if present
    const expr = formula.trim().startsWith('=') ? formula.trim().substring(1) : formula.trim()

    try {
      // Evaluate the mathematical expression
      // eslint-disable-next-line no-new-func
      const result = new Function('return ' + expr)()

      if (isNaN(result) || !isFinite(result)) {
        return 0
      }

      return result
    } catch (e) {
      return 0
    }
  }

  const updateLineValue = (index: number, monthKey: string, value: number | string, isForecast: boolean) => {
    const updatedLines = [...lines]
    const cellId = `${index}-${monthKey}`

    // Check if value is a formula (starts with =)
    if (typeof value === 'string' && value.trim().startsWith('=')) {
      const formula = value.trim()
      const result = evaluateFormula(formula)

      // Store the formula
      const newFormulas = new Map(cellFormulas)
      newFormulas.set(cellId, formula)
      setCellFormulas(newFormulas)

      // Store the calculated result
      if (isForecast) {
        updatedLines[index].forecast_months[monthKey] = result
      } else {
        updatedLines[index].actual_months[monthKey] = result
      }
    } else {
      // Regular number input - remove any stored formula
      const newFormulas = new Map(cellFormulas)
      newFormulas.delete(cellId)
      setCellFormulas(newFormulas)

      // Round to 2 decimal places to avoid floating point precision issues
      const numValue = typeof value === 'string' ? parseFloat(value) || 0 : value
      const roundedValue = Math.round(numValue * 100) / 100
      if (isForecast) {
        updatedLines[index].forecast_months[monthKey] = roundedValue
      } else {
        updatedLines[index].actual_months[monthKey] = roundedValue
      }
    }
    saveToHistory(updatedLines)
    setLines(updatedLines)
    onChange?.() // Notify parent of changes
  }

  const calculateCategoryTotal = (category: string, monthKey: string, isForecast: boolean): number => {
    // Sum all lines in the category (no summary lines anymore, just detail lines from chart of accounts)
    const categoryLines = lines.filter(line => line.category === category)

    const total = categoryLines.reduce((sum, line) => {
      const months = isForecast ? line.forecast_months : line.actual_months
      const value = months[monthKey] || 0
      return sum + value
    }, 0)

    return total
  }

  const calculateGrossProfit = (monthKey: string, isForecast: boolean): number => {
    const revenue = calculateCategoryTotal('Revenue', monthKey, isForecast)
    const cogs = calculateCategoryTotal('Cost of Sales', monthKey, isForecast)
    return revenue - cogs
  }

  const calculateNetProfit = (monthKey: string, isForecast: boolean): number => {
    const revenue = calculateCategoryTotal('Revenue', monthKey, isForecast)
    const cogs = calculateCategoryTotal('Cost of Sales', monthKey, isForecast)
    const opex = calculateCategoryTotal('Operating Expenses', monthKey, isForecast)
    const otherIncome = calculateCategoryTotal('Other Income', monthKey, isForecast)
    const otherExpenses = calculateCategoryTotal('Other Expenses', monthKey, isForecast)
    return revenue - cogs - opex + otherIncome - otherExpenses
  }

  const calculateLineFY25Total = (line: PLLine): number => {
    // Sum only baseline months (FY25: 2024-07 to 2025-06)
    if (!forecast.baseline_start_month || !forecast.baseline_end_month) {
      return 0
    }

    const baselineColumns = monthColumns.filter(col => col.isBaseline === true)
    return baselineColumns.reduce((sum, col) => {
      return sum + (line.actual_months?.[col.key] || 0)
    }, 0)
  }

  const calculateLineFY26Total = (line: PLLine): number => {
    // Sum FY26 actuals + forecasts (2025-07 to 2026-06)
    const fy26ActualColumns = monthColumns.filter(col => col.isActual && col.isBaseline === false)
    const fy26ForecastColumns = monthColumns.filter(col => col.isForecast)

    const actualTotal = fy26ActualColumns.reduce((sum, col) => {
      return sum + (line.actual_months?.[col.key] || 0)
    }, 0)

    const forecastTotal = fy26ForecastColumns.reduce((sum, col) => {
      return sum + (line.forecast_months?.[col.key] || 0)
    }, 0)

    return actualTotal + forecastTotal
  }

  const calculateCategoryFY25Total = (category: string): number => {
    return lines
      .filter(line => line.category === category)
      .reduce((sum, line) => sum + calculateLineFY25Total(line), 0)
  }

  const calculateCategoryFY26Total = (category: string): number => {
    // Sum all lines in the category (no summary lines anymore, just detail lines from chart of accounts)
    return lines
      .filter(line => line.category === category)
      .reduce((sum, line) => sum + calculateLineFY26Total(line), 0)
  }

  const calculateGrossProfitFY25Total = (): number => {
    const revenue = calculateCategoryFY25Total('Revenue')
    const cogs = calculateCategoryFY25Total('Cost of Sales')
    return revenue - cogs
  }

  const calculateGrossProfitFY26Total = (): number => {
    const revenue = calculateCategoryFY26Total('Revenue')
    const cogs = calculateCategoryFY26Total('Cost of Sales')
    return revenue - cogs
  }

  const calculateNetProfitFY25Total = (): number => {
    const revenue = calculateCategoryFY25Total('Revenue')
    const cogs = calculateCategoryFY25Total('Cost of Sales')
    const opex = calculateCategoryFY25Total('Operating Expenses')
    const otherIncome = calculateCategoryFY25Total('Other Income')
    const otherExpenses = calculateCategoryFY25Total('Other Expenses')
    return revenue - cogs - opex + otherIncome - otherExpenses
  }

  const calculateNetProfitFY26Total = (): number => {
    const revenue = calculateCategoryFY26Total('Revenue')
    const cogs = calculateCategoryFY26Total('Cost of Sales')
    const opex = calculateCategoryFY26Total('Operating Expenses')
    const otherIncome = calculateCategoryFY26Total('Other Income')
    const otherExpenses = calculateCategoryFY26Total('Other Expenses')
    return revenue - cogs - opex + otherIncome - otherExpenses
  }

  const formatCurrency = (value: number) => {
    if (value === 0) return '-'
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  const formatInputValue = (value: number) => {
    if (!value || value === 0) return ''
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  const formatEditingValue = (value: number) => {
    if (!value || value === 0) return ''
    // Round to 2 decimal places for editing
    return value.toFixed(2)
  }

  const updateForecastMethod = async (index: number, method: ForecastMethod) => {
    const updatedLines = [...lines]
    const line = updatedLines[index]

    // Set forecast method config
    line.forecast_method = {
      method,
      ...(method === 'straight_line' && { base_amount: line.analysis?.fy_average_per_month || 0 }),
      ...(method === 'growth_rate' && { growth_rate: 0.05, growth_type: 'MoM' as 'MoM' | 'YoY' }),
      ...(method === 'driver_based' && { driver_percentage: 0.25 })
    }

    console.log('🔧 updateForecastMethod called:', {
      lineIndex: index,
      lineName: line.account_name,
      method,
      config: line.forecast_method,
      currentForecastMonths: Object.keys(line.forecast_months || {}).length
    })

    // Recalculate forecasts
    const baselineMonthKeys = monthColumns.filter(c => c.isBaseline === true).map(c => c.key)
    const forecastMonthKeys = monthColumns.filter(c => c.isForecast).map(c => c.key)

    console.log('📊 Recalculating with:', {
      baselineMonthCount: baselineMonthKeys.length,
      forecastMonthCount: forecastMonthKeys.length,
      totalLines: updatedLines.length
    })

    const recalculatedLines = ForecastingEngine.recalculateAllForecasts(
      updatedLines,
      baselineMonthKeys,
      forecastMonthKeys
    )

    console.log('✅ Recalculated line forecast:', {
      lineName: recalculatedLines[index].account_name,
      forecastMonths: recalculatedLines[index].forecast_months,
      totalForecast: Object.values(recalculatedLines[index].forecast_months || {}).reduce((s, v) => s + v, 0)
    })

    setLines(recalculatedLines)
    needsSave.current = true

    // Persist to database using the onSave callback
    onSave(recalculatedLines)
  }

  // Handler for per-line method change
  const handleLineMethodChange = (index: number, method: ForecastMethod) => {
    const updatedLines = [...lines]
    const line = updatedLines[index]

    // Keep existing percentage_increase if it exists
    const existingPercentage = line.forecast_method?.percentage_increase || 0

    line.forecast_method = {
      method,
      percentage_increase: existingPercentage,
      base_amount: line.analysis?.fy_average_per_month || 0,
      ...(method === 'driver_based' && { driver_percentage: 0.05 })
    }

    // Recalculate
    const baselineMonthKeys = monthColumns.filter(c => c.isBaseline === true).map(c => c.key)
    const forecastMonthKeys = monthColumns.filter(c => c.isForecast).map(c => c.key)

    const recalculatedLines = ForecastingEngine.recalculateAllForecasts(
      updatedLines,
      baselineMonthKeys,
      forecastMonthKeys
    )

    setLines(recalculatedLines)
    needsSave.current = true
    onSave(recalculatedLines)
  }

  // Handler for per-line percentage change
  const handleLinePercentageChange = (index: number, percentage: number) => {
    const updatedLines = [...lines]
    const line = updatedLines[index]

    if (line.forecast_method) {
      line.forecast_method.percentage_increase = percentage / 100 // Convert from 5 to 0.05
    }

    // Recalculate
    const baselineMonthKeys = monthColumns.filter(c => c.isBaseline === true).map(c => c.key)
    const forecastMonthKeys = monthColumns.filter(c => c.isForecast).map(c => c.key)

    const recalculatedLines = ForecastingEngine.recalculateAllForecasts(
      updatedLines,
      baselineMonthKeys,
      forecastMonthKeys
    )

    setLines(recalculatedLines)
    needsSave.current = true
    onSave(recalculatedLines)
  }

  return (
    <div className="bg-white rounded-lg shadow-sm">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Profit & Loss Forecast</h2>
            <p className="text-sm text-gray-600 mt-1">
              {viewMode === 'view'
                ? 'Viewing forecast results - Switch to Setup Mode to make changes'
                : 'Setup Mode - Configure your forecast assumptions and methods'
              }
              {isSaving && (
                <span className="ml-2 text-teal-600 text-xs">
                  • Saving...
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Undo/Redo Buttons */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={undo}
                disabled={historyIndex <= 0}
                className="flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white hover:text-gray-900 text-gray-600"
                title="Undo (Ctrl+Z)"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button
                onClick={redo}
                disabled={historyIndex >= history.length - 1}
                className="flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white hover:text-gray-900 text-gray-600"
                title="Redo (Ctrl+Y)"
              >
                <Redo2 className="w-4 h-4" />
              </button>
            </div>
            {/* View/Setup Mode Toggle */}
            <div className="flex items-center bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('view')}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  viewMode === 'view'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Eye className="w-4 h-4" />
                View Mode
              </button>
              <button
                onClick={() => setViewMode('setup')}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  viewMode === 'setup'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Settings className="w-4 h-4" />
                Setup Mode
              </button>
            </div>

            {/* Historical Data Lock */}
            <button
              onClick={() => setHistoricalDataLocked(!historicalDataLocked)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                historicalDataLocked
                  ? 'bg-teal-50 text-teal-700 hover:bg-teal-100'
                  : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
              }`}
            >
              {historicalDataLocked ? (
                <>
                  <Lock className="w-4 h-4" />
                  FY25 Locked
                </>
              ) : (
                <>
                  <Unlock className="w-4 h-4" />
                  FY25 Unlocked
                </>
              )}
            </button>

            {/* Show Formulas Toggle */}
            {viewMode === 'setup' && cellFormulas.size > 0 && (
              <button
                onClick={() => setShowFormulas(!showFormulas)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  showFormulas
                    ? 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                    : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                }`}
                title={showFormulas ? 'Show values' : 'Show formulas'}
              >
                <FunctionSquare className="w-4 h-4" />
                {showFormulas ? 'Show Values' : `Show Formulas (${cellFormulas.size})`}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto relative">
        <table className="w-full">
          <thead className="sticky top-0 z-20">
            <tr className="border-b border-gray-200">
              <th className="sticky left-0 top-0 z-40 bg-white px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r-2 border-gray-300 min-w-[250px] shadow-[2px_0_4px_rgba(0,0,0,0.05)]">
                Account
              </th>
              {monthColumns.map((col, idx) => {
                const isLastActual = idx === lastActualIndex; // Last actual month
                // In View mode, only show forecast columns
                if (viewMode === 'view' && col.isActual) return null

                return (
                  <React.Fragment key={col.key}>
                    <th
                      className={`sticky top-0 px-4 py-3 text-right text-xs font-medium uppercase tracking-wider min-w-[140px] ${
                        col.isActual ? 'bg-teal-50 text-teal-700' : 'bg-green-50 text-green-700'
                      } ${isLastActual ? 'border-r-2 border-gray-300' : ''}`}
                    >
                      {col.label}
                    </th>
                    {isLastActual && viewMode === 'setup' && (
                      <>
                        <th className="sticky top-0 px-4 py-3 text-right text-xs font-medium text-teal-700 uppercase tracking-wider min-w-[160px] bg-teal-100">
                          FY25 Total
                        </th>
                        <th className="sticky top-0 px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider min-w-[120px] bg-amber-50">
                          % Revenue
                        </th>
                        <th className="sticky top-0 px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider min-w-[140px] bg-amber-50">
                          FY25 Avg/Mo
                        </th>
                        <th className="sticky top-0 px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider min-w-[180px] bg-slate-100 border-r-2 border-slate-300">
                          <div className="flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-slate-600" />
                            Method
                          </div>
                        </th>
                      </>
                    )}
                  </React.Fragment>
                )
              })}
              <th className="sticky right-0 top-0 z-40 px-4 py-3 text-right text-xs font-medium text-green-700 uppercase tracking-wider min-w-[160px] bg-green-100 border-l-2 border-gray-300 shadow-[-2px_0_4px_rgba(0,0,0,0.05)]">
                FY26 Total
              </th>
            </tr>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="sticky left-0 top-[52px] z-40 bg-gray-50 px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r-2 border-gray-300 shadow-[2px_0_4px_rgba(0,0,0,0.05)]">

              </th>
              {monthColumns.map((col, idx) => {
                const isLastActual = idx === lastActualIndex;
                // In View mode, only show forecast columns
                if (viewMode === 'view' && col.isActual) return null

                return (
                  <React.Fragment key={col.key}>
                    <th
                      className={`sticky top-[52px] px-4 py-2 text-right text-xs font-medium text-gray-500 ${
                        col.isActual ? 'bg-teal-50' : 'bg-green-50'
                      } ${isLastActual ? 'border-r-2 border-gray-300' : ''}`}
                    >
                      {col.isActual ? 'Actual' : 'Forecast'}
                    </th>
                    {isLastActual && viewMode === 'setup' && (
                      <>
                        <th className="sticky top-[52px] px-4 py-2 text-right text-xs font-medium text-gray-500 bg-teal-100">
                          Actual
                        </th>
                        <th className="sticky top-[52px] px-4 py-2 text-right text-xs font-medium text-gray-500 bg-amber-50">
                          Analysis
                        </th>
                        <th className="sticky top-[52px] px-4 py-2 text-right text-xs font-medium text-gray-500 bg-amber-50">
                          Analysis
                        </th>
                        <th className="sticky top-[52px] px-4 py-2 text-left text-xs font-medium text-gray-500 bg-slate-50 border-r-2 border-gray-400 min-w-[320px]">
                          Forecast Approach
                        </th>
                      </>
                    )}
                  </React.Fragment>
                )
              })}
              <th className="sticky right-0 top-[52px] z-40 px-4 py-2 text-right text-xs font-medium text-gray-500 bg-green-100 border-l-2 border-gray-300 shadow-[-2px_0_4px_rgba(0,0,0,0.05)]">
                Forecast
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {categories.map((category) => {
              const categoryLines = lines.filter(line => line.category === category)
              const isExpanded = expandedCategories.has(category)

              return (
                <React.Fragment key={category}>
                  {/* Category Header */}
                  <tr className="bg-gray-100">
                    <td className="sticky left-0 z-20 bg-gray-100 px-6 py-3 border-r-2 border-gray-300 shadow-[2px_0_4px_rgba(0,0,0,0.05)]">
                      <div className="flex items-center justify-between">
                        <button
                          onClick={() => toggleCategory(category)}
                          className="flex items-center space-x-2 hover:text-teal-600 transition-colors"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                          <span className="font-bold text-gray-900">{category}</span>
                        </button>
                        <button
                          onClick={() => addLine(category)}
                          className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-teal-600 bg-teal-50 rounded hover:bg-teal-100 transition-colors"
                          title="Add new row"
                        >
                          <Plus className="w-3 h-3" />
                          Add Row
                        </button>
                      </div>
                    </td>
                    {monthColumns.map((col, idx) => {
                      const total = calculateCategoryTotal(category, col.key, col.isForecast)
                      const isLastActual = idx === lastActualIndex;
                      // In View mode, only show forecast columns
                      if (viewMode === 'view' && col.isActual) return null

                      return (
                        <React.Fragment key={col.key}>
                          <td
                            className={`px-4 py-3 text-right text-sm font-semibold text-gray-900 ${
                              isLastActual ? 'border-r-2 border-gray-300' : ''
                            }`}
                          >
                            {formatCurrency(total)}
                          </td>
                          {isLastActual && viewMode === 'setup' && (
                            <>
                              <td className="px-4 py-3 text-right text-sm font-bold text-gray-900 bg-teal-100">
                                {formatCurrency(calculateCategoryFY25Total(category))}
                              </td>
                              <td className="px-4 py-3 text-right text-sm text-gray-500 bg-amber-50">
                                —
                              </td>
                              <td className="px-4 py-3 text-right text-sm text-gray-500 bg-amber-50">
                                —
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-500 bg-slate-50 border-r-2 border-gray-400">
                                —
                              </td>
                            </>
                          )}
                        </React.Fragment>
                      )
                    })}
                    <td className="sticky right-0 z-20 px-4 py-3 text-right text-sm font-bold text-gray-900 bg-green-100 border-l-2 border-gray-300 shadow-[-2px_0_4px_rgba(0,0,0,0.05)]">
                      {formatCurrency(calculateCategoryFY26Total(category))}
                    </td>
                  </tr>

                  {/* Category Lines */}
                  {isExpanded && categoryLines.map((line) => {
                    const globalIdx = lines.findIndex(l => l === line)
                    return (
                      <tr key={globalIdx} className="hover:bg-gray-50 group">
                        <td className="sticky left-0 z-10 bg-white group-hover:bg-gray-50 px-6 py-2 border-r-2 border-gray-300 shadow-[2px_0_4px_rgba(0,0,0,0.05)]">
                          <div className="flex items-center space-x-2">
                            <input
                              type="text"
                              value={line.account_name}
                              onChange={(e) => updateLineName(globalIdx, e.target.value)}
                              className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                            />
                            <button
                              onClick={() => {
                                // Different confirmation messages based on line type
                                let confirmMessage = `Are you sure you want to delete "${line.account_name}"?`
                                if (line.is_from_xero) {
                                  confirmMessage = `⚠️ This will delete "${line.account_name}" from your forecast (synced from Xero). You can re-sync from Xero to restore it. Continue?`
                                } else if (line.is_from_payroll) {
                                  confirmMessage = `⚠️ This line is synced from Payroll. If you delete it, you'll need to remap payroll in the Payroll tab. Continue?`
                                }

                                if (confirm(confirmMessage)) {
                                  removeLine(globalIdx)
                                }
                              }}
                              className="text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Delete row"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                        {monthColumns.map((col, idx) => {
                          const months = col.isForecast ? line.forecast_months : line.actual_months
                          const value = months[col.key] || 0
                          const isLastActual = idx === lastActualIndex;
                          const cellKey = `${globalIdx}-${col.key}`;
                          const isEditing = editingCell === cellKey;
                          const isDisabled = col.isActual && historicalDataLocked;
                          // In View mode, only show forecast columns
                          if (viewMode === 'view' && col.isActual) return null

                          return (
                            <React.Fragment key={col.key}>
                              <td className={`px-4 py-2 ${isLastActual ? 'border-r-2 border-gray-300' : ''}`}>
                                <div className="relative group">
                                  {cellFormulas.has(cellKey) && !isEditing && (
                                    <div className="absolute -left-1 top-0 bottom-0 flex items-center">
                                      <div className="relative">
                                        <FunctionSquare className="w-3 h-3 text-purple-600" />
                                        <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                                          {cellFormulas.get(cellKey)}
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                  <input
                                    type="text"
                                    value={isEditing ? inputValue : (showFormulas && cellFormulas.has(cellKey) ? cellFormulas.get(cellKey) : formatInputValue(value))}
                                    disabled={isDisabled}
                                    onFocus={() => {
                                      if (!isDisabled) {
                                        setEditingCell(cellKey)
                                        // Show formula if it exists, otherwise show value with 2 decimal places
                                        setInputValue(cellFormulas.get(cellKey) || formatEditingValue(value))
                                      }
                                    }}
                                    onBlur={() => {
                                      const val = inputValue.trim()
                                      // Process the value when user leaves the cell
                                      if (val.startsWith('=')) {
                                        updateLineValue(globalIdx, col.key, val, col.isForecast)
                                      } else if (val) {
                                        const cleaned = val.replace(/[^0-9.-]/g, '')
                                        updateLineValue(globalIdx, col.key, parseFloat(cleaned) || 0, col.isForecast)
                                      }
                                      setEditingCell(null)
                                      setInputValue('')
                                    }}
                                    onChange={(e) => {
                                      setInputValue(e.target.value)
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.currentTarget.blur()
                                      }
                                    }}
                                    className={`w-full px-2 py-1 text-sm text-right border border-gray-300 rounded focus:ring-1 focus:ring-teal-500 focus:border-teal-500 ${
                                      isDisabled ? 'bg-gray-50 cursor-not-allowed text-gray-500' : ''
                                    } ${cellFormulas.has(cellKey) ? 'bg-purple-50' : ''}`}
                                    placeholder="$0 or =formula"
                                  />
                                </div>
                              </td>
                              {isLastActual && viewMode === 'setup' && (
                                <>
                                  <td className="px-4 py-2 text-right text-sm font-medium text-gray-700 bg-teal-100">
                                    {formatCurrency(calculateLineFY25Total(line))}
                                  </td>
                                  <td className="px-4 py-2 text-right text-xs text-gray-600 bg-amber-50">
                                    {line.analysis?.pct_of_total_revenue !== undefined
                                      ? `${line.analysis.pct_of_total_revenue.toFixed(1)}%`
                                      : line.analysis?.pct_of_revenue !== undefined
                                      ? `${line.analysis.pct_of_revenue.toFixed(1)}%`
                                      : '—'}
                                  </td>
                                  <td className="px-4 py-2 text-right text-xs text-gray-600 bg-amber-50">
                                    {line.analysis?.fy_average_per_month !== undefined
                                      ? formatCurrency(line.analysis.fy_average_per_month)
                                      : '—'}
                                  </td>
                                  {viewMode === 'setup' && (
                                    <td className="px-4 py-2 bg-slate-50 border-r-2 border-gray-400">
                                      {category === 'Operating Expenses' ? (
                                        <OpExLineControls
                                          forecastMethod={line.forecast_method}
                                          onMethodChange={(method) => handleLineMethodChange(globalIdx, method)}
                                          onPercentageChange={(percentage) => handleLinePercentageChange(globalIdx, percentage)}
                                        />
                                      ) : (
                                        <select
                                          value={line.forecast_method?.method || ''}
                                          onChange={(e) => updateForecastMethod(globalIdx, e.target.value as ForecastMethod)}
                                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-slate-500 focus:border-slate-500"
                                        >
                                          <option value="">Use Average</option>
                                          <option value="straight_line">Straight-line</option>
                                          <option value="growth_rate">Growth Rate</option>
                                          <option value="seasonal_pattern">Seasonal</option>
                                          <option value="driver_based">% of Revenue</option>
                                          <option value="manual">Manual</option>
                                        </select>
                                      )}
                                    </td>
                                  )}
                                </>
                              )}
                            </React.Fragment>
                          )
                        })}
                        <td className="sticky right-0 z-10 px-4 py-2 text-right text-sm font-medium text-gray-700 bg-green-100 group-hover:bg-green-100 border-l-2 border-gray-300 shadow-[-2px_0_4px_rgba(0,0,0,0.05)]">
                          {formatCurrency(calculateLineFY26Total(line))}
                        </td>
                      </tr>
                    )
                  })}

                  {/* Add Line Button */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={monthColumns.length + 3} className="px-6 py-2">
                        <button
                          onClick={() => addLine(category)}
                          className="flex items-center space-x-2 text-sm text-teal-600 hover:text-teal-700 font-medium"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Add Line</span>
                        </button>
                      </td>
                    </tr>
                  )}

                  {/* Gross Profit after Cost of Sales */}
                  {category === 'Cost of Sales' && (
                    <>
                      <tr className="bg-gray-50 font-bold border-t-2 border-gray-400">
                        <td className="sticky left-0 z-10 bg-gray-50 px-6 py-3 border-r-2 border-gray-300 shadow-[2px_0_4px_rgba(0,0,0,0.05)]">
                          <span className="text-gray-900">Gross Profit</span>
                        </td>
                        {monthColumns.map((col, idx) => {
                          const grossProfit = calculateGrossProfit(col.key, col.isForecast)
                          const isLastActual = idx === lastActualIndex;
                          // In View mode, only show forecast columns
                          if (viewMode === 'view' && col.isActual) return null

                          return (
                            <React.Fragment key={col.key}>
                              <td
                                className={`px-4 py-3 text-right text-sm font-bold text-gray-900 ${
                                  isLastActual ? 'border-r-2 border-gray-300' : ''
                                }`}
                              >
                                {formatCurrency(grossProfit)}
                              </td>
                              {isLastActual && viewMode === 'setup' && (
                                <>
                                  <td className="px-4 py-3 text-right text-sm font-bold text-gray-900 bg-teal-100">
                                    {formatCurrency(calculateGrossProfitFY25Total())}
                                  </td>
                                  <td className="px-4 py-3 text-right text-xs text-gray-600 bg-amber-50">
                                    —
                                  </td>
                                  <td className="px-4 py-3 text-right text-xs text-gray-600 bg-amber-50">
                                    —
                                  </td>
                                  <td className="px-4 py-3 text-xs text-gray-500 bg-slate-50 border-r-2 border-gray-400">
                                    Auto
                                  </td>
                                </>
                              )}
                            </React.Fragment>
                          )
                        })}
                        <td className="sticky right-0 z-10 px-4 py-3 text-right text-sm font-bold text-gray-900 bg-green-100 border-l-2 border-gray-300 shadow-[-2px_0_4px_rgba(0,0,0,0.05)]">
                          {formatCurrency(calculateGrossProfitFY26Total())}
                        </td>
                      </tr>

                      {/* Gross Margin % */}
                      <tr className="bg-green-50 border-b-2 border-gray-400">
                        <td className="sticky left-0 z-10 bg-green-50 px-6 py-3 border-r-2 border-gray-300 shadow-[2px_0_4px_rgba(0,0,0,0.05)]">
                          <span className="text-gray-900 font-semibold italic">Gross Margin %</span>
                        </td>
                        {monthColumns.map((col, idx) => {
                          const revenue = calculateCategoryTotal('Revenue', col.key, col.isForecast)
                          const grossProfit = calculateGrossProfit(col.key, col.isForecast)
                          const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0
                          const isLastActual = idx === lastActualIndex;
                          // In View mode, only show forecast columns
                          if (viewMode === 'view' && col.isActual) return null

                          return (
                            <React.Fragment key={col.key}>
                              <td
                                className={`px-4 py-3 text-right text-sm font-semibold ${
                                  grossMargin >= 50 ? 'text-green-700' : grossMargin >= 30 ? 'text-teal-700' : 'text-amber-700'
                                } ${isLastActual ? 'border-r-2 border-gray-300' : ''}`}
                              >
                                {grossMargin.toFixed(1)}%
                              </td>
                              {isLastActual && viewMode === 'setup' && (
                                <>
                                  <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 bg-teal-100">
                                    {(() => {
                                      const fy25Revenue = calculateCategoryFY25Total('Revenue')
                                      const fy25GP = calculateGrossProfitFY25Total()
                                      const fy25Margin = fy25Revenue > 0 ? (fy25GP / fy25Revenue) * 100 : 0
                                      return `${fy25Margin.toFixed(1)}%`
                                    })()}
                                  </td>
                                  <td className="px-4 py-3 text-right text-xs text-gray-600 bg-amber-50">
                                    —
                                  </td>
                                  <td className="px-4 py-3 text-right text-xs text-gray-600 bg-amber-50">
                                    —
                                  </td>
                                  <td className="px-4 py-3 text-xs text-gray-500 bg-slate-50 border-r-2 border-gray-400">
                                    Auto
                                  </td>
                                </>
                              )}
                            </React.Fragment>
                          )
                        })}
                        <td className="sticky right-0 z-10 px-4 py-3 text-right text-sm font-semibold text-gray-900 bg-green-100 border-l-2 border-gray-300 shadow-[-2px_0_4px_rgba(0,0,0,0.05)]">
                          {(() => {
                            const fy26Revenue = calculateCategoryFY26Total('Revenue')
                            const fy26GP = calculateGrossProfitFY26Total()
                            const fy26Margin = fy26Revenue > 0 ? (fy26GP / fy26Revenue) * 100 : 0
                            return `${fy26Margin.toFixed(1)}%`
                          })()}
                        </td>
                      </tr>
                    </>
                  )}
                </React.Fragment>
              )
            })}

            {/* Net Profit */}
            <tr className="bg-gray-100 font-bold border-t-2 border-gray-500">
              <td className="sticky left-0 z-10 bg-gray-100 px-6 py-3 border-r-2 border-gray-300 shadow-[2px_0_4px_rgba(0,0,0,0.05)]">
                <span className="text-gray-900">Net Profit</span>
              </td>
              {monthColumns.map((col, idx) => {
                const netProfit = calculateNetProfit(col.key, col.isForecast)
                const isLastActual = idx === lastActualIndex;
                // In View mode, only show forecast columns
                if (viewMode === 'view' && col.isActual) return null

                return (
                  <React.Fragment key={col.key}>
                    <td
                      className={`px-4 py-3 text-right text-sm font-bold ${
                        netProfit >= 0 ? 'text-green-700' : 'text-red-700'
                      } ${isLastActual ? 'border-r-2 border-gray-300' : ''}`}
                    >
                      {formatCurrency(netProfit)}
                    </td>
                    {isLastActual && viewMode === 'setup' && (
                      <>
                        <td className={`px-4 py-3 text-right text-sm font-bold ${
                          calculateNetProfitFY25Total() >= 0 ? 'text-green-700' : 'text-red-700'
                        } bg-teal-100`}>
                          {formatCurrency(calculateNetProfitFY25Total())}
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-gray-600 bg-amber-50">
                          —
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-gray-600 bg-amber-50">
                          —
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 bg-slate-50 border-r-2 border-gray-400">
                          Auto
                        </td>
                      </>
                    )}
                  </React.Fragment>
                )
              })}
              <td className={`sticky right-0 z-10 px-4 py-3 text-right text-sm font-bold ${
                calculateNetProfitFY26Total() >= 0 ? 'text-green-700' : 'text-red-700'
              } bg-green-100 border-l-2 border-gray-300 shadow-[-2px_0_4px_rgba(0,0,0,0.05)]`}>
                {formatCurrency(calculateNetProfitFY26Total())}
              </td>
            </tr>

            {/* Net Margin % */}
            <tr className="bg-teal-50 border-b-2 border-gray-500">
              <td className="sticky left-0 z-10 bg-teal-50 px-6 py-3 border-r-2 border-gray-300 shadow-[2px_0_4px_rgba(0,0,0,0.05)]">
                <span className="text-gray-900 font-semibold italic">Net Margin %</span>
              </td>
              {monthColumns.map((col, idx) => {
                const revenue = calculateCategoryTotal('Revenue', col.key, col.isForecast)
                const netProfit = calculateNetProfit(col.key, col.isForecast)
                const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0
                const isLastActual = idx === lastActualIndex;
                // In View mode, only show forecast columns
                if (viewMode === 'view' && col.isActual) return null

                return (
                  <React.Fragment key={col.key}>
                    <td
                      className={`px-4 py-3 text-right text-sm font-semibold ${
                        netMargin >= 20 ? 'text-green-700' : netMargin >= 10 ? 'text-teal-700' : netMargin >= 0 ? 'text-amber-700' : 'text-red-700'
                      } ${isLastActual ? 'border-r-2 border-gray-300' : ''}`}
                    >
                      {netMargin.toFixed(1)}%
                    </td>
                    {isLastActual && viewMode === 'setup' && (
                      <>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 bg-teal-100">
                          {(() => {
                            const fy25Revenue = calculateCategoryFY25Total('Revenue')
                            const fy25NP = calculateNetProfitFY25Total()
                            const fy25Margin = fy25Revenue > 0 ? (fy25NP / fy25Revenue) * 100 : 0
                            return `${fy25Margin.toFixed(1)}%`
                          })()}
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-gray-600 bg-amber-50">
                          —
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-gray-600 bg-amber-50">
                          —
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 bg-slate-50 border-r-2 border-gray-400">
                          Auto
                        </td>
                      </>
                    )}
                  </React.Fragment>
                )
              })}
              <td className="sticky right-0 z-10 px-4 py-3 text-right text-sm font-semibold text-gray-900 bg-green-100 border-l-2 border-gray-300 shadow-[-2px_0_4px_rgba(0,0,0,0.05)]">
                {(() => {
                  const fy26Revenue = calculateCategoryFY26Total('Revenue')
                  const fy26NP = calculateNetProfitFY26Total()
                  const fy26Margin = fy26Revenue > 0 ? (fy26NP / fy26Revenue) * 100 : 0
                  return `${fy26Margin.toFixed(1)}%`
                })()}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
