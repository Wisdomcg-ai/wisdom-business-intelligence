// Validation service for forecast data quality

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info'
  field: string
  message: string
  value?: any
  suggestion?: string
}

export interface ValidationResult {
  isValid: boolean
  issues: ValidationIssue[]
  completeness: number // 0-100%
}

export class ForecastValidationService {
  /**
   * Validate COGS percentage
   */
  static validateCogsPercentage(percentage: number): ValidationIssue | null {
    if (percentage < 0 || percentage > 100) {
      return {
        severity: 'error',
        field: 'cogs_percentage',
        message: 'COGS percentage must be between 0% and 100%',
        value: percentage,
        suggestion: 'Enter a valid percentage between 0 and 100'
      }
    }

    if (percentage < 5) {
      return {
        severity: 'warning',
        field: 'cogs_percentage',
        message: 'COGS percentage seems unusually low (<5%)',
        value: percentage,
        suggestion: 'Most businesses have COGS between 20-60%. Please verify this is correct.'
      }
    }

    if (percentage > 95) {
      return {
        severity: 'warning',
        field: 'cogs_percentage',
        message: 'COGS percentage seems unusually high (>95%)',
        value: percentage,
        suggestion: 'This leaves very little gross profit. Please verify this is correct.'
      }
    }

    return null
  }

  /**
   * Validate revenue goal
   */
  static validateRevenueGoal(revenue: number): ValidationIssue | null {
    if (revenue < 0) {
      return {
        severity: 'error',
        field: 'revenue_goal',
        message: 'Revenue goal cannot be negative',
        value: revenue,
        suggestion: 'Enter a positive revenue target'
      }
    }

    if (revenue === 0) {
      return {
        severity: 'error',
        field: 'revenue_goal',
        message: 'Revenue goal is required',
        value: revenue,
        suggestion: 'Enter your annual revenue target to continue'
      }
    }

    if (revenue < 10000) {
      return {
        severity: 'warning',
        field: 'revenue_goal',
        message: 'Revenue goal seems unusually low',
        value: revenue,
        suggestion: 'Most businesses target at least $10,000 in annual revenue'
      }
    }

    return null
  }

  /**
   * Validate forecast totals match goals
   */
  static validateForecastVsGoals(
    forecastTotal: number,
    goalTotal: number,
    tolerance: number = 0.05 // 5%
  ): ValidationIssue | null {
    if (goalTotal === 0) return null

    const variance = Math.abs(forecastTotal - goalTotal) / goalTotal

    if (variance > tolerance) {
      const pctDiff = (variance * 100).toFixed(1)
      const direction = forecastTotal > goalTotal ? 'higher' : 'lower'

      return {
        severity: 'warning',
        field: 'forecast_total',
        message: `Forecast total is ${pctDiff}% ${direction} than goal`,
        value: forecastTotal,
        suggestion: `Goal: $${goalTotal.toLocaleString()}, Forecast: $${forecastTotal.toLocaleString()}. Consider adjusting your forecast or goals.`
      }
    }

    return null
  }

  /**
   * Validate P&L line values
   */
  static validatePLLineValue(
    value: number,
    category: string,
    accountName: string
  ): ValidationIssue | null {
    // Check for negative revenue
    if (category === 'Revenue' && value < 0) {
      return {
        severity: 'warning',
        field: accountName,
        message: 'Revenue values are typically positive',
        value: value,
        suggestion: 'Use "Other Expenses" category for refunds or discounts'
      }
    }

    // Check for negative expenses (should be positive as they reduce profit)
    if ((category === 'Cost of Sales' || category === 'Operating Expenses') && value < 0) {
      return {
        severity: 'warning',
        field: accountName,
        message: 'Expense values are typically positive (they reduce profit)',
        value: value,
        suggestion: 'Enter the amount as a positive number'
      }
    }

    // Check for unreasonably large values (potential data entry error)
    if (Math.abs(value) > 1000000000) {
      return {
        severity: 'warning',
        field: accountName,
        message: 'Value seems unusually large',
        value: value,
        suggestion: 'Please verify this amount is correct (over $1 billion)'
      }
    }

    return null
  }

  /**
   * Check forecast completeness
   */
  static calculateCompleteness(
    hasRevenueGoal: boolean,
    hasDistributionMethod: boolean,
    hasCOGS: boolean,
    forecastMonthsCount: number,
    expectedMonthsCount: number,
    hasAtLeastOneRevenueLine: boolean,
    hasAtLeastOneExpenseLine: boolean
  ): number {
    let score = 0
    const weights = {
      revenueGoal: 20,
      distributionMethod: 10,
      cogs: 15,
      forecastMonths: 30,
      revenueLines: 15,
      expenseLines: 10
    }

    if (hasRevenueGoal) score += weights.revenueGoal
    if (hasDistributionMethod) score += weights.distributionMethod
    if (hasCOGS) score += weights.cogs
    if (hasAtLeastOneRevenueLine) score += weights.revenueLines
    if (hasAtLeastOneExpenseLine) score += weights.expenseLines

    // Forecast months (proportional)
    if (expectedMonthsCount > 0) {
      const monthsRatio = Math.min(forecastMonthsCount / expectedMonthsCount, 1)
      score += weights.forecastMonths * monthsRatio
    }

    return Math.round(score)
  }

  /**
   * Validate all forecast months have data
   */
  static validateMonthsComplete(
    forecastMonths: { [key: string]: number },
    expectedMonthKeys: string[]
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    const missingMonths: string[] = []

    expectedMonthKeys.forEach(monthKey => {
      if (!forecastMonths[monthKey] && forecastMonths[monthKey] !== 0) {
        missingMonths.push(monthKey)
      }
    })

    if (missingMonths.length > 0) {
      issues.push({
        severity: 'warning',
        field: 'forecast_months',
        message: `${missingMonths.length} month(s) missing forecast data`,
        value: missingMonths,
        suggestion: `Missing: ${missingMonths.slice(0, 3).join(', ')}${missingMonths.length > 3 ? '...' : ''}`
      })
    }

    return issues
  }

  /**
   * Detect formula circular references
   */
  static validateFormulas(
    formulas: Map<string, string>,
    cellReferences: Map<string, string[]>
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = []

    // Check for circular references using DFS
    const visited = new Set<string>()
    const recursionStack = new Set<string>()

    const hasCycle = (cellId: string): boolean => {
      visited.add(cellId)
      recursionStack.add(cellId)

      const references = cellReferences.get(cellId) || []
      for (const refCell of references) {
        if (!visited.has(refCell)) {
          if (hasCycle(refCell)) return true
        } else if (recursionStack.has(refCell)) {
          return true // Circular reference detected
        }
      }

      recursionStack.delete(cellId)
      return false
    }

    formulas.forEach((formula, cellId) => {
      visited.clear()
      recursionStack.clear()

      if (hasCycle(cellId)) {
        issues.push({
          severity: 'error',
          field: cellId,
          message: 'Circular reference detected in formula',
          value: formula,
          suggestion: 'Remove the circular reference to prevent calculation errors'
        })
      }
    })

    return issues
  }

  /**
   * Validate decimal precision
   */
  static roundToPrecision(value: number, decimals: number = 2): number {
    // Banker's rounding (round half to even)
    const factor = Math.pow(10, decimals)
    const rounded = Math.round(value * factor) / factor
    return rounded
  }

  /**
   * Format currency with proper precision
   */
  static formatCurrency(value: number, currency: string = 'AUD'): string {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value)
  }
}
