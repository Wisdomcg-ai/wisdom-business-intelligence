/**
 * Assumptions → P&L Lines Converter
 *
 * Pure function that converts ForecastAssumptions (from Wizard V4) into PLLine[]
 * for the forecast_pl_lines table. No DB dependencies — all IO happens in the caller.
 */

import type { PLLine } from '../types'
import type {
  ForecastAssumptions,
  RevenueLineAssumption,
  COGSLineAssumption,
  OpExLineAssumption,
  ExistingTeamMember,
  PlannedHire,
  PlannedDeparture,
  PlannedBonus,
  PlannedCommission,
} from '../components/wizard-v4/types/assumptions'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConvertContext {
  assumptions: ForecastAssumptions
  forecastStartMonth: string  // e.g. "2025-07"
  forecastEndMonth: string    // e.g. "2028-06"
  fiscalYear: number          // e.g. 2026
  forecastDuration: number    // 1, 2, or 3
  existingLines: PLLine[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate inclusive month range: ["2025-07", "2025-08", …, "2026-06"] */
export function generateMonthRange(start: string, end: string): string[] {
  const months: string[] = []
  const [sy, sm] = start.split('-').map(Number)
  const [ey, em] = end.split('-').map(Number)
  let y = sy, m = sm
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return months
}

/**
 * Expand quarterly values into monthly (each value ÷ 3).
 * Australian FY quarters: Q1=Jul/Aug/Sep, Q2=Oct/Nov/Dec, Q3=Jan/Feb/Mar, Q4=Apr/May/Jun
 */
export function expandQuarterlyToMonthly(
  quarterly: { q1: number; q2: number; q3: number; q4: number },
  fyStartYear: number
): Record<string, number> {
  const result: Record<string, number> = {}

  // Q1 = Jul, Aug, Sep of fyStartYear
  const q1Months = [
    `${fyStartYear}-07`, `${fyStartYear}-08`, `${fyStartYear}-09`,
  ]
  // Q2 = Oct, Nov, Dec of fyStartYear
  const q2Months = [
    `${fyStartYear}-10`, `${fyStartYear}-11`, `${fyStartYear}-12`,
  ]
  // Q3 = Jan, Feb, Mar of fyStartYear+1
  const q3Months = [
    `${fyStartYear + 1}-01`, `${fyStartYear + 1}-02`, `${fyStartYear + 1}-03`,
  ]
  // Q4 = Apr, May, Jun of fyStartYear+1
  const q4Months = [
    `${fyStartYear + 1}-04`, `${fyStartYear + 1}-05`, `${fyStartYear + 1}-06`,
  ]

  for (const mk of q1Months) result[mk] = round2(quarterly.q1 / 3)
  for (const mk of q2Months) result[mk] = round2(quarterly.q2 / 3)
  for (const mk of q3Months) result[mk] = round2(quarterly.q3 / 3)
  for (const mk of q4Months) result[mk] = round2(quarterly.q4 / 3)

  return result
}

/**
 * Determine which forecast year (1, 2, or 3) a month falls in.
 * Year 1 starts at fiscalYear-1 July, Year 2 at fiscalYear July, etc.
 */
export function getFYYear(monthKey: string, fiscalYear: number): number {
  const [y, m] = monthKey.split('-').map(Number)
  // Year 1 FY start = (fiscalYear - 1) July
  const fy1Start = (fiscalYear - 1) * 12 + 7
  const monthNum = y * 12 + m
  const diff = monthNum - fy1Start
  if (diff < 12) return 1
  if (diff < 24) return 2
  return 3
}

/** FY start year for a given forecast year number */
function fyStartYearForYear(fiscalYear: number, yearNum: number): number {
  // Year 1 FY starts Jul of (fiscalYear - 1)
  return fiscalYear - 1 + (yearNum - 1)
}

/** Case-insensitive match on account_name, fallback to account_code */
function findMatchingLine(
  existingLines: PLLine[],
  accountName: string,
  accountId?: string
): PLLine | undefined {
  const nameLower = accountName.toLowerCase().trim()
  const byName = existingLines.find(
    l => l.account_name.toLowerCase().trim() === nameLower
  )
  if (byName) return byName

  if (accountId) {
    return existingLines.find(
      l => l.account_code === accountId || l.id === accountId
    )
  }
  return undefined
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ---------------------------------------------------------------------------
// Revenue
// ---------------------------------------------------------------------------

function convertRevenue(
  ctx: ConvertContext,
  forecastMonthKeys: string[]
): PLLine[] {
  const { assumptions, fiscalYear, forecastDuration, existingLines } = ctx
  if (!assumptions.revenue?.lines?.length) return []

  const lines: PLLine[] = []

  for (const revLine of assumptions.revenue.lines) {
    const existing = findMatchingLine(existingLines, revLine.accountName, revLine.accountId)

    const forecastMonths: Record<string, number> = {}

    // Year 1 — use year1Monthly directly
    if (revLine.year1Monthly) {
      for (const [mk, val] of Object.entries(revLine.year1Monthly)) {
        if (forecastMonthKeys.includes(mk)) {
          forecastMonths[mk] = round2(val)
        }
      }
    }

    // Year 2 — expand quarterly
    if (forecastDuration >= 2 && revLine.year2Quarterly) {
      const y2Start = fyStartYearForYear(fiscalYear, 2)
      const expanded = expandQuarterlyToMonthly(revLine.year2Quarterly, y2Start)
      for (const [mk, val] of Object.entries(expanded)) {
        if (forecastMonthKeys.includes(mk)) {
          forecastMonths[mk] = round2(val)
        }
      }
    }

    // Year 3 — expand quarterly
    if (forecastDuration >= 3 && revLine.year3Quarterly) {
      const y3Start = fyStartYearForYear(fiscalYear, 3)
      const expanded = expandQuarterlyToMonthly(revLine.year3Quarterly, y3Start)
      for (const [mk, val] of Object.entries(expanded)) {
        if (forecastMonthKeys.includes(mk)) {
          forecastMonths[mk] = round2(val)
        }
      }
    }

    lines.push({
      ...(existing ? { id: existing.id } : {}),
      account_name: existing?.account_name || revLine.accountName,
      account_code: existing?.account_code || revLine.accountId,
      category: 'Revenue',
      subcategory: existing?.subcategory,
      sort_order: existing?.sort_order,
      actual_months: existing?.actual_months || {},
      forecast_months: forecastMonths,
      is_from_xero: existing?.is_from_xero || false,
      is_manual: false,
    })
  }

  return lines
}

// ---------------------------------------------------------------------------
// COGS
// ---------------------------------------------------------------------------

function convertCOGS(
  ctx: ConvertContext,
  forecastMonthKeys: string[],
  revenueByMonth: Record<string, number>
): PLLine[] {
  const { assumptions, fiscalYear, forecastDuration, existingLines } = ctx
  if (!assumptions.cogs?.lines?.length) return []

  const lines: PLLine[] = []

  for (const cogsLine of assumptions.cogs.lines) {
    const existing = findMatchingLine(existingLines, cogsLine.accountName, cogsLine.accountId)

    const forecastMonths: Record<string, number> = {}

    // If year1Monthly exists, use it directly (same pattern as revenue)
    if (cogsLine.year1Monthly) {
      for (const [mk, val] of Object.entries(cogsLine.year1Monthly)) {
        if (forecastMonthKeys.includes(mk)) {
          forecastMonths[mk] = round2(val)
        }
      }

      // Year 2
      if (forecastDuration >= 2 && cogsLine.year2Quarterly) {
        const y2Start = fyStartYearForYear(fiscalYear, 2)
        const expanded = expandQuarterlyToMonthly(cogsLine.year2Quarterly, y2Start)
        for (const [mk, val] of Object.entries(expanded)) {
          if (forecastMonthKeys.includes(mk)) {
            forecastMonths[mk] = round2(val)
          }
        }
      }

      // Year 3
      if (forecastDuration >= 3 && cogsLine.year3Quarterly) {
        const y3Start = fyStartYearForYear(fiscalYear, 3)
        const expanded = expandQuarterlyToMonthly(cogsLine.year3Quarterly, y3Start)
        for (const [mk, val] of Object.entries(expanded)) {
          if (forecastMonthKeys.includes(mk)) {
            forecastMonths[mk] = round2(val)
          }
        }
      }
    } else if (cogsLine.costBehavior === 'variable' && cogsLine.percentOfRevenue) {
      // Variable: % of total revenue for that month
      const pct = cogsLine.percentOfRevenue / 100
      for (const mk of forecastMonthKeys) {
        const rev = revenueByMonth[mk] || 0
        forecastMonths[mk] = round2(rev * pct)
      }
    } else if (cogsLine.costBehavior === 'fixed' && cogsLine.monthlyAmount) {
      for (const mk of forecastMonthKeys) {
        forecastMonths[mk] = round2(cogsLine.monthlyAmount!)
      }
    }

    lines.push({
      ...(existing ? { id: existing.id } : {}),
      account_name: existing?.account_name || cogsLine.accountName,
      account_code: existing?.account_code || cogsLine.accountId,
      category: 'Cost of Sales',
      subcategory: existing?.subcategory,
      sort_order: existing?.sort_order,
      actual_months: existing?.actual_months || {},
      forecast_months: forecastMonths,
      is_from_xero: existing?.is_from_xero || false,
      is_manual: false,
    })
  }

  return lines
}

// ---------------------------------------------------------------------------
// OpEx
// ---------------------------------------------------------------------------

function convertOpEx(
  ctx: ConvertContext,
  forecastMonthKeys: string[],
  revenueByMonth: Record<string, number>
): PLLine[] {
  const { assumptions, fiscalYear, existingLines } = ctx
  if (!assumptions.opex?.lines?.length) return []

  const lines: PLLine[] = []

  for (const opexLine of assumptions.opex.lines) {
    const existing = findMatchingLine(existingLines, opexLine.accountName, opexLine.accountId)

    const forecastMonths: Record<string, number> = {}

    switch (opexLine.costBehavior) {
      case 'fixed': {
        const baseAmount = opexLine.monthlyAmount || 0
        const annualInc = (opexLine.annualIncreasePct || 0) / 100
        for (const mk of forecastMonthKeys) {
          const yearNum = getFYYear(mk, fiscalYear)
          // Compound increase for years 2+
          const multiplier = yearNum > 1 ? Math.pow(1 + annualInc, yearNum - 1) : 1
          forecastMonths[mk] = round2(baseAmount * multiplier)
        }
        break
      }

      case 'variable': {
        const pct = (opexLine.percentOfRevenue || 0) / 100
        for (const mk of forecastMonthKeys) {
          const rev = revenueByMonth[mk] || 0
          forecastMonths[mk] = round2(rev * pct)
        }
        break
      }

      case 'seasonal': {
        // Use existing actual_months as the base pattern, then scale
        const existingActuals = existing?.actual_months || {}
        const actualMonths = Object.keys(existingActuals).sort()
        if (actualMonths.length > 0) {
          const totalActual = Object.values(existingActuals).reduce((s, v) => s + v, 0)
          const growthPct = (opexLine.seasonalGrowthPct || 0) / 100
          const targetAmount = opexLine.seasonalTargetAmount || totalActual * (1 + growthPct)

          // Build a 12-month proportional pattern from actuals
          const pattern: Record<number, number> = {} // month (1-12) → proportion
          let patternTotal = 0
          for (const [mk, val] of Object.entries(existingActuals)) {
            const m = parseInt(mk.split('-')[1], 10)
            pattern[m] = (pattern[m] || 0) + val
            patternTotal += val
          }

          if (patternTotal > 0) {
            for (const mk of forecastMonthKeys) {
              const m = parseInt(mk.split('-')[1], 10)
              const yearNum = getFYYear(mk, fiscalYear)
              const yearMultiplier = yearNum > 1 ? Math.pow(1 + growthPct, yearNum - 1) : 1
              const proportion = (pattern[m] || patternTotal / 12) / patternTotal
              forecastMonths[mk] = round2((targetAmount / 12) * (proportion * 12) * yearMultiplier)
            }
          }
        } else {
          // No history — fall back to even distribution
          const targetAmount = opexLine.seasonalTargetAmount || opexLine.monthlyAmount || 0
          const monthly = targetAmount / 12
          for (const mk of forecastMonthKeys) {
            forecastMonths[mk] = round2(monthly)
          }
        }
        break
      }

      case 'adhoc': {
        const annual = opexLine.expectedAnnualAmount || 0
        const months = opexLine.expectedMonths || []
        if (months.length > 0) {
          const perMonth = round2(annual / months.length)
          for (const mk of months) {
            if (forecastMonthKeys.includes(mk)) {
              forecastMonths[mk] = perMonth
            }
          }
        }
        // Months not in expectedMonths get 0 (not set)
        break
      }
    }

    lines.push({
      ...(existing ? { id: existing.id } : {}),
      account_name: existing?.account_name || opexLine.accountName,
      account_code: existing?.account_code || opexLine.accountId,
      category: 'Operating Expenses',
      subcategory: existing?.subcategory,
      sort_order: existing?.sort_order,
      actual_months: existing?.actual_months || {},
      forecast_months: forecastMonths,
      is_from_xero: existing?.is_from_xero || false,
      is_manual: false,
    })
  }

  return lines
}

// ---------------------------------------------------------------------------
// Team (aggregated into Wages, Super, WorkCover, Payroll Tax lines)
// ---------------------------------------------------------------------------

function convertTeam(
  ctx: ConvertContext,
  forecastMonthKeys: string[],
  revenueByMonth: Record<string, number>
): PLLine[] {
  const { assumptions, fiscalYear, existingLines } = ctx
  const team = assumptions.team
  if (!team) return []

  const wagesPerMonth: Record<string, number> = {}
  const superPerMonth: Record<string, number> = {}
  const workCoverPerMonth: Record<string, number> = {}
  const payrollTaxPerMonth: Record<string, number> = {}

  // Initialise all months to 0
  for (const mk of forecastMonthKeys) {
    wagesPerMonth[mk] = 0
    superPerMonth[mk] = 0
    workCoverPerMonth[mk] = 0
    payrollTaxPerMonth[mk] = 0
  }

  // Build departure lookup: teamMemberId → endMonth
  const departures = new Map<string, string>()
  for (const dep of team.departures || []) {
    departures.set(dep.teamMemberId, dep.endMonth)
  }

  // --- Existing team ---
  for (const member of team.existingTeam) {
    if (!member.includeInForecast) continue

    const monthlySalary = (member.currentSalary || 0) / 12
    const increaseMonth = member.increaseMonth || ''
    const increasePct = (member.salaryIncreasePct || 0) / 100
    const departureMonth = departures.get(member.employeeId)

    for (const mk of forecastMonthKeys) {
      // Skip if departed before this month
      if (departureMonth && mk > departureMonth) continue

      let salary = monthlySalary
      // Apply salary increase if past the increase month
      if (increaseMonth && mk >= increaseMonth) {
        salary = round2(monthlySalary * (1 + increasePct))
      }

      wagesPerMonth[mk] = round2(wagesPerMonth[mk] + salary)
    }
  }

  // --- Planned hires ---
  for (const hire of team.plannedHires) {
    const startMonth = hire.startMonth
    let monthlySalary: number

    if (hire.employmentType === 'casual' && hire.hourlyRate) {
      const hoursPerWeek = hire.hoursPerWeek || 20
      const weeksPerYear = hire.weeksPerYear || 48
      monthlySalary = round2((hire.hourlyRate * hoursPerWeek * weeksPerYear) / 12)
    } else {
      monthlySalary = round2((hire.salary || 0) / 12)
    }

    for (const mk of forecastMonthKeys) {
      if (mk >= startMonth) {
        wagesPerMonth[mk] = round2(wagesPerMonth[mk] + monthlySalary)
      }
    }
  }

  // --- Bonuses ---
  for (const bonus of team.bonuses || []) {
    // bonus.month is 1-12 (month of fiscal year, 1=Jul)
    // Convert to calendar month: FY month 1 = July = calendar 7
    const calendarMonth = ((bonus.month - 1 + 6) % 12) + 1

    for (const mk of forecastMonthKeys) {
      const m = parseInt(mk.split('-')[1], 10)
      if (m === calendarMonth) {
        // Only apply in year 1 (bonuses are typically one-time)
        const yearNum = getFYYear(mk, fiscalYear)
        if (yearNum === 1) {
          wagesPerMonth[mk] = round2(wagesPerMonth[mk] + bonus.amount)
        }
      }
    }
  }

  // --- Commissions ---
  for (const comm of team.commissions || []) {
    const pct = (comm.percentOfRevenue || 0) / 100
    if (pct === 0) continue

    // Find the revenue line this commission is linked to
    const revLine = assumptions.revenue.lines.find(
      rl => rl.accountId === comm.revenueLineId
    )

    for (const mk of forecastMonthKeys) {
      let revForMonth = 0
      if (revLine) {
        // Get this revenue line's value for the month
        revForMonth = revenueByMonth[mk] || 0
        // If there are multiple rev lines, use the specific one
        // We need to recalculate for this specific line
        if (revLine.year1Monthly && revLine.year1Monthly[mk] !== undefined) {
          revForMonth = revLine.year1Monthly[mk]
        }
      } else {
        // Fallback to total revenue
        revForMonth = revenueByMonth[mk] || 0
      }

      if (comm.timing === 'monthly') {
        wagesPerMonth[mk] = round2(wagesPerMonth[mk] + revForMonth * pct)
      } else if (comm.timing === 'quarterly') {
        // Only pay in last month of quarter (Sep, Dec, Mar, Jun)
        const m = parseInt(mk.split('-')[1], 10)
        if ([3, 6, 9, 12].includes(m)) {
          wagesPerMonth[mk] = round2(wagesPerMonth[mk] + revForMonth * 3 * pct)
        }
      } else if (comm.timing === 'annual') {
        // Pay in June (end of FY)
        const m = parseInt(mk.split('-')[1], 10)
        if (m === 6) {
          wagesPerMonth[mk] = round2(wagesPerMonth[mk] + revForMonth * 12 * pct)
        }
      }
    }
  }

  // --- Calculate on-costs ---
  const superPct = (team.superannuationPct || 12) / 100
  const workCoverPct = (team.workCoverPct || 0) / 100
  const payrollTaxPct = (team.payrollTaxPct || 0) / 100
  const payrollTaxThreshold = team.payrollTaxThreshold || 1200000

  for (const mk of forecastMonthKeys) {
    const wages = wagesPerMonth[mk]
    superPerMonth[mk] = round2(wages * superPct)
    workCoverPerMonth[mk] = round2(wages * workCoverPct)

    // Payroll tax: only if annualised wages exceed threshold
    // Simple approximation: monthly wages × 12 vs threshold
    const annualised = wages * 12
    if (annualised > payrollTaxThreshold) {
      payrollTaxPerMonth[mk] = round2(wages * payrollTaxPct)
    }
  }

  // --- Build P&L lines ---
  const teamLines: { name: string; data: Record<string, number> }[] = [
    { name: 'Wages & Salaries', data: wagesPerMonth },
    { name: 'Superannuation', data: superPerMonth },
    { name: 'WorkCover Insurance', data: workCoverPerMonth },
    { name: 'Payroll Tax', data: payrollTaxPerMonth },
  ]

  const result: PLLine[] = []

  for (const tl of teamLines) {
    // Skip lines that are all zeros
    const hasValues = Object.values(tl.data).some(v => v > 0)
    if (!hasValues) continue

    const existing = findMatchingLine(existingLines, tl.name)

    result.push({
      ...(existing ? { id: existing.id } : {}),
      account_name: existing?.account_name || tl.name,
      account_code: existing?.account_code,
      category: 'Operating Expenses',
      subcategory: existing?.subcategory,
      sort_order: existing?.sort_order,
      actual_months: existing?.actual_months || {},
      forecast_months: tl.data,
      is_from_xero: existing?.is_from_xero || false,
      is_manual: false,
    })
  }

  return result
}

// ---------------------------------------------------------------------------
// CapEx → Depreciation (simple straight-line)
// ---------------------------------------------------------------------------

function convertCapExDepreciation(
  ctx: ConvertContext,
  forecastMonthKeys: string[]
): PLLine[] {
  const { assumptions, existingLines } = ctx
  if (!assumptions.capex?.items?.length) return []

  // Sum monthly depreciation across all items
  // Default useful life = 5 years if not specified
  let totalMonthlyDepreciation = 0
  for (const item of assumptions.capex.items) {
    const usefulLifeYears = 5
    totalMonthlyDepreciation += round2(item.amount / usefulLifeYears / 12)
  }

  if (totalMonthlyDepreciation <= 0) return []

  const forecastMonths: Record<string, number> = {}
  for (const mk of forecastMonthKeys) {
    forecastMonths[mk] = round2(totalMonthlyDepreciation)
  }

  const existing = findMatchingLine(existingLines, 'Depreciation')

  return [{
    ...(existing ? { id: existing.id } : {}),
    account_name: existing?.account_name || 'Depreciation',
    account_code: existing?.account_code,
    category: 'Operating Expenses',
    subcategory: existing?.subcategory,
    sort_order: existing?.sort_order,
    actual_months: existing?.actual_months || {},
    forecast_months: forecastMonths,
    is_from_xero: existing?.is_from_xero || false,
    is_manual: false,
  }]
}

// ---------------------------------------------------------------------------
// Main converter
// ---------------------------------------------------------------------------

export function convertAssumptionsToPLLines(ctx: ConvertContext): PLLine[] {
  const { assumptions, forecastStartMonth, forecastEndMonth, existingLines } = ctx
  if (!assumptions) return [...existingLines]

  const forecastMonthKeys = generateMonthRange(forecastStartMonth, forecastEndMonth)

  // --- Revenue (first, because COGS/OpEx/Team may depend on it) ---
  let revenueLines: PLLine[] = []
  try {
    revenueLines = convertRevenue(ctx, forecastMonthKeys)
  } catch (err) {
    console.error('[assumptions-to-pl] Revenue conversion error:', err)
  }

  // Build total revenue by month (for variable cost calculations)
  const revenueByMonth: Record<string, number> = {}
  for (const mk of forecastMonthKeys) {
    let total = 0
    for (const rl of revenueLines) {
      total += rl.forecast_months[mk] || 0
    }
    revenueByMonth[mk] = total
  }

  // --- COGS ---
  let cogsLines: PLLine[] = []
  try {
    cogsLines = convertCOGS(ctx, forecastMonthKeys, revenueByMonth)
  } catch (err) {
    console.error('[assumptions-to-pl] COGS conversion error:', err)
  }

  // --- OpEx ---
  let opexLines: PLLine[] = []
  try {
    opexLines = convertOpEx(ctx, forecastMonthKeys, revenueByMonth)
  } catch (err) {
    console.error('[assumptions-to-pl] OpEx conversion error:', err)
  }

  // --- Team ---
  let teamLines: PLLine[] = []
  try {
    teamLines = convertTeam(ctx, forecastMonthKeys, revenueByMonth)
  } catch (err) {
    console.error('[assumptions-to-pl] Team conversion error:', err)
  }

  // --- CapEx depreciation ---
  let depreciationLines: PLLine[] = []
  try {
    depreciationLines = convertCapExDepreciation(ctx, forecastMonthKeys)
  } catch (err) {
    console.error('[assumptions-to-pl] CapEx depreciation error:', err)
  }

  // --- Merge with existing lines ---
  const generatedLines = [
    ...revenueLines,
    ...cogsLines,
    ...opexLines,
    ...teamLines,
    ...depreciationLines,
  ]

  // Track which existing lines were matched
  const matchedExistingIds = new Set<string>()
  for (const gl of generatedLines) {
    if (gl.id) matchedExistingIds.add(gl.id)
  }

  // Start with generated lines, then add unmatched existing lines (preserve manual edits)
  const result: PLLine[] = [...generatedLines]

  for (const el of existingLines) {
    if (el.id && !matchedExistingIds.has(el.id)) {
      result.push(el)
    }
  }

  // --- Apply sort order ---
  let revSort = 1
  let cogsSort = 50
  let opexSort = 100

  for (const line of result) {
    if (line.sort_order != null) continue // preserve existing sort_order

    switch (line.category) {
      case 'Revenue':
        line.sort_order = revSort++
        break
      case 'Cost of Sales':
        line.sort_order = cogsSort++
        break
      case 'Operating Expenses':
      default:
        line.sort_order = opexSort++
        break
    }
  }

  return result
}
