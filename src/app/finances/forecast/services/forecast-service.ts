'use client'

import { createClient } from '@/lib/supabase/client'
import type {
  FinancialForecast,
  PLLine,
  ForecastEmployee,
  PayrollSummary,
  XeroConnection
} from '../types'

export class ForecastService {
  private static supabase = createClient()

  /**
   * Calculate forecast periods based on current date and fiscal year
   * Returns both baseline (prior FY for comparison) and current periods
   * If we're in the fiscal year, split into YTD actuals + remaining forecast
   * If we're before the fiscal year, entire period is forecast
   */
  private static calculateForecastPeriods(fiscalYear: number): {
    baseline_start_month: string
    baseline_end_month: string
    actual_start_month: string
    actual_end_month: string
    forecast_start_month: string
    forecast_end_month: string
    is_rolling: boolean
  } {
    const today = new Date()
    const fyStart = new Date(fiscalYear - 1, 6, 1) // Jul 1 of previous year (e.g., Jul 1, 2025 for FY26)
    const fyEnd = new Date(fiscalYear, 5, 30) // Jun 30 of fiscal year (e.g., Jun 30, 2026 for FY26)

    // Baseline is always the prior fiscal year (for patterns and comparison)
    const baselineStart = `${fiscalYear - 2}-07` // Jul 2024 (FY25 start)
    const baselineEnd = `${fiscalYear - 1}-06`   // Jun 2025 (FY25 end)

    // Check if we're currently IN the fiscal year being forecasted
    if (today >= fyStart && today <= fyEnd) {
      // We're in the fiscal year - this is a rolling forecast
      // Round down to last complete month
      const lastCompleteMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const lastCompleteMonthStr = `${lastCompleteMonth.getFullYear()}-${String(lastCompleteMonth.getMonth() + 1).padStart(2, '0')}`

      // Forecast starts from current month (or next month if today is near month end)
      const forecastStart = new Date(today.getFullYear(), today.getMonth(), 1)
      const forecastStartStr = `${forecastStart.getFullYear()}-${String(forecastStart.getMonth() + 1).padStart(2, '0')}`

      console.log('[Forecast] Rolling forecast detected:', {
        today: today.toISOString().split('T')[0],
        fyStart: fyStart.toISOString().split('T')[0],
        fyEnd: fyEnd.toISOString().split('T')[0],
        baseline: `${baselineStart} to ${baselineEnd}`,
        actualYTD: `${fiscalYear - 1}-07 to ${lastCompleteMonthStr}`,
        forecastRemaining: `${forecastStartStr} to ${fiscalYear}-06`
      })

      return {
        baseline_start_month: baselineStart,
        baseline_end_month: baselineEnd,
        actual_start_month: `${fiscalYear - 1}-07`, // Start of current FY (Jul 2025)
        actual_end_month: lastCompleteMonthStr, // Last complete month (Oct 2025)
        forecast_start_month: forecastStartStr, // Current/next month (Nov 2025)
        forecast_end_month: `${fiscalYear}-06`, // End of FY (Jun 2026)
        is_rolling: true
      }
    } else {
      // Not in fiscal year yet - standard annual forecast
      // Baseline = prior FY for patterns
      // Actual = none yet (FY hasn't started)
      // Forecast = entire upcoming FY
      return {
        baseline_start_month: baselineStart,
        baseline_end_month: baselineEnd,
        actual_start_month: `${fiscalYear - 1}-07`, // Jul 2025 (will have data once FY starts)
        actual_end_month: `${fiscalYear - 1}-06`, // Jun 2025 (placeholder, will update when rolling)
        forecast_start_month: `${fiscalYear - 1}-07`, // Jul 2025 (start of FY26)
        forecast_end_month: `${fiscalYear}-06`, // Jun 2026 (end of FY26)
        is_rolling: false
      }
    }
  }

  /**
   * Get or create a forecast for a business
   */
  static async getOrCreateForecast(
    businessId: string,
    userId: string,
    fiscalYear: number
  ): Promise<{ forecast: FinancialForecast | null; error?: string }> {
    try {
      // Try to find existing forecast for this business (any fiscal year)
      // Use limit(1) instead of single() to avoid 406 errors when multiple forecasts exist
      const { data: existing, error: fetchError } = await this.supabase
        .from('financial_forecasts')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(1)

      if (existing && existing.length > 0) {
        const forecast = existing[0]
        console.log('[Forecast] Found existing forecast:', forecast.id, 'fiscal_year:', forecast.fiscal_year)

        // Calculate correct periods based on current date (handles rolling forecasts)
        const periods = this.calculateForecastPeriods(fiscalYear)

        // Check if forecast needs updating (fiscal year or dates changed)
        const needsUpdate =
          forecast.fiscal_year !== fiscalYear ||
          forecast.baseline_start_month !== periods.baseline_start_month ||
          forecast.baseline_end_month !== periods.baseline_end_month ||
          forecast.actual_start_month !== periods.actual_start_month ||
          forecast.actual_end_month !== periods.actual_end_month ||
          forecast.forecast_start_month !== periods.forecast_start_month ||
          forecast.forecast_end_month !== periods.forecast_end_month

        if (needsUpdate) {
          console.log('[Forecast] Updating forecast dates:', {
            old: {
              baseline: `${forecast.baseline_start_month || 'none'} to ${forecast.baseline_end_month || 'none'}`,
              actual: `${forecast.actual_start_month} to ${forecast.actual_end_month}`,
              forecast: `${forecast.forecast_start_month} to ${forecast.forecast_end_month}`
            },
            new: {
              baseline: `${periods.baseline_start_month} to ${periods.baseline_end_month}`,
              actual: `${periods.actual_start_month} to ${periods.actual_end_month}`,
              forecast: `${periods.forecast_start_month} to ${periods.forecast_end_month}`
            },
            isRolling: periods.is_rolling
          })

          const { error: updateError} = await this.supabase
            .from('financial_forecasts')
            .update({
              fiscal_year: fiscalYear,
              name: periods.is_rolling
                ? `FY${fiscalYear} Forecast (${new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })})`
                : `FY${fiscalYear} Financial Forecast`,
              baseline_start_month: periods.baseline_start_month,
              baseline_end_month: periods.baseline_end_month,
              actual_start_month: periods.actual_start_month,
              actual_end_month: periods.actual_end_month,
              forecast_start_month: periods.forecast_start_month,
              forecast_end_month: periods.forecast_end_month,
              updated_at: new Date().toISOString()
            })
            .eq('id', forecast.id)

          if (updateError) {
            console.error('[Forecast] Error updating forecast:', updateError)
          } else {
            // Return updated forecast
            forecast.fiscal_year = fiscalYear
            forecast.name = periods.is_rolling
              ? `FY${fiscalYear} Forecast (${new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })})`
              : `FY${fiscalYear} Financial Forecast`
            forecast.baseline_start_month = periods.baseline_start_month
            forecast.baseline_end_month = periods.baseline_end_month
            forecast.actual_start_month = periods.actual_start_month
            forecast.actual_end_month = periods.actual_end_month
            forecast.forecast_start_month = periods.forecast_start_month
            forecast.forecast_end_month = periods.forecast_end_month
          }
        }

        return { forecast }
      }

      // Create new forecast
      // Calculate periods based on current date
      const periods = this.calculateForecastPeriods(fiscalYear)

      const newForecast: Partial<FinancialForecast> = {
        business_id: businessId,
        user_id: userId,
        name: periods.is_rolling
          ? `FY${fiscalYear} Forecast (${new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })})`
          : `FY${fiscalYear} Financial Forecast`,
        fiscal_year: fiscalYear,
        year_type: 'FY',
        baseline_start_month: periods.baseline_start_month,
        baseline_end_month: periods.baseline_end_month,
        actual_start_month: periods.actual_start_month,
        actual_end_month: periods.actual_end_month,
        forecast_start_month: periods.forecast_start_month,
        forecast_end_month: periods.forecast_end_month,
        is_completed: false
      }

      const { data: created, error: createError } = await this.supabase
        .from('financial_forecasts')
        .insert([newForecast])
        .select()
        .single()

      if (createError) {
        console.error('[Forecast] Error creating forecast:', createError)
        return { forecast: null, error: createError.message }
      }

      console.log('[Forecast] Created new forecast:', created.id)
      return { forecast: created }
    } catch (err) {
      console.error('[Forecast] Error:', err)
      return { forecast: null, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  }

  /**
   * Load P&L lines for a forecast
   */
  static async loadPLLines(forecastId: string): Promise<PLLine[]> {
    try {
      const { data, error } = await this.supabase
        .from('forecast_pl_lines')
        .select('*')
        .eq('forecast_id', forecastId)
        .order('sort_order', { ascending: true })

      if (error) {
        console.error('[Forecast] Error loading P&L lines:', error)
        return []
      }

      return data || []
    } catch (err) {
      console.error('[Forecast] Error:', err)
      return []
    }
  }

  /**
   * Save or update P&L lines
   * Uses upsert pattern to ensure atomicity - no data loss if operation fails
   */
  static async savePLLines(
    forecastId: string,
    lines: PLLine[]
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Get existing line IDs
      const { data: existingData } = await this.supabase
        .from('forecast_pl_lines')
        .select('id')
        .eq('forecast_id', forecastId)

      const existingIds = new Set((existingData || []).map(item => item.id))
      const newIds = new Set(lines.filter(line => line.id).map(line => line.id))

      // Upsert lines
      if (lines.length > 0) {
        const linesToUpsert = lines.map((line, index) => ({
          id: line.id || undefined,
          forecast_id: forecastId,
          account_code: line.account_code,
          account_name: line.account_name,
          account_type: line.account_type,
          account_class: line.account_class,
          category: line.category,
          subcategory: line.subcategory,
          sort_order: line.sort_order ?? index,
          actual_months: line.actual_months || {},
          forecast_months: line.forecast_months || {},
          is_from_xero: line.is_from_xero,
          is_from_payroll: line.is_from_payroll,
          is_manual: line.is_manual,
          notes: line.notes
        }))

        const { error: upsertError } = await this.supabase
          .from('forecast_pl_lines')
          .upsert(linesToUpsert, {
            onConflict: 'id',
            ignoreDuplicates: false
          })

        if (upsertError) {
          console.error('[Forecast] Error upserting P&L lines:', upsertError)
          return { success: false, error: upsertError.message }
        }
      }

      // Delete removed lines
      const idsToDelete = [...existingIds].filter(id => !newIds.has(id))
      if (idsToDelete.length > 0) {
        await this.supabase
          .from('forecast_pl_lines')
          .delete()
          .in('id', idsToDelete)
      }

      // Handle case where all lines are removed
      if (lines.length === 0 && existingIds.size > 0) {
        await this.supabase
          .from('forecast_pl_lines')
          .delete()
          .eq('forecast_id', forecastId)
      }

      console.log('[Forecast] Saved P&L lines:', lines.length)
      return { success: true }
    } catch (err) {
      console.error('[Forecast] Error:', err)
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  }

  /**
   * Load employees for a forecast
   */
  static async loadEmployees(forecastId: string): Promise<ForecastEmployee[]> {
    try {
      const { data, error } = await this.supabase
        .from('forecast_employees')
        .select('*')
        .eq('forecast_id', forecastId)
        .order('sort_order', { ascending: true })

      if (error) {
        console.error('[Forecast] Error loading employees:', error)
        return []
      }

      // Convert dates from YYYY-MM-DD back to YYYY-MM format for display
      const employees = (data || []).map(emp => ({
        ...emp,
        start_date: emp.start_date ? emp.start_date.substring(0, 7) : undefined,
        end_date: emp.end_date ? emp.end_date.substring(0, 7) : undefined,
        // Ensure classification is set from category if not already set
        classification: emp.classification || (emp.category === 'Wages COGS' ? 'cogs' : 'opex')
      }))

      return employees
    } catch (err) {
      console.error('[Forecast] Error:', err)
      return []
    }
  }

  /**
   * Save or update employees
   * Uses upsert pattern to ensure atomicity - no data loss if operation fails
   */
  static async saveEmployees(
    forecastId: string,
    employees: ForecastEmployee[]
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Get existing employee IDs
      const { data: existingData } = await this.supabase
        .from('forecast_employees')
        .select('id')
        .eq('forecast_id', forecastId)

      const existingIds = new Set((existingData || []).map(item => item.id))
      const newIds = new Set(employees.filter(emp => emp.id).map(emp => emp.id))

      // Upsert employees
      if (employees.length > 0) {
        const employeesToUpsert = employees.map((emp, index) => ({
          id: emp.id || undefined,
          forecast_id: forecastId,
          employee_name: emp.employee_name,
          position: emp.position,
          category: emp.category || (emp.classification === 'cogs' ? 'Wages COGS' : 'Wages Admin'),
          start_date: emp.start_date ? `${emp.start_date}-01` : null,
          end_date: emp.end_date ? `${emp.end_date}-01` : null,
          hours: emp.hours,
          rate: emp.rate,
          weekly_budget: emp.weekly_budget,
          annual_salary: emp.annual_salary,
          weekly_payg: emp.weekly_payg,
          sort_order: index
        }))

        const { error: upsertError } = await this.supabase
          .from('forecast_employees')
          .upsert(employeesToUpsert, {
            onConflict: 'id',
            ignoreDuplicates: false
          })

        if (upsertError) {
          console.error('[Forecast] Error upserting employees:', upsertError)
          return { success: false, error: upsertError.message }
        }
      }

      // Delete removed employees
      const idsToDelete = [...existingIds].filter(id => !newIds.has(id))
      if (idsToDelete.length > 0) {
        await this.supabase
          .from('forecast_employees')
          .delete()
          .in('id', idsToDelete)
      }

      // Handle case where all employees are removed
      if (employees.length === 0 && existingIds.size > 0) {
        await this.supabase
          .from('forecast_employees')
          .delete()
          .eq('forecast_id', forecastId)
      }

      console.log('[Forecast] Saved employees:', employees.length)
      return { success: true }
    } catch (err) {
      console.error('[Forecast] Error:', err)
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  }

  /**
   * Load payroll summary for a forecast
   */
  static async loadPayrollSummary(forecastId: string): Promise<PayrollSummary | null> {
    try {
      const { data, error } = await this.supabase
        .from('forecast_payroll_summary')
        .select('*')
        .eq('forecast_id', forecastId)
        .single()

      if (error && error.code !== 'PGRST116') {
        console.error('[Forecast] Error loading payroll summary:', error)
        return null
      }

      return data
    } catch (err) {
      console.error('[Forecast] Error:', err)
      return null
    }
  }

  /**
   * Save or update payroll summary
   */
  static async savePayrollSummary(
    forecastId: string,
    summary: PayrollSummary
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await this.supabase
        .from('forecast_payroll_summary')
        .upsert({
          ...summary,
          forecast_id: forecastId
        })

      if (error) {
        console.error('[Forecast] Error saving payroll summary:', error)
        return { success: false, error: error.message }
      }

      console.log('[Forecast] Saved payroll summary')
      return { success: true }
    } catch (err) {
      console.error('[Forecast] Error:', err)
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  }

  /**
   * Get Xero connection for a business
   */
  static async getXeroConnection(businessId: string): Promise<XeroConnection | null> {
    try {
      const { data, error } = await this.supabase
        .from('xero_connections')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) {
        console.error('[Forecast] Error loading Xero connection:', error)
        return null
      }

      // Check is_active in JS to avoid potential boolean filter issues at DB level
      if (!data || !data.is_active) {
        return null
      }

      return data
    } catch (err) {
      console.error('[Forecast] Error:', err)
      return null
    }
  }

  /**
   * Get current year month keys (YTD actuals)
   * Returns array of month keys from baseline end to forecast start
   */
  static getCurrentYearMonthKeys(baselineEndMonth: string, forecastStartMonth: string): string[] {
    const months: string[] = []

    // Parse start and end months
    const [startYear, startMonth] = baselineEndMonth.split('-').map(Number)
    const [endYear, endMonth] = forecastStartMonth.split('-').map(Number)

    // Start from the month after baseline ends
    let currentYear = startYear
    let currentMonth = startMonth + 1

    // Adjust if we roll over into next year
    if (currentMonth > 12) {
      currentMonth = 1
      currentYear++
    }

    // Generate months up to (but not including) forecast start
    while (currentYear < endYear || (currentYear === endYear && currentMonth < endMonth)) {
      const monthStr = String(currentMonth).padStart(2, '0')
      months.push(`${currentYear}-${monthStr}`)

      currentMonth++
      if (currentMonth > 12) {
        currentMonth = 1
        currentYear++
      }
    }

    return months
  }

  /**
   * Get forecast month keys
   * Returns array of month keys for the forecast period
   */
  static getForecastMonthKeys(forecastStartMonth: string, forecastEndMonth: string): string[] {
    const months: string[] = []

    // Parse start and end months
    const [startYear, startMonth] = forecastStartMonth.split('-').map(Number)
    const [endYear, endMonth] = forecastEndMonth.split('-').map(Number)

    let currentYear = startYear
    let currentMonth = startMonth

    // Generate months from start to end (inclusive)
    while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
      const monthStr = String(currentMonth).padStart(2, '0')
      months.push(`${currentYear}-${monthStr}`)

      currentMonth++
      if (currentMonth > 12) {
        currentMonth = 1
        currentYear++
      }
    }

    return months
  }

  /**
   * Generate month columns for the forecast table
   */
  static generateMonthColumns(
    actualStartMonth: string,
    actualEndMonth: string,
    forecastStartMonth: string,
    forecastEndMonth: string,
    baselineStartMonth?: string,
    baselineEndMonth?: string
  ) {
    const columns: Array<{
      key: string
      label: string
      isActual: boolean
      isForecast: boolean
      isBaseline?: boolean
    }> = []

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

    // Step 1: Generate baseline months (if provided) - FY25: Jul 24 - Jun 25
    if (baselineStartMonth && baselineEndMonth) {
      const [startYear, startMonth] = baselineStartMonth.split('-').map(Number)
      const [endYear, endMonth] = baselineEndMonth.split('-').map(Number)

      let currentYear = startYear
      let currentMonth = startMonth

      while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
        const monthIndex = currentMonth - 1 // Convert to 0-based for array lookup
        const yearShort = currentYear.toString().slice(-2)

        columns.push({
          key: `${currentYear}-${currentMonth.toString().padStart(2, '0')}`,
          label: `${monthNames[monthIndex]} ${yearShort}`,
          isActual: true,
          isForecast: false,
          isBaseline: true
        })

        currentMonth++
        if (currentMonth > 12) {
          currentMonth = 1
          currentYear++
        }
      }
    }

    // Step 2: Generate FY26 columns in order (YTD actuals + forecast together)
    // Start with current year YTD actuals - FY26 YTD: Jul 25 - Oct 25
    const [actualStartYear, actualStartMonthNum] = actualStartMonth.split('-').map(Number)
    const [actualEndYear, actualEndMonthNum] = actualEndMonth.split('-').map(Number)

    let currentYear = actualStartYear
    let currentMonth = actualStartMonthNum

    while (currentYear < actualEndYear || (currentYear === actualEndYear && currentMonth <= actualEndMonthNum)) {
      const monthIndex = currentMonth - 1
      const yearShort = currentYear.toString().slice(-2)

      columns.push({
        key: `${currentYear}-${currentMonth.toString().padStart(2, '0')}`,
        label: `${monthNames[monthIndex]} ${yearShort}`,
        isActual: true,
        isForecast: false,
        isBaseline: false
      })

      currentMonth++
      if (currentMonth > 12) {
        currentMonth = 1
        currentYear++
      }
    }

    // Step 3: Then add forecast months right after - FY26 Forecast: Nov 25 - Jun 26
    const [forecastStartYear, forecastStartMonthNum] = forecastStartMonth.split('-').map(Number)
    const [forecastEndYear, forecastEndMonthNum] = forecastEndMonth.split('-').map(Number)

    currentYear = forecastStartYear
    currentMonth = forecastStartMonthNum

    while (currentYear < forecastEndYear || (currentYear === forecastEndYear && currentMonth <= forecastEndMonthNum)) {
      const monthIndex = currentMonth - 1
      const yearShort = currentYear.toString().slice(-2)

      columns.push({
        key: `${currentYear}-${currentMonth.toString().padStart(2, '0')}`,
        label: `${monthNames[monthIndex]} ${yearShort}`,
        isActual: false,
        isForecast: true,
        isBaseline: false
      })

      currentMonth++
      if (currentMonth > 12) {
        currentMonth = 1
        currentYear++
      }
    }

    return columns
  }
}

export default ForecastService
