'use client'

import { useState, useEffect, useRef } from 'react'
import { Plus, X, Settings, Link as LinkIcon, ChevronDown, ChevronUp } from 'lucide-react'
import type { FinancialForecast, ForecastEmployee, PayrollFrequency, PayDay, WageClassification, PLLine } from '../types'
import ForecastService from '../services/forecast-service'
import { PayrollCalculator } from '../services/payroll-calculator'
import { SUPERANNUATION } from '../constants'

interface PayrollTableProps {
  forecast: FinancialForecast
  employees: ForecastEmployee[]
  plLines: PLLine[]
  onSave: (employees: ForecastEmployee[]) => void
  onUpdateForecast: (updates: Partial<FinancialForecast>) => void
  onSavePLLines: (lines: PLLine[]) => Promise<void>
}

export default function PayrollTable({ forecast, employees, plLines, onSave, onUpdateForecast, onSavePLLines }: PayrollTableProps) {
  const [emps, setEmps] = useState<ForecastEmployee[]>(employees)
  const [monthColumns, setMonthColumns] = useState<Array<{
    key: string
    label: string
    isForecast: boolean
  }>>([])

  // Payroll settings (from forecast or defaults)
  const [payrollFrequency, setPayrollFrequency] = useState<PayrollFrequency>(
    forecast.payroll_frequency || 'fortnightly'
  )
  const [payDay, setPayDay] = useState<PayDay>(forecast.pay_day || 'thursday')
  const [superRate, setSuperRate] = useState<number>(forecast.superannuation_rate || SUPERANNUATION.DEFAULT_RATE)

  // P&L mapping state
  const [wagesOpexLineId, setWagesOpexLineId] = useState<string>(forecast.wages_opex_pl_line_id || '')
  const [wagesCogsLineId, setWagesCogsLineId] = useState<string>(forecast.wages_cogs_pl_line_id || '')
  const [superOpexLineId, setSuperOpexLineId] = useState<string>(forecast.super_opex_pl_line_id || '')
  const [superCogsLineId, setSuperCogsLineId] = useState<string>(forecast.super_cogs_pl_line_id || '')
  const [showCreateOpexWagesLine, setShowCreateOpexWagesLine] = useState(false)
  const [showCreateCogsWagesLine, setShowCreateCogsWagesLine] = useState(false)
  const [showCreateOpexSuperLine, setShowCreateOpexSuperLine] = useState(false)
  const [showCreateCogsSuperLine, setShowCreateCogsSuperLine] = useState(false)
  const [newOpexWagesLineName, setNewOpexWagesLineName] = useState('Salaries & Wages - Admin')
  const [newCogsWagesLineName, setNewCogsWagesLineName] = useState('Salaries & Wages - COGS')
  const [newOpexSuperLineName, setNewOpexSuperLineName] = useState('Superannuation - Admin')
  const [newCogsSuperLineName, setNewCogsSuperLineName] = useState('Superannuation - COGS')

  // Expand/collapse state for sections
  const [isPayrollSettingsExpanded, setIsPayrollSettingsExpanded] = useState(true)
  const [isEmployeesExpanded, setIsEmployeesExpanded] = useState(true)
  const [isMonthlyForecastExpanded, setIsMonthlyForecastExpanded] = useState(true)

  const needsSave = useRef<boolean>(false)

  useEffect(() => {
    setEmps(employees)
  }, [employees])

  useEffect(() => {
    const columns = ForecastService.generateMonthColumns(
      forecast.actual_start_month,
      forecast.actual_end_month,
      forecast.forecast_start_month,
      forecast.forecast_end_month,
      forecast.baseline_start_month,
      forecast.baseline_end_month
    )
    setMonthColumns(columns)
  }, [forecast])

  // Debounced save for employees
  useEffect(() => {
    const timer = setTimeout(() => {
      if (needsSave.current && emps.length > 0) {
        onSave(emps)
        needsSave.current = false
      }
    }, 1000)

    return () => clearTimeout(timer)
  }, [emps, onSave])

  // Save payroll settings to forecast
  const savePayrollSettings = () => {
    onUpdateForecast({
      payroll_frequency: payrollFrequency,
      pay_day: payDay,
      superannuation_rate: superRate
    })
  }

  useEffect(() => {
    const timer = setTimeout(savePayrollSettings, 1000)
    return () => clearTimeout(timer)
  }, [payrollFrequency, payDay, superRate]) // eslint-disable-line react-hooks/exhaustive-deps

  const addEmployee = () => {
    const newEmp: ForecastEmployee = {
      employee_name: '',
      position: '',
      classification: 'opex',
      start_date: forecast.forecast_start_month,
      end_date: undefined,
      annual_salary: 0,
      hourly_rate: 0,
      standard_hours_per_week: 38,
      pay_per_period: 0,
      super_per_period: 0,
      payg_per_period: 0,
      monthly_cost: 0,
      is_active: true,
      sort_order: emps.length
    }
    setEmps([...emps, newEmp])
    needsSave.current = true
  }

  const removeEmployee = (index: number) => {
    setEmps(emps.filter((_, i) => i !== index))
    needsSave.current = true
  }

  const updateEmployee = (
    index: number,
    field: keyof ForecastEmployee,
    value: any,
    changedField?: 'annual_salary' | 'hourly_rate'
  ) => {
    const updated = [...emps]
    ;(updated[index] as any)[field] = value

    // Recalculate all derived fields if salary-related field changed
    if (field === 'annual_salary' || field === 'hourly_rate' || field === 'standard_hours_per_week') {
      updated[index] = PayrollCalculator.recalculateEmployee(
        updated[index],
        payrollFrequency,
        superRate,
        changedField
      )
    }

    setEmps(updated)
    needsSave.current = true
  }

  // Calculate monthly wages for COGS/OpEx
  const calculateMonthlyWages = (classification: WageClassification, monthKey: string): number => {
    return emps
      .filter(emp => emp.classification === classification && emp.is_active)
      .reduce((sum, emp) => {
        const cost = PayrollCalculator.calculateEmployeeMonthlyCost(
          emp,
          monthKey,
          payrollFrequency,
          payDay,
          superRate
        )
        return sum + cost
      }, 0)
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

  const formatNumber = (value: number | undefined, decimals: number = 2) => {
    if (!value || value === 0) return ''
    return value.toFixed(decimals)
  }

  // Convert YYYY-MM to YYYY-MM-DD for date input
  const formatDateForInput = (monthString: string | undefined): string => {
    if (!monthString) return ''
    // If already in YYYY-MM-DD format, return as is
    if (monthString.length === 10) return monthString
    // If in YYYY-MM format, add -01 for the first day of the month
    return `${monthString}-01`
  }

  // Convert YYYY-MM-DD to YYYY-MM for storage
  const formatDateForStorage = (dateString: string): string => {
    if (!dateString) return ''
    return dateString.substring(0, 7)
  }

  // Calculate monthly payroll totals by classification
  const calculateMonthlyTotals = () => {
    const wagesOpexTotals: { [key: string]: number } = {}
    const wagesCogsTotals: { [key: string]: number } = {}
    const superOpexTotals: { [key: string]: number } = {}
    const superCogsTotals: { [key: string]: number } = {}

    monthColumns.filter(col => col.isForecast).forEach(col => {
      wagesOpexTotals[col.key] = 0
      wagesCogsTotals[col.key] = 0
      superOpexTotals[col.key] = 0
      superCogsTotals[col.key] = 0
    })

    console.log('[Payroll] Calculating totals for', emps.length, 'employees')
    console.log('[Payroll] Forecast months:', monthColumns.filter(col => col.isForecast).map(c => c.key))

    emps.forEach((emp, idx) => {
      console.log(`[Payroll] Employee ${idx + 1}:`, {
        name: emp.employee_name,
        classification: emp.classification,
        monthly_cost: emp.monthly_cost,
        annual_salary: emp.annual_salary,
        start_date: emp.start_date,
        end_date: emp.end_date
      })

      if (!emp.annual_salary) {
        console.log(`[Payroll] Employee ${idx + 1} has no annual_salary, skipping`)
        return
      }

      monthColumns.filter(col => col.isForecast).forEach(col => {
        const [year, month] = col.key.split('-').map(Number)
        const monthDate = new Date(year, month - 1, 1)

        // Check if employee is active this month
        let isActive = true
        if (emp.start_date) {
          const [startYear, startMonth] = emp.start_date.split('-').map(Number)
          const startDate = new Date(startYear, startMonth - 1, 1)
          if (monthDate < startDate) isActive = false
        }
        if (emp.end_date) {
          const [endYear, endMonth] = emp.end_date.split('-').map(Number)
          const endDate = new Date(endYear, endMonth - 1, 1)
          if (monthDate > endDate) isActive = false
        }

        if (isActive) {
          // Calculate monthly wages (salary / 12)
          const monthlyWages = (emp.annual_salary || 0) / 12
          // Calculate monthly super (wages * super rate)
          const monthlySuper = monthlyWages * superRate

          if (emp.classification === 'cogs') {
            wagesCogsTotals[col.key] += monthlyWages
            superCogsTotals[col.key] += monthlySuper
          } else {
            wagesOpexTotals[col.key] += monthlyWages
            superOpexTotals[col.key] += monthlySuper
          }
        }
      })
    })

    console.log('[Payroll] Wages OpEx Totals:', wagesOpexTotals)
    console.log('[Payroll] Wages COGS Totals:', wagesCogsTotals)
    console.log('[Payroll] Super OpEx Totals:', superOpexTotals)
    console.log('[Payroll] Super COGS Totals:', superCogsTotals)

    return { wagesOpexTotals, wagesCogsTotals, superOpexTotals, superCogsTotals }
  }

  // Create a new P&L line for payroll
  const createPayrollPLLine = async (
    name: string,
    lineType: 'wages-opex' | 'wages-cogs' | 'super-opex' | 'super-cogs'
  ) => {
    const { wagesOpexTotals, wagesCogsTotals, superOpexTotals, superCogsTotals } = calculateMonthlyTotals()

    let forecastMonths: { [key: string]: number } = {}
    let category: string = 'Operating Expenses'

    switch (lineType) {
      case 'wages-opex':
        forecastMonths = wagesOpexTotals
        category = 'Operating Expenses'
        break
      case 'wages-cogs':
        forecastMonths = wagesCogsTotals
        category = 'Cost of Sales'
        break
      case 'super-opex':
        forecastMonths = superOpexTotals
        category = 'Operating Expenses'
        break
      case 'super-cogs':
        forecastMonths = superCogsTotals
        category = 'Cost of Sales'
        break
    }

    const newLine: PLLine = {
      account_name: name,
      category,
      actual_months: {},
      forecast_months: forecastMonths,
      is_from_payroll: true,
      is_manual: false,
      is_from_xero: false,
      sort_order: plLines.length
    }

    const updatedLines = [...plLines, newLine]
    await onSavePLLines(updatedLines)

    console.log('[Payroll] Created new P&L line:', name)

    // Trigger a reload to get the new line ID, then auto-select it
    // The page will reload with the new line, and we'll set it in the useEffect
  }

  // Sync payroll totals to mapped P&L lines
  const syncPayrollToPL = async () => {
    if (!wagesOpexLineId && !wagesCogsLineId && !superOpexLineId && !superCogsLineId) {
      console.log('[Payroll] No P&L lines mapped, skipping sync')
      return
    }

    const { wagesOpexTotals, wagesCogsTotals, superOpexTotals, superCogsTotals } = calculateMonthlyTotals()
    const updatedLines = plLines.map(line => {
      if (line.id === wagesOpexLineId) {
        return {
          ...line,
          forecast_months: wagesOpexTotals,
          is_from_payroll: true
        }
      }
      if (line.id === wagesCogsLineId) {
        return {
          ...line,
          forecast_months: wagesCogsTotals,
          is_from_payroll: true
        }
      }
      if (line.id === superOpexLineId) {
        return {
          ...line,
          forecast_months: superOpexTotals,
          is_from_payroll: true
        }
      }
      if (line.id === superCogsLineId) {
        return {
          ...line,
          forecast_months: superCogsTotals,
          is_from_payroll: true
        }
      }
      return line
    })

    await onSavePLLines(updatedLines)
    console.log('[Payroll] Synced payroll totals to P&L lines')
  }

  // Auto-sync when employees change or mapping changes
  useEffect(() => {
    if (emps.length > 0 && (wagesOpexLineId || wagesCogsLineId || superOpexLineId || superCogsLineId)) {
      const timer = setTimeout(() => {
        syncPayrollToPL().catch(console.error)
      }, 1000) // Sync 1 second after last change

      return () => clearTimeout(timer)
    }
  }, [emps, wagesOpexLineId, wagesCogsLineId, superOpexLineId, superCogsLineId])

  // Handle creating new wages OpEx line
  const handleCreateWagesOpexLine = async () => {
    if (!newOpexWagesLineName.trim()) return
    await createPayrollPLLine(newOpexWagesLineName, 'wages-opex')
    setShowCreateOpexWagesLine(false)
  }

  // Handle creating new wages COGS line
  const handleCreateWagesCogsLine = async () => {
    if (!newCogsWagesLineName.trim()) return
    await createPayrollPLLine(newCogsWagesLineName, 'wages-cogs')
    setShowCreateCogsWagesLine(false)
  }

  // Handle creating new super OpEx line
  const handleCreateSuperOpexLine = async () => {
    if (!newOpexSuperLineName.trim()) return
    await createPayrollPLLine(newOpexSuperLineName, 'super-opex')
    setShowCreateOpexSuperLine(false)
  }

  // Handle creating new super COGS line
  const handleCreateSuperCogsLine = async () => {
    if (!newCogsSuperLineName.trim()) return
    await createPayrollPLLine(newCogsSuperLineName, 'super-cogs')
    setShowCreateCogsSuperLine(false)
  }

  // Save P&L mapping to forecast and trigger sync
  const savePLMapping = () => {
    onUpdateForecast({
      wages_opex_pl_line_id: wagesOpexLineId,
      wages_cogs_pl_line_id: wagesCogsLineId,
      super_opex_pl_line_id: superOpexLineId,
      super_cogs_pl_line_id: superCogsLineId
    })
  }

  useEffect(() => {
    const timer = setTimeout(savePLMapping, 500)
    return () => clearTimeout(timer)
  }, [wagesOpexLineId, wagesCogsLineId, superOpexLineId, superCogsLineId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      {/* Payroll Settings */}
      <div className="bg-gradient-to-br from-brand-orange-50 to-brand-orange-50 rounded-xl shadow-lg border-2 border-brand-orange-200">
        <div
          className="p-6 border-b-2 border-brand-orange-200 bg-white/50 backdrop-blur-sm cursor-pointer hover:bg-white/70 transition-colors"
          onClick={() => setIsPayrollSettingsExpanded(!isPayrollSettingsExpanded)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-brand-orange-500 rounded-lg">
                <Settings className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Payroll Settings</h2>
                <p className="text-sm text-gray-600 mt-0.5">
                  Global settings that apply to all employees
                </p>
              </div>
            </div>
            <button className="p-2 hover:bg-brand-orange-100 rounded-lg transition-colors">
              {isPayrollSettingsExpanded ? (
                <ChevronUp className="w-6 h-6 text-gray-600" />
              ) : (
                <ChevronDown className="w-6 h-6 text-gray-600" />
              )}
            </button>
          </div>
        </div>

        {isPayrollSettingsExpanded && (
        <>
        <div className="p-8 grid grid-cols-3 gap-8">
          {/* Payroll Frequency */}
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-gray-800 mb-2">
              Payroll Frequency
            </label>
            <div className="relative">
              <select
                value={payrollFrequency}
                onChange={(e) => setPayrollFrequency(e.target.value as PayrollFrequency)}
                className="w-full px-4 py-3 text-base bg-white border-2 border-gray-300 rounded-xl shadow-sm focus:ring-4 focus:ring-brand-orange-100 focus:border-brand-orange-500 transition-all duration-200 hover:border-brand-orange-400 cursor-pointer appearance-none font-medium"
              >
                <option value="weekly">📅 Weekly</option>
                <option value="fortnightly">📅 Fortnightly</option>
                <option value="monthly">📅 Monthly</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-600">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
          </div>

          {/* Pay Day (only for weekly/fortnightly) */}
          {payrollFrequency !== 'monthly' && (
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-gray-800 mb-2">
                Pay Day
              </label>
              <div className="relative">
                <select
                  value={payDay}
                  onChange={(e) => setPayDay(e.target.value as PayDay)}
                  className="w-full px-4 py-3 text-base bg-white border-2 border-gray-300 rounded-xl shadow-sm focus:ring-4 focus:ring-brand-orange-100 focus:border-brand-orange-500 transition-all duration-200 hover:border-brand-orange-400 cursor-pointer appearance-none font-medium"
                >
                  <option value="monday">Monday</option>
                  <option value="tuesday">Tuesday</option>
                  <option value="wednesday">Wednesday</option>
                  <option value="thursday">Thursday</option>
                  <option value="friday">Friday</option>
                  <option value="saturday">Saturday</option>
                  <option value="sunday">Sunday</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-600">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            </div>
          )}

          {/* Superannuation Rate */}
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-gray-800 mb-2">
              Superannuation Rate
            </label>
            <div className="relative">
              <input
                type="number"
                value={(superRate * 100).toFixed(1)}
                onChange={(e) => setSuperRate(parseFloat(e.target.value) / 100 || SUPERANNUATION.DEFAULT_RATE)}
                step="0.1"
                min="0"
                max="100"
                className="w-full px-4 py-3 text-base bg-white border-2 border-gray-300 rounded-xl shadow-sm focus:ring-4 focus:ring-brand-orange-100 focus:border-brand-orange-500 transition-all duration-200 hover:border-brand-orange-400 font-medium"
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none text-gray-600 font-semibold">
                %
              </div>
            </div>
          </div>
        </div>

        {/* P&L Forecast Mapping - Inside Payroll Settings */}
        <div className="border-t-2 border-brand-orange-200 bg-white/50 backdrop-blur-sm">
          <div className="p-6 border-b-2 border-brand-orange-200">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-brand-orange-500 rounded-lg">
                <LinkIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">P&L Forecast Mapping</h3>
                <p className="text-sm text-gray-600 mt-0.5">
                  Map payroll totals to P&L lines - selections sync automatically
                </p>
              </div>
            </div>
          </div>

          <div className="p-8">
            <div className="grid grid-cols-2 gap-x-8 gap-y-6">
            {/* Wages OpEx */}
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-2">
                Wages - Operating Expenses
              </label>
              {!showCreateOpexWagesLine ? (
                <div className="space-y-2">
                  <div className="relative">
                    <select
                      value={wagesOpexLineId}
                      onChange={(e) => setWagesOpexLineId(e.target.value)}
                      className="w-full px-4 py-3 text-base bg-white border-2 border-gray-300 rounded-xl shadow-sm focus:ring-4 focus:ring-brand-orange-100 focus:border-brand-orange-500 transition-all duration-200 hover:border-brand-orange-400 cursor-pointer appearance-none font-medium"
                    >
                      <option value="">-- Select P&L Line --</option>
                      {plLines
                        .filter(line => line.category === 'Operating Expenses')
                        .map(line => (
                          <option key={line.id} value={line.id}>
                            {line.account_name}
                          </option>
                        ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-600">
                      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowCreateOpexWagesLine(true); }}
                    className="text-sm text-brand-orange hover:text-brand-orange-700 font-medium"
                  >
                    + Create new line
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={newOpexWagesLineName}
                    onChange={(e) => setNewOpexWagesLineName(e.target.value)}
                    placeholder="e.g., Salaries & Wages - Admin"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleCreateWagesOpexLine}
                      className="px-3 py-1 text-sm bg-brand-orange text-white rounded hover:bg-brand-orange-600"
                    >
                      Create
                    </button>
                    <button
                      onClick={() => setShowCreateOpexWagesLine(false)}
                      className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Wages COGS */}
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-2">
                Wages - Cost of Sales
              </label>
              {!showCreateCogsWagesLine ? (
                <div className="space-y-2">
                  <div className="relative">
                    <select
                      value={wagesCogsLineId}
                      onChange={(e) => setWagesCogsLineId(e.target.value)}
                      className="w-full px-4 py-3 text-base bg-white border-2 border-gray-300 rounded-xl shadow-sm focus:ring-4 focus:ring-brand-orange-100 focus:border-brand-orange-500 transition-all duration-200 hover:border-brand-orange-400 cursor-pointer appearance-none font-medium"
                    >
                      <option value="">-- Select P&L Line --</option>
                      {plLines
                        .filter(line => line.category === 'Cost of Sales')
                        .map(line => (
                          <option key={line.id} value={line.id}>
                            {line.account_name}
                          </option>
                        ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-600">
                      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowCreateCogsWagesLine(true); }}
                    className="text-sm text-brand-orange hover:text-brand-orange-700 font-medium"
                  >
                    + Create new line
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={newCogsWagesLineName}
                    onChange={(e) => setNewCogsWagesLineName(e.target.value)}
                    placeholder="e.g., Salaries & Wages - COGS"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleCreateWagesCogsLine}
                      className="px-3 py-1 text-sm bg-brand-orange text-white rounded hover:bg-brand-orange-600"
                    >
                      Create
                    </button>
                    <button
                      onClick={() => setShowCreateCogsWagesLine(false)}
                      className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Super OpEx */}
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-2">
                Superannuation - Operating Expenses
              </label>
              {!showCreateOpexSuperLine ? (
                <div className="space-y-2">
                  <div className="relative">
                    <select
                      value={superOpexLineId}
                      onChange={(e) => setSuperOpexLineId(e.target.value)}
                      className="w-full px-4 py-3 text-base bg-white border-2 border-gray-300 rounded-xl shadow-sm focus:ring-4 focus:ring-brand-orange-100 focus:border-brand-orange-500 transition-all duration-200 hover:border-brand-orange-400 cursor-pointer appearance-none font-medium"
                    >
                      <option value="">-- Select P&L Line --</option>
                      {plLines
                        .filter(line => line.category === 'Operating Expenses')
                        .map(line => (
                          <option key={line.id} value={line.id}>
                            {line.account_name}
                          </option>
                        ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-600">
                      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowCreateOpexSuperLine(true); }}
                    className="text-sm text-brand-orange hover:text-brand-orange-700 font-medium"
                  >
                    + Create new line
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={newOpexSuperLineName}
                    onChange={(e) => setNewOpexSuperLineName(e.target.value)}
                    placeholder="e.g., Superannuation - Admin"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleCreateSuperOpexLine}
                      className="px-3 py-1 text-sm bg-brand-orange text-white rounded hover:bg-brand-orange-600"
                    >
                      Create
                    </button>
                    <button
                      onClick={() => setShowCreateOpexSuperLine(false)}
                      className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Super COGS */}
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-2">
                Superannuation - Cost of Sales
              </label>
              {!showCreateCogsSuperLine ? (
                <div className="space-y-2">
                  <div className="relative">
                    <select
                      value={superCogsLineId}
                      onChange={(e) => setSuperCogsLineId(e.target.value)}
                      className="w-full px-4 py-3 text-base bg-white border-2 border-gray-300 rounded-xl shadow-sm focus:ring-4 focus:ring-brand-orange-100 focus:border-brand-orange-500 transition-all duration-200 hover:border-brand-orange-400 cursor-pointer appearance-none font-medium"
                    >
                      <option value="">-- Select P&L Line --</option>
                      {plLines
                        .filter(line => line.category === 'Cost of Sales')
                        .map(line => (
                          <option key={line.id} value={line.id}>
                            {line.account_name}
                          </option>
                        ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-600">
                      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowCreateCogsSuperLine(true); }}
                    className="text-sm text-brand-orange hover:text-brand-orange-700 font-medium"
                  >
                    + Create new line
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={newCogsSuperLineName}
                    onChange={(e) => setNewCogsSuperLineName(e.target.value)}
                    placeholder="e.g., Superannuation - COGS"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleCreateSuperCogsLine}
                      className="px-3 py-1 text-sm bg-brand-orange text-white rounded hover:bg-brand-orange-600"
                    >
                      Create
                    </button>
                    <button
                      onClick={() => setShowCreateCogsSuperLine(false)}
                      className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      </>
        )}
      </div>

      {/* Employee Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div
          className="p-6 border-b border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={() => setIsEmployeesExpanded(!isEmployeesExpanded)}
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Employees</h2>
              <p className="text-sm text-gray-600 mt-1">
                Manage your team members and their compensation details
              </p>
            </div>
            <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              {isEmployeesExpanded ? (
                <ChevronUp className="w-6 h-6 text-gray-600" />
              ) : (
                <ChevronDown className="w-6 h-6 text-gray-600" />
              )}
            </button>
          </div>
        </div>

        {isEmployeesExpanded && (
        <>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-gray-300 bg-gray-50">
                {/* Employee Info Group */}
                <th colSpan={5} className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-r-2 border-gray-300 bg-brand-orange-50">
                  Employee Information
                </th>
                {/* Salary Input Group */}
                <th colSpan={3} className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-r-2 border-gray-300 bg-green-50">
                  Salary Details (Editable)
                </th>
                {/* Calculated Group */}
                <th colSpan={3} className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider bg-amber-50">
                  Calculated
                </th>
                <th className="px-4 py-2"></th>
              </tr>
              <tr className="border-b border-gray-200 bg-gray-50">
                {/* Employee Info */}
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[150px]">
                  Employee Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]">
                  Classification
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[110px]">
                  Start Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[110px]">
                  End Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px] border-r-2 border-gray-300">
                  Position
                </th>

                {/* Salary Inputs */}
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px] bg-green-50">
                  Annual Salary
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[100px] bg-green-50">
                  Hourly Rate
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[100px] bg-green-50 border-r-2 border-gray-300">
                  Std Hrs/Week
                </th>

                {/* Calculated */}
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[110px] bg-amber-50">
                  Pay/Period
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[110px] bg-amber-50">
                  Super/Period
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px] bg-amber-50">
                  Monthly Cost
                </th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {emps.map((emp, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  {/* Employee Name */}
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={emp.employee_name}
                      onChange={(e) => updateEmployee(idx, 'employee_name', e.target.value)}
                      placeholder="Employee name"
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-brand-orange focus:border-brand-orange-500"
                    />
                  </td>

                  {/* Classification */}
                  <td className="px-4 py-3">
                    <select
                      value={emp.classification}
                      onChange={(e) => updateEmployee(idx, 'classification', e.target.value as WageClassification)}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-brand-orange focus:border-brand-orange-500"
                    >
                      <option value="opex">OpEx</option>
                      <option value="cogs">COGS</option>
                    </select>
                  </td>

                  {/* Start Date */}
                  <td className="px-4 py-3">
                    <input
                      type="date"
                      value={formatDateForInput(emp.start_date)}
                      onChange={(e) => updateEmployee(idx, 'start_date', formatDateForStorage(e.target.value))}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-brand-orange focus:border-brand-orange-500"
                    />
                  </td>

                  {/* End Date */}
                  <td className="px-4 py-3">
                    <input
                      type="date"
                      value={formatDateForInput(emp.end_date)}
                      onChange={(e) => updateEmployee(idx, 'end_date', formatDateForStorage(e.target.value))}
                      placeholder="Ongoing"
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-brand-orange focus:border-brand-orange-500"
                    />
                  </td>

                  {/* Position */}
                  <td className="px-4 py-3 border-r-2 border-gray-300">
                    <input
                      type="text"
                      value={emp.position || ''}
                      onChange={(e) => updateEmployee(idx, 'position', e.target.value)}
                      placeholder="Position"
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-brand-orange focus:border-brand-orange-500"
                    />
                  </td>

                  {/* Annual Salary - EDITABLE */}
                  <td className="px-4 py-3 bg-green-50">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 font-semibold">$</span>
                      <input
                        type="number"
                        value={emp.annual_salary || ''}
                        onChange={(e) => updateEmployee(idx, 'annual_salary', parseFloat(e.target.value) || 0, 'annual_salary')}
                        placeholder="0"
                        className="w-full pl-6 pr-2 py-1 text-sm text-right border border-green-300 rounded focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white font-medium"
                      />
                    </div>
                  </td>

                  {/* Hourly Rate - EDITABLE */}
                  <td className="px-4 py-3 bg-green-50">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 font-semibold">$</span>
                      <input
                        type="number"
                        value={emp.hourly_rate ? emp.hourly_rate.toFixed(2) : ''}
                        onChange={(e) => updateEmployee(idx, 'hourly_rate', parseFloat(e.target.value) || 0, 'hourly_rate')}
                        placeholder="0.00"
                        step="0.01"
                        className="w-full pl-6 pr-2 py-1 text-sm text-right border border-green-300 rounded focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white font-medium"
                      />
                    </div>
                  </td>

                  {/* Standard Hours - EDITABLE */}
                  <td className="px-4 py-3 bg-green-50 border-r-2 border-gray-300">
                    <input
                      type="number"
                      value={formatNumber(emp.standard_hours_per_week, 0)}
                      onChange={(e) => updateEmployee(idx, 'standard_hours_per_week', parseFloat(e.target.value) || 40)}
                      placeholder="40"
                      className="w-full px-2 py-1 text-sm text-right border border-green-300 rounded focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white font-medium"
                    />
                  </td>

                  {/* Pay per Period - CALCULATED */}
                  <td className="px-4 py-3 text-right text-sm text-gray-700 bg-amber-50 font-medium">
                    {formatCurrency(emp.pay_per_period || 0)}
                  </td>

                  {/* Super per Period - CALCULATED */}
                  <td className="px-4 py-3 text-right text-sm text-gray-700 bg-amber-50 font-medium">
                    {formatCurrency(emp.super_per_period || 0)}
                  </td>

                  {/* Monthly Cost - CALCULATED */}
                  <td className="px-4 py-3 text-right text-sm text-gray-900 bg-amber-50 font-semibold">
                    {formatCurrency(emp.monthly_cost || 0)}
                  </td>

                  {/* Delete Button */}
                  <td className="px-4 py-3">
                    <button
                      onClick={() => removeEmployee(idx)}
                      className="text-red-500 hover:text-red-700 transition-colors"
                      title="Remove employee"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-gray-200">
          <button
            onClick={addEmployee}
            className="flex items-center gap-2 px-4 py-2 text-sm text-brand-orange hover:text-brand-orange-700 hover:bg-brand-orange-50 font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Employee</span>
          </button>
        </div>
        </>
        )}
      </div>

      {/* Monthly Payroll Forecast */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div
          className="p-6 border-b border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={() => setIsMonthlyForecastExpanded(!isMonthlyForecastExpanded)}
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Monthly Payroll Forecast</h2>
              <p className="text-sm text-gray-600 mt-1">
                Automatically calculated from employee data (includes wages + super)
              </p>
            </div>
            <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              {isMonthlyForecastExpanded ? (
                <ChevronUp className="w-6 h-6 text-gray-600" />
              ) : (
                <ChevronDown className="w-6 h-6 text-gray-600" />
              )}
            </button>
          </div>
        </div>

        {isMonthlyForecastExpanded && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="sticky left-0 z-20 bg-gray-50 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r-2 border-gray-300 min-w-[200px]">
                  Category
                </th>
                {monthColumns.filter(c => c.isForecast).map((col) => (
                  <th
                    key={col.key}
                    className="px-4 py-3 text-right text-xs font-medium text-green-700 uppercase tracking-wider min-w-[120px] bg-green-50"
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              <tr className="hover:bg-gray-50">
                <td className="sticky left-0 z-10 bg-white px-6 py-3 border-r-2 border-gray-300 font-semibold text-gray-900">
                  Salaries & Wages - OpEx
                </td>
                {monthColumns.filter(c => c.isForecast).map((col) => {
                  const amount = calculateMonthlyWages('opex', col.key)
                  return (
                    <td key={col.key} className="px-4 py-3 text-right text-sm text-gray-700 font-medium">
                      {formatCurrency(amount)}
                    </td>
                  )
                })}
              </tr>
              <tr className="hover:bg-gray-50">
                <td className="sticky left-0 z-10 bg-white px-6 py-3 border-r-2 border-gray-300 font-semibold text-gray-900">
                  Salaries & Wages - COGS
                </td>
                {monthColumns.filter(c => c.isForecast).map((col) => {
                  const amount = calculateMonthlyWages('cogs', col.key)
                  return (
                    <td key={col.key} className="px-4 py-3 text-right text-sm text-gray-700 font-medium">
                      {formatCurrency(amount)}
                    </td>
                  )
                })}
              </tr>
              <tr className="bg-brand-orange-50 font-bold border-t-2 border-gray-300">
                <td className="sticky left-0 z-10 bg-brand-orange-50 px-6 py-3 border-r-2 border-gray-300 text-gray-900">
                  Total Payroll Cost
                </td>
                {monthColumns.filter(c => c.isForecast).map((col) => {
                  const opex = calculateMonthlyWages('opex', col.key)
                  const cogs = calculateMonthlyWages('cogs', col.key)
                  const total = opex + cogs
                  return (
                    <td key={col.key} className="px-4 py-3 text-right text-sm font-bold text-gray-900">
                      {formatCurrency(total)}
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>
        )}
      </div>
    </div>
  )
}
