'use client'

import { createClient } from '@/lib/supabase/client'
import {
  calculateForecastPeriods as _calcPeriods,
  DEFAULT_YEAR_START_MONTH,
  getFiscalYearStartDate,
  getFiscalYearEndDate,
} from '@/lib/utils/fiscal-year-utils'
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
   * Calculate forecast periods based on current date and fiscal year.
   * Delegates to the central fiscal-year-utils module.
   * yearStartMonth defaults to 7 (AU FY) for backward compatibility.
   */
  private static calculateForecastPeriods(
    fiscalYear: number,
    yearStartMonth: number = DEFAULT_YEAR_START_MONTH
  ) {
    return _calcPeriods(fiscalYear, yearStartMonth)
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
      // financial_forecasts.business_id FK references business_profiles(id),
      // but callers pass businesses.id — collect both IDs to search
      const idsToTry: string[] = [businessId]
      const { data: profile } = await this.supabase
        .from('business_profiles')
        .select('id')
        .eq('business_id', businessId)
        .maybeSingle()
      if (profile?.id && profile.id !== businessId) {
        idsToTry.push(profile.id)
      }

      // Try to find existing forecast for this business matching the requested fiscal year
      const { data: existing, error: fetchError } = await this.supabase
        .from('financial_forecasts')
        .select('*')
        .in('business_id', idsToTry)
        .eq('fiscal_year', fiscalYear)
        .order('updated_at', { ascending: false })
        .limit(10)

      if (existing && existing.length > 0) {
        // Prefer a forecast that has assumptions (wizard-generated) over empty ones
        const forecast = existing.find(f => f.assumptions != null) || existing[0]
        // Map wizard_v4 assumptions from category_assumptions if dedicated column doesn't exist
        if (!forecast.assumptions && forecast.category_assumptions?.wizard_v4?.assumptions) {
          forecast.assumptions = forecast.category_assumptions.wizard_v4.assumptions
        }
        console.log('[Forecast] Found existing forecast:', forecast.id, 'fiscal_year:', forecast.fiscal_year)

        // Calculate correct periods based on current date (handles rolling forecasts)
        const periods = this.calculateForecastPeriods(fiscalYear)

        // Check if forecast needs updating (dates changed — fiscal_year already matched by query)
        const needsUpdate =
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

      // Use business_profiles.id for FK compliance
      const profileBusinessId = profile?.id || businessId
      const newForecast: Partial<FinancialForecast> = {
        business_id: profileBusinessId,
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
        is_completed: false,
        last_reviewed_at: new Date().toISOString(),
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
   * Phase 65 — Load prior-FY actuals from xero_pl_lines as read-only PLLine[].
   *
   * Used when a past-FY forecast is opened and has no forecast_pl_lines (empty
   * stub from getOrCreateForecast). Renders the synced Xero actuals inline
   * instead of pushing the operator into a retrospective wizard build.
   *
   * Returns lines with actual_months populated, forecast_months empty.
   */
  static async loadActualsAsPLLines(
    businessId: string,
    fiscalYear: number,
    yearStartMonth: number = DEFAULT_YEAR_START_MONTH
  ): Promise<PLLine[]> {
    try {
      // Dual-ID lookup — xero_pl_lines.business_id may reference either
      // businesses.id or business_profiles.id depending on sync vintage.
      const idsToTry: string[] = [businessId]
      const { data: profile } = await this.supabase
        .from('business_profiles')
        .select('id')
        .eq('business_id', businessId)
        .maybeSingle()
      if (profile?.id && profile.id !== businessId) {
        idsToTry.push(profile.id)
      }

      const fyStart = getFiscalYearStartDate(fiscalYear, yearStartMonth)
      const fyEnd = getFiscalYearEndDate(fiscalYear, yearStartMonth)
      const startISO = `${fyStart.getFullYear()}-${String(fyStart.getMonth() + 1).padStart(2, '0')}-01`
      const endISO = `${fyEnd.getFullYear()}-${String(fyEnd.getMonth() + 1).padStart(2, '0')}-${String(fyEnd.getDate()).padStart(2, '0')}`

      // Paginate to avoid the PostgREST 1000-row cap (multi-year tenants
      // exceed it — Phase 44.1 hotfix pattern).
      type RawRow = {
        account_code: string | null
        account_name: string | null
        account_type: string | null
        period_month: string
        amount: number
      }
      const rows: RawRow[] = []
      const pageSize = 1000
      let from = 0
      while (true) {
        const { data, error } = await this.supabase
          .from('xero_pl_lines')
          .select('account_code, account_name, account_type, period_month, amount')
          .in('business_id', idsToTry)
          .gte('period_month', startISO)
          .lte('period_month', endISO)
          .range(from, from + pageSize - 1)
        if (error) {
          console.error('[Forecast] Error loading actuals:', error)
          return []
        }
        if (!data || data.length === 0) break
        rows.push(...(data as RawRow[]))
        if (data.length < pageSize) break
        from += pageSize
      }

      if (rows.length === 0) return []

      // Group by account_code (fallback NAME:<account_name> for null codes),
      // sum amount per month. Mirrors forecast-read-service aggregation so
      // totals match what the rest of the app already shows.
      const grouped = new Map<string, PLLine>()
      for (const r of rows) {
        const key = r.account_code ?? `NAME:${r.account_name ?? 'Unknown'}`
        let line = grouped.get(key)
        if (!line) {
          line = {
            account_code: r.account_code ?? undefined,
            account_name: r.account_name ?? 'Unknown',
            account_type: r.account_type ?? undefined,
            actual_months: {},
            forecast_months: {},
            is_from_xero: true,
          }
          grouped.set(key, line)
        }
        const monthKey = (r.period_month ?? '').slice(0, 7)
        if (!monthKey) continue
        const amt = Number(r.amount)
        line.actual_months[monthKey] = (line.actual_months[monthKey] ?? 0) + (Number.isFinite(amt) ? amt : 0)
      }

      const out = [...grouped.values()]
      out.sort((a, b) => {
        const ta = a.account_type ?? ''
        const tb = b.account_type ?? ''
        if (ta !== tb) return ta.localeCompare(tb)
        return a.account_name.localeCompare(b.account_name)
      })
      return out
    } catch (err) {
      console.error('[Forecast] loadActualsAsPLLines error:', err)
      return []
    }
  }

  /**
   * Load P&L lines for a forecast
   */
  static async loadPLLines(forecastId: string): Promise<PLLine[]> {
    const { data, error } = await this.supabase
      .from('forecast_pl_lines')
      .select('*')
      .eq('forecast_id', forecastId)
      .order('sort_order', { ascending: true })

    if (error) {
      console.error('[Forecast] Error loading P&L lines:', error)
      throw new Error(`Failed to load P&L lines: ${error.message}`)
    }

    return data || []
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
    const { data, error } = await this.supabase
      .from('forecast_employees')
      .select('*')
      .eq('forecast_id', forecastId)
      .order('sort_order', { ascending: true })

    if (error) {
      console.error('[Forecast] Error loading employees:', error)
      throw new Error(`Failed to load employees: ${error.message}`)
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
      // xero_connections.business_id references business_profiles.id,
      // but callers may pass businesses.id — collect both IDs to search
      const idsToTry: string[] = [businessId]
      const { data: profile } = await this.supabase
        .from('business_profiles')
        .select('id')
        .eq('business_id', businessId)
        .maybeSingle()
      if (profile?.id && profile.id !== businessId) {
        idsToTry.push(profile.id)
      }

      const { data, error } = await this.supabase
        .from('xero_connections')
        .select('*')
        .in('business_id', idsToTry)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()

      if (error && error.code !== 'PGRST116') {
        console.error('[Forecast] Error loading Xero connection:', error)
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
