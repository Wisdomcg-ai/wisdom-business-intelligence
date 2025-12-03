// Prior Year Analysis Service
// Calculates insights and patterns from historical P&L data

import type { PLLine } from '../../types'
import type { PriorYearAnalysis } from './types'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Calculate comprehensive prior year analysis from P&L lines
 */
export function calculatePriorYearAnalysis(
  plLines: PLLine[],
  baselineMonthKeys: string[]
): PriorYearAnalysis | null {
  if (!plLines.length || !baselineMonthKeys.length) {
    return null
  }

  // ========== REVENUE ANALYSIS ==========
  const revenueLines = plLines.filter(l =>
    l.category === 'Revenue' &&
    l.account_name !== 'Total Revenue'
  )

  // Calculate total revenue
  const totalRevenue = revenueLines.reduce((sum, line) => {
    return sum + baselineMonthKeys.reduce((monthSum, monthKey) => {
      return monthSum + (line.actual_months?.[monthKey] || 0)
    }, 0)
  }, 0)

  // Revenue by category (individual revenue lines)
  const revenueByCategory = revenueLines.map(line => {
    const amount = baselineMonthKeys.reduce((sum, monthKey) => {
      return sum + (line.actual_months?.[monthKey] || 0)
    }, 0)
    return {
      name: line.account_name,
      amount,
      percentage: totalRevenue > 0 ? (amount / totalRevenue) * 100 : 0
    }
  }).filter(cat => cat.amount > 0).sort((a, b) => b.amount - a.amount)

  // Monthly revenue pattern
  const monthlyRevenuePattern = baselineMonthKeys.map(monthKey => {
    const amount = revenueLines.reduce((sum, line) => {
      return sum + (line.actual_months?.[monthKey] || 0)
    }, 0)
    return { month: monthKey, amount }
  })

  const averageMonthlyRevenue = totalRevenue / baselineMonthKeys.length

  // Add percentOfAvg to pattern
  const monthlyRevenuePatternWithPct = monthlyRevenuePattern.map(m => ({
    ...m,
    percentOfAvg: averageMonthlyRevenue > 0 ? (m.amount / averageMonthlyRevenue) * 100 : 100
  }))

  // Find peak and low months
  const sortedByAmount = [...monthlyRevenuePatternWithPct].sort((a, b) => b.amount - a.amount)
  const peakMonth = sortedByAmount[0]
  const lowMonth = sortedByAmount[sortedByAmount.length - 1]

  // Calculate seasonality score (0-100)
  // Higher score = more seasonal variation
  const seasonalityScore = calculateSeasonalityScore(monthlyRevenuePattern.map(m => m.amount))

  // ========== COGS ANALYSIS ==========
  const cogsLines = plLines.filter(l =>
    l.category === 'Cost of Sales' &&
    l.account_name !== 'Total Cost of Sales'
  )

  const totalCOGS = cogsLines.reduce((sum, line) => {
    return sum + baselineMonthKeys.reduce((monthSum, monthKey) => {
      return monthSum + (line.actual_months?.[monthKey] || 0)
    }, 0)
  }, 0)

  const cogsPercentage = totalRevenue > 0 ? (totalCOGS / totalRevenue) * 100 : 0

  const cogsByCategory = cogsLines.map(line => {
    const amount = baselineMonthKeys.reduce((sum, monthKey) => {
      return sum + (line.actual_months?.[monthKey] || 0)
    }, 0)
    return {
      name: line.account_name,
      amount,
      percentage: totalCOGS > 0 ? (amount / totalCOGS) * 100 : 0
    }
  }).filter(cat => cat.amount > 0).sort((a, b) => b.amount - a.amount)

  // ========== OPEX ANALYSIS ==========
  const opexLines = plLines.filter(l =>
    l.category === 'Operating Expenses' &&
    l.account_name !== 'Total Operating Expenses'
  )

  const totalOpEx = opexLines.reduce((sum, line) => {
    return sum + baselineMonthKeys.reduce((monthSum, monthKey) => {
      return monthSum + (line.actual_months?.[monthKey] || 0)
    }, 0)
  }, 0)

  const opexPercentage = totalRevenue > 0 ? (totalOpEx / totalRevenue) * 100 : 0

  const opexByCategory = opexLines.map(line => {
    const amount = baselineMonthKeys.reduce((sum, monthKey) => {
      return sum + (line.actual_months?.[monthKey] || 0)
    }, 0)

    // Calculate trend for this expense
    const trend = calculateTrend(line.actual_months || {}, baselineMonthKeys)

    return {
      name: line.account_name,
      amount,
      percentage: totalOpEx > 0 ? (amount / totalOpEx) * 100 : 0,
      trend
    }
  }).filter(cat => cat.amount > 0).sort((a, b) => b.amount - a.amount)

  // ========== PROFITABILITY ==========
  const grossProfit = totalRevenue - totalCOGS
  const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0
  const netProfit = grossProfit - totalOpEx
  const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0

  // ========== TRENDS ==========
  // Calculate average monthly growth
  const avgMonthlyGrowth = calculateAverageMonthlyGrowth(monthlyRevenuePattern.map(m => m.amount))

  return {
    totalRevenue,
    revenueByCategory,
    monthlyRevenuePattern: monthlyRevenuePatternWithPct,
    averageMonthlyRevenue,
    peakMonth: {
      month: formatMonthLabel(peakMonth.month),
      amount: peakMonth.amount
    },
    lowMonth: {
      month: formatMonthLabel(lowMonth.month),
      amount: lowMonth.amount
    },
    seasonalityScore,
    totalCOGS,
    cogsPercentage,
    cogsByCategory,
    totalOpEx,
    opexPercentage,
    opexByCategory,
    grossProfit,
    grossMargin,
    netProfit,
    netMargin,
    avgMonthlyGrowth
  }
}

/**
 * Calculate seasonality score (0-100)
 * Uses coefficient of variation (standard deviation / mean)
 */
function calculateSeasonalityScore(monthlyAmounts: number[]): number {
  if (monthlyAmounts.length === 0) return 0

  const mean = monthlyAmounts.reduce((sum, val) => sum + val, 0) / monthlyAmounts.length
  if (mean === 0) return 0

  const variance = monthlyAmounts.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / monthlyAmounts.length
  const stdDev = Math.sqrt(variance)

  // Coefficient of variation as percentage
  const cv = (stdDev / mean) * 100

  // Normalize to 0-100 scale (cap at 50% CV = 100 score)
  return Math.min(100, cv * 2)
}

/**
 * Calculate trend direction for an expense line
 */
function calculateTrend(
  actualMonths: Record<string, number>,
  monthKeys: string[]
): 'up' | 'down' | 'stable' {
  if (monthKeys.length < 4) return 'stable'

  const midpoint = Math.floor(monthKeys.length / 2)
  const firstHalf = monthKeys.slice(0, midpoint)
  const secondHalf = monthKeys.slice(midpoint)

  const firstHalfAvg = firstHalf.reduce((sum, key) =>
    sum + (actualMonths[key] || 0), 0) / firstHalf.length
  const secondHalfAvg = secondHalf.reduce((sum, key) =>
    sum + (actualMonths[key] || 0), 0) / secondHalf.length

  if (firstHalfAvg === 0) return 'stable'

  const change = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100

  if (change > 10) return 'up'
  if (change < -10) return 'down'
  return 'stable'
}

/**
 * Calculate average month-over-month growth rate
 */
function calculateAverageMonthlyGrowth(monthlyAmounts: number[]): number {
  if (monthlyAmounts.length < 2) return 0

  const growthRates: number[] = []
  for (let i = 1; i < monthlyAmounts.length; i++) {
    const prev = monthlyAmounts[i - 1]
    const curr = monthlyAmounts[i]
    if (prev > 0) {
      growthRates.push(((curr - prev) / prev) * 100)
    }
  }

  if (growthRates.length === 0) return 0

  return growthRates.reduce((sum, rate) => sum + rate, 0) / growthRates.length
}

/**
 * Format month key (YYYY-MM) to display label
 */
function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number)
  const monthIndex = month - 1
  const yearShort = year.toString().slice(-2)
  return `${MONTH_NAMES[monthIndex]} ${yearShort}`
}

/**
 * Generate insights and coaching tips from the analysis
 */
export function generateInsights(analysis: PriorYearAnalysis): string[] {
  const insights: string[] = []

  // Revenue insights
  if (analysis.seasonalityScore > 50) {
    insights.push(
      `📊 Your business shows strong seasonality (score: ${analysis.seasonalityScore.toFixed(0)}%). ` +
      `Peak month is ${analysis.peakMonth.month}, consider building cash reserves during peak periods.`
    )
  } else if (analysis.seasonalityScore < 20) {
    insights.push(
      `📊 Your revenue is relatively stable month-to-month (seasonality score: ${analysis.seasonalityScore.toFixed(0)}%). ` +
      `This is great for cash flow planning.`
    )
  }

  // Margin insights
  if (analysis.grossMargin < 30) {
    insights.push(
      `⚠️ Your gross margin (${analysis.grossMargin.toFixed(1)}%) is below the healthy benchmark of 30-40%. ` +
      `Consider reviewing pricing or reducing direct costs.`
    )
  } else if (analysis.grossMargin > 60) {
    insights.push(
      `✅ Strong gross margin of ${analysis.grossMargin.toFixed(1)}%! This gives you good room for growth and investment.`
    )
  }

  // Net profit insights
  if (analysis.netMargin < 10) {
    insights.push(
      `⚠️ Net profit margin of ${analysis.netMargin.toFixed(1)}% is tight. ` +
      `Review operating expenses for potential savings.`
    )
  } else if (analysis.netMargin > 20) {
    insights.push(
      `✅ Excellent net margin of ${analysis.netMargin.toFixed(1)}%! Your business is running efficiently.`
    )
  }

  // OpEx ratio insight
  if (analysis.opexPercentage > 40) {
    insights.push(
      `💡 Operating expenses are ${analysis.opexPercentage.toFixed(1)}% of revenue. ` +
      `Check if any categories are growing faster than revenue.`
    )
  }

  // Growing expense warning
  const growingExpenses = analysis.opexByCategory.filter(cat => cat.trend === 'up')
  if (growingExpenses.length > 0) {
    const topGrowing = growingExpenses.slice(0, 3).map(c => c.name).join(', ')
    insights.push(
      `📈 These expenses are trending up: ${topGrowing}. Review if the growth is justified.`
    )
  }

  return insights
}

/**
 * Calculate what the 5 Ways need to be to hit revenue goal
 */
export function reverseEngineerFiveWays(
  revenueGoal: number,
  grossProfitGoal: number,
  currentMetrics: {
    leads: number
    conversionRate: number // as decimal e.g., 0.25
    transactions: number
    avgSaleValue: number
  }
): {
  targetLeads: number
  targetConversion: number
  targetTransactions: number
  targetAvgSale: number
  targetMargin: number
} {
  // Current revenue calculation
  const currentCustomers = currentMetrics.leads * currentMetrics.conversionRate
  const currentRevenue = currentCustomers * currentMetrics.transactions * currentMetrics.avgSaleValue

  // Calculate the multiplier needed
  const revenueMultiplier = revenueGoal / (currentRevenue || 1)

  // Distribute the multiplier across all 5 ways (roughly even)
  // 5th root of multiplier gives even distribution
  const perMetricMultiplier = Math.pow(revenueMultiplier, 0.25) // 4 revenue drivers

  // Target margin is derived from profit goal
  const targetMargin = revenueGoal > 0 ? (grossProfitGoal / revenueGoal) * 100 : 40

  return {
    targetLeads: Math.ceil(currentMetrics.leads * perMetricMultiplier),
    targetConversion: Math.min(100, currentMetrics.conversionRate * 100 * perMetricMultiplier),
    targetTransactions: currentMetrics.transactions * perMetricMultiplier,
    targetAvgSale: currentMetrics.avgSaleValue * perMetricMultiplier,
    targetMargin
  }
}
