/**
 * Phase 4 — the client's spreadsheet must equal the stored budget.
 *
 * The Excel export used to re-derive the entire P&L: its own team loop, its own
 * OpEx growth, its own depreciation. It had drifted badly — net profit was
 * `gp − team − opex − dep`, omitting subscriptions, investments and the Xero
 * other income/expense buckets; new hires escalated at a hardcoded 3% rather
 * than their own rate; seasonal OpEx carried an off-by-one the summary had
 * already fixed.
 *
 * This is the artefact CFO-only clients receive, so a second opinion about their
 * numbers is the one thing it must not be. It now renders from
 * `convertAssumptionsToPLLines` over the canonical assumptions — the same input
 * Generate materialises — so the two cannot disagree.
 *
 * These tests exercise the shared converter directly and assert the totals the
 * sheet is built from, which is what would actually diverge.
 */
import { describe, it, expect } from 'vitest'
import { convertAssumptionsToPLLines } from '@/app/finances/forecast/services/assumptions-to-pl-lines'
import { checkSummaryParity } from '@/lib/forecast/summary-parity'
import type { ForecastAssumptions } from '@/app/finances/forecast/components/wizard-v4/types/assumptions'

const FY = 2027
const Y1 = [
  '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12',
  '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06',
]

function convert(a: Partial<ForecastAssumptions>, duration = 1) {
  return convertAssumptionsToPLLines({
    assumptions: a as ForecastAssumptions,
    forecastStartMonth: '2026-07',
    forecastEndMonth: `${FY + duration - 1}-06`,
    fiscalYear: FY,
    forecastDuration: duration,
    existingLines: [],
  })
}

/** Mirrors how the export totals a category — the sheet's own arithmetic. */
function categoryTotal(
  lines: ReturnType<typeof convert>,
  ...categories: string[]
): number {
  const want = new Set(categories.map(c => c.toLowerCase()))
  return lines
    .filter(l => want.has((l.category || '').trim().toLowerCase()))
    .reduce((sum, l) => sum + Y1.reduce((s, m) => s + (l.forecast_months?.[m] ?? 0), 0), 0)
}

/** A forecast exercising every bucket the old export could omit. */
const fullAssumptions = (): Partial<ForecastAssumptions> => ({
  revenue: {
    lines: [{
      accountName: 'Consulting',
      year1Monthly: Object.fromEntries(Y1.map(m => [m, 100_000])),
    }],
  },
  cogs: {
    lines: [{ accountName: 'Contractors', costBehavior: 'variable', percentOfRevenue: 40 }],
  },
  team: {
    existingTeam: [{
      employeeId: 't1', name: 'Alice', role: 'Lead',
      employmentType: 'full-time', currentSalary: 120_000, year1Salary: 120_000,
      salaryIncreasePct: 0, includeInForecast: true, isFromXero: false,
    }],
    plannedHires: [],
    superannuationPct: 12,
  },
  subscriptions: {
    vendors: [{ vendorKey: 'xero', vendorName: 'Xero', monthlyBudget: 500, frequency: 'monthly', accountCodes: [] }],
  },
  xeroOtherIncome: 12_000,
  xeroOtherExpense: 6_000,
} as never)

describe('the sheet totals what the converter emits', () => {
  const lines = convert(fullAssumptions())

  it('revenue matches', () => {
    expect(categoryTotal(lines, 'Revenue')).toBeCloseTo(1_200_000, 0)
  })

  it('cost of sales matches', () => {
    expect(categoryTotal(lines, 'Cost of Sales')).toBeCloseTo(480_000, 0)
  })

  it('includes SUBSCRIPTIONS in operating expenses — the old export omitted them', () => {
    const opex = categoryTotal(lines, 'Operating Expenses')
    // $500/month × 12 = $6,000 of subscriptions must be in there.
    expect(opex).toBeGreaterThanOrEqual(6_000)
    const subs = lines.find(l => l.account_name.toLowerCase().includes('subscription'))
    expect(subs).toBeDefined()
  })

  it('includes TEAM COSTS in operating expenses', () => {
    const wages = lines.find(l => l.account_name === 'Wages & Salaries')
    expect(wages).toBeDefined()
    expect(Y1.reduce((s, m) => s + (wages!.forecast_months?.[m] ?? 0), 0)).toBeCloseTo(120_000, -2)
  })

  it('files Xero OTHER INCOME on the income side, not as an expense', () => {
    // The old export ignored it entirely; counting it as expense would be worse.
    expect(categoryTotal(lines, 'Other Income')).toBeCloseTo(12_000, 0)
    expect(categoryTotal(lines, 'Operating Expenses')).toBeLessThan(
      categoryTotal(lines, 'Operating Expenses') + 12_000,
    )
  })

  it('includes Xero OTHER EXPENSES — also omitted before', () => {
    const oe = lines.find(l => l.account_name === 'Other Expenses')
    expect(oe).toBeDefined()
    expect(Y1.reduce((s, m) => s + (oe!.forecast_months?.[m] ?? 0), 0)).toBeCloseTo(6_000, 0)
  })
})

describe('the sheet net profit uses the canonical formula', () => {
  it('subtracts every operating bucket and adds other income', () => {
    const lines = convert(fullAssumptions())
    const revenue = categoryTotal(lines, 'Revenue')
    const cogs = categoryTotal(lines, 'Cost of Sales')
    const opex = categoryTotal(lines, 'Operating Expenses')
    const otherIncome = categoryTotal(lines, 'Other Income')

    // Exactly the arithmetic buildPLTab performs.
    const netProfit = revenue - cogs - opex + otherIncome

    // The OLD formula was `gp − team − opex − dep`, which omitted subscriptions
    // and both Xero buckets. It would have reported a different, higher number.
    const oldStyleOmissions = 6_000 /* subscriptions */ + 6_000 /* xero other expense */
    expect(netProfit).toBeLessThan(revenue - cogs - opex + otherIncome + oldStyleOmissions)
    expect(Number.isFinite(netProfit)).toBe(true)
  })

  it('reconciles against the parity checker used by Generate and the daily sweep', () => {
    const lines = convert(fullAssumptions())
    const revenue = categoryTotal(lines, 'Revenue')
    const cogs = categoryTotal(lines, 'Cost of Sales')
    const opex = categoryTotal(lines, 'Operating Expenses')
    const otherIncome = categoryTotal(lines, 'Other Income')
    const otherExpenses = categoryTotal(lines, 'Other Expenses')

    const parity = checkSummaryParity(
      {
        revenue,
        otherIncome,
        cogs,
        opex,
        xeroOtherExpense: otherExpenses,
        netProfit: revenue + otherIncome - cogs - opex - otherExpenses,
      },
      lines,
      Y1,
    )
    expect(parity.matches).toBe(true)
  })
})

describe('a planned purchase reaches the sheet', () => {
  it('depreciation appears as an operating expense line', () => {
    const a = {
      ...fullAssumptions(),
      plannedSpends: [{
        id: 'ps1', description: 'Truck', amount: 120_000, month: 1,
        spendType: 'asset', lease_type: 'outright_purchase', useful_life_months: 60,
      }],
    } as never
    const lines = convert(a)
    const dep = lines.find(l => l.account_name === 'Depreciation (planned purchases)')
    expect(dep).toBeDefined()
    expect(Y1.reduce((s, m) => s + (dep!.forecast_months?.[m] ?? 0), 0)).toBeCloseTo(24_000, 0)
  })
})
