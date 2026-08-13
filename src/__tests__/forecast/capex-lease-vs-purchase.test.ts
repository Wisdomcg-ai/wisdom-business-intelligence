/**
 * Phase 3 — CapEx lease-vs-purchase, proven end to end.
 *
 * "It is important the clients decide capex of leasing or upfront purchase —
 * it's an important decision at the time of the budget prep." That decision
 * changes the P&L itself, not just cash timing: a purchase produces
 * depreciation, an operating lease produces an operating expense, and a
 * financed asset produces both depreciation and interest that declines as
 * principal is repaid.
 *
 * Yet this path has NEVER executed in production — 0 of 37 forecasts carry any
 * planned spend, and there are no SYS-DEPRECIATION lines anywhere. It was empty
 * because `plannedSpends` was missing from the autosave dependency list until
 * #358, so Step 7 edits were discarded when the wizard closed. That is fixed, so
 * this path is about to run for the first time with a client's numbers on it.
 *
 * These tests prove the whole chain — the same `getPlannedSpendPLBreakdown` the
 * on-screen summary uses, through the materialiser, to the stored P&L lines —
 * for all four financing choices rather than just the outright purchase the
 * existing M8 test covers.
 */
import { describe, it, expect } from 'vitest'
import {
  convertAssumptionsToPLLines,
  SYS_CODES,
} from '@/app/finances/forecast/services/assumptions-to-pl-lines'
import { getPlannedSpendPLBreakdown } from '@/app/finances/forecast/components/wizard-v4/types'
import { checkSummaryParity } from '@/lib/forecast/summary-parity'
import type { ForecastAssumptions } from '@/app/finances/forecast/components/wizard-v4/types/assumptions'

const FY = 2027
const Y1_MONTHS = [
  '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12',
  '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06',
]

function ctx(assumptions: Partial<ForecastAssumptions>, duration = 1) {
  return {
    assumptions: assumptions as ForecastAssumptions,
    forecastStartMonth: '2026-07',
    forecastEndMonth: `${FY + duration - 1}-06`,
    fiscalYear: FY,
    forecastDuration: duration,
    existingLines: [],
  }
}

/** A $120k asset bought in the first month of the fiscal year. */
const asset = (over: Record<string, unknown>) => ({
  id: 'ps1',
  description: 'Delivery truck',
  amount: 120_000,
  month: 1,
  spendType: 'asset',
  ...over,
})

const lineByName = (out: ReturnType<typeof convertAssumptionsToPLLines>, name: string) =>
  out.find(l => l.account_name === name)

const y1Total = (line: { forecast_months?: Record<string, number> | null } | undefined) =>
  line ? Y1_MONTHS.reduce((s, m) => s + (line.forecast_months?.[m] ?? 0), 0) : 0

describe('outright purchase — depreciation only, no expense', () => {
  const out = convertAssumptionsToPLLines(
    ctx({ plannedSpends: [asset({ lease_type: 'outright_purchase', useful_life_months: 60 })] as never }),
  )

  it('depreciates the asset over its useful life', () => {
    const dep = lineByName(out, 'Depreciation (planned purchases)')!
    expect(dep.account_code).toBe(SYS_CODES.depreciation)
    // $120k over 60 months = $2k/month × 12 = $24k in Y1.
    expect(y1Total(dep)).toBeCloseTo(24_000, 0)
  })

  it('produces no operating expense — buying an asset is not a cost', () => {
    expect(lineByName(out, 'Planned Purchases (Expensed)')).toBeUndefined()
  })
})

describe('operating lease — expense only, no depreciation', () => {
  // The business never owns it, so there is nothing to depreciate.
  const out = convertAssumptionsToPLLines(
    ctx({
      plannedSpends: [asset({
        lease_type: 'operating_lease',
        term_months: 48,
        leaseMonthlyPayment: 2_800,
      })] as never,
    }),
  )

  it('charges the lease payments as operating expense', () => {
    const exp = lineByName(out, 'Planned Purchases (Expensed)')!
    expect(exp.account_code).toBe(SYS_CODES.plannedSpendExpense)
    expect(y1Total(exp)).toBeCloseTo(2_800 * 12, 0)
  })

  it('produces no depreciation', () => {
    expect(lineByName(out, 'Depreciation (planned purchases)')).toBeUndefined()
  })

  it('derives the payment from term when none is given', () => {
    const derived = convertAssumptionsToPLLines(
      ctx({ plannedSpends: [asset({ lease_type: 'operating_lease', term_months: 48 })] as never }),
    )
    // $120k over 48 months = $2,500/month.
    expect(y1Total(lineByName(derived, 'Planned Purchases (Expensed)'))).toBeCloseTo(2_500 * 12, 0)
  })
})

describe('finance lease and loan — depreciation AND declining interest', () => {
  const financed = asset({
    lease_type: 'finance_lease',
    useful_life_months: 60,
    term_months: 60,
    interest_rate: 5,
  })

  it('depreciates the asset, because the business ends up owning it', () => {
    const out = convertAssumptionsToPLLines(ctx({ plannedSpends: [financed] as never }))
    expect(y1Total(lineByName(out, 'Depreciation (planned purchases)'))).toBeCloseTo(24_000, 0)
  })

  it('charges interest as expense, separately from depreciation', () => {
    const out = convertAssumptionsToPLLines(ctx({ plannedSpends: [financed] as never }))
    const interest = y1Total(lineByName(out, 'Planned Purchases (Expensed)'))
    // A $120k loan at 5% costs roughly $5.6k of interest in year one.
    expect(interest).toBeGreaterThan(4_000)
    expect(interest).toBeLessThan(7_000)
  })

  it('charges LESS interest in year 2 than year 1 as principal is repaid', () => {
    // The pre-P1 implementation divided total interest evenly across years and
    // reported the same figure every year, which is not how a loan works.
    const y1 = getPlannedSpendPLBreakdown(financed as never, 1).expenses
    const y2 = getPlannedSpendPLBreakdown(financed as never, 2).expenses
    expect(y2).toBeLessThan(y1)
    expect(y2).toBeGreaterThan(0)
  })

  it('treats a loan the same as a finance lease — both end in ownership', () => {
    const loan = { ...financed, lease_type: 'loan_financing' }
    expect(getPlannedSpendPLBreakdown(loan as never, 1)).toEqual(
      getPlannedSpendPLBreakdown(financed as never, 1),
    )
  })
})

describe('the financing choice actually changes the P&L', () => {
  // The point of asking the client: these are materially different outcomes.
  const of = (over: Record<string, unknown>) =>
    convertAssumptionsToPLLines(ctx({ plannedSpends: [asset(over)] as never }))

  it('buying and leasing the same asset do not produce the same numbers', () => {
    const bought = of({ lease_type: 'outright_purchase', useful_life_months: 60 })
    const leased = of({ lease_type: 'operating_lease', term_months: 48, leaseMonthlyPayment: 2_800 })

    const boughtDep = y1Total(lineByName(bought, 'Depreciation (planned purchases)'))
    const leasedExp = y1Total(lineByName(leased, 'Planned Purchases (Expensed)'))

    expect(boughtDep).toBeCloseTo(24_000, 0)
    expect(leasedExp).toBeCloseTo(33_600, 0)
    expect(boughtDep).not.toBeCloseTo(leasedExp, 0)
  })

  it('financing costs more than buying outright, by the interest', () => {
    const bought = of({ lease_type: 'outright_purchase', useful_life_months: 60 })
    const financedOut = of({
      lease_type: 'loan_financing', useful_life_months: 60, term_months: 60, interest_rate: 5,
    })
    const boughtTotal = y1Total(lineByName(bought, 'Depreciation (planned purchases)'))
    const financedTotal =
      y1Total(lineByName(financedOut, 'Depreciation (planned purchases)')) +
      y1Total(lineByName(financedOut, 'Planned Purchases (Expensed)'))
    expect(financedTotal).toBeGreaterThan(boughtTotal)
  })
})

describe('a part-year purchase is not charged a full year', () => {
  it('depreciates only from the month of purchase', () => {
    // Bought in month 10 of the FY → 3 months of depreciation in Y1.
    const out = convertAssumptionsToPLLines(
      ctx({
        plannedSpends: [asset({ month: 10, lease_type: 'outright_purchase', useful_life_months: 60 })] as never,
      }),
    )
    expect(y1Total(lineByName(out, 'Depreciation (planned purchases)'))).toBeCloseTo(6_000, 0)
  })
})

describe('what the wizard shows equals what gets stored', () => {
  // The whole point of Phase 2: the coach approves a number and that number is
  // what lands in the client's report. CapEx is the path most likely to break
  // it, because depreciation is derived rather than typed.
  it('the summary depreciation bucket matches the materialised lines', () => {
    const spend = asset({ lease_type: 'outright_purchase', useful_life_months: 60 })
    const out = convertAssumptionsToPLLines(ctx({ plannedSpends: [spend] as never }))

    // What the wizard's summary would show for Y1, via the SAME helper.
    const approvedDepreciation = getPlannedSpendPLBreakdown(spend as never, 1).depreciation

    const parity = checkSummaryParity(
      { revenue: 0, cogs: 0, depreciation: approvedDepreciation, netProfit: -approvedDepreciation },
      out,
      Y1_MONTHS,
    )
    expect(parity.matches).toBe(true)
    expect(parity.operatingExpenses.difference).toBe(0)
  })

  it('holds for a financed asset, where depreciation and interest both count', () => {
    const spend = asset({
      lease_type: 'loan_financing', useful_life_months: 60, term_months: 60, interest_rate: 5,
    })
    const out = convertAssumptionsToPLLines(ctx({ plannedSpends: [spend] as never }))
    const b = getPlannedSpendPLBreakdown(spend as never, 1)

    const parity = checkSummaryParity(
      {
        revenue: 0, cogs: 0,
        depreciation: b.depreciation,
        opex: b.expenses,
        netProfit: -(b.depreciation + b.expenses),
      },
      out,
      Y1_MONTHS,
    )
    expect(parity.matches).toBe(true)
  })
})
