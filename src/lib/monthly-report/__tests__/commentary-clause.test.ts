/**
 * Every figure below is lifted from Urban Road's July 2026 Calxa pack, so these
 * are a reconciliation against a report a client already received — not a
 * snapshot of our own output.
 */
import { describe, it, expect } from 'vitest'
import { buildRatioClause, pickDenominator, extractRatioContext } from '../commentary-clause'

const JUL_INCOME_ACTUAL = 497243
const JUL_INCOME_BUDGET = 450000
const JUN_INCOME_ACTUAL = 567254

describe('buildRatioClause — against the July pack', () => {
  it('reproduces the Antons Canvas line', () => {
    // "40.5% of canvas revenue against a 36.2% driver"
    const c = buildRatioClause({
      accountActual: 201177,
      accountBudget: 162900,
      denominatorActual: JUL_INCOME_ACTUAL,
      denominatorBudget: JUL_INCOME_BUDGET,
      priorAccountActual: null,
      priorDenominatorActual: null,
      denominatorLabel: 'income',
      priorMonthLabel: null,
    })!
    expect(c.basis).toBe('budget')
    expect(c.text).toBe('40.5% of income against a 36.2% driver')
  })

  it('reproduces the Freight to Customer line when there is no budget', () => {
    // "10.12% of income against 8.87% in June" — one decimal in our formatting.
    const c = buildRatioClause({
      accountActual: 50304,
      accountBudget: null,
      denominatorActual: JUL_INCOME_ACTUAL,
      denominatorBudget: null,
      priorAccountActual: 50308,
      priorDenominatorActual: JUN_INCOME_ACTUAL,
      denominatorLabel: 'income',
      priorMonthLabel: 'June',
    })!
    expect(c.basis).toBe('prior_month')
    expect(c.text).toBe('10.1% of income against 8.9% in June')
    expect(c.ratio).toBeCloseTo(0.10117, 5)
    expect(c.comparison).toBeCloseTo(0.0887, 4)   // the pack rounds this to 8.87%
  })

  it('reproduces the Posters estimate against its own revenue account', () => {
    // "$27,527 raised at 49% of Poster's income"
    const c = buildRatioClause({
      accountActual: 27527,
      accountBudget: null,
      denominatorActual: 56178,
      denominatorBudget: null,
      priorAccountActual: null,
      priorDenominatorActual: null,
      denominatorLabel: 'Posters (41700) income',
      priorMonthLabel: null,
    })!
    expect(c.text).toBe('49.0% of Posters (41700) income')
    expect(c.basis).toBe('none')
  })

  it('prefers the budget comparator when both are available', () => {
    const c = buildRatioClause({
      accountActual: 201177,
      accountBudget: 162900,
      denominatorActual: JUL_INCOME_ACTUAL,
      denominatorBudget: JUL_INCOME_BUDGET,
      priorAccountActual: 190000,
      priorDenominatorActual: JUN_INCOME_ACTUAL,
      denominatorLabel: 'income',
      priorMonthLabel: 'June',
    })!
    expect(c.basis).toBe('budget')
  })
})

describe('buildRatioClause — what it refuses to say', () => {
  it('returns null rather than 0.0% when there is no income', () => {
    // A denominator of zero is not a cost that is 0% of income; it is a month
    // that cannot be expressed as a ratio. 0.0% would read as a finding.
    expect(buildRatioClause({
      accountActual: 5000, accountBudget: null,
      denominatorActual: 0, denominatorBudget: null,
      priorAccountActual: null, priorDenominatorActual: null,
      denominatorLabel: 'income', priorMonthLabel: null,
    })).toBeNull()
  })

  it('falls through to prior month when the budget denominator is zero', () => {
    const c = buildRatioClause({
      accountActual: 50304, accountBudget: 45000,
      denominatorActual: JUL_INCOME_ACTUAL, denominatorBudget: 0,
      priorAccountActual: 50308, priorDenominatorActual: JUN_INCOME_ACTUAL,
      denominatorLabel: 'income', priorMonthLabel: 'June',
    })!
    expect(c.basis).toBe('prior_month')
  })

  it('drops the comparison rather than the whole clause when no month is held', () => {
    const c = buildRatioClause({
      accountActual: 50304, accountBudget: null,
      denominatorActual: JUL_INCOME_ACTUAL, denominatorBudget: null,
      priorAccountActual: null, priorDenominatorActual: null,
      denominatorLabel: 'income', priorMonthLabel: null,
    })!
    expect(c.text).toBe('10.1% of income')
    expect(c.comparison).toBeNull()
  })

  it('returns null on a non-numeric input rather than printing NaN%', () => {
    expect(buildRatioClause({
      accountActual: NaN, accountBudget: null,
      denominatorActual: JUL_INCOME_ACTUAL, denominatorBudget: null,
      priorAccountActual: null, priorDenominatorActual: null,
      denominatorLabel: 'income', priorMonthLabel: null,
    })).toBeNull()
  })
})

describe('pickDenominator', () => {
  const revenue = [
    { account_name: 'Canvas Sales', actual: 338363, budget: 279320 },
    { account_name: 'Posters (41700)', actual: 56178, budget: 52920 },
  ]
  const totals = { actual: JUL_INCOME_ACTUAL, budget: JUL_INCOME_BUDGET }

  it('pairs a cost account with the revenue account that shares its name', () => {
    // COGS "Posters" against income "Posters (41700)" — the account-code suffix
    // must not stop the match.
    const d = pickDenominator('Posters', revenue, totals)
    expect(d.label).toBe('Posters (41700) income')
    expect(d.actual).toBe(56178)
    expect(d.budget).toBe(52920)
  })

  it('falls back to total income for everything else', () => {
    const d = pickDenominator('Antons Canvas', revenue, totals)
    expect(d).toEqual({ label: 'income', actual: JUL_INCOME_ACTUAL, budget: JUL_INCOME_BUDGET })
  })

  it('does not pair on a partial name match', () => {
    // "Canvas Sales" revenue must not claim "Antons Canvas" cost — a loose
    // match here produces a percentage that looks plausible and is not.
    expect(pickDenominator('Antons Canvas', revenue, totals).label).toBe('income')
    expect(pickDenominator('Canvas', revenue, totals).label).toBe('income')
  })

  it('falls back to total income when the cost account has no name', () => {
    expect(pickDenominator('', revenue, totals).label).toBe('income')
  })
})

describe('extractRatioContext', () => {
  const report = {
    has_budget: true,
    summary: { revenue: { actual: 528415.71, budget: 450000 } },
    sections: [
      { category: 'Revenue', lines: [
        { account_name: 'Canvas Sales', actual: 337402, budget: 279320 },
        { account_name: 'Materialised', actual: 0, budget: 450, is_budget_only: true },
      ] },
      { category: 'Cost of Sales', lines: [{ account_name: 'Antons Canvas', actual: 208265, budget: 172488 }] },
    ],
  }

  it('takes the denominator from the report, budget included', () => {
    const ctx = extractRatioContext(report)!
    expect(ctx.incomeActual).toBe(528415.71)
    expect(ctx.incomeBudget).toBe(450000)
  })

  it('carries only revenue lines, and drops budget-only ones', () => {
    // A budget-only revenue line has no actual, so it can never be a
    // denominator — including it would offer a zero to divide by.
    const ctx = extractRatioContext(report)!
    expect(ctx.revenueLines.map(l => l.account_name)).toEqual(['Canvas Sales'])
  })

  it('reads a no-budget report as no budget, not as a budget of zero', () => {
    // Dividing by an absent budget manufactures a 0% driver, which reads as a
    // plan nobody made.
    const ctx = extractRatioContext({ ...report, has_budget: false })!
    expect(ctx.incomeBudget).toBeNull()
    expect(ctx.revenueLines[0].budget).toBeNull()
  })

  it('returns null when there is no income figure at all', () => {
    expect(extractRatioContext({ summary: {} })).toBeNull()
    expect(extractRatioContext(null)).toBeNull()
  })
})
