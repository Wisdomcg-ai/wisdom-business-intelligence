/**
 * Assumptions → P&L Lines Converter
 *
 * Pure function that converts ForecastAssumptions (from Wizard V4) into PLLine[]
 * for the forecast_pl_lines table. No DB dependencies — all IO happens in the caller.
 */

import type { PLLine } from '../types'
import { calendarMonthFromFiscalIndex, DEFAULT_YEAR_START_MONTH } from '@/lib/utils/fiscal-year-utils'
import { getPlannedSpendPLBreakdown } from '../components/wizard-v4/types'
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
// Stable synthetic account codes (PR-A M4)
//
// Generated lines (team wages/super, depreciation, subscriptions, parity
// buckets) used to carry account_code = undefined → null. The
// save_assumptions_and_materialize upsert conflicts on
// (forecast_id, account_code) WHERE is_manual = false, and NULLs never match
// in a unique index — so EVERY draft autosave inserted duplicate rows (prod:
// 16× "Wages & Salaries" on one Digital Bond forecast, ~12× overcount in
// cashflow/quarterly/dashboard consumers). Deterministic codes make the
// upsert idempotent. Existing lines that already carry a real Xero code keep
// it (their conflict target already works).
// ---------------------------------------------------------------------------
// Lines the converter no longer emits. Never re-emitted from existing rows —
// see the pass-through filter in convertAssumptionsToPLLines.
export const RETIRED_LINE_NAMES = new Set([
  'workcover insurance',
  'payroll tax',
])

export const SYS_CODES = {
  wages: 'SYS-TEAM-WAGES',
  superannuation: 'SYS-TEAM-SUPER',
  depreciation: 'SYS-DEPRECIATION',
  subscriptions: 'SYS-SUBSCRIPTIONS',
  plannedSpendExpense: 'SYS-PLANNED-SPEND',
  otherIncome: 'SYS-OTHER-INCOME',
  otherExpense: 'SYS-OTHER-EXPENSE',
} as const

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
 * Quarter months are derived from yearStartMonth (default 7 for AU FY).
 */
export function expandQuarterlyToMonthly(
  quarterly: { q1: number; q2: number; q3: number; q4: number },
  fyStartYear: number,
  yearStartMonth: number = DEFAULT_YEAR_START_MONTH
): Record<string, number> {
  const result: Record<string, number> = {}
  const quarters = [quarterly.q1, quarterly.q2, quarterly.q3, quarterly.q4]

  for (let q = 0; q < 4; q++) {
    const qValue = quarters[q]
    for (let m = 0; m < 3; m++) {
      const fiscalIdx = q * 3 + m
      const calMonth = calendarMonthFromFiscalIndex(fiscalIdx, yearStartMonth)
      const year = calMonth >= yearStartMonth ? fyStartYear : fyStartYear + 1
      const key = `${year}-${String(calMonth).padStart(2, '0')}`
      result[key] = round2(qValue / 3)
    }
  }

  return result
}

/**
 * Determine which forecast year (1, 2, or 3) a month falls in.
 * Year 1 starts at (fiscalYear-1) + yearStartMonth.
 */
export function getFYYear(monthKey: string, fiscalYear: number, yearStartMonth: number = DEFAULT_YEAR_START_MONTH): number {
  const [y, m] = monthKey.split('-').map(Number)
  const startYear = yearStartMonth === 1 ? fiscalYear : fiscalYear - 1
  const fy1Start = startYear * 12 + yearStartMonth
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

    // D-44.1-06 vector 2/3 — start from existing forecast_months so unmentioned keys (Y2/Y3,
    // or Y1 keys when input has no year1Monthly) survive. Input wins per-key for in-range months.
    const newForecastMonths: Record<string, number> = { ...(existing?.forecast_months || {}) }

    // Year 1 — use year1Monthly directly
    if (revLine.year1Monthly) {
      for (const [mk, val] of Object.entries(revLine.year1Monthly)) {
        if (forecastMonthKeys.includes(mk)) {
          newForecastMonths[mk] = round2(val)
        }
      }
    }

    // Years 2 and 3 — 21 Aug 2026 audit (FML-02 / FML-03 / PROC-02).
    //
    // These used to read ONLY the quarterly maps, which caused two defects:
    //   FML-02 a PARTIALLY filled monthly grid exported a quarterly map of all
    //          zeros (monthlyToQuarterly bailed below 12 keys), so the stored
    //          year was $0 while the screen counted the typed months;
    //   FML-03 even a COMPLETE grid was collapsed to 4 quarter totals and
    //          re-expanded as quarter÷3, flattening every seasonal business's
    //          Y2/Y3 budget — the monthly report then varied actuals against
    //          months nobody planned.
    // The monthly grid is now authoritative per key, with the quarterly map
    // used only to fill months the operator never typed (and for legacy
    // payloads that carry no monthly grid at all).
    for (const yearNum of [2, 3] as const) {
      if (forecastDuration < yearNum) continue
      const monthly = yearNum === 2 ? revLine.year2Monthly : revLine.year3Monthly
      const quarterly = yearNum === 2 ? revLine.year2Quarterly : revLine.year3Quarterly
      const yearStart = fyStartYearForYear(fiscalYear, yearNum)

      if (quarterly) {
        const expanded = expandQuarterlyToMonthly(quarterly, yearStart)
        for (const [mk, val] of Object.entries(expanded)) {
          if (forecastMonthKeys.includes(mk)) newForecastMonths[mk] = round2(val)
        }
      }
      // Explicit months win over the quarterly fill.
      if (monthly) {
        for (const [mk, val] of Object.entries(monthly)) {
          if (forecastMonthKeys.includes(mk)) newForecastMonths[mk] = round2(val)
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
      forecast_months: newForecastMonths,
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

    // D-44.1-06 vector 2/3 — start from existing forecast_months so unmentioned keys survive.
    const newForecastMonths: Record<string, number> = { ...(existing?.forecast_months || {}) }

    // PR-A materializer fidelity (M1): per-month resolution. The operator's
    // grid (year1Monthly, incl. locked actual months) wins wherever present;
    // Y2/Y3 quarterly maps win next; only months with NO explicit value fall
    // back to the cost-behavior formula. The old shape ("year1Monthly present
    // → skip the formula entirely; absent → formula for ALL months") either
    // discarded the grid (wizard never sent it) or, once the grid IS sent,
    // would have left Y2/Y3 months of a 1-tab-visited multi-year forecast
    // stale. Per-month resolution handles every combination.
    const explicitMonths: Record<string, number> = {}
    if (cogsLine.year1Monthly) {
      for (const [mk, val] of Object.entries(cogsLine.year1Monthly)) {
        explicitMonths[mk] = round2(val)
      }
    }
    // 21 Aug 2026 audit (FML-03): the monthly grid is authoritative for Y2/Y3
    // too — the quarterly map only fills months the operator never typed.
    // Reading quarterly alone flattened every seasonal COGS line to
    // quarter÷3, the same defect #379 fixed for Y1.
    for (const yearNum of [2, 3] as const) {
      if (forecastDuration < yearNum) continue
      const quarterly = yearNum === 2 ? cogsLine.year2Quarterly : cogsLine.year3Quarterly
      const monthly = yearNum === 2 ? cogsLine.year2Monthly : cogsLine.year3Monthly
      if (quarterly) {
        const expanded = expandQuarterlyToMonthly(
          quarterly,
          fyStartYearForYear(fiscalYear, yearNum),
        )
        for (const [mk, val] of Object.entries(expanded)) explicitMonths[mk] = round2(val)
      }
      if (monthly) {
        for (const [mk, val] of Object.entries(monthly)) explicitMonths[mk] = round2(val)
      }
    }

    for (const mk of forecastMonthKeys) {
      // FML-06: Step 3's per-line Y2/Y3 margin trend ("improves"/"increases",
      // ±2 percentage points) moved the summary's COGS but was never exported
      // or materialized — the designed way to model "GP improves 2pp next
      // year" simply did not reach the stored forecast. The summary applies it
      // to BOTH the explicit-grid and the formula path, so this does too.
      const yearNum = getFYYear(mk, fiscalYear)
      const trendAdj =
        yearNum === 1 ? 0
        : cogsLine.y2y3Trend === 'improves' ? -2
        : cogsLine.y2y3Trend === 'increases' ? 2
        : 0

      if (explicitMonths[mk] !== undefined) {
        newForecastMonths[mk] = round2(explicitMonths[mk] * (1 + trendAdj / 100))
      } else if (cogsLine.costBehavior === 'variable' && cogsLine.percentOfRevenue) {
        const rev = revenueByMonth[mk] || 0
        const pct = (cogsLine.percentOfRevenue + trendAdj) / 100
        newForecastMonths[mk] = round2(rev * pct)
      } else if (cogsLine.costBehavior === 'fixed' && cogsLine.monthlyAmount) {
        newForecastMonths[mk] = round2(cogsLine.monthlyAmount * (1 + trendAdj / 100))
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
      forecast_months: newForecastMonths,
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

    // D-44.1-06 vector 2/3 — start from existing forecast_months so unmentioned keys survive.
    const newForecastMonths: Record<string, number> = { ...(existing?.forecast_months || {}) }

    switch (opexLine.costBehavior) {
      case 'fixed': {
        const baseAmount = opexLine.monthlyAmount || 0
        const annualInc = (opexLine.annualIncreasePct || 0) / 100
        for (const mk of forecastMonthKeys) {
          const yearNum = getFYYear(mk, fiscalYear)
          // Compound increase for years 2+
          const multiplier = yearNum > 1 ? Math.pow(1 + annualInc, yearNum - 1) : 1
          newForecastMonths[mk] = round2(baseAmount * multiplier)
        }
        break
      }

      case 'variable': {
        const pct = (opexLine.percentOfRevenue || 0) / 100
        for (const mk of forecastMonthKeys) {
          const rev = revenueByMonth[mk] || 0
          newForecastMonths[mk] = round2(rev * pct)
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
              newForecastMonths[mk] = round2((targetAmount / 12) * (proportion * 12) * yearMultiplier)
            }
          }
        } else {
          // No history — flat distribution matching the summary's valuation:
          // Y1 = target (or priorYearTotal), later years compound growth.
          // PR-A (M9): the old fallback was `seasonalTargetAmount ||
          // monthlyAmount || 0`, and the wizard never sends monthlyAmount for
          // seasonal lines — every growth-%-driven seasonal line materialized
          // as $0 on fresh generates and seed-from-prior.
          const growthPct = (opexLine.seasonalGrowthPct || 0) / 100
          const baseAnnual =
            opexLine.seasonalTargetAmount ||
            opexLine.priorYearTotal ||
            (opexLine.monthlyAmount || 0) * 12
          for (const mk of forecastMonthKeys) {
            const yearNum = getFYYear(mk, fiscalYear)
            const yearMultiplier = Math.pow(1 + growthPct, yearNum - 1)
            newForecastMonths[mk] = round2((baseAnnual * yearMultiplier) / 12)
          }
        }
        break
      }

      case 'adhoc': {
        // Summary parity: an ad-hoc line is charged at expectedAnnualAmount in
        // EVERY forecast year (useForecastWizard.calculateYearSummary). Two
        // gaps used to break that:
        //   1. expectedMonths EMPTY → nothing was written at all, so the line
        //      materialized as $0 while the summary counted it in full. Dragon
        //      Roofing FY2027 had ELEVEN such lines (Accounting $7,617, MV fuel
        //      $5,348, …) totalling $26,356 of net-profit divergence.
        //   2. expectedMonths only ever holds Y1 keys, so Y2/Y3 were $0.
        // Resolution: per forecast year, use that year's selected months when
        // present, otherwise spread the annual amount evenly across the year.
        const annual = opexLine.expectedAnnualAmount || 0
        if (annual !== 0) {
          const selected = new Set(opexLine.expectedMonths || [])
          const monthsByYear = new Map<number, string[]>()
          for (const mk of forecastMonthKeys) {
            const y = getFYYear(mk, fiscalYear)
            const arr = monthsByYear.get(y) ?? []
            arr.push(mk)
            monthsByYear.set(y, arr)
          }
          for (const [, yearMonths] of monthsByYear) {
            const chosen = yearMonths.filter(mk => selected.has(mk))
            const target = chosen.length > 0 ? chosen : yearMonths
            const perMonth = round2(annual / target.length)
            for (const mk of yearMonths) {
              newForecastMonths[mk] = target.includes(mk) ? perMonth : 0
            }
          }
        }
        break
      }
    }

    // 21 Aug 2026 audit (FML-01 / PROC-01): the operator's per-year Y2/Y3
    // tuning and lifecycle flags are applied LAST, over whatever the cost
    // behavior produced — exactly as the wizard summary does.
    applyOpExYearOverrides(
      opexLine,
      newForecastMonths,
      forecastMonthKeys,
      fiscalYear,
      revenueByMonth,
    )

    lines.push({
      ...(existing ? { id: existing.id } : {}),
      account_name: existing?.account_name || opexLine.accountName,
      // PROC-06: prefer the real Xero account code when the wizard sends one.
      // accountId is a synthetic 'opex-N' index id, which is why stored lines
      // used to carry codes that no budget-vs-actual join could match.
      account_code: existing?.account_code || opexLine.accountCode || opexLine.accountId,
      category: 'Operating Expenses',
      subcategory: existing?.subcategory,
      sort_order: existing?.sort_order,
      actual_months: existing?.actual_months || {},
      forecast_months: newForecastMonths,
      is_from_xero: existing?.is_from_xero || false,
      is_manual: false,
    })
  }

  return lines
}

/**
 * Apply the operator's explicit per-year decisions on top of the formula
 * result, mirroring `calculateYearSummary` in useForecastWizard.
 *
 * Precedence per year, highest first (same order as the summary):
 *   1. lifecycle — a one-time expense charged in a different year, or a line
 *      that hasn't started yet, contributes ZERO to this year;
 *   2. an explicit annual override (y2Override / y3Override);
 *   3. a variable line's per-year % of revenue override;
 *   4. a seasonal line's per-year target amount.
 *
 * Annual overrides are applied by SCALING the year's months to the target so
 * the operator's seasonal shape survives; a year whose formula produced
 * nothing is spread evenly instead (nothing to preserve).
 *
 * Mutates `months` in place.
 */
function applyOpExYearOverrides(
  opexLine: OpExLineAssumption,
  months: Record<string, number>,
  forecastMonthKeys: string[],
  fiscalYear: number,
  revenueByMonth: Record<string, number>,
): void {
  const monthsByYear = new Map<number, string[]>()
  for (const mk of forecastMonthKeys) {
    const y = getFYYear(mk, fiscalYear)
    const arr = monthsByYear.get(y) ?? []
    arr.push(mk)
    monthsByYear.set(y, arr)
  }

  const scaleYearTo = (yearMonths: string[], target: number) => {
    const current = yearMonths.reduce((s, mk) => s + (months[mk] || 0), 0)
    if (current !== 0) {
      const factor = target / current
      for (const mk of yearMonths) months[mk] = round2((months[mk] || 0) * factor)
    } else {
      const perMonth = round2(target / yearMonths.length)
      for (const mk of yearMonths) months[mk] = perMonth
    }
    // Absorb per-month rounding residue in the final month so the year sums to
    // the operator's number EXACTLY — same discipline the revenue path uses.
    // Without it, twelve round2 calls leave cents adrift from the approved
    // annual figure and the parity check drifts with them.
    const achieved = yearMonths.reduce((s, mk) => s + (months[mk] || 0), 0)
    const residue = round2(target - achieved)
    if (residue !== 0) {
      const last = yearMonths[yearMonths.length - 1]
      months[last] = round2((months[last] || 0) + residue)
    }
  }

  for (const [yearNum, yearMonths] of monthsByYear) {
    if (yearMonths.length === 0) continue

    // 1. lifecycle flags — the summary skips the whole line for these years.
    if (opexLine.isOneTime && opexLine.oneTimeYear && opexLine.oneTimeYear !== yearNum) {
      for (const mk of yearMonths) months[mk] = 0
      continue
    }
    if (opexLine.startYear && opexLine.startYear > yearNum) {
      for (const mk of yearMonths) months[mk] = 0
      continue
    }
    if (yearNum < 2) continue

    // 2. explicit annual override.
    const annualOverride =
      yearNum === 2 ? opexLine.y2Override
      : yearNum === 3 ? opexLine.y3Override
      : undefined
    if (typeof annualOverride === 'number') {
      scaleYearTo(yearMonths, annualOverride)
      continue
    }

    // 3. variable % of revenue override — recompute from revenue, since the
    //    percentage is a rate, not a total.
    const pctOverride =
      yearNum === 2 ? opexLine.y2PercentOverride
      : yearNum === 3 ? opexLine.y3PercentOverride
      : undefined
    if (opexLine.costBehavior === 'variable' && typeof pctOverride === 'number') {
      for (const mk of yearMonths) {
        months[mk] = round2((revenueByMonth[mk] || 0) * (pctOverride / 100))
      }
      continue
    }

    // 4. seasonal per-year target.
    const seasonalTarget =
      yearNum === 2 ? opexLine.y2SeasonalTargetAmount
      : yearNum === 3 ? opexLine.y3SeasonalTargetAmount
      : undefined
    if (opexLine.costBehavior === 'seasonal' && typeof seasonalTarget === 'number') {
      scaleYearTo(yearMonths, seasonalTarget)
    }
  }
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

  // PR-A materializer fidelity (M3): this function now mirrors the wizard
  // summary's payroll math (useForecastWizard.calculateYearSummary) so the
  // stored P&L equals what the operator approved on Step 8 Review:
  //   - salaries compound: year1Salary × (1 + increasePct)^(yearN − 1)
  //     (year1Salary = summary's newSalary; legacy payloads fall back to
  //     currentSalary)
  //   - superannuation applies to EMPLOYEE wages only, never contractors
  //   - bonuses recur every forecast year at their calendar month, skipped
  //     after the member's departure (summary parity)
  //   - commissions = pct × the linked revenue line's value for the month
  //     (with the summary's Y1-share fallback when a later year has no line
  //     data), aggregated per timing period
  //   - the WorkCover / Payroll Tax lines are GONE: the summary never
  //     included them and no wizard screen showed them — they silently added
  //     up to ~6.35% of payroll to the stored forecast (M3b). Statutory
  //     on-cost modelling is a future feature that must land in the summary
  //     and the converter together.
  const wagesEmployeePerMonth: Record<string, number> = {}
  const wagesContractorPerMonth: Record<string, number> = {}

  for (const mk of forecastMonthKeys) {
    wagesEmployeePerMonth[mk] = 0
    wagesContractorPerMonth[mk] = 0
  }

  const addWage = (mk: string, amount: number, isContractor: boolean) => {
    if (isContractor) {
      wagesContractorPerMonth[mk] = round2(wagesContractorPerMonth[mk] + amount)
    } else {
      wagesEmployeePerMonth[mk] = round2(wagesEmployeePerMonth[mk] + amount)
    }
  }

  // Build departure lookup: teamMemberId → endMonth
  const departures = new Map<string, string>()
  for (const dep of team.departures || []) {
    departures.set(dep.teamMemberId, dep.endMonth)
  }

  // --- Existing team ---
  for (const member of team.existingTeam) {
    if (!member.includeInForecast) continue

    const baseSalary = member.year1Salary ?? member.currentSalary ?? 0
    const increasePct = (member.salaryIncreasePct || 0) / 100
    const departureMonth = departures.get(member.employeeId)
    const isContractor = member.employmentType === 'contractor'

    for (const mk of forecastMonthKeys) {
      if (departureMonth && mk > departureMonth) continue
      const yearNum = getFYYear(mk, fiscalYear)
      const salaryForYear = baseSalary * Math.pow(1 + increasePct, yearNum - 1)
      addWage(mk, salaryForYear / 12, isContractor)
    }
  }

  // --- Planned hires ---
  for (const hire of team.plannedHires) {
    const isContractor = hire.employmentType === 'contractor'
    // Summary parity: hire.salary is authoritative; the hourly derivation is
    // only a fallback for casuals whose salary was never computed.
    let annualBase = hire.salary || 0
    if (!annualBase && hire.employmentType === 'casual' && hire.hourlyRate) {
      const hoursPerWeek = hire.hoursPerWeek || 20
      const weeksPerYear = hire.weeksPerYear || 48
      annualBase = hire.hourlyRate * hoursPerWeek * weeksPerYear
    }
    const hireIncreasePct = (hire.increasePct ?? 3) / 100
    const hireStartYearNum = getFYYear(hire.startMonth, fiscalYear)

    for (const mk of forecastMonthKeys) {
      if (mk < hire.startMonth) continue
      const yearNum = getFYYear(mk, fiscalYear)
      const yearsAfterStart = Math.max(0, yearNum - hireStartYearNum)
      const salaryForYear = annualBase * Math.pow(1 + hireIncreasePct, yearsAfterStart)
      addWage(mk, salaryForYear / 12, isContractor)
    }
  }

  // --- Bonuses (every year, calendar-month keyed, departure-guarded) ---
  for (const bonus of team.bonuses || []) {
    // bonus.month is CALENDAR 1-12 — the summary maps it into each FY with
    // the fiscal-year-start convention (months >= start month belong to the
    // FY's starting calendar year). The old converter treated it as a
    // fiscal index, shifting June bonuses to December.
    const departureMonth = departures.get(bonus.teamMemberId)
    for (const mk of forecastMonthKeys) {
      const m = parseInt(mk.split('-')[1], 10)
      if (m !== bonus.month) continue
      if (departureMonth && departureMonth < mk) continue
      addWage(mk, bonus.amount, false)
    }
  }

  // --- Commissions ---
  // Per-line monthly values for the month's year: Y1 uses year1Monthly, Y2/Y3
  // expand the quarterly maps. When a later year has no line data, fall back
  // to the summary's rule: total revenue × the line's Y1 share.
  const lineMonthlyValue = (
    revLine: RevenueLineAssumption | undefined,
    mk: string,
  ): number => {
    if (!revLine) return revenueByMonth[mk] || 0
    const yearNum = getFYYear(mk, fiscalYear)
    if (yearNum === 1 && revLine.year1Monthly && revLine.year1Monthly[mk] !== undefined) {
      return revLine.year1Monthly[mk]
    }
    if (yearNum >= 2) {
      const quarterly = yearNum === 2 ? revLine.year2Quarterly : revLine.year3Quarterly
      if (quarterly) {
        const expanded = expandQuarterlyToMonthly(
          quarterly,
          fyStartYearForYear(fiscalYear, yearNum),
        )
        if (expanded[mk] !== undefined) return expanded[mk]
      }
      // Summary's Y1-share fallback (P0-13)
      const lineY1 = Object.values(revLine.year1Monthly || {}).reduce((a, b) => a + b, 0)
      let totalY1 = 0
      for (const rl of assumptions.revenue.lines) {
        totalY1 += Object.values(rl.year1Monthly || {}).reduce((a, b) => a + b, 0)
      }
      const totalForMonth = revenueByMonth[mk] || 0
      if (totalY1 > 0) return totalForMonth * (lineY1 / totalY1)
      return totalForMonth
    }
    return revenueByMonth[mk] || 0
  }

  for (const comm of team.commissions || []) {
    const pct = (comm.percentOfRevenue || 0) / 100
    if (pct === 0) continue

    const revLine = assumptions.revenue.lines.find(
      rl => rl.accountId === comm.revenueLineId
    )

    if (comm.timing === 'monthly') {
      for (const mk of forecastMonthKeys) {
        addWage(mk, lineMonthlyValue(revLine, mk) * pct, false)
      }
    } else {
      // Accumulate the linked line's revenue across the period and pay it in
      // the period's last month — totals equal the summary's annual figure
      // regardless of seasonality (the old "×3 of the last month" / "×12 of
      // June" approximations were wrong for seasonal lines).
      const isQuarterEnd = (mk: string) => [3, 6, 9, 12].includes(parseInt(mk.split('-')[1], 10))
      const isYearEnd = (mk: string, idx: number) =>
        idx === forecastMonthKeys.length - 1 ||
        getFYYear(forecastMonthKeys[idx + 1], fiscalYear) !== getFYYear(mk, fiscalYear)
      let accrued = 0
      forecastMonthKeys.forEach((mk, idx) => {
        accrued += lineMonthlyValue(revLine, mk) * pct
        const payNow = comm.timing === 'quarterly' ? isQuarterEnd(mk) : isYearEnd(mk, idx)
        if (payNow && accrued > 0) {
          addWage(mk, accrued, false)
          accrued = 0
        }
      })
    }
  }

  // --- Super (employees only — summary parity) ---
  const superPct = (team.superannuationPct || 12) / 100
  const wagesPerMonth: Record<string, number> = {}
  const superPerMonth: Record<string, number> = {}
  for (const mk of forecastMonthKeys) {
    wagesPerMonth[mk] = round2(wagesEmployeePerMonth[mk] + wagesContractorPerMonth[mk])
    superPerMonth[mk] = round2(wagesEmployeePerMonth[mk] * superPct)
  }

  // --- Build P&L lines ---
  const teamLines: { name: string; code: string; data: Record<string, number> }[] = [
    { name: 'Wages & Salaries', code: SYS_CODES.wages, data: wagesPerMonth },
    { name: 'Superannuation', code: SYS_CODES.superannuation, data: superPerMonth },
  ]

  const result: PLLine[] = []

  for (const tl of teamLines) {
    // Skip lines that are all zeros
    const hasValues = Object.values(tl.data).some(v => v > 0)
    if (!hasValues) continue

    const existing = findMatchingLine(existingLines, tl.name)

    // D-44.1-06 vector 2/3 — merge tl.data over existing forecast_months. tl.data covers
    // every key in forecastMonthKeys (initialised to 0 then accumulated), so it overwrites
    // in-range keys; out-of-range keys (e.g., Y2/Y3 when forecastDuration=1) survive from
    // existing.
    const newForecastMonths: Record<string, number> = { ...(existing?.forecast_months || {}), ...tl.data }

    result.push({
      ...(existing ? { id: existing.id } : {}),
      account_name: existing?.account_name || tl.name,
      // PR-A (M4): stable synthetic code so the RPC upsert is idempotent —
      // a NULL code inserted a fresh duplicate row on every autosave.
      account_code: existing?.account_code || tl.code,
      category: 'Operating Expenses',
      subcategory: existing?.subcategory,
      sort_order: existing?.sort_order,
      actual_months: existing?.actual_months || {},
      forecast_months: newForecastMonths,
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
  const { assumptions, fiscalYear, existingLines } = ctx

  // Helper: build one flat-per-year line from per-year annual totals.
  const buildYearlyLine = (
    name: string,
    code: string,
    annualByYear: Record<number, number>,
  ): PLLine | null => {
    const hasValues = Object.values(annualByYear).some(v => v > 0)
    if (!hasValues) return null
    const existing = findMatchingLine(existingLines, name)
    const newForecastMonths: Record<string, number> = { ...(existing?.forecast_months || {}) }
    for (const mk of forecastMonthKeys) {
      const yearNum = getFYYear(mk, fiscalYear)
      newForecastMonths[mk] = round2((annualByYear[yearNum] || 0) / 12)
    }
    return {
      ...(existing ? { id: existing.id } : {}),
      account_name: existing?.account_name || name,
      // PR-A (M4): stable synthetic code — NULL codes duplicated on upsert.
      account_code: existing?.account_code || code,
      category: 'Operating Expenses',
      subcategory: existing?.subcategory,
      sort_order: existing?.sort_order,
      actual_months: existing?.actual_months || {},
      forecast_months: newForecastMonths,
      is_from_xero: existing?.is_from_xero || false,
      is_manual: false,
    }
  }

  // PR-A materializer fidelity (M8): the live Step 7 UI writes plannedSpends;
  // capex.items is only populated by legacy restores. The summary values
  // plannedSpends via getPlannedSpendPLBreakdown — use the SAME helper here
  // so the stored depreciation + expensed-spend lines equal the Step 8 Review
  // figures. When plannedSpends exist they take precedence over legacy capex
  // items (mirroring the summary's finalDepreciation/finalInvestments pick).
  if (assumptions.plannedSpends && assumptions.plannedSpends.length > 0) {
    const depByYear: Record<number, number> = {}
    const expByYear: Record<number, number> = {}
    for (const item of assumptions.plannedSpends) {
      for (const yearNum of [1, 2, 3] as const) {
        if (yearNum > ctx.forecastDuration) break
        const breakdown = getPlannedSpendPLBreakdown(item, yearNum)
        depByYear[yearNum] = (depByYear[yearNum] || 0) + breakdown.depreciation
        expByYear[yearNum] = (expByYear[yearNum] || 0) + breakdown.expenses
      }
    }
    const lines: PLLine[] = []
    // Distinct name: a Xero chart with its own "Depreciation" OpEx account
    // would otherwise collide on the name-keyed dedupe below and silently
    // DROP the planned-spend depreciation (the Xero line sorts first and
    // both carry ids, so the swap never fires). Distinct names also match
    // the summary, which adds plannedSpend depreciation ON TOP of any
    // prior-year depreciation line.
    const depLine = buildYearlyLine('Depreciation (planned purchases)', SYS_CODES.depreciation, depByYear)
    if (depLine) lines.push(depLine)
    const expLine = buildYearlyLine(
      'Planned Purchases (Expensed)',
      SYS_CODES.plannedSpendExpense,
      expByYear,
    )
    if (expLine) lines.push(expLine)
    return lines
  }

  // Legacy path: capex.items with 5-year straight-line depreciation.
  if (!assumptions.capex?.items?.length) return []

  let totalMonthlyDepreciation = 0
  for (const item of assumptions.capex.items) {
    const usefulLifeYears = 5
    totalMonthlyDepreciation += round2(item.amount / usefulLifeYears / 12)
  }

  if (totalMonthlyDepreciation <= 0) return []

  const existing = findMatchingLine(existingLines, 'Depreciation')

  // D-44.1-06 vector 2/3 — start from existing so out-of-range keys survive.
  const newForecastMonths: Record<string, number> = { ...(existing?.forecast_months || {}) }
  for (const mk of forecastMonthKeys) {
    newForecastMonths[mk] = round2(totalMonthlyDepreciation)
  }

  return [{
    ...(existing ? { id: existing.id } : {}),
    account_name: existing?.account_name || 'Depreciation',
    account_code: existing?.account_code || SYS_CODES.depreciation,
    category: 'Operating Expenses',
    subcategory: existing?.subcategory,
    sort_order: existing?.sort_order,
    actual_months: existing?.actual_months || {},
    forecast_months: newForecastMonths,
    is_from_xero: existing?.is_from_xero || false,
    is_manual: false,
  }]
}

// ---------------------------------------------------------------------------
// Subscriptions (PR-A M6 — vendor budgets become a real P&L line)
// ---------------------------------------------------------------------------

function convertSubscriptions(
  ctx: ConvertContext,
  forecastMonthKeys: string[]
): PLLine[] {
  const { assumptions, fiscalYear, existingLines } = ctx
  const vendors = assumptions.subscriptions?.vendors ?? []
  if (vendors.length === 0) return []

  const monthlyTotal = vendors.reduce((s, v) => s + (v.monthlyBudget || 0), 0)
  if (monthlyTotal <= 0) return []

  // Summary parity: Σ(active vendor monthly × 12) grown by the OpEx default
  // increase for Y2/Y3 (SubscriptionAuditSummary.annualGrowthPct snapshots
  // state.defaultOpExIncreasePct at save time).
  const growthPct = (assumptions.subscriptions?.annualGrowthPct ?? 3) / 100

  const existing = findMatchingLine(existingLines, 'Subscriptions (budgeted)')
  const newForecastMonths: Record<string, number> = { ...(existing?.forecast_months || {}) }
  for (const mk of forecastMonthKeys) {
    const yearNum = getFYYear(mk, fiscalYear)
    newForecastMonths[mk] = round2(monthlyTotal * Math.pow(1 + growthPct, yearNum - 1))
  }

  return [{
    ...(existing ? { id: existing.id } : {}),
    account_name: existing?.account_name || 'Subscriptions (budgeted)',
    account_code: existing?.account_code || SYS_CODES.subscriptions,
    category: 'Operating Expenses',
    subcategory: existing?.subcategory,
    sort_order: existing?.sort_order,
    actual_months: existing?.actual_months || {},
    forecast_months: newForecastMonths,
    is_from_xero: existing?.is_from_xero || false,
    is_manual: false,
  }]
}

// ---------------------------------------------------------------------------
// Parity buckets (PR-A M7/M13) — Other Income / Other Expenses / user one-offs
// ---------------------------------------------------------------------------

function convertParityBuckets(
  ctx: ConvertContext,
  forecastMonthKeys: string[]
): PLLine[] {
  const { assumptions, fiscalYear, existingLines } = ctx
  const lines: PLLine[] = []

  const buildFlatLine = (
    name: string,
    code: string,
    category: string,
    annualByYear: Record<number, number>,
  ): void => {
    const hasValues = Object.values(annualByYear).some(v => v !== 0)
    if (!hasValues) return
    const existing = findMatchingLine(existingLines, name)
    const newForecastMonths: Record<string, number> = { ...(existing?.forecast_months || {}) }
    for (const mk of forecastMonthKeys) {
      const yearNum = getFYYear(mk, fiscalYear)
      newForecastMonths[mk] = round2((annualByYear[yearNum] || 0) / 12)
    }
    lines.push({
      ...(existing ? { id: existing.id } : {}),
      account_name: existing?.account_name || name,
      account_code: existing?.account_code || code,
      category,
      subcategory: existing?.subcategory,
      sort_order: existing?.sort_order,
      actual_months: existing?.actual_months || {},
      forecast_months: newForecastMonths,
      is_from_xero: existing?.is_from_xero || false,
      is_manual: false,
    })
  }

  const years = [1, 2, 3].slice(0, ctx.forecastDuration) as number[]
  const everyYear = (amount: number) =>
    Object.fromEntries(years.map(y => [y, amount])) as Record<number, number>

  // Xero prior-FY Other Income / Other Expense — the summary carries the
  // prior-FY rate flat into every forecast year; without these lines every
  // line-sum consumer disagreed with the wizard's net profit by exactly
  // these amounts.
  if (assumptions.xeroOtherIncome) {
    buildFlatLine('Other Income', SYS_CODES.otherIncome, 'Other Income', everyYear(assumptions.xeroOtherIncome))
  }
  if (assumptions.xeroOtherExpense) {
    buildFlatLine('Other Expenses', SYS_CODES.otherExpense, 'Other Expenses', everyYear(assumptions.xeroOtherExpense))
  }

  return lines
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

  // --- Subscriptions (PR-A M6) ---
  let subscriptionLines: PLLine[] = []
  try {
    subscriptionLines = convertSubscriptions(ctx, forecastMonthKeys)
  } catch (err) {
    console.error('[assumptions-to-pl] Subscriptions conversion error:', err)
  }

  // --- Parity buckets: other income/expense + user one-offs (PR-A M7/M13) ---
  let parityLines: PLLine[] = []
  try {
    parityLines = convertParityBuckets(ctx, forecastMonthKeys)
  } catch (err) {
    console.error('[assumptions-to-pl] Parity bucket conversion error:', err)
  }

  // --- Merge with existing lines ---
  const generatedLines = [
    ...revenueLines,
    ...cogsLines,
    ...opexLines,
    ...teamLines,
    ...depreciationLines,
    ...subscriptionLines,
    ...parityLines,
  ]

  // Track which existing lines were matched
  const matchedExistingIds = new Set<string>()
  for (const gl of generatedLines) {
    if (gl.id) matchedExistingIds.add(gl.id)
  }

  // Start with generated lines, then add unmatched existing lines (preserve manual edits)
  const merged: PLLine[] = [...generatedLines]

  // Lines the wizard NO LONGER generates must not be resurrected by the
  // pass-through below — the RPC upsert only touches accounts present in the
  // payload, so a re-emitted stale row would persist forever at its old
  // value. Two cases:
  //   1. RETIRED_LINE_NAMES — the phantom statutory on-costs PR-A removed
  //      (they were never in the wizard summary; ~6.35% of payroll).
  //   2. Subscription-covered OpEx twins — their spend is now carried by the
  //      'Subscriptions (budgeted)' line, so keeping the original Xero row
  //      would double-count it.
  // is_manual rows are ALWAYS preserved: a coach override is intentional.
  const coveredSubscriptionCodes = new Set(
    (assumptions.subscriptions?.vendors ?? [])
      .flatMap(v => v.accountCodes ?? [])
      .map(c => String(c).trim())
      .filter(Boolean),
  )
  // 21 Aug 2026 audit (XVAL-1) — code-less twins of generated lines.
  //
  // Before PR #350 the converter emitted team/depreciation lines with a NULL
  // account_code. NULLs never match in the (forecast_id, account_code) upsert
  // key, so those rows could not be updated OR replaced by the SYS-coded lines
  // that superseded them: they simply sat alongside forever. Digital Bond's
  // live FY2027 forecast carried $244,999.92 of wages + $29,400 of super that
  // the wizard never planned, on top of the $175,735 it did — every consumer
  // summing forecast_pl_lines read the doubled figure.
  //
  // A non-manual, code-less line whose category+name the current payload also
  // generates is by definition superseded, so it is retired here.
  const generatedKeys = new Set(
    generatedLines.map(
      gl => `${(gl.category || '').toLowerCase()}|${gl.account_name.trim().toLowerCase()}`,
    ),
  )
  const isRetired = (line: PLLine): boolean => {
    if (line.is_manual) return false
    if (!line.account_code) {
      const key = `${(line.category || '').toLowerCase()}|${line.account_name.trim().toLowerCase()}`
      if (generatedKeys.has(key)) return true
    }
    // Retired-name matching applies ONLY to rows this converter itself
    // generated — historically with a NULL account_code, now with a SYS-*
    // code. Real Xero accounts genuinely named "Payroll Tax" / "WorkCover
    // Insurance" exist in client charts (Just Digital Signage carries both:
    // opex-4 $279,850 and opex-9 $91,132) and MUST survive; the
    // opex-classifier deliberately keeps them in OpEx.
    const isSynthetic = !line.account_code || line.account_code.startsWith('SYS-')
    if (isSynthetic && RETIRED_LINE_NAMES.has(line.account_name.trim().toLowerCase())) return true
    if (line.account_code && coveredSubscriptionCodes.has(line.account_code)) return true
    return false
  }

  for (const el of existingLines) {
    if (el.id && !matchedExistingIds.has(el.id) && !isRetired(el)) {
      merged.push(el)
    }
  }

  // --- Deduplicate lines with same category + account_name ---
  // Prevents double-counting when opex assumptions include team-cost accounts
  // that are also generated by convertTeam()
  const result: PLLine[] = []
  const seen = new Map<string, number>()
  for (const line of merged) {
    const key = `${(line.category || '').toLowerCase()}|${line.account_name.toLowerCase().trim()}`
    const existingIdx = seen.get(key)
    if (existingIdx !== undefined) {
      // Keep the line with a DB id (existing record), skip the duplicate
      if (!result[existingIdx].id && line.id) {
        result[existingIdx] = line
      }
    } else {
      seen.set(key, result.length)
      result.push(line)
    }
  }

  // --- Guard: unique account_code across the payload ---
  // save_assumptions_and_materialize bulk-upserts with
  // ON CONFLICT (forecast_id, account_code); two rows sharing a code make
  // Postgres raise 21000 ("cannot affect row a second time") and the whole
  // Generate 500s. This can happen when a synthetic SYS-* line reuses an
  // existing row's code, or when a Xero chart has two accounts with the same
  // code in different categories. Keep the first occurrence's code and null
  // the later ones (null codes still insert; they just don't upsert-match).
  const seenCodes = new Set<string>()
  for (const line of result) {
    const code = line.account_code
    if (!code) continue
    if (seenCodes.has(code)) {
      line.account_code = undefined
    } else {
      seenCodes.add(code)
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
