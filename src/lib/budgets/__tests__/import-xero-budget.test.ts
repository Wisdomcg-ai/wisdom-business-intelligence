/**
 * Distinct Directions FY2027, from the client's own forecast workbook and the
 * Calxa pack for August 2026. These are not snapshots of our own output — they
 * are the numbers the client is measured against, so the test is a real
 * reconciliation.
 */
import { describe, it, expect } from 'vitest'
import { buildBudgetFromXero, defaultEffectiveFrom } from '../import-xero-budget'

const FY27 = [
  '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12',
  '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06',
] as const

const account = (accountId: string, accountCode: string, accountName: string, xeroType: string) => ({
  accountId,
  accountCode,
  accountName,
  xeroType,
  status: 'ACTIVE',
})

const budgetLine = (accountId: string, accountCode: string, months: Record<string, number>) => ({
  accountId,
  accountCode,
  months,
})

// Three of DD's real accounts, with the August and September figures from the
// pack: Bathurst income, Bathurst wages, and the flat Bathurst COGS.
const CATALOG = [
  account('a-1', '215.1', 'BATHURST: Behavioural Assessment Income', 'REVENUE'),
  account('a-2', '477.1', 'BATHURST: Wages and Salaries', 'WAGESEXPENSE'),
  account('a-3', '310.1', 'BATHURST: Cost of Goods Sold', 'DIRECTCOSTS'),
]

const BUDGET = [
  budgetLine('a-1', '215.1', { '2026-07': 252746.35, '2026-08': 222876.58, '2026-09': 272117.63 }),
  budgetLine('a-2', '477.1', { '2026-07': 145512.90, '2026-08': 116410.32, '2026-09': 116410.32 }),
  budgetLine('a-3', '310.1', { '2026-07': 200, '2026-08': 200, '2026-09': 200 }),
]

const build = (over: Partial<Parameters<typeof buildBudgetFromXero>[0]> = {}) =>
  buildBudgetFromXero({ budgetLines: BUDGET, catalog: CATALOG, fyMonthKeys: FY27, ...over })

describe('buildBudgetFromXero', () => {
  it('keeps the ELAPSED months the forecast seed drops — the whole point', () => {
    const built = build()
    const august = built.lines.filter((l) => l.month === '2026-08')
    expect(august).toHaveLength(3)
    // Jul and Aug are closed months on 8 Sep 2026; the seed writes neither.
    expect(built.lines.some((l) => l.month === '2026-07')).toBe(true)
    expect(built.firstPeriod).toBe('2026-07')
  })

  it("reproduces DD's August budget from the Calxa pack", () => {
    const august = build().lines.filter((l) => l.month === '2026-08')
    const byCode = Object.fromEntries(august.map((l) => [l.account_code, l.amount]))
    expect(byCode['215.1']).toBe(222876.58)  // Bathurst income
    expect(byCode['477.1']).toBe(116410.32)  // Bathurst wages
    expect(byCode['310.1']).toBe(200)        // Bathurst COGS
  })

  it('classifies once, into the report vocabulary, and stores the bucket too', () => {
    const built = build()
    const byCode = new Map(built.lines.map((l) => [l.account_code, l]))
    expect(byCode.get('215.1')!.category).toBe('Revenue')
    expect(byCode.get('215.1')!.account_type).toBe('revenue')
    expect(byCode.get('477.1')!.category).toBe('Operating Expenses')
    expect(byCode.get('477.1')!.account_type).toBe('opex')
    expect(byCode.get('310.1')!.category).toBe('Cost of Sales')
    expect(byCode.get('310.1')!.account_type).toBe('cogs')
  })

  it('carries expense amounts through positive, as the variance arithmetic expects', () => {
    const wages = build().lines.find((l) => l.account_code === '477.1' && l.month === '2026-08')!
    expect(wages.amount).toBeGreaterThan(0)
  })

  it('leaves an unclassifiable account null rather than guessing it into OpEx', () => {
    // Guessing would put a revenue account in the expense bucket and invert its
    // variance — invisible in a total.
    const built = build({
      catalog: [],  // super-admin RLS trap: the catalog reads empty
      actuals: [],
    })
    expect(built.lines.every((l) => l.category === null && l.account_type === null)).toBe(true)
    expect(built.unclassified.map((u) => u.accountCode).sort()).toEqual(['215.1', '310.1', '477.1'])
  })

  it('falls back to the account type the P&L history was stored under', () => {
    // This is what rescues an import run by a super-admin, whose session cannot
    // read the chart of accounts.
    const built = build({
      catalog: [],
      actuals: [
        { accountCode: '215.1', accountName: 'BATHURST: Behavioural Assessment Income', accountType: 'revenue', monthly: {} },
      ] as any,
    })
    const revenue = built.lines.find((l) => l.account_code === '215.1')!
    expect(revenue.category).toBe('Revenue')
    expect(built.unclassified.map((u) => u.accountCode).sort()).toEqual(['310.1', '477.1'])
  })

  it('a month Xero omitted is absent, never filled from actuals', () => {
    const built = build({ budgetLines: [budgetLine('a-1', '215.1', { '2026-08': 100 })] })
    expect(built.lines.map((l) => l.month)).toEqual(['2026-08'])
    expect(built.monthsCovered).toBe(1)
  })

  it('reports partial coverage rather than silently completing it', () => {
    const built = build()
    expect(built.monthsCovered).toBe(3)
    expect(built.firstPeriod).toBe('2026-07')
    expect(built.lastPeriod).toBe('2026-09')
  })

  it('ignores months outside the fiscal year', () => {
    const built = build({
      budgetLines: [budgetLine('a-1', '215.1', { '2026-06': 999, '2026-08': 100, '2027-07': 999 })],
    })
    expect(built.lines.map((l) => l.month)).toEqual(['2026-08'])
  })

  it('names an account budgeted at nothing across the year', () => {
    const built = build({ budgetLines: [...BUDGET, budgetLine('a-9', '999', { '2026-08': 0 })] })
    expect(built.zeroBudgetAccounts.map((z) => z.accountCode)).toContain('999')
    expect(built.lines.some((l) => l.account_code === '999')).toBe(false)
  })

  it('surfaces an archived-but-budgeted account instead of swallowing it', () => {
    const built = build({
      catalog: [{ ...account('a-1', '215.1', 'BATHURST: Behavioural Assessment Income', 'REVENUE'), status: 'ARCHIVED' }],
    })
    expect(built.warnings.join(' ')).toContain('archived in Xero but budgeted')
  })
})

describe('defaultEffectiveFrom', () => {
  it('starts at the beginning of the year when nothing has been reported', () => {
    expect(defaultEffectiveFrom(FY27, [])).toBe('2026-07')
  })

  it('starts after the last finalised month — a revision never restates a reported period', () => {
    expect(defaultEffectiveFrom(FY27, ['2026-07', '2026-08'])).toBe('2026-09')
  })

  it('skips past a gap rather than reopening a reported month', () => {
    // July finalised, August not: the first unreported month is August.
    expect(defaultEffectiveFrom(FY27, ['2026-07'])).toBe('2026-08')
  })

  it('falls back to the last month when the whole year has been reported', () => {
    expect(defaultEffectiveFrom(FY27, [...FY27])).toBe('2027-06')
  })
})
