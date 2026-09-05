/**
 * Xero budget → forecast assumptions. Pure function, no I/O.
 *
 * The third way to start a forecast (beside "seed from last year" and "start
 * fresh"): take the client's Xero Budget Manager budget and turn it into the
 * wizard's assumptions so the coach can shape it. Decisions locked with Matt
 * on 5 Sep 2026 (.planning/XERO-BUDGET-SEED-PLAN.md):
 *   - opt-in only; one-shot; goals PRE-FILLED from the budget's own totals;
 *   - revenue/COGS land in `year1Monthly` (honoured verbatim downstream);
 *   - OpEx lands as `costBehavior: 'budgeted'` (explicit per-month amounts);
 *   - one Xero org per seed — never cross-org sums.
 *
 * Team costs: wages/super/contractor accounts are IMPORTED as budgeted OpEx
 * lines, not dropped. The wizard already applies coverage-aware exclusion
 * (shouldExcludeFromOpEx: a team-cost line leaves the OpEx total once Step 4
 * carries employees, and stays if Step 4 is empty), so dropping them here would
 * silently lose wages for a business with no payroll in Xero. They are listed
 * in `report.teamCostBudget` so the UI can show budget-vs-payroll.
 *
 * Nothing is dropped silently: accounts that cannot be classified are returned
 * in `report.unclassified`.
 *
 * Missing months. Xero's Budgets API omits a BudgetBalance for a cell the
 * client left at zero (seen live: Urban Road's lumpy Art Import / Insurance
 * lines came back with gaps that are $0 in Budget Manager). So a month that is
 * missing INSIDE the budget's overall window is budgeted ZERO and is imported
 * as 0 — never invented from last year's actuals (the first Urban Road seed did
 * exactly that and injected ~$115k the client never budgeted). Only months
 * OUTSIDE the window — the budget simply does not extend there — are filled
 * explicitly (prior-year actual for that calendar month, else the budgeted
 * average) and counted in `report.coverage.monthsFilled`.
 */
import type {
  ForecastAssumptions,
  RevenueLineAssumption,
  COGSLineAssumption,
  OpExLineAssumption,
  YearlyGoalsAssumption,
} from '@/app/finances/forecast/components/wizard-v4/types/assumptions'
import { classifyByXeroType } from '@/lib/xero/accounts-catalog'
import { classifyTeamCost } from '@/app/finances/forecast/components/wizard-v4/utils/opex-classifier'
import { generateFiscalMonthKeys, DEFAULT_YEAR_START_MONTH } from '@/lib/utils/fiscal-year-utils'
import type { XeroBudgetLine, XeroBudgetType } from '@/lib/xero/budgets'

export type PLBucket = 'revenue' | 'cogs' | 'opex' | 'other_income' | 'other_expense'

/** One chart-of-accounts row (xero_accounts). */
export interface CatalogAccount {
  accountId: string
  accountCode: string | null
  accountName: string
  xeroType: string | null
  status?: string | null
}

/** Synced P&L actuals for one account (xero_pl_lines_wide_compat row). */
export interface AccountActuals {
  accountCode: string
  accountName: string
  /** Our 5-bucket type as stored by the sync ('revenue' | 'cogs' | 'opex' | 'other_income' | 'other_expense'). */
  accountType: string | null
  /** "YYYY-MM" → amount. */
  monthly: Record<string, number>
}

export interface XeroBudgetSeedInput {
  budget: {
    budgetId: string
    name: string
    type: XeroBudgetType
    updatedAt: string | null
    lines: XeroBudgetLine[]
  }
  org: { tenantId: string; orgName: string; functionalCurrency?: string | null }
  catalog: CatalogAccount[]
  fiscalYear: number
  yearStartMonth?: number
  forecastDuration: 1 | 2 | 3
  /** Actuals by account code: prior FY (for priorYearTotal + gap fill) and any completed months of the target FY. */
  actuals?: AccountActuals[]
  /** Month keys of the target FY that are already actual — locked to actuals (#347/#349 rule). */
  completedMonthKeys?: string[]
  defaultOpExIncreasePct?: number
  teamDefaults?: { superannuationPct: number; workCoverPct: number; payrollTaxPct: number }
  now?: Date
}

export interface SeedLineNote {
  accountCode: string | null
  accountName: string
  total: number
}

export interface XeroBudgetSeedReport {
  counts: { revenue: number; cogs: number; opex: number; otherIncome: number; otherExpense: number }
  /** Team-cost accounts imported as budgeted OpEx (Step 4 supersedes them once payroll is imported). */
  teamCostBudget: { total: number; byKind: Record<'payroll' | 'contractor' | 'unmodelled', number>; lines: SeedLineNote[] }
  unclassified: SeedLineNote[]
  coverage: {
    firstPeriod: string | null
    lastPeriod: string | null
    monthsInFY: number
    /** Y1 month-cells OUTSIDE the budget's window that we filled explicitly. */
    monthsFilled: number
    /** Month-cells INSIDE the window that the budget left blank — imported as $0. */
    monthsZeroed: number
    /** Later years fully covered by the budget (used verbatim); others roll forward. */
    yearsFullyCovered: Array<2 | 3>
  }
  goals: YearlyGoalsAssumption
  warnings: string[]
}

export interface XeroBudgetSeedResult {
  assumptions: ForecastAssumptions
  forecastDuration: number
  report: XeroBudgetSeedReport
}

/** Provenance stored on the assumptions (one-shot; there is no re-pull). */
export interface ForecastSeedSource {
  kind: 'xero_budget'
  tenantId: string
  orgName: string
  functionalCurrency?: string | null
  budgetId: string
  budgetName: string
  budgetType: XeroBudgetType
  budgetUpdatedAt: string | null
  seededAt: string
  coverage: { firstPeriod: string | null; lastPeriod: string | null; monthsInFY: number; monthsFilled: number }
  teamCostBudgetTotal: number
  unclassifiedCount: number
}

const round2 = (n: number) => Math.round(n * 100) / 100
const round1 = (n: number) => Math.round(n * 10) / 10

function bucketFromStoredType(t: string | null | undefined): PLBucket | null {
  switch ((t ?? '').toLowerCase()) {
    case 'revenue': return 'revenue'
    case 'cogs': return 'cogs'
    case 'opex': return 'opex'
    case 'other_income': return 'other_income'
    case 'other_expense': return 'other_expense'
    default: return null
  }
}

function sumOver(months: Record<string, number>, keys: readonly string[]): number {
  let s = 0
  for (const k of keys) s += months[k] ?? 0
  return round2(s)
}

interface ResolvedLine {
  accountId: string | null
  accountCode: string
  accountName: string
  bucket: PLBucket | null
  months: Record<string, number>
  priorMonthly: Record<string, number>
}

export function seedForecastFromXeroBudget(input: XeroBudgetSeedInput): XeroBudgetSeedResult {
  const yearStartMonth = input.yearStartMonth ?? DEFAULT_YEAR_START_MONTH
  const duration = input.forecastDuration
  const now = input.now ?? new Date()
  const nowIso = now.toISOString()
  const y1Keys = generateFiscalMonthKeys(input.fiscalYear, yearStartMonth)
  const y2Keys = generateFiscalMonthKeys(input.fiscalYear + 1, yearStartMonth)
  const y3Keys = generateFiscalMonthKeys(input.fiscalYear + 2, yearStartMonth)
  const priorKeys = generateFiscalMonthKeys(input.fiscalYear - 1, yearStartMonth)
  const completed = new Set(input.completedMonthKeys ?? [])
  const warnings: string[] = []

  const catalogById = new Map(input.catalog.map((a) => [a.accountId, a]))
  const catalogByCode = new Map(
    input.catalog.filter((a) => a.accountCode).map((a) => [a.accountCode as string, a]),
  )
  const actualsByCode = new Map((input.actuals ?? []).map((a) => [a.accountCode, a]))

  // ── 1. Resolve identity + bucket for every budget line ────────────────────
  const resolved: ResolvedLine[] = []
  for (const bl of input.budget.lines) {
    const cat = (bl.accountId && catalogById.get(bl.accountId)) || (bl.accountCode && catalogByCode.get(bl.accountCode)) || null
    const code = cat?.accountCode ?? bl.accountCode ?? bl.accountId ?? null
    if (!code) continue
    const act = actualsByCode.get(code)
    const bucket =
      (classifyByXeroType(cat?.xeroType) as PLBucket | null) ??
      bucketFromStoredType(act?.accountType)
    resolved.push({
      accountId: bl.accountId ?? cat?.accountId ?? null,
      accountCode: code,
      accountName: cat?.accountName ?? act?.accountName ?? `Account ${code}`,
      bucket,
      months: bl.months,
      priorMonthly: act?.monthly ?? {},
    })
    if (cat?.status && cat.status.toUpperCase() === 'ARCHIVED') {
      warnings.push(`${cat.accountName} (${code}) is archived in Xero but budgeted — imported and flagged.`)
    }
  }

  // ── 2. Coverage window + Y1 fill rule ────────────────────────────────────
  // The budget's overall window is what Xero returned any cell for. Inside it,
  // a missing cell is a zero the client left blank; outside it, the budget does
  // not exist yet and we fill explicitly (and say so).
  const periods = new Set<string>()
  for (const bl of input.budget.lines) for (const k of Object.keys(bl.months)) periods.add(k)
  const sortedPeriods = Array.from(periods).sort()
  const budgetFirst = sortedPeriods[0] ?? null
  const budgetLast = sortedPeriods[sortedPeriods.length - 1] ?? null
  const inWindow = (k: string) => budgetFirst !== null && budgetLast !== null && k >= budgetFirst && k <= budgetLast
  const windowSpans = (keys: readonly string[]) => keys.length > 0 && inWindow(keys[0]) && inWindow(keys[keys.length - 1])

  let monthsFilled = 0
  let monthsZeroed = 0
  const fillY1 = (line: ResolvedLine): Record<string, number> => {
    const out: Record<string, number> = {}
    const covered = y1Keys.filter((k) => typeof line.months[k] === 'number')
    const avg = covered.length > 0 ? sumOver(line.months, covered) / covered.length : 0
    for (const k of y1Keys) {
      if (completed.has(k)) {
        // Months already lived are actuals, not budget — the wizard's own lock rule.
        out[k] = round2(line.priorMonthly[k] ?? 0)
        continue
      }
      if (typeof line.months[k] === 'number') {
        out[k] = round2(line.months[k])
        continue
      }
      if (inWindow(k)) {
        // Blank cell inside the budget → the client budgeted zero.
        out[k] = 0
        monthsZeroed++
        continue
      }
      // Outside the budget's window: last year's same calendar month if we have it, else the budgeted average.
      const [, mm] = k.split('-')
      const priorSameMonth = priorKeys.find((pk) => pk.endsWith(`-${mm}`))
      const fill = priorSameMonth !== undefined && typeof line.priorMonthly[priorSameMonth] === 'number'
        ? line.priorMonthly[priorSameMonth]
        : avg
      out[k] = round2(fill)
      monthsFilled++
    }
    return out
  }
  /** A later year the budget's window spans: explicit cells verbatim, blanks are $0. */
  const fullYear = (line: ResolvedLine, keys: readonly string[]): Record<string, number> => {
    const out: Record<string, number> = {}
    for (const k of keys) out[k] = typeof line.months[k] === 'number' ? round2(line.months[k]) : 0
    return out
  }
  const yearsFullyCovered: Array<2 | 3> = []
  if (duration >= 2) {
    if (windowSpans(y2Keys)) yearsFullyCovered.push(2)
    else if (inWindow(y2Keys[0])) warnings.push(`The budget covers only part of FY${input.fiscalYear + 1}; year 2 rolls forward from year 1 instead.`)
  }
  if (duration >= 3) {
    if (windowSpans(y3Keys)) yearsFullyCovered.push(3)
    else if (inWindow(y3Keys[0])) warnings.push(`The budget covers only part of FY${input.fiscalYear + 2}; year 3 rolls forward instead.`)
  }

  // ── 3. Build lines per bucket ─────────────────────────────────────────────
  const revenueLines: RevenueLineAssumption[] = []
  const cogsLines: COGSLineAssumption[] = []
  const opexLines: OpExLineAssumption[] = []
  const unclassified: SeedLineNote[] = []
  let otherIncomeY1 = 0
  let otherExpenseY1 = 0
  const teamCost = { total: 0, byKind: { payroll: 0, contractor: 0, unmodelled: 0 } as Record<'payroll' | 'contractor' | 'unmodelled', number>, lines: [] as SeedLineNote[] }
  let teamCostAllYears = 0

  for (const line of resolved) {
    const y1 = fillY1(line)
    const y1Total = sumOver(y1, y1Keys)
    const priorTotal = sumOver(line.priorMonthly, priorKeys)
    const y2 = yearsFullyCovered.includes(2) ? fullYear(line, y2Keys) : undefined
    const y3 = yearsFullyCovered.includes(3) ? fullYear(line, y3Keys) : undefined

    switch (line.bucket) {
      case 'revenue': {
        revenueLines.push({
          accountId: line.accountCode,
          accountName: line.accountName,
          priorYearTotal: priorTotal,
          growthType: 'percentage',
          growthPct: priorTotal > 0 ? round1(((y1Total - priorTotal) / priorTotal) * 100) : undefined,
          year1Monthly: y1,
          year2Monthly: y2,
          year3Monthly: y3,
          notes: `From Xero budget "${input.budget.name}"`,
        })
        break
      }
      case 'cogs': {
        cogsLines.push({
          accountId: line.accountCode,
          accountName: line.accountName,
          priorYearTotal: priorTotal,
          costBehavior: 'variable',
          percentOfRevenue: 0, // set below once total revenue is known
          year1Monthly: y1,
          year2Monthly: y2,
          year3Monthly: y3,
          notes: `From Xero budget "${input.budget.name}"`,
        })
        break
      }
      case 'opex': {
        // All covered months (Y1 filled + any explicit later months) — the shared
        // projection rolls uncovered later years forward by calendar month.
        const budgetedMonthly: Record<string, number> = { ...y1 }
        if (yearsFullyCovered.includes(2)) Object.assign(budgetedMonthly, fullYear(line, y2Keys))
        if (yearsFullyCovered.includes(3)) Object.assign(budgetedMonthly, fullYear(line, y3Keys))
        opexLines.push({
          accountId: line.accountCode,
          accountName: line.accountName,
          accountCode: line.accountCode,
          priorYearTotal: priorTotal,
          costBehavior: 'budgeted',
          budgetedMonthly,
          notes: `From Xero budget "${input.budget.name}"`,
        })
        const kind = classifyTeamCost(line.accountName)
        if (kind) {
          teamCost.total = round2(teamCost.total + y1Total)
          teamCost.byKind[kind] = round2(teamCost.byKind[kind] + y1Total)
          teamCost.lines.push({ accountCode: line.accountCode, accountName: line.accountName, total: y1Total })
          teamCostAllYears += y1Total
        }
        break
      }
      case 'other_income':
        otherIncomeY1 = round2(otherIncomeY1 + y1Total)
        break
      case 'other_expense':
        otherExpenseY1 = round2(otherExpenseY1 + y1Total)
        break
      default:
        unclassified.push({ accountCode: line.accountCode, accountName: line.accountName, total: sumOver(line.months, Object.keys(line.months)) })
    }
  }
  void teamCostAllYears

  // ── 4. Totals, COGS %, goals, seasonality ────────────────────────────────
  const totalFor = (lines: Array<{ year1Monthly?: Record<string, number>; year2Monthly?: Record<string, number>; year3Monthly?: Record<string, number> }>, year: 1 | 2 | 3) =>
    round2(lines.reduce((s, l) => {
      const m = year === 1 ? l.year1Monthly : year === 2 ? l.year2Monthly : l.year3Monthly
      return s + (m ? Object.values(m).reduce((a, b) => a + b, 0) : 0)
    }, 0))
  const revY1 = totalFor(revenueLines, 1)
  const cogsY1 = totalFor(cogsLines, 1)
  const opexY1 = round2(opexLines.reduce((s, l) => s + sumOver(l.budgetedMonthly ?? {}, y1Keys), 0))
  for (const c of cogsLines) {
    const t = sumOver(c.year1Monthly ?? {}, y1Keys)
    c.percentOfRevenue = revY1 > 0 ? round2((t / revY1) * 100) : 0
  }

  const goalsFor = (rev: number, cogs: number, opex: number, oi: number, oe: number): YearlyGoalsAssumption => ({
    revenue: round2(rev),
    grossProfitPct: rev > 0 ? round1(((rev - cogs) / rev) * 100) : 0,
    netProfitPct: rev > 0 ? round1(((rev - cogs - opex + oi - oe) / rev) * 100) : 0,
  })
  const goals: ForecastAssumptions['goals'] = { year1: goalsFor(revY1, cogsY1, opexY1, otherIncomeY1, otherExpenseY1) }
  for (const y of yearsFullyCovered) {
    const keys = y === 2 ? y2Keys : y3Keys
    const rev = totalFor(revenueLines, y)
    const cogs = totalFor(cogsLines, y)
    const opex = round2(opexLines.reduce((s, l) => s + sumOver(l.budgetedMonthly ?? {}, keys), 0))
    // Other income/expense are carried flat by the wizard; use the Y1 figures.
    const g = goalsFor(rev, cogs, opex, otherIncomeY1, otherExpenseY1)
    if (y === 2) goals.year2 = g
    else goals.year3 = g
  }

  const revByMonth = y1Keys.map((k) => revenueLines.reduce((s, l) => s + (l.year1Monthly?.[k] ?? 0), 0))
  const seasonalityPattern = revY1 > 0
    ? revByMonth.map((v) => round2((v / revY1) * 100))
    : Array(12).fill(round2(100 / 12))

  if (revenueLines.length === 0) warnings.push('The budget has no revenue accounts — Step 3 will start empty.')
  if (unclassified.length > 0) warnings.push(`${unclassified.length} budgeted account(s) could not be categorised and were left out — see the list in Step 5.`)
  if (monthsFilled > 0) warnings.push(`${monthsFilled} month-cell(s) fall outside the budget's window and were filled from last year's actuals or the budgeted average.`)
  if (teamCost.lines.length > 0) warnings.push(`${teamCost.lines.length} wages/super account(s) came in from the budget; Step 4 payroll replaces them once staff are imported.`)

  // ── 5. Assemble ──────────────────────────────────────────────────────────
  const coverage = {
    firstPeriod: budgetFirst,
    lastPeriod: budgetLast,
    monthsInFY: y1Keys.filter((k) => periods.has(k)).length,
    monthsFilled,
    monthsZeroed,
    yearsFullyCovered,
  }

  const seedSource: ForecastSeedSource = {
    kind: 'xero_budget',
    tenantId: input.org.tenantId,
    orgName: input.org.orgName,
    functionalCurrency: input.org.functionalCurrency ?? null,
    budgetId: input.budget.budgetId,
    budgetName: input.budget.name,
    budgetType: input.budget.type,
    budgetUpdatedAt: input.budget.updatedAt,
    seededAt: nowIso,
    coverage: { firstPeriod: coverage.firstPeriod, lastPeriod: coverage.lastPeriod, monthsInFY: coverage.monthsInFY, monthsFilled },
    teamCostBudgetTotal: teamCost.total,
    unclassifiedCount: unclassified.length,
  }

  const assumptions: ForecastAssumptions = {
    version: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
    fiscalYearStart: String(yearStartMonth).padStart(2, '0'),
    goals,
    revenue: { lines: revenueLines, seasonalityPattern, seasonalitySource: 'manual' },
    cogs: { lines: cogsLines, overallCogsPct: revY1 > 0 ? round2((cogsY1 / revY1) * 100) : undefined },
    team: {
      existingTeam: [],
      plannedHires: [],
      superannuationPct: input.teamDefaults?.superannuationPct ?? 12,
      workCoverPct: input.teamDefaults?.workCoverPct ?? 1.5,
      payrollTaxPct: input.teamDefaults?.payrollTaxPct ?? 4.85,
    },
    opex: { lines: opexLines, defaultIncreasePct: input.defaultOpExIncreasePct ?? 3 },
    capex: { items: [] },
    plannedSpends: [],
    xeroOtherIncome: otherIncomeY1 || undefined,
    xeroOtherExpense: otherExpenseY1 || undefined,
    seedSource,
  }

  return {
    assumptions,
    forecastDuration: duration,
    report: {
      counts: {
        revenue: revenueLines.length,
        cogs: cogsLines.length,
        opex: opexLines.length,
        otherIncome: resolved.filter((l) => l.bucket === 'other_income').length,
        otherExpense: resolved.filter((l) => l.bucket === 'other_expense').length,
      },
      teamCostBudget: teamCost,
      unclassified,
      coverage,
      goals: goals.year1,
      warnings,
    },
  }
}

/** Which months of the target FY have already ended, given `now` (UTC). */
export function completedMonthKeysFor(fiscalYear: number, now: Date, yearStartMonth: number = DEFAULT_YEAR_START_MONTH): string[] {
  const keys = generateFiscalMonthKeys(fiscalYear, yearStartMonth)
  const current = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  return keys.filter((k) => k < current)
}
