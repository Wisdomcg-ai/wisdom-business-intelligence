import type { PLLine } from '../types'

export interface GoalValidationResult {
  isValid: boolean
  warnings: ValidationWarning[]
  suggestions: GoalSuggestion[]
  scenarios: RealisticScenario[]
}

export interface ValidationWarning {
  type: 'revenue' | 'opex' | 'cogs' | 'net_profit'
  message: string
  severity: 'error' | 'warning'
  details?: {
    ytd?: number
    goal?: number
    difference?: number
  }
}

export interface GoalSuggestion {
  title: string
  description: string
  adjustments: {
    revenueGoal?: number
    netProfitGoal?: number
    grossProfitGoal?: number
    opexBudget?: number
  }
}

export interface RealisticScenario {
  name: string
  description: string
  revenue: number
  grossProfit: number
  opex: number
  netProfit: number
  isAchievable: boolean
}

interface GoalValidatorParams {
  revenueGoal: number
  grossProfitGoal: number
  netProfitGoal: number
  plLines: PLLine[]
  currentYearMonthKeys: string[]
  forecastMonthKeys: string[]
}

export class GoalValidator {
  /**
   * Validate goals against YTD actuals and return warnings/suggestions
   */
  static validateGoals(params: GoalValidatorParams): GoalValidationResult {
    const {
      revenueGoal,
      grossProfitGoal,
      netProfitGoal,
      plLines,
      currentYearMonthKeys,
      forecastMonthKeys
    } = params

    const warnings: ValidationWarning[] = []
    const suggestions: GoalSuggestion[] = []

    // Calculate YTD actuals
    const ytdRevenue = this.calculateYTDRevenue(plLines, currentYearMonthKeys)
    const ytdCOGS = this.calculateYTDCOGS(plLines, currentYearMonthKeys)
    const ytdGrossProfit = ytdRevenue - ytdCOGS
    const ytdOpEx = this.calculateYTDOpEx(plLines, currentYearMonthKeys)
    const ytdNetProfit = ytdGrossProfit - ytdOpEx

    // Derived values from goals
    const impliedCOGS = revenueGoal - grossProfitGoal
    const impliedOpEx = grossProfitGoal - netProfitGoal
    const cogsPercentage = impliedCOGS / revenueGoal

    // 1. Check Revenue Goal
    if (ytdRevenue > revenueGoal) {
      warnings.push({
        type: 'revenue',
        message: `YTD Revenue ($${ytdRevenue.toLocaleString()}) already exceeds your annual goal ($${revenueGoal.toLocaleString()})`,
        severity: 'error',
        details: {
          ytd: ytdRevenue,
          goal: revenueGoal,
          difference: ytdRevenue - revenueGoal
        }
      })
    }

    const remainingRevenue = revenueGoal - ytdRevenue
    if (remainingRevenue < 0) {
      suggestions.push({
        title: 'Increase Revenue Goal',
        description: 'Your YTD revenue has already exceeded your goal. Consider setting a higher target.',
        adjustments: {
          revenueGoal: Math.ceil(ytdRevenue * 1.1) // 10% buffer
        }
      })
    }

    // 2. Check OpEx Budget
    const remainingOpEx = impliedOpEx - ytdOpEx

    if (remainingOpEx < 0) {
      warnings.push({
        type: 'opex',
        message: `YTD OpEx ($${ytdOpEx.toLocaleString()}) exceeds your implied budget ($${impliedOpEx.toLocaleString()})`,
        severity: 'error',
        details: {
          ytd: ytdOpEx,
          goal: impliedOpEx,
          difference: Math.abs(remainingOpEx)
        }
      })

      // Project OpEx based on current run rate
      const monthsElapsed = currentYearMonthKeys.length
      const monthsRemaining = forecastMonthKeys.length
      const avgMonthlyOpEx = ytdOpEx / monthsElapsed
      const projectedTotalOpEx = ytdOpEx + (avgMonthlyOpEx * monthsRemaining)
      const realisticNetProfit = grossProfitGoal - projectedTotalOpEx

      suggestions.push({
        title: 'Adjust to YTD Trajectory',
        description: `Based on your current OpEx spending rate ($${avgMonthlyOpEx.toLocaleString()}/month), a realistic Net Profit would be $${realisticNetProfit.toLocaleString()}`,
        adjustments: {
          netProfitGoal: Math.floor(realisticNetProfit)
        }
      })

      // Also suggest aggressive cost-cutting
      const aggressiveOpExCut = avgMonthlyOpEx * 0.7 // 30% reduction
      const aggressiveProjectedOpEx = ytdOpEx + (aggressiveOpExCut * monthsRemaining)
      const aggressiveNetProfit = grossProfitGoal - aggressiveProjectedOpEx

      suggestions.push({
        title: 'Aggressive Cost Cutting',
        description: `Reduce monthly OpEx by 30% for remaining months to achieve $${aggressiveNetProfit.toLocaleString()} Net Profit`,
        adjustments: {
          netProfitGoal: Math.floor(aggressiveNetProfit)
        }
      })
    }

    // 3. Check mathematical consistency
    const calculatedGP = revenueGoal - impliedCOGS
    if (Math.abs(calculatedGP - grossProfitGoal) > 1) {
      warnings.push({
        type: 'cogs',
        message: 'Revenue and Gross Profit goals are inconsistent with COGS percentage',
        severity: 'warning'
      })
    }

    const calculatedNP = grossProfitGoal - impliedOpEx
    if (Math.abs(calculatedNP - netProfitGoal) > 1) {
      warnings.push({
        type: 'net_profit',
        message: 'Gross Profit and Net Profit goals are inconsistent with OpEx budget',
        severity: 'warning'
      })
    }

    // 4. Generate realistic scenarios
    const scenarios = this.generateScenarios({
      revenueGoal,
      grossProfitGoal,
      netProfitGoal,
      ytdRevenue,
      ytdCOGS,
      ytdOpEx,
      cogsPercentage,
      monthsElapsed: currentYearMonthKeys.length,
      monthsRemaining: forecastMonthKeys.length
    })

    const isValid = warnings.filter(w => w.severity === 'error').length === 0

    return {
      isValid,
      warnings,
      suggestions,
      scenarios
    }
  }

  private static calculateYTDRevenue(plLines: PLLine[], monthKeys: string[]): number {
    return plLines
      .filter(l => l.category === 'Revenue')
      .reduce((sum, line) => {
        return sum + monthKeys.reduce((monthSum, key) => {
          return monthSum + (line.actual_months?.[key] || 0)
        }, 0)
      }, 0)
  }

  private static calculateYTDCOGS(plLines: PLLine[], monthKeys: string[]): number {
    return plLines
      .filter(l => l.category === 'Cost of Sales')
      .reduce((sum, line) => {
        return sum + monthKeys.reduce((monthSum, key) => {
          return monthSum + (line.actual_months?.[key] || 0)
        }, 0)
      }, 0)
  }

  private static calculateYTDOpEx(plLines: PLLine[], monthKeys: string[]): number {
    return plLines
      .filter(l => l.category === 'Operating Expenses')
      .reduce((sum, line) => {
        return sum + monthKeys.reduce((monthSum, key) => {
          return monthSum + (line.actual_months?.[key] || 0)
        }, 0)
      }, 0)
  }

  private static generateScenarios(params: {
    revenueGoal: number
    grossProfitGoal: number
    netProfitGoal: number
    ytdRevenue: number
    ytdCOGS: number
    ytdOpEx: number
    cogsPercentage: number
    monthsElapsed: number
    monthsRemaining: number
  }): RealisticScenario[] {
    const {
      revenueGoal,
      grossProfitGoal,
      netProfitGoal,
      ytdRevenue,
      ytdCOGS,
      ytdOpEx,
      cogsPercentage,
      monthsElapsed,
      monthsRemaining
    } = params

    const avgMonthlyOpEx = ytdOpEx / monthsElapsed

    // Scenario 1: Current Goals (as entered)
    const impliedOpEx = grossProfitGoal - netProfitGoal
    const remainingOpEx = impliedOpEx - ytdOpEx

    const scenario1: RealisticScenario = {
      name: 'Current Goals',
      description: 'Your entered goals',
      revenue: revenueGoal,
      grossProfit: grossProfitGoal,
      opex: impliedOpEx,
      netProfit: netProfitGoal,
      isAchievable: remainingOpEx >= 0
    }

    // Scenario 2: YTD Trajectory (if trends continue)
    const projectedRevenue = revenueGoal // Keep revenue goal
    const projectedCOGS = projectedRevenue * cogsPercentage
    const projectedGP = projectedRevenue - projectedCOGS
    const projectedTotalOpEx = ytdOpEx + (avgMonthlyOpEx * monthsRemaining)
    const projectedNP = projectedGP - projectedTotalOpEx

    const scenario2: RealisticScenario = {
      name: 'YTD Trajectory',
      description: 'If current spending trends continue',
      revenue: projectedRevenue,
      grossProfit: projectedGP,
      opex: projectedTotalOpEx,
      netProfit: projectedNP,
      isAchievable: true
    }

    // Scenario 3: Aggressive (30% OpEx cut)
    const aggressiveMonthlyOpEx = avgMonthlyOpEx * 0.7
    const aggressiveTotalOpEx = ytdOpEx + (aggressiveMonthlyOpEx * monthsRemaining)
    const aggressiveNP = projectedGP - aggressiveTotalOpEx

    const scenario3: RealisticScenario = {
      name: 'Aggressive',
      description: '30% OpEx reduction for remaining months',
      revenue: projectedRevenue,
      grossProfit: projectedGP,
      opex: aggressiveTotalOpEx,
      netProfit: aggressiveNP,
      isAchievable: true
    }

    return [scenario1, scenario2, scenario3]
  }
}
