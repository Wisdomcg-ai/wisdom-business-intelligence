import { describe, it, expect } from 'vitest'
import { seedForecastFromPrior, isForecastSeedable, shiftMonthKeys } from '../forecast-seed-service'
import type { ForecastAssumptions } from '@/app/finances/forecast/components/wizard-v4/types/assumptions'

// ─── Fixture ─────────────────────────────────────────────────────────────────

function makeFixture(): ForecastAssumptions {
  return {
    version: 1,
    createdAt: '2025-05-01T00:00:00.000Z',
    updatedAt: '2025-05-01T00:00:00.000Z',
    fiscalYearStart: '07',
    industry: 'consulting',
    employeeCount: 5,
    goals: {
      year1: { revenue: 1000000, grossProfitPct: 60, netProfitPct: 20 },
    },
    revenue: {
      lines: [
        {
          accountId: 'rev-1',
          accountName: 'Consulting Revenue',
          priorYearTotal: 800000,
          growthType: 'percentage',
          growthPct: 10,
          year1Monthly: { '2025-07': 50000, '2026-06': 30000 },
          year2Monthly: { '2026-07': 55000 },
          year3Monthly: { '2027-07': 60000 },
          year2Quarterly: { q1: 1, q2: 2, q3: 3, q4: 4 },
        },
      ],
      seasonalityPattern: Array(12).fill(8.33),
      seasonalitySource: 'override',
    },
    cogs: {
      lines: [
        {
          accountId: 'cogs-1',
          accountName: 'Direct Costs',
          priorYearTotal: 200000,
          costBehavior: 'variable',
          percentOfRevenue: 25,
          year1Monthly: { '2025-07': 10000 },
          year2Monthly: { '2026-07': 11000 },
          year3Monthly: { '2027-07': 12000 },
        },
      ],
    },
    team: {
      existingTeam: [
        {
          employeeId: 'emp-1',
          name: 'Alice',
          role: 'Senior Consultant',
          employmentType: 'full-time',
          currentSalary: 100000,
          salaryIncreasePct: 3,
          includeInForecast: true,
          isFromXero: false,
        },
      ],
      plannedHires: [
        {
          id: 'hire-1',
          role: 'Junior Consultant',
          employmentType: 'full-time',
          salary: 80000,
          startMonth: '2025-10',
        },
      ],
      superannuationPct: 11,
      workCoverPct: 1.5,
      payrollTaxPct: 5,
    },
    opex: {
      lines: [
        {
          accountId: 'opex-1',
          accountName: 'Rent',
          priorYearTotal: 60000,
          costBehavior: 'fixed',
          monthlyAmount: 5000,
        },
        {
          accountId: 'opex-2',
          accountName: 'Conference Fees',
          priorYearTotal: 12000,
          costBehavior: 'adhoc',
          expectedAnnualAmount: 12000,
          expectedMonths: ['2025-10', '2026-03'],
        },
      ],
    },
    capex: {
      items: [{ id: 'capex-1', name: 'Laptop', amount: 5000, month: '2025-08', category: 'technology' }],
    },
    plannedSpends: [{ id: 'bar' } as any],
    subscriptions: { auditedAt: '2025-05-01T00:00:00.000Z', accountsIncluded: [], vendorCount: 0, totalAnnual: 0, essentialAnnual: 0, reviewAnnual: 0, reduceAnnual: 0, cancelAnnual: 0, potentialSavings: 0 },
    priorYearByMonth: { revenue: { '2024-07': 40000 } },
  }
}

// ─── Group A: shiftMonthKeys ──────────────────────────────────────────────────

describe('Group A: shiftMonthKeys', () => {
  it('shifts year +1 for valid YYYY-MM keys', () => {
    const result = shiftMonthKeys({ '2025-07': 100, '2026-06': 200 }, 1)
    expect(result).toEqual({ '2026-07': 100, '2027-06': 200 })
  })

  it('returns empty object for empty input', () => {
    expect(shiftMonthKeys({}, 1)).toEqual({})
  })

  it('returns empty object for undefined input', () => {
    expect(shiftMonthKeys(undefined, 1)).toEqual({})
  })

  it('silently drops malformed keys and shifts valid ones', () => {
    const result = shiftMonthKeys({ 'bogus': 5, '2025-07': 100, '99-99': 1 }, 1)
    expect(result).toEqual({ '2026-07': 100 })
  })

  it('shifts by yearDelta=2 correctly', () => {
    const result = shiftMonthKeys({ '2025-07': 50, '2026-01': 30 }, 2)
    expect(result).toEqual({ '2027-07': 50, '2028-01': 30 })
  })
})

// ─── Group B: assumptions stripping ─────────────────────────────────────────

describe('Group B: seedForecastFromPrior — stripping', () => {
  it('output has NO goals key', () => {
    const { assumptions } = seedForecastFromPrior(makeFixture(), 2027, 1)
    expect('goals' in assumptions).toBe(false)
  })

  it('output.capex deep-equals { items: [] }', () => {
    const { assumptions } = seedForecastFromPrior(makeFixture(), 2027, 1)
    expect(assumptions.capex).toEqual({ items: [] })
  })

  it('output.plannedSpends deep-equals []', () => {
    const { assumptions } = seedForecastFromPrior(makeFixture(), 2027, 1)
    expect(assumptions.plannedSpends).toEqual([])
  })

  it('output has NO subscriptions key', () => {
    const { assumptions } = seedForecastFromPrior(makeFixture(), 2027, 1)
    expect('subscriptions' in assumptions).toBe(false)
  })

  it('output has NO priorYearByMonth key', () => {
    const { assumptions } = seedForecastFromPrior(makeFixture(), 2027, 1)
    expect('priorYearByMonth' in assumptions).toBe(false)
  })

  it('output.team.plannedHires is [] (cleared, per critical decision 1)', () => {
    const { assumptions } = seedForecastFromPrior(makeFixture(), 2027, 1)
    expect(assumptions.team.plannedHires).toEqual([])
  })

  it('output.team.existingTeam is preserved (same length, name, salary)', () => {
    const { assumptions } = seedForecastFromPrior(makeFixture(), 2027, 1)
    expect(assumptions.team.existingTeam).toHaveLength(1)
    expect(assumptions.team.existingTeam[0].name).toBe('Alice')
    expect(assumptions.team.existingTeam[0].currentSalary).toBe(100000)
  })

  it('output.team superannuationPct, workCoverPct, payrollTaxPct are preserved', () => {
    const { assumptions } = seedForecastFromPrior(makeFixture(), 2027, 1)
    expect(assumptions.team.superannuationPct).toBe(11)
    expect(assumptions.team.workCoverPct).toBe(1.5)
    expect(assumptions.team.payrollTaxPct).toBe(5)
  })

  it('output.opex.lines length matches input', () => {
    const { assumptions } = seedForecastFromPrior(makeFixture(), 2027, 1)
    expect(assumptions.opex.lines).toHaveLength(2)
  })

  it('output.fiscalYearStart is preserved', () => {
    const { assumptions } = seedForecastFromPrior(makeFixture(), 2027, 1)
    expect(assumptions.fiscalYearStart).toBe('07')
  })

  it('output.industry and employeeCount are preserved', () => {
    const { assumptions } = seedForecastFromPrior(makeFixture(), 2027, 1)
    expect(assumptions.industry).toBe('consulting')
    expect(assumptions.employeeCount).toBe(5)
  })
})

// ─── Group C: month-key shifting ─────────────────────────────────────────────

describe('Group C: seedForecastFromPrior — month-key shifting', () => {
  it('shifts revenue year1Monthly keys +1 year', () => {
    const { assumptions } = seedForecastFromPrior(makeFixture(), 2027, 1)
    expect(assumptions.revenue.lines[0].year1Monthly).toEqual({
      '2026-07': 50000,
      '2027-06': 30000,
    })
  })

  it('shifts cogs year1Monthly keys +1 year', () => {
    const { assumptions } = seedForecastFromPrior(makeFixture(), 2027, 1)
    expect(assumptions.cogs.lines[0].year1Monthly).toEqual({ '2026-07': 10000 })
  })

  it('shifts revenue year2Monthly and year3Monthly when present', () => {
    const { assumptions } = seedForecastFromPrior(makeFixture(), 2027, 1)
    expect(assumptions.revenue.lines[0].year2Monthly).toEqual({ '2027-07': 55000 })
    expect(assumptions.revenue.lines[0].year3Monthly).toEqual({ '2028-07': 60000 })
  })

  it('shifts cogs year2Monthly and year3Monthly when present', () => {
    const { assumptions } = seedForecastFromPrior(makeFixture(), 2027, 1)
    expect(assumptions.cogs.lines[0].year2Monthly).toEqual({ '2027-07': 11000 })
    expect(assumptions.cogs.lines[0].year3Monthly).toEqual({ '2028-07': 12000 })
  })

  it('year2Quarterly and year3Quarterly are set to undefined in output', () => {
    const { assumptions } = seedForecastFromPrior(makeFixture(), 2027, 1)
    expect(assumptions.revenue.lines[0].year2Quarterly).toBeUndefined()
    expect(assumptions.revenue.lines[0].year3Quarterly).toBeUndefined()
  })

  it('preserves sparsity — sparse month input produces same count of shifted keys', () => {
    const fixture = makeFixture()
    // year1Monthly has 2 keys — should stay 2 keys after shift
    const { assumptions } = seedForecastFromPrior(fixture, 2027, 1)
    const keys = Object.keys(assumptions.revenue.lines[0].year1Monthly ?? {})
    expect(keys).toHaveLength(2)
  })
})

// ─── Group D: opex.expectedMonths shifting ───────────────────────────────────

describe('Group D: seedForecastFromPrior — opex.expectedMonths shifting', () => {
  it('shifts expectedMonths array +1 year for adhoc opex lines', () => {
    const { assumptions } = seedForecastFromPrior(makeFixture(), 2027, 1)
    const adhocLine = assumptions.opex.lines[1]
    expect(adhocLine.expectedMonths).toEqual(['2026-10', '2027-03'])
  })

  it('leaves lines without expectedMonths unchanged (no key added)', () => {
    const { assumptions } = seedForecastFromPrior(makeFixture(), 2027, 1)
    const normalLine = assumptions.opex.lines[0]
    // The normal line (Rent) has no expectedMonths — key should be absent
    expect(normalLine.expectedMonths).toBeUndefined()
  })
})

// ─── Group E: metadata ───────────────────────────────────────────────────────

describe('Group E: seedForecastFromPrior — metadata', () => {
  it('output.createdAt is a fresh ISO string (different from input)', () => {
    const fixture = makeFixture()
    const { assumptions } = seedForecastFromPrior(fixture, 2027, 1)
    expect(assumptions.createdAt).not.toBe('2025-05-01T00:00:00.000Z')
    expect(assumptions.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })

  it('output.updatedAt equals output.createdAt', () => {
    const { assumptions } = seedForecastFromPrior(makeFixture(), 2027, 1)
    expect(assumptions.updatedAt).toBe(assumptions.createdAt)
  })

  it('output.version is preserved from input', () => {
    const { assumptions } = seedForecastFromPrior(makeFixture(), 2027, 1)
    expect(assumptions.version).toBe(1)
  })
})

// ─── Group F: forecastDuration passthrough ───────────────────────────────────

describe('Group F: seedForecastFromPrior — forecastDuration passthrough', () => {
  it('SeedResult.forecastDuration === 2 when priorForecastDuration=2', () => {
    const result = seedForecastFromPrior(makeFixture(), 2027, 2)
    expect(result.forecastDuration).toBe(2)
  })

  it('SeedResult.forecastDuration === 1 when priorForecastDuration=1', () => {
    const result = seedForecastFromPrior(makeFixture(), 2027, 1)
    expect(result.forecastDuration).toBe(1)
  })
})

// ─── Group G: isForecastSeedable ─────────────────────────────────────────────

describe('Group G: isForecastSeedable', () => {
  it('returns true when assumptions is null and plLineCount=0', () => {
    expect(isForecastSeedable(null, 0)).toBe(true)
  })

  it('returns true for assumptions with empty revenue.lines and plLineCount=0', () => {
    const empty = {
      revenue: { lines: [] },
      cogs: { lines: [] },
    } as any
    expect(isForecastSeedable(empty, 0)).toBe(true)
  })

  it('returns false when revenue.lines is non-empty', () => {
    const withLines = {
      revenue: { lines: [{}] },
      cogs: { lines: [] },
    } as any
    expect(isForecastSeedable(withLines, 0)).toBe(false)
  })

  it('returns false when plLineCount > 0 even with empty revenue.lines', () => {
    const empty = {
      revenue: { lines: [] },
      cogs: { lines: [] },
    } as any
    expect(isForecastSeedable(empty, 5)).toBe(false)
  })

  it('returns true when assumptions is undefined and plLineCount=0', () => {
    expect(isForecastSeedable(undefined, 0)).toBe(true)
  })
})

// ─── Group H: purity ─────────────────────────────────────────────────────────

describe('Group H: purity', () => {
  it('does NOT mutate input.revenue.lines[0].year1Monthly', () => {
    const fixture = makeFixture()
    const before = JSON.stringify(fixture.revenue.lines[0].year1Monthly)
    seedForecastFromPrior(fixture, 2027, 1)
    const after = JSON.stringify(fixture.revenue.lines[0].year1Monthly)
    expect(after).toBe(before)
  })

  it('calling twice with same input produces structurally identical revenue/cogs/team/opex (only timestamps differ)', () => {
    const fixture = makeFixture()
    const r1 = seedForecastFromPrior(fixture, 2027, 1)
    const r2 = seedForecastFromPrior(fixture, 2027, 1)

    // Strip timestamps for comparison
    const { createdAt: _c1, updatedAt: _u1, ...rest1 } = r1.assumptions
    const { createdAt: _c2, updatedAt: _u2, ...rest2 } = r2.assumptions

    expect(JSON.stringify(rest1)).toBe(JSON.stringify(rest2))
  })
})
