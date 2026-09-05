/**
 * Xero budget → forecast assumptions (pure transform).
 *
 * Fixture: FY2027 (Jul 2026 – Jun 2027), three-year horizon. The budget covers
 * Y1 fully for most accounts, Y2 fully, Y3 partially; two accounts are only
 * partially budgeted in Y1; one account is missing from the catalog (falls back
 * to the synced P&L type); one is unknown everywhere (must surface, not vanish).
 */
import { describe, it, expect } from 'vitest'
import {
  seedForecastFromXeroBudget,
  completedMonthKeysFor,
  type XeroBudgetSeedInput,
  type CatalogAccount,
  type AccountActuals,
} from '@/lib/services/xero-budget-seed-service'
import type { XeroBudgetLine } from '@/lib/xero/budgets'
import { generateFiscalMonthKeys } from '@/lib/utils/fiscal-year-utils'

const FY = 2027
const Y1 = generateFiscalMonthKeys(FY)       // 2026-07..2027-06
const Y2 = generateFiscalMonthKeys(FY + 1)
const Y3 = generateFiscalMonthKeys(FY + 2)
const PRIOR = generateFiscalMonthKeys(FY - 1) // 2025-07..2026-06

const flat = (keys: readonly string[], v: number): Record<string, number> =>
  Object.fromEntries(keys.map((k) => [k, v]))

const CATALOG: CatalogAccount[] = [
  { accountId: 'id-200', accountCode: '200', accountName: 'Sales', xeroType: 'REVENUE' },
  { accountId: 'id-260', accountCode: '260', accountName: 'Other Revenue', xeroType: 'REVENUE' },
  { accountId: 'id-310', accountCode: '310', accountName: 'Cost of Goods Sold', xeroType: 'DIRECTCOSTS' },
  { accountId: 'id-400', accountCode: '400', accountName: 'Advertising', xeroType: 'OVERHEADS' },
  { accountId: 'id-477', accountCode: '477', accountName: 'Wages and Salaries', xeroType: 'WAGESEXPENSE' },
  { accountId: 'id-478', accountCode: '478', accountName: 'Superannuation', xeroType: 'SUPERANNUATIONEXPENSE' },
  { accountId: 'id-470', accountCode: '470', accountName: 'Interest Income', xeroType: 'OTHERINCOME' },
  { accountId: 'id-480', accountCode: '480', accountName: 'Interest Expense', xeroType: 'OTHEREXPENSE', status: 'ARCHIVED' },
]

const ACTUALS: AccountActuals[] = [
  { accountCode: '200', accountName: 'Sales', accountType: 'revenue', monthly: flat(PRIOR, 10_000) },
  { accountCode: '400', accountName: 'Advertising', accountType: 'opex', monthly: flat(PRIOR, 300) },
  { accountCode: '999', accountName: 'Cleaning', accountType: 'opex', monthly: flat(PRIOR, 180) },
]

const line = (accountId: string | null, accountCode: string, months: Record<string, number>): XeroBudgetLine =>
  ({ accountId, accountCode, months })

const BUDGET_LINES: XeroBudgetLine[] = [
  line('id-200', '200', { ...flat(Y1, 11_000), ...flat(Y2, 12_000), ...flat(Y3.slice(0, 3), 13_000) }),
  line('id-260', '260', { ...flat(Y1.slice(0, 6), 1_000), ...flat(Y2, 1_000) }),
  line('id-310', '310', { ...flat(Y1, 4_000), ...flat(Y2, 4_400) }),
  line('id-400', '400', { ...flat(Y1.slice(0, 6), 500), ...flat(Y2, 600) }),
  line('id-477', '477', { ...flat(Y1, 20_000), ...flat(Y2, 21_000) }),
  line('id-478', '478', { ...flat(Y1, 2_400), ...flat(Y2, 2_520) }),
  line('id-470', '470', { ...flat(Y1, 100), ...flat(Y2, 100) }),
  line('id-480', '480', { ...flat(Y1, 50), ...flat(Y2, 50) }),
  line(null, '999', { ...flat(Y1, 200), ...flat(Y2, 200) }),       // not in catalog → P&L actuals type
  line(null, '998', { ...flat(Y1, 10) }),                          // unknown everywhere → unclassified
]

function input(over: Partial<XeroBudgetSeedInput> = {}): XeroBudgetSeedInput {
  return {
    budget: { budgetId: 'b-1', name: 'FY27 Budget', type: 'OVERALL', updatedAt: '2026-08-01T00:00:00.000Z', lines: BUDGET_LINES },
    org: { tenantId: 'tenant-1', orgName: 'Acme Pty Ltd', functionalCurrency: 'AUD' },
    catalog: CATALOG,
    actuals: ACTUALS,
    fiscalYear: FY,
    forecastDuration: 3,
    now: new Date('2026-09-05T02:00:00.000Z'),
    ...over,
  }
}

const sum = (m: Record<string, number> | undefined, keys: readonly string[]) =>
  Math.round(keys.reduce((s, k) => s + (m?.[k] ?? 0), 0) * 100) / 100

describe('classification', () => {
  const { assumptions: a, report } = seedForecastFromXeroBudget(input())

  it('places every budgeted account by catalog type, falling back to the synced P&L type', () => {
    expect(a.revenue.lines.map((l) => l.accountId).sort()).toEqual(['200', '260'])
    expect(a.cogs.lines.map((l) => l.accountId)).toEqual(['310'])
    expect(a.opex.lines.map((l) => l.accountId).sort()).toEqual(['400', '477', '478', '999'])
    expect(a.opex.lines.find((l) => l.accountId === '999')?.accountName).toBe('Cleaning')
    expect(a.xeroOtherIncome).toBe(1_200)
    expect(a.xeroOtherExpense).toBe(600)
    expect(report.counts).toEqual({ revenue: 2, cogs: 1, opex: 4, otherIncome: 1, otherExpense: 1 })
  })

  it('never drops an account silently — the unknown one is reported', () => {
    expect(report.unclassified).toEqual([{ accountCode: '998', accountName: 'Account 998', total: 120 }])
    expect(report.warnings.some((w) => w.includes('could not be categorised'))).toBe(true)
  })

  it('flags an archived account rather than skipping it', () => {
    expect(report.warnings.some((w) => w.includes('Interest Expense') && w.includes('archived'))).toBe(true)
  })

  it('uses the account CODE as accountId so stored lines carry the Xero code', () => {
    expect(a.opex.lines.find((l) => l.accountId === '400')?.accountCode).toBe('400')
  })
})

describe('revenue and COGS lines', () => {
  const { assumptions: a } = seedForecastFromXeroBudget(input())
  const sales = a.revenue.lines.find((l) => l.accountId === '200')!
  const other = a.revenue.lines.find((l) => l.accountId === '260')!
  const cogs = a.cogs.lines[0]

  it('carries the budget months verbatim into year1Monthly and the prior-year total from actuals', () => {
    expect(sum(sales.year1Monthly, Y1)).toBe(132_000)
    expect(sales.year1Monthly?.['2026-07']).toBe(11_000)
    expect(sales.priorYearTotal).toBe(120_000)
    expect(sales.growthPct).toBe(10)   // implied vs last year, for Step 3's display
  })

  it('treats a blank month INSIDE the budget window as $0 — never invents last year\'s figure', () => {
    expect(other.year1Monthly?.['2026-12']).toBe(1_000)
    expect(other.year1Monthly?.['2027-01']).toBe(0)      // blank in Budget Manager = zero
    expect(sum(other.year1Monthly, Y1)).toBe(6_000)
    expect(other.growthPct).toBeUndefined()               // no prior actuals → nothing to compare to
  })

  it('sets COGS as % of budgeted revenue and keeps the monthly grid', () => {
    expect(sum(cogs.year1Monthly, Y1)).toBe(48_000)
    expect(cogs.percentOfRevenue).toBe(34.78)             // 48,000 / 138,000
    expect(cogs.costBehavior).toBe('variable')
    expect(a.cogs.overallCogsPct).toBe(34.78)
  })

  it('takes a fully covered Y2 verbatim and ignores a partial Y3 with a warning', () => {
    expect(sum(sales.year2Monthly, Y2)).toBe(144_000)
    expect(sales.year3Monthly).toBeUndefined()
    const { report } = seedForecastFromXeroBudget(input())
    expect(report.coverage.yearsFullyCovered).toEqual([2])
    expect(report.warnings.some((w) => w.includes(`FY${FY + 2}`))).toBe(true)
  })
})

describe('OpEx lines', () => {
  const { assumptions: a, report } = seedForecastFromXeroBudget(input())
  const adv = a.opex.lines.find((l) => l.accountId === '400')!
  const wages = a.opex.lines.find((l) => l.accountId === '477')!

  it('are "as budgeted"; a blank month inside the window is $0 even when last year had spend', () => {
    expect(adv.costBehavior).toBe('budgeted')
    expect(adv.budgetedMonthly?.['2026-12']).toBe(500)   // budgeted
    expect(adv.budgetedMonthly?.['2027-01']).toBe(0)     // blank → zero (NOT last year's 300)
    expect(sum(adv.budgetedMonthly, Y1)).toBe(3_000)
    expect(adv.priorYearTotal).toBe(3_600)
  })

  it('carry a full later-year grid when the window spans that year (blanks as $0), none beyond it', () => {
    expect(adv.budgetedMonthly?.['2027-07']).toBe(600)
    expect(wages.budgetedMonthly?.['2027-07']).toBe(21_000)
    const cleaning = a.opex.lines.find((l) => l.accountId === '999')!
    expect(cleaning.budgetedMonthly?.['2027-07']).toBe(200)
    expect(Object.keys(adv.budgetedMonthly ?? {}).some((k) => k >= '2028-07')).toBe(false) // Y3 not spanned
  })

  it('keep wages/super as budgeted lines (the wizard\'s coverage-aware rule decides) and report them', () => {
    expect(wages).toBeDefined()
    expect(report.teamCostBudget.total).toBe(268_800)   // 240,000 + 28,800
    expect(report.teamCostBudget.byKind.payroll).toBe(268_800)
    expect(report.teamCostBudget.lines.map((l) => l.accountCode).sort()).toEqual(['477', '478'])
    expect(report.warnings.some((w) => w.includes('wages/super'))).toBe(true)
  })

  it('counts blanks inside the window as zeroed, and fills nothing when the window spans the FY', () => {
    // 260: 6 blank months, 400: 6 blank months — all inside Jul 2026 → Sep 2028
    expect(report.coverage.monthsZeroed).toBe(12)
    expect(report.coverage.monthsFilled).toBe(0)
    expect(report.coverage.monthsInFY).toBe(12)
    expect(report.warnings.some((w) => w.includes('outside the budget'))).toBe(false)
  })
})

describe('goals, seasonality, provenance', () => {
  const { assumptions: a, report } = seedForecastFromXeroBudget(input())

  it('pre-fills Step 1 goals from the budget\'s own totals (wages included, as the client set it)', () => {
    // Y1: rev 132,000 + 6,000 = 138,000; cogs 48,000; opex 3,000 + 240,000 + 28,800 + 2,400 = 274,200; OI 1,200; OE 600
    expect(a.goals?.year1).toEqual({ revenue: 138_000, grossProfitPct: 65.2, netProfitPct: -133 })
    // Y2 fully covered → its own goals; other income/expense carried flat
    expect(a.goals?.year2).toEqual({ revenue: 156_000, grossProfitPct: 66.2, netProfitPct: -120.5 })
    expect(a.goals?.year3).toBeUndefined()
    expect(report.goals).toEqual(a.goals?.year1)
  })

  it('derives the revenue seasonality from the budget (sums to 100)', () => {
    const total = a.revenue.seasonalityPattern.reduce((s, v) => s + v, 0)
    expect(Math.abs(total - 100)).toBeLessThan(0.1)
    expect(a.revenue.seasonalitySource).toBe('manual')
  })

  it('records one-shot provenance and the defaults the wizard expects', () => {
    expect(a.seedSource).toMatchObject({
      kind: 'xero_budget', tenantId: 'tenant-1', orgName: 'Acme Pty Ltd', budgetId: 'b-1', budgetName: 'FY27 Budget',
      budgetType: 'OVERALL', seededAt: '2026-09-05T02:00:00.000Z', teamCostBudgetTotal: 268_800, unclassifiedCount: 1,
    })
    expect(a.seedSource?.coverage).toMatchObject({ firstPeriod: '2026-07', lastPeriod: '2028-09', monthsInFY: 12, monthsFilled: 0 })
    expect(a.team).toMatchObject({ existingTeam: [], plannedHires: [], superannuationPct: 12 })
    expect(a.capex.items).toEqual([])
    expect(a.opex.defaultIncreasePct).toBe(3)
    expect(a.fiscalYearStart).toBe('07')
    expect(a.revenue.lines[0].notes).toContain('FY27 Budget')
  })
})

describe('a budget that does not extend to the whole year (window ends early)', () => {
  const partial = [
    line('id-200', '200', flat(Y1.slice(0, 6), 11_000)),   // Jul–Dec only, for EVERY line
    line('id-400', '400', flat(Y1.slice(0, 6), 500)),
  ]
  const { assumptions: a, report } = seedForecastFromXeroBudget(input({
    forecastDuration: 1,
    budget: { budgetId: 'b', name: 'H1 budget', type: 'OVERALL', updatedAt: null, lines: partial },
  }))

  it('fills months OUTSIDE the window from last year\'s same month (else the budgeted average) and says so', () => {
    const sales = a.revenue.lines[0]
    expect(sales.year1Monthly?.['2026-12']).toBe(11_000)
    expect(sales.year1Monthly?.['2027-01']).toBe(10_000)   // Jan 2026 actual
    const adv = a.opex.lines[0]
    expect(adv.budgetedMonthly?.['2027-03']).toBe(300)      // Mar 2026 actual
    expect(report.coverage).toMatchObject({ firstPeriod: '2026-07', lastPeriod: '2026-12', monthsInFY: 6, monthsFilled: 12, monthsZeroed: 0 })
    expect(report.warnings.some((w) => w.includes('outside the budget'))).toBe(true)
  })
})

describe('current-FY seed: months already lived are actuals, not budget', () => {
  it('locks completed months to the synced actuals', () => {
    const actuals: AccountActuals[] = [
      { accountCode: '200', accountName: 'Sales', accountType: 'revenue', monthly: { ...flat(PRIOR, 10_000), '2026-07': 10_500, '2026-08': 9_900 } },
    ]
    const { assumptions: a } = seedForecastFromXeroBudget(input({
      actuals,
      forecastDuration: 1,
      budget: { budgetId: 'b', name: 'B', type: 'OVERALL', updatedAt: null, lines: [line('id-200', '200', flat(Y1, 11_000))] },
      completedMonthKeys: ['2026-07', '2026-08'],
    }))
    const sales = a.revenue.lines[0]
    expect(sales.year1Monthly?.['2026-07']).toBe(10_500)
    expect(sales.year1Monthly?.['2026-08']).toBe(9_900)
    expect(sales.year1Monthly?.['2026-09']).toBe(11_000)
    expect(sales.priorYearTotal).toBe(120_000) // prior FY only — current-FY actuals are not "prior year"
  })

  it('completedMonthKeysFor lists the FY months that ended before now (UTC)', () => {
    expect(completedMonthKeysFor(FY, new Date('2026-09-05T02:00:00Z'))).toEqual(['2026-07', '2026-08'])
    expect(completedMonthKeysFor(FY, new Date('2026-06-30T23:00:00Z'))).toEqual([])
    expect(completedMonthKeysFor(FY, new Date('2027-07-01T00:00:00Z'))).toHaveLength(12)
  })
})

describe('edge cases', () => {
  it('a budget with no revenue accounts still seeds and warns', () => {
    const { assumptions: a, report } = seedForecastFromXeroBudget(input({
      forecastDuration: 1,
      budget: { budgetId: 'b', name: 'B', type: 'OVERALL', updatedAt: null, lines: [line('id-400', '400', flat(Y1, 500))] },
    }))
    expect(a.revenue.lines).toEqual([])
    expect(a.goals?.year1).toEqual({ revenue: 0, grossProfitPct: 0, netProfitPct: 0 })
    expect(a.revenue.seasonalityPattern).toHaveLength(12)
    expect(report.warnings.some((w) => w.includes('no revenue accounts'))).toBe(true)
  })

  it('a one-year horizon stores no later-year months even when the budget has them', () => {
    const { assumptions: a } = seedForecastFromXeroBudget(input({ forecastDuration: 1 }))
    const adv = a.opex.lines.find((l) => l.accountId === '400')!
    expect(Object.keys(adv.budgetedMonthly ?? {}).every((k) => Y1.includes(k))).toBe(true)
    expect(a.revenue.lines[0].year2Monthly).toBeUndefined()
    expect(a.goals?.year2).toBeUndefined()
  })

  it('does not mutate its input', () => {
    const inp = input()
    const snapshot = JSON.stringify(inp.budget.lines)
    seedForecastFromXeroBudget(inp)
    expect(JSON.stringify(inp.budget.lines)).toBe(snapshot)
  })
})
