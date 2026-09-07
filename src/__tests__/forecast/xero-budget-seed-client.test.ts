/**
 * Pure helpers behind the "Start from Xero budget" entry point — the wording
 * the operator reads and the default the picker pre-selects.
 */
import { describe, it, expect } from 'vitest'
import {
  listBudgetChoices,
  pickDefaultBudget,
  hasMixedCurrencies,
  describeCoverage,
  describeSeedReport,
  formatSeedDate,
} from '@/lib/forecast/xero-budget-seed-client'
import type { BudgetAvailabilityResponse } from '@/lib/xero/budget-availability'
import type { XeroBudgetSeedReport } from '@/lib/services/xero-budget-seed-service'

const cov = (monthsInFY: number) => ({ firstPeriod: '2026-07', lastPeriod: '2027-06', monthsInFY })

const budget = (budgetId: string, name: string, type: 'OVERALL' | 'TRACKING' = 'OVERALL') => ({
  budgetId, name, type, updatedAt: null, lineCount: 40, coverage: cov(12),
})

const RESPONSE: BudgetAvailabilityResponse = {
  state: 'available',
  fiscalYear: 2027,
  orgs: [
    { tenantId: 't-au', orgName: 'Acme AU', functionalCurrency: 'AUD', state: 'available', budgets: [budget('b-track', 'Retail only', 'TRACKING'), budget('b-overall', 'Overall Budget')] },
    { tenantId: 't-hk', orgName: 'Acme HK', functionalCurrency: 'HKD', state: 'available', budgets: [budget('b-hk', 'HK Budget')] },
    { tenantId: 't-none', orgName: 'Dormant Co', functionalCurrency: 'AUD', state: 'none', budgets: [] },
    { tenantId: 't-scope', orgName: 'Old Connection', functionalCurrency: 'AUD', state: 'scope_missing', budgets: [] },
  ],
}

describe('listBudgetChoices', () => {
  it('flattens only the orgs that actually have a budget, keeping org identity on each choice', () => {
    const choices = listBudgetChoices(RESPONSE)
    expect(choices.map((c) => `${c.tenantId}/${c.budgetId}`)).toEqual(['t-au/b-track', 't-au/b-overall', 't-hk/b-hk'])
    expect(choices[0]).toMatchObject({ orgName: 'Acme AU', functionalCurrency: 'AUD', type: 'TRACKING' })
  })
  it('is empty for null / no orgs', () => {
    expect(listBudgetChoices(null)).toEqual([])
    expect(listBudgetChoices({ state: 'not_connected', fiscalYear: 2027, orgs: [] })).toEqual([])
  })
})

describe('pickDefaultBudget', () => {
  it('prefers the OVERALL budget of the first org even when it is listed after a tracking budget', () => {
    expect(pickDefaultBudget(listBudgetChoices(RESPONSE))?.budgetId).toBe('b-overall')
  })
  it('falls back to the first choice when the first org has no OVERALL budget', () => {
    const only = listBudgetChoices({ ...RESPONSE, orgs: [{ ...RESPONSE.orgs[0], budgets: [budget('b-track', 'Retail only', 'TRACKING')] }] })
    expect(pickDefaultBudget(only)?.budgetId).toBe('b-track')
  })
  it('is null with nothing to pick', () => {
    expect(pickDefaultBudget([])).toBeNull()
  })
})

describe('hasMixedCurrencies', () => {
  it('flags AUD + HKD, not AUD + AUD, and ignores unknown currencies', () => {
    expect(hasMixedCurrencies(listBudgetChoices(RESPONSE))).toBe(true)
    const au = listBudgetChoices(RESPONSE).filter((c) => c.tenantId === 't-au')
    expect(hasMixedCurrencies(au)).toBe(false)
    expect(hasMixedCurrencies([{ ...au[0], functionalCurrency: null }, au[1]])).toBe(false)
  })
})

describe('describeCoverage', () => {
  it('reads as months of the FY', () => {
    expect(describeCoverage(cov(12), 2027)).toBe('covers 12 of 12 months')
    expect(describeCoverage(cov(9), 2027)).toBe('covers 9 of 12 months')
    expect(describeCoverage(cov(0), 2027)).toBe('no months in FY2027')
  })
})

describe('describeSeedReport', () => {
  const base: XeroBudgetSeedReport = {
    counts: { revenue: 13, cogs: 13, opex: 35, otherIncome: 0, otherExpense: 0 },
    teamCostBudget: { total: 990_492.78, byKind: { payroll: 631_931, contractor: 358_562, unmodelled: 0 }, lines: [
      { accountCode: '62170', accountName: 'Employ - Wages & Salaries', total: 564_223 },
      { accountCode: '62160', accountName: 'Employ - Superannuation', total: 67_708 },
      { accountCode: '61400', accountName: 'Contractors excl. Artists', total: 358_562 },
    ] },
    unclassified: [],
    zeroBudgetLines: Array.from({ length: 16 }, (_, i) => ({ accountCode: String(60000 + i), accountName: `Acct ${i}`, total: 0 })),
    coverage: { firstPeriod: '2026-07', lastPeriod: '2027-06', monthsInFY: 12, monthsFilled: 0, monthsZeroed: 26, yearsFullyCovered: [] },
    goals: { revenue: 6_028_196, grossProfitPct: 41.1, netProfitPct: 8.8 },
    warnings: [],
  }

  it('leads with the counts and names the budget', () => {
    const { title, detail } = describeSeedReport(base, 'Overall Budget')
    expect(title).toBe('Imported 13 revenue, 13 COGS and 35 OpEx lines from “Overall Budget”.')
    expect(detail).toBe('3 wages/super accounts left to Step 4 — payroll replaces them once staff are imported. 16 unbudgeted accounts set to $0.')
  })
  it('mentions unclassified accounts and filled months only when there are any', () => {
    const { detail } = describeSeedReport({
      ...base,
      teamCostBudget: { ...base.teamCostBudget, lines: [] },
      zeroBudgetLines: [],
      unclassified: [{ accountCode: '999', accountName: 'Mystery', total: 10 }],
      coverage: { ...base.coverage, monthsFilled: 1 },
    })
    expect(detail).toBe('1 account needs a category. 1 month outside the budget filled from last year.')
  })
  it('has no detail when nothing needs the operator', () => {
    const { title, detail } = describeSeedReport({ ...base, teamCostBudget: { ...base.teamCostBudget, lines: [] }, zeroBudgetLines: [] })
    expect(title).toMatch(/from your Xero budget\.$/)
    expect(detail).toBeNull()
  })
})

describe('formatSeedDate', () => {
  it('formats an ISO stamp as an AU short date and tolerates junk', () => {
    expect(formatSeedDate('2026-09-06T22:32:09.404Z')).toMatch(/^\d{1,2} Sept? 2026$/)
    expect(formatSeedDate(null)).toBe('')
    expect(formatSeedDate('not-a-date')).toBe('')
  })
})
