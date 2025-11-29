import type { PLLine, ForecastMethodConfig, LineAnalysis } from '../types'

/**
 * World-class Forecasting Engine
 * Inspired by Calxa, Fathom, and Futurli
 */

export class ForecastingEngine {
  /**
   * Calculate analysis metrics for a P&L line based on historical data
   */
  static calculateAnalysis(
    line: PLLine,
    allLines: PLLine[],
    actualMonthKeys: string[]
  ): LineAnalysis {
    const analysis: LineAnalysis = {}

    // Calculate total for this line
    const lineTotal = actualMonthKeys.reduce((sum, monthKey) => {
      return sum + (line.actual_months[monthKey] || 0)
    }, 0)

    // Calculate average per month
    analysis.fy_average_per_month = lineTotal / actualMonthKeys.length

    // Calculate total revenue (for percentage calculations)
    const revenueLines = allLines.filter(l => l.category === 'Revenue')
    const totalRevenue = revenueLines.reduce((sum, revLine) => {
      return sum + actualMonthKeys.reduce((lineSum, monthKey) => {
        return lineSum + (revLine.actual_months[monthKey] || 0)
      }, 0)
    }, 0)

    if (line.category === 'Revenue') {
      // Revenue analysis: % of total revenue
      if (totalRevenue > 0) {
        analysis.pct_of_total_revenue = (lineTotal / totalRevenue) * 100
      }
    }

    if (line.category === 'Cost of Sales' || line.category === 'Operating Expenses') {
      // COGS/OpEx analysis: % of revenue
      if (totalRevenue > 0) {
        analysis.pct_of_revenue = (lineTotal / totalRevenue) * 100
      }

      // Trend analysis: compare first half vs second half of FY
      const midpoint = Math.floor(actualMonthKeys.length / 2)
      const firstHalf = actualMonthKeys.slice(0, midpoint)
      const secondHalf = actualMonthKeys.slice(midpoint)

      const firstHalfAvg = firstHalf.reduce((sum, key) =>
        sum + (line.actual_months[key] || 0), 0) / firstHalf.length
      const secondHalfAvg = secondHalf.reduce((sum, key) =>
        sum + (line.actual_months[key] || 0), 0) / secondHalf.length

      if (firstHalfAvg > 0) {
        const trendPct = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100
        analysis.trend_percentage = trendPct

        if (Math.abs(trendPct) < 5) {
          analysis.trend_direction = 'stable'
        } else if (trendPct > 0) {
          analysis.trend_direction = 'up'
        } else {
          analysis.trend_direction = 'down'
        }
      }
    }

    return analysis
  }

  /**
   * Apply forecasting method to generate forecast months
   */
  static applyForecastMethod(
    line: PLLine,
    allLines: PLLine[],
    forecastMonthKeys: string[],
    actualMonthKeys: string[]
  ): { [key: string]: number } {
    const config = line.forecast_method
    const forecast: { [key: string]: number } = {}

    console.log(`📐 applyForecastMethod for "${line.account_name}":`, {
      method: config?.method || 'none',
      config,
      forecastMonthCount: forecastMonthKeys.length,
      actualMonthCount: actualMonthKeys.length
    })

    if (!config) {
      // Default: use average if no method specified
      const avg = line.analysis?.fy_average_per_month || 0
      forecastMonthKeys.forEach(monthKey => {
        forecast[monthKey] = avg
      })
      console.log(`  → Using default average: ${avg}`)
      return forecast
    }

    let result: { [key: string]: number }

    switch (config.method) {
      case 'none':
        // Zero out this line - don't forecast
        forecastMonthKeys.forEach(monthKey => {
          forecast[monthKey] = 0
        })
        result = forecast
        break

      case 'straight_line':
        result = this.applyStraightLine(line, forecastMonthKeys, config)
        break

      case 'growth_rate':
        result = this.applyGrowthRate(line, forecastMonthKeys, actualMonthKeys, config)
        break

      case 'seasonal_pattern':
        result = this.applySeasonalPattern(line, forecastMonthKeys, actualMonthKeys, config)
        break

      case 'driver_based':
        result = this.applyDriverBased(line, allLines, forecastMonthKeys, config)
        break

      case 'manual':
        // Return existing forecast_months or zeros
        forecastMonthKeys.forEach(monthKey => {
          forecast[monthKey] = line.forecast_months[monthKey] || 0
        })
        result = forecast
        break

      default:
        // Fallback to average
        const avg = line.analysis?.fy_average_per_month || 0
        forecastMonthKeys.forEach(monthKey => {
          forecast[monthKey] = avg
        })
        result = forecast
        break
    }

    const total = Object.values(result).reduce((sum, val) => sum + val, 0)
    console.log(`  → Result: ${Object.keys(result).length} months, total: ${total.toFixed(2)}`)

    return result
  }

  /**
   * Straight-line: Same amount each month (Even Split)
   */
  private static applyStraightLine(
    line: PLLine,
    forecastMonthKeys: string[],
    config: ForecastMethodConfig
  ): { [key: string]: number } {
    const forecast: { [key: string]: number } = {}
    const baseAmount = config.base_amount || line.analysis?.fy_average_per_month || 0

    // Apply percentage increase if specified
    const increaseMultiplier = 1 + (config.percentage_increase || 0)
    const amount = baseAmount * increaseMultiplier

    forecastMonthKeys.forEach(monthKey => {
      forecast[monthKey] = amount
    })

    return forecast
  }

  /**
   * Growth rate: Apply % increase month-over-month or year-over-year
   */
  private static applyGrowthRate(
    line: PLLine,
    forecastMonthKeys: string[],
    actualMonthKeys: string[],
    config: ForecastMethodConfig
  ): { [key: string]: number } {
    const forecast: { [key: string]: number } = {}
    const growthRate = config.growth_rate || 0
    const growthType = config.growth_type || 'MoM'

    if (growthType === 'MoM') {
      // Month-over-month: each month grows by X% from previous month
      const lastActualMonth = actualMonthKeys[actualMonthKeys.length - 1]
      let previousValue = line.actual_months[lastActualMonth] || 0

      forecastMonthKeys.forEach(monthKey => {
        const newValue = previousValue * (1 + growthRate)
        forecast[monthKey] = newValue
        previousValue = newValue
      })
    } else {
      // Year-over-year: each month grows by X% from same month last year
      forecastMonthKeys.forEach((monthKey, index) => {
        // Find corresponding month from previous year (same index in actual months)
        const priorYearValue = index < actualMonthKeys.length
          ? (line.actual_months[actualMonthKeys[index]] || 0)
          : (forecast[forecastMonthKeys[index - 12]] || 0)

        forecast[monthKey] = priorYearValue * (1 + growthRate)
      })
    }

    return forecast
  }

  /**
   * Seasonal pattern: Repeat historical pattern (Match FY25 Pattern)
   */
  private static applySeasonalPattern(
    line: PLLine,
    forecastMonthKeys: string[],
    actualMonthKeys: string[],
    config?: ForecastMethodConfig
  ): { [key: string]: number } {
    const forecast: { [key: string]: number } = {}

    // Calculate the pattern: what % of total does each month represent?
    const total = actualMonthKeys.reduce((sum, key) =>
      sum + (line.actual_months[key] || 0), 0)

    const pattern = actualMonthKeys.map(key => {
      const value = line.actual_months[key] || 0
      return total > 0 ? value / total : 1 / actualMonthKeys.length
    })

    // Apply percentage increase if specified
    const increaseMultiplier = 1 + (config?.percentage_increase || 0)

    // Apply pattern to forecast months
    // Use average of actual months as the base, apply increase, then distribute by pattern
    const avgMonthly = total / actualMonthKeys.length
    const forecastTotal = avgMonthly * forecastMonthKeys.length * increaseMultiplier

    forecastMonthKeys.forEach((monthKey, index) => {
      const patternIndex = index % pattern.length
      forecast[monthKey] = forecastTotal * pattern[patternIndex]
    })

    return forecast
  }

  /**
   * Driver-based: Linked to another metric (e.g., % of revenue)
   */
  private static applyDriverBased(
    line: PLLine,
    allLines: PLLine[],
    forecastMonthKeys: string[],
    config: ForecastMethodConfig
  ): { [key: string]: number } {
    const forecast: { [key: string]: number } = {}

    // Find the driver line
    const driverLine = allLines.find(l => l.id === config.driver_line_id)
    if (!driverLine) {
      // Fallback to zero if driver not found
      forecastMonthKeys.forEach(monthKey => {
        forecast[monthKey] = 0
      })
      return forecast
    }

    const percentage = config.driver_percentage || 0

    // Calculate this line as % of driver line for each month
    forecastMonthKeys.forEach(monthKey => {
      const driverValue = driverLine.forecast_months[monthKey] || 0
      forecast[monthKey] = driverValue * percentage
    })

    return forecast
  }

  /**
   * Batch recalculate all forecasts for all lines
   * @param baselineMonthKeys - Baseline period months (e.g., FY25) for analysis calculations
   * @param actualMonthKeys - All actual months (baseline + current YTD) for forecasting methods that need them
   */
  static recalculateAllForecasts(
    lines: PLLine[],
    baselineMonthKeys: string[],
    forecastMonthKeys: string[],
    actualMonthKeys?: string[] // Optional: if not provided, use baselineMonthKeys
  ): PLLine[] {
    // First pass: calculate analysis for all lines using ONLY baseline months
    const linesWithAnalysis = lines.map(line => ({
      ...line,
      analysis: this.calculateAnalysis(line, lines, baselineMonthKeys)
    }))

    // Second pass: apply forecasting methods
    // We need multiple passes for driver-based dependencies
    let updatedLines = [...linesWithAnalysis]
    const maxIterations = 5 // Prevent infinite loops

    // Use baseline months for forecasting methods unless actualMonthKeys is provided
    const monthsForForecasting = actualMonthKeys || baselineMonthKeys

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      updatedLines = updatedLines.map(line => {
        const forecastMonths = this.applyForecastMethod(
          line,
          updatedLines,
          forecastMonthKeys,
          monthsForForecasting
        )

        return {
          ...line,
          forecast_months: forecastMonths
        }
      })
    }

    return updatedLines
  }
}
