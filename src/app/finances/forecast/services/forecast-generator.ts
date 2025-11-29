import type { FinancialForecast, PLLine, DistributionMethod } from '../types'

interface GenerateForecastParams {
  forecast: FinancialForecast
  revenueGoal: number
  cogsPercentage: number
  opexBudget: number
  distributionMethod: DistributionMethod
  existingLines: PLLine[]
}

interface GeneratedForecast {
  lines: PLLine[]
}

export class ForecastGenerator {
  /**
   * Get baseline month keys from forecast (e.g., FY25: Jul 24 - Jun 25)
   */
  private static getBaselineMonthKeys(forecast: FinancialForecast): string[] {
    if (!forecast.baseline_start_month || !forecast.baseline_end_month) {
      return []
    }
    return this.generateMonthKeys(forecast.baseline_start_month, forecast.baseline_end_month)
  }

  /**
   * Get current year YTD month keys (e.g., FY26 YTD: Jul 25 - Oct 25)
   * These are the months between baseline end and forecast start
   */
  private static getCurrentYearMonthKeys(forecast: FinancialForecast): string[] {
    if (!forecast.baseline_end_month || !forecast.forecast_start_month) {
      return []
    }

    // Parse baseline_end_month (e.g., "2025-06")
    const [baselineYear, baselineMonth] = forecast.baseline_end_month.split('-').map(Number)

    // Current year starts one month after baseline ends
    let startYear = baselineYear
    let startMonth = baselineMonth + 1
    if (startMonth > 12) {
      startMonth = 1
      startYear++
    }

    // Parse forecast_start_month (e.g., "2025-11")
    const [forecastYear, forecastMonth] = forecast.forecast_start_month.split('-').map(Number)

    // Current year ends one month before forecast starts
    let endYear = forecastYear
    let endMonth = forecastMonth - 1
    if (endMonth < 1) {
      endMonth = 12
      endYear--
    }

    // If no months between baseline and forecast, return empty array
    if (startYear > endYear || (startYear === endYear && startMonth > endMonth)) {
      return []
    }

    const startMonthStr = `${startYear}-${String(startMonth).padStart(2, '0')}`
    const endMonthStr = `${endYear}-${String(endMonth).padStart(2, '0')}`

    return this.generateMonthKeys(startMonthStr, endMonthStr)
  }

  /**
   * Generate forecast P&L lines from assumptions
   */
  static async generateForecast(params: GenerateForecastParams): Promise<GeneratedForecast> {
    const {
      forecast,
      revenueGoal,
      cogsPercentage,
      opexBudget,
      distributionMethod,
      existingLines
    } = params

    console.log('[ForecastGenerator] Generating forecast with params:', {
      revenueGoal,
      cogsPercentage,
      opexBudget,
      distributionMethod,
      existingLinesCount: existingLines.length,
      opexLinesCount: existingLines.filter(l => l.category === 'Operating Expenses').length
    })

    console.log('[ForecastGenerator] Forecast object:', {
      forecast_start_month: forecast.forecast_start_month,
      forecast_end_month: forecast.forecast_end_month,
      baseline_start_month: forecast.baseline_start_month,
      baseline_end_month: forecast.baseline_end_month
    })

    // Get baseline month keys (FY25) for pattern calculations
    const baselineMonthKeys = this.getBaselineMonthKeys(forecast)
    console.log('[ForecastGenerator] Using baseline months for patterns:', baselineMonthKeys)

    // Generate month keys for forecast period
    const forecastMonthKeys = this.generateMonthKeys(
      forecast.forecast_start_month,
      forecast.forecast_end_month
    )
    console.log('[ForecastGenerator] Forecast period:', {
      start: forecast.forecast_start_month,
      end: forecast.forecast_end_month,
      monthKeys: forecastMonthKeys,
      count: forecastMonthKeys.length
    })

    // Get current year months (FY26 YTD) - these are months between baseline end and forecast start
    const currentYearMonthKeys = this.getCurrentYearMonthKeys(forecast)
    console.log('[ForecastGenerator] Current year YTD months:', currentYearMonthKeys)

    // 1. Distribute revenue to individual revenue lines based on FY25 patterns
    const linesWithRevenue = this.distributeRevenueToLines(
      revenueGoal,
      existingLines,
      forecastMonthKeys,
      distributionMethod,
      baselineMonthKeys,
      currentYearMonthKeys
    )

    // 2. Distribute OpEx across individual lines based on FY25 patterns
    const linesWithOpEx = this.distributeOpExToLines(
      opexBudget,
      linesWithRevenue,
      forecastMonthKeys,
      baselineMonthKeys,
      currentYearMonthKeys
    )

    // 3. Create/update P&L lines with COGS and summary lines
    const updatedLines = this.applyForecastToLines(
      linesWithOpEx,
      forecastMonthKeys,
      cogsPercentage,
      currentYearMonthKeys,
      revenueGoal
    )

    return { lines: updatedLines }
  }

  /**
   * Generate array of month keys (YYYY-MM format)
   */
  private static generateMonthKeys(startMonth: string, endMonth: string): string[] {
    const months: string[] = []

    // Parse the year and month from YYYY-MM format
    const [startYear, startMonthNum] = startMonth.split('-').map(Number)
    const [endYear, endMonthNum] = endMonth.split('-').map(Number)

    let currentYear = startYear
    let currentMonth = startMonthNum

    // Generate months until we reach the end month
    while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonthNum)) {
      const monthStr = String(currentMonth).padStart(2, '0')
      months.push(`${currentYear}-${monthStr}`)

      // Move to next month
      currentMonth++
      if (currentMonth > 12) {
        currentMonth = 1
        currentYear++
      }
    }

    return months
  }

  /**
   * Distribute revenue goal across months based on method
   */
  private static distributeRevenue(
    revenueGoal: number,
    monthKeys: string[],
    method: DistributionMethod,
    existingLines: PLLine[],
    baselineMonthKeys: string[]
  ): { [key: string]: number } {
    const monthCount = monthKeys.length

    switch (method) {
      case 'even': {
        // Equal amount each month
        const monthlyAmount = revenueGoal / monthCount
        return monthKeys.reduce((acc, key) => {
          acc[key] = monthlyAmount
          return acc
        }, {} as { [key: string]: number })
      }

      case 'seasonal_pattern': {
        // Use FY25 actual pattern, scaled to goal
        const revenueLines = existingLines.filter(l => l.category === 'Revenue')
        const actualPattern = this.calculateSeasonalPattern(revenueLines, monthKeys, baselineMonthKeys)

        if (actualPattern.total > 0) {
          // Scale pattern to match goal
          const scaleFactor = revenueGoal / actualPattern.total
          return monthKeys.reduce((acc, key) => {
            acc[key] = (actualPattern.distribution[key] || 0) * scaleFactor
            return acc
          }, {} as { [key: string]: number })
        }

        // Fallback to even split if no historical data
        const monthlyAmount = revenueGoal / monthCount
        return monthKeys.reduce((acc, key) => {
          acc[key] = monthlyAmount
          return acc
        }, {} as { [key: string]: number })
      }

      case 'custom': {
        // User will set custom values in the P&L table
        // For now, default to even split as placeholder
        const monthlyAmount = revenueGoal / monthCount
        return monthKeys.reduce((acc, key) => {
          acc[key] = monthlyAmount
          return acc
        }, {} as { [key: string]: number })
      }

      default: {
        const monthlyAmount = revenueGoal / monthCount
        return monthKeys.reduce((acc, key) => {
          acc[key] = monthlyAmount
          return acc
        }, {} as { [key: string]: number })
      }
    }
  }

  /**
   * Calculate seasonal pattern from FY25 actuals
   * IMPORTANT: Only use BASELINE months (FY25), not current year actuals (FY26 YTD)
   */
  private static calculateSeasonalPattern(
    revenueLines: PLLine[],
    targetMonthKeys: string[],
    baselineMonthKeys: string[]
  ): { distribution: { [key: string]: number }, total: number } {
    // Sum up all revenue line actuals per month - ONLY for baseline months
    const monthlyTotals: { [key: string]: number } = {}

    revenueLines.forEach(line => {
      if (line.actual_months) {
        // Only include baseline months in the pattern calculation
        baselineMonthKeys.forEach(month => {
          if (line.actual_months[month]) {
            monthlyTotals[month] = (monthlyTotals[month] || 0) + line.actual_months[month]
          }
        })
      }
    })

    // Map historical months to target forecast months
    // For simplicity, use the same month pattern (e.g., Nov FY25 → Nov FY26)
    const distribution: { [key: string]: number } = {}
    let total = 0

    targetMonthKeys.forEach(targetMonth => {
      // Get the month number (e.g., "2025-11" → "11")
      const monthNum = targetMonth.split('-')[1]

      // Find corresponding historical month with same month number
      const historicalMonth = Object.keys(monthlyTotals).find(m => m.endsWith(`-${monthNum}`))

      if (historicalMonth) {
        distribution[targetMonth] = monthlyTotals[historicalMonth]
        total += monthlyTotals[historicalMonth]
      } else {
        distribution[targetMonth] = 0
      }
    })

    return { distribution, total }
  }

  /**
   * Calculate COGS for each month based on revenue
   */
  private static calculateCOGS(
    revenueDistribution: { [key: string]: number },
    cogsPercentage: number
  ): { [key: string]: number } {
    const cogs: { [key: string]: number } = {}

    Object.entries(revenueDistribution).forEach(([month, revenue]) => {
      cogs[month] = revenue * cogsPercentage
    })

    return cogs
  }

  /**
   * Distribute revenue budget across individual revenue lines based on FY25 actuals
   * This is the CFO best practice: use historical patterns to forecast
   * IMPORTANT: Revenue goal represents the ANNUAL goal for FY26.
   * We need to subtract FY26 YTD actuals from the goal before distributing to forecast months.
   */
  private static distributeRevenueToLines(
    revenueGoal: number,
    existingLines: PLLine[],
    monthKeys: string[],
    distributionMethod: DistributionMethod,
    baselineMonthKeys: string[],
    currentYearMonthKeys: string[]
  ): PLLine[] {
    if (revenueGoal === 0) {
      console.log('[ForecastGenerator] Revenue goal is 0, skipping distribution')
      return existingLines
    }

    // Get all Revenue lines (excluding the summary line)
    const revenueLines = existingLines.filter(l =>
      l.category === 'Revenue' &&
      l.account_name !== 'Total Revenue'
    )

    if (revenueLines.length === 0) {
      console.log('[ForecastGenerator] No revenue detail lines found, creating default line')
      // Create a default "Sales" line if none exist
      const defaultRevenueLine: PLLine = {
        account_name: 'Sales',
        category: 'Revenue',
        sort_order: 2,
        actual_months: {},
        forecast_months: {},
        is_manual: false,
        is_from_xero: false
      }
      existingLines.push(defaultRevenueLine)
      revenueLines.push(defaultRevenueLine)
    }

    // Calculate total FY26 YTD revenue from actuals (current year months)
    const ytdRevenue = revenueLines.reduce((sum, line) => {
      const lineYtd = currentYearMonthKeys.reduce((monthSum, monthKey) => {
        return monthSum + (line.actual_months?.[monthKey] || 0)
      }, 0)
      return sum + lineYtd
    }, 0)

    console.log('[ForecastGenerator] FY26 YTD Revenue:', ytdRevenue.toFixed(2))
    console.log('[ForecastGenerator] Annual Revenue Goal:', revenueGoal.toFixed(2))

    // Calculate remaining revenue needed to reach the goal
    const remainingRevenue = revenueGoal - ytdRevenue

    console.log('[ForecastGenerator] Remaining Revenue to Forecast:', remainingRevenue.toFixed(2))

    if (remainingRevenue <= 0) {
      console.log('[ForecastGenerator] YTD revenue meets or exceeds goal, setting forecast to zero')
      // YTD already meets/exceeds goal, set all forecast months to zero
      revenueLines.forEach(line => {
        line.forecast_months = monthKeys.reduce((acc, key) => {
          acc[key] = 0
          return acc
        }, {} as { [key: string]: number })
        line.is_manual = false
      })
      return existingLines
    }

    // Calculate total FY25 Revenue from actuals - ONLY baseline months
    const fy25RevenueTotals = revenueLines.map(line => {
      const total = baselineMonthKeys.reduce((sum, monthKey) => {
        return sum + (line.actual_months?.[monthKey] || 0)
      }, 0)
      return { line, total }
    })

    const totalFY25Revenue = fy25RevenueTotals.reduce((sum, item) => sum + item.total, 0)

    if (totalFY25Revenue === 0) {
      console.log('[ForecastGenerator] No FY25 revenue actuals found, using even distribution')
      // Fallback: distribute evenly across all revenue lines
      const budgetPerLine = remainingRevenue / revenueLines.length

      // Use distribution method for monthly pattern
      if (distributionMethod === 'even') {
        const monthlyAmount = budgetPerLine / monthKeys.length
        revenueLines.forEach(line => {
          line.forecast_months = monthKeys.reduce((acc, key) => {
            acc[key] = monthlyAmount
            return acc
          }, {} as { [key: string]: number })
          line.is_manual = false
        })
      } else {
        // Even distribution across lines, but seasonal pattern across months
        const monthlyAmount = budgetPerLine / monthKeys.length
        revenueLines.forEach(line => {
          line.forecast_months = monthKeys.reduce((acc, key) => {
            acc[key] = monthlyAmount
            return acc
          }, {} as { [key: string]: number })
          line.is_manual = false
        })
      }
      return existingLines
    }

    console.log('[ForecastGenerator] Distributing revenue across forecast months:', monthKeys)

    // Distribute remaining revenue (not full goal) to each line based on its % of FY25 total
    fy25RevenueTotals.forEach(({ line, total }) => {
      const percentageOfTotal = total / totalFY25Revenue
      const lineBudget = remainingRevenue * percentageOfTotal

      console.log(`[ForecastGenerator] ${line.account_name}: FY25=${total.toFixed(0)}, %=${(percentageOfTotal * 100).toFixed(1)}%, Remaining Budget=${lineBudget.toFixed(0)}`)

      // Use seasonal pattern from FY25 or distribution method
      if (distributionMethod === 'seasonal_pattern') {
        const seasonalDistribution = this.calculateSeasonalPattern([line], monthKeys, baselineMonthKeys)

        if (seasonalDistribution.total > 0) {
          // Scale the pattern to match the line's budget
          const scaleFactor = lineBudget / seasonalDistribution.total
          line.forecast_months = monthKeys.reduce((acc, key) => {
            acc[key] = (seasonalDistribution.distribution[key] || 0) * scaleFactor
            return acc
          }, {} as { [key: string]: number })
        } else {
          // No historical pattern, use even distribution
          const monthlyAmount = lineBudget / monthKeys.length
          line.forecast_months = monthKeys.reduce((acc, key) => {
            acc[key] = monthlyAmount
            return acc
          }, {} as { [key: string]: number })
        }
      } else {
        // Even distribution across months
        const monthlyAmount = lineBudget / monthKeys.length
        line.forecast_months = monthKeys.reduce((acc, key) => {
          acc[key] = monthlyAmount
          return acc
        }, {} as { [key: string]: number })
      }

      // Mark as not manual (generated from assumptions)
      line.is_manual = false
    })

    return existingLines
  }

  /**
   * Distribute OpEx budget across individual OpEx lines based on FY25 actuals
   * This is the CFO best practice: use historical patterns to forecast
   * IMPORTANT: OpEx budget represents the ANNUAL budget for FY26.
   * We need to subtract FY26 YTD actuals from the budget before distributing to forecast months.
   */
  private static distributeOpExToLines(
    opexBudget: number,
    existingLines: PLLine[],
    monthKeys: string[],
    baselineMonthKeys: string[],
    currentYearMonthKeys: string[]
  ): PLLine[] {
    if (opexBudget === 0) {
      console.log('[ForecastGenerator] OpEx budget is 0, skipping distribution')
      return existingLines
    }

    // Get all Operating Expense lines (excluding the summary line)
    const opexLines = existingLines.filter(l =>
      l.category === 'Operating Expenses' &&
      l.account_name !== 'Total Operating Expenses'
    )

    if (opexLines.length === 0) {
      console.log('[ForecastGenerator] No OpEx detail lines found')
      return existingLines
    }

    // Calculate total FY26 YTD OpEx from actuals (current year months)
    const ytdOpEx = opexLines.reduce((sum, line) => {
      const lineYtd = currentYearMonthKeys.reduce((monthSum, monthKey) => {
        return monthSum + (line.actual_months?.[monthKey] || 0)
      }, 0)
      return sum + lineYtd
    }, 0)

    console.log('[ForecastGenerator] FY26 YTD OpEx:', ytdOpEx.toFixed(2))
    console.log('[ForecastGenerator] Annual OpEx Budget:', opexBudget.toFixed(2))

    // Calculate remaining OpEx budget needed
    const remainingOpEx = opexBudget - ytdOpEx

    console.log('[ForecastGenerator] Remaining OpEx to Forecast:', remainingOpEx.toFixed(2))

    if (remainingOpEx <= 0) {
      console.log('[ForecastGenerator] YTD OpEx meets or exceeds budget, setting forecast to zero')
      // YTD already meets/exceeds budget, set all forecast months to zero
      opexLines.forEach(line => {
        line.forecast_months = monthKeys.reduce((acc, key) => {
          acc[key] = 0
          return acc
        }, {} as { [key: string]: number })
        line.is_manual = false
      })
      return existingLines
    }

    // Calculate total FY25 OpEx from actuals - ONLY baseline months
    const fy25OpexTotals = opexLines.map(line => {
      const total = baselineMonthKeys.reduce((sum, monthKey) => {
        return sum + (line.actual_months?.[monthKey] || 0)
      }, 0)
      return { line, total }
    })

    const totalFY25OpEx = fy25OpexTotals.reduce((sum, item) => sum + item.total, 0)

    if (totalFY25OpEx === 0) {
      console.log('[ForecastGenerator] No FY25 OpEx actuals found, using even distribution')
      // Fallback: distribute evenly across all OpEx lines
      const budgetPerLine = remainingOpEx / opexLines.length
      const monthlyAmount = budgetPerLine / monthKeys.length

      opexLines.forEach(line => {
        line.forecast_months = monthKeys.reduce((acc, key) => {
          acc[key] = monthlyAmount
          return acc
        }, {} as { [key: string]: number })
        line.is_manual = false
      })
      return existingLines
    }

    // Distribute remaining budget (not full budget) to each line based on its % of FY25 total
    fy25OpexTotals.forEach(({ line, total }) => {
      const percentageOfTotal = total / totalFY25OpEx
      const lineBudget = remainingOpEx * percentageOfTotal

      console.log(`[ForecastGenerator] ${line.account_name}: FY25=${total.toFixed(0)}, %=${(percentageOfTotal * 100).toFixed(1)}%, Remaining Budget=${lineBudget.toFixed(0)}`)

      // Use seasonal pattern from FY25 to distribute across months
      const seasonalDistribution = this.calculateSeasonalPattern([line], monthKeys, baselineMonthKeys)

      if (seasonalDistribution.total > 0) {
        // Scale the pattern to match the line's budget
        const scaleFactor = lineBudget / seasonalDistribution.total
        line.forecast_months = monthKeys.reduce((acc, key) => {
          acc[key] = (seasonalDistribution.distribution[key] || 0) * scaleFactor
          return acc
        }, {} as { [key: string]: number })
      } else {
        // No historical pattern, use even distribution
        const monthlyAmount = lineBudget / monthKeys.length
        line.forecast_months = monthKeys.reduce((acc, key) => {
          acc[key] = monthlyAmount
          return acc
        }, {} as { [key: string]: number })
      }

      // Mark as not manual (generated from assumptions)
      line.is_manual = false
    })

    return existingLines
  }

  /**
   * Apply forecast values to existing P&L lines (COGS only)
   * Revenue and OpEx are already distributed to individual lines
   * IMPORTANT: COGS percentage should be based on ANNUAL revenue goal, not just forecast revenue.
   * We need to calculate: (Annual Goal × COGS%) - YTD COGS = Remaining COGS to forecast
   */
  private static applyForecastToLines(
    existingLines: PLLine[],
    forecastMonthKeys: string[],
    cogsPercentage: number,
    currentYearMonthKeys: string[],
    revenueGoal: number
  ): PLLine[] {
    const updatedLines = [...existingLines]

    // Remove any summary lines (we only want detail lines from chart of accounts)
    const filteredLines = updatedLines.filter(l =>
      l.account_name !== 'Total Revenue' &&
      l.account_name !== 'Total Cost of Sales' &&
      l.account_name !== 'Total Operating Expenses'
    )

    // Calculate total COGS based on annual revenue goal
    const annualCOGS = revenueGoal * cogsPercentage

    // Calculate YTD COGS from existing actuals
    const cogsLine = this.findOrCreateSummaryLine(
      filteredLines,
      'Cost of Sales',
      'Cost of Goods Sold',
      100
    )

    const ytdCOGS = currentYearMonthKeys.reduce((sum, monthKey) => {
      return sum + (cogsLine.actual_months?.[monthKey] || 0)
    }, 0)

    console.log('[ForecastGenerator] Annual COGS (based on goal):', annualCOGS.toFixed(2))
    console.log('[ForecastGenerator] FY26 YTD COGS:', ytdCOGS.toFixed(2))

    // Calculate remaining COGS to forecast
    const remainingCOGS = annualCOGS - ytdCOGS

    console.log('[ForecastGenerator] Remaining COGS to Forecast:', remainingCOGS.toFixed(2))

    if (remainingCOGS <= 0) {
      console.log('[ForecastGenerator] YTD COGS meets or exceeds annual target, setting forecast to zero')
      cogsLine.forecast_months = forecastMonthKeys.reduce((acc, key) => {
        acc[key] = 0
        return acc
      }, {} as { [key: string]: number })
    } else {
      // Distribute remaining COGS across forecast months based on revenue pattern
      const revenueLines = filteredLines.filter(l => l.category === 'Revenue')

      // Calculate total forecast revenue
      const totalForecastRevenue = forecastMonthKeys.reduce((sum, monthKey) => {
        return sum + revenueLines.reduce((lineSum, line) => {
          return lineSum + (line.forecast_months?.[monthKey] || 0)
        }, 0)
      }, 0)

      // Distribute remaining COGS proportionally to forecast revenue
      cogsLine.forecast_months = forecastMonthKeys.reduce((acc, monthKey) => {
        const monthRevenue = revenueLines.reduce((sum, line) => {
          return sum + (line.forecast_months?.[monthKey] || 0)
        }, 0)

        if (totalForecastRevenue > 0) {
          acc[monthKey] = (monthRevenue / totalForecastRevenue) * remainingCOGS
        } else {
          acc[monthKey] = 0
        }
        return acc
      }, {} as { [key: string]: number })
    }

    cogsLine.is_manual = false

    return filteredLines
  }

  /**
   * Find existing line or create new summary line
   * Note: This ensures we only have ONE summary line per category
   */
  private static findOrCreateSummaryLine(
    lines: PLLine[],
    category: string,
    accountName: string,
    sortOrder: number
  ): PLLine {
    // Find ALL matching lines (in case there are duplicates)
    const matchingLines = lines.filter(l =>
      l.category === category &&
      l.account_name === accountName
    )

    if (matchingLines.length > 1) {
      // If duplicates exist, remove all but the first one
      console.warn(`[ForecastGenerator] Found ${matchingLines.length} duplicate "${accountName}" lines, removing duplicates`)
      const lineToKeep = matchingLines[0]
      const linesToRemove = matchingLines.slice(1)

      // Remove duplicates from the array
      linesToRemove.forEach(dupLine => {
        const index = lines.indexOf(dupLine)
        if (index > -1) {
          lines.splice(index, 1)
        }
      })

      return lineToKeep
    } else if (matchingLines.length === 1) {
      return matchingLines[0]
    }

    // No matching line found, create a new one
    const newLine: PLLine = {
      account_name: accountName,
      category,
      sort_order: sortOrder,
      actual_months: {},
      forecast_months: {},
      is_manual: false,
      is_from_xero: false
    }
    lines.push(newLine)
    return newLine
  }
}
