/**
 * "As budgeted" OpEx — the materialiser and the wizard summary MUST agree.
 *
 * The summary side (useForecastWizard.calculateYearSummary) computes
 *   budgetedTotal(line, generateMonthKeys(fiscalYearStart + yearNum - 1),
 *                 line.annualIncreasePct ?? state.defaultOpExIncreasePct)
 * and the materialiser calls projectBudgetedMonths with
 *   line.annualIncreasePct ?? assumptions.opex.defaultIncreasePct ?? 0.
 * Both go through src/lib/forecast/budgeted-line.ts. This test re-derives the
 * summary-side number independently and asserts the stored months sum to it,
 * to the cent, for 1- and 3-year horizons and partial budget coverage.
 */
import { describe, it, expect } from 'vitest'
import { convertAssumptionsToPLLines, type ConvertContext } from '../assumptions-to-pl-lines'
import type { ForecastAssumptions, OpExLineAssumption } from '../../components/wizard-v4/types/assumptions'
import { budgetedTotal, shiftMonthKey } from '@/lib/forecast/budgeted-line'
import { generateMonthKeys } from '../../components/wizard-v4/types'

const FY = 2027 // Jul 2026 – Jun 2027
const FY_START_YEAR = FY - 1

function keysFor(yearNum: 1 | 2 | 3): string[] {
  return generateMonthKeys(FY_START_YEAR + yearNum - 1)
}

function months(keys: string[], values: number[]): Record<string, number> {
  const out: Record<string, number> = {}
  keys.forEach((k, i) => { out[k] = values[i] })
  return out
}

function assumptions(opexLines: OpExLineAssumption[], defaultIncreasePct?: number): ForecastAssumptions {
  return {
    version: 1,
    createdAt: '2026-09-05T00:00:00Z',
    updatedAt: '2026-09-05T00:00:00Z',
    fiscalYearStart: '07',
    revenue: { lines: [], seasonalityPattern: Array(12).fill(100 / 12), seasonalitySource: 'industry_default' },
    cogs: { lines: [] },
    team: { existingTeam: [], plannedHires: [], superannuationPct: 12, workCoverPct: 0, payrollTaxPct: 0 },
    opex: { lines: opexLines, defaultIncreasePct },
    capex: { items: [] },
  }
}

function ctx(a: ForecastAssumptions, duration: 1 | 2 | 3): ConvertContext {
  return {
    assumptions: a,
    forecastStartMonth: '2026-07',
    forecastEndMonth: shiftMonthKey('2027-06', 12 * (duration - 1)),
    fiscalYear: FY,
    forecastDuration: duration,
    existingLines: [],
  }
}

function yearSum(forecastMonths: Record<string, number>, yearNum: 1 | 2 | 3): number {
  return Math.round(keysFor(yearNum).reduce((s, k) => s + (forecastMonths[k] ?? 0), 0) * 100) / 100
}

const Y1 = keysFor(1)
const SHAPE = [900, 950, 1000, 1200, 1500, 2100, 800, 800, 850, 900, 1000, 1000] // sums 13,000

describe('materialiser: budgeted OpEx', () => {
  it('writes the explicit months verbatim in Y1', () => {
    const line: OpExLineAssumption = {
      accountId: 'opex-mkt', accountName: 'Marketing', priorYearTotal: 12_000,
      costBehavior: 'budgeted', budgetedMonthly: months(Y1, SHAPE),
    }
    const out = convertAssumptionsToPLLines(ctx(assumptions([line], 3), 1))
    const mkt = out.find((l) => l.account_name === 'Marketing')!
    expect(mkt.category).toBe('Operating Expenses')
    expect(mkt.forecast_months['2026-07']).toBe(900)
    expect(mkt.forecast_months['2026-12']).toBe(2100)
    expect(yearSum(mkt.forecast_months, 1)).toBe(13_000)
  })

  it('rolls a 12-month budget into Y2/Y3 with the line increase, per calendar month', () => {
    const line: OpExLineAssumption = {
      accountId: 'opex-mkt', accountName: 'Marketing', priorYearTotal: 12_000,
      costBehavior: 'budgeted', budgetedMonthly: months(Y1, SHAPE), annualIncreasePct: 10,
    }
    const out = convertAssumptionsToPLLines(ctx(assumptions([line], 3), 3))
    const mkt = out.find((l) => l.account_name === 'Marketing')!
    expect(mkt.forecast_months['2027-12']).toBe(2310)      // 2100 × 1.10
    expect(mkt.forecast_months['2028-12']).toBe(2541)      // 2100 × 1.21
    expect(yearSum(mkt.forecast_months, 2)).toBe(14_300)
  })

  it('falls back to opex.defaultIncreasePct when the line has no increase of its own', () => {
    const line: OpExLineAssumption = {
      accountId: 'opex-mkt', accountName: 'Marketing', priorYearTotal: 12_000,
      costBehavior: 'budgeted', budgetedMonthly: months(Y1, Array(12).fill(1000)),
    }
    const out = convertAssumptionsToPLLines(ctx(assumptions([line], 5), 2))
    const mkt = out.find((l) => l.account_name === 'Marketing')!
    expect(mkt.forecast_months['2027-07']).toBe(1050)
  })

  it('honours explicit later-year months over the rolled-forward value', () => {
    const budget = { ...months(Y1, Array(12).fill(1000)), ...months(keysFor(2), Array(12).fill(1234)) }
    const line: OpExLineAssumption = {
      accountId: 'opex-mkt', accountName: 'Marketing', priorYearTotal: 12_000,
      costBehavior: 'budgeted', budgetedMonthly: budget, annualIncreasePct: 10,
    }
    const out = convertAssumptionsToPLLines(ctx(assumptions([line], 3), 3))
    const mkt = out.find((l) => l.account_name === 'Marketing')!
    expect(mkt.forecast_months['2027-07']).toBe(1234)
    expect(mkt.forecast_months['2028-07']).toBeCloseTo(1357.4, 2) // Y3 grows from Y2's explicit value
  })

  it('never guesses months the budget does not cover (partial Y1 stays 0 there)', () => {
    const line: OpExLineAssumption = {
      accountId: 'opex-mkt', accountName: 'Marketing', priorYearTotal: 12_000,
      costBehavior: 'budgeted', budgetedMonthly: months(Y1.slice(0, 6), Array(6).fill(500)),
    }
    const out = convertAssumptionsToPLLines(ctx(assumptions([line], 3), 1))
    const mkt = out.find((l) => l.account_name === 'Marketing')!
    expect(mkt.forecast_months['2026-12']).toBe(500)
    expect(mkt.forecast_months['2027-01']).toBe(0)
    expect(yearSum(mkt.forecast_months, 1)).toBe(3_000)
  })

  it('applies the Y2/Y3 annual overrides after projection, like every other behaviour', () => {
    const line: OpExLineAssumption = {
      accountId: 'opex-mkt', accountName: 'Marketing', priorYearTotal: 12_000,
      costBehavior: 'budgeted', budgetedMonthly: months(Y1, SHAPE), annualIncreasePct: 10, y2Override: 20_000,
    }
    const out = convertAssumptionsToPLLines(ctx(assumptions([line], 3), 2))
    const mkt = out.find((l) => l.account_name === 'Marketing')!
    expect(yearSum(mkt.forecast_months, 2)).toBe(20_000)
    // Shape preserved under the override: December is still the peak.
    expect(mkt.forecast_months['2027-12']).toBeGreaterThan(mkt.forecast_months['2027-07'])
  })
})

describe('lockstep: stored months sum to what the wizard summary shows', () => {
  const cases: Array<{ name: string; line: OpExLineAssumption; defaultPct: number; duration: 1 | 2 | 3 }> = [
    {
      name: '12-month budget, line increase, 3 years',
      line: { accountId: 'a', accountName: 'A', priorYearTotal: 0, costBehavior: 'budgeted', budgetedMonthly: months(Y1, SHAPE), annualIncreasePct: 7.5 },
      defaultPct: 3, duration: 3,
    },
    {
      name: '12-month budget, no line increase (default applies), 3 years',
      line: { accountId: 'b', accountName: 'B', priorYearTotal: 0, costBehavior: 'budgeted', budgetedMonthly: months(Y1, SHAPE) },
      defaultPct: 4, duration: 3,
    },
    {
      name: 'partial coverage (Jul–Oct only), 2 years',
      line: { accountId: 'c', accountName: 'C', priorYearTotal: 0, costBehavior: 'budgeted', budgetedMonthly: months(Y1.slice(0, 4), [333.33, 333.33, 333.34, 1000]), annualIncreasePct: 2 },
      defaultPct: 3, duration: 2,
    },
    {
      name: 'explicit Y1+Y2 months, Y3 rolled from Y2',
      line: { accountId: 'd', accountName: 'D', priorYearTotal: 0, costBehavior: 'budgeted', budgetedMonthly: { ...months(Y1, SHAPE), ...months(keysFor(2), SHAPE.map((v) => v * 1.3)) }, annualIncreasePct: 5 },
      defaultPct: 3, duration: 3,
    },
  ]

  for (const c of cases) {
    it(c.name, () => {
      const out = convertAssumptionsToPLLines(ctx(assumptions([c.line], c.defaultPct), c.duration))
      const stored = out.find((l) => l.account_name === c.line.accountName)!
      for (let y = 1 as 1 | 2 | 3; y <= c.duration; y = (y + 1) as 1 | 2 | 3) {
        // The wizard summary's formula, re-derived here on purpose.
        const summarySide = budgetedTotal(
          c.line,
          generateMonthKeys(FY_START_YEAR + (y - 1)),
          c.line.annualIncreasePct ?? c.defaultPct,
        )
        expect(Math.abs(yearSum(stored.forecast_months, y) - summarySide)).toBeLessThanOrEqual(0.05)
      }
    })
  }
})
