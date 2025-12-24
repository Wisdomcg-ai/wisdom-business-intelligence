'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  MessageSquare,
  Send,
  ChevronRight,
  ChevronLeft,
  Check,
  Loader2,
  Zap,
  Users,
  DollarSign,
  TrendingUp,
  Target,
  FileCheck,
  X,
  Sparkles,
  AlertTriangle
} from 'lucide-react'
import { XeroSyncIndicator } from '@/components/XeroSyncIndicator'
import type {
  WizardStep,
  WizardMode,
  WizardSession,
  WizardContext,
  CFOMessage,
  XeroEmployee,
  StrategicInitiative,
  BusinessGoals,
  ForecastDecision,
  HistoricalPLSummary
} from '../types'
import type { FinancialForecast, PLLine, XeroConnection } from '../types'

// Helper to get month keys in a range
function getMonthKeysInRange(startMonth: string, endMonth: string): string[] {
  const months: string[] = []
  const [startYear, startMo] = startMonth.split('-').map(Number)
  const [endYear, endMo] = endMonth.split('-').map(Number)

  let year = startYear
  let month = startMo

  while (year < endYear || (year === endYear && month <= endMo)) {
    months.push(`${year}-${String(month).padStart(2, '0')}`)
    month++
    if (month > 12) {
      month = 1
      year++
    }
  }
  return months
}

// Calculate period summary from plLines for specific months
function calculatePeriodSummary(
  plLines: PLLine[],
  monthKeys: string[],
  periodLabel: string
): import('../types').PeriodSummary | null {
  if (!monthKeys.length) return null

  let totalRevenue = 0
  let totalCogs = 0
  let totalOpex = 0
  const opexByCategory: import('../types').OpExCategory[] = []

  plLines.forEach(line => {
    const actualMonths = line.actual_months || {}
    let lineTotal = 0

    monthKeys.forEach(key => {
      const value = actualMonths[key]
      if (typeof value === 'number') {
        lineTotal += value
      }
    })

    if (line.category === 'Revenue' || line.account_class === 'REVENUE') {
      totalRevenue += lineTotal
    } else if (line.category === 'Cost of Sales' || line.category === 'COGS') {
      totalCogs += lineTotal
    } else if (line.category === 'Operating Expenses' || line.account_class === 'EXPENSE') {
      totalOpex += lineTotal
      if (lineTotal !== 0) {
        opexByCategory.push({
          category: line.category || 'Other',
          account_name: line.account_name,
          total: Math.abs(lineTotal),
          monthly_average: Math.abs(lineTotal) / monthKeys.length
        })
      }
    }
  })

  // Sort opex by total (largest first)
  opexByCategory.sort((a, b) => b.total - a.total)

  const revenue = Math.abs(totalRevenue)
  const cogs = Math.abs(totalCogs)
  const grossProfit = revenue - cogs
  const opex = Math.abs(totalOpex)
  const netProfit = grossProfit - opex

  return {
    period_label: periodLabel,
    start_month: monthKeys[0],
    end_month: monthKeys[monthKeys.length - 1],
    months_count: monthKeys.length,
    total_revenue: revenue,
    total_cogs: cogs,
    gross_profit: grossProfit,
    gross_margin_percent: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
    operating_expenses: opex,
    operating_expenses_by_category: opexByCategory.slice(0, 15),
    net_profit: netProfit,
    net_margin_percent: revenue > 0 ? (netProfit / revenue) * 100 : 0
  }
}

// Build historical P&L summary from plLines for AI context
function buildHistoricalPLSummary(
  plLines: PLLine[],
  xeroConnected: boolean,
  forecast: FinancialForecast
): HistoricalPLSummary {
  console.log('[buildHistoricalPLSummary] Input:', {
    plLinesCount: plLines?.length || 0,
    xeroConnected,
    fiscalYear: forecast?.fiscal_year
  })

  if (!plLines || plLines.length === 0 || !xeroConnected) {
    console.log('[buildHistoricalPLSummary] Early return - no data or not connected')
    return { has_xero_data: false }
  }

  // Determine prior FY period (the year before the forecast)
  // If forecast is FY2026 (Jul 2025 - Jun 2026), prior FY is FY2025 (Jul 2024 - Jun 2025)
  const fyStartMonth = 7 // July
  const priorFyStartYear = forecast.fiscal_year - 2 // e.g., 2024 for FY2026
  const priorFyEndYear = forecast.fiscal_year - 1 // e.g., 2025 for FY2026

  const priorFyStart = `${priorFyStartYear}-${String(fyStartMonth).padStart(2, '0')}`
  const priorFyEnd = `${priorFyEndYear}-${String(fyStartMonth - 1 || 12).padStart(2, '0')}`

  // Determine current YTD period (from FY start to now or to last actual month)
  const currentFyStart = `${priorFyEndYear}-${String(fyStartMonth).padStart(2, '0')}`

  // Find the last month with actual data
  let lastActualMonth = currentFyStart
  plLines.forEach(line => {
    Object.keys(line.actual_months || {}).forEach(key => {
      if (key > lastActualMonth && key >= currentFyStart) {
        lastActualMonth = key
      }
    })
  })

  // Get month keys for each period
  const priorFyMonths = getMonthKeysInRange(priorFyStart, priorFyEnd)
  const currentYtdMonths = getMonthKeysInRange(currentFyStart, lastActualMonth)

  // Filter to only months that have data
  const hasDataInMonth = (monthKey: string) =>
    plLines.some(line => {
      const val = line.actual_months?.[monthKey]
      return typeof val === 'number' && val !== 0
    })

  const priorFyMonthsWithData = priorFyMonths.filter(hasDataInMonth)
  const currentYtdMonthsWithData = currentYtdMonths.filter(hasDataInMonth)

  console.log('[buildHistoricalPLSummary] Period analysis:', {
    priorFyRange: `${priorFyStart} to ${priorFyEnd}`,
    priorFyMonthsChecked: priorFyMonths.length,
    priorFyMonthsWithData: priorFyMonthsWithData.length,
    currentYtdRange: `${currentFyStart} to ${lastActualMonth}`,
    currentYtdMonthsWithData: currentYtdMonthsWithData.length
  })

  // Calculate summaries
  const priorFy = calculatePeriodSummary(
    plLines,
    priorFyMonthsWithData,
    `FY${forecast.fiscal_year - 1} (Prior Year)`
  )

  const currentYtdBase = calculatePeriodSummary(
    plLines,
    currentYtdMonthsWithData,
    `FY${forecast.fiscal_year} YTD`
  )

  // Build current YTD with run rates
  let currentYtd = null
  if (currentYtdBase && currentYtdBase.months_count > 0) {
    const monthlyRevenue = currentYtdBase.total_revenue / currentYtdBase.months_count
    const monthlyOpex = currentYtdBase.operating_expenses / currentYtdBase.months_count
    const monthlyNetProfit = currentYtdBase.net_profit / currentYtdBase.months_count

    currentYtd = {
      ...currentYtdBase,
      run_rate_revenue: monthlyRevenue * 12,
      run_rate_opex: monthlyOpex * 12,
      run_rate_net_profit: monthlyNetProfit * 12,
      revenue_vs_prior_percent: priorFy?.total_revenue
        ? ((monthlyRevenue * 12 - priorFy.total_revenue) / priorFy.total_revenue) * 100
        : 0,
      opex_vs_prior_percent: priorFy?.operating_expenses
        ? ((monthlyOpex * 12 - priorFy.operating_expenses) / priorFy.operating_expenses) * 100
        : 0
    }
  }

  // Determine forecast period
  const forecastStart = forecast.forecast_start_month || currentFyStart
  const forecastEnd = forecast.forecast_end_month || `${forecast.fiscal_year}-06`
  const forecastMonths = getMonthKeysInRange(forecastStart, forecastEnd)

  return {
    has_xero_data: priorFyMonthsWithData.length > 0 || currentYtdMonthsWithData.length > 0,
    prior_fy: priorFy || undefined,
    current_ytd: currentYtd || undefined,
    forecast_period: {
      start_month: forecastStart,
      end_month: forecastEnd,
      months_remaining: forecastMonths.length
    }
  }
}

// Step configuration
const WIZARD_STEPS: { id: WizardStep; label: string; icon: React.ElementType; description: string }[] = [
  { id: 'setup', label: 'Setup', icon: Target, description: 'Goals & year selection' },
  { id: 'team', label: 'Team', icon: Users, description: 'Plan your team costs' },
  { id: 'costs', label: 'Costs', icon: DollarSign, description: 'Operating expenses' },
  { id: 'investments', label: 'Investments', icon: TrendingUp, description: 'Strategic investments' },
  { id: 'projections', label: 'Projections', icon: Zap, description: 'Year 2-3 forecasts' },
  { id: 'review', label: 'Review', icon: FileCheck, description: 'Validate & finalize' }
]

interface ForecastWizardV2Props {
  isOpen: boolean
  onClose: () => void
  forecast: FinancialForecast
  plLines: PLLine[]
  xeroConnection: XeroConnection | null
  businessId: string
  businessName?: string
  onComplete: (forecastId: string) => void
}

export default function ForecastWizardV2({
  isOpen,
  onClose,
  forecast,
  plLines,
  xeroConnection,
  businessId,
  businessName,
  onComplete
}: ForecastWizardV2Props) {
  // Session state
  const [session, setSession] = useState<WizardSession | null>(null)
  const [isLoadingSession, setIsLoadingSession] = useState(true)

  // Chat state
  const [messages, setMessages] = useState<CFOMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])

  // Wizard state
  const [currentStep, setCurrentStep] = useState<WizardStep>('setup')
  const [mode, setMode] = useState<WizardMode>('guided')
  const [yearsSelected, setYearsSelected] = useState<number[]>([1])

  // Data state
  const [goals, setGoals] = useState<BusinessGoals | null>(null)
  const [team, setTeam] = useState<XeroEmployee[]>([])
  const [initiatives, setInitiatives] = useState<StrategicInitiative[]>([])
  const [decisions, setDecisions] = useState<ForecastDecision[]>([])

  // UI state
  const [showQuickEntry, setShowQuickEntry] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Initialize session and load data
  useEffect(() => {
    if (isOpen) {
      initializeWizard()
    }
  }, [isOpen, businessId])

  const initializeWizard = async () => {
    setIsLoadingSession(true)
    try {
      // Get or create wizard session
      const sessionRes = await fetch(`/api/forecast-wizard/session?business_id=${businessId}&forecast_id=${forecast.id}`)
      const sessionData = await sessionRes.json()

      if (sessionData.session) {
        setSession(sessionData.session)
        setCurrentStep(sessionData.session.current_step || 'setup')
        setMode(sessionData.session.mode || 'guided')
        setYearsSelected(sessionData.session.years_selected || [1])
      }

      // Load goals from existing data
      if (forecast.revenue_goal || forecast.gross_profit_goal || forecast.net_profit_goal) {
        setGoals({
          revenue_target: forecast.revenue_goal || 0,
          gross_profit_target: forecast.gross_profit_goal || 0,
          profit_target: forecast.net_profit_goal || 0,
          key_objectives: []
        })
      }

      // Try to load team from Xero
      if (xeroConnection?.is_active) {
        try {
          const teamRes = await fetch(`/api/Xero/employees?business_id=${businessId}`)
          const teamData = await teamRes.json()
          if (teamData.employees && teamData.employees.length > 0) {
            setTeam(teamData.employees)
            console.log('[WizardV2] Loaded team from Xero:', teamData.employees.length, 'employees')
          } else if (teamData.payroll_available === false) {
            console.log('[WizardV2] Xero Payroll not available for this organization')
            setWarnings(prev => [...prev, 'Xero Payroll is not enabled. Team data will need to be entered manually.'])
          } else if (teamRes.status === 401) {
            console.log('[WizardV2] Xero connection needs payroll permissions')
            setWarnings(prev => [...prev, 'Please reconnect Xero to enable payroll access for importing team data.'])
          }
        } catch (err) {
          console.error('[WizardV2] Error loading team from Xero:', err)
        }
      }

      // Load strategic initiatives from Goals Wizard (annual plan initiatives only)
      try {
        const initRes = await fetch(`/api/strategic-initiatives?business_id=${businessId}&annual_plan_only=true`)
        if (initRes.ok) {
          const initData = await initRes.json()
          setInitiatives(initData.initiatives || [])
          console.log('[WizardV2] Loaded', initData.initiatives?.length || 0, 'annual plan initiatives')
        }
      } catch (err) {
        console.error('[WizardV2] Error loading initiatives:', err)
      }

      // Get initial greeting
      await getStepGreeting('setup')

    } catch (error) {
      console.error('[WizardV2] Error initializing:', error)
    } finally {
      setIsLoadingSession(false)
    }
  }

  const getStepGreeting = async (step: WizardStep) => {
    setIsTyping(true)
    try {
      // Build historical P&L summary from Xero data (prior FY + current YTD)
      const historicalPL = buildHistoricalPLSummary(plLines, xeroConnection?.is_active || false, forecast)

      const context: WizardContext = {
        business_id: businessId,
        business_name: businessName,
        fiscal_year: forecast.fiscal_year,
        goals: goals || { revenue_target: 0, gross_profit_target: 0, profit_target: 0 },
        current_team: team,
        strategic_initiatives: initiatives,
        session: session!,
        decisions_made: decisions,
        xero_connected: xeroConnection?.is_active || false,
        historical_pl: historicalPL
      }

      const res = await fetch('/api/forecast-wizard/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step,
          context,
          conversationHistory: messages,
          session_id: session?.id
        })
      })

      const data = await res.json()

      if (data.response) {
        const cfoMessage: CFOMessage = {
          ...data.response,
          role: 'cfo' as const
        }
        setMessages(prev => [...prev, cfoMessage])
        setSuggestions(data.suggestions || [])
      }
    } catch (error) {
      console.error('[WizardV2] Error getting greeting:', error)
    } finally {
      setIsTyping(false)
    }
  }

  const sendMessage = async (messageText?: string) => {
    const text = messageText || inputValue.trim()
    if (!text) return

    // Add user message
    const userMessage: CFOMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
      step: currentStep
    }
    setMessages(prev => [...prev, userMessage])
    setInputValue('')
    setIsTyping(true)
    setSuggestions([])

    try {
      // Build historical P&L summary from Xero data (prior FY + current YTD)
      const historicalPL = buildHistoricalPLSummary(plLines, xeroConnection?.is_active || false, forecast)

      const context: WizardContext = {
        business_id: businessId,
        business_name: businessName,
        fiscal_year: forecast.fiscal_year,
        goals: goals || { revenue_target: 0, gross_profit_target: 0, profit_target: 0 },
        current_team: team,
        strategic_initiatives: initiatives,
        session: session!,
        decisions_made: decisions,
        xero_connected: xeroConnection?.is_active || false,
        historical_pl: historicalPL
      }

      const res = await fetch('/api/forecast-wizard/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          step: currentStep,
          context,
          conversationHistory: messages,
          session_id: session?.id
        })
      })

      const data = await res.json()

      if (data.response) {
        const cfoMessage: CFOMessage = {
          ...data.response,
          role: 'cfo' as const
        }
        setMessages(prev => [...prev, cfoMessage])
        setSuggestions(data.suggestions || [])
        if (data.warnings) {
          setWarnings(data.warnings)
        }

        // Auto-advance if step is complete
        if (data.stepComplete) {
          const nextStepIndex = currentStepIndex + 1
          if (nextStepIndex < WIZARD_STEPS.length) {
            // Small delay so user can see the completion message
            setTimeout(() => {
              handleStepChange(WIZARD_STEPS[nextStepIndex].id)
            }, 1500)
          }
        }
      }
    } catch (error) {
      console.error('[WizardV2] Error sending message:', error)
      const errorMessage: CFOMessage = {
        id: `error-${Date.now()}`,
        role: 'cfo',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date().toISOString(),
        step: currentStep
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsTyping(false)
    }
  }

  const handleStepChange = async (step: WizardStep) => {
    // Update session
    if (session) {
      await fetch('/api/forecast-wizard/session', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: session.id,
          current_step: step,
          step_completed: currentStep
        })
      })
    }

    setCurrentStep(step)
    setMessages([]) // Clear messages for new step
    await getStepGreeting(step)
  }

  const handleComplete = async () => {
    if (!session) return

    // Complete the session
    await fetch('/api/forecast-wizard/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: session.id,
        forecast_id: forecast.id
      })
    })

    onComplete(forecast.id!)
  }

  const getStepIndex = (step: WizardStep) => WIZARD_STEPS.findIndex(s => s.id === step)
  const currentStepIndex = getStepIndex(currentStep)
  const canGoBack = currentStepIndex > 0
  const canGoForward = currentStepIndex < WIZARD_STEPS.length - 1
  const isLastStep = currentStepIndex === WIZARD_STEPS.length - 1

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-brand-navy to-brand-navy-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">AI CFO Forecast Wizard</h2>
              <p className="text-sm text-white/70">FY{forecast.fiscal_year} Financial Forecast</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Mode Toggle */}
            <button
              onClick={() => setShowQuickEntry(!showQuickEntry)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                showQuickEntry
                  ? 'bg-white text-brand-navy'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              {showQuickEntry ? 'Guided Mode' : 'Quick Entry'}
            </button>

            {/* Xero Sync Status */}
            <div className="bg-white/10 rounded-lg px-2">
              <XeroSyncIndicator businessId={businessId} compact showLabel />
            </div>

            <button
              onClick={onClose}
              className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center justify-between">
            {WIZARD_STEPS.map((step, index) => {
              const isCompleted = index < currentStepIndex
              const isCurrent = step.id === currentStep
              const Icon = step.icon

              return (
                <button
                  key={step.id}
                  onClick={() => handleStepChange(step.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
                    isCurrent
                      ? 'bg-brand-orange text-white'
                      : isCompleted
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                    isCurrent
                      ? 'bg-white/20'
                      : isCompleted
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-200'
                  }`}>
                    {isCompleted ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Icon className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <span className="text-sm font-medium hidden lg:inline">{step.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Chat Panel */}
          <div className="flex-1 flex flex-col border-r border-gray-200 min-h-0 overflow-hidden">
            {/* Costs Step - Xero OpEx Table */}
            {currentStep === 'costs' && xeroConnection?.is_active && plLines.length > 0 && (
              <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-green-50 to-emerald-50 max-h-[200px] overflow-y-auto flex-shrink-0">
                <h4 className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-brand-orange" />
                  Xero Operating Expenses - Prior Year
                </h4>
                {(() => {
                  const historicalPL = buildHistoricalPLSummary(plLines, true, forecast)
                  const priorFy = historicalPL.prior_fy
                  const categories = priorFy?.operating_expenses_by_category || []

                  if (categories.length === 0) {
                    return <p className="text-sm text-gray-500">No operating expense data found in Xero.</p>
                  }

                  return (
                    <div className="bg-white rounded-lg border border-gray-200">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="text-left px-3 py-1.5 font-medium text-gray-700 text-xs">Category</th>
                            <th className="text-right px-3 py-1.5 font-medium text-gray-700 text-xs">Annual</th>
                            <th className="text-right px-3 py-1.5 font-medium text-gray-700 text-xs">Monthly</th>
                            <th className="text-center px-2 py-1.5 font-medium text-gray-700 text-xs">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {categories.slice(0, 8).map((cat, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-3 py-1.5 text-gray-900 text-xs">{cat.account_name}</td>
                              <td className="px-3 py-1.5 text-right text-gray-700 text-xs">${cat.total.toLocaleString()}</td>
                              <td className="px-3 py-1.5 text-right text-gray-500 text-xs">${Math.round(cat.monthly_average).toLocaleString()}</td>
                              <td className="px-2 py-1.5 text-center">
                                <button
                                  onClick={() => sendMessage(`I want to adjust ${cat.account_name} for the forecast`)}
                                  className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-brand-orange hover:text-white transition-colors"
                                >
                                  Adjust
                                </button>
                              </td>
                            </tr>
                          ))}
                          <tr className="bg-gray-50 font-semibold">
                            <td className="px-3 py-1.5 text-gray-900 text-xs">Total ({categories.length} categories)</td>
                            <td className="px-3 py-1.5 text-right text-gray-900 text-xs">${priorFy?.operating_expenses.toLocaleString()}</td>
                            <td className="px-3 py-1.5 text-right text-gray-700 text-xs">${Math.round((priorFy?.operating_expenses || 0) / 12).toLocaleString()}</td>
                            <td className="px-2 py-1.5"></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )
                })()}
              </div>
            )}

            {/* Investments Step - Initiatives Table */}
            {currentStep === 'investments' && initiatives.length > 0 && (
              <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 max-h-[200px] overflow-y-auto flex-shrink-0">
                <h4 className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-2">
                  <Target className="w-4 h-4 text-brand-orange" />
                  Strategic Initiatives ({initiatives.length})
                </h4>
                <div className="bg-white rounded-lg border border-gray-200">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-3 py-1.5 font-medium text-gray-700 text-xs">Initiative</th>
                        <th className="text-left px-2 py-1.5 font-medium text-gray-700 text-xs">Priority</th>
                        <th className="text-center px-2 py-1.5 font-medium text-gray-700 text-xs">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {initiatives.slice(0, 6).map((init) => (
                        <tr key={init.id} className="hover:bg-gray-50">
                          <td className="px-3 py-1.5">
                            <span className="text-gray-900 text-xs">{init.title}</span>
                          </td>
                          <td className="px-2 py-1.5">
                            <span className={`text-xs px-1.5 py-0.5 rounded capitalize ${
                              init.priority === 'high' ? 'bg-red-100 text-red-700' :
                              init.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-green-100 text-green-700'
                            }`}>
                              {init.priority || 'Med'}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <button
                              onClick={() => sendMessage(`Let's discuss investment needs for "${init.title}"`)}
                              className="px-2 py-0.5 text-xs bg-brand-orange text-white rounded hover:bg-brand-orange-600 transition-colors"
                            >
                              Discuss
                            </button>
                          </td>
                        </tr>
                      ))}
                      {initiatives.length > 6 && (
                        <tr className="bg-gray-50">
                          <td colSpan={3} className="px-3 py-1.5 text-xs text-gray-500 text-center">
                            +{initiatives.length - 6} more initiatives
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 min-h-0">
              {isLoadingSession ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-8 h-8 animate-spin text-brand-orange" />
                </div>
              ) : (
                <>
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                          msg.role === 'user'
                            ? 'bg-brand-orange text-white rounded-br-md'
                            : 'bg-gray-100 text-gray-900 rounded-bl-md'
                        }`}
                      >
                        {msg.role === 'cfo' && (
                          <div className="flex items-center gap-2 mb-1">
                            <Sparkles className="w-4 h-4 text-brand-orange" />
                            <span className="text-xs font-medium text-brand-orange">AI CFO</span>
                          </div>
                        )}
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    </div>
                  ))}

                  {isTyping && (
                    <div className="flex justify-start">
                      <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex gap-1">
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Suggestions */}
            {suggestions.length > 0 && (
              <div className="px-6 py-3 border-t border-gray-100 bg-gray-50">
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      onClick={() => sendMessage(suggestion)}
                      className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-full hover:bg-brand-orange hover:text-white hover:border-brand-orange transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Warnings */}
            {warnings.length > 0 && (
              <div className="px-6 py-2 bg-yellow-50 border-t border-yellow-200">
                {warnings.map((warning, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm text-yellow-800">
                    <AlertTriangle className="w-4 h-4" />
                    {warning}
                  </div>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="p-4 border-t border-gray-200 bg-white">
              <div className="flex items-center gap-3">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  placeholder="Type your response..."
                  className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-orange focus:border-brand-orange"
                  disabled={isTyping}
                />
                <button
                  onClick={() => sendMessage()}
                  disabled={!inputValue.trim() || isTyping}
                  className="p-3 bg-brand-orange text-white rounded-xl hover:bg-brand-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Preview Panel */}
          <div className="w-[400px] bg-gray-50 overflow-y-auto p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Preview</h3>

            {/* Goals Summary */}
            {goals && (
              <div className="bg-white rounded-xl p-4 mb-4 border border-gray-200">
                <h4 className="text-sm font-medium text-gray-700 mb-3">Goals</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Revenue Target:</span>
                    <span className="font-semibold">${goals.revenue_target?.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Gross Profit:</span>
                    <span className="font-semibold">${goals.gross_profit_target?.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Net Profit:</span>
                    <span className="font-semibold">${goals.profit_target?.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Team Summary */}
            {team.length > 0 && (
              <div className="bg-white rounded-xl p-4 mb-4 border border-gray-200">
                <h4 className="text-sm font-medium text-gray-700 mb-3">Team ({team.length})</h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {team.slice(0, 5).map((emp) => (
                    <div key={emp.employee_id} className="flex justify-between text-sm">
                      <span className="text-gray-600 truncate">{emp.full_name}</span>
                      <span className="font-medium">
                        {emp.annual_salary ? `$${emp.annual_salary.toLocaleString()}` : '-'}
                      </span>
                    </div>
                  ))}
                  {team.length > 5 && (
                    <p className="text-xs text-gray-500">+{team.length - 5} more</p>
                  )}
                </div>
              </div>
            )}

            {/* Initiatives Summary */}
            {initiatives.length > 0 && (
              <div className="bg-white rounded-xl p-4 mb-4 border border-gray-200">
                <h4 className="text-sm font-medium text-gray-700 mb-3">Strategic Initiatives</h4>
                <div className="space-y-2">
                  {initiatives.slice(0, 3).map((init) => (
                    <div key={init.id} className="text-sm">
                      <span className="text-gray-900">{init.title}</span>
                      <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                        init.status === 'completed' ? 'bg-green-100 text-green-700' :
                        init.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {init.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Years Selected */}
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <h4 className="text-sm font-medium text-gray-700 mb-3">Forecast Years</h4>
              <div className="flex gap-2">
                {[1, 2, 3].map((year) => (
                  <button
                    key={year}
                    onClick={() => {
                      if (yearsSelected.includes(year)) {
                        if (year !== 1) setYearsSelected(yearsSelected.filter(y => y !== year))
                      } else {
                        setYearsSelected([...yearsSelected, year].sort())
                      }
                    }}
                    className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                      yearsSelected.includes(year)
                        ? 'bg-brand-orange text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    Year {year}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Year 1: Monthly | Year 2: Quarterly | Year 3: Annual
              </p>
            </div>
          </div>
        </div>

        {/* Footer Navigation */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-white">
          <button
            onClick={() => canGoBack && handleStepChange(WIZARD_STEPS[currentStepIndex - 1].id)}
            disabled={!canGoBack}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-5 h-5" />
            Back
          </button>

          <div className="text-sm text-gray-500">
            Step {currentStepIndex + 1} of {WIZARD_STEPS.length}
          </div>

          {isLastStep ? (
            <button
              onClick={handleComplete}
              className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors"
            >
              <Check className="w-5 h-5" />
              Complete Forecast
            </button>
          ) : (
            <button
              onClick={() => canGoForward && handleStepChange(WIZARD_STEPS[currentStepIndex + 1].id)}
              disabled={!canGoForward}
              className="flex items-center gap-2 px-4 py-2 bg-brand-orange text-white font-medium rounded-lg hover:bg-brand-orange-600 transition-colors disabled:opacity-50"
            >
              Continue
              <ChevronRight className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
